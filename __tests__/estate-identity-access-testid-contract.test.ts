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
const COMPONENT_DIR = resolve(HERE, "../components/topology-v0-2")
const TAB =
  readFileSync(resolve(COMPONENT_DIR, "estate-identity-access-tab.tsx"), "utf8") +
  readFileSync(resolve(COMPONENT_DIR, "estate-identity-map.tsx"), "utf8")
const MAP = readFileSync(resolve(COMPONENT_DIR, "estate-identity-map.tsx"), "utf8")
const SUITE = readFileSync(resolve(HERE, "estate-identity-access-tab.test.tsx"), "utf8")

/** Test ids the component declares, i.e. `data-testid="..."` or testId="...". */
function declaredIds(source: string): Set<string> {
  const ids = new Set<string>()
  for (const match of source.matchAll(/data-testid="([^"]+)"/g)) ids.add(match[1])
  for (const match of source.matchAll(/testId="([^"]+)"/g)) ids.add(match[1])
  return ids
}

/**
 * Ids the suite REQUIRES to exist.
 *
 * Only getBy/getAllBy/findBy count: those throw when the element is absent. A
 * queryBy is how the suite asserts something is NOT rendered — the old card
 * list, for one — so requiring those ids to exist would invert the test.
 */
function requiredIds(source: string): Set<string> {
  const ids = new Set<string>()
  for (const match of source.matchAll(/(?:get|find)(?:All)?ByTestId\(\s*"([^"]+)"\s*\)/g)) {
    ids.add(match[1])
  }
  return ids
}

/** Ids the suite only probes for absence. */
function probedIds(source: string): Set<string> {
  const ids = new Set<string>()
  for (const match of source.matchAll(/query(?:All)?ByTestId\(\s*"([^"]+)"\s*\)/g)) {
    ids.add(match[1])
  }
  return ids
}

const MODEL = readFileSync(
  resolve(COMPONENT_DIR, "estate-identity-access-model.ts"),
  "utf8",
)

describe("no interface declares the same member twice", () => {
  /**
   * A duplicated member in an interface is a TS2300 the compiler catches, but
   * it is also the kind of thing a copy-paste reintroduces and a reader skims
   * past. This names it directly, at the one place it was reported.
   */
  function membersOf(source: string, name: string): string[] {
    const start = source.indexOf(`export interface ${name} {`)
    if (start < 0) return []
    const body = source.slice(start, source.indexOf("\n}", start))
    return [...body.matchAll(/^\s{2}(\w+)[?]?:/gm)].map(match => match[1])
  }

  it.each(["PlacedEdge", "PlacedNode", "MapLayout", "GraphEdge", "IdentityView"])(
    "%s declares each member once",
    name => {
      const members = membersOf(MODEL, name)
      expect(members.length).toBeGreaterThan(0)
      expect(members.length).toBe(new Set(members).size)
    },
  )

  it("PlacedEdge holds exactly one edge reference", () => {
    expect(membersOf(MODEL, "PlacedEdge").filter(member => member === "edge").length).toBe(1)
  })
})

describe("the rendered suite and the tab agree on their hooks", () => {
  it("queries at least a dozen ids, so this guard is checking something", () => {
    expect(requiredIds(SUITE).size).toBeGreaterThan(12)
  })

  it("every id the suite requires is declared by the component", () => {
    const declared = declaredIds(TAB)
    const missing = [...requiredIds(SUITE)].filter(id => !declared.has(id)).sort()
    expect(missing).toEqual([])
  })

  it("the card-list ids the suite checks are gone really are gone", () => {
    const declared = declaredIds(TAB)
    const probed = probedIds(SUITE)
    // These were the stacked-card surface the map replaced.
    for (const id of ["identity-graph", "identity-graph-row"]) {
      expect(probed.has(id)).toBe(true)
      expect(declared.has(id)).toBe(false)
    }
  })

  it("the component declares the ids the honesty states depend on", () => {
    const declared = declaredIds(TAB)
    for (const id of [
      "estate-identity-access",
      "identity-headline",
      "identity-detail",
      "identity-empty-authoritative",
      "identity-incomplete",
      "identity-capability-unavailable",
      "identity-receipts-none",
      "identity-scope-mismatch",
      "identity-plane-none",
      "identity-map",
      "identity-map-canvas",
      "identity-map-edge",
      "identity-map-node",
      "identity-map-fallback",
    ]) {
      expect(declared.has(id)).toBe(true)
    }
  })

  it("the map is drawn as SVG, not assembled from divs", () => {
    // The blocker this replaces was a stacked card list. A map that quietly
    // became one again would still pass every id check above.
    expect(MAP).toContain("<svg")
    expect(MAP).toContain("<path")
    expect(MAP).toContain("markerEnd")
    expect(MAP).toContain("viewBox")
  })

  it("motion is reachable only through the model's animated flag", () => {
    const code = MAP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
    // Every <animate> must sit behind `moving`, which is `animate && edge.animated`.
    expect(code).toContain("const moving = animate && edge.animated")
    expect(code).toContain("{moving ? (")
    // And `animate` is the negation of the reduced-motion preference.
    expect(code).toContain("const animate = !reducedMotion")
  })

  it("the reduced-motion default is no motion", () => {
    // useState(true) means: unknown preference renders static.
    expect(MAP).toContain("useState(true)")
  })

  it("the tab issues no request of its own", () => {
    // A fetch here would 404: no route serves this block separately.
    const code = TAB.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
    expect(code).not.toContain("fetch(")
    expect(code).not.toContain("useCachedFetch")
  })
})
