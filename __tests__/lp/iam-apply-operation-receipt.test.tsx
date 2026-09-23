import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { POST } from '@/app/api/proxy/cyntro/remediate/route'
import { isVerifiedIamApplyReceipt } from '@/components/iam-permission-analysis-modal'

const arn = 'arn:aws:iam::123456789012:role/payments-api'
const system = 'payments'
const role = 'payments-api'
const operationId = 'forward-456'
const snapshotId = 'checkpoint-123'

const applied = {
  success: true, blocked: false, role_name: role, system_name: system,
  operation_id: operationId, operation_recorded: true, operation_state: 'VERIFIED',
  snapshot_id: snapshotId, recovery_required: [], lease_release_error: null,
  permissions_removed: 2, before_total: 9, after_total: 7,
}
const current = {
  complete: true,
  scope: { tenant_id: 'tenant-a', account_id: '123456789012', resolved_by: 'server' },
  selectors: { resource_arn: arn, system_name: system },
  snapshots: [{
    snapshot_id: snapshotId, operation_id: operationId, resource_arn: arn,
    system_name: system, tenant_id: 'tenant-a', account_id: '123456789012',
    scope_proof: 'PROVEN_TENANT_ACCOUNT', source: 'lifecycle_checkpoint', state: 'VERIFIED',
    current: { code: 'CURRENT', operationId }, rollback_available: true,
    offer_withheld_reason: null,
  }],
}

function request(overrides: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/proxy/cyntro/remediate', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      role_name: role, identity_type: 'role', resource_arn: arn, system_name: system,
      permissions_to_remove: ['s3:GetObject', 's3:ListBucket'],
      dry_run: false, create_snapshot: true, plan_token: 'signed-plan', ...overrides,
    }),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('mounted IAM Apply receipt', () => {
  it('preserves the exact durable operation after a same-scope CURRENT checkpoint readback', async () => {
    const backend = vi.fn().mockResolvedValueOnce(Response.json(applied)).mockResolvedValueOnce(Response.json(current))
    vi.stubGlobal('fetch', backend)
    const response = await POST(request())
    const result = await response.json()
    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      success: true, operation_id: operationId, operation_recorded: true,
      operation_state: 'VERIFIED', snapshot_id: snapshotId, rollback_available: true,
      resource_arn: arn, system_name: system, role_name: role,
    })
    expect(isVerifiedIamApplyReceipt(result, arn, system, role)).toBe(true)
    expect(backend).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(backend.mock.calls[0][1]?.body))).toMatchObject({
      role_name: role, resource_arn: arn, system_name: system,
      plan_token: 'signed-plan', create_snapshot: true, dry_run: false,
    })
    const query = new URL(String(backend.mock.calls[1][0]))
    expect(query.searchParams.get('resource_arn')).toBe(arn)
    expect(query.searchParams.get('system_name')).toBe(system)
    expect(query.searchParams.get('force_refresh')).toBe('true')
  })

  it('keeps a typed backend refusal and never reads History after it', async () => {
    const backend = vi.fn().mockResolvedValue(Response.json({ detail: { code: 'IAM_PLAN_STALE', message: 'Preview again' } }, { status: 409 }))
    vi.stubGlobal('fetch', backend)
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ success: false, detail: { code: 'IAM_PLAN_STALE' } })
    expect(backend).toHaveBeenCalledTimes(1)
  })

  it('keeps a blocked decision as blocked, without presenting an Apply receipt', async () => {
    const backend = vi.fn().mockResolvedValue(Response.json({ success: false, blocked: true, block_reason: 'unsafe' }))
    vi.stubGlobal('fetch', backend)
    const result = await (await POST(request())).json()
    expect(result).toMatchObject({ success: false, blocked: true, block_reason: 'unsafe' })
    expect(isVerifiedIamApplyReceipt(result, arn, system, role)).toBe(false)
    expect(backend).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['missing operation', { ...applied, operation_id: null }],
    ['missing durable record', { ...applied, operation_recorded: false }],
    ['non-verified operation', { ...applied, operation_state: 'PENDING' }],
    ['missing checkpoint', { ...applied, snapshot_id: null }],
    ['mismatched system', { ...applied, system_name: 'other-system' }],
    ['failed apply', { ...applied, success: false }],
  ])('does not turn %s into success or guess counts', async (_name, backendResult) => {
    const backend = vi.fn().mockResolvedValue(Response.json(backendResult))
    vi.stubGlobal('fetch', backend)
    const response = await POST(request())
    const result = await response.json()
    expect(response.status).toBe(202)
    expect(result).toMatchObject({ success: false, outcome: 'UNKNOWN', retry_safe: false, code: 'APPLY_RECEIPT_UNVERIFIED' })
    expect(result.permissions_removed).toBeUndefined()
    expect(isVerifiedIamApplyReceipt(result, arn, system, role)).toBe(false)
    expect(backend).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['incomplete History', { ...current, complete: false }],
    ['foreign account', { ...current, scope: { ...current.scope, account_id: '999999999999' } }],
    ['different operation', { ...current, snapshots: [{ ...current.snapshots[0], operation_id: 'other' }] }],
    ['different checkpoint', { ...current, snapshots: [{ ...current.snapshots[0], snapshot_id: 'other' }] }],
    ['non-current checkpoint', { ...current, snapshots: [{ ...current.snapshots[0], current: { code: 'STALE', operationId } }] }],
    ['duplicate receipt', { ...current, snapshots: [current.snapshots[0], current.snapshots[0]] }],
  ])('withholds success when %s follows a successful backend write', async (_name, listing) => {
    const backend = vi.fn().mockResolvedValueOnce(Response.json(applied)).mockResolvedValueOnce(Response.json(listing))
    vi.stubGlobal('fetch', backend)
    const response = await POST(request())
    const result = await response.json()
    expect(response.status).toBe(202)
    expect(result).toMatchObject({ success: false, outcome: 'UNKNOWN', retry_safe: false, code: 'APPLY_HISTORY_UNVERIFIED', operation_id: operationId, snapshot_id: snapshotId })
    expect(isVerifiedIamApplyReceipt(result, arn, system, role)).toBe(false)
  })

  it('refuses missing exact scope before any mutation and refuses an incomplete modal 2xx', async () => {
    const backend = vi.fn()
    vi.stubGlobal('fetch', backend)
    const response = await POST(request({ resource_arn: 'arn:aws:iam::999999999999:role/other', create_snapshot: false }))
    expect(response.status).toBe(422)
    expect(backend).not.toHaveBeenCalled()
    expect(isVerifiedIamApplyReceipt({ success: true, rollback_available: true, resource_arn: arn }, arn, system, role)).toBe(false)
    expect(isVerifiedIamApplyReceipt({ ...applied, rollback_available: true, resource_arn: arn, operation_recorded: false }, arn, system, role)).toBe(false)
  })

  it('refuses string dry-run values that could bypass live receipt verification', async () => {
    const backend = vi.fn()
    vi.stubGlobal('fetch', backend)
    const response = await POST(request({ dry_run: 'false' }))
    expect(response.status).toBe(422)
    expect(backend).not.toHaveBeenCalled()
  })

  it('preserves the dry-run response without requiring a live operation or History', async () => {
    const backend = vi.fn().mockResolvedValue(Response.json({ success: true, permissions_removed: 0, message: 'Dry run' }))
    vi.stubGlobal('fetch', backend)
    const response = await POST(request({ dry_run: true, create_snapshot: false, resource_arn: null, system_name: null }))
    const result = await response.json()
    expect(response.status).toBe(200)
    expect(result).toMatchObject({ dry_run: true, success: true, permissions_removed: 0, message: 'Dry run' })
    expect(result.summary.reduction_percentage).toBeNull()
    expect(backend).toHaveBeenCalledTimes(1)
    const forwarded = JSON.parse(String(backend.mock.calls[0][1]?.body))
    expect(forwarded.plan_token).toBe('signed-plan')
    expect(forwarded).not.toHaveProperty('resource_arn')
    expect(forwarded).not.toHaveProperty('system_name')
  })
})
