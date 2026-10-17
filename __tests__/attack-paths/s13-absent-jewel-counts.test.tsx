/**
 * Review S13 · a crown jewel's path count and priority score are `number | null`: a jewel that carries no count or
 * no score (a lite jewel from a convergence / navigation row, a catalog row with a missing count, a facade payload with
 * no severity score) is "not computed", never an invented 0.
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import { CrownJewelListPanel } from "@/components/identity-attack-paths/crown-jewel-list-panel"
import { pathCountLabel } from "@/components/topology-v0-2/estate-enrichment"
import { toCrownJewelSummary } from "@/lib/attack-paths/crown-jewel-v2-navigation"
import { targetEntryToJewelSummary, type TargetCatalogEntry } from "@/lib/attack-paths/target-catalog"
import { crownJewelFromArnName } from "@/lib/attack-paths/use-crown-jewel-convergence"

const captured = vi.hoisted(() => ({ jewel: undefined as unknown, payload: null as unknown }))

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("@/lib/attack-map/feature-flag", () => ({ useAttackMapCyntro: () => true }))
vi.mock("@/lib/use-retry-fetch", () => ({
  useRetryFetch: () => ({ data: captured.payload, loading: false, error: null, retry: () => undefined, retrying: false, attempt: 0 }),
}))
vi.mock("@/components/attack-paths-v2/path-analysis-panel", () => ({
  PathAnalysisPanel: (props: { jewel: unknown }) => {
    captured.jewel = props.jewel
    return null
  },
}))

import { AttackPathPanel } from "@/components/attack-paths-v2/attack-path-panel"

afterEach(() => cleanup())

const LITE = { id: "arn:aws:s3:::bucket-9", name: "bucket-9", type: "S3Bucket" }

function catalogEntry(overrides: Partial<TargetCatalogEntry>): TargetCatalogEntry {
  return {
    target_id: "arn:aws:s3:::bucket-9", arn: "arn:aws:s3:::bucket-9", native_id: "bucket-9", kind: "S3Bucket",
    name: "bucket-9", path_count: 2, observed_path_count: 1, max_severity: 71, max_severity_label: "HIGH",
    manifest_path_count: 2, state: "observed", crown_jewel_source: null,
    ...overrides,
  } as TargetCatalogEntry
}

describe("lite jewels carry no count and no score", () => {
  it("toCrownJewelSummary and crownJewelFromArnName: path_count and priority_score are null, not 0", () => {
    const lite = toCrownJewelSummary(LITE)
    expect(lite.path_count).toBeNull()
    expect(lite.priority_score).toBeNull()
    const fromArn = crownJewelFromArnName(LITE.id, LITE.name)
    expect(fromArn?.path_count).toBeNull()
    expect(fromArn?.priority_score).toBeNull()
  })

  it("a full summary whose count is not computed passes through untouched (its catalog state survives)", () => {
    const full = targetEntryToJewelSummary(catalogEntry({ path_count: undefined as never, state: "no_modeled_route" }))
    expect(toCrownJewelSummary(full)).toBe(full)
  })
})

describe("the target catalog adapter", () => {
  it("a missing count is null (not computed), and so is the score of a row with no path", () => {
    const missing = targetEntryToJewelSummary(catalogEntry({ path_count: undefined as never }))
    expect(missing.path_count).toBeNull()
    expect(missing.priority_score).toBeNull()
    const zero = targetEntryToJewelSummary(catalogEntry({ path_count: 0, max_severity: 0, max_severity_label: null }))
    expect(zero.path_count).toBe(0)
    expect(zero.priority_score).toBeNull()
    const scored = targetEntryToJewelSummary(catalogEntry({}))
    expect([scored.path_count, scored.priority_score]).toEqual([2, 71])
  })

  it("a malformed count is null as well, never NaN", () => {
    const malformed = targetEntryToJewelSummary(catalogEntry({ path_count: "bad" as never }))
    expect(malformed.path_count).toBeNull()
    expect(malformed.priority_score).toBeNull()
  })
})

function jewel(overrides: Partial<CrownJewelSummary>): CrownJewelSummary {
  return {
    id: "arn:aws:s3:::bucket-9", canonical_id: null, name: "bucket-9", type: "S3Bucket", severity: null,
    path_count: null, highest_risk_score: null, is_internet_exposed: null, data_classification: null,
    priority_score: null, ...overrides,
  }
}

describe("readers render an absent count as not computed", () => {
  it("topology pathCountLabel: 'attack paths not computed', never '0 attack paths'", () => {
    expect(pathCountLabel(jewel({}))).toBe("attack paths not computed")
    expect(pathCountLabel(jewel({ path_count: 0 }))).toBe("0 attack paths")
  })

  it("the crown-jewel rail: 'paths not computed', and no '0 of N in graph' badge", () => {
    render(
      <CrownJewelListPanel
        jewels={[jewel({ materialized_path_count: 5 })]}
        selectedJewelId={null}
        onSelect={() => undefined}
      />,
    )
    expect(screen.getByTestId("jewel-path-count-not-computed")).toHaveTextContent("paths not computed")
    expect(screen.queryByText(/of 5 in graph/)).toBeNull()
  })

  it("the attack-path panel: a payload with no severity score gives priority_score null, not 0", () => {
    captured.payload = {
      path_id: "p1", jewel: { id: LITE.id, name: LITE.name, type: LITE.type, path_count: null },
      hops: { nodes: [], edges: [] }, severity: null, hop_count: 0, lateral: [], canvas: null,
    }
    render(<AttackPathPanel systemName="sys" jewelId={LITE.id} pathId="p1" />)
    const passed = captured.jewel as CrownJewelSummary
    expect(passed.priority_score).toBeNull()
    expect(passed.highest_risk_score).toBeNull()
    expect(passed.path_count).toBeNull()
  })
})
