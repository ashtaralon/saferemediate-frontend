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
    // REMOVED, deliberately: two expectations asserted the tab still renders
    // "permissions in active use" and "still need review". That copy presented
    // the graph's evidence-window counts as the role's CURRENT state, and it was
    // removed on purpose -- the numbers predate the change that removed five
    // actions. Asserting its presence pins the defect in place.
    //
    // It must NOT be re-pointed at components/lp/remediated-permission-counts.tsx
    // either: those phrases survive there only inside the docblock that records
    // the historical bug, so a source-string test would pass against a COMMENT
    // and hide the very thing that component exists to prevent.
    //
    // The real facts -- five recorded removals, seven derived/hash-verified
    // configured Allow actions, and the separately qualified four historical
    // observed-use actions -- are asserted on the RENDERED receipt in
    // __tests__/lp/remediated-receipt-composition.test.tsx.
    expect(source).not.toContain("<span>{metrics.unusedCount} removed</span>")
  })
})
