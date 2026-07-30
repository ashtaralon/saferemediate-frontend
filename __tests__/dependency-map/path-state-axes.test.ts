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

  it("observation is passed for activity, NOT for feasibility", () => {
    // observedTrafficBound must not appear in any pathState branch. The
    // composer enforces it; this pins that the panel does not smuggle it in
    // through a feasibility-shaped field.
    const src = readCode(PANEL)
    expect(src).toContain("observedTrafficBound:")
    expect(src).not.toContain("roleAssumptionObserved")
    expect(src).not.toContain("dataAccessObserved")
  })

  it("server-composed results are the only feasibility inputs", () => {
    const src = readCode(PANEL)
    expect(src).toContain("authorizationComposed:")
    expect(src).toContain("dataAccessComposed:")
  })

  it("the frontend never derives a finding", () => {
    expect(readCode(PANEL)).toContain("serverFinding: false")
    expect(readCode(COMPOSER)).toContain("isFinding: Boolean(input.serverFinding)")
  })

  it("REACHABLE_NOW is gone from both files", () => {
    expect(readCode(COMPOSER)).not.toContain("REACHABLE_NOW")
    expect(readCode(PANEL)).not.toContain("REACHABLE_NOW")
  })

  it("the composer is marked temporary with no fallback", () => {
    // A fallback that composes judgment locally is how the renderer stops being
    // literal. This must be deleted when the backend contract lands.
    const raw = readFileSync(join(ROOT, COMPOSER), "utf8")
    expect(raw).toContain("TEMPORARY")
    expect(raw).toMatch(/DELETE when the backend/)
    expect(raw).toMatch(/do not keep it as a fallback/i)
  })
})
