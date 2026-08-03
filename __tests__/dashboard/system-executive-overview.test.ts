import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  isCacheableSystemExecutiveSnapshot,
  isSystemExecutiveSnapshot,
} from "@/lib/system-executive-snapshot"

const root = join(__dirname, "..", "..")
const dashboard = readFileSync(join(root, "components/system-detail-dashboard.tsx"), "utf8")
const overview = readFileSync(
  join(root, "components/system-detail/system-executive-overview.tsx"),
  "utf8",
)

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    source: "neo4j",
    system_name: "payments",
    computed_at: "2026-08-03T00:00:00Z",
    serve_state: "READY",
    analysis_complete: true,
    counts_are_partial: false,
    narrative: { tone: "action_required", title: "Action required", body: "3 paths" },
    material_risk: { serve_state: "READY", analysis_complete: true, attack_paths: 3 },
    resource_risk: { serve_state: "READY", analysis_complete: true, total: 2 },
    remediation: { serve_state: "READY", analysis_complete: true },
    evidence: { serve_state: "READY", analysis_complete: true },
    outcomes: { serve_state: "READY", analysis_complete: true },
    context: { serve_state: "READY", analysis_complete: true, resource_count: 63 },
    ...overrides,
  }
}

describe("system executive overview", () => {
  it("accepts a governed system snapshot and rejects a missing system identity", () => {
    expect(isSystemExecutiveSnapshot(fixture())).toBe(true)
    expect(isSystemExecutiveSnapshot({ ...fixture(), system_name: undefined })).toBe(false)
  })

  it("does not cache a fully unavailable reading", () => {
    expect(isCacheableSystemExecutiveSnapshot(fixture({ serve_state: "READY" }))).toBe(true)
    expect(isCacheableSystemExecutiveSnapshot(fixture({
      serve_state: "NOT_READY",
      material_risk: { serve_state: "NOT_READY", analysis_complete: false, attack_paths: null },
    }))).toBe(false)
  })

  it("mounts one system snapshot instead of polling the legacy waterfall", () => {
    expect(dashboard).toContain("<SystemExecutiveOverview")
    expect(dashboard).not.toMatch(/setInterval\(fetchAllData/)
    expect(overview).toContain("/api/proxy/dashboard/systems/")
  })

  it("uses the executive product language requested for system pages", () => {
    expect(overview).toContain("Top crown jewel paths")
    expect(overview).toContain("Top resource risks")
    expect(overview).toContain("Recommended changes")
    expect(overview).toContain("Evidence readiness")
    expect(overview).not.toContain("Neo4j graph snapshot")
  })
})
