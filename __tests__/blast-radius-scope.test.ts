import { describe, expect, it } from "vitest"
import { buildBlastRadiusUrl } from "@/components/attack-paths-v2/blast-radius-scope"

describe("buildBlastRadiusUrl", () => {
  it("binds the blast-radius read to the selected estate scope", () => {
    expect(
      buildBlastRadiusUrl("testbed-webshop", {
        customerId: "testbed-webshop",
        accountId: "416651950952",
        region: "eu-west-1",
      }),
    ).toBe(
      "/api/proxy/business-system/testbed-webshop/blast-radius" +
        "?customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1",
    )
  })

  it("does not invent scope when it is unavailable", () => {
    expect(buildBlastRadiusUrl("testbed-webshop", {})).toBe(
      "/api/proxy/business-system/testbed-webshop/blast-radius",
    )
  })
})
