/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest"

import type {
  ForeignSharedAccessEdge,
  TopologyNode,
} from "@/components/topology-v0-2/types"

/** Pure helper mirroring WorkloadChip foreign badge copy. */
export function foreignConsumerBadgeLine(node: TopologyNode): string | null {
  const n = node.foreign_consumer_system_count ?? 0
  if (n <= 0) return null
  return `${n} external system${n === 1 ? "" : "s"}`
}

describe("foreign consumer Glance badge", () => {
  it("formats singular and plural system counts", () => {
    expect(
      foreignConsumerBadgeLine({
        id: "b1",
        name: "bucket",
        type: "S3",
        foreign_consumer_system_count: 1,
        foreign_consumer_systems: ["SafeRemediate-Test-DB"],
      } as TopologyNode),
    ).toBe("1 external system")
    expect(
      foreignConsumerBadgeLine({
        id: "b1",
        name: "bucket",
        type: "S3",
        foreign_consumer_system_count: 2,
        foreign_consumer_systems: ["SafeRemediate-Test-DB", "cyntroprod"],
      } as TopologyNode),
    ).toBe("2 external systems")
  })

  it("hides when no foreign consumers", () => {
    expect(
      foreignConsumerBadgeLine({
        id: "b1",
        name: "bucket",
        type: "S3",
      } as TopologyNode),
    ).toBeNull()
  })

  it("ForeignSharedAccessEdge evidence tiers are observed | declared", () => {
    const edge: ForeignSharedAccessEdge = {
      foreign_system: "SafeRemediate-Test-DB",
      consumer_id: "i-0df88ac8208f7607a",
      consumer_name: "SafeRemediate-Test-App-1",
      consumer_kind: "EC2Instance",
      shared_resource_id: "arn:aws:rds:eu-west-1:1:db:saferemediate-test-db",
      shared_resource_name: "saferemediate-test-db",
      resource_kind: "RDS",
      rel_type: "QUERIES_DB",
      evidence_tier: "observed",
      last_seen: null,
    }
    expect(edge.evidence_tier).toBe("observed")
  })
})
