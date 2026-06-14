// buildContainmentModel — composes live AWS topology + the attack path + its
// compiled report into the positioned containment SVG model. These pin the
// behavior the design depends on: real-data partition (EC2 cards vs grouped
// Lambdas), the path overlay (foothold/role/jewel/KMS), and the attack edges —
// all derived, none hardcoded. Fixtures mirror the live alon-prod golden path
// (alon-demo-app2 → alon-demo-ec2-role → saferemediate-logs → cyntro-demo-cmk).

import { describe, it, expect } from "vitest"
import {
  buildContainmentModel,
  deriveRegion,
  isCardWorkload,
  isLambdaType,
  type TopologyResponse,
} from "@/components/attack-paths-v2/containment-model"
import type { IdentityAttackPath, PathNodeDetail } from "@/components/identity-attack-paths/types"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"

function topology(): TopologyResponse {
  return {
    system_name: "alon-prod",
    vpcs: [
      {
        id: "vpc-086bcc2186fa42c96",
        name: "vpc",
        cidr: null,
        region: null,
        internet_gateways: [{ id: "igw-0d1dd1d0", name: "igw" }],
        vpc_endpoints: [{ id: "vpce-0369770", name: "vpce", service: "s3" }],
        azs: [
          {
            name: "eu-west-1a",
            subnets: [
              {
                id: "subnet-1a",
                name: "subnet-1a",
                cidr: "172.31.16.0/20",
                is_public: true,
                workloads: [
                  { id: "lam-1", name: "cyntro-decision-engine-pilot", type: "lambdafunction" },
                ],
              },
            ],
          },
          {
            name: "eu-west-1b",
            subnets: [
              {
                id: "subnet-1b",
                name: "subnet-1b",
                cidr: "172.31.32.0/20",
                is_public: true,
                workloads: [
                  { id: "i-0aa725", name: "alon-demo-app2", type: "ec2instance" },
                  { id: "i-web", name: "cyntro-web-server", type: "ec2instance" },
                  { id: "lam-1", name: "cyntro-decision-engine-pilot", type: "lambdafunction" },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

function nd(over: Partial<PathNodeDetail> & Pick<PathNodeDetail, "id" | "name" | "type" | "tier">): PathNodeDetail {
  return { is_internet_exposed: false, lp_score: null, gap_count: 0, remediation: null, internet_exposure_alert: null, ...over } as unknown as PathNodeDetail
}

function goldenPath(): IdentityAttackPath {
  return {
    id: "path-1",
    crown_jewel_id: "cj",
    nodes: [
      nd({ id: "i-0aa725", name: "alon-demo-app2", type: "EC2Instance", tier: "entry", is_internet_exposed: true }),
      nd({ id: "role-1", name: "alon-demo-ec2-role", type: "IAMRole", tier: "identity" }),
      nd({
        id: "jewel-1",
        name: "saferemediate-logs",
        type: "S3Bucket",
        tier: "crown_jewel",
        infra_context: { kms_keys: [{ id: "key-1", name: "alias/cyntro-demo-cmk", type: "KMSKey", edge_type: "ENCRYPTED_BY" }] },
      } as Partial<PathNodeDetail> & Pick<PathNodeDetail, "id" | "name" | "type" | "tier">),
    ],
    edges: [],
  } as unknown as IdentityAttackPath
}

function report(over: Partial<AttackPathReport> = {}): AttackPathReport {
  return {
    current_state: { source_label: "alon-demo-app2", target_label: "saferemediate-logs" },
    gates: { identity: "OPEN_OBSERVED", data_plane: "OPEN_CONFIG" },
    remediation_diff: { remove_actions: ["s3:DeleteObject", "s3:PutBucketPolicy"] },
    ...over,
  } as unknown as AttackPathReport
}

describe("buildContainmentModel", () => {
  it("returns null without topology (caller falls back to the spine map)", () => {
    expect(buildContainmentModel(null, goldenPath(), report())).toBeNull()
    expect(buildContainmentModel({ system_name: "x", vpcs: [] }, goldenPath(), report())).toBeNull()
  })

  it("frames the AWS Cloud > Region > VPC > AZ > Subnet containment", () => {
    const m = buildContainmentModel(topology(), goldenPath(), report())!
    expect(m).not.toBeNull()
    const kinds = m.frames.map((f) => f.kind)
    expect(kinds).toContain("cloud")
    expect(kinds).toContain("region")
    expect(kinds).toContain("vpc")
    expect(m.frames.filter((f) => f.kind === "az")).toHaveLength(2)
    expect(m.frames.filter((f) => f.kind === "subnet")).toHaveLength(2)
    // Region inferred from the AZ name (vpc.region was null).
    expect(m.meta.region).toBe("eu-west-1")
  })

  it("renders EC2 as in-subnet cards but collapses Lambdas into one regional group", () => {
    const m = buildContainmentModel(topology(), goldenPath(), report())!
    const titles = m.cards.map((c) => c.title)
    // Both EC2s rendered as cards.
    expect(titles).toContain("alon-demo-app2")
    expect(titles).toContain("cyntro-web-server")
    // The Lambda appears in BOTH AZ subnets in the raw data, but is deduped to a
    // single regional group chip — never two per-AZ Lambda cards.
    expect(titles.filter((t) => /serverless function/.test(t))).toHaveLength(1)
    expect(titles).not.toContain("cyntro-decision-engine-pilot")
    expect(m.meta.lambdaCount).toBe(1)
  })

  it("marks the foothold on-path with a FOOTHOLD badge; off-path workloads stay context", () => {
    const m = buildContainmentModel(topology(), goldenPath(), report())!
    const foothold = m.cards.find((c) => c.title === "alon-demo-app2")!
    expect(foothold.onPath).toBe(true)
    expect(foothold.badge).toBe("FOOTHOLD")
    expect(foothold.layer).toBe("path")
    const offpath = m.cards.find((c) => c.title === "cyntro-web-server")!
    expect(offpath.onPath).toBe(false)
    expect(offpath.layer).toBe("ctx")
  })

  it("places the IAM role, crown jewel and KMS in the regional band from path tiers", () => {
    const m = buildContainmentModel(topology(), goldenPath(), report())!
    const titles = m.cards.map((c) => c.title)
    expect(titles).toContain("alon-demo-ec2-role")
    expect(m.cards.find((c) => c.badge === "CROWN JEWEL")?.title).toBe("saferemediate-logs")
    // KMS resolved from the jewel's infra_context, friendly-named off the alias.
    expect(m.cards.find((c) => c.badge === "ENCRYPTS")?.title).toBe("cyntro-demo-cmk")
  })

  it("derives the attack edges: internet entry, assume, data-plane (excess), encrypt, private-unused", () => {
    const m = buildContainmentModel(topology(), goldenPath(), report())!
    const ids = m.edges.map((e) => e.id)
    expect(ids).toContain("e-user-igw")
    expect(ids).toContain("e-igw-foothold")
    expect(ids).toContain("e-foothold-role")
    expect(ids).toContain("e-role-jewel")
    expect(ids).toContain("e-jewel-kms")
    // S3 VPC endpoint to an S3 jewel → private alternate route, marked unused.
    expect(ids).toContain("e-foothold-vpce")
    expect(ids).toContain("e-vpce-jewel")
    // The data-plane edge labels the excess capability the fix removes.
    const dataEdge = m.edges.find((e) => e.id === "e-role-jewel")!
    expect(dataEdge.label).toBe("s3:Delete* · excess")
    // Identity gate is observed → that edge reads attack-red.
    expect(m.edges.find((e) => e.id === "e-foothold-role")?.color).toBe("#c0392b")
  })

  it("resolves foothold/role/jewel when node tiers are null (the live IAP serialization)", () => {
    // Regression for the prod bug: the IAP list leaves entry/identity nodes
    // tier=null (only crown_jewel is tagged) and the IAM principal serializes
    // as an opaque AROA id. The model must still anchor the foothold (via the
    // report's source_label + the topology workload) and label the role from
    // damage_capability.role_name — NOT fall back to the spine map.
    const p = {
      id: "path-1",
      crown_jewel_id: "cj",
      damage_capability: { role_name: "alon-demo-ec2-role" },
      nodes: [
        nd({ id: "i-0aa725", name: "alon-demo-app2", type: "EC2Instance", tier: undefined as never }),
        nd({ id: "AROA23JBKAVDQCMGEX66T", name: "AROA23JBKAVDQCMGEX66T", type: "IAMRole", tier: undefined as never }),
        nd({ id: "jewel-1", name: "saferemediate-logs-745783559495", type: "S3Bucket", tier: "crown_jewel" }),
      ],
      edges: [],
    } as unknown as IdentityAttackPath
    const m = buildContainmentModel(topology(), p, report())
    expect(m).not.toBeNull()
    // Foothold anchored from source_label, not tier.
    const foothold = m!.cards.find((c) => c.title === "alon-demo-app2")!
    expect(foothold.badge).toBe("FOOTHOLD")
    // Role labeled from damage_capability.role_name, never the AROA id.
    const titles = m!.cards.map((c) => c.title)
    expect(titles).toContain("alon-demo-ec2-role")
    expect(titles).not.toContain("AROA23JBKAVDQCMGEX66T")
    // The full chain renders.
    const ids = m!.edges.map((e) => e.id)
    expect(ids).toContain("e-foothold-role")
    expect(ids).toContain("e-role-jewel")
  })

  it("drops the internet/IGW entry when the foothold isn't internet-exposed", () => {
    const p = goldenPath()
    p.nodes[0].is_internet_exposed = false
    const m = buildContainmentModel(topology(), p, report())!
    expect(m.meta.hasInternetEntry).toBe(false)
    expect(m.edges.map((e) => e.id)).not.toContain("e-user-igw")
    expect(m.cards.find((c) => c.id === "user")).toBeUndefined()
  })
})

describe("classification helpers", () => {
  it("isLambdaType / isCardWorkload partition workloads", () => {
    expect(isLambdaType("lambdafunction")).toBe(true)
    expect(isCardWorkload("lambdafunction")).toBe(false)
    expect(isCardWorkload("ec2instance")).toBe(true)
    expect(isCardWorkload("rdsinstance")).toBe(true)
  })

  it("deriveRegion prefers the explicit field, else infers from an AZ name", () => {
    expect(deriveRegion({ region: "us-east-1", azs: [] } as never)).toBe("us-east-1")
    expect(deriveRegion({ region: null, azs: [{ name: "eu-west-1b", subnets: [] }] } as never)).toBe("eu-west-1")
  })
})
