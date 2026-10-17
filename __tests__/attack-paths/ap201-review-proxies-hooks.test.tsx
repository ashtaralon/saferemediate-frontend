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

// Review S10 (T-2): the page's selected account, as useOptionalAccountScope holds it; null = no provider (the default).
const scope = vi.hoisted(() => ({ value: null as { customerId: string | null; accountId: string } | null }))
vi.mock("@/lib/account-scope-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account-scope-context")>()),
  useOptionalAccountScope: () => scope.value,
}))

import { GET as summaryProxy } from "@/app/api/proxy/attack-paths/[systemName]/by-crown-jewel/summary/route"
import { GET as lateralProxy } from "@/app/api/proxy/attack-paths/[systemName]/jewel-lateral-reach/route"
import { useCrownJewelConvergence } from "@/lib/attack-paths/use-crown-jewel-convergence"
import { useLateralReach } from "@/components/attack-paths-v2/use-lateral-reach"
import { heldRouteAccountSelection, heldRouteMessage } from "@/lib/attack-paths/held-route-message"

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
  scope.value = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("S10 · the convergence summary names a typed refusal", () => {
  it.each([
    // T-2: no account is selected here, and the line says so.
    ["422 ACCOUNT_SCOPE_REQUIRED", 422, SCOPE_REQUIRED, /^Attack-path summary: No account is selected — several workload accounts are registered/],
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
    ["422 ACCOUNT_SCOPE_REQUIRED", 422, SCOPE_REQUIRED, /^Lateral reach: No account is selected — several workload accounts are registered/],
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

describe("S10 (T-2) · ACCOUNT_SCOPE_REQUIRED is worded for the page's account selection", () => {
  const ACCOUNT = "123456789012"
  const target = { systemName: SYSTEM, jewelRef: "arn:aws:s3:::bucket-1", jewelType: "S3Bucket" }

  it("an account IS selected: the line names it and says it did not reach the read (summary and lateral reach)", async () => {
    scope.value = { customerId: null, accountId: ACCOUNT }
    const f = serve({ status: 422, body: SCOPE_REQUIRED })
    const convergence = renderHook(() => useCrownJewelConvergence(SYSTEM, JEWEL as never))
    await waitFor(() => expect(convergence.result.current.settled).toBe(true))
    expect(convergence.result.current.error).toBe(
      `Attack-path summary: Account ${ACCOUNT} was named for this read, but the server received no account `
      + "(ACCOUNT_SCOPE_REQUIRED) — the account did not reach this read")
    // the read did carry the selection (the 422 here stands for it being lost on the way)
    expect(f.mock.calls.some(([u]) => String(u).includes(`account_id=${ACCOUNT}`))).toBe(true)
    convergence.unmount()
    const lateral = renderHook(() => useLateralReach(target))
    await waitFor(() => expect(lateral.result.current.loading).toBe(false))
    expect(lateral.result.current.error).toMatch(new RegExp(`^Lateral reach: Account ${ACCOUNT} was named for this read`))
    lateral.unmount()
  })

  it("the formatter's default call shape is unchanged: no selection, the established line", () => {
    expect(heldRouteMessage(SCOPE_REQUIRED, 422, "Business impact")).toBe(
      "Business impact: Several workload accounts are registered — this view does not read one selected account, so it cannot show this")
    expect(heldRouteMessage(SCOPE_REQUIRED, 422, "Business impact", { selectedAccount: null })).toBe(
      "Business impact: No account is selected — several workload accounts are registered; choose one account in the scope bar to see this")
    // only ACCOUNT_SCOPE_REQUIRED reads the selection
    expect(heldRouteMessage(MISMATCH, 403, "Damage scope", { selectedAccount: ACCOUNT })).toBe(
      "Damage scope: The selected account is not in this install's scope")
  })

  it("the named account is the one the read's query carries: a system key's own account wins", () => {
    expect(heldRouteAccountSelection({ customerId: null, accountId: ACCOUNT })).toEqual({ selectedAccount: ACCOUNT })
    expect(heldRouteAccountSelection({ customerId: null, accountId: ACCOUNT, systemKey: "k1", systemAccountId: "210987654321" }))
      .toEqual({ selectedAccount: "210987654321" })
    expect(heldRouteAccountSelection({ customerId: null, accountId: null })).toEqual({ selectedAccount: null })
  })
})
