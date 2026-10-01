/**
 * Pending Tag approvals: decisions by identity, "not available here", and request status by polling.
 *
 * The rows below are TEST INPUTS shaped exactly like the backend contract
 * (saferemediate-backend services/auto_tagger.py: GET /api/auto-tagger/pending rows are
 * unified/graph/pending_tag_identity.pending_tag_view, GET .../pending/decisions/capability is
 * decision_capability, a 202 / GET .../pending/decisions/{pending_id} carries
 * unified/graph/pending_tag_decisions.request_view). The component renders only what fetch returns.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/business-system/boundary-evidence-drawer", () => ({ BoundaryEvidenceDrawer: () => null }))

import { PendingApprovals } from "@/components/pending-approvals"

const PENDING_ID = "pending_tag:3f1c0d6e9a8b7c6d5e4f3a2b1c0d9e8f"
const ROW = {
  pending_id: PENDING_ID,
  identity_status: "SCOPED",
  needs_reattribution: false,
  identity_version: 2,
  customer_id: "acme",
  account_id: "111111111111",
  region: "global",
  resource_uid: "aws://aws/111111111111/global/iam/role/app",
  system_key: "payments",
  resource_name: "app",
  resource_id: "app",
  resource_arn: "arn:aws:iam::111111111111:role/app",
  resource_type: "iam:role",
  system_name: "payments",
  reason: "conflict",
  relationship: "USES_ROLE_CANONICAL",
  tagged_from: "aws://aws/111111111111/eu-west-1/ec2/instance/i-0a1b2c3d4e5f60718",
  hop: 1,
  direction: "forward",
  competing_systems: ["crm", "payments"],
  status: "pending",
  created_at: "2026-10-01T09:00:00Z",
  decision_request: null as null | Record<string, unknown>,
}
const LEGACY = {
  ...ROW,
  pending_id: null,
  identity_status: "LEGACY_UNSCOPED",
  customer_id: null,
  account_id: null,
  region: null,
  resource_uid: null,
  system_key: null,
  resource_name: "old-role",
}

const AVAILABLE_REQUEST = {
  mode: "request", available: true, reason: null, code: null,
  message: "Decisions are recorded here and applied by the projector worker on its next pass.",
  executor: { seen: true, last_seen_at: "2026-10-01T09:00:00+00:00", state: "IDLE", reason: null },
}
const NOT_AVAILABLE = {
  mode: "unavailable", available: false, reason: "GRAPH_WRITE_NOT_AVAILABLE_ON_THIS_TIER",
  code: "PENDING_TAG_DECISIONS_NOT_AVAILABLE_HERE",
  message: "Approving or rejecting a pending tag writes the graph. This process holds a read-only graph identity, and no decision request path is installed here.",
  executor: null,
}
const DIRECT = { mode: "direct", available: true, reason: null, code: null, message: "Decisions are applied by this process when they are made.", executor: null }

function request(state: string, extra: Record<string, unknown> = {}) {
  return {
    request_id: "0f9e8d7c6b5a49382716051423324150", pending_id: PENDING_ID, decision: "approve", state,
    status: state === "applied" || state === "refused" ? "done" : state, outcome: null, outcome_code: null,
    outcome_detail: null, requested_at: "2026-10-01T09:01:00.000000+00:00", finished_at: null, ...extra,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

interface Handlers {
  capability: () => Response
  list: () => Response
  decide?: (action: string, body: Record<string, unknown>) => Response
  status?: () => Response
}

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(handlers: Handlers) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || "GET"
    if (url === "/api/proxy/auto-tagger/pending/decisions/capability") return handlers.capability()
    if (url === "/api/proxy/auto-tagger/pending?status=pending") return handlers.list()
    const decide = url.match(/^\/api\/proxy\/auto-tagger\/pending\/(approve|reject)$/)
    if (decide && method === "POST" && handlers.decide) return handlers.decide(decide[1], JSON.parse(String(init?.body)))
    if (url === `/api/proxy/auto-tagger/pending/decisions/${encodeURIComponent(PENDING_ID)}` && handlers.status) {
      return handlers.status()
    }
    return json({ detail: `unexpected ${method} ${url}` }, 404)
  })
  vi.stubGlobal("fetch", fetchMock)
}

const decisionCalls = () => fetchMock.mock.calls.filter(([input]) => /pending\/(approve|reject)$/.test(String(input)))

function reactOnClick(element: HTMLElement): (event: unknown) => unknown {
  const key = Object.keys(element).find((name) => name.startsWith("__reactProps"))
  return (element as unknown as Record<string, { onClick: (event: unknown) => unknown }>)[key!].onClick
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("pending approvals — not available here", () => {
  it("says so clearly, disables approve / reject, and sends nothing", async () => {
    installFetch({ capability: () => json(NOT_AVAILABLE), list: () => json({ count: 1, pending: [ROW] }) })
    render(<PendingApprovals />)

    const banner = await screen.findByTestId("pending-decisions-not-available")
    expect(banner).toHaveTextContent("Approving or rejecting pending tags is not available here.")
    expect(banner).toHaveTextContent(NOT_AVAILABLE.message)
    expect(banner).toHaveTextContent("GRAPH_WRITE_NOT_AVAILABLE_ON_THIS_TIER")
    const approve = screen.getByRole("button", { name: "Approve" })
    const reject = screen.getByRole("button", { name: "Reject" })
    expect(approve).toBeDisabled()
    expect(reject).toBeDisabled()
    expect(screen.queryByRole("button", { name: /Approve All/ })).not.toBeInTheDocument()
    // The handler itself refuses too (a disabled control's click never reaches it, so call it directly).
    await act(async () => {
      await reactOnClick(approve)({ preventDefault() {}, stopPropagation() {} })
    })
    expect(decisionCalls()).toHaveLength(0)
  })

  it("treats a capability it cannot read as not available, never as available", async () => {
    installFetch({ capability: () => json({ success: false, code: "PENDING_TAG_DECISION_PROXY_UNAVAILABLE", error: "connect ECONNREFUSED" }, 502),
                   list: () => json({ count: 1, pending: [ROW] }) })
    render(<PendingApprovals />)
    const banner = await screen.findByTestId("pending-decisions-not-available")
    expect(banner).toHaveTextContent("connect ECONNREFUSED")
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled()
  })
})

describe("pending approvals — decisions recorded as requests", () => {
  it("sends the pending tag's identity (never display names) and follows the request to applied", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const states = ["running", "applied"]
    let sent: Record<string, unknown> | null = null
    installFetch({
      capability: () => json(AVAILABLE_REQUEST),
      list: () => json({ count: 1, pending: [ROW], published: true, published_at: "2026-10-01T09:00:00+00:00" }),
      decide: (action, body) => {
        sent = { action, ...body }
        return json({ accepted: true, already_open: false, action, pending_id: PENDING_ID, request: request("queued") }, 202)
      },
      status: () => json({ request: request(states.shift() || "applied", { outcome: "APPLIED" }) }),
    })
    render(<PendingApprovals />)

    const approve = await screen.findByRole("button", { name: "Approve" })
    await waitFor(() => expect(approve).toBeEnabled())
    fireEvent.click(approve)

    const status = await screen.findByTestId("pending-decision-status")
    expect(status).toHaveTextContent("Approve queued — applied by the projector worker on its next pass")
    expect(sent).toEqual({
      action: "approve", pending_id: PENDING_ID, account_id: "111111111111", region: "global",
      resource_uid: ROW.resource_uid, system_key: "payments", customer_id: "acme",
    })
    expect(sent).not.toHaveProperty("resource_name")
    expect(sent).not.toHaveProperty("system_name")
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled()

    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    await waitFor(() => expect(screen.getByTestId("pending-decision-status")).toHaveTextContent("Approve being applied"))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    await waitFor(() => expect(screen.getByTestId("pending-decision-status")).toHaveTextContent("Approve applied"))
    const polls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/pending/decisions/pending_tag"))
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/pending/decisions/pending_tag"))).toHaveLength(polls.length)
  })

  it("shows a refusal by its code", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    installFetch({
      capability: () => json(AVAILABLE_REQUEST),
      list: () => json({ count: 1, pending: [{ ...ROW, decision_request: request("queued", { decision: "reject" }) }] }),
      status: () => json({ request: request("refused", { decision: "reject", outcome: "REFUSED",
        outcome_code: "PENDING_TAG_NOT_PENDING", outcome_detail: "the pending tag is approved, not pending" }) }),
    })
    render(<PendingApprovals />)
    // A request recorded before the page loaded is shown and polled.
    expect(await screen.findByTestId("pending-decision-status")).toHaveTextContent("Reject queued")
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    await waitFor(() => expect(screen.getByTestId("pending-decision-status")).toHaveTextContent(
      "Reject refused: PENDING_TAG_NOT_PENDING — the pending tag is approved, not pending"))
  })

  it("names a refused request (401 / 409) inline and records nothing locally", async () => {
    installFetch({
      capability: () => json(AVAILABLE_REQUEST),
      list: () => json({ count: 1, pending: [ROW] }),
      decide: () => json({ success: false, code: "PENDING_TAG_DECISION_OPERATOR_REQUIRED",
        error: "A decision needs the signed-in operator's identity; none was presented." }, 401),
    })
    render(<PendingApprovals />)
    const approve = await screen.findByRole("button", { name: "Approve" })
    await waitFor(() => expect(approve).toBeEnabled())
    fireEvent.click(approve)
    expect(await screen.findByTestId("pending-decision-error")).toHaveTextContent(
      "PENDING_TAG_DECISION_OPERATOR_REQUIRED: A decision needs the signed-in operator's identity")
    expect(screen.queryByTestId("pending-decision-status")).not.toBeInTheDocument()
  })

  it("never offers a decision on a record without an identity, and hides Approve All", async () => {
    installFetch({ capability: () => json(AVAILABLE_REQUEST), list: () => json({ count: 2, pending: [ROW, LEGACY] }) })
    render(<PendingApprovals />)
    await screen.findByText("old-role")
    const approves = screen.getAllByRole("button", { name: "Approve" })
    await waitFor(() => expect(approves[0]).toBeEnabled())
    expect(approves[1]).toBeDisabled()
    expect(approves[1]).toHaveAttribute("title", expect.stringContaining("before pending tags were scoped"))
    expect(screen.queryByRole("button", { name: /Approve All/ })).not.toBeInTheDocument()
  })

  it("says the open tags are not computed yet before the projector's first publication", async () => {
    installFetch({
      capability: () => json(AVAILABLE_REQUEST),
      list: () => json({ count: 0, pending: [], published: false, state: "NOT_PUBLISHED",
        message: "The projector worker has not published the open pending tags on this install yet; they are listed after its first pending-tag decision pass." }),
    })
    render(<PendingApprovals />)
    const empty = await screen.findByTestId("pending-approvals-not-published")
    expect(empty).toHaveTextContent("Pending tags not computed yet")
    expect(screen.queryByTestId("pending-approvals-empty")).not.toBeInTheDocument()
  })
})

describe("pending approvals — a deployment that applies decisions itself", () => {
  it("removes the row on success and keeps Approve All", async () => {
    installFetch({
      capability: () => json(DIRECT),
      list: () => json({ count: 1, pending: [{ ...ROW, reason: "high_hop" }] }),
      decide: () => json({ success: true, action: "approved", pending_id: PENDING_ID }),
    })
    render(<PendingApprovals />)
    expect(await screen.findByRole("button", { name: /Approve All/ })).toBeInTheDocument()
    const approve = screen.getByRole("button", { name: "Approve" })
    await waitFor(() => expect(approve).toBeEnabled())
    fireEvent.click(approve)
    await waitFor(() => expect(screen.getByTestId("pending-approvals-empty")).toBeInTheDocument())
  })
})
