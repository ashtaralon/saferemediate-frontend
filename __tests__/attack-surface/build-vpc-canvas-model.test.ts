import { describe, expect, it } from "vitest"
import { buildVpcCanvasModel } from "@/lib/attack-surface/build-vpc-canvas-model"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture, NodeType } from "@/components/dependency-map/traffic-flow-map"

describe("buildVpcCanvasModel", () => {
  it("maps architecture nodes into the VPC canvas liveData shape", () => {
    const arch: SystemArchitecture = {
      computeServices: [
        {
          id: "i-0aa725",
          name: "alon-demo-app2",
          shortName: "alon-demo-app2",
          type: "compute" as unknown as NodeType,
          instanceId: "i-0aa725",
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
          cidrBlock: "10.0.11.0/24",
          connectedComputeIds: ["i-0aa725"],
          routeTableId: "rtb-main",
          routeTableCount: 2,
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
          gapCount: 0,
          connectedSources: [],
          connectedTargets: [],
        },
      ],
      nacls: [
        {
          id: "acl-07e8",
          type: "nacl",
          name: "acl-07e8",
          shortName: "acl-07e8be9e7f719df3e",
          usedCount: 0,
          totalCount: 0,
          gapCount: 0,
          connectedSources: [],
          connectedTargets: [],
        },
      ],
      iamRoles: [
        {
          id: "role-1",
          type: "iam_role",
          name: "alon-demo-ec2-role",
          shortName: "alon-demo-ec2-role",
          usedCount: 1,
          totalCount: 8,
          gapCount: 7,
          connectedSources: [],
          connectedTargets: [],
        },
      ],
      instanceProfiles: [],
      egressGateways: [
        {
          id: "igw-1",
          name: "Payment-Production-IGW",
          shortName: "Payment-Production-IGW",
          vpcId: "vpc-1",
          kind: "InternetGateway",
          kindLabel: "IGW",
        },
      ],
      vpcEndpoints: [],
      flows: [],
      totalBytes: 0,
      totalConnections: 0,
      totalGaps: 0,
      vpcGroups: [{ vpcId: "vpc-1", vpcName: "Payment-Production", subnets: [] }],
      entryPoints: [
        {
          id: "internet",
          name: "Internet",
          shortName: "Internet",
          type: "internet" as unknown as NodeType,
        },
      ],
    }

    const path = {
      id: "p1",
      nodes: [{ id: "i-0aa725", name: "app", type: "EC2" }],
      edges: [],
    } as unknown as IdentityAttackPath

    const model = buildVpcCanvasModel(arch, path)
    expect(model).not.toBeNull()
    expect(model!.appServer?.name).toBe("alon-demo-app2")
    expect(model!.subnet?.cidr).toBe("10.0.11.0/24")
    expect(model!.iamRole?.alert).toBe("7 Unused Perms")
    expect(model!.crownJewel?.arn).toBe("arn:aws:s3:::logs")
    expect(model!.igw?.name).toBe("Payment-Production-IGW")
  })
})
