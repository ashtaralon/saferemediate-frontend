/// <reference types="vitest/globals" />
/**
 * CF01 — the Identity & access lens is a 1:1 twin of the Network view.
 *
 * Same `AwsFrame`, same VPC frame, subnet grid, rails, chips, FlowOverlay,
 * legend geometry and selection. What the lens swaps is the frame's INPUTS
 * (estate-identity-twin.ts): IAM roles as a rail lane beside the regional
 * services, the AWS services a role reaches as regional chips, the principals
 * that may assume a role in the strip where the Network view keeps Internet,
 * and identity lines in place of traffic — each with the producer's plane on
 * the line, and motion ONLY on observed use backed by a decision generation.
 *
 * Payloads: the v1 + graph fixtures generated from saferemediate-backend
 * 41f5dda3 / 6e08d6b2 (see cf01-d1-identity-lens-model.test.ts for
 * provenance). They are test inputs for the CONSUMER contract, not
 * production reads.
 */

import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react"

import {
  AwsFrame,
  BADGE_HALF_HEIGHT,
  badgeHalfWidth,
  clampBadgeIntoBounds,
  nearestPointOnPolyline,
  nearestPointOnRoundedPath,
  orthoPath,
  separateIdentityBadges,
} from "@/components/topology-v0-2/aws-frame"
import { buildIdentityLensForPayload, identityAnchorId } from "@/components/topology-v0-2/estate-identity-access-model"
import type { IdentityLensFrameProps } from "@/components/topology-v0-2/estate-identity-plane"
import { identityChipSubtitle } from "@/components/topology-v0-2/estate-identity-plane"
import { buildIdentityTwin, identityServiceAnchorId } from "@/components/topology-v0-2/estate-identity-twin"
import { awsIconUrl } from "@/components/topology-v0-2/aws-architecture-icons"

import v1 from "./fixtures/estate-identity-access.json"
import historicalGraphFixture from "./fixtures/cf01-d1/estate-identity-graph-6e08d6b2.json"
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
const PARTIAL_WITH_GRAPH = graphFixture.composed.partial_with_truncated_graph
// The producer's "empty graph" fixture still contains a standalone account.
// Keep those source bytes intact; a truly empty negative control has no nodes.
const NODE_ONLY_ACCOUNT = graphFixture.composed.empty_authoritative_with_empty_graph
const TRULY_EMPTY_GRAPH = {
  ...NODE_ONLY_ACCOUNT,
  identity_graph: { ...NODE_ONLY_ACCOUNT.identity_graph, nodes: [], nodes_total: 0 },
}

const WEB_ROLE = identityAnchorId("iam_role", "AROAEXAMPLE")
const API_ROLE = identityAnchorId("iam_role", "AROAAPI")
const S3_ANCHOR = identityServiceAnchorId("s3")

function lensFor(identityAccess: unknown, focusedNodeId: string | null = null) {
  const block = identityAccess as any
  const positiveBlock = block?.identity_graph && ["ready", "partial"].includes(block.identity_graph.status) &&
    block.identity_graph.scope === undefined && block.scope?.account_id && block.inventory_authority?.generation !== undefined
    ? scopedHistoricalBlock(block) : identityAccess
  const payload = { ...estatePayload(), identity_access: positiveBlock } as any
  const topologyNodes = payload.nodes.map((n: any) => ({ ...n }))
  const lens = buildIdentityLensForPayload(payload, { topologyNodes })
  // Mirrors estate-map-view: the raw rows are read only once the lens has
  // validated the block, and the selection is handed to the twin so the
  // drawn line carries its relation to the focus.
  const rawRoles = lens.state === "ready" || lens.state === "incomplete" ? (positiveBlock as any)?.roles ?? null : null
  const twin = buildIdentityTwin(lens, { rawRoles, topologyNodes, focusId: focusedNodeId })
  const frame: IdentityLensFrameProps = { lens, twin, focusedNodeId }
  return { payload, lens, twin, frame, edges: twin.edges }
}

async function renderLens(
  identityAccess: unknown,
  options: { selectedNodeId?: string | null; onSelect?: (id: string) => void; presentationMode?: boolean } = {},
) {
  restoreLayout = installLayoutStub()
  const { payload, lens, twin, frame, edges } = lensFor(identityAccess, options.selectedNodeId ?? null)
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
      identityLens={frame}
    />,
  )
  if (edges.length > 0) {
    await waitFor(() => {
      expect(view.container.querySelectorAll("g[data-flow-source]").length).toBeGreaterThan(0)
    })
  }
  return { ...view, lens, twin, edges }
}

const lines = (container: HTMLElement) => Array.from(container.querySelectorAll("g[data-flow-family]"))
const lineOf = (container: HTMLElement, family: string) =>
  container.querySelector(`g[data-flow-family="${family}"]`) as SVGGElement | null

describe("CF01 · the identity lens IS the Network frame", () => {
  it("renders the SAME VPC frame, subnet grid, strip and rail as the Network view, with the identity inputs in place", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    expect(container.querySelector('[data-testid="topology-vpc-frame"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="topology-users-internet-strip"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="topology-users-node"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="topology-edge-services-rail"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="topology-regional-data-tier"]')).not.toBeNull()
    // Workload and bucket chips keep their topology anchors; the lens draws TO them.
    expect(container.querySelector('[data-flow-id="i-web"]')).not.toBeNull()
    expect(container.querySelector('[data-flow-id="bucket-assets"]')).not.toBeNull()
    // The band that used to hang under the frame is gone: one grammar per canvas.
    expect(container.querySelector('[data-testid="identity-lens-plane"]')).toBeNull()
    expect(container.querySelector('[data-testid="identity-plane-chip"]')).toBeNull()
  })

  it("draws the bound roles as an IAM lane on the rail, one chip per role, wearing the official IAM role icon", async () => {
    const { container, twin } = await renderLens(READY_WITH_GRAPH)
    const lane = container.querySelector('[data-testid="topology-iam-roles-tier"]') as HTMLElement
    expect(lane).not.toBeNull()
    expect(lane.textContent).toMatch(/IAM · Roles \(1\)/)
    const chips = Array.from(lane.querySelectorAll("[data-flow-id]"))
    expect(chips.map(c => c.getAttribute("data-flow-id"))).toEqual(twin.roleNodes.map(n => n.id))
    expect(chips.map(c => c.getAttribute("data-flow-id"))).toEqual([WEB_ROLE])
    expect(within(lane).getByText("web")).toBeInTheDocument()
    const icon = lane.querySelector("img")!
    expect(icon.getAttribute("src")).toBe(awsIconUrl("IAMRole"))
    // The lane is a rail lane the overlay knows: the grid has a corridor before Regional.
    const rail = container.querySelector('[data-testid="topology-edge-services-rail"]') as HTMLElement
    expect(rail.style.gridTemplateColumns).toBe("200px 112px 200px")
    expect(container.querySelectorAll('[data-testid="topology-interlane-corridor"]').length).toBe(1)
  })

  it("puts the trust entrances in the strip where the Network view keeps Internet, each with its class and icon", async () => {
    const { container, twin } = await renderLens(READY_WITH_GRAPH)
    expect(container.querySelector('[data-testid="topology-internet-node"]')).toBeNull()
    const strip = container.querySelector('[data-testid="topology-identity-principals"]') as HTMLElement
    expect(strip.textContent).toMatch(/Trust entrances/)
    expect(strip.textContent).toMatch(/May assume a bound role · 2/)
    const chips = Array.from(strip.querySelectorAll('[data-testid="topology-identity-principal"]'))
    expect(chips.map(c => c.getAttribute("data-flow-id")).sort()).toEqual(twin.principalNodes.map(n => n.id).sort())
    const byClass = new Map(chips.map(c => [c.getAttribute("data-principal-class"), c]))
    // `:root` of THIS account is the account-wide grant, never an outside party.
    expect(byClass.get("this_account_root")?.textContent).toMatch(/this account \(:root\)/)
    expect(byClass.get("this_account_root")?.querySelector("img")?.getAttribute("src")).toBe(awsIconUrl("AWSAccountPrincipal"))
    expect(byClass.get("federated")?.textContent).toMatch(/token\.actions\.githubusercontent\.com · SAML \/ OIDC/)
    expect(byClass.get("federated")?.querySelector("img")?.getAttribute("src")).toBe(awsIconUrl("FederatedPrincipal"))
    // A service principal (ec2.amazonaws.com) is the mechanism of the binding, not an entrance.
    expect(byClass.has("unclassified")).toBe(false)
    expect(strip.textContent).not.toMatch(/ec2\.amazonaws\.com/)
  })

  it("puts the service a role reaches on the regional rail as a service anchor, beside the real buckets, never AS a bucket", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    const regional = container.querySelector('[data-testid="topology-regional-data-tier"]') as HTMLElement
    const ids = Array.from(regional.querySelectorAll("[data-flow-id]")).map(c => c.getAttribute("data-flow-id"))
    expect(ids).toContain(S3_ANCHOR)
    expect(ids).toContain("bucket-assets")
    expect(within(regional).getByText("S3 · any bucket")).toBeInTheDocument()
    // No line ends on the named bucket: the decision row is action-scoped.
    expect(lines(container).some(g => g.getAttribute("data-flow-target") === "bucket-assets")).toBe(false)
  })

  it("replaces the traffic legend, flow-mode toggle and traffic banners with the identity legend and the twin footer", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    expect(container.querySelector('[data-testid="identity-lens-legend"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="identity-twin-footer"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="topology-flow-legend"]')).toBeNull()
    expect(container.querySelector('[data-testid="topology-flow-mode-toggle"]')).toBeNull()
    expect(container.querySelector('[data-testid="topology-traffic-authority"]')).toBeNull()
  })

  it("counts every hidden set in the footer instead of dropping it", async () => {
    const { container, twin } = await renderLens(READY_WITH_GRAPH)
    const footer = container.querySelector('[data-testid="identity-twin-footer"]') as HTMLElement
    expect(footer.textContent).toMatch(/1 role bound to a workload on this canvas/)
    expect(footer.textContent).toMatch(new RegExp(`${twin.counts.otherAccountRoles} other role`))
    expect(footer.textContent).toMatch(new RegExp(`${twin.counts.users} IAM users in the graph, not drawn`))
    expect(footer.textContent).toMatch(/protected resource not on this map/)
    expect(footer.textContent).toMatch(/relationship families not on the canonical path/)
  })
})

describe("CF01 · the lines are the Network view's lines with the producer's plane", () => {
  it("draws workload → role from the workload's own chip into the IAM lane, dashed slate, still, with the mechanism as its badge", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    const runsAs = lineOf(container, "WORKLOAD_USES_ROLE")!
    expect(runsAs.getAttribute("data-flow-source")).toBe("i-web")
    expect(runsAs.getAttribute("data-flow-target")).toBe(WEB_ROLE)
    expect(runsAs.getAttribute("data-flow-plane")).toBe("configured")
    expect(runsAs.getAttribute("data-flow-motion")).toBe("none")
    const stroke = runsAs.querySelector('path[data-flow-line="stroke"]')!
    expect(stroke.getAttribute("stroke")).toBe("#475569")
    expect(stroke.getAttribute("stroke-dasharray")).toBe("5 4")
    expect(runsAs.querySelector('[data-testid="topology-flow-running-track"]')).toBeNull()
    expect(runsAs.querySelector("text")?.textContent).toBe("instance profile")
  })

  it("draws principal → role from the strip into the IAM lane, one still line per statement, conditioned or not", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    const trust = lines(container).filter(g => g.getAttribute("data-flow-family") === "ROLE_TRUST_POLICY")
    expect(trust).toHaveLength(2)
    for (const g of trust) {
      expect(g.getAttribute("data-flow-target")).toBe(WEB_ROLE)
      expect(g.getAttribute("data-flow-plane")).toBe("configured")
      expect(g.getAttribute("data-flow-motion")).toBe("none")
    }
    const words = trust.map(g => g.querySelector("text")?.textContent).sort()
    expect(words).toEqual(["may assume · conditioned", "may assume · unconditioned"])
  })

  it("draws role → service as a rail feeder through the corridor, teal, MOVING, because use was observed under a decision generation", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    const reach = lineOf(container, "ROLE_ACTION_DECISION")!
    expect(reach.getAttribute("data-flow-source")).toBe("lane:iam")
    expect(reach.getAttribute("data-flow-target")).toBe(S3_ANCHOR)
    expect(reach.getAttribute("data-flow-plane")).toBe("observed")
    expect(reach.getAttribute("data-flow-verdict")).toBe("observed")
    expect(reach.getAttribute("data-flow-motion")).toBe("authoritative")
    expect(reach.getAttribute("data-flow-bundle")).toBe("1")
    expect(reach.getAttribute("data-flow-members")).toBe(`${WEB_ROLE}→${S3_ANCHOR}`)
    const stroke = reach.querySelector('path[data-flow-line="stroke"]')!
    expect(stroke.getAttribute("stroke")).toBe("#0E8B7A")
    expect(stroke.getAttribute("stroke-dasharray")).toBeNull()
    expect(reach.querySelector('[data-testid="topology-flow-running-track"]')).not.toBeNull()
    expect(reach.querySelector("text")?.textContent).toBe("s3 · explicit 1 · used 1")
  })

  it("moves nothing when the decision authority is not generation-stamped", async () => {
    const block = { ...READY_WITH_GRAPH, decision_authority: null } as any
    const { container, edges } = await renderLens(block)
    expect(edges.some(e => e.identity?.family === "ROLE_ACTION_DECISION")).toBe(false)
    for (const g of lines(container)) expect(g.getAttribute("data-flow-motion")).toBe("none")
    expect(container.querySelector('[data-testid="topology-flow-running-track"]')).toBeNull()
  })

  it("a role whose usage is not computed gets its chip and its runs-as line, and NO reach line", async () => {
    const { container } = await renderLens(PARTIAL_WITH_GRAPH)
    const lane = container.querySelector('[data-testid="topology-iam-roles-tier"]') as HTMLElement
    expect(Array.from(lane.querySelectorAll("[data-flow-id]")).map(c => c.getAttribute("data-flow-id"))).toEqual([API_ROLE, WEB_ROLE])
    const runsAs = lines(container).filter(g => g.getAttribute("data-flow-family") === "WORKLOAD_USES_ROLE")
    expect(runsAs.map(g => `${g.getAttribute("data-flow-source")}→${g.getAttribute("data-flow-target")}`).sort()).toEqual([
      `i-api→${API_ROLE}`,
      `i-web→${WEB_ROLE}`,
    ])
    const reach = lines(container).filter(g => g.getAttribute("data-flow-family") === "ROLE_ACTION_DECISION")
    expect(reach).toHaveLength(1)
    expect(reach[0].getAttribute("data-flow-members")).toBe(`${WEB_ROLE}→${S3_ANCHOR}`)
    expect(container.querySelector('[data-testid="identity-twin-footer"]')!.textContent).toMatch(/1 of them: usage not computed \(no reach line\)/)
  })

  it("selecting a role marks its own lines outgoing / incoming and words them out / in, as the Network view does", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH, { selectedNodeId: WEB_ROLE })
    const relations = lines(container).map(g => g.getAttribute("data-flow-focus-relation"))
    expect(relations).toContain("incoming")
    expect(relations).toContain("outgoing")
    expect(relations).not.toContain("context")
    for (const g of lines(container)) {
      const relation = g.getAttribute("data-flow-focus-relation")
      const word = g.querySelector("text")?.textContent ?? ""
      // Per-chip lines carry the direction word; a rail bundle's word is its
      // count and stays as the Network view prints it.
      if (g.getAttribute("data-flow-source")?.startsWith("lane:")) continue
      if (relation === "outgoing") expect(word).toMatch(/^out · /)
      if (relation === "incoming") expect(word).toMatch(/^in · /)
    }
    // Every line here is the selection's own: nothing is dimmed as context.
    expect(lines(container).every(g => g.getAttribute("data-flow-focus-relation") !== "context")).toBe(true)
  })

  it("renders in fullscreen presentation mode with the same anchors and the role's reading as its chip caption", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH, { presentationMode: true })
    const lane = container.querySelector('[data-testid="topology-iam-roles-tier"]') as HTMLElement
    expect(lane.querySelector(`[data-flow-id="${CSS.escape(WEB_ROLE)}"]`)).not.toBeNull()
    expect(within(lane).getByTestId("topology-chip-caption").textContent).toBe("explicit 1 · used 1 · trusts ec2.amazonaws.com")
    expect(container.querySelector(`[data-flow-id="${CSS.escape(S3_ANCHOR)}"]`)).not.toBeNull()
    expect(lineOf(container, "ROLE_ACTION_DECISION")).not.toBeNull()
  })

  it("clicking a role chip or a principal chip selects it through the frame's own onSelect", async () => {
    const onSelect = vi.fn()
    const { container, twin } = await renderLens(READY_WITH_GRAPH, { onSelect })
    fireEvent.click(container.querySelector(`[data-testid="topology-iam-roles-tier"] [data-flow-id="${CSS.escape(WEB_ROLE)}"]`)!)
    expect(onSelect).toHaveBeenLastCalledWith(WEB_ROLE)
    const principal = twin.principalNodes[0]
    fireEvent.click(container.querySelector(`[data-testid="topology-identity-principal"][data-flow-id="${CSS.escape(principal.id)}"]`)!)
    expect(onSelect).toHaveBeenLastCalledWith(principal.id)
  })
})

describe("CF01 · unavailable is not zero, on the canvas", () => {
  it("the emitter's ready v1 draws the real bindings and reach, not a swallowed read failure", async () => {
    const { container, lens } = await renderLens(v1.ready)
    expect(lens.state).toBe("ready")
    expect(lineOf(container, "WORKLOAD_USES_ROLE")).not.toBeNull()
    expect(lineOf(container, "ROLE_ACTION_DECISION")).not.toBeNull()
    // The emitter's trust statements are all service principals: no entrance
    // is drawn and the strip says which reason applies, never "nobody".
    const strip = container.querySelector('[data-testid="topology-identity-principals"]') as HTMLElement
    expect(strip.textContent).toMatch(/None drawn · no trust statement served for the bound roles/)
  })

  it("an unavailable projection shows the notice with its gap code and draws no lane, no entrance and no line", async () => {
    const { container } = await renderLens(v1.unavailable)
    const notice = container.querySelector('[data-testid="identity-lens-notice"]') as HTMLElement
    expect(notice).not.toBeNull()
    expect(notice.getAttribute("data-identity-empty-answer")).toBe("false")
    expect(within(notice).getAllByTestId("identity-lens-notice-gap").map(g => g.getAttribute("data-gap-code"))).toContain(
      "ACTIVE_INVENTORY_POINTER_MISSING",
    )
    expect(container.querySelector('[data-testid="topology-iam-roles-tier"]')).toBeNull()
    expect(container.querySelector('[data-testid="topology-identity-principal"]')).toBeNull()
    expect(lines(container)).toHaveLength(0)
    expect(container.querySelector('[data-testid="topology-identity-principals-caption"]')!.textContent).toMatch(/identity graph not read/)
  })

  it("empty-authoritative is the one empty canvas that is an answer, and it says so", async () => {
    const { container, lens } = await renderLens(TRULY_EMPTY_GRAPH)
    expect(lens.emptyAnswer).toBe(true)
    const notice = container.querySelector('[data-testid="identity-lens-notice"]') as HTMLElement
    expect(notice.getAttribute("data-identity-empty-answer")).toBe("true")
    expect(within(notice).getByTestId("identity-lens-notice-coverage").textContent).toMatch(/Unknown rather than zero/)
    expect(container.querySelector('[data-testid="topology-iam-roles-tier"]')).toBeNull()
    expect(container.querySelector('[data-testid="topology-identity-principals-caption"]')!.textContent).toMatch(/no role bound to a workload on this canvas/)
  })

  it("a roles-empty payload whose GRAPH was never read is not an answer on the canvas", async () => {
    const { container, lens } = await renderLens(historicalGraphFixture.composed.empty_authoritative_with_unread_graph)
    expect(lens.emptyAnswer).toBe(false)
    expect(container.querySelector('[data-testid="identity-lens-notice"]')!.getAttribute("data-identity-empty-answer")).toBe("false")
  })

  it("the Network frame does not change when the lens is off", async () => {
    restoreLayout = installLayoutStub()
    const payload = estatePayload()
    const { container } = render(
      <AwsFrame
        vpcTopology={payload.vpc_topology!}
        nodes={payload.nodes}
        serverlessSourceNodes={payload.nodes}
        regionalDataSourceNodes={payload.nodes}
        trafficEdges={payload.traffic_edges ?? []}
        flowMode="all_access"
        attackPathFlowCount={0}
        selectedNodeId={null}
        onSelect={() => {}}
        presentationMode={false}
        viewDensity="glance"
        systemLabel={payload.system}
      />,
    )
    expect(container.querySelector('[data-testid="topology-iam-roles-tier"]')).toBeNull()
    expect(container.querySelector('[data-testid="topology-identity-principals"]')).toBeNull()
    expect(container.querySelector('[data-testid="topology-internet-node"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="identity-lens-legend"]')).toBeNull()
    expect(container.querySelector('[data-testid="identity-twin-footer"]')).toBeNull()
    expect(container.querySelector("marker[id^='flow-arrow-identity-']")).toBeNull()
  })
})

describe("CF01 · a chip names the thing, not its anchor id", () => {
  it("never shows a synthetic canvas anchor as chip text", async () => {
    const { container } = await renderLens(READY_WITH_GRAPH)
    for (const sel of ['[data-testid="topology-iam-roles-tier"]', '[data-testid="topology-identity-principals"]']) {
      const el = container.querySelector(sel) as HTMLElement
      expect(el.querySelector("[data-flow-id]")!.getAttribute("data-flow-id")).toMatch(/^__identity:/)
      expect(el.textContent ?? "").not.toMatch(/__identity:/)
    }
  })

  it("the identity subtitle helper is derived from producer fields only", () => {
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
})
