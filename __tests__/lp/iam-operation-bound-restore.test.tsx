import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { GET as listSnapshots } from '@/app/api/proxy/iam-snapshots/route'
import { POST as restore } from '@/app/api/proxy/iam-roles/rollback/route'
import { selectCurrentIamRestore } from '@/components/iam-permission-analysis-modal'
import { isSameOriginMutation } from '@/lib/server/operator-session'

const arn = 'arn:aws:iam::123456789012:role/payments-api'
const system = 'payments'
const snapshotId = 'checkpoint-123'
const operationId = 'forward-456'
const restoreOperationId = 'restore-789'

const row = {
  snapshot_id: snapshotId, operation_id: operationId,
  resource_arn: arn, system_name: system, tenant_id: 'tenant-a', account_id: '123456789012',
  scope_proof: 'PROVEN_TENANT_ACCOUNT', source: 'lifecycle_checkpoint', state: 'VERIFIED',
  current: { code: 'CURRENT', operationId }, rollback_available: true,
  offer_withheld_reason: null, restoration: null,
}
const listing = {
  complete: true,
  scope: { tenant_id: 'tenant-a', account_id: '123456789012', resolved_by: 'server' },
  selectors: { resource_arn: arn, system_name: system },
  snapshots: [row],
}
const receipt = {
  success: true, code: 'RESTORE_VERIFIED', source: 'lifecycle_checkpoint',
  snapshot_id: snapshotId, operation_id: restoreOperationId,
  restores_operation_id: operationId, operation_recorded: true,
  commit_receipts: {
    operation_outcome: { operation_id: restoreOperationId, state: 'VERIFIED' },
    checkpoint_consumed: { status: 'ROLLED_BACK' },
  },
}
const after = {
  ...listing,
  snapshots: [{
    ...row, current: { code: 'RESTORED', operationId }, rollback_available: false,
    offer_withheld_reason: 'RESTORED',
    restoration: { validated: true, restoredByOperationId: restoreOperationId },
  }],
}

function request(body: unknown): NextRequest {
  const req = new NextRequest('http://localhost/api/proxy/iam-roles/rollback', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  req.headers.set('origin', 'http://localhost')
  expect(isSameOriginMutation(req)).toBe(true)
  return req
}

function exactBody() {
  return { snapshot_id: snapshotId, operation_id: operationId, resource_arn: arn, system_name: system }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('operation-bound IAM restore', () => {
  it('forwards exact ARN/system selectors and preserves the canonical envelope', async () => {
    const backend = vi.fn().mockResolvedValue(Response.json(listing))
    vi.stubGlobal('fetch', backend)
    const query = new URLSearchParams({ resource_arn: arn, system_name: system, force_refresh: 'true' })
    const response = await listSnapshots(new NextRequest(`http://localhost/api/proxy/iam-snapshots?${query}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(listing)
    const called = new URL(String(backend.mock.calls[0][0]))
    expect(called.searchParams.get('resource_arn')).toBe(arn)
    expect(called.searchParams.get('system_name')).toBe(system)
    expect(called.searchParams.has('role_name')).toBe(false)
  })

  it('preserves a typed backend refusal and never fabricates an empty list', async () => {
    const backend = vi.fn().mockResolvedValue(Response.json({ detail: { code: 'HISTORY_STORAGE_UNAVAILABLE' } }, { status: 503 }))
    vi.stubGlobal('fetch', backend)
    const response = await listSnapshots(new NextRequest(`http://localhost/api/proxy/iam-snapshots?resource_arn=${encodeURIComponent(arn)}&system_name=${system}`))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ detail: { code: 'HISTORY_STORAGE_UNAVAILABLE' } })
  })

  it('refuses role-name and missing operation selectors before any backend call', async () => {
    const backend = vi.fn()
    vi.stubGlobal('fetch', backend)
    for (const body of [{ role_name: 'payments-api' }, { ...exactBody(), operation_id: '' }]) {
      const response = await restore(request(body))
      expect(response.status).toBe(422)
      expect((await response.json()).success).toBe(false)
    }
    expect(backend).not.toHaveBeenCalled()
  })

  it.each([
    ['foreign account', { ...listing, scope: { ...listing.scope, account_id: '999999999999' } }],
    ['incomplete ledger', { ...listing, complete: false }],
    ['stale operation', { ...listing, snapshots: [{ ...row, current: { code: 'NOT_CURRENT' } }] }],
    ['ambiguous rows', { ...listing, snapshots: [row, row] }],
  ])('refuses %s before a restore POST', async (_name, candidate) => {
    const backend = vi.fn().mockResolvedValue(Response.json(candidate))
    vi.stubGlobal('fetch', backend)
    const response = await restore(request(exactBody()))
    expect(response.status).toBe(409)
    expect((await response.json()).detail.code).toBe('RESTORE_NOT_CURRENT')
    expect(backend).toHaveBeenCalledTimes(1)
  })

  it('uses the exact checkpoint POST and reports success only after a matching History receipt', async () => {
    const backend = vi.fn()
      .mockResolvedValueOnce(Response.json(listing))
      .mockResolvedValueOnce(Response.json(receipt))
      .mockResolvedValueOnce(Response.json(after))
    vi.stubGlobal('fetch', backend)
    const response = await restore(request(exactBody()))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      success: true, code: 'RESTORE_VERIFIED', snapshot_id: snapshotId,
      operation_id: restoreOperationId, restores_operation_id: operationId,
      history: { restoration: { validated: true, restoredByOperationId: restoreOperationId } },
    })
    expect(backend).toHaveBeenCalledTimes(3)
    expect(String(backend.mock.calls[1][0])).toMatch(new RegExp(`/api/snapshots/${snapshotId}/rollback$`))
    expect(backend.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{}' })
  })

  it.each([
    ['missing operation receipt', { ...receipt, commit_receipts: { checkpoint_consumed: { status: 'ROLLED_BACK' } } }, after],
    ['wrong forward operation', { ...receipt, restores_operation_id: 'another-operation' }, after],
    ['unvalidated History', receipt, { ...after, snapshots: [{ ...after.snapshots[0], restoration: { validated: false, restoredByOperationId: restoreOperationId } }] }],
  ])('withholds success for %s after the backend responded', async (_name, result, history) => {
    const backend = vi.fn()
      .mockResolvedValueOnce(Response.json(listing))
      .mockResolvedValueOnce(Response.json(result))
      .mockResolvedValueOnce(Response.json(history))
    vi.stubGlobal('fetch', backend)
    const response = await restore(request(exactBody()))
    expect((await response.json()).success).toBe(false)
    expect(backend).toHaveBeenCalledTimes(result === receipt ? 3 : 2)
  })

  it('selects only one CURRENT offered operation after reload, binding any apply receipt', () => {
    expect(selectCurrentIamRestore(listing, arn, system)).toEqual({ snapshotId, operationId })
    expect(selectCurrentIamRestore(listing, arn, system, { snapshotId, operationId })).toEqual({ snapshotId, operationId })
    expect(selectCurrentIamRestore(listing, arn, system, { snapshotId })).toEqual({ snapshotId, operationId })
    expect(() => selectCurrentIamRestore(listing, arn, system, { snapshotId, operationId: 'other' })).toThrow(/No unique CURRENT/)
    expect(() => selectCurrentIamRestore({ ...listing, complete: false }, arn, system)).toThrow(/incomplete/)
    expect(() => selectCurrentIamRestore({ ...listing, snapshots: [row, row] }, arn, system)).toThrow(/No unique CURRENT/)
  })
})
