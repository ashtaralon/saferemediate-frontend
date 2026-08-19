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
        accountId: "745783559495",
        region: "eu-west-1",
        vpcId: "vpc-abc",
      }),
    ).toBe(
      "/api/proxy/topology-risk/alon-prod?account_id=745783559495&region=eu-west-1&vpc_id=vpc-abc",
    )
  })

  it("builds client cache key v11", () => {
    expect(
      buildTopologyRiskCacheKey("alon-prod", {
        accountId: "745783559495",
        region: "eu-west-1",
        vpcId: "vpc-abc",
      }),
    ).toBe("topology-risk:alon-prod:v11:745783559495:eu-west-1:vpc-abc")
  })

  it("builds server cache key aligned with BE dimensions", () => {
    expect(
      buildTopologyRiskServerCacheKey("alon-prod", {
        accountId: "745783559495",
        region: "eu-west-1",
        vpcId: "vpc-abc",
      }),
    ).toBe(
      "topology-risk:alon-prod:745783559495:eu-west-1:vpc-abc:2026-07-27:selected-scope-echo",
    )
  })

  it("includes customer scope in the URL and cache keys", () => {
    const scope = { customerId: "testbed-webshop" }
    expect(buildTopologyRiskProxyUrl("testbed-webshop", scope)).toBe(
      "/api/proxy/topology-risk/testbed-webshop?customer_id=testbed-webshop",
    )
    expect(buildTopologyRiskCacheKey("testbed-webshop", scope)).toBe(
      "topology-risk:testbed-webshop:testbed-webshop:v11:::all",
    )
    expect(buildTopologyRiskServerCacheKey("testbed-webshop", scope)).toBe(
      "topology-risk:testbed-webshop:testbed-webshop:2026-07-27:selected-scope-echo",
    )
  })
})
