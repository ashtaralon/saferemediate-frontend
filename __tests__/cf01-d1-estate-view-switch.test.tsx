/// <reference types="vitest/globals" />
/**
 * CF01 · D1 — Identity & access is a selectable third Estate view, on the
 * shared canvas, and "unavailable is not zero" reaches the screen.
 *
 * `EstateMapView` is mounted with its data hooks replaced: `useCachedFetch`
 * answers the topology-risk request with the estate payload (+ the 41f5
 * identity block under test) and every other request with nothing, the
 * product scope is a fixed context, and `next/dynamic` renders its target
 * synchronously so the Command map is a real render, not a spinner. Nothing
 * here proves the proxy or the backend; it proves the view switch, the
 * shared frame, the reused DetailPanel and the not-available copy.
 */

import React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import type { TopologyRiskResponse } from "@/components/topology-v0-2/types"

import graphFixture from "./fixtures/cf01-d1/estate-identity-graph-6e08d6b2.json"
import { estatePayload, installLayoutStub } from "./fixtures/cf01-d1/network-fixture"

let topologyPayload: TopologyRiskResponse | null = null

vi.mock("@/lib/use-cached-fetch", () => ({
  clearCachedFetch: () => {},
  writeCache: () => {},
  STALE_BACKEND_RECOVERING: "backend recovering",
  STALE_AGED_OUT: "cached reading",
  RECOVERY_POLL_MS: 12_000,
  useCachedFetch: (url: string | null) => {
    const isTopology = typeof url === "string" && url.includes("/api/proxy/topology-risk/")
    return {
      data: isTopology ? topologyPayload : null,
      isStale: false,
      cachedAt: null,
      staleReason: null,
      loading: false,
      isComputing: false,
      error: null,
      retry: () => {},
    }
  },
}))

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({
    customerId: "testbed-webshop",
    groupId: "all",
    accountId: "416651950952",
    region: "eu-west-1",
    options: null,
    customers: [],
    loading: false,
    error: null,
    scopeNotices: [],
    dismissScopeNotices: () => {},
    setCustomerId: () => {},
    setGroupId: () => {},
    setAccountId: () => {},
    setRegion: () => {},
    refresh: () => {},
  }),
}))

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<any> }>) => {
    const Lazy = React.lazy(loader)
    return function DynamicStub(props: Record<string, unknown>) {
      return (
        <React.Suspense fallback={<div data-testid="dynamic-loading" />}>
          <Lazy {...props} />
        </React.Suspense>
      )
    }
  },
}))

vi.mock("@/components/inventory/resource-config-tab", () => ({
  ResourceConfigTab: () => <div data-testid="resource-config-tab-stub" />,
}))

import { EstateMapView } from "@/components/topology-v0-2/estate-map-view"

let restoreLayout: () => void = () => {}

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

beforeEach(() => {
  window.localStorage.clear()
  const fetchStub = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({}),
    text: async () => "",
    headers: new Headers(),
  })
  globalThis.fetch = fetchStub as any
  restoreLayout = installLayoutStub()
})

afterEach(() => {
  cleanup()
  restoreLayout()
  restoreLayout = () => {}
  topologyPayload = null
})

function withIdentity(identityAccess: unknown): TopologyRiskResponse {
  const base = estatePayload()
  return identityAccess === undefined
    ? base
    : ({ ...base, identity_access: identityAccess } as TopologyRiskResponse)
}

const tab = (label: string) => screen.getByRole("tab", { name: label })

async function mount(identityAccess: unknown, props: Partial<React.ComponentProps<typeof EstateMapView>> = {}) {
  topologyPayload = withIdentity(identityAccess)
  const view = render(<EstateMapView systemName="testbed-webshop" {...props} />)
  await waitFor(() => {
    expect(screen.getByRole("tablist", { name: "Estate view" })).toBeInTheDocument()
  })
  return view
}

describe("CF01-D1 · Identity & access is a third peer view", () => {
  it("offers exactly three tabs — Command map, Network topology, Identity & access — and opens on the Command map", async () => {
    await mount(graphFixture.composed.ready_with_graph)
    const tablist = screen.getByRole("tablist", { name: "Estate view" })
    const tabs = within(tablist).getAllByRole("tab").map(t => t.textContent)
    expect(tabs).toEqual(["Command map", "Network topology", "Identity & access"])
    expect(tab("Command map").getAttribute("aria-selected")).toBe("true")
    expect(tab("Identity & access").getAttribute("aria-selected")).toBe("false")
    // Only the selected view renders.
    expect(screen.queryByTestId("identity-lens-plane")).toBeNull()
    expect(screen.queryByTestId("estate-identity-access")).toBeNull()
    expect(screen.queryByTestId("topology-vpc-frame")).toBeNull()
  })

  it("selecting Identity & access renders the SHARED frame with the identity plane, and nothing else", async () => {
    await mount(graphFixture.composed.ready_with_graph)
    fireEvent.click(tab("Identity & access"))
    expect(tab("Identity & access").getAttribute("aria-selected")).toBe("true")
    // The evidence frame around the canvas, the canvas slot, the shared VPC
    // frame inside it, and the identity plane inside THAT.
    const evidence = screen.getByTestId("estate-identity-access")
    expect(evidence.getAttribute("data-state")).toBe("ready")
    const slot = within(evidence).getByTestId("identity-canvas-slot")
    expect(within(slot).getByTestId("topology-vpc-frame")).toBeInTheDocument()
    expect(within(slot).getByTestId("identity-lens-plane")).toBeInTheDocument()
    expect(within(slot).getByTestId("identity-lens-legend")).toBeInTheDocument()
    // Network-only chrome is not on the identity canvas.
    expect(screen.queryByTestId("topology-flow-legend")).toBeNull()
    expect(screen.queryByTestId("topology-platform-map-summary")).toBeNull()
    expect(screen.queryByTestId("topology-estate-view-density")).toBeNull()
    // The identity lines are routed by the shared overlay.
    await waitFor(() => {
      expect(slot.querySelectorAll("g[data-flow-family]").length).toBeGreaterThan(0)
    })
    expect(slot.querySelector('g[data-flow-family="WORKLOAD_USES_ROLE"]')!.getAttribute("data-flow-source")).toBe("i-web")
  })

  it("switching back to Network topology restores the Network frame with no identity plane", async () => {
    await mount(graphFixture.composed.ready_with_graph)
    fireEvent.click(tab("Identity & access"))
    fireEvent.click(tab("Network topology"))
    expect(tab("Network topology").getAttribute("aria-selected")).toBe("true")
    expect(screen.getByTestId("topology-vpc-frame")).toBeInTheDocument()
    expect(screen.queryByTestId("identity-lens-plane")).toBeNull()
    expect(screen.queryByTestId("identity-lens-legend")).toBeNull()
    expect(screen.queryByTestId("estate-identity-access")).toBeNull()
    expect(screen.getByTestId("topology-flow-legend")).toBeInTheDocument()
    expect(screen.getByTestId("topology-estate-view-density")).toBeInTheDocument()
    await waitFor(() => {
      expect(document.querySelectorAll("g[data-flow-source]").length).toBeGreaterThan(0)
    })
    expect(document.querySelector("g[data-flow-family]")).toBeNull()
  })

  it("opens on Identity & access when the host asks (the ?view=identity deep link)", async () => {
    await mount(graphFixture.composed.ready_with_graph, { defaultView: "identity" })
    expect(tab("Identity & access").getAttribute("aria-selected")).toBe("true")
    expect(screen.getByTestId("identity-lens-plane")).toBeInTheDocument()
  })

  it("the tabs are keyboard reachable buttons with tab semantics", async () => {
    await mount(graphFixture.composed.ready_with_graph)
    const identityTab = tab("Identity & access")
    expect(identityTab.tagName).toBe("BUTTON")
    identityTab.focus()
    expect(document.activeElement).toBe(identityTab)
  })
})

describe("CF01-D1 · unavailable is not zero, in the view", () => {
  it.each([
    ["absent", undefined, /no identity projection/i],
    ["null", null, /no identity projection/i],
    ["an empty object", {}, /contract this tab does not read/i],
    ["a wrong contract version", { ...graphFixture.composed.ready_with_graph, contract_version: "estate-identity-access/v2" }, /contract this tab does not read/i],
  ])("%s identity_access renders the not-available notice and never a silent empty canvas", async (_label, block, headline) => {
    await mount(block)
    fireEvent.click(tab("Identity & access"))
    const evidence = screen.getByTestId("estate-identity-access")
    expect(evidence.getAttribute("data-state")).not.toBe("ready")
    expect(screen.getByTestId("identity-headline").textContent).toMatch(headline)
    const text = evidence.textContent ?? ""
    expect(text).toMatch(/says nothing about how many roles|withheld/i)
    expect(text).not.toMatch(/No workload in this scope is bound/)
    // No canvas at all in this state — the words are the whole surface.
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
    expect(screen.queryByTestId("topology-vpc-frame")).toBeNull()
    expect(document.querySelector("g[data-flow-family]")).toBeNull()
  })

  it("the producer's unavailable projection shows its gap code, not zero roles", async () => {
    const v1 = (await import("./fixtures/estate-identity-access.json")).default
    await mount(v1.unavailable)
    fireEvent.click(tab("Identity & access"))
    expect(screen.getByTestId("estate-identity-access").getAttribute("data-state")).toBe("unavailable")
    expect(screen.getAllByTestId("identity-gap").map(g => g.getAttribute("data-gap-code"))).toContain(
      "ACTIVE_INVENTORY_POINTER_MISSING",
    )
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
  })
})

describe("CF01-D1 · selection on the identity lens reuses the shared DetailPanel", () => {
  it("clicking a role chip opens the same detail panel with the identity evidence section", async () => {
    await mount(graphFixture.composed.ready_with_graph)
    fireEvent.click(tab("Identity & access"))
    const plane = screen.getByTestId("identity-lens-plane")
    const roleChip = plane.querySelector('[data-identity-kind="iam_role"] [data-flow-id]') as HTMLElement
    expect(roleChip).not.toBeNull()
    fireEvent.click(roleChip)
    const panel = await screen.findByTestId("topology-service-detail-panel")
    expect(panel.textContent).toMatch(/Identity & access · IAM role/)
    expect(within(panel).getByTestId("estate-identity-detail")).toBeInTheDocument()
    expect(within(panel).getAllByTestId("estate-identity-relationship").length).toBeGreaterThan(0)
    // The neighbourhood control appears for the focused chip.
    expect(screen.getByTestId("identity-neighbourhood-counts").textContent).toMatch(/Around /)
    // Escape closes the panel, as on the Network view.
    fireEvent.keyDown(window, { key: "Escape" })
    await waitFor(() => {
      expect(screen.queryByTestId("topology-service-detail-panel")).toBeNull()
    })
  })

  it("clicking the workload chip on the identity lens opens its ordinary panel with the identity section added", async () => {
    await mount(graphFixture.composed.ready_with_graph)
    fireEvent.click(tab("Identity & access"))
    const slot = screen.getByTestId("identity-canvas-slot")
    const web = slot.querySelector('[data-flow-id="i-web"]') as HTMLElement
    fireEvent.click(web)
    const panel = await screen.findByTestId("topology-service-detail-panel")
    expect(panel.textContent).toMatch(/Estate operations · EC2/)
    const rows = within(panel).getAllByTestId("estate-identity-relationship")
    expect(rows.map(r => r.getAttribute("data-family"))).toEqual(["WORKLOAD_USES_ROLE"])
  })

  it("the hop control bounds the neighbourhood and reports what is not drawn", async () => {
    await mount(graphFixture.composed.ready_with_graph)
    fireEvent.click(tab("Identity & access"))
    const plane = screen.getByTestId("identity-lens-plane")
    const roleChip = plane.querySelector('[data-identity-kind="iam_role"] [data-flow-id]') as HTMLElement
    fireEvent.click(roleChip)
    await screen.findByTestId("identity-hops-1")
    fireEvent.click(screen.getByTestId("identity-hops-1"))
    expect(screen.getByTestId("identity-hops-1").getAttribute("aria-pressed")).toBe("true")
    const counts = screen.getByTestId("identity-neighbourhood-counts").textContent!
    const drawn = Number(/(\d+) drawn/.exec(counts)![1])
    const omitted = Number(/(\d+) not drawn/.exec(counts)?.[1] ?? "0")
    expect(drawn).toBeGreaterThan(0)
    expect(drawn + omitted).toBe(graphFixture.composed.ready_with_graph.identity_graph.edges.length + 2)
  })
})
