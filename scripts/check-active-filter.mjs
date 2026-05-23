#!/usr/bin/env node
/**
 * CI gate: every component that consumes IAP path data must apply the
 * frontend stale-node gate (lib/active-filters.ts).
 *
 * Why this exists
 * ---------------
 * The backend ships a centralized is_active filter that drops phantom
 * workloads/jewels at the API boundary. That filter is correct for
 * fresh responses. But the frontend serves CACHED IAP responses from
 * localStorage on backend 5xx (useCachedFetch's stale-while-revalidate).
 * A cached response from before backend hardening can contain phantom
 * nodes the freshly-deployed backend would never emit.
 *
 * `filterActivePaths` (in lib/active-filters.ts) is the client-side
 * gate that catches that. This script enforces that every new
 * component which consumes IAP-shaped path data routes through it.
 *
 * Heuristic, not semantic — false positives expected and can be
 * silenced with `// WAIVER_active_filter: <reason>` anywhere in the
 * file. Mirrors the backend's WAIVER_workload_filter mechanism.
 *
 * Run locally:
 *    node scripts/check-active-filter.mjs
 *
 * In CI: wire as a non-zero-exit failure step.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..")

// A file "fetches IAP path data" if it initiates a network request to
// /api/proxy/identity-attack-paths/... — typically via fetch() or
// useCachedFetch with that URL. ONLY fetch sites need the filter;
// downstream consumers receive filtered data via props and rely on
// their fetcher having already gated. Filtering twice would be
// idempotent but adds noise + a false-positive risk if the inner
// filter's staleIds set diverges from the outer's.
const FETCHES_IAP_PATTERN =
  /\/api\/proxy\/identity-attack-paths\/|\/api\/identity-attack-paths\//

// Acceptable: imports filterActivePaths OR has a WAIVER comment.
const APPLIES_FILTER_PATTERN = /filterActivePaths|isActiveNode|active-filters/
const WAIVER_PATTERN = /WAIVER_active_filter\s*:/

// Skip the central module itself + its tests, and a few known
// type-only or proxy files that don't render paths.
const SKIP_FILES = new Set([
  "lib/active-filters.ts",
  "__tests__/active-filters.test.ts",
  // Proxy routes are server-side passthroughs to the backend. The
  // backend gate already filtered; no client-side render here.
  "app/api/proxy/identity-attack-paths/[systemName]/route.ts",
  "app/api/proxy/identity-attack-paths/all/route.ts",
  "app/api/proxy/identity-attack-paths/[systemName]/jewel/[jewelId]/route.ts",
  "app/api/proxy/identity-attack-paths/[systemName]/jewel-surface/[jewelId]/route.ts",
  // Type definitions don't render anything.
  "components/identity-attack-paths/types.ts",
])

// Directories to walk. Skip node_modules + worktrees + build artifacts.
const SCAN_DIRS = ["app", "components", "lib", "hooks"]

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  ".claude",
])

function* walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      yield* walk(full)
    } else if (
      stat.isFile() &&
      (entry.endsWith(".ts") || entry.endsWith(".tsx"))
    ) {
      yield full
    }
  }
}

let checked = 0
const failures = []

for (const dirName of SCAN_DIRS) {
  const root = join(REPO_ROOT, dirName)
  for (const full of walk(root)) {
    const rel = relative(REPO_ROOT, full)
    if (SKIP_FILES.has(rel)) continue
    checked++
    let text
    try {
      text = readFileSync(full, "utf8")
    } catch {
      continue
    }
    if (!FETCHES_IAP_PATTERN.test(text)) continue
    if (APPLIES_FILTER_PATTERN.test(text)) continue
    if (WAIVER_PATTERN.test(text)) continue
    failures.push(rel)
  }
}

if (failures.length > 0) {
  console.error(
    "FAIL: the following files consume IAP path data but don't apply the\n" +
      "central frontend stale-node filter (lib/active-filters.ts):",
  )
  for (const f of failures) {
    console.error(`  - ${f}`)
  }
  console.error("")
  console.error("Fix one of these ways:")
  console.error(
    "  1. import { filterActivePaths } from '@/lib/active-filters' and",
  )
  console.error("     wrap the paths array before consuming downstream.")
  console.error(
    "  2. If the file is a passthrough (proxy route, type definition,",
  )
  console.error("     etc.) and intentionally doesn't render paths, add it")
  console.error("     to SKIP_FILES in this script.")
  console.error(
    "  3. If a component intentionally surfaces ALL paths including",
  )
  console.error(
    "     historical/stale ones (debug / forensic view), add a",
  )
  console.error(
    "     '// WAIVER_active_filter: <reason>' comment explaining why.",
  )
  console.error("")
  console.error(`Checked ${checked} files. ${failures.length} need attention.`)
  process.exit(1)
}

console.log(
  `OK: ${checked} .ts/.tsx files checked, all IAP-data consumers route through ` +
    `filterActivePaths or are explicitly waived.`,
)
process.exit(0)
