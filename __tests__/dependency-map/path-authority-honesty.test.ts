/**
 * Zoom0 Reachability honesty acceptance pins (P0a / P0b).
 *
 * 1. Same-VPC IGW absent from hops → absent from path layer
 * 2. Attached SG absent from selected path → absent
 * 3. No bytes / connections / Live Traffic without path observed network evidence
 * 4. Every rendered edge preserves DTO source, target, type, direction
 * 5. Multiple paths merge only by canonical node ID
 * 6. Estate/context data cannot affect path-layer membership or metrics
 * 7. NOT_COLLECTED renders as unknown (null totalCount) — not zero/safe
 */

import { describe, expect, it } from "vitest"
import { buildSpotlightActiveNodeIds } from "@/lib/attack-paths/build-spotlight-active-node-ids"
import {
  buildPathAuthorityArchitecture,
  collectPathAuthorityNodeIds,
  pathHasObservedNetworkEvidence,
} from "@/lib/attack-paths/build-path-authority-architecture"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

const estateArch = {
  computeServices: [
    {
      id: "i-aaa",
      name: "app",
      instanceId: "i-aaa",
      vpcId: "vpc-1",
    },
  ],
  securityGroups: [
    { id: "sg-on-path", name: "on-path", connectedSources: ["i-aaa"] },
    { id: "sg-sibling", name: "sibling", connectedSources: ["i-bbb"] },
    // Estate-attached SG for i-aaa that is NOT in the selected path hops
    { id: "sg-estate-only", name: "estate", connectedSources: ["i-aaa"] },
  ],
  iamRoles: [{ id: "arn:aws:iam::1:role/app", name: "app" }],
  flows: [
    {
      sourceId: "i-aaa",
      targetId: "arn:aws:s3:::saferemediate-raw",
      sgId: "sg-estate-only",
      egressGatewayId: "igw-estate",
      bytes: 6_100_000_000,
      connections: 42,
    },
  ],
  vpcEndpoints: [{ id: "vpce-s3" }],
  subnets: [
    {
      id: "subnet-app",
      vpcId: "vpc-1",
      connectedComputeIds: ["i-aaa"],
    },
  ],
  egressGateways: [{ id: "igw-estate", vpcId: "vpc-1" }],
  nacls: [{ id: "acl-app", connectedSources: ["i-aaa"] }],
}

function path(overrides: Partial<ConvergencePath>): ConvergencePath {
  return {
    path_id: "p1",
    damage: [],
    score: 50,
    confidence: "configured",
    hop_count: 4,
    source: "app",
    workload_arn: "i-aaa",
    identity: "arn:aws:iam::1:role/app",
    cj_target_id: "arn:aws:s3:::saferemediate-raw",
    hops: [
      {
        node_id: "i-aaa",
        node_type: "EC2Instance",
        name: "app",
        plane: "compute",
        subnet_id: "subnet-app",
        security_groups: ["sg-on-path"],
        is_crown_jewel: false,
      },
      {
        node_id: "sg-on-path",
        node_type: "SecurityGroup",
        name: "on-path",
        plane: "network",
        security_groups: [],
        is_crown_jewel: false,
        edge_type_from_prev: "SECURED_BY",
      },
      {
        node_id: "arn:aws:iam::1:role/app",
        node_type: "IAMRole",
        name: "app",
        plane: "identity",
        security_groups: [],
        is_crown_jewel: false,
        edge_type_from_prev: "USES_ROLE",
      },
      {
        node_id: "arn:aws:s3:::saferemediate-raw",
        node_type: "S3Bucket",
        name: "saferemediate-raw",
        plane: "data",
        security_groups: [],
        is_crown_jewel: true,
        edge_type_from_prev: "ACCESSES_RESOURCE",
      },
      {
        node_id: "vpce-s3",
        node_type: "VPCEndpoint",
        name: "vpce-s3",
        plane: "network",
        security_groups: [],
        is_crown_jewel: false,
        edge_type_from_prev: "ROUTES_VIA",
      },
    ],
    ...overrides,
  }
}

describe("path-authority honesty invariants", () => {
  it("1. same-VPC IGW absent from hops never enters path layer", () => {
    const legacy = buildSpotlightActiveNodeIds({
      paths: [path({})],
      spotlightPathId: "p1",
      architecture: estateArch,
    })
    // Pre-fix behavior would include estate IGW via VPC placement.
    expect(legacy.has("igw-estate")).toBe(true)

    const authority = buildSpotlightActiveNodeIds({
      paths: [path({})],
      spotlightPathId: "p1",
      architecture: estateArch,
      pathAuthorityOnly: true,
    })
    expect(authority.has("igw-estate")).toBe(false)

    const arch = buildPathAuthorityArchitecture({
      paths: [path({})],
      spotlightPathId: "p1",
      jewel: { id: "arn:aws:s3:::saferemediate-raw", name: "saferemediate-raw" },
    })
    expect(arch.egressGateways.map((g) => g.id)).toEqual([])
    expect(arch.onPathNodeIds.has("igw-estate")).toBe(false)
  })

  it("2. estate-attached SG absent from selected path never appears", () => {
    const authority = collectPathAuthorityNodeIds({
      paths: [path({})],
      spotlightPathId: "p1",
    })
    expect(authority.has("sg-on-path")).toBe(true)
    expect(authority.has("sg-estate-only")).toBe(false)
    expect(authority.has("sg-sibling")).toBe(false)

    const arch = buildPathAuthorityArchitecture({
      paths: [path({})],
      spotlightPathId: "p1",
    })
    expect(arch.securityGroups.map((s) => s.id).sort()).toEqual(["sg-on-path"])
  })

  it("3. no traffic metrics without selected-path observed network evidence", () => {
    expect(
      pathHasObservedNetworkEvidence([path({ confidence: "configured" })], "p1"),
    ).toBe(false)
    // Path-level identity_gate "observed" alone is not enough.
    expect(
      pathHasObservedNetworkEvidence([path({ confidence: "observed" })], "p1"),
    ).toBe(false)

    const withProps = path({
      confidence: "configured",
      evidence: "configured",
      hops: [
        {
          node_id: "i-aaa",
          node_type: "EC2Instance",
          plane: "compute",
          security_groups: [],
          is_crown_jewel: false,
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACTUAL_S3_ACCESS",
          edge_evidence: "observed",
          key_properties: { bytes: 1000 },
        } as ConvergencePath["hops"] extends (infer H)[] | undefined ? H : never,
      ],
    })
    expect(pathHasObservedNetworkEvidence([withProps], "p1")).toBe(true)

    const arch = buildPathAuthorityArchitecture({
      paths: [path({})],
      spotlightPathId: "p1",
    })
    expect(arch.totalBytes).toBe(0)
    expect(arch.totalConnections).toBe(0)
  })

  it("4. every rendered edge preserves DTO source, target, type, direction", () => {
    const arch = buildPathAuthorityArchitecture({
      paths: [path({})],
      spotlightPathId: "p1",
    })
    const byRel = (rel: string) =>
      arch.edges.filter((e) => e.relationship === rel)

    const secured = byRel("SECURED_BY")
    expect(secured.some((e) => e.source_aws_id === "i-aaa" && e.target_aws_id === "sg-on-path")).toBe(
      true,
    )

    const uses = byRel("USES_ROLE")
    expect(
      uses.some(
        (e) =>
          e.source_aws_id === "sg-on-path" &&
          e.target_aws_id === "arn:aws:iam::1:role/app",
      ),
    ).toBe(true)

    const routes = byRel("ROUTES_VIA")
    expect(
      routes.every(
        (e) =>
          e.source_aws_id === "arn:aws:s3:::saferemediate-raw" &&
          e.target_aws_id === "vpce-s3",
      ),
    ).toBe(true)
    // No invented IGW edge
    expect(arch.edges.some((e) => e.target_aws_id === "igw-estate")).toBe(false)
  })

  it("5. multiple paths merge only by canonical node ID", () => {
    const p1 = path({
      path_id: "p1",
      workload_arn: "i-aaa",
      hops: [
        {
          node_id: "i-aaa",
          node_type: "EC2Instance",
          plane: "compute",
          security_groups: ["sg-a"],
          is_crown_jewel: false,
        },
        {
          node_id: "arn:aws:iam::1:role/shared",
          node_type: "IAMRole",
          plane: "identity",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "USES_ROLE",
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
      ],
    })
    const p2 = path({
      path_id: "p2",
      source: "web",
      workload_arn: "i-bbb",
      identity: "arn:aws:iam::1:role/shared",
      hops: [
        {
          node_id: "i-bbb",
          node_type: "EC2Instance",
          plane: "compute",
          security_groups: ["sg-b"],
          is_crown_jewel: false,
        },
        {
          node_id: "arn:aws:iam::1:role/shared",
          node_type: "IAMRole",
          plane: "identity",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "USES_ROLE",
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
      ],
    })
    const arch = buildPathAuthorityArchitecture({
      paths: [p1, p2],
      spotlightPathId: null,
      jewel: { id: "arn:aws:s3:::saferemediate-raw" },
    })
    expect(arch.computeServices.map((c) => c.id).sort()).toEqual(["i-aaa", "i-bbb"])
    expect(arch.iamRoles.filter((r) => r.id === "arn:aws:iam::1:role/shared")).toHaveLength(1)
    expect(arch.resources.filter((r) => r.id === "arn:aws:s3:::saferemediate-raw")).toHaveLength(1)
    expect(arch.securityGroups.map((s) => s.id).sort()).toEqual(["sg-a", "sg-b"])
  })

  it("6. estate context cannot affect path-layer membership or metrics", () => {
    const ids = collectPathAuthorityNodeIds({
      paths: [path({})],
      spotlightPathId: "p1",
      jewel: { id: "arn:aws:s3:::saferemediate-raw" },
    })
    // Estate-only furniture must stay out even if present in dep-map slice
    expect(ids.has("igw-estate")).toBe(false)
    expect(ids.has("sg-estate-only")).toBe(false)

    const arch = buildPathAuthorityArchitecture({
      paths: [path({})],
      spotlightPathId: "p1",
    })
    // Builder never reads estate — totals stay zero
    expect(arch.totalBytes).toBe(0)
    expect(arch.totalConnections).toBe(0)
    expect(arch.flows).toEqual([])
  })

  it("7. NOT_COLLECTED rule totals stay null — not zero/safe", () => {
    const arch = buildPathAuthorityArchitecture({
      paths: [path({})],
      spotlightPathId: "p1",
    })
    for (const sg of arch.securityGroups) {
      expect(sg.totalCount).toBeNull()
    }
    for (const role of arch.iamRoles) {
      expect(role.totalCount).toBeNull()
    }
  })

  it("7b. COLLECTED rule_count seeds checkpoint totalCount", () => {
    const withRules = path({
      hops: [
        {
          node_id: "i-aaa",
          node_type: "EC2Instance",
          name: "app",
          plane: "compute",
          subnet_id: "subnet-app",
          security_groups: ["sg-on-path"],
          is_crown_jewel: false,
        },
        {
          node_id: "sg-on-path",
          node_type: "SecurityGroup",
          name: "on-path",
          plane: "network",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "SECURED_BY",
          rule_count: 12,
          rules_coverage: "COLLECTED",
        },
        {
          node_id: "arn:aws:iam::1:role/app",
          node_type: "IAMRole",
          name: "app",
          plane: "identity",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "USES_ROLE",
          rule_count: 47,
          rules_coverage: "COLLECTED",
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          name: "saferemediate-raw",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
      ],
    })
    const arch = buildPathAuthorityArchitecture({
      paths: [withRules],
      spotlightPathId: "p1",
    })
    expect(arch.securityGroups[0]?.totalCount).toBe(12)
    expect(arch.securityGroups[0]?.rulesCoverage).toBe("COLLECTED")
    expect(arch.iamRoles[0]?.totalCount).toBe(47)
  })

  it("7c. NOT_COLLECTED rule_count must not seed totalCount", () => {
    const notCollected = path({
      hops: [
        {
          node_id: "i-aaa",
          node_type: "EC2Instance",
          plane: "compute",
          security_groups: ["sg-on-path"],
          is_crown_jewel: false,
        },
        {
          node_id: "sg-on-path",
          node_type: "SecurityGroup",
          plane: "network",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "SECURED_BY",
          rule_count: 0,
          rules_coverage: "NOT_COLLECTED",
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
      ],
    })
    const arch = buildPathAuthorityArchitecture({
      paths: [notCollected],
      spotlightPathId: "p1",
    })
    expect(arch.securityGroups[0]?.totalCount).toBeNull()
  })

  it("reversed ~edge_type_from_prev flips direction", () => {
    const arch = buildPathAuthorityArchitecture({
      paths: [
        path({
          hops: [
            {
              node_id: "vpce-s3",
              node_type: "VPCEndpoint",
              plane: "network",
              security_groups: [],
              is_crown_jewel: false,
            },
            {
              node_id: "arn:aws:s3:::saferemediate-raw",
              node_type: "S3Bucket",
              plane: "data",
              security_groups: [],
              is_crown_jewel: true,
              edge_type_from_prev: "~ROUTES_VIA",
            },
          ],
        }),
      ],
      spotlightPathId: "p1",
    })
    const routes = arch.edges.filter((e) => e.relationship === "ROUTES_VIA")
    expect(routes).toHaveLength(1)
    // "~" = Neo4j direction opposite walk → preserve stored Neo4j endpoints
    expect(routes[0].source_aws_id).toBe("arn:aws:s3:::saferemediate-raw")
    expect(routes[0].target_aws_id).toBe("vpce-s3")
  })

  it("8. SG name stamps on every hop do not invent extra SG cards", () => {
    // Live DTO pattern: security_groups repeats display names on IAM/S3
    // hops; only three canonical sg-* hops exist.
    const inflated = path({
      hops: [
        {
          node_id: "i-aaa",
          node_type: "EC2Instance",
          name: "app",
          plane: "compute",
          subnet_id: "subnet-app",
          security_groups: [
            "sg-02a2ccfe185765527",
            "launch-wizard-1",
            "cyntro-web-sg",
          ],
          is_crown_jewel: false,
        },
        {
          node_id: "sg-02a2ccfe185765527",
          node_type: "SecurityGroup",
          name: "launch-wizard-1",
          plane: "network",
          security_groups: ["launch-wizard-1"],
          is_crown_jewel: false,
          edge_type_from_prev: "SECURED_BY",
        },
        {
          node_id: "sg-08f4ba91d94bc6d99",
          node_type: "SecurityGroup",
          name: "cyntro-web-sg",
          plane: "network",
          security_groups: ["cyntro-web-sg"],
          is_crown_jewel: false,
          edge_type_from_prev: "SECURED_BY",
        },
        {
          node_id: "sg-0212ab87005f59737",
          node_type: "SecurityGroup",
          name: "default",
          plane: "network",
          security_groups: ["default"],
          is_crown_jewel: false,
          edge_type_from_prev: "SECURED_BY",
        },
        {
          node_id: "arn:aws:iam::1:role/app",
          node_type: "IAMRole",
          name: "app",
          plane: "identity",
          security_groups: ["launch-wizard-1", "cyntro-web-sg", "default"],
          is_crown_jewel: false,
          edge_type_from_prev: "USES_ROLE",
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          name: "saferemediate-raw",
          plane: "data",
          security_groups: ["launch-wizard-1", "cyntro-web-sg"],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
      ],
    })

    const ids = collectPathAuthorityNodeIds({
      paths: [inflated],
      spotlightPathId: "p1",
    })
    expect(ids.has("launch-wizard-1")).toBe(false)
    expect(ids.has("cyntro-web-sg")).toBe(false)
    expect(ids.has("default")).toBe(false)

    const arch = buildPathAuthorityArchitecture({
      paths: [inflated],
      spotlightPathId: "p1",
    })
    expect(arch.securityGroups.map((s) => s.id).sort()).toEqual([
      "sg-0212ab87005f59737",
      "sg-02a2ccfe185765527",
      "sg-08f4ba91d94bc6d99",
    ])

    const spotlight = buildSpotlightActiveNodeIds({
      paths: [inflated],
      spotlightPathId: "p1",
      architecture: estateArch,
      pathAuthorityOnly: true,
    })
    expect(spotlight.has("launch-wizard-1")).toBe(false)
    expect(spotlight.has("sg-02a2ccfe185765527")).toBe(true)
  })

  it("10. SG display-name resolution stays per-path (no cross-fan-in attach)", () => {
    const pathA = path({
      path_id: "p-a",
      workload_arn: "i-aaa",
      hops: [
        {
          node_id: "i-aaa",
          node_type: "EC2Instance",
          plane: "compute",
          security_groups: ["default"],
          is_crown_jewel: false,
        },
        {
          node_id: "sg-aaaaaaaaaaaaaaaaa",
          node_type: "SecurityGroup",
          name: "default",
          plane: "network",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "SECURED_BY",
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
      ],
    })
    // Path B stamps "default" on the compute hop but has NO SecurityGroup
    // hop of its own — must NOT resolve to path A's sg-*.
    const pathB = path({
      path_id: "p-b",
      source: "web",
      workload_arn: "i-bbb",
      identity: "arn:aws:iam::1:role/web",
      hops: [
        {
          node_id: "i-bbb",
          node_type: "EC2Instance",
          plane: "compute",
          security_groups: ["default"],
          is_crown_jewel: false,
        },
        {
          node_id: "arn:aws:iam::1:role/web",
          node_type: "IAMRole",
          plane: "identity",
          security_groups: ["default"],
          is_crown_jewel: false,
          edge_type_from_prev: "USES_ROLE",
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
      ],
    })
    const arch = buildPathAuthorityArchitecture({
      paths: [pathA, pathB],
      spotlightPathId: null,
      jewel: { id: "arn:aws:s3:::saferemediate-raw" },
    })
    expect(arch.securityGroups.map((s) => s.id)).toEqual([
      "sg-aaaaaaaaaaaaaaaaa",
    ])
    expect(
      arch.edges.some(
        (e) =>
          e.relationship === "SECURED_BY" &&
          e.source_aws_id === "i-bbb" &&
          e.target_aws_id === "sg-aaaaaaaaaaaaaaaaa",
      ),
    ).toBe(false)
  })

  it("9. EXFILTRATES_VIA becomes ROUTES_VIA and seeds the VPCE", () => {
    const exfil = path({
      hops: [
        {
          node_id: "i-bbb",
          node_type: "EC2Instance",
          name: "web",
          plane: "compute",
          security_groups: ["sg-08f4ba91d94bc6d99"],
          is_crown_jewel: false,
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          name: "saferemediate-raw",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
        {
          node_id: "vpce-03697705b0333e336",
          node_type: "VPCEndpoint",
          name: "vpce-03697705b0333e336",
          plane: "network",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "EXFILTRATES_VIA",
        },
      ],
    })

    const arch = buildPathAuthorityArchitecture({
      paths: [exfil],
      spotlightPathId: "p1",
      jewel: { id: "arn:aws:s3:::saferemediate-raw" },
    })
    expect(arch.vpcEndpoints.map((v) => v.id)).toEqual([
      "vpce-03697705b0333e336",
    ])
    const routes = arch.edges.filter((e) => e.relationship === "ROUTES_VIA")
    expect(routes).toHaveLength(1)
    expect(routes[0].source_aws_id).toBe("arn:aws:s3:::saferemediate-raw")
    expect(routes[0].target_aws_id).toBe("vpce-03697705b0333e336")
    // Path-authority flows stay empty — TFM must treat edge membership
    // as "in use", not require flows[].vpceId.
    expect(arch.flows).toEqual([])
    expect(
      arch.edges.some(
        (e) =>
          e.source_aws_id === "vpce-03697705b0333e336" ||
          e.target_aws_id === "vpce-03697705b0333e336",
      ),
    ).toBe(true)
  })

  it("10. collapses EC2 → InstanceProfile → Role with via_label + hop ids", () => {
    const withProfile = path({
      hops: [
        {
          node_id: "i-aaa",
          node_type: "EC2Instance",
          name: "app",
          plane: "compute",
          security_groups: [],
          is_crown_jewel: false,
        },
        {
          node_id: "arn:aws:iam::1:instance-profile/app-profile",
          node_type: "InstanceProfile",
          name: "app-profile",
          plane: "identity",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "HAS_INSTANCE_PROFILE",
        },
        {
          node_id: "arn:aws:iam::1:role/app",
          node_type: "IAMRole",
          name: "app",
          plane: "identity",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "USES_ROLE",
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          name: "saferemediate-raw",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
      ],
    })
    const arch = buildPathAuthorityArchitecture({
      paths: [withProfile],
      spotlightPathId: "p1",
    })
    const collapsed = arch.edges.filter(
      (e) =>
        e.relationship === "USES_ROLE" &&
        e.source_aws_id === "i-aaa" &&
        e.target_aws_id === "arn:aws:iam::1:role/app",
    )
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].via_label).toBe("uses role via app-profile")
    expect(collapsed[0].collapsed_hop_ids).toEqual([
      "i-aaa",
      "arn:aws:iam::1:instance-profile/app-profile",
      "arn:aws:iam::1:role/app",
    ])
    // Must not also emit the intermediate profile edges as separate lines
    expect(
      arch.edges.some(
        (e) =>
          e.source_aws_id === "arn:aws:iam::1:instance-profile/app-profile" ||
          e.target_aws_id === "arn:aws:iam::1:instance-profile/app-profile",
      ),
    ).toBe(false)
  })

  it("11. never invents USES_ROLE without exact profile hops in the DTO", () => {
    // EC2 → Role direct (no InstanceProfile hop) — keep the DTO edge as-is
    const direct = path({
      hops: [
        {
          node_id: "i-aaa",
          node_type: "EC2Instance",
          plane: "compute",
          security_groups: [],
          is_crown_jewel: false,
        },
        {
          node_id: "arn:aws:iam::1:role/app",
          node_type: "IAMRole",
          plane: "identity",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "USES_ROLE",
        },
      ],
    })
    const arch = buildPathAuthorityArchitecture({
      paths: [direct],
      spotlightPathId: "p1",
    })
    const uses = arch.edges.filter((e) => e.relationship === "USES_ROLE")
    expect(uses).toHaveLength(1)
    expect(uses[0].via_label).toBeUndefined()
    expect(uses[0].collapsed_hop_ids).toBeUndefined()
  })

  it("12. gateway ownership chips reflect exact hop membership per path", () => {
    const p1 = path({
      path_id: "p1",
      workload_arn: "i-aaa",
      hops: [
        {
          node_id: "i-aaa",
          node_type: "EC2Instance",
          plane: "compute",
          security_groups: [],
          is_crown_jewel: false,
        },
        {
          node_id: "igw-shared",
          node_type: "InternetGateway",
          plane: "network",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "ROUTES_VIA",
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
      ],
    })
    const p2 = path({
      path_id: "p2",
      source: "web",
      workload_arn: "i-bbb",
      hops: [
        {
          node_id: "i-bbb",
          node_type: "EC2Instance",
          plane: "compute",
          security_groups: [],
          is_crown_jewel: false,
        },
        {
          node_id: "vpce-s3",
          node_type: "VPCEndpoint",
          plane: "network",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "ROUTES_VIA",
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
      ],
    })
    const p3 = path({
      path_id: "p3",
      source: "batch",
      workload_arn: "i-ccc",
      hops: [
        {
          node_id: "i-ccc",
          node_type: "EC2Instance",
          plane: "compute",
          security_groups: [],
          is_crown_jewel: false,
        },
        {
          node_id: "igw-shared",
          node_type: "InternetGateway",
          plane: "network",
          security_groups: [],
          is_crown_jewel: false,
          edge_type_from_prev: "ROUTES_VIA",
        },
        {
          node_id: "arn:aws:s3:::saferemediate-raw",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
        },
      ],
    })
    const arch = buildPathAuthorityArchitecture({
      paths: [p1, p2, p3],
      spotlightPathId: null,
      jewel: { id: "arn:aws:s3:::saferemediate-raw" },
    })
    expect(arch.gatewayPathOwnership["igw-shared"]).toEqual({
      pathIds: ["p1", "p3"],
      totalPaths: 3,
    })
    expect(arch.gatewayPathOwnership["vpce-s3"]).toEqual({
      pathIds: ["p2"],
      totalPaths: 3,
    })
    expect(arch.pathIdsByNodeId["i-aaa"]).toEqual(["p1"])
    expect(arch.pathIdsByNodeId["i-bbb"]).toEqual(["p2"])
    // Selecting i-aaa must not claim vpce-s3 ownership
    expect(arch.pathIdsByNodeId["i-aaa"]?.includes("p2")).toBe(false)
    expect(
      arch.gatewayPathOwnership["vpce-s3"].pathIds.some((id) =>
        arch.pathIdsByNodeId["i-aaa"]?.includes(id),
      ),
    ).toBe(false)
  })

  it("13. ACCESSES_RESOURCE observed hop stamps beat path.confidence configured", () => {
    const observedAccess = path({
      path_id: "p1",
      confidence: "configured",
      evidence: "configured",
      hops: [
        {
          node_id: "arn:aws:iam::1:role/app",
          node_type: "IAMRole",
          plane: "identity",
          security_groups: [],
          is_crown_jewel: false,
        },
        {
          node_id: "arn:aws:s3:::cyntro-demo-analytics",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
          edge_evidence: "observed",
          hit_count: 15,
          last_seen: "2026-07-01T12:00:00Z",
        },
      ],
    })
    const arch = buildPathAuthorityArchitecture({
      paths: [observedAccess],
      spotlightPathId: "p1",
    })
    const access = arch.edges.find((e) => e.relationship === "ACCESSES_RESOURCE")
    expect(access).toBeTruthy()
    expect(access!.observed).toBe(true)
    expect(access!.hit_count).toBe(15)
    expect(access!.last_seen).toBe("2026-07-01T12:00:00Z")
  })

  it("14. merge: observed wins when a sibling path only has configured", () => {
    const configuredFirst = path({
      path_id: "p1",
      confidence: "configured",
      evidence: "configured",
      hops: [
        {
          node_id: "arn:aws:iam::1:role/shared",
          node_type: "IAMRole",
          plane: "identity",
          security_groups: [],
          is_crown_jewel: false,
        },
        {
          node_id: "arn:aws:s3:::cyntro-demo-analytics",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
          edge_evidence: "configured",
        },
      ],
    })
    const observedSecond = path({
      path_id: "p2",
      source: "web",
      workload_arn: "i-bbb",
      confidence: "configured",
      evidence: "configured",
      hops: [
        {
          node_id: "arn:aws:iam::1:role/shared",
          node_type: "IAMRole",
          plane: "identity",
          security_groups: [],
          is_crown_jewel: false,
        },
        {
          node_id: "arn:aws:s3:::cyntro-demo-analytics",
          node_type: "S3Bucket",
          plane: "data",
          security_groups: [],
          is_crown_jewel: true,
          edge_type_from_prev: "ACCESSES_RESOURCE",
          edge_evidence: "observed",
          hit_count: 15,
        },
      ],
    })
    const arch = buildPathAuthorityArchitecture({
      paths: [configuredFirst, observedSecond],
      spotlightPathId: null,
    })
    const access = arch.edges.filter((e) => e.relationship === "ACCESSES_RESOURCE")
    expect(access).toHaveLength(1)
    expect(access[0].observed).toBe(true)
    expect(access[0].hit_count).toBe(15)
    expect(access[0].path_ids).toEqual(["p1", "p2"])
    expect(access[0].path_evidence).toEqual([
      {
        path_id: "p1",
        observed: false,
        hit_count: null,
        first_seen: null,
        last_seen: null,
      },
      {
        path_id: "p2",
        observed: true,
        hit_count: 15,
        first_seen: null,
        last_seen: null,
      },
    ])
  })
})
