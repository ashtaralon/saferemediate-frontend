/**
 * AP201 · wiring that the mounted-page tests cannot observe (see use-bounded-auto-retry.test.ts for why): the page
 * hands its background-IAP read to the bounded auto-retry with the documented budget, and nothing else in the page
 * re-arms an unbounded timer on that read. Source-text assertions, the pattern of rail-target-catalog-wiring.test.ts.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8")

describe("attack-paths-v2 background-IAP auto-retry", () => {
  const src = read("components/attack-paths-v2/attack-paths-v2.tsx")

  it("is the bounded hook with the documented budget (3 retries, 8 s apart, transport only)", () => {
    expect(src).toContain('import { useBoundedAutoRetry } from "./use-bounded-auto-retry"')
    expect(src).toContain("const IAP_AUTO_RETRY_LIMIT = 3")
    expect(src).toContain("const IAP_AUTO_RETRY_DELAY_MS = 8000")
    const call = src.slice(src.indexOf("useBoundedAutoRetry({"), src.indexOf("})", src.indexOf("useBoundedAutoRetry({")))
    expect(call).toContain("error: _iapBackgroundError,")
    expect(call).toContain("data: rawData,")
    expect(call).toContain("retry: retryFullIap,")
    expect(call).toContain("limit: IAP_AUTO_RETRY_LIMIT,")
    expect(call).toContain("delayMs: IAP_AUTO_RETRY_DELAY_MS,")
    expect(call).toContain("isTransient: isIapTransportError,")
  })

  it("has no other timer-driven re-read of the background IAP", () => {
    // The pre-AP201 loop: a setTimeout(() => retryFullIap(), 8000) inside a useEffect. Only the user's Retry buttons
    // and the hook may call retryFullIap now.
    expect(src).not.toMatch(/setTimeout\(\(\) => \{?\s*retryFullIap\(\)/)
  })

  it("the jewel picker and the rail share ONE authority predicate for the served catalog (M14)", () => {
    // Before: the picker took any non-null 200 body as the catalog, so an unreadable body listed zero jewels and
    // suppressed the IAP fallback while the rail said the catalog had not answered.
    expect(src).toContain("serveJewels: serveJewelsOk ? liteJewels : null,")
    expect(src).not.toContain("serveJewels: jewelsRaw != null ? liteJewels : null,")
  })
})

describe("attack-path-panel lite jewel", () => {
  const src = read("components/attack-paths-v2/attack-path-panel.tsx")
  it("takes its severity from the payload's breakdown or none — never a default HIGH (I3)", () => {
    expect(src).not.toContain('severity: "HIGH",')
    expect(src).toContain('value === "CRITICAL" || value === "HIGH" || value === "MEDIUM" || value === "LOW" ? value : null')
    expect(src).not.toContain("highest_risk_score: payload.severity?.overall_score ?? 0")
  })
})
