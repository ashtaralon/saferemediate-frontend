import { describe, expect, it } from "vitest"
import {
  buildModeBarTabs,
  FOLDED_MODE_KEYS,
  modeBarHighlight,
} from "@/components/attack-paths-v2/mode-bar-tabs"

describe("mode-bar-tabs (S4)", () => {
  it("folds Attacker Map and Lateral out of the primary bar", () => {
    const keys = buildModeBarTabs(false).map((t) => t.key)
    expect(keys).toContain("attack-path")
    expect(keys).toContain("topology")
    expect(keys).toContain("exposure")
    expect(keys).toContain("exfil")
    expect(keys).not.toContain("attacker_map")
    expect(keys).not.toContain("lateral")
    expect(FOLDED_MODE_KEYS.has("attacker_map")).toBe(true)
    expect(FOLDED_MODE_KEYS.has("lateral")).toBe(true)
  })

  it("still offers beta tabs when showBeta", () => {
    const keys = buildModeBarTabs(true).map((t) => t.key)
    expect(keys).toContain("attacker_v2")
    expect(keys).toContain("phase")
    expect(keys).not.toContain("attacker_map")
  })

  it("highlights Attack Path for folded deep-links", () => {
    expect(modeBarHighlight("attacker_map")).toBe("attack-path")
    expect(modeBarHighlight("lateral")).toBe("attack-path")
    expect(modeBarHighlight("exfil")).toBe("exfil")
  })
})
