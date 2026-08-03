import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const cockpit = readFileSync(join(ROOT, "components/dashboard/v3/executive-cockpit.tsx"), "utf8")
const proxy = readFileSync(join(ROOT, "app/api/proxy/dashboard/executive-snapshot/route.ts"), "utf8")

describe("executive cockpit authority", () => {
  it("uses one governed endpoint rather than five independently-timed feeds", () => {
    expect(cockpit).toContain("/api/proxy/dashboard/executive-snapshot")
    expect(cockpit).not.toContain("/api/proxy/systems/with-families")
    expect(cockpit).not.toContain("/api/proxy/identity-attack-paths/all")
    expect(cockpit).not.toContain("/api/proxy/remediation-candidates")
  })

  it("never caches an unmeasured semantic failure", () => {
    expect(proxy).toContain("isCacheableExecutiveSnapshot(data)")
    expect(proxy).not.toMatch(/setCached\([^)]*error/)
  })

  it("renders lower-bound notation instead of suppressing partial facts", () => {
    expect(cockpit).toContain('return `${lower ? "≥" : ""}')
    expect(cockpit).toContain("counts_are_lower_bounds")
  })

  it("keeps remediation as a presentation, not a mutation surface", () => {
    expect(cockpit).not.toMatch(/fetch\([^)]*(POST|DELETE|PATCH)/)
    expect(cockpit).not.toMatch(/Apply now|Execute change/i)
  })
})
