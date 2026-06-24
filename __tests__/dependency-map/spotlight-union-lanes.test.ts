import {
  buildSpotlightActiveNodeIds,
  selectSpotlightPaths,
} from "@/lib/attack-paths/build-spotlight-active-node-ids"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

const arch = {
  computeServices: [
    { id: "i-0aa725bf8ff4c2001", name: "alon-demo-app2", instanceId: "i-0aa725bf8ff4c2001" },
    { id: "i-0ee29afa0048943e0", name: "cyntro-web-server", instanceId: "i-0ee29afa0048943e0" },
  ],
  securityGroups: [
    {
      id: "sg-08f4ba91d94bc6d99",
      name: "alon-demo-app-sg",
      connectedSources: ["i-0aa725bf8ff4c2001"],
    },
    {
      id: "sg-default",
      name: "default",
      connectedSources: ["i-0ee29afa0048943e0"],
    },
  ],
  iamRoles: [{ id: "arn:aws:iam::1:role/alon-demo-ec2-role", name: "alon-demo-ec2-role" }],
  flows: [
    {
      sourceId: "i-0aa725bf8ff4c2001",
      targetId: "arn:aws:s3:::bucket",
      sgId: "sg-08f4ba91d94bc6d99",
    },
  ],
  vpcEndpoints: [{ id: "vpce-s3" }],
}

function path(overrides: Partial<ConvergencePath>): ConvergencePath {
  return {
    path_id: "p1",
    damage: [],
    score: 50,
    confidence: "configured",
    hop_count: 5,
    ...overrides,
  }
}

function computeIds(ids: Set<string>): string[] {
  return [...ids].filter((id) => id.startsWith("i-"))
}

function sgIds(ids: Set<string>): string[] {
  return [...ids].filter((id) => id.startsWith("sg-"))
}

describe("spotlight union lanes (Bug L.1)", () => {
  it("union, 2 real paths → 2 compute + 2 SG chips", () => {
    const paths = [
      path({ path_id: "p1", source: "alon-demo-app2", workload_arn: "i-0aa725bf8ff4c2001" }),
      path({ path_id: "p2", source: "cyntro-web-server", workload_arn: "i-0ee29afa0048943e0" }),
    ]
    const ids = buildSpotlightActiveNodeIds({
      paths,
      spotlightPathId: null,
      architecture: arch,
    })
    expect(computeIds(ids).sort()).toEqual([
      "i-0aa725bf8ff4c2001",
      "i-0ee29afa0048943e0",
    ])
    expect(sgIds(ids).sort()).toEqual(["sg-08f4ba91d94bc6d99", "sg-default"])
  })

  it("union, 1 real + 1 orphan → 1 compute + 1 SG", () => {
    const paths = [
      path({ path_id: "orphan", source: "(orphan role)", workload_arn: "" }),
      path({ path_id: "p1", source: "alon-demo-app2", workload_arn: "i-0aa725bf8ff4c2001" }),
    ]
    expect(selectSpotlightPaths(paths, null)).toHaveLength(1)
    const ids = buildSpotlightActiveNodeIds({
      paths,
      spotlightPathId: null,
      architecture: arch,
    })
    expect(computeIds(ids)).toEqual(["i-0aa725bf8ff4c2001"])
    expect(sgIds(ids)).toEqual(["sg-08f4ba91d94bc6d99"])
  })

  it("drill mode → single path workload + SG", () => {
    const paths = [
      path({ path_id: "p1", source: "alon-demo-app2", workload_arn: "i-0aa725bf8ff4c2001" }),
      path({ path_id: "p2", source: "cyntro-web-server", workload_arn: "i-0ee29afa0048943e0" }),
    ]
    const ids = buildSpotlightActiveNodeIds({
      paths,
      spotlightPathId: "p2",
      architecture: arch,
    })
    expect(computeIds(ids)).toEqual(["i-0ee29afa0048943e0"])
    expect(sgIds(ids)).toEqual(["sg-default"])
  })

  it("same workload, 2 paths → deduped compute, union SGs", () => {
    const paths = [
      path({
        path_id: "p1",
        source: "alon-demo-app2",
        workload_arn: "i-0aa725bf8ff4c2001",
        identity: "arn:aws:iam::1:role/role-a",
      }),
      path({
        path_id: "p2",
        source: "alon-demo-app2",
        workload_arn: "i-0aa725bf8ff4c2001",
        identity: "arn:aws:iam::1:role/role-b",
      }),
    ]
    const archTwoRoles = {
      ...arch,
      securityGroups: [
        ...arch.securityGroups,
        {
          id: "sg-alt",
          name: "alon-demo-alt-sg",
          connectedSources: ["i-0aa725bf8ff4c2001"],
        },
      ],
    }
    const ids = buildSpotlightActiveNodeIds({
      paths,
      spotlightPathId: null,
      architecture: archTwoRoles,
    })
    expect(computeIds(ids)).toEqual(["i-0aa725bf8ff4c2001"])
    expect(sgIds(ids).sort()).toEqual(["sg-08f4ba91d94bc6d99", "sg-alt"])
  })
})
