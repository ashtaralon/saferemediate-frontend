import { describe, expect, it } from "vitest"
import { subnetOwnershipTooltipLine } from "@/components/topology-v0-2/estate-ownership"

describe("subnetOwnershipTooltipLine", () => {
  it("names owner for own-system subnets", () => {
    expect(
      subnetOwnershipTooltipLine([
        { owner_system_name: "alon-prod", is_foreign: false },
      ]),
    ).toBe("Owner: alon-prod")
  })

  it("marks shared neighbor when is_foreign", () => {
    expect(
      subnetOwnershipTooltipLine([
        { owner_system_name: "payment-production", is_foreign: true },
      ]),
    ).toBe("Shared neighbor · owned by payment-production")
  })

  it("returns null when ownership unknown", () => {
    expect(subnetOwnershipTooltipLine([{ owner_system_name: null }])).toBeNull()
    expect(subnetOwnershipTooltipLine([])).toBeNull()
  })
})
