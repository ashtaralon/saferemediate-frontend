/// <reference types="vitest/globals" />
/**
 * Truthful LP preview fields and type dispatch.
 *
 * 1. The Resource Risk drawer dispatches Preview by the row's REAL type. A type with no drawer Preview (RDSInstance,
 *    S3Bucket, ...) is refused by name and sends nothing; it used to be posted to the IAM simulate-fix as `IAMRole`.
 * 2. The drawer's Impact tab asserts no continuity and computes no reduction from unverified counts.
 * 3. Attribution-unverified actions (`attribution_unverified_permissions`) are kept, listed separately and never
 *    counted as removal candidates; an absent field makes the candidate list "unverified", never verified.
 * 4. Rollback readiness is the backend's tri-state (42f7b16b); an absent status is unknown, never proven.
 *
 * Bodies: the simulate-fix Preview and Review are the captured install-chain bodies
 * (fixtures/lp-review-preview-install-chain.json); rollback_ready fields are copied from real simulate-fix responses at
 * 838f7c26 with product-written ledger rows (fixtures/simulate-fix-rollback-ready-838f7c26.json); the attribution bodies are real simulate-fix responses from the
 * backend attribution lane (fixtures/simulate-fix-attribution-unverified-32ced541.json). Edits to a captured body are
 * marked where they are made.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import full from '../fixtures/lp-review-preview-install-chain.json'
import rollbackShapes from '../fixtures/simulate-fix-rollback-ready-838f7c26.json'
import attributionCapture from '../fixtures/simulate-fix-attribution-unverified-32ced541.json'
import LeastPrivilegeTab, { ImpactTab, lpImpactCountsVerified } from '@/components/LeastPrivilegeTab'
import { IAMSimulateFixModal } from '@/components/IAMSimulateFixModal'
import { IAMPermissionAnalysisModal, IamRemediationAvailability, RemovalSafetyPanel } from '@/components/iam-permission-analysis-modal'
import { DecisionAuthorityPanel } from '@/components/lp-decision-authority-panel'
import { LP_DRAWER_PREVIEW_SUPPORT, resolveLPDrawerPreview } from '@/lib/lp-review-routing'
import { requestLPDrawerPreview } from '@/lib/lp-drawer-preview'
import { normalizeLPResponse } from '@/lib/lp-normalize'
import { readAttributionCheck, remediationStateView, rollbackReadyView } from '@/lib/lp-preview-truth'
import { previewEvidenceNeeds } from '@/lib/resource-risk-preview-summary'
import type { SimulateFixResponse } from '@/lib/types'

vi.mock('@/lib/account-scope-context', () => ({
  useAccountScope: () => ({ customerId: 'test-customer', groupId: 'all', accountId: 'all', region: 'all' }),
  useOptionalAccountScope: () => null,
}))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/back-to-dashboard', () => ({ BackToDashboard: () => null }))

// unified/lp/capabilities.py CAPABILITIES, as ResourceRiskCapability.to_wire() sends them (42f7b16b).
const BACKEND_CAPABILITIES = [
  { resource_type: 'IAMRole', display_name: 'IAM Roles', family: 'Identity', analyzers: ['iam_role'], required_evidence: ['IAM configuration', 'CloudTrail'], preview_supported: true, apply_supported: false, rollback_supported: false },
  { resource_type: 'SecurityGroup', display_name: 'Security Groups', family: 'Network', analyzers: ['security_group', 'sg_public_ingress'], required_evidence: ['Security group rules', 'VPC Flow Logs'], preview_supported: true, apply_supported: false, rollback_supported: false },
  { resource_type: 'S3Bucket', display_name: 'S3 Buckets', family: 'Data', analyzers: ['s3_bucket'], required_evidence: ['S3 configuration', 'CloudTrail data events'], preview_supported: true, apply_supported: false, rollback_supported: false },
  { resource_type: 'RDSInstance', display_name: 'RDS Instances', family: 'Data', analyzers: ['rds_instance'], required_evidence: ['RDS configuration'], preview_supported: false, apply_supported: false, rollback_supported: false },
  { resource_type: 'LambdaFunction', display_name: 'Lambda Functions', family: 'Compute', analyzers: ['lambda_function'], required_evidence: ['Lambda configuration'], preview_supported: false, apply_supported: false, rollback_supported: false },
]

type Call = { url: string; method: string; body: unknown }

function spyFetch(route: (url: string) => unknown = () => ({})): Call[] {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: String(init?.method ?? 'GET').toUpperCase(), body: init?.body ? JSON.parse(String(init.body)) : null })
    const body = route(url)
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response
  }))
  return calls
}

const simulateFixCalls = (calls: Call[]) => calls.filter((c) => c.url.includes('/least-privilege/simulate-fix'))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── 1. type dispatch ─────────────────────────────────────────────────────────

describe('drawer Preview dispatch by real resource type', () => {
  it('one table: only IAMRole and SecurityGroup have a drawer Preview', () => {
    expect(Object.keys(LP_DRAWER_PREVIEW_SUPPORT).sort()).toEqual(['iamrole', 'securitygroup'])
    expect(resolveLPDrawerPreview('IAMRole', BACKEND_CAPABILITIES)).toMatchObject({ supported: true, preview: 'iam-simulate-fix' })
    expect(resolveLPDrawerPreview('SecurityGroup', BACKEND_CAPABILITIES)).toMatchObject({ supported: true, preview: 'sg-remediation-simulate' })
    for (const type of ['RDSInstance', 'LambdaFunction', 'EC2Instance', 'NetworkACL', 'S3Bucket', 'SomethingNew']) {
      expect(resolveLPDrawerPreview(type, BACKEND_CAPABILITIES)).toMatchObject({ supported: false, resourceType: type })
    }
  })

  it('the backend capability can only narrow the table', () => {
    const iamOff = BACKEND_CAPABILITIES.map((c) => (c.resource_type === 'IAMRole' ? { ...c, preview_supported: false } : c))
    expect(resolveLPDrawerPreview('IAMRole', iamOff)).toMatchObject({ supported: false, reason: 'BACKEND_PREVIEW_UNSUPPORTED' })
    // S3Bucket is preview_supported by the backend (through the S3 workflow) but the drawer has none.
    expect(resolveLPDrawerPreview('S3Bucket', BACKEND_CAPABILITIES)).toMatchObject({ supported: false, reason: 'NO_DRAWER_PREVIEW' })
    // No capabilities sent: the table alone decides.
    expect(resolveLPDrawerPreview('IAMRole', [])).toMatchObject({ supported: true })
  })

  const context = { capabilities: BACKEND_CAPABILITIES, systemName: 'fixture-shop', sgGapAnalysis: async () => ({ rules_analysis: [] }) }

  it('an RDS row and an S3 row send no request at all', async () => {
    const calls = spyFetch()
    for (const [resourceType, resourceName] of [['RDSInstance', 'orders-db'], ['S3Bucket', 'fixture-shop-assets']]) {
      const outcome = await requestLPDrawerPreview({ id: resourceName, resourceType, resourceName, findingId: 'f-1' }, context)
      expect(outcome).toMatchObject({ kind: 'unsupported', dispatch: { resourceType } })
    }
    expect(calls).toEqual([])
  })

  it('an IAMRole row still posts the unchanged simulate-fix body (positive control for the spy)', async () => {
    const calls = spyFetch()
    const outcome = await requestLPDrawerPreview({
      id: 'role-1', resourceType: 'IAMRole', resourceName: 'fixture-web-role',
      resourceArn: 'arn:aws:iam::111111111111:role/fixture-web-role', findingId: 'finding-9',
    }, context)
    expect(outcome.kind).toBe('iam_role')
    expect(simulateFixCalls(calls)).toEqual([{
      url: '/api/proxy/least-privilege/simulate-fix', method: 'POST',
      body: { resource_type: 'IAMRole', resource_id: 'fixture-web-role', system_name: 'fixture-shop', finding_id: 'finding-9' },
    }])
  })

  it('a SecurityGroup row goes to the SG simulate, never the IAM one', async () => {
    const calls = spyFetch()
    const outcome = await requestLPDrawerPreview({ id: 'sg-0abc123', resourceType: 'SecurityGroup', resourceName: 'web-sg' }, context)
    expect(outcome.kind).toBe('security_group')
    expect(calls.map((c) => c.url)).toEqual(['/api/proxy/remediation/simulate'])
    expect(simulateFixCalls(calls)).toEqual([])
  })
})

// The same row shape the tab renders elsewhere (lp/iam-generation-unknown-row.test.tsx), typed as RDS.
const rdsRow: Record<string, unknown> = {
  id: 'rds-1', resourceType: 'RDSInstance', resourceName: 'orders-db',
  resourceArn: 'arn:aws:rds:eu-west-1:123456789012:db:orders-db',
  severity: 'HIGH', decision_canonical: 'MANUAL_REVIEW', counts_toward_summary: true,
  allowedCount: 29, usedCount: 11, gapCount: 18, gapPercent: 62, lpScore: 38, usage_measured: true,
  description: '18 not observed of 29 allowed',
  unusedList: ['rds:DeleteDBInstance'], usedList: ['rds:DescribeDBInstances'],
}

describe('the mounted drawer for an RDS row', () => {
  async function openRdsDrawer(): Promise<Call[]> {
    const calls = spyFetch(() => ({
      serve_state: 'READY', analysis_complete: true, failedAnalyzers: [],
      resources: [rdsRow], summary: {}, capabilities: BACKEND_CAPABILITIES,
    }))
    render(<LeastPrivilegeTab />)
    await screen.findByText('orders-db')
    // The row's action button (decisionActionLabel: MANUAL_REVIEW -> "Review") opens the review surface.
    const action = screen.getAllByRole('button', { name: 'Review' })
      .find((button) => button.parentElement?.parentElement?.textContent?.includes('orders-db'))
    expect(action).toBeDefined()
    fireEvent.click(action as HTMLElement)
    await screen.findByTestId('lp-drawer-simulate')
    return calls
  }

  it('says Preview is not supported and sends no simulate request, even through the handler itself', async () => {
    const calls = await openRdsDrawer()
    expect(calls.length).toBeGreaterThan(0) // the spy sees the tab's own requests
    expect((await screen.findByTestId('lp-drawer-preview-unsupported')).textContent).toBe('Preview not supported for RDSInstance')
    const simulate = screen.getByTestId('lp-drawer-simulate') as HTMLButtonElement
    expect(simulate.disabled).toBe(true)
    const props = Object.entries(simulate).find(([key]) => key.startsWith('__reactProps'))?.[1] as { onClick: () => unknown }
    await act(async () => { await props.onClick() })
    fireEvent.click(simulate)
    await waitFor(() => expect(simulateFixCalls(calls)).toEqual([]))
    expect(calls.filter((c) => c.method === 'POST')).toEqual([])
  })

  it('Impact tab: no continuity claim, counts unverified, no reduction percent', async () => {
    await openRdsDrawer()
    fireEvent.click(screen.getByText('Impact'))
    const continuity = await screen.findByTestId('lp-impact-continuity')
    expect(continuity.textContent).toContain('has not been assessed')
    expect(screen.queryByText(/No service disruption expected/)).toBeNull()
    expect(screen.queryByText(/All active workflows will continue/)).toBeNull()
    expect(screen.getByTestId('lp-impact-share').textContent).toBe('Reduction not computed — usage counts for this resource are not verified.')
    expect(screen.queryByText(/62%/)).toBeNull()
    expect(screen.getAllByTestId('lp-impact-unverified').length).toBe(2)
    expect(screen.getByText('rds:DeleteDBInstance')).toBeInTheDocument() // the list is still shown, as candidates
  })
})

describe('Impact tab counts follow the IAM usage generation', () => {
  const role = {
    id: 'role-1', resourceType: 'IAMRole', resourceName: 'generation-test-role',
    resourceArn: 'arn:aws:iam::123456789012:role/generation-test-role',
    severity: 'HIGH', decision_canonical: 'MANUAL_REVIEW', counts_toward_summary: true,
    allowedCount: 29, usedCount: 11, gapCount: 18, gapPercent: 62, lpScore: 38, usage_measured: true,
    unusedList: ['iam:PassRole'], usedList: ['s3:GetObject'],
  }
  const generation = { known: true, active_generation_id: 'generation-1', negative_authority_permitted: true }

  it('a verified generation shows the share (positive control) and still claims no continuity', () => {
    const [row] = normalizeLPResponse({ readiness_by_lane: { cloudtrail_iam_usage: { generation } }, resources: [role] }).resources
    expect(row.usageGenerationVerified).toBe(true)
    render(<ImpactTab resource={row as never} />)
    expect(screen.getByTestId('lp-impact-share').textContent).toContain('62% of allowed permissions')
    expect(screen.queryByTestId('lp-impact-unverified')).toBeNull()
    expect(screen.queryByText(/No service disruption expected/)).toBeNull()
  })

  it('an absent generation is not a verification', () => {
    const [row] = normalizeLPResponse({ resources: [role] }).resources
    expect(row.usageGenerationVerified).toBeUndefined()
    expect(lpImpactCountsVerified(row as never)).toBe(false)
    render(<ImpactTab resource={row as never} />)
    expect(screen.getByTestId('lp-impact-share').textContent).toContain('Reduction not computed')
    expect(screen.queryByText(/62%/)).toBeNull()
    expect(screen.getAllByTestId('lp-impact-unverified').length).toBe(2)
  })
})

// ─── 3/4. simulate-fix: attribution and rollback-ready ───────────────────────

// Captured simulate-fix bodies from the backend attribution lane (32ced5417): see `_producer` in the fixture.
// mixed: s3:GetObject (HeadObject-only use) and dynamodb:PartiQLSelect held, s3:GetObjectAcl the control.
const mixed = attributionCapture.mixed as unknown as SimulateFixResponse & Record<string, any>
const allHeld = attributionCapture.all_held as unknown as SimulateFixResponse & Record<string, any>
const clone = <T,>(body: T): T => JSON.parse(JSON.stringify(body))
const withoutAttributionField = (body: Record<string, any>) => {
  const copy = clone(body)
  delete copy.attribution_unverified_permissions
  return copy as SimulateFixResponse
}

function preview(overrides: { safety?: Record<string, unknown>; simulation?: Record<string, unknown>; attribution?: unknown } = {}): SimulateFixResponse {
  const base = JSON.parse(JSON.stringify(full.preview))
  const body = {
    ...base,
    safety: { ...base.safety, ...(overrides.safety ?? {}) },
    simulation: { ...base.simulation, ...(overrides.simulation ?? {}) },
  }
  if (overrides.attribution !== undefined) body.attribution_unverified_permissions = overrides.attribution
  return body as SimulateFixResponse
}

describe('rollback-ready tri-state', () => {
  it('reads the backend status; an absent or null status is unknown, never proven', () => {
    expect(rollbackReadyView(rollbackShapes.proven).status).toBe('proven')
    expect(rollbackReadyView(rollbackShapes.unverified).status).toBe('unverified')
    expect(rollbackReadyView(rollbackShapes.unknown)).toMatchObject({ status: 'unknown', reasonCode: 'ROLLBACK_EVIDENCE_UNAVAILABLE' })
    // The captured pre-42f7b16b Preview carries no rollback_ready_status at all.
    expect(full.preview.safety).not.toHaveProperty('rollback_ready_status')
    expect(rollbackReadyView(full.preview.safety).status).toBe('unknown')
    // An older backend's rollback_available=true alone is not proof.
    expect(rollbackReadyView({ rollback_available: true })).toMatchObject({ status: 'unknown', reasonCode: 'ROLLBACK_READY_NOT_REPORTED' })
  })

  it('the route-captured states read as the backend classified them', () => {
    expect(rollbackReadyView(rollbackShapes.readback_unproven)).toMatchObject({ status: 'unverified', reasonCode: 'RESTORE_READBACK_UNPROVEN' })
    expect(rollbackReadyView(rollbackShapes.proven)).toMatchObject({ status: 'proven', reasonCode: 'SAME_SCOPE_RESTORE_VERIFIED' })
    expect(rollbackShapes.proven.rollback_ready.snapshot_id).toMatch(/^IAMRole-test-role-/)
  })

  it('the Change status needs list states unknown as unknown, never as absence, and ignores a bare true', () => {
    const need = (safety: Record<string, unknown>) =>
      previewEvidenceNeeds({ ...full.preview.safety, ...safety } as never).find((n) => n.id === 'rollback')
    expect(need(rollbackShapes.proven)).toBeUndefined()
    expect(need(rollbackShapes.unknown)?.label).toBe('Rollback readiness unknown (ROLLBACK_EVIDENCE_UNAVAILABLE)')
    expect(need(rollbackShapes.unverified)?.label).toBe('Rollback readiness unverified (NO_SAME_SCOPE_RESTORE_POINT)')
    // An older backend's default rollback_available=true no longer suppresses the need.
    expect(need({ rollback_available: true })?.label).toBe('Rollback readiness unknown (ROLLBACK_READY_NOT_REPORTED)')
    for (const state of [rollbackShapes.unknown, rollbackShapes.unverified]) {
      expect(need(state)?.label).not.toMatch(/not ready/i)
    }
  })

  it('RESTORE_READBACK_UNPROVEN reads unverified; an unrecognised reason code is shown verbatim as unknown', () => {
    const readbackUnproven = (status: string) => ({
      rollback_available: status === 'proven', rollback_ready_status: status,
      rollback_ready: { ...rollbackShapes.proven.rollback_ready, status, reason_code: 'RESTORE_READBACK_UNPROVEN' },
    })
    // RESTORE_READBACK_UNPROVEN is a real `unverified` code at 838f7c26: mapped explicitly, never proven.
    expect(rollbackReadyView(readbackUnproven('proven'))).toMatchObject({ status: 'unverified', reasonCode: 'RESTORE_READBACK_UNPROVEN' })
    expect(rollbackReadyView(readbackUnproven('unverified'))).toMatchObject({ status: 'unverified', reasonCode: 'RESTORE_READBACK_UNPROVEN' })
    // A code nobody knows is shown verbatim as unknown.
    const unknownCode = { ...readbackUnproven('proven'), rollback_ready: { ...readbackUnproven('proven').rollback_ready, reason_code: 'SOMETHING_NEW' } }
    expect(rollbackReadyView(unknownCode)).toMatchObject({ status: 'unknown', reasonCode: 'SOMETHING_NEW' })
    expect(rollbackReadyView(unknownCode).sentence).toContain('(SOMETHING_NEW)')
    // Proven says what it proves: a past restore, not a future restore point, and no drift check.
    const proven = rollbackReadyView(rollbackShapes.proven).sentence
    expect(proven).toContain('past restore on this exact role was verified with a readback')
    expect(proven).toContain('does not check drift')
    expect(proven).not.toMatch(/will be created/)
  })

  it('unknown is rendered as unknown with its reason, never as an absence', async () => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} result={preview({ safety: rollbackShapes.unknown })} applyDisabled />)
    const badge = screen.getByTestId('simulate-fix-rollback-ready')
    expect(badge.textContent).toBe('Unknown')
    expect(badge.getAttribute('style') ?? '').not.toMatch(/#EF4444|239, 68, 68/i) // not the red "Not Available" colour
    fireEvent.click(screen.getByText('Impact'))
    const detail = await screen.findByTestId('simulate-fix-rollback-ready-detail')
    expect(detail.textContent).toContain('ROLLBACK_EVIDENCE_UNAVAILABLE')
    expect(document.body.textContent).not.toMatch(/Not Available|cannot be guaranteed/)
  })

  it.each([
    ['proven', 'Proven', 'SAME_SCOPE_RESTORE_VERIFIED'],
    ['unverified', 'Unverified', 'NO_SAME_SCOPE_RESTORE_POINT'],
    ['unknown', 'Unknown', 'ROLLBACK_EVIDENCE_UNAVAILABLE'],
  ] as const)('IAMSimulateFixModal renders %s with its reason', async (state, label, reason) => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} result={preview({ safety: rollbackShapes[state] })} applyDisabled />)
    expect(screen.getByTestId('simulate-fix-rollback-ready').textContent).toBe(label)
    fireEvent.click(screen.getByText('Impact'))
    expect((await screen.findByTestId('simulate-fix-rollback-ready-detail')).textContent).toContain(reason)
    expect(screen.queryByText('Available')).toBeNull()
  })

  it('IAMSimulateFixModal shows the captured null status as Unknown, not Available', () => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} result={preview({ safety: { rollback_available: true } })} applyDisabled />)
    expect(screen.getByTestId('simulate-fix-rollback-ready').textContent).toBe('Unknown')
  })
})

describe('IAMSimulateFixModal on the captured attribution body', () => {
  it('the capture is the defect case: the scorer still marks the held actions REMOVAL_CANDIDATE', () => {
    expect(mixed.attribution_unverified_permissions).toEqual([
      { action: 'dynamodb:PartiQLSelect', reason_code: 'EVENT_ATTRIBUTION_UNKNOWN', unmapped_events: [] },
      { action: 's3:GetObject', reason_code: 'EVENT_ATTRIBUTION_INCOMPLETE', unmapped_events: ['HeadObject', 'SelectObjectContent'] },
    ])
    const scored = mixed.removal_safety.permissions
      .filter((p: { disposition: string }) => p.disposition === 'REMOVAL_CANDIDATE').map((p: { permission: string }) => p.permission)
    expect(scored).toEqual(['dynamodb:PartiQLSelect', 's3:GetObject', 's3:GetObjectAcl'])
    expect(readAttributionCheck(mixed)).toMatchObject({ reported: true })
  })

  it('lists them as kept with their unmapped events, and renders the summary suffix and held categories verbatim', () => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} applyDisabled result={mixed} />)
    const kept = screen.getByTestId('simulate-fix-attribution-unverified')
    expect(kept.textContent).toContain('Attribution unverified — kept (2)')
    expect(kept.textContent).toContain('s3:GetObject')
    expect(kept.textContent).toContain('HeadObject, SelectObjectContent')
    expect(kept.textContent).toContain('dynamodb:PartiQLSelect')
    expect(screen.getByTestId('simulate-fix-candidates-heading').textContent).toBe('Removal candidates (preview only; execution held)')
    expect(screen.getByText('e.g. s3:GetObjectAcl')).toBeInTheDocument()
    expect(screen.getByTestId('simulate-fix-summary').textContent).toContain(
      '2 unused-looking permission(s) are not evidence-qualified: their CloudTrail attribution is incomplete.')
    expect(screen.getByTestId('simulate-fix-remediation-state').getAttribute('data-state')).toBe('NOT_READY')
  })

  it('an attribution-unverified action that still reaches removed_examples is not shown as a candidate', () => {
    const body = clone(mixed)
    body.simulation.removed_examples = ['s3:GetObject', 's3:GetObjectAcl'] // edited: an older backend's list
    render(<IAMSimulateFixModal isOpen onClose={() => {}} applyDisabled result={body} />)
    expect(screen.getByText('e.g. s3:GetObjectAcl')).toBeInTheDocument()
    expect(screen.queryByText(/e\.g\..*s3:GetObject,/)).toBeNull()
  })

  it('an absent field labels the candidates unverified', () => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} applyDisabled result={withoutAttributionField(mixed)} />)
    expect(readAttributionCheck(full.preview)).toEqual({ reported: false, unverified: [] })
    expect(screen.getByTestId('simulate-fix-candidates-heading').textContent).toContain('unverified: attribution check not reported')
    expect(screen.queryByTestId('simulate-fix-attribution-unverified')).toBeNull()
  })

  it('NEEDS_EVIDENCE renders as needs evidence; an absent state renders nothing', () => {
    // all_held: the backend's own withhold moved the only candidate out; its evidence_disposition is NEEDS_EVIDENCE.
    // This BLOCK harness reports final NOT_READY, so the final state is set from that captured value.
    expect(allHeld.evidence_disposition.remediation_state).toBe('NEEDS_EVIDENCE')
    const body = { ...clone(allHeld), final_remediation_state: allHeld.evidence_disposition.remediation_state }
    render(<IAMSimulateFixModal isOpen onClose={() => {}} applyDisabled result={body} />)
    const state = screen.getByTestId('simulate-fix-remediation-state')
    expect(state.getAttribute('data-state')).toBe('NEEDS_EVIDENCE')
    expect(state.textContent).toContain('Needs evidence')
    expect(state.textContent).not.toMatch(/Ready/)
    cleanup()
    render(<IAMSimulateFixModal isOpen onClose={() => {}} applyDisabled result={full.preview as unknown as SimulateFixResponse} />)
    expect(screen.queryByTestId('simulate-fix-remediation-state')).toBeNull()
    expect(remediationStateView('SOMETHING_NEW')).toMatchObject({ label: 'SOMETHING_NEW' })
  })
})

describe('the scorer bundle and the decision authority subtract attribution-unverified actions', () => {
  it('RemovalSafetyPanel: 1 candidate, 2 kept (positive control: without the check it counts 3)', () => {
    render(<RemovalSafetyPanel bundle={mixed.removal_safety} />)
    expect(screen.getByTestId('removal-safety-observed').textContent).toMatch(/^3 verified for removal/)
    cleanup()
    render(<RemovalSafetyPanel bundle={mixed.removal_safety} attribution={readAttributionCheck(mixed)} />)
    expect(screen.getByTestId('removal-safety-observed').textContent).toMatch(/^1 verified for removal · 2 attribution unverified — kept/)
    const kept = screen.getByTestId('removal-safety-attribution-unverified')
    expect(kept.textContent).toContain('s3:GetObject')
    expect(kept.textContent).toContain('HeadObject, SelectObjectContent')
    // The row itself is not drawn as a candidate.
    const row = screen.getAllByText('s3:GetObject').find((el) => el.className.includes('font-mono') && el.className.includes('truncate'))
    expect(row?.className).not.toContain('text-red-700')
    const control = screen.getAllByText('s3:GetObjectAcl').find((el) => el.className.includes('truncate'))
    expect(control?.className).toContain('text-red-700')
  })

  it('RemovalSafetyPanel labels the change score while it covers held actions (not recomputed)', () => {
    render(<RemovalSafetyPanel bundle={mixed.removal_safety} attribution={readAttributionCheck(mixed)} />)
    const score = screen.getByTestId('removal-safety-plan-score')
    expect(score.textContent).toContain(String(mixed.removal_safety.plan_score))
    expect(screen.getByTestId('removal-safety-plan-score-includes-held').textContent).toBe('includes attribution-unverified permissions')
    cleanup()
    render(<RemovalSafetyPanel bundle={mixed.removal_safety} attribution={readAttributionCheck(withoutAttributionField(mixed))} />)
    expect(screen.getByTestId('removal-safety-plan-score')).toBeTruthy()
    expect(screen.queryByTestId('removal-safety-plan-score-includes-held')).toBeNull()
  })

  it('DecisionAuthorityPanel marks cleared as attribution-not-checked before any Preview', () => {
    const review = clone(full.review_envelope.result.decision_authority) as Record<string, any>
    review.removal = { ...(review.removal ?? {}), cleared: ['s3:GetObjectAcl'] } // edited capture, as above
    render(<DecisionAuthorityPanel review={review} attribution={null} />)
    expect(screen.getByTestId('decision-authority-removal').textContent).toContain('(attribution not checked: no Preview yet)')
    cleanup()
    render(<DecisionAuthorityPanel review={review} attribution={readAttributionCheck(mixed)} />)
    expect(screen.getByTestId('decision-authority-removal').textContent).not.toContain('attribution not checked')
  })

  it('IAMSimulateFixModal lists attribution-unverified actions once', () => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} applyDisabled result={mixed} />)
    expect(screen.queryByTestId('simulate-fix-excluded-by-category')).toBeNull()
    expect(screen.getAllByText('s3:GetObject').length).toBe(1)
    cleanup()
    // Without the top-level field, the category is the only place they are named.
    render(<IAMSimulateFixModal isOpen onClose={() => {}} applyDisabled result={withoutAttributionField(mixed)} />)
    expect(screen.getByTestId('simulate-fix-excluded-by-category').textContent).toContain('dynamodb:PartiQLSelect, s3:GetObject')
  })

  it('RemovalSafetyPanel without the field says the count is unverified', () => {
    render(<RemovalSafetyPanel bundle={mixed.removal_safety} attribution={readAttributionCheck(withoutAttributionField(mixed))} />)
    expect(screen.getByTestId('removal-safety-observed').textContent).toContain('removal candidates (unverified: attribution check not reported)')
  })

  it('IamRemediationAvailability: all held means nothing to remove, not a preview-only plan', () => {
    render(<IamRemediationAvailability bundle={allHeld.removal_safety} applyDisabled attribution={readAttributionCheck(allHeld)} />)
    expect(screen.getByTestId('iam-remediation-availability').textContent).not.toContain('This plan is preview-only')
    cleanup()
    render(<IamRemediationAvailability bundle={allHeld.removal_safety} applyDisabled />)
    expect(screen.getByTestId('iam-remediation-availability').textContent).toContain('This plan is preview-only')
  })

  it('DecisionAuthorityPanel subtracts them from cleared', () => {
    // Edited capture: no captured Review has a non-empty cleared list, so the install-chain block is given one.
    const review = clone(full.review_envelope.result.decision_authority) as Record<string, any>
    review.removal = { ...(review.removal ?? {}), cleared: ['s3:GetObject', 's3:GetObjectAcl'] }
    render(<DecisionAuthorityPanel review={review} attribution={readAttributionCheck(mixed)} />)
    expect(screen.getByTestId('decision-authority-removal').textContent).toContain('Cleared for removal: 1 ')
    expect(screen.getByTestId('decision-authority-attribution-unverified').textContent).toContain('s3:GetObject')
    cleanup()
    render(<DecisionAuthorityPanel review={review} />)
    expect(screen.getByTestId('decision-authority-removal').textContent).toContain('Cleared for removal: 2 ')
  })
})

describe('the mounted IAM Permissions modal', () => {
  function reply(body: unknown): Response {
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response
  }

  const requests: Array<{ url: string; body: any }> = []

  function mount(simulate: SimulateFixResponse, gap: unknown = full.review_envelope, authorityHoldReason: string | null = null) {
    requests.length = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (url.includes('/gap-analysis')) return reply(gap)
      if (url.includes('/simulate-fix')) return reply(simulate)
      return { ok: false, status: 404, json: async () => ({ detail: { code: 'FIXTURE_UNROUTED' } }) } as Response
    }))
    render(<IAMPermissionAnalysisModal isOpen onClose={() => {}} roleName="fixture-web-role"
      roleArn="arn:aws:iam::111111111111:role/fixture-web-role" systemName="fixture-webshop" applyDisabled
      authorityHoldReason={authorityHoldReason} />)
  }

  async function openTab(name: RegExp) {
    const tab = await screen.findByRole('button', { name }, { timeout: 5000 })
    fireEvent.click(tab)
  }

  async function openPermissions(simulate: SimulateFixResponse, gap: unknown = full.review_envelope) {
    mount(simulate, gap)
    await openTab(/^Permissions/)
    return screen.findByTestId('iam-removal-candidates-heading', {}, { timeout: 5000 })
  }

  it('Context tab: the removal-candidate count subtracts attribution-unverified actions and is preview-only', async () => {
    // Positive control: without the field the tile carries the scorer's 3.
    mount(withoutAttributionField(mixed))
    await openTab(/^Context/)
    expect((await screen.findByTestId('context-removal-candidates', {}, { timeout: 5000 })).textContent).toBe('3')
    cleanup()
    mount(mixed)
    await openTab(/^Context/)
    const tile = await screen.findByTestId('context-removal-candidates', {}, { timeout: 5000 })
    expect(tile.textContent).toBe('1')
    expect(tile.parentElement?.textContent).toContain('preview only; execution held · 2 attribution unverified, kept')
    expect(screen.queryByText('Ready to remove')).toBeNull()
  })

  it('break-glass never sends an attribution-unverified action', async () => {
    // The host passes the hold reason that shows the override (LeastPrivilegeTab does); here the Preview's own.
    mount(mixed, full.review_envelope, mixed.safety.unsafe_reasons[0])
    const button = await screen.findByRole('button', { name: 'Remediate Anyway' }, { timeout: 5000 })
    await screen.findByTestId('removal-safety-panel', {}, { timeout: 5000 })
    fireEvent.click(button)
    await waitFor(() => expect(requests.some((r) => r.url.includes('/break-glass-plan'))).toBe(true))
    const sent = requests.find((r) => r.url.includes('/break-glass-plan'))?.body.permissions_to_remove
    expect(sent).toContain('s3:GetObjectAcl') // positive control: the control permission IS sent
    expect(sent).not.toContain('s3:GetObject')
    expect(sent).not.toContain('dynamodb:PartiQLSelect')
  })

  it('the legacy selection (no removal_safety, not BLOCK) never selects an attribution-unverified action', async () => {
    // Edited capture: removal_safety dropped and the decision set to REQUIRE_APPROVAL, which is the path where the
    // modal selects gapData.unused_permissions; the Review's unused list gets the held s3:GetObject added.
    const body = clone(mixed) as Record<string, any>
    delete body.removal_safety
    body.safety = { ...body.safety, decision: 'approval_required', decision_canonical: 'REQUIRE_APPROVAL', unsafe_reasons: [] }
    const gap = clone(full.review_envelope) as Record<string, any>
    gap.result.unused_permissions = [...gap.result.unused_permissions, 's3:GetObject']
    gap.result.is_remediable = true // edited: otherwise the Review's evidence hold empties the selection first
    const selected = async (simulate: SimulateFixResponse) => {
      mount(simulate, gap)
      await openTab(/^Permissions/)
      const label = await screen.findByText('permissions queued for removal', {}, { timeout: 5000 })
      return Number(label.previousElementSibling?.textContent)
    }
    const withHeld = await selected(withoutAttributionField(body))
    cleanup()
    const withoutHeld = await selected(body as SimulateFixResponse)
    expect(withHeld).toBe(gap.result.unused_permissions.length) // positive control: the fallback path ran
    expect(withoutHeld).toBe(withHeld - 1)
  })


  it('keeps attribution-unverified actions out of the candidates list and renders the final state', async () => {
    // Positive control: the same captured body without the field lists all 3 scorer candidates.
    const withoutField = await openPermissions(withoutAttributionField(mixed))
    expect(withoutField.textContent).toBe('Removal candidates (preview only; execution held) — unverified: attribution check not reported (3)')
    expect(within(withoutField.closest('div.rounded-xl') as HTMLElement).queryByText('s3:GetObject')).not.toBeNull()
    cleanup()

    const heading = await openPermissions(mixed)
    await waitFor(() => expect(screen.getByTestId('iam-attribution-unverified')).toBeInTheDocument())
    expect(heading.textContent).toBe('Removal candidates (preview only; execution held) (1)')
    const candidates = heading.closest('div.rounded-xl') as HTMLElement
    expect(within(candidates).getByText('s3:GetObjectAcl')).toBeInTheDocument()
    expect(within(candidates).queryByText('s3:GetObject')).toBeNull()
    expect(within(candidates).queryByText('dynamodb:PartiQLSelect')).toBeNull()
    const kept = screen.getByTestId('iam-attribution-unverified')
    expect(kept.textContent).toContain('Attribution unverified — kept (2)')
    expect(kept.textContent).toContain('HeadObject, SelectObjectContent')
    expect(screen.getByTestId('iam-final-remediation-state').getAttribute('data-state')).toBe('NOT_READY')
    expect(screen.queryByText(/Verified Removal Candidates|Eligible for plan/)).toBeNull()
  })

  it('renders the rollback-ready tri-state and its reason', async () => {
    await openPermissions(preview({ safety: rollbackShapes.unverified }))
    expect(screen.getByTestId('iam-rollback-ready').textContent).toContain('Rollback-ready: Unverified.')
    expect(screen.getByTestId('iam-rollback-ready').textContent).toContain('NO_SAME_SCOPE_RESTORE_POINT')
    cleanup()
    // A pre-42f7b16b body with its echoed rollback_available=true default: still unknown.
    await openPermissions(preview({ safety: { rollback_available: true } }))
    expect(screen.getByTestId('iam-rollback-ready').textContent).toContain('Rollback-ready: Unknown.')
    expect(screen.getByTestId('iam-rollback-ready').textContent).toContain('ROLLBACK_READY_NOT_REPORTED')
  })
})

// ─── 5. the two traced surfaces ───────────────────────────────────────────────
// per-resource-analysis.tsx is rendered (app/page.tsx section "per-resource"), but its keep/remove panel needs a
// per-resource granted_grain that no backend emits (main sends none; the unknown-chain branch sends "role_flat"),
// so no captured body reaches it. node-detail-panel.tsx has no importer. Both are pinned by source.
describe('untraced removal wording', () => {
  const perResource = readFileSync(join(process.cwd(), 'components/per-resource-analysis.tsx'), 'utf8')
  const nodeDetail = readFileSync(join(process.cwd(), 'components/identity-attack-paths/node-detail-panel.tsx'), 'utf8')

  it('per-resource analysis states candidates as unverified and renders no enabled remediation control', () => {
    expect(perResource).not.toContain('Remove unused permissions (')
    expect(perResource).not.toContain('keep {a.used_count}, remove')
    expect(perResource).not.toContain('Remove access entirely')
    expect(perResource).toContain('removal candidates, unverified')
    const remediationButtons = perResource.match(/onClick=\{\(\) => runRemediation\((true|false)\)\}[^>]*>/g) ?? []
    expect(remediationButtons.length).toBe(5)
    for (const button of remediationButtons) expect(button).toContain('disabled={loading || remediateHeld}')
  })

  it('the legacy confidence-group panel (Review safe_to_remove / auto_remediable) stays hidden', () => {
    const modal = readFileSync(join(process.cwd(), 'components/iam-permission-analysis-modal.tsx'), 'utf8')
    const hidden = modal.indexOf('<div className="hidden" aria-hidden="true">')
    expect(hidden).toBeGreaterThan(0)
    const grouped = modal.indexOf('Permissions to Remove — Grouped by Backend Confidence Engine')
    expect(grouped).toBeGreaterThan(hidden)
    expect(modal.slice(hidden, grouped)).not.toMatch(/<\/div>/)
  })

  it('the recommend proxy reduction percentage is labelled attribution-not-checked where it renders', () => {
    const at = perResource.indexOf('data-testid="per-resource-aggregated-risk-reduction"')
    expect(at).toBeGreaterThan(0)
    expect(perResource.slice(at, at + 900)).toContain('attribution not checked')
  })

  it('the node detail panel does not tell the operator to remove unverified permissions', () => {
    expect(nodeDetail).not.toMatch(/Remove \{permissions\.unused\} unused permissions/)
    expect(nodeDetail).toContain('not observed in use (unverified)')
  })
})
