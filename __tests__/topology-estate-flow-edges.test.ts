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

  it("dep-map fallback does not synthesize VPCE hops without backend evidence", () => {
    const visible = new Set(["rds-a", "bucket-b", "vpce-s3"])
    const index = new Map([
      ["rds-a", "rds-a"],
      ["bucket-b", "bucket-b"],
      ["vpce-s3", "vpce-s3"],
    ])
    const types = new Map([
      ["rds-a", "RDS"],
      ["bucket-b", "S3"],
    ])
    const vpces = [{ id: "vpce-s3", service_name: "com.amazonaws.eu-west-1.s3", endpoint_type: "Gateway" }]
    const out = depMapEdgesToTrafficEdges(
      [{ source: "rds-a", target: "bucket-b", type: "ACTUAL_S3_ACCESS" }],
      visible,
      index,
      types,
      vpces,
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.via_vpce_id).toBeNull()
  })

  it("prefers topology traffic edges over dependency-map when both exist", () => {
    const visible = new Set(["web-a", "app-b"])
    const index = new Map([
      ["web-a", "web-a"],
      ["app-b", "app-b"],
    ])
    const types = new Map([
      ["web-a", "EC2"],
      ["app-b", "EC2"],
    ])
    const topo = [
      {
        source_id: "web-a",
        target_id: "app-b",
        port: 8080,
        protocol: "tcp",
        last_seen: null,
        edge_class: "internal" as const,
        external_destinations: null,
        via_vpce_id: null,
        via_vpce_service_name: null,
      },
    ]
    const out = selectEstateFlowEdges({
      mode: "all_access",
      topologyTrafficEdges: topo,
      depMapEdges: [{ source: "web-a", target: "app-b", type: "ACTUAL_TRAFFIC", port: 443 }],
      visible,
      index,
      nodeTypeById: types,
    })
    expect(out).toHaveLength(1)
    expect(out[0]?.port).toBe(8080)
  })
})
