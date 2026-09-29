/// <reference types="vitest/globals" />
/**
 * The permission boundary enforcement surface is removed from the frontend.
 *
 * Its panel component was never imported by any page, so the six proxies under
 * the permission boundary proxy directory, and the three drift-detector proxies
 * (status, sync, and the remediate mutation) it alone called, had no rendered
 * caller. Three of the permission boundary proxies forwarded IAM writes
 * (enforce, rollback, configure) with no route-level authority, and candidates, preview and health are becoming operator-only on
 * the backend (endpoint-protection contract rev 2.1, section C3). An operator
 * route has no customer proxy: the frontend never holds or forwards an ops
 * token.
 *
 * This fails if a route file reappears under either directory, the panel comes
 * back, or any source file builds one of the removed backend or proxy paths.
 * The needles are assembled at runtime so this file does not match itself.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = process.cwd()
const SELF = relative(ROOT, fileURLToPath(import.meta.url))

const SEGMENT = ["permission", "boundary"].join("-")
const DRIFT_SEGMENT = ["boundary", "drift"].join("-")
const PROXY_DIRS = [SEGMENT, DRIFT_SEGMENT].map((s) => join(ROOT, "app", "api", "proxy", s))
const NEEDLES = [
  `/api/proxy/${SEGMENT}`,
  `/api/${SEGMENT}`,
  `/api/proxy/${DRIFT_SEGMENT}`,
  `/api/${DRIFT_SEGMENT}`,
  ["Permission", "Boundary", "Panel"].join(""),
]

const SOURCE_DIRS = ["app", "components", "lib", "hooks", "services", "types", "scripts", "__tests__", "tests"]
const SOURCE_FILES = ["middleware.ts", "instrumentation.ts", "next.config.js", "vercel.json"]
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === ".next") return []
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function sourceFiles(): string[] {
  const fromDirs = SOURCE_DIRS.flatMap((d) => walk(join(ROOT, d))).filter((p) => SOURCE_EXT.test(p))
  const fromRoot = SOURCE_FILES.map((f) => join(ROOT, f)).filter((p) => existsSync(p))
  return [...fromDirs, ...fromRoot].map((p) => relative(ROOT, p)).filter((p) => p !== SELF)
}

describe("permission boundary frontend surface is removed", () => {
  it("has no route file under the removed proxy directories", () => {
    const routes = PROXY_DIRS.flatMap(walk).map((p) => relative(ROOT, p))
    expect(routes).toEqual([])
  })

  it("has no permission boundary panel component", () => {
    expect(existsSync(join(ROOT, "components", `${NEEDLES[4]}.tsx`))).toBe(false)
  })

  it("has no source that references the removed paths or component", () => {
    const files = sourceFiles()
    // Denominator and positive control: the scan must read real proxy sources,
    // or an empty scan would pass vacuously.
    expect(files.length).toBeGreaterThan(500)
    const proxyReaders = files.filter((f) => readFileSync(join(ROOT, f), "utf8").includes("/api/proxy/"))
    expect(proxyReaders.length).toBeGreaterThan(0)

    const hits = files.flatMap((f) => {
      const text = readFileSync(join(ROOT, f), "utf8")
      return NEEDLES.filter((n) => text.includes(n)).map((n) => `${f}: ${n}`)
    })
    expect(hits).toEqual([])
  })
})
