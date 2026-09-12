/// <reference types="vitest/globals" />
/**
 * IGW inspector identity — the `__igw__` chip is a CANVAS ANCHOR, never a
 * resource id.
 *
 * Reproduced in Chrome (2026-09-12 review): selecting the internet gateway chip
 * (real AWS id igw-01b6c643a5c856abe) read "InternetGateway __igw__ not found in
 * graph" and asked the operator to collect it. estate-map-view synthesized the
 * inspector node with `id: "__igw__"` and detail-panel handed `node.id` to
 * Inventory as `resourceId`, while the real gateway id sat unused in the same
 * payload (`vpc_topology.edges.igws[0].id`, and the structural IGW hop the
 * egress edges carry).
 *
 * Canvas identity and AWS identity are now separate fields: the node keeps the
 * anchor as `id` (selection, focus, flow routing) and carries the gateway id as
 * `resource_id`; every request resolves through `inspectableResourceId`, which
 * never returns a sentinel. When the payload names no gateway id the panel says
 * so and requests nothing — no fabricated id.
 */
import React from "react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { DetailPanel } from "@/components/topology-v0-2/detail-panel"
import {
  IGW_CANVAS_ANCHOR_ID,
  buildIgwInspectorNode,
  inspectableResourceId,
  isCanvasAnchorId,
  resolveIgwResourceId,
} from "@/components/topology-v0-2/service-paths"
import type { TopologyNode, TrafficEdge } from "@/components/topology-v0-2/types"

const captured = vi.hoisted(() => ({ inspectorIds: [] as string[] }))

vi.mock("@/components/inventory/resource-config-tab", () => ({
  ResourceConfigTab: ({ resourceId }: { resourceId: string }) => {
    captured.inspectorIds.push(resourceId)
    return <div data-testid="inventory-config">Inventory configuration for {resourceId}</div>
  },
}))

vi.mock("@/lib/service-type", () => ({
  ServiceTypeBadge: ({ type }: { type: string }) => <div aria-label={`Service type ${type}`} />,
}))

const GATEWAY_ID = "igw-01b6c643a5c856abe"
const VPC = "vpc-0329e985173bed24f"
const IGWS = [{ id: GATEWAY_ID, name: "alon-prod-igw", vpc_id: VPC }]

function hopEdge(
  hops: Array<{ kind: string; id: string }>,
  via_igw_id: string | null = null,
): Pick<TrafficEdge, "egress_hops" | "via_igw_id"> {
  return { egress_hops: hops, via_igw_id }
}

function anchorNode(resource_id: string | null): TopologyNode {
  return {
    id: IGW_CANVAS_ANCHOR_ID,
    resource_id,
    name: "alon-prod-igw",
    type: "InternetGateway",
    subnet_id: null,
    vpc_id: VPC,
    account_id: "745783559495",
    region: "eu-west-1",
    score: null,
    stale: null,
    is_jewel: false,
  }
}

/** Every backend read answers "not in this test": the assertions are about the
 *  id in the request URL, not about what a dossier would render. */
function notInThisTest() {
  return Promise.resolve(
    new Response(JSON.stringify({ detail: "not in this test" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

function renderPanel(node: TopologyNode) {
  return render(
    <DetailPanel
      node={node}
      systemName="alon-prod"
      accountId="745783559495"
      region="eu-west-1"
      vpcId={VPC}
      onClose={() => {}}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  captured.inspectorIds.length = 0
})

describe("resolveIgwResourceId — the gateway behind the anchor, from the payload only", () => {
  it("reads the primary gateway's id from the gateway list", () => {
    expect(resolveIgwResourceId(IGWS)).toBe(GATEWAY_ID)
  })

  it("falls back to the structural IGW hop the egress edges carry", () => {
    expect(
      resolveIgwResourceId([], [hopEdge([{ kind: "nat", id: "nat-0fd7cf8524e62aea9" }, { kind: "igw", id: GATEWAY_ID }])]),
    ).toBe(GATEWAY_ID)
    expect(resolveIgwResourceId(null, [hopEdge([], GATEWAY_ID)])).toBe(GATEWAY_ID)
  })

  it("refuses to pick between two gateways the hops disagree on", () => {
    expect(
      resolveIgwResourceId([], [hopEdge([{ kind: "igw", id: "igw-0aaaaaaaaaaaaaaaa" }]), hopEdge([{ kind: "igw", id: "igw-0bbbbbbbbbbbbbbbb" }])]),
    ).toBeNull()
  })

  it("never answers with the anchor itself, and null when nothing names a gateway", () => {
    expect(resolveIgwResourceId([{ id: IGW_CANVAS_ANCHOR_ID }])).toBeNull()
    expect(resolveIgwResourceId([{ id: "" }], [hopEdge([{ kind: "nat", id: "nat-0fd7cf8524e62aea9" }])])).toBeNull()
    expect(resolveIgwResourceId(undefined, [])).toBeNull()
  })
})

describe("buildIgwInspectorNode — canvas anchor and AWS identity are distinct fields", () => {
  it("keeps __igw__ as the id and carries the gateway id as resource_id", () => {
    const node = buildIgwInspectorNode(IGWS, [], { account_id: "745783559495", region: "eu-west-1", vpc_id: VPC })
    expect(node).toMatchObject({
      id: IGW_CANVAS_ANCHOR_ID,
      resource_id: GATEWAY_ID,
      type: "InternetGateway",
      name: "alon-prod-igw",
      vpc_id: VPC,
      account_id: "745783559495",
      region: "eu-west-1",
    })
    expect(node?.id).not.toBe(node?.resource_id)
  })

  it("marks the identity unresolved (null) when the payload names no gateway id", () => {
    const node = buildIgwInspectorNode([{ id: "", name: "" }], [], { account_id: null, region: null, vpc_id: null })
    expect(node?.id).toBe(IGW_CANVAS_ANCHOR_ID)
    expect(node?.resource_id).toBeNull()
    expect(node?.name).toBe("Internet gateway")
  })

  it("builds nothing when the payload has no gateway — there is no chip either", () => {
    expect(buildIgwInspectorNode([], [], { account_id: null, region: null, vpc_id: null })).toBeNull()
    expect(buildIgwInspectorNode(undefined, [], { account_id: null, region: null, vpc_id: null })).toBeNull()
  })
})

describe("inspectableResourceId — what a request may carry", () => {
  it("passes a graph node's own id through", () => {
    expect(inspectableResourceId({ id: "i-0e9b891793b5b2dbd" })).toBe("i-0e9b891793b5b2dbd")
    expect(inspectableResourceId({ id: "arn:aws:s3:::saferemediate-logs-745783559495" })).toBe(
      "arn:aws:s3:::saferemediate-logs-745783559495",
    )
  })

  it("resolves an anchor to the resource id it carries, and to null without one", () => {
    expect(inspectableResourceId({ id: IGW_CANVAS_ANCHOR_ID, resource_id: GATEWAY_ID })).toBe(GATEWAY_ID)
    expect(inspectableResourceId({ id: IGW_CANVAS_ANCHOR_ID, resource_id: null })).toBeNull()
    expect(inspectableResourceId({ id: IGW_CANVAS_ANCHOR_ID })).toBeNull()
    // A sentinel in the resource slot is still a sentinel.
    expect(inspectableResourceId({ id: IGW_CANVAS_ANCHOR_ID, resource_id: "__aws_s3__" })).toBeNull()
  })

  it("recognises every canvas sentinel the frame mints and no AWS id", () => {
    for (const id of [IGW_CANVAS_ANCHOR_ID, "__aws_s3__", "__aws_api__", "vpce-0123456789abcdef0::aws-service"]) {
      expect(isCanvasAnchorId(id), id).toBe(true)
    }
    for (const id of [GATEWAY_ID, "i-0e9b891793b5b2dbd", "vpce-0123456789abcdef0", "arn:aws:s3:::bucket", "nat-0fd7cf8524e62aea9"]) {
      expect(isCanvasAnchorId(id), id).toBe(false)
    }
    expect(isCanvasAnchorId(null)).toBe(false)
  })
})

describe("DetailPanel — the inspector asks about the gateway, never the anchor", () => {
  it("sends the real gateway id to Inventory and to every operational read", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(notInThisTest)
    renderPanel(anchorNode(GATEWAY_ID))

    expect(screen.getByTestId("inventory-config")).toHaveTextContent(GATEWAY_ID)
    expect(captured.inspectorIds).toEqual([GATEWAY_ID])
    expect(screen.getByTestId("estate-operations-resource-id")).toHaveTextContent(GATEWAY_ID)
    expect(screen.queryByTestId("estate-anchor-identity-unresolved")).toBeNull()

    // The dossier and narration reads fire on mount; both name the gateway.
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2))
    const urls = fetchSpy.mock.calls.map(([input]) => String(input))
    expect(urls.some(url => url.includes("/api/proxy/operational-map/alon-prod/resource?"))).toBe(true)
    expect(urls.some(url => url.includes("/api/proxy/operational-map/alon-prod/resource/narration?"))).toBe(true)
    for (const url of urls) {
      expect(url).toContain(`resource_id=${GATEWAY_ID}`)
      expect(url).not.toContain(IGW_CANVAS_ANCHOR_ID)
    }
  })

  it("says the gateway identity is unresolved and requests nothing when the payload names no id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(notInThisTest)
    renderPanel(anchorNode(null))

    const unresolved = screen.getByTestId("estate-anchor-identity-unresolved")
    expect(unresolved).toHaveTextContent("Gateway identity unresolved")
    expect(unresolved).toHaveTextContent("Nothing was requested from Inventory")
    expect(screen.queryByTestId("inventory-config")).toBeNull()
    expect(captured.inspectorIds).toEqual([])
    expect(screen.getByTestId("estate-operations-resource-id")).toHaveTextContent("unresolved in this payload")
    expect(screen.getByTestId("estate-operations-resource-id")).not.toHaveTextContent(IGW_CANVAS_ANCHOR_ID)

    // Let the mount effects settle: no dossier, no narration — no request at all.
    await new Promise(resolveTick => setTimeout(resolveTick, 0))
    expect(fetchSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId("estate-operations-tab-dependencies"))
    expect(screen.getByTestId("estate-anchor-dependencies-unresolved")).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("source contract — the sentinel has no path to an API", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, "../../components/topology-v0-2", rel), "utf8")

  it("estate-map-view synthesizes the IGW inspector node through the builder, not an inline object keyed by the anchor", () => {
    const view = read("estate-map-view.tsx")
    expect(view).toContain("buildIgwInspectorNode(topology.edges.igws, scopedTrafficEdges")
    expect(view).not.toMatch(/id:\s*"__igw__"/)
  })

  it("detail-panel never hands node.id to a request, and keeps it for the canvas", () => {
    const panel = read("detail-panel.tsx")
    expect(panel).toContain("inspectableResourceId(node)")
    expect(panel).not.toContain("resourceId={node.id}")
    expect(panel).not.toContain("resource_id: node.id")
    // ServicePathMap works on flow ids: the canvas identity stays there on purpose.
    expect(panel).toContain("selectedNodeId={node.id}")
  })
})
