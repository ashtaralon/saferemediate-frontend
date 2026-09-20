/**
 * Drift guard: every test id the rendered suite queries exists in the tab.
 *
 * This is a SUPPLEMENT to estate-identity-access-tab.test.tsx, never a
 * substitute for it. It proves nothing about behaviour — only that the two
 * files still agree on the hooks between them. A typo'd `data-testid` is
 * invisible to the type checker (both sides are strings) and would surface as
 * a red CI run rather than as a local failure, so it is worth one cheap check.
 *
 * What actually proves the tab renders honestly is the rendered suite next to
 * this one, and the model suite behind it.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const TAB = readFileSync(
  resolve(HERE, "../components/topology-v0-2/estate-identity-access-tab.tsx"),
  "utf8",
)
const SUITE = readFileSync(resolve(HERE, "estate-identity-access-tab.test.tsx"), "utf8")

/** Test ids the component declares, i.e. `data-testid="..."` or testId="...". */
function declaredIds(source: string): Set<string> {
  const ids = new Set<string>()
  for (const match of source.matchAll(/data-testid="([^"]+)"/g)) ids.add(match[1])
  for (const match of source.matchAll(/testId="([^"]+)"/g)) ids.add(match[1])
  return ids
}

/** Test ids the suite looks up through a testing-library query. */
function queriedIds(source: string): Set<string> {
  const ids = new Set<string>()
  const query = /(?:get|query|find)(?:All)?ByTestId\(\s*"([^"]+)"\s*\)/g
  for (const match of source.matchAll(query)) ids.add(match[1])
  return ids
}

describe("the rendered suite and the tab agree on their hooks", () => {
  it("queries at least a dozen ids, so this guard is checking something", () => {
    expect(queriedIds(SUITE).size).toBeGreaterThan(12)
  })

  it("every queried id is declared by the component", () => {
    const declared = declaredIds(TAB)
    const missing = [...queriedIds(SUITE)].filter(id => !declared.has(id)).sort()
    expect(missing).toEqual([])
  })

  it("the component declares the ids the honesty states depend on", () => {
    const declared = declaredIds(TAB)
    for (const id of [
      "estate-identity-access",
      "identity-headline",
      "identity-detail",
      "identity-empty-authoritative",
      "identity-capability-unavailable",
      "identity-receipts-none",
      "identity-scope-mismatch",
      "identity-plane-none",
    ]) {
      expect(declared.has(id)).toBe(true)
    }
  })

  it("the tab issues no request of its own", () => {
    // A fetch here would 404: no route serves this block separately.
    const code = TAB.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
    expect(code).not.toContain("fetch(")
    expect(code).not.toContain("useCachedFetch")
  })
})
