/**
 * AP201 / CP-C-1 (R11) · the nine per-jewel proxies forward the operator's tenant / account claims upstream, and the
 * ones that cache key their cache by them, so a cached answer for one account is never served for another.
 *
 * Real: the Next route handlers. Stubbed: the upstream `fetch` (recorded), and the proxy cache as an in-memory map
 * (the blast-radius proxy test's pattern) reset per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/proxy-cache", () => {
  const store = new Map<string, unknown>()
  return {
    __store: store,
    getCached: (key: string) => (store.has(key) ? store.get(key) : null),
    getStaleCached: () => null,
    setCached: (key: string, data: unknown) => {
      store.set(key, data)
    },
    clearCached: (key: string) => {
      store.delete(key)
    },
    TTL_FAST: 30_000,
    TTL_STD: 60_000,
    TTL_SLOW: 300_000,
  }
})

import { GET as targets } from "@/app/api/proxy/attack-paths/[systemName]/targets/route"
import { GET as summary } from "@/app/api/proxy/attack-paths/[systemName]/by-crown-jewel/summary/route"
import { GET as detail } from "@/app/api/proxy/attack-paths/[systemName]/by-crown-jewel/detail/route"
import { GET as full } from "@/app/api/proxy/attack-paths/[systemName]/by-crown-jewel/route"
import { GET as footholds } from "@/app/api/proxy/attack-paths/[systemName]/jewel-footholds/route"
import { GET as lateral } from "@/app/api/proxy/attack-paths/[systemName]/jewel-lateral-reach/route"
import { GET as surface } from "@/app/api/proxy/identity-attack-paths/[systemName]/jewel-surface/[jewelId]/route"
import { GET as jewels } from "@/app/api/proxy/identity-attack-paths/[systemName]/jewels/route"
import { GET as jewel } from "@/app/api/proxy/identity-attack-paths/[systemName]/jewel/[jewelId]/route"

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
/** The handlers type their own `params` shape (and one takes a plain `Request`); the table drives them uniformly. */
const h = (fn: unknown): Handler => fn as Handler

const SYSTEM = "payments"
const JEWEL = "arn:aws:s3:::acme-data"
const CLAIMS = "customer_id=acme&account_id=111111111111"

/** (label, handler, proxy path + its own params, route params, a cacheable body, caches?) */
const ROUTES: Array<[string, Handler, string, Record<string, string>, unknown, boolean]> = [
  ["targets", h(targets),`/api/proxy/attack-paths/${SYSTEM}/targets`, { systemName: SYSTEM },
    { serve_state: "READY", targets: [{ target_id: JEWEL }], system_name: SYSTEM }, true],
  ["by-crown-jewel/summary", h(summary),`/api/proxy/attack-paths/${SYSTEM}/by-crown-jewel/summary?cj_arn=${encodeURIComponent(JEWEL)}`, { systemName: SYSTEM },
    { system: SYSTEM, serve_state: "ACTIVE", paths: [{ path_id: "p1" }] }, true],
  ["by-crown-jewel/detail", h(detail),`/api/proxy/attack-paths/${SYSTEM}/by-crown-jewel/detail?cj_arn=${encodeURIComponent(JEWEL)}&path_id=p1`, { systemName: SYSTEM },
    { path: { path_id: "p1" } }, false],
  ["by-crown-jewel", h(full),`/api/proxy/attack-paths/${SYSTEM}/by-crown-jewel?cj_arn=${encodeURIComponent(JEWEL)}`, { systemName: SYSTEM },
    { system: SYSTEM, paths: [] }, false],
  ["jewel-footholds", h(footholds),`/api/proxy/attack-paths/${SYSTEM}/jewel-footholds?jewel_ref=${encodeURIComponent(JEWEL)}&evaluate=true`, { systemName: SYSTEM },
    { candidates: [] }, false],
  ["jewel-lateral-reach", h(lateral),`/api/proxy/attack-paths/${SYSTEM}/jewel-lateral-reach?jewel_ref=${encodeURIComponent(JEWEL)}&jewel_type=S3Bucket`, { systemName: SYSTEM },
    { bands: {} }, true],
  ["jewel-surface", h(surface),`/api/proxy/identity-attack-paths/${SYSTEM}/jewel-surface/${encodeURIComponent(JEWEL)}`, { systemName: SYSTEM, jewelId: JEWEL },
    { jewel: { id: JEWEL }, paths: [] }, true],
  ["jewels", h(jewels),`/api/proxy/identity-attack-paths/${SYSTEM}/jewels`, { systemName: SYSTEM },
    { crown_jewels: [{ id: JEWEL }] }, true],
  ["jewel/{jewelId}", h(jewel),`/api/proxy/identity-attack-paths/${SYSTEM}/jewel/${encodeURIComponent(JEWEL)}`, { systemName: SYSTEM, jewelId: JEWEL },
    { jewel: { id: JEWEL }, paths: [] }, false],
]

let upstream: ReturnType<typeof vi.fn>

beforeEach(async () => {
  const cache = await import("@/lib/server/proxy-cache")
  ;(cache as unknown as { __store: Map<string, unknown> }).__store.clear()
  upstream = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    const route = ROUTES.find(([, , path]) => url.includes(path.split("?")[0].replace("/api/proxy", "/api")))
    return new Response(JSON.stringify(route ? route[4] : {}), { status: 200, headers: { "content-type": "application/json" } })
  })
  vi.stubGlobal("fetch", upstream)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const call = (handler: Handler, path: string, params: Record<string, string>) =>
  handler(new NextRequest(`http://fe.local${path}`), { params: Promise.resolve(params) })

const withClaims = (path: string, claims: string) => `${path}${path.includes("?") ? "&" : "?"}${claims}`
const upstreamUrls = () => upstream.mock.calls.map((c) => String(c[0] instanceof Request ? c[0].url : c[0]))

describe.each(ROUTES)("%s", (_label, handler, path, params, _body, caches) => {
  it("forwards the two claims verbatim to the backend and nothing else from them", async () => {
    const res = await call(handler, withClaims(path, `${CLAIMS}&region=eu-west-1&evil=1`), params)
    expect(res.status).toBe(200)
    const [url] = upstreamUrls()
    const qs = new URL(url).searchParams
    expect(qs.get("customer_id")).toBe("acme")
    expect(qs.get("account_id")).toBe("111111111111")
    expect(qs.get("evil")).toBeNull()
  })

  it("without claims the upstream URL carries none (unchanged)", async () => {
    await call(handler, path, params)
    const qs = new URL(upstreamUrls()[0]).searchParams
    expect(qs.has("customer_id")).toBe(false)
    expect(qs.has("account_id")).toBe(false)
  })

  it("a cached answer for one account is never served for another (the cache key carries the claims)", async () => {
    await call(handler, withClaims(path, CLAIMS), params)
    await call(handler, withClaims(path, CLAIMS), params)
    const afterSame = upstream.mock.calls.length
    // a caching proxy served the repeat for the SAME account from its cache; a pass-through read upstream again
    expect(afterSame).toBe(caches ? 1 : 2)
    await call(handler, withClaims(path, "customer_id=acme&account_id=222222222222"), params)
    expect(upstream.mock.calls.length).toBe(afterSame + 1)
    const last = new URL(upstreamUrls()[upstreamUrls().length - 1]).searchParams
    expect(last.get("account_id")).toBe("222222222222")
  })
})
