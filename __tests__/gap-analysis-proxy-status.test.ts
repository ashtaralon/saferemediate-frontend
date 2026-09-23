/**
 * The role gap-analysis proxy keeps a denial, an unavailable dependency, and
 * a local timeout apart.
 *
 * Observed 2026-09-23: the authenticated Review returned 401
 * DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE in 129ms. An earlier screenshot
 * showed 504 for the same path. 504 is only the local 55s abort.
 */
import { describe, expect, it } from "vitest"

import { fromCaughtError, reviewProxyStatus } from "@/lib/server/proxy-error"

describe("role gap-analysis proxy status", () => {
  it("keeps a 401 denial and a 403 scope refusal", () => {
    expect(reviewProxyStatus(401)).toBe(401)
    expect(reviewProxyStatus(403)).toBe(403)
  })

  it("keeps a 503 unavailable and does not call it a denial or a timeout", () => {
    expect(reviewProxyStatus(503)).toBe(503)
    expect(reviewProxyStatus(503)).not.toBe(401)
    expect(reviewProxyStatus(503)).not.toBe(504)
  })

  it("collapses other backend 5xx to 502", () => {
    expect(reviewProxyStatus(500)).toBe(502)
    expect(reviewProxyStatus(502)).toBe(502)
  })

  it("maps a local abort to 504 and leaves a denial untouched", () => {
    const aborted = new Error("The operation was aborted")
    aborted.name = "AbortError"
    expect(fromCaughtError(aborted).status).toBe(504)
    expect(fromCaughtError(new Error("connect ECONNREFUSED")).status).toBe(503)
    expect(reviewProxyStatus(401)).not.toBe(504)
  })
})
