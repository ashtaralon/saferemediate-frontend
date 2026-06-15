// buildContainmentFromArchitecture — killer map over SystemArchitecture (binding spec).

import { describe, it, expect } from "vitest"
import {
  buildContainmentFromArchitecture,
  edgeLabelForRelationship,
} from "@/components/attack-paths-v2/build-containment-from-architecture"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"

function arch(): SystemArchitecture {
  return {
    computeServices: [
      { id: "i-0aa725", name: "alon-demo-app2", shortName: "alon-demo-app2", type: "ec2instance", instanceId: "i-0aa725bf8ff4c2001" },
    ],
    resources: [
      { id: "arn:aws:s3:::logs", name: "saferemediate-logs", shortName: "saferemediate-logs", type: "s3bucket", isCrownJewel: true },
      { id: "key-1", name: "cyntro-demo-cmk", shortName: "cyntro-demo-cmk", type: "kmskey" },
    ],
    subnets: [
      {
        id: "subnet-1b",
        name: "subnet-1b",
        shortName: "subnet-1b",
        isPublic: true,
        vpcId: "vpc-086bcc",
        availabilityZone: "eu-west-1b",
        cidrBlock: "172.31.32.0/20",
        connectedComputeIds: ["i-0aa725"],
      },
    ],
    securityGroups: [],
    nacls: [],
    iamRoles: [
      { id: "role-1", type: "iam_role", name: "alon-demo-ec2-role", shortName: "alon-demo-ec2-role", usedCount: 14, totalCount: 21, gapCount: 7, connectedSources: [], connectedTargets: [] },
    ],
    instanceProfiles: [
      { id: "ip-1", type: "iam_role", name: "alon-demo-ec2-profile", shortName: "alon-demo-ec2-profile", usedCount: 1, totalCount: 1, gapCount: 0, connectedSources: [], connectedTargets: [] },
    ],
    egressGateways: [
      { id: "igw-1", name: "igw", shortName: "igw-1", vpcId: "vpc-086bcc", kind: "InternetGateway", kindLabel: "IGW" },
      { id: "vpce-1", name: "vpce", shortName: "vpce-1", vpcId: "vpc-086bcc", kind: "VPCEndpoint", kindLabel: "VPCE · s3", serviceHint: "s3" },
    ],
    flows: [],
    edges: [
      { id: "e1", source_aws_id: "i-0aa725", target_aws_id: "role-1", relationship: "HAS_INSTANCE_PROFILE", observed: true, hit_count: 1, bytes: null, first_seen: null, last_seen: null, port: null, protocol: null },
      { id: "e2", source_aws_id: "role-1", target_aws_id: "arn:aws:s3:::logs", relationship: "ACCESSES_RESOURCE", observed: false, hit_count: null, bytes: null, first_seen: null, last_seen: null, port: null, protocol: null },
    ],
    totalBytes: 0,
    totalConnections: 0,
    totalGaps: 0,
    vpcGroups: [{ vpcId: "vpc-086bcc", vpcName: "default", cidrBlock: "172.31.0.0/16", subnets: [] }],
    region: "eu-west-1",
    onPathNodeIds: new Set(["i-0aa725", "role-1", "arn:aws:s3:::logs", "igw-1"]),
    onPathEdgeIds: new Set(["e1", "e2"]),
  }
}

const path = {
  id: "p1",
  crown_jewel_id: "cj",
  nodes: [],
  edges: [],
  severity: {},
  damage_capability: { role_name: "alon-demo-ec2-role" },
} as unknown as IdentityAttackPath

const report = {
  current_state: { source_label: "alon-demo-app2", target_label: "saferemediate-logs" },
  gates: { identity: "OPEN_OBSERVED", data_plane: "OPEN_CONFIG" },
  remediation_diff: { remove_actions: ["s3:DeleteObject"] },
} as unknown as AttackPathReport

describe("edgeLabelForRelationship", () => {
  it("labels HAS_INSTANCE_PROFILE as runs-as via profile, not assumes role", () => {
    expect(edgeLabelForRelationship("HAS_INSTANCE_PROFILE", "alon-demo-ec2-profile")).toBe(
      "runs as · via alon-demo-ec2-profile",
    )
  })
  it("labels ASSUMES_ROLE_ACTUAL as assumes role", () => {
    expect(edgeLabelForRelationship("ASSUMES_ROLE_ACTUAL")).toBe("assumes role")
  })
})

describe("buildContainmentFromArchitecture", () => {
  it("builds containment from SystemArchitecture with foothold, role via profile, jewel", () => {
    const m = buildContainmentFromArchitecture(arch(), path, report, "path")
    expect(m).not.toBeNull()
    expect(m!.meta.region).toBe("eu-west-1")
    const titles = m!.cards.map((c) => c.title)
    expect(titles).toContain("alon-demo-app2")
    expect(titles).toContain("alon-demo-ec2-role")
    expect(titles.some((t) => t.includes("saferemediate-logs"))).toBe(true)
    expect(m!.cards.find((c) => c.title === "alon-demo-app2")?.badge).toBe("FOOTHOLD")
    const labels = m!.edges.map((e) => e.label).filter(Boolean)
    expect(labels.some((l) => l?.includes("runs as · via"))).toBe(true)
  })

  it("returns null without compute foothold", () => {
    const a = arch()
    a.computeServices = []
    expect(buildContainmentFromArchitecture(a, path, report)).toBeNull()
  })

  it("shows foothold in path mode when connectedComputeIds is empty", () => {
    const a = arch()
    a.subnets[0].connectedComputeIds = []
    const m = buildContainmentFromArchitecture(a, path, report, "path")
    expect(m).not.toBeNull()
    expect(m!.cards.map((c) => c.title)).toContain("alon-demo-app2")
    expect(m!.cards.find((c) => c.title === "alon-demo-app2")?.badge).toBe("FOOTHOLD")
  })

  it("resolves AROA role name via damage_capability.role_name", () => {
    const a = arch()
    a.iamRoles[0] = {
      ...a.iamRoles[0],
      name: "AROAEXAMPLE123456",
      shortName: "AROAEXAMPLE123456",
    }
    const m = buildContainmentFromArchitecture(a, path, report, "path")
    expect(m!.cards.map((c) => c.title)).toContain("alon-demo-ec2-role")
  })

  it("derives region from subnet AZ when architecture.region is missing", () => {
    const a = arch()
    a.region = undefined
    const m = buildContainmentFromArchitecture(a, path, report, "path")
    expect(m!.meta.region).toBe("eu-west-1")
  })

  it("labels public subnet with CIDR from architecture (not Unknown subnet)", () => {
    const m = buildContainmentFromArchitecture(arch(), path, report, "path")
    expect(m).not.toBeNull()
    const subnetFrame = m!.frames.find((f) => f.kind === "subnet" && f.label.includes("Public subnet"))
    expect(subnetFrame?.label).toMatch(/Public subnet · 172\.31\.32\.0\/20/)
  })

  it("includes VPC CIDR on vpc frame when vpcGroups populated", () => {
    const m = buildContainmentFromArchitecture(arch(), path, report, "path")
    const vpcFrame = m!.frames.find((f) => f.kind === "vpc")
    expect(vpcFrame?.label).toMatch(/172\.31\.0\.0\/16/)
  })
})
