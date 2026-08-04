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
    expect(analysisModalSource).toContain('data-testid="simulation-technical-details"')
    expect(analysisModalSource).toContain('Technical decision details')
    expect(analysisModalSource).toContain('not confidence in the finding')
    expect(analysisModalSource).toContain('if (safetyContext) return null')
  })
})
