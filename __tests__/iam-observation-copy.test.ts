import { describe, expect, it } from 'vitest'

import { iamObservationCopy } from '@/lib/iam-observation-copy'

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
})
