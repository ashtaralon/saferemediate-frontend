/// <reference types="vitest/globals" />
/**
 * A proxy budget must be longer than the work it is waiting for.
 *
 * The Resource Risk tab hard-failed on every cold Render start. Measured
 * against production 2026-08-01, `/api/least-privilege/issues` answers in
 * 0.23s warm and 32.1s cold. The proxy budget was 25s — shorter than the
 * work — so a cold start could never succeed.
 *
 * The retry loop could not rescue it either, because each attempt used the
 * SAME 25s budget: three attempts, ~78s of spinner, then a hard error, on a
 * backend that was working fine and merely cold. Retrying a timeout with an
 * unchanged timeout is a control that cannot fire.
 *
 * These read the route sources rather than importing them: Next route modules
 * pull server-only deps, and the values under test are module-level constants
 * that a unit test would not otherwise observe.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const ISSUES = 'app/api/proxy/least-privilege/issues/route.ts'
const BY_SYSTEM = 'app/api/proxy/resource-risk/by-system/[system]/route.ts'
const SUMMARY = 'app/api/proxy/issues-summary/route.ts'
const TAB = 'components/LeastPrivilegeTab.tsx'

function abortMs(src: string): number {
  const m = src.match(/controller\.abort\(\),\s*([0-9_]+)/)
  if (!m) throw new Error('no controller.abort() timeout found')
  return Number(m[1].replace(/_/g, ''))
}

function maxDurationMs(src: string): number {
  const m = src.match(/export const maxDuration\s*=\s*(\d+)/)
  if (!m) throw new Error('no maxDuration found')
  return Number(m[1]) * 1000
}

/** Observed cold response time for the issues endpoint, production. */
const MEASURED_COLD_MS = 32_100

describe('the render-blocking issues proxy', () => {
  const src = read(ISSUES)

  it('budgets more time than a measured cold start needs', () => {
    expect(abortMs(src)).toBeGreaterThan(MEASURED_COLD_MS)
  })

  it('uses the house cold-build budget of 55s', () => {
    // Same value as TOPOLOGY_RISK_PROXY_TIMEOUT_MS. See
    // __tests__/snapshot-proxy-timeout.test.ts.
    expect(abortMs(src)).toBe(55_000)
  })

  it('aborts before Vercel kills the function, so the catch can run', () => {
    // An abort at or after maxDuration never fires: the platform terminates
    // first and the stale-cache fallback in the catch block is dead code.
    expect(abortMs(src)).toBeLessThan(maxDurationMs(src))
  })
})

describe('a budget is short only when something visible is waiting on it', () => {
  // The distinction that matters is NOT "is this fetch optional" — it is
  // "does a rendered element block on the response". Getting that wrong once
  // already cost the Blast Radius card (see below).

  it('resource-risk/by-system stays fast-fail', () => {
    // Backs the Trust Exposure panel, which renders its OWN spinner while
    // waiting. A 55s abort here was tried and reverted for making that panel
    // feel hung while Render was 502ing. The short budget is load-bearing.
    expect(abortMs(read(BY_SYSTEM))).toBe(12_000)
  })

  it('issues-summary gets the full cold budget', () => {
    // Was 20s, defended as "optional enrichment must not pin the tab". Wrong
    // reasoning: LeastPrivilegeTab fetches this in a detached async IIFE that
    // is explicitly independent of the LP list, so it cannot pin anything at
    // any budget — the card just reads "—" until the score lands.
    //
    // The short budget therefore bought nothing and cost the feature: ~21.8s
    // cold against a 20s cap meant every cold load 504'd and "Blast Radius ·
    // IAM" silently degraded to "—", observed live in production QA.
    expect(abortMs(read(SUMMARY))).toBe(55_000)
  })

  it('issues-summary still aborts before the platform kills it', () => {
    const src = read(SUMMARY)
    expect(abortMs(src)).toBeLessThan(maxDurationMs(src))
  })
})

describe('the caller retries what a cold backend recovers from', () => {
  const src = read(TAB)

  it('retries both 503 and 504', () => {
    // 504 was briefly excluded on the reasoning that "retrying an identical
    // budget cannot succeed". That holds only if nothing changes between
    // attempts — and here something does: the first request WAKES the
    // backend. A cold dyno answers /health in ~95s, so the attempt that times
    // out is also the attempt that warms it.
    //
    // Observed in production: the tab hard-failed with "Backend 504" while its
    // own error card read "Retrying often succeeds once it has warmed up", and
    // clicking Retry loaded it. The loop should not need a human for that.
    const m = src.match(/const retryable\s*=\s*([^\n]+)/)
    expect(m).not.toBeNull()
    const expr = (m as RegExpMatchArray)[1]
    expect(expr).toContain('503')
    expect(expr).toContain('504')
  })

  it('agrees with the Trust Exposure lens on the same surface', () => {
    // Both panels render on the Resource Risk tab and both hit a cold
    // backend at the same moment. Disagreeing about whether that is fatal is
    // how one panel shows an error next to another that recovered.
    const lens = read('components/trust-dormancy-lens.tsx')
    const lensExpr = (lens.match(/const retryable\s*=\s*([^\n]+)/) as RegExpMatchArray)[1]
    expect(lensExpr).toContain('503')
    expect(lensExpr).toContain('504')
  })

  it('keeps the worst-case wait bounded', () => {
    const m = src.match(/const retryDelaysMs\s*=\s*\[([^\]]*)\]/)
    expect(m).not.toBeNull()
    const delays = (m as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim()).filter(Boolean).map(Number)
    const attempts = delays.length + 1
    const worstCase = attempts * 55_000 + delays.reduce((a, b) => a + b, 0)
    // Pre-fix: 3 attempts x 25s + 3.5s = 78.5s, and GUARANTEED to fail on a
    // cold backend. The point is not that this number is small, but that the
    // success path is now reachable well before it.
    expect(worstCase).toBeLessThanOrEqual(135_000)
    expect(attempts).toBeLessThanOrEqual(2)
  })

  it('does not immediately overlap a timed-out analyzer sweep', () => {
    const m = src.match(/const retryDelaysMs\s*=\s*\[([^\]]*)\]/)
    expect(m).not.toBeNull()
    const timeoutDelay = Number((m as RegExpMatchArray)[1].trim())
    // Production evidence: the upstream completed about 20s after the proxy's
    // 55s timeout. Waiting lets that request fill the backend cache instead of
    // starting another eight-analyzer sweep while the first is still running.
    expect(timeoutDelay).toBeGreaterThanOrEqual(20_000)
  })
})
