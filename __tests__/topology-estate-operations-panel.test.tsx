/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DetailPanel } from "@/components/topology-v0-2/detail-panel"
import type { TopologyNode } from "@/components/topology-v0-2/types"

vi.mock("@/components/inventory/resource-config-tab", () => ({
  ResourceConfigTab: ({ resourceId }: { resourceId: string }) => (
    <div data-testid="inventory-config">Inventory configuration for {resourceId}</div>
  ),
}))

vi.mock("@/lib/service-type", () => ({
  ServiceTypeBadge: ({ type }: { type: string }) => <div aria-label={`Service type ${type}`} />,
}))

const node: TopologyNode = {
  id: "alon-demo-data-bucket-745783559495",
  name: "alon-demo-data-bucket-745783559495",
  type: "S3Bucket",
  subnet_id: null,
  score: null,
  stale: null,
  is_jewel: true,
}

const dossier = {
  resource: {
    id: node.id,
    name: node.name,
    type: node.type,
    system_name: "alon-prod",
    account_id: "745783559495",
    region: "eu-west-1",
    vpc_id: null,
  },
  dependencies: {
    upstream: [{
      direction: "upstream",
      resource_id: "i-app",
      resource_name: "payments-api",
      resource_type: "EC2",
      vpc_id: "vpc-prod",
      protocol: "HTTPS",
      port: "443",
      last_seen: "2026-08-06T09:00:00Z",
      evidence_type: "observed",
      evidence_source: "cloudtrail",
      coverage_state: "complete",
      activity_count: 42,
      egress_path: "public",
    }],
    downstream: [{
      direction: "downstream",
      resource_id: "kms-data",
      resource_name: "data-key",
      resource_type: "KMSKey",
      last_seen: "2026-08-06T09:00:00Z",
      evidence_type: "configured",
      evidence_source: "aws_config",
      coverage_state: "complete",
    }],
    summary: { consumer_count: 1, observed: 1, configured: 1, inferred: 0 },
  },
  evidence: {
    window_days: 90,
    latest_observation: "2026-08-06T09:00:00Z",
    sources: ["aws_config", "cloudtrail"],
    coverage_state: "complete",
  },
  change_capabilities: [{ kind: "S3_VPCE_MIGRATION", available: true, label: "Private S3 path" }],
}

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }))
}

function renderPanel() {
  return render(
    <DetailPanel
      node={node}
      systemName="alon-prod"
      accountId="745783559495"
      region="eu-west-1"
      vpcId="vpc-prod"
      onClose={() => {}}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("Estate operations panel", () => {
  it("reuses the Inventory resource inspector as the default click experience", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response(dossier))
    renderPanel()

    expect(screen.getByText("Live configuration from Inventory")).toBeInTheDocument()
    expect(screen.getByTestId("inventory-config")).toHaveTextContent(node.id)
    const overview = await screen.findByTestId("estate-resource-overview")
    expect(overview).toHaveTextContent("745783559495")
    expect(overview).toHaveTextContent("eu-west-1")
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/proxy/operational-map/alon-prod/resource?`),
      expect.objectContaining({ cache: "no-store" }),
    ))
  })

  it("explains who depends on the resource and what it depends on using evidence labels", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response(dossier))
    renderPanel()
    fireEvent.click(screen.getByTestId("estate-operations-tab-dependencies"))

    expect(await screen.findByText("payments-api")).toBeInTheDocument()
    expect(screen.getByText("data-key")).toBeInTheDocument()
    expect(screen.getByText("42 events")).toBeInTheDocument()
    expect(screen.getByText("public")).toBeInTheDocument()
    expect(screen.getByText("observed")).toBeInTheDocument()
    expect(screen.getByText("configured")).toBeInTheDocument()
  })

  it("shows blockers and never exposes execution for an unproven route scope", async () => {
    const blockedPlan = {
      readiness: "BLOCKED",
      blockers: [{ code: "UNKNOWN_NETWORK_PATH", message: "Route proof is incomplete." }],
      impact: { observed_consumers: 1, subnets: 0, route_tables: 0, route_table_workloads: 0, permission_changes: 0, resource_replacements: 0 },
    }
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      response(String(input).includes("s3-vpce/plan") ? blockedPlan : dossier),
    )
    renderPanel()
    fireEvent.click(screen.getByTestId("estate-operations-tab-change"))
    fireEvent.click(screen.getByTestId("estate-vpce-analyze"))

    expect(await screen.findByText("Change is blocked by missing proof")).toBeInTheDocument()
    expect(screen.getByText("UNKNOWN_NETWORK_PATH")).toBeInTheDocument()
    expect(screen.queryByTestId("estate-vpce-execute")).not.toBeInTheDocument()
  })

  it("requires exact confirmation before snapshot and apply", async () => {
    const readyPlan = {
      readiness: "READY",
      plan_token: "signed-plan",
      bucket_name: node.name,
      vpc_id: "vpc-prod",
      blockers: [],
      impact: { observed_consumers: 1, subnets: 1, route_tables: 1, route_table_workloads: 2, permission_changes: 0, resource_replacements: 0 },
    }
    const execution = {
      status: "COMPLETED",
      snapshot_id: "snapshot-123",
      endpoint_id: "vpce-123",
      lifecycle_token: "lifecycle-token",
      rollback_available: true,
    }
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input)
      if (url.includes("s3-vpce/plan")) return response(readyPlan)
      if (url.includes("s3-vpce/simulate")) return response({ status: "COMPLETED", safe_to_apply: true })
      if (url.includes("s3-vpce/execute")) return response(execution)
      return response(dossier)
    })

    renderPanel()
    fireEvent.click(screen.getByTestId("estate-operations-tab-change"))
    fireEvent.click(screen.getByTestId("estate-vpce-analyze"))
    const executeButton = await screen.findByTestId("estate-vpce-execute")
    expect(executeButton).toBeDisabled()

    const confirmation = `APPLY ${node.name} vpc-prod`
    fireEvent.change(screen.getByRole("textbox"), { target: { value: confirmation } })
    expect(executeButton).toBeEnabled()
    fireEvent.click(executeButton)

    expect(await screen.findByText("Applied · rollback retained")).toBeInTheDocument()
    const executeCall = fetchMock.mock.calls.find(([input]) => String(input).includes("s3-vpce/execute"))
    expect(JSON.parse(String(executeCall?.[1]?.body))).toMatchObject({
      plan_token: "signed-plan",
      confirmation,
    })
  })
})
