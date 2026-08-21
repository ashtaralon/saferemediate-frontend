import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/LeastPrivilegeTab.tsx'), 'utf8')
const analysisModalSource = readFileSync(
  join(process.cwd(), 'components/iam-permission-analysis-modal.tsx'),
  'utf8',
)

describe('Resource Risk Preview persistence wiring', () => {
  it('binds Preview to the finding and refreshes only after persistence succeeds', () => {
    expect(source).toContain('finding_id: selectedResource.findingId')
    expect(source).toContain('simulateFixData.decision_persistence?.persisted')
    expect(source).toContain('void fetchGaps(true, true)')
  })

  it('surfaces persistence failure instead of pretending the queue updated', () => {
    expect(source).toContain("title: 'Preview evaluated, queue not updated'")
    expect(source).toContain('simulateFixData.decision_persistence.warning')
  })

  it('keeps the evidence-modal Preview bound to the same finding and preserves technical audit details', () => {
    expect(source).toContain('findingId={selectedIAMFindingId || undefined}')
    expect(analysisModalSource).toContain('finding_id: findingId')
    expect(analysisModalSource).toContain('data-testid="safetyvector-decision"')
    expect(analysisModalSource).toContain('SafetyVector decision')
    expect(analysisModalSource).toContain("decisionPersistence?.persisted ? 'Decision saved' : 'Not saved'")
    expect(analysisModalSource).toContain("stateName = canonical")
  })

  it('keeps the default CISO summary focused on finding, readiness, and exact missing evidence', () => {
    expect(analysisModalSource).toContain('data-testid="resource-risk-simple-summary"')
    expect(analysisModalSource).toContain('Over-permission summary')
    expect(analysisModalSource).toContain('Change status')
    expect(analysisModalSource).toContain('Why Cyntro is waiting')
    expect(analysisModalSource).toContain('surface="light"')
    expect(analysisModalSource).toContain('data-testid="editable-change-plan"')
    expect(analysisModalSource).toContain('All deletion candidates are selected by default')
    expect(analysisModalSource).not.toContain('data-testid="simulation-technical-details"')
    expect(analysisModalSource).toContain('Technical decision details')
    expect(analysisModalSource).toContain('not confidence in the finding')
    expect(analysisModalSource).toContain('if (safetyContext) return null')
  })

  it('binds the signed managed-policy execution requirement and removes false safety claims', () => {
    expect(analysisModalSource).toContain('setManagedPolicyRewriteRequired(requiresManagedPolicyRewrite)')
    expect(analysisModalSource).toContain('setDetachManagedPolicies(requiresManagedPolicyRewrite)')
    expect(analysisModalSource).toContain('Preserve kept actions during managed-policy rewrite')
    expect(analysisModalSource).toContain('Restore point required')
    expect(analysisModalSource).toContain('Calculating removal evidence...')
    expect(analysisModalSource).not.toContain('`${safetyScore}% safe to remove`')
    expect(analysisModalSource).toContain('A restore point will be created and verified before Apply changes AWS.')
  })

  it('replaces the complete modal snapshot with the user-triggered simulation response', () => {
    expect(analysisModalSource).toContain('const applySimulateFixSnapshot =')
    expect(analysisModalSource).toContain('applySimulateFixSnapshot(result)')
    expect(analysisModalSource).toContain('setSafetyContext(safety)')
    expect(analysisModalSource).toContain('setRemovalSafety(')
    expect(analysisModalSource).toContain('setPreviewObservationDays(')
    expect(analysisModalSource).toContain('setDecisionPersistence(')
    expect(analysisModalSource).toContain('setPlanToken(null)')
    expect(analysisModalSource).toContain('setPlanPermissions(null)')
    expect(analysisModalSource).toContain('requestVersion !== simulateFixRequestVersion.current')
    expect(analysisModalSource.indexOf('applySimulateFixSnapshot(result)')).toBeLessThan(
      analysisModalSource.lastIndexOf('setShowSimulation(true)'),
    )
  })

  it('routes REQUIRE_APPROVAL through the stored approval workflow instead of override apply', () => {
    const approvalStart = analysisModalSource.indexOf("else if (verdictBucket === 'human_approval')")
    const approvalEnd = analysisModalSource.indexOf('else if (lowConfidence)', approvalStart)
    const approvalBranch = analysisModalSource.slice(approvalStart, approvalEnd)

    expect(approvalStart).toBeGreaterThan(0)
    expect(approvalEnd).toBeGreaterThan(approvalStart)
    expect(approvalBranch).toContain('handleIAMLpRequestApproval(selectedPermissions)')
    expect(approvalBranch).toContain('handleIAMLpExecuteApprovedRequest(approval.request_id)')
    expect(approvalBranch).toContain('Request approval (${selectedTotalCount})')
    expect(approvalBranch).toContain('Approval pending')
    expect(approvalBranch).not.toContain('handleApplyFix(')
    expect(approvalBranch).not.toContain('setOverrideModal(')
    expect(analysisModalSource).toContain('data-testid="shared-role-impact"')
    expect(analysisModalSource).toContain('{renderApprovalActionModal()}')
  })
})
