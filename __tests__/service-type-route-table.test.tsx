import { describe, expect, it } from "vitest"

import { getServiceMeta, resolveServiceType } from "@/lib/service-type"

describe("route table service metadata", () => {
  it("does not fall back to the generic Resource label", () => {
    expect(resolveServiceType("RouteTable")).toBe("RouteTable")
    expect(resolveServiceType("AWS::EC2::RouteTable")).toBe("RouteTable")
    expect(getServiceMeta("RouteTable")).toMatchObject({
      key: "RouteTable",
      label: "Route table",
      short: "RT",
    })
  })
})
