import { describe, expect, it } from "vitest"
import {
  DEFAULT_REMEDIATION_EVENT_FILTER,
  dedupeRemediationEvents,
  isActionableRestore,
  remediationTimelineUrl,
  snapshotBelongsToSystem,
  summarizeRemediationEvents,
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

  it("only admits explicitly matching snapshot systems to a system timeline", () => {
    expect(snapshotBelongsToSystem(event(), "alon-prod")).toBe(true)
    expect(snapshotBelongsToSystem(event({ system_name: "other" }), "alon-prod")).toBe(false)
    expect(snapshotBelongsToSystem(event({ system_name: null }), "alon-prod")).toBe(false)
    expect(snapshotBelongsToSystem(event({ system_name: null }), undefined)).toBe(true)
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
      completed_events: 1,
      rollback_events: 1,
      avg_confidence: 80,
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
