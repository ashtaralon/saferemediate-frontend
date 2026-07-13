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

  it("builds client cache key v10", () => {
    expect(
      buildTopologyRiskCacheKey("alon-prod", {
        accountId: "745783559495",
        region: "eu-west-1",
        vpcId: "vpc-abc",
      }),
    ).toBe("topology-risk:alon-prod:v10:745783559495:eu-west-1:vpc-abc")
  })

  it("builds server cache key aligned with BE dimensions", () => {
    expect(
      buildTopologyRiskServerCacheKey("alon-prod", {
        accountId: "745783559495",
        region: "eu-west-1",
        vpcId: "vpc-abc",
      }),
    ).toBe(
      "topology-risk:alon-prod:745783559495:eu-west-1:vpc-abc:2026-07-13:poison-bypass",
    )
  })
})