// @vitest-environment node
/**
 * An operator's Restore reaches the broker with the role it restores.
 *
 * The proxy admitted Restore on `plan_head` and keyed its replay guard on
 * `subject:planHead`, so a real Restore (which names an operation, not a plan)
 * was refused: 422 PLAN_EMPTY, or 409 PLAN_REPLAY_REFUSED when it carried the
 * Apply's plan head. And `submitHeldLpRestore` sent only `operation_id`, while
 * the backend binds a Restore to the restored operation's role ARN and role id
 * (backend #2131, #2137). The recovery path is keyed by `operation_id`, carries
 * the role, and stays retryable; its idempotency is the backend ledger's.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { POST as applyPost } from "@/app/api/proxy/least-privilege/apply/route"
import { POST as restorePost } from "@/app/api/proxy/least-privilege/restore/route"
import { base64UrlEncode, operatorOidcConfig, resetOperatorOidcCaches, sealSession } from "@/lib/server/operator-session"
import { resetLpOperatorReplays } from "@/lib/server/lp-mutation-proxy"
import { restoreRequestBody, submitHeldLpRestore } from "@/lib/lp-held-mutation"

const TOKEN = "fixture-service-token-0123456789abcdef"
const ISSUER = "https://idp.cyntro.test/oauth2"
const CLIENT_ID = "cyntro"
const KID = "fixture-rs256"
const ROLE_ARN = "arn:aws:iam::111111111111:role/cyntro-tb-prod-web-role"
const BINDING = { operation_id: "op-apply-1", role_arn: ROLE_ARN, role_id: "AROAEXAMPLE", resource_family: "iam-role" }

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

function withSession(path: string, cookie: string, body: unknown) {
  const req = new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  Object.defineProperty(req, "cookies", {
    value: { get: (name: string) => (name === "cyntro_operator_session" ? { name, value: cookie } : undefined) },
  })
  return req
}

async function operatorSession() {
  process.env.CYNTRO_SERVICE_TOKEN = TOKEN
  process.env.CYNTRO_LP_BROKER_ENABLED = "true"
  process.env.BACKEND_URL_OVERRIDE = "https://cyntro-c1.onrender.com"
  process.env.CYNTRO_TENANT_ID = "fixture-webshop"
  process.env.AWS_ACCOUNT_ID = "111111111111"
  process.env.CYNTRO_OPERATOR_ROLE_MAP = JSON.stringify({ "cyntro-operators": "OPERATOR" })
  process.env.CYNTRO_OPERATOR_OIDC_ISSUER = ISSUER
  process.env.CYNTRO_OPERATOR_OIDC_CLIENT_ID = CLIENT_ID
  process.env.CYNTRO_OPERATOR_OIDC_REDIRECT_URI = "https://console.cyntro.test/callback"
  process.env.CYNTRO_OPERATOR_SESSION_SECRET = "session-secret-0123456789abcdef-extra"
  const now = Math.floor(Date.now() / 1000)
  const claims = { sub: "operator-7", iss: ISSUER, aud: CLIENT_ID, exp: now + 600, nbf: now - 10, nonce: "n-7", groups: ["cyntro-operators"] }
  const sealed = await sealSession(claims, await mintIdToken(claims), operatorOidcConfig()!)
  const broker: Array<{ url: string; body: Record<string, unknown> }> = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/.well-known/openid-configuration")) {
      return new Response(JSON.stringify({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/a`, token_endpoint: `${ISSUER}/t`, jwks_uri: `${ISSUER}/jwks` }))
    }
    if (url.endsWith("/jwks")) return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KID, use: "sig", alg: "RS256" }] }))
    if (url.includes("/api/lp-lifecycle/")) {
      broker.push({ url, body: JSON.parse(String(init?.body || "{}")) })
      return new Response(JSON.stringify({ code: "VERIFIED", cloud_writes: 1, admitted: true }), { status: 200 })
    }
    return new Response("unexpected", { status: 500 })
  })
  vi.stubGlobal("fetch", fetchMock)
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

describe("LP Restore through the proxy", () => {
  it("forwards an operator's Restore of the applied operation with its role", async () => {
    const { cookie, broker } = await operatorSession()
    const applied = await applyPost(withSession("/api/proxy/least-privilege/apply", cookie, { plan_head: "plan-7", role_arn: ROLE_ARN, role_id: "AROAEXAMPLE" }))
    expect(applied.status).toBe(200)

    const restored = await restorePost(withSession("/api/proxy/least-privilege/restore", cookie, BINDING) as never)

    expect(restored.status).toBe(200)
    const sent = broker[broker.length - 1]
    expect(sent.url).toBe("https://cyntro-c1.onrender.com/api/lp-lifecycle/restore")
    expect(sent.body).toMatchObject({ operation_id: "op-apply-1", role_arn: ROLE_ARN, role_id: "AROAEXAMPLE", tenant_id: "fixture-webshop", account_id: "111111111111", actor: "operator-7" })
  })

  it("does not treat a Restore carrying the applied plan head as a replay", async () => {
    const { cookie, broker } = await operatorSession()
    expect((await applyPost(withSession("/api/proxy/least-privilege/apply", cookie, { plan_head: "plan-7" }))).status).toBe(200)

    const restored = await restorePost(withSession("/api/proxy/least-privilege/restore", cookie, { ...BINDING, plan_head: "plan-7" }) as never)

    expect(restored.status).toBe(200)
    expect(broker).toHaveLength(2)
  })

  it("lets a Restore be retried; the backend ledger owns its idempotency", async () => {
    const { cookie, broker } = await operatorSession()

    const first = await restorePost(withSession("/api/proxy/least-privilege/restore", cookie, BINDING) as never)
    const second = await restorePost(withSession("/api/proxy/least-privilege/restore", cookie, BINDING) as never)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(broker).toHaveLength(2)
  })

  it("refuses a Restore that names no operation before calling the broker", async () => {
    const { cookie, broker } = await operatorSession()

    const missing = await restorePost(withSession("/api/proxy/least-privilege/restore", cookie, { role_arn: ROLE_ARN, role_id: "AROAEXAMPLE" }) as never)

    expect(missing.status).toBe(422)
    expect(await missing.json()).toMatchObject({ code: "RESTORE_TRANSACTION_MISSING", cloud_writes: 0 })
    expect(broker).toHaveLength(0)
  })

  it("keeps Apply replay protection", async () => {
    const { cookie, broker } = await operatorSession()

    const first = await applyPost(withSession("/api/proxy/least-privilege/apply", cookie, { plan_head: "plan-8" }))
    const again = await applyPost(withSession("/api/proxy/least-privilege/apply", cookie, { plan_head: "plan-8" }))

    expect(first.status).toBe(200)
    expect(again.status).toBe(409)
    expect(broker).toHaveLength(1)
  })
})

describe("the held Restore client", () => {
  it("builds a Restore body only with the whole role binding", () => {
    expect(restoreRequestBody({ operationId: "op-apply-1", roleArn: ROLE_ARN, roleId: "AROAEXAMPLE" })).toEqual(BINDING)
    expect(restoreRequestBody({ operationId: "", roleArn: ROLE_ARN, roleId: "AROAEXAMPLE" })).toBeNull()
    expect(restoreRequestBody({ operationId: "op-apply-1", roleArn: "", roleId: "AROAEXAMPLE" })).toBeNull()
    expect(restoreRequestBody({ operationId: "op-apply-1", roleArn: ROLE_ARN, roleId: "" })).toBeNull()
  })

  it("stays held, and the Apply handler no longer fires an empty Restore", async () => {
    expect(await submitHeldLpRestore({ operationId: "op-apply-1", roleArn: ROLE_ARN, roleId: "AROAEXAMPLE" })).toMatchObject({ code: "RESTORE_HELD", cloud_writes: 0 })
    const tab = readFileSync(join(process.cwd(), "components/LeastPrivilegeTab.tsx"), "utf8")
    expect(tab).not.toContain('submitHeldLpRestore("")')
  })
})
