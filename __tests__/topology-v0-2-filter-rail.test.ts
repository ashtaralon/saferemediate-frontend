/**
 * Sentinels for the topology-v0-2 filter rail and applyFilters helper.
 *
 * applyFilters is the single source of truth for what nodes show on the
 * Estate canvas; a regression here = wrong nodes rendered or the wrong
 * counts on the rail.
 */
import { describe, expect, test } from "vitest"

import {
  applyFilters,
  defaultFilters,
} from "@/components/topology-v0-2/filter-rail"
import type { TopologyNode } from "@/components/topology-v0-2/types"

function n(overrides: Partial<TopologyNode>): TopologyNode {
  return {
    id: overrides.id ?? "id-x",
    name: overrides.name ?? "node-x",
    type: overrides.type ?? "EC2Instance",
    subnet_id: overrides.subnet_id ?? "subnet-a",
    score: overrides.score ?? null,
    stale: overrides.stale ?? null,
    is_jewel: overrides.is_jewel ?? false,
  }
}

describe("defaultFilters", () => {
  test("populates the type set from system_kpis", () => {
    const f = defaultFilters({
      workloads_total: 3,
      workloads_by_type: { EC2Instance: 2, Lambda: 1, S3Bucket: 0 },
      flagged_count: 0,
      stale_workloads_count: 0,
      posture_coverage: { scored: 0, total: 3, by_type: {} },
      posture_freshness: {
        most_recent_run: null,
        age_days: null,
        threshold_days: 7,
        is_fresh: false,
        auto_resolves_when: "",
      },
    })
    expect([...f.types].sort()).toEqual(["EC2Instance", "Lambda"])
  })

  test("includes every tier by default", () => {
    const f = defaultFilters(null)
    expect([...f.tiers].sort()).toEqual([
      "ELEVATED", "HIGH", "QUIET", "STALE", "UNSCORED", "WORST",
    ])
  })
})

describe("applyFilters", () => {
  const filters = defaultFilters({
    workloads_total: 0,
    workloads_by_type: { EC2Instance: 1, Lambda: 1 },
    flagged_count: 0,
    stale_workloads_count: 0,
    posture_coverage: { scored: 0, total: 0, by_type: {} },
    posture_freshness: {
      most_recent_run: null,
      age_days: null,
      threshold_days: 7,
      is_fresh: false,
      auto_resolves_when: "",
    },
  })

  test("drops nodes whose type is not enabled", () => {
    const nodes = [
      n({ id: "a", type: "EC2Instance" }),
      n({ id: "b", type: "Lambda" }),
    ]
    const out = applyFilters(nodes, {
      ...filters,
      types: new Set(["EC2Instance"]),
    })
    expect(out.map(x => x.id)).toEqual(["a"])
  })

  test("STALE filter routes is_stale nodes regardless of type", () => {
    const stale = n({
      id: "s",
      stale: { since: null, reason: "aws_exists=false" },
    })
    const out = applyFilters([stale], {
      ...filters,
      tiers: new Set(["STALE"]),
    })
    expect(out).toHaveLength(1)
  })

  test("UNSCORED filter routes nodes with score=null", () => {
    const unscored = n({ id: "u", score: null, stale: null })
    const out = applyFilters([unscored], {
      ...filters,
      tiers: new Set(["UNSCORED"]),
    })
    expect(out).toHaveLength(1)
  })

  test("scored node tier is honored against the tier set", () => {
    const high = n({
      id: "h",
      score: {
        value: 70,
        tier: "HIGH",
        rank: 1,
        confidence: { value: 1, tier: "FULL", reasons: [] },
        contributors: [],
      },
    })
    const out = applyFilters([high], {
      ...filters,
      tiers: new Set(["WORST"]),
    })
    expect(out).toHaveLength(0)
  })

  test("includeStaleOnly hides FULL-confidence nodes", () => {
    const fresh = n({
      id: "f",
      score: {
        value: 50, tier: "ELEVATED", rank: 1,
        confidence: { value: 1, tier: "FULL", reasons: [] },
        contributors: [],
      },
    })
    const degraded = n({
      id: "d",
      score: {
        value: 50, tier: "ELEVATED", rank: 2,
        confidence: { value: 0.6, tier: "DEGRADED", reasons: [] },
        contributors: [],
      },
    })
    const out = applyFilters([fresh, degraded], {
      ...filters,
      includeStaleOnly: true,
    })
    expect(out.map(x => x.id)).toEqual(["d"])
  })

  test("includeUnscoredOnly hides scored nodes", () => {
    const scored = n({
      id: "s",
      score: {
        value: 50, tier: "ELEVATED", rank: 1,
        confidence: { value: 1, tier: "FULL", reasons: [] },
        contributors: [],
      },
    })
    const unscored = n({ id: "u", score: null })
    const out = applyFilters([scored, unscored], {
      ...filters,
      includeUnscoredOnly: true,
    })
    expect(out.map(x => x.id)).toEqual(["u"])
  })
})
