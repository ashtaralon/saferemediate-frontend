import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const PUBLIC_HEALTH_CONSUMERS = [
  "services/api.ts",
  "app/api/proxy/test/route.ts",
  "app/api/proxy/health/route.ts",
  "app/api/proxy/resource-view/[resourceId]/connections/route.ts",
  "app/api/proxy/system-resources/[systemName]/route.ts",
]

describe("public backend-health boundary", () => {
  it.each(PUBLIC_HEALTH_CONSUMERS)("%s uses liveness, not operator diagnostics", (path) => {
    const source = readFileSync(join(ROOT, path), "utf8")

    expect(source).toContain("/healthz")
    expect(source).not.toMatch(/[`'"}]\/health(?:[?`'"}]|$)/)
  })

  it("does not forward an operator token through the public health proxy", () => {
    const source = readFileSync(join(ROOT, "app/api/proxy/health/route.ts"), "utf8")

    expect(source).not.toContain("CYNTRO_OPS_TOKEN")
    expect(source).not.toContain("X-Cyntro-Ops-Token")
  })
})
