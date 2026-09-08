import {
  buildTopologyRiskCacheKey,
  buildTopologyRiskProxyUrl,
  buildTopologyRiskServerCacheKey,
  resolveTopologyScopeParams,
  scopeFromSearch,
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

  it("reads account and region from the navigation URL", () => {
    expect(
      scopeFromSearch(
        "systemName=testbed-webshop&customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1",
      ),
    ).toEqual({
      customerId: "testbed-webshop",
      accountId: "416651950952",
      region: "eu-west-1",
      vpcId: null,
    })
  })

  it("prefers the navigation URL when the product bar is still All", () => {
    expect(
      resolveTopologyScopeParams(
        { accountId: null, regionId: null, vpcId: null },
        { customerId: "testbed-webshop", accountId: "all", region: "all" },
        scopeFromSearch("customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1"),
      ),
    ).toEqual({
      customerId: "testbed-webshop",
      accountId: "416651950952",
      region: "eu-west-1",
      vpcId: null,
    })
  })

  it("uses the product-bar account and region when map-local storage is empty", () => {
    expect(
      resolveTopologyScopeParams(
        { accountId: null, regionId: null, vpcId: null },
        { customerId: "testbed-webshop", accountId: "416651950952", region: "eu-west-1" },
      ),
    ).toEqual({
      customerId: "testbed-webshop",
      accountId: "416651950952",
      region: "eu-west-1",
      vpcId: null,
    })
  })

  it("keeps an explicit map-local account over the product bar", () => {
    expect(
      resolveTopologyScopeParams(
        { accountId: "111111111111", regionId: "us-east-1", vpcId: "vpc-1" },
        { customerId: "testbed-webshop", accountId: "416651950952", region: "eu-west-1" },
      ),
    ).toEqual({
      customerId: "testbed-webshop",
      accountId: "111111111111",
      region: "us-east-1",
      vpcId: "vpc-1",
    })
  })

  it("does not invent account or region from an unscoped product bar", () => {
    expect(
      resolveTopologyScopeParams(
        { accountId: null, regionId: null, vpcId: null },
        { customerId: "testbed-webshop", accountId: "all", region: "all" },
      ),
    ).toEqual({
      customerId: "testbed-webshop",
      accountId: null,
      region: null,
      vpcId: null,
    })
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
