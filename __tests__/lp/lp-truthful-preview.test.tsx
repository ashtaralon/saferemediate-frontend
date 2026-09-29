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
 * (fixtures/lp-review-preview-install-chain.json); rollback_ready shapes come from the backend module at 42f7b16b
 * (fixtures/simulate-fix-rollback-ready-42f7b16b.json). `attribution_unverified_permissions` has no backend producer
 * yet: its items follow the declared contract `{action, reason_code, unmapped_events}` exactly.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import full from '../fixtures/lp-review-preview-install-chain.json'
import rollbackShapes from '../fixtures/simulate-fix-rollback-ready-42f7b16b.json'
import LeastPrivilegeTab, { ImpactTab, lpImpactCountsVerified } from '@/components/LeastPrivilegeTab'
import { IAMSimulateFixModal } from '@/components/IAMSimulateFixModal'
import { IAMPermissionAnalysisModal } from '@/components/iam-permission-analysis-modal'
import { LP_DRAWER_PREVIEW_SUPPORT, resolveLPDrawerPreview } from '@/lib/lp-review-routing'
import { requestLPDrawerPreview } from '@/lib/lp-drawer-preview'
import { normalizeLPResponse } from '@/lib/lp-normalize'
import { readAttributionCheck, rollbackReadyView } from '@/lib/lp-preview-truth'
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

const ATTRIBUTION_UNVERIFIED = [
  { action: 'dynamodb:Query', reason_code: 'EVENT_ATTRIBUTION_INCOMPLETE', unmapped_events: ['ExecuteStatement'] },
  { action: 'kms:Encrypt', reason_code: 'EVENT_ATTRIBUTION_UNKNOWN', unmapped_events: [] },
] as const

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

// A Preview that issued candidates. The backend drops attribution-unverified actions from removed_examples; the
// captured body issued none, so the candidate numbers here are the only non-captured values besides the field.
const withCandidates = {
  action_type: 'PERMISSION_NARROWING_IN_PLACE', kept_permissions: 10, removed_permissions: 2,
  kept_examples: ['s3:GetObject'], removed_examples: ['iam:PassRole', 'sqs:ReceiveMessage'],
  summary: '2 permission(s) are evidence-qualified for removal; execution remains gated.',
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

  it('an unrecognised reason code is shown verbatim and never read as proven', () => {
    const readbackUnproven = (status: string) => ({
      rollback_available: status === 'proven', rollback_ready_status: status,
      rollback_ready: { ...rollbackShapes.proven.rollback_ready, status, reason_code: 'RESTORE_READBACK_UNPROVEN' },
    })
    expect(rollbackReadyView(readbackUnproven('proven'))).toMatchObject({ status: 'unknown', reasonCode: 'RESTORE_READBACK_UNPROVEN' })
    expect(rollbackReadyView(readbackUnproven('proven')).sentence).toContain('(RESTORE_READBACK_UNPROVEN)')
    expect(rollbackReadyView(readbackUnproven('unverified'))).toMatchObject({ status: 'unverified', reasonCode: 'RESTORE_READBACK_UNPROVEN' })
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

describe('IAMSimulateFixModal removal candidates', () => {
  it('lists attribution-unverified actions as kept and never among the candidates', () => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} applyDisabled
      result={preview({ simulation: withCandidates, attribution: ATTRIBUTION_UNVERIFIED })} />)
    const kept = screen.getByTestId('simulate-fix-attribution-unverified')
    expect(kept.textContent).toContain('Attribution unverified — kept (2)')
    expect(kept.textContent).toContain('dynamodb:Query')
    expect(kept.textContent).toContain('ExecuteStatement')
    expect(kept.textContent).toContain('kms:Encrypt')
    expect(screen.getByTestId('simulate-fix-candidates-heading').textContent).toBe('Removal candidates (preview only; execution held)')
    expect(screen.getByText(/e\.g\. iam:PassRole, sqs:ReceiveMessage/)).toBeInTheDocument()
  })

  it('an attribution-unverified action that still reaches removed_examples is not shown as a candidate', () => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} applyDisabled
      result={preview({ simulation: { ...withCandidates, removed_examples: ['dynamodb:Query', 'iam:PassRole'] }, attribution: ATTRIBUTION_UNVERIFIED })} />)
    expect(screen.getByText(/e\.g\. iam:PassRole/)).toBeInTheDocument()
    expect(screen.queryByText(/e\.g\..*dynamodb:Query/)).toBeNull()
  })

  it('an absent field labels the candidates unverified', () => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} applyDisabled result={preview({ simulation: withCandidates })} />)
    expect(readAttributionCheck(full.preview)).toEqual({ reported: false, unverified: [] })
    expect(screen.getByTestId('simulate-fix-candidates-heading').textContent).toContain('unverified: attribution check not reported')
    expect(screen.queryByTestId('simulate-fix-attribution-unverified')).toBeNull()
  })
})

describe('the mounted IAM Permissions modal', () => {
  function reply(body: unknown): Response {
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response
  }

  async function openPermissions(simulate: SimulateFixResponse) {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/gap-analysis')) return reply(full.review_envelope)
      if (url.includes('/simulate-fix')) return reply(simulate)
      return { ok: false, status: 404, json: async () => ({ detail: { code: 'FIXTURE_UNROUTED' } }) } as Response
    }))
    render(<IAMPermissionAnalysisModal isOpen onClose={() => {}} roleName="fixture-web-role"
      roleArn="arn:aws:iam::111111111111:role/fixture-web-role" systemName="fixture-webshop" applyDisabled />)
    const tab = await screen.findByRole('button', { name: /^Permissions/ }, { timeout: 5000 })
    fireEvent.click(tab)
    return screen.findByTestId('iam-removal-candidates-heading', {}, { timeout: 5000 })
  }

  it('keeps attribution-unverified actions out of the candidates and shows them with their unmapped events', async () => {
    const withoutField = await openPermissions(preview({ safety: rollbackShapes.unverified }))
    // Positive control: without the field, dynamodb:Query IS a listed candidate.
    const beforeCount = Number(/\((\d+)\)$/.exec(withoutField.textContent || '')?.[1])
    expect(beforeCount).toBeGreaterThan(0)
    const candidatesBefore = withoutField.closest('div.rounded-xl') as HTMLElement
    expect(within(candidatesBefore).queryByText('dynamodb:Query')).not.toBeNull()
    // Only the reported actions that were candidates can leave the count.
    const wereCandidates = ATTRIBUTION_UNVERIFIED.filter((item) => within(candidatesBefore).queryByText(item.action) !== null).length
    expect(wereCandidates).toBeGreaterThan(0)
    expect(withoutField.textContent).toContain('unverified: attribution check not reported')
    cleanup()

    const heading = await openPermissions(preview({ safety: rollbackShapes.unverified, attribution: ATTRIBUTION_UNVERIFIED }))
    await waitFor(() => expect(screen.getByTestId('iam-attribution-unverified')).toBeInTheDocument())
    expect(heading.textContent).toBe(`Removal candidates (preview only; execution held) (${beforeCount - wereCandidates})`)
    const candidates = heading.closest('div.rounded-xl') as HTMLElement
    expect(within(candidates).queryByText('dynamodb:Query')).toBeNull()
    expect(within(candidates).queryByText('kms:Encrypt')).toBeNull()
    const kept = screen.getByTestId('iam-attribution-unverified')
    expect(kept.textContent).toContain('Attribution unverified — kept (2)')
    expect(kept.textContent).toContain('ExecuteStatement')
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

  it('the node detail panel does not tell the operator to remove unverified permissions', () => {
    expect(nodeDetail).not.toMatch(/Remove \{permissions\.unused\} unused permissions/)
    expect(nodeDetail).toContain('not observed in use (unverified)')
  })
})
