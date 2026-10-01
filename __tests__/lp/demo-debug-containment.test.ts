/**
 * P0 — demo/debug graph writers must not ship in production UI/proxy.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

describe("LP demo/debug containment", () => {
  it("hides Simulate Traffic unless NODE_ENV !== production", () => {
    const src = read("components/LeastPrivilegeTab.tsx")
    expect(src).toContain('process.env.NODE_ENV !== "production"')
    expect(src).toContain("demoDebugUiEnabled")
    expect(src).toMatch(/demoDebugUiEnabled\s*\?\s*\(/)
    expect(src).toContain("demoDebugUiEnabled && showTrafficSimulator")
  })

  it("production proxy returns 404 for debug POST/DELETE", () => {
    const src = read("app/api/proxy/debug/[...path]/route.ts")
    expect(src).toContain("isProductionDeploy")
    expect(src).toContain('VERCEL_ENV === "production"')
    expect(src).toMatch(/method !== "GET"/)
    expect(src).toContain("status: 404")
  })
})
