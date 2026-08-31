import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("home data fan-out boundary", () => {
  const source = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8")

  it("does not run legacy Home requests behind the V2/V3 dashboards", () => {
    expect(source).toContain(
      "const LEGACY_HOME_DATA_ENABLED = !DASHBOARD_V2_ENABLED && !DASHBOARD_V3_ENABLED",
    )
    expect(source).toMatch(
      /useEffect\(\(\) => \{\s+if \(!LEGACY_HOME_DATA_ENABLED\) \{\s+setLoading\(false\)/,
    )
    expect(source).toContain("if (!LEGACY_HOME_DATA_ENABLED || !autoRefresh) return")
  })
})
