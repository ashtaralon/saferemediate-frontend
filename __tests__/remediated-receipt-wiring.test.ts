import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "components/LeastPrivilegeTab.tsx"), "utf8")

describe("remediated receipt wiring", () => {
  it("opens the remediation receipt from Details instead of current-state analysis", () => {
    const remediatedRowStart = source.indexOf("/* ===== REMEDIATED ROW")
    const activeRowStart = source.indexOf("/* ===== ACTIVE ROW", remediatedRowStart)
    const row = source.slice(remediatedRowStart, activeRowStart)

    expect(row).toContain("setExpandedRow(isExpanded ? null")
    expect(row).not.toContain("handleResourceClick(resource)")
    expect(source).toContain("Remediation Receipt")
    expect(source).toContain("Not recorded — rollback unavailable")
    expect(source).toContain("<RemediationReceipt")
    expect(source).not.toContain("<span>{metrics.unusedCount} removed</span>")
    // These labels presented pre-change graph metrics as the role's current
    // state (Codex, 3431 QA). The mounted receipt controls prove what replaced them.
    expect(source).not.toContain("still need review")
    expect(source).not.toContain("active permissions")
    expect(source).not.toContain("{metrics.usedCount} active")
    expect(source).not.toContain("'Partially Fixed'")
    // The row's description line must not fall back to the backend's graph-count
    // description on the Remediated tab.
    const describe_ = source.slice(source.indexOf("const inventoryDescription"), source.indexOf("const isExpanded"))
    expect(describe_).toContain("activeTab === 'remediated'")
    expect(describe_.indexOf("activeTab === 'remediated'")).toBeLessThan(describe_.indexOf("resource.description"))
    // The receipt always says who made the change, from the recorded actor only.
    expect(source).toContain('data-testid="lp-remediated-by"')
    expect(source).toContain("{remediationActorText(resource)}")
    expect(source).not.toContain("{resource.remediatedBy}</span>")
  })
})
