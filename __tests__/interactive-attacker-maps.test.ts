import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { buildAtlasLateralFlowGraph } from "@/components/attack-paths-v2/atlas-lateral-flow-map"
import type {
  AtlasFootholdCandidate,
  AtlasLateralChain,
} from "@/components/attack-paths-v2/use-atlas-lateral"

const ROOT = join(__dirname, "..")

const foothold: AtlasFootholdCandidate = {
  workload_id: "i-123",
  workload_name: "web-server",
  workload_type: "EC2Instance",
  role_arn: null,
  role_name: null,
  foothold_likelihood: "ASSUMED_COMPROMISE",
  foothold_reasons: [],
  observed_access_to_jewel: false,
  access_last_seen: null,
  security_group_ids: [],
}

const chain: AtlasLateralChain = {
  chain_id: "chain-1",
  total_cost: 2,
  feasibility_score: 1,
  primitives_used: ["HAS_INSTANCE_PROFILE_CAPTURE", "S3_GETOBJECT_DATA_ACCESS"],
  blocking_controls: [],
  assumptions_consumed: ["stolen_iam_access_key"],
  steps: [
    {
      step_index: 0,
      primitive_id: "HAS_INSTANCE_PROFILE_CAPTURE",
      state_delta: {
        added_compromised_workloads: [],
        added_captured_identities: ["arn:aws:iam::123:role/web-role"],
        added_accessible_resources: [],
        added_synthetic_edges: [],
        added_synthetic_nodes: [],
      },
      edge_evidence_ids: ["edge-profile-role"],
    },
    {
      step_index: 1,
      primitive_id: "S3_GETOBJECT_DATA_ACCESS",
      state_delta: {
        added_compromised_workloads: [],
        added_captured_identities: [],
        added_accessible_resources: ["arn:aws:s3:::jewel"],
        added_synthetic_edges: [],
        added_synthetic_nodes: [],
      },
      edge_evidence_ids: ["edge-role-bucket"],
    },
  ],
}

describe("interactive attacker maps", () => {
  it("projects exact ATLAS transitions into an interactive semantic flow", () => {
    const graph = buildAtlasLateralFlowGraph(chain, foothold, "jewel")

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "foothold",
      "step-0",
      "step-1",
      "jewel",
    ])
    expect(graph.nodes[1]?.data.kind).toBe("identity")
    expect(graph.nodes[1]?.data.result).toBe("arn:aws:iam::123:role/web-role")
    expect(graph.nodes[2]?.data.kind).toBe("data")
    expect(graph.edges.map((edge) => edge.label)).toEqual([
      "identity",
      "data access",
      undefined,
    ])
    expect(graph.edges.every((edge) => edge.animated)).toBe(true)
  })

  it("wires both Zoom0 attacker lenses to interactive map engines", () => {
    const zoom0 = readFileSync(
      join(ROOT, "components/attack-paths-v2/zoom0-fan-in-panel.tsx"),
      "utf8",
    )
    const lateral = readFileSync(
      join(ROOT, "components/attack-paths-v2/atlas-lateral-flow-map.tsx"),
      "utf8",
    )

    expect(lateral).toContain("<ReactFlow")
    expect(lateral).toContain("<Controls")
    expect(lateral).toContain("<MiniMap")
    expect(zoom0).toContain('data-testid="zoom0-exfil-interactive-map"')
    expect(zoom0).toContain("architectureOverride={exfilArchitecture}")
    expect(zoom0).not.toContain("zoom0-lens-map-unavailable")
  })
})
