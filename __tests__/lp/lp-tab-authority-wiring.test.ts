/**
 * Wiring guard — LeastPrivilegeTab uses honest normalize + verifying post-state.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const TAB = "components/LeastPrivilegeTab.tsx"

const read = (p: string) =>
  readFileSync(join(ROOT, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

describe("LeastPrivilegeTab authority wiring", () => {
  it("normalizes via normalizeLPResponse and preserves integrity through merge", () => {
    const src = read(TAB)
    expect(src).toContain("normalizeLPResponse")
    expect(src).toContain("mergeLpResourcesAfterFetch")
    expect(src).toContain("markResourceVerifying")
    expect(src).toContain("deriveLPIntegrity")
    expect(src).not.toContain("['Identity Graph']")
    expect(src).not.toContain("['us-east-1']")
    expect(src).not.toContain("|| ['Identity Graph']")
    expect(src).not.toContain("lpScore: 100")
    expect(src).not.toContain("gapPercent: 0")
    expect(src).not.toMatch(/severity:\s*'low'/)
  })

  it("shows APPLIED · VERIFYING and does not invent high-risk unused", () => {
    const src = read(TAB)
    expect(src).toContain("APPLIED · VERIFYING")
    expect(src).toContain("applied_verifying")
    expect(src).not.toMatch(
      /highRiskUnused:\s*\(r\.unusedList \|\| \[\]\)\.slice/,
    )
    expect(src).not.toMatch(/confidence:\s*rule\.status === 'USED' \? 95/)
  })

  it("integrity vetoes modal Apply path; never invents mutations_allowed", () => {
    const src = read(TAB)
    expect(src).toContain("mutationBlocked")
    expect(src).not.toContain("mutations_allowed")
    expect(src).toMatch(/if \(integrity\.mutationBlocked\)/)
    expect(src).toContain("lp-apply-disabled")
  })
})
