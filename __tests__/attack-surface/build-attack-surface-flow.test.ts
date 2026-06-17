import { describe, expect, it } from "vitest"
import { assignColumnForLabel, buildAttackSurfaceFlow } from "@/lib/attack-surface/build-attack-surface-flow"
import { classifySurfaceEdge } from "@/lib/attack-surface/edge-classification"
import { SURFACE_COLUMNS } from "@/lib/attack-surface/column-schema"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture, NodeType } from "@/components/dependency-map/traffic-flow-map"

describe("assignColumnForLabel", () => {
  it("maps Neo4j-style labels to swimlanes", () => {
    expect(assignColumnForLabel(["Compute", "EC2Instance"])).toBe("entry_compute")
    expect(assignColumnForLabel(["SecurityGroup"])).toBe("firewalls")
    expect(assignColumnForLabel(["RouteTable"])).toBe("transit")
    expect(assignColumnForLabel(["IAMRole"])).toBe("identity")
    expect(assignColumnForLabel(["S3Bucket", "CrownJewels"])).toBe("crown_jewels")
  })
})

describe("classifySurfaceEdge", () => {
  it("classifies network, identity, and exfil relationships", () => {
    expect(classifySurfaceEdge("IN_SUBNET")).toBe("network")
    expect(classifySurfaceEdge("ASSUMES_ROLE")).toBe("identity")
    expect(classifySurfaceEdge("EXFIL_VIA_SHARING")).toBe("exfil")
    expect(
      classifySurfaceEdge("ACCESSES_RESOURCE", { targetIsJewel: true, observed: true }),
    ).toBe("exfil")
    expect(
      classifySurfaceEdge("ACCESSES_RESOURCE", { targetIsJewel: true, observed: false }),
    ).toBe("identity")
  })
})

describe("buildAttackSurfaceFlow", () => {
  it("places nodes in fixed X columns and styles edges by relationship", () => {
    const arch: SystemArchitecture = {
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
          type: "s3bucket" as unknown as NodeType,
          isCrownJewel: true,
        },
      ],
      subnets: [
        {
          id: "subnet-1b",
          name: "subnet-1b",
          shortName: "subnet-1b",
          isPublic: true,
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
      instanceProfiles: [],
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
    expect(resourceNodes.length).toBeGreaterThanOrEqual(5)

    const compute = resourceNodes.find((n) => n.id === "i-0aa725")!
    const sg = resourceNodes.find((n) => n.id === "sg-abc")!
    const jewel = resourceNodes.find((n) => n.id === "arn:aws:s3:::logs")!

    expect(compute.position.x).toBe(SURFACE_COLUMNS[0].x)
    expect(sg.position.x).toBe(SURFACE_COLUMNS[1].x)
    expect(jewel.position.x).toBe(SURFACE_COLUMNS[5].x)
    expect(jewel.data).toMatchObject({ isCrownJewel: true })

    const roleNode = resourceNodes.find((n) => n.id === "role-1")!
    expect(roleNode.data?.metric).toBe("23 Unused Permissions")

    expect(result.edges.find((e) => e.id === "e-net")?.data?.flowKind).toBe("network")
    expect(result.edges.find((e) => e.id === "e-id")?.data?.flowKind).toBe("identity")
    expect(result.edges.find((e) => e.id === "e-exfil")?.data?.flowKind).toBe("exfil")

    expect(result.nodes.some((n) => n.type === "surfaceJewelZone")).toBe(true)
    expect(result.width).toBeGreaterThan(1200)
  })
})
