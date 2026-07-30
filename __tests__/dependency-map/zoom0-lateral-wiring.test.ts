/**
 * Wiring guard — Lateral attacker lens uses pinned-path identity + TFM.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const PANEL = "components/attack-paths-v2/zoom0-fan-in-panel.tsx"
const IDENTITY = "lib/attack-paths/zoom0-lateral-identity.ts"

const read = (p: string) =>
  readFileSync(join(ROOT, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

describe("Zoom0 Lateral wiring", () => {
  it("resolves identity via resolveZoom0LateralIdentity — not risk_summary hub", () => {
    const src = read(PANEL)
    expect(src).toContain("resolveZoom0LateralIdentity")
    expect(src).toContain("TrafficFlowMap")
    expect(src).toContain("mapSpotlightPaths")
    expect(src).toContain('data-testid={')
    expect(src).toContain('"zoom0-lateral-tfm"')
    expect(src).not.toContain("Zoom0LateralAttackMap")
    expect(src).not.toMatch(
      /lateralIdentityId\s*=\s*useMemo\(\s*\(\)\s*=>\s*\(\s*riskSummary/,
    )
    expect(src).not.toMatch(
      /riskSummary\?\.top_risk\?\.identity\s*\?\?/,
    )
  })

  it("never falls back to risk_summary inside the identity helper", () => {
    const raw = readFileSync(join(ROOT, IDENTITY), "utf8")
    // Doc may name the anti-pattern; code must not read those fields.
    expect(raw).toMatch(/must NEVER be used as a silent fallback/i)
    expect(raw).not.toMatch(/riskSummary|top_risk\?\.identity|current_state\?\.identity/)
    expect(raw).not.toContain("zoom0RiskSummary")
  })

  it("keeps Lateral tab when pin changes (coordinated #451–453)", () => {
    const src = read(PANEL)
    expect(src).toContain('detailsPanel === "lateral"')
    expect(src).toMatch(/if \(detailsPanel === "lateral"\) return/)
  })

  it("Lateral and Current Access share pathAuthorityOnly TrafficFlowMap", () => {
    const src = read(PANEL)
    expect(src).toContain("pathAuthorityOnly")
    expect(src).toMatch(/detailsPanel === "lateral"/)
    expect(src).toContain('"Attacker lens · pinned path"')
  })
})
