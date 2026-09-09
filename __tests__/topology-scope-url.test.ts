import {
  buildTopologyRiskCacheKey,
  buildTopologyRiskProxyUrl,
  buildTopologyRiskServerCacheKey,
  capEstateComputingDeadlineMs,
  resolveTopologyFetchVpcId,
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

  it("omits localStorage VPC from the first topology-risk GET", () => {
    expect(
      resolveTopologyFetchVpcId({
        urlVpcId: null,
        selectedVpcId: "vpc-0c39cde96f29f8f4e",
        payloadVpcId: null,
        fetchVpcId: null,
      }),
    ).toBeNull()
  })

  it("does not refetch when auto-select matches the snapshot VPC", () => {
    expect(
      resolveTopologyFetchVpcId({
        urlVpcId: null,
        selectedVpcId: "vpc-0c39cde96f29f8f4e",
        payloadVpcId: "vpc-0c39cde96f29f8f4e",
        fetchVpcId: null,
      }),
    ).toBeNull()
  })

  it("keeps an in-flight VPC fetch after that snapshot lands", () => {
    expect(
      resolveTopologyFetchVpcId({
        urlVpcId: null,
        selectedVpcId: "vpc-bbbbbbbbbbbbbbbbb",
        payloadVpcId: "vpc-bbbbbbbbbbbbbbbbb",
        fetchVpcId: "vpc-bbbbbbbbbbbbbbbbb",
      }),
    ).toBe("vpc-bbbbbbbbbbbbbbbbb")
  })

  it("refetches only when the picker leaves the snapshot VPC", () => {
    expect(
      resolveTopologyFetchVpcId({
        urlVpcId: null,
        selectedVpcId: "vpc-bbbbbbbbbbbbbbbbb",
        payloadVpcId: "vpc-0c39cde96f29f8f4e",
        fetchVpcId: null,
      }),
    ).toBe("vpc-bbbbbbbbbbbbbbbbb")
  })

  it("honors a vpc_id on the opening URL", () => {
    expect(
      resolveTopologyFetchVpcId({
        urlVpcId: "vpc-0c39cde96f29f8f4e",
        selectedVpcId: null,
        payloadVpcId: null,
        fetchVpcId: null,
      }),
    ).toBe("vpc-0c39cde96f29f8f4e")
  })

  it("caps a 180s backend compute deadline to 90s", () => {
    const started = Date.parse("2026-09-08T12:00:00.000Z")
    expect(
      capEstateComputingDeadlineMs("2026-09-08T12:03:00.000Z", started, started),
    ).toBe(started + 90_000)
  })

  it("uses the client 90s cap when the backend deadline is missing", () => {
    const started = Date.parse("2026-09-08T12:00:00.000Z")
    expect(capEstateComputingDeadlineMs(null, started, started)).toBe(started + 90_000)
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
