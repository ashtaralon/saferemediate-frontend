import { describe, expect, test } from "vitest"

import {
  buildJewelPathIndex,
  jewelPathMetaForNode,
  pathCountLabel,
} from "@/components/topology-v0-2/estate-enrichment"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { TopologyNode } from "@/components/topology-v0-2/types"

function jewel(partial: Partial<CrownJewelSummary> & { id: string; name: string }): CrownJewelSummary {
  return {
    type: "S3",
    severity: "HIGH",
    path_count: 0,
    highest_risk_score: 0,
    is_internet_exposed: false,
    data_classification: null,
    priority_score: 0,
    ...partial,
  }
}

function node(partial: Partial<TopologyNode> & { id: string; name: string }): TopologyNode {
  return {
    type: "S3",
    subnet_id: null,
    score: null,
    stale: null,
    is_jewel: true,
    ...partial,
  }
}

describe("estate-enrichment", () => {
  test("pathCountLabel is honest when paths not computed", () => {
    expect(pathCountLabel(jewel({ id: "a", name: "b", paths_not_computed: true, path_count: 99 }))).toBe(
      "no paths computed",
    )
  })

  test("pathCountLabel uses materialized count when present", () => {
    expect(
      pathCountLabel(jewel({ id: "a", name: "b", path_count: 5, materialized_path_count: 72 })),
    ).toBe("72 attack paths")
  })

  test("jewelPathMetaForNode matches id, canonical_id, and name", () => {
    const index = buildJewelPathIndex([
      jewel({ id: "arn:aws:s3:::bucket-a", canonical_id: "arn:aws:s3:::bucket-a", name: "bucket-a", path_count: 3 }),
    ])
    expect(jewelPathMetaForNode(node({ id: "arn:aws:s3:::bucket-a", name: "bucket-a" }), index)?.path_count).toBe(3)
    expect(jewelPathMetaForNode(node({ id: "other", name: "bucket-a" }), index)?.path_count).toBe(3)
  })
})
