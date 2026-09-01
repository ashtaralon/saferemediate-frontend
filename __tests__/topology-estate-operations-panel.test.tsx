/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DetailPanel } from "@/components/topology-v0-2/detail-panel"
import type { TopologyNode } from "@/components/topology-v0-2/types"

vi.mock("@/components/inventory/resource-config-tab", () => ({
  ResourceConfigTab: ({ resourceId, onPrimarySettled }: { resourceId: string; onPrimarySettled?: () => void }) => {
    React.useEffect(() => onPrimarySettled?.(), [onPrimarySettled])
    return <div data-testid="inventory-config">Inventory configuration for {resourceId}</div>
  },
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
      mapNodes={[
        node,
        { id: "i-map-consumer", name: "map-consumer", type: "EC2", subnet_id: "subnet-app", score: null, stale: null, is_jewel: false },
      ]}
      mapEdges={[{
        source_id: "i-map-consumer",
        target_id: node.id,
        protocol: "ACTUAL_S3_ACCESS",
        port: 443,
        last_seen: "2026-08-06T09:00:00Z",
        evidence_type: "observed",
        evidence_source: "cloudtrail",
        activity_count: 9,
      }]}
      mapEvidenceStale
      onClose={() => {}}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("Estate operations panel", () => {
  it("can open after initially rendering with no selected resource", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(standardBackendResponse)
    const view = render(
      <DetailPanel node={null} systemName="alon-prod" onClose={() => {}} />,
    )

    view.rerender(
      <DetailPanel node={node} systemName="alon-prod" mapNodes={[node]} onClose={() => {}} />,
    )

    expect(await screen.findByTestId("inventory-config")).toHaveTextContent(node.id)
  })

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

  it("waits for primary configuration reads before loading secondary enrichment", async () => {
    const calls: string[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      calls.push(String(input))
      return standardBackendResponse(input)
    })
    renderPanel()

    await screen.findByTestId("estate-resource-overview")
    await screen.findByText(narration.operator_summary)
    expect(calls[0]).toContain("/resource?")
    expect(calls[1]).toContain("/resource/narration?")
  })

  it("falls back to real Estate-map relationships without exposing Neptune internals", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      detail: "topology_risk_failed: Neptune read failed: HTTPSConnectionPool(host=internal-neptune, port=8182): Read timed out",
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }))
    renderPanel()
    fireEvent.click(screen.getByTestId("estate-operations-tab-dependencies"))

    expect(await screen.findByTestId("estate-dependencies-fallback")).toHaveTextContent("stale snapshot")
    expect(screen.getByText("map-consumer")).toBeInTheDocument()
    expect(screen.getByText("9 events")).toBeInTheDocument()
    expect(screen.queryByText(/HTTPSConnectionPool|internal-neptune|port=8182/)).not.toBeInTheDocument()
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

  it("labels a stale materialized dependency generation without reporting a live failure", async () => {
    const materialized = {
      ...dossier,
      evidence: {
        ...dossier.evidence,
        coverage_state: "stale · partial",
        materialized: true,
        snapshot_age_seconds: 7200,
      },
    }
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      response(String(input).includes("/resource/narration?") ? narration : materialized),
    )
    renderPanel()
    fireEvent.click(screen.getByTestId("estate-operations-tab-dependencies"))

    expect(await screen.findByTestId("estate-dependencies-materialized-stale")).toHaveTextContent("2h old")
    expect(screen.getByTestId("estate-dependencies-materialized-stale")).toHaveTextContent("behavioral absence is not authoritative")
    expect(screen.queryByTestId("estate-dependencies-fallback")).not.toBeInTheDocument()
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

    expect(await screen.findByText("No S3 traffic from this VPC to migrate")).toBeInTheDocument()
    expect(screen.getByText("1 observed bucket consumer runs outside vpc-selected. Its S3 calls do not traverse this VPC's route tables or internet gateway, so an S3 Gateway endpoint here would not affect it.")).toBeInTheDocument()
    expect(screen.getByText("Analysis complete · No migration applicable in the selected VPC")).toBeInTheDocument()
    expect(screen.getByText("No VPCE change is needed in this VPC")).toBeInTheDocument()
    expect(screen.getByText("Not applicable")).toBeInTheDocument()
    expect(screen.getByText("Unchanged · no AWS operation planned")).toBeInTheDocument()
    expect(screen.getByText("Not needed · no AWS change planned")).toBeInTheDocument()
    expect(screen.getByText("Migratable consumers")).toBeInTheDocument()
    expect(screen.getByText("No migration target in this VPC")).toBeInTheDocument()
    expect(screen.getByText(/No AWS change is needed for this VPC/)).toBeInTheDocument()
    expect(screen.queryByLabelText("Private path lifecycle")).not.toBeInTheDocument()
    expect(screen.queryByText("Change is blocked by missing proof")).not.toBeInTheDocument()
    expect(screen.queryByTestId("estate-vpce-simulate")).not.toBeInTheDocument()
  })

  it("presents an already-private S3 path as an explicit no-op", async () => {
    const noChangePlan = {
      readiness: "BLOCKED",
      bucket_name: node.name,
      vpc_id: "vpc-prod",
      endpoint_mode: "NO_CHANGE",
      existing_endpoint_id: "vpce-existing",
      blockers: [{
        code: "NO_PUBLIC_S3_PATH",
        message: "Observed consumers already use a private endpoint; no migration is needed.",
      }],
      excluded_consumers: [
        {
          resource_id: "i-private",
          resource_name: "private-app",
          resource_type: "EC2",
          reason_code: "ALREADY_PRIVATE",
          reason: "Consumer already has private transport proof through vpce-existing.",
        },
        {
          resource_id: "arn:aws:lambda:eu-west-1:745783559495:function:traffic",
          resource_name: "traffic",
          resource_type: "Lambda",
          reason_code: "OUTSIDE_VPC",
          reason: "Gateway endpoints cannot route a consumer that is not attached to a VPC.",
        },
      ],
      impact: {
        observed_consumers: 0,
        total_observed_consumers: 2,
        migrating_consumers: 0,
        excluded_consumers: 2,
        subnets: 0,
        route_tables: 0,
        route_table_workloads: 0,
        permission_changes: 0,
        resource_replacements: 0,
      },
    }
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("s3-vpce/plan")) return response(noChangePlan)
      return standardBackendResponse(input)
    })
    renderPanel()
    fireEvent.click(screen.getByTestId("estate-operations-tab-change"))
    fireEvent.click(screen.getByTestId("estate-vpce-analyze"))

    expect(await screen.findByText("Observed S3 traffic is already private")).toBeInTheDocument()
    expect(screen.getByText("Analysis complete · Traffic is already on a private S3 path")).toBeInTheDocument()
    expect(screen.getByText("No change — traffic already uses vpce-existing")).toBeInTheDocument()
    expect(screen.getByText("Not applicable")).toBeInTheDocument()
    expect(screen.getByText("Unchanged · no AWS operation planned")).toBeInTheDocument()
    expect(screen.getByText("Not needed · no AWS change planned")).toBeInTheDocument()
    expect(screen.getByText("No public S3 path to replace")).toBeInTheDocument()
    expect(screen.getByText("No migration required (2)")).toBeInTheDocument()
    expect(screen.getByText(/No action required\. The eligible VPC consumers already use the S3 Gateway endpoint/)).toBeInTheDocument()
    expect(screen.queryByText("Create a Cyntro-managed S3 Gateway endpoint")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Private path lifecycle")).not.toBeInTheDocument()
    expect(screen.queryByText("Blocked")).not.toBeInTheDocument()
    expect(screen.queryByText("Remove only associations added by this operation")).not.toBeInTheDocument()
    expect(screen.queryByText("Resolve this safety check, then analyze the migration again.")).not.toBeInTheDocument()
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

    expect(await screen.findByText("No S3 traffic from this VPC to migrate")).toBeInTheDocument()
    fireEvent.click(analyzeButton)

    expect(await screen.findByText("Analysis could not be recorded. No AWS change was authorized; retry Analyze.")).toBeInTheDocument()
    expect(screen.queryByText("No S3 traffic from this VPC to migrate")).not.toBeInTheDocument()
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
    const operationStatus = {
      operation_id: "s3-path-123",
      state: "CANARY_MONITORING",
      version: 6,
      approval: {
        requested_by: "requester@example.com",
        approved_by: "approver@example.com",
      },
      execution: {
        status: "COMPLETED",
        snapshot_id: "snapshot-123",
        endpoint_id: "vpce-123",
        rollback_available: true,
        operation_state: "CANARY_MONITORING",
      },
      verification: null,
    }
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input)
      if (url.includes("s3-vpce/plan")) return response(readyPlan)
      if (url.includes("s3-vpce/simulate")) return response({ status: "COMPLETED", safe_to_apply: true, plan_hash: "1234567890abcdef", operation_state: "SIMULATED", operation_version: 2 })
      if (url.includes("s3-vpce/request-approval")) return response({ operation_id: "s3-path-123", state: "APPROVAL_PENDING", version: 3, approval: { requested_by: "requester@example.com" } })
      if (url.includes("s3-vpce/approve")) return response({ operation_id: "s3-path-123", state: "APPROVED", version: 4, execution_plan_token: "approved-plan", approval: { requested_by: "requester@example.com", approved_by: "approver@example.com" } })
      if (url.includes("s3-vpce/execute")) return response(execution)
      if (url.includes("s3-vpce/reconcile")) return response({ operation_id: "s3-path-123", action: "AWAIT_EVIDENCE", state: "PENDING_EVIDENCE" })
      if (url.includes("s3-vpce/operations/s3-path-123?include_history=false")) return response(operationStatus)
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
    expect(await screen.findByText("Automatic rollout is active")).toBeInTheDocument()
    expect(screen.queryByTestId("estate-vpce-verify")).not.toBeInTheDocument()
    expect(screen.queryByTestId("estate-vpce-expand")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("estate-vpce-reconcile"))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/s3-vpce/reconcile"),
      expect.objectContaining({ method: "POST" }),
    ))
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
