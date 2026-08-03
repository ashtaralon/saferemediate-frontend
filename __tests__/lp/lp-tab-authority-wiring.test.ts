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

  it("Fully Remediated is receipt-only — no allowedCount === 0 inference", () => {
    const src = read(TAB)
    expect(src).toContain("return !!resource.remediatedAt")
    expect(src).not.toMatch(/allowedCount === 0/)
  })

  it("Apply is disabled on IAM/SG/S3 mutation surfaces via applyDisabled", () => {
    const src = read(TAB)
    expect(src).toContain("LP_MUTATION_APPLY_DISABLED")
    expect(src).toMatch(/applyDisabled=\{LP_MUTATION_APPLY_DISABLED\}/)
    // Must appear on all three modal call sites
    const matches = src.match(/applyDisabled=\{LP_MUTATION_APPLY_DISABLED\}/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(3)
    expect(src).not.toMatch(/remediatedBy:\s*'user@cyntro\.io'/)
    expect(src).not.toMatch(/remediatedAt\s*=\s*new Date\(\)/)
  })

  it("fetchGaps returns a typed result so verify_failed can activate", () => {
    const src = read(TAB)
    expect(src).toContain("FetchGapsResult")
    expect(src).toContain("return { status: 'ok' }")
    expect(src).toContain("return { status: 'error', message }")
    expect(src).toContain("result.status === 'error'")
    expect(src).toContain("verify_failed")
  })

  it("does not blame a missing blast-radius score on deployment state", () => {
    const src = read(TAB)
    expect(src).toContain("No blast-radius score was returned for this finding.")
    expect(src).not.toContain("backend needs redeploy")
  })
})
