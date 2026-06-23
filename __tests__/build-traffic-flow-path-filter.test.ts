import { describe, it, expect } from "vitest"
import { buildTrafficFlowPathFilter } from "@/components/attack-paths-v2/build-traffic-flow-path-filter"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"

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

    const f = buildTrafficFlowPathFilter(path, { id: "j1", name: "saferemediate-logs", type: "S3Bucket" })
    expect(f.nodeIds).toContain("i-abc")
    expect(f.nodeIds).toContain("role-1")
    expect(f.nodeIds).toContain("arn:aws:s3:::logs")
    expect(f.nodeIds).toContain("sg-1")
    expect(f.nodeIds).toContain("acl-1")
    expect(f.pathEdges?.length).toBe(2)
  })
})
