import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextRequest } from "next/server"

import { POST as applyPost } from "@/app/api/proxy/least-privilege/apply/route"
import { POST as restorePost } from "@/app/api/proxy/least-privilege/restore/route"
import { operatorOidcConfig, sealSession } from "@/lib/server/operator-session"
import { resetLpOperatorReplays } from "@/lib/server/lp-mutation-proxy"
import { heldMutationState, measuredIamPlan, submitHeldLpApply, submitHeldLpRestore } from "@/lib/lp-held-mutation"
import { postIamShadowRemediation } from "@/lib/use-iam-remediation"

const TOKEN = "fixture-service-token-0123456789abcdef"

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

afterEach(() => {
  delete process.env.CYNTRO_SERVICE_TOKEN
  delete process.env.BACKEND_URL_OVERRIDE
  delete process.env.CYNTRO_LP_BROKER_ENABLED
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
  })

  it("uses only the configured lifecycle origin and ignores a browser URL", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.CYNTRO_LP_BROKER_ENABLED = "true"
    process.env.BACKEND_URL_OVERRIDE = "https://cyntro-c1.onrender.com"
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ admitted: false, cloud_writes: 0 }), { status: 503 }))
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
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("forwards only for an authorized operator and binds server scope", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.CYNTRO_LP_BROKER_ENABLED = "true"
    process.env.BACKEND_URL_OVERRIDE = "https://cyntro-c1.onrender.com"
    process.env.CYNTRO_TENANT_ID = "fixture-webshop"
    process.env.AWS_ACCOUNT_ID = "111111111111"
    process.env.CYNTRO_OPERATOR_ROLE_MAP = JSON.stringify({ "cyntro-operators": "OPERATOR", "cyntro-viewers": "AUDITOR" })
    process.env.CYNTRO_OPERATOR_OIDC_ISSUER = "https://idp.cyntro.test/oauth2"
    process.env.CYNTRO_OPERATOR_OIDC_CLIENT_ID = "cyntro"
    process.env.CYNTRO_OPERATOR_OIDC_REDIRECT_URI = "https://console.cyntro.test/callback"
    process.env.CYNTRO_OPERATOR_SESSION_SECRET = "session-secret-0123456789abcdef-extra"
    resetLpOperatorReplays()
    const config = operatorOidcConfig()
    expect(config).not.toBeNull()
    const payload = Buffer.from(JSON.stringify({ groups: ["cyntro-operators"] })).toString("base64url")
    const sealed = await sealSession(
      { sub: "operator-1", iss: config?.issuer, exp: Math.floor(Date.now() / 1000) + 600, name: "Op" },
      `e30.${payload}.sig`,
      config!,
    )
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: "APPLY_OUTCOME_UNKNOWN", unknown_writes: 0 }), { status: 503 }))
    vi.stubGlobal("fetch", fetchMock)
    const withSession = (cookie: string, body: unknown, extra: Record<string, string> = {}) => {
      const req = new Request("http://localhost/api/proxy/least-privilege/apply", {
        method: "POST",
        headers: { "content-type": "application/json", ...extra },
        body: JSON.stringify(body),
      })
      Object.defineProperty(req, "cookies", { value: { get: (name: string) => name === "cyntro_operator_session" ? { name, value: cookie } : undefined } })
      return req
    }
    const forged = await applyPost(withSession(sealed.value, { plan_head: "plan-1", tenant_id: "other", role: "OPERATOR" }, { "x-cyntro-role": "OPERATOR" }))
    expect(forged.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    const viewerPayload = Buffer.from(JSON.stringify({ groups: ["cyntro-viewers"] })).toString("base64url")
    const viewer = await sealSession(
      { sub: "viewer-1", iss: config?.issuer, exp: Math.floor(Date.now() / 1000) + 600 },
      `e30.${viewerPayload}.sig`,
      config!,
    )
    const viewerResponse = await applyPost(withSession(viewer.value, { plan_head: "plan-2" }))
    expect(viewerResponse.status).toBe(403)
    const allowed = await applyPost(withSession(sealed.value, { plan_head: "plan-3", role_id: "AROAEXAMPLE" }))
    const replay = await applyPost(withSession(sealed.value, { plan_head: "plan-3" }))
    expect(allowed.status).toBe(503)
    expect(replay.status).toBe(409)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toBe("https://cyntro-c1.onrender.com/api/lp-lifecycle/apply")
    const sent = JSON.parse(String(call[1].body))
    expect(sent.tenant_id).toBe("fixture-webshop")
    expect(sent.account_id).toBe("111111111111")
    expect(sent.actor).toBe("operator-1")
    expect((await allowed.json()).unknown_writes).toBe(null)
  })

  it("keeps Apply and Restore disabled in the UI until recovery is proven", async () => {
    const state = heldMutationState()
    expect(state).toEqual({ applyEnabled: false, restoreEnabled: false, recoveryProven: false })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(await submitHeldLpApply({ role_name: "payments" })).toMatchObject({ code: "APPLY_HELD", cloud_writes: 0 })
    expect(await submitHeldLpRestore("op-1")).toMatchObject({ code: "RESTORE_HELD", cloud_writes: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
    const tab = readFileSync(join(process.cwd(), "components/LeastPrivilegeTab.tsx"), "utf8")
    expect(tab).toContain("const LP_MUTATION_APPLY_DISABLED = true")
    expect(tab).toContain("submitHeldLpApply")
    expect(tab).toContain("submitHeldLpRestore")
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
