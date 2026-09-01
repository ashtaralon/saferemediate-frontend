/**
 * A structured backend refusal must survive the proxy and reach the operator.
 *
 * Observed 2026-08-24: the sync-all serving-tier 503 returns
 * `{detail: {error, reason, what_to_do}}`. The reingest proxy read it with a
 * bare `errorData.error || errorData.detail || ...`, which yields the OBJECT,
 * so the UI rendered "[object Object]" — and systems-view then discarded even
 * that, overwriting any 503 with a canned "Neptune may not be configured".
 * The operator was sent to the wrong place: nothing is misconfigured, the tier
 * is read-only by design and the projector worker is what refreshes the graph.
 */
import { describe, expect, it } from "vitest"

import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"

const SYNC_ALL_503 = {
  detail: {
    error: "sync_all_unavailable_on_serving_tier",
    reason:
      "sync-all writes the graph in-process, and this is a Neptune serving " +
      "tier whose graph credentials are read-only by design " +
      "(CYNTRO_PROJECTOR_WORKER is not true).",
    graph_driver: "neptune",
    tenant_id: "testbed-webshop",
    what_to_do:
      "Collection for a Neptune tenant does not run here. Evidence is " +
      "acquired out-of-band and materialized by the projector worker; run " +
      "the projector worker to refresh the graph.",
  },
}

describe("coerceProxyErrorMessage — structured refusals", () => {
  it("surfaces the reason rather than the object", () => {
    const message = coerceProxyErrorMessage(SYNC_ALL_503, "Backend returned 503")
    expect(message).not.toBe("[object Object]")
    expect(message).not.toContain("{")
    expect(message).toContain("read-only by design")
  })

  it("keeps the actionable half, not just the diagnosis", () => {
    // A message that says what broke but not what to do sends the operator
    // back to guessing — which is what the canned string did.
    expect(coerceProxyErrorMessage(SYNC_ALL_503, "fb")).toContain(
      "projector worker",
    )
  })

  it("never leads with a machine slug when guidance exists", () => {
    // api/v2_sync.py's 503 carries `error` (a slug) + `hint`, no `reason`.
    const v2 = {
      detail: {
        error: "sync_dispatch_not_configured",
        hint: "the serving tier needs the queue URLs and collection identity to enqueue",
      },
    }
    const message = coerceProxyErrorMessage(v2, "fb")
    expect(message).not.toMatch(/^sync_dispatch_not_configured/)
    expect(message).toContain("queue URLs")
  })

  it("still returns a lone slug when there is nothing better", () => {
    expect(coerceProxyErrorMessage({ detail: { error: "nope" } }, "fb")).toBe("nope")
  })
})

describe("coerceProxyErrorMessage — existing shapes are unchanged", () => {
  it.each([
    ["string detail", { detail: "boom" }, "boom"],
    ["validation array", { detail: [{ msg: "field required" }, { msg: "bad type" }] }, "field required; bad type"],
    ["top-level error string", { error: "nope" }, "nope"],
    ["object with no human key", { detail: { a: 1 } }, '{"a":1}'],
    ["code fallback", { code: "E_NOPE" }, "E_NOPE"],
    ["empty body", {}, "fb"],
    ["null body", null, "fb"],
  ])("%s", (_label, body, expected) => {
    expect(coerceProxyErrorMessage(body, "fb")).toBe(expected)
  })
})

describe("coerceProxyErrorMessage — upstream HTML failures", () => {
  it("never leaks a complete Render error document into operator UI", () => {
    const html = '<!DOCTYPE html><html><head><title>502</title></head><body>Bad Gateway</body></html>'
    expect(coerceProxyErrorMessage(null, html)).toBe("Backend temporarily unavailable")
    expect(coerceProxyErrorMessage({ detail: html }, "Backend returned 502")).toBe(
      "Backend returned 502",
    )
  })
})
