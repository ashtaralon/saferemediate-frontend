import { describe, expect, it } from "vitest"
import {
  layoutPayload,
  type AttackMapPayload,
  type DensityRules,
  type GroupBox,
  type JewelColumn,
  type SubnetBox,
  type TopologySnapshot,
} from "@/lib/attack-map/slot-mapper"
import { layoutPayload3D } from "@/lib/attack-map/slot-mapper-3d"

const DENSITY: DensityRules = {
  jewel_column_capacity: 10,
  tile_w: 90,
  tile_h: 30,
  tile_gap: 6,
  tiles_per_row: 4,
}

function makeSubnet(id: string, az: string, x: number, y: number): SubnetBox {
  return { id, az, kind: "private", x, y, w: 320, h: 180 }
}

function makeGroup(id: string, subnet_id: string, x: number, y: number): GroupBox {
  return { id, subnet_id, kind: "sg_cluster", capacity: 8, x, y, w: 260, h: 120 }
}

function makeTopology(): TopologySnapshot {
  const subnets = [makeSubnet("subnet-app", "eu-west-1a", 40, 200)].reduce<Record<string, SubnetBox>>(
    (acc, s) => ((acc[s.id] = s), acc),
    {},
  )
  const groups = [makeGroup("grp-1", "subnet-app", 56, 220)].reduce<Record<string, GroupBox>>(
    (acc, g) => ((acc[g.id] = g), acc),
    {},
  )
  const jewel: JewelColumn = { x: 1100, top_y: 60, row_height: 40, col_step: -110, capacity: 10, max_columns: 3 }
  return {
    system: "demo",
    vpc: { x: 20, y: 60, w: 1060, h: 520 },
    subnets,
    groups,
    membership: {
      "i-abc": { subnet_id: "subnet-app", az: "eu-west-1a", group_id: "grp-1" },
    },
    resources: [],
    crown_jewels: [],
    crown_jewel_column: jewel,
    drift_lane: { x: 20, y: 620, w: 1060, h: 80 },
    orphan_lane: { x: 20, y: 710, w: 1060, h: 80 },
    external_slots: { internet: { x: 540, y: 30 }, open_cidr: { x: 540, y: 30 } },
  }
}

const minimalPayload: AttackMapPayload = {
  system: "demo",
  path_id: "path-1",
  score: 78,
  severity: "high",
  movement_chain: [
    { node_id: "internet", node_type: "Internet", verdict: "ENTRY" },
    {
      node_id: "i-abc",
      node_type: "EC2Instance",
      verdict: "SEEN",
      subnet_id: "subnet-app",
      az: "eu-west-1a",
    },
    { node_id: "role-1", node_type: "IAMRole", verdict: "ALLOWED" },
    { node_id: "bucket-1", node_type: "S3Bucket", verdict: "ALLOWED", is_crown_jewel: true },
  ],
  constraint_edges: [],
  blast: { crown_jewels_reachable: 1, shared_workloads: [] },
}

describe("layoutPayload3D", () => {
  it("produces deterministic 3-D coordinates for movement chain", () => {
    const topology = makeTopology()
    const pos2d = layoutPayload(minimalPayload, topology, DENSITY)
    const scene = layoutPayload3D(minimalPayload, topology, DENSITY)
    const again = layoutPayload3D(minimalPayload, topology, DENSITY)

    expect(scene.nodes.length).toBeGreaterThanOrEqual(4)
    expect(scene.pathNodeIds).toEqual(minimalPayload.movement_chain.map((h) => h.node_id))

    const internet = scene.nodes.find((n) => n.id === "internet")!
    const jewel = scene.nodes.find((n) => n.id === "bucket-1")!
    expect(internet.z).toBeLessThan(jewel.z)
    expect(jewel.isCrownJewel).toBe(true)

    expect(scene.nodes.map((n) => [n.x, n.y, n.z])).toEqual(
      again.nodes.map((n) => [n.x, n.y, n.z]),
    )

    expect(pos2d.size).toBeGreaterThan(0)
    expect(scene.edges.filter((e) => e.kind === "movement")).toHaveLength(3)
  })
})
