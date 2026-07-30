/**
 * Per-path verdict chip — literal passthrough, never derived.
 *
 * Why it exists: the composite verdict strip only renders for a SINGLE drawn
 * path. Once the missing EC2 paths returned (generation 8), the fan-in draws
 * four, so the default view showed no verdict at all. A verdict per row is the
 * honest shape — each path has its own, and none is a claim about the others.
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

describe("the chip renders SERVE's verdict or nothing", () => {
  it("is gated on path_state being present", () => {
    // Absent verdict must render NO chip — not "UNKNOWN", not a placeholder.
    // Inventing a state here would re-create the local authority #480 deleted.
    const src = readCode(ROW)
    expect(src).toMatch(/\{row\.path_state \? \(/)
    expect(src).toMatch(/\) : null\}/)
  })

  it("surfaces both axes to the DOM so a wrong state is debuggable", () => {
    const src = readCode(ROW)
    expect(src).toContain("data-path-state-chip={row.path_state}")
    expect(src).toContain("data-activity-state-chip=")
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
