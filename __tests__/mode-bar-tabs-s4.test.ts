import { describe, expect, it } from "vitest"
import {
  buildModeBarTabs,
  FOLDED_MODE_KEYS,
  modeBarHighlight,
} from "@/components/attack-paths-v2/mode-bar-tabs"

describe("mode-bar-tabs", () => {
  it("shows Attack Map next to Attack Path; folds Lateral only", () => {
    const keys = buildModeBarTabs(false).map((t) => t.key)
    expect(keys).toContain("attack-path")
    expect(keys).toContain("attacker_map")
    expect(keys.indexOf("attacker_map")).toBe(keys.indexOf("attack-path") + 1)
    expect(keys).toContain("topology")
    expect(keys).toContain("exposure")
    expect(keys).toContain("exfil")
    expect(keys).not.toContain("lateral")
    expect(FOLDED_MODE_KEYS.has("attacker_map")).toBe(false)
    expect(FOLDED_MODE_KEYS.has("lateral")).toBe(true)
  })

  it("still offers beta tabs when showBeta", () => {
    const keys = buildModeBarTabs(true).map((t) => t.key)
    expect(keys).toContain("attacker_v2")
    expect(keys).toContain("phase")
    expect(keys).toContain("attacker_map")
  })

  it("highlights Attack Path only for folded Lateral deep-links", () => {
    expect(modeBarHighlight("lateral")).toBe("attack-path")
    expect(modeBarHighlight("attacker_map")).toBe("attacker_map")
    expect(modeBarHighlight("exfil")).toBe("exfil")
  })
})
