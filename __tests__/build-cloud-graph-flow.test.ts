import { describe, expect, it } from "vitest"
import { orderPathFlowEdges } from "@/components/attack-paths-v2/build-cloud-graph-flow"
import type { CMEdge } from "@/components/attack-paths-v2/containment-model"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"

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
    } as IdentityAttackPath

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
