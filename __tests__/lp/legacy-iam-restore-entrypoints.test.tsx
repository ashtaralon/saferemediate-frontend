import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/components/back-to-dashboard', () => ({ BackToDashboard: () => null }))
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/trust/use-trust-envelope', () => ({ fetchWithEnvelope: vi.fn() }))

import { GET as aggregateSnapshots } from '@/app/api/proxy/snapshots/route'
import RecoveryPage from '@/app/recovery/page'
import SnapshotRecoveryTab from '@/components/snapshots-recovery-tab'
import { RemediationTimeline } from '@/components/remediation-timeline'
import { fetchWithEnvelope } from '@/components/trust/use-trust-envelope'
import { POST as oldIamCheckpoint } from '@/app/api/proxy/iam-snapshots/[snapshotId]/rollback/route'
import { POST as oldUntypedCheckpoint } from '@/app/api/proxy/snapshots/[snapshotId]/rollback/route'
import { POST as eventRestore } from '@/app/api/proxy/remediation-history/events/[eventId]/rollback/route'
import {
  IAM_RESTORE_UNAVAILABLE, commitIamRestore, iamRestoreTarget, prepareIamRestore,
} from '@/lib/iam-restore-control'

const resourceArn = 'arn:aws:iam::123456789012:role/payments-api'
const snapshotId = 'checkpoint-123'
const operationId = 'forward-456'
const restoreOperationId = 'restore-789'
const row = {
  snapshot_id: snapshotId, operation_id: operationId,
  resource_arn: resourceArn, system_name: 'payments',
  tenant_id: 'tenant-a', account_id: '123456789012',
  scope_proof: 'PROVEN_TENANT_ACCOUNT', source: 'lifecycle_checkpoint',
  state: 'VERIFIED', rollback_available: true, offer_withheld_reason: null,
  current: { code: 'CURRENT', operationId }, resource_type: 'IAMRole',
}
const listing = {
  complete: true,
  scope: { tenant_id: 'tenant-a', account_id: '123456789012', resolved_by: 'server' },
  selectors: { resource_arn: resourceArn, system_name: 'payments' },
  snapshots: [row],
}
const verified = {
  success: true, code: 'RESTORE_VERIFIED', snapshot_id: snapshotId,
  operation_id: restoreOperationId, restores_operation_id: operationId,
  history: { current: { code: 'RESTORED' }, restoration: { validated: true, restoredByOperationId: restoreOperationId } },
}

function eventRequest(body: unknown): NextRequest {
  const request = new NextRequest('http://localhost/api/proxy/remediation-history/events/event-1/rollback', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  // The Vitest DOM Request shim drops constructor headers; set the browser
  // origin explicitly so the real same-origin guard remains exercised.
  request.headers.set('origin', 'http://localhost')
  return request
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('legacy IAM restore controls', () => {
  it('accepts only exact scoped CURRENT IAM rows and refuses names, wrong systems and withheld offers', () => {
    expect(iamRestoreTarget(row)).toEqual({ snapshotId, operationId, resourceArn, systemName: 'payments' })
    expect(iamRestoreTarget(row, 'another-system')).toBeNull()
    expect(iamRestoreTarget({ ...row, resource_arn: undefined, role_name: 'payments-api' })).toBeNull()
    expect(iamRestoreTarget({ ...row, operation_id: undefined })).toBeNull()
    expect(iamRestoreTarget({ ...row, account_id: '999999999999' })).toBeNull()
    expect(iamRestoreTarget({ ...row, rollback_available: false, current: { code: 'UNCERTAIN' } })).toBeNull()
    expect(IAM_RESTORE_UNAVAILABLE).toMatch(/unavailable/)
  })

  it('prepares only the clicked exact operation from a fresh scoped complete list', async () => {
    const backend = vi.fn().mockResolvedValue(Response.json(listing))
    vi.stubGlobal('fetch', backend)
    const target = iamRestoreTarget(row)!
    await expect(prepareIamRestore(target)).resolves.toEqual(target)
    const query = new URL(String(backend.mock.calls[0][0]), 'http://localhost').searchParams
    expect(query.get('resource_arn')).toBe(resourceArn)
    expect(query.get('system_name')).toBe('payments')
    expect(query.get('force_refresh')).toBe('true')
    expect(backend).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['incomplete', { ...listing, complete: false }],
    ['ambiguous', { ...listing, snapshots: [row, row] }],
    ['changed operation', { ...listing, snapshots: [{ ...row, operation_id: 'another', current: { code: 'CURRENT', operationId: 'another' } }] }],
  ])('refuses %s History before a mutation call', async (_label, body) => {
    const backend = vi.fn().mockResolvedValue(Response.json(body))
    vi.stubGlobal('fetch', backend)
    await expect(prepareIamRestore(iamRestoreTarget(row)!)).rejects.toThrow()
    expect(backend).toHaveBeenCalledTimes(1)
  })

  it('preserves typed History unavailability before mutation', async () => {
    const backend = vi.fn().mockResolvedValue(Response.json({ detail: { code: 'HISTORY_STORAGE_UNAVAILABLE' } }, { status: 503 }))
    vi.stubGlobal('fetch', backend)
    await expect(prepareIamRestore(iamRestoreTarget(row)!)).rejects.toThrow('HISTORY_STORAGE_UNAVAILABLE')
    expect(backend).toHaveBeenCalledTimes(1)
  })

  it('posts the exact pair and displays only the matching verified History receipt', async () => {
    const backend = vi.fn().mockResolvedValue(Response.json(verified))
    vi.stubGlobal('fetch', backend)
    await expect(commitIamRestore(iamRestoreTarget(row)!)).resolves.toMatchObject(verified)
    expect(backend.mock.calls[0][0]).toBe('/api/proxy/iam-roles/rollback')
    expect(JSON.parse(backend.mock.calls[0][1].body)).toEqual({
      snapshot_id: snapshotId, operation_id: operationId,
      resource_arn: resourceArn, system_name: 'payments',
    })
  })

  it.each([
    ['wrong forward operation', { ...verified, restores_operation_id: 'other' }],
    ['wrong History restore', { ...verified, history: { restoration: { validated: true, restoredByOperationId: 'other' } } }],
    ['unverified response', { success: true }],
  ])('never reports success for %s', async (_label, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
    await expect(commitIamRestore(iamRestoreTarget(row)!)).rejects.toThrow(/not verified/)
  })

  it('closes both direct checkpoint proxy bypasses without a backend POST', async () => {
    const backend = vi.fn()
    vi.stubGlobal('fetch', backend)
    expect((await oldIamCheckpoint()).status).toBe(422)
    expect((await oldUntypedCheckpoint()).status).toBe(422)
    expect(backend).not.toHaveBeenCalled()
  })

  it.each(['IAMRole', 'Unknown'])('refuses %s event rollback before a backend mutation', async (resourceType) => {
    const backend = vi.fn().mockResolvedValue(Response.json({ resource_type: resourceType }))
    vi.stubGlobal('fetch', backend)
    const response = await eventRestore(eventRequest({ approved_by: 'tester' }), { params: Promise.resolve({ eventId: 'event-1' }) })
    expect(response.status).toBe(422)
    expect(backend).toHaveBeenCalledTimes(1)
  })

  it('preserves a typed event lookup failure and performs no mutation', async () => {
    const backend = vi.fn().mockResolvedValue(Response.json({ detail: { code: 'EVENT_UNAVAILABLE' } }, { status: 503 }))
    vi.stubGlobal('fetch', backend)
    const response = await eventRestore(eventRequest({ approved_by: 'tester' }), { params: Promise.resolve({ eventId: 'event-1' }) })
    expect(response.status).toBe(503)
    expect((await response.json()).detail.code).toBe('EVENT_UNAVAILABLE')
    expect(backend).toHaveBeenCalledTimes(1)
  })

  it('refuses a cross-origin event restore before any backend read', async () => {
    const backend = vi.fn()
    vi.stubGlobal('fetch', backend)
    const request = eventRequest({ approved_by: 'tester' })
    request.headers.set('origin', 'https://other.example')
    const response = await eventRestore(request, { params: Promise.resolve({ eventId: 'event-1' }) })
    expect(response.status).toBe(403)
    expect(backend).not.toHaveBeenCalled()
  })

  it.each(['SecurityGroup', 'S3Bucket'])('preserves the %s event route after backend classification', async (resourceType) => {
    const backend = vi.fn()
      .mockResolvedValueOnce(Response.json({ resource_type: resourceType }))
      .mockResolvedValueOnce(Response.json({ success: true, resource_type: resourceType }))
    vi.stubGlobal('fetch', backend)
    const response = await eventRestore(eventRequest({ approved_by: 'tester' }), { params: Promise.resolve({ eventId: 'event-1' }) })
    expect(response.status).toBe(200)
    expect((await response.json()).resource_type).toBe(resourceType)
    expect(backend).toHaveBeenCalledTimes(2)
    expect(String(backend.mock.calls[1][0])).toMatch(/\/events\/event-1\/rollback$/)
    expect(JSON.parse(backend.mock.calls[1][1].body)).toEqual({ approved_by: 'tester' })
  })

  it('retains canonical IAM identity over a legacy duplicate without inventing RESTORED', async () => {
    const canonical = { ...row, rollback_available: false, offer_withheld_reason: 'UNCERTAIN', current: { code: 'UNCERTAIN', operationId } }
    const backend = vi.fn().mockImplementation((url: string) => {
      const path = String(url)
      if (path.includes('/api/remediation/snapshots')) {
        return Promise.resolve(Response.json({ snapshots: [{ snapshot_id: snapshotId, resource_type: 'IAMRole', rollback_available: true, original_role: 'payments-api' }] }))
      }
      if (path.includes('/api/snapshots?')) return Promise.resolve(Response.json({ complete: true, snapshots: [canonical] }))
      return Promise.resolve(Response.json({ snapshots: [], checkpoints: [] }))
    })
    vi.stubGlobal('fetch', backend)
    const response = await aggregateSnapshots(new NextRequest('http://localhost/api/proxy/snapshots'))
    const payload = await response.json()
    expect(payload.snapshots).toHaveLength(1)
    expect(payload.snapshots[0]).toMatchObject({
      snapshot_id: snapshotId, resource_arn: resourceArn, operation_id: operationId,
      rollback_available: false, status: 'UNAVAILABLE', source: 'lifecycle_checkpoint',
    })
    expect(payload.iam_source).toEqual({ available: true, code: null })
  })

  it('keeps SG results while naming IAM source unavailability', async () => {
    const backend = vi.fn().mockImplementation((url: string) => {
      const path = String(url)
      if (path.includes('/api/remediation/snapshots')) return Promise.resolve(Response.json({ snapshots: [{ snapshot_id: 'sg-1', resource_type: 'SecurityGroup' }] }))
      if (path.includes('/api/snapshots?')) return Promise.resolve(Response.json({ detail: { code: 'HISTORY_STORAGE_UNAVAILABLE' } }, { status: 503 }))
      return Promise.resolve(Response.json({ snapshots: [], checkpoints: [] }))
    })
    vi.stubGlobal('fetch', backend)
    const response = await aggregateSnapshots(new NextRequest('http://localhost/api/proxy/snapshots'))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.snapshots).toMatchObject([{ snapshot_id: 'sg-1', resource_type: 'SecurityGroup' }])
    expect(payload.iam_source).toEqual({ available: false, code: 'IAM_HISTORY_UNAVAILABLE' })
  })

  it('renders legacy IAM restore unavailable while retaining SG and S3 controls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      snapshots: [
        { snapshot_id: 'IAMRole-old', id: 'IAMRole-old', resource_type: 'IAMRole', finding_id: 'payments-api' },
        { snapshot_id: 'S3Bucket-one', id: 'S3Bucket-one', resource_type: 'S3Bucket', finding_id: 'bucket-one' },
        { snapshot_id: 'sg-one', id: 'sg-one', resource_type: 'SecurityGroup', finding_id: 'sg-one' },
      ],
      iam_source: { available: true, code: null },
    })))
    render(<RecoveryPage />)
    expect(await screen.findByRole('button', { name: 'IAM restore unavailable' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Restore' })).toHaveLength(2)
    for (const button of screen.getAllByRole('button', { name: 'Restore' })) expect(button).toBeEnabled()
  })

  it('takes the recovery screen through exact preflight and verified History before success', async () => {
    const backend = vi.fn().mockImplementation((url: string) => {
      const path = String(url)
      if (path === '/api/proxy/snapshots') return Promise.resolve(Response.json({ snapshots: [row], iam_source: { available: true, code: null } }))
      if (path.startsWith('/api/proxy/iam-snapshots?')) return Promise.resolve(Response.json(listing))
      if (path === '/api/proxy/iam-roles/rollback') return Promise.resolve(Response.json(verified))
      throw new Error(`Unexpected URL ${path}`)
    })
    vi.stubGlobal('fetch', backend)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<RecoveryPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Review IAM restore' }))
    await waitFor(() => expect(backend.mock.calls.some(call => call[0] === '/api/proxy/iam-roles/rollback')).toBe(true))
    const restoreCall = backend.mock.calls.find(call => call[0] === '/api/proxy/iam-roles/rollback')!
    expect(JSON.parse(restoreCall[1].body)).toEqual({
      snapshot_id: snapshotId, operation_id: operationId, resource_arn: resourceArn, system_name: 'payments',
    })
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(operationId))
  })

  it('disables a legacy IAM checkpoint in the snapshot recovery tab', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (String(url) === '/api/proxy/snapshots') return Promise.resolve(Response.json({ snapshots: [], iam_source: { available: true, code: null } }))
      if (String(url) === '/api/proxy/iam-snapshots') return Promise.resolve(Response.json([{ snapshot_id: 'IAMRole-old', role_name: 'payments-api' }]))
      throw new Error(`Unexpected URL ${url}`)
    }))
    render(<SnapshotRecoveryTab />)
    expect(await screen.findByRole('button', { name: 'IAM restore unavailable' })).toBeDisabled()
    expect(screen.getByText(IAM_RESTORE_UNAVAILABLE)).toBeInTheDocument()
  })

  it('takes snapshot recovery through the exact operation and preserves the verified receipt', async () => {
    const backend = vi.fn().mockImplementation((url: string) => {
      const path = String(url)
      if (path === '/api/proxy/snapshots') return Promise.resolve(Response.json({ snapshots: [], iam_source: { available: true, code: null } }))
      if (path === '/api/proxy/iam-snapshots') return Promise.resolve(Response.json([row]))
      if (path.startsWith('/api/proxy/iam-snapshots?')) return Promise.resolve(Response.json(listing))
      if (path === '/api/proxy/iam-roles/rollback') return Promise.resolve(Response.json(verified))
      throw new Error(`Unexpected URL ${path}`)
    })
    vi.stubGlobal('fetch', backend)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<SnapshotRecoveryTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'Review IAM restore' }))
    await waitFor(() => expect(backend.mock.calls.some(call => call[0] === '/api/proxy/iam-roles/rollback')).toBe(true))
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(restoreOperationId))
  })

  it('shows an old IAM timeline event as unavailable rather than offering legacy rollback', async () => {
    vi.mocked(fetchWithEnvelope).mockResolvedValue({
      result: { events: [{
        event_id: 'legacy-event', timestamp: new Date().toISOString(), resource_type: 'IAMRole',
        resource_id: 'payments-api', action_type: 'PERMISSION_REMOVAL', status: 'completed',
        confidence_score: null, approved_by: 'operator', rollback_available: true,
        metadata: {}, before_state: {}, after_state: {}, summary: 'Legacy IAM change',
        snapshot_id: 'IAMRole-old', system_name: 'payments',
      }], chart_data: [] }, provenance: null,
    } as any)
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (String(url).startsWith('/api/proxy/snapshots?')) return Promise.resolve(Response.json({ snapshots: [], iam_source: { available: true, code: null } }))
      if (String(url).startsWith('/api/proxy/iam-snapshots?')) return Promise.resolve(Response.json([]))
      throw new Error(`Unexpected URL ${url}`)
    }))
    render(<RemediationTimeline systemId="payments" />)
    fireEvent.click(await screen.findByText('Legacy IAM change'))
    expect(await screen.findByText(IAM_RESTORE_UNAVAILABLE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore All' })).not.toBeInTheDocument()
  })

  it('binds a timeline event to its canonical checkpoint before offering restore', async () => {
    vi.mocked(fetchWithEnvelope).mockResolvedValue({
      result: { events: [{
        event_id: 'graph-event', timestamp: new Date().toISOString(), resource_type: 'IAMRole',
        resource_id: 'payments-api', action_type: 'PERMISSION_REMOVAL', status: 'completed',
        confidence_score: null, approved_by: 'operator', rollback_available: true,
        metadata: {}, before_state: {}, after_state: {}, summary: 'Canonical IAM change',
        snapshot_id: snapshotId, system_name: 'payments',
      }], chart_data: [] }, provenance: null,
    } as any)
    const backend = vi.fn().mockImplementation((url: string) => {
      const path = String(url)
      if (path.startsWith('/api/proxy/snapshots?')) return Promise.resolve(Response.json({ snapshots: [], iam_source: { available: true, code: null } }))
      if (path === '/api/proxy/iam-snapshots?force_refresh=true') return Promise.resolve(Response.json([{ ...row, created_at: new Date().toISOString() }]))
      if (path.startsWith('/api/proxy/iam-snapshots?')) return Promise.resolve(Response.json(listing))
      if (path === '/api/proxy/iam-roles/rollback') return Promise.resolve(Response.json(verified))
      throw new Error(`Unexpected URL ${path}`)
    })
    vi.stubGlobal('fetch', backend)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<RemediationTimeline systemId="payments" />)
    fireEvent.click(await screen.findByText('Canonical IAM change'))
    fireEvent.click(await screen.findByRole('button', { name: 'Review IAM restore' }))
    await waitFor(() => expect(backend.mock.calls.some(call => call[0] === '/api/proxy/iam-roles/rollback')).toBe(true))
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(restoreOperationId))
  })
})
