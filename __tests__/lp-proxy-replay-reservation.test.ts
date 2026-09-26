/**
 * The FE proxy's Apply replay reservation (lib/server/lp-mutation-proxy.ts): taken synchronously before the broker
 * call, settled on the broker's answer. The same contract as the backend broker's (api/lp_lifecycle_broker.py,
 * tests/test_lp_replay_reservation.py): one in-flight owner per canonical key; a proven pre-write refusal releases;
 * an unknown outcome holds until a resolution proves it not applied; a type-collided binding is another key.
 * Driven through the real route handlers with a sealed operator session; only the broker answer is scripted.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { POST as applyPost } from "@/app/api/proxy/least-privilege/apply/route"
import { POST as resolvePost } from "@/app/api/proxy/least-privilege/resolve/route"
import { resetLpOperatorReplays, stableApplyOperationId } from "@/lib/server/lp-mutation-proxy"
import { base64UrlEncode, operatorOidcConfig, resetOperatorOidcCaches, sealSession } from "@/lib/server/operator-session"

const ISSUER = "https://idp.cyntro.test/oauth2"
const CLIENT_ID = "cyntro"
const KID = "fixture-rs256"
const BINDING = { projection_generation: 7, projection_receipt_hash: "v1:aa", publication_attempt: "att-1" }
const PLAN = { plan_head: "plan-r", role_arn: "arn:aws:iam::111111111111:role/web", role_id: "AROAWEB", decision_binding: BINDING }
const ZERO = { cloud_writes: 0, attempted_writes: 0, confirmed_writes: 0, unknown_writes: 0 }

let privateKey: CryptoKey
let publicJwk: JsonWebKey
let cookie: string

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"],
  )
  privateKey = pair.privateKey
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
})

async function operatorSession() {
  Object.assign(process.env, {
    CYNTRO_SERVICE_TOKEN: "fixture-service-token-0123456789abcdef",
    BACKEND_URL_OVERRIDE: "https://cyntro-c1.onrender.com",
    CYNTRO_LP_BROKER_ENABLED: "true",
    CYNTRO_TENANT_ID: "fixture-webshop",
    AWS_ACCOUNT_ID: "111111111111",
    CYNTRO_OPERATOR_ROLE_MAP: JSON.stringify({ "cyntro-operators": "OPERATOR" }),
    CYNTRO_OPERATOR_OIDC_ISSUER: ISSUER,
    CYNTRO_OPERATOR_OIDC_CLIENT_ID: CLIENT_ID,
    CYNTRO_OPERATOR_OIDC_REDIRECT_URI: "https://console.cyntro.test/callback",
    CYNTRO_OPERATOR_SESSION_SECRET: "session-secret-0123456789abcdef-extra",
  })
  const now = Math.floor(Date.now() / 1000)
  const claims = { sub: "operator-r", iss: ISSUER, aud: CLIENT_ID, exp: now + 600, nbf: now - 10, nonce: "n", groups: ["cyntro-operators"] }
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: KID })).toString("base64url")
  const data = `${header}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(data))
  cookie = (await sealSession(claims, `${data}.${base64UrlEncode(new Uint8Array(signature))}`, operatorOidcConfig()!)).value
}

function post(path: string, body: unknown) {
  const req = new Request(`http://localhost${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  })
  Object.defineProperty(req, "cookies", {
    value: { get: (name: string) => (name === "cyntro_operator_session" ? { name, value: cookie } : undefined) },
  })
  return req
}

const apply = (body: unknown = PLAN) => applyPost(post("/api/proxy/least-privilege/apply", body) as never)
const resolve = (operationId: string) => resolvePost(post("/api/proxy/least-privilege/resolve",
  { operation_id: operationId, role_arn: PLAN.role_arn, role_id: PLAN.role_id }) as never)

/** OIDC + JWKS answered for the session check; the broker answered by `broker`. Returns the broker call log. */
function stub(broker: (path: string, body: Record<string, unknown>) => Promise<Response>) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/.well-known/openid-configuration")) {
      return new Response(JSON.stringify({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/a`, token_endpoint: `${ISSUER}/t`, jwks_uri: `${ISSUER}/jwks` }))
    }
    if (url.endsWith("/jwks")) return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KID, use: "sig", alg: "RS256" }] }))
    const path = new URL(url).pathname
    const body = JSON.parse(String(init?.body || "{}"))
    calls.push({ path, body })
    return broker(path, body)
  }))
  return calls
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

afterEach(() => {
  for (const key of Object.keys(process.env)) if (key.startsWith("CYNTRO_") || key === "BACKEND_URL_OVERRIDE" || key === "AWS_ACCOUNT_ID") delete process.env[key]
  resetOperatorOidcCaches()
  resetLpOperatorReplays()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the FE proxy's Apply reservation", () => {
  it("concurrent identical requests: one reaches the broker, the other is refused in flight", async () => {
    await operatorSession()
    let release: (r: Response) => void = () => {}
    const held = new Promise<Response>((resolve) => { release = resolve })
    const calls = stub(async (path) => (path.endsWith("/apply") ? held : json(404, {})))
    const first = apply()
    await new Promise((resolve) => setTimeout(resolve, 20))          // the first is in flight at the broker
    const second = await apply()
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ code: "PLAN_REPLAY_REFUSED", ...ZERO })
    release(json(200, { code: "VERIFIED", operation_id: "op-1", cloud_writes: 1 }))
    expect((await first).status).toBe(200)
    expect(calls.filter((c) => c.path.endsWith("/apply"))).toHaveLength(1)
  })

  it("a proven pre-write refusal releases the reservation: the same retry reaches the broker", async () => {
    await operatorSession()
    const answers = [json(409, { detail: { code: "SESSION_COVERAGE_NOT_DECISION_GRADE", ...ZERO } }),
      json(200, { code: "VERIFIED", operation_id: "op-1", cloud_writes: 1 })]
    const calls = stub(async () => answers.shift()!)
    expect((await apply()).status).toBe(409)
    expect((await apply()).status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  it.each([
    ["an outcome-unknown answer", json(503, { detail: { code: "APPLY_OUTCOME_UNKNOWN", operation_id: "op-1", cloud_writes: 0, attempted_writes: 1, confirmed_writes: 0, unknown_writes: 1 } })],
    ["an unknown code whose counts read zero", json(503, { detail: { code: "VERIFY_RECEIPT_MISSING", operation_id: "op-1", ...ZERO } })],
  ])("%s holds until a resolution proves it not applied", async (_label, unknown) => {
    await operatorSession()
    const answers: Record<string, Response[]> = {
      "/api/lp-lifecycle/apply": [unknown, json(200, { code: "VERIFIED", operation_id: "op-1", cloud_writes: 1 })],
      "/api/lp-lifecycle/resolve": [json(200, { code: "RESOLVED", operation_id: "op-1", state: "RESOLVED_NOT_APPLIED" })],
    }
    const calls = stub(async (path) => answers[path].shift()!)
    expect((await apply()).status).toBe(503)
    const held = await apply()
    expect(held.status).toBe(409)
    expect(await held.json()).toMatchObject({ code: "PLAN_REPLAY_REFUSED" })
    expect(calls.filter((c) => c.path.endsWith("/apply"))).toHaveLength(1)
    expect((await resolve("op-1")).status).toBe(200)
    expect((await apply()).status).toBe(200)                          // released by the proven resolution
    expect(calls.filter((c) => c.path.endsWith("/apply"))).toHaveLength(2)
  })

  it("a broker call that fails in transport holds the reservation (outcome unknown)", async () => {
    await operatorSession()
    const calls = stub(async () => { throw new TypeError("fetch failed") })
    const failed = await apply()
    expect(failed.status).toBe(503)
    expect(await failed.json()).toMatchObject({ code: "LIFECYCLE_UNREACHABLE", unknown_writes: null })
    expect((await apply()).status).toBe(409)
    expect(calls).toHaveLength(1)
  })

  it("a type-collided binding (\"7\" for 7) in flight does not block the genuine plan", async () => {
    await operatorSession()
    let release: (r: Response) => void = () => {}
    const held = new Promise<Response>((resolve) => { release = resolve })
    const calls = stub(async (_path, body) => {
      const generation = (body.decision_binding as Record<string, unknown>).projection_generation
      return typeof generation === "string" ? held : json(200, { code: "VERIFIED", operation_id: "op-1", cloud_writes: 1 })
    })
    const forged = apply({ ...PLAN, decision_binding: { ...BINDING, projection_generation: "7" } })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await apply()).status).toBe(200)                           // the genuine 7 is its own key
    release(json(409, { detail: { code: "DECISION_GENERATION_MOVED", ...ZERO } }))
    expect((await forged).status).toBe(409)
    expect(calls).toHaveLength(2)
  })

  it("simultaneous identical requests both pass admission and race to the check-and-set: exactly one broker call", async () => {
    await operatorSession()
    let release: (r: Response) => void = () => {}
    const held = new Promise<Response>((resolve) => { release = resolve })
    const calls = stub(async () => held)
    const [first, second] = [apply(), apply()]                          // started in the same tick
    const settled = await Promise.race([second.then((r) => ["second", r] as const), first.then((r) => ["first", r] as const)])
    expect(settled[1].status).toBe(409)
    expect(await settled[1].json()).toMatchObject({ code: "PLAN_REPLAY_REFUSED", ...ZERO })
    release(json(200, { code: "VERIFIED", operation_id: "op-1", cloud_writes: 1 }))
    const statuses = [(await first).status, (await second).status].sort()
    expect(statuses).toEqual([200, 409])
    expect(calls).toHaveLength(1)
  })

  it("the stable operation id matches the backend helper (golden vectors from api.lp_remediation_route)", async () => {
    expect(await stableApplyOperationId("fixture-webshop", "111111111111", "arn:aws:iam::111111111111:role/web", "plan-r"))
      .toBe("9e2648c4344329957513096a5a3634f2")
    expect(await stableApplyOperationId("tenant-a", "123456789012", "arn:aws:iam::123456789012:role/payments", "v1:abc"))
      .toBe("73d8b02b00ba11066b20207135cf78f1")
  })

  it("a lost broker answer is released by the resolution of its stamped stable operation id", async () => {
    await operatorSession()
    const stable = await stableApplyOperationId("fixture-webshop", "111111111111", PLAN.role_arn, PLAN.plan_head)
    let transportFails = true
    const calls = stub(async (path) => {
      if (path.endsWith("/resolve")) return json(200, { code: "RESOLVED", operation_id: stable, state: "RESOLVED_NOT_APPLIED" })
      if (transportFails) throw new TypeError("connection reset")
      return json(200, { code: "VERIFIED", operation_id: stable, cloud_writes: 1 })
    })
    expect((await apply()).status).toBe(503)                           // LIFECYCLE_UNREACHABLE: held
    expect((await apply()).status).toBe(409)
    transportFails = false
    expect((await resolve(stable)).status).toBe(200)
    expect((await apply()).status).toBe(200)                           // released by its own operation's resolution
    expect(calls.filter((c) => c.path.endsWith("/apply"))).toHaveLength(2)
  })

  it.each([
    [{ cloud_writes: 0, attempted_writes: 1, confirmed_writes: 0, unknown_writes: 0 }],
    [{ cloud_writes: 0, attempted_writes: 0, confirmed_writes: 1, unknown_writes: 0 }],
    [{ cloud_writes: 0, attempted_writes: 0, unknown_writes: 0 }],
  ])("a typed refusal is pre-write only when every count is present and zero (%o)", async (counts) => {
    await operatorSession()
    const calls = stub(async () => json(409, { detail: { code: "ROLE_OPERATION_OUTSTANDING", ...counts } }))
    expect((await apply()).status).toBe(409)
    const again = await apply()
    expect(await again.json()).toMatchObject({ code: "PLAN_REPLAY_REFUSED" })
    expect(calls).toHaveLength(1)
  })
})
