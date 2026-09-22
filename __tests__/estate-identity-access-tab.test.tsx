/**
 * Estate · Identity & access — the evidence frame, rendered.
 *
 * These render the real component against fixtures that are literal return
 * values of the backend's build_estate_identity_access (41f5dda3). They assert
 * on the DOM a reader sees, because the failures this surface exists to
 * prevent are VISUAL: a blank panel taken for "there is nothing here".
 *
 * The MAP is no longer drawn here (CF01 · D1): the identity lens renders on
 * the shared Estate canvas, and its drawing rules — planes, motion, anchors,
 * the shared DetailPanel — are covered by __tests__/cf01-d1-*.test.tsx. This
 * suite keeps the words around the canvas honest: states, receipts, gaps and
 * the capability matrix.
 *
 * The companion suite, estate-identity-access-model.test.ts, covers the same
 * decisions at the model layer. Both are needed: the model suite proves the
 * decisions, these prove they reach the screen.
 */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EstateIdentityAccessTab } from "@/components/topology-v0-2/estate-identity-access-tab"

import fixtures from "./fixtures/estate-identity-access.json"
import graphFixture from "./fixtures/cf01-d1/estate-identity-graph-6e08d6b2.json"
import { IdentityLensNotice } from "@/components/topology-v0-2/estate-identity-plane"
import { buildIdentityLensForPayload } from "@/components/topology-v0-2/estate-identity-access-model"

const CAPABILITY_COUNT = fixtures.ready.relationship_capabilities.length
const AVAILABLE_FAMILIES = fixtures.ready.relationship_capabilities
  .filter((row: { status: string }) => row.status === "available")
  .map((row: { family: string }) => row.family)
  .sort()

afterEach(() => {
  cleanup()
  clearMatchMedia()
})

const TOPOLOGY = {
  system: "testbed-webshop",
  account_id: "416651950952",
  region: "eu-west-1",
  vpc_id: "vpc-1",
  scored_at: "2026-09-15T07:00:00Z",
  scoring_window_days: 30,
  system_kpis: null,
  nodes: [],
} as any

/**
 * Answer prefers-reduced-motion for this render.
 *
 * Set on both `window` and `globalThis`: the component reads window.matchMedia,
 * and in some DOM environments those are not the same object. Writing one and
 * reading the other would make every motion assertion below pass for the wrong
 * reason.
 */
const MEDIA_TARGETS: any[] = [globalThis, typeof window === "undefined" ? null : window].filter(
  Boolean,
)

function setReducedMotion(reduce: boolean) {
  const stub = (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
  for (const target of MEDIA_TARGETS) target.matchMedia = stub
}

function clearMatchMedia() {
  for (const target of MEDIA_TARGETS) delete target.matchMedia
}

function renderTab(identityAccess?: unknown, { reduceMotion = false } = {}) {
  setReducedMotion(reduceMotion)
  const payload =
    identityAccess === undefined ? TOPOLOGY : { ...TOPOLOGY, identity_access: identityAccess }
  return render(<EstateIdentityAccessTab payload={payload} />)
}

const panel = () => screen.getByTestId("estate-identity-access")

/**
 * What the tab says about THIS TENANT'S authority: the headline, the detail
 * line beneath it, and the receipt cards.
 *
 * Deliberately not the whole panel. The capability matrix lives in the same
 * panel and describes the installed DATA PATH, not this tenant's data, so it
 * legitimately says things a withheld tenant projection must not — the
 * HAS_POLICY row, for one, explains that configured grants come from the
 * hash-verified decision authority rather than a legacy edge. That sentence is
 * true whatever happens to one tenant's payload, and asserting over the whole
 * panel reads it as a claim about the tenant.
 */
function tenantAuthorityText(): string {
  return [
    screen.getByTestId("identity-headline").textContent ?? "",
    screen.getByTestId("identity-detail").textContent ?? "",
    ...screen.queryAllByTestId("identity-receipt").map(node => node.textContent ?? ""),
  ].join(" ")
}

describe("the evidence frame hands the map to the shared canvas", () => {
  it("does not fall back to one card per role", () => {
    renderTab(fixtures.ready)
    // The old stacked-card surface. If it comes back, this fails.
    expect(screen.queryAllByTestId("identity-graph-row").length).toBe(0)
    expect(screen.queryByTestId("identity-graph")).toBeNull()
  })

  it("renders the host's canvas inside the slot, only in a readable state", () => {
    const payload = { ...TOPOLOGY, identity_access: fixtures.ready } as any
    render(
      <EstateIdentityAccessTab
        payload={payload}
        canvas={<div data-host-canvas="true">shared canvas</div>}
      />,
    )
    expect(
      screen.getByTestId("identity-canvas-slot").querySelector("[data-host-canvas]"),
    ).not.toBeNull()
  })

  it("never renders the canvas slot for an absent block — the notice is the whole surface", () => {
    render(
      <EstateIdentityAccessTab
        payload={TOPOLOGY}
        canvas={<div data-host-canvas="true">shared canvas</div>}
      />,
    )
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
    expect(document.querySelector("[data-host-canvas]")).toBeNull()
    expect(screen.getByTestId("identity-headline").textContent).toMatch(/no identity projection/i)
  })

  it("issues no request of its own — the block rides on the estate payload", () => {
    const fetchSpy = vi.fn()
    const original = globalThis.fetch
    globalThis.fetch = fetchSpy as any
    try {
      renderTab(fixtures.ready)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = original
    }
  })
})

describe("the tab never renders a blank panel", () => {
  it.each([
    ["absent", undefined],
    ["invalid", "not-an-object"],
    ["unavailable", fixtures.unavailable],
    ["ready", fixtures.ready],
    ["incomplete", fixtures.partial_unresolved_role_id],
  ])("state %s still shows a headline and an explanation", (state, block) => {
    renderTab(block)
    expect(panel()).toHaveAttribute("data-state", state)
    expect(screen.getByTestId("identity-headline").textContent!.length).toBeGreaterThan(20)
    expect(screen.getByTestId("identity-detail").textContent!.length).toBeGreaterThan(20)
  })

  it("a snapshot with no identity block does not read as zero roles", () => {
    renderTab()
    const headline = screen.getByTestId("identity-headline").textContent!
    expect(headline).toMatch(/no identity projection/i)
    expect(headline).not.toMatch(/no workload/i)
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
    expect(screen.queryByTestId("identity-empty-authoritative")).toBeNull()
  })

  it("an unavailable projection renders its gap code and draws no map", () => {
    renderTab(fixtures.unavailable)
    const codes = screen
      .getAllByTestId("identity-gap")
      .map(node => node.getAttribute("data-gap-code"))
    expect(codes).toContain("ACTIVE_INVENTORY_POINTER_MISSING")
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
  })

  it("empty-authoritative renders as a QUALIFIED answer, with its generation still shown", () => {
    renderTab(graphFixture.composed.empty_authoritative_with_empty_graph)
    expect(panel()).toHaveAttribute("data-state", "ready")
    const box = screen.getByTestId("identity-empty-authoritative")
    expect(box).toHaveAttribute("data-identity-empty-claim", "qualified_empty")
    // The backed half.
    expect(box.textContent).toMatch(/is an answer, not a missing read/i)
    // And the half the producer cannot back, named rather than implied. No
    // canvas is passed here, so this box is the only surface on screen and
    // must carry the full wording itself.
    expect(screen.getByTestId("identity-empty-coverage-caveat").textContent).toMatch(
      /unknown, not zero/i,
    )
    expect(screen.queryByTestId("identity-empty-coverage-pointer")).toBeNull()
    expect(screen.queryByTestId("identity-gap")).toBeNull()
    expect(screen.getAllByTestId("identity-receipt").length).toBe(2)
  })

  /**
   * Visual QA found the same three-line coverage paragraph printed twice on
   * one screen — once by the canvas notice and again by this box — which made
   * a qualified answer read as noise. The long form belongs wherever it is the
   * only copy on screen.
   */
  /**
   * COMPOSED, and exactly one.
   *
   * The first version of this test rendered the tab WITHOUT its canvas and
   * asserted `<= 1`, which also passes when the long form appears ZERO times —
   * the same fail-open shape as an acquisition flag that only fires on an
   * explicit `False`. The tab and the canvas notice are the two things that can
   * print this paragraph, so the assertion has to see both at once and demand
   * exactly one.
   */
  /**
   * The compact header must SHRINK the surface, not lose any of it. Every
   * diagnostic it stopped showing has to be one click away in Evidence, and
   * the limitations have to stay named on screen rather than reduced to a
   * count a reader must go and decode.
   */
  it("moves diagnostics into Evidence rather than dropping them", () => {
    renderTab(fixtures.ready)
    const evidence = screen.getByTestId("identity-evidence-drawer")
    for (const id of [
      "identity-contract-version",
      "identity-projection-status",
      "identity-coverage-freshness",
      "identity-coverage-families",
      "identity-scope-binding",
      "identity-coverage-limits",
    ]) {
      const node = screen.getByTestId(id)
      expect(evidence.contains(node), `${id} should live in Evidence`).toBe(true)
    }
  })

  it("keeps state, scope, graph, org placement and a NAMED limitation visible", () => {
    renderTab(fixtures.ready)
    const evidence = screen.getByTestId("identity-evidence-drawer")
    for (const id of [
      "identity-coverage-state",
      "identity-coverage-scope",
      "identity-coverage-graph",
      "identity-account-context",
      "identity-coverage-limits-compact",
    ]) {
      const node = screen.getByTestId(id)
      expect(evidence.contains(node), `${id} should stay visible, not in Evidence`).toBe(false)
    }
    // Named, not merely counted — a bare "4 limits" is a number to decode.
    const summary = screen.getByTestId("identity-coverage-limit-summary")
    expect(summary.textContent).toMatch(/not shown:/i)
    expect(summary.textContent!.replace(/not shown:\s*/i, "").length).toBeGreaterThan(8)
  })

  it("every limitation is still recoverable in full", () => {
    renderTab(fixtures.ready)
    const compact = screen.getByTestId("identity-coverage-limits-compact")
    const count = Number(compact.getAttribute("data-limit-count"))
    expect(count).toBeGreaterThan(0)
    expect(screen.getAllByTestId("identity-coverage-limit").length).toBe(count)
    // The hover text carries all of them, so nothing depends on opening the drawer.
    for (const label of screen.getAllByTestId("identity-coverage-limit")) {
      const name = label.querySelector("span")!.textContent!
      expect(compact.getAttribute("title")).toContain(name)
    }
  })

  it("states the coverage caveat exactly once across tab AND canvas", () => {
    const block = graphFixture.composed.empty_authoritative_with_empty_graph
    const payload = { ...TOPOLOGY, identity_access: block } as any
    const lens = buildIdentityLensForPayload(payload, {
      topologyNodes: (TOPOLOGY as any).nodes.map((n: any) => ({ id: n.id, name: n.name, type: n.type })),
    })
    // The canvas the host really passes carries the plane's own notice.
    render(
      <EstateIdentityAccessTab payload={payload} canvas={<IdentityLensNotice lens={lens} />} />,
    )

    const LONG = "Unknown rather than zero here:"
    const occurrences = (panel().textContent ?? "").split(LONG).length - 1
    expect(occurrences).toBe(1)

    // And it is the CANVAS that carries it here, with the tab pointing at it.
    expect(screen.getByTestId("identity-lens-notice-coverage").textContent).toContain(LONG)
    expect(screen.getByTestId("identity-empty-coverage-pointer")).toBeInTheDocument()
    expect(screen.queryByTestId("identity-empty-coverage-caveat")).toBeNull()
  })

  it("when there is no canvas to carry it, the tab states it exactly once itself", () => {
    // No canvas prop: the tab is the only surface, so the long form must be here.
    renderTab(graphFixture.composed.empty_authoritative_with_empty_graph)
    const LONG = "Unknown rather than zero here:"
    const occurrences = (panel().textContent ?? "").split(LONG).length - 1
    expect(occurrences).toBe(1)
    expect(screen.getByTestId("identity-empty-coverage-caveat").textContent).toContain(LONG)
  })

  /**
   * Root review of 147b1100, P1: the host hid a valid graph. These are host
   * RENDER assertions over the real backend-generated fixtures — a model
   * assertion cannot observe a branch that never renders the canvas.
   */
  it("renders the shared canvas whenever the producer supplied graph data", () => {
    for (const block of [
      fixtures.empty_authoritative, // zero roles, ready graph of 5 nodes / 13 edges
      fixtures.ready,
      graphFixture.composed.ready_with_graph,
      graphFixture.composed.partial_with_truncated_graph,
    ]) {
      const payload = { ...TOPOLOGY, identity_access: block } as any
      render(
        <EstateIdentityAccessTab
          payload={payload}
          canvas={<div data-host-canvas="true">shared canvas</div>}
        />,
      )
      expect(
        screen.getByTestId("identity-canvas-slot").querySelector("[data-host-canvas]"),
      ).not.toBeNull()
      cleanup()
    }
  })

  /**
   * BOTH DIRECTIONS, pinned together on purpose.
   *
   * The canvas has two independent sources. Gating on either one alone has now
   * shipped as a defect once each — roles-only hid a ready 13-edge graph, and
   * the fix for it (graph-only) hid two valid role-binding edges. A suite that
   * covers one direction lets a correct-looking fix swing the gate the other
   * way with everything green, which is exactly what happened. These cases are
   * the guard rail: any future change has to satisfy all four rows.
   */
  describe.each([
    // graph supplies, roles do not
    ["empty roles + populated graph", () => fixtures.empty_authoritative, true],
    ["incomplete roles + populated graph", () => fixtures.partial_unresolved_role_id, true],
    ["empty roles + empty-but-READ graph", () => graphFixture.composed.empty_authoritative_with_empty_graph, true],
    // roles supply, graph does not
    ["valid role bindings + ABSENT graph", () => graphFixture.composed.valid_role_bindings_absent_graph, true],
    ["valid role bindings + UNREAD graph", () => graphFixture.composed.valid_role_bindings_unread_graph, true],
    // neither supplies — the only row that may draw nothing
    ["empty roles + unread graph", () => graphFixture.composed.empty_authoritative_with_unread_graph, false],
  ])("either source alone is enough to draw: %s", (_label, block, expected) => {
    it(`renders the canvas: ${expected}`, () => {
      const payload = { ...TOPOLOGY, identity_access: block() } as any
      render(
        <EstateIdentityAccessTab
          payload={payload}
          canvas={<div data-host-canvas="true">shared canvas</div>}
        />,
      )
      expect(
        screen.queryByTestId("identity-canvas-slot")?.querySelector("[data-host-canvas]") != null,
      ).toBe(expected)
    })
  })

  it("a readable roles projection survives a graph that was never read", () => {
    const block = graphFixture.composed.valid_role_bindings_unread_graph as any
    expect(block.roles.length).toBe(1)
    expect(block.identity_graph.status).toBe("unavailable")
    const payload = { ...TOPOLOGY, identity_access: block } as any
    render(
      <EstateIdentityAccessTab
        payload={payload}
        canvas={<div data-host-canvas="true">shared canvas</div>}
      />,
    )
    // The role bindings the producer COULD answer are drawn ...
    expect(
      screen.getByTestId("identity-canvas-slot").querySelector("[data-host-canvas]"),
    ).not.toBeNull()
    // ... and the failed graph read is named beside them, not instead of them.
    expect(screen.getByTestId("identity-coverage-indicator")).toHaveAttribute(
      "data-identity-graph-state",
      "unavailable",
    )
    expect(screen.queryByTestId("identity-empty-authoritative")).toBeNull()
  })

  it("a pre-lane-F payload with no identity_graph key still draws its role bindings", () => {
    const block = graphFixture.composed.valid_role_bindings_absent_graph as any
    expect("identity_graph" in block).toBe(false)
    const payload = { ...TOPOLOGY, identity_access: block } as any
    render(
      <EstateIdentityAccessTab
        payload={payload}
        canvas={<div data-host-canvas="true">shared canvas</div>}
      />,
    )
    expect(
      screen.getByTestId("identity-canvas-slot").querySelector("[data-host-canvas]"),
    ).not.toBeNull()
    expect(screen.getByTestId("identity-coverage-indicator")).toHaveAttribute(
      "data-identity-graph-state",
      "absent",
    )
  })

  it("a graph with nodes but no role bindings still reaches the canvas", () => {
    const payload = {
      ...TOPOLOGY,
      identity_access: {
        ...(fixtures.empty_authoritative as any),
        identity_graph: graphFixture.graph.users_without_credential_rows,
      },
    } as any
    render(
      <EstateIdentityAccessTab
        payload={payload}
        canvas={<div data-host-canvas="true">shared canvas</div>}
      />,
    )
    // Users and policies exist; only workload role bindings are empty.
    expect(
      screen.getByTestId("identity-canvas-slot").querySelector("[data-host-canvas]"),
    ).not.toBeNull()
    expect(screen.queryByTestId("identity-empty-authoritative")).toBeNull()
  })

  /**
   * The empty-authoritative box REPLACES the canvas, so gating it on the roles
   * flag alone did not merely mislabel a state — it hid a fully-read identity
   * graph. The backend's own `empty_authoritative` payload has zero
   * workload-to-role bindings AND thirteen policy, trust and account-context
   * relationships, and those must still reach the map.
   */
  it("roles-empty does not hide a graph the producer actually supplied", () => {
    const payload = { ...TOPOLOGY, identity_access: fixtures.empty_authoritative } as any
    render(
      <EstateIdentityAccessTab
        payload={payload}
        canvas={<div data-host-canvas="true">shared canvas</div>}
      />,
    )
    expect((fixtures.empty_authoritative as any).roles_total).toBe(0)
    expect((fixtures.empty_authoritative as any).identity_graph.edges.length).toBeGreaterThan(0)
    expect(screen.queryByTestId("identity-empty-authoritative")).toBeNull()
    expect(
      screen.getByTestId("identity-canvas-slot").querySelector("[data-host-canvas]"),
    ).not.toBeNull()
  })

  it("an empty canvas whose graph was never read keeps its warning, not the answer copy", () => {
    renderTab(graphFixture.composed.empty_authoritative_with_unread_graph)
    // Same authoritatively-empty roles projection as the test above, so the
    // roles flag alone cannot tell these two apart.
    expect(panel()).toHaveAttribute("data-state", "ready")
    expect(screen.queryByTestId("identity-empty-authoritative")).toBeNull()
    // The failed graph read is named rather than absorbed into an empty map.
    expect(screen.getByTestId("identity-coverage-indicator")).toHaveAttribute(
      "data-identity-graph-state",
      "unavailable",
    )
    expect(screen.getByTestId("identity-coverage-graph").textContent).toMatch(/unavailable/i)
  })

  it("the answer and the unread graph differ on the tab, not only in the model", () => {
    renderTab(graphFixture.composed.empty_authoritative_with_empty_graph)
    const answerGraphState = screen
      .getByTestId("identity-coverage-indicator")
      .getAttribute("data-identity-graph-state")
    const answerBox = screen.queryByTestId("identity-empty-authoritative") !== null
    cleanup()

    renderTab(graphFixture.composed.empty_authoritative_with_unread_graph)
    const unreadGraphState = screen
      .getByTestId("identity-coverage-indicator")
      .getAttribute("data-identity-graph-state")
    const unreadBox = screen.queryByTestId("identity-empty-authoritative") !== null

    expect(answerGraphState).toBe("ready")
    expect(unreadGraphState).toBe("unavailable")
    expect(answerBox).toBe(true)
    expect(unreadBox).toBe(false)
  })

  it("a status this contract does not define is withheld, not rendered", () => {
    renderTab({ ...fixtures.ready, status: "degraded" })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.getByTestId("identity-detail").textContent).toMatch(
      /partial, ready, unavailable/,
    )
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
    // The matrix still applies: it describes the data path, not the tenant.
    expect(screen.getAllByTestId("identity-capability-row").length).toBe(CAPABILITY_COUNT)
  })

  it.each([
    ["roles as an object", { roles: {} }],
    ["gaps as an object", { gaps: {} }],
    ["a malformed scope", { scope: "eu-west-1" }],
    ["a role with no role_id", { roles: [{ name: "web" }] }],
    ["a role whose workload_ids is not a list", { roles: [{ role_id: "R", workload_ids: {} }] }],
  ])("%s renders invalid rather than throwing", (_label, override) => {
    expect(() => renderTab({ ...fixtures.ready, ...override })).not.toThrow()
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
  })

  it("a malformed capability row withholds the matrix but keeps the tenant's map", () => {
    renderTab({
      ...fixtures.ready,
      relationship_capabilities: [...fixtures.ready.relationship_capabilities, { family: "X" }],
    })
    expect(panel()).toHaveAttribute("data-state", "ready")
    expect(screen.getByTestId("identity-canvas-slot")).toBeInTheDocument()
    expect(screen.queryAllByTestId("identity-capability-row").length).toBe(0)
    expect(screen.getByTestId("identity-capability-unavailable").textContent).toMatch(
      /whole matrix is withheld/i,
    )
  })
})

describe("malformed authority never reaches the screen", () => {
  it("a scope whose account_id is an empty array renders nothing of the tenant", () => {
    // The exact bypass: str([]) reads as absent, so the old guard skipped the
    // account comparison and drew one tenant's roles under another's estate.
    renderTab({ ...fixtures.ready, scope: { ...fixtures.ready.scope, account_id: [] } })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
    expect(screen.queryByTestId("identity-scope-verified")).toBeNull()
    expect(screen.getByTestId("identity-detail").textContent).toMatch(/account_id/)
  })

  it.each([
    ["an empty inventory authority", { inventory_authority: {} }],
    ["a null inventory authority", { inventory_authority: null }],
    ["an empty decision authority", { decision_authority: {} }],
    ["a generation that is a string", {
      inventory_authority: { ...(fixtures.ready as any).inventory_authority, generation: "31" },
    }],
  ])("%s draws no map and shows no receipt card", (_label, override) => {
    renderTab({ ...fixtures.ready, ...override })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
    expect(screen.queryAllByTestId("identity-receipt").length).toBe(0)
    expect(screen.getByTestId("identity-receipts-none")).toBeInTheDocument()
  })

  it("never renders a receipt card of em-dashes", () => {
    renderTab({ ...fixtures.ready, inventory_authority: {} })
    expect(panel().textContent).not.toContain("generation —")
  })

  it("never claims hash-verified for a generation with no receipt", () => {
    renderTab({
      ...fixtures.ready,
      decision_authority: {
        ...(fixtures.ready as any).decision_authority,
        projection_receipt_hash: null,
      },
    })
    expect(panel()).toHaveAttribute("data-state", "ready")
    const detail = screen.getByTestId("identity-detail").textContent!
    expect(detail).not.toMatch(/hash-verified/)
    expect(detail).toMatch(/not certifiable/)
  })

  it("never says generation unknown", () => {
    renderTab(fixtures.ready)
    expect(panel().textContent).not.toMatch(/generation unknown/)
  })

  it.each([
    ["roles_returned that does not match the roles carried", { roles_returned: 5 }],
    ["roles_truncated as a string", { roles_truncated: "false" }],
    ["a total its own truncation contradicts", {
      roles_total: 9, roles_returned: 1, roles_omitted_unresolved: 0, roles_truncated: false,
    }],
  ])("%s is withheld rather than coerced", (_label, override) => {
    renderTab({ ...fixtures.ready, ...override })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
    expect(screen.queryByTestId("identity-roles-counts")).toBeNull()
  })

  it("an observed state with malformed counts draws no animated edge", () => {
    const role = JSON.parse(JSON.stringify(fixtures.ready.roles[0]))
    role.observed_use.successful_action_count = "1"
    renderTab({ ...fixtures.ready, roles: [role] })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
    expect(document.querySelectorAll("animate").length).toBe(0)
  })

  it("a configured state with a malformed count claims no action universe", () => {
    const role = JSON.parse(JSON.stringify(fixtures.ready.roles[0]))
    role.configured_grants.exact_action_count = "3"
    renderTab({ ...fixtures.ready, roles: [role] })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(panel().textContent).not.toMatch(/actions granted/)
  })
})

describe("a field the producer always writes is never invented", () => {
  function without(field: string, source: any) {
    const { [field]: _dropped, ...rest } = source
    return rest
  }

  it.each([
    "roles",
    "gaps",
    "roles_total",
    "roles_returned",
    "roles_truncated",
    "roles_omitted_unresolved",
  ])("a payload missing %s draws nothing and shows no counts", field => {
    renderTab(without(field, fixtures.ready))
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
    expect(screen.queryByTestId("identity-roles-counts")).toBeNull()
    expect(screen.queryByTestId("identity-empty-authoritative")).toBeNull()
    expect(screen.getByTestId("identity-detail").textContent).toMatch(/producer always writes/)
  })

  it.each([
    "workload_ids",
    "attachment_modes",
    "configured_grants",
    "observed_use",
    "effective_authorization",
    "gaps",
  ])("a role missing %s draws no node and no edge", field => {
    renderTab({ ...fixtures.ready, roles: [without(field, fixtures.ready.roles[0])] })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
    expect(screen.queryAllByTestId("identity-plane-chip").length).toBe(0)
    expect(screen.queryAllByTestId("identity-flow-edge").length).toBe(0)
  })

  it("an authority missing its receipt-hash key shows no receipt card", () => {
    renderTab({
      ...fixtures.ready,
      inventory_authority: without("projection_receipt_hash", fixtures.ready.inventory_authority),
    })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.queryAllByTestId("identity-receipt").length).toBe(0)
    expect(screen.getByTestId("identity-receipts-none")).toBeInTheDocument()
  })

  it("swapped authorities are refused rather than mislabelled on screen", () => {
    renderTab({
      ...fixtures.ready,
      inventory_authority: (fixtures.ready as any).decision_authority,
      decision_authority: (fixtures.ready as any).inventory_authority,
    })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.getByTestId("identity-detail").textContent).toMatch(/swapped/)
    // No receipt card can attribute a generation to the wrong projection.
    expect(screen.queryAllByTestId("identity-receipt").length).toBe(0)
    // Scoped to the tenant surface: the capability matrix's own hash-verified
    // sentence is about the data path and stays on screen, correctly.
    expect(tenantAuthorityText()).not.toMatch(/hash-verified/)
  })

  it("the capability matrix keeps its hash-verified explanation regardless", () => {
    // The boundary above must not be met by deleting true capability copy. This
    // sentence describes the installed data path -- configured grants come from
    // the decision authority, not a legacy HAS_POLICY edge -- and is just as
    // true when one tenant's projection is withheld.
    renderTab({
      ...fixtures.ready,
      inventory_authority: (fixtures.ready as any).decision_authority,
      decision_authority: (fixtures.ready as any).inventory_authority,
    })
    const rows = screen.getAllByTestId("identity-capability-row")
    expect(rows.length).toBe(CAPABILITY_COUNT)
    const explained = rows.filter(row => /hash-verified/.test(row.textContent ?? ""))
    expect(explained.length).toBeGreaterThan(0)
    // And it is a data-path row, never the tenant's own authority.
    for (const row of explained) {
      expect(row.getAttribute("data-status")).toBe("unavailable")
    }
  })

  it("a withheld role reporting a fabricated zero is refused", () => {
    const role = JSON.parse(
      JSON.stringify(fixtures.partial_no_decision_authority.roles[0]),
    )
    role.observed_use.successful_action_count = 0
    renderTab({ ...fixtures.partial_no_decision_authority, roles: [role] })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    // Neither "0 used" nor the withheld wording gets to appear in what the
    // tab says about THIS TENANT. The capability matrix legitimately says
    // "last-used" about the installed data path (USER_AUTHENTICATES_WITH at
    // 41f5dda3), so the whole panel is not the right scope for this check.
    expect(tenantAuthorityText()).not.toMatch(/used/)
    expect(panel().textContent).not.toMatch(/0 used/)
    expect(panel().textContent).not.toMatch(/no counts — not zero/)
  })

  it("an absent availability never renders as a real refusal would", () => {
    const { availability: _absent, ...rest } = (fixtures.ready as any).roles[0]
      .effective_authorization
    renderTab({
      ...fixtures.ready,
      roles: [
        {
          ...fixtures.ready.roles[0],
          effective_authorization: { ...rest, decision: "ALLOW" },
        },
      ],
    })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(panel().textContent).not.toMatch(/Effective authorization: unavailable/)
  })

  it("a partial payload with an explicitly null decision authority still renders", () => {
    // The legitimate case, unchanged.
    renderTab(fixtures.partial_no_decision_authority)
    expect(panel()).toHaveAttribute("data-state", "ready")
    expect(screen.getByTestId("identity-canvas-slot")).toBeInTheDocument()
    expect(screen.getAllByTestId("identity-receipt").length).toBe(1)
  })

  it.each([
    ["a roles_total", { roles_total: 2 }],
    ["returned roles", { roles_returned: 1 }],
    ["truncation", { roles_truncated: true }],
  ])("an unavailable projection reporting %s is refused", (_label, override) => {
    renderTab({ ...fixtures.unavailable, ...override })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
  })
})

describe("the capability matrix is withheld whole, or not at all", () => {
  it.each([
    ["a reason code outside the closed set", (rows: any[]) =>
      rows.map(row => (row.family === "TRUSTS" ? { ...row, reason_codes: ["MADE_UP"] } : row))],
    ["an unavailable family asserting a plane", (rows: any[]) =>
      rows.map(row => (row.family === "TRUSTS" ? { ...row, plane: "observed" } : row))],
    ["an available family with no bounded read", (rows: any[]) =>
      rows.map(row =>
        row.family === "WORKLOAD_USES_ROLE" ? { ...row, bounded_read: null } : row,
      )],
    ["a duplicated family", (rows: any[]) => [...rows, rows[0]]],
    ["a missing family", (rows: any[]) => rows.filter(row => row.family !== "TRUSTS")],
  ])("%s renders zero family rows and says why", (_label, mutate) => {
    renderTab({
      ...fixtures.ready,
      relationship_capabilities: (mutate as any)(fixtures.ready.relationship_capabilities),
    })
    // The tenant's own map is unaffected: the matrix describes the data path.
    expect(panel()).toHaveAttribute("data-state", "ready")
    expect(screen.getByTestId("identity-canvas-slot")).toBeInTheDocument()
    expect(screen.queryAllByTestId("identity-capability-row").length).toBe(0)
    expect(screen.getByTestId("identity-capability-unavailable")).toBeInTheDocument()
  })

  it("never shows twenty-one rows as a complete account of twenty-two families", () => {
    renderTab({
      ...fixtures.ready,
      relationship_capabilities: fixtures.ready.relationship_capabilities.filter(
        (row: any) => row.family !== "TRUSTS",
      ),
    })
    expect(screen.queryAllByTestId("identity-capability-row").length).not.toBe(21)
    expect(screen.queryAllByTestId("identity-capability-row").length).toBe(0)
    expect(screen.getByTestId("identity-capability-unavailable").textContent).toMatch(
      /no verdict for TRUSTS/,
    )
  })
})

describe("a partial projection with nothing to draw", () => {
  /**
   * This payload has one unresolvable role AND a fully-read graph of 13
   * relationships. The unresolved role is a reason to caveat the map, not a
   * reason to delete it: suppressing the canvas here threw away everything the
   * producer could answer because one dimension could not be rendered.
   */
  it("caveats the map rather than deleting it, and never says nothing is bound", () => {
    renderTab(fixtures.partial_unresolved_role_id)
    expect(panel()).toHaveAttribute("data-state", "incomplete")
    expect((fixtures.partial_unresolved_role_id as any).identity_graph.edges.length).toBeGreaterThan(0)
    const box = screen.getByTestId("identity-incomplete")
    expect(box.textContent).toMatch(/not the whole picture/i)
    expect(box.textContent).toMatch(/no AWS RoleId/i)
    expect(screen.queryByTestId("identity-empty-authoritative")).toBeNull()
    // The graph the producer DID supply still reaches the canvas.
    expect(screen.getByTestId("identity-canvas-slot")).toBeInTheDocument()
    expect(panel().textContent).not.toMatch(/No workload in this scope is bound/)
  })

  it("still says the map is empty for a reason when there is genuinely no graph", () => {
    renderTab({
      ...(fixtures.partial_unresolved_role_id as any),
      identity_graph: graphFixture.graph.unavailable_read_failed,
    })
    expect(panel()).toHaveAttribute("data-state", "incomplete")
    const box = screen.getByTestId("identity-incomplete")
    expect(box.textContent).toMatch(/not because none exist/i)
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
  })

  it("still shows how many roles were counted and omitted", () => {
    renderTab(fixtures.partial_unresolved_role_id)
    expect(screen.getByTestId("identity-roles-counts").textContent).toMatch(/0 shown of 1/)
    expect(screen.getByTestId("identity-roles-omitted").textContent).toMatch(/1 omitted/)
  })

  it("names the projector's own gap code", () => {
    renderTab(fixtures.partial_unresolved_role_id)
    expect(
      screen.getAllByTestId("identity-gap").map(node => node.getAttribute("data-gap-code")),
    ).toContain("ROLE_ID_UNRESOLVED")
  })
})

describe("a readable projection with no decision authority", () => {
  it("does not claim the hash-verified decision authority", () => {
    renderTab(fixtures.partial_no_decision_authority)
    const detail = screen.getByTestId("identity-detail").textContent!
    expect(detail).not.toMatch(/hash-verified/)
    expect(detail).toMatch(/No decision authority was read/i)
  })

  it("shows only the inventory receipt", () => {
    renderTab(fixtures.partial_no_decision_authority)
    const receipts = screen.getAllByTestId("identity-receipt")
    expect(receipts.length).toBe(1)
    expect(receipts[0].textContent).toMatch(/Canonical inventory/)
  })

  it("explains per role why its decisions were withheld", () => {
    renderTab(fixtures.partial_no_decision_authority)
    const gap = screen.getByTestId("identity-role-gap")
    expect(gap.textContent).toMatch(/not the same as zero/i)
    expect(
      within(gap).getAllByTestId("identity-gap").map(n => n.getAttribute("data-gap-code")),
    ).toContain("DECISION_EVIDENCE_UNAVAILABLE")
  })
})

describe("the capability matrix is on screen in every state", () => {
  it("renders every family the fixture rules on, with a status each", () => {
    renderTab(fixtures.ready)
    const rows = screen.getAllByTestId("identity-capability-row")
    expect(rows.length).toBe(CAPABILITY_COUNT)
    const available = rows.filter(row => row.getAttribute("data-status") === "available")
    expect(available.map(row => row.getAttribute("data-family")).sort()).toEqual(AVAILABLE_FAMILIES)
  })

  it("shows no plane chip for an unavailable family", () => {
    renderTab(fixtures.ready)
    const dataAccess = screen
      .getAllByTestId("identity-capability-row")
      .find(row => row.getAttribute("data-family") === "DATA_ACCESS")!
    expect(dataAccess).toHaveAttribute("data-status", "unavailable")
    expect(within(dataAccess).getByTestId("identity-plane-none")).toBeInTheDocument()
    expect(within(dataAccess).queryByTestId("identity-plane")).toBeNull()
    expect(
      within(dataAccess)
        .getAllByTestId("identity-capability-reason")
        .map(node => node.textContent),
    ).toContain("ASSET_ANCHORED_AUTHORITY_ONLY")
  })

  it("survives the unavailable state, where a reader most needs it", () => {
    renderTab(fixtures.unavailable)
    expect(screen.getAllByTestId("identity-capability-row").length).toBe(CAPABILITY_COUNT)
  })

  it("a payload with no matrix says why, and renders no family rows", () => {
    const { relationship_capabilities, ...withoutMatrix } = fixtures.ready as any
    renderTab(withoutMatrix)
    expect(screen.queryAllByTestId("identity-capability-row").length).toBe(0)
    expect(screen.getByTestId("identity-capability-unavailable").textContent).toMatch(
      /not empty/i,
    )
  })
})

describe("scope, tenant and receipt binding", () => {
  it("marks the cross-checked fields verified and customer_id echoed-only", () => {
    renderTab(fixtures.ready)
    const verified = screen
      .getAllByTestId("identity-scope-verified")
      .map(node => node.textContent!)
    expect(verified.some(text => text.includes("account_id ✓ 416651950952"))).toBe(true)
    expect(verified.some(text => text.includes("system_name ✓ testbed-webshop"))).toBe(true)
    expect(
      screen
        .getAllByTestId("identity-scope-echoed")
        .some(node => node.textContent!.includes("customer_id") && node.textContent!.includes("not checked")),
    ).toBe(true)
  })

  it("withholds tenant data when the block was built for a different account", () => {
    renderTab({ ...fixtures.ready, scope: { ...fixtures.ready.scope, account_id: "999988887777" } })
    expect(panel()).toHaveAttribute("data-state", "scope_mismatch")
    expect(screen.queryByTestId("identity-canvas-slot")).toBeNull()
    expect(screen.getByTestId("identity-scope-mismatch").textContent).toMatch(/999988887777/)
    expect(screen.getAllByTestId("identity-capability-row").length).toBe(CAPABILITY_COUNT)
  })

  it("puts the shared canvas before the Evidence drawer and keeps receipts out of the first headline", () => {
    const payload = { ...TOPOLOGY, identity_access: fixtures.ready } as any
    render(
      <EstateIdentityAccessTab
        payload={payload}
        canvas={<div data-host-canvas="true">shared canvas</div>}
      />,
    )
    const root = panel()
    const canvas = screen.getByTestId("identity-canvas-slot")
    const drawer = screen.getByTestId("identity-evidence-drawer")
    const receipts = screen.getByTestId("identity-receipts")
    expect(root.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(canvas.compareDocumentPosition(drawer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(drawer.contains(receipts)).toBe(true)
    expect(drawer.contains(screen.getByTestId("identity-capability-matrix"))).toBe(true)
    expect(screen.getByTestId("identity-evidence-summary").textContent).toMatch(/Evidence/)
    expect(screen.getByTestId("identity-headline").textContent).not.toMatch(/v1:[0-9a-f]{8}/)
    expect(screen.getByTestId("identity-coverage-indicator")).toBeInTheDocument()
    expect(screen.getByTestId("identity-account-context").getAttribute("data-account-context")).toBe(
      "in_organization",
    )
    expect(screen.getAllByTestId("identity-coverage-limit").map(n => n.getAttribute("data-limit-key"))).toEqual(
      ["observed_role_assumption", "principal_data_access", "effective_permission", "kubernetes_rbac"],
    )
  })

  it("names a standalone account as a positive claim", () => {
    renderTab(fixtures.standalone_account)
    expect(screen.getByTestId("identity-account-context").getAttribute("data-account-context")).toBe(
      "standalone",
    )
    expect(screen.getByTestId("identity-account-context-label").textContent).toMatch(
      /not part of an AWS Organization/i,
    )
  })

  it("does not call a missing organization context standalone", () => {
    renderTab(fixtures.partial_no_account_policy_context)
    expect(screen.getByTestId("identity-account-context").getAttribute("data-account-context")).toBe(
      "unknown",
    )
    expect(screen.getByTestId("identity-account-context-label").textContent).toMatch(/not available/i)
    expect(screen.getByTestId("identity-account-context-label").textContent).not.toMatch(
      /not part of an AWS Organization/i,
    )
  })

  it("shows the generation and receipt hash for both authorities", () => {
    renderTab(fixtures.ready)
    const receipts = screen.getAllByTestId("identity-receipt")
    expect(receipts.length).toBe(2)
    expect(
      receipts.map(node => node.getAttribute("data-receipt-scope")).sort(),
    ).toEqual(
      [
        fixtures.ready.inventory_authority.projection_scope,
        fixtures.ready.decision_authority.projection_scope,
      ].sort(),
    )
    expect(
      within(receipts[0]).getByTestId("identity-receipt-generation").textContent,
    ).toBe(String(fixtures.ready.inventory_authority.generation))
  })

  it("says plainly when no authority was read at all", () => {
    renderTab({ ...fixtures.unavailable, inventory_authority: null, decision_authority: null })
    expect(screen.getByTestId("identity-receipts-none").textContent).toMatch(
      /no generation or receipt to show/i,
    )
  })
})

describe("compact focused diagram selection and connected geometry", () => {
  async function model() {
    const { identitySelectionDetail } = await import("@/components/topology-v0-2/estate-identity-access-model")
    const { EstateIdentityAccessDetail } = await import("@/components/topology-v0-2/estate-identity-access-detail")
    const lens = buildIdentityLensForPayload({ ...TOPOLOGY, identity_access: graphFixture.composed.ready_with_graph } as any, { topologyNodes: [] })
    return { lens, identitySelectionDetail, EstateIdentityAccessDetail }
  }

  it.each(["PRINCIPAL_HAS_MANAGED_POLICY", "PRINCIPAL_HAS_INLINE_POLICY", "PRINCIPAL_HAS_PERMISSIONS_BOUNDARY", "ROLE_ACTION_DECISION"])(
    "keeps selected %s in the diagram, with its actual evidence label", async family => {
      const { lens, identitySelectionDetail, EstateIdentityAccessDetail } = await model()
      const role = lens.nodes.find(node => node.kind === "iam_role" && node.label === "web")!
      const edge = lens.edges.find(item => item.family === family && (item.sourceId === role.id || item.targetId === role.id))!
      expect(edge).toBeDefined()
      const selectedId = edge.sourceId === role.id ? edge.targetId : edge.sourceId
      render(<EstateIdentityAccessDetail detail={identitySelectionDetail(lens, selectedId)!} />)
      const diagram = screen.getByTestId("estate-identity-access-path-diagram")
      expect(diagram.querySelector(`[data-node-id="${selectedId}"]`)).not.toBeNull()
      expect(within(diagram).getAllByTestId("estate-identity-access-path-hop").some(button => button.textContent === edge.label)).toBe(true)
      expect(screen.getAllByTestId("estate-identity-relationship").length).toBe(identitySelectionDetail(lens, selectedId)!.relationships.length)
    },
  )

  it("draws a resource→role served join back toward the role, including right-side fan-in", async () => {
    const { lens, identitySelectionDetail, EstateIdentityAccessDetail } = await model()
    const role = lens.nodes.find(node => node.kind === "iam_role" && node.label === "web")!
    const resource = lens.nodes.find(node => node.kind === "protected_resource")!
    const template = lens.edges.find(edge => edge.family === "RESOURCE_POLICY_GRANT")!
    expect(resource).toBeDefined()
    expect(template).toBeDefined()
    // Explicit contract variant, not a claim that the captured producer
    // emits a role-resource join: retain the family/plane and reverse its
    // endpoints to exercise a real allowed direction at the render boundary.
    const variants = [0, 1].map(index => ({
      node: { ...resource, id: `direction-target-${index}` },
      edge: { ...template, id: `direction-edge-${index}`, sourceId: `direction-target-${index}`, targetId: role.id },
    }))
    const extended = { ...lens, nodes: [...lens.nodes, ...variants.map(item => item.node)], edges: [...lens.edges, ...variants.map(item => item.edge)] }
    render(<EstateIdentityAccessDetail detail={identitySelectionDetail(extended, role.id)!} />)
    const diagram = screen.getByTestId("estate-identity-access-path-diagram")
    const center = diagram.querySelector(`[data-node-id="${role.id}"]`)!.parentElement!.style
    for (const { node } of variants) {
      const card = diagram.querySelector(`[data-node-id="${node.id}"]`)!.parentElement!.style
      const path = diagram.querySelector(`[data-testid="estate-identity-access-path-connector"][data-source-id="${node.id}"]`)!
      const coords = path.getAttribute("d")!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
      expect(path.getAttribute("data-target-id")).toBe(role.id)
      expect(coords.slice(0, 2)).toEqual([parseFloat(card.left), parseFloat(card.top) + parseFloat(card.height) / 2])
      expect(coords.at(-2)).toBe(parseFloat(center.left) + parseFloat(center.width))
      expect(coords.at(-1)!).toBeGreaterThan(parseFloat(center.top))
      expect(coords.at(-1)!).toBeLessThan(parseFloat(center.top) + parseFloat(center.height))
    }
  })

  it("connects every off-centre branch to actual card borders and preserves producer direction", async () => {
    const { lens, identitySelectionDetail, EstateIdentityAccessDetail } = await model()
    const role = lens.nodes.find(node => node.kind === "iam_role" && node.label === "web")!
    render(<EstateIdentityAccessDetail detail={identitySelectionDetail(lens, role.id)!} />)
    const diagram = screen.getByTestId("estate-identity-access-path-diagram")
    const boxes = new Map(within(diagram).getAllByTestId("estate-identity-access-path-node").map(card => {
      const style = (card.parentElement as HTMLElement).style
      return [card.getAttribute("data-node-id"), { x: parseFloat(style.left), y: parseFloat(style.top), w: parseFloat(style.width), h: parseFloat(style.height) }]
    }))
    const borders = (point: number[], box: { x: number; y: number; w: number; h: number }) =>
      (point[0] === box.x || point[0] === box.x + box.w) && point[1] >= box.y && point[1] <= box.y + box.h
    let offCentre = 0
    const paths = within(diagram).getAllByTestId("estate-identity-access-path-connector")
      .filter(path => path.closest('[data-family="missing"]') === null)
    expect(paths.length).toBeGreaterThan(1)
    for (const path of paths) {
      const coords = path.getAttribute("d")!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
      const start = coords.slice(0, 2), end = coords.slice(-2)
      const source = boxes.get(path.getAttribute("data-source-id"))!
      const target = boxes.get(path.getAttribute("data-target-id"))!
      expect(source).toBeDefined()
      expect(target).toBeDefined()
      expect(borders(start, source)).toBe(true)
      expect(borders(end, target)).toBe(true)
      if (start[1] !== end[1]) offCentre++
    }
    expect(offCentre).toBeGreaterThan(0)
    // Negative control: the former horizontal row arrow misses the shared
    // role entirely on outer branches, rather than merely looking different.
    const center = boxes.get(role.id)!
    expect([...boxes.values()].some(box => box !== center && !borders([center.x, box.y + box.h / 2], center))).toBe(true)
  })
})
