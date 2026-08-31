import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(__dirname, "..", "..", "components", "iam-permission-analysis-modal.tsx"),
  "utf8",
)

describe("IAM authority hold", () => {
  it("shows a high-contrast hold with a controlled override action", () => {
    expect(source).toContain('data-testid="iam-authority-hold"')
    expect(source).toContain("bg-orange-950")
    expect(source).toContain("Remediate anyway")
    expect(source).toContain("handlePrepareBreakGlass")
  })

  it("keeps normal approval gated but permits a signed break-glass submission", () => {
    expect(source).toMatch(/handleIAMLpRequestApproval[\s\S]*?if \(authorityHoldReason\)/)
    expect(source).toMatch(/handleIAMLpApproveRequest[\s\S]*?if \(authorityHoldReason\)/)
    expect(source).toMatch(/handleIAMLpExecuteApprovedRequest[\s\S]*?if \(applyDisabled \|\| authorityHoldReason\)/)
    expect(source).toMatch(/applyDisabled && !isBreakGlassSubmission/)
  })
})
