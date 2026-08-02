/**
 * Home = Executive + Operations. Every card mounted EXACTLY once.
 *
 * The regression this guards is not hypothetical. An earlier cut unmounted
 * eleven cards from Home toward "Resource Risk / Issues / Security
 * Operations" — destinations that were never built — and SeverityDonutCard,
 * FamilyStrip and NarrowingSummaryCard ended up mounted NOWHERE in the
 * product. Removing a card from one page does not move it.
 *
 * So: zero mounts is a deletion, two mounts is a duplicate fetch and a
 * divergent reading of the same estate on one page. Exactly one.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const V3 = join(ROOT, "components/dashboard/v3")

function read(f: string): string {
  return readFileSync(join(V3, f), "utf8")
}

/** Strip comments — prose naming a component is not a mount. */
function code(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const EXEC = code(read("executive-cockpit.tsx"))
const OPS = code(read("operations-view.tsx"))
const SHELL = code(read("home-dashboard-v3.tsx"))

function mountCount(component: string, ...sources: string[]): number {
  const re = new RegExp(`<${component}(\\s|/|>)`, "g")
  return sources.reduce((n, s) => n + (s.match(re) ?? []).length, 0)
}

/** Every card that has to survive the Executive/Operations split. */
const CARDS = [
  "HeroBrssCard",
  "SeverityDonutCard",
  "FamilyStrip",
  "EvidenceHealthCardV3",
  "DecisionRoutingCard",
  "WildcardBloatCard",
  "LPTopIssuesCard",
  "NarrowingSummaryCard",
  "RecentActivityCard",
  "TopSystemsCard",
  "SafeRemediationsQueueCard",
  "AttackPathsCard",
  "DivergenceBanner",
  "LiveNowStrip",
]

describe("Home views — nothing deleted, nothing duplicated", () => {
  it.each(CARDS)("%s is mounted exactly once across both views", (card) => {
    const n = mountCount(card, EXEC, OPS)
    expect(n, `${card} mounted ${n}× — 0 means deleted, 2+ means duplicated`).toBe(1)
  })

  it("the operations accordion is gone from the shell", () => {
    // The accordion was storage, not architecture. Operations view replaces it.
    expect(SHELL).not.toContain("<details")
    expect(SHELL).not.toContain("Security operations detail")
  })

  it("the shell mounts both views and nothing else renders cards", () => {
    expect(SHELL).toContain("<ExecutiveCockpit")
    expect(SHELL).toContain("<OperationsView")
  })
})

describe("Executive presentation contract", () => {
  it("suppresses per-card transport detail", () => {
    // "HTTP 502" on three cards at once is an operations reading. Observed
    // live 2026-08-02 with two cards showing it simultaneously.
    expect(EXEC).toContain("ExecutiveViewContext.Provider")
    const shell = code(read("card-shell.tsx"))
    expect(shell).toContain("useContext(ExecutiveViewContext)")
  })

  it("consolidates failures into one page-level banner", () => {
    expect(EXEC).toContain("DataStatusBanner")
  })

  it("caps rows so the cockpit cannot become an endless scroll", () => {
    expect(EXEC).toMatch(/<TopSystemsCard\s+limit=\{5\}/)
    expect(EXEC).toMatch(/<SafeRemediationsQueueCard\s+limit=\{3\}/)
    expect(EXEC).toMatch(/<AttackPathsCard[^>]*limit=\{1\}/)
  })

  it("MUTATION: an unavailable KPI shows no number", () => {
    // A cell may not print a value and disclaim it in the same breath.
    expect(EXEC).toMatch(/kpi\.unavailable\s*\?\s*null\s*:\s*kpi\.value/)
    expect(EXEC).not.toMatch(/\?\?\s*0/)
    expect(EXEC).not.toMatch(/\|\|\s*0\b/)
  })

  it("does NOT compose a cross-source narrative yet", () => {
    // Three feeds can each be READY from different graph generations at
    // different times; a combined sentence can be false while every input
    // is individually honest. Needs the governed snapshot first.
    expect(EXEC).not.toMatch(/narrative|headline sentence/i)
  })
})

describe("Management report entry point", () => {
  const DRAWER = code(read("management-report-drawer.tsx"))

  it("never claims board-ready without a governed snapshot", () => {
    expect(DRAWER).toContain("ready: false")
  })

  it("describes the reading on screen rather than fetching its own", () => {
    expect(DRAWER).not.toContain("useCachedFetch")
    expect(DRAWER).not.toContain("fetch(")
    expect(EXEC).toContain("onReadiness")
  })
})
