/**
 * Route-picker verdict boundary — security meaning stays in the investigation.
 *
 * The path compiler still carries SERVE's literal verdict for consumers that
 * need it, but the route picker intentionally answers only FROM → TO. Verdict,
 * damage and evidence belong to the selected-path investigation beside the
 * Attack Map, not in a pre-selection badge wall.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const readCode = (p: string) =>
  readFileSync(join(ROOT, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

const ROW = "components/attack-paths-v2/path-list-grouped.tsx"
const BUILDER = "components/attack-paths-v2/compile-path-list-row.ts"

describe("the route picker stays a clean FROM → TO selector", () => {
  it("renders endpoint labels and canonical service tiles", () => {
    const src = readCode(ROW)
    expect(src).toContain('side="from"')
    expect(src).toContain('side="to"')
    expect(src).toContain("ServiceTypeBadge")
  })

  it("does not reintroduce verdict or activity badges before selection", () => {
    const src = readCode(ROW)
    expect(src).not.toContain("data-path-state-chip")
    expect(src).not.toContain("data-activity-state-chip")
    expect(src).not.toContain("row.path_state")
    expect(src).not.toContain("row.activity_state")
  })

  it("never derives path_state from activity or anything else", () => {
    const src = readCode(ROW)
    // The chip may STYLE on path_state, but must not compute it.
    expect(src).not.toMatch(/path_state\s*=\s*[^=]/)
    expect(src).not.toContain("composePathVerdict")
  })
})

describe("the builder is passthrough only", () => {
  it("copies the server fields without transformation", () => {
    const src = readCode(BUILDER)
    expect(src).toContain("path.feasibility?.path_state")
    expect(src).toContain("path.feasibility?.activity_state")
  })

  it("falls back to null, never to a synthesised state", () => {
    // My first version of this guard only matched `?? "..."` while the code
    // uses a ternary, so a `: "UNKNOWN"` fallback slipped straight past it —
    // the same syntax-specific blind spot that has bitten repeatedly. Assert
    // the SHAPE of both feasibility assignments instead of one spelling.
    const src = readCode(BUILDER)
    const assigns = [...src.matchAll(
      /(path_state|activity_state):\s*([\s\S]{0,220}?),\n/g,
    )].filter((m) => m[2].includes("path.feasibility"))
    expect(assigns.length).toBe(2)
    for (const m of assigns) {
      // Whatever the syntax, the non-present branch must be null and there
      // must be no string literal standing in for a server verdict.
      expect(m[2]).toContain("null")
      expect(m[2]).not.toMatch(/:\s*"[A-Z_]+"/)
      expect(m[2]).not.toMatch(/\?\?\s*"[A-Z_]+"/)
    }
  })
})
