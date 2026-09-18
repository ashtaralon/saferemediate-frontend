import { describe, expect, it } from "vitest"
import {
  DEFAULT_REMEDIATION_EVENT_FILTER,
  dedupeRemediationEvents,
  isActionableRestore,
  ledgerRestorePath,
  operationLedgerNotices,
  operationLinkage,
  remediationTimelineUrl,
  timelineApiEventSource,
  summarizeRemediationEvents,
  snapshotEnvelopeUnprovenReason,
  ledgerScopeVerdict,
  ledgerScopeLabel,
  snapshotListingNotices,
  snapshotRowOffer,
  type TimelineEventRecord,
} from "@/lib/remediation-timeline"

it("opens the audit timeline on the complete change record", () => {
  expect(DEFAULT_REMEDIATION_EVENT_FILTER).toBe("all")
})

const event = (overrides: Partial<TimelineEventRecord> = {}): TimelineEventRecord => ({
  event_id: "evt-1",
  snapshot_id: "snap-1",
  timestamp: "2026-08-10T08:00:00.000Z",
  resource_type: "IAMRole",
  resource_id: "role-a",
  action_type: "PERMISSION_REMOVAL",
  status: "completed",
  confidence_score: 0.8,
  source: "neo4j",
  system_name: "alon-prod",
  metadata: { permissions_removed: 3 },
  ...overrides,
})

describe("remediation timeline consistency", () => {
  it("collapses duplicate snapshot feeds and prefers the graph receipt", () => {
    const snapshotA = event({ event_id: "feed-a", source: "snapshot", summary: undefined } as any)
    const snapshotB = event({ event_id: "feed-b", source: "snapshot" })
    const graph = event({ event_id: "graph-event", source: "neo4j" })

    expect(dedupeRemediationEvents([snapshotA, snapshotB, graph])).toEqual([graph])
  })

  it("deduplicates strict fallback identities but preserves distinct changes", () => {
    const first = event({ event_id: null, snapshot_id: null })
    const duplicate = { ...first }
    const later = event({
      event_id: null,
      snapshot_id: null,
      timestamp: "2026-08-10T09:00:00.000Z",
    })

    expect(dedupeRemediationEvents([first, duplicate, later])).toEqual([later, first])
  })

  it("never admits a snapshot to a system by name: the envelope gate runs before the helper (H-H9)", () => {
    const page = { customerId: "fixture-webshop", groupId: "all", accountId: "111111111111", region: "all" }
    const proven = { tenant_id: "fixture-webshop", account_id: "111111111111", region: null, resolved_by: "server" }
    expect(snapshotEnvelopeUnprovenReason(proven, page)).toBeNull()
    expect(snapshotEnvelopeUnprovenReason({ ...proven, account_id: "222222222222" }, page)).toBe("ENVELOPE_UNPROVEN")
    expect(snapshotEnvelopeUnprovenReason({ ...proven, resolved_by: "page" }, page)).toBe("ENVELOPE_UNPROVEN")
    expect(snapshotEnvelopeUnprovenReason({ ...proven, tenant_id: "another" }, page)).toBe("ENVELOPE_UNPROVEN")
    expect(snapshotEnvelopeUnprovenReason(null, page)).toBe("ENVELOPE_UNPROVEN")
    expect(snapshotEnvelopeUnprovenReason(proven, { ...page, accountId: "all" })).toBe("ACCOUNT_NOT_SELECTED")
    expect(snapshotEnvelopeUnprovenReason(proven, { ...page, groupId: "grp-1" })).toBe("REVIEW_SCOPE_GROUP_UNSUPPORTED")
    expect(snapshotEnvelopeUnprovenReason(proven, null)).toBe("ENVELOPE_UNPROVEN")
  })

  it("renders ledger events only under the reader's exact positive echo, with a selected region as context", () => {
    const page = { customerId: "fixture-webshop", groupId: "all", accountId: "111111111111", region: "all" }
    const echo = {
      tenant_id: "fixture-webshop", account_id: "111111111111", resolved_by: "server", requested_region: null,
      applied_dimensions: ["tenant_id", "account_id"], region_filter: "NOT_APPLIED",
      applied_to: ["operation_ledger"], not_filtered_by_claim: ["graph_events", "canonical_operations"],
    }
    expect(ledgerScopeVerdict(echo, page)).toEqual({ ok: true, tenantId: "fixture-webshop", accountId: "111111111111", requestedRegion: null })
    expect(ledgerScopeVerdict(echo, { ...page, accountId: "all" }).ok).toBe(true)
    expect(ledgerScopeVerdict({ ...echo, requested_region: "us-east-1" }, { ...page, region: "us-east-1" })).toMatchObject({ ok: true, requestedRegion: "us-east-1" })
    expect(ledgerScopeLabel(ledgerScopeVerdict({ ...echo, requested_region: "us-east-1" }, { ...page, region: "us-east-1" })))
      .toContain("not filtered by region (region_filter NOT_APPLIED)")
    expect(ledgerScopeVerdict({ ...echo, requested_region: "us-east-1" }, page)).toMatchObject({ ok: false, reason: "REQUESTED_REGION_MISMATCH" })
    expect(ledgerScopeVerdict({ ...echo, account_id: "222222222222" }, page)).toMatchObject({ ok: false, reason: "ACCOUNT_MISMATCH" })
    expect(ledgerScopeVerdict({ ...echo, region_filter: "APPLIED" }, page)).toMatchObject({ ok: false, reason: "REGION_FILTER_UNSTATED" })
    expect(ledgerScopeVerdict({ ...echo, applied_dimensions: ["tenant_id", "account_id", "region"] }, page)).toMatchObject({ ok: false, reason: "APPLIED_DIMENSIONS_UNSTATED" })
    expect(ledgerScopeVerdict(undefined, page)).toMatchObject({ ok: false, code: "LEDGER_SCOPE_UNPROVEN", reason: "SCOPE_ABSENT" })
  })

  it("offers a canonical row only when proven, offered and current; an omitted value is never an offer", () => {
    const row = { rollback_available: true, scope_proof: "PROVEN_TENANT_ACCOUNT", current: { code: "CURRENT" }, offer_withheld_reason: null }
    expect(snapshotRowOffer(row)).toEqual({ offered: true })
    expect(snapshotRowOffer({ ...row, rollback_available: undefined })).toEqual({ offered: false, reason: "CURRENT" })
    expect(snapshotRowOffer({ ...row, rollback_available: false, current: { code: "LEDGER_ENTRY_UNORDERED" }, offer_withheld_reason: "LEDGER_ENTRY_UNORDERED" }))
      .toEqual({ offered: false, reason: "LEDGER_ENTRY_UNORDERED" })
    expect(snapshotRowOffer({ ...row, scope_proof: undefined })).toEqual({ offered: false, reason: "SCOPE_PROOF_MISSING" })
  })

  it("names refused, retired and incomplete sources instead of dropping their provenance", () => {
    const notices = snapshotListingNotices({
      complete: false, incomplete_reason: "PAGE_SIZE_REACHED",
      sources: [
        { source: "operation_ledger", state: "incomplete", rows: 1, withheld: 2, withheld_reasons: { IDENTITY_MALFORMED: 2 }, unsettled: 1, unsettled_operations: [{ operation_id: "x" }] },
        { source: "graph_sg_snapshots", state: "refused", reason: "SNAPSHOT_SCOPE_UNPROVEN" },
      ],
      proxy_retired_sources: [{ source: "s3_remediation_checkpoints", state: "not_requested", reason: "SNAPSHOT_SCOPE_UNPROVEN" }],
    })
    expect(notices[0]).toContain("not read in full (PAGE_SIZE_REACHED)")
    expect(notices).toContainEqual(expect.stringContaining("graph_sg_snapshots: refused (SNAPSHOT_SCOPE_UNPROVEN)"))
    expect(notices).toContainEqual(expect.stringContaining("s3_remediation_checkpoints: not_requested (SNAPSHOT_SCOPE_UNPROVEN)"))
    expect(notices).toContainEqual(expect.stringContaining("2 recorded changes withheld by identity (IDENTITY_MALFORMED: 2)"))
    expect(notices).toContainEqual(expect.stringContaining("1 operation on listed targets is unsettled"))
    expect(snapshotListingNotices(null)).toEqual([])
  })

  it("carries the page's selection to the reader as claims, and sends nothing for 'all'", () => {
    const url = remediationTimelineUrl("2026-09-01T00:00:00.000Z", "2026-09-17T00:00:00.000Z", "payments",
      { customerId: "fixture-webshop", groupId: "all", accountId: "111111111111", region: "eu-west-1" })
    const params = new URL(url, "http://cyntro.local").searchParams
    expect(params.get("customer_id")).toBe("fixture-webshop")
    expect(params.get("account_id")).toBe("111111111111")
    expect(params.get("region")).toBe("eu-west-1")
    expect(params.get("account_group")).toBeNull()
    expect(params.get("system_name")).toBe("payments")
    const grouped = new URL(remediationTimelineUrl("a", "b", undefined, { customerId: "c", groupId: "grp-1", accountId: "all", region: "all" }), "http://cyntro.local").searchParams
    expect(grouped.get("account_group")).toBe("grp-1")
    expect(grouped.get("account_id")).toBeNull()
    expect(remediationTimelineUrl("a", "b")).not.toContain("customer_id")
  })

  it("derives every counter from the exact displayed event set", () => {
    const displayed = [
      event(),
      event({
        event_id: "rollback-1",
        snapshot_id: "snap-2",
        action_type: "ROLLBACK",
        status: "rolled_back",
        confidence_score: null,
        metadata: { permissions_removed: 0 },
      }),
    ]

    expect(summarizeRemediationEvents(displayed, "2026-08-01", "2026-08-10")).toEqual({
      total_events: 2,
      total_permissions_removed: 3,
      permissions_removed_unrecorded: 0,
      completed_events: 1,
      rollback_events: 1,
      avg_confidence: 80,
      confidence_scores: 1,
      period_start: "2026-08-01",
      period_end: "2026-08-10",
    })
  })

  it("preserves multiple lifecycle checkpoints for one operation", () => {
    const first = event({
      event_id: "transition-1",
      snapshot_id: "snap-1",
      metadata: { event_kind: "checkpoint", parent_operation_id: "op-1" },
    })
    const second = event({
      event_id: "transition-2",
      snapshot_id: "snap-1",
      metadata: { event_kind: "checkpoint", parent_operation_id: "op-1" },
    })
    expect(dedupeRemediationEvents([first, second])).toHaveLength(2)
  })

  it("uses the backend system_name contract", () => {
    const url = remediationTimelineUrl("2026-08-01", "2026-08-12", "alon-prod")
    expect(url).toContain("system_name=alon-prod")
    expect(url).not.toContain("system=alon-prod")
  })

  it("allows a verified restore during monitoring, not only after completion", () => {
    expect(isActionableRestore(event({ status: "pending", rollback_available: true }))).toBe(true)
    expect(isActionableRestore(event({
      action_type: "LIFECYCLE_CHECKPOINT",
      rollback_available: false,
      metadata: { event_kind: "checkpoint" },
    }))).toBe(false)
  })
})

describe("durable operation records in the timeline", () => {
  const ledger = (overrides: Partial<TimelineEventRecord> = {}): TimelineEventRecord =>
    event({ source: "operation_ledger", snapshot_id: "IAMRole-role-a-1a2b3c4d", metadata: { event_kind: "operation" }, ...overrides })

  it("keeps a restore and the change it restored as two rows although they share a snapshot", () => {
    const change = ledger({ event_id: "operation:fwd", action_type: "IAM_PERMISSION_NARROWING" })
    const restore = ledger({ event_id: "operation:rst", action_type: "RESTORE" })
    expect(dedupeRemediationEvents([change, restore])).toHaveLength(2)
  })

  it("keeps the source the API reported, and treats anything else as a graph receipt", () => {
    expect(timelineApiEventSource({ source: "operation_ledger" })).toBe("operation_ledger")
    expect(timelineApiEventSource({ source: "snapshot" })).toBe("neo4j")
    expect(timelineApiEventSource({})).toBe("neo4j")
    expect(timelineApiEventSource(null)).toBe("neo4j")
  })

  it("restores a ledger role change only through its snapshot route", () => {
    expect(ledgerRestorePath(ledger())).toBe("/api/proxy/iam-snapshots/IAMRole-role-a-1a2b3c4d/rollback")
    expect(ledgerRestorePath(ledger({ resource_type: "S3Bucket" }))).toBeNull()
    expect(ledgerRestorePath(ledger({ snapshot_id: null }))).toBeNull()
    expect(ledgerRestorePath(event())).toBeNull()
  })

  it("reads restore linkage only as recorded", () => {
    expect(operationLinkage(ledger({ metadata: { restores_operation_id: "fwd" } }))).toEqual({ restores: "fwd", restoredBy: [] })
    expect(operationLinkage(ledger({ metadata: { restored_by_operation_ids: ["rst", 7] } }))).toEqual({ restores: null, restoredBy: ["rst"] })
    expect(operationLinkage(ledger({ metadata: undefined }))).toEqual({ restores: null, restoredBy: [] })
  })

  it("reports unreadable and unattributed operation records, and nothing when complete", () => {
    expect(operationLedgerNotices(null)).toEqual([])
    expect(operationLedgerNotices({ complete: true, unattributed_to_system: 0 })).toEqual([])
    expect(operationLedgerNotices({ complete: false })).toEqual([
      "Changes recorded by Cyntro were not read in full, so some may be missing below.",
    ])
    expect(operationLedgerNotices({ complete: true, unattributed_to_system: 1 })).toEqual([
      "1 recorded change in this account has no recorded system, so it is not shown in this system's History.",
    ])
  })
})

describe("summary tiles over operation records", () => {
  const op = (overrides: Partial<TimelineEventRecord> = {}): TimelineEventRecord =>
    event({ source: "operation_ledger", confidence_score: undefined, metadata: { event_kind: "operation" }, ...overrides })

  it("counts a verified ledger restore as a rollback, and nothing less verified", () => {
    const summary = summarizeRemediationEvents([
      op({ event_id: "operation:fwd", action_type: "IAM_PERMISSION_NARROWING", status: "completed" }),
      op({ event_id: "operation:rst", action_type: "RESTORE", status: "verified" }),
      op({ event_id: "operation:bad", action_type: "RESTORE", status: "unknown" }),
    ])
    expect(summary.rollback_events).toBe(1)
  })

  it("says a ledger change's removed-permission count is unrecorded, not zero", () => {
    const summary = summarizeRemediationEvents([
      op({ event_id: "operation:fwd", action_type: "IAM_PERMISSION_NARROWING", status: "completed" }),
      op({ event_id: "operation:rst", action_type: "RESTORE", status: "verified" }),
      event({ metadata: {} }),
    ])
    expect(summary.permissions_removed_unrecorded).toBe(1)
  })

  it("reports how many confidence scores the average rests on", () => {
    expect(summarizeRemediationEvents([op(), op({ event_id: "operation:2" })]).confidence_scores).toBe(0)
    expect(summarizeRemediationEvents([event()]).confidence_scores).toBe(1)
  })
})
