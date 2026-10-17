/**
 * AP201 review (Alon, 2026-10-17) · B3 + S1 (proxy half).
 *
 * B3: the summary / targets / detail / jewel-lateral-reach proxies pass a TYPED server answer (a scope refusal, a held
 * route, a reader failure, any 4xx with a `detail.code`) through with its own status and body, `no-store`, never cached
 * -- the report proxy's rule (lib/server/proxy-error typedBackendAnswer). A 200 hold is no-store and never cached either.
 * S1: the four held readers (closure-preview, damage-scope, permission-cut-plan, identity lateral-moves) forward the R11
 * claims, and the ones that cache key their cache by them.
 *
 * Bodies are the backend's typed shapes (lib/semantic-hold producers); CONSTRUCTED. Real: the Next route handlers.
 * Stubbed: upstream `fetch` (recorded) and the proxy cache (in memory, with a separate stale map).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/proxy-cache", () => {
  const store = new Map<string, unknown>()
  const stale = new Map<string, unknown>()
  return {
    __store: store,
    __stale: stale,
    getCached: (key: string) => (store.has(key) ? store.get(key) : null),
    getStaleCached: (key: string) => (stale.has(key) ? stale.get(key) : null),
    setCached: (key: string, data: unknown) => { store.set(key, data) },
    clearCached: (key: string) => { store.delete(key) },
    TTL_FAST: 30_000,
    TTL_STD: 60_000,
    TTL_SLOW: 300_000,
  }
})

import { GET as targets } from "@/app/api/proxy/attack-paths/[systemName]/targets/route"
import { GET as summary } from "@/app/api/proxy/attack-paths/[systemName]/by-crown-jewel/summary/route"
import { GET as detail } from "@/app/api/proxy/attack-paths/[systemName]/by-crown-jewel/detail/route"
import { GET as lateral } from "@/app/api/proxy/attack-paths/[systemName]/jewel-lateral-reach/route"
import { GET as closure } from "@/app/api/proxy/attack-paths/path/[pathId]/closure-preview/route"
import { GET as damage } from "@/app/api/proxy/attack-paths/[systemName]/path/[pathId]/node/[nodeId]/damage-scope/route"
import { POST as cutPlan } from "@/app/api/proxy/attack-paths/[systemName]/permission-cut-plan/route"
import { GET as moves } from "@/app/api/proxy/identity-attack-paths/[systemName]/identity/[identityId]/lateral-moves/route"

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
const h = (fn: unknown): Handler => fn as Handler

const SYSTEM = "payments"
const JEWEL = "arn:aws:s3:::acme-data"
const SCOPE_REQUIRED = { detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are registered; name one with account_id" } }
const MISMATCH = { detail: { code: "INVENTORY_SCOPE_MISMATCH", reason: "CLAIM_OUTSIDE_SERVER_SCOPE" } }
const ROUTE_HELD = { detail: { code: "SERVING_ROUTE_HELD", reason: "ROUTE_NOT_CERTIFIED" } }
const READER_DOWN = { detail: { code: "SEMANTIC_READ_UNAVAILABLE", reason: "READER_ERROR" } }
const HOLD_200 = { semantic_status: "not_recorded", hold_reason: "JEWEL_NOT_IN_IAP_PUBLICATION" }

const respond = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

let answer: () => Response
let upstream: ReturnType<typeof vi.fn>
let store: Map<string, unknown>
let stale: Map<string, unknown>

beforeEach(async () => {
  const cache = (await import("@/lib/server/proxy-cache")) as unknown as { __store: Map<string, unknown>; __stale: Map<string, unknown> }
  store = cache.__store
  stale = cache.__stale
  store.clear()
  stale.clear()
  answer = () => respond(200, {})
  upstream = vi.fn(async () => answer())
  vi.stubGlobal("fetch", upstream)
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const call = (handler: Handler, path: string, params: Record<string, string>, method = "GET") =>
  handler(new NextRequest(`http://fe.local${path}`, { method }), { params: Promise.resolve(params) })
const upstreamUrls = () => upstream.mock.calls.map((c) => String(c[0]))

// ── B3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** (label, handler, proxy path, params, has a stale fallback) */
const TYPED_PROXIES: Array<[string, Handler, string, Record<string, string>, boolean]> = [
  ["by-crown-jewel/summary", h(summary), `/api/proxy/attack-paths/${SYSTEM}/by-crown-jewel/summary?cj_arn=${encodeURIComponent(JEWEL)}`, { systemName: SYSTEM }, true],
  ["targets", h(targets), `/api/proxy/attack-paths/${SYSTEM}/targets`, { systemName: SYSTEM }, true],
  ["by-crown-jewel/detail", h(detail), `/api/proxy/attack-paths/${SYSTEM}/by-crown-jewel/detail?cj_arn=${encodeURIComponent(JEWEL)}&path_id=p1`, { systemName: SYSTEM }, false],
  ["jewel-lateral-reach", h(lateral), `/api/proxy/attack-paths/${SYSTEM}/jewel-lateral-reach?jewel_ref=${encodeURIComponent(JEWEL)}&jewel_type=S3Bucket`, { systemName: SYSTEM }, false],
]

describe.each(TYPED_PROXIES)("B3 · %s", (_label, handler, path, params, hasStale) => {
  it.each([
    ["422 ACCOUNT_SCOPE_REQUIRED", 422, SCOPE_REQUIRED],
    ["403 INVENTORY_SCOPE_MISMATCH", 403, MISMATCH],
    ["503 SERVING_ROUTE_HELD", 503, ROUTE_HELD],
    ["409 with another typed code", 409, { detail: { code: "PATH_SUPERSEDED", reason: "newer generation" } }],
  ])("passes a %s through: its own status and body, no-store, never cached", async (_name, status, body) => {
    answer = () => respond(status, body)
    const res = await call(handler, path, params)
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual(body)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(res.headers.get("X-Cache")).toBe("BYPASS-TYPED")
    expect(store.size).toBe(0)
  })

  it("a 200 hold is passed through no-store and never cached", async () => {
    answer = () => respond(200, HOLD_200)
    const res = await call(handler, path, params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(HOLD_200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(store.size).toBe(0)
  })

  it("an untyped non-2xx answers as before (no raw body relayed typed)", async () => {
    answer = () => new Response("<html>bad gateway</html>", { status: 500 })
    const res = await call(handler, path, params)
    expect(res.headers.get("X-Cache")).not.toBe("BYPASS-TYPED")
    expect((await res.json()).error).toEqual(expect.any(String))
  })

  if (hasStale) {
    it("a refusal (SERVING_ROUTE_HELD) is never masked by a stale serve; a reader failure may still serve last-good", async () => {
      // Seed last-good under the proxy's own key by letting one good answer through, then move it to the stale map.
      answer = () => respond(200, { serve_state: "READY", paths: [{ path_id: "p1" }], targets: [{ target_id: JEWEL }] })
      await call(handler, path, params)
      expect(store.size).toBe(1)
      for (const [k, v] of store) stale.set(k, v)
      store.clear()

      answer = () => respond(503, ROUTE_HELD)
      const refused = await call(handler, path, params)
      expect([refused.status, await refused.json()]).toEqual([503, ROUTE_HELD])

      answer = () => respond(503, READER_DOWN)
      const lastGood = await call(handler, path, params)
      expect(lastGood.headers.get("X-Cache")).toBe("STALE")
      expect((await lastGood.json()).fromStaleCache).toBe(true)

      stale.clear()
      const noLastGood = await call(handler, path, params)
      expect([noLastGood.status, await noLastGood.json()]).toEqual([503, READER_DOWN])
      expect(store.size).toBe(0)
    })
  }
})

// ── S1 (proxy half) ────────────────────────────────────────────────────────────────────────────────────────────────

const PATH_ID = "a".repeat(64)
const ROLE = "arn:aws:iam::111111111111:role/app"
const CLAIMS = "customer_id=acme&account_id=111111111111&system_key=payments"

/** (label, handler, proxy path, params, method, a cacheable upstream body, caches?) */
const HELD_READERS: Array<[string, Handler, string, Record<string, string>, string, unknown, boolean]> = [
  ["closure-preview", h(closure), `/api/proxy/attack-paths/path/${PATH_ID}/closure-preview`, { pathId: PATH_ID }, "GET",
    { path_id: PATH_ID, closure: [] }, true],
  ["damage-scope", h(damage), `/api/proxy/attack-paths/${SYSTEM}/path/${PATH_ID}/node/n1/damage-scope`,
    { systemName: SYSTEM, pathId: PATH_ID, nodeId: "n1" }, "GET", { node_id: "n1" }, false],
  ["permission-cut-plan", h(cutPlan),
    `/api/proxy/attack-paths/${SYSTEM}/permission-cut-plan?jewel_ref=${encodeURIComponent(JEWEL)}&role_arn=${encodeURIComponent(ROLE)}&jewel_type=S3Bucket`,
    { systemName: SYSTEM }, "POST", { allowed: false, execute_available: false }, false],
  ["identity lateral-moves", h(moves), `/api/proxy/identity-attack-paths/${SYSTEM}/identity/${encodeURIComponent(ROLE)}/lateral-moves?jewel_id=j1`,
    { systemName: SYSTEM, identityId: ROLE }, "GET", { moves: [{ to: "j1" }] }, true],
]

const withClaims = (path: string, claims: string) => `${path}${path.includes("?") ? "&" : "?"}${claims}`

describe.each(HELD_READERS)("S1 · %s", (_label, handler, path, params, method, body, caches) => {
  beforeEach(() => {
    answer = () => respond(200, body)
  })

  it("forwards the R11 claims verbatim upstream and nothing else from the query", async () => {
    await call(handler, withClaims(path, `${CLAIMS}&evil=1`), params, method)
    const qs = new URL(upstreamUrls()[0]).searchParams
    expect([qs.get("customer_id"), qs.get("account_id"), qs.get("system_key"), qs.get("evil")])
      .toEqual(["acme", "111111111111", "payments", null])
  })

  it("without claims the upstream URL is unchanged", async () => {
    await call(handler, path, params, method)
    const qs = new URL(upstreamUrls()[0]).searchParams
    expect(["customer_id", "account_id", "system_key"].some((k) => qs.has(k))).toBe(false)
  })

  it("a cached answer for one account is never served for another", async () => {
    await call(handler, withClaims(path, CLAIMS), params, method)
    await call(handler, withClaims(path, CLAIMS), params, method)
    const afterSame = upstream.mock.calls.length
    expect(afterSame).toBe(caches ? 1 : 2)
    await call(handler, withClaims(path, "customer_id=acme&account_id=222222222222"), params, method)
    expect(upstream.mock.calls.length).toBe(afterSame + 1)
    expect(new URL(upstreamUrls().at(-1)!).searchParams.get("account_id")).toBe("222222222222")
  })
})
