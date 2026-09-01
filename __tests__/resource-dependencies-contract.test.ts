/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest"

import { isResourceDependenciesResponse } from "@/lib/resource-dependencies"

/**
 * The dossier throws on a body this rejects, which lands the Dependencies tab
 * on its Unavailable state. So what this guard admits, the tab renders — and a
 * body it wrongly admits is not a crash but something worse: a fabricated
 * reading of the graph with nothing on screen saying so.
 *
 * `counts: {}` is the case that matters. It passes a `Boolean(counts)` check,
 * reaches `payload?.counts.by_perspective ?? { USES: 0, USED_BY: 0, PEER: 0 }`
 * and prints "0 providers used" — a number no collector produced, presented as
 * if it were one. Rule 1 forbids exactly that.
 */
describe("isResourceDependenciesResponse", () => {
  const complete = {
    schema: "resource-dependencies/v1",
    page: { rows: [], returned: 0, total: 0, offset: 0, next_cursor: null },
    counts: { by_perspective: { USES: 0, USED_BY: 0, PEER: 0 } },
  }

  it("admits a contract-complete response", () => {
    // Negative control. Without this, a guard that rejected everything would
    // pass every other assertion in this file.
    expect(isResourceDependenciesResponse(complete)).toBe(true)
  })

  it("admits an authoritative empty projection", () => {
    // No rows is a real answer and must stay distinguishable from a failure.
    expect(isResourceDependenciesResponse({ ...complete, page: { ...complete.page, rows: [] } })).toBe(true)
  })

  it("rejects counts present but empty, rather than reporting zeros", () => {
    expect(isResourceDependenciesResponse({ ...complete, counts: {} })).toBe(false)
  })

  it("rejects by_perspective of the wrong shape", () => {
    expect(isResourceDependenciesResponse({ ...complete, counts: { by_perspective: [] } })).toBe(false)
    expect(isResourceDependenciesResponse({ ...complete, counts: { by_perspective: null } })).toBe(false)
  })

  it("rejects a page with no rows array", () => {
    expect(isResourceDependenciesResponse({ ...complete, page: {} })).toBe(false)
    expect(isResourceDependenciesResponse({ ...complete, page: { rows: null } })).toBe(false)
  })

  it("still rejects what it rejected before", () => {
    expect(isResourceDependenciesResponse({ schema: "resource-dependencies/v1", page: { rows: [] } })).toBe(false)
    expect(isResourceDependenciesResponse({ ...complete, schema: "other/v9" })).toBe(false)
    expect(isResourceDependenciesResponse(null)).toBe(false)
    expect(isResourceDependenciesResponse("a string")).toBe(false)
    // An error envelope answered with 200 is not a dependency projection.
    expect(isResourceDependenciesResponse({ detail: "Graph driver not initialized" })).toBe(false)
  })
})
