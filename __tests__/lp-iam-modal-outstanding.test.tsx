/**
 * The operation holding an IAM role is shown and resolved in the IAM modal, where that role's Apply started.
 *
 * Flags mocked ON for this file (all false in source; the held case is lp-iam-apply-caller.test.tsx, which asserts
 * the modal makes no outstanding read). The Review is the backend capture (fixture `_source`); the outstanding and
 * resolve bodies follow api/lp_remediation_route.py lp_outstanding / resolve (labelled test input).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import full from "./fixtures/lp-review-preview-install-chain.json"

vi.mock("@/lib/lp-held-mutation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lp-held-mutation")>()
  // The held submitters' own guards read the source constants (false), so the activated paths are exactly the one
  // real request each.
  return {
    ...actual,
    LP_MUTATION_APPLY_ENABLED: true,
    LP_RESOLVE_ENABLED: true,
    submitHeldLpApply: actual.postLpApply,
    submitLpResolve: actual.postLpResolve,
  }
})

import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"

const captured = full.review_envelope.result as Record<string, any>
const ROLE_ARN = captured.server_plan.role_arn as string
const ROLE_ID = captured.server_plan.role_id as string
const measured = {
  ...captured,
  server_plan: {
    ...captured.server_plan,
    issue_state: "MEASURED",
    plan_head: "fixture-plan-head",
    actions: [{ permission: "s3:DeleteObject", configured: true, coverage: "OBSERVED", observed_use_count: 0, effect: "remove" }],
  },
}
const NO_WRITES = { cloud_writes: 0, attempted_writes: 0, confirmed_writes: 0, unknown_writes: 0 }
const HELD = {
  operation_id: "op-apply-1", state: "APPLY_OUTCOME_UNKNOWN", attempt: 1, resolvable: true,
  live: { verdict: "partial", per_policy: { CreatePolicy: "intended", ReadPolicy: "preimage" } },
}
const NOT_HELD = { detail: { code: "NO_OUTSTANDING_OPERATION", ...NO_WRITES } }

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body } as Response
}

type Routes = { review?: unknown; outstanding: () => Response; resolve?: () => Response; apply?: () => Response }

function stub(routes: Routes) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    if (url.includes("/gap-analysis")) return reply(200, { ...full.review_envelope, result: routes.review ?? captured })
    if (url.includes("/simulate-fix")) return reply(200, full.preview)
    if (url.startsWith("/api/proxy/least-privilege/outstanding?")) return routes.outstanding()
    if (url === "/api/proxy/least-privilege/resolve" && routes.resolve) return routes.resolve()
    if (url === "/api/proxy/least-privilege/apply" && routes.apply) return routes.apply()
    return reply(404, { detail: { code: "FIXTURE_UNROUTED" } })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const urls = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.map((call) => String(call[0]))
const count = (fetchMock: ReturnType<typeof stub>, part: string) => urls(fetchMock).filter((url) => url.includes(part)).length

function modal() {
  return (
    <IAMPermissionAnalysisModal isOpen onClose={() => {}} roleName="fixture-web-role" roleArn={ROLE_ARN}
      systemName="fixture-webshop" />
  )
}

afterEach(() => {
  cleanup()   // unmount before unstubbing: no effect may outlive the stub and reach the real network
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the IAM modal's held-operation panel", () => {
  it("reads the holder for the Review's own role, even when no Apply can be formed", async () => {
    const fetchMock = stub({ outstanding: () => reply(200, HELD) })
    render(modal())
    const panel = await screen.findByTestId("lp-outstanding-panel")
    expect(screen.getByTestId("lp-iam-apply-panel").contains(panel)).toBe(true)
    expect(screen.getByTestId("lp-iam-apply-panel").textContent).toContain("No measured removal plan (UNKNOWN)")
    expect(panel.textContent).toContain("This role is held: operation op-apply-1")
    expect(panel.textContent).toContain("CreatePolicy: intended")
    const read = urls(fetchMock).find((url) => url.startsWith("/api/proxy/least-privilege/outstanding?"))!
    expect(Object.fromEntries(new URL(read, "http://x").searchParams)).toEqual({ role_arn: ROLE_ARN, role_id: ROLE_ID })
    expect(count(fetchMock, "least-privilege/resolve")).toBe(0)             // shown, never resolved by itself
  })

  it("shows nothing when the backend reports nothing holding the role", async () => {
    const fetchMock = stub({ outstanding: () => reply(404, NOT_HELD) })
    render(modal())
    await screen.findByTestId("lp-iam-apply-panel")
    await waitFor(() => expect(count(fetchMock, "least-privilege/outstanding")).toBe(1))
    expect(screen.queryByTestId("lp-outstanding-panel")).toBeNull()
  })

  it("a Resolve click POSTs exactly this operation on this role, then re-reads the Review", async () => {
    let held = true
    const fetchMock = stub({
      outstanding: () => (held ? reply(200, HELD) : reply(404, NOT_HELD)),
      resolve: () => {
        held = false
        return reply(200, { code: "RESOLVED", operation_id: "op-apply-1", state: "RESOLVED_NOT_APPLIED", per_policy: {}, ...NO_WRITES })
      },
    })
    render(modal())
    await screen.findByTestId("lp-outstanding-panel")
    const reviews = count(fetchMock, "/gap-analysis")
    fireEvent.click(screen.getByRole("button", { name: "Resolve from live state" }))
    await waitFor(() => expect(count(fetchMock, "least-privilege/resolve")).toBe(1))
    const [, init] = fetchMock.mock.calls.find((call) => String(call[0]) === "/api/proxy/least-privilege/resolve")!
    expect((init as RequestInit).method).toBe("POST")
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      operation_id: "op-apply-1", role_arn: ROLE_ARN, role_id: ROLE_ID, resource_family: "iam-role",
    })
    await waitFor(() => expect(count(fetchMock, "/gap-analysis")).toBeGreaterThan(reviews))   // the role may be free now
  })

  it("a refused Resolve keeps the role held and says why, without re-reading the Review", async () => {
    const fetchMock = stub({
      outstanding: () => reply(200, HELD),
      resolve: () => reply(409, { detail: { code: "RESOLUTION_DIVERGED", operation_id: "op-apply-1", per_policy: {}, ...NO_WRITES } }),
    })
    render(modal())
    await screen.findByTestId("lp-outstanding-panel")
    const reviews = count(fetchMock, "/gap-analysis")
    fireEvent.click(screen.getByRole("button", { name: "Resolve from live state" }))
    expect(await screen.findByText(/Resolution did not complete \(RESOLUTION_DIVERGED\)\. The role stays held\./)).toBeTruthy()
    expect(count(fetchMock, "/gap-analysis")).toBe(reviews)
    expect(screen.getByTestId("lp-outstanding-panel").textContent).toContain("op-apply-1")
  })

  it("an Apply whose outcome is unknown re-reads the holder and shows the operation now holding the role", async () => {
    let applied = false
    const fetchMock = stub({
      review: measured,
      outstanding: () => (applied ? reply(200, HELD) : reply(404, NOT_HELD)),
      apply: () => {
        applied = true
        return reply(500, { detail: { code: "APPLY_OUTCOME_UNKNOWN", operation_id: "op-apply-1",
          cloud_writes: 1, attempted_writes: 1, confirmed_writes: 0, unknown_writes: 1 } })
      },
    })
    render(modal())
    const button = await screen.findByRole("button", { name: "Apply this plan" })
    await waitFor(() => expect(count(fetchMock, "least-privilege/outstanding")).toBe(1))
    expect(screen.queryByTestId("lp-outstanding-panel")).toBeNull()
    fireEvent.click(button)
    const panel = await screen.findByTestId("lp-outstanding-panel")
    expect(panel.textContent).toContain("This role is held: operation op-apply-1")
    expect(count(fetchMock, "least-privilege/outstanding")).toBe(2)
    expect(count(fetchMock, "least-privilege/apply")).toBe(1)                  // no second write
  })

  it("an Apply refused before any write does not re-read the holder", async () => {
    const fetchMock = stub({
      review: measured,
      outstanding: () => reply(404, NOT_HELD),
      apply: () => reply(403, { detail: { code: "OPERATOR_APPLY_FORBIDDEN", ...NO_WRITES } }),
    })
    render(modal())
    const button = await screen.findByRole("button", { name: "Apply this plan" })
    await waitFor(() => expect(count(fetchMock, "least-privilege/outstanding")).toBe(1))
    fireEvent.click(button)
    await waitFor(() => expect(count(fetchMock, "least-privilege/apply")).toBe(1))
    await screen.findByText(/Nothing was written\./)
    expect(count(fetchMock, "least-privilege/outstanding")).toBe(1)
  })
})
