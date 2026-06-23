// deriveReachableNeighborsFromCanvas — the lateral "where does this role pivot
// next" fan-out, derived from the facade's laterals_by_node (the list endpoint's
// reachable_neighbors arrives empty for roles with real fan-out). NO MOCK: every
// neighbor is a real out-edge from the canvas. Mirrors the live alon-demo-ec2-role
// case (AROA id on the node, real role name in the canvas ARN — BE-8).

import { describe, it, expect } from "vitest"
import { deriveReachableNeighborsFromCanvas } from "@/components/attack-paths-v2/derive-reachable-neighbors"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { GraphViewResponse } from "@/components/attack-paths-v2/build-attacker-architecture"

function edge(over: Record<string, unknown>) {
  return {
    direction: "out",
    type: "ACCESSES_RESOURCE",
    neighbor_id: "",
    neighbor_arn: null,
    neighbor_name: null,
    neighbor_labels: [],
    neighbor_type: "S3Bucket",
    observed: true,
    bytes: null,
    on_path: false,
    significance: "data",
    ...over,
  }
}

function path(): IdentityAttackPath {
  return {
    id: "P1",
    crown_jewel_id: "jewel",
    nodes: [
      // Role serialized by its opaque AROA id (real-data shape).
      { id: "AROA23JBKAVDQCMGEX66T", name: "AROA23JBKAVDQCMGEX66T", type: "IAMRole", tier: "identity" },
      { id: "jewel", name: "prod-data", type: "S3Bucket", tier: "crown_jewel" },
    ],
    edges: [],
  } as unknown as IdentityAttackPath
}

function canvas(laterals: Record<string, unknown[]>): GraphViewResponse {
  return {
    system_name: "alon-prod",
    node_count: 3,
    nodes: [
      {
        id: "AROA23JBKAVDQCMGEX66T",
        name: "AROA23JBKAVDQCMGEX66T",
        type: "IAMRole",
        key_properties: { arn: "arn:aws:iam::745783559495:role/alon-demo-ec2-role" },
      },
      { id: "shadow-s3", name: "shadow-s3-bucket", type: "S3Bucket", key_properties: {} },
      { id: "web", name: "cyntro-web-server", type: "EC2Instance", key_properties: {} },
    ],
    laterals_by_node: laterals as GraphViewResponse["laterals_by_node"],
    generated_at: "2026-06-14T00:00:00Z",
  } as unknown as GraphViewResponse
}

describe("deriveReachableNeighborsFromCanvas", () => {
  it("returns [] for missing path or canvas", () => {
    expect(deriveReachableNeighborsFromCanvas(null, canvas({}))).toEqual([])
    expect(deriveReachableNeighborsFromCanvas(path(), null)).toEqual([])
    expect(deriveReachableNeighborsFromCanvas(path(), {} as GraphViewResponse)).toEqual([])
  })

  it("derives a role's lateral reach from qualifying out-edges", () => {
    const out = deriveReachableNeighborsFromCanvas(
      path(),
      canvas({
        "AROA23JBKAVDQCMGEX66T": [
          edge({ neighbor_id: "shadow-s3", neighbor_name: "shadow-s3-bucket", significance: "data" }),
          edge({ neighbor_id: "web", neighbor_name: "cyntro-web-server", neighbor_type: "EC2Instance", significance: "network" }),
        ],
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0].neighbor_count).toBe(2)
    expect(out[0].neighbors.map((n) => n.id).sort()).toEqual(["shadow-s3", "web"])
  })

  it("resolves the friendly role name from the canvas ARN, never the AROA (BE-8)", () => {
    const out = deriveReachableNeighborsFromCanvas(
      path(),
      canvas({
        "AROA23JBKAVDQCMGEX66T": [edge({ neighbor_id: "shadow-s3", neighbor_name: "shadow-s3-bucket" })],
      }),
    )
    expect(out[0].role_name).toBe("alon-demo-ec2-role")
    expect(out[0].role_name).not.toContain("AROA")
  })

  it("filters in-edges, on-path edges, on-spine targets, noise significance, and skip types", () => {
    const out = deriveReachableNeighborsFromCanvas(
      path(),
      canvas({
        "AROA23JBKAVDQCMGEX66T": [
          edge({ neighbor_id: "in-only", direction: "in", neighbor_name: "x" }),
          edge({ neighbor_id: "on-path", on_path: true, neighbor_name: "y" }),
          edge({ neighbor_id: "jewel", neighbor_name: "prod-data" }), // already on the spine
          edge({ neighbor_id: "ctrl", significance: "control", neighbor_name: "z" }), // noise
          edge({ neighbor_id: "unk", neighbor_type: "Unknown", neighbor_name: "w" }), // skip type
        ],
      }),
    )
    expect(out).toEqual([]) // every edge filtered → no invented reach
  })

  it("aggregates repeated edges to the same neighbor and counts edge_types", () => {
    const out = deriveReachableNeighborsFromCanvas(
      path(),
      canvas({
        "AROA23JBKAVDQCMGEX66T": [
          edge({ neighbor_id: "shadow-s3", neighbor_name: "shadow-s3-bucket", type: "ACCESSES_RESOURCE" }),
          edge({ neighbor_id: "shadow-s3", neighbor_name: "shadow-s3-bucket", type: "ASSUMES_ROLE" }),
        ],
      }),
    )
    expect(out[0].neighbor_count).toBe(1)
    expect(out[0].neighbors[0].edge_count).toBe(2)
    expect(out[0].neighbors[0].edge_types).toEqual(["ACCESSES_RESOURCE", "ASSUMES_ROLE"])
  })
})
