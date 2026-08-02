/**
 * Integrity guard for the V3 estate risk brief.
 * Re-introducing unknown→0 or hardcoded systems must fail these tests.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const BRIEF = readFileSync(
  join(ROOT, "components/dashboard/v3/estate-risk-brief.tsx"),
  "utf8",
)
const HOME = readFileSync(
  join(ROOT, "components/dashboard/v3/home-dashboard-v3.tsx"),
  "utf8",
)

describe("EstateRiskBrief — Neo4j-backed honesty", () => {
  it("wires only real proxy endpoints (no hardcoded systems)", () => {
    expect(BRIEF).toContain('/api/proxy/systems/with-families')
    expect(BRIEF).toContain('/api/proxy/identity-attack-paths/all')
    expect(BRIEF).toContain('/api/proxy/remediation-candidates')
    expect(BRIEF).not.toMatch(/alon-prod|demo-system|fakeSystems|mockSystems/)
  })

  it("MUTATION: unknown metrics must not coerce to 0", () => {
    // Em-dash for null is the unavailable glyph; ?? 0 invents authority.
    expect(BRIEF).toContain('metric.value ?? "—"')
    expect(BRIEF).not.toMatch(/\?\?\s*0/)
    expect(BRIEF).not.toMatch(/\|\|\s*0\b/)
  })

  it("MUTATION: missing path/system payloads stay null until data arrives", () => {
    expect(BRIEF).toMatch(/systems\.data \? \(systems\.data\.systems \?\? \[\]\)\.length : null/)
    expect(BRIEF).toMatch(/paths\.data\?\.total_jewels \?\? null/)
    expect(BRIEF).toMatch(/paths\.data\?\.total_paths \?\? null/)
    expect(BRIEF).toMatch(/paths\.data\?\.exposed_jewels \?\? null/)
  })

  it("home dashboard mounts the brief as the first viewport", () => {
    expect(HOME).toContain("EstateRiskBrief")
    expect(HOME).toContain("<EstateRiskBrief")
  })
})
