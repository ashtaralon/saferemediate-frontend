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
  "components/RefreshInspectorFindingsButton.tsx",
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
    const src = read("components/RefreshInspectorFindingsButton.tsx")
    expect(src).toMatch(/startSync\(\s*\{\s*sources:\s*contract\.requiredLanes/)
    expect(src).toContain("SYNC_SURFACES.cve")
  })

  it("the shared button fails closed on anything but CONNECTED", () => {
    const src = read("components/RefreshEvidenceButton.tsx")
    expect(src).toContain('capability !== "CONNECTED"')
    const cve = read("components/RefreshInspectorFindingsButton.tsx")
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

/**
 * Transitive guards.
 *
 * The direct-hook census above is NOT a reachability census, and believing it
 * was is what let a correctly single-lane CVE control sit on a broad system
 * dashboard and stamp a generic "Last sync" from the browser clock. These
 * scan every USAGE of a lane-specific control, not every caller of the hook.
 */

/** Controls that refresh exactly one declared set of lanes. */
const LANE_SPECIFIC_CONTROLS = [
  "RefreshEvidenceButton",
  "RefreshInspectorFindingsButton",
] as const

function usages(control: string): Array<{ file: string; tag: string }> {
  const found: Array<{ file: string; tag: string }> = []
  for (const f of COMPONENTS) {
    if (f.endsWith(`${control}.tsx`)) continue
    const src = code(f)
    const re = new RegExp(`<${control}\\b[\\s\\S]*?/>`, "g")
    for (const m of src.match(re) ?? []) found.push({ file: f, tag: m })
  }
  return found
}

describe("every usage of a lane-specific control binds a surface", () => {
  it("RefreshEvidenceButton is always given an explicit surface", () => {
    const missing = usages("RefreshEvidenceButton").filter(
      (u) => !/\bsurface=/.test(u.tag),
    )
    expect(missing.map((m) => m.file)).toEqual([])
  })

  it("every surface named is one the contract declares", () => {
    const declared = new Set([
      "cve", "inventory", "iam", "leastPrivilege", "behavioral", "dependencyMap", "network",
    ])
    const bad: string[] = []
    for (const u of usages("RefreshEvidenceButton")) {
      const m = /surface="([^"]+)"/.exec(u.tag)
      if (!m || !declared.has(m[1])) bad.push(`${u.file}: ${m?.[1] ?? "<none>"}`)
    }
    expect(bad).toEqual([])
  })

  it("every CVE-control call site derives freshness from the cve receipt", () => {
    // It is inherently vulnerability_findings. Wherever it appears, the call
    // site must derive freshness from the receipt for the cve surface --
    // never from a clock, and never as a whole-page claim. It may do that
    // inline OR by delegating to the owner module that does; what it may not
    // do is neither.
    for (const u of usages("RefreshInspectorFindingsButton")) {
      const src = code(u.file)
      const derivesInline =
        src.includes("SYNC_SURFACES.cve") && src.includes("surfaceRefreshedAt")
      const delegates = src.includes("useInspectorFreshness")
      expect(
        derivesInline || delegates,
        `${u.file} renders the CVE control without deriving cve freshness`,
      ).toBe(true)
    }
  })
})

describe("no refresh callback writes a browser clock", () => {
  it("no lane-specific control's handler constructs a Date", () => {
    const offenders: string[] = []
    for (const control of LANE_SPECIFIC_CONTROLS) {
      for (const u of usages(control)) {
        // The JSX tag carries the handler body for inline arrow callbacks,
        // which is how the defect was written.
        if (/new Date\(\s*\)/.test(u.tag)) offenders.push(`${u.file}: ${control}`)
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * One site renders "Last sync" honestly, and is allowed by name.
   *
   * `all-services-inventory` is a single-lane (inventory) screen and its
   * value is BACKEND evidence -- `computed_at` / `synced_at` / `last_sync` /
   * `syncStatus.lastSync` -- formatted by `formatLastSyncLabel`, which
   * returns UNKNOWN for anything missing or unparseable. Nothing there comes
   * from a clock, and the label is unambiguous on a screen showing one lane.
   */
  const HONEST_LAST_SYNC = new Set(["components/all-services-inventory.tsx"])

  it("renders no generic 'Last sync' freshness label from a client clock", () => {
    const offenders: string[] = []
    for (const f of [...COMPONENTS, ...walk("lib")]) {
      if (HONEST_LAST_SYNC.has(f.replace(/\\/g, "/"))) continue
      code(f)
        .split("\n")
        .forEach((line, i) => {
          // A freshness label must name its evidence. "Last sync" on a page
          // aggregating several lanes is the claim that cannot be true, and
          // a `new Date()` behind it is never AWS freshness.
          // The LABEL form specifically -- "Last sync:" introducing a value.
          // Prose like "last synced {backendStamp}" is a different, honest
          // claim about one named thing, and shared-role-callout makes it
          // from IAMRole.workload_count_synced_at.
          if (/Last sync:/i.test(line)) offenders.push(`${f}:${i + 1}`)
        })
    }
    expect(offenders).toEqual([])
  })
})

describe("the system dashboard uses the real freshness owner", () => {
  const dash = code("components/system-detail-dashboard.tsx")

  it("imports the extracted owner rather than re-implementing it", () => {
    expect(dash).toContain("useInspectorFreshness")
    expect(dash).toContain("InspectorFreshnessNote")
  })

  it("owns no freshness state of its own", () => {
    // A second copy of this state is how the wiring drifts from the module
    // that documents why it must not use a clock.
    expect(dash).not.toMatch(/setInspectorRefreshedAt/)
    expect(dash).not.toMatch(/setLastSyncedAt/)
    expect(dash).not.toMatch(/const \[refreshKey, setRefreshKey\]/)
  })

  it("passes the owner's handler straight to the CVE control", () => {
    expect(dash).toMatch(/onRefreshed=\{onInspectorRefreshed\}/)
  })

  it("the owner derives its stamp from the receipt, never a clock", () => {
    const owner = code("components/system-detail/inspector-freshness.tsx")
    expect(owner).toContain("surfaceRefreshedAt(SYNC_SURFACES.cve, payload)")
    // `new Date(at)` for FORMATTING a backend stamp is fine; `new Date()`
    // with no argument is the clock, and is what must never appear.
    expect(owner).not.toMatch(/new Date\(\s*\)/)
  })
})
