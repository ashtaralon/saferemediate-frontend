// @vitest-environment node
/**
 * The operator-visible resolution path through the frontend proxy (backend #2141).
 *
 * Outstanding status is a read for a Restore-level operator; resolution is an
 * explicit action for an Apply-level operator only. Tenant, account and actor
 * always come from the server session; the browser supplies only the operation
 * id the backend reported and the selected role, and the backend re-checks the
 * operation is that role's holder.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { GET as outstandingGet } from "@/app/api/proxy/least-privilege/outstanding/route"
import { POST as resolvePost } from "@/app/api/proxy/least-privilege/resolve/route"
import { base64UrlEncode, operatorOidcConfig, resetOperatorOidcCaches, sealSession } from "@/lib/server/operator-session"
import { resetLpOperatorReplays } from "@/lib/server/lp-mutation-proxy"
import { fetchLpOutstanding } from "@/lib/lp-held-mutation"

const TOKEN = "fixture-service-token-0123456789abcdef"
const ISSUER = "https://idp.cyntro.test/oauth2"
const CLIENT_ID = "cyntro"
const KID = "fixture-rs256"
const ROLE_ARN = "arn:aws:iam::111111111111:role/cyntro-tb-prod-web-role"
const PLAN = { roleArn: ROLE_ARN, roleId: "AROAWEBROLE", planHead: "" }
const OUTSTANDING = {
  operation_id: "op-apply-1", state: "PARTIALLY_APPLIED", attempt: 1, resolvable: true,
  live: { verdict: "partial", per_policy: { CreatePolicy: "intended", ReadPolicy: "preimage" } },
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
  process.env.CYNTRO_OPERATOR_ROLE_MAP = JSON.stringify({ "cyntro-operators": "OPERATOR", "cyntro-viewers": "AUDITOR", "cyntro-approvers": "APPROVER" })
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


describe("the outstanding status proxy", () => {
  it("forwards a Restore-level operator's read-only request for exactly this role", async () => {
    const { cookie, broker } = await session(["cyntro-approvers"], { status: 200, body: OUTSTANDING })

    const response = await outstandingGet(lookupRequest(cookie, { role_arn: ROLE_ARN, role_id: "AROAWEBROLE" }))

    expect(response.status).toBe(200)
    const sent = new URL(broker[0].url)
    expect(`${sent.origin}${sent.pathname}`).toBe("https://cyntro-c1.onrender.com/api/lp-lifecycle/outstanding")
    expect(Object.fromEntries(sent.searchParams)).toEqual({ role_arn: ROLE_ARN, role_id: "AROAWEBROLE" })
    expect(broker[0].init?.method).toBe("GET")
  })

  it("refuses a signed-out caller, a viewer and a forged scope without calling the broker", async () => {
    const { cookie, broker } = await session(["cyntro-viewers"], { status: 200, body: OUTSTANDING })

    const signedOut = await outstandingGet(lookupRequest(null, { role_arn: ROLE_ARN, role_id: "AROAWEBROLE" }))
    const viewer = await outstandingGet(lookupRequest(cookie, { role_arn: ROLE_ARN, role_id: "AROAWEBROLE" }))

    expect(signedOut.status).toBe(401)
    expect(viewer.status).toBe(403)
    expect(broker).toHaveLength(0)
  })
})

describe("the resolution proxy", () => {
  function resolveRequest(cookie: string | null, body: unknown) {
    const req = new Request("http://localhost/api/proxy/least-privilege/resolve", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    })
    Object.defineProperty(req, "cookies", {
      value: { get: (name: string) => (cookie && name === "cyntro_operator_session" ? { name, value: cookie } : undefined) },
    })
    return req
  }
  const BINDING = { operation_id: "op-apply-1", role_arn: ROLE_ARN, role_id: "AROAWEBROLE" }

  it("forwards an operator's explicit resolution with the server's scope and actor", async () => {
    const { cookie, broker } = await session(["cyntro-operators"], { status: 200, body: { code: "RESOLVED", state: "RESOLVED_PARTIAL" } })

    const response = await resolvePost(resolveRequest(cookie, BINDING))

    expect(response.status).toBe(200)
    expect(broker).toHaveLength(1)
    expect(broker[0].url).toBe("https://cyntro-c1.onrender.com/api/lp-lifecycle/resolve")
    expect(JSON.parse(String(broker[0].init?.body))).toEqual({
      ...BINDING, resource_family: "iam-role", tenant_id: "fixture-webshop", account_id: "111111111111", actor: "operator-9",
    })
  })

  it("does not let an approver resolve, a browser forge scope, or a request omit the operation", async () => {
    const approver = await session(["cyntro-approvers"], { status: 200, body: {} })
    expect((await resolvePost(resolveRequest(approver.cookie, BINDING))).status).toBe(403)
    vi.unstubAllGlobals()
    const operator = await session(["cyntro-operators"], { status: 200, body: {} })
    expect((await resolvePost(resolveRequest(operator.cookie, { ...BINDING, tenant_id: "other-shop" }))).status).toBe(403)
    expect((await resolvePost(resolveRequest(operator.cookie, { ...BINDING, actor: "someone-else" }))).status).toBe(403)
    expect((await resolvePost(resolveRequest(operator.cookie, { role_arn: ROLE_ARN, role_id: "AROAWEBROLE" }))).status).toBe(422)
    expect((await resolvePost(resolveRequest(null, BINDING))).status).toBe(401)
    expect(approver.broker).toHaveLength(0)
    expect(operator.broker).toHaveLength(0)
  })

  it("carries the backend's held answers", async () => {
    const { cookie } = await session(["cyntro-operators"], { status: 409, body: { detail: { code: "RESOLUTION_FENCED" } } })
    const fenced = await resolvePost(resolveRequest(cookie, BINDING))
    expect(fenced.status).toBe(409)
    expect((await fenced.json()).detail.code).toBe("RESOLUTION_FENCED")
  })
})

describe("the outstanding status read", () => {
  function answer(status: number, body: unknown) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })))
  }

  it("accepts the backend's answer", async () => {
    answer(200, OUTSTANDING)
    expect(await fetchLpOutstanding(PLAN)).toEqual({
      operationId: "op-apply-1", state: "PARTIALLY_APPLIED", attempt: 1, resolvable: true,
      verdict: "partial", perPolicy: { CreatePolicy: "intended", ReadPolicy: "preimage" },
    })
  })

  it.each([
    ["nothing outstanding", 404, { detail: { code: "NO_OUTSTANDING_OPERATION" } }],
    ["a signed-out operator", 401, { code: "OPERATOR_SESSION_REQUIRED" }],
    ["an unknown verdict", 200, { ...OUTSTANDING, live: { verdict: "fine", per_policy: {} } }],
    ["an unknown policy state", 200, { ...OUTSTANDING, live: { verdict: "partial", per_policy: { A: "ok" } } }],
    ["no operation", 200, { ...OUTSTANDING, operation_id: "" }],
  ])("shows nothing for %s", async (_label, status, body) => {
    answer(status, body)
    expect(await fetchLpOutstanding(PLAN)).toBeNull()
  })
})
