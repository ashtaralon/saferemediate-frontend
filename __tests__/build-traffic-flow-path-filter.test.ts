import { describe, it, expect } from "vitest"
import { buildTrafficFlowPathFilter } from "@/components/attack-paths-v2/build-traffic-flow-path-filter"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"

// Minimal jewel stub — buildTrafficFlowPathFilter only reads id/name/type.
const jewelStub = (
  id: string,
  name: string,
  type = "S3Bucket",
): CrownJewelSummary => ({ id, name, type } as unknown as CrownJewelSummary)

describe("buildTrafficFlowPathFilter", () => {
  it("includes path nodes and widens from compute infra_context", () => {
    const path = {
      id: "p1",
      nodes: [
        {
          id: "i-abc",
          name: "alon-demo-app2",
          type: "EC2Instance",
          tier: "entry",
          infra_context: {
            security_groups: [{ id: "sg-1", name: "alon-demo-app-sg", type: "SecurityGroup" }],
            nacls: [{ id: "acl-1", name: "acl-071", type: "NetworkAcl" }],
          },
        },
        { id: "role-1", name: "alon-demo-ec2-role", type: "IAMRole", tier: "identity" },
        { id: "arn:aws:s3:::logs", name: "saferemediate-logs", type: "S3Bucket", tier: "crown_jewel" },
      ],
      edges: [
        { source: "i-abc", target: "role-1", type: "HAS_INSTANCE_PROFILE" },
        { source: "role-1", target: "arn:aws:s3:::logs", type: "ACCESSES_RESOURCE" },
      ],
    } as unknown as IdentityAttackPath

    const f = buildTrafficFlowPathFilter(path, jewelStub("j1", "saferemediate-logs"))
    expect(f.nodeIds).toContain("i-abc")
    expect(f.nodeIds).toContain("role-1")
    expect(f.nodeIds).toContain("arn:aws:s3:::logs")
    expect(f.nodeIds).toContain("sg-1")
    expect(f.nodeIds).toContain("acl-1")
    expect(f.pathEdges?.length).toBe(2)
  })

  // Regression: a single EC2→S3 path must not drag in sibling workloads that
  // share the on-path ALB / InstanceProfile. The backend's enriched path nodes
  // carry reverse-direction infra_context buckets — an ALB entry node's
  // `load_balancers` lists ITS TARGET EC2s, an InstanceProfile's
  // `instance_profiles` lists the instances bound to it. Pulling those into the
  // spine rendered ~4 EC2 cards at full prominence for one path. Modeled on the
  // real alon-prod payload for path-4fd0ef803242 (jewel cyntro-demo-prod-data):
  // spine i-0aa, siblings i-0ee (same role) + i-009a/i-0d41 (arbitrary).
  it("does not pull sibling workloads (ALB targets / profile-bound) into the spine", () => {
    const SPINE = "i-0aa725bf8ff4c2001"
    const SIB_ROLE = "i-0ee29afa0048943e0" // shares alon-demo-ec2-role
    const SIB_1 = "i-009a28b5cab755850" // arbitrary neighbor
    const SIB_2 = "i-0d4186a6b477dcd55" // arbitrary neighbor
    const path = {
      id: "path-4fd0ef803242",
      nodes: [
        {
          id: "arn:aws:elasticloadbalancing:eu-west-1:1:loadbalancer/app/alb/1",
          name: "alon-prod-3tier-alb",
          type: "LoadBalancer",
          tier: "entry",
          // Reverse-direction bucket: the ALB's target instances.
          infra_context: {
            load_balancers: [
              { id: SPINE, name: SPINE, type: "EC2Instance" },
              { id: SIB_ROLE, name: SIB_ROLE, type: "EC2Instance" },
              { id: SIB_1, name: SIB_1, type: "EC2Instance" },
              { id: SIB_2, name: SIB_2, type: "EC2Instance" },
            ],
          },
        },
        { id: SPINE, name: SPINE, type: "EC2Instance", tier: "identity" },
        {
          id: "arn:aws:iam::1:instance-profile/p",
          name: "alon-demo-ec2-profile",
          type: "InstanceProfile",
          tier: "identity",
          // Reverse-direction bucket: instances bound to this profile.
          infra_context: {
            instance_profiles: [
              { id: SPINE, name: SPINE, type: "EC2Instance" },
              { id: SIB_ROLE, name: SIB_ROLE, type: "EC2Instance" },
            ],
          },
        },
        { id: "arn:aws:iam::1:role/alon-demo-ec2-role", name: "alon-demo-ec2-role", type: "IAMRole", tier: "identity" },
        { id: "arn:aws:s3:::cyntro-demo-prod-data", name: "cyntro-demo-prod-data", type: "S3Bucket", tier: "crown_jewel" },
      ],
      edges: [],
    } as unknown as IdentityAttackPath

    const f = buildTrafficFlowPathFilter(
      path,
      jewelStub("arn:aws:s3:::cyntro-demo-prod-data", "cyntro-demo-prod-data"),
    )

    // The true spine workload stays on the path.
    expect(f.nodeIds).toContain(SPINE)
    // Sibling workloads are NOT dragged in via the reverse buckets.
    expect(f.nodeIds).not.toContain(SIB_ROLE)
    expect(f.nodeIds).not.toContain(SIB_1)
    expect(f.nodeIds).not.toContain(SIB_2)
    // Exactly one EC2 workload survives on the path.
    const ec2 = (f.pathNodes ?? []).filter(
      (n) => /ec2|instance/i.test(n.type ?? "") && /^i-[0-9a-f]+$/i.test(n.id),
    )
    expect(ec2.map((n) => n.id)).toEqual([SPINE])
    // The InstanceProfile itself (a real forward gate) still passes through.
    expect(f.nodeIds).toContain("arn:aws:iam::1:instance-profile/p")
  })
})
