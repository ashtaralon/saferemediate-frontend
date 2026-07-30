/**
 * The WIRING, not the helper.
 *
 * PR #466 shipped 9 green, mutation-checked tests for `attachNetworkPosture` and
 * still did not fix the bug, because every one of them tested the helper in
 * isolation while the defect was that no caller invoked it on this path. The
 * renderer therefore fell through to `?? true` and production kept rendering
 * `data-network-banner-reason=null`.
 *
 * Deleting the caller's call is invisible to helper tests — confirmed by
 * reverting `architectureWithPosture` to `architecture` and watching all 14 pass.
 * So the wiring gets its own assertion, in the same source-reading style the repo
 * already uses for contracts that cannot be unit-mounted.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const LANE_MAP = "components/attack-paths-v2/attack-path-lane-flow-map.tsx"
const TFM = "components/dependency-map/traffic-flow-map.tsx"

describe("network-posture wiring", () => {
  it("the attacker map passes a posture-bearing architecture, not the raw one", () => {
    const src = read(LANE_MAP)
    expect(src).toContain("attachLoadStatePosture")
    // The exact regression: handing TFM the untouched architecture.
    expect(src).toMatch(/architectureOverride=\{architectureWithPosture \?\? undefined\}/)
    expect(src).not.toMatch(/architectureOverride=\{architecture \?\? undefined\}/)
  })

  it("the posture is derived from the same signal that drives the partial chip", () => {
    // If these ever diverge, the banner and the "Partial view" chip would
    // disagree about whether the topology has finished loading.
    const src = read(LANE_MAP)
    expect(src).toMatch(/attachLoadStatePosture\(\s*architecture,\s*architectureLoading/)
    expect(src).toContain("Partial view")
  })

  it("the shared architecture memo still attaches posture for path-DTO views", () => {
    const src = read(TFM)
    expect(src).toContain("attachNetworkPosture(arch, spotlightPaths")
  })

  it("the renderer surfaces the reason, so a missing posture is visible", () => {
    // data-network-banner-reason is the only external signal that a posture was
    // actually supplied. It is how the #466 gap was caught at all.
    const src = read(TFM)
    expect(src).toContain("data-network-banner-reason")
    expect(src).toContain("Hop detail:")
  })

  it("the unverified branch is not styled as a finding", () => {
    const src = read(TFM)
    expect(src).toContain("Network Posture Not Verified")
    // ShieldOff is the amber alarm icon; the unverified state must use HelpCircle.
    expect(src).toMatch(/unverified \?\s*\(\s*<HelpCircle/)
  })
})
