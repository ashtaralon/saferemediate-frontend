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
  })
})
