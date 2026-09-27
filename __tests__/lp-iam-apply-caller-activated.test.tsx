/**
 * The IAM-role Apply caller with the release flag mocked ON (it is false in source): the real request construction
 * from a click, and the modal's own execution hold outranking the flag. The Review is the backend capture (fixture
 * `_source`) with a MEASURED plan for the SAME role (labelled test input).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import full from "./fixtures/lp-review-preview-install-chain.json"

vi.mock("@/lib/lp-held-mutation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lp-held-mutation")>()
  // Flag ON for this file only; the held submitter's own internal guard reads the source constant (false), so the
  // activated path is exactly postLpApply -- the one real request.
  return { ...actual, LP_MUTATION_APPLY_ENABLED: true, submitHeldLpApply: actual.postLpApply }
})

import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"
import { lpApplyBody } from "@/lib/lp-held-mutation"

const captured = full.review_envelope.result as Record<string, any>
const measured = {
  ...captured,
  server_plan: {
    ...captured.server_plan,
    issue_state: "MEASURED",
    plan_head: "fixture-plan-head",
    actions: [{ permission: "s3:DeleteObject", configured: true, coverage: "OBSERVED", observed_use_count: 0, effect: "remove" }],
  },
}

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body } as Response
}

function stub(apply: () => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    if (url.includes("/gap-analysis")) return reply(200, { ...full.review_envelope, result: measured })
    if (url.includes("/simulate-fix")) return reply(200, full.preview)
    if (url === "/api/proxy/least-privilege/apply") return apply()
    return reply(404, { detail: { code: "FIXTURE_UNROUTED" } })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function modal(props: Record<string, unknown> = {}) {
  return (
    <IAMPermissionAnalysisModal isOpen onClose={() => {}} roleName="fixture-web-role"
      roleArn={measured.server_plan.role_arn} systemName="fixture-webshop" {...props} />
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the activated IAM-role Apply caller", () => {
  it("a click POSTs exactly the admitted body to the held proxy", async () => {
    const fetchMock = stub(() => reply(409, { detail: { code: "DECISION_GENERATION_MOVED", cloud_writes: 0 } }))
    render(modal())
    const button = (await screen.findByRole("button", { name: "Apply this plan" })) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]) === "/api/proxy/least-privilege/apply")).toBe(true))
    const [url, init] = fetchMock.mock.calls.find((call) => String(call[0]) === "/api/proxy/least-privilege/apply")!
    expect(url).toBe("/api/proxy/least-privilege/apply")
    expect((init as RequestInit).method).toBe("POST")
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(lpApplyBody(measured))
  })

  it.each([
    [{ applyDisabled: true }, "Production IAM changes are not enabled in this environment."],
    [{ authorityHoldReason: "Execution authority is not ready." }, "Execution authority is not ready."],
  ])("a held modal never offers Apply, whatever the flag (%o)", async (props, reason) => {
    const fetchMock = stub(() => reply(500, {}))
    render(modal(props))
    const button = (await screen.findByRole("button", { name: "Apply this plan" })) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByTestId("lp-iam-apply-panel").textContent).toContain(reason)
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes("least-privilege/apply"))).toEqual([])
  })
})
