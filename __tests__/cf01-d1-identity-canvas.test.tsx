/// <reference types="vitest/globals" />
/**
 * CF01 · D1 — the identity lens is drawn ON the shared AwsFrame.
 *
 * Same frame, same chips, same FlowOverlay: this renders `AwsFrame` with the
 * `identityLens` prop and the lens's own overlay edges, over the same
 * estate payload the Network regression guard pins, and asserts what a reader
 * sees — identity chips as overlay anchors, one routed line per producer
 * family with the producer's plane, no motion on anything configured, and an
 * explicit not-an-answer state when nothing may be drawn.
 *
 * Payloads: the v1 + graph fixtures generated from saferemediate-backend
 * 41f5dda3 (see cf01-d1-identity-lens-model.test.ts for provenance).
 */

import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react"

import {
  AwsFrame,
  BADGE_HALF_HEIGHT,
  LEADER_DISCRIMINATION_MARGIN_PX,
  badgeHalfWidth,
  clampBadgeIntoBounds,
  nearestPointOnPolyline,
  nearestPointOnRoundedPath,
  orthoPath,
  separateIdentityBadges,
} from "@/components/topology-v0-2/aws-frame"
import {
  IDENTITY_GRAPH_EDGE_FAMILIES,
  boundIdentityEdges,
  buildIdentityLensForPayload,
  identityLensTrafficEdges,
} from "@/components/topology-v0-2/estate-identity-access-model"
import type { IdentityLensFrameProps } from "@/components/topology-v0-2/estate-identity-plane"
import { identityChipSubtitle } from "@/components/topology-v0-2/estate-identity-plane"

import v1 from "./fixtures/estate-identity-access.json"
import historicalGraphFixture from "./fixtures/cf01-d1/estate-identity-graph-6e08d6b2.json"
import fCandidate from "./fixtures/cf01-d1/estate-identity-graph-F-candidate.json"
import { estatePayload, installLayoutStub } from "./fixtures/cf01-d1/network-fixture"

// The captured graph predates the producer's explicit account-scope field.
// Give positive rendering tests a same-generation scope; negative tests use
// the original historical bytes below to prove an unbound graph is withheld.
const scopedHistoricalBlock = (block: any) => ({
  ...block,
  identity_graph: { ...block.identity_graph, scope: {
    level: "account", customer_id: block.scope.customer_id,
    account_id: block.scope.account_id,
    inventory_generation: block.inventory_authority.generation,
    region: null, system_name: null, vpc_id: null,
  } },
})
const graphFixture = {
  ...historicalGraphFixture,
  composed: {
    ...historicalGraphFixture.composed,
    ready_with_graph: scopedHistoricalBlock(historicalGraphFixture.composed.ready_with_graph),
    partial_with_truncated_graph: scopedHistoricalBlock(historicalGraphFixture.composed.partial_with_truncated_graph),
    empty_authoritative_with_empty_graph: scopedHistoricalBlock(historicalGraphFixture.composed.empty_authoritative_with_empty_graph),
  },
} as typeof historicalGraphFixture

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

afterEach(() => {
  cleanup()
  restoreLayout()
  restoreLayout = () => {}
})

const READY_WITH_GRAPH = graphFixture.composed.ready_with_graph
// The producer's "empty graph" fixture still contains a standalone account.
// Keep those source bytes intact; a truly empty negative control has no nodes.
const NODE_ONLY_ACCOUNT = graphFixture.composed.empty_authoritative_with_empty_graph
const TRULY_EMPTY_GRAPH = {
  ...NODE_ONLY_ACCOUNT,
  identity_graph: { ...NODE_ONLY_ACCOUNT.identity_graph, nodes: [], nodes_total: 0 },
}

function lensFor(identityAccess: unknown, focusedNodeId: string | null = null, hops = 2) {
  const block = identityAccess as any
  const positiveBlock = block?.identity_graph && ["ready", "partial"].includes(block.identity_graph.status) &&
    block.identity_graph.scope === undefined && block.scope?.account_id && block.inventory_authority?.generation !== undefined
    ? scopedHistoricalBlock(block) : identityAccess
  const payload = { ...estatePayload(), identity_access: positiveBlock } as any
  const lens = buildIdentityLensForPayload(payload, {
    topologyNodes: payload.nodes.map((n: any) => ({ ...n })),
  })
  const bound = boundIdentityEdges(lens.edges, focusedNodeId, hops, 1000)
  const frame: IdentityLensFrameProps = {
    lens,
    drawn: bound.edges.length,
    omitted: bound.omitted,
    focusedNodeId,
    hops,
    chipCap: 12,
  }
  // Mirrors estate-map-view: the selection is handed to the overlay builder so
  // the drawn line carries its relation to the focus.
  return {
    payload,
    lens,
    frame,
    edges: identityLensTrafficEdges({ ...lens, edges: bound.edges }, focusedNodeId),
  }
}

async function renderLens(
  identityAccess: unknown,
  options: { selectedNodeId?: string | null; onSelect?: (id: string) => void; presentationMode?: boolean; frame?: Partial<IdentityLensFrameProps>; hops?: number } = {},
) {
  restoreLayout = installLayoutStub()
  const { payload, lens, frame, edges } = lensFor(
    identityAccess,
    options.selectedNodeId ?? null,
    options.hops ?? 2,
  )
  const view = render(
    <AwsFrame
      vpcTopology={payload.vpc_topology}
      nodes={payload.nodes}
      serverlessSourceNodes={payload.nodes}
      regionalDataSourceNodes={payload.nodes}
      trafficEdges={[]}
      overlayEdges={edges}
      flowMode="all_access"
      attackPathFlowCount={0}
      selectedNodeId={options.selectedNodeId ?? null}
      onSelect={options.onSelect ?? (() => {})}
      presentationMode={options.presentationMode ?? false}
      viewDensity="glance"
      systemLabel={payload.system}
      identityLens={{ ...frame, ...(options.frame ?? {}) }}
    />,
  )
  if (edges.length > 0) {
    await waitFor(() => {
      expect(view.container.querySelectorAll("g[data-flow-family]").length).toBeGreaterThan(0)
    })
  }
  return { ...view, lens, edges }
}

describe("CF01-D1 · the identity lens shares the Network frame", () => {
  it("renders the SAME VPC frame, subnet grid and topology chips as the Network view", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    expect(container.querySelector('[data-testid="topology-vpc-frame"]')).not.toBeNull()
    // Workload chips keep their topology anchors; the lens draws TO them.
    expect(container.querySelector('[data-flow-id="i-web"]')).not.toBeNull()
    expect(container.querySelector('[data-flow-id="bucket-assets"]')).not.toBeNull()
  })

  it("renders the four account-context kinds as plane chips, with SCP and RCP kept apart", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    for (const kind of ["aws_account", "organization", "organizational_unit", "control_policy"]) {
      expect(
        container.querySelector(`[data-testid="identity-plane-chip"][data-identity-kind="${kind}"]`),
        kind,
      ).not.toBeNull()
    }
    const policies = Array.from(
      container.querySelectorAll('[data-testid="identity-plane-chip"][data-identity-kind="control_policy"]'),
    )
    const labels = policies.map(chip => chip.getAttribute("data-identity-sublabel") ?? "")
    expect(labels).toContain("SCP")
    expect(labels).toContain("RCP")
  })

  it("adds the identity plane INSIDE the frame with one anchor chip per identity-plane node", async () => {
    const { container, lens } = await renderLens(READY_WITH_GRAPH)
    const plane = container.querySelector('[data-testid="identity-lens-plane"]')!
    expect(plane).not.toBeNull()
    const planeNodes = lens.nodes.filter(n => !n.onCanvas)
    expect(planeNodes.length).toBeGreaterThan(5)
    for (const node of planeNodes) {
      const chip = plane.querySelector(`[data-flow-id="${CSS.escape(node.id)}"]`)
      expect(chip, `anchor for ${node.kind} ${node.label}`).not.toBeNull()
    }
    // And no second chip for a node the topology already draws.
    expect(plane.querySelector('[data-flow-id="i-web"]')).toBeNull()
    expect(plane.querySelector('[data-flow-id="bucket-assets"]')).toBeNull()
  })

  it("replaces the traffic legend, flow-mode toggle and traffic banners with the identity legend", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    expect(container.querySelector('[data-testid="identity-lens-legend"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="topology-flow-legend"]')).toBeNull()
    expect(container.querySelector('[data-testid="topology-platform-map-summary"]')).toBeNull()
    expect(container.querySelector('[data-testid="topology-traffic-authority-state"]')).toBeNull()
    for (const key of ["configured", "observed", "unresolved_endpoint"]) {
      expect(container.querySelector(`[data-testid="identity-legend-${key}"]`)).not.toBeNull()
    }
    expect(container.querySelector('[data-testid="identity-legend-motion"]')!.textContent).toMatch(
      /configured or trust line never moves/i,
    )
  })

  it("lists EVERY family verdict in the legend, including the ones the producer cannot serve, with their reason", async () => {
    const { container, lens } = await renderLens(READY_WITH_GRAPH)
    const rows = Array.from(container.querySelectorAll('[data-testid="identity-legend-family"]'))
    const byFamily = new Map(rows.map(r => [r.getAttribute("data-family"), r]))
    expect(rows.length).toBe(lens.families.length)
    for (const family of ["ASSUMES_ROLE", "CAN_ASSUME", "TRUSTS", "HAS_POLICY", "LIMITED_BY_SCP", "IN_ORG", "IN_ORG_UNIT", "DATA_ACCESS", "TARGETS", "USES_KMS_KEY", "MEMBER_OF"]) {
      const row = byFamily.get(family)!
      expect(row, family).toBeDefined()
      expect(row.getAttribute("data-status")).toBe("unavailable")
      expect(row.getAttribute("data-drawn")).toBe("0")
      expect(row.textContent).toMatch(/not drawn/)
    }
    for (const family of IDENTITY_GRAPH_EDGE_FAMILIES) {
      const row = byFamily.get(family)!
      expect(row.getAttribute("data-status")).toBe("available")
      expect(Number(row.getAttribute("data-drawn"))).toBeGreaterThan(0)
    }
  })
})

describe("CF01-D1 · every producer family is routed by the shared overlay with its plane", () => {
  it("draws one overlay group per lens edge, tagged with family, plane and certainty", async () => {
    const { container, edges } = await renderLens(READY_WITH_GRAPH)
    const groups = Array.from(container.querySelectorAll("g[data-flow-family]"))
    expect(groups.length).toBe(edges.length)
    const families = new Set(groups.map(g => g.getAttribute("data-flow-family")))
    for (const family of IDENTITY_GRAPH_EDGE_FAMILIES) expect(families.has(family), family).toBe(true)
    for (const g of groups) {
      expect(["configured", "observed"]).toContain(g.getAttribute("data-flow-plane"))
      expect(["resolved", "unresolved_endpoint"]).toContain(g.getAttribute("data-flow-certainty"))
    }
  })

  it("a configured edge is dashed, still, and carries no packet", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    const configured = Array.from(container.querySelectorAll('g[data-flow-plane="configured"][data-flow-certainty="resolved"]'))
    expect(configured.length).toBeGreaterThan(0)
    for (const g of configured) {
      expect(g.getAttribute("data-flow-motion")).toBe("none")
      expect(g.querySelector('[data-testid="topology-flow-packet"]')).toBeNull()
      expect(g.querySelector('[data-testid="topology-flow-historical-packet"]')).toBeNull()
      expect(g.querySelector("animate, animateMotion")).toBeNull()
      const line = g.querySelector('path[data-flow-line="stroke"]')!
      expect(line.getAttribute("stroke-dasharray")).toBe("5 4")
      expect(line.getAttribute("marker-end")).toBe("url(#flow-arrow-identity-configured)")
    }
  })

  it("an unresolved-endpoint edge is dotted and still — derived from an attribute, drawn to a name", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    const derived = Array.from(container.querySelectorAll('g[data-flow-certainty="unresolved_endpoint"][data-flow-plane="configured"]'))
    expect(derived.length).toBeGreaterThan(0)
    for (const g of derived) {
      expect(g.getAttribute("data-flow-motion")).toBe("none")
      expect(g.querySelector("animate, animateMotion")).toBeNull()
      expect(g.querySelector('path[data-flow-line="stroke"]')!.getAttribute("stroke-dasharray")).toBe("1.5 4")
      expect(g.querySelector('path[data-flow-line="stroke"]')!.getAttribute("marker-end")).toBe(
        "url(#flow-arrow-identity-unresolved_endpoint)",
      )
    }
  })

  it("only observed, generation-backed edges move, with the frame's own authoritative packet", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    const moving = Array.from(container.querySelectorAll('g[data-flow-motion="authoritative"]'))
    expect(moving.length).toBe(3)
    for (const g of moving) {
      expect(g.getAttribute("data-flow-plane")).toBe("observed")
      expect(g.querySelector('[data-testid="topology-flow-packet"]')).not.toBeNull()
    }
    expect(new Set(moving.map(g => g.getAttribute("data-flow-family")))).toEqual(
      new Set(["ROLE_ACTION_DECISION", "USER_AUTHENTICATES_WITH"]),
    )
    // Nothing else animates: every packet on the canvas belongs to an observed edge.
    const packets = container.querySelectorAll('[data-testid="topology-flow-packet"]')
    expect(packets.length).toBe(moving.length)
  })

  it("the trust edge points AT the role and names the principal on its badge", async () => {
    const { container, lens } = await renderLens(READY_WITH_GRAPH)
    const trust = Array.from(container.querySelectorAll('g[data-flow-family="ROLE_TRUST_POLICY"]'))
    expect(trust.length).toBe(4)
    const roleIds = new Set(lens.nodes.filter(n => n.kind === "iam_role").map(n => n.id))
    for (const g of trust) expect(roleIds.has(g.getAttribute("data-flow-target")!)).toBe(true)
    const labels = trust.map(g => g.querySelector('[data-testid="topology-flow-badge"]')?.textContent ?? "")
    // This fixture's wildcard trust carries no condition, so "unconditionally"
    // is the accurate badge. A conditional wildcard must never read this way —
    // the condition is what bounds who may assume.
    expect(labels.some(text => /any principal, unconditionally/i.test(text))).toBe(true)
    expect(labels.some(text => /ANYONE/.test(text))).toBe(false)
    // Configured statement language, never effective authorization.
    for (const text of labels) expect(text).not.toMatch(/\b(can assume|is allowed|authorized)\b/i)
  })

  it("WORKLOAD_USES_ROLE runs from the workload's topology chip to the role chip on the plane", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    const g = container.querySelector('g[data-flow-family="WORKLOAD_USES_ROLE"]')!
    expect(g.getAttribute("data-flow-source")).toBe("i-web")
    expect(g.getAttribute("data-flow-target")).toMatch(/^__identity:iam_role:.*__$/)
    expect(g.getAttribute("data-flow-plane")).toBe("configured")
  })
})

describe("CF01-D1 · chips, selection and bounded neighbourhoods", () => {
  it("a name-only endpoint renders in the missing-evidence state", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    const unresolved = Array.from(container.querySelectorAll('[data-testid="identity-plane-chip"][data-identity-resolved="false"]'))
    expect(unresolved.length).toBeGreaterThan(0)
    for (const chip of unresolved) {
      expect(within(chip as HTMLElement).getByTestId("identity-plane-chip-unresolved").textContent).toMatch(/name only/i)
    }
    const group = container.querySelector('[data-testid="identity-plane-chip"][data-identity-kind="iam_group"]')!
    expect(group.getAttribute("data-identity-resolved")).toBe("false")
  })

  it("clicking an identity chip selects it through the frame's own onSelect", async () => {
    const onSelect = vi.fn()
    const { container, lens } = await renderLens(READY_WITH_GRAPH, { onSelect })
    const role = lens.nodes.find(n => n.kind === "iam_role")!
    const chip = container.querySelector(`[data-flow-id="${CSS.escape(role.id)}"]`) as HTMLElement
    fireEvent.click(chip)
    expect(onSelect).toHaveBeenCalledWith(role.id)
  })

  it("a selected chip shows the hop control and the drawn / not-drawn counts", async () => {
    const { lens } = lensFor(READY_WITH_GRAPH)
    const role = lens.nodes.find(n => n.kind === "iam_role" && n.label === "web")!
    const { container } = await renderLens(READY_WITH_GRAPH, { selectedNodeId: role.id })
    const counts = container.querySelector('[data-testid="identity-neighbourhood-counts"]')!.textContent!
    expect(counts).toMatch(/Around web:/)
    expect(counts).toMatch(/\d+ drawn · \d+ not drawn/)
    expect(container.querySelector('[data-testid="identity-hops-2"]')!.getAttribute("aria-pressed")).toBe("true")
  })

  it("collapsed chips are counted, and so are the relationships they hide", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH, { frame: { chipCap: 1 } })
    const truncation = container.querySelector('[data-testid="identity-plane-truncation"]')!
    expect(truncation.textContent).toMatch(/chips? collapsed below \(\d+ relationships? to them not drawn\)/)
    expect(container.querySelectorAll('[data-testid="identity-plane-show-more"]').length).toBeGreaterThan(0)
  })

  it("the producer's own truncation is surfaced", async () => {
    const { container } = await renderLens(graphFixture.composed.partial_with_truncated_graph)
    expect(container.querySelector('[data-testid="identity-plane-truncation"]')!.textContent).toMatch(
      /producer truncated this read/,
    )
    expect(container.querySelector('[data-testid="identity-plane-state"]')!.textContent).toMatch(/graph read with gaps/)
  })

  it("renders in fullscreen presentation mode with the same anchors", async () => {
    const { container, lens } = await renderLens(READY_WITH_GRAPH, { presentationMode: true })
    expect(container.querySelector('[data-testid="identity-lens-plane"]')).not.toBeNull()
    for (const node of lens.nodes.filter(n => !n.onCanvas)) {
      expect(container.querySelector(`[data-flow-id="${CSS.escape(node.id)}"]`)).not.toBeNull()
    }
  })
})

describe("CF01-D1 · unavailable is not zero, on the canvas", () => {
  it("the emitter's ready v1 draws the real identity graph, not a swallowed read failure", async () => {
    const { container } = await renderLens(v1.ready)
    expect(container.querySelector('[data-testid="identity-plane-state"]')!.textContent).toMatch(/graph read/)
    const families = new Set(
      Array.from(container.querySelectorAll("g[data-flow-family]")).map(g => g.getAttribute("data-flow-family")),
    )
    expect(families.has("WORKLOAD_USES_ROLE")).toBe(true)
    expect(families.has("ACCOUNT_IN_ORGANIZATION")).toBe(true)
    expect(families.has("ACCOUNT_LIMITED_BY_SCP")).toBe(true)
    expect(families.has("ACCOUNT_LIMITED_BY_RCP")).toBe(true)
  })

  it("an unavailable projection shows the notice with its gap code and draws no relationship", async () => {
    const { container } = await renderLens(v1.unavailable)
    const notice = container.querySelector('[data-testid="identity-lens-notice"]')!
    expect(notice.textContent).toMatch(/not a statement that there are no identities/i)
    expect(notice.querySelector('[data-gap-code="ACTIVE_INVENTORY_POINTER_MISSING"]')).not.toBeNull()
    expect(container.querySelectorAll("g[data-flow-family]").length).toBe(0)
    expect(container.querySelectorAll('[data-testid="identity-plane-chip"]').length).toBe(0)
  })

  it("empty-authoritative is the one empty canvas that is an answer, and it says so", async () => {
    const { container } = await renderLens(TRULY_EMPTY_GRAPH)
    const notice = container.querySelector('[data-testid="identity-lens-notice"]')!
    expect(notice.getAttribute("data-identity-empty-answer")).toBe("true")
    expect(notice.textContent).toMatch(/No workload in this scope is bound/)
    expect(notice.textContent).not.toMatch(/not a statement that there are no identities/)
    // Backed for role bindings, explicitly unknown for every family the
    // producer cannot prove it acquired.
    const caveat = notice.querySelector('[data-testid="identity-lens-notice-coverage"]')!
    expect(caveat.textContent).toMatch(/unknown, not zero/i)
    expect(caveat.textContent).toMatch(/USER_AUTHENTICATES_WITH/)
    expect(caveat.textContent).not.toMatch(/WORKLOAD_USES_ROLE/)
  })

  /**
   * The DOM half of the collapse. The notice used to compute its own
   * "this is an answer" styling from `lens.state === "ready" && !edges.length`
   * — the v1 ROLES projection's word. A payload whose roles read cleanly and
   * whose identity GRAPH failed to read satisfied that test and rendered the
   * calm white "answer" box with the warning suppressed.
   */
  it("a roles-empty payload whose GRAPH was never read is not an answer on the canvas", async () => {
    const { container } = await renderLens(graphFixture.composed.empty_authoritative_with_unread_graph)
    const notice = container.querySelector('[data-testid="identity-lens-notice"]')!
    expect(notice.getAttribute("data-identity-empty-answer")).toBe("false")
    expect(notice.textContent).toMatch(/not a statement that there are no identities/)
    expect(notice.querySelector('[data-gap-code="IDENTITY_GRAPH_READ_FAILED"]')).not.toBeNull()
    expect(container.querySelectorAll("g[data-flow-family]").length).toBe(0)
  })

  it("the two empty canvases are visibly different, not just internally different", async () => {
    const answer = await renderLens(TRULY_EMPTY_GRAPH)
    const unread = await renderLens(graphFixture.composed.empty_authoritative_with_unread_graph)
    const a = answer.container.querySelector('[data-testid="identity-lens-notice"]')!
    const u = unread.container.querySelector('[data-testid="identity-lens-notice"]')!
    expect(a.getAttribute("data-identity-empty-answer")).not.toBe(
      u.getAttribute("data-identity-empty-answer"),
    )
    expect(a.textContent).not.toBe(u.textContent)
  })
})

describe("CF01-D1 · identity badges are pulled off each other", () => {
  const badge = (label: string, x: number, y: number) =>
    ({ badgeLabel: label, badgeX: x, badgeY: y, d: "M0,0", cls: "x" }) as any

  it("separates badges that would render as one unreadable pile", () => {
    // Three real labels at the same spot — the `ma|boundary|RN only)` case.
    const paths = [
      badge("managed policy (ARN only)", 100, 50),
      badge("boundary", 100, 50),
      badge("inline policy", 100, 50),
    ]
    separateIdentityBadges(paths)
    const ys = paths.map(p => p.badgeY).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(BADGE_HALF_HEIGHT * 2)
    }
  })

  it("leaves badges that do not collide exactly where they were", () => {
    const paths = [badge("a", 0, 0), badge("b", 400, 300)]
    const before = paths.map(p => ({ x: p.badgeX, y: p.badgeY }))
    separateIdentityBadges(paths)
    expect(paths.map(p => ({ x: p.badgeX, y: p.badgeY }))).toEqual(before)
  })

  it("moves only badgeY — never the line, the anchor or badgeX", () => {
    const paths = [badge("one", 10, 10), badge("two", 10, 10)]
    separateIdentityBadges(paths)
    for (const p of paths) {
      expect(p.badgeX).toBe(10)
      expect(p.d).toBe("M0,0")
    }
  })

  it("is deterministic — one payload always yields one layout", () => {
    const build = () => [
      badge("alpha", 20, 40),
      badge("beta", 22, 41),
      badge("gamma", 21, 40),
      badge("delta", 23, 42),
    ]
    const a = build()
    const b = build()
    separateIdentityBadges(a)
    separateIdentityBadges(b)
    expect(a.map(p => p.badgeY)).toEqual(b.map(p => p.badgeY))
  })

  /**
   * COMPOSITION, in production order: clamp first, then separate.
   *
   * The regression these exist for: separation ran after the overlay's final
   * containment pass and nothing contained badges afterwards, so it was free
   * to choose a negative Y. Two overlapping centres clamped to y = 9 inside a
   * 400x200 overlay, and separation then moved the second to y = -7 — box top
   * -14, wholly off the canvas. The whole suite passed because nothing
   * exercised separation near a vertical boundary.
   *
   * Containment is now part of candidate selection. Clamping the RESULT would
   * only push the badge back into the obstacle it was moved off, so the check
   * has to happen before a candidate is accepted, not after.
   */
  const OVERLAY = { width: 400, height: 200 }
  const clampThenSeparate = (
    centres: { label: string; x: number; y: number }[],
    obstacles: { x0: number; x1: number; y0: number; y1: number }[] = [],
  ) => {
    const paths = centres.map(c => {
      const fit = clampBadgeIntoBounds(
        c.x,
        c.y,
        badgeHalfWidth(c.label),
        BADGE_HALF_HEIGHT,
        OVERLAY.width,
        OVERLAY.height,
      )
      return badge(c.label, fit.x, fit.y)
    })
    separateIdentityBadges(paths, obstacles, OVERLAY)
    return paths
  }
  const contained = (p: any) =>
    p.badgeY - BADGE_HALF_HEIGHT >= 0 && p.badgeY + BADGE_HALF_HEIGHT <= OVERLAY.height

  it("keeps every badge on the canvas at the TOP boundary", () => {
    // Root's exact repro: two overlapping centres clamped to the top edge.
    const paths = clampThenSeparate([
      { label: "managed policy", x: 120, y: -50 },
      { label: "boundary", x: 120, y: -50 },
    ])
    for (const p of paths) {
      expect(contained(p), `y=${p.badgeY} escaped the overlay`).toBe(true)
      expect(p.badgeY).toBeGreaterThan(0)
    }
  })

  it("keeps every badge on the canvas at the BOTTOM boundary", () => {
    const paths = clampThenSeparate([
      { label: "managed policy", x: 120, y: OVERLAY.height + 50 },
      { label: "boundary", x: 120, y: OVERLAY.height + 50 },
      { label: "inline policy", x: 120, y: OVERLAY.height + 50 },
    ])
    for (const p of paths) {
      expect(contained(p), `y=${p.badgeY} escaped the overlay`).toBe(true)
    }
  })

  it("never leaves the canvas to escape an obstacle pinned against an edge", () => {
    // A chip covering the whole top strip: the only free space is downward,
    // and going up would be off-canvas.
    const topStrip = { x0: 0, x1: OVERLAY.width, y0: 0, y1: 40 }
    const paths = clampThenSeparate([{ label: "policy", x: 120, y: 12 }], [topStrip])
    expect(contained(paths[0])).toBe(true)
  })

  it("prefers an overlapping but VISIBLE badge over a separated off-canvas one", () => {
    // A tall obstacle leaves nothing free inside the overlay: the badge must
    // keep the contained position the clamp gave it rather than fleeing.
    const wall = { x0: 0, x1: OVERLAY.width, y0: 0, y1: OVERLAY.height }
    const paths = clampThenSeparate([{ label: "policy", x: 120, y: 100 }], [wall])
    expect(contained(paths[0])).toBe(true)
    expect(paths[0].badgeY).toBe(100)
  })

  /**
   * A SHORT overlay must not re-open the escape.
   *
   * The bounds check previously returned "unbounded" when the overlay was too
   * short to contain a badge, so in a 400x16 frame a contained label at y = 8
   * was moved to y = -8 — the same failure as the original regression, reached
   * through the guard rather than around it. Refusing every candidate is
   * correct: the fallback keeps the clamped position, which is visible.
   */
  it("keeps badges on canvas in an overlay too short to separate within", () => {
    const SHORT = { width: 400, height: 16 }
    const paths = [badge("managed policy", 120, 8), badge("boundary", 120, 8)]
    separateIdentityBadges(paths, [], SHORT)
    for (const p of paths) {
      expect(p.badgeY, `y=${p.badgeY} escaped a ${SHORT.height}px overlay`).toBe(8)
      expect(p.badgeY - BADGE_HALF_HEIGHT).toBeGreaterThan(-BADGE_HALF_HEIGHT * 2)
    }
  })

  it("a short overlay never yields what the tall path would refuse", () => {
    // Same two badges, two overlay heights. Neither may leave its canvas.
    for (const height of [16, 12, 20, 200]) {
      const paths = [badge("policy", 120, 8), badge("policy", 120, 8)]
      separateIdentityBadges(paths, [], { width: 400, height })
      for (const p of paths) {
        const top = p.badgeY - BADGE_HALF_HEIGHT
        expect(top, `height=${height} produced top=${top}`).toBeGreaterThanOrEqual(
          // In a frame shorter than one badge the clamp position is the best
          // available; it may touch the edge but must never go above it.
          height < BADGE_HALF_HEIGHT * 2 ? -BADGE_HALF_HEIGHT : 0,
        )
      }
    }
  })

  it("still separates normally when the overlay has room", () => {
    const paths = clampThenSeparate([
      { label: "managed policy", x: 120, y: 100 },
      { label: "boundary", x: 120, y: 100 },
    ])
    expect(Math.abs(paths[0].badgeY - paths[1].badgeY)).toBeGreaterThanOrEqual(
      BADGE_HALF_HEIGHT * 2,
    )
    for (const p of paths) expect(contained(p)).toBe(true)
  })

  it("treats chips as obstacles, so a label does not sit on the node it points at", () => {
    const chip = { x0: 80, x1: 200, y0: 90, y1: 130 }
    const paths = [badge("managed policy", 140, 110)] // dead centre of the chip
    separateIdentityBadges(paths, [chip])
    const y = paths[0].badgeY
    const clear = y + BADGE_HALF_HEIGHT <= chip.y0 || y - BADGE_HALF_HEIGHT >= chip.y1
    expect(clear).toBe(true)
  })

  it("a chip obstacle never moves — only badges do", () => {
    const chip = { x0: 0, x1: 50, y0: 0, y1: 20 }
    const before = { ...chip }
    separateIdentityBadges([badge("x", 25, 10)], [chip])
    expect(chip).toEqual(before)
  })

  it("keeps a separated badge near the line it labels", () => {
    const paths = Array.from({ length: 5 }, () => badge("policy", 60, 100))
    separateIdentityBadges(paths)
    // A badge flung far from its edge is worse than one that overlaps.
    for (const p of paths) expect(Math.abs(p.badgeY - 100)).toBeLessThanOrEqual(BADGE_HALF_HEIGHT * 2 * 4)
  })
})

describe("CF01-D1 · an identity chip names the thing, not its anchor id", () => {
  it("never shows the synthetic canvas anchor as a chip's subtitle", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    const chips = Array.from(container.querySelectorAll('[data-testid="identity-plane-chip"]'))
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      // The anchor id stays an attribute — it is how the overlay binds — but it
      // must never be the text a reader is asked to identify a principal by.
      expect(chip.getAttribute("data-identity-node-id")).toMatch(/^__identity:/)
      expect(chip.textContent ?? "").not.toMatch(/__identity:/)
    }
  })

  it("names the kind and the owning account, so two same-named principals differ", async () => {
    const { container, lens } = await renderLens(READY_WITH_GRAPH)
    const role = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!
    const chip = container.querySelector(
      `[data-identity-node-id="${CSS.escape(role.id)}"]`,
    )!
    // The full 12-digit account, not a truncated prefix: a cut-off account id
    // cannot be told from another one sharing its prefix.
    expect(chip.textContent).toMatch(/acct 416651950952/)
  })

  it("the subtitle is derived from producer fields only", () => {
    expect(
      identityChipSubtitle({
        kind: "iam_role",
        arn: "arn:aws:iam::999988887777:role/partner",
        resourceUid: null,
      } as any),
    ).toBe("acct 999988887777")
    // No account anywhere: say what it is, invent no owner.
    expect(
      identityChipSubtitle({ kind: "organization", arn: null, resourceUid: null } as any),
    ).not.toMatch(/\d/)
  })
})

describe("CF01-D1 · a selection reads as its own access, on the canvas", () => {
  it("labels the selected node's own lines and leaves the rest as context", async () => {
    const { lens } = lensFor(READY_WITH_GRAPH)
    const role = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!
    const { container } = await renderLens(READY_WITH_GRAPH, { selectedNodeId: role.id })
    const groups = Array.from(container.querySelectorAll("g[data-flow-focus-relation]"))
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      const source = group.getAttribute("data-flow-source")
      const target = group.getAttribute("data-flow-target")
      const expected =
        source === role.id ? "outgoing" : target === role.id ? "incoming" : "context"
      expect(group.getAttribute("data-flow-focus-relation")).toBe(expected)
    }
    const seen = new Set(groups.map(g => g.getAttribute("data-flow-focus-relation")))
    expect(seen.has("outgoing")).toBe(true)
    expect(seen.has("incoming")).toBe(true)
  })

  /**
   * Direction must survive greyscale, 768px and a reader who cannot resolve a
   * few-pixel arrowhead. So it is carried in WORDS on the badge, not in colour
   * and not in the line end alone.
   */
  it("says out / in on the selected node's own edges, in words", async () => {
    const { lens } = lensFor(READY_WITH_GRAPH)
    const role = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!
    const { container } = await renderLens(READY_WITH_GRAPH, { selectedNodeId: role.id })

    const labelled = Array.from(container.querySelectorAll("g[data-flow-focus-relation]")).map(g => ({
      rel: g.getAttribute("data-flow-focus-relation"),
      text: g.querySelector('[data-testid="topology-flow-badge"]')?.textContent ?? "",
    }))
    const withBadge = labelled.filter(x => x.text.trim() !== "")
    expect(withBadge.length).toBeGreaterThan(0)

    for (const { rel, text } of withBadge) {
      if (rel === "outgoing") expect(text).toMatch(/^out · /)
      else if (rel === "incoming") expect(text).toMatch(/^in · /)
      else expect(text).not.toMatch(/^(out|in) · /)
    }
    // Both directions are actually present, or this proves nothing.
    expect(withBadge.some(x => x.rel === "outgoing")).toBe(true)
    expect(withBadge.some(x => x.rel === "incoming")).toBe(true)
  })

  it("with no selection no edge claims a direction", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    for (const g of Array.from(container.querySelectorAll('[data-testid="topology-flow-badge"]'))) {
      expect(g.textContent ?? "").not.toMatch(/^(out|in) · /)
    }
  })

  it("emphasis never changes the evidence a line was drawn from", async () => {
    const { lens } = lensFor(READY_WITH_GRAPH)
    const role = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!
    // Keyed by edge identity, because a selection deliberately draws FEWER
    // lines (the bounded neighbourhood). The invariant is about the lines that
    // survive: selecting must not restate what any of them is evidence of.
    const read = (c: Element) =>
      new Map(
        Array.from(c.querySelectorAll("g[data-flow-family]")).map(g => [
          `${g.getAttribute("data-flow-source")}->${g.getAttribute("data-flow-target")}:${g.getAttribute("data-flow-family")}`,
          [
            g.getAttribute("data-flow-plane"),
            g.getAttribute("data-flow-verdict"),
            g.getAttribute("data-flow-certainty"),
            g.getAttribute("data-flow-authority"),
            g.getAttribute("data-flow-path-basis"),
            g.getAttribute("data-flow-motion"),
          ].join("|"),
        ]),
      )
    const unfocused = await renderLens(READY_WITH_GRAPH)
    const before = read(unfocused.container)
    cleanup()
    const focused = await renderLens(READY_WITH_GRAPH, { selectedNodeId: role.id })
    const after = read(focused.container)

    expect(after.size).toBeGreaterThan(0)
    expect(after.size).toBeLessThan(before.size)
    for (const [key, evidence] of after) {
      expect(before.has(key)).toBe(true)
      expect(evidence).toBe(before.get(key))
    }
  })

  /**
   * THE CUE MAY NOT MOVE ANYTHING.
   *
   * `renderLens` derives the drawn edge set FROM the selection, so a selected
   * render and an unselected one differ in two ways at once — which edges
   * exist, and how they are cued. Comparing those two cannot tell a cue from a
   * relayout. These controls bind ONE edge set and vary a single knob:
   *
   *   knob 1 — `focusedNodeId` in `identityLensTrafficEdges`: the direction
   *            words ("out ·" / "in ·") prefixed onto the badge. This knob
   *            widens labels, and label width feeds `badgeHalfWidth` →
   *            `clearAt` → the displacement sweep, so it CAN reach layout.
   *   knob 2 — the `selectedNodeId` prop: emphasis and dimming. This is the
   *            knob that reaches `j.focused`, which the router itself branches
   *            on (`if (!j.railLanes || j.focused)`), so it is the one most
   *            able to move geometry.
   */
  /** The focus both arms are bound around, resolved without rendering. */
  function focusRoleId() {
    const { lens } = lensFor(READY_WITH_GRAPH)
    return lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!.id
  }

  async function renderFixedEdgeSet(opts: { cueFor: string | null; selected: string | null }) {
    restoreLayout = installLayoutStub()
    const payload = { ...estatePayload(), identity_access: READY_WITH_GRAPH } as any
    const lens = buildIdentityLensForPayload(payload, {
      topologyNodes: payload.nodes.map((n: any) => ({ ...n })),
    })
    const role = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!
    // Bound with the SAME focus in both arms: the population is held fixed.
    const bound = boundIdentityEdges(lens.edges, role.id, 3, 1000)
    const frame: IdentityLensFrameProps = {
      lens,
      drawn: bound.edges.length,
      omitted: bound.omitted,
      focusedNodeId: role.id,
      hops: 3,
      chipCap: 12,
    }
    const edges = identityLensTrafficEdges({ ...lens, edges: bound.edges }, opts.cueFor)
    const { container } = render(
      <AwsFrame
        vpcTopology={payload.vpc_topology}
        nodes={payload.nodes}
        serverlessSourceNodes={payload.nodes}
        regionalDataSourceNodes={payload.nodes}
        trafficEdges={[]}
        overlayEdges={edges}
        flowMode="all_access"
        attackPathFlowCount={0}
        selectedNodeId={opts.selected}
        onSelect={() => {}}
        presentationMode={false}
        viewDensity="glance"
        systemLabel={payload.system}
        identityLens={frame}
      />,
    )
    await waitFor(() => {
      expect(container.querySelectorAll("g[data-flow-family]").length).toBeGreaterThan(0)
    })
    const snap = new Map<
      string,
      { d: string; pos: string; text: string; tip: string; paint: string }
    >()
    for (const g of Array.from(container.querySelectorAll("g[data-flow-family]"))) {
      const stroke = g.querySelector('path[data-flow-line="stroke"]')
      const badge = g.querySelector('g[data-testid="topology-flow-badge"]')
      const leader = g.querySelector('[data-flow-badge-leader="true"]')
      snap.set(
        `${g.getAttribute("data-flow-source")}->${g.getAttribute("data-flow-target")}:${g.getAttribute("data-flow-family")}`,
        {
          d: stroke?.getAttribute("d") ?? "",
          pos: badge?.getAttribute("transform") ?? "",
          text: badge?.querySelector("text")?.textContent ?? "",
          tip: leader
            ? `${leader.getAttribute("data-leader-tip-x")},${leader.getAttribute("data-leader-tip-y")}`
            : "",
          paint: `${stroke?.getAttribute("stroke-width")}|${stroke?.getAttribute("stroke-opacity")}`,
        },
      )
    }
    return snap
  }

  it("the direction words change the label and re-route nothing", async () => {
    const role = focusRoleId()
    const cued = await renderFixedEdgeSet({ cueFor: role, selected: null })
    cleanup()
    const plain = await renderFixedEdgeSet({ cueFor: null, selected: null })

    expect(cued.size).toBe(plain.size)
    let relabelled = 0
    for (const [key, a] of cued) {
      const b = plain.get(key)
      expect(b, `edge ${key} missing without the cue`).toBeDefined()
      if (a.text !== b!.text) relabelled += 1
      // A label is not a route.
      expect(a.d, `the cue re-routed ${key}`).toBe(b!.d)
    }
    // Non-vacuous: the cue must actually say something.
    expect(relabelled).toBeGreaterThan(0)
  })

  it("moves no badge whose own label the cue did not change", async () => {
    const role = focusRoleId()
    const cued = await renderFixedEdgeSet({ cueFor: role, selected: null })
    cleanup()
    const plain = await renderFixedEdgeSet({ cueFor: null, selected: null })

    let unchangedLabels = 0
    for (const [key, a] of cued) {
      const b = plain.get(key)!
      if (a.text !== b.text) continue // its own label widened; it may need room
      unchangedLabels += 1
      expect(a.pos, `the cue displaced the badge of ${key}, which it did not relabel`).toBe(b.pos)
      expect(a.tip, `the cue moved the leader tip of ${key}, which it did not relabel`).toBe(b.tip)
    }
    // Non-vacuous: there are bystanders to be moved.
    expect(unchangedLabels).toBeGreaterThan(0)
  })

  it("emphasis repaints every line and re-routes none", async () => {
    const role = focusRoleId()
    const selected = await renderFixedEdgeSet({ cueFor: role, selected: role })
    cleanup()
    const unselected = await renderFixedEdgeSet({ cueFor: role, selected: null })

    let repainted = 0
    for (const [key, a] of selected) {
      const b = unselected.get(key)!
      if (a.paint !== b.paint) repainted += 1
      expect(a.d, `selecting re-routed ${key}`).toBe(b.d)
      expect(a.pos, `selecting moved the badge of ${key}`).toBe(b.pos)
      expect(a.text, `selecting relabelled ${key}`).toBe(b.text)
      expect(a.tip, `selecting moved the leader tip of ${key}`).toBe(b.tip)
    }
    // Non-vacuous: emphasis must actually emphasise.
    expect(repainted).toBeGreaterThan(0)
  })
})

describe("CF01-D1 · the Network frame does not change when the lens is off", () => {
  it("renders no identity plane, no identity legend and no identity markers without the prop", async () => {
    restoreLayout = installLayoutStub()
    const payload = estatePayload()
    const { container } = render(
      <AwsFrame
        vpcTopology={payload.vpc_topology!}
        nodes={payload.nodes}
        trafficEdges={payload.traffic_edges ?? []}
        overlayEdges={payload.traffic_edges ?? []}
        flowMode="all_access"
        onFlowModeChange={() => {}}
        selectedNodeId={null}
        onSelect={() => {}}
        systemLabel={payload.system}
      />,
    )
    await waitFor(() => {
      expect(container.querySelectorAll("g[data-flow-source]").length).toBeGreaterThan(0)
    })
    expect(container.querySelector('[data-testid="identity-lens-plane"]')).toBeNull()
    expect(container.querySelector('[data-testid="identity-lens-legend"]')).toBeNull()
    expect(container.querySelector('marker[id^="flow-arrow-identity"]')).toBeNull()
    expect(container.querySelector('[data-testid="topology-flow-legend"]')).not.toBeNull()
    expect(container.querySelector("g[data-flow-family]")).toBeNull()
  })
})

/**
 * A displaced badge keeps its text but loses the only cue that said which edge
 * it labels: proximity. Measured on the dense 3-hop render, 7 of 17 badges sat
 * closer to a FOREIGN edge than their own. The leader line restores part of
 * that association by ending on the badge's own drawn stroke.
 *
 * PART, not all — and this suite now says which part. Two limits are measured
 * here rather than asserted away:
 *
 *  1. The tip goes on the DRAWN stroke. `orthoPath` rounds every corner into a
 *     quadratic whose control point is the corner vertex, so the raw polyline
 *     handed to it is not the curve on screen. A point taken from the raw
 *     polyline sits up to 2.828px off the stroke at r=8.
 *
 *  2. Ending on the intended path is NECESSARY BUT NOT SUFFICIENT. Identity
 *     routes share bus lanes, so at hops=3 twelve of fifteen tips lie at
 *     exactly 0.00px from a FOREIGN stroke as well: the same point is on
 *     several paths, and a tip there names a bundle, not an edge. Membership
 *     alone cannot tell "attached to its own path" from "attached to any of
 *     five", so each leader carries its measured clearance and only claims to
 *     single out an edge when that clearance is real.
 */
describe("CF01-D1 · a displaced badge still points at its own edge", () => {
  /**
   * The drawn stroke, sampled.
   *
   * The version this replaces built its comparison polyline by pulling every
   * number out of `d`, which takes each `Q`'s CONTROL POINT — the un-rounded
   * corner vertex — for a point on the curve. It therefore measured the tip
   * against the RAW polyline while its comment claimed a 1.5px tolerance for
   * "the drawn stroke departs from the raw polyline near a bend". That
   * tolerance did not cover the departure it named (2.828px at r=8) and was
   * not measuring it either. This parses M/L/Q properly instead, so the
   * distance below is to the curve that is actually painted.
   */
  function sampleDrawnPath(d: string, per = 64): { x: number; y: number }[] {
    const toks = d.match(/[MLQ]|-?\d+(?:\.\d+)?/g) ?? []
    const out: { x: number; y: number }[] = []
    let cur = { x: 0, y: 0 }
    let i = 0
    while (i < toks.length) {
      const c = toks[i]
      if (c === "M" || c === "L") {
        cur = { x: Number(toks[i + 1]), y: Number(toks[i + 2]) }
        out.push({ ...cur })
        i += 3
      } else if (c === "Q") {
        const cx = Number(toks[i + 1]), cy = Number(toks[i + 2])
        const ex = Number(toks[i + 3]), ey = Number(toks[i + 4])
        const s = { ...cur }
        for (let k = 1; k <= per; k += 1) {
          const t = k / per
          const mt = 1 - t
          out.push({
            x: mt * mt * s.x + 2 * mt * t * cx + t * t * ex,
            y: mt * mt * s.y + 2 * mt * t * cy + t * t * ey,
          })
        }
        cur = { x: ex, y: ey }
        i += 5
      } else i += 1
    }
    return out
  }

  const distanceToStroke = (sampled: { x: number; y: number }[], x: number, y: number) => {
    const n = nearestPointOnPolyline(sampled, x, y)!
    return Math.hypot(n.x - x, n.y - y)
  }

  /**
   * ~0, stated as the resolution of the measurement rather than as a tolerance
   * standing in for a defect. Production flattens 24 samples per corner
   * (|B''|h²/8 ≈ 0.005px); this suite samples 64 (≈0.0007px). 0.05px is an
   * order of magnitude above both and 56x below the 2.828px error it replaces.
   */
  const ON_STROKE_PX = 0.05

  /** Every drawn group in the render, with its stroke sampled once. */
  function strokesOf(container: HTMLElement) {
    return Array.from(container.querySelectorAll("g[data-flow-family]"))
      .map(g => {
        const d = g.querySelector('path[data-flow-line="stroke"]')?.getAttribute("d") ?? ""
        return { g, d, sampled: d ? sampleDrawnPath(d) : [] }
      })
      .filter(s => s.sampled.length > 1)
  }

  /** Independent re-measurement: the tip's own stroke, and the nearest foreign one. */
  function measureTip(container: HTMLElement, leader: Element) {
    const group = leader.closest("g[data-flow-family]")!
    const strokes = strokesOf(container)
    const mine = strokes.find(s => s.g === group)!
    const tip = {
      x: Number(leader.getAttribute("data-leader-tip-x")),
      y: Number(leader.getAttribute("data-leader-tip-y")),
    }
    let foreign = Infinity
    for (const s of strokes) {
      if (s.g === group) continue
      foreign = Math.min(foreign, distanceToStroke(s.sampled, tip.x, tip.y))
    }
    return { tip, own: distanceToStroke(mine.sampled, tip.x, tip.y), foreign, strokes }
  }

  /** The density the attribution finding was measured at: 15 leaders, 17
   *  drawn strokes. The suite this replaces asserted at hops=2, two hops
   *  short of the render whose misattribution it was citing. */
  const DENSE_HOPS = 3

  async function denseRender() {
    const { lens } = lensFor(READY_WITH_GRAPH)
    const role = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!
    const view = await renderLens(READY_WITH_GRAPH, { selectedNodeId: role.id, hops: DENSE_HOPS })
    const leaders = Array.from(view.container.querySelectorAll('[data-flow-badge-leader="true"]'))
    return { ...view, leaders }
  }

  /**
   * THE CORNER COUNTEREXAMPLE, at unit level.
   *
   * A query point on a corner's outer bisector has its nearest RAW-polyline
   * point at the corner vertex — and the vertex is not on the stroke, because
   * the stroke cuts the corner with a quadratic. The gap is exactly 2√2 for
   * r=8. This is the case the old 1.5px tolerance claimed to absorb and could
   * not, and it is reachable geometry rather than a hypothetical: it is what
   * `nearestPointOnPolyline` returns for any badge sitting outside a bend.
   */
  it("attaches the tip to the DRAWN stroke, not to the raw polyline it rounds off", () => {
    const corner = [
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
    ]
    const drawn = sampleDrawnPath(orthoPath(corner), 256)
    // On the outer bisector, 40px out from the corner.
    const q = { x: 100 + 40 / Math.SQRT2, y: 100 + 40 / Math.SQRT2 }

    const raw = nearestPointOnPolyline(corner, q.x, q.y)!
    expect(raw).toEqual({ x: 100, y: 100 })
    const rawOff = distanceToStroke(drawn, raw.x, raw.y)
    // The measured defect, named rather than absorbed.
    expect(rawOff).toBeCloseTo(2 * Math.SQRT2, 3)
    expect(rawOff).toBeGreaterThan(ON_STROKE_PX)

    const rounded = nearestPointOnRoundedPath(corner, q.x, q.y)!
    const roundedOff = distanceToStroke(drawn, rounded.x, rounded.y)
    expect(
      roundedOff,
      `rounded attachment ${roundedOff.toFixed(4)}px off the stroke (raw was ${rawOff.toFixed(3)}px)`,
    ).toBeLessThanOrEqual(ON_STROKE_PX)
  })

  /**
   * Leaders exist and each tip is on its own stroke, measured against the
   * painted curve at ~0 instead of a 1.5px stand-in.
   *
   * WHAT THIS DISCRIMINATES: a tip left at a remembered badge position, which
   * the displacement decomposition measured 48-154px away. WHAT IT DOES NOT:
   * raw-polyline versus rounded attachment — in this fixture every tip lands
   * on a straight run, so both give 0.000px here. The corner case above is
   * where that distinction is pinned.
   */
  it("draws leaders, and every tip lands ON the stroke its own group paints", async () => {
    const { container, leaders } = await denseRender()
    // A render drawing zero leaders FAILS here.
    expect(leaders.length).toBeGreaterThan(0)
    for (const leader of leaders) {
      const { tip, own } = measureTip(container, leader)
      expect(Number.isFinite(tip.x) && Number.isFinite(tip.y)).toBe(true)
      expect(own, `tip ${own.toFixed(4)}px off its own stroke`).toBeLessThanOrEqual(ON_STROKE_PX)
    }
  })

  /**
   * The clearance is RECORDED, and it is the real number.
   *
   * Without this the lens knows only "the tip is on a path" — the predicate
   * that twelve of fifteen coincident tips satisfy against a foreign path just
   * as well as their own.
   */
  it("records how far each tip clears every OTHER drawn stroke", async () => {
    const { container, leaders } = await denseRender()
    expect(leaders.length).toBeGreaterThan(0)
    for (const leader of leaders) {
      const recorded = leader.getAttribute("data-leader-foreign-clearance")
      expect(recorded, "leader carries no measured clearance").not.toBeNull()
      const { foreign } = measureTip(container, leader)
      // Re-measured here from the rendered `d`, independently of the component.
      expect(Number(recorded)).toBeCloseTo(foreign, 1)
    }
  })

  /**
   * THE DISCRIMINATING ASSERTION. A leader may say it singles out its edge
   * only where the tip genuinely stands apart from every other stroke.
   *
   * This is what "on the intended path" could not establish: it fails if the
   * lens marks a tip discriminating while that tip also lies on a neighbour,
   * which is the state twelve of fifteen tips are in.
   */
  it("claims to single out an edge only where the tip clears the others", async () => {
    const { container, leaders } = await denseRender()
    const claiming = leaders.filter(l => l.getAttribute("data-leader-discriminates") === "true")
    // Non-vacuous: if nothing discriminates, this control proves nothing.
    expect(claiming.length).toBeGreaterThan(0)
    for (const leader of claiming) {
      const { own, foreign } = measureTip(container, leader)
      expect(own).toBeLessThanOrEqual(ON_STROKE_PX)
      expect(
        foreign,
        `claims to single out its edge but sits ${foreign.toFixed(2)}px from a foreign stroke`,
      ).toBeGreaterThanOrEqual(LEADER_DISCRIMINATION_MARGIN_PX)
    }
  })

  /**
   * THE OTHER SIDE OF THE PARTITION. The coincident majority is marked false,
   * not quietly omitted and not passed off as attached.
   *
   * The counts are MEASURED on this fixture at hops=3. A change here is a
   * re-measurement, not a number to re-baseline: it means the routes moved and
   * the attribution claim has to be re-established.
   */
  it("marks the coincident majority false rather than passing it off as attached", async () => {
    const { container, leaders } = await denseRender()
    const yes = leaders.filter(l => l.getAttribute("data-leader-discriminates") === "true")
    const no = leaders.filter(l => l.getAttribute("data-leader-discriminates") === "false")
    expect(yes.length + no.length).toBe(leaders.length)
    expect(leaders.length).toBe(15)
    expect(yes.length).toBe(3)
    expect(no.length).toBe(12)
    // Each "false" is false for the measured reason.
    for (const leader of no) {
      const { foreign } = measureTip(container, leader)
      expect(foreign).toBeLessThan(LEADER_DISCRIMINATION_MARGIN_PX)
    }
  })

  /**
   * FAIL CLOSED on a short comparison set. An unmeasured neighbour reads as
   * "no foreign stroke nearby", which would turn a coincident tip into a
   * confident one — the fail-open shape that makes a predicate pass on absence.
   */
  it("measures the clearance against every drawn stroke, never a subset", async () => {
    const { container, leaders } = await denseRender()
    const drawn = strokesOf(container as HTMLElement).length
    expect(leaders.length).toBeGreaterThan(0)
    for (const leader of leaders) {
      const compared = Number(leader.getAttribute("data-leader-compared-curves"))
      const comparable = Number(leader.getAttribute("data-leader-comparable-curves"))
      // Every drawn stroke had geometry to compare against.
      expect(comparable).toBe(drawn)
      // And every other one of them was actually measured.
      expect(compared).toBe(comparable - 1)
    }
  })

  it("a leader travels — it is a cue, not a zero-length mark", async () => {
    const { lens } = lensFor(READY_WITH_GRAPH)
    const role = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!
    const { container } = await renderLens(READY_WITH_GRAPH, { selectedNodeId: role.id })
    const leaders = Array.from(container.querySelectorAll('[data-flow-badge-leader="true"]'))
    expect(leaders.length).toBeGreaterThan(0)
    for (const leader of leaders) {
      const dx = Number(leader.getAttribute("x2"))
      const dy = Number(leader.getAttribute("y2"))
      expect(Math.hypot(dx, dy)).toBeGreaterThan(0)
    }
  })

  it("the Network view never grows a leader line", async () => {
    restoreLayout = installLayoutStub()
    const payload = estatePayload()
    const { container } = render(
      <AwsFrame
        vpcTopology={payload.vpc_topology!}
        nodes={payload.nodes}
        serverlessSourceNodes={payload.nodes}
        regionalDataSourceNodes={payload.nodes}
        trafficEdges={payload.traffic_edges ?? []}
        overlayEdges={[]}
        flowMode="all_access"
        attackPathFlowCount={0}
        selectedNodeId={null}
        onSelect={() => {}}
        presentationMode={false}
        viewDensity="glance"
        systemLabel={payload.system}
      />,
    )
    expect(container.querySelectorAll('[data-flow-badge-leader]').length).toBe(0)
  })
})

/**
 * CF01-D1 · a refusal with no name must not read as a finding.
 *
 * The lens prints every gap as `CODE — detail`, which is how a named diagnosis
 * is presented. `INVENTORY_AUTHORITY_INVALID` is not a diagnosis: the producer
 * emits it when a failure occurred that its contract cannot classify, and its
 * detail carries only the exception TYPE. Rendered the same way as a real
 * finding, it invites a reader to take "ValueError" for the cause.
 *
 * The payload here is the producer's own builder output, reached by malforming
 * one receipt field in the producer's harness — not a hand-written gap. Its
 * provenance is pinned in cf01-d1-identity-lens-model.test.ts.
 */
describe("CF01-D1 · an unnamed refusal is rendered as a refusal, not a diagnosis", () => {
  // Optional-chained on purpose: if the recipe ever stops emitting the block,
  // this suite must fail on an ASSERTION that says so, not crash at import
  // and leave the rendering rule untested.
  const REFUSAL = (fCandidate as any).producer_refusal?.inventory_authority_invalid

  it("shows the producer's code and marks it as naming no cause", async () => {
    expect(REFUSAL, "the recipe emitted no unnamed-refusal block").toBeDefined()
    const { container } = await renderLens(REFUSAL)
    const gap = container.querySelector('[data-gap-code="INVENTORY_AUTHORITY_INVALID"]')
    expect(gap, "the refusal is not surfaced at all").not.toBeNull()
    // The code is still shown — support needs it, and the producer's own
    // wording is never rewritten here.
    expect(gap!.textContent).toContain("INVENTORY_AUTHORITY_INVALID")
    // But it is explicitly NOT a named finding.
    expect(gap!.getAttribute("data-gap-names-cause")).toBe("false")
    expect(
      gap!.querySelector('[data-testid="identity-lens-notice-gap-unnamed"]'),
      "no qualifier: the token reads as a diagnosis",
    ).not.toBeNull()
    expect(gap!.textContent).toMatch(/could not name a cause/i)
  })

  it("draws no relationship off the back of a refused projection", async () => {
    expect(REFUSAL, "the recipe emitted no unnamed-refusal block").toBeDefined()
    const { container } = await renderLens(REFUSAL)
    expect(container.querySelectorAll("g[data-flow-family]").length).toBe(0)
    expect(container.querySelector('[data-testid="identity-lens-notice"]')).not.toBeNull()
  })

  /**
   * THE OTHER SIDE OF THE PARTITION. The rule must not blanket every gap as
   * unnamed — a real diagnosis has to keep reading as one, or the lens has
   * simply stopped naming anything.
   */
  it("leaves a NAMED gap named", async () => {
    const { container } = await renderLens(v1.unavailable)
    const named = container.querySelector('[data-gap-code="ACTIVE_INVENTORY_POINTER_MISSING"]')
    expect(named).not.toBeNull()
    expect(named!.getAttribute("data-gap-names-cause")).toBe("true")
    expect(
      named!.querySelector('[data-testid="identity-lens-notice-gap-unnamed"]'),
    ).toBeNull()
  })
})


describe("identity canvas keeps producer-backed isolated nodes", () => {
  it("draws the real producer's standalone account with zero served edges", async () => {
    const { container } = await renderLens(NODE_ONLY_ACCOUNT)
    expect(container.querySelector('[data-testid="identity-plane-chip"][data-identity-kind="aws_account"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="identity-plane-no-joins"]')).not.toBeNull()
    expect(container.querySelector("g[data-flow-family]")).toBeNull()
    expect(container.querySelector('[data-testid="identity-lens-notice"]')).toBeNull()
  })

  it("renders and selects an isolated IAM user, explains missing joins and draws no relationships", async () => {
    const base = TRULY_EMPTY_GRAPH
    const user = graphFixture.graph.ready.nodes.find(node => node.node_kind === "iam_user")!
    const block = { ...base, identity_graph: { ...base.identity_graph,
      nodes: [user], nodes_total: 1, edges: [], edges_total: 0 } }
    const onSelect = vi.fn()
    const { container, lens } = await renderLens(block, { onSelect })
    const chip = container.querySelector('[data-testid="identity-plane-chip"][data-identity-kind="iam_user"]')!
    expect(chip).not.toBeNull()
    expect(chip.textContent).toContain("alice")
    fireEvent.click(chip.querySelector("[data-flow-id]")!)
    expect(onSelect).toHaveBeenCalledWith(lens.nodes[0].id)
    expect(container.querySelector('[data-testid="identity-plane-no-joins"]')!.textContent)
      .toMatch(/no relationships were served[\s\S]*do not prove that it has no access/)
    expect(container.querySelector('[data-testid="identity-lens-notice"]')).toBeNull()
    expect(container.querySelector("g[data-flow-family]")).toBeNull()
  })

  it.each([
    ["empty", TRULY_EMPTY_GRAPH, "true"],
    ["unread", graphFixture.composed.empty_authoritative_with_unread_graph, "false"],
  ])("retains the %s notice without inventing a selectable identity", async (_label, block, emptyAnswer) => {
    const { container } = await renderLens(block)
    expect(container.querySelector('[data-testid="identity-plane-chip"]')).toBeNull()
    expect(container.querySelector('[data-testid="identity-plane-no-joins"]')).toBeNull()
    expect(container.querySelector('[data-testid="identity-lens-notice"]')?.getAttribute("data-identity-empty-answer"))
      .toBe(emptyAnswer)
  })
})
