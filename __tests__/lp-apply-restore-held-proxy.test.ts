import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextRequest } from "next/server"

import { POST as applyPost } from "@/app/api/proxy/least-privilege/apply/route"
import { POST as restorePost } from "@/app/api/proxy/least-privilege/restore/route"
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
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("held Apply and Restore proxy", () => {
  it("refuses without the server token and does not fetch", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const apply = await applyPost(request("/api/proxy/least-privilege/apply"))
    const restore = await restorePost(request("/api/proxy/least-privilege/restore"))
    expect(apply.status).toBe(503)
    expect(restore.status).toBe(503)
    expect(await apply.json()).toMatchObject({ attempted_writes: 0, confirmed_writes: 0, unknown_writes: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("forwards only the server token and preserves 401, 403, and 503", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
    const statuses = [401, 403, 503]
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ detail: { code: "held", cloud_writes: null } }),
      { status: statuses.shift() },
    ))
    vi.stubGlobal("fetch", fetchMock)
    for (const post of [applyPost, restorePost, applyPost]) {
      const res = await post(request("/api/proxy/least-privilege/apply"))
      expect([401, 403, 503]).toContain(res.status)
      const body = await res.json()
      expect(body.detail.cloud_writes).toBeNull()
      expect(JSON.stringify(body)).not.toContain(TOKEN)
    }
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map((call) => call[0])).toEqual([
      "http://backend.test/api/least-privilege/apply",
      "http://backend.test/api/least-privilege/restore",
      "http://backend.test/api/least-privilege/apply",
    ])
    for (const [url, init] of calls) {
      const headers = init.headers as Record<string, string>
      expect(headers["X-Cyntro-Service-Token"]).toBe(TOKEN)
      expect(JSON.stringify(headers)).not.toContain("browser-supplied-token")
      expect(url).not.toContain("other-shop")
      expect(url).not.toContain("customer_id")
    }
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
