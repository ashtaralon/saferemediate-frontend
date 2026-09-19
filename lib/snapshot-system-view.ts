/**
 * The recovery system view rule: what a system's snapshot collection may show, and which rows belong to it.
 *
 * Extracted unchanged from `components/snapshots-recovery-tab.tsx` (FE 0bce5255) so the mounted History route and
 * the standalone recovery page can apply the same rule to the same listing. Nothing here fetches, parses a listing
 * envelope, or grants restore authority: it decides visibility only.
 */
import {
  DECISION_SYSTEM_FAMILIES,
  type DecisionFamily,
  type DecisionFamilyResult,
  type InventoryScope,
} from '@/lib/inventory-decision-families'

/** The families whose resources carry recovery snapshots. */
export const SNAPSHOT_SYSTEM_FAMILIES = DECISION_SYSTEM_FAMILIES.filter(
  (family) => family.alias === 'sg' || family.alias === 'iam-role' || family.alias === 's3',
)

export const SNAPSHOT_SCOPE_UNPROVEN = 'SNAPSHOT_SCOPE_UNPROVEN'
export const SYSTEM_FILTER_UNAVAILABLE = 'SYSTEM_FILTER_UNAVAILABLE'

/** The scope a server-scoped snapshot listing states for itself. The legacy listing states none. */
export interface SnapshotListingScope {
  tenant_id?: unknown
  account_id?: unknown
  resolved_by?: unknown
}

export type SystemSnapshotView =
  | { kind: 'all' }
  | { kind: 'hidden'; code: typeof SNAPSHOT_SCOPE_UNPROVEN | typeof SYSTEM_FILTER_UNAVAILABLE; notices: string[] }
  | { kind: 'scoped'; identities: ReadonlySet<string> }

/**
 * What a system's recovery view may show. Without a system, the listing is shown as it is (the unscoped page).
 * With a system, snapshots are shown only when the listing proves, server-side, the page's own tenant and single
 * account, and every snapshot family's Decision list answered; then only rows whose exact resource identity is one of
 * the system's listed ARNs. A name never attributes a snapshot to a system, and anything unproven hides the
 * collection and its actions by name.
 */
export function systemSnapshotView(
  systemName: string | undefined,
  families: ReadonlyArray<DecisionFamilyResult<DecisionFamily>> | null,
  listingScope: SnapshotListingScope | null,
  page: InventoryScope,
): SystemSnapshotView {
  if (!systemName) return { kind: 'all' }
  const notices = (families ?? [])
    .filter((result) => result.answer.kind !== 'ready' || result.status.notice)
    .map((result) => result.status.notice ?? `${result.family.label}: unavailable`)
  const scopeProven =
    listingScope !== null &&
    listingScope.resolved_by === 'server' &&
    typeof listingScope.account_id === 'string' &&
    page.accountId !== '' && page.accountId !== 'all' &&
    listingScope.account_id === page.accountId &&
    typeof listingScope.tenant_id === 'string' &&
    !!page.customerId && listingScope.tenant_id === page.customerId
  if (!scopeProven) return { kind: 'hidden', code: SNAPSHOT_SCOPE_UNPROVEN, notices }
  if (!families || notices.length > 0) return { kind: 'hidden', code: SYSTEM_FILTER_UNAVAILABLE, notices }
  const identities = new Set<string>()
  for (const { answer } of families) {
    if (answer.kind === 'ready') for (const row of answer.rows) if (row.arn) identities.add(row.arn)
  }
  return { kind: 'scoped', identities }
}

export function snapshotsInView<T extends { resource_arn?: string }>(rows: T[], view: SystemSnapshotView): T[] {
  if (view.kind === 'all') return rows
  if (view.kind === 'hidden') return []
  return rows.filter((row) => typeof row.resource_arn === 'string' && view.identities.has(row.resource_arn))
}
