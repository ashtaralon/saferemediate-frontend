import { describe, expect, it } from 'vitest'

import { iamInventoryRowCopy, iamObservationCopy } from '@/lib/iam-observation-copy'

describe('IAM inventory observation copy', () => {
  it('does not promote raw non-use into a removal decision', () => {
    const copy = iamObservationCopy(23, 27, 4)

    expect(copy).toEqual({
      summary: '23 of 27 permissions had no observed usage — 4 were observed in use',
      usedLabel: '4 observed in use',
      notObservedLabel: '23 not observed',
    })
    expect(Object.values(copy).join(' ').toLowerCase()).not.toContain('remove')
  })

  it('directs inventory rows to Preview without claiming non-use is removable', () => {
    const copy = iamInventoryRowCopy(16, 25)

    expect(copy.summary).toBe('16 not observed of 25 allowed — Preview classifies each permission')
    expect(copy.summary.toLowerCase()).not.toContain('remove')
    expect(copy.summary.toLowerCase()).not.toContain('unused')
  })
})
