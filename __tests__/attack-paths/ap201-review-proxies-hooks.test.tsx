/**
 * AP201 review (Alon, 2026-10-17) · S10: with the proxies passing typed bodies through (B3), the convergence summary and
 * lateral-reach hooks name a typed refusal in the server's words (lib/attack-paths/held-route-message) instead of the
 * proxy's generic `error` or a bare `HTTP 422`.
 *
 * Composed: hook -> the REAL Next proxy route -> stubbed backend `fetch`. Bodies are the backend's typed shapes
 * (lib/semantic-hold producers); CONSTRUCTED. The proxy cache is an in-memory map.
 */
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/proxy-cache", () => {
  const store = new Map<string, unknown>()
  return {
    getCached: (key: string) => (store.has(key) ? store.get(key) : null),
    getStaleCached: () => null,
    setCached: (key: string, data: unknown) => { store.set(key, data) },
    clearCached: (key: string) => { store.delete(key) },
    TTL_FAST: 30_000,
    TTL_STD: 60_000,
    TTL_SLOW: 300_000,
  }
})

import { GET as summaryProxy } from "@/app/api/proxy/attack-paths/[systemName]/by-crown-jewel/summary/route"
import { GET as lateralProxy } from "@/app/api/proxy/attack-paths/[systemName]/jewel-lateral-reach/route"
import { useCrownJewelConvergence } from "@/lib/attack-paths/use-crown-jewel-convergence"
import { useLateralReach } from "@/components/attack-paths-v2/use-lateral-reach"

const SYSTEM = "Orders"
const SCOPE_REQUIRED = { detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are registered; name one with account_id" } }
const MISMATCH = { detail: { code: "INVENTORY_SCOPE_MISMATCH", reason: "CLAIM_OUTSIDE_SERVER_SCOPE" } }
const ROUTE_HELD = { detail: { code: "SERVING_ROUTE_HELD", reason: "ROUTE_NOT_CERTIFIED" } }
const JEWEL = { id: "arn:aws:s3:::bucket-1", canonical_id: "arn:aws:s3:::bucket-1", name: "bucket-1", type: "S3Bucket",
  severity: "HIGH", path_count: 2, highest_risk_score: 80, is_internet_exposed: false, data_classification: null, target_state: "observed" }

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

/** The browser's fetch: `/api/proxy/...` runs the real route handler; anything else is the backend answering `backend`. */
function serve(backend: { status: number; body: unknown }) {
  const f = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    const params = { params: Promise.resolve({ systemName: SYSTEM }) }
    if (url.startsWith(`/api/proxy/attack-paths/${SYSTEM}/by-crown-jewel/summary`)) {
      return summaryProxy(new NextRequest(`http://fe.local${url}`), params)
    }
    if (url.startsWith(`/api/proxy/attack-paths/${SYSTEM}/jewel-lateral-reach`)) {
      return lateralProxy(new NextRequest(`http://fe.local${url}`), params)
    }
    if (url.startsWith("/api/proxy/")) return respond(404, { error: "not stubbed" })
    return respond(backend.status, backend.body)
  })
  vi.stubGlobal("fetch", f)
  return f
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("S10 · the convergence summary names a typed refusal", () => {
  it.each([
    ["422 ACCOUNT_SCOPE_REQUIRED", 422, SCOPE_REQUIRED, /^Attack-path summary: Several workload accounts are registered/],
    ["403 INVENTORY_SCOPE_MISMATCH", 403, MISMATCH, /^Attack-path summary: The selected account is not in this install's scope$/],
  ])("%s: the server's words, settled, never 'HTTP 4xx' or the proxy wrapper", async (_n, status, body, words) => {
    serve({ status, body })
    const { result, unmount } = renderHook(() => useCrownJewelConvergence(SYSTEM, JEWEL as never))
    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(result.current.error).toMatch(words)
    expect(result.current.error).not.toMatch(/HTTP \d|Failed to load/)
    expect(result.current.retrying).toBe(false)
    unmount()
  })
})

describe("S10 · lateral reach names a typed refusal", () => {
  const target = { systemName: SYSTEM, jewelRef: "arn:aws:s3:::bucket-1", jewelType: "S3Bucket" }

  it.each([
    ["422 ACCOUNT_SCOPE_REQUIRED", 422, SCOPE_REQUIRED, /^Lateral reach: Several workload accounts are registered/],
    ["503 SERVING_ROUTE_HELD", 503, ROUTE_HELD,
      /^Lateral reach is not available on this install \(SERVING_ROUTE_HELD: ROUTE_NOT_CERTIFIED\)\. This is not a result\.$/],
  ])("%s: the server's words, never 'http_4xx' or 'lateral_reach_unavailable'", async (_n, status, body, words) => {
    serve({ status, body })
    const { result, unmount } = renderHook(() => useLateralReach(target))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
    expect(result.current.error).toMatch(words)
    unmount()
  })

  it("CONTROL: an untyped failure keeps the proxy's error slug", async () => {
    serve({ status: 500, body: "not json" })
    const { result, unmount } = renderHook(() => useLateralReach(target))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe("lateral_reach_unavailable")
    unmount()
  })
})
