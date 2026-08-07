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

const narration = {
  operator_summary: "This bucket has one observed consumer in the selected scope.",
  why_it_matters: "Review that consumer before changing the bucket path.",
  recommended_next_check: "Review the listed consumers before changing this resource.",
  evidence_ids: ["RESOURCE_SCOPE", "DEPENDENCY_SUMMARY"],
  source: "llm",
  grounded: true,
  grounding_reason: "ok",
  evidence_hash: "evidence-hash-1",
  model: "bedrock-test",
}

function standardBackendResponse(input: RequestInfo | URL) {
  return response(String(input).includes("/resource/narration?") ? narration : dossier)
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
    vi.spyOn(globalThis, "fetch").mockImplementation(standardBackendResponse)
    renderPanel()

    expect(screen.getByText("Live configuration from Inventory")).toBeInTheDocument()
    expect(screen.getByTestId("inventory-config")).toHaveTextContent(node.id)
    const overview = await screen.findByTestId("estate-resource-overview")
    expect(overview).toHaveTextContent("745783559495")
    expect(overview).toHaveTextContent("eu-west-1")
    expect(await screen.findByText(narration.operator_summary)).toBeInTheDocument()
    expect(screen.getByTestId("estate-narration-source")).toHaveTextContent("AI explanation · verified evidence")
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/proxy/operational-map/alon-prod/resource?`),
      expect.objectContaining({ cache: "no-store" }),
    ))
  })

  it("explains who depends on the resource and what it depends on using evidence labels", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(standardBackendResponse)
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
      endpoint_mode: "ADOPT_EXISTING",
      existing_endpoint_id: "vpce-customer-owned",
      blockers: [
        { code: "UNKNOWN_NETWORK_PATH", message: "Route proof is incomplete." },
        { code: "EXISTING_ENDPOINT_NOT_OPTED_IN", message: "The customer-owned endpoint requires opt-in." },
      ],
      impact: { observed_consumers: 1, subnets: 0, route_tables: 0, route_table_workloads: 0, permission_changes: 0, resource_replacements: 0 },
    }
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input)
      if (url.includes("s3-vpce/plan")) return response(blockedPlan)
      return standardBackendResponse(input)
    })
    renderPanel()
    fireEvent.click(screen.getByTestId("estate-operations-tab-change"))
    fireEvent.click(screen.getByTestId("estate-vpce-analyze"))

    expect(await screen.findByText("Consumer route evidence is incomplete")).toBeInTheDocument()
    expect(screen.getByText("Effective S3 route is not proven")).toBeInTheDocument()
    expect(screen.getByText("UNKNOWN_NETWORK_PATH")).toBeInTheDocument()
    expect(screen.getByText("Existing endpoint vpce-customer-owned selected; explicit Cyntro opt-in required")).toBeInTheDocument()
    expect(screen.queryByText("Use opted-in endpoint vpce-customer-owned")).not.toBeInTheDocument()
    expect(screen.queryByTestId("estate-vpce-execute")).not.toBeInTheDocument()
  })

  it("distinguishes an empty VPC scope from missing telemetry", async () => {
    const blockedPlan = {
      readiness: "BLOCKED",
      bucket_name: node.name,
      vpc_id: "vpc-selected",
      endpoint_mode: "CREATE_MANAGED",
      blockers: [{ code: "NO_OBSERVED_CONSUMERS", message: "No observed bucket consumer is mapped to the selected VPC." }],
      excluded_consumers: [{
        resource_id: "arn:aws:lambda:eu-west-1:745783559495:function:traffic",
        resource_name: "traffic",
        resource_type: "Lambda",
        reason_code: "OUTSIDE_VPC",
        reason: "Gateway endpoints cannot route a consumer that is not attached to a VPC.",
      }],
      impact: {
        observed_consumers: 0,
        total_observed_consumers: 1,
        migrating_consumers: 0,
        subnets: 0,
        route_tables: 0,
        route_table_workloads: 0,
        permission_changes: 0,
        resource_replacements: 0,
      },
    }
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("s3-vpce/plan")) return response(blockedPlan)
      return standardBackendResponse(input)
    })
    renderPanel()
    fireEvent.click(screen.getByTestId("estate-operations-tab-change"))
    fireEvent.click(screen.getByTestId("estate-vpce-analyze"))

    expect(await screen.findByText("No VPC-attached bucket consumer found in this scope")).toBeInTheDocument()
    expect(screen.getByText("1 bucket consumer was observed, but none is attached to vpc-selected and eligible for an S3 Gateway endpoint migration.")).toBeInTheDocument()
    expect(screen.getByText("No endpoint change until an eligible VPC consumer is observed")).toBeInTheDocument()
    expect(screen.getByText("Migratable consumers")).toBeInTheDocument()
    expect(screen.getByText("No eligible VPC consumer in this scope")).toBeInTheDocument()
    expect(screen.getByText(/Select All VPCs or a VPC containing an observed consumer/)).toBeInTheDocument()
    expect(screen.queryByText("Change is blocked by missing proof")).not.toBeInTheDocument()
    expect(screen.queryByTestId("estate-vpce-simulate")).not.toBeInTheDocument()
  })

  it("removes stale lifecycle results when a fresh analysis fails", async () => {
    const blockedPlan = {
      readiness: "BLOCKED",
      bucket_name: node.name,
      vpc_id: "vpc-prod",
      endpoint_mode: "CREATE_MANAGED",
      blockers: [{ code: "NO_OBSERVED_CONSUMERS", message: "No observed consumer is mapped to this VPC." }],
      excluded_consumers: [],
      impact: {
        observed_consumers: 0,
        total_observed_consumers: 0,
        migrating_consumers: 0,
        subnets: 0,
        route_tables: 0,
        route_table_workloads: 0,
        permission_changes: 0,
        resource_replacements: 0,
      },
    }
    let planCalls = 0
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("s3-vpce/plan")) {
        planCalls += 1
        return planCalls === 1
          ? response(blockedPlan)
          : response({ detail: "Analysis could not be recorded. No AWS change was authorized; retry Analyze." }, 503)
      }
      return standardBackendResponse(input)
    })
    renderPanel()
    fireEvent.click(screen.getByTestId("estate-operations-tab-change"))
    const analyzeButton = screen.getByTestId("estate-vpce-analyze")
    fireEvent.click(analyzeButton)

    expect(await screen.findByText("No VPC-attached bucket consumer found in this scope")).toBeInTheDocument()
    fireEvent.click(analyzeButton)

    expect(await screen.findByText("Analysis could not be recorded. No AWS change was authorized; retry Analyze.")).toBeInTheDocument()
    expect(screen.queryByText("No VPC-attached bucket consumer found in this scope")).not.toBeInTheDocument()
  })

  it("requires exact confirmation before snapshot and apply", async () => {
    const readyPlan = {
      readiness: "READY",
      operation_id: "s3-path-123",
      operation_state: "READY_FOR_SIMULATION",
      operation_version: 1,
      plan_token: "signed-plan",
      bucket_name: node.name,
      vpc_id: "vpc-prod",
      canary_route_table_id: "rtb-canary",
      endpoint_mode: "CREATE_MANAGED",
      route_table_ids: ["rtb-canary"],
      blockers: [],
      impact: { observed_consumers: 1, migrating_consumers: 1, subnets: 1, route_tables: 1, route_table_workloads: 2, s3_destinations: 1, permission_changes: 0, resource_replacements: 0 },
    }
    const execution = {
      status: "COMPLETED",
      snapshot_id: "snapshot-123",
      endpoint_id: "vpce-123",
      lifecycle_token: "lifecycle-token",
      rollback_available: true,
      operation_state: "CANARY_MONITORING",
    }
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input)
      if (url.includes("s3-vpce/plan")) return response(readyPlan)
      if (url.includes("s3-vpce/simulate")) return response({ status: "COMPLETED", safe_to_apply: true, plan_hash: "1234567890abcdef", operation_state: "SIMULATED", operation_version: 2 })
      if (url.includes("s3-vpce/request-approval")) return response({ operation_id: "s3-path-123", state: "APPROVAL_PENDING", version: 3, approval: { requested_by: "requester@example.com" } })
      if (url.includes("s3-vpce/approve")) return response({ operation_id: "s3-path-123", state: "APPROVED", version: 4, execution_plan_token: "approved-plan", approval: { requested_by: "requester@example.com", approved_by: "approver@example.com" } })
      if (url.includes("s3-vpce/execute")) return response(execution)
      return standardBackendResponse(input)
    })

    renderPanel()
    fireEvent.click(screen.getByTestId("estate-operations-tab-change"))
    fireEvent.click(screen.getByTestId("estate-vpce-analyze"))
    fireEvent.click(await screen.findByTestId("estate-vpce-simulate"))
    fireEvent.change(await screen.findByLabelText("Requester identity"), { target: { value: "requester@example.com" } })
    fireEvent.click(screen.getByTestId("estate-vpce-request-approval"))
    fireEvent.change(await screen.findByLabelText("Approver identity"), { target: { value: "approver@example.com" } })
    fireEvent.click(screen.getByTestId("estate-vpce-approve"))
    const executeButton = await screen.findByTestId("estate-vpce-execute")
    expect(executeButton).toBeDisabled()

    const confirmation = `APPLY ${node.name} vpc-prod`
    fireEvent.change(screen.getByLabelText("Apply confirmation"), { target: { value: confirmation } })
    expect(executeButton).toBeEnabled()
    fireEvent.click(executeButton)

    expect(await screen.findByText("Canary applied · rollback retained")).toBeInTheDocument()
    const executeCall = fetchMock.mock.calls.find(([input]) => String(input).includes("s3-vpce/execute"))
    expect(JSON.parse(String(executeCall?.[1]?.body))).toMatchObject({
      operation_id: "s3-path-123",
      plan_token: "approved-plan",
      confirmation,
    })
  })

  it("labels a grounded deterministic fallback honestly", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("/resource/narration?")) {
        return response({ ...narration, source: "deterministic_fallback", grounding_reason: "llm_timeout" })
      }
      return response(dossier)
    })
    renderPanel()

    expect(await screen.findByText(narration.operator_summary)).toBeInTheDocument()
    expect(screen.getByTestId("estate-narration-source")).toHaveTextContent("Deterministic evidence summary")
  })
})
