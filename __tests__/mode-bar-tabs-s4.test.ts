import { describe, expect, it } from "vitest"
import {
  buildModeBarTabs,
  FOLDED_MODE_KEYS,
  modeBarHighlight,
} from "@/components/attack-paths-v2/mode-bar-tabs"

describe("mode-bar-tabs", () => {
  it("shows Attack Map + Lateral Movement next to Attack Path", () => {
    const keys = buildModeBarTabs(false).map((t) => t.key)
    expect(keys).toContain("attack-path")
    expect(keys).toContain("attacker_map")
    expect(keys).toContain("lateral")
    expect(keys.indexOf("attacker_map")).toBe(keys.indexOf("attack-path") + 1)
    expect(keys.indexOf("lateral")).toBe(keys.indexOf("attacker_map") + 1)
    expect(keys).toContain("topology")
    expect(keys).toContain("exposure")
    expect(keys).toContain("exfil")
    expect(keys).toContain("convergence")
    expect(FOLDED_MODE_KEYS.size).toBe(0)
  })

  it("still offers beta tabs when showBeta", () => {
    const keys = buildModeBarTabs(true).map((t) => t.key)
    expect(keys).toContain("attacker_v2")
    expect(keys).toContain("phase")
    expect(keys).toContain("attacker_map")
    expect(keys).toContain("lateral")
  })

  it("highlights each presentation chip as itself", () => {
    expect(modeBarHighlight("lateral")).toBe("lateral")
    expect(modeBarHighlight("attacker_map")).toBe("attacker_map")
    expect(modeBarHighlight("exfil")).toBe("exfil")
  })
})
