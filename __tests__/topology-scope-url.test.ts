import {
  buildTopologyRiskCacheKey,
  buildTopologyRiskProxyUrl,
  buildTopologyRiskServerCacheKey,
} from "@/components/topology-v0-2/topology-scope-url"

describe("topology scope URLs", () => {
  it("builds unscoped proxy URL", () => {
    expect(buildTopologyRiskProxyUrl("alon-prod")).toBe("/api/proxy/topology-risk/alon-prod")
  })

  it("builds fully scoped proxy URL", () => {
    expect(
      buildTopologyRiskProxyUrl("alon-prod", {
        customerId: "testbed-webshop",
        accountId: "745783559495",
        region: "eu-west-1",
        vpcId: "vpc-abc",
      }),
    ).toBe(
      "/api/proxy/topology-risk/alon-prod?customer_id=testbed-webshop&account_id=745783559495&region=eu-west-1&vpc_id=vpc-abc",
    )
  })

  it("builds tenant-partitioned client cache key v11", () => {
    expect(
      buildTopologyRiskCacheKey("alon-prod", {
        customerId: "testbed-webshop",
        accountId: "745783559495",
        region: "eu-west-1",
        vpcId: "vpc-abc",
      }),
    ).toBe("topology-risk:testbed-webshop:alon-prod:v11:745783559495:eu-west-1:vpc-abc")
  })

  it("builds server cache key aligned with BE dimensions", () => {
    expect(
      buildTopologyRiskServerCacheKey("alon-prod", {
        customerId: "testbed-webshop",
        accountId: "745783559495",
        region: "eu-west-1",
        vpcId: "vpc-abc",
      }),
    ).toBe(
      "topology-risk:testbed-webshop:alon-prod:745783559495:eu-west-1:vpc-abc:2026-08-22:tenant-scoped-neptune",
    )
  })
})
