/// <reference types="vitest/globals" />
/**
 * Attack Paths V3 plan §11 — retry budgets.
 *
 * The jewel rail auto-retried the by-crown-jewel summary four times at 55s
 * each, and every attack-paths-v2 useRetryFetch card retried twice with no
 * per-attempt timeout. Against a cold Render worker that was never going to
 * answer, that is minutes of spinner before the honest "warming up — Retry"
 * state. Budget: ONE auto-retry, 15s per attempt.
 *
 * Like __tests__/lp-proxy-timeout-budget.test.ts these read the sources:
 * the values are module-level constants and hook options a unit test would
 * not otherwise observe.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const HOOK = "lib/attack-paths/use-crown-jewel-convergence.ts"
const RAIL = "components/attack-paths-v2/attack-paths-v2.tsx"
const RETRY_FETCH_SITES = [
  "components/attack-paths-v2/attack-path-panel.tsx",
  "components/attack-paths-v2/lateral-movement-panel.tsx",
  "components/attack-paths-v2/exfil-view-v4.tsx",
  "components/attack-paths-v2/use-zoom0-exfil.ts",
  "components/attack-paths-v2/attack-paths-v2.tsx",
]

function constant(src: string, name: string): number {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([0-9_]+)`))
  if (!m) throw new Error(`no ${name} found`)
  return Number(m[1].replace(/_/g, ""))
}

describe("the crown-jewel summary hook", () => {
  const src = read(HOOK)

  it("auto-retries once", () => {
    expect(constant(src, "MAX_AUTO_RETRIES")).toBe(1)
  })

  it("aborts each attempt at 15s", () => {
    expect(constant(src, "SUMMARY_ATTEMPT_TIMEOUT_MS")).toBe(15_000)
    // The abort must be armed with the constant, not a stray literal.
    expect(src).toMatch(/SUMMARY_ATTEMPT_TIMEOUT_MS,\s*\n\s*\)/)
    expect(src).not.toContain("55_000")
  })

  it("keeps the honest warming-up copy", () => {
    expect(src).toContain("Backend warming up — retrying…")
    expect(src).toContain("backend may be cold. Hit Retry.")
  })

  it("exports the attempt budget so the rail gate cannot pin a stale number", () => {
    expect(src).toContain("export const SUMMARY_MAX_ATTEMPTS = MAX_AUTO_RETRIES + 1")
    const rail = read(RAIL)
    expect(rail).toContain("jewelSummaryAttempts >= SUMMARY_MAX_ATTEMPTS")
    // A literal ">= 3" here would never fire under a 2-attempt budget and the
    // hard-error card would silently disappear.
    expect(rail).not.toMatch(/jewelSummaryAttempts >= \d/)
  })
})

describe("every attack-paths-v2 useRetryFetch card", () => {
  for (const site of RETRY_FETCH_SITES) {
    it(`${site} retries once with a 15s per-attempt timeout`, () => {
      const src = read(site)
      // Each call ends with its options object: `})` or `},\n)` — match the
      // object's closing brace up to the call's closing paren, not beyond.
      const calls = src.match(/useRetryFetch<[^>]*>\([\s\S]*?\}\s*,?\s*\)/g) ?? []
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) {
        expect(call).toContain("maxRetries: 1,")
        expect(call).toContain("timeoutMs: 15_000,")
        expect(call).not.toContain("maxRetries: 2")
      }
    })
  }
})
