/// <reference types="vitest/globals" />
/**
 * The system History tab, MOUNTED, reading durable operation records.
 *
 * 3426 QA: after an apply and its restore, the timeline API returned both
 * operations, and the tab rendered "No data available for this period". The
 * records lacked `metadata`, the chart loop dereferenced
 * `event.metadata.permissions_removed`, the throw landed in a catch whose
 * error was never rendered, and the page read as an honest empty.
 *
 * Event shapes below mirror the backend's `_operation_as_event` output as
 * captured from the executor fixture at 74375bd9
 * (evidence/p6d/route_full_scenario_74375bd9.json). Timestamps are relative to
 * now so the 30-day period filter cannot expire this test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup as cleanupRender, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"

import { NextRequest } from "next/server"

import { RemediationTimeline } from "@/components/remediation-timeline"
import { SNAPSHOT_SYSTEM_FAMILIES } from "@/lib/snapshot-system-view"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.example" }))

// The page's selection (the scope bar), as the mounted History reads it, and the Decision families a system's
// snapshot view needs. The families answer with the fixture role's exact ARN; the helper's own behaviour with the
// captured S-3 family bodies (another account and system) is covered by snapshots-recovery-tab-system-filter.test.tsx.
const scope = vi.hoisted(() => ({
  current: { customerId: "fixture-webshop", groupId: "all", accountId: "111111111111", region: "all", options: null } as Record<string, unknown>,
}))
vi.mock("@/lib/account-scope-context", () => ({ useAccountScope: () => scope.current }))
const families = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/lib/inventory-decision-families", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/inventory-decision-families")>()),
  fetchDecisionFamilyAnswers: vi.fn(async () => families.current),
}))

const FORWARD_ID = "598d6ec7-13f6-4920-bf1a-fd41cba80162"
const RESTORE_ID = "1beff96a-e130-44b0-9035-f08c713764d8"
const SNAPSHOT = "IAMRole-fixture-web-role-aaf421fb"
const ARN = "arn:aws:iam::111111111111:role/fixture-web-role"

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function forward(overrides: Record<string, unknown> = {}) {
  return {
    id: `operation:${FORWARD_ID}`, event_id: `operation:${FORWARD_ID}`, operation_id: FORWARD_ID,
    source: "operation_ledger", action_type: "IAM_PERMISSION_NARROWING", resource_type: "IAMRole",
    resource_id: ARN, timestamp: minutesAgo(30), status: "completed", state: "VERIFIED", verified: true,
    rollback_available: false, system_name: "fixture-shop", before_state: {}, after_state: {},
    summary: "Narrowed permissions on fixture-web-role: verified at AWS",
    metadata: {
      event_kind: "operation", operation_ledger: true, operation_state: "VERIFIED",
      change_kind: "IAM_PERMISSION_NARROWING", operator_method: "SELF_ATTESTED", operator_verified: false,
      restored_by_later_operation: true, restored_by_operation_ids: [RESTORE_ID],
    },
    role_name: "fixture-web-role", snapshot_id: SNAPSHOT, performed_by: "Fixture Operator",
    restored_by_later_operation: true,
    ...overrides,
  }
}

function restore() {
  return {
    id: `operation:${RESTORE_ID}`, event_id: `operation:${RESTORE_ID}`, operation_id: RESTORE_ID,
    source: "operation_ledger", action_type: "RESTORE", resource_type: "IAMRole", resource_id: ARN,
    timestamp: minutesAgo(10), status: "verified", state: "VERIFIED", verified: true,
    rollback_available: false, system_name: "fixture-shop", before_state: {}, after_state: {},
    summary: "Restored the pre-change policies of fixture-web-role: verified at AWS",
    metadata: {
      event_kind: "operation", operation_ledger: true, operation_state: "VERIFIED", change_kind: "RESTORE",
      restores_operation_id: FORWARD_ID, operator_method: "SESSION", operator_verified: true,
    },
    role_name: "fixture-web-role", snapshot_id: SNAPSHOT, restores_operation_id: FORWARD_ID,
    performed_by: "process:cyntro-permissions",
  }
}

function unrestoredForward() {
  const { restored_by_later_operation: _a, ...rest } = forward({ rollback_available: true })
  return {
    ...rest,
    metadata: {
      event_kind: "operation", operation_ledger: true, operation_state: "VERIFIED",
      change_kind: "IAM_PERMISSION_NARROWING", operator_method: "SELF_ATTESTED", operator_verified: false,
    },
  }
}

// CAPTURED from the accepted History reader line (backend 4acad91a, pa185/timeline_bodies.raw.json,
// `positive_no_claims`): the scope echo and the reader binding the answer was computed under.
const LEDGER_SCOPE = {
  tenant_id: "fixture-webshop", account_id: "111111111111", resolved_by: "server", requested_region: null,
  applied_dimensions: ["tenant_id", "account_id"], region_filter: "NOT_APPLIED",
  applied_to: ["operation_ledger"], not_filtered_by_claim: ["graph_events", "canonical_operations"],
}
const READER_BOUND = { state: "bound", table: "cyntro-remediation-state-fixture-webshop", region: "eu-west-1",
                       role_arn: "arn:aws:iam::111111111111:role/CyntroLifecycleRead-fixture-webshop" }
const LEDGER_OK = { complete: true, unavailable_reason: null, count: 2, unattributed_to_system: 0, reader_binding: READER_BOUND }

// CAPTURED from the accepted supplier (backend afa99c98, pa178/listing_bodies_178.raw.json): the canonical scoped
// listing envelope and its row shape for the fixture role (`current` / `restored` cases).
const LISTING_SCOPE = { tenant_id: "fixture-webshop", account_id: "111111111111", region: null, resolved_by: "server" }
const REFUSED_SOURCES = [
  { source: "graph_iam_snapshots", state: "refused", reason: "SNAPSHOT_SCOPE_UNPROVEN" },
  { source: "graph_sg_snapshots", state: "refused", reason: "SNAPSHOT_SCOPE_UNPROVEN" },
  { source: "s3_checkpoint_scan", state: "refused", reason: "SNAPSHOT_SCOPE_UNPROVEN" },
]
function listingBody(rows: unknown[], extra: Record<string, unknown> = {}) {
  return {
    scope: LISTING_SCOPE, selectors: { system_name: "fixture-shop", resource_arn: null, limit: 200 },
    complete: true, incomplete_reason: null,
    sources: [{ source: "operation_ledger", state: "read", rows: rows.length, examined: rows.length, withheld: 0,
                withheld_reasons: {}, unsettled: 0, unsettled_operations: [] }, ...REFUSED_SOURCES],
    snapshots: rows, count: rows.length, total_rows: rows.length, ...extra,
  }
}
function currentRow(operationId: string, snapshot: string, overrides: Record<string, unknown> = {}) {
  return {
    snapshot_id: snapshot, operation_id: operationId, snapshot_type: "IAM_BOUNDARY_CHECKPOINT", source: "lifecycle_checkpoint",
    resource_type: "IAMRole", resource_arn: ARN, resource_incarnation: "AROAFIXTUREWEB", tenant_id: "fixture-webshop",
    account_id: "111111111111", region: null, system_name: "fixture-shop", change_kind: "IAM_PERMISSION_NARROWING",
    state: "VERIFIED", created_at: minutesAgo(31), state_changed_at: minutesAgo(30),
    operator: { identity: "Fixture Operator", method: "SELF_ATTESTED", verified: false, actor_kind: "human", person_identified: false },
    evidence: "OUTCOME_VERIFIED", current: { code: "CURRENT", operationId }, restoration: null, offer_withheld_reason: null,
    rollback_available: true, scope_proof: "PROVEN_TENANT_ACCOUNT",
    resource_id: "fixture-web-role", original_role: "fixture-web-role", role_name: "fixture-web-role",
    ...overrides,
  }
}
function restoredRow(operationId: string, restoreId: string, snapshot: string) {
  return currentRow(operationId, snapshot, {
    current: { code: "RESTORED", operationId, restoredByOperationId: restoreId },
    restoration: { restoredByOperationId: restoreId, restoredAt: minutesAgo(10), validated: true, reasons: [] },
    offer_withheld_reason: "RESTORED", rollback_available: false,
  })
}
function readyFamilies(arns: string[]) {
  return SNAPSHOT_SYSTEM_FAMILIES.map(family => ({
    family,
    answer: { kind: "ready", rows: family.alias === "iam-role" ? arns.map(arn => ({ arn })) : [] },
    status: { alias: family.alias, label: family.label, state: "ready", reasonCode: null, listed: 0, notice: null },
  }))
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>
let calls: Array<{ url: string; method: string; body?: string }>

function installFetch(timeline: Route, rollback?: Route, listing: Route = () => json(listingBody([]))) {
  calls = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method || "GET", body: typeof init?.body === "string" ? init.body : undefined })
    if (url.startsWith("/api/proxy/remediation-history/timeline")) return timeline(url, init)
    if (url.startsWith("/api/proxy/snapshots?")) return listing(url, init)
    if (url.startsWith("/api/proxy/iam-snapshots?")) return json({ snapshots: [] })
    // Restore goes through the REAL iam-snapshots proxy handler; `rollback` answers
    // as the backend would, and the proxy's own rewrite of that answer is what
    // the component receives.
    if (url.startsWith("https://backend.example/api/snapshots/") && rollback) return rollback(url, init)
    if (url.startsWith("/api/proxy/iam-snapshots/") && url.endsWith("/rollback")) {
      const { POST } = await import("@/app/api/proxy/iam-snapshots/[snapshotId]/rollback/route")
      const snapshotId = decodeURIComponent(url.split("/")[4])
      return POST(
        new NextRequest(`https://cyntro.example${url}`, { method: "POST", body: String(init?.body ?? "{}"),
                                                          headers: { "content-type": "application/json" } }),
        { params: Promise.resolve({ snapshotId }) },
      )
    }
    return json({ detail: "unexpected request in test" }, 599)
  }))
}

const timelineBody = (events: unknown[], ledger: unknown = LEDGER_OK, echo: unknown = LEDGER_SCOPE) =>
  json({ events, summary: { total_events: events.length }, chart_data: [], operation_ledger: ledger, scope: echo })

let alerts: string[]

beforeEach(() => {
  alerts = []
  vi.stubGlobal("alert", (message: string) => { alerts.push(String(message)) })
  vi.stubGlobal("confirm", () => true)
  scope.current = { customerId: "fixture-webshop", groupId: "all", accountId: "111111111111", region: "all", options: null }
  families.current = readyFamilies([ARN])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function settled() {
  await waitFor(() => expect(screen.getByText(/Change records \(/)).toBeTruthy())
  await waitFor(() => expect(document.querySelector(".animate-spin.rounded-full")).toBeNull())
}

describe("system History renders durable operation records", () => {
  it("shows the change and its restore as two linked rows instead of an empty period", async () => {
    installFetch(() => timelineBody([restore(), forward()]), undefined, () => json(listingBody([restoredRow(FORWARD_ID, RESTORE_ID, SNAPSHOT)])))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()

    expect(screen.getByText("Change records (2)")).toBeTruthy()
    expect(screen.getByText("Narrowed permissions on fixture-web-role: verified at AWS")).toBeTruthy()
    expect(screen.getByText("Restored the pre-change policies of fixture-web-role: verified at AWS")).toBeTruthy()
    const links = screen.getAllByTestId("history-linkage").map(n => n.textContent)
    expect(links).toContain(`Restores change ${FORWARD_ID.slice(0, 8)}`)
    expect(links).toContain(`Restored by ${RESTORE_ID.slice(0, 8)}`)
    expect(screen.getByText("(self-attested, not verified)")).toBeTruthy()
    expect(screen.queryByTestId("history-render-error")).toBeNull()
    expect(screen.queryByText("No remediation events in this period")).toBeNull()
    // Already restored: nothing is offered.
    expect(screen.queryByText("Restore prior state")).toBeNull()
    // The tiles say what the records hold: one verified restore, an unrecorded
    // removed-permission count, and no confidence score.
    expect(screen.getByTestId("history-tile-rollbacks").textContent).toBe("1")
    expect(screen.getByTestId("history-tile-permissions-unrecorded").textContent).toBe("not recorded for 1 change")
    expect(screen.getByTestId("history-tile-confidence").textContent).toBe("—")
    const timelineCall = calls.find(c => c.url.startsWith("/api/proxy/remediation-history/timeline"))
    expect(timelineCall?.url).toContain("system_name=fixture-shop")
  })

  it("does not throw on an event that carries no metadata", async () => {
    const bare = { ...forward(), metadata: undefined, rollback_available: false }
    installFetch(() => timelineBody([bare]))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()
    expect(screen.getByText("Change records (1)")).toBeTruthy()
    expect(screen.queryByTestId("history-render-error")).toBeNull()
  })

  it("restores an unrestored change through the fenced snapshot route and reports only a verified restore", async () => {
    installFetch(
      () => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }),
      () => json({ success: true, code: "RESTORE_VERIFIED", operation_id: RESTORE_ID }),
      () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])),
    )
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()

    fireEvent.click(screen.getByText("Restore prior state"))
    await waitFor(() => expect(alerts.length).toBe(1))
    const post = calls.find(c => c.method === "POST")
    expect(post?.url).toBe(`/api/proxy/iam-snapshots/${SNAPSHOT}/rollback`)
    expect(calls.some(c => c.url === `https://backend.example/api/snapshots/${SNAPSHOT}/rollback`)).toBe(true)
    expect(calls.some(c => c.url.includes("/remediation-history/events/"))).toBe(false)
    expect(alerts[0]).toBe("Prior policies restored and verified at AWS for fixture-web-role.")
  })

  it("shows a typed refusal as its code and message, not as a success", async () => {
    installFetch(
      () => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }),
      () => json({ detail: { code: "RESTORE_LIVE_DRIFT", message: "The role's policies changed after the recorded change was applied.", aws_writes: 0 } }, 409),
      () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])),
    )
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()

    fireEvent.click(screen.getByText("Restore prior state"))
    await waitFor(() => expect(alerts.length).toBe(1))
    expect(alerts[0]).toContain("RESTORE_LIVE_DRIFT")
    expect(alerts[0]).toContain("The role's policies changed after the recorded change was applied.")
    expect(alerts[0]).not.toContain("restored and verified")
  })

  it("names a serving process's credential refusal instead of a bare HTTP status", async () => {
    installFetch(
      () => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }),
      () => json({ detail: { code: "LIFECYCLE_CREDENTIALS_REFUSED", message: "This process may not hold the tenant lifecycle credentials this needs.", aws_writes: 0 } }, 403),
      () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])),
    )
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()

    fireEvent.click(screen.getByText("Restore prior state"))
    await waitFor(() => expect(alerts.length).toBe(1))
    expect(alerts[0]).toContain("LIFECYCLE_CREDENTIALS_REFUSED: This process may not hold the tenant lifecycle credentials this needs.")
    expect(alerts[0]).not.toContain("HTTP_403")
  })

  it("does not call an unconfirmed 200 a restore", async () => {
    installFetch(
      () => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }),
      () => json({ success: false, message: "Checkpoint restored" }),
      () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])),
    )
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()

    fireEvent.click(screen.getByText("Restore prior state"))
    await waitFor(() => expect(alerts.length).toBe(1))
    expect(alerts[0]).toContain("did not confirm a verified restore")
  })

  it("says the History could not be loaded when the timeline request fails", async () => {
    installFetch(() => json({ detail: "unavailable" }, 503))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()

    expect(screen.getByTestId("history-timeline-unavailable").textContent).toContain("503")
    expect(screen.getByText("History could not be loaded")).toBeTruthy()
    expect(screen.queryByText("No remediation events in this period")).toBeNull()
  })

  it("withholds snapshots by name when the listing answer is unreadable, and never renders an empty period", async () => {
    // Final contract (Root185): the canonical listing failing to parse is not a History failure. Its collection is
    // withheld by name, the recorded changes still render under their proven ledger scope, and nothing is offered.
    // (Before this contract the same answer threw inside assembly and rendered "History could not be loaded".)
    installFetch(() => timelineBody([forward()]), undefined, () => new Response("<html>proxy error page</html>", { status: 200 }))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()

    expect(screen.getByTestId("history-snapshot-scope").getAttribute("data-code")).toBe("SNAPSHOT_SCOPE_UNPROVEN")
    expect(screen.getByTestId("history-snapshot-scope").textContent).toContain("ENVELOPE_UNPROVEN")
    expect(screen.getByText("Narrowed permissions on fixture-web-role: verified at AWS")).toBeTruthy()
    expect(screen.queryByText("Restore prior state")).toBeNull()
    expect(screen.queryByTestId("history-render-error")).toBeNull()
    expect(screen.queryByText("No remediation events in this period")).toBeNull()
  })

  it("says when operation records were unreadable or carry no system", async () => {
    installFetch(() => timelineBody([], {
      complete: false, unavailable_reason: "LifecycleCredentialsRefused", count: 0, unattributed_to_system: 2,
    }))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()

    const notices = screen.getAllByTestId("history-ledger-notice").map(n => n.textContent)
    expect(notices).toEqual([
      "Changes recorded by Cyntro could not be read (LifecycleCredentialsRefused), so some may be missing below.",
      "2 recorded changes in this account have no recorded system, so they are not shown in this system's History.",
    ])
  })
})


// ---------------------------------------------------------------------------------------------------------------
// The final mounted-History contract (Root185, bc84a697): scope proof before anything scoped, typed refusals with no
// fallback, one verdict and one offer per change, withdrawal on every new attempt, live authority at dispatch.
// ---------------------------------------------------------------------------------------------------------------

function reactOnClick(node: Element): (event: unknown) => void {
  const key = Object.keys(node).find(k => k.startsWith("__reactProps"))
  const props = key ? (node as unknown as Record<string, { onClick?: (event: unknown) => void }>)[key] : undefined
  if (!props?.onClick) throw new Error("no React onClick on the control")
  return props.onClick
}

const refusal = (code: string, status: number, extra: Record<string, unknown> = {}) =>
  json({ detail: { code, message: `refused ${code}`, ...extra } }, status)

describe("mounted History: the final scope, provenance and authority contract", () => {
  it("2a: a specific group is refused by name before any read; nothing is shown, requested again, or offered", async () => {
    scope.current = { ...scope.current, groupId: "grp-1" }
    installFetch(url => url.includes("account_group=grp-1") ? refusal("REVIEW_SCOPE_GROUP_UNSUPPORTED", 422, { claimed_group: "grp-1" }) : timelineBody([unrestoredForward()]))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await waitFor(() => expect(screen.getByTestId("history-timeline-refusal")).toBeTruthy())

    expect(screen.getByTestId("history-timeline-refusal").getAttribute("data-code")).toBe("REVIEW_SCOPE_GROUP_UNSUPPORTED")
    expect(screen.getByTestId("history-timeline-refusal").textContent).toContain("(group grp-1)")
    expect(screen.queryByText("Narrowed permissions on fixture-web-role: verified at AWS")).toBeNull()
    expect(screen.queryByText("Restore prior state")).toBeNull()
    expect(calls.filter(c => c.url.startsWith("/api/proxy/snapshots"))).toHaveLength(0)
    expect(calls.filter(c => c.url.startsWith("/api/proxy/remediation-history/timeline"))).toHaveLength(1)
    expect(screen.getByTestId("history-snapshot-scope").textContent).toContain("REVIEW_SCOPE_GROUP_UNSUPPORTED")
  })

  it("1: a foreign account claim is refused by the reader and the listing; nothing replaces the refusal", async () => {
    scope.current = { ...scope.current, accountId: "222222222222" }
    installFetch(() => refusal("REVIEW_SCOPE_MISMATCH", 403), undefined, () => refusal("REVIEW_SCOPE_MISMATCH", 403))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await waitFor(() => expect(screen.getByTestId("history-timeline-refusal")).toBeTruthy())

    expect(screen.getByTestId("history-timeline-refusal").getAttribute("data-code")).toBe("REVIEW_SCOPE_MISMATCH")
    expect(calls.find(c => c.url.startsWith("/api/proxy/remediation-history/timeline"))?.url).toContain("account_id=222222222222")
    expect(screen.getByTestId("history-snapshot-scope").textContent).toContain("LISTING_REFUSED REVIEW_SCOPE_MISMATCH")
    expect(screen.queryByText("Restore prior state")).toBeNull()
    expect(screen.getByText("History could not be loaded")).toBeTruthy()
    expect(screen.queryByText("No remediation events in this period")).toBeNull()
  })

  it("2b/2c: all accounts shows the ledger under the server's positive account only, requests no snapshots and offers nothing; one selected account then proves the rows", async () => {
    scope.current = { ...scope.current, accountId: "all" }
    installFetch(() => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }), undefined, () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])))
    const view = render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()

    expect(screen.getByTestId("history-ledger-scope").getAttribute("data-ok")).toBe("true")
    expect(screen.getByTestId("history-ledger-scope").textContent).toContain("History of account 111111111111 (this deployment; all regions)")
    expect(screen.getByText("Narrowed permissions on fixture-web-role: verified at AWS")).toBeTruthy()
    expect(calls.filter(c => c.url.startsWith("/api/proxy/snapshots"))).toHaveLength(0)
    expect(screen.getByTestId("history-snapshot-scope").getAttribute("data-code")).toBe("SNAPSHOT_SCOPE_UNPROVEN")
    expect(screen.getByTestId("history-snapshot-scope").textContent).toContain("ACCOUNT_NOT_SELECTED")
    expect(screen.getByTestId("history-snapshot-scope").textContent).not.toMatch(/\d+ (hidden|snapshot)/)
    expect(screen.queryByText("Restore prior state")).toBeNull()

    scope.current = { ...scope.current, accountId: "111111111111" }
    view.rerender(<RemediationTimeline systemId="fixture-shop" />)
    await waitFor(() => expect(screen.getByText("Restore prior state")).toBeTruthy())
    expect(calls.filter(c => c.url.startsWith("/api/proxy/snapshots"))).toHaveLength(1)
    expect(calls.find(c => c.url.startsWith("/api/proxy/snapshots"))?.url).toContain("account_id=111111111111")
    expect(screen.queryByTestId("history-snapshot-scope")).toBeNull()
  })

  it("3: an unproven envelope withholds the rows by name; a proven one offers only CURRENT rows, and a canonical row without a ledger counterpart is shown", async () => {
    const other = "aaaaaaaa-0000-4000-8000-000000000001"
    installFetch(() => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }), undefined,
      () => json(listingBody([
        currentRow(FORWARD_ID, SNAPSHOT, { current: { code: "LEDGER_ENTRY_UNORDERED", operationId: other, state: "VERIFIED" }, rollback_available: false, offer_withheld_reason: "LEDGER_ENTRY_UNORDERED" }),
        currentRow(other, "IAMRole-fixture-web-role-bbbbbbbb", { state_changed_at: minutesAgo(5), created_at: minutesAgo(6) }),
      ])))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()
    // The ledger change carries its canonical verdict (unordered → not offered); the extra canonical row is shown and offered.
    const buttons = screen.getAllByText("Restore prior state")
    expect(buttons).toHaveLength(1)
    expect(screen.getByText("Change records (2)")).toBeTruthy()
    expect(screen.getAllByTestId("history-snapshot-notice").map(n => n.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining("graph_sg_snapshots: refused (SNAPSHOT_SCOPE_UNPROVEN)"),
    ]))

    cleanupRender()
    installFetch(() => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }), undefined,
      () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)], { scope: { ...LISTING_SCOPE, account_id: "222222222222" } })))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()
    expect(screen.getByTestId("history-snapshot-scope").textContent).toContain("ENVELOPE_UNPROVEN")
    expect(screen.queryByText("Restore prior state")).toBeNull()
  })

  it("4: a response without the reader's scope echo withholds ledger events by name; graph receipts stay, named as unproven inputs", async () => {
    const graph = { ...unrestoredForward(), event_id: "graph-1", id: "graph-1", source: "neo4j", summary: "Graph receipt", rollback_available: false }
    installFetch(() => timelineBody([unrestoredForward(), graph], LEDGER_OK, null))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()

    expect(screen.getByTestId("history-ledger-scope").getAttribute("data-ok")).toBe("false")
    expect(screen.getByTestId("history-ledger-scope").textContent).toContain("SCOPE_ABSENT")
    expect(screen.getByTestId("history-ledger-withheld")).toBeTruthy()
    expect(screen.queryByText("Narrowed permissions on fixture-web-role: verified at AWS")).toBeNull()
    expect(screen.getByText("Graph receipt")).toBeTruthy()
    expect(screen.getByTestId("history-graph-events-scope").textContent).toContain("not filtered by, nor proven for, the selected scope")
    expect(screen.queryByText("Restore prior state")).toBeNull()
  })

  it("5: a selected region is context: the ledger is labelled account-wide, and an echo that does not match the page withholds", async () => {
    scope.current = { ...scope.current, region: "us-east-1" }
    installFetch(() => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }, { ...LEDGER_SCOPE, requested_region: "us-east-1" }),
      undefined, () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])))
    const view = render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()
    expect(calls.find(c => c.url.startsWith("/api/proxy/remediation-history/timeline"))?.url).toContain("region=us-east-1")
    expect(screen.getByTestId("history-ledger-scope").textContent).toContain("Region us-east-1 is the page's context only")
    expect(screen.getByTestId("history-ledger-scope").textContent).toContain("not filtered by region (region_filter NOT_APPLIED)")
    expect(screen.getByText("Restore prior state")).toBeTruthy()

    installFetch(() => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }), undefined, () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])))
    scope.current = { ...scope.current, region: "eu-west-1" }
    view.rerender(<RemediationTimeline systemId="fixture-shop" />)
    await waitFor(() => expect(screen.getByTestId("history-ledger-scope").getAttribute("data-ok")).toBe("false"))
    expect(screen.getByTestId("history-ledger-scope").textContent).toContain("REQUESTED_REGION_MISMATCH")
    // The ledger events are withheld by name; the canonical listing, proven on its own envelope, still carries its row.
    expect(screen.getByTestId("history-ledger-withheld")).toBeTruthy()
    expect(screen.queryByText("Narrowed permissions on fixture-web-role: verified at AWS")).toBeNull()
  })

  it("6/7: a scope change withdraws the open modal and a saved enabled control before anything is awaited; the saved control dispatches nothing", async () => {
    installFetch(() => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }),
      () => json({ success: true, code: "RESTORE_VERIFIED", operation_id: RESTORE_ID }),
      () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])))
    const view = render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()
    fireEvent.click(screen.getByText("Narrowed permissions on fixture-web-role: verified at AWS"))
    await waitFor(() => expect(screen.getByText("Change record")).toBeTruthy())
    const saved = reactOnClick(screen.getByText("Restore prior state"))

    scope.current = { ...scope.current, accountId: "all" }
    view.rerender(<RemediationTimeline systemId="fixture-shop" />)
    await waitFor(() => expect(screen.queryByText("Change record")).toBeNull())
    await waitFor(() => expect(screen.getByTestId("history-snapshot-scope").textContent).toContain("ACCOUNT_NOT_SELECTED"))

    const postsBefore = calls.filter(c => c.method === "POST").length
    await act(async () => { saved({ stopPropagation() {} }) })
    expect(calls.filter(c => c.method === "POST")).toHaveLength(postsBefore)
    expect(alerts.at(-1)).toContain("RESTORE_NOT_OFFERED")
  })

  it("6b: a same-scope refresh that offers the SAME operation and resource again retires the row and modal controls saved under the earlier read; only the freshly rendered control dispatches", async () => {
    installFetch(() => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }),
      () => json({ success: true, code: "RESTORE_VERIFIED", operation_id: RESTORE_ID }),
      () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()
    // Read A offers the row: save its row control, open its modal and save the modal control.
    const savedRow = reactOnClick(screen.getByText("Restore prior state"))
    fireEvent.click(screen.getByText("Narrowed permissions on fixture-web-role: verified at AWS"))
    await waitFor(() => expect(screen.getByText("Change record")).toBeTruthy())
    const savedModal = reactOnClick(screen.getByText("Restore All"))

    // Read B: the same selection read again, positively offering the same operation_id / resource_arn.
    fireEvent.click(screen.getByTitle("Refresh timeline"))
    await waitFor(() => expect(calls.filter(c => c.url.startsWith("/api/proxy/remediation-history/timeline"))).toHaveLength(2))
    await waitFor(() => expect(calls.filter(c => c.url.startsWith("/api/proxy/snapshots"))).toHaveLength(2))
    await settled()
    await waitFor(() => expect(screen.queryByText("Change record")).toBeNull())
    expect(screen.getByText("Restore prior state")).toBeTruthy()

    // Both controls saved under A dispatch nothing, by name, although B offers the identical row.
    const postsBefore = calls.filter(c => c.method === "POST").length
    const alertsBefore = alerts.length
    await act(async () => { savedRow({ stopPropagation() {} }) })
    expect(calls.filter(c => c.method === "POST")).toHaveLength(postsBefore)
    expect(alerts[alertsBefore]).toContain("RESTORE_NOT_OFFERED")
    expect(alerts[alertsBefore]).toContain("RESTORE_OFFER_SUPERSEDED")
    await act(async () => { savedModal({}) })
    expect(calls.filter(c => c.method === "POST")).toHaveLength(postsBefore)
    expect(alerts[alertsBefore + 1]).toContain("RESTORE_OFFER_SUPERSEDED")
    expect(alerts).toHaveLength(alertsBefore + 2)

    // The control B rendered dispatches the fenced route for the exact row: one proxy POST and its one upstream POST.
    fireEvent.click(screen.getByText("Restore prior state"))
    await waitFor(() => expect(alerts.at(-1)).toBe("Prior policies restored and verified at AWS for fixture-web-role."))
    expect(calls.filter(c => c.method === "POST").slice(postsBefore).map(c => c.url)).toEqual([
      `/api/proxy/iam-snapshots/${SNAPSHOT}/rollback`,
      `https://backend.example/api/snapshots/${SNAPSHOT}/rollback`,
    ])
  })

  it("6d: the modal control alone, saved under read A, dispatches nothing after a same-scope refresh re-offers the same row", async () => {
    installFetch(() => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }),
      () => json({ success: true, code: "RESTORE_VERIFIED", operation_id: RESTORE_ID }),
      () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()
    fireEvent.click(screen.getByText("Narrowed permissions on fixture-web-role: verified at AWS"))
    await waitFor(() => expect(screen.getByText("Change record")).toBeTruthy())
    const savedModal = reactOnClick(screen.getByText("Restore All"))

    fireEvent.click(screen.getByTitle("Refresh timeline"))
    await waitFor(() => expect(calls.filter(c => c.url.startsWith("/api/proxy/remediation-history/timeline"))).toHaveLength(2))
    await settled()
    await waitFor(() => expect(screen.queryByText("Change record")).toBeNull())
    expect(screen.getByText("Restore prior state")).toBeTruthy()

    const alertsBefore = alerts.length
    await act(async () => { savedModal({}) })
    expect(calls.filter(c => c.method === "POST")).toHaveLength(0)
    expect(alerts[alertsBefore]).toContain("RESTORE_NOT_OFFERED: RESTORE_OFFER_SUPERSEDED")
    expect(alerts).toHaveLength(alertsBefore + 1)
  })

  it("6c: each rendered restore control names the read that offered it, and a refresh renders a new one", async () => {
    installFetch(() => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }), undefined, () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()
    const offeredA = screen.getByText("Restore prior state").getAttribute("data-offered-by-attempt")
    expect(offeredA).toMatch(/^[1-9]\d*$/)
    fireEvent.click(screen.getByTitle("Refresh timeline"))
    await waitFor(() => expect(calls.filter(c => c.url.startsWith("/api/proxy/remediation-history/timeline"))).toHaveLength(2))
    await settled()
    const offeredB = screen.getByText("Restore prior state").getAttribute("data-offered-by-attempt")
    expect(offeredB).toMatch(/^[1-9]\d*$/)
    expect(Number(offeredB)).toBeGreaterThan(Number(offeredA))
  })

  it("8: restore A finishing after a same-key restore B started under a later read cannot erase B or complete under B's read", async () => {
    let releaseA!: (response: Response) => void
    const gateA = new Promise<Response>(resolve => { releaseA = resolve })
    let rollbackCalls = 0
    installFetch(() => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }),
      async () => { rollbackCalls += 1; return rollbackCalls === 1 ? gateA : json({ success: true, code: "RESTORE_VERIFIED", operation_id: RESTORE_ID }) },
      () => json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()

    fireEvent.click(screen.getByText("Restore prior state"))
    await waitFor(() => expect(rollbackCalls).toBe(1))
    // A refresh is a new read: the in-flight flag of A is withdrawn with it, and B is started under the new read.
    fireEvent.click(screen.getByTitle("Refresh timeline"))
    await waitFor(() => expect(calls.filter(c => c.url.startsWith("/api/proxy/remediation-history/timeline"))).toHaveLength(2))
    await waitFor(() => expect(screen.getByText("Restore prior state")).toBeTruthy())
    fireEvent.click(screen.getByText("Restore prior state"))
    await waitFor(() => expect(rollbackCalls).toBe(2))
    const alertsBeforeA = alerts.length
    await act(async () => { releaseA(json({ success: true, code: "RESTORE_VERIFIED", operation_id: "late-a" })) ; await new Promise(r => setTimeout(r, 20)) })
    // A's outcome is a scoped notice under the read it belongs to; it did not complete B's read and did not refetch.
    expect(alerts.slice(alertsBeforeA).some(a => a.includes("re-read since this restore started"))).toBe(true)
    await waitFor(() => expect(alerts.some(a => a === "Prior policies restored and verified at AWS for fixture-web-role.")).toBe(true))
  })

  it("9: a warm success is not authority: the same read's listing refusal withholds everything by name", async () => {
    let listingCalls = 0
    installFetch(() => timelineBody([unrestoredForward()], { ...LEDGER_OK, count: 1 }), undefined,
      () => { listingCalls += 1; return listingCalls === 1 ? json(listingBody([currentRow(FORWARD_ID, SNAPSHOT)])) : refusal("SNAPSHOT_LISTING_UNAVAILABLE", 503) })
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()
    expect(screen.getByText("Restore prior state")).toBeTruthy()

    fireEvent.click(screen.getByTitle("Refresh timeline"))
    await waitFor(() => expect(listingCalls).toBe(2))
    await waitFor(() => expect(screen.getByTestId("history-snapshot-scope").textContent).toContain("LISTING_REFUSED SNAPSHOT_LISTING_UNAVAILABLE"))
    expect(screen.queryByText("Restore prior state")).toBeNull()
  })

  it("names an unconfigured reader beside the ledger notice instead of an empty ledger", async () => {
    installFetch(() => timelineBody([], { complete: false, unavailable_reason: "HISTORY_STORAGE_UNCONFIGURED", count: 0, unattributed_to_system: 0,
                                         reader_binding: { state: "unconfigured", reason: "lifecycle reader is not configured: CYNTRO_LIFECYCLE_READ_ROLE_ARN" } }))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await settled()
    const notices = screen.getAllByTestId("history-ledger-notice").map(n => n.textContent)
    expect(notices).toContainEqual(expect.stringContaining("could not be read (HISTORY_STORAGE_UNCONFIGURED)"))
    expect(notices).toContainEqual(expect.stringContaining("reader is not configured for this deployment (lifecycle reader is not configured: CYNTRO_LIFECYCLE_READ_ROLE_ARN)"))
  })
})
