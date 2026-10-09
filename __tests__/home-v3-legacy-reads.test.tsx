/**
 * D11 (resident QA, 2026-10-09): Home issued GET /api/proxy/issues-summary and /api/proxy/findings, each answered 422
 * ACCOUNT_SCOPE_REQUIRED on a multi-account install. On the backend both are HELD routes whose handlers declare no
 * account_id, so passing the scope's account would not change the answer; the frontend fix is to not make reads nothing
 * renders.
 *
 * Consumers in app/page.tsx: the security-findings rows and the per-system gap analysis (issues-summary?systemName=) feed
 * ONLY the pre-V3 Home branch -> not read under V3. fetchInfrastructure's issues-summary read is KEPT: the sidebar Issues
 * badge, rendered on every section including the V3 Home, reads its total (pinned below).
 *
 * The REAL app/page.tsx; the Home dashboards and the sidebar are stand-ins that only show what the page hands them.
 */
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const flags = vi.hoisted(() => ({ v3: true }))
vi.mock("@/lib/dashboard-release", () => ({
  get DASHBOARD_V3_ENABLED() {
    return flags.v3
  },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}))
vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({
    customerId: "acme", groupId: "all", accountId: "all", region: "all", loading: false, error: null,
    options: { customer_id: "acme", accounts: [], groups: [] }, customers: [], scopeNotices: [],
    dismissScopeNotices: vi.fn(), setCustomerId: vi.fn(), setGroupId: vi.fn(), setAccountId: vi.fn(), setRegion: vi.fn(),
    refresh: vi.fn(),
  }),
}))
vi.mock("@/components/dashboard/v3/home-dashboard-v3", () => ({ HomeDashboardV3: () => <div data-testid="home-v3" /> }))
vi.mock("@/components/dashboard/v2/home-dashboard-v2", () => ({ HomeDashboardV2: () => <div data-testid="home-v2" /> }))
vi.mock("@/components/left-sidebar-nav", () => ({
  LeftSidebarNav: ({ issuesCount }: { issuesCount?: number }) => (
    <div data-testid="sidebar-issues">{issuesCount === undefined ? "none" : String(issuesCount)}</div>
  ),
}))

import HomePage from "@/app/page"

// The backend's answer on a multi-account install with no account named (cyntro_data/semantic/estate_read._refuse_http).
const ACCOUNT_SCOPE_REQUIRED = {
  detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are registered; name one with account_id" },
}

function serve(issuesSummary: { status: number; body: unknown }) {
  const urls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    urls.push(url)
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
    if (url.startsWith("/api/proxy/issues-summary")) return json(issuesSummary.status, issuesSummary.body)
    if (url.startsWith("/api/proxy/findings")) return json(422, ACCOUNT_SCOPE_REQUIRED)
    return json(404, { detail: "not stubbed in this test" })
  }))
  return urls
}

const findingsReads = (urls: string[]) => urls.filter((url) => url.startsWith("/api/proxy/findings"))
const gapReads = (urls: string[]) => urls.filter((url) => url.startsWith("/api/proxy/issues-summary?systemName="))
const summaryReads = (urls: string[]) => urls.filter((url) => url === "/api/proxy/issues-summary")

async function renderHome() {
  await act(async () => { render(<HomePage />) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

beforeEach(() => {
  flags.v3 = true
  window.localStorage.clear()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Home with the V3 dashboard: reads nothing renders are not made (D11)", () => {
  it("makes no findings read and no gap-analysis read; keeps the summary read the sidebar badge needs", async () => {
    const urls = serve({ status: 422, body: ACCOUNT_SCOPE_REQUIRED })
    await renderHome()
    expect(await screen.findByTestId("home-v3")).toBeTruthy()
    expect(findingsReads(urls)).toEqual([])
    expect(gapReads(urls)).toEqual([])
    expect(summaryReads(urls)).toHaveLength(1)
    // A refused summary is no count: the badge is omitted, never 0.
    expect(screen.getByTestId("sidebar-issues").textContent).toBe("none")
  })

  it("the kept summary read IS consumed under V3: its total is the sidebar Issues badge", async () => {
    serve({ status: 200, body: { total: 7, by_severity: { critical: 1, high: 2, medium: 3, low: 1 } } })
    await renderHome()
    expect(await screen.findByTestId("home-v3")).toBeTruthy()
    expect(screen.getByTestId("sidebar-issues").textContent).toBe("7")
  })

  it("control: without V3 the pre-V3 reads are made exactly as before", async () => {
    flags.v3 = false
    const urls = serve({ status: 422, body: ACCOUNT_SCOPE_REQUIRED })
    await renderHome()
    expect(await screen.findByTestId("home-v2")).toBeTruthy()
    expect(findingsReads(urls)).toHaveLength(1)
    expect(gapReads(urls)).toHaveLength(1)
    expect(summaryReads(urls)).toHaveLength(1)
  })
})
