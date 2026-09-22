/// <reference types="vitest/globals" />
/**
 * CF01 · D1 — Network view regression guard.
 *
 * The identity lens is rendered ON the same AwsFrame as the Network topology.
 * That reuse is only acceptable if the Network view is unchanged wherever no
 * change was intended, so this pins the Network view's rendered DOM — chips,
 * subnet grid, rails, flow-mode toggle, legend, and the FlowOverlay paths —
 * in the configurations the estate page actually renders (inline glance,
 * inline inventory, fullscreen presentation).
 *
 * The snapshots were generated at the lane base (472551c5) BEFORE any product
 * file was edited, and committed in the same change as this test. A later
 * commit that alters the Network DOM fails here; an intended change must
 * update the snapshot in its own commit and say why.
 *
 * Geometry comes from `installLayoutStub()` (document-order rects), so the
 * paths are deterministic in happy-dom and the guard covers the overlay too.
 */

import React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"

import { AwsFrame } from "@/components/topology-v0-2/aws-frame"

import {
  backendV11,
  estatePayload,
  installLayoutStub,
  normalizeHtml,
} from "./fixtures/cf01-d1/network-fixture"

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

async function renderNetwork(
  payload = estatePayload(),
  options: { viewDensity?: "glance" | "inventory"; presentationMode?: boolean; selectedNodeId?: string | null } = {},
) {
  restoreLayout = installLayoutStub()
  const vpcTopology = payload.vpc_topology
  if (!vpcTopology) throw new Error("fixture carries no vpc_topology")
  const view = render(
    <AwsFrame
      vpcTopology={vpcTopology}
      nodes={payload.nodes}
      serverlessSourceNodes={payload.nodes}
      regionalDataSourceNodes={payload.nodes}
      trafficEdges={payload.traffic_edges ?? []}
      trafficAuthority={payload.traffic_authority}
      overlayEdges={payload.traffic_edges ?? []}
      flowMode="all_access"
      onFlowModeChange={() => {}}
      attackPathFlowCount={0}
      selectedNodeId={options.selectedNodeId ?? null}
      onSelect={() => {}}
      presentationMode={options.presentationMode ?? false}
      viewDensity={options.viewDensity ?? "glance"}
      systemLabel={payload.system}
    />,
  )
  // FlowOverlay measures after paint and retries on a short backoff; wait for
  // at least one drawn path before pinning, so the snapshot includes geometry.
  if ((payload.traffic_edges ?? []).length > 0) {
    await waitFor(() => {
      expect(view.container.querySelectorAll("g[data-flow-source]").length).toBeGreaterThan(0)
    })
  }
  return view
}

describe("CF01-D1 · the Network view is unchanged where no change was intended", () => {
  it("inline glance — estate payload", async () => {
    const { container } = await renderNetwork(estatePayload(), { viewDensity: "glance" })
    expect(container.querySelector('[data-testid="topology-vpc-frame"]')).not.toBeNull()
    expect(normalizeHtml(container.innerHTML)).toMatchSnapshot()
  })

  it("inline inventory with a selection — estate payload", async () => {
    const { container } = await renderNetwork(estatePayload(), {
      viewDensity: "inventory",
      selectedNodeId: "i-web",
    })
    expect(normalizeHtml(container.innerHTML)).toMatchSnapshot()
  })

  it("fullscreen presentation — estate payload", async () => {
    const { container } = await renderNetwork(estatePayload(), {
      viewDensity: "glance",
      presentationMode: true,
    })
    expect(normalizeHtml(container.innerHTML)).toMatchSnapshot()
  })

  it("inline glance — backend v11 fixture (41f5dda3)", async () => {
    const { container } = await renderNetwork(backendV11(), { viewDensity: "glance" })
    expect(normalizeHtml(container.innerHTML)).toMatchSnapshot()
  })

  it("draws the observed authoritative segments with motion, as before", async () => {
    const { container } = await renderNetwork(estatePayload())
    const motion = Array.from(container.querySelectorAll("g[data-flow-source]")).map(g =>
      g.getAttribute("data-flow-motion"),
    )
    expect(motion.length).toBeGreaterThan(0)
    expect(motion.every(m => m === "authoritative")).toBe(true)
    expect(container.querySelectorAll('[data-testid="topology-flow-packet"]').length).toBe(motion.length)
  })

  it("keeps the flow-mode toggle and flow legend on the Network view", async () => {
    const { container } = await renderNetwork(estatePayload())
    expect(container.querySelector('[data-testid="topology-platform-map-summary"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="topology-flow-legend"]')).not.toBeNull()
  })
})
