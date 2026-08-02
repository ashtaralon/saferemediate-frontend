/**
 * Consumer half of the IAP provenance contract.
 *
 * Backend PR: an uncomputed estate must not report as a completed scan.
 * These tests pin the FE side: nothing may render "none found" without an
 * explicit READY + analysis_complete, and a non-READY payload must never
 * reach localStorage.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { derivePathsIntegrity, isCacheablePaths } from "@/lib/paths-integrity"

const ROOT = join(__dirname, "..")

/** Strip comments before grepping — the prose explaining a forbidden pattern
 *  contains that pattern, and an accurate comment must not fail the guard. */
function code(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const READY = {
  serve_state: "READY",
  analysis_complete: true,
  crown_jewels: [],
  crown_jewels_partial: false,
  systems_discovered: 8,
  systems_scanned: 8,
  systems_uncomputed: 0,
  uncomputed: [],
  errors: [],
  total_jewels: 0,
}

describe("derivePathsIntegrity", () => {
  it("READY + analysis_complete is the only all-clear", () => {
    const i = derivePathsIntegrity(READY)
    expect(i.state).toBe("READY")
    expect(i.canRenderNoneFound).toBe(true)
    expect(i.listIsPartial).toBe(false)
  })

  it("REGRESSION: the live shape that lied is not an all-clear", () => {
    // Exactly what production returned on 2 of 3 calls: eight `computing`
    // envelopes counted as eight scans, zero errors, zero jewels.
    const i = derivePathsIntegrity({
      serve_state: "NOT_READY",
      analysis_complete: false,
      systems_discovered: 8,
      systems_scanned: 0,
      systems_uncomputed: 8,
      uncomputed: Array.from({ length: 8 }, (_, n) => `sys-${n}: computing`),
      errors: [],
      total_jewels: null,
      crown_jewels: [],
    })
    expect(i.state).toBe("NOT_READY")
    expect(i.canRenderNoneFound).toBe(false)
    expect(i.systemsScanned).toBe(0)
    expect(i.systemsUncomputed).toBe(8)
    expect(i.uncomputed).toHaveLength(8)
  })

  it("PARTIAL is not an all-clear even with jewels present", () => {
    const i = derivePathsIntegrity({
      serve_state: "PARTIAL",
      analysis_complete: false,
      crown_jewels_partial: true,
      systems_discovered: 8,
      systems_scanned: 3,
      systems_uncomputed: 5,
      uncomputed: ["sys-4: computing"],
      errors: [],
    })
    expect(i.state).toBe("PARTIAL")
    expect(i.canRenderNoneFound).toBe(false)
    expect(i.listIsPartial).toBe(true)
  })

  it("READY with errors is still not an all-clear", () => {
    const i = derivePathsIntegrity({ ...READY, errors: ["sys-a: Neo4j flap"] })
    expect(i.canRenderNoneFound).toBe(false)
  })

  it("READY without analysis_complete fails closed", () => {
    // Either field alone has been wrong before. Both are required.
    const i = derivePathsIntegrity({ ...READY, analysis_complete: false })
    expect(i.state).toBe("NOT_READY")
    expect(i.canRenderNoneFound).toBe(false)
  })

  it("a payload with no provenance fields fails closed", () => {
    // An old deploy, a proxy stub, or a cache entry written before this
    // contract existed. Silence is not health.
    for (const raw of [
      null,
      undefined,
      {},
      { crown_jewels: [], total_jewels: 0, systems_scanned: 8, errors: [] },
    ]) {
      const i = derivePathsIntegrity(raw)
      expect(i.state).toBe("NOT_READY")
      expect(i.canRenderNoneFound).toBe(false)
    }
  })

  it("non-finite counts surface as null, never 0", () => {
    const i = derivePathsIntegrity({
      ...READY,
      systems_scanned: null,
      systems_discovered: "8",
      systems_uncomputed: NaN,
    })
    expect(i.systemsScanned).toBeNull()
    expect(i.systemsDiscovered).toBeNull()
    expect(i.systemsUncomputed).toBeNull()
  })
})

describe("isCacheablePaths", () => {
  it("caches only a READY payload", () => {
    expect(isCacheablePaths(READY)).toBe(true)
  })

  it("refuses every non-READY shape", () => {
    for (const raw of [
      null,
      undefined,
      "not an object",
      {},
      { serve_state: "PARTIAL", analysis_complete: false },
      { serve_state: "NOT_READY", analysis_complete: false },
      { serve_state: "READY", analysis_complete: false },
      { crown_jewels: [], total_jewels: 0 },
    ]) {
      expect(isCacheablePaths(raw)).toBe(false)
    }
  })
})

describe("consumers wire the contract", () => {
  const CARD = code(
    readFileSync(join(ROOT, "components/dashboard/v3/attack-paths-card.tsx"), "utf8"),
  )
  const BRIEF = code(
    readFileSync(join(ROOT, "components/dashboard/v3/executive-cockpit.tsx"), "utf8"),
  )

  it("both /all consumers gate the cache", () => {
    expect(CARD).toContain("isCacheable: isCacheablePaths")
    expect(BRIEF).toContain("isCacheable: isCacheablePaths")
  })

  it("the card's empty state branches on integrity, not on errors alone", () => {
    // The defect: the old branch had only "errors" vs "clean", so an estate
    // that was never scanned rendered "8 systems scanned. None surfaced
    // reachable jewels."
    expect(CARD).toContain("integrity.canRenderNoneFound")
    expect(CARD).not.toMatch(/\{scanned\} systems scanned\. None surfaced/)
  })

  it("the cockpit will not count systems from a partial sweep", () => {
    expect(BRIEF).toContain('pathsIntegrity.state === "READY"')
    expect(BRIEF).toContain('pathsIntegrity.state !== "READY"')
  })
})
