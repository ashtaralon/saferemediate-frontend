/**
 * Structural guards on the per-surface refresh contract.
 *
 * These read the SOURCE of every component, because the defect they prevent
 * is architectural rather than behavioural: a screen that calls bare
 * `startSync()` runs the backend's default lane — `vulnerability_findings` —
 * whatever evidence it displays, and then reports success as if its own data
 * had been collected. No amount of rendering proves the absence of that call;
 * only reading every caller does.
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx?|ts)$/.test(name)) out.push(full)
  }
  return out
}


/** Source with comments removed.
 *
 * A line-prefix heuristic is not enough: the comments that describe this very
 * defect contain the phrases being searched for, so a naive scan reports the
 * warning ABOUT the bug as the bug. Strips `/* *\/` blocks (including the
 * `{/* *\/}` JSX form) and `//` line comments, leaving string literals intact.
 */
function withoutComments(src: string): string {
  let out = ""
  let i = 0
  let inBlock = false
  let inLine = false
  let quote: string | null = null
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (inLine) {
      if (c === "\n") { inLine = false; out += c }
      i += 1
      continue
    }
    if (inBlock) {
      if (c === "*" && next === "/") { inBlock = false; i += 2; continue }
      if (c === "\n") out += c
      i += 1
      continue
    }
    if (quote) {
      out += c
      if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue }
      if (c === quote) quote = null
      i += 1
      continue
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i += 1; continue }
    if (c === "/" && next === "*") { inBlock = true; i += 2; continue }
    if (c === "/" && next === "/") { inLine = true; i += 2; continue }
    out += c
    i += 1
  }
  return out
}

const COMPONENTS = walk("components")
const read = (f: string) => readFileSync(f, "utf8")
const code = (f: string) => withoutComments(read(f))

/** The only component allowed to call the hook directly, besides the shared
 *  per-surface button: the CVE control, which runs the lane it names. */
const HOOK_ALLOWED = new Set([
  "components/RefreshEvidenceButton.tsx",
  "components/SyncFromAWSButton.tsx",
])

describe("no screen may run a lane it does not name", () => {
  it("only the surface-bound controls call useSyncFromAWS", () => {
    const callers = COMPONENTS.filter((f) => /useSyncFromAWS\s*\(/.test(code(f)))
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => !HOOK_ALLOWED.has(f))

    expect(callers).toEqual([])
  })

  it("no component calls startSync without sources", () => {
    // `startSync()` with no argument is the bare call: the backend then
    // defaults to vulnerability_findings.
    const offenders: string[] = []
    for (const f of COMPONENTS) {
      const src = code(f)
      if (/\bstartSync\(\s*\)/.test(src) && !f.endsWith("RefreshEvidenceButton.tsx")) {
        offenders.push(f)
      }
    }
    expect(offenders).toEqual([])
  })

  it("every surface-bound control passes its own requiredLanes", () => {
    const src = read("components/SyncFromAWSButton.tsx")
    expect(src).toMatch(/startSync\(\s*\{\s*sources:\s*contract\.requiredLanes/)
    expect(src).toContain("SYNC_SURFACES.cve")
  })

  it("the shared button fails closed on anything but CONNECTED", () => {
    const src = read("components/RefreshEvidenceButton.tsx")
    expect(src).toContain('capability !== "CONNECTED"')
    const cve = read("components/SyncFromAWSButton.tsx")
    expect(cve).toContain('capability !== "CONNECTED"')
  })
})

describe("no estate-wide wording survives on a reachable action", () => {
  it("renders no 'Sync from AWS' outside comments", () => {
    const offenders: Array<string> = []
    for (const f of [...COMPONENTS, ...walk("lib"), ...walk("app")]) {
      code(f)
        .split("\n")
        .forEach((line, i) => {
          if (line.includes("Sync from AWS")) {
            offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`)
          }
        })
    }
    expect(offenders).toEqual([])
  })
})

describe("the reingest alias cannot bypass the contract", () => {
  const route = read("app/api/proxy/admin/reingest/route.ts")

  it("no longer forwards to the start endpoint", () => {
    const routeCode = withoutComments(route)
    expect(routeCode).not.toContain("v2/sync/start")
    expect(routeCode).not.toContain("getBackendBaseUrl")
    expect(routeCode).not.toContain("fetch(")
  })

  it("fails closed with a named refusal", () => {
    expect(route).toContain("410")
    expect(route).toContain("reingest_alias_retired")
  })

  it("has no remaining caller", () => {
    const callers = [...COMPONENTS, ...walk("lib"), ...walk("hooks")].filter((f) =>
      /fetch\(\s*["'`]\/api\/proxy\/admin\/reingest/.test(code(f)),
    )
    expect(callers).toEqual([])
  })
})
