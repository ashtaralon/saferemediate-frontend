import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const tab = readFileSync(join(ROOT, "components", "LeastPrivilegeTab.tsx"), "utf8")
const sg = readFileSync(join(ROOT, "components", "sg-remediation-modal.tsx"), "utf8")
const s3 = readFileSync(join(ROOT, "components", "s3-remediation-modal.tsx"), "utf8")

describe("supported least-privilege review workflows", () => {
  it("passes the Neptune authority hold to IAM, SG, and data access", () => {
    expect(tab.match(/authorityHoldReason=/g)?.length).toBeGreaterThanOrEqual(3)
    expect(sg).toContain('data-testid="sg-authority-hold"')
    expect(s3).toContain('data-testid="s3-authority-hold"')
  })

  it("keeps SG and S3 mutation fail-closed", () => {
    expect(tab).toMatch(/<S3PolicyAnalysisModal[\s\S]*?applyDisabled=\{LP_MUTATION_APPLY_DISABLED\}/)
    expect(tab).toMatch(/<SGLeastPrivilegeModal[\s\S]*?applyDisabled=\{LP_MUTATION_APPLY_DISABLED\}/)
  })
})
