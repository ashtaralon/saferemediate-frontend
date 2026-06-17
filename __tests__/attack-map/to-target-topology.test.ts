import { describe, expect, it } from "vitest"
import { toTargetTopology } from "@/lib/attack-map/to-target-topology"
import type { AttackMapPayload, TopologySnapshot } from "@/lib/attack-map/slot-mapper"

const payload: AttackMapPayload = {
  system: "alon-prod",
  path_id: "test-path",
  score: 25,
  severity: "high",
  movement_chain: [
    { node_id: "internet", node_type: "Internet", verdict: "ENTRY" },
    {
      node_id: "i-0abc",
      node_type: "EC2Instance",
      verdict: "ALLOWED",
      subnet_id: "subnet-a",
      az: "eu-west-1a",
    },
    {
      node_id: "arn:aws:iam::123:role/demo-role",
      node_type: "IAMRole",
      verdict: "ALLOWED",
    },
    {
      node_id: "arn:aws:s3:::jewel-bucket",
      node_type: "S3Bucket",
      verdict: "ALLOWED",
      is_crown_jewel: true,
    },
  ],
  constraint_edges: [],
  blast: { crown_jewels_reachable: 1, shared_workloads: [] },
  collection_gaps: ["flow_logs_disabled"],
}

const topology: TopologySnapshot = {
  system: "alon-prod",
  vpc: { x: 40, y: 80, w: 400, h: 200 },
  subnets: {
    "subnet-a": { id: "subnet-a", az: "eu-west-1a", kind: "public", x: 60, y: 100, w: 120, h: 80 },
  },
  groups: {},
  membership: {},
  resources: [
    {
      node_id: "i-0abc",
      node_type: "EC2Instance",
      name: "web-server",
      subnet_id: "subnet-a",
      az: "eu-west-1a",
      group_id: "g1",
    },
  ],
  crown_jewels: [
    { node_id: "arn:aws:s3:::jewel-bucket", node_type: "S3Bucket", name: "jewel-bucket", column_index: 0, row_index: 0 },
  ],
  crown_jewel_column: { x: 500, top_y: 100, row_height: 40, col_step: 100, capacity: 10, max_columns: 2 },
  drift_lane: { x: 40, y: 300, w: 400, h: 60 },
  orphan_lane: { x: 460, y: 300, w: 100, h: 60 },
  external_slots: {
    internet: { x: 200, y: 40 },
    onprem: { x: 100, y: 40 },
    open_cidr: { x: 300, y: 40 },
  },
}

describe("toTargetTopology", () => {
  it("maps movement chain to nodes and edges with friendly labels", () => {
    const topo = toTargetTopology(payload, topology)
    expect(topo.system).toBe("alon-prod")
    expect(topo.score).toBe(25)
    expect(topo.nodes.some((n) => n.id === "i-0abc" && n.onPath)).toBe(true)
    expect(topo.nodes.find((n) => n.id === "arn:aws:iam::123:role/demo-role")?.label).toBe("demo-role")
    expect(topo.edges.length).toBe(3)
    expect(topo.gaps).toEqual([{ label: "flow_logs_disabled", status: "MEDIUM" }])
  })

  it("never uses raw AROA-style names as labels", () => {
    const withAroa: AttackMapPayload = {
      ...payload,
      movement_chain: [
        {
          node_id: "arn:aws:iam::123:role/AROAEXAMPLE123",
          node_type: "IAMRole",
          verdict: "ALLOWED",
        },
      ],
    }
    const topo = toTargetTopology(withAroa, topology)
    const role = topo.nodes.find((n) => n.type === "iam")
    expect(role?.label).toBe("IAM Role")
  })
})
