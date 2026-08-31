import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { safeBackendErrorDetail } from "@/lib/server/safe-backend-detail"

const root = process.cwd()

describe("Estate inspector backend routing", () => {
  it.each([
    "app/api/proxy/inspector/[resourceId]/route.ts",
    "app/api/proxy/decision-coverage/resource/[neo4jLabel]/[resourceId]/route.ts",
  ])("uses the canonical environment-aware backend resolver in %s", (file) => {
    const source = readFileSync(join(root, file), "utf8")

    expect(source).toContain("getBackendBaseUrl()")
    expect(source).not.toContain('const BACKEND_URL =')
    expect(source).not.toContain('"https://saferemediate-backend-f.onrender.com"')
    expect(source).toContain("resilientBackendJsonRead")
  })

  it("provides a secretless transport diagnostic for Vercel-to-backend failures", () => {
    const source = readFileSync(
      join(root, "app/api/proxy/transport-diagnostics/route.ts"),
      "utf8",
    )

    expect(source).toContain("/healthz")
    expect(source).toContain("lookup(hostname")
    expect(source).toContain("socketProbe")
    expect(source).toContain('request.cookies.get("cyntro_auth")')
    expect(source).not.toContain("record.address")
    expect(source).not.toContain("CYNTRO_SERVICE_TOKEN")
  })

  it("does not fall back to the suspended legacy backend", () => {
    const source = readFileSync(join(root, "lib/server/backend-url.ts"), "utf8")

    expect(source).toContain('const RENDER_PROD = "https://cyntro-c1.onrender.com"')
    expect(source).not.toContain(
      'const RENDER_PROD = "https://saferemediate-backend-f.onrender.com"',
    )
  })

  it.each([
    "app/api/proxy/collectors/run/[collector]/route.ts",
    "app/api/proxy/collectors/cloudtrail/ingest/route.ts",
    "app/api/proxy/collectors/sync-all/route.ts",
    "app/api/proxy/collectors/sync-all/start/route.ts",
    "app/api/proxy/collectors/sync-all/status/[jobId]/route.ts",
  ])("routes collector operations to the canonical backend in %s", (file) => {
    const source = readFileSync(join(root, file), "utf8")

    expect(source).toContain("getBackendBaseUrl()")
    expect(source).not.toContain("saferemediate-backend-f.onrender.com")
  })

  it("does not expose an upstream HTML outage page", () => {
    expect(safeBackendErrorDetail("<!DOCTYPE html><html>Service Suspended</html>", 503)).toBe(
      "Backend service unavailable (HTTP 503). Retry after service recovery.",
    )
  })
})
