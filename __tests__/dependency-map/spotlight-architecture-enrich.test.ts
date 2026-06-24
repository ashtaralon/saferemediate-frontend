import { enrichArchitectureForSpotlight } from "@/lib/attack-paths/enrich-architecture-for-spotlight"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

const emptyArch = {
  computeServices: [
    {
      id: "i-0662a9c68ba77f837",
      name: "i-0662a9c68ba77f837",
      shortName: "i-0662a9c68",
      type: "compute" as const,
      instanceId: "i-0662a9c68",
    },
  ],
  securityGroups: [] as Array<{
    id: string
    type: "security_group"
    name: string
    shortName: string
    usedCount: number
    totalCount: number
    gapCount: number
    connectedSources: string[]
    connectedTargets: string[]
  }>,
  iamRoles: [] as Array<{
    id: string
    type: "iam_role"
    name: string
    shortName: string
    usedCount: number
    totalCount: number
    gapCount: number
    connectedSources: string[]
    connectedTargets: string[]
  }>,
}

const cyntrotestPath: ConvergencePath = {
  path_id: "real",
  source: "i-0662a9c68ba77f837",
  workload_arn: "i-0662a9c68ba77f837",
  identity: "arn:aws:iam::745783559495:role/cyntrotest-ec2-role",
  identity_name: "cyntrotest-ec2-role",
  damage: ["read", "write"],
  score: 0,
  confidence: "observed",
  hop_count: 8,
  hops: [
    {
      node_id: "i-0662a9c68ba77f837",
      node_type: "EC2Instance",
      name: "i-0662a9c68ba77f837",
      plane: "compute",
      security_groups: ["cyntrotest-sg"],
      is_crown_jewel: false,
    },
    {
      node_id: "sg-0f3c9dfda7d4c3614",
      node_type: "SecurityGroup",
      name: "cyntrotest-sg",
      plane: "network",
      security_groups: ["cyntrotest-sg"],
      is_crown_jewel: false,
    },
    {
      node_id: "arn:aws:iam::745783559495:role/cyntrotest-ec2-role",
      node_type: "IAMRole",
      name: "cyntrotest-ec2-role",
      plane: "identity",
      security_groups: [],
      is_crown_jewel: false,
    },
  ],
}

describe("enrichArchitectureForSpotlight", () => {
  it("seeds SG + IAM from hops when dep-map omitted them", () => {
    const enriched = enrichArchitectureForSpotlight(
      emptyArch,
      [
        {
          path_id: "orphan",
          source: "(orphan role)",
          workload_arn: "",
          damage: [],
          score: 0,
          confidence: "observed",
          hop_count: 0,
        },
        cyntrotestPath,
      ],
      null,
    )
    expect(enriched.securityGroups.map((s) => s.id)).toEqual(["sg-0f3c9dfda7d4c3614"])
    expect(enriched.securityGroups[0].name).toBe("cyntrotest-sg")
    expect(enriched.iamRoles.map((r) => r.id)).toContain(
      "arn:aws:iam::745783559495:role/cyntrotest-ec2-role",
    )
  })

  it("drill mode only enriches from selected path", () => {
    const otherPath: ConvergencePath = {
      ...cyntrotestPath,
      path_id: "other",
      workload_arn: "i-other",
      hops: [
        {
          node_id: "sg-other",
          node_type: "SecurityGroup",
          name: "other-sg",
          plane: "network",
          security_groups: [],
          is_crown_jewel: false,
        },
      ],
    }
    const enriched = enrichArchitectureForSpotlight(
      emptyArch,
      [cyntrotestPath, otherPath],
      "other",
    )
    expect(enriched.securityGroups.map((s) => s.id)).toEqual(["sg-other"])
  })
})
