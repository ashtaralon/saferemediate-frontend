/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ResourceDossier } from "@/components/inventory/resource-dossier"

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({
    customerId: "customer-a",
    accountId: "123456789012",
    region: "all",
  }),
}))

vi.mock("@/lib/service-type", () => ({
  ServiceTypeBadge: ({ type }: { type: string }) => <div aria-label={`Service type ${type}`} />,
}))

const dossier = {
  identity: {
    tenant: "customer-a",
    account: "123456789012",
    aws_partition: "aws",
    canonical_resource_uid: "aws:s3:::orders-data",
    region: null,
  },
  purpose: {
    serve_state: "PARTIAL",
    payload: {
      summary: null,
      not_established_reason: "No access evidence was identified and coverage is insufficient to prove absence.",
      assertion: {
        state: "UNKNOWN",
        value: null,
        basis: "No access evidence was identified and coverage is insufficient to prove absence.",
        sources: ["Derived"],
        evidence_refs: [],
        authority_basis: "coverage manifests",
        as_of: "2026-08-13T10:00:00Z",
        window: { start: "2026-05-15T10:00:00Z", end: "2026-08-13T10:00:00Z", days: 90 },
        coverage: {
          state: "NONE",
          required_sources: ["s3_access_logs", "cloudtrail_data_events"],
          present_sources: [],
          missing_sources: ["s3_access_logs", "cloudtrail_data_events"],
          sufficient_for: [],
          insufficient_for: ["prove absence of consumers within verified 90-day window"],
        },
        source_generation_refs: [],
        policy_version: null,
      },
    },
    coverage: {
      state: "NONE",
      required_sources: ["s3_access_logs", "cloudtrail_data_events"],
      present_sources: [],
      missing_sources: ["s3_access_logs", "cloudtrail_data_events"],
      sufficient_for: [],
      insufficient_for: ["prove absence of consumers within verified 90-day window"],
    },
    notes: null,
  },
  lifecycle: { serve_state: "NOT_APPLICABLE", payload: null, coverage: null, notes: null },
  fitness: { serve_state: "NOT_APPLICABLE", payload: null, coverage: null, notes: null },
  dependencies: {
    serve_state: "ACTIVE",
    payload: {
      ledger: [{
        direction: "UPSTREAM",
        basis_class: "CONFIGURED",
        freshness: "UNKNOWN",
        principal_arn: "arn:aws:iam::123456789012:role/orders-reader",
        resource_canonical_resource_uid: "aws:s3:::orders-data",
        relationship: "ResourcePolicyGrant",
        actions: ["s3:GetObject"],
        evidence_refs: [],
        source_generation_refs: [],
      }],
      counts_by_basis: { OBSERVED: 0, CONFIGURED: 1, STRUCTURAL: 0 },
    },
    coverage: null,
    notes: "Basis classes are intentionally not summed into a consumer count.",
  },
  changes: { serve_state: "NOT_APPLICABLE", payload: null, coverage: null, notes: null },
  actions: { serve_state: "NOT_APPLICABLE", payload: null, coverage: null, notes: null },
  evidence: {
    serve_state: "PARTIAL",
    payload: {
      assertions: [],
      coverage: { state: "NONE" },
      diagnostics: [],
      missing_immutable_evidence_bindings: 1,
    },
    coverage: null,
    notes: null,
  },
  serve_state: "PARTIAL",
  dossier_generation: "dg1:test",
  dossier_schema_version: "dossier-v6",
  dossier_builder_version: "dossier-builder-0.1.0",
  source_vector_hash: "0123456789abcdef",
  source_generations: {},
  change_readiness: "NOT_READY",
  assembly: { cache: "MISS", latency_ms: 4.2 },
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("Resource Dossier v6", () => {
  it("keeps tenant scope server-authoritative and does not turn missing evidence into an absence claim", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(dossier), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }))
    render(
      <ResourceDossier
        resourceId="arn:aws:s3:::orders-data"
        resourceName="orders-data"
        resourceType="S3Bucket"
        systemName="orders"
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText(/Purpose not established/)).toBeInTheDocument()
    expect(screen.queryByText(/No consumers observed/)).not.toBeInTheDocument()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/resource-dossier?"),
      expect.objectContaining({ cache: "no-store" }),
    ))
    const requestUrl = String(vi.mocked(globalThis.fetch).mock.calls[0][0])
    expect(requestUrl).not.toContain("tenant=")
    expect(requestUrl).toContain("account_id=123456789012")

    fireEvent.click(screen.getByRole("button", { name: "Dependencies" }))
    expect(await screen.findByText("arn:aws:iam::123456789012:role/orders-reader")).toBeInTheDocument()
    expect(screen.getByText(/intentionally not summed/)).toBeInTheDocument()
  })

  it("shows an explicit first-slice state for unsupported resources without fetching", () => {
    const fetch = vi.spyOn(globalThis, "fetch")
    render(
      <ResourceDossier
        resourceId="i-123"
        resourceName="worker"
        resourceType="EC2"
        systemName="orders"
        onClose={() => {}}
      />,
    )

    expect(screen.getByText("Dossier not yet available for this resource type")).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})
