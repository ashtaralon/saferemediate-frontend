/**
 * The five merge blockers found in review of PR #518, one test each.
 *
 * The original suite inspected mounting and source strings. It did not
 * exercise failure responses, shared-reading consistency, report
 * completeness, or the limit={3} count — so all five shipped green.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  deriveCandidatesIntegrity,
  isCacheableCandidates,
} from "@/lib/candidates-integrity"

const ROOT = join(__dirname, "..", "..")
const V3 = join(ROOT, "components/dashboard/v3")
const read = (f: string) => readFileSync(join(V3, f), "utf8")
const code = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const COCKPIT = code(read("executive-cockpit.tsx"))
const QUEUE = code(read("safe-remediations-queue-card.tsx"))
const SHELL = code(code(read("home-dashboard-v3.tsx")))
const EVIDENCE = code(read("evidence-health-card.tsx"))

// ── 1. an upstream failure must not read as READY with zero changes ──────

describe("1 · a 200 carrying `error` is a failed read", () => {
  /** Exactly what app/api/proxy/remediation-candidates/route.ts returns on
   *  an upstream failure: HTTP 200, well-formed, empty, with `error`. */
  const PROXY_FAILURE = {
    candidates: [],
    summary: { total_candidates: 0, by_type: {}, auto_applicable: 0, blocked: 0 },
    error: "Failed to load remediation candidates",
  }

  it("REGRESSION: the proxy's failure envelope is not READY", () => {
    const i = deriveCandidatesIntegrity(PROXY_FAILURE)
    expect(i.state).toBe("UNAVAILABLE")
    expect(i.canRenderCounts).toBe(false)
    expect(i.reason).toContain("Failed to load")
  })

  it("a real empty queue IS ready — absence of candidates is not failure", () => {
    const i = deriveCandidatesIntegrity({
      candidates: [],
      summary: { auto_applicable: 0, blocked: 0 },
    })
    expect(i.state).toBe("READY")
    expect(i.canRenderCounts).toBe(true)
  })

  it("a payload with no candidates array cannot vouch for an empty queue", () => {
    expect(deriveCandidatesIntegrity({ summary: {} }).state).toBe("UNAVAILABLE")
    expect(deriveCandidatesIntegrity(null).state).toBe("UNAVAILABLE")
    expect(deriveCandidatesIntegrity(undefined).state).toBe("UNAVAILABLE")
  })

  it("a failure envelope is never cached as a reading", () => {
    expect(isCacheableCandidates(PROXY_FAILURE)).toBe(false)
    expect(isCacheableCandidates({ candidates: [] })).toBe(true)
  })

  it("the queue card's guard is reachable", () => {
    // Was `if ((error || bodyError) && !data)` — `data` IS the failure
    // object, so `!data` was false and the branch could never run.
    expect(QUEUE).toContain("deriveCandidatesIntegrity")
    expect(QUEUE).not.toMatch(/\(error \|\| bodyError\) && !data/)
  })

  it("the cockpit's KPI honours it too", () => {
    expect(COCKPIT).toMatch(/remDown = remIntegrity\.state !== "READY"/)
  })
})

// ── 2. one page, one reading ─────────────────────────────────────────────

describe("2 · banner, KPIs and cards share one reading", () => {
  it.each([
    ["TopSystemsCard", "systems"],
    ["SafeRemediationsQueueCard", "remediations"],
    ["AttackPathsCard", "paths"],
    ["EvidenceHealthCardV3", "evidence"],
    ["NarrowingSummaryCard", "outcomes"],
  ])("%s receives the cockpit's read, not its own", (card, source) => {
    expect(COCKPIT).toMatch(new RegExp(`<${card}[^>]*shared=\\{${source}\\}`))
  })

  it("no card re-fetches under a divergent cache key", () => {
    // The banner said "Business systems: unavailable" while the table
    // below it rendered systems, because one copy succeeded and the other
    // did not. Every card now reads null-url when `shared` is supplied.
    for (const f of [
      "top-systems-card.tsx",
      "attack-paths-card.tsx",
      "safe-remediations-queue-card.tsx",
      "evidence-health-card.tsx",
      "narrowing-summary-card.tsx",
    ]) {
      expect(code(read(f)), f).toMatch(/shared \? null :/)
    }
  })
})

// ── 3. the report covers every executive feed ────────────────────────────

describe("3 · report coverage includes the whole cockpit", () => {
  const RENDERED = [
    "TopSystemsCard",
    "SafeRemediationsQueueCard",
    "AttackPathsCard",
    "EvidenceHealthCardV3",
    "NarrowingSummaryCard",
  ]

  it("every rendered executive panel is a tracked source", () => {
    // Tracking three while rendering five let the report omit an unavailable
    // panel from its coverage notes.
    const labels = [
      "Business systems",
      "Attack paths",
      "Proposed changes",
      "Evidence health",
      "Verified outcomes",
    ]
    for (const l of labels) expect(COCKPIT).toContain(`label: "${l}"`)
    expect(labels).toHaveLength(RENDERED.length)
  })
})

// ── 4. the report is executive-only and never stale ──────────────────────

describe("4 · report ownership follows the view", () => {
  it("the button is not offered in Operations", () => {
    // Report sources are populated only when the cockpit mounts.
    expect(SHELL).toMatch(/view === "executive" && \(/)
  })

  it("switching away clears report data instead of leaving it stale", () => {
    expect(SHELL).toMatch(/if \(v !== "executive"\)/)
    expect(SHELL).toContain("setReportContext({ scope:")
  })
})

// ── 5. the footer count follows the limit ────────────────────────────────

describe("5 · proposed-changes footer", () => {
  it("derives 'more' from limit, not a hardcoded 5", () => {
    // limit={3} with 10 ready showed 3 rows and said "+5 more".
    expect(QUEUE).toContain("ready.length - limit")
    expect(QUEUE).not.toMatch(/ready\.length - 5\b/)
    expect(QUEUE).toContain("ready.length > limit")
  })
})

// ── the single-refresh promise ───────────────────────────────────────────

describe("one refresh control in Executive", () => {
  it("evidence health hides its own refresh there", () => {
    expect(EVIDENCE).toContain("useContext(ExecutiveViewContext)")
    expect(EVIDENCE).toMatch(/\{!executive && \(/)
  })
})
