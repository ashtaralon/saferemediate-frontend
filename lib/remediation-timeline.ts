/**
 * Where a History row came from. The timeline API returns both graph receipts
 * and durable operation records; they restore through different routes, so the
 * distinction must survive into the component.
 */
export type TimelineEventSource = "neo4j" | "snapshot" | "operation_ledger"

import { withAccountScope, type ProductScope } from "@/lib/account-scope"

/** The page's own selection, as the scope bar holds it (`"all"` = no narrowing). */
export type HistoryPageScope = Pick<ProductScope, "customerId" | "groupId" | "accountId" | "region">

export interface TimelineEventRecord {
  event_id?: string | null
  snapshot_id?: string | null
  timestamp: string
  resource_type: string
  resource_id: string
  action_type: string
  status: string
  confidence_score?: number | null
  source?: TimelineEventSource
  system_name?: string | null
  metadata?: {
    permissions_removed?: number | null
    event_kind?: "operation" | "checkpoint"
    parent_operation_id?: string
    restore?: {
      available: boolean
      operation_id: string
      operation_kind: string
      system_name?: string | null
      snapshot_id?: string | null
      expires_at?: string | null
      confirmation?: string | null
      rearm_path?: string | null
      rollback_path?: string | null
      reason?: string | null
    }
    [key: string]: unknown
  }
  rollback_available?: boolean
}

export interface TimelineSummaryRecord {
  total_events: number
  total_permissions_removed: number
  /** Recorded changes whose removed-permission count was never recorded. */
  permissions_removed_unrecorded: number
  completed_events: number
  rollback_events: number
  avg_confidence: number
  /** How many displayed events carry a confidence score; 0 means the average is unknown, not 0%. */
  confidence_scores: number
  period_start?: string
  period_end?: string
}

export type RemediationEventFilter = "actionable" | "all"

// History is the durable audit record. Consumers may offer a restore-only
// view, but must not make that narrower view the initial state.
export const DEFAULT_REMEDIATION_EVENT_FILTER: RemediationEventFilter = "all"

const normalized = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLocaleLowerCase() : ""

/**
 * A stable identity for a remediation receipt. Snapshot IDs are preferred
 * because the graph event and the snapshot feed use different event IDs for
 * the same production change. The final tuple is intentionally strict: it
 * only collapses records that describe the same resource, action, and instant.
 */
export function remediationEventIdentity(event: TimelineEventRecord): string {
  if (event.metadata?.event_kind === "checkpoint" && event.event_id) {
    return `checkpoint:${normalized(event.event_id)}`
  }
  // A restore records the same snapshot id as the change it restored. Two
  // operations are two rows, so a ledger record is identified by itself.
  if (event.source === "operation_ledger" && event.event_id) {
    return `operation:${normalized(event.event_id)}`
  }
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

export function remediationTimelineUrl(
  startDate: string,
  endDate: string,
  systemName?: string,
  scope?: HistoryPageScope | null,
): string {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    limit: "200",
    force_refresh: "true",
  })
  if (systemName) params.set("system_name", systemName)
  const url = `/api/proxy/remediation-history/timeline?${params.toString()}`
  // The page's selection travels as CLAIMS the reader validates before any read: a specific group is refused
  // there, an account or region claim must belong to the deployment, and `"all"` sends nothing (H-H2).
  return scope ? withAccountScope(url, scope) : url
}

const ACCOUNT_ID = /^\d{12}$/

/** The canonical scoped snapshot listing's own statement of its scope (the supplier envelope). */
export interface SnapshotListingScope {
  tenant_id?: unknown
  account_id?: unknown
  region?: unknown
  resolved_by?: unknown
}

export const ACCOUNT_NOT_SELECTED = "ACCOUNT_NOT_SELECTED"
export const ACCOUNT_GROUP_UNSUPPORTED = "REVIEW_SCOPE_GROUP_UNSUPPORTED"
export const ENVELOPE_UNPROVEN = "ENVELOPE_UNPROVEN"

/**
 * The positive snapshot envelope gate, run BEFORE `systemSnapshotView` (which answers `all` for an unnamed system
 * without looking at scope) and before any row reaches `snapshotsInView`. Null when proven; otherwise the reason,
 * a string carried under the helper's `SNAPSHOT_SCOPE_UNPROVEN` code, never a new code. A specific group is
 * unsupported (nothing is requested for it); "all accounts" is not a selected account; anything else needs the
 * supplier's server-resolved tenant and single 12-digit account equal to the page's.
 */
export function snapshotEnvelopeUnprovenReason(
  scope: unknown,
  page: HistoryPageScope | null | undefined,
): string | null {
  if (!page || !page.customerId) return ENVELOPE_UNPROVEN
  if (page.groupId && page.groupId !== "all") return ACCOUNT_GROUP_UNSUPPORTED
  if (!page.accountId || page.accountId === "all") return ACCOUNT_NOT_SELECTED
  if (!scope || typeof scope !== "object") return ENVELOPE_UNPROVEN
  const stated = scope as SnapshotListingScope
  if (stated.resolved_by !== "server") return ENVELOPE_UNPROVEN
  if (typeof stated.tenant_id !== "string" || stated.tenant_id !== page.customerId) return ENVELOPE_UNPROVEN
  if (typeof stated.account_id !== "string" || !ACCOUNT_ID.test(stated.account_id)) return ENVELOPE_UNPROVEN
  if (stated.account_id !== page.accountId) return ENVELOPE_UNPROVEN
  return null
}

export function snapshotEnvelopeProven(scope: unknown, page: HistoryPageScope | null | undefined): boolean {
  return snapshotEnvelopeUnprovenReason(scope, page) === null
}

/** The History reader's echo of the scope it READ the operation ledger for (reader 1cf31c02, frozen). */
export interface LedgerScopeEcho {
  tenant_id?: unknown
  account_id?: unknown
  resolved_by?: unknown
  requested_region?: unknown
  applied_dimensions?: unknown
  region_filter?: unknown
  applied_to?: unknown
  not_filtered_by_claim?: unknown
}

export type LedgerScopeVerdict =
  | { ok: true; tenantId: string; accountId: string; requestedRegion: string | null }
  | { ok: false; code: "LEDGER_SCOPE_UNPROVEN"; reason: string }

/**
 * Whether the ledger events in a timeline answer may be rendered as this page's: the echo must be the server's,
 * name the page's customer and a single 12-digit account (equal to the page's when one is selected), echo the
 * page's region as REQUESTED CONTEXT (never a filter), and state that the applied dimensions are tenant and
 * account only. Graph receipts and canonical operations are outside this proof by the reader's own statement.
 */
export function ledgerScopeVerdict(scope: unknown, page: HistoryPageScope | null | undefined): LedgerScopeVerdict {
  const unproven = (reason: string): LedgerScopeVerdict => ({ ok: false, code: "LEDGER_SCOPE_UNPROVEN", reason })
  if (!page || !page.customerId) return unproven("PAGE_SCOPE_UNAVAILABLE")
  if (!scope || typeof scope !== "object") return unproven("SCOPE_ABSENT")
  const echo = scope as LedgerScopeEcho
  if (echo.resolved_by !== "server") return unproven("NOT_SERVER_RESOLVED")
  if (typeof echo.tenant_id !== "string" || echo.tenant_id !== page.customerId) return unproven("TENANT_MISMATCH")
  if (typeof echo.account_id !== "string" || !ACCOUNT_ID.test(echo.account_id)) return unproven("ACCOUNT_UNSTATED")
  if (page.accountId && page.accountId !== "all" && echo.account_id !== page.accountId) return unproven("ACCOUNT_MISMATCH")
  const expectedRegion = page.region && page.region !== "all" ? page.region : null
  const requested = echo.requested_region === undefined ? null : echo.requested_region
  if (requested !== expectedRegion) return unproven("REQUESTED_REGION_MISMATCH")
  const dimensions = Array.isArray(echo.applied_dimensions) ? echo.applied_dimensions : null
  if (!dimensions || dimensions.length !== 2 || dimensions[0] !== "tenant_id" || dimensions[1] !== "account_id") {
    return unproven("APPLIED_DIMENSIONS_UNSTATED")
  }
  if (echo.region_filter !== "NOT_APPLIED") return unproven("REGION_FILTER_UNSTATED")
  return { ok: true, tenantId: echo.tenant_id, accountId: echo.account_id, requestedRegion: expectedRegion }
}

/** The honest header for a proven ledger: account-wide, with a selected region named as context only. */
export function ledgerScopeLabel(verdict: LedgerScopeVerdict): string {
  if (!verdict.ok) return `Recorded changes not shown (${verdict.code}: ${verdict.reason}).`
  const base = `History of account ${verdict.accountId} (this deployment; all regions).`
  return verdict.requestedRegion
    ? `${base} Region ${verdict.requestedRegion} is the page's context only: this ledger is not filtered by region (region_filter NOT_APPLIED).`
    : base
}

export interface SnapshotListingSource {
  source?: unknown
  state?: unknown
  reason?: unknown
  withheld?: unknown
  withheld_reasons?: unknown
  unsettled?: unknown
  unsettled_operations?: unknown
}

export interface SnapshotListingEnvelope {
  complete?: unknown
  incomplete_reason?: unknown
  sources?: unknown
  proxy_retired_sources?: unknown
  snapshots?: unknown
  scope?: unknown
}

/**
 * What the collection must say about what it does NOT show: an incomplete listing, every named refused, retired
 * or unavailable source (an empty ledger is not proof that SG/S3/legacy history never existed), withheld rows and
 * unsettled operations. Counts of hidden SNAPSHOT rows are never rendered; these are provenance statements.
 */
export function snapshotListingNotices(envelope: SnapshotListingEnvelope | null | undefined): string[] {
  if (!envelope || typeof envelope !== "object") return []
  const notices: string[] = []
  if (envelope.complete === false) {
    const reason = typeof envelope.incomplete_reason === "string" ? envelope.incomplete_reason : "incomplete"
    notices.push(`The snapshot listing was not read in full (${reason}): rows below are history only and nothing is offered.`)
  }
  const sources = [
    ...(Array.isArray(envelope.sources) ? envelope.sources : []),
    ...(Array.isArray(envelope.proxy_retired_sources) ? envelope.proxy_retired_sources : []),
  ] as SnapshotListingSource[]
  for (const source of sources) {
    if (!source || typeof source !== "object") continue
    const name = typeof source.source === "string" ? source.source : "source"
    const state = typeof source.state === "string" ? source.state : ""
    if (state === "refused" || state === "unavailable" || state === "not_requested") {
      const reason = typeof source.reason === "string" ? source.reason : state
      notices.push(`${name}: ${state} (${reason}). That history is not shown here; this is not a statement that it never existed.`)
    }
    if (name === "operation_ledger") {
      const withheld = Number(source.withheld) || 0
      if (withheld > 0) {
        const reasons = source.withheld_reasons && typeof source.withheld_reasons === "object"
          ? Object.entries(source.withheld_reasons as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(", ")
          : ""
        notices.push(`${withheld} recorded change${withheld === 1 ? "" : "s"} withheld by identity (${reasons || "unstated"}).`)
      }
      const unsettled = Number(source.unsettled) || 0
      if (unsettled > 0) {
        notices.push(`${unsettled} operation${unsettled === 1 ? "" : "s"} on listed targets ${unsettled === 1 ? "is" : "are"} unsettled; their targets are not offered.`)
      }
    }
  }
  return notices
}

export type SnapshotRowOffer = { offered: true } | { offered: false; reason: string }

/**
 * A canonical listing row is offered only when the supplier said so AND proved its scope AND the shared walk
 * called it the target's current change. Omitted or unknown is never an offer; the withheld reason is the
 * supplier's, never derived here.
 */
export function snapshotRowOffer(row: {
  rollback_available?: unknown
  scope_proof?: unknown
  current?: unknown
  offer_withheld_reason?: unknown
}): SnapshotRowOffer {
  const current = row.current && typeof row.current === "object" ? (row.current as { code?: unknown }) : null
  if (row.scope_proof !== "PROVEN_TENANT_ACCOUNT") return { offered: false, reason: "SCOPE_PROOF_MISSING" }
  if (row.rollback_available !== true || current?.code !== "CURRENT") {
    const reason = typeof row.offer_withheld_reason === "string" && row.offer_withheld_reason
      ? row.offer_withheld_reason
      : typeof current?.code === "string" ? current.code : "RESTORE_NOT_OFFERED"
    return { offered: false, reason }
  }
  return { offered: true }
}

export function isActionableRestore(event: TimelineEventRecord): boolean {
  if (event.action_type === "ROLLBACK") return false
  if (event.metadata?.event_kind === "checkpoint") return false
  return event.rollback_available === true
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
    // An operation record does not store how many permissions it removed, so
    // its contribution above is unknown rather than zero.
    permissions_removed_unrecorded: events.filter(
      event =>
        event.source === "operation_ledger" &&
        event.action_type !== "RESTORE" &&
        typeof event.metadata?.permissions_removed !== "number",
    ).length,
    completed_events: events.filter(event => event.status === "completed").length,
    // A restore recorded and verified by the operation ledger is a rollback.
    rollback_events: events.filter(
      event =>
        event.status === "rolled_back" ||
        event.action_type === "ROLLBACK" ||
        (event.source === "operation_ledger" && event.action_type === "RESTORE" && event.status === "verified"),
    ).length,
    avg_confidence: confidences.length
      ? Math.round((confidences.reduce((total, score) => total + score, 0) / confidences.length) * 100)
      : 0,
    confidence_scores: confidences.length,
    period_start: periodStart,
    period_end: periodEnd,
  }
}

/** The source of an event returned by the timeline API: a ledger record, or a graph receipt. */
export function timelineApiEventSource(raw: { source?: unknown } | null | undefined): "neo4j" | "operation_ledger" {
  return raw?.source === "operation_ledger" ? "operation_ledger" : "neo4j"
}

export interface OperationLedgerStatus {
  complete?: boolean
  unavailable_reason?: string | null
  count?: number
  unattributed_to_system?: number
  /** The reader binding the answer was computed under (reader 1cf31c02); an unbound reader is named, never hidden. */
  reader_binding?: { state?: string; reason?: string; table?: string; region?: string; role_arn?: string } | null
}

/**
 * What the History must say about the operation records it could not show.
 * Unreadable is not empty, and a change with no recorded system is not
 * silently dropped from a system's History.
 */
export function operationLedgerNotices(status: OperationLedgerStatus | null | undefined): string[] {
  if (!status) return []
  const notices: string[] = []
  if (status.complete === false) {
    notices.push(
      status.unavailable_reason
        ? `Changes recorded by Cyntro could not be read (${status.unavailable_reason}), so some may be missing below.`
        : "Changes recorded by Cyntro were not read in full, so some may be missing below.",
    )
  }
  if (status.reader_binding && status.reader_binding.state === "unconfigured") {
    notices.push(
      `The change ledger's reader is not configured for this deployment (${status.reader_binding.reason || "unstated"}), so recorded changes could not be read.`,
    )
  }
  const unattributed = Number(status.unattributed_to_system) || 0
  if (unattributed > 0) {
    notices.push(
      unattributed === 1
        ? "1 recorded change in this account has no recorded system, so it is not shown in this system's History."
        : `${unattributed} recorded changes in this account have no recorded system, so they are not shown in this system's History.`,
    )
  }
  return notices
}

/** The restore route for a ledger record, or null when the record has none. */
export function ledgerRestorePath(event: TimelineEventRecord): string | null {
  if (event.source !== "operation_ledger") return null
  if (event.resource_type !== "IAMRole" || !event.snapshot_id) return null
  return `/api/proxy/iam-snapshots/${encodeURIComponent(event.snapshot_id)}/rollback`
}

/** Restore linkage exactly as recorded, both directions. */
export function operationLinkage(event: TimelineEventRecord): { restores: string | null; restoredBy: string[] } {
  const metadata = event.metadata || {}
  const restores = typeof metadata.restores_operation_id === "string" ? metadata.restores_operation_id : null
  const restoredBy = Array.isArray(metadata.restored_by_operation_ids)
    ? metadata.restored_by_operation_ids.filter((id): id is string => typeof id === "string")
    : []
  return { restores, restoredBy }
}
