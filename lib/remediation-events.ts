// Cross-component remediation/rollback signal bus.
//
// When ANY mutation path successfully changes a resource's remediated
// state (apply, rollback, force-rollback, override apply, etc.) it
// fires `cyntro:remediation-changed` on the window. Other views that
// surface remediated state (LP Tab, Trust Boundary map, dashboard
// counters) subscribe via onRemediationChanged and refetch with
// cache-busting so the operator never sees a stale "still remediated"
// row after they've just rolled back.
//
// Why a window event and not React context: mutations fire from deeply
// nested modal trees, while consumers (LP Tab, Trust Boundary map) sit
// in separate route branches. A context provider would have to wrap
// the entire app and threading callbacks through dynamic imports gets
// ugly. The window event is the cheapest, most testable cross-tree
// signal — and the cost (no React-tree subscription) doesn't matter
// because the consumer just calls its own refetch on receipt.
//
// Discipline: NEVER consume this in a remediation mutation path's
// own component to drive its own refetch. Same-component refetch
// happens directly in the success handler (e.g.
// LeastPrivilegeTab.handleRollbackSuccess calls fetchGaps locally).
// The event is purely for OTHER views.

export const REMEDIATION_CHANGED_EVENT = "cyntro:remediation-changed"

export type RemediationChangedAction =
  | "remediate"
  | "rollback"
  | "force-rollback"
  | "override-apply"

export interface RemediationChangedDetail {
  action: RemediationChangedAction
  resource_type: string
  resource_id: string
  partial?: boolean
  /** Optional pipeline / event id for downstream correlation */
  source_id?: string
}

export function dispatchRemediationChanged(
  detail: RemediationChangedDetail,
): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<RemediationChangedDetail>(REMEDIATION_CHANGED_EVENT, {
      detail,
    }),
  )
}

/**
 * Subscribe to remediation-changed events. Returns an unsubscribe fn
 * that callers should return from their useEffect cleanup.
 *
 * If `filter` is provided, the handler only fires for events whose
 * detail matches the filter (resource_type and/or action). This lets
 * a view that only cares about IAM rollbacks skip SG remediation
 * notifications etc.
 */
export function onRemediationChanged(
  handler: (detail: RemediationChangedDetail) => void,
  filter?: { resource_type?: string; action?: RemediationChangedAction },
): () => void {
  if (typeof window === "undefined") return () => {}
  const wrapped = (e: Event) => {
    const ce = e as CustomEvent<RemediationChangedDetail>
    const d = ce.detail
    if (!d) return
    if (filter?.resource_type && d.resource_type !== filter.resource_type) return
    if (filter?.action && d.action !== filter.action) return
    handler(d)
  }
  window.addEventListener(REMEDIATION_CHANGED_EVENT, wrapped)
  return () => window.removeEventListener(REMEDIATION_CHANGED_EVENT, wrapped)
}
