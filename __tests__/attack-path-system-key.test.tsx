/**
 * A7 B5 / M6 readers (slice 6): the attack-path family names ONE system when the page was opened by KEY. On a v2 install
 * two systems may share a display name, never a key: the attack-path proxies forward ?system_key= (+ account_id beside it,
 * the egress rule) and fold them into their proxy cache keys; the exfil POST body carries the optional system_key beside
 * system_name; the pages that hold the key (the system page's Attack Paths tab, the Topology tab's crown-jewel reads, the
 * /all card's links) send it; and a 409 system choice is relayed typed (lib/server/proxy-error systemChoiceDetail). A page
 * opened by name -- and every v1 install -- sends exactly the request, body and cache key it sent before.
 *
 * Bodies: the 409 is the backend's REAL system_identity answer (egress_system_name_ambiguous_409, systems-list-captures --
 * the same body on every v2 route); the Systems list is the REAL v2 capture with two identities sharing one name
 * (systems_list_v2_two_identities_one_name); the IAP 200 is the CF01 route capture and the lateral-reach 200 the captured
 * fixture. The proxies treat every other 200 as opaque, so those are minimal hand-written bodies (the target catalog's only
 * read field is serve_state). The /all item's system_key follows the M6 design record ("every payload carries system_key
 * and the display system_name"); no /all v2 capture exists yet.
 *
 * WRITTEN, NOT RUN: the authoring container had no node_modules (npm blocked), so neither vitest nor tsc ran here.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import React from "react"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { ambiguousSystemCandidates, systemScopeQuery } from "@/lib/scoped-system-catalog"
import { AttackPathsV2 } from "@/components/attack-paths-v2/attack-paths-v2"
import { AttackPathsCard, type PathsResponse } from "@/components/dashboard/v3/attack-paths-card"
import DependencyMapTab from "@/components/dependency-map-tab"
import { useAtlasLateral } from "@/components/attack-paths-v2/use-atlas-lateral"
import { useZoom0Exfil } from "@/components/attack-paths-v2/use-zoom0-exfil"
import { useCrownJewelConvergence } from "@/lib/attack-paths/use-crown-jewel-convergence"
import {
  buildConvergenceDetailUrl,
  buildConvergenceFetchUrl,
  buildConvergenceSummaryUrl,
} from "@/lib/attack-paths/convergence-fetch-url"
import {
  buildAttackPathsV2CjUrl,
  buildTfmSpotlightUrl,
  toCrownJewelSummary,
} from "@/lib/attack-paths/crown-jewel-v2-navigation"
import type { UseCachedFetchResult } from "@/lib/use-cached-fetch"
import twoCustomers from "@/__tests__/fixtures/cf01-attack-path-evidence/iap-payments-two-customers.json"
import lateralReachAlonProd from "./fixtures/lateral-reach-alon-prod.json"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.example" }))

// Stable identities, as Next provides (a fresh object per render would re-fire every effect keyed on them).
const nav = vi.hoisted(() => {
  const push = vi.fn()
  return {
    params: new URLSearchParams(),
    push,
    router: { push, replace: () => undefined, prefetch: () => undefined, back: () => undefined },
  }
})
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => nav.router,
  usePathname: () => "/attack-paths-v2",
}))
// The app shell's AccountScopeProvider always supplies the product scope. These tests are about the system KEY, so the
// scope is the tenant of the v2 Systems capture, un-narrowed (every group / account / Region). Every other export is real.
vi.mock("@/lib/account-scope-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account-scope-context")>()),
  useAccountScope: () => ({
    customerId: "tenant-x", groupId: "all", accountId: "all", region: "all",
    options: null, customers: [], loading: false, error: null, scopeNotices: [],
    dismissScopeNotices: () => {}, setCustomerId: () => {}, setGroupId: () => {}, setAccountId: () => {},
    setRegion: () => {}, refresh: () => {},
  }),
}))

/* eslint-disable @typescript-eslint/no-explicit-any -- a capture's body is untyped JSON */
const capture = (name: string): { status: number; body: any } =>
  JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/systems-list-captures", `${name}.json`), "utf8"))
const AMBIGUOUS = "egress_system_name_ambiguous_409"
const TWO_IDENTITIES = "systems_list_v2_two_identities_one_name"
// A tag / source key (one system per account) and its account; another key for "another system".
const KEY = "split:payments@team@222222222222/eu-west-1"
const ACCOUNT = "222222222222"
const SYSTEM = "alon prod"
const B = "https://backend.example"
const JEWEL = "arn:aws:s3:::acme-data"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function setUrl(params: Record<string, string>) {
  for (const key of Array.from(nav.params.keys())) nav.params.delete(key)
  for (const [k, v] of Object.entries(params)) nav.params.set(k, v)
}

let savedBackendOverride: string | undefined

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  nav.push.mockClear()
  setUrl({})
  window.localStorage.clear()
  // The IAP and jewel-surface proxies prefer BACKEND_URL_OVERRIDE; these tests read the mocked backend URL.
  savedBackendOverride = process.env.BACKEND_URL_OVERRIDE
  delete process.env.BACKEND_URL_OVERRIDE
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  if (savedBackendOverride === undefined) delete process.env.BACKEND_URL_OVERRIDE
  else process.env.BACKEND_URL_OVERRIDE = savedBackendOverride
})

// ── the proxies ─────────────────────────────────────────────────────────────────────────────────────────────────────

type ProxyCase = {
  name: string
  module: string
  /** The proxy URL path the page requests. */
  path: string
  params: Record<string, string>
  /** The page's own query, without a key. */
  query: string
  /** The backend URL a by-name request reaches TODAY, byte for byte. */
  backend: string
  /** The proxy cache key a by-name request uses TODAY (cached proxies only). */
  cacheKey?: string
  /** A 200 answer. */
  body: Record<string, unknown>
}

const BY_NAME = { systemName: SYSTEM }
const READY_CATALOG = {
  system_name: SYSTEM, serve_state: "READY", coverage_state: "READY", not_ready_reason: null, generation: 7,
  staging_run_id: "stage-7", customer_id: "tenant-x", account_id: ACCOUNT, computed_at: "2026-10-09T00:00:00Z",
  total_targets: 0, counts: {}, targets: [], endpoint: "target-catalog",
}

const PROXIES: ProxyCase[] = [
  {
    name: "attack-paths by-crown-jewel",
    module: "@/app/api/proxy/attack-paths/[systemName]/by-crown-jewel/route",
    path: "/api/proxy/attack-paths/alon%20prod/by-crown-jewel", params: BY_NAME, query: "cj_name=bucket-a",
    backend: `${B}/api/attack-paths/alon%20prod/by-crown-jewel?cj_name=bucket-a`,
    body: { paths: [] },
  },
  {
    name: "attack-paths by-crown-jewel/detail",
    module: "@/app/api/proxy/attack-paths/[systemName]/by-crown-jewel/detail/route",
    path: "/api/proxy/attack-paths/alon%20prod/by-crown-jewel/detail", params: BY_NAME, query: "cj_name=bucket-a&path_id=p1",
    backend: `${B}/api/attack-paths/alon%20prod/by-crown-jewel/detail?path_id=p1&cj_name=bucket-a`,
    body: { path: { path_id: "p1" } },
  },
  {
    name: "attack-paths by-crown-jewel/summary",
    module: "@/app/api/proxy/attack-paths/[systemName]/by-crown-jewel/summary/route",
    path: "/api/proxy/attack-paths/alon%20prod/by-crown-jewel/summary", params: BY_NAME, query: "cj_name=bucket-a",
    backend: `${B}/api/attack-paths/alon%20prod/by-crown-jewel/summary?cj_name=bucket-a`,
    cacheKey: "cj-summary:alon prod::bucket-a",
    body: { paths: [] },
  },
  {
    name: "attack-paths jewel-footholds",
    module: "@/app/api/proxy/attack-paths/[systemName]/jewel-footholds/route",
    path: "/api/proxy/attack-paths/alon%20prod/jewel-footholds", params: BY_NAME, query: "jewel_ref=bucket-a&evaluate=true",
    backend: `${B}/api/attack-paths/alon%20prod/jewel-footholds?jewel_ref=bucket-a&evaluate=true`,
    body: { candidates: [] },
  },
  {
    name: "attack-paths jewel-lateral-reach",
    module: "@/app/api/proxy/attack-paths/[systemName]/jewel-lateral-reach/route",
    path: "/api/proxy/attack-paths/alon%20prod/jewel-lateral-reach", params: BY_NAME,
    query: "jewel_ref=bucket-a&jewel_type=S3Bucket",
    backend: `${B}/api/attack-paths/alon%20prod/jewel-lateral-reach?jewel_ref=bucket-a&jewel_type=S3Bucket`,
    cacheKey: "lateral-reach:alon prod:S3Bucket:bucket-a",
    body: lateralReachAlonProd as Record<string, unknown>,
  },
  {
    name: "attack-paths targets",
    module: "@/app/api/proxy/attack-paths/[systemName]/targets/route",
    path: "/api/proxy/attack-paths/alon%20prod/targets", params: BY_NAME, query: "",
    backend: `${B}/api/attack-paths/alon%20prod/targets`,
    cacheKey: "ap-targets:alon prod",
    body: READY_CATALOG,
  },
  {
    name: "identity-attack-paths",
    module: "@/app/api/proxy/identity-attack-paths/[systemName]/route",
    path: "/api/proxy/identity-attack-paths/alon%20prod", params: BY_NAME, query: "",
    backend: `${B}/api/identity-attack-paths/alon%20prod?max_jewels=12&max_paths_per_jewel=8`,
    cacheKey: "identity-attack-paths:2026-07-13:poison-bypass:alon prod:12:8:false:false:false:false",
    body: twoCustomers.acme as Record<string, unknown>,
  },
  {
    name: "identity-attack-paths jewels",
    module: "@/app/api/proxy/identity-attack-paths/[systemName]/jewels/route",
    path: "/api/proxy/identity-attack-paths/alon%20prod/jewels", params: BY_NAME, query: "",
    backend: `${B}/api/identity-attack-paths/alon%20prod/jewels?max_jewels=12`,
    cacheKey: "iap-jewels:alon prod",
    body: twoCustomers.acme as Record<string, unknown>,
  },
  {
    name: "identity-attack-paths jewel",
    module: "@/app/api/proxy/identity-attack-paths/[systemName]/jewel/[jewelId]/route",
    path: "/api/proxy/identity-attack-paths/alon%20prod/jewel/bucket-a", params: { systemName: SYSTEM, jewelId: "bucket-a" },
    query: "",
    backend: `${B}/api/identity-attack-paths/alon%20prod/jewel/bucket-a?max_paths=5`,
    body: { paths: [] },
  },
  {
    name: "identity-attack-paths jewel-surface",
    module: "@/app/api/proxy/identity-attack-paths/[systemName]/jewel-surface/[jewelId]/route",
    path: "/api/proxy/identity-attack-paths/alon%20prod/jewel-surface/bucket-a",
    params: { systemName: SYSTEM, jewelId: "bucket-a" }, query: "",
    backend: `${B}/api/identity-attack-paths/alon%20prod/jewel-surface/bucket-a?max_paths=15`,
    cacheKey: "jewel-surface|alon prod|bucket-a|15",
    body: { max_verbs: [] },
  },
  {
    // The attack-path facade's identity read forwards to /api/identity-attack-paths/{system}.
    name: "attack-path facade (identity read)",
    module: "@/app/api/proxy/attack-path/[systemName]/[jewelId]/route",
    path: "/api/proxy/attack-path/alon%20prod/bucket-a", params: { systemName: SYSTEM, jewelId: "bucket-a" },
    query: "path_id=p1",
    backend: `${B}/api/identity-attack-paths/alon%20prod?max_jewels=12&max_paths_per_jewel=8&enriched=true`,
    body: { system_name: SYSTEM, paths: [] },
  },
]

const keyed = (query: string, key = KEY, account: string | null = ACCOUNT) =>
  `${query}${query ? "&" : ""}system_key=${encodeURIComponent(key)}${account ? `&account_id=${account}` : ""}`

async function call(p: ProxyCase, query: string): Promise<Response> {
  const { GET } = await import(p.module)
  return GET(new NextRequest(`https://cyntro.example${p.path}?${query}`), { params: Promise.resolve(p.params) })
}

describe("the attack-path proxies", () => {
  it.each(PROXIES)("$name forwards system_key + account_id, and is byte-identical without a key", async (p) => {
    const fetchMock = vi.fn().mockImplementation(async () => json(p.body))
    vi.stubGlobal("fetch", fetchMock)
    await call(p, keyed(p.query))
    const sent = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect([sent.get("system_key"), sent.get("account_id")]).toEqual([KEY, ACCOUNT])
    await call(p, p.query)
    expect(String(fetchMock.mock.calls[1][0])).toBe(p.backend)
    expect(fetchMock).toHaveBeenCalledTimes(2)           // the keyed answer never served the by-name request
  })

  it.each(PROXIES)("$name forwards no account without a key (the account rides only beside a key)", async (p) => {
    const fetchMock = vi.fn().mockImplementation(async () => json(p.body))
    vi.stubGlobal("fetch", fetchMock)
    await call(p, `${p.query}${p.query ? "&" : ""}account_id=${ACCOUNT}`)
    const sent = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect([sent.has("system_key"), sent.has("account_id")]).toEqual([false, false])
  })

  it.each(PROXIES.filter((p) => p.cacheKey))(
    "$name keys its cache by the key: today's entry for a by-name request, its own entry per key",
    async (p) => {
      // Each answer says which request it answered, so a cache hit shows whose answer it served.
      const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) =>
        json({ ...p.body, _probe: new URL(String(input)).searchParams.get("system_key") ?? "by-name" }))
      vi.stubGlobal("fetch", fetchMock)
      expect((await (await call(p, keyed(p.query))).json())._probe).toBe(KEY)
      expect((await (await call(p, p.query)).json())._probe).toBe("by-name")
      expect((await (await call(p, keyed(p.query))).json())._probe).toBe(KEY)         // its own entry: a hit
      await call(p, keyed(p.query, `${KEY}x`))                                     // another key is another system
      expect(fetchMock).toHaveBeenCalledTimes(3)
      const { getCached } = await import("@/lib/server/proxy-cache")
      expect((getCached(p.cacheKey!) as { _probe?: string } | null)?._probe).toBe("by-name")
    },
  )

  it.each(PROXIES)("$name relays a 409 system choice the page can read, typed, and nothing raw", async (p) => {
    const { status, body } = capture(AMBIGUOUS)
    expect(status).toBe(409)
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      json({ detail: { ...body.detail, extra: "never relayed" } }, status)))
    const response = await call(p, p.query)
    expect(response.status).toBe(409)
    const relayed = await response.json()
    expect(JSON.stringify(relayed)).not.toContain("never relayed")
    expect(ambiguousSystemCandidates(409, relayed)?.map((c) => c.systemKey))
      .toEqual(ambiguousSystemCandidates(409, body)?.map((c) => c.systemKey))
  })
})

describe("the exfil-paths proxy (POST)", () => {
  const BY_NAME_BODY = {
    system_name: SYSTEM, jewel_id: JEWEL, include_capable: true, include_observed: true, max_destinations: 50,
    include_atlas: false, include_details: false, atlas_max_hops: 6,
  }
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/proxy/attack-chain/exfil-paths/route")
    return POST(new NextRequest("https://cyntro.example/api/proxy/attack-chain/exfil-paths", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }))
  }

  it("forwards the body's system_key beside system_name, and the by-name body byte-identical", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ ok: true, paths: [] }))
    vi.stubGlobal("fetch", fetchMock)
    const { system_name: name, ...rest } = BY_NAME_BODY
    await post({ system_name: name, system_key: KEY, ...rest })
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${B}/api/attack-chain/exfil-paths`)
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect([sent.system_name, sent.system_key]).toEqual([SYSTEM, KEY])
    await post(BY_NAME_BODY)
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify(BY_NAME_BODY))
  })

  it("relays a 409 system choice the page can read, typed, and nothing raw", async () => {
    const { status, body } = capture(AMBIGUOUS)
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      json({ detail: { ...body.detail, extra: "never relayed" } }, status)))
    const response = await post(BY_NAME_BODY)
    expect(response.status).toBe(409)
    const relayed = await response.json()
    expect(JSON.stringify(relayed)).not.toContain("never relayed")
    expect(ambiguousSystemCandidates(409, relayed)?.map((c) => c.systemKey))
      .toEqual(ambiguousSystemCandidates(409, body)?.map((c) => c.systemKey))
  })

  it("answers every other refusal as before (raw text, sliced)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("upstream exploded", { status: 422 })))
    const response = await post(BY_NAME_BODY)
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ ok: false, error: "backend 422", detail: "upstream exploded" })
  })
})

// ── the URL builders and the per-system hooks ─────────────────────────────────────────────────────────────────────

describe("the attack-path URL builders name ONE system by key, and are byte-identical without", () => {
  const jewel = toCrownJewelSummary({ id: JEWEL, arn: JEWEL, name: "acme-data", type: "S3Bucket" })
  const CJ = "cj_arn=arn%3Aaws%3As3%3A%3A%3Aacme-data&cj_name=acme-data"

  it("by-crown-jewel, its summary and its detail", () => {
    expect(buildConvergenceFetchUrl("Payments", jewel)).toBe(`/api/proxy/attack-paths/Payments/by-crown-jewel?${CJ}`)
    expect(buildConvergenceSummaryUrl("Payments", jewel))
      .toBe(`/api/proxy/attack-paths/Payments/by-crown-jewel/summary?${CJ}`)
    expect(buildConvergenceDetailUrl("Payments", jewel, "p1"))
      .toBe(`/api/proxy/attack-paths/Payments/by-crown-jewel/detail?${CJ}&path_id=p1`)
    expect(buildConvergenceFetchUrl("Payments", jewel, { customerId: null, accountId: null, systemKey: KEY, systemAccountId: ACCOUNT }))
      .toBe(`/api/proxy/attack-paths/Payments/by-crown-jewel?${CJ}${systemScopeQuery(KEY, ACCOUNT)}`)
    expect(buildConvergenceSummaryUrl("Payments", jewel, { customerId: null, accountId: null, systemKey: KEY, systemAccountId: null }))
      .toBe(`/api/proxy/attack-paths/Payments/by-crown-jewel/summary?${CJ}${systemScopeQuery(KEY, null)}`)
    expect(buildConvergenceDetailUrl("Payments", jewel, "p1", { customerId: null, accountId: null, systemKey: KEY, systemAccountId: ACCOUNT }))
      .toBe(`/api/proxy/attack-paths/Payments/by-crown-jewel/detail?${CJ}&path_id=p1${systemScopeQuery(KEY, ACCOUNT)}`)
    // An account alone names nothing (systemScopeQuery's rule).
    expect(buildConvergenceSummaryUrl("Payments", jewel, { customerId: null, accountId: null, systemKey: null, systemAccountId: ACCOUNT }))
      .toBe(`/api/proxy/attack-paths/Payments/by-crown-jewel/summary?${CJ}`)
  })

  it("the Attack Paths v2 deep link and the Topology spotlight link", () => {
    const v2 = { systemName: "Payments", jewelId: JEWEL, pathId: "p1" }
    expect(buildAttackPathsV2CjUrl(v2))
      .toBe("/attack-paths-v2?system=Payments&jewel=arn%3Aaws%3As3%3A%3A%3Aacme-data&path=p1&map=cyntro&mode=attack-path")
    const keyedV2 = new URL(`https://x${buildAttackPathsV2CjUrl({ ...v2, systemKey: KEY, systemAccountId: ACCOUNT })}`)
    expect([keyedV2.searchParams.get("system"), keyedV2.searchParams.get("system_key"), keyedV2.searchParams.get("account_id")])
      .toEqual(["Payments", KEY, ACCOUNT])
    expect(buildTfmSpotlightUrl("Payments", JEWEL))
      .toBe("/systems?systemName=Payments&tab=dependency-map&cj=arn%3Aaws%3As3%3A%3A%3Aacme-data")
    const keyedTfm = new URL(`https://x${buildTfmSpotlightUrl("Payments", JEWEL, KEY, null)}`)
    expect([keyedTfm.searchParams.get("system_key"), keyedTfm.searchParams.has("account_id")]).toEqual([KEY, false])
  })
})

function recordFetch(answer: (url: string) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    calls.push({ url, init })
    return answer(url)
  }))
  return calls
}

describe("the per-system attack-path hooks send the key, and only when the page has one", () => {
  const jewel = toCrownJewelSummary({ id: JEWEL, arn: JEWEL, name: "acme-data", type: "S3Bucket" })

  it("useCrownJewelConvergence: the summary and each path's detail", async () => {
    const calls = recordFetch((url) => url.includes("/summary")
      ? json({ system: "Payments", paths_total: 1, observed_paths: 0, choke_points: {}, paths: [{ path_id: "p1" }] })
      : json({ error: "not stubbed" }, 404))
    const { unmount } = renderHook(() =>
      useCrownJewelConvergence("Payments", jewel, null, [], { systemKey: KEY, systemAccountId: ACCOUNT }))
    await waitFor(() => expect(calls.some((c) => c.url.includes("/by-crown-jewel/detail"))).toBe(true))
    expect(calls.find((c) => c.url.includes("/summary"))!.url)
      .toBe(`${buildConvergenceSummaryUrl("Payments", jewel)}${systemScopeQuery(KEY, ACCOUNT)}`)
    expect(calls.find((c) => c.url.includes("/detail"))!.url)
      .toBe(`${buildConvergenceDetailUrl("Payments", jewel, "p1")}${systemScopeQuery(KEY, ACCOUNT)}`)
    unmount()
    calls.length = 0
    renderHook(() => useCrownJewelConvergence("Payments", jewel))
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].url).toBe(buildConvergenceSummaryUrl("Payments", jewel))
  })

  it("useAtlasLateral: the foothold read", async () => {
    const calls = recordFetch(() => json({ candidates: [] }))
    const base = "/api/proxy/attack-paths/Payments/jewel-footholds?jewel_ref=bucket-a" +
      "&evaluate=true&evaluation_limit=30&evaluation_budget_ms=8000&max_hops=8"
    const { unmount } = renderHook(() => useAtlasLateral({
      systemName: "Payments", jewelRef: "bucket-a", enabled: true, systemKey: KEY, systemAccountId: ACCOUNT,
    }))
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].url).toBe(`${base}${systemScopeQuery(KEY, ACCOUNT)}`)
    unmount()
    calls.length = 0
    renderHook(() => useAtlasLateral({ systemName: "Payments", jewelRef: "bucket-a", enabled: true }))
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].url).toBe(base)
  })

  it("useZoom0Exfil: the exfil body's system_key beside system_name; by name, the body is byte-identical", async () => {
    const calls = recordFetch(() => json({ ok: true, paths: [] }))
    const { unmount } = renderHook(() => useZoom0Exfil({ systemName: "Payments", jewel, enabled: true, systemKey: KEY }))
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].url).toBe("/api/proxy/attack-chain/exfil-paths")
    const sent = JSON.parse(String(calls[0].init?.body))
    expect([sent.system_name, sent.system_key, sent.jewel_id]).toEqual(["Payments", KEY, JEWEL])
    unmount()
    calls.length = 0
    renderHook(() => useZoom0Exfil({ systemName: "Payments", jewel, enabled: true }))
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].init?.body).toBe(JSON.stringify({
      system_name: "Payments", jewel_id: JEWEL, include_capable: true, include_observed: true, max_destinations: 20,
      include_atlas: false, include_details: false,
    }))
  })
})

// ── the pages ─────────────────────────────────────────────────────────────────────────────────────────────────────

describe("Attack Paths v2 (the system page's Attack Paths tab) names ONE system when opened by key", () => {
  const IAP_BASE = "/api/proxy/identity-attack-paths/"
  function serve(systemsBody: unknown) {
    return recordFetch((url) => {
      if (url.startsWith("/api/proxy/systems")) return json(systemsBody)
      if (url.startsWith(IAP_BASE)) return json(twoCustomers.acme)
      return json({ detail: "not stubbed in this test" }, 404)
    })
  }
  const targetsOf = (calls: Array<{ url: string }>) => calls.find((c) => c.url.includes("/targets"))?.url
  const iapOf = (calls: Array<{ url: string }>) => calls.find((c) => c.url.startsWith(IAP_BASE))?.url

  it.each([
    ["a tag / source key, with its account", "payments", "416651950952"],
    ["an authored key (no account)", "authored_system:pay", null],
  ])("%s: of two systems named Payments, the target catalog and the IAP read are this one's", async (_label, key, account) => {
    const calls = serve(capture(TWO_IDENTITIES).body)
    render(<AttackPathsV2 systemName="Payments" systemKey={key} systemAccountId={account} embedded />)
    await waitFor(() => expect(targetsOf(calls) && iapOf(calls)).toBeTruthy(), { timeout: 5000 })
    const targets = new URL(`https://x${targetsOf(calls)}`)
    expect(targets.pathname).toBe("/api/proxy/attack-paths/Payments/targets")
    expect([targets.searchParams.get("system_key"), targets.searchParams.get("account_id")]).toEqual([key, account])
    expect(iapOf(calls))
      .toBe(`${IAP_BASE}Payments?envelope=true&max_jewels=12&max_paths_per_jewel=8${systemScopeQuery(key, account)}`)
    // The keyed reading is cached under its own key -- never under the name another system shares.
    await waitFor(() => expect(window.localStorage.getItem(`cyntro:swr:iap-v2:5x5:Payments:key=${key}:${account ?? ""}`))
      .not.toBeNull(), { timeout: 5000 })
    expect(window.localStorage.getItem("cyntro:swr:iap-v2:5x5:Payments")).toBeNull()
  }, 30_000)

  it("the system's key from the page URL when no prop names one (a link built by buildAttackPathsV2CjUrl)", async () => {
    setUrl({ system: "Payments", system_key: "payments", account_id: "416651950952" })
    const calls = serve(capture(TWO_IDENTITIES).body)
    render(<AttackPathsV2 />)
    await waitFor(() => expect(targetsOf(calls)).toBeTruthy(), { timeout: 5000 })
    const targets = new URL(`https://x${targetsOf(calls)}`).searchParams
    expect([targets.get("system_key"), targets.get("account_id")]).toEqual(["payments", "416651950952"])
  }, 30_000)

  it("by name (and on every v1 answer): every request and cache key is byte-identical to before", async () => {
    const calls = serve({ systems: [{ name: "payments" }] })
    render(<AttackPathsV2 systemName="payments" embedded />)
    await waitFor(() => expect(targetsOf(calls) && iapOf(calls)).toBeTruthy(), { timeout: 5000 })
    expect(targetsOf(calls)).toBe("/api/proxy/attack-paths/payments/targets")
    expect(iapOf(calls)).toBe(`${IAP_BASE}payments?envelope=true&max_jewels=12&max_paths_per_jewel=8`)
    await waitFor(() => expect(window.localStorage.getItem("cyntro:swr:iap-v2:5x5:payments")).not.toBeNull(),
      { timeout: 5000 })
  }, 30_000)

  it("the Exfil view's body carries system_key beside system_name; by name, the body is byte-identical", async () => {
    setUrl({ mode: "exfil", jewel: JEWEL })
    const exfilOf = (calls: Array<{ url: string; init?: RequestInit }>) =>
      calls.find((c) => c.url === "/api/proxy/attack-chain/exfil-paths")
    let calls = serve(capture(TWO_IDENTITIES).body)
    const { unmount } = render(
      <AttackPathsV2 systemName="Payments" systemKey="payments" systemAccountId="416651950952" embedded />)
    await waitFor(() => expect(exfilOf(calls)).toBeTruthy(), { timeout: 5000 })
    const sent = JSON.parse(String(exfilOf(calls)!.init?.body))
    expect([sent.system_name, sent.system_key, sent.jewel_id]).toEqual(["Payments", "payments", JEWEL])
    unmount()
    calls = serve({ systems: [{ name: "payments" }] })
    render(<AttackPathsV2 systemName="payments" embedded />)
    await waitFor(() => expect(exfilOf(calls)).toBeTruthy(), { timeout: 5000 })
    expect(exfilOf(calls)!.init?.body).toBe(JSON.stringify({
      system_name: "payments", jewel_id: JEWEL, include_capable: true, include_observed: true, max_destinations: 50,
      include_atlas: false, include_details: false, atlas_max_hops: 6,
    }))
  }, 30_000)
})

describe("the Topology tab's crown-jewel list names ONE system when opened by key", () => {
  it("DependencyMapTab requests the IAP jewels by key; by name, the URL is byte-identical", async () => {
    let calls = recordFetch(() => json({ detail: "not stubbed in this test" }, 404))
    const jewelsOf = () => calls.find((c) => c.url.startsWith("/api/proxy/identity-attack-paths/payments/jewels"))?.url
    const { unmount } = render(<DependencyMapTab systemName="payments" systemKey={KEY} systemAccountId={ACCOUNT} />)
    await waitFor(() => expect(jewelsOf()).toBeTruthy(), { timeout: 5000 })
    const sent = new URL(`https://x${jewelsOf()}`).searchParams
    expect([sent.get("system_key"), sent.get("account_id")]).toEqual([KEY, ACCOUNT])
    unmount()
    calls = recordFetch(() => json({ detail: "not stubbed in this test" }, 404))
    render(<DependencyMapTab systemName="payments" />)
    await waitFor(() => expect(jewelsOf()).toBeTruthy(), { timeout: 5000 })
    expect(jewelsOf()).toBe("/api/proxy/identity-attack-paths/payments/jewels")
  }, 30_000)
})

describe("the /all card links each item to ITS system: the key rides with the name", () => {
  type Item = { system_name?: string; system_key?: string | null }
  const reading = (jewel: Item): UseCachedFetchResult<PathsResponse> => ({
    data: {
      crown_jewels: [{ id: JEWEL, name: "acme-data", type: "S3Bucket", severity: "HIGH", path_count: 1, ...jewel }],
      total_jewels: 1, total_paths: 1, exposed_jewels: 0, serve_state: "READY", analysis_complete: true,
    },
    isStale: false, cachedAt: null, staleReason: null, loading: false, isComputing: false, error: null, hold: null,
    choice: null, retry: () => {},
  })
  const REAL_PATH = { path_id: "p1", workload_arn: "arn:aws:lambda:eu-west-1:416651950952:function:checkout",
    severity: "HIGH", confidence: "observed", score: 50 }

  async function click(jewel: Item, summaryPaths: unknown[]) {
    const calls = recordFetch((url) => url.includes("/by-crown-jewel/summary")
      ? json({ system: "Payments", paths_total: summaryPaths.length, observed_paths: 0, choke_points: {}, paths: summaryPaths })
      : json({ detail: "not stubbed in this test" }, 404))
    render(<AttackPathsCard shared={reading(jewel)} />)
    await act(async () => {
      fireEvent.click(screen.getByTitle("Open acme-data in System Map with attack paths"))
    })
    await waitFor(() => expect(nav.push).toHaveBeenCalled())
    const summary = new URL(`https://x${calls.find((c) => c.url.includes("/by-crown-jewel/summary"))!.url}`)
    return { summary, pushed: new URL(`https://x${String(nav.push.mock.calls[0][0])}`) }
  }

  it("a v2 item opens Attack Paths v2 by its key, after reading its summary by key", async () => {
    const { summary, pushed } = await click({ system_name: "Payments", system_key: "payments" }, [REAL_PATH])
    expect(summary.pathname).toBe("/api/proxy/attack-paths/Payments/by-crown-jewel/summary")
    expect(summary.searchParams.get("system_key")).toBe("payments")
    expect(pushed.pathname).toBe("/attack-paths-v2")
    expect([pushed.searchParams.get("system"), pushed.searchParams.get("system_key")]).toEqual(["Payments", "payments"])
  })

  it("a v2 item with no workload path opens the system's Topology spotlight by its key", async () => {
    const { pushed } = await click({ system_name: "Payments", system_key: "payments" }, [])
    expect(pushed.pathname).toBe("/systems")
    expect([pushed.searchParams.get("systemName"), pushed.searchParams.get("system_key")]).toEqual(["Payments", "payments"])
  })

  it("an item without a key (a v1 answer) links by name exactly as before", async () => {
    const { summary, pushed } = await click({ system_name: "payments" }, [REAL_PATH])
    expect(summary.searchParams.has("system_key")).toBe(false)
    expect(`${pushed.pathname}${pushed.search}`).toBe(buildAttackPathsV2CjUrl({ systemName: "payments", jewelId: JEWEL, pathId: "p1" }))
  })
})
/* eslint-enable @typescript-eslint/no-explicit-any */
