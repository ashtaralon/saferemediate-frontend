/**
 * Estate · Identity & access tab — rendered.
 *
 * These render the real component against fixtures that are literal return
 * values of the backend's build_estate_identity_access. They assert on the DOM
 * a reader sees, because the failures this tab exists to prevent are VISUAL: a
 * blank panel taken for "there is nothing here", and a moving line taken for
 * live traffic that was never observed.
 *
 * The companion suite, estate-identity-access-model.test.ts, covers the same
 * decisions at the model layer. Both are needed: the model suite proves the
 * decisions, these prove they reach the screen.
 */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EstateIdentityAccessTab } from "@/components/topology-v0-2/estate-identity-access-tab"

import fixtures from "./fixtures/estate-identity-access.json"

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
const canvas = () => screen.getByTestId("identity-map-canvas")

describe("the surface is a directional map, not a list of cards", () => {
  it("draws the relationships on an SVG canvas", () => {
    renderTab(fixtures.partial)
    const svg = canvas()
    expect(svg.tagName.toLowerCase()).toBe("svg")
    expect(svg.getAttribute("role")).toBe("img")
    expect(svg.getAttribute("aria-label")).toMatch(/workload to role to decision/i)
  })

  it("places every node of the graph on the canvas, in three lanes", () => {
    renderTab(fixtures.partial)
    const nodes = within(canvas()).getAllByTestId("identity-map-node")
    // 2 workloads + 2 roles + 2 decisions.
    expect(nodes.length).toBe(6)
    const lanes = nodes.map(node => node.getAttribute("data-node-lane"))
    expect(new Set(lanes)).toEqual(new Set(["workload", "role", "decision"]))
    const labels = within(canvas())
      .getAllByTestId("identity-map-lane-label")
      .map(node => node.textContent)
    expect(labels).toEqual(["WORKLOAD", "IAM ROLE", "DECISION AUTHORITY"])
  })

  it("draws a directional edge per relationship, with an arrowhead at the target", () => {
    renderTab(fixtures.partial)
    const edges = within(canvas()).getAllByTestId("identity-map-edge")
    // 2 attachments + 2 decision hops.
    expect(edges.length).toBe(4)
    for (const edge of edges) {
      const path = edge.querySelector("path")!
      expect(path.getAttribute("marker-end")).toMatch(/^url\(#identity-arrow-/)
      expect(path.getAttribute("d")).toMatch(/^M /)
    }
  })

  it("points every edge from workload to role to decision, never backwards", () => {
    renderTab(fixtures.partial)
    for (const edge of within(canvas()).getAllByTestId("identity-map-edge")) {
      const from = edge.getAttribute("data-edge-from")!
      const to = edge.getAttribute("data-edge-to")!
      if (edge.getAttribute("data-edge-family") === "WORKLOAD_USES_ROLE") {
        expect(from.startsWith("workload:")).toBe(true)
        expect(to.startsWith("role:")).toBe(true)
      } else {
        expect(from.startsWith("role:")).toBe(true)
        expect(to.startsWith("decision:")).toBe(true)
      }
    }
  })

  it("labels each edge with the plane it stands on", () => {
    renderTab(fixtures.partial)
    const planes = within(canvas())
      .getAllByTestId("identity-map-edge-label")
      .map(node => node.textContent)
      .sort()
    expect(planes).toEqual(["configured", "configured", "configured", "observed"])
  })

  it("does not fall back to one card per role", () => {
    renderTab(fixtures.partial)
    // The old surface. If it comes back, this fails.
    expect(screen.queryAllByTestId("identity-graph-row").length).toBe(0)
    expect(screen.queryByTestId("identity-graph")).toBeNull()
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

describe("configured and observed are visually distinct, and only one may move", () => {
  it("draws a configured edge dashed and still", () => {
    renderTab(fixtures.partial)
    const configured = within(canvas())
      .getAllByTestId("identity-map-edge")
      .filter(edge => edge.getAttribute("data-edge-plane") === "configured")
    expect(configured.length).toBe(3)
    for (const edge of configured) {
      expect(edge.getAttribute("data-edge-animated")).toBe("false")
      expect(edge.querySelector("path")!.getAttribute("stroke-dasharray")).toBe("4 5")
      expect(edge.querySelector("animate")).toBeNull()
      expect(edge.querySelector("path")!.getAttribute("marker-end")).toBe(
        "url(#identity-arrow-configured)",
      )
    }
  })

  it("animates the observed hop, and only that one", () => {
    renderTab(fixtures.partial)
    const animated = within(canvas())
      .getAllByTestId("identity-map-edge")
      .filter(edge => edge.getAttribute("data-edge-animated") === "true")
    expect(animated.length).toBe(1)
    expect(animated[0].getAttribute("data-edge-plane")).toBe("observed")
    expect(animated[0].getAttribute("data-edge-to")).toBe("decision:AROAEXAMPLE")
    expect(animated[0].querySelector("animate")).not.toBeNull()
    expect(animated[0].querySelector("path")!.getAttribute("marker-end")).toBe(
      "url(#identity-arrow-observed)",
    )
  })

  it("never animates a payload whose decisions were not read", () => {
    renderTab(fixtures.partial_no_decision_authority)
    expect(canvas().querySelectorAll("animate").length).toBe(0)
    const edges = within(canvas()).getAllByTestId("identity-map-edge")
    expect(edges.length).toBeGreaterThan(0)
    expect(edges.every(edge => edge.getAttribute("data-edge-animated") === "false")).toBe(true)
  })

  it("explains both planes in the legend", () => {
    renderTab(fixtures.partial)
    expect(screen.getByTestId("identity-map-legend-configured").textContent).toMatch(
      /never observed, never moves/i,
    )
    expect(screen.getByTestId("identity-map-legend-observed").textContent).toMatch(
      /named decision generation/i,
    )
  })
})

describe("reduced motion", () => {
  it("stops every animation when the viewer asks for it", () => {
    renderTab(fixtures.partial, { reduceMotion: true })
    expect(screen.getByTestId("identity-map")).toHaveAttribute("data-motion", "reduced")
    expect(canvas().querySelectorAll("animate").length).toBe(0)
    expect(
      within(canvas())
        .getAllByTestId("identity-map-edge")
        .every(edge => edge.getAttribute("data-edge-animated") === "false"),
    ).toBe(true)
  })

  it("loses no information when motion is off — same nodes, edges and planes", () => {
    renderTab(fixtures.partial, { reduceMotion: true })
    const still = {
      nodes: within(canvas()).getAllByTestId("identity-map-node").length,
      edges: within(canvas()).getAllByTestId("identity-map-edge").length,
      planes: within(canvas())
        .getAllByTestId("identity-map-edge-label")
        .map(node => node.textContent)
        .sort(),
    }
    cleanup()
    renderTab(fixtures.partial, { reduceMotion: false })
    expect(still.nodes).toBe(within(canvas()).getAllByTestId("identity-map-node").length)
    expect(still.edges).toBe(within(canvas()).getAllByTestId("identity-map-edge").length)
    expect(still.planes).toEqual(
      within(canvas())
        .getAllByTestId("identity-map-edge-label")
        .map(node => node.textContent)
        .sort(),
    )
  })

  it("says the map is unchanged without motion", () => {
    renderTab(fixtures.partial, { reduceMotion: true })
    expect(screen.getByTestId("identity-map-motion-note").textContent).toMatch(
      /identical without it/i,
    )
  })

  it("defaults to no motion when the preference cannot be read", () => {
    clearMatchMedia()
    render(
      <EstateIdentityAccessTab
        payload={{ ...TOPOLOGY, identity_access: fixtures.partial } as any}
      />,
    )
    expect(screen.getByTestId("identity-map")).toHaveAttribute("data-motion", "reduced")
    expect(canvas().querySelectorAll("animate").length).toBe(0)
  })
})

describe("it works at any width", () => {
  it("scales with a viewBox instead of a fixed pixel width", () => {
    renderTab(fixtures.partial)
    const svg = canvas()
    expect(svg.getAttribute("viewBox")).toMatch(/^0 0 \d+(\.\d+)? \d+(\.\d+)?$/)
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet")
    // A hard pixel width would not respond to the container at all.
    expect(svg.getAttribute("width")).toBeNull()
    expect(svg.getAttribute("class")).toContain("w-full")
  })

  it("scrolls the canvas rather than crushing it on a narrow screen", () => {
    renderTab(fixtures.partial)
    const frame = screen.getByTestId("identity-map-canvas-frame")
    expect(frame.getAttribute("class")).toContain("overflow-x-auto")
    expect(canvas().getAttribute("class")).toContain("min-w-[720px]")
  })

  it("carries the whole map as text, for narrow screens and screen readers", () => {
    renderTab(fixtures.partial)
    const rows = within(screen.getByTestId("identity-map-fallback")).getAllByTestId(
      "identity-map-fallback-row",
    )
    expect(rows.length).toBe(within(canvas()).getAllByTestId("identity-map-edge").length)
    for (const row of rows) {
      expect(row.textContent).toMatch(/→/)
      expect(["configured", "observed"]).toContain(row.getAttribute("data-edge-plane"))
    }
  })

  it("names the direction of every relationship in words", () => {
    renderTab(fixtures.partial)
    const text = screen.getByTestId("identity-map-fallback").textContent!
    expect(text).toContain("runs as →")
    expect(text).toContain("decided by →")
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
    expect(screen.queryByTestId("identity-map")).toBeNull()
    expect(screen.queryByTestId("identity-empty-authoritative")).toBeNull()
  })

  it("an unavailable projection renders its gap code and draws no map", () => {
    renderTab(fixtures.unavailable)
    const codes = screen
      .getAllByTestId("identity-gap")
      .map(node => node.getAttribute("data-gap-code"))
    expect(codes).toContain("ACTIVE_INVENTORY_POINTER_MISSING")
    expect(screen.queryByTestId("identity-map")).toBeNull()
  })

  it("empty-authoritative renders as an ANSWER, with its generation still shown", () => {
    renderTab(fixtures.empty_authoritative)
    expect(panel()).toHaveAttribute("data-state", "ready")
    expect(screen.getByTestId("identity-empty-authoritative").textContent).toMatch(
      /is an answer, not a missing read/i,
    )
    expect(screen.queryByTestId("identity-gap")).toBeNull()
    expect(screen.getAllByTestId("identity-receipt").length).toBe(2)
  })

  it("a status this contract does not define is withheld, not rendered", () => {
    renderTab({ ...fixtures.ready, status: "degraded" })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.getByTestId("identity-detail").textContent).toMatch(
      /partial, ready, unavailable/,
    )
    expect(screen.queryByTestId("identity-map")).toBeNull()
    // The matrix still applies: it describes the data path, not the tenant.
    expect(screen.getAllByTestId("identity-capability-row").length).toBe(15)
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
    expect(screen.queryByTestId("identity-map")).toBeNull()
  })

  it("a malformed capability row withholds the matrix but keeps the tenant's map", () => {
    renderTab({
      ...fixtures.ready,
      relationship_capabilities: [...fixtures.ready.relationship_capabilities, { family: "X" }],
    })
    expect(panel()).toHaveAttribute("data-state", "ready")
    expect(screen.getByTestId("identity-map")).toBeInTheDocument()
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
    expect(screen.queryByTestId("identity-map")).toBeNull()
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
    expect(screen.queryByTestId("identity-map")).toBeNull()
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
    expect(screen.queryByTestId("identity-map")).toBeNull()
    expect(screen.queryByTestId("identity-roles-counts")).toBeNull()
  })

  it("an observed state with malformed counts draws no animated edge", () => {
    const role = JSON.parse(JSON.stringify(fixtures.ready.roles[0]))
    role.observed_use.successful_action_count = "1"
    renderTab({ ...fixtures.ready, roles: [role] })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.queryByTestId("identity-map-canvas")).toBeNull()
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
    expect(screen.queryByTestId("identity-map")).toBeNull()
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
    expect(screen.queryByTestId("identity-map-canvas")).toBeNull()
    expect(screen.queryAllByTestId("identity-map-node").length).toBe(0)
    expect(screen.queryAllByTestId("identity-map-edge").length).toBe(0)
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
    expect(panel().textContent).not.toMatch(/hash-verified/)
  })

  it("a withheld role reporting a fabricated zero is refused", () => {
    const role = JSON.parse(
      JSON.stringify(fixtures.partial_no_decision_authority.roles[0]),
    )
    role.observed_use.successful_action_count = 0
    renderTab({ ...fixtures.partial_no_decision_authority, roles: [role] })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    // Neither "0 used" nor the withheld wording gets to appear.
    expect(panel().textContent).not.toMatch(/used/)
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
    expect(screen.getByTestId("identity-map")).toBeInTheDocument()
    expect(screen.getAllByTestId("identity-receipt").length).toBe(1)
  })

  it.each([
    ["a roles_total", { roles_total: 2 }],
    ["returned roles", { roles_returned: 1 }],
    ["truncation", { roles_truncated: true }],
  ])("an unavailable projection reporting %s is refused", (_label, override) => {
    renderTab({ ...fixtures.unavailable, ...override })
    expect(panel()).toHaveAttribute("data-state", "invalid")
    expect(screen.queryByTestId("identity-map")).toBeNull()
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
    expect(screen.getByTestId("identity-map")).toBeInTheDocument()
    expect(screen.queryAllByTestId("identity-capability-row").length).toBe(0)
    expect(screen.getByTestId("identity-capability-unavailable")).toBeInTheDocument()
  })

  it("never shows fourteen rows as a complete account of fifteen families", () => {
    renderTab({
      ...fixtures.ready,
      relationship_capabilities: fixtures.ready.relationship_capabilities.filter(
        (row: any) => row.family !== "TRUSTS",
      ),
    })
    expect(screen.queryAllByTestId("identity-capability-row").length).not.toBe(14)
    expect(screen.queryAllByTestId("identity-capability-row").length).toBe(0)
    expect(screen.getByTestId("identity-capability-unavailable").textContent).toMatch(
      /no verdict for TRUSTS/,
    )
  })
})

describe("a partial projection with nothing to draw", () => {
  it("says the map is empty for a reason, and never that nothing is bound", () => {
    renderTab(fixtures.partial_unresolved_role_id)
    expect(panel()).toHaveAttribute("data-state", "incomplete")
    const box = screen.getByTestId("identity-incomplete")
    expect(box.textContent).toMatch(/not because none exist/i)
    expect(box.textContent).toMatch(/no AWS RoleId/i)
    expect(screen.queryByTestId("identity-empty-authoritative")).toBeNull()
    expect(screen.queryByTestId("identity-map")).toBeNull()
    expect(panel().textContent).not.toMatch(/No workload in this scope is bound/)
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

  it("still draws the workload-to-role map, with no counts on the decision node", () => {
    renderTab(fixtures.partial_no_decision_authority)
    const decision = within(canvas())
      .getAllByTestId("identity-map-node")
      .find(node => node.getAttribute("data-node-kind") === "decision")!
    expect(decision).toHaveAttribute("data-decision-state", "unavailable")
    expect(decision.textContent).toMatch(/no counts — not zero/i)
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
  it("renders all fifteen families with a status each", () => {
    renderTab(fixtures.ready)
    const rows = screen.getAllByTestId("identity-capability-row")
    expect(rows.length).toBe(15)
    const available = rows.filter(row => row.getAttribute("data-status") === "available")
    expect(available.map(row => row.getAttribute("data-family")).sort()).toEqual([
      "ROLE_ACTION_DECISION",
      "WORKLOAD_USES_ROLE",
    ])
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
    expect(screen.getAllByTestId("identity-capability-row").length).toBe(15)
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
    expect(screen.queryByTestId("identity-map")).toBeNull()
    expect(screen.getByTestId("identity-scope-mismatch").textContent).toMatch(/999988887777/)
    expect(screen.getAllByTestId("identity-capability-row").length).toBe(15)
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
