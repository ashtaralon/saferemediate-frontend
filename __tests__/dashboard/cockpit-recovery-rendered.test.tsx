import { describe, expect, it } from "vitest"
import {
  isCacheableExecutiveSnapshot,
  isExecutiveSnapshot,
} from "@/lib/executive-snapshot"

const partial = {
  schema_version: 1,
  source: "neo4j",
  computed_at: "2026-08-03T00:00:00Z",
  serve_state: "PARTIAL",
  analysis_complete: false,
  counts_are_partial: true,
  narrative: { tone: "action_required", title: "Action required", body: "Measured." },
  material_risk: { attack_paths: 170, crown_jewels: 18 },
  remediation: {},
  evidence: {},
  outcomes: {},
}

describe("executive snapshot cache authority", () => {
  it("accepts a measured partial as last-known-good", () => {
    expect(isExecutiveSnapshot(partial)).toBe(true)
    expect(isCacheableExecutiveSnapshot(partial)).toBe(true)
  })

  it("rejects a semantic partial with no measured material-risk counts", () => {
    expect(isCacheableExecutiveSnapshot({
      ...partial,
      material_risk: { attack_paths: null, crown_jewels: null },
    })).toBe(false)
  })

  it("rejects malformed and NOT_READY envelopes", () => {
    expect(isCacheableExecutiveSnapshot(null)).toBe(false)
    expect(isCacheableExecutiveSnapshot({ ...partial, serve_state: "NOT_READY" })).toBe(false)
  })
})
