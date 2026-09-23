import { selectCurrentIamRestore } from '@/components/iam-permission-analysis-modal'

export interface IamRestoreTarget {
  snapshotId: string
  operationId: string
  resourceArn: string
  systemName: string
}

export interface VerifiedIamRestore {
  snapshot_id: string
  operation_id: string
  restores_operation_id: string
  history: { current: unknown; restoration: { validated: true; restoredByOperationId: string } }
}

function record(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any> : null
}

export function iamRestoreTarget(rowValue: unknown, expectedSystemName?: string): IamRestoreTarget | null {
  const row = record(rowValue)
  const arn = row?.resource_arn || row?.role_arn
  const account = typeof arn === 'string' ? /^arn:aws:iam::([0-9]{12}):role\/.+/.exec(arn)?.[1] : null
  const current = record(row?.current)
  if (!account || !row || typeof row.system_name !== 'string' || !row.system_name ||
      (expectedSystemName && row.system_name !== expectedSystemName) ||
      typeof row.snapshot_id !== 'string' || !row.snapshot_id ||
      typeof row.operation_id !== 'string' || !row.operation_id ||
      row.account_id !== account || typeof row.tenant_id !== 'string' ||
      row.scope_proof !== 'PROVEN_TENANT_ACCOUNT' || row.source !== 'lifecycle_checkpoint' ||
      row.state !== 'VERIFIED' || row.rollback_available !== true ||
      row.offer_withheld_reason !== null || current?.code !== 'CURRENT' ||
      current?.operationId !== row.operation_id) return null
  return {
    snapshotId: row.snapshot_id,
    operationId: row.operation_id,
    resourceArn: arn,
    systemName: row.system_name,
  }
}

export const IAM_RESTORE_UNAVAILABLE =
  'Exact current IAM operation and scoped checkpoint are unavailable. Review IAM History before restoring.'

function failure(payload: unknown, fallback: string): Error {
  const data = record(payload)
  const detail = record(data?.detail)
  return new Error(detail?.code || detail?.message || (typeof data?.detail === 'string' ? data.detail : null) || fallback)
}

/** Re-read the canonical server-scoped offer immediately before showing confirmation. */
export async function prepareIamRestore(target: IamRestoreTarget): Promise<IamRestoreTarget> {
  const query = new URLSearchParams({
    resource_arn: target.resourceArn,
    system_name: target.systemName,
    force_refresh: 'true',
  })
  const response = await fetch(`/api/proxy/iam-snapshots?${query}`, { cache: 'no-store' })
  const listing = await response.json().catch(() => null)
  if (!response.ok) throw failure(listing, 'Scoped IAM History is unavailable.')
  const selected = selectCurrentIamRestore(listing, target.resourceArn, target.systemName, {
    snapshotId: target.snapshotId,
    operationId: target.operationId,
  })
  if (selected.snapshotId !== target.snapshotId || selected.operationId !== target.operationId) {
    throw new Error(IAM_RESTORE_UNAVAILABLE)
  }
  return target
}

/** The proxy checks the offer again under the backend role lock, then reads durable History. */
export async function commitIamRestore(target: IamRestoreTarget): Promise<VerifiedIamRestore> {
  const response = await fetch('/api/proxy/iam-roles/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snapshot_id: target.snapshotId,
      operation_id: target.operationId,
      resource_arn: target.resourceArn,
      system_name: target.systemName,
    }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.success !== true || result?.code !== 'RESTORE_VERIFIED' ||
      result?.snapshot_id !== target.snapshotId ||
      result?.restores_operation_id !== target.operationId ||
      typeof result?.operation_id !== 'string' || !result.operation_id ||
      result?.history?.restoration?.validated !== true ||
      result?.history?.restoration?.restoredByOperationId !== result.operation_id) {
    throw failure(result, 'Restore is not verified. Inspect IAM History before retrying.')
  }
  return result as VerifiedIamRestore
}
