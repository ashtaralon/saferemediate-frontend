import { describe, expect, it } from "vitest"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import {
  attackPathEdgesToTrafficEdges,
  depMapEdgesToTrafficEdges,
  selectEstateFlowEdges,
} from "@/components/topology-v0-2/estate-flow-edges"
import type { TopologyNode } from "@/components/topology-v0-2/types"

function node(id: string, type: string | null = "Lambda"): TopologyNode {
  return { id, name: id, type, subnet_id: null, score: null, stale: null, is_jewel: false }
}

describe("estate-flow-edges", () => {
  it("maps dependency-map access edges to drawable traffic edges", () => {
    const visible = new Set(["lambda-a", "bucket-b"])
    const index = new Map([["lambda-a", "lambda-a"], ["bucket-b", "bucket-b"]])
    const types = new Map([["lambda-a", "Lambda"], ["bucket-b", "S3"]])
    const out = depMapEdgesToTrafficEdges(
      [{ source: "lambda-a", target: "bucket-b", type: "ACTUAL_S3_ACCESS", protocol: "s3:GetObject" }],
      visible,
      index,
      types,
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.edge_class).toBe("edge_service")
    expect(out[0]?.target_id).toBe("bucket-b")
  })

  it("attack paths only uses IAP path edges, not dep-map re-filter", () => {
    const visible = new Set(["lambda-a", "bucket-b"])
    const index = new Map([["lambda-a", "lambda-a"], ["bucket-b", "bucket-b"]])
    const types = new Map([["lambda-a", "Lambda"], ["bucket-b", "S3"]])
    const paths: IdentityAttackPath[] = [
      {
        id: "p1",
        attack_path_id: "ap-1",
        materialized: true,
        crown_jewel_id: "bucket-b",
        nodes: [],
        edges: [
          {
            source: "lambda-a",
            target: "bucket-b",
            type: "ACTUAL_S3_ACCESS",
            label: "access",
            port: null,
            protocol: "s3:GetObject",
            is_observed: true,
          },
        ],
        severity: { score: 90, tier: "CRITICAL", factors: [] },
        path_kind: "identity",
        evidence_type: "observed",
        hop_count: 1,
      },
    ]
    const attack = attackPathEdgesToTrafficEdges(paths, visible, index, types, [], true)
    expect(attack[0]?.flow_highlight).toBe("attack_path")

    const all = selectEstateFlowEdges({
      mode: "all_access",
      depMapEdges: [],
      attackPaths: paths,
      materializationAvailable: true,
      topologyTrafficEdges: [],
      visible,
      index,
      nodeTypeById: types,
    })
    expect(all[0]?.flow_highlight).toBeUndefined()

    const filtered = selectEstateFlowEdges({
      mode: "attack_paths",
      depMapEdges: [
        { source: "lambda-a", target: "bucket-b", type: "ACTUAL_TRAFFIC" },
      ],
      attackPaths: paths,
      materializationAvailable: true,
      topologyTrafficEdges: [],
      visible,
      index,
      nodeTypeById: types,
    })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.flow_highlight).toBe("attack_path")
    expect(filtered[0]?.protocol).toBe("s3:GetObject")
  })

  it("skips IAM plumbing hops that are not drawable estate flows", () => {
    const visible = new Set(["role-a", "lambda-a"])
    const index = new Map([
      ["role-a", "role-a"],
      ["lambda-a", "lambda-a"],
    ])
    const types = new Map([
      ["role-a", "IAMRole"],
      ["lambda-a", "Lambda"],
    ])
    const paths: IdentityAttackPath[] = [
      {
        id: "p1",
        attack_path_id: "ap-1",
        materialized: true,
        crown_jewel_id: "lambda-a",
        nodes: [],
        edges: [
          {
            source: "role-a",
            target: "lambda-a",
            type: "ASSUMES_ROLE_ACTUAL",
            label: "assume",
            port: null,
            protocol: null,
            is_observed: true,
          },
        ],
        severity: { score: 50, tier: "HIGH", factors: [] },
        path_kind: "identity",
        evidence_type: "observed",
        hop_count: 1,
      },
    ]
    expect(
      attackPathEdgesToTrafficEdges(paths, visible, index, types, [], true),
    ).toHaveLength(0)
  })
})
