/**
 * AP3-102a — a network-discovered path names the RDS CLUSTER as its target.
 *
 * Cluster members share the endpoint addresses the flow was keyed by, so the
 * backend cannot honestly attribute a flow to one member and names the
 * cluster instead. Every consumer that switches on the crown-jewel type had
 * RDSInstance but not RDSCluster, so an Aurora cluster fell through to the
 * generic branch and rendered as an unrecognised box on the map.
 */
import { describe, expect, it } from "vitest"

import { visualTypeFromNodeType } from "@/lib/attack-map/map-view-model"
import { toNeo4jLabel } from "@/lib/readiness-labels"

describe("RDSCluster is a database everywhere RDSInstance is", () => {
  it("maps to the database visual on the attack map", () => {
    expect(visualTypeFromNodeType("RDSCluster")).toBe("database")
    // Pinned against the sibling so the two cannot drift apart.
    expect(visualTypeFromNodeType("RDSCluster")).toBe(
      visualTypeFromNodeType("RDSInstance"),
    )
  })

  it("does not fall through to the generic branch", () => {
    expect(visualTypeFromNodeType("RDSCluster")).not.toBe("generic")
    // Negative control: the fallback still works for a type nothing maps.
    expect(visualTypeFromNodeType("SomeUnmappedThing")).toBe("generic")
  })

  it("resolves to a readiness label rather than null", () => {
    expect(toNeo4jLabel("RDSCluster")).toBe("RDSCluster")
    expect(toNeo4jLabel("RDSInstance")).toBe("RDSInstance")
  })
})
