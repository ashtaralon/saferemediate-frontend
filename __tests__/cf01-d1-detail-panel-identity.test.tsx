/// <reference types="vitest/globals" />
/**
 * CF01 · D1 — identity selections open the SAME DetailPanel.
 *
 * The panel that opens for a workload chip on the Network view is the panel
 * that opens for a role chip on the Identity lens: same component, same
 * chrome, same close/tabs. What the lens adds is an evidence section built
 * from the producer's block; what it withholds is any Inventory request for
 * an identity-plane anchor, which has no dossier.
 */

import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

vi.mock("@/components/inventory/resource-config-tab", () => ({
  ResourceConfigTab: ({ resourceId }: { resourceId: string }) => (
    <div data-testid="resource-config-tab-stub">config for {resourceId}</div>
  ),
}))

import { DetailPanel } from "@/components/topology-v0-2/detail-panel"
import {
  buildIdentityLensForPayload,
  identitySelectionDetail,
  identityLensTrafficEdges,
} from "@/components/topology-v0-2/estate-identity-access-model"
import { identityNodeAsTopologyNode } from "@/components/topology-v0-2/estate-identity-plane"

import graphFixture from "./fixtures/cf01-d1/estate-identity-graph-6e08d6b2.json"
import { estatePayload } from "./fixtures/cf01-d1/network-fixture"

const fetchSpy = vi.fn()

beforeEach(() => {
  fetchSpy.mockReset()
  fetchSpy.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "{}",
    headers: new Headers(),
  })
  globalThis.fetch = fetchSpy as any
})

afterEach(() => cleanup())

const payload = { ...estatePayload(), identity_access: graphFixture.composed.ready_with_graph } as any
const lens = buildIdentityLensForPayload(payload, {
  topologyNodes: payload.nodes.map((n: any) => ({ id: n.id, name: n.name, type: n.type })),
})

describe("CF01-D1 · DetailPanel reused for identity selections", () => {
  it("an identity-plane role opens the shared panel with the identity evidence section and requests nothing", () => {
    const role = lens.nodes.find(n => n.kind === "iam_role" && n.label === "web")!
    const detail = identitySelectionDetail(lens, role.id)!
    render(
      <DetailPanel
        node={identityNodeAsTopologyNode(role)}
        systemName="testbed-webshop"
        accountId="416651950952"
        region="eu-west-1"
        vpcId="vpc-1"
        inspectorNodes={[identityNodeAsTopologyNode(role)]}
        inspectorEdges={[]}
        identity={detail}
        onClose={() => {}}
      />,
    )
    const panel = screen.getByTestId("topology-service-detail-panel")
    expect(panel.getAttribute("role")).toBe("dialog")
    expect(panel.textContent).toMatch(/Identity & access · IAM role/)
    const section = screen.getByTestId("estate-identity-detail")
    expect(section.getAttribute("data-identity-kind")).toBe("iam_role")
    const path = screen.getByTestId("estate-identity-access-path")
    expect(path.textContent).toMatch(/webshop-web/)
    expect(path.textContent).toMatch(/Target not served/)
    expect(screen.getByTestId("estate-identity-access-path-missing-target")).toBeInTheDocument()
    const roleCards = screen.getAllByTestId("estate-identity-access-path-node").filter(
      card => card.getAttribute("data-node-id") === role.id,
    )
    expect(roleCards).toHaveLength(1)
    const rows = within(section).getAllByTestId("estate-identity-relationship")
    const families = rows.map(r => r.getAttribute("data-family")).sort()
    expect(families).toEqual([
      "PRINCIPAL_HAS_INLINE_POLICY",
      "PRINCIPAL_HAS_MANAGED_POLICY",
      "PRINCIPAL_HAS_MANAGED_POLICY",
      "PRINCIPAL_HAS_PERMISSIONS_BOUNDARY",
      "ROLE_ACTION_DECISION",
      "ROLE_TRUST_POLICY",
      "ROLE_TRUST_POLICY",
      "ROLE_TRUST_POLICY",
      "WORKLOAD_USES_ROLE",
    ])
    for (const row of rows) {
      expect(["configured", "observed"]).toContain(row.getAttribute("data-plane"))
      expect(["outgoing", "incoming"]).toContain(row.getAttribute("data-direction"))
    }
    const decided = rows.find(r => r.getAttribute("data-family") === "ROLE_ACTION_DECISION")!
    expect(decided.getAttribute("data-plane")).toBe("observed")
    expect(decided.getAttribute("data-animated")).toBe("true")
    expect(decided.textContent).toMatch(/generation 12/)
    const bound = rows.find(r => r.getAttribute("data-family") === "WORKLOAD_USES_ROLE")!
    expect(bound.getAttribute("data-direction")).toBe("incoming")
    expect(bound.textContent).toMatch(/webshop-web/)
    expect(path.textContent).not.toMatch(/sts:AssumeRole trust configured/)
    expect(path.textContent).toMatch(/statement trusts|conditions|unconditionally|may assume/)
    const pathFamilies = within(path).queryAllByTestId("estate-identity-access-path-edge").map(
      edge => edge.getAttribute("data-family"),
    )
    expect(pathFamilies).not.toContain("ROLE_ACTION_DECISION")
    expect(pathFamilies).not.toContain("PRINCIPAL_HAS_MANAGED_POLICY")
    // Receipts and scope are the producer's.
    expect(screen.getByTestId("estate-identity-detail-receipts").textContent).toMatch(/Canonical inventory: generation 31/)
    expect(screen.getByTestId("estate-identity-detail-receipts").textContent).toMatch(/Role action decision: generation 12/)
    // No Inventory dossier for an anchor: the panel says so and asked for nothing.
    expect(screen.getByTestId("estate-identity-anchor-no-dossier")).toBeInTheDocument()
    expect(screen.queryByTestId("resource-config-tab-stub")).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId("estate-operations-resource-id").textContent).toBe("arn:aws:iam::416651950952:role/web")
  })

  it("a name-only endpoint says so in the panel", () => {
    const group = lens.nodes.find(n => n.kind === "iam_group")!
    render(
      <DetailPanel
        node={identityNodeAsTopologyNode(group)}
        systemName="testbed-webshop"
        identity={identitySelectionDetail(lens, group.id)}
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId("estate-identity-detail-unresolved").textContent).toMatch(
      /ENDPOINT_NOT_A_PROJECTED_RESOURCE/,
    )
    const rows = screen.getAllByTestId("estate-identity-relationship")
    expect(rows.map(r => r.getAttribute("data-family"))).toContain("USER_MEMBER_OF_GROUP")
    expect(screen.getByTestId("estate-identity-access-path").textContent).toMatch(/alice/)
    expect(screen.getByTestId("estate-operations-resource-id").textContent).toMatch(/name-only endpoint/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("a topology workload keeps its ordinary panel AND gains the identity section on the lens", () => {
    const web = payload.nodes.find((n: any) => n.id === "i-web")
    render(
      <DetailPanel
        node={web}
        systemName="testbed-webshop"
        accountId="416651950952"
        region="eu-west-1"
        vpcId="vpc-1"
        inspectorNodes={payload.nodes}
        identity={identitySelectionDetail(lens, "i-web")}
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId("topology-service-detail-panel").textContent).toMatch(/Estate operations · EC2/)
    const section = screen.getByTestId("estate-identity-detail")
    const rows = within(section).getAllByTestId("estate-identity-relationship")
    expect(rows.map(r => r.getAttribute("data-family"))).toEqual(["WORKLOAD_USES_ROLE"])
    expect(rows[0].getAttribute("data-direction")).toBe("outgoing")
    expect(rows[0].getAttribute("data-plane")).toBe("configured")
    expect(screen.getByTestId("estate-identity-access-path").textContent).toMatch(/webshop-web/)
    expect(screen.getByTestId("estate-identity-access-path-missing-target")).toBeInTheDocument()
    // The ordinary dossier path still runs for a real resource id.
    expect(screen.getByTestId("resource-config-tab-stub")).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalled()
    const asked = fetchSpy.mock.calls.map(call => String(call[0]))
    expect(asked.some(url => url.includes("resource_id=i-web"))).toBe(true)
  })

  it("without the identity prop the panel is exactly the Network panel — no identity section", () => {
    const web = payload.nodes.find((n: any) => n.id === "i-web")
    render(<DetailPanel node={web} systemName="testbed-webshop" onClose={() => {}} />)
    expect(screen.queryByTestId("estate-identity-detail")).toBeNull()
    expect(screen.getByTestId("topology-service-detail-panel").textContent).not.toMatch(/Identity & access evidence/)
  })

  it("opens a focused access path and pivots without inventing a hop", () => {
    const role = lens.nodes.find(n => n.kind === "iam_role" && n.label === "web")!
    const detail = identitySelectionDetail(lens, role.id)!
    const onSelectIdentityNode = vi.fn()
    render(
      <DetailPanel
        node={identityNodeAsTopologyNode(role)}
        systemName="testbed-webshop"
        identity={detail}
        onSelectIdentityNode={onSelectIdentityNode}
        onClose={() => {}}
      />,
    )
    const path = screen.getByTestId("estate-identity-access-path")
    expect(path.textContent).toMatch(/Uses role/)
    expect(path.textContent).toMatch(/statement trusts|conditions|unconditionally|may assume/)
    expect(path.textContent).not.toMatch(/GetObject|ClusterRole|RoleBinding|sts:AssumeRole trust configured/)
    expect(screen.queryByTestId("estate-identity-relationship-explanation")).toBeNull()

    const peer = screen.getAllByTestId("estate-identity-access-path-node").find(
      card => card.getAttribute("data-node-id") !== role.id,
    )!
    fireEvent.click(peer)
    expect(onSelectIdentityNode).toHaveBeenCalledTimes(1)
    expect(onSelectIdentityNode.mock.calls[0][0]).toBe(peer.getAttribute("data-node-id"))
    expect(onSelectIdentityNode.mock.calls[0][0]).not.toBe(role.id)
  })

  it("explains a clicked trust hop from served actions and conditions only", () => {
    const role = lens.nodes.find(n => n.kind === "iam_role" && n.label === "web")!
    const detail = identitySelectionDetail(lens, role.id)!
    render(
      <DetailPanel
        node={identityNodeAsTopologyNode(role)}
        systemName="testbed-webshop"
        identity={detail}
        onClose={() => {}}
      />,
    )
    const trust = screen
      .getAllByTestId("estate-identity-relationship")
      .find(row => row.getAttribute("data-family") === "ROLE_TRUST_POLICY")!
    fireEvent.click(within(trust).getByTestId("estate-identity-access-path-hop"))
    const explanation = screen.getByTestId("estate-identity-relationship-explanation")
    expect(explanation.getAttribute("data-family")).toBe("ROLE_TRUST_POLICY")
    expect(explanation.getAttribute("data-plane")).toBe("configured")
    expect(screen.getByTestId("estate-identity-relationship-honesty").textContent).not.toMatch(
      /permission to assume/,
    )
    expect(explanation.textContent).not.toMatch(/\b(can|allowed|authorized|did assume)\b/i)
    expect(screen.getByTestId("estate-identity-relationship-scope-absent")).toBeInTheDocument()
    const firstScope = screen.getByTestId("estate-identity-relationship-scope-absent").textContent
    const otherTrust = screen
      .getAllByTestId("estate-identity-relationship")
      .filter(row => row.getAttribute("data-family") === "ROLE_TRUST_POLICY")
      .at(-1)!
    fireEvent.click(within(otherTrust).getByTestId("estate-identity-access-path-hop"))
    expect(screen.getByTestId("estate-identity-relationship-scope-absent").textContent).toBe(firstScope)
  })

  it("a protected resource still exposes its served neighbourhood", () => {
    const bucket = lens.nodes.find(n => n.id === "bucket-assets")!
    render(
      <DetailPanel
        node={identityNodeAsTopologyNode(bucket)}
        systemName="testbed-webshop"
        identity={identitySelectionDetail(lens, bucket.id)}
        onClose={() => {}}
      />,
    )
    const rows = screen.getAllByTestId("estate-identity-relationship")
    expect(rows.map(r => r.getAttribute("data-family"))).toEqual(["RESOURCE_POLICY_GRANT"])
    expect(screen.getByTestId("estate-identity-access-path").textContent).toMatch(/s3:bucket-authorization|resource policy/i)
    expect(screen.queryByTestId("estate-identity-access-path-empty")).toBeNull()
  })

  it("retains the selected fifth trust caller and expands omitted targets", () => {
    const role = lens.nodes.find(n => n.kind === "iam_role" && n.label === "web")!
    const sampleTrust = lens.edges.find(e => e.family === "ROLE_TRUST_POLICY" && e.targetId === role.id)!
    const sampleCaller = lens.nodes.find(n => n.id === sampleTrust.sourceId)!
    const extraCallers = [0, 1].map(index => {
      const id = `${sampleCaller.id}:extra-${index}`
      return {
        node: { ...sampleCaller, id, label: `extra-caller-${index}` },
        edge: { ...sampleTrust, id: `${sampleTrust.id}:extra-${index}`, sourceId: id },
      }
    })
    const grant = lens.edges.find(e => e.family === "RESOURCE_POLICY_GRANT")!
    const extraTargets = [0, 1, 2, 3, 4].map(index => {
      const id = `protected-extra-${index}`
      return {
        node: {
          id,
          kind: "protected_resource" as const,
          label: `extra-target-${index}`,
          sublabel: null,
          onCanvas: false,
          resolved: true,
          unresolvedReason: null,
          arn: `arn:aws:s3:::extra-target-${index}`,
          resourceUid: null,
          lifecycleState: null,
          facts: [],
          gaps: [],
        },
        edge: {
          ...grant,
          id: `${grant.id}:role-target-${index}`,
          sourceId: role.id,
          targetId: id,
        },
      }
    })
    const extended = {
      ...lens,
      nodes: [...lens.nodes, ...extraCallers.map(item => item.node), ...extraTargets.map(item => item.node)],
      edges: [...lens.edges, ...extraCallers.map(item => item.edge), ...extraTargets.map(item => item.edge)],
    }
    const fifth = extraCallers[1].node
    render(
      <DetailPanel
        node={identityNodeAsTopologyNode(fifth)}
        systemName="testbed-webshop"
        identity={identitySelectionDetail(extended, fifth.id)}
        onClose={() => {}}
      />,
    )
    const path = screen.getByTestId("estate-identity-access-path")
    expect(path.textContent).toMatch(/extra-caller-1/)
    const expandTrust = screen.getByTestId("estate-identity-access-path-expand-trust")
    expect(expandTrust.textContent).toMatch(/more trust caller/)
    fireEvent.click(expandTrust)
    expect(screen.queryByTestId("estate-identity-access-path-expand-trust")).toBeNull()

    cleanup()
    render(
      <DetailPanel
        node={identityNodeAsTopologyNode(role)}
        systemName="testbed-webshop"
        identity={identitySelectionDetail(extended, role.id)}
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId("estate-identity-access-path").textContent).toMatch(/extra-target-0/)
    expect(screen.getByTestId("estate-identity-access-path").textContent).not.toMatch(/extra-target-4/)
    fireEvent.click(screen.getByTestId("estate-identity-access-path-expand-target"))
    expect(screen.getByTestId("estate-identity-access-path").textContent).toMatch(/extra-target-4/)
  })

  it("close still closes", () => {
    const onClose = vi.fn()
    const role = lens.nodes.find(n => n.kind === "iam_role")!
    render(
      <DetailPanel
        node={identityNodeAsTopologyNode(role)}
        systemName="testbed-webshop"
        identity={identitySelectionDetail(lens, role.id)}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByLabelText("Close service details"))
    expect(onClose).toHaveBeenCalled()
  })
})


describe("identity lens keeps the traffic inspector separate", () => {
  it("shows trust evidence without a second traffic route or rebuilding claim", () => {
    const role = lens.nodes.find(n => n.kind === "iam_role" && n.label === "web")!
    render(<DetailPanel
      node={identityNodeAsTopologyNode(role)} systemName="testbed-webshop"
      inspectorNodes={lens.nodes.map(identityNodeAsTopologyNode)}
      inspectorEdges={identityLensTrafficEdges(lens, role.id)}
      identity={identitySelectionDetail(lens, role.id)} identityLensActive
      onClose={() => {}}
    />)
    expect(screen.getByTestId("estate-identity-access-path")).toBeInTheDocument()
    expect(screen.getByTestId("estate-identity-relationships")).toBeInTheDocument()
    expect(screen.queryByTestId("topology-service-path-map")).toBeNull()
    expect(screen.queryByText("Traffic evidence rebuilding")).toBeNull()
    expect(screen.queryByText("Configured route")).toBeNull()
  })

  it("uses the active lens even for a selected resource with no identity detail, then restores the network inspector", () => {
    const props = { node: payload.nodes.find((n: any) => n.id === "alb"), systemName: "testbed-webshop",
      inspectorNodes: payload.nodes, inspectorEdges: payload.traffic_edges, onClose: () => {} }
    const { rerender } = render(<DetailPanel {...props} identityLensActive identity={null} />)
    expect(screen.getByTestId("resource-config-tab-stub")).toBeInTheDocument()
    expect(screen.queryByTestId("estate-identity-detail")).toBeNull()
    expect(screen.queryByTestId("topology-service-path-map")).toBeNull()
    rerender(<DetailPanel {...props} />)
    expect(screen.getByTestId("topology-service-path-map")).toBeInTheDocument()
    expect(screen.getByTestId("resource-config-tab-stub")).toBeInTheDocument()
  })
})
