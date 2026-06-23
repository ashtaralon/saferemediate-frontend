import { describe, expect, it } from "vitest"
import {
  APP_SUBNET_ID,
  buildVpcFlowGraph,
  VPC_CONTAINER_ID,
} from "@/lib/attack-surface/build-vpc-flow"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture, NodeType } from "@/components/dependency-map/traffic-flow-map"

const baseArch = (): SystemArchitecture => ({
  computeServices: [
    {
      id: "i-0aa725",
      name: "SafeRemediate-Test-App-2",
      shortName: "SafeRemediate-Test-App-2",
      type: "compute" as unknown as NodeType,
      instanceId: "i-0e9b891793b5b2dbd",
    },
  ],
  resources: [
    {
      id: "arn:aws:s3:::cyntro-demo-prod-data",
      name: "cyntro-demo-prod-data",
      shortName: "cyntro-demo-prod-data",
      type: "storage" as unknown as NodeType,
      isCrownJewel: true,
    },
  ],
  subnets: [
    {
      id: "subnet-1b",
      name: "SafeRemediate-Private-App-2",
      shortName: "SafeRemediate-Private-App-2",
      isPublic: false,
      cidrBlock: "10.0.11.0/24",
      connectedComputeIds: ["i-0aa725"],
      routeTableId: "rtb-0cd30616d71ae7566",
      routeTableCount: 2,
    },
  ],
  securityGroups: [
    {
      id: "sg-02a2ccfe185765527",
      type: "security_group",
      name: "saferemediate-test-app-sg",
      shortName: "saferemediate-test-app-sg",
      usedCount: 2,
      totalCount: 5,
      gapCount: 0,
      connectedSources: [],
      connectedTargets: [],
    },
  ],
  nacls: [],
  iamRoles: [
    {
      id: "role-1",
      type: "iam_role",
      name: "cyntro-demo-ec2-s3-role",
      shortName: "cyntro-demo-ec2-s3-role",
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
      id: "igw-03bb3f19b706abbc4",
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
})

describe("buildVpcFlowGraph", () => {
  it("emits nested VPC group, subnet, compute, and SG overlay nodes", () => {
    const path = {
      id: "p1",
      nodes: [{ id: "i-0aa725", name: "app", type: "EC2" }],
      edges: [],
    } as unknown as IdentityAttackPath

    const graph = buildVpcFlowGraph(baseArch(), path)
    expect(graph).not.toBeNull()

    const vpc = graph!.nodes.find((n) => n.id === VPC_CONTAINER_ID)
    const subnet = graph!.nodes.find((n) => n.id === APP_SUBNET_ID)
    const compute = graph!.nodes.find((n) => n.id === "i-0aa725")
    const sg = graph!.nodes.find((n) => n.id === "sg-02a2ccfe185765527")

    expect(vpc?.type).toBe("group")
    expect(vpc?.style?.width).toBe(1100)
    expect(subnet?.parentId).toBe(VPC_CONTAINER_ID)
    expect(subnet?.data).toMatchObject({
      label: expect.stringContaining("10.0.11.0/24"),
    })
    expect(compute?.parentId).toBe(APP_SUBNET_ID)
    expect(compute?.type).toBe("awsComputeNode")
    expect(compute?.position).toEqual({ x: 40, y: 80 })
    expect(sg?.parentId).toBe(APP_SUBNET_ID)
    expect(sg?.type).toBe("awsSecurityGroupOverlay")
    expect(sg?.position).toEqual({ x: 35, y: 75 })
    expect(sg?.style?.width).toBe(230)
  })
})
