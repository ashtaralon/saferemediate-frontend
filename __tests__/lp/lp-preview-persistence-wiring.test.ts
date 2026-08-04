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

  it('keeps the evidence-modal Preview bound to the same finding and shows the canonical engine result', () => {
    expect(source).toContain('findingId={selectedIAMFindingId || undefined}')
    expect(analysisModalSource).toContain('finding_id: findingId')
    expect(analysisModalSource).toContain('data-testid="safetyvector-decision"')
    expect(analysisModalSource).toContain('SafetyVector decision')
    expect(analysisModalSource).toContain("decisionPersistence?.persisted ? 'Decision saved' : 'Not saved'")
    expect(analysisModalSource).toContain("stateName = canonical")
  })
})
