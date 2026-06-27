import { describe, expect, it } from "vitest"
import {
  VPCE_INACTIVE_PATH_TOOLTIP,
  VPCE_INACTIVE_TOOLTIP,
  countVpceLane,
  vpceCardChrome,
  vpceCardTitle,
  vpceLaneSubtitle,
} from "@/lib/dependency-map/vpce-lane-visual"

describe("vpce-lane-visual (Bug M)", () => {
  it("counts active vs not-used endpoints in lane", () => {
    const ids = ["vpce-s3", "vpce-ssm", "vpce-ssmm", "vpce-ec2m"]
    const counts = countVpceLane(ids, new Set(["vpce-s3"]))
    expect(counts).toEqual({ activeCount: 1, availableCount: 3 })
    expect(vpceLaneSubtitle(counts)).toBe("1 active · 3 not used")
  })

  it("handles zero active (all not used)", () => {
    const counts = countVpceLane(["a", "b", "c", "d"], new Set())
    expect(vpceLaneSubtitle(counts)).toBe("0 active · 4 not used")
  })

  it("styles active vs inactive in architecture view", () => {
    expect(vpceCardChrome(true, false)).toContain("ring-violet-400")
    expect(vpceCardChrome(true, false)).toContain("opacity-100")
    expect(vpceCardChrome(false, false)).toContain("opacity-50")
    expect(vpceCardChrome(false, false)).toContain("border-dashed")
  })

  it("preserves path-filter chrome without Bug M dimming", () => {
    expect(vpceCardChrome(true, true)).toBe("bg-muted border-border shadow-md")
    expect(vpceCardChrome(false, true)).toBe("bg-card border-border")
  })

  it("tooltip on inactive cards only in architecture view", () => {
    expect(vpceCardTitle(false, false, "com.amazonaws.eu-west-1.s3", "vpce-1")).toBe(
      VPCE_INACTIVE_TOOLTIP,
    )
    expect(vpceCardTitle(true, false, "com.amazonaws.eu-west-1.s3", "vpce-1")).toBe(
      "com.amazonaws.eu-west-1.s3",
    )
    expect(vpceCardTitle(false, true, "com.amazonaws.eu-west-1.s3", "vpce-1")).toBe(
      VPCE_INACTIVE_PATH_TOOLTIP,
    )
  })
})
