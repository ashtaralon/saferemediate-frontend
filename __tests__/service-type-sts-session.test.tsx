import { describe, expect, it } from "vitest"
import { getServiceMeta, resolveServiceType } from "@/lib/service-type"

describe("STS session service type", () => {
  it("renders the identity session honestly instead of generic Resource", () => {
    expect(resolveServiceType("STSSession")).toBe("STSSession")
    expect(resolveServiceType("sts_session")).toBe("STSSession")
    expect(getServiceMeta("STSSession")).toMatchObject({
      label: "STS session",
      short: "STS",
      category: "identity",
    })
  })
})
