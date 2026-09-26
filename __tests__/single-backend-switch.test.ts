/**
 * One switch for the Cyntro serving backend.
 *
 * Blue/green cutover and switch-back move the UI between two backends by changing ONE Vercel variable,
 * `BACKEND_URL_OVERRIDE`, resolved in exactly one place: `getBackendBaseUrl()` (lib/server/backend-url.ts).
 * Before this guard, 12 files read other names (`BACKEND_URL`, `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_API_URL`) and
 * 3 hard-coded a host. Posture-visibility read `BACKEND_URL || resolver`, so with `BACKEND_URL` set a cutover would
 * have left those routes on the old backend: a split brain that a switch-back cannot fully undo.
 *
 * Allowed, each deliberately separate and named here:
 * - lib/server/backend-url.ts: the resolver itself.
 * - lib/server/customer-backend-auth.ts: CHECKS that a customer-resident UI states the override; it routes nothing.
 * - lib/server/neptune-refresh-backend-url.ts: `CYNTRO_SYNC_BACKEND_URL`, the collection/refresh lane. Its own
 *   docstring keeps it apart from the serving override on purpose (never steer collection to a serving tier).
 * - app/api/proxy/safe-remediate/execute/route.ts: `SAFE_REMEDIATE_API_BASE`, a legacy non-Cyntro service.
 */
import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(__dirname, "..")
const SCANNED = ["app", "lib", "hooks", "components"]
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/
const SKIP = /(__tests__|\.test\.|\.spec\.|\.bak$|\.backup$)/

const BACKEND_ENV = /process\.env\.((?:NEXT_PUBLIC_)?(?:[A-Z_]*BACKEND[A-Z_]*|API_URL|API_BASE_URL|API_BASE))\b/g
const HOST_LITERAL = /https?:\/\/[a-z0-9.-]*onrender\.com/g

const ALLOWED_ENV: Record<string, string[]> = {
  "lib/server/backend-url.ts": ["BACKEND_URL_OVERRIDE"],
  "lib/server/customer-backend-auth.ts": ["BACKEND_URL_OVERRIDE"],
  "lib/server/neptune-refresh-backend-url.ts": ["CYNTRO_SYNC_BACKEND_URL"],
  "app/api/proxy/safe-remediate/execute/route.ts": ["SAFE_REMEDIATE_API_BASE"],
}
const ALLOWED_HOSTS: Record<string, string[]> = {
  "lib/server/backend-url.ts": ["https://cyntro-c1.onrender.com"],
  "lib/server/neptune-refresh-backend-url.ts": ["https://saferemediate-backend-f.onrender.com"],
}

function sources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(full)
      } else if (SOURCE.test(entry.name) && !SKIP.test(full)) {
        out.push(path.relative(ROOT, full).split(path.sep).join("/"))
      }
    }
  }
  for (const dir of SCANNED) if (fs.existsSync(path.join(ROOT, dir))) walk(path.join(ROOT, dir))
  return out.sort()
}

const FILES = sources()

describe("single serving-backend switch", () => {
  it("scans the real source tree (denominator, not a vacuous pass)", () => {
    expect(FILES.length).toBeGreaterThan(300)
    expect(FILES).toContain("lib/server/backend-url.ts")
  })

  it("no file outside the named exceptions reads a backend URL from the environment", () => {
    const offenders: string[] = []
    for (const file of FILES) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8")
      for (const match of text.matchAll(BACKEND_ENV)) {
        if (!(ALLOWED_ENV[file] ?? []).includes(match[1])) offenders.push(`${file}: process.env.${match[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("no file outside the resolvers hard-codes a backend host", () => {
    const offenders: string[] = []
    for (const file of FILES) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8")
      for (const match of text.matchAll(HOST_LITERAL)) {
        if (!(ALLOWED_HOSTS[file] ?? []).includes(match[0])) offenders.push(`${file}: ${match[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("the guard catches the pattern it exists for (positive control)", () => {
    const planted = 'const B = process.env.BACKEND_URL || getBackendBaseUrl()\nfetch("https://x.onrender.com/api")'
    expect([...planted.matchAll(BACKEND_ENV)].map((m) => m[1])).toEqual(["BACKEND_URL"])
    expect([...planted.matchAll(HOST_LITERAL)].map((m) => m[0])).toEqual(["https://x.onrender.com"])
  })

  it("the override is resolved first, so it alone moves every serving call", async () => {
    const prior = process.env.BACKEND_URL_OVERRIDE
    process.env.BACKEND_URL_OVERRIDE = "https://green.example.test"
    try {
      const { getBackendBaseUrl } = await import("@/lib/server/backend-url")
      expect(getBackendBaseUrl()).toBe("https://green.example.test")
    } finally {
      if (prior === undefined) delete process.env.BACKEND_URL_OVERRIDE
      else process.env.BACKEND_URL_OVERRIDE = prior
    }
  })
})
