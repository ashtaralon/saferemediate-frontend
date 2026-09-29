/**
 * The Network-LP consumers show a failed read as a failure: never the previous read's route
 * findings as if current, and never an empty all-clear.
 *
 * The chain is real on both sides of the proxy: the component's own fetch reaches the REAL route
 * handler (app/api/proxy/network-lp-*), and that handler's fetch reaches a test backend that
 * answers, fails, or never answers (the proxy's own abort timer ends it, shortened here).
 * Response bodies are test input; nothing is product data.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { NetworkLpPanel } from "@/components/dependency-map/network-lp-panel"
import { NetworkLpCards, type RouteOut } from "@/components/dependency-map/network-lp-cards"

const BACKEND = "http://backend.test"
process.env.BACKEND_URL_OVERRIDE = BACKEND

type Backend = (url: string, init?: RequestInit) => Promise<Response>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/** Accept the request and never answer; only the proxy's own AbortController ends it. */
const hang: Backend = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")))
  })

const fails =
  (status: number, detail: unknown = "Internal error: boom"): Backend =>
  async () =>
    json({ detail }, status)

const ROUTE: RouteOut = {
  route_id: "rtb-test0001:0.0.0.0/0",
  destination_cidr: "0.0.0.0/0",
  target_kind: "igw",
  path_type: "PUBLIC_INTERNET",
  risk_category: "exposure",
  used: false,
  matched_flow_count: 0,
  last_used: null,
  recommendation: "REMOVE_ROUTE_CANDIDATE",
  suggested_cidr: null,
  blast_radius_reduction: "test reduction line",
  confidence: "HIGH",
  safety_reasons: [],
  rationale: "",
  observed_aws_services: [],
  observed_external_flows: 0,
  via_route_table: "rtb-test0001",
  shared_route_table: false,
  route_state: "active",
  route_origin: null,
}
const SUBNET = { subnet_id: "subnet-test0001", observation_days: 17, route_count: 1, candidate_count: 1, routes: [ROUTE] }
const FINDINGS = { system_id: "test-system", subnet_count: 1, candidate_count: 1, subnets: [SUBNET] }

/** Generous under a loaded CI host: the findings proxy retries a transient 5xx once (400ms). */
const SETTLE = { timeout: 8_000 }
vi.setConfig({ testTimeout: 30_000 })

let backend: Backend = fails(599, "unrouted in test")
let backendCalls = 0
/** React's act() warnings are a race detector here: state settling after an assertion. */
let actWarnings: string[] = []

const PROXIES: Array<[RegExp, string]> = [
  [/^\/api\/proxy\/network-lp-findings(\?|$)/, "@/app/api/proxy/network-lp-findings/route"],
  [/^\/api\/proxy\/network-lp-routes(\?|$)/, "@/app/api/proxy/network-lp-routes/route"],
]

beforeEach(() => {
  // The proxies' cache is module state: every case starts from a freshly loaded, empty one.
  vi.resetModules()
  backendCalls = 0
  actWarnings = []
  backend = fails(599, "unrouted in test")
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const text = args.map(String).join(" ")
    if (text.includes("act(")) actWarnings.push(text)
  })
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (url.startsWith(BACKEND)) {
        backendCalls += 1
        return backend(url, init)
      }
      for (const [pattern, modulePath] of PROXIES) {
        if (!pattern.test(url)) continue
        const mod = (await import(/* @vite-ignore */ modulePath)) as { GET: (req: NextRequest) => Promise<Response> }
        return mod.GET(new NextRequest(`http://localhost${url}`))
      }
      return json({ detail: { code: "UNROUTED_IN_TEST" } }, 599)
    }),
  )
})

afterEach(() => {
  expect(actWarnings).toEqual([])
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Move the proxy's clock past its 2-minute cache TTL, so the next request reaches the backend. */
function ageCache(ms = 3 * 60 * 1000) {
  const realNow = Date.now.bind(Date)
  vi.spyOn(Date, "now").mockImplementation(() => realNow() + ms)
}

/** Shrink only the proxy's own 55s abort timer, so a hung backend reaches it in this test. */
function fastProxyAbort() {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) =>
    realSetTimeout(fn, ms !== undefined && ms >= 20_000 && ms <= 60_000 ? 20 : ms, ...rest)) as typeof setTimeout)
}

/** Nothing from the earlier read, and no all-clear, anywhere on screen. */
function expectNoFindingsShown(container: HTMLElement) {
  const text = container.textContent || ""
  expect(text).not.toContain("Unused Internet Access")
  expect(text).not.toContain("0.0.0.0/0")
  expect(text).not.toContain("rtb-test0001")
  expect(text).not.toContain("subnet-test0001")
  expect(text).not.toMatch(/\d+ candidates? across/)
  expect(text).not.toContain("17d window")
  expect(text).not.toContain("No route findings")
}

// ── /api/proxy/network-lp-findings → NetworkLpPanel (/network-lp page) ────────────────────
describe("NetworkLpPanel", () => {
  it("a first read that fails shows the error, not an all-clear", async () => {
    backend = fails(500)
    const { container } = render(<NetworkLpPanel systemId="test-system" />)
    await screen.findByText(/HTTP 502/, undefined, SETTLE)
    expect(screen.getByRole("button", { name: "retry" })).toBeTruthy()
    expectNoFindingsShown(container)
  })

  it("a refresh that fails after a good read shows the error, not the earlier findings", async () => {
    backend = async () => json(FINDINGS)
    const { container } = render(<NetworkLpPanel systemId="test-system" />)
    await screen.findAllByText("Unused Internet Access", undefined, SETTLE)
    expect(container.textContent).toContain("1 candidates across 1 subnet")

    ageCache()
    backend = fails(500)
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }))
    await screen.findByText(/HTTP 502/, undefined, SETTLE)
    expectNoFindingsShown(container)
    expect(container.textContent).toContain("System test-system · …")
  })

  it("a typed 503 refusal after a good read shows HTTP 503, not the earlier findings", async () => {
    backend = async () => json(FINDINGS)
    const { container } = render(<NetworkLpPanel systemId="test-system" />)
    await screen.findAllByText("Unused Internet Access", undefined, SETTLE)

    ageCache()
    backend = fails(503, { code: "SERVING_READ_REFUSED", message: "serving tier refused the read" })
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }))
    await screen.findByText(/HTTP 503/, undefined, SETTLE)
    expectNoFindingsShown(container)
  })

  it("a hung backend after a good read shows the proxy's 504, not the earlier findings", async () => {
    backend = async () => json(FINDINGS)
    const { container } = render(<NetworkLpPanel systemId="test-system" />)
    await screen.findAllByText("Unused Internet Access", undefined, SETTLE)

    ageCache()
    fastProxyAbort()
    backend = hang
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }))
    await screen.findByText(/HTTP 504/, undefined, SETTLE)
    expectNoFindingsShown(container)
  })

  it("retry after the backend recovers shows the new read", async () => {
    backend = fails(500)
    render(<NetworkLpPanel systemId="test-system" />)
    await screen.findByText(/HTTP 502/, undefined, SETTLE)
    backend = async () => json(FINDINGS)
    fireEvent.click(screen.getByRole("button", { name: "retry" }))
    await screen.findAllByText("Unused Internet Access", undefined, SETTLE)
    expect(screen.queryByText(/HTTP 502/)).toBeNull()
  })

  it("control: a real empty success is the all-clear", async () => {
    backend = async () => json({ system_id: "test-system", subnet_count: 0, candidate_count: 0, subnets: [] })
    render(<NetworkLpPanel systemId="test-system" />)
    await screen.findByText(/No route findings/, undefined, SETTLE)
    expect(backendCalls).toBe(1)
  })
})

// ── /api/proxy/network-lp-routes → NetworkLpCards (exported; no rendered importer today) ──
describe("NetworkLpCards", () => {
  it("a first read that fails shows the error, not an all-clear", async () => {
    backend = fails(500)
    const { container } = render(<NetworkLpCards subnetId="subnet-test0001" subnetLabel="test subnet" />)
    await screen.findByText(/HTTP 502/, undefined, SETTLE)
    expectNoFindingsShown(container)
  })

  it("a refresh that fails after a good read shows the error, not the earlier findings", async () => {
    backend = async () => json(SUBNET)
    const { container } = render(<NetworkLpCards subnetId="subnet-test0001" subnetLabel="test subnet" />)
    await screen.findAllByText("Unused Internet Access", undefined, SETTLE)

    ageCache()
    backend = fails(500)
    fireEvent.click(screen.getByRole("button", { name: /17d window/ }))
    await screen.findByText(/HTTP 502/, undefined, SETTLE)
    expectNoFindingsShown(container)
  })

  it("control: a real empty success is the all-clear", async () => {
    backend = async () => json({ ...SUBNET, candidate_count: 0, routes: [] })
    render(<NetworkLpCards subnetId="subnet-test0001" subnetLabel="test subnet" />)
    await screen.findByText(/No route findings/, undefined, SETTLE)
  })
})

// Guard: the failure tests above really reached the backend, not a cache hit.
it("the failing refresh reaches the backend (not the proxy cache)", async () => {
  backend = async () => json(FINDINGS)
  render(<NetworkLpPanel systemId="test-system" />)
  await screen.findAllByText("Unused Internet Access", undefined, SETTLE)
  ageCache()
  backend = fails(500)
  fireEvent.click(screen.getByRole("button", { name: /Refresh/ }))
  await screen.findByText(/HTTP 502/, undefined, SETTLE)
  await waitFor(() => expect(backendCalls).toBe(2), SETTLE)
})
