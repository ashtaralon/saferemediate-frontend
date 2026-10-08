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
