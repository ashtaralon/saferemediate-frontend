import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { buildAtlasLateralArchitecture } from "@/components/attack-paths-v2/atlas-lateral-flow-map"
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
  it("projects exact ATLAS transitions into the canonical TrafficFlowMap contract", () => {
    const architecture = buildAtlasLateralArchitecture(
      chain,
      foothold,
      "jewel",
      "arn:aws:s3:::jewel",
      "S3Bucket",
    )

    expect(architecture.computeServices[0]?.id).toBe("i-123")
    expect(architecture.iamRoles[0]?.id).toBe("arn:aws:iam::123:role/web-role")
    expect(architecture.modeledMoves?.map((node) => node.name)).toEqual([
      "HAS INSTANCE PROFILE CAPTURE",
      "S3 GETOBJECT DATA ACCESS",
    ])
    expect(architecture.resources).toHaveLength(1)
    expect(architecture.resources[0]?.isCrownJewel).toBe(true)
    expect(architecture.modeledMoves?.[0]?.outcome).toBe("arn:aws:iam::123:role/web-role")
    expect(architecture.edges?.every((edge) => edge.inferred && edge.observed === false)).toBe(true)
    expect(architecture.networkPosture?.settled).toBe(false)
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
    const trafficMap = readFileSync(
      join(ROOT, "components/dependency-map/traffic-flow-map.tsx"),
      "utf8",
    )
    const attackPaths = readFileSync(
      join(ROOT, "components/attack-paths-v2/attack-paths-v2.tsx"),
      "utf8",
    )

    expect(lateral).toContain("<TrafficFlowMap")
    expect(lateral).toContain("architectureOverride={architecture}")
    expect(lateral).toContain('titleOverride="Lateral Movement Map"')
    expect(lateral).toContain('data-testid="atlas-reachable-damage"')
    expect(lateral).toContain("item.reachable_damage?.priority_score")
    expect(lateral).toContain("damage.choke_point?.intent")
    expect(trafficMap).toContain('data-modeled-flow-motion="true"')
    expect(trafficMap).toContain("forceModeledMotion={!!architecture.modeledMoves?.length")
    expect(zoom0).toContain("overflow-y-auto overscroll-contain")
    expect(zoom0).toContain("ref={scrollContainerRef}")
    expect(zoom0).toContain("scrollContainerRef.current?.scrollTo")
    expect(zoom0).toContain('? "h-auto overflow-visible"')
    expect(zoom0).toContain('isExpanded ? "min-h-0" : "min-h-[680px]"')
    expect(zoom0).not.toContain('isExpanded ? "sticky top-0 shadow-sm"')
    expect(attackPaths).toContain("ref={mainScrollRef}")
    expect(attackPaths).toContain("mainScrollRef.current?.scrollTo")
    expect(attackPaths).toContain("mainScrollRef.current?.scrollIntoView")
    expect(attackPaths).toContain("documentScroll={embedded && isPathExpanded}")
    expect(attackPaths).toContain('? "flex flex-col min-h-[78vh] overflow-visible"')
    expect(zoom0).toContain('data-testid="zoom0-exfil-interactive-map"')
    expect(zoom0).toContain("architectureOverride={exfilArchitecture}")
    expect(zoom0).not.toContain("zoom0-lens-map-unavailable")
  })
})
