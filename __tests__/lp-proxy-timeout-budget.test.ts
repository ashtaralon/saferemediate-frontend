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

describe('the deliberately-short siblings stay short', () => {
  // Pinned so a later "make the timeouts consistent" pass cannot quietly
  // undo them. Both numbers are load-bearing and were chosen against real
  // symptoms; consistency across files is not a goal, matching the work is.

  it('resource-risk/by-system stays fast-fail', () => {
    // Indexed HAS_RISK read, sub-second warm. A 55s abort here was tried and
    // reverted for making Trust Exposure feel hung while Render 502'd.
    expect(abortMs(read(BY_SYSTEM))).toBe(12_000)
  })

  it('issues-summary stays fast-fail', () => {
    // Optional BRSS enrichment — must never pin the tab on a slow backend.
    expect(abortMs(read(SUMMARY))).toBe(20_000)
  })
})

describe('the caller does not retry its own exhausted budget', () => {
  const src = read(TAB)

  it('retries 503 but not 504', () => {
    const m = src.match(/const retryable\s*=\s*([^\n]+)/)
    expect(m).not.toBeNull()
    const expr = (m as RegExpMatchArray)[1]
    expect(expr).toContain('503')
    // 504 = our own 55s budget ran out. The backend is not going to answer a
    // second identical request any faster, and retrying multiplies the wait.
    expect(expr).not.toContain('504')
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
    expect(worstCase).toBeLessThanOrEqual(120_000)
    expect(attempts).toBeLessThanOrEqual(2)
  })
})
