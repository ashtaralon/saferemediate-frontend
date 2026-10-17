// @vitest-environment node
/**
 * A customer-resident image reaches only its own account: the backend it proxies to is the one
 * the install named, never a hosted default, and the hosted addresses are not in the image.
 */
import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const ROOT = path.resolve(__dirname, "..")

afterEach(() => {
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  delete process.env.BACKEND_URL_OVERRIDE
  delete process.env.CYNTRO_SYNC_BACKEND_URL
  delete process.env.VERCEL_ENV
  vi.resetModules()
  vi.doUnmock("@/lib/server/hosted-defaults")
})

describe("getBackendBaseUrl in a customer-resident install", () => {
  it("is the override the install named", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.BACKEND_URL_OVERRIDE = "http://127.0.0.1:8000"
    const { getBackendBaseUrl } = await import("@/lib/server/backend-url")
    expect(getBackendBaseUrl()).toBe("http://127.0.0.1:8000")
  })

  it("refuses to resolve with no override: there is no hosted backend to fall back to", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const { getBackendBaseUrl } = await import("@/lib/server/backend-url")
    expect(() => getBackendBaseUrl()).toThrow(/CUSTOMER_RESIDENT and BACKEND_URL_OVERRIDE is unset/)
  })

  it.each([
    "https://cyntro-c1.onrender.com",
    "https://saferemediate-backend-f.onrender.com",
    "https://cyntro-c1.vercel.app",
    "https://app.cyntro.io",
  ])("refuses an override that names a host Cyntro operates: %s", async (hosted) => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.BACKEND_URL_OVERRIDE = hosted
    const { getBackendBaseUrl } = await import("@/lib/server/backend-url")
    expect(() => getBackendBaseUrl()).toThrow(/a host Cyntro operates/)
  })

  it("accepts the install's own internal names", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.BACKEND_URL_OVERRIDE = "http://cyntro-web.acme.internal:8000"
    const { getBackendBaseUrl } = await import("@/lib/server/backend-url")
    expect(getBackendBaseUrl()).toBe("http://cyntro-web.acme.internal:8000")
  })
})

describe("getBackendBaseUrl on the hosted path", () => {
  it("still resolves to the hosted default with no override (unchanged behaviour)", async () => {
    const { getBackendBaseUrl } = await import("@/lib/server/backend-url")
    expect(getBackendBaseUrl()).toBe("https://cyntro-c1.onrender.com")
  })

  it("refuses when the image carries no hosted default and nothing is configured", async () => {
    vi.doMock("@/lib/server/hosted-defaults", () => ({ HOSTED_DEFAULTS: null }))
    const { getBackendBaseUrl } = await import("@/lib/server/backend-url")
    expect(() => getBackendBaseUrl()).toThrow(/carries no hosted backend address/)
  })
})

describe("the Neptune refresh lane in a customer-resident install", () => {
  it("is unconfigured unless the install names it, and never the hosted address", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const mod = await import("@/lib/server/neptune-refresh-backend-url")
    expect(mod.isNeptuneRefreshBackendConfigured()).toBe(false)
    expect(() => mod.getNeptuneRefreshBackendBaseUrl()).toThrow(/no hosted refresh backend/)
    process.env.CYNTRO_SYNC_BACKEND_URL = "http://127.0.0.1:8000/"
    expect(mod.getNeptuneRefreshBackendBaseUrl()).toBe("http://127.0.0.1:8000")
  })

  it("keeps the hosted default on the hosted path", async () => {
    const mod = await import("@/lib/server/neptune-refresh-backend-url")
    expect(mod.getNeptuneRefreshBackendBaseUrl()).toBe("https://saferemediate-backend-f.onrender.com")
  })
})

describe("scripts/prepare-customer-image.mjs", () => {
  it("blanks the ONE module that holds the hosted addresses, and only that module", () => {
    const work = path.join(os.tmpdir(), `cyntro-fe-prepare-${process.pid}-${Date.now()}`)
    mkdirSync(work, { recursive: true })
    for (const relative of ["app/layout.tsx", "app/globals.css", "scripts/prepare-customer-image.mjs"]) {
      mkdirSync(path.dirname(path.join(work, relative)), { recursive: true })
      cpSync(path.join(ROOT, relative), path.join(work, relative))
    }
    cpSync(path.join(ROOT, "lib/server"), path.join(work, "lib/server"), { recursive: true })
    mkdirSync(path.join(work, "app/api"), { recursive: true })
    writeFileSync(path.join(work, "app/api/probe.ts"), 'export const x = "https://saferemediate-backend-f.onrender.com"\n')
    symlinkSync(path.join(ROOT, "node_modules"), path.join(work, "node_modules"))
    execFileSync("node", ["scripts/prepare-customer-image.mjs"], { cwd: work, stdio: "pipe" })
    const blanked = readFileSync(path.join(work, "lib/server/hosted-defaults.ts"), "utf8")
    expect(blanked).toContain("export const HOSTED_DEFAULTS: HostedDefaults | null = null")
    expect(blanked).not.toMatch(/onrender\.com|vercel\.app/)
    // the resolvers themselves are untouched: they read the module, they do not carry an address
    expect(readFileSync(path.join(work, "lib/server/backend-url.ts"), "utf8"))
      .toBe(readFileSync(path.join(ROOT, "lib/server/backend-url.ts"), "utf8"))
    expect(readFileSync(path.join(work, "app/api/probe.ts"), "utf8")).toContain("http://127.0.0.1:8000")
    expect(existsSync(path.join(work, "public/fonts/geist-latin.woff2"))).toBe(true)
  })

  it("the customer image build greps its whole output for hosted and third-party hosts, fail-closed", () => {
    const dockerfile = readFileSync(path.join(ROOT, "Dockerfile.customer-pilot"), "utf8")
    expect(dockerfile).toContain("test -d .next/server && test -d .next/static")
    const gate = dockerfile.split("\n").find((line) => line.includes("! grep -R -q -E"))
    expect(gate).toBeDefined()
    for (const host of ["onrender", "vercel", "cyntro", "thesvg", "fonts", "gstatic"]) expect(gate).toContain(host)
    expect(gate).toContain('"https?://') // a URL, which is what code dials; the refusal names bare hosts
    expect(gate).toContain(".next/server .next/static")
    expect(dockerfile).not.toContain('grep -R -q -F "saferemediate-backend-f.onrender.com" .next/server\n')
  })
})
