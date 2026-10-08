/**
 * A7 reader 4 FE (Settings S8, 2026-10-08): the Estate reads (topology-risk, dependency-map full / path) name ONE system when
 * the page was opened by key, and relay a 409 system choice typed. A page opened by name -- and every v1 install -- sends
 * exactly the request, and builds exactly the cache keys, it did before.
 *
 * Operational scope, stated: on an install these Estate routes are HELD at registration today (serving_reader_ledger
 * READ_MODEL_MISSING dependency_map_full / topology_risk), so this wiring has no visible effect until Estate serving is
 * activated; it is built so that activation is not blocked on the FE.
 *
 * The 409 body is the backend's REAL answer from AccountOnboarding's reader-4 harness (estate_topology_name_ambiguous_409,
 * systems-list-captures, generated at T2 from the frozen backend SHA): code, system_name, reason and candidate_keys with
 * system_key / system_name / account_id and deployments [] (Estate collections record none). WRITTEN, NOT RUN.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import {
  buildTopologyRiskCacheKey,
  buildTopologyRiskProxyUrl,
  buildTopologyRiskServerCacheKey,
  resolveTopologyScopeParams,
  scopeFromSearch,
} from "@/components/topology-v0-2/topology-scope-url"
import { ambiguousSystemCandidates } from "@/lib/scoped-system-catalog"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.example" }))
// EstateMapView (and DependencyMapTab, which embeds it) reads the product scope, which the app shell's AccountScopeProvider
// always supplies (components/providers.tsx). These tests are about the system KEY, so the scope is the un-narrowed one --
// no customer, every group / account / Region -- and never competes with the key's account. Every other export is real.
vi.mock("@/lib/account-scope-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account-scope-context")>()),
  useAccountScope: () => ({
    customerId: null, groupId: "all", accountId: "all", region: "all",
    options: null, customers: [], loading: false, error: null, scopeNotices: [],
    dismissScopeNotices: () => {}, setCustomerId: () => {}, setGroupId: () => {}, setAccountId: () => {},
    setRegion: () => {}, refresh: () => {},
  }),
}))

/* eslint-disable @typescript-eslint/no-explicit-any -- a capture's body is untyped JSON */
const capture = (name: string): { status: number; body: any } =>
  JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/systems-list-captures", `${name}.json`), "utf8"))
const AMBIGUOUS = "estate_topology_name_ambiguous_409"
const KEY = "split:payments@team@222222222222/eu-west-1"
const ACCOUNT = "222222222222"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})
afterEach(() => vi.unstubAllGlobals())

describe("the topology scope carries the key from the page URL", () => {
  it("reads system_key from the URL, keeps it through resolution, and sends it", () => {
    const url = scopeFromSearch(`?account_id=${ACCOUNT}&system_key=${encodeURIComponent(KEY)}`)
    expect(url.systemKey).toBe(KEY)
    const scope = resolveTopologyScopeParams({ accountId: null, regionId: null, vpcId: null },
      { customerId: "acme", accountId: "all", region: "all" }, url)
    expect(scope.systemKey).toBe(KEY)
    expect(new URL(`https://x${buildTopologyRiskProxyUrl("payments", scope)}`).searchParams.get("system_key")).toBe(KEY)
  })

  it("without a key, every URL and cache key is byte-identical to before", () => {
    const plain = scopeFromSearch(`?account_id=${ACCOUNT}`)
    expect("systemKey" in plain).toBe(false)
    expect(buildTopologyRiskProxyUrl("payments", plain)).toBe(`/api/proxy/topology-risk/payments?account_id=${ACCOUNT}`)
    expect(buildTopologyRiskCacheKey("payments", plain)).toBe(`topology-risk::payments:v11:${ACCOUNT}::all`)
    expect(buildTopologyRiskServerCacheKey("payments", plain))
      .toBe(`topology-risk::payments:${ACCOUNT}:::2026-08-22:tenant-scoped-neptune`)
  })

  it("another key is another cache entry, client and server", () => {
    const a = { accountId: ACCOUNT, systemKey: KEY }
    const b = { accountId: ACCOUNT, systemKey: `${KEY}x` }
    expect(buildTopologyRiskCacheKey("payments", a)).not.toBe(buildTopologyRiskCacheKey("payments", b))
    expect(buildTopologyRiskServerCacheKey("payments", a)).not.toBe(buildTopologyRiskServerCacheKey("payments", b))
  })

  it("refuses a blank or oversized key from the URL (read as no key, never as a different system)", () => {
    expect("systemKey" in scopeFromSearch("?system_key=%20")).toBe(false)
    expect("systemKey" in scopeFromSearch(`?system_key=${"k".repeat(513)}`)).toBe(false)
  })
})

describe("the Estate proxies", () => {
  it("topology-risk forwards system_key and relays a 409 choice the page can read", async () => {
    const { status, body } = capture(AMBIGUOUS)
    const fetchMock = vi.fn().mockResolvedValue(json(body, status))
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/proxy/topology-risk/[systemName]/route")
    const response = await GET(
      new NextRequest(`https://cyntro.example/api/proxy/topology-risk/payments?system_key=${encodeURIComponent(KEY)}`),
      { params: Promise.resolve({ systemName: "payments" }) })
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("system_key")).toBe(KEY)
    expect(response.status).toBe(409)
    const relayed = await response.json()
    expect(ambiguousSystemCandidates(409, relayed)?.map((c) => c.systemKey))
      .toEqual(ambiguousSystemCandidates(409, body)?.map((c) => c.systemKey))
  })

  it("dependency-map full forwards system_key + account_id, keys its cache by them, byte-identical without", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ nodes: [], edges: [] }))
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/proxy/dependency-map/full/route")
    await GET(new NextRequest(
      `https://cyntro.example/api/proxy/dependency-map/full?systemName=payments&system_key=${encodeURIComponent(KEY)}&account_id=${ACCOUNT}`))
    const keyed = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect([keyed.get("system_key"), keyed.get("account_id")]).toEqual([KEY, ACCOUNT])
    await GET(new NextRequest("https://cyntro.example/api/proxy/dependency-map/full?systemName=payments"))
    expect(String(fetchMock.mock.calls[1][0]))
      .toBe("https://backend.example/api/dependency-map/full?systemName=payments&includeUnused=true&max_nodes=300")
    expect(fetchMock).toHaveBeenCalledTimes(2)           // the keyed answer never served the by-name request
  })

  it("dependency-map full relays a 409 choice, typed", async () => {
    const { status, body } = capture(AMBIGUOUS)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body, status)))
    const { GET } = await import("@/app/api/proxy/dependency-map/full/route")
    const response = await GET(new NextRequest("https://cyntro.example/api/proxy/dependency-map/full?systemName=payments"))
    expect(response.status).toBe(409)
    expect(ambiguousSystemCandidates(409, await response.json())).not.toBeNull()
  })

  it("dependency-map path forwards system_key + account_id beside the name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ path_segments: [] }))
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/proxy/dependency-map/path/[sourceId]/[targetId]/route")
    await GET(new NextRequest(
      `https://cyntro.example/api/proxy/dependency-map/path/a/b?systemName=payments&system_key=${encodeURIComponent(KEY)}&account_id=${ACCOUNT}`),
      { params: Promise.resolve({ sourceId: "a", targetId: "b" }) })
    const sent = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect([sent.get("system_name"), sent.get("system_key"), sent.get("account_id")]).toEqual(["payments", KEY, ACCOUNT])
  })
})
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── S8 completion (review of 74c84d6a, 2026-10-08): the nested Estate readers name the identity and show the choice ──

describe("useCachedFetch answers a 409 system choice as a choice", () => {
  it("drops the key's cached reading, returns no data, and exposes the candidates", async () => {
    const { renderHook, waitFor } = await import("@testing-library/react")
    const { status, body } = capture(AMBIGUOUS)
    const key = "estate-dep-map:300:payments"
    window.localStorage.setItem(`cyntro:swr:${key}`, JSON.stringify({ ts: Date.now(), data: { nodes: [{ id: "old" }] } }))
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body, status)))
    const { useCachedFetch } = await import("@/lib/use-cached-fetch")
    const { result } = renderHook(() => useCachedFetch("/api/proxy/dependency-map/full?systemName=payments", { cacheKey: key }))
    await waitFor(() => expect(result.current.choice).not.toBeNull())
    expect(result.current.data).toBeNull()
    expect(result.current.choice?.map((c) => c.systemKey)).toEqual(ambiguousSystemCandidates(409, body)?.map((c) => c.systemKey))
    expect(window.localStorage.getItem(`cyntro:swr:${key}`)).toBeNull()
  })
})

describe("the nested Estate readers carry the identity", () => {
  it("TrafficFlowMap requests and caches the dependency map by key", async () => {
    const React = await import("react")
    const { render, waitFor } = await import("@testing-library/react")
    const urls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => { urls.push(String(input)); return json({ nodes: [], edges: [] }) }))
    const TrafficFlowMap = (await import("@/components/dependency-map/traffic-flow-map")).default
    render(React.createElement(TrafficFlowMap, { systemName: "payments", systemKey: KEY, systemAccountId: ACCOUNT }))
    await waitFor(() => expect(urls.some((u) => u.includes("/api/proxy/dependency-map/full"))).toBe(true))
    const depMap = urls.find((u) => u.includes("/api/proxy/dependency-map/full"))!
    const sent = new URL(`https://x${depMap}`).searchParams
    expect([sent.get("system_key"), sent.get("account_id")]).toEqual([KEY, ACCOUNT])
  })

  it("EstateMapView's dependency companion is requested by the same key as its topology", async () => {
    const React = await import("react")
    const { render, waitFor } = await import("@testing-library/react")
    const urls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => { urls.push(String(input)); return json({}, 404) }))
    const { EstateMapView } = await import("@/components/topology-v0-2/estate-map-view")
    render(React.createElement(EstateMapView, { systemName: "payments", systemKey: KEY, systemAccountId: ACCOUNT, embedded: true }))
    await waitFor(() => expect(urls.some((u) => u.includes("/api/proxy/dependency-map/full"))).toBe(true))
    const depMap = new URL(`https://x${urls.find((u) => u.includes("/api/proxy/dependency-map/full"))!}`).searchParams
    expect(depMap.get("system_key")).toBe(KEY)
    const topology = urls.find((u) => u.includes("/api/proxy/topology-risk/"))
    if (topology) expect(new URL(`https://x${topology}`).searchParams.get("system_key")).toBe(KEY)
  })
})

describe("the Estate / dependency-map views show the choice, never a map of one same-name system", () => {
  it.each([
    ["DependencyMapTab", async () => (await import("@/components/dependency-map-tab")).default],
    ["EstateMapView", async () => (await import("@/components/topology-v0-2/estate-map-view")).EstateMapView],
    ["TrafficFlowMap", async () => (await import("@/components/dependency-map/traffic-flow-map")).default],
  ])("%s", async (_name, load) => {
    const React = await import("react")
    const { render, screen } = await import("@testing-library/react")
    const { status, body } = capture(AMBIGUOUS)
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json(body, status)))
    const View = (await load()) as any
    render(React.createElement(View, { systemName: body.detail.system_name, embedded: true }))
    const choice = await screen.findByTestId("system-name-ambiguous")
    expect(choice.querySelectorAll("a").length).toBe(ambiguousSystemCandidates(409, body)!.length)
    expect(screen.queryByText(/Topology risk unavailable/)).not.toBeInTheDocument()
  })
})

// ── S8 edge blockers (review of 7b8de86e, 2026-10-08) ─────────────────────────────────────────────────────────────

describe("EstateMapView pins ONE key + account for both of its reads", () => {
  const OTHER = "333333333333"

  async function readsOf(props: Record<string, unknown>, search = "") {
    const React = await import("react")
    const { render, waitFor } = await import("@testing-library/react")
    window.history.pushState({}, "", `/systems${search}`)
    // estate-map-view's ACCOUNT_STORAGE_PREFIX ("topology-account:"): the operator's remembered account B.
    window.localStorage.setItem("topology-account:payments", OTHER)
    const urls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => { urls.push(String(input)); return json({}, 404) }))
    const { EstateMapView } = await import("@/components/topology-v0-2/estate-map-view")
    render(React.createElement(EstateMapView, { systemName: "payments", embedded: true, ...props }))
    await waitFor(() => expect(urls.some((u) => u.includes("/api/proxy/dependency-map/full"))).toBe(true))
    await waitFor(() => expect(urls.some((u) => u.includes("/api/proxy/topology-risk/"))).toBe(true))
    const params = (part: string) => new URL(`https://x${urls.find((u) => u.includes(part))!}`).searchParams
    return { topology: params("/api/proxy/topology-risk/"), dependency: params("/api/proxy/dependency-map/full") }
  }

  afterEach(() => {
    window.localStorage.clear()
    window.history.pushState({}, "", "/")
  })

  it("from props: a remembered other account never wins over the key's account", async () => {
    const { topology, dependency } = await readsOf({ systemKey: KEY, systemAccountId: ACCOUNT })
    expect([topology.get("system_key"), topology.get("account_id")]).toEqual([KEY, ACCOUNT])
    expect([dependency.get("system_key"), dependency.get("account_id")]).toEqual([KEY, ACCOUNT])
  })

  it("from the page URL when no props name it: the same pair on both reads", async () => {
    const { topology, dependency } = await readsOf({}, `?systemName=payments&system_key=${encodeURIComponent(KEY)}&account_id=${ACCOUNT}`)
    expect([topology.get("system_key"), topology.get("account_id")]).toEqual([KEY, ACCOUNT])
    expect([dependency.get("system_key"), dependency.get("account_id")]).toEqual([KEY, ACCOUNT])
  })
})

describe("useCachedFetch: a 409 choice stays the answer until a fresh 200 or a new key", () => {
  const KEY_C = "estate-dep-map:300:payments"
  const warm = () => window.localStorage.setItem(`cyntro:swr:${KEY_C}`,
    JSON.stringify({ ts: Date.now(), data: { nodes: [{ id: "old-map" }] } }))

  it.each([
    ["503", () => json({ error: "Backend returned 503" }, 503)],
    ["network failure", () => { throw new TypeError("Failed to fetch") }],
  ])("cached map -> 409 -> %s: the old map never comes back and the choice stays", async (_label, failure) => {
    const { renderHook, waitFor, act } = await import("@testing-library/react")
    const { status, body } = capture(AMBIGUOUS)
    warm()
    const answers: Array<() => Response> = [() => json(body, status), failure as () => Response]
    vi.stubGlobal("fetch", vi.fn(async () => (answers.shift() ?? (() => json(body, status)))()))
    const { useCachedFetch } = await import("@/lib/use-cached-fetch")
    const { result } = renderHook(() => useCachedFetch<{ nodes?: unknown[] }>(
      "/api/proxy/dependency-map/full?systemName=payments", { cacheKey: KEY_C }))
    await waitFor(() => expect(result.current.choice).not.toBeNull())
    await act(async () => { result.current.retry() })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
    expect(result.current.choice).not.toBeNull()
    expect(window.localStorage.getItem(`cyntro:swr:${KEY_C}`)).toBeNull()
  })

  it("a fresh 200 for one system ends the ambiguity", async () => {
    const { renderHook, waitFor, act } = await import("@testing-library/react")
    const { status, body } = capture(AMBIGUOUS)
    const answers: Array<() => Response> = [() => json(body, status), () => json({ nodes: [{ id: "fresh" }] })]
    vi.stubGlobal("fetch", vi.fn(async () => (answers.shift() ?? (() => json({ nodes: [] })))()))
    const { useCachedFetch } = await import("@/lib/use-cached-fetch")
    const { result } = renderHook(() => useCachedFetch<{ nodes?: unknown[] }>(
      "/api/proxy/dependency-map/full?systemName=payments", { cacheKey: KEY_C }))
    await waitFor(() => expect(result.current.choice).not.toBeNull())
    await act(async () => { result.current.retry() })
    await waitFor(() => expect(result.current.data?.nodes).toEqual([{ id: "fresh" }]))
    expect(result.current.choice).toBeNull()
  })
})

// ── the latch's response-order table (review of 63faba69, 2026-10-08): after a 409 choice, what each next answer does ──

describe("useCachedFetch after a 409 choice: the response-order table", () => {
  const KEY_T = "estate-dep-map:300:payments"
  type Next = () => Response

  async function afterChoice(next: Next) {
    const { renderHook, waitFor, act } = await import("@testing-library/react")
    const { status, body } = capture(AMBIGUOUS)
    window.localStorage.setItem(`cyntro:swr:${KEY_T}`, JSON.stringify({ ts: Date.now(), data: { nodes: [{ id: "old-map" }] } }))
    const answers: Next[] = [() => json(body, status), next]
    vi.stubGlobal("fetch", vi.fn(async () => (answers.shift() ?? next)()))
    const { useCachedFetch } = await import("@/lib/use-cached-fetch")
    const hook = renderHook(({ key }) => useCachedFetch<{ nodes?: unknown[]; status?: string }>(
      `/api/proxy/dependency-map/full?systemName=payments&k=${key}`, { cacheKey: key }), { initialProps: { key: KEY_T } })
    await waitFor(() => expect(hook.result.current.choice).not.toBeNull())
    await act(async () => { hook.result.current.retry() })
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    return hook
  }

  afterEach(() => window.localStorage.clear())

  it("fresh 200 (one system answered): the choice ends and the fresh reading is shown", async () => {
    const { result } = await afterChoice(() => json({ nodes: [{ id: "fresh" }] }))
    await vi.waitFor(() => expect(result.current.data?.nodes).toEqual([{ id: "fresh" }]))
    expect(result.current.choice).toBeNull()
  })

  it("pending 200 ({status: computing}): resolves no system -- the choice stays, nothing shown", async () => {
    const { result } = await afterChoice(() => json({ status: "computing", system_kpis: null }))
    expect(result.current.choice).not.toBeNull()
    expect(result.current.data).toBeNull()
  })

  it("stale 200 (proxy fromStaleCache): resolves no system -- the choice stays, the stale map is not shown", async () => {
    const { result } = await afterChoice(() => json({ nodes: [{ id: "stale" }], fromStaleCache: true }))
    expect(result.current.choice).not.toBeNull()
    expect(result.current.data).toBeNull()
  })

  it.each([401, 403])("%i (access denied): outranks the choice -- no candidates, no data, the refusal named", async (code) => {
    const { result } = await afterChoice(() => json({ detail: "denied" }, code))
    expect(result.current.choice).toBeNull()
    expect(result.current.data).toBeNull()
    expect(result.current.error).not.toBeNull()
  })

  it.each([
    ["503", () => json({ error: "Backend returned 503" }, 503)],
    ["network failure", () => { throw new TypeError("Failed to fetch") }],
  ])("%s: says nothing new -- the choice stays and nothing earlier returns", async (_label, next) => {
    const { result } = await afterChoice(next as Next)
    expect(result.current.choice).not.toBeNull()
    expect(result.current.data).toBeNull()
  })

  it("identity change (a new key): the choice belongs to the old key and is reset", async () => {
    const { act } = await import("@testing-library/react")
    const hook = await afterChoice(() => json({ error: "Backend returned 503" }, 503))
    await act(async () => { hook.rerender({ key: `${KEY_T}:key=${KEY}:${ACCOUNT}` }) })
    expect(hook.result.current.choice).toBeNull()
  })
})
