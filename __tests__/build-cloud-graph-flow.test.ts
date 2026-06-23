import { describe, expect, it } from "vitest"
import { orderPathFlowEdges, layoutCloudGraphFlow } from "@/components/attack-paths-v2/build-cloud-graph-flow"
import { buildContainmentFromArchitecture } from "@/components/attack-paths-v2/build-containment-from-architecture"
import type { CMEdge } from "@/components/attack-paths-v2/containment-model"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture, NodeType } from "@/components/dependency-map/traffic-flow-map"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"

describe("orderPathFlowEdges", () => {
  it("orders edges by path.nodes chain then spine synthetics", () => {
    const path = {
      nodes: [
        { id: "user", name: "user", type: "Principal" },
        { id: "ec2-a", name: "app", type: "EC2" },
        { id: "role-b", name: "role", type: "IAMRole" },
        { id: "s3-j", name: "jewel", type: "S3Bucket" },
      ],
      edges: [],
    } as unknown as IdentityAttackPath

    const edges: CMEdge[] = [
      { id: "syn-role-jewel", layer: "path", style: "path", color: "#d", d: "", sourceId: "role-b", targetId: "s3-j" },
      { id: "syn-user-igw", layer: "path", style: "path", color: "#d", d: "", sourceId: "user", targetId: "igw-1" },
      { id: "e1", layer: "path", style: "path", color: "#d", d: "", sourceId: "ec2-a", targetId: "role-b" },
      { id: "e0", layer: "path", style: "path", color: "#d", d: "", sourceId: "user", targetId: "ec2-a" },
    ]

    const cardIds = new Set(["user", "ec2-a", "role-b", "s3-j", "igw-1"])
    const ordered = orderPathFlowEdges(path, edges, cardIds)

    expect(ordered.map((o) => o.edgeId)).toEqual(["e0", "e1", "syn-role-jewel", "syn-user-igw"])
    expect(ordered[0].step).toBe(1)
    expect(ordered[ordered.length - 1].step).toBe(4)
  })
})

describe("layoutCloudGraphFlow", () => {
  it("renders nested containment frames and all cards", async () => {
    const arch: SystemArchitecture = {
      computeServices: [{ id: "i-0aa725", name: "alon-demo-app2", shortName: "alon-demo-app2", type: "ec2instance" as unknown as NodeType }],
      resources: [{ id: "arn:aws:s3:::logs", name: "saferemediate-logs", shortName: "saferemediate-logs", type: "s3bucket" as unknown as NodeType, isCrownJewel: true }],
      subnets: [{ id: "subnet-1b", name: "subnet-1b", shortName: "subnet-1b", isPublic: true, vpcId: "vpc-086bcc", availabilityZone: "eu-west-1b", connectedComputeIds: ["i-0aa725"] }],
      securityGroups: [], nacls: [],
      iamRoles: [{ id: "role-1", type: "iam_role", name: "alon-demo-ec2-role", shortName: "alon-demo-ec2-role", usedCount: 1, totalCount: 1, gapCount: 0, connectedSources: [], connectedTargets: [] }],
      instanceProfiles: [{ id: "ip-1", type: "iam_role", name: "alon-demo-ec2-profile", shortName: "alon-demo-ec2-profile", usedCount: 1, totalCount: 1, gapCount: 0, connectedSources: [], connectedTargets: [] }],
      egressGateways: [{ id: "igw-1", name: "igw", shortName: "igw-1", vpcId: "vpc-086bcc", kind: "InternetGateway", kindLabel: "IGW" }],
      vpcEndpoints: [],
      flows: [], edges: [{ id: "e1", source_aws_id: "i-0aa725", target_aws_id: "role-1", relationship: "HAS_INSTANCE_PROFILE", observed: true, hit_count: 1, bytes: null, first_seen: null, last_seen: null, port: null, protocol: null }],
      totalBytes: 0, totalConnections: 0, totalGaps: 0,
      vpcGroups: [{ vpcId: "vpc-086bcc", vpcName: "default", cidrBlock: "172.31.0.0/16", subnets: [] }],
      region: "eu-west-1",
      onPathNodeIds: new Set(["i-0aa725", "role-1", "arn:aws:s3:::logs", "igw-1"]),
      onPathEdgeIds: new Set(["e1"]),
    }
    const path = { id: "p1", nodes: [{ id: "i-0aa725", name: "alon-demo-app2", type: "EC2" }, { id: "role-1", name: "role", type: "IAMRole" }], edges: [] } as unknown as IdentityAttackPath
    const report = { current_state: { source_label: "alon-demo-app2", target_label: "saferemediate-logs" }, gates: {}, remediation_diff: { remove_actions: [] } } as unknown as AttackPathReport
    const model = buildContainmentFromArchitecture(arch, path, report, "full")!
    const result = await layoutCloudGraphFlow(model, path, "full")
    expect(result.nodes.some((n) => n.type === "container" && n.data?.kind === "vpc")).toBe(true)
    expect(result.nodes.some((n) => n.type === "container" && n.data?.kind === "az")).toBe(true)
    expect(result.nodes.some((n) => n.type === "container" && n.data?.kind === "subnet")).toBe(true)
    expect(result.nodes.filter((n) => n.type === "resource").length).toBe(model.cards.length)
    expect(result.width).toBeGreaterThan(0)
  }, 8000)
})
