/**
 * The legacy mutation families are held in source: the library refuses without a request, and every Next.js proxy
 * that forwards one of them refuses server-side (423, the family's code, every write count zero) before any backend
 * request. The read-only neighbours (quarantine pre-check, IAM remediate dry run) still forward.
 *
 * Proven against a network spy: `fetch` is stubbed and every call recorded. Request bodies are labelled test input;
 * nothing here is product data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import {
  LEGACY_FINDING_REMEDIATE_ENABLED,
  LEGACY_IAM_APPROVAL_EXECUTE_ENABLED,
  LEGACY_MUTATION_FAMILIES,
  LEGACY_QUARANTINE_ENABLED,
  LEGACY_S3_REMEDIATE_ENABLED,
  LEGACY_SG_REMEDIATE_ENABLED,
  fetchLegacyMutation,
  legacyControlHeld,
  legacyFamilyForProxyRequest,
  legacyMutationHold,
  type LegacyMutationFamily,
} from "@/lib/legacy-mutation-hold"
import * as lpHeld from "@/lib/lp-held-mutation"

import { POST as simulateExecute } from "@/app/api/proxy/simulate/execute/route"
import { POST as remediate } from "@/app/api/proxy/remediate/route"
import { POST as safeRemediateExecute } from "@/app/api/proxy/safe-remediate/execute/route"
import { POST as iamRolesRemediate } from "@/app/api/proxy/iam-roles/remediate/route"
import { POST as sgRemediate } from "@/app/api/proxy/security-groups/[sgId]/remediate/route"
import { POST as sgLpRemediate } from "@/app/api/proxy/sg-least-privilege/[sgId]/remediate/route"
import { POST as s3Remediate } from "@/app/api/proxy/s3-buckets/remediate/route"
import { POST as quarantineExecute } from "@/app/api/proxy/quarantine/execute/route"
import { POST as quarantineRestore } from "@/app/api/proxy/quarantine/restore/route"
import { POST as quarantineStartMonitor } from "@/app/api/proxy/quarantine/start-monitor/route"
import { DELETE as quarantineDelete } from "@/app/api/proxy/quarantine/delete/route"
import { POST as quarantinePreCheck } from "@/app/api/proxy/quarantine/pre-check/route"
import { POST as approvalExecute } from "@/app/api/proxy/iam-roles/approval-requests/[requestId]/execute/route"

const CODES: Record<LegacyMutationFamily, string> = {
  finding_remediate: "FINDING_REMEDIATE_HELD",
  sg_remediate: "SG_REMEDIATE_HELD",
  s3_remediate: "S3_REMEDIATE_HELD",
  quarantine: "QUARANTINE_HELD",
  iam_approval_execute: "IAM_APPROVAL_EXECUTE_HELD",
}

let calls: string[] = []

beforeEach(() => {
  calls = []
  process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input))
    return new Response(JSON.stringify({ spy: "forwarded" }), { status: 200, headers: { "Content-Type": "application/json" } })
  }))
})

afterEach(() => {
  delete process.env.BACKEND_URL_OVERRIDE
  vi.unstubAllGlobals()
})

function req(path: string, body: unknown, method = "POST") {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) })

describe("held in source", () => {
  it("every family's release constant is false", () => {
    expect(LEGACY_FINDING_REMEDIATE_ENABLED).toBe(false)
    expect(LEGACY_SG_REMEDIATE_ENABLED).toBe(false)
    expect(LEGACY_S3_REMEDIATE_ENABLED).toBe(false)
    expect(LEGACY_QUARANTINE_ENABLED).toBe(false)
    expect(LEGACY_IAM_APPROVAL_EXECUTE_ENABLED).toBe(false)
  })

  it.each(Object.keys(CODES) as LegacyMutationFamily[])("%s carries a visible reason and a typed code", (family) => {
    const hold = legacyMutationHold(family)
    expect(hold).toMatchObject({ family, code: CODES[family] })
    expect(hold!.message).toMatch(/^Held: backend safety\/recovery contract not yet proven/)
  })

  it("a host flag can add a hold but never remove one", () => {
    for (const family of LEGACY_MUTATION_FAMILIES) {
      expect(legacyControlHeld(family)).toBe(true)
      expect(legacyControlHeld(family, undefined)).toBe(true)
      expect(legacyControlHeld(family, false)).toBe(true)
      expect(legacyControlHeld(family, true)).toBe(true)
    }
  })

  it("is re-exported from the LP held-mutation module: one mechanism", () => {
    expect(lpHeld.legacyMutationHold).toBe(legacyMutationHold)
    expect(lpHeld.fetchLegacyMutation).toBe(fetchLegacyMutation)
    expect(lpHeld.LP_MUTATION_APPLY_ENABLED).toBe(false)
  })
})

describe("the library guard, on its own", () => {
  it.each(Object.keys(CODES) as LegacyMutationFamily[])("%s answers a local 423 and sends nothing", async (family) => {
    const res = await fetchLegacyMutation(family, "/api/proxy/anything", { method: "POST", body: "{}" })
    expect(res.status).toBe(423)
    expect(await res.json()).toMatchObject({ code: CODES[family], cloud_writes: 0, origin: "client" })
    expect(calls).toEqual([])
  })
})

describe("proxy paths map to their family", () => {
  it.each([
    ["/api/proxy/simulate/execute", undefined, "finding_remediate"],
    ["/api/proxy/remediate", undefined, "finding_remediate"],
    ["/api/proxy/safe-remediate/execute", undefined, "finding_remediate"],
    ["/api/proxy/iam-roles/remediate", { dry_run: false }, "finding_remediate"],
    ["/api/proxy/iam-roles/remediate", {}, "finding_remediate"],
    ["/api/proxy/iam-roles/remediate", { dry_run: "true" }, "finding_remediate"],
    ["/api/proxy/iam-roles/remediate", { dry_run: true }, null],
    ["/api/proxy/security-groups/sg-0fixture/remediate", undefined, "sg_remediate"],
    ["/api/proxy/sg-least-privilege/sg-0fixture/remediate", undefined, "sg_remediate"],
    ["/api/proxy/security-groups/sg-0fixture/simulate?x=1", undefined, null],
    ["/api/proxy/s3-buckets/remediate", undefined, "s3_remediate"],
    ["/api/proxy/quarantine/execute", undefined, "quarantine"],
    ["/api/proxy/quarantine/restore", undefined, "quarantine"],
    ["/api/proxy/quarantine/delete", undefined, "quarantine"],
    ["/api/proxy/quarantine/start-monitor", undefined, "quarantine"],
    ["/api/proxy/quarantine/pre-check", undefined, null],
    ["/api/proxy/iam-roles/approval-requests/req-1/execute", undefined, "iam_approval_execute"],
    ["/api/proxy/iam-roles/approval-requests/req-1/approve", undefined, null],
    ["/api/proxy/posture-visibility/proposals/execute", undefined, null],
  ])("%s %j -> %s", (path, body, family) => {
    expect(legacyFamilyForProxyRequest(path as string, body)).toBe(family)
  })
})

describe("server-side proxy refusal (no backend request)", () => {
  const cases: Array<[string, LegacyMutationFamily, () => Promise<Response>]> = [
    ["simulate/execute", "finding_remediate", () => simulateExecute(req("/api/proxy/simulate/execute", { finding_id: "fixture-finding" }))],
    ["remediate", "finding_remediate", () => remediate(req("/api/proxy/remediate", { roleName: "fixture-role", permission: "s3:GetObject" }))],
    ["safe-remediate/execute", "finding_remediate", () => safeRemediateExecute(req("/api/proxy/safe-remediate/execute", { finding_id: "fixture-finding" }))],
    ["iam-roles/remediate (live)", "finding_remediate", () => iamRolesRemediate(req("/api/proxy/iam-roles/remediate", { role_name: "fixture-role", dry_run: false }))],
    ["iam-roles/remediate (dry_run omitted)", "finding_remediate", () => iamRolesRemediate(req("/api/proxy/iam-roles/remediate", { role_name: "fixture-role" }))],
    ["security-groups/{sg}/remediate", "sg_remediate", () => sgRemediate(req("/api/proxy/security-groups/sg-0fixture/remediate", { rules_to_remove: [] }), params({ sgId: "sg-0fixture" }))],
    ["sg-least-privilege/{sg}/remediate", "sg_remediate", () => sgLpRemediate(req("/api/proxy/sg-least-privilege/sg-0fixture/remediate", { rules: [] }), params({ sgId: "sg-0fixture" }))],
    ["s3-buckets/remediate", "s3_remediate", () => s3Remediate(req("/api/proxy/s3-buckets/remediate", { bucket_name: "fixture-bucket" }))],
    ["quarantine/execute", "quarantine", () => quarantineExecute(req("/api/proxy/quarantine/execute", { recordId: "q-1" }))],
    ["quarantine/restore", "quarantine", () => quarantineRestore(req("/api/proxy/quarantine/restore", { recordId: "q-1" }))],
    ["quarantine/start-monitor", "quarantine", () => quarantineStartMonitor(req("/api/proxy/quarantine/start-monitor", { recordId: "q-1" }))],
    ["quarantine/delete", "quarantine", () => quarantineDelete(req("/api/proxy/quarantine/delete", { recordId: "q-1", force: true }, "DELETE"))],
    ["approval-requests/{id}/execute", "iam_approval_execute", () => approvalExecute(req("/api/proxy/iam-roles/approval-requests/req-1/execute", { executed_by: "fixture" }), params({ requestId: "req-1" }))],
  ]

  it.each(cases)("%s refuses 423 with the family code", async (_name, family, call) => {
    const res = await call()
    expect(res.status).toBe(423)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(await res.json()).toMatchObject({
      code: CODES[family], family, cloud_writes: 0, attempted_writes: 0, confirmed_writes: 0, unknown_writes: 0,
      origin: "proxy",
    })
    expect(calls).toEqual([])
  })
})

describe("read-only neighbours still forward", () => {
  it("quarantine pre-check reaches the backend", async () => {
    const res = await quarantinePreCheck(req("/api/proxy/quarantine/pre-check", { resourceName: "fixture", systemName: "fixture-sys" }))
    expect(res.status).toBe(200)
    expect(calls.map((url) => new URL(url).pathname)).toEqual(["/api/quarantine/pre-check"])
  })

  it("an explicit IAM remediate dry run reaches the backend with dry_run: true", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const res = await iamRolesRemediate(req("/api/proxy/iam-roles/remediate", { role_name: "fixture-role", dry_run: true }))
    expect(res.status).toBe(200)
    expect(calls.map((url) => new URL(url).pathname)).toEqual(["/api/iam-roles/remediate"])
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(init.body)).dry_run).toBe(true)
  })
})
