/**
 * SERVE is the only authority for path feasibility.
 *
 * These guards were INVERTED, not deleted. They used to assert the frontend
 * composer was wired; #642 moved the composed verdict to the backend, so they
 * now assert the opposite — that no local composition exists.
 *
 * Deleting them alongside the composer would have removed the only thing
 * stopping it coming back. A fallback that composes judgment locally looks like
 * resilience, but it means two authorities can disagree with no way for an
 * operator to tell which one they are reading.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
const readCode = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

const PANEL = "components/attack-paths-v2/zoom0-fan-in-panel.tsx"
const READER = "lib/attack-paths/server-path-verdict.ts"

describe("no local composition survives anywhere in the frontend", () => {
  it("the deleted composer is not resurrected", () => {
    let present = true
    try {
      readFileSync(join(ROOT, "lib/attack-paths/path-feasibility-verdict.ts"))
    } catch {
      present = false
    }
    expect(present).toBe(false)
  })

  it("no component imports or calls a local composer", () => {
    const src = readCode(PANEL)
    expect(src).not.toContain("composePathVerdict")
    expect(src).not.toContain("path-feasibility-verdict")
  })

  it("the panel reads SERVE feasibility and nothing else", () => {
    const src = readCode(PANEL)
    expect(src).toContain("pathVerdictFromServerFeasibility")
    expect(src).toMatch(/verdictPath\.feasibility/)
  })

  it("no raw gate is fed into a verdict at the call site", () => {
    // The composer's inputs. Their presence would mean the panel is
    // reassembling a verdict out of raw graph fields again.
    const src = readCode(PANEL)
    for (const smell of [
      "routeGate:",
      "routeVerdict:",
      "authorizationComposed:",
      "dataAccessComposed:",
      "observedTrafficBound:",
      "estateIdentityObserved:",
    ]) {
      expect(src).not.toContain(smell)
    }
  })
})

describe("the reader parses, it does not judge", () => {
  it("rejects unrecognised vocabulary instead of defaulting", () => {
    const src = readCode(READER)
    expect(src).toContain("return null")
    expect(src).toMatch(/\["REACHABLE", "BLOCKED", "UNVERIFIED", "OUT_OF_SCOPE"\]/)
    expect(src).toMatch(/\["OBSERVED", "NOT_OBSERVED", "UNKNOWN"\]/)
  })

  it("derives no state of its own", () => {
    // No composition verbs. The reader maps fields; it must not decide any of
    // them from other fields.
    const src = readCode(READER)
    expect(src).not.toContain("compose")
    expect(src).not.toMatch(/pathState =\s*checkpoints/)
  })

  it("does not decide findings", () => {
    // is_finding is server-owned. The reader may pass it through; it must not
    // compute it from path_state.
    const src = readCode(READER)
    expect(src).not.toMatch(/is_?[Ff]inding\s*[:=]\s*.*pathState/)
  })
})
