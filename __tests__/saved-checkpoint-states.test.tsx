/// <reference types="vitest/globals" />
/**
 * Saved checkpoint states in the MOUNTED History modal, through the REAL
 * /api/proxy/snapshots/[snapshotId]/states route handler. The backend answer is
 * shaped as api/snapshots.get_snapshot_states returns it (P8).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NextRequest } from "next/server"
import * as React from "react"

import { RemediationTimeline } from "@/components/remediation-timeline"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.example" }))
// The page's selection and the Decision families the mounted History reads (positively captured scope; see
// history-operation-ledger.test.tsx). The modal controls below need no snapshot offer, so the listing stays empty.
const scope = vi.hoisted(() => ({
  current: { customerId: "fixture-webshop", groupId: "all", accountId: "111111111111", region: "all", options: null } as Record<string, unknown>,
}))
vi.mock("@/lib/account-scope-context", () => ({ useAccountScope: () => scope.current }))
vi.mock("@/lib/inventory-decision-families", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/inventory-decision-families")>()),
  fetchDecisionFamilyAnswers: vi.fn(async () => null),
}))
// CAPTURED from the accepted History reader line (backend 4acad91a, pa185/timeline_bodies.raw.json).
const LEDGER_SCOPE = {
  tenant_id: "fixture-webshop", account_id: "111111111111", resolved_by: "server", requested_region: null,
  applied_dimensions: ["tenant_id", "account_id"], region_filter: "NOT_APPLIED",
  applied_to: ["operation_ledger"], not_filtered_by_claim: ["graph_events", "canonical_operations"],
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const ARN = "arn:aws:iam::111111111111:role/fixture-web-role"

function ledgerEvent(op: string, snapshot: string, summary: string, minutes: number) {
  return {
    id: `operation:${op}`, event_id: `operation:${op}`, operation_id: op, source: "operation_ledger",
    action_type: "IAM_PERMISSION_NARROWING", resource_type: "IAMRole", resource_id: ARN, timestamp: minutesAgo(minutes),
    status: "completed", state: "VERIFIED", verified: true, rollback_available: true, system_name: "fixture-shop",
    before_state: {}, after_state: {}, summary, snapshot_id: snapshot, role_name: "fixture-web-role",
    metadata: { event_kind: "operation", operation_ledger: true, operation_state: "VERIFIED", change_kind: "IAM_PERMISSION_NARROWING" },
  }
}

const BEFORE = { "fixture-web-app": { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject", "sqs:SendMessage"], Resource: "*" }] } }
const AFTER = { "fixture-web-app": { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: ["s3:GetObject"], Resource: "*" }] } }

function states(op: string, snapshot: string, overrides: Record<string, unknown> = {}) {
  return {
    snapshot_id: snapshot, source: "lifecycle_checkpoint", grants_no_authority: true,
    scope: { tenant_id: "fixture-webshop", account_id: "111111111111", resource_arn: ARN },
    checkpoint: { status: "CREATED", created_at: minutesAgo(30), s3_key: `checkpoints/${snapshot}.json`, s3_version_id_observed: "v1", s3_version_pinned: false, before_state_source: "s3_object" },
    operation: { operation_id: op, state: "VERIFIED", record_version: 2, pre_image_hash: "a".repeat(64), post_image_hash: "b".repeat(64), removed_actions: ["s3:PutObject", "sqs:SendMessage"] },
    integrity: "VERIFIED",
    before: { verified: true, reason: null, policy_set_hash_checkpoint: "a".repeat(64), policy_set_hash_recomputed: "a".repeat(64), inline_policies: BEFORE, attached_managed_policy_arns: [] },
    after: { verified: true, reason: null, derivation: "compile_inline_permission_change(checkpoint before_state, recorded removal set)", policy_set_hash_recorded: "b".repeat(64), policy_set_hash_recomputed: "b".repeat(64), inline_policies: AFTER, deleted_inline_policies: [] },
    ...overrides,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

let calls: string[]
function installFetch(events: unknown[], backendStates: (snapshot: string) => Response | Promise<Response>) {
  calls = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith("/api/proxy/remediation-history/timeline")) {
      return json({ events, summary: { total_events: events.length }, chart_data: [], scope: LEDGER_SCOPE,
                    operation_ledger: { complete: true, unavailable_reason: null, count: events.length, unattributed_to_system: 0 } })
    }
    if (url.startsWith("/api/proxy/snapshots?")) return json({ snapshots: [] })
    if (url.startsWith("/api/proxy/iam-snapshots?")) return json([])
    const backend = url.match(/^https:\/\/backend\.example\/api\/snapshots\/([^/]+)\/states$/)
    if (backend) return backendStates(decodeURIComponent(backend[1]))
    const proxied = url.match(/^\/api\/proxy\/snapshots\/([^/]+)\/states$/)
    if (proxied) {
      const { GET } = await import("@/app/api/proxy/snapshots/[snapshotId]/states/route")
      return GET(new NextRequest(`https://cyntro.example${url}`), { params: Promise.resolve({ snapshotId: decodeURIComponent(proxied[1]) }) })
    }
    return json({ detail: "unexpected request in test" }, 599)
  }))
}

beforeEach(() => {
  vi.stubGlobal("alert", () => {})
  vi.stubGlobal("confirm", () => true)
})
afterEach(() => vi.unstubAllGlobals())

async function openStates(summary: string) {
  await waitFor(() => expect(screen.getByText(summary)).toBeTruthy())
  fireEvent.click(screen.getByText(summary))
  // The modal is reused and keeps its expanded/collapsed toggle between events.
  const toggle = await screen.findByText(/(Show|Hide) State Changes/)
  if (/Show/.test(toggle.textContent || "")) fireEvent.click(toggle)
}

describe("saved checkpoint states in the History modal", () => {
  it("shows the verified before and after policies with integrity, version and scope", async () => {
    installFetch([ledgerEvent("op-a", "IAMRole-fixture-web-role-aaaa1111", "Change A", 10)], snapshot => json(states("op-a", snapshot)))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await openStates("Change A")

    const integrity = await screen.findByTestId("saved-state-integrity")
    expect(integrity.textContent).toContain("VERIFIED — before verified: hash aaaaaaaaaaaa equals the checkpoint and the operation's pre-image")
    expect(integrity.textContent).toContain("after verified: hash bbbbbbbbbbbb equals the post-image verified at apply")
    expect(screen.getByTestId("saved-state-version").textContent).toContain("S3 version observed on this read: v1 (not pinned")
    expect(screen.getByTestId("saved-state-version").textContent).not.toMatch(/S3 version v1/)
    expect(screen.getByTestId("saved-state-after-label").textContent).toContain("derived from the saved before state and the recorded removal")
    expect(screen.getByTestId("saved-state-after-label").textContent).toContain("these bytes are not stored")
    expect(screen.getByTestId("saved-state-version").textContent).toContain("operation op-a (VERIFIED, record v2)")
    expect(screen.getByTestId("saved-state-before").textContent).toContain("s3:PutObject")
    expect(screen.getByTestId("saved-state-after").textContent).not.toContain("s3:PutObject")
    expect(calls).toContain("https://backend.example/api/snapshots/IAMRole-fixture-web-role-aaaa1111/states")
  })

  it("withholds an after state that does not verify, and says why", async () => {
    installFetch([ledgerEvent("op-a", "IAMRole-fixture-web-role-aaaa1111", "Change A", 10)], snapshot => json(states("op-a", snapshot, {
      integrity: "BEFORE_ONLY",
      after: { verified: false, reason: "AFTER_HASH_MISMATCH", derivation: "x", policy_set_hash_recorded: "0".repeat(64), policy_set_hash_recomputed: "b".repeat(64), inline_policies: null, deleted_inline_policies: null },
    })))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await openStates("Change A")

    expect((await screen.findByTestId("saved-state-after-withheld")).textContent)
      .toBe("After state not shown: the derived after state does not hash to the post-image verified at apply")
    expect(screen.queryByTestId("saved-state-after")).toBeNull()
  })

  it("labels an unverifiable before state as such and withholds the after state", async () => {
    installFetch([ledgerEvent("op-a", "IAMRole-fixture-web-role-aaaa1111", "Change A", 10)], snapshot => json(states("op-a", snapshot, {
      integrity: "UNVERIFIABLE",
      before: { verified: false, reason: "MANAGED_POLICY_DOCUMENTS_NOT_IN_CHECKPOINT", policy_set_hash_checkpoint: "a".repeat(64), policy_set_hash_recomputed: "c".repeat(64), inline_policies: BEFORE, attached_managed_policy_arns: ["arn:aws:iam::aws:policy/ReadOnlyAccess"] },
      after: { verified: false, reason: "BEFORE_NOT_VERIFIED", derivation: "x", policy_set_hash_recorded: "b".repeat(64), policy_set_hash_recomputed: null, inline_policies: null, deleted_inline_policies: null },
    })))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await openStates("Change A")

    const integrity = await screen.findByTestId("saved-state-integrity")
    expect(integrity.textContent).toContain("UNVERIFIABLE — before not verified: attached managed policy documents are not stored in the checkpoint")
    expect(screen.getByText(/Before \(not hash-verified: attached managed policy documents are not stored in the checkpoint\)/)).toBeTruthy()
    expect(screen.getByTestId("saved-state-before").textContent).toContain("arn:aws:iam::aws:policy/ReadOnlyAccess")
    expect(screen.getByTestId("saved-state-after-withheld").textContent).toBe("After state not shown: the before state is not verified")
  })

  it("shows a typed refusal from the backend, not a generic not-found", async () => {
    installFetch([ledgerEvent("op-a", "IAMRole-fixture-web-role-aaaa1111", "Change A", 10)], () =>
      json({ detail: { code: "SNAPSHOT_STATE_UNATTRIBUTED", message: "No recorded change in this tenant and account was taken from this snapshot." } }, 409))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await openStates("Change A")

    expect((await screen.findByTestId("saved-state-unavailable")).textContent)
      .toBe("Saved state unavailable: SNAPSHOT_STATE_UNATTRIBUTED: No recorded change in this tenant and account was taken from this snapshot.")
    expect(screen.queryByTestId("saved-state-before")).toBeNull()
  })

  it("never renders one snapshot's late answer under another event", async () => {
    let releaseA!: () => void
    const aAnswered = new Promise<void>(resolve => { releaseA = resolve })
    installFetch([
      ledgerEvent("op-a", "IAMRole-fixture-web-role-aaaa1111", "Change A", 20),
      ledgerEvent("op-b", "IAMRole-fixture-web-role-bbbb2222", "Change B", 10),
    ], async snapshot => {
      if (snapshot.endsWith("aaaa1111")) await aAnswered
      return json(states(snapshot.endsWith("aaaa1111") ? "op-a" : "op-b", snapshot))
    })
    render(<RemediationTimeline systemId="fixture-shop" />)
    await openStates("Change A")
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0])
    await openStates("Change B")
    await waitFor(() => expect(screen.getByTestId("saved-state-version").textContent).toContain("operation op-b"))

    await act(async () => { releaseA(); await aAnswered; await new Promise(r => setTimeout(r, 20)) })
    expect(screen.getByTestId("saved-state-version").textContent).toContain("operation op-b")
    expect(screen.getByTestId("saved-state-version").textContent).not.toContain("op-a")
  })

  it("re-reads the saved state when the modal is reopened, instead of showing a stale answer", async () => {
    let status = "CREATED"
    installFetch([ledgerEvent("op-a", "IAMRole-fixture-web-role-aaaa1111", "Change A", 10)], snapshot =>
      json(states("op-a", snapshot, { checkpoint: { status, created_at: minutesAgo(30), s3_key: `checkpoints/${snapshot}.json`, s3_version_id_observed: "v1", s3_version_pinned: false, before_state_source: "s3_object" } })))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await openStates("Change A")
    await waitFor(() => expect(screen.getByTestId("saved-state-version").textContent).toContain("Checkpoint CREATED"))
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0])
    status = "ROLLED_BACK"
    await openStates("Change A")
    await waitFor(() => expect(screen.getByTestId("saved-state-version").textContent).toContain("Checkpoint ROLLED_BACK"))
  })

  it("offers no saved-state drilldown for a graph event without states", async () => {
    // An IAM graph receipt WITH a snapshot id: only operation-ledger records have lifecycle checkpoint states.
    const graph = { ...ledgerEvent("g-1", "IAMRole-legacy-role-1a2b3c4d", "Graph change", 10), source: "neo4j" }
    installFetch([graph], () => json({}, 500))
    render(<RemediationTimeline systemId="fixture-shop" />)
    await waitFor(() => expect(screen.getByText("Graph change")).toBeTruthy())
    fireEvent.click(screen.getByText("Graph change"))
    await waitFor(() => expect(screen.getByText("Change record")).toBeTruthy())
    expect(screen.queryByText(/Show State Changes/)).toBeNull()
    expect(calls.some(c => c.includes("/states"))).toBe(false)
  })
})
