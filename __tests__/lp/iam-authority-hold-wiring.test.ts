import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(__dirname, "..", "..", "components", "iam-permission-analysis-modal.tsx"),
  "utf8",
)

describe("IAM authority hold", () => {
  it("shows the hold in the canonical IAM workflow", () => {
    expect(source).toContain('data-testid="iam-authority-hold"')
    expect(source).toContain("authoritative Neptune generation is active")
  })

  it("blocks approval and execution while preserving evidence review", () => {
    expect(source).toMatch(/handleIAMLpRequestApproval[\s\S]*?if \(authorityHoldReason\)/)
    expect(source).toMatch(/handleIAMLpApproveRequest[\s\S]*?if \(authorityHoldReason\)/)
    expect(source).toMatch(/handleIAMLpExecuteApprovedRequest[\s\S]*?if \(applyDisabled \|\| authorityHoldReason\)/)
  })
})
