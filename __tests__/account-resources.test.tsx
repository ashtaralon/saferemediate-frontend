/**
 * Basic resource discovery in the Inventory: the strict readers of account_discovery/v1 and account_resources/v1, the
 * adapter onto the existing table and drawer, the per-registration reader switch, the live BASIC view and the proxies.
 *
 * Answers are the PRODUCER's captures (backend commit 722bc92d232c628079e88ed189e5373d90d2109a,
 * tests/cyntro_data/test_account_resources_api.py; each fixture's _provenance), delivered by fetchers that return them --
 * mutated only where a case says so (a robustness case the producer never emits).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BasicInventoryView } from "@/components/accounts/basic-inventory-view"
import {
  parseDiscoveryResponse,
  parseResourcesResponse,
  toInventoryRow,
  type DiscoveryStatus,
  type ResourcesFetcher,
} from "@/lib/account-resources"
import { ACTIVATION_CONSENT } from "@/lib/account-admin"

type Name = "discovery_no_plan_yet" | "discovery_complete_with_gaps" | "resources_discovering_page1"
  | "resources_discovering_page2" | "resources_filtered_ecs_task" | "resources_held_account_removed" | "resource_drawer"

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

  function discovering(): DiscoveryStatus {
    const status = parseDiscoveryResponse(200, capture("discovery_complete_with_gaps").body, ACCOUNT) as DiscoveryStatus
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
    const done = parseDiscoveryResponse(200, capture("discovery_complete_with_gaps").body, ACCOUNT) as DiscoveryStatus
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
