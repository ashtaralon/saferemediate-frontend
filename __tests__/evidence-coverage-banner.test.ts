/// <reference types="vitest/globals" />

// Marks this file a MODULE. Without an import or export, TypeScript treats a
// .ts file as a SCRIPT and its top-level declarations become GLOBAL, colliding
// across test files.
export {}

/**
 * The estate-level twin of the row-level honesty work.
 *
 * A role we could not measure now renders "?" instead of a flattering number.
 * An ESTATE we could not measure was still rendering confident totals in
 * silence: measured on alon-prod 2026-08-01, 102 resources, 67 with config,
 * and evidence_collected = 0 across EVERY label — while the tab showed
 * "Excess Permissions 73" and a Blast Radius of 65.
 *
 * The allowed half of the comparison computes perfectly without any
 * behavioural sources, because IAM policies and SG rules are configuration.
 * So a total outage of VPC_FLOW, CLOUDTRAIL_MGMT and S3_ACCESS_LOGS is
 * invisible on this tab unless something says it out loud.
 *
 * These pin the banner's decision logic rather than its markup, so they
 * survive restyling.
 */

type Totals = {
  inventory_resources?: number
  config_collected?: number
  evidence_collected?: number
}

/** components/evidence-coverage-banner.tsx — what it decides to render. */
function bannerState(totals: Totals | null): 'hidden' | 'partial' | 'none' {
  if (!totals) return 'hidden'
  const inventory = totals.inventory_resources ?? 0
  const evidence = totals.evidence_collected ?? 0
  if (inventory <= 0) return 'hidden'
  if (evidence >= inventory) return 'hidden'
  return evidence === 0 ? 'none' : 'partial'
}

describe('the production state it exists for', () => {
  it('warns when nothing was observed but config was collected', () => {
    // The exact alon-prod payload.
    expect(bannerState({ inventory_resources: 102, config_collected: 67, evidence_collected: 0 }))
      .toBe('none')
  })

  it('is informational, not alarming, on partial coverage', () => {
    expect(bannerState({ inventory_resources: 102, evidence_collected: 40 })).toBe('partial')
  })
})

describe('it stays quiet when it has nothing useful to add', () => {
  it('renders nothing when coverage is complete', () => {
    expect(bannerState({ inventory_resources: 102, evidence_collected: 102 })).toBe('hidden')
  })

  it('renders nothing when evidence somehow exceeds inventory', () => {
    // Guard against a rollup skew producing a nonsensical negative remainder.
    expect(bannerState({ inventory_resources: 10, evidence_collected: 12 })).toBe('hidden')
  })

  it('renders nothing for an empty system', () => {
    expect(bannerState({ inventory_resources: 0, evidence_collected: 0 })).toBe('hidden')
  })

  it('renders nothing when the lookup failed', () => {
    // A coverage advisory must never become a second error surface on a tab
    // that is already reporting a backend problem.
    expect(bannerState(null)).toBe('hidden')
  })

  it('treats missing fields as absent rather than zero-with-confidence', () => {
    expect(bannerState({})).toBe('hidden')
  })
})

describe('the remainder it reports is the unmeasured count', () => {
  it('names how many are scored from configuration alone', () => {
    const totals = { inventory_resources: 102, evidence_collected: 40 }
    const remainder = (totals.inventory_resources ?? 0) - (totals.evidence_collected ?? 0)
    expect(remainder).toBe(62)
    expect(remainder).toBeGreaterThan(0)
  })
})
