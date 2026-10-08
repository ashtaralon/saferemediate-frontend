/**
 * A7 B5 (Settings S2, 2026-10-08): every egress read of a system page opened by KEY names ONE system -- the Egress tab's
 * Traffic Inventory, By workload and Flow map send ?system_key= (+ account_id for a tag / source key) through their proxies,
 * and a 409 system choice is shown as a choice, never as an error and never as one of the systems' data. A page opened by
 * name (and every v1 install) sends exactly the request it sent before.
 *
 * Real bodies only: the egress answer is the captured fixture the panel's own tests use; the 409 is the backend's REAL
 * answer, captured by Phase 2's B5 harness as egress_system_name_ambiguous_409 (systems-list-captures, pinned to the frozen
 * backend SHA at T2). WRITTEN 2026-10-08 in the build-only phase, NOT RUN: the 409 cases are red until that capture exists.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { ambiguousSystemCandidates, systemScopeQuery } from "@/lib/scoped-system-catalog"
import { systemChoiceDetail } from "@/lib/server/proxy-error"
import egressAlonProd from "./fixtures/egress-alon-prod.json"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.example" }))

/* eslint-disable @typescript-eslint/no-explicit-any -- a capture's body is untyped JSON */
const capture = (name: string): { status: number; body: any } =>
  JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/systems-list-captures", `${name}.json`), "utf8"))
const AMBIGUOUS = "egress_system_name_ambiguous_409"
const KEY = "split:payments@team@222222222222/eu-west-1"
const ACCOUNT = "222222222222"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function recordFetch(answer: () => Response) {
  const urls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    urls.push(String(input))
    return answer()
  }))
  return urls
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("systemScopeQuery", () => {
  it("names one system by key, with the account only beside a key; nothing at all without a key", () => {
    expect(systemScopeQuery(null, null)).toBe("")
    expect(systemScopeQuery(undefined, ACCOUNT)).toBe("")
    expect(systemScopeQuery(KEY, null)).toBe(`&system_key=${encodeURIComponent(KEY)}`)
    expect(systemScopeQuery(KEY, ACCOUNT)).toBe(`&system_key=${encodeURIComponent(KEY)}&account_id=${ACCOUNT}`)
  })
})

describe("the three egress views send the key, and only when the page has one", () => {
  it("By workload (EgressVisibilityPanel)", async () => {
    const urls = recordFetch(() => json(egressAlonProd))
    const { EgressVisibilityPanel } = await import("@/components/egress-visibility-panel")
    const { unmount } = render(<EgressVisibilityPanel systemName="alon prod" systemKey={KEY} systemAccountId={ACCOUNT} />)
    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    expect(urls[0]).toBe(`/api/proxy/egress/system/alon%20prod?days=30&top_n=20${systemScopeQuery(KEY, ACCOUNT)}`)
    unmount()
    urls.length = 0
    render(<EgressVisibilityPanel systemName="alon prod" />)
    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    expect(urls[0]).toBe("/api/proxy/egress/system/alon%20prod?days=30&top_n=20")
  })

  it("Flow map (EgressFlowMap)", async () => {
    const urls = recordFetch(() => json(egressAlonProd))
    const { EgressFlowMap } = await import("@/components/dependency-map/egress-flow-map")
    render(<EgressFlowMap systemName="alon prod" systemKey={KEY} systemAccountId={null} />)
    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    expect(urls[0]).toBe(`/api/proxy/egress/system/alon%20prod?days=30&top_n=20${systemScopeQuery(KEY, null)}`)
  })

  it("Traffic Inventory (EgressExternalInventory)", async () => {
    const urls = recordFetch(() => json({ rows: [], total: 0 }))
    const { EgressExternalInventory } = await import("@/components/egress-external-inventory")
    const { unmount } = render(<EgressExternalInventory systemName="alon prod" systemKey={KEY} systemAccountId={ACCOUNT} />)
    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    const keyed = new URL(`https://x${urls[0]}`).searchParams
    expect([keyed.get("system_key"), keyed.get("account_id")]).toEqual([KEY, ACCOUNT])
    unmount()
    urls.length = 0
    render(<EgressExternalInventory systemName="alon prod" />)
    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    const plain = new URL(`https://x${urls[0]}`).searchParams
    expect([plain.has("system_key"), plain.has("account_id")]).toEqual([false, false])
  })
})

describe("a 409 system choice is a choice", () => {
  it.each([
    ["By workload", async () => (await import("@/components/egress-visibility-panel")).EgressVisibilityPanel],
    ["Flow map", async () => (await import("@/components/dependency-map/egress-flow-map")).EgressFlowMap],
    ["Traffic Inventory", async () => (await import("@/components/egress-external-inventory")).EgressExternalInventory],
  ])("%s offers every candidate by its own key and shows no system's data", async (_view, load) => {
    const { status, body } = capture(AMBIGUOUS)
    expect(status).toBe(409)
    recordFetch(() => json({ error: "Backend returned 409", detail: systemChoiceDetail(JSON.stringify(body)) }, 409))
    const View = (await load()) as any
    render(<View systemName={body.detail.system_name} />)
    const choice = await screen.findByTestId("system-name-ambiguous")
    const candidates = ambiguousSystemCandidates(409, body)!
    const hrefs = Array.from(choice.querySelectorAll("a")).map((a) => a.getAttribute("href"))
    expect(hrefs.length).toBe(candidates.length)
    for (const candidate of candidates) expect(hrefs.some((h) => h?.includes(encodeURIComponent(candidate.systemKey)))).toBe(true)
    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument()
  })
})

describe("the egress proxies", () => {
  it("system forwards system_key + account_id, keys its cache by them, and is byte-identical without", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(egressAlonProd))
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/proxy/egress/system/[systemName]/route")
    const call = (query: string) => GET(new NextRequest(`https://cyntro.example/api/proxy/egress/system/alon%20prod?${query}`),
      { params: Promise.resolve({ systemName: "alon prod" }) })
    await call(`days=30&top_n=20&system_key=${encodeURIComponent(KEY)}&account_id=${ACCOUNT}`)
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `https://backend.example/api/egress/system/alon%20prod?days=30&top_n=20${systemScopeQuery(KEY, ACCOUNT)}`)
    await call("days=30&top_n=20")
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://backend.example/api/egress/system/alon%20prod?days=30&top_n=20")
    await call(`days=30&top_n=20&system_key=${encodeURIComponent(`${KEY}x`)}`)
    expect(fetchMock).toHaveBeenCalledTimes(3)       // another key is another system: never a cache hit
  })

  it.each([
    ["system", "@/app/api/proxy/egress/system/[systemName]/route"],
    ["external-inventory", "@/app/api/proxy/egress/system/[systemName]/external-inventory/route"],
  ])("%s relays a 409 system choice the page can read, and nothing raw", async (_name, path) => {
    const { status, body } = capture(AMBIGUOUS)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...body, extra: "never relayed" }, status)))
    const { GET } = await import(path)
    const response = await GET(new NextRequest("https://cyntro.example/api/proxy/egress/system/x?days=30"),
      { params: Promise.resolve({ systemName: "x" }) })
    expect(response.status).toBe(409)
    const relayed = await response.json()
    expect("extra" in relayed).toBe(false)
    expect(ambiguousSystemCandidates(409, relayed)?.map((c) => c.systemKey))
      .toEqual(ambiguousSystemCandidates(409, body)?.map((c) => c.systemKey))
  })

  it("external-inventory forwards system_key + account_id, and neither without a key", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ rows: [], total: 0 }))
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/proxy/egress/system/[systemName]/external-inventory/route")
    const call = (query: string) => GET(
      new NextRequest(`https://cyntro.example/api/proxy/egress/system/alon%20prod/external-inventory?${query}`),
      { params: Promise.resolve({ systemName: "alon prod" }) })
    await call(`days=30&system_key=${encodeURIComponent(KEY)}&account_id=${ACCOUNT}`)
    const keyed = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect([keyed.get("system_key"), keyed.get("account_id")]).toEqual([KEY, ACCOUNT])
    await call(`days=30&account_id=${ACCOUNT}`)
    const plain = new URL(String(fetchMock.mock.calls[1][0])).searchParams
    expect([plain.has("system_key"), plain.has("account_id")]).toEqual([false, false])
  })
})

describe("systemChoiceDetail", () => {
  it("keeps code, name and each candidate's key / name / account; refuses anything else", () => {
    const { body } = capture(AMBIGUOUS)
    const reduced = systemChoiceDetail(JSON.stringify(body))!
    expect(reduced.code).toBe(body.detail.code)
    expect(reduced.candidate_keys.map((c) => c.system_key)).toEqual(body.detail.candidate_keys.map((c: any) => c.system_key))
    expect(systemChoiceDetail(JSON.stringify({ detail: { ...body.detail, code: "SOMETHING_ELSE" } }))).toBeUndefined()
    expect(systemChoiceDetail(JSON.stringify({ detail: { ...body.detail, candidate_keys: [{ account_id: ACCOUNT }] } })))
      .toBeUndefined()
    expect(systemChoiceDetail("<html>bad gateway</html>")).toBeUndefined()
  })
})
/* eslint-enable @typescript-eslint/no-explicit-any */
