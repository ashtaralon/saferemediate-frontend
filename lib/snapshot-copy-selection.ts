/**
 * One rule for choosing between two copies of the same snapshot, shared by the aggregate snapshots proxy
 * (app/api/proxy/snapshots/route.ts) and the Recovery tab, which merges that aggregate with the IAM History listing.
 * Moved here verbatim from the proxy so the two never disagree about which copy is complete.
 */

type SnapshotCopy = Record<string, any>

function isCanonical(copy: SnapshotCopy): boolean {
  return copy.source === "lifecycle_checkpoint" && copy.scope_proof === "PROVEN_TENANT_ACCOUNT"
}

/**
 * True when `candidate` should replace `existing`. A canonical scoped ledger row outranks an older graph/name row even
 * when its offer is withheld (a stale legacy true is not authority); otherwise a copy carrying `rollback_available`
 * outranks one without; otherwise a copy naming the role outranks one that does not. Ties keep `existing`.
 */
export function preferSnapshotCopy(existing: SnapshotCopy, candidate: SnapshotCopy): boolean {
  const existingCanonical = isCanonical(existing)
  const newCanonical = isCanonical(candidate)
  if (newCanonical && !existingCanonical) return true
  if (existingCanonical && !newCanonical) return false
  const existingHasRollback = existing.rollback_available !== undefined
  const newHasRollback = candidate.rollback_available !== undefined
  if (newHasRollback && !existingHasRollback) return true
  if (!newHasRollback && !existingHasRollback) {
    const existingHasRole = existing.original_role || existing.current_state?.role_name
    const newHasRole = candidate.original_role || candidate.current_state?.role_name
    return Boolean(newHasRole && !existingHasRole)
  }
  return false
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined
}

function roleNameOf(copy: SnapshotCopy): string | undefined {
  const arn = text(copy.resource_arn) || text(copy.role_arn)
  const fromArn = arn ? /:role\/(?:.*\/)?([^/]+)$/.exec(arn)?.[1] : undefined
  return fromArn || text(copy.role_name) || text(copy.original_role) || text(copy.current_state?.role_name)
}

/**
 * Whether two same-id copies can be the same snapshot: no identifying field that both carry disagrees. Fields a source
 * adds for its own bookkeeping (status, reason, created_by, finding_id, and the aggregate's `system_name`, which its
 * checkpoint transform fills with the resource id) are not identity. When in doubt the answer is "different", so the
 * caller keeps both.
 */
export function sameSnapshotCopy(a: SnapshotCopy, b: SnapshotCopy): boolean {
  const pairs: Array<[string | undefined, string | undefined]> = [
    [roleNameOf(a), roleNameOf(b)],
    [text(a.resource_arn) || text(a.role_arn), text(b.resource_arn) || text(b.role_arn)],
    [text(a.operation_id), text(b.operation_id)],
    [text(a.account_id), text(b.account_id)],
    [text(a.tenant_id), text(b.tenant_id)],
    [text(a.sg_id), text(b.sg_id)],
  ]
  return pairs.every(([x, y]) => x === undefined || y === undefined || x === y)
}
