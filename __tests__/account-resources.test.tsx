/**
 * Basic resource discovery in the Inventory: the strict readers of account_discovery/v1 and account_resources/v1, the
 * adapter onto the existing table and drawer, the per-registration reader switch, the live BASIC view and the proxies.
 *
 * Answers are the PRODUCER's captures (backend commit 0b51e3beebe879faaac3264bfb7500c80068f906,
 * tests/cyntro_data/test_account_resources_api.py; each fixture's _provenance; byte-equal to that commit's), delivered by
 * fetchers that return them -- mutated only where a case says so (another account's or registration's identity, or a
 * robustness case the producer never emits).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BasicInventoryView } from "@/components/accounts/basic-inventory-view"
import {
  emptyPageCopy,
  parseDiscoveryResponse,
  parseResourcesResponse,
  statusFallback,
  toInventoryRow,
  type DiscoveryFetcher,
  type DiscoveryStatus,
  type ResourcesFetcher,
} from "@/lib/account-resources"
import { ACTIVATION_CONSENT } from "@/lib/account-admin"

type Name = "discovery_no_plan_yet" | "discovery_complete_with_gaps" | "resources_discovering_page1"
  | "resources_discovering_page2" | "resources_filtered_ecs_task" | "resources_held_account_removed" | "resource_drawer"
  | "discovery_access_needed" | "resources_empty_unproven_access_denied" | "resources_type_unreadable_access_denied"
  | "discovery_held_account_removed" | "discovery_listed_empty" | "resources_type_listed_empty" | "discovery_partial"
  | "resources_type_partial"

function capture(name: Name): { status: number; body: Record<string, any> } {
  const file = JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/account-resources", `${name}.json`), "utf8"))
  return { status: file.status, body: structuredClone(file.body) }
}

const ACCOUNT: string = capture("resources_discovering_page1").body.account_id

describe("the strict readers", () => {
  it("reads the producer's discovery status, plan-bound", () => {
    const early = parseDiscoveryResponse(200, capture("discovery_no_plan_yet").body, ACCOUNT) as DiscoveryStatus
    expect([early.kind, early.coverageState, early.complete, early.plan, early.planState]).toEqual(
      ["status", "DISCOVERING", false, null, "PLAN_NOT_RECORDED"])
    const done = parseDiscoveryResponse(200, capture("discovery_complete_with_gaps").body, ACCOUNT) as DiscoveryStatus
    expect([done.coverageState, done.complete, done.observedTotalLabel, done.totalsByType]).toEqual(
      ["COMPLETE_WITH_GAPS", true, "found", { "ec2:instance": 7 }])
    expect(done.gaps.find((gap) => gap.resource_type === "ecs:task")?.status).toBe("UNSUPPORTED")
  })

  it("never accepts a COMPLETE run without its plan, another account's answer, or a malformed count", () => {
    const body = capture("discovery_complete_with_gaps").body
    expect(parseDiscoveryResponse(200, { ...body, plan: null }, ACCOUNT).kind).toBe("outcome")
    expect(parseDiscoveryResponse(200, body, "444455556666").kind).toBe("outcome")
    expect(parseDiscoveryResponse(200, { ...body, observed_total: -1 }, ACCOUNT).kind).toBe("outcome")
    // A run being shown names its registration and run (the view is bound to them).
    expect(parseDiscoveryResponse(200, { ...body, run_id: null }, ACCOUNT).kind).toBe("outcome")
    expect(parseDiscoveryResponse(200, { ...body, registration_id: null }, ACCOUNT).kind).toBe("outcome")
  })

  it("reads a live page and refuses a row that claims decision eligibility or another filter's rows", () => {
    const page = parseResourcesResponse(200, capture("resources_discovering_page1").body, ACCOUNT, null)
    expect(page.kind).toBe("page")
    if (page.kind !== "page") return
    expect([page.items.length, page.coverageState, page.observedTotalLabel, page.nextCursor !== null]).toEqual(
      [5, "DISCOVERING", "found_so_far", true])
    const eligible = capture("resources_discovering_page1").body
    eligible.items[0].decision_eligibility = { eligible: true, reason: "SUPPORTED" }
    expect(parseResourcesResponse(200, eligible, ACCOUNT, null).kind).toBe("outcome")
    expect(parseResourcesResponse(200, capture("resources_discovering_page1").body, ACCOUNT, "ecs:task").kind).toBe("outcome")
  })

  it("a filtered page names its type's state once the plan exists (null before it); an unfiltered page never does", () => {
    // Robustness: before the plan, the producer's per-type states are empty, so a filtered page's type_state is null.
    const filtered = capture("resources_filtered_ecs_task").body
    expect(parseResourcesResponse(200, { ...filtered, type_state: null }, ACCOUNT, "ecs:task").kind).toBe("page")
    const whole = capture("resources_discovering_page1").body
    expect(parseResourcesResponse(200, { ...whole, type_state: filtered.type_state }, ACCOUNT, null).kind).toBe("outcome")
  })

  it("reads a held answer as held, with its code and no rows", () => {
    const held = parseResourcesResponse(200, capture("resources_held_account_removed").body, ACCOUNT, null)
    expect(held).toEqual({ kind: "outcome", status: 200, state: "held", reasonCode: "ACCOUNT_REMOVED" })
  })

  it("shows a BASIC row in the table's shape with nothing invented", () => {
    const item = capture("resources_discovering_page1").body.items[0]
    const row = toInventoryRow(item)
    expect(row.observation).toEqual({ configuration_hash: null, last_verified_at: null })
    expect(row.eligibility).toEqual({ selectable: false, reason: "BASIC_ONLY" })
    expect(row.tags).toBeUndefined()
    expect(row.details).toEqual({ ...item.summary, provider_state: item.provider_state })
  })
})

describe("the confirmation", () => {
  it("carries the discovery consent beside the collect-and-show consent", () => {
    expect(ACTIVATION_CONSENT).toEqual({ consent: "collect_and_show", consent_version: "v2",
      discovery_consent: "discover_resources", discovery_consent_version: "v1" })
  })
})

describe("the BASIC view", () => {
  const pages: ResourcesFetcher = async (_account, request) => {
    if (request.resourceType === "ecs:task") return capture("resources_filtered_ecs_task")
    return request.cursor ? capture("resources_discovering_page2") : capture("resources_discovering_page1")
  }

  type Bound = DiscoveryStatus & { registrationId: string; runId: string }

  function discovering(): Bound {
    const status = parseDiscoveryResponse(200, capture("discovery_complete_with_gaps").body, ACCOUNT) as Bound
    return { ...status, coverageState: "DISCOVERING", complete: false, observedTotalLabel: "found_so_far" }
  }

  it("says what was found so far, where it looked, and lists the rows page by page", async () => {
    render(<BasicInventoryView accountId={ACCOUNT} accountLabel={ACCOUNT} status={discovering()} fetchPage={pages} />)
    expect(screen.getByTestId("discovery-status").textContent).toContain("7 resources found so far · Discovering")
    expect(screen.getByTestId("inventory-scope").textContent).toContain("1 enabled Region plus global resources")
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    await waitFor(() => expect(screen.getAllByRole("row").length).toBe(6))     // header + 5
    fireEvent.click(screen.getByRole("button", { name: "Load more" }))
    await waitFor(() => expect(screen.getAllByRole("row").length).toBe(8))     // header + 7
  })

  it("names the gaps (never zero resources) once the run finished, and the drawer says basic, not verified", async () => {
    const done = parseDiscoveryResponse(200, capture("discovery_complete_with_gaps").body, ACCOUNT) as Bound
    render(<BasicInventoryView accountId={ACCOUNT} accountLabel={ACCOUNT} status={done} fetchPage={pages} />)
    expect(screen.getByTestId("discovery-status").textContent).toContain("7 resources found · Discovery finished")
    fireEvent.click(screen.getByRole("button", { name: "View coverage" }))
    expect(screen.getByTestId("discovery-gaps").textContent).toContain("Not supported yet")
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    await waitFor(() => expect(screen.getAllByRole("row").length).toBe(6))
    fireEvent.click(screen.getAllByRole("button", { name: /web-/ })[0])
    expect(screen.getByTestId("basic-evidence").textContent).toContain("Basic discovery")
    expect(screen.getByTestId("basic-evidence").textContent).toContain("Not a verified configuration")
    expect(screen.getByTestId("basic-details-status").textContent).toContain("Further details not supported")
  })
})

describe("the proxies", () => {
  const fetchMock = vi.fn()
  afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); vi.resetModules() })

  async function route(path: string) {
    vi.doMock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.example" }))
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockResolvedValue(new Response(JSON.stringify(capture("resources_discovering_page1").body), { status: 200 }))
    return import(path)
  }

  it("relays the listing to the backend route with only its allowlisted query", async () => {
    const { GET } = await route("@/app/api/proxy/accounts/[accountId]/resources/route")
    const answer = await GET(new NextRequest(`https://console.example/api/proxy/accounts/${ACCOUNT}/resources?limit=5`),
      { params: Promise.resolve({ accountId: ACCOUNT }) })
    expect(answer.status).toBe(200)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://backend.example/api/accounts/${ACCOUNT}/resources?limit=5`)
    const bad = await GET(new NextRequest(`https://console.example/api/proxy/accounts/${ACCOUNT}/resources?region=x`),
      { params: Promise.resolve({ accountId: ACCOUNT }) })
    expect([bad.status, await bad.json()]).toEqual([400, { error: "PROXY_QUERY_INVALID" }])
  })

  it("refuses a resource key the backend never minted, before any request", async () => {
    const { GET } = await route("@/app/api/proxy/accounts/[accountId]/resources/[resourceKey]/route")
    const answer = await GET(new NextRequest(`https://console.example/x?resource_type=ec2:instance`),
      { params: Promise.resolve({ accountId: ACCOUNT, resourceKey: "../../admin" }) })
    expect([answer.status, await answer.json()]).toEqual([400, { error: "PROXY_RESOURCE_KEY_INVALID" }])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("the per-registration reader switch", () => {
  afterEach(() => { vi.resetModules(); vi.doUnmock("@/lib/account-resources"); vi.doUnmock("@/components/system-boundary/declarable-account-inventory") })

  async function gate(answer: { status: number; body: unknown }) {
    vi.doMock("@/components/system-boundary/declarable-account-inventory", () => ({
      DeclarableAccountInventory: () => <p data-testid="published-reader">published inventory reader</p>,
    }))
    vi.doMock("@/lib/account-resources", async (real) => ({
      ...(await real<typeof import("@/lib/account-resources")>()),
      fetchDiscovery: async () => answer,
      fetchResourcesPage: async () => capture("resources_discovering_page1"),
    }))
    const { InventorySource } = await import("@/components/accounts/account-inventory-gate")
    await act(async () => { render(<InventorySource accountId={ACCOUNT} account={null} />) })   // the status answer settles inside act
  }

  it("a registration with a discovery run reads its live BASIC listing", async () => {
    await gate(capture("discovery_complete_with_gaps"))
    expect(await screen.findByTestId("basic-inventory")).toBeTruthy()
    expect(screen.queryByTestId("published-reader")).toBeNull()
  })

  it.each([
    ["no run (NOT_REQUESTED)", { status: 200, body: { ...capture("discovery_no_plan_yet").body, coverage_state: "NOT_REQUESTED",
      run_id: null, plan_state: null } }],
    ["an older backend without the route", { status: 404, body: { detail: "Not Found" } }],
    ["a refusal", { status: 403, body: { error: "PROXY_BACKEND_UNREACHABLE" } }],
  ])("%s keeps the published inventory reader exactly as before", async (_name, answer) => {
    await gate(answer)
    expect(await screen.findByTestId("published-reader")).toBeTruthy()
    expect(screen.queryByTestId("basic-inventory")).toBeNull()
  })
})

// ── Codex review of ea268c75: bound to account + registration + run; failures named with a retry; absence only where proved ──

type Answer = { status: number; body: any }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const R1 = { registration: "a".repeat(32), run: capture("discovery_complete_with_gaps").body.run_id as string }
const R2 = { registration: "c".repeat(32), run: "d".repeat(32) }
const OTHER_ACCOUNT = "444455556666"

/** The producer's DISCOVERING status (a moving run: the view polls it). */
function discoveringBody(): any {
  return { ...capture("discovery_complete_with_gaps").body, coverage_state: "DISCOVERING", complete: false,
    observed_total_label: "found_so_far" }
}

/** Another identity's answer: the producer's shape with only the account, registration, run and row names changed. */
function as(answer: Answer, identity: { account?: string; registration: string; run: string }, prefix = ""): Answer {
  const body = structuredClone(answer.body)
  if (identity.account) body.account_id = identity.account
  body.registration_id = identity.registration
  body.run_id = identity.run
  if (Array.isArray(body.items)) body.items = body.items.map((item: any) => ({ ...item, name: `${prefix}${item.name}` }))
  return { status: answer.status, body }
}

function rowNames(): string[] {
  return screen.queryAllByRole("row").slice(1).map((row) => within(row).getAllByRole("button")[0].textContent ?? "")
}

describe("the BASIC view is bound to account, registration and run", () => {
  afterEach(() => { vi.resetModules(); vi.doUnmock("@/components/system-boundary/declarable-account-inventory") })

  async function source() {
    vi.doMock("@/components/system-boundary/declarable-account-inventory", () => ({
      DeclarableAccountInventory: () => <p data-testid="published-reader">published inventory reader</p>,
    }))
    return (await import("@/components/accounts/account-inventory-gate")).InventorySource
  }

  it("a new account shows nothing of the previous one, and the previous account's late answers are dropped", async () => {
    const InventorySource = await source()
    const pageA = deferred<Answer>()
    const statusB = deferred<Answer>()
    const status: DiscoveryFetcher = async (account) => account === ACCOUNT ? { status: 200, body: discoveringBody() } : statusB.promise
    const pages: ResourcesFetcher = async (account) => account === ACCOUNT ? pageA.promise
      : as(capture("resources_discovering_page1"), { account: OTHER_ACCOUNT, ...R2 }, "b-")
    const { rerender } = render(<InventorySource accountId={ACCOUNT} account={null} fetchStatus={status} fetchPage={pages} pollMs={60_000} />)
    await screen.findByTestId("basic-inventory")
    fireEvent.click(screen.getByRole("button", { name: "List" }))                // account A's first page: in flight
    rerender(<InventorySource accountId={OTHER_ACCOUNT} account={null} fetchStatus={status} fetchPage={pages} pollMs={60_000} />)
    expect(screen.queryByTestId("basic-inventory")).toBeNull()                    // nothing of A while B's status is read
    expect(screen.getByText(/Loading the inventory/)).toBeTruthy()
    await act(async () => { pageA.resolve(capture("resources_discovering_page1")) })
    expect(rowNames()).toEqual([])
    await act(async () => { statusB.resolve({ status: 200, body: { ...as({ status: 200, body: discoveringBody() }, { account: OTHER_ACCOUNT, ...R2 }).body } }) })
    fireEvent.click(await screen.findByRole("button", { name: "List" }))
    await waitFor(() => expect(rowNames().length).toBe(5))
    expect(rowNames().every((name) => name.startsWith("b-web-"))).toBe(true)
  })

  it("a re-added registration with the same count and state starts over: no row, cursor or open drawer survives", async () => {
    const InventorySource = await source()
    let current = R1
    const status: DiscoveryFetcher = async () => as({ status: 200, body: discoveringBody() }, current)
    const pages: ResourcesFetcher = async (_account, request) => {
      const prefix = current === R1 ? "" : "r2-"
      return as(capture(request.cursor ? "resources_discovering_page2" : "resources_discovering_page1"), current, prefix)
    }
    render(<InventorySource accountId={ACCOUNT} account={null} fetchStatus={status} fetchPage={pages} pollMs={20} />)
    fireEvent.click(await screen.findByRole("button", { name: "List" }))
    fireEvent.click(await screen.findByRole("button", { name: "web-0" }))
    expect(screen.getByTestId("basic-evidence")).toBeTruthy()
    current = R2                                                                 // same coverage, same count (7)
    await waitFor(() => expect(screen.queryByTestId("basic-evidence")).toBeNull())
    expect(rowNames()).toEqual([])                                                // remounted: grouped, nothing expanded
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    await waitFor(() => expect(rowNames().length).toBe(5))
    expect(rowNames().every((name) => name.startsWith("r2-web-"))).toBe(true)
  })

  it("a late load-more of the previous run never lands in the new run's view", async () => {
    const InventorySource = await source()
    let current = R1
    const more = deferred<Answer>()
    const status: DiscoveryFetcher = async () => as({ status: 200, body: discoveringBody() }, current)
    const pages: ResourcesFetcher = async (_account, request) => {
      if (request.cursor) return more.promise
      return as(capture("resources_discovering_page1"), current, current === R1 ? "" : "r2-")
    }
    render(<InventorySource accountId={ACCOUNT} account={null} fetchStatus={status} fetchPage={pages} pollMs={20} />)
    fireEvent.click(await screen.findByRole("button", { name: "List" }))
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }))     // R1's page 2: in flight
    current = R2
    await waitFor(() => expect(screen.queryByRole("button", { name: "web-0" })).toBeNull())
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    await waitFor(() => expect(rowNames().length).toBe(5))
    await act(async () => { more.resolve(as(capture("resources_discovering_page2"), R1)) })
    expect(rowNames().length).toBe(5)
    expect(rowNames().every((name) => name.startsWith("r2-web-"))).toBe(true)
  })

  it("a rejection that arrives after the identity changed is dropped, never shown in the new view", async () => {
    const InventorySource = await source()
    let current = R1
    const late = deferred<Answer>()
    const status: DiscoveryFetcher = async () => as({ status: 200, body: discoveringBody() }, current)
    const pages: ResourcesFetcher = async () => current === R1 ? late.promise : as(capture("resources_discovering_page1"), R2, "r2-")
    render(<InventorySource accountId={ACCOUNT} account={null} fetchStatus={status} fetchPage={pages} pollMs={20} />)
    fireEvent.click(await screen.findByRole("button", { name: "List" }))          // R1's first page: in flight
    current = R2
    await waitFor(() => expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("false"))
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    await waitFor(() => expect(rowNames().length).toBe(5))
    await act(async () => { late.reject(new TypeError("Failed to fetch")) })
    expect(screen.queryByTestId("basic-page-failed")).toBeNull()
    expect(rowNames().length).toBe(5)
  })

  it("a page naming another registration or run is never shown; the status is re-read instead", async () => {
    const refresh = vi.fn()
    const status = parseDiscoveryResponse(200, discoveringBody(), ACCOUNT) as DiscoveryStatus & { registrationId: string; runId: string }
    const pages: ResourcesFetcher = async () => as(capture("resources_discovering_page1"), R2, "r2-")
    render(<BasicInventoryView accountId={ACCOUNT} accountLabel={ACCOUNT} status={status} fetchPage={pages} onRefreshStatus={refresh} />)
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(rowNames()).toEqual([])
  })

  it("a held run shows that it is held and nothing of it, even over an open view and drawer", async () => {
    const InventorySource = await source()
    let held = false
    const status: DiscoveryFetcher = async () => held ? capture("discovery_held_account_removed") : { status: 200, body: discoveringBody() }
    const pages: ResourcesFetcher = async () => capture("resources_discovering_page1")
    render(<InventorySource accountId={ACCOUNT} account={null} fetchStatus={status} fetchPage={pages} pollMs={20} />)
    fireEvent.click(await screen.findByRole("button", { name: "List" }))
    fireEvent.click(await screen.findByRole("button", { name: "web-0" }))
    held = true
    expect((await screen.findByTestId("discovery-held")).textContent).toContain("ACCOUNT_REMOVED")
    expect(screen.queryByTestId("basic-inventory")).toBeNull()
    expect(screen.queryByTestId("basic-evidence")).toBeNull()
    expect(screen.queryByTestId("published-reader")).toBeNull()
  })
})

describe("a failed request is named, with a retry", () => {
  afterEach(() => { vi.resetModules(); vi.doUnmock("@/components/system-boundary/declarable-account-inventory") })
  const status = () => parseDiscoveryResponse(200, discoveringBody(), ACCOUNT) as DiscoveryStatus & { registrationId: string; runId: string }

  it("a rejected first page says so, and the retry recovers", async () => {
    let calls = 0
    const pages: ResourcesFetcher = async () => {
      calls += 1
      if (calls === 1) throw new TypeError("Failed to fetch")
      return capture("resources_discovering_page1")
    }
    render(<BasicInventoryView accountId={ACCOUNT} accountLabel={ACCOUNT} status={status()} fetchPage={pages} />)
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    const failed = await screen.findByTestId("basic-page-failed")
    fireEvent.click(within(failed).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(rowNames().length).toBe(5))
  })

  it("a rejected load-more keeps the rows, names the failure, and its retry recovers", async () => {
    let more = 0
    const pages: ResourcesFetcher = async (_account, request) => {
      if (!request.cursor) return capture("resources_discovering_page1")
      more += 1
      if (more === 1) throw new TypeError("Failed to fetch")
      return capture("resources_discovering_page2")
    }
    render(<BasicInventoryView accountId={ACCOUNT} accountLabel={ACCOUNT} status={status()} fetchPage={pages} />)
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }))
    expect(await screen.findByTestId("basic-more-failed")).toBeTruthy()
    expect(rowNames().length).toBe(5)
    const retry = screen.getByRole("button", { name: "Retry loading more" })
    expect(retry.hasAttribute("disabled")).toBe(false)
    fireEvent.click(retry)
    await waitFor(() => expect(rowNames().length).toBe(7))
    expect(screen.queryByTestId("basic-more-failed")).toBeNull()
  })

  it("a status that cannot be read is named with a retry (never the published reader, never empty)", async () => {
    vi.doMock("@/components/system-boundary/declarable-account-inventory", () => ({
      DeclarableAccountInventory: () => <p data-testid="published-reader">published inventory reader</p>,
    }))
    const { InventorySource } = await import("@/components/accounts/account-inventory-gate")
    let calls = 0
    const fetchStatus: DiscoveryFetcher = async () => {
      calls += 1
      if (calls === 1) throw new TypeError("Failed to fetch")
      return capture("discovery_complete_with_gaps")
    }
    render(<InventorySource accountId={ACCOUNT} account={null} fetchStatus={fetchStatus}
      fetchPage={async () => capture("resources_discovering_page1")} pollMs={60_000} />)
    const unavailable = await screen.findByTestId("discovery-unavailable")
    expect(screen.queryByTestId("published-reader")).toBeNull()
    fireEvent.click(within(unavailable).getByRole("button", { name: "Retry" }))
    expect(await screen.findByTestId("basic-inventory")).toBeTruthy()
  })

  it("a refresh that fails after a good answer keeps that answer and says the refresh failed", async () => {
    vi.doMock("@/components/system-boundary/declarable-account-inventory", () => ({
      DeclarableAccountInventory: () => <p data-testid="published-reader">published inventory reader</p>,
    }))
    const { InventorySource } = await import("@/components/accounts/account-inventory-gate")
    let calls = 0
    const fetchStatus: DiscoveryFetcher = async () => {
      calls += 1
      if (calls > 1) return { status: 503, body: { error: "PROXY_BACKEND_UNREACHABLE" } }
      return { status: 200, body: discoveringBody() }
    }
    render(<InventorySource accountId={ACCOUNT} account={null} fetchStatus={fetchStatus}
      fetchPage={async () => capture("resources_discovering_page1")} pollMs={20} />)
    expect(await screen.findByTestId("discovery-refresh-failed")).toBeTruthy()
    expect(screen.getByTestId("basic-inventory")).toBeTruthy()
  })

  it("which status failures fall back to the published reader", () => {
    const unconfigured = { schema_version: "account_discovery/v1", account_id: ACCOUNT, state: "unavailable",
      reason_code: "ACCOUNT_REGISTRY_UNCONFIGURED" }
    const fallback = (answer: Answer) => {
      const parsed = parseDiscoveryResponse(answer.status, answer.body, ACCOUNT)
      return parsed.kind === "outcome" ? statusFallback(parsed) : "status"
    }
    expect(fallback({ status: 503, body: unconfigured })).toBe("published")         // no registry: no discovery here
    expect(fallback({ status: 503, body: { ...unconfigured, reason_code: "RESOURCE_DISCOVERY_STORE_UNCONFIGURED" } })).toBe("unavailable")
    expect(fallback({ status: 502, body: { error: "PROXY_BACKEND_UNREACHABLE" } })).toBe("unavailable")
    expect(fallback({ status: 404, body: { detail: "Not Found" } })).toBe("published")  // an older backend
  })
})

describe("an absence is claimed only where it was proved", () => {
  it("every EC2 scope denied: the type is named as access needed, never 'none found'", async () => {
    const status = parseDiscoveryResponse(200, capture("discovery_access_needed").body, ACCOUNT) as
      DiscoveryStatus & { registrationId: string; runId: string }
    const pages: ResourcesFetcher = async (_account, request) =>
      capture(request.resourceType === "ec2:instance" ? "resources_type_unreadable_access_denied" : "resources_empty_unproven_access_denied")
    render(<BasicInventoryView accountId={ACCOUNT} accountLabel={ACCOUNT} status={status} fetchPage={pages} />)
    expect(screen.getByTestId("discovery-status").textContent).toContain(
      "No resources shown · Discovery finished · 1 resource type could not be read")
    const group = screen.getByTestId("inventory-group")
    expect(within(group).getByTestId("inventory-group-state").textContent).toBe("Access needed")
    fireEvent.click(within(group).getByRole("button", { expanded: false }))
    expect((await screen.findByTestId("basic-page-empty")).textContent).toBe(
      "These resources could not be read: access needed (ec2:DescribeInstances).")
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    await waitFor(() => expect(screen.getByTestId("basic-page-empty").textContent).toContain("Nothing could be shown"))
    expect(screen.getByTestId("basic-inventory").textContent).not.toMatch(/None found|No resources were found|0 resources found/)
  })

  it("an unsupported type is not supported, never empty", () => {
    const page = parseResourcesResponse(200, capture("resources_filtered_ecs_task").body, ACCOUNT, "ecs:task")
    expect(page.kind === "page" && [page.state, page.typeState?.state]).toEqual(["type_unsupported", "UNSUPPORTED"])
    expect(emptyPageCopy("type_unsupported", null)).toBe("This resource type is not supported yet: Cyntro does not list it.")
  })

  it("a type listed with nothing is proved empty; the account is not claimed empty", async () => {
    const status = parseDiscoveryResponse(200, capture("discovery_listed_empty").body, ACCOUNT) as
      DiscoveryStatus & { registrationId: string; runId: string }
    render(<BasicInventoryView accountId={ACCOUNT} accountLabel={ACCOUNT} status={status}
      fetchPage={async () => capture("resources_type_listed_empty")} />)
    expect(screen.getByTestId("discovery-status").textContent).toContain(
      "None found in the supported resource types · Discovery finished · other types are not supported yet")
    expect(screen.getByTestId("basic-empty").textContent).toBe(
      "None found in the supported resource types. Other types are not supported yet (see coverage).")
    const typed = parseResourcesResponse(200, capture("resources_type_listed_empty").body, ACCOUNT, "ec2:instance")
    expect(typed.kind === "page" && emptyPageCopy(typed.state as never, typed.typeState)).toBe(
      "None: every place this was listed returned nothing.")
  })

  it("a partial listing keeps its rows and says partial", async () => {
    const status = parseDiscoveryResponse(200, capture("discovery_partial").body, ACCOUNT) as
      DiscoveryStatus & { registrationId: string; runId: string }
    render(<BasicInventoryView accountId={ACCOUNT} accountLabel={ACCOUNT} status={status}
      fetchPage={async () => capture("resources_type_partial")} />)
    const group = screen.getByTestId("inventory-group")
    expect(within(group).getByTestId("inventory-group-state").textContent).toBe("Partial")
    expect(within(group).getByTestId("inventory-group-count").textContent).toBe("3")
    fireEvent.click(within(group).getByRole("button", { expanded: false }))
    await waitFor(() => expect(rowNames().length).toBe(3))
    expect(screen.getByTestId("basic-page-type-state").textContent).toContain("Partial")
  })
})
