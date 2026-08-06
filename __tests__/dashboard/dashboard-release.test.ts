import { describe, expect, it } from "vitest"
import { isDashboardV3Enabled } from "@/lib/dashboard-release"

describe("dashboard release switch", () => {
  it("enables the report dashboard by default", () => {
    expect(isDashboardV3Enabled(undefined)).toBe(true)
  })

  it("keeps an explicit rollback switch", () => {
    expect(isDashboardV3Enabled("false")).toBe(false)
    expect(isDashboardV3Enabled("0")).toBe(false)
    expect(isDashboardV3Enabled("true")).toBe(true)
  })
})
