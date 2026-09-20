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

const MODEL = readFileSync(resolve(COMPONENT_DIR, "estate-identity-access-model.ts"), "utf8")
const TAB_ONLY = readFileSync(
  resolve(COMPONENT_DIR, "estate-identity-access-tab.tsx"),
  "utf8",
)

/**
 * Source with comments and quoted strings removed, spaced by token.
 *
 * These files EXPLAIN the fallbacks they no longer contain. Searching raw text
 * finds the explanation and fails on it — prose about a defect is not the
 * defect. Spacing by token also makes `a??b` and `a ?? b` match one pattern.
 *
 * Template literals are deliberately NOT blanked. An earlier version replaced
 * each one wholesale, which swallowed its `${...}` expressions too — and that
 * is exactly where two real fallbacks were hiding, in
 * `${decision.configuredGrantCount ?? "—"} actions granted`. A guard that
 * cannot see inside an interpolation cannot see the code that renders.
 */
function stripLiterals(source: string): string {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
  const withoutStrings = withoutComments
    .replace(/"(?:[^"\\]|\\.)*"/g, '\"\"')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
  return withoutStrings.replace(/([?][?]|[|][|]|[.,()[\]{}:;=<>])/g, " $1 ").replace(/\s+/g, " ")
}

/**
 * No producer-required field may be read with a fallback.
 *
 * Validation decides whether a payload is readable; after that, every field the
 * producer writes unconditionally is consumed through ValidBlock / ValidRole,
 * where it is non-optional. A `?? []`, `?? {}` or `?? "unavailable"` on one of
 * those fields substitutes a value this code invented, and on screen an
 * invented value is indistinguishable from a reported one. That the validator
 * makes such a line nominally unreachable is not the point: it is a default
 * waiting to be reached again the moment a check is relaxed.
 *
 * This is a source guard, deliberately. The behaviour is covered by the model
 * and rendered suites; what those cannot see is a fallback reintroduced behind
 * a validator that happens to still reject the input today.
 */
describe("no required field is read with a fallback", () => {
  /** Fields every v1 payload and every emitted role carries. */
  const REQUIRED_FIELDS = [
    "roles",
    "gaps",
    "roles_total",
    "roles_returned",
    "roles_truncated",
    "roles_omitted_unresolved",
    "workload_ids",
    "attachment_modes",
    "configured_grants",
    "observed_use",
    "effective_authorization",
    "reason_codes",
    "availability",
    "granularity",
    "exact_action_count",
    "coverage_counts",
    "projection_scope",
    "generation",
    "staging_run_id",
    "source_vector_hash",
    "projected_through",
    "projection_receipt_hash",
    // The same fields under their view-model names. Two of these hid behind
    // the naming difference: the map read `configuredGrantCount ?? "—"` and
    // `observed.successful ?? "—"` while the snake_case guard saw nothing.
    "configuredGrantCount",
    "successful",
    "deniedOnly",
    "notObserved",
    "reasonCodes",
    "attachmentModes",
    "projectionScope",
    "generation",
    "sourceVectorHash",
    "projectedThrough",
    "stagingRunId",
    "rolesReturned",
    "rolesTruncated",
  ]

  /**
   * Fields the producer may legitimately emit as null, where choosing what to
   * show instead is presentation, not invention.
   */
  const OPTIONAL_DISPLAY_FIELDS = ["name", "role_arn", "lifecycle_state", "last_success_at"]

  const SOURCES: [string, string][] = [
    ["estate-identity-access-model.ts", MODEL],
    ["estate-identity-map.tsx", MAP],
    ["estate-identity-access-tab.tsx", TAB_ONLY],
  ]

  it.each(SOURCES)("%s reads no required field with ?? or ||", (_name, source) => {
    const code = stripLiterals(source)
    const offenders: string[] = []
    for (const field of REQUIRED_FIELDS) {
      // `x.field ?? …`, `x.field ||…`, and `(x.field ?? …)` after a cast.
      const pattern = new RegExp(`\\b${field}\\s*(\\?\\?|\\|\\|)`, "g")
      for (const match of code.matchAll(pattern)) offenders.push(`${field}${match[1]}`)
    }
    expect(offenders).toEqual([])
  })

  it("the refined types leave nothing to fall back to", () => {
    // The structural reason the fallbacks above cannot be written: every
    // producer-required field is declared non-optional, so `?? default` has no
    // undefined case to answer.
    const code = stripLiterals(MODEL)
    for (const declaration of [
      "workload_ids : string [ ]",
      "attachment_modes : string [ ]",
      "availability : string",
      "granularity : string",
      "reason_codes : string [ ]",
      "roles_returned : number",
      "roles_truncated : boolean",
      "gaps : IdentityGap [ ]",
      "generation : number",
    ]) {
      expect(code).toContain(declaration)
    }
  })

  it("no refined type marks a required field optional", () => {
    // Scoped to the Valid* family on purpose. The WIRE types above them are
    // optional by design: they describe what might arrive before anything is
    // checked, which is the whole reason the validators exist.
    const refined = [
      "ValidAuthority",
      "ValidConfiguredGrants",
      "ValidObservedUse",
      "ValidEffectiveAuthorization",
      "ValidRole",
      "ValidBlock",
    ]
    for (const name of refined) {
      const start = MODEL.indexOf(`export interface ${name} {`)
      expect(start).toBeGreaterThan(-1)
      const body = MODEL.slice(start, MODEL.indexOf("\n}", start))
      const optional = [...body.matchAll(/^\s{2}(\w+)\?:/gm)].map(match => match[1])
      expect(optional).toEqual([])
    }
  })

  it("the guard is looking at something — it finds a planted fallback", () => {
    // A guard that matches nothing would pass forever. This proves the pattern.
    const planted = stripLiterals("const x = role.workload_ids ?? []")
    expect(/\bworkload_ids\s*(\?\?|\|\|)/.test(planted)).toBe(true)
  })

  it("still allows a fallback on a genuinely optional display field", () => {
    // role.name is nullable at the producer, so choosing the role id instead is
    // a presentation decision. The guard must not forbid that.
    for (const field of OPTIONAL_DISPLAY_FIELDS) {
      expect(REQUIRED_FIELDS).not.toContain(field)
    }
    expect(stripLiterals(MODEL)).toContain("role . name ?? role . role_id")
  })

  it("the decision hop is a union, so a ready state has no nullable count", () => {
    // One shape with nullable numbers is what invited `?? "—"` in the
    // renderer. The union removes the nullable case from the ready branch
    // entirely, so there is nothing to place a dash over.
    const code = stripLiterals(MODEL)
    expect(code).toContain("export interface GraphDecisionReady extends GraphDecisionBase { state : ")
    expect(code).toContain("configuredGrantCount : number observed : GraphDecisionObserved | null")
    expect(code).toContain("configuredGrantCount : null observed : null")
    expect(code).toContain("export type GraphDecisionNode = GraphDecisionReady | GraphDecisionUnavailable")
  })

  it("the builder and the graph consume the refined types", () => {
    const code = stripLiterals(MODEL)
    expect(code).toContain("function buildGraph ( roles : ValidRole [ ]")
    expect(code).toContain("const block = extractBlock ( raw , status as ValidStatus )")
  })
})

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
