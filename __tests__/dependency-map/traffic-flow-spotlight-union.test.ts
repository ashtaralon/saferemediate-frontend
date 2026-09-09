import { buildSpotlightActiveNodeIds } from "@/lib/attack-paths/build-spotlight-active-node-ids"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

const arch = {
  computeServices: [
    { id: "i-0aa725bf8ff4c2001", name: "alon-demo-app2", instanceId: "i-0aa725bf8ff4c2001" },
    { id: "i-0ee29afa0048943e0", name: "cyntro-web-server", instanceId: "i-0ee29afa0048943e0" },
  ],
  securityGroups: [
    { id: "sg-08f4ba91d94bc6d99", name: "alon-demo-app-sg", connectedSources: ["i-0aa725bf8ff4c2001"] },
    { id: "sg-default", name: "default", connectedSources: ["i-0ee29afa0048943e0"] },
  ],
  iamRoles: [
    { id: "arn:aws:iam::1:role/alon-demo-ec2-role", name: "alon-demo-ec2-role" },
    { id: "arn:aws:iam::1:role/cyntro-role", name: "cyntro-role" },
  ],
  flows: [
    {
      sourceId: "i-0aa725bf8ff4c2001",
      targetId: "arn:aws:s3:::bucket",
      sgId: "sg-08f4ba91d94bc6d99",
      roleId: "arn:aws:iam::1:role/alon-demo-ec2-role",
    },
    {
      sourceId: "i-0ee29afa0048943e0",
      targetId: "arn:aws:s3:::bucket",
      sgId: "sg-default",
      roleId: "arn:aws:iam::1:role/cyntro-role",
    },
  ],
  vpcEndpoints: [{ id: "vpce-s3" }],
  subnets: [
    {
      id: "subnet-app2",
      vpcId: "vpc-1",
      connectedComputeIds: ["i-0aa725bf8ff4c2001"],
    },
    {
      id: "subnet-web",
      vpcId: "vpc-1",
      connectedComputeIds: ["i-0ee29afa0048943e0"],
    },
  ],
  egressGateways: [{ id: "igw-1", vpcId: "vpc-1" }],
  nacls: [
    {
      id: "acl-app2",
      connectedSources: ["i-0aa725bf8ff4c2001"],
    },
  ],
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

describe("buildSpotlightActiveNodeIds", () => {
  it("single path → one workload in active set", () => {
    const ids = buildSpotlightActiveNodeIds({
      paths: [
        path({
          path_id: "p1",
          source: "alon-demo-app2",
          workload_arn: "i-0aa725bf8ff4c2001",
          identity: "arn:aws:iam::1:role/alon-demo-ec2-role",
        }),
      ],
      spotlightPathId: "p1",
      architecture: arch,
    })
    expect(ids.has("i-0aa725bf8ff4c2001")).toBe(true)
    expect(ids.has("i-0ee29afa0048943e0")).toBe(false)
  })

  it("two paths, distinct workloads → union both compute ids", () => {
    const ids = buildSpotlightActiveNodeIds({
      paths: [
        path({
          path_id: "p1",
          source: "alon-demo-app2",
          workload_arn: "i-0aa725bf8ff4c2001",
        }),
        path({
          path_id: "p2",
          source: "cyntro-web-server",
          workload_arn: "i-0ee29afa0048943e0",
        }),
      ],
      spotlightPathId: null,
      architecture: arch,
    })
    expect(ids.has("i-0aa725bf8ff4c2001")).toBe(true)
    expect(ids.has("i-0ee29afa0048943e0")).toBe(true)
    expect(ids.has("sg-08f4ba91d94bc6d99")).toBe(true)
    expect(ids.has("sg-default")).toBe(true)
  })

  it("two paths, same workload → deduped compute id", () => {
    const ids = buildSpotlightActiveNodeIds({
      paths: [
        path({ path_id: "p1", source: "alon-demo-app2", workload_arn: "i-0aa725bf8ff4c2001" }),
        path({ path_id: "p2", source: "alon-demo-app2", workload_arn: "i-0aa725bf8ff4c2001" }),
      ],
      spotlightPathId: null,
      architecture: arch,
    })
    const computeIds = [...ids].filter((id) => id.startsWith("i-"))
    expect(computeIds).toEqual(["i-0aa725bf8ff4c2001"])
  })

  it("specific path selected → only that path's workload", () => {
    const ids = buildSpotlightActiveNodeIds({
      paths: [
        path({ path_id: "p1", source: "alon-demo-app2", workload_arn: "i-0aa725bf8ff4c2001" }),
        path({ path_id: "p2", source: "cyntro-web-server", workload_arn: "i-0ee29afa0048943e0" }),
      ],
      spotlightPathId: "p2",
      architecture: arch,
    })
    expect(ids.has("i-0ee29afa0048943e0")).toBe(true)
    expect(ids.has("i-0aa725bf8ff4c2001")).toBe(false)
    expect(ids.has("sg-default")).toBe(true)
    expect(ids.has("sg-08f4ba91d94bc6d99")).toBe(false)
  })

  it("includes subnet + IGW + NACL from dep-map placement for path compute", () => {
    const ids = buildSpotlightActiveNodeIds({
      paths: [
        path({
          path_id: "p1",
          source: "alon-demo-app2",
          workload_arn: "i-0aa725bf8ff4c2001",
        }),
      ],
      spotlightPathId: "p1",
      architecture: arch,
    })
    expect(ids.has("subnet-app2")).toBe(true)
    expect(ids.has("igw-1")).toBe(true)
    expect(ids.has("acl-app2")).toBe(true)
    // Sibling compute's subnet stays out of the active set.
    expect(ids.has("subnet-web")).toBe(false)
    // VPCEs already on the architecture lane (post ROUTES_VIA / flow
    // filter in buildArchitecture) stay active so the VPC ENDPOINTS
    // column is not hidden. Unrelated Interface VPCEs never reach
    // architecture.vpcEndpoints.
    expect(ids.has("vpce-s3")).toBe(true)
  })

  it("matches IGW via compute.vpcId when subnet.vpcId is missing", () => {
    const ids = buildSpotlightActiveNodeIds({
      paths: [
        path({
          path_id: "p1",
          source: "alon-demo-app2",
          workload_arn: "i-0aa725bf8ff4c2001",
        }),
      ],
      spotlightPathId: "p1",
      architecture: {
        ...arch,
        computeServices: [
          {
            id: "i-0aa725bf8ff4c2001",
            name: "alon-demo-app2",
            instanceId: "i-0aa725bf8ff4c2001",
            vpcId: "vpc-1",
          },
        ],
        subnets: [
          {
            id: "subnet-app2",
            vpcId: null,
            connectedComputeIds: ["i-0aa725bf8ff4c2001"],
          },
        ],
      },
    })
    expect(ids.has("subnet-app2")).toBe(true)
    expect(ids.has("igw-1")).toBe(true)
  })

  it("keeps server-authored workload-network cards visible in path-authority mode", () => {
    const ids = buildSpotlightActiveNodeIds({
      paths: [
        path({
          path_id: "path-mat-f154cc5c35a3",
          workload_arn:
            "arn:aws:ec2:eu-west-1:416651950952:instance/i-0129135b4e4723d6d",
          workload_network: {
            is_vpc_attached: true,
            vpc_attachment_state: "VPC_ATTACHED",
            vpc_id: "vpc-0c39cde96f29f8f4e",
            subnets: [
              {
                id: "subnet-0ededebe568732139",
                name: "cyntro-tb-prod-app-eu-west-1b",
                is_public: false,
              },
            ],
            security_groups: [
              { id: "sg-0ed42745ba403737f", name: "cyntro-tb-prod-app" },
            ],
            nacls: [
              { id: "acl-1", subnet_ids: ["subnet-0ededebe568732139"] },
            ],
            route_tables: [
              {
                id: "rtb-09626f0eee62242b7",
                subnet_ids: ["subnet-0ededebe568732139"],
                route_count: 3,
              },
            ],
            instance_profiles: [
              {
                id: "arn:aws:iam::416651950952:instance-profile/cyntro-tb-prod-app",
                role_id: "arn:aws:iam::416651950952:role/cyntro-tb-prod-app-role",
              },
            ],
          },
        }),
      ],
      spotlightPathId: "path-mat-f154cc5c35a3",
      architecture: null,
      pathAuthorityOnly: true,
    })

    expect(ids.has("subnet-0ededebe568732139")).toBe(true)
    expect(ids.has("sg-0ed42745ba403737f")).toBe(true)
    expect(ids.has("acl-1")).toBe(true)
    expect(ids.has("rtb-09626f0eee62242b7")).toBe(true)
    expect(
      ids.has("arn:aws:iam::416651950952:instance-profile/cyntro-tb-prod-app"),
    ).toBe(true)
    expect(
      ids.has("arn:aws:iam::416651950952:role/cyntro-tb-prod-app-role"),
    ).toBe(true)
  })
})
