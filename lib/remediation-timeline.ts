export interface TimelineEventRecord {
  event_id?: string | null
  snapshot_id?: string | null
  timestamp: string
  resource_type: string
  resource_id: string
  action_type: string
  status: string
  confidence_score?: number | null
  source?: "neo4j" | "snapshot"
  system_name?: string | null
  metadata?: {
    permissions_removed?: number | null
    [key: string]: unknown
  }
}

export interface TimelineSummaryRecord {
  total_events: number
  total_permissions_removed: number
  completed_events: number
  rollback_events: number
  avg_confidence: number
  period_start?: string
  period_end?: string
}

const normalized = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLocaleLowerCase() : ""

/**
 * A stable identity for a remediation receipt. Snapshot IDs are preferred
 * because the graph event and the snapshot feed use different event IDs for
 * the same production change. The final tuple is intentionally strict: it
 * only collapses records that describe the same resource, action, and instant.
 */
export function remediationEventIdentity(event: TimelineEventRecord): string {
  if (event.snapshot_id) return `snapshot:${normalized(event.snapshot_id)}`
  if (event.event_id) return `event:${normalized(event.event_id)}`
  return [
    "receipt",
    normalized(event.resource_type),
    normalized(event.resource_id),
    normalized(event.action_type),
    normalized(event.timestamp),
  ].join(":")
}

/** Graph receipts are authoritative when both sources describe one change. */
export function dedupeRemediationEvents<T extends TimelineEventRecord>(events: T[]): T[] {
  const byIdentity = new Map<string, T>()

  for (const event of events) {
    const identity = remediationEventIdentity(event)
    const existing = byIdentity.get(identity)
    if (!existing || (existing.source !== "neo4j" && event.source === "neo4j")) {
      byIdentity.set(identity, event)
    }
  }

  return Array.from(byIdentity.values()).sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  )
}

/**
 * Snapshot APIs are account-wide. A system timeline may only consume a
 * snapshot that explicitly identifies that system; unknown is not a match.
 */
export function snapshotBelongsToSystem(
  event: TimelineEventRecord,
  systemId?: string,
): boolean {
  if (!systemId) return true
  return normalized(event.system_name) === normalized(systemId)
}

export function summarizeRemediationEvents(
  events: TimelineEventRecord[],
  periodStart?: string,
  periodEnd?: string,
): TimelineSummaryRecord {
  const confidences = events
    .map(event => event.confidence_score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score))

  return {
    total_events: events.length,
    total_permissions_removed: events.reduce(
      (total, event) => total + (Number(event.metadata?.permissions_removed) || 0),
      0,
    ),
    completed_events: events.filter(event => event.status === "completed").length,
    rollback_events: events.filter(
      event => event.status === "rolled_back" || event.action_type === "ROLLBACK",
    ).length,
    avg_confidence: confidences.length
      ? Math.round((confidences.reduce((total, score) => total + score, 0) / confidences.length) * 100)
      : 0,
    period_start: periodStart,
    period_end: periodEnd,
  }
}
