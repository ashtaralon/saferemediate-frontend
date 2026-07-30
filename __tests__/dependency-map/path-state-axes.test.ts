/**
 * Wiring guard for the two-axis split. Separate file on purpose: the shared
 * network-posture-wiring test is being edited on the #470 branch, and a
 * conflict there would stall a P0 semantic fix behind pixel QA.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const readCode = (p: string) =>
  readFileSync(join(ROOT, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

const COMPOSER = "lib/attack-paths/path-feasibility-verdict.ts"
const PANEL = "components/attack-paths-v2/zoom0-fan-in-panel.tsx"

describe("two-axis wiring", () => {
  it("both axes reach the DOM", () => {
    const src = readCode(PANEL)
    expect(src).toMatch(/data-path-state=\{pathVerdict\.pathState\}/)
    expect(src).toMatch(/data-activity-state=\{pathVerdict\.activityState\}/)
  })

  it("SERVE feasibility is authoritative when present", () => {
    const src = readCode(PANEL)
    expect(src).toContain("pathVerdictFromServerFeasibility")
    expect(src).toMatch(/if \(server\) return server/)
  })

  it("deploy-skew fallback uses AttackPath graph fields — never null hardcodes", () => {
    const src = readCode(PANEL)
    expect(src).toContain("identityGate")
    expect(src).toContain("dataPlaneGate")
    expect(src).toContain("authzDecision")
    expect(src).toContain("observedTrafficBound:")
    expect(src).not.toMatch(/authorizationComposed:\s*null/)
    expect(src).not.toMatch(/dataAccessComposed:\s*null/)
    expect(src).not.toContain("roleAssumptionObserved")
    expect(src).not.toContain("dataAccessObserved")
  })

  it("the frontend never derives a finding", () => {
    expect(readCode(PANEL)).toContain("serverFinding: false")
    expect(readCode(COMPOSER)).toContain("isFinding: Boolean(input.serverFinding)")
  })

  it("REACHABLE_NOW is gone from both files", () => {
    expect(readCode(COMPOSER)).not.toContain("REACHABLE_NOW")
    expect(readCode(PANEL)).not.toContain("REACHABLE_NOW")
  })

  it("local compose is deploy-skew only — delete when SERVE always ships", () => {
    const raw = readFileSync(join(ROOT, COMPOSER), "utf8")
    expect(raw).toMatch(/DEPLOY-SKEW ONLY/)
    expect(raw).toMatch(/DELETE the call site/)
    expect(raw).toContain("pathVerdictFromServerFeasibility")
  })
})
