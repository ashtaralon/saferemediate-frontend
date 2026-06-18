import { describe, expect, it } from "vitest"
import {
  assignColumnForLabel,
  buildAttackSurfaceFlow,
  SURFACE_ATTACKER_ID,
} from "@/lib/attack-surface/build-attack-surface-flow"
import { classifySurfaceEdge } from "@/lib/attack-surface/edge-classification"
import { BLUEPRINT_COORDS } from "@/lib/attack-surface/blueprint-layout"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture, NodeType } from "@/components/dependency-map/traffic-flow-map"

describe("assignColumnForLabel", () => {
  it("maps Neo4j-style labels to blueprint slots", () => {
    expect(assignColumnForLabel(["Compute", "EC2Instance"])).toBe("compute")
    expect(assignColumnForLabel(["SecurityGroup"])).toBe("security_group")
    expect(assignColumnForLabel(["RouteTable"])).toBe("route_table")
    expect(assignColumnForLabel(["IAMRole"])).toBe("iam_role")
    expect(assignColumnForLabel(["S3Bucket", "CrownJewels"])).toBe("crown_jewel")
  })
})

describe("classifySurfaceEdge", () => {
  it("classifies network, identity, attack, and exfil relationships", () => {
    expect(classifySurfaceEdge("IN_SUBNET")).toBe("network")
    expect(classifySurfaceEdge("ASSUMES_ROLE")).toBe("identity")
    expect(classifySurfaceEdge("EXFIL_VIA_SHARING")).toBe("exfil")
    expect(
      classifySurfaceEdge("ROUTES_VIA", { sourceIsEntry: true, targetIsCompute: true }),
    ).toBe("attack")
    expect(
      classifySurfaceEdge("ACCESSES_RESOURCE", { targetIsJewel: true, observed: true }),
    ).toBe("exfil")
  })
})

describe("buildAttackSurfaceFlow", () => {
  it("places nodes on blueprint coordinates and styles edges by relationship", () => {
    const arch: SystemArchitecture = {
      entryPoints: [
        {
          id: "internet-1",
          name: "Internet",
          shortName: "Internet",
          type: "internet" as unknown as NodeType,
        },
      ],
      computeServices: [
        {
          id: "i-0aa725",
          name: "alon-demo-app2",
          shortName: "alon-demo-app2",
          type: "compute" as unknown as NodeType,
        },
      ],
      resources: [
        {
          id: "arn:aws:s3:::logs",
          name: "saferemediate-logs",
          shortName: "saferemediate-logs",
          type: "storage" as unknown as NodeType,
          isCrownJewel: true,
        },
      ],
      subnets: [
        {
          id: "subnet-1b",
          name: "subnet-1b",
          shortName: "subnet-1b",
          isPublic: false,
          vpcId: "vpc-086bcc",
          availabilityZone: "eu-west-1b",
          connectedComputeIds: ["i-0aa725"],
          routeTableId: "rtb-main",
          routeTableCount: 4,
        },
      ],
      securityGroups: [
        {
          id: "sg-abc",
          type: "security_group",
          name: "alon-demo-app-sg",
          shortName: "alon-demo-app-sg",
          usedCount: 2,
          totalCount: 5,
          gapCount: 3,
          connectedSources: [],
          connectedTargets: [],
          onPath: true,
        },
      ],
      nacls: [],
      iamRoles: [
        {
          id: "role-1",
          type: "iam_role",
          name: "alon-demo-ec2-role",
          shortName: "alon-demo-ec2-role",
          usedCount: 1,
          totalCount: 24,
          gapCount: 23,
          connectedSources: [],
          connectedTargets: [],
          onPath: true,
        },
      ],
      instanceProfiles: [
        {
          id: "ip-1",
          type: "iam_role",
          name: "alon-demo-ec2-profile",
          shortName: "alon-demo-ec2-profile",
          usedCount: 1,
          totalCount: 1,
          gapCount: 0,
          connectedSources: [],
          connectedTargets: [],
          onPath: true,
        },
      ],
      egressGateways: [
        {
          id: "igw-1",
          name: "igw",
          shortName: "igw-1",
          vpcId: "vpc-086bcc",
          kind: "InternetGateway",
          kindLabel: "IGW",
        },
      ],
      vpcEndpoints: [],
      flows: [],
      edges: [
        {
          id: "e-net",
          source_aws_id: "i-0aa725",
          target_aws_id: "subnet-1b",
          relationship: "IN_SUBNET",
          observed: true,
          hit_count: 1,
          bytes: null,
          first_seen: null,
          last_seen: null,
          port: null,
          protocol: null,
        },
        {
          id: "e-id",
          source_aws_id: "i-0aa725",
          target_aws_id: "role-1",
          relationship: "HAS_INSTANCE_PROFILE",
          observed: true,
          hit_count: 1,
          bytes: null,
          first_seen: null,
          last_seen: null,
          port: null,
          protocol: null,
        },
        {
          id: "e-exfil",
          source_aws_id: "role-1",
          target_aws_id: "arn:aws:s3:::logs",
          relationship: "ACCESSES_RESOURCE",
          observed: true,
          hit_count: 12,
          bytes: null,
          first_seen: null,
          last_seen: null,
          port: null,
          protocol: null,
        },
      ],
      totalBytes: 0,
      totalConnections: 0,
      totalGaps: 0,
      region: "eu-west-1",
      onPathNodeIds: new Set(["i-0aa725", "role-1", "arn:aws:s3:::logs"]),
      onPathEdgeIds: new Set(["e-net", "e-id", "e-exfil"]),
    }

    const path = {
      id: "p1",
      nodes: [
        { id: "i-0aa725", name: "alon-demo-app2", type: "EC2" },
        { id: "role-1", name: "role", type: "IAMRole" },
        { id: "arn:aws:s3:::logs", name: "jewel", type: "S3Bucket" },
      ],
      edges: [],
    } as unknown as IdentityAttackPath

    const result = buildAttackSurfaceFlow({ architecture: arch, path })

    const resourceNodes = result.nodes.filter((n) => n.type === "surfaceResource")
    expect(resourceNodes.length).toBeGreaterThanOrEqual(6)

    const compute = resourceNodes.find((n) => n.id === "i-0aa725")!
    const sg = resourceNodes.find((n) => n.id === "sg-abc")!
    const jewel = resourceNodes.find((n) => n.id === "arn:aws:s3:::logs")!
    const attacker = resourceNodes.find((n) => n.id === SURFACE_ATTACKER_ID)!

    expect(compute.position).toEqual(BLUEPRINT_COORDS.compute)
    expect(sg.position).toEqual(BLUEPRINT_COORDS.security_group)
    expect(jewel.position).toEqual(BLUEPRINT_COORDS.crown_jewel)
    expect(attacker?.position).toEqual(BLUEPRINT_COORDS.attacker)
    expect(jewel.data).toMatchObject({ isCrownJewel: true, awsType: "STORAGE" })

    const roleNode = resourceNodes.find((n) => n.id === "role-1")!
    expect((roleNode.data as { alertText?: string })?.alertText).toContain("23 Unused Permissions")

    expect(result.edges.find((e) => e.id === "e-net")?.data?.flowKind).toBe("network")
    expect(result.edges.find((e) => e.id === "e-id")?.data?.flowKind).toBe("identity")
    expect(result.edges.find((e) => e.id === "e-exfil")?.data?.flowKind).toBe("exfil")
    expect(result.edges.some((e) => e.id === "syn-attacker-igw")).toBe(true)

    expect(result.nodes.some((n) => n.type === "surfaceJewelZone")).toBe(true)
    expect(result.width).toBeGreaterThan(1600)
  })
})
