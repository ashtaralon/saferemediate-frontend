/**
 * No held or unknown summary state may render 0, 100, "healthy", or "all clear".
 *
 * The backend now returns NULL counts — not zeros — for anything it cannot
 * vouch for. That only helps if consumers stop coercing. The defect:
 *
 *     const total = data.total ?? 0        // severity-donut-card.tsx
 *
 * An analyzer crash, a Neo4j outage and a proxy timeout all arrive as null, and
 * `?? 0` turned every one into a clean bill of health on the first card a
 * customer reads.
 *
 * Eight states, one rule: only an EXPLICIT READY + analysis_complete + numeric
 * zero may render all-clear.
 */

import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  deriveSummaryIntegrity,
  isCacheableSummary,
} from "@/lib/summary-integrity"
import {
  STALE_BACKEND_RECOVERING,
  useCachedFetch,
} from "@/lib/use-cached-fetch"

const SUMMARY_KEY = "summary-fail-closed-test"
const SUMMARY_URL = "/api/proxy/summary"

/** A cached payload that CLAIMS to be current and complete — the value whose
 *  survival past a failed refresh is the whole concern here. */
function seedReady() {
  window.localStorage.setItem(
    `cyntro:swr:${SUMMARY_KEY}`,
    JSON.stringify({
      data: {
        success: true,
        serve_state: "READY",
        analysis_complete: true,
        total: 18,
      },
      ts: Date.now(),
    }),
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

const READY_WITH_FINDINGS = {
  success: true, serve_state: "READY", analysis_complete: true,
  total: 17, critical: 2, high: 5, medium: 7, low: 3, avg_health_score: 71,
}
const READY_EXPLICIT_ZERO = {
  success: true, serve_state: "READY", analysis_complete: true,
  total: 0, critical: 0, high: 0, medium: 0, low: 0, avg_health_score: 100,
}
const INTEGRITY_HELD = {
  success: true, serve_state: "INTEGRITY_HELD", analysis_complete: false,
  counts_are_partial: true, failed_analyzers: ["iam_role"],
  total: null, critical: 1, high: 0, medium: 0, low: 0, avg_health_score: null,
}
const NOT_READY = {
  success: true, serve_state: "NOT_READY", analysis_complete: false,
  total: null, avg_health_score: null,
  integrityReason: "No graph connection — no analyzer ran.",
}
const MISSING_INTEGRITY = { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
const SUCCESS_FALSE = {
  success: false, error: "neo4j down",
  total: null, critical: null, high: null, medium: null, low: null,
}
const STALE_CACHE = {
  success: true, serve_state: "NOT_READY", analysis_complete: false,
  fromStaleCache: true, staleReason: "timeout", total: 17, critical: 2,
}

describe("1 — READY with findings", () => {
  it("is authoritative and renders numbers", () => {
    const i = deriveSummaryIntegrity(READY_WITH_FINDINGS)
    expect(i.state).toBe("READY")
    expect(i.canRenderAllClear).toBe(false)
    expect(i.canRenderScores).toBe(true)
    expect(i.mutationBlocked).toBe(false)
    expect(i.countsArePartial).toBe(false)
  })
})

describe("2 — READY with explicit zero", () => {
  it("is the ONLY state permitted to say all clear", () => {
    const i = deriveSummaryIntegrity(READY_EXPLICIT_ZERO)
    expect(i.state).toBe("READY")
    expect(i.canRenderAllClear).toBe(true)
  })
})

describe("3 — INTEGRITY_HELD with partial counts", () => {
  it("shows counts as partial, never as all clear", () => {
    const i = deriveSummaryIntegrity(INTEGRITY_HELD)
    expect(i.state).toBe("INTEGRITY_HELD")
    expect(i.canRenderAllClear).toBe(false)
    expect(i.countsArePartial).toBe(true)
    expect(i.canRenderScores).toBe(false) // suppress health / BRSS
    expect(i.mutationBlocked).toBe(true)
  })
})

describe("4 — NOT_READY", () => {
  it("suppresses everything and carries the reason", () => {
    const i = deriveSummaryIntegrity(NOT_READY)
    expect(i.state).toBe("NOT_READY")
    expect(i.canRenderAllClear).toBe(false)
    expect(i.canRenderScores).toBe(false)
    expect(i.reason).toContain("no analyzer ran")
  })
})

describe("5 — missing integrity fields", () => {
  it("fails CLOSED — silence is not health", () => {
    const i = deriveSummaryIntegrity(MISSING_INTEGRITY)
    expect(i.state).toBe("NOT_READY")
    expect(i.canRenderAllClear).toBe(false)
  })

  it("also covers null/undefined payloads", () => {
    expect(deriveSummaryIntegrity(null).state).toBe("NOT_READY")
    expect(deriveSummaryIntegrity(undefined).canRenderAllClear).toBe(false)
  })

  it("READY without analysis_complete is still not ready", () => {
    const i = deriveSummaryIntegrity({ serve_state: "READY", total: 0 })
    expect(i.state).toBe("NOT_READY")
    expect(i.canRenderAllClear).toBe(false)
  })
})

describe("6 — success:false", () => {
  it("is never healthy regardless of serve_state", () => {
    expect(deriveSummaryIntegrity(SUCCESS_FALSE).state).toBe("NOT_READY")
    expect(
      deriveSummaryIntegrity({ ...SUCCESS_FALSE, serve_state: "READY", analysis_complete: true }).state,
    ).toBe("NOT_READY")
  })
})

describe("7 — timeout / stale cache", () => {
  it("may show rows, but never with its prior READY authority", () => {
    const i = deriveSummaryIntegrity(STALE_CACHE)
    expect(i.state).toBe("NOT_READY")
    expect(i.canRenderScores).toBe(false)
    expect(i.countsArePartial).toBe(true)
  })

  it("a stale payload still claiming READY is demoted", () => {
    const i = deriveSummaryIntegrity({
      ...STALE_CACHE, serve_state: "READY", analysis_complete: true,
    })
    expect(i.state).toBe("NOT_READY")
  })
})

describe("8 — no held/unknown state may display zero, 100, healthy or all-clear", () => {
  const notHealthy = [
    ["INTEGRITY_HELD", INTEGRITY_HELD],
    ["NOT_READY", NOT_READY],
    ["missing integrity", MISSING_INTEGRITY],
    ["success:false", SUCCESS_FALSE],
    ["stale cache", STALE_CACHE],
  ] as const

  it.each(notHealthy)("%s cannot render all-clear or scores", (_label, payload) => {
    const i = deriveSummaryIntegrity(payload)
    expect(i.canRenderAllClear).toBe(false)
    expect(i.canRenderScores).toBe(false)
    expect(i.mutationBlocked).toBe(true)
  })

  it("a null total never becomes zero", () => {
    // The literal defect: `total ?? 0` would make this indistinguishable from
    // READY_EXPLICIT_ZERO.
    const held = deriveSummaryIntegrity({ ...INTEGRITY_HELD, total: null })
    const zero = deriveSummaryIntegrity(READY_EXPLICIT_ZERO)
    expect(held.canRenderAllClear).not.toBe(zero.canRenderAllClear)
  })
})

describe("cache gate", () => {
  it("caches only an authoritative response", () => {
    expect(isCacheableSummary(READY_WITH_FINDINGS)).toBe(true)
    expect(isCacheableSummary(READY_EXPLICIT_ZERO)).toBe(true)
  })

  it.each([
    ["INTEGRITY_HELD", INTEGRITY_HELD],
    ["NOT_READY", NOT_READY],
    ["missing integrity", MISSING_INTEGRITY],
    ["success:false", SUCCESS_FALSE],
    ["null", null],
  ] as const)("never caches %s", (_label, payload) => {
    expect(isCacheableSummary(payload)).toBe(false)
  })

  it("never caches READY without analysis_complete", () => {
    expect(isCacheableSummary({ success: true, serve_state: "READY", total: 0 })).toBe(false)
  })
})

describe("score consumers — BRSS and health must be withheld when held", () => {
  // The exact shape the backend now sends for a held sweep. Note there is NO
  // `error` key: the old guards were `!blast_radius_score.error`, which passed
  // this straight through and rendered a posture number composed from an
  // unknown subset of resources.
  const HELD_WITH_BRSS = {
    success: true,
    serve_state: "INTEGRITY_HELD",
    analysis_complete: false,
    total: null,
    avg_health_score: null,
    blast_radius_score: {
      score: null,
      analysis_complete: false,
      serve_state: "INTEGRITY_HELD",
      held_reason: "1 analyzer(s) did not complete (iam_role)",
    },
  }

  it("canRenderScores is false, which is what gates both setters", () => {
    expect(deriveSummaryIntegrity(HELD_WITH_BRSS).canRenderScores).toBe(false)
  })

  it("the held BRSS object carries no `error` key — the old guard's blind spot", () => {
    expect(HELD_WITH_BRSS.blast_radius_score).not.toHaveProperty("error")
    // ...so `!bs.error` is true and would have admitted it. The new condition
    // is the one that actually excludes it.
    expect(HELD_WITH_BRSS.blast_radius_score.analysis_complete).toBe(false)
  })

  it("Number(avg_health_score) must not be reached — null coerces to 0", () => {
    // system-detail-dashboard guarded with `!== undefined`. null passes that,
    // and Number(null) === 0, so "we don't know" rendered as a health score.
    expect(HELD_WITH_BRSS.avg_health_score).toBeNull()
    expect(HELD_WITH_BRSS.avg_health_score !== undefined).toBe(true)
    expect(Number(HELD_WITH_BRSS.avg_health_score)).toBe(0)
    expect(typeof HELD_WITH_BRSS.avg_health_score === "number").toBe(false)
  })

  it("a READY payload still yields its scores", () => {
    const ok = deriveSummaryIntegrity({
      success: true, serve_state: "READY", analysis_complete: true,
      total: 17, avg_health_score: 71,
    })
    expect(ok.canRenderScores).toBe(true)
  })
})

describe("review fixtures — two holes found in the first cut", () => {
  it("READY + analysis_complete + total:null is NOT authoritative", () => {
    // It derived READY, so isCacheableSummary() cached it and the enforcement
    // score composed from it. The all-clear guard alone did not cover that:
    // it only gated the green state, while scores and the cache took the same
    // payload as trustworthy. A finite total is now part of READY itself.
    const p = { success: true, serve_state: "READY", analysis_complete: true, total: null }
    const i = deriveSummaryIntegrity(p)
    expect(i.state).toBe("NOT_READY")
    expect(i.canRenderScores).toBe(false)
    expect(i.canRenderAllClear).toBe(false)
    expect(isCacheableSummary(p)).toBe(false)
  })

  it("READY + positive total + missing severity breakdown is never all-clear", () => {
    // The card had `canRenderAllClear || chartData.length === 0`. A response
    // with total:17 and no severity split produces an empty chartData, and the
    // OR sent it to the green "0 active findings — all clear" state.
    // Seventeen findings, rendered as none.
    const i = deriveSummaryIntegrity({
      success: true, serve_state: "READY", analysis_complete: true,
      total: 17, // no critical/high/medium/low, no by_severity
    })
    expect(i.state).toBe("READY")
    expect(i.canRenderAllClear).toBe(false)
  })

  it("a finite zero is still all-clear — this is a gate, not a mute", () => {
    const i = deriveSummaryIntegrity({
      success: true, serve_state: "READY", analysis_complete: true, total: 0,
    })
    expect(i.canRenderAllClear).toBe(true)
    expect(isCacheableSummary({
      success: true, serve_state: "READY", analysis_complete: true, total: 0,
    })).toBe(true)
  })

  it("NaN and undefined totals are not finite either", () => {
    for (const total of [NaN, undefined]) {
      const p = { success: true, serve_state: "READY", analysis_complete: true, total }
      expect(deriveSummaryIntegrity(p).state).toBe("NOT_READY")
      expect(isCacheableSummary(p)).toBe(false)
    }
  })
})

describe("cache recovery — a NOT_READY payload must not stick", () => {
  it("isCacheableSummary is the predicate that both blocks the write and evicts on read", () => {
    // useCachedFetch treats an existing entry as a MISS when isCacheable fails
    // (lib/use-cached-fetch.ts). So passing this one predicate does two jobs:
    // it stops NOT_READY being persisted, and it discards an entry written
    // before the predicate existed. That is the recovery path — the card had
    // no isCacheable at all, so a NOT_READY response served during a backend
    // restart kept rendering "Analysis unavailable" after the backend returned
    // READY with 18 findings.
    const during_restart = { serve_state: "NOT_READY", analysis_complete: false, total: null }
    const after_recovery = { success: true, serve_state: "READY", analysis_complete: true, total: 18 }
    expect(isCacheableSummary(during_restart)).toBe(false)  // not written, and evicted on read
    expect(isCacheableSummary(after_recovery)).toBe(true)   // replaces it
  })

  it("the card's own source wires the predicate and a transient retry", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("components/dashboard/v3/severity-donut-card.tsx", "utf8"))
    expect(src).toContain("isCacheable: isCacheableSummary")
    expect(src).toContain("transientRetries")
    // and an escape hatch from the unavailable state
    expect(src).toMatch(/onClick=\{retry\}/)
  })
})

describe("cached READY must not survive a failed refresh", () => {
  // The reverse of the stuck-unavailable bug, and the more dangerous half:
  //   cached READY exists -> refresh 502/503/504 -> useCachedFetch keeps the
  //   cached value -> card renders 18 findings as CURRENT.
  // The hook's error branches only act when data === null, so with cached data
  // showing there is no error, no staleness flag, and nothing for the card to
  // react to. Caching only READY payloads is precisely what makes this unsafe:
  // the retained value is one that claims to be current and complete.
  const readySrc = () =>
    require("node:fs").readFileSync("lib/use-cached-fetch.ts", "utf8")
  const cardSrc = () =>
    require("node:fs").readFileSync("components/dashboard/v3/severity-donut-card.tsx", "utf8")

  it("the hook offers a fail-closed mode and the card opts in", () => {
    expect(readySrc()).toContain("failClosedOnError")
    expect(cardSrc()).toContain("failClosedOnError: true")
  })

  // ─────────────────────────────────────────────────────────────────────
  // The two tests that were here asserted on SOURCE TEXT — the byte offset
  // of `if (failClosedOnError) {` relative to `if (data === null) {`, and
  // that the block contained `clearCachedFetch(cacheKey)`. They passed for
  // the right reason at the time and stopped meaning anything the moment
  // the implementation changed shape, which is exactly the failure mode
  // this repo keeps hitting (PR #684: nine source-inspection tests survived
  // deleting the line under test).
  //
  // The REQUIREMENT they protected is real and unchanged: a cached READY
  // must never be presented as current after a failed refresh. What changed
  // on 2026-08-03 is HOW that is satisfied.
  //
  // Deleting the reading satisfied it, and cost us the dashboard: four
  // backend deploys restarted Render, every feed 504'd, and a read-only
  // executive page erased its own last-known-good view and showed
  // "unavailable" everywhere with no auto-recovery. The data was in Neo4j
  // the whole time.
  //
  // Marking the reading stale satisfies it too, and keeps the screen useful.
  // So: SEMANTIC failure still discards; TRANSPORT failure retains but can
  // never render as current. Both asserted behaviourally below.
  // ─────────────────────────────────────────────────────────────────────

  it("semantic failure (4xx) still discards the cached READY", async () => {
    seedReady()
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 422, json: () => Promise.resolve({}) } as Response),
      ),
    )
    const { result } = renderHook(() =>
      useCachedFetch<unknown>(SUMMARY_URL, {
        cacheKey: SUMMARY_KEY,
        failClosedOnError: true,
      }),
    )
    await waitFor(() => expect(result.current.error).toBe("HTTP 422"))
    expect(result.current.data).toBeNull()
    // Entry cleared, or the stale READY resurrects on the next mount.
    expect(window.localStorage.getItem(`cyntro:swr:${SUMMARY_KEY}`)).toBeNull()
  })

  it("transport failure retains the reading but marks it stale — never current", async () => {
    seedReady()
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 504, json: () => Promise.resolve({}) } as Response),
      ),
    )
    const { result } = renderHook(() =>
      useCachedFetch<unknown>(SUMMARY_URL, {
        cacheKey: SUMMARY_KEY,
        failClosedOnError: true,
      }),
    )
    await waitFor(() => expect(result.current.isStale).toBe(true))

    // Retained — this is the fix.
    expect(result.current.data).not.toBeNull()
    // But it carries an explicit staleness signal, so no consumer can treat
    // it as a current reading. THIS is what replaces deletion as the guard.
    expect(result.current.staleReason).toBe(STALE_BACKEND_RECOVERING)
    expect(result.current.isStale).toBe(true)
  })

  it("with data null the card renders unavailable, not 18", () => {
    // data:null -> the card's `if (!data) return null` / error path, never the
    // READY branch. Proven at the derivation: nothing about a cached payload
    // can make a null-data render authoritative.
    expect(deriveSummaryIntegrity(null).canRenderAllClear).toBe(false)
    expect(deriveSummaryIntegrity(null).canRenderScores).toBe(false)
  })
})
