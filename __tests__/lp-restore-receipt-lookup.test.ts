// @vitest-environment node
/**
 * After a reload, the Restore hint comes from the backend ledger (backend #2139),
 * never from the browser. The proxy forwards a read-only lookup for a signed-in
 * operator with Restore authority; the client accepts a receipt only for exactly
 * the selected role ARN and role incarnation.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { GET as receiptGet } from "@/app/api/proxy/least-privilege/receipt/route"
import { base64UrlEncode, operatorOidcConfig, resetOperatorOidcCaches, sealSession } from "@/lib/server/operator-session"
import { resetLpOperatorReplays } from "@/lib/server/lp-mutation-proxy"
import { lookupLpReceipt } from "@/lib/lp-held-mutation"

const TOKEN = "fixture-service-token-0123456789abcdef"
const ISSUER = "https://idp.cyntro.test/oauth2"
const CLIENT_ID = "cyntro"
const KID = "fixture-rs256"
const ROLE_ARN = "arn:aws:iam::111111111111:role/cyntro-tb-prod-web-role"
const PLAN = { roleArn: ROLE_ARN, roleId: "AROAWEBROLE", planHead: "" }
const RECEIPT = {
  kind: "apply", operation_id: "op-apply-1", tenant_id: "fixture-webshop", account_id: "111111111111",
  role_arn: ROLE_ARN, role_id: "AROAWEBROLE", plan_head: "head-1", restores_operation_id: null, reload_lookup: "indexed",
}

let privateKey: CryptoKey
let publicJwk: JsonWebKey

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

async function mintIdToken(claims: Record<string, unknown>): Promise<string> {
  const data = `${b64urlJson({ alg: "RS256", typ: "JWT", kid: KID })}.${b64urlJson(claims)}`
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(data))
  return `${data}.${base64UrlEncode(new Uint8Array(signature))}`
}

function lookupRequest(cookie: string | null, query: Record<string, string>) {
  const req = new Request(`http://localhost/api/proxy/least-privilege/receipt?${new URLSearchParams(query)}`, { method: "GET" })
  Object.defineProperty(req, "cookies", {
    value: { get: (name: string) => (cookie && name === "cyntro_operator_session" ? { name, value: cookie } : undefined) },
  })
  return req
}

async function session(groups: string[], brokerAnswer: { status: number; body: unknown }) {
  process.env.CYNTRO_SERVICE_TOKEN = TOKEN
  process.env.CYNTRO_LP_BROKER_ENABLED = "true"
  process.env.BACKEND_URL_OVERRIDE = "https://cyntro-c1.onrender.com"
  process.env.CYNTRO_TENANT_ID = "fixture-webshop"
  process.env.AWS_ACCOUNT_ID = "111111111111"
  process.env.CYNTRO_OPERATOR_ROLE_MAP = JSON.stringify({ "cyntro-operators": "OPERATOR", "cyntro-viewers": "AUDITOR" })
  process.env.CYNTRO_OPERATOR_OIDC_ISSUER = ISSUER
  process.env.CYNTRO_OPERATOR_OIDC_CLIENT_ID = CLIENT_ID
  process.env.CYNTRO_OPERATOR_OIDC_REDIRECT_URI = "https://console.cyntro.test/callback"
  process.env.CYNTRO_OPERATOR_SESSION_SECRET = "session-secret-0123456789abcdef-extra"
  const now = Math.floor(Date.now() / 1000)
  const claims = { sub: "operator-9", iss: ISSUER, aud: CLIENT_ID, exp: now + 600, nbf: now - 10, nonce: "n-9", groups }
  const sealed = await sealSession(claims, await mintIdToken(claims), operatorOidcConfig()!)
  const broker: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/.well-known/openid-configuration")) {
      return new Response(JSON.stringify({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/a`, token_endpoint: `${ISSUER}/t`, jwks_uri: `${ISSUER}/jwks` }))
    }
    if (url.endsWith("/jwks")) return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KID, use: "sig", alg: "RS256" }] }))
    if (url.includes("/api/lp-lifecycle/")) {
      broker.push({ url, init })
      return new Response(JSON.stringify(brokerAnswer.body), { status: brokerAnswer.status })
    }
    return new Response("unexpected", { status: 500 })
  }))
  return { cookie: sealed.value, broker }
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )
  privateKey = pair.privateKey
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
})

afterEach(() => {
  for (const key of [
    "CYNTRO_SERVICE_TOKEN", "BACKEND_URL_OVERRIDE", "CYNTRO_LP_BROKER_ENABLED", "CYNTRO_TENANT_ID", "AWS_ACCOUNT_ID",
    "CYNTRO_OPERATOR_ROLE_MAP", "CYNTRO_OPERATOR_OIDC_ISSUER", "CYNTRO_OPERATOR_OIDC_CLIENT_ID",
    "CYNTRO_OPERATOR_OIDC_REDIRECT_URI", "CYNTRO_OPERATOR_SESSION_SECRET",
  ]) delete process.env[key]
  resetOperatorOidcCaches()
  resetLpOperatorReplays()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the receipt lookup proxy", () => {
  it("forwards an operator's read-only lookup for exactly this role", async () => {
    const { cookie, broker } = await session(["cyntro-operators"], { status: 200, body: { receipt: RECEIPT } })

    const response = await receiptGet(lookupRequest(cookie, { role_arn: ROLE_ARN, role_id: "AROAWEBROLE" }))

    expect(response.status).toBe(200)
    expect((await response.json()).receipt.operation_id).toBe("op-apply-1")
    expect(broker).toHaveLength(1)
    const sent = new URL(broker[0].url)
    expect(`${sent.origin}${sent.pathname}`).toBe("https://cyntro-c1.onrender.com/api/lp-lifecycle/receipt")
    expect(Object.fromEntries(sent.searchParams)).toEqual({ role_arn: ROLE_ARN, role_id: "AROAWEBROLE" })
    expect(broker[0].init?.method).toBe("GET")
    expect(broker[0].init?.body).toBeUndefined()
    const headers = broker[0].init?.headers as Record<string, string>
    expect(headers["X-Cyntro-Service-Token"]).toBe(TOKEN)
    expect(String(headers.Authorization || "")).toMatch(/^Bearer\s+\S+/)
  })

  it("refuses a signed-out caller (logout) and a viewer without calling the broker", async () => {
    const { cookie, broker } = await session(["cyntro-viewers"], { status: 200, body: { receipt: RECEIPT } })

    const signedOut = await receiptGet(lookupRequest(null, { role_arn: ROLE_ARN, role_id: "AROAWEBROLE" }))
    const viewer = await receiptGet(lookupRequest(cookie, { role_arn: ROLE_ARN, role_id: "AROAWEBROLE" }))

    expect(signedOut.status).toBe(401)
    expect(viewer.status).toBe(403)
    expect(broker).toHaveLength(0)
  })

  it("refuses a forged tenant or account in the query", async () => {
    const { cookie, broker } = await session(["cyntro-operators"], { status: 200, body: { receipt: RECEIPT } })

    const tenant = await receiptGet(lookupRequest(cookie, { role_arn: ROLE_ARN, role_id: "AROAWEBROLE", tenant_id: "other-shop" }))
    const account = await receiptGet(lookupRequest(cookie, { role_arn: ROLE_ARN, role_id: "AROAWEBROLE", account_id: "222222222222" }))

    expect(tenant.status).toBe(403)
    expect(account.status).toBe(403)
    expect(broker).toHaveLength(0)
  })

  it("carries the ledger's no-receipt and already-restored answers", async () => {
    const missing = await session(["cyntro-operators"], { status: 404, body: { detail: { code: "RECEIPT_NOT_FOUND" } } })
    const notFound = await receiptGet(lookupRequest(missing.cookie, { role_arn: ROLE_ARN, role_id: "AROAWEBROLE" }))
    expect(notFound.status).toBe(404)

    vi.unstubAllGlobals()
    const restored = await session(["cyntro-operators"], { status: 409, body: { detail: { code: "RECEIPT_ALREADY_RESTORED" } } })
    const already = await receiptGet(lookupRequest(restored.cookie, { role_arn: ROLE_ARN, role_id: "AROAWEBROLE" }))
    expect(already.status).toBe(409)
  })
})

describe("the reloaded page's lookup", () => {
  function answer(status: number, body: unknown) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })))
  }

  it("accepts the ledger's receipt for exactly this role", async () => {
    answer(200, { receipt: RECEIPT })
    expect(await lookupLpReceipt(PLAN)).toEqual({
      operationId: "op-apply-1", roleArn: ROLE_ARN, roleId: "AROAWEBROLE", planHead: "head-1",
      tenantId: "fixture-webshop", accountId: "111111111111",
    })
  })

  it.each([
    ["no receipt", 404, { detail: { code: "RECEIPT_NOT_FOUND" } }],
    ["already restored", 409, { detail: { code: "RECEIPT_ALREADY_RESTORED" } }],
    ["an operation still outstanding", 409, { detail: { code: "ROLE_OPERATION_OUTSTANDING" } }],
    ["a signed-out operator", 401, { code: "OPERATOR_SESSION_REQUIRED" }],
    ["an unavailable lookup", 503, { detail: { code: "RECEIPT_LOOKUP_UNAVAILABLE" } }],
    ["another role's receipt", 200, { receipt: { ...RECEIPT, role_arn: "arn:aws:iam::111111111111:role/other" } }],
    ["a recreated role's receipt", 200, { receipt: { ...RECEIPT, role_id: "AROARECREATED" } }],
    ["a Restore receipt", 200, { receipt: { ...RECEIPT, kind: "restore", restores_operation_id: "op-0" } }],
    ["an unscoped receipt", 200, { receipt: { ...RECEIPT, account_id: "" } }],
  ])("offers nothing for %s", async (_label, status, body) => {
    answer(status, body)
    expect(await lookupLpReceipt(PLAN)).toBeNull()
  })

  it("offers nothing when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed")
    }))
    expect(await lookupLpReceipt(PLAN)).toBeNull()
  })
})
