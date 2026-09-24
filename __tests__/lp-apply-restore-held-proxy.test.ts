import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextRequest } from "next/server"

import { POST as applyPost } from "@/app/api/proxy/least-privilege/apply/route"
import { POST as restorePost } from "@/app/api/proxy/least-privilege/restore/route"
import { base64UrlEncode, operatorOidcConfig, resetOperatorOidcCaches, sealSession } from "@/lib/server/operator-session"
import { resetLpOperatorReplays } from "@/lib/server/lp-mutation-proxy"
import { heldMutationState, measuredIamPlan, submitHeldLpApply, submitHeldLpRestore } from "@/lib/lp-held-mutation"
import { postIamShadowRemediation } from "@/lib/use-iam-remediation"

const TOKEN = "fixture-service-token-0123456789abcdef"
const ISSUER = "https://idp.cyntro.test/oauth2"
const CLIENT_ID = "cyntro"
const KID = "fixture-rs256"

let privateKey: CryptoKey
let publicJwk: JsonWebKey

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

async function mintIdToken(claims: Record<string, unknown>): Promise<string> {
  const header = { alg: "RS256", typ: "JWT", kid: KID }
  const data = `${b64urlJson(header)}.${b64urlJson(claims)}`
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(data))
  return `${data}.${base64UrlEncode(new Uint8Array(signature))}`
}

function stubOidcAndBroker(broker?: (url: string, init?: RequestInit) => Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/.well-known/openid-configuration")) {
      return new Response(JSON.stringify({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
      }))
    }
    if (url.endsWith("/jwks")) {
      return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KID, use: "sig", alg: "RS256" }] }))
    }
    if (broker) return broker(url, init)
    return new Response("unexpected fetch", { status: 500 })
  })
}

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "x-cyntro-service-token": "browser-supplied-token", "content-type": "application/json" },
    body: JSON.stringify({
      customer_id: "other-shop",
      actions: [{ permission: "iam:CreateRole", configured: true, coverage: "OBSERVED", observed_use_count: 0, effect: "remove" }],
      plan_head: "abc",
      operation_id: "op-1",
    }),
  })
}

function withSession(cookie: string, body: unknown, extra: Record<string, string> = {}) {
  const req = new Request("http://localhost/api/proxy/least-privilege/apply", {
    method: "POST",
    headers: { "content-type": "application/json", ...extra },
    body: JSON.stringify(body),
  })
  Object.defineProperty(req, "cookies", {
    value: { get: (name: string) => (name === "cyntro_operator_session" ? { name, value: cookie } : undefined) },
  })
  return req
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
  delete process.env.CYNTRO_SERVICE_TOKEN
  delete process.env.BACKEND_URL_OVERRIDE
  delete process.env.CYNTRO_LP_BROKER_ENABLED
  delete process.env.CYNTRO_TENANT_ID
  delete process.env.AWS_ACCOUNT_ID
  delete process.env.CYNTRO_OPERATOR_ROLE_MAP
  delete process.env.CYNTRO_OPERATOR_OIDC_ISSUER
  delete process.env.CYNTRO_OPERATOR_OIDC_CLIENT_ID
  delete process.env.CYNTRO_OPERATOR_OIDC_REDIRECT_URI
  delete process.env.CYNTRO_OPERATOR_SESSION_SECRET
  resetOperatorOidcCaches()
  resetLpOperatorReplays()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("held Apply and Restore proxy", () => {
  it("refuses without the server token and does not fetch", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const apply = await applyPost(request("/api/proxy/least-privilege/apply"))
    const restore = await restorePost(request("/api/proxy/least-privilege/restore"))
    expect(apply.status).toBe(401)
    expect(restore.status).toBe(401)
    expect(await apply.json()).toMatchObject({ attempted_writes: 0, confirmed_writes: 0, unknown_writes: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not send Apply or Restore to the serving host for either tenant", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "https://cyntro-c1.onrender.com"
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const shop = await applyPost(request("/api/proxy/least-privilege/apply"))
    const other = await restorePost(request("/api/proxy/least-privilege/restore"))
    expect(shop.status).toBe(401)
    expect(other.status).toBe(401)
    expect(await shop.json()).toMatchObject({
      code: "OPERATOR_SESSION_REQUIRED",
      attempted_writes: 0,
      confirmed_writes: 0,
      unknown_writes: 0,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    const source = readFileSync(join(process.cwd(), "lib/server/lp-mutation-proxy.ts"), "utf8")
    expect(source).toContain("CYNTRO_LP_BROKER_ENABLED")
    expect(source).toContain("/api/lp-lifecycle/apply")
    expect(source).toContain("verifyIdToken")
  })

  it("uses only the configured lifecycle origin and ignores a browser URL", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.CYNTRO_LP_BROKER_ENABLED = "true"
    process.env.BACKEND_URL_OVERRIDE = "https://cyntro-c1.onrender.com"
    const fetchMock = stubOidcAndBroker(async () => new Response(JSON.stringify({ admitted: false, cloud_writes: 0 }), { status: 503 }))
    vi.stubGlobal("fetch", fetchMock)
    const asked = new NextRequest("http://localhost/api/proxy/least-privilege/apply", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lifecycle-url": "https://cyntro-c1.onrender.com" },
      body: JSON.stringify({
        customer_id: "other-shop",
        lifecycle_url: "https://cyntro-c1.onrender.com/api/least-privilege/apply",
        role_id: "AROAEXAMPLE",
        plan_head: "abc",
        actions: [{ permission: "iam:CreateRole", configured: true, coverage: "OBSERVED", observed_use_count: 0, effect: "remove" }],
      }),
    })
    const res = await applyPost(asked)
    expect(res.status).toBe(401)
    expect(fetchMock.mock.calls.every((call) => !String(call[0]).includes("/api/lp-lifecycle/"))).toBe(true)
  })

  it("refuses a sealed cookie whose ID-token signature does not verify", async () => {
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
    const config = operatorOidcConfig()
    expect(config).not.toBeNull()
    const now = Math.floor(Date.now() / 1000)
    const claims = {
      sub: "operator-1",
      iss: ISSUER,
      aud: CLIENT_ID,
      exp: now + 600,
      nbf: now - 10,
      nonce: "nonce-forged",
      groups: ["cyntro-operators"],
      name: "Op",
    }
    const good = await mintIdToken(claims)
    const [header, payload] = good.split(".")
    const forged = `${header}.${payload}.${"A".repeat(86)}`
    const sealed = await sealSession(claims, forged, config!)
    const fetchMock = stubOidcAndBroker(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const response = await applyPost(withSession(sealed.value, { plan_head: "plan-forged" }))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: "OPERATOR_SESSION_REQUIRED", attempted_writes: 0 })
    expect(fetchMock.mock.calls.every((call) => !String(call[0]).includes("/api/lp-lifecycle/"))).toBe(true)
  })

  it("forwards only for an authorized operator and binds server scope", async () => {
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
    const config = operatorOidcConfig()
    expect(config).not.toBeNull()
    const now = Math.floor(Date.now() / 1000)
    const operatorClaims = {
      sub: "operator-1",
      iss: ISSUER,
      aud: CLIENT_ID,
      exp: now + 600,
      nbf: now - 10,
      nonce: "nonce-operator",
      groups: ["cyntro-operators"],
      name: "Op",
    }
    const viewerClaims = {
      sub: "viewer-1",
      iss: ISSUER,
      aud: CLIENT_ID,
      exp: now + 600,
      nbf: now - 10,
      nonce: "nonce-viewer",
      groups: ["cyntro-viewers"],
    }
    const sealed = await sealSession(operatorClaims, await mintIdToken(operatorClaims), config!)
    const viewer = await sealSession(viewerClaims, await mintIdToken(viewerClaims), config!)
    const fetchMock = stubOidcAndBroker(async (url) => {
      if (url.includes("/api/lp-lifecycle/apply")) {
        return new Response(JSON.stringify({ code: "APPLY_OUTCOME_UNKNOWN", unknown_writes: 0 }), { status: 503 })
      }
      return new Response("unexpected", { status: 500 })
    })
    vi.stubGlobal("fetch", fetchMock)
    const forged = await applyPost(withSession(sealed.value, { plan_head: "plan-1", tenant_id: "other", role: "OPERATOR" }, { "x-cyntro-role": "OPERATOR" }))
    expect(forged.status).toBe(403)
    expect(fetchMock.mock.calls.every((call) => !String(call[0]).includes("/api/lp-lifecycle/"))).toBe(true)
    const viewerResponse = await applyPost(withSession(viewer.value, { plan_head: "plan-2" }))
    expect(viewerResponse.status).toBe(403)
    const allowed = await applyPost(withSession(sealed.value, { plan_head: "plan-3", role_id: "AROAEXAMPLE" }))
    const replay = await applyPost(withSession(sealed.value, { plan_head: "plan-3" }))
    expect(allowed.status).toBe(503)
    expect(replay.status).toBe(409)
    const brokerCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/api/lp-lifecycle/apply"))
    expect(brokerCalls).toHaveLength(1)
    expect(String(brokerCalls[0][0])).toBe("https://cyntro-c1.onrender.com/api/lp-lifecycle/apply")
    const sent = JSON.parse(String((brokerCalls[0][1] as RequestInit).body))
    expect(sent.tenant_id).toBe("fixture-webshop")
    expect(sent.account_id).toBe("111111111111")
    expect(sent.actor).toBe("operator-1")
    const outbound = (brokerCalls[0][1] as RequestInit).headers as Record<string, string>
    expect(outbound["X-Cyntro-Service-Token"]).toBe(TOKEN)
    expect(String(outbound.Authorization || "")).toMatch(/^Bearer\s+\S+/)
    expect(String(outbound.Authorization)).toContain(".")
    expect((await allowed.json()).unknown_writes).toBe(null)
  })

  it("refuses a wrong-tenant body and a second plan replay without calling the broker", async () => {
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
    const config = operatorOidcConfig()!
    const now = Math.floor(Date.now() / 1000)
    const claims = {
      sub: "operator-2",
      iss: ISSUER,
      aud: CLIENT_ID,
      exp: now + 600,
      nbf: now - 10,
      nonce: "nonce-tenant",
      groups: ["cyntro-operators"],
    }
    const idToken = await mintIdToken(claims)
    const sealed = await sealSession(claims, idToken, config)
    const fetchMock = stubOidcAndBroker(async () => new Response(JSON.stringify({ code: "OK", cloud_writes: 1 }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const wrongTenant = await applyPost(withSession(sealed.value, { plan_head: "plan-tenant", tenant_id: "other-shop" }))
    expect(wrongTenant.status).toBe(403)
    expect(await wrongTenant.json()).toMatchObject({ code: "FORGED_SCOPE_REFUSED", attempted_writes: 0 })
    const first = await applyPost(withSession(sealed.value, { plan_head: "plan-replay-a" }))
    const second = await applyPost(withSession(sealed.value, { plan_head: "plan-replay-a" }))
    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ code: "PLAN_REPLAY_REFUSED", attempted_writes: 0 })
    const brokerCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/api/lp-lifecycle/"))
    expect(brokerCalls).toHaveLength(1)
    const headers = (brokerCalls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${idToken}`)
  })

  it("keeps Apply and Restore disabled in the UI until recovery is proven", async () => {
    const state = heldMutationState()
    expect(state).toEqual({ applyEnabled: false, restoreEnabled: false, recoveryProven: false })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(await submitHeldLpApply({ role_name: "payments" })).toMatchObject({ code: "APPLY_HELD", cloud_writes: 0 })
    expect(await submitHeldLpRestore({ operationId: "op-1", roleArn: "arn:aws:iam::111111111111:role/r", roleId: "AROA" })).toMatchObject({ code: "RESTORE_HELD", cloud_writes: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
    const tab = readFileSync(join(process.cwd(), "components/LeastPrivilegeTab.tsx"), "utf8")
    expect(tab).toContain("const LP_MUTATION_APPLY_DISABLED = true")
    expect(tab).toContain("submitHeldLpApply")
    // Restore needs the Apply's operation id and role (lp-restore-binding.test.ts);
    // the Tab holds neither yet, so it must not call Restore at all.
    expect(tab).not.toContain("submitHeldLpRestore")
    expect(tab).toContain("/api/proxy/least-privilege/apply")
    expect(tab).toContain("/api/proxy/iam-roles/")
    expect(tab).toContain("/api/proxy/least-privilege/simulate-fix")
    expect(tab).not.toContain("/api/proxy/cyntro/remediate")
    expect(tab).toContain("resource_family: 'iam-role'")
    expect(tab).toContain("plan_head: selectedResource.serverPlan?.planHead")
    expect(tab).toContain("measuredIamPlan(data?.server_plan)")
    expect(tab).toContain("planIssueState: data.server_plan.issue_state")
    expect(tab).not.toContain("coverage: 'UNKNOWN'")
    expect(tab).toContain("/api/proxy/remediation/execute")
    const shadow = readFileSync(join(process.cwd(), "lib/use-iam-remediation.ts"), "utf8")
    expect(shadow).toContain("IAM_ROLE_WRITE_OUTSIDE_TRANSACTION")
    expect(shadow).not.toContain("/api/proxy/remediation/execute")
    expect(shadow).toContain("SECURITY_GROUP_FAMILY_SEPARATE")
  })

  it("does not write an IAM role through shadow execute, and keeps a security group separate", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const role = await postIamShadowRemediation({ role_name: "payments", resource_type: "iam-role" })
    const group = await postIamShadowRemediation({ role_name: "sg-1", resource_type: "security-group" })
    expect(role.error).toBe("IAM_ROLE_WRITE_OUTSIDE_TRANSACTION")
    expect(group.error).toBe("SECURITY_GROUP_FAMILY_SEPARATE")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(measuredIamPlan({ role_arn: "arn", role_id: "AROA", plan_head: "abc" })).toBeUndefined()
    expect(measuredIamPlan({
      role_arn: "arn:aws:iam::111111111111:role/payments",
      role_id: "AROAEXAMPLE",
      plan_head: "abc",
      actions: [{ permission: "iam:CreateRole", configured: true, coverage: "OBSERVED", observed_use_count: 0, effect: "remove" }],
    })?.roleId).toBe("AROAEXAMPLE")
    expect(measuredIamPlan({
      role_arn: "arn",
      role_id: "AROA",
      plan_head: "abc",
      actions: [{ permission: "iam:CreateRole", configured: true, coverage: "UNKNOWN", observed_use_count: null, effect: "remove" }],
    })).toBeUndefined()
    const store = readFileSync(join(process.cwd(), "hooks/useLeastPrivilegeStore.ts"), "utf8")
    expect(store).toContain("const LP_ENFORCE_ENABLED = false")
    const modal = readFileSync(join(process.cwd(), "components/iam-permission-analysis-modal.tsx"), "utf8")
    expect(modal.indexOf("const LP_LEGACY_REMEDIATE_ENABLED = false")).toBeLessThan(modal.indexOf("/api/proxy/cyntro/remediate"))
    const perResource = readFileSync(join(process.cwd(), "components/per-resource-analysis.tsx"), "utf8")
    expect(perResource.indexOf("const LP_LEGACY_REMEDIATE_ENABLED = false")).toBeLessThan(perResource.indexOf("/api/proxy/cyntro/remediate"))
  })
})
