/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { formatFactValue, ResourceDossier } from "@/components/inventory/resource-dossier"

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

const identityOnlyDossier = {
  ...dossier,
  identity: {
    tenant: "customer-a",
    account: "123456789012",
    aws_partition: "aws",
    canonical_resource_uid: "aws:ec2:eu-west-1:123456789012:instance/i-123",
    region: "eu-west-1",
  },
  purpose: {
    ...dossier.purpose,
    serve_state: "NOT_READY",
    payload: {
      summary: null,
      not_established_reason: "Canonical EC2 instance identity is available, but this profile does not yet have a certified purpose or dependency projection.",
      assertion: {
        ...dossier.purpose.payload.assertion,
        authority_basis: "aws.ec2.instance.v1 requires a certified type-specific evidence projection",
        window: null,
        coverage: {
          state: "UNKNOWN",
          required_sources: [],
          present_sources: [],
          missing_sources: [],
          sufficient_for: ["identify the canonical AWS resource"],
          insufficient_for: ["establish resource purpose", "identify dependencies", "prove absence of dependencies"],
        },
      },
    },
    coverage: {
      state: "UNKNOWN",
      required_sources: [],
      present_sources: [],
      missing_sources: [],
      sufficient_for: ["identify the canonical AWS resource"],
      insufficient_for: ["establish resource purpose", "identify dependencies", "prove absence of dependencies"],
    },
  },
  dependencies: {
    serve_state: "NOT_READY",
    payload: {
      ledger: [],
      counts_by_basis: { OBSERVED: 0, CONFIGURED: 0, STRUCTURAL: 0 },
    },
    coverage: dossier.purpose.coverage,
    notes: "No certified dependency assertions are available. An empty ledger is not proof that dependencies do not exist.",
  },
  evidence: {
    serve_state: "NOT_READY",
    payload: {
      assertions: [],
      coverage: dossier.purpose.coverage,
      diagnostics: ["profile=aws.ec2.instance.v1 substantive_projection=NOT_READY"],
      missing_immutable_evidence_bindings: 0,
    },
    coverage: dossier.purpose.coverage,
    notes: null,
  },
  serve_state: "NOT_READY",
  dossier_generation: "dg1:ec2-test",
  dossier_builder_version: "dossier-builder-0.3.0",
  assembly: {
    cache: "MISS",
    cache_eligible: true,
    latency_ms: 2.1,
    missing_source_heads: [],
  },
}

const configurationProfileDossier = {
  ...identityOnlyDossier,
  purpose: {
    ...identityOnlyDossier.purpose,
    serve_state: "PARTIAL",
    payload: {
      ...identityOnlyDossier.purpose.payload,
      summary: "EC2 instance · running · t3.micro · 1 configured relationship",
      not_established_reason: null,
      profile_id: "aws.ec2.instance.v1",
      profile_label: "EC2 instance",
      assertion: {
        ...identityOnlyDossier.purpose.payload.assertion,
        state: "CONFIGURED",
        value: "EC2 instance · running · t3.micro · 1 configured relationship",
        authority_basis: "activated configuration and relationship source generations",
        source_generation_refs: [{ plane: "configuration", generation: "c1", head_hash: "head-c1", evidence_binding: null }],
      },
    },
    notes: "Operational purpose only; business intent is never inferred from configuration.",
    coverage: {
      ...identityOnlyDossier.purpose.coverage,
      state: "PARTIAL",
    },
  },
  lifecycle: {
    serve_state: "PARTIAL",
    payload: {
      profile_id: "aws.ec2.instance.v1",
      facts: [{
        key: "state",
        label: "Instance state",
        assertion: {
          ...dossier.purpose.payload.assertion,
          state: "CONFIGURED",
          value: "running",
          basis: "Instance state from the activated configuration projection",
          authority_basis: "activated configuration source generation",
          window: null,
          source_generation_refs: [{ plane: "configuration", generation: "c1", head_hash: "head-c1", evidence_binding: null }],
        },
      }, {
        key: "last_collected",
        label: "Last collected",
        assertion: {
          ...dossier.purpose.payload.assertion,
          state: "CONFIGURED",
          value: "2026-08-13T19:24:18.205543+00:00",
          basis: "Last collected from the activated configuration projection",
          authority_basis: "activated configuration source generation",
          window: null,
          source_generation_refs: [{ plane: "configuration", generation: "c1", head_hash: "head-c1", evidence_binding: null }],
        },
      }],
    },
    coverage: identityOnlyDossier.purpose.coverage,
    notes: null,
  },
  fitness: {
    serve_state: "PARTIAL",
    payload: {
      profile_id: "aws.ec2.instance.v1",
      facts: [{
        key: "instance_type",
        label: "Instance type",
        assertion: {
          ...dossier.purpose.payload.assertion,
          state: "CONFIGURED",
          value: "t3.micro",
          basis: "Instance type from the activated configuration projection",
          authority_basis: "activated configuration source generation",
          window: null,
          source_generation_refs: [{ plane: "configuration", generation: "c1", head_hash: "head-c1", evidence_binding: null }],
        },
      }],
    },
    coverage: identityOnlyDossier.purpose.coverage,
    notes: null,
  },
  dependencies: {
    serve_state: "PARTIAL",
    payload: {
      ledger: [{
        direction: "DOWNSTREAM",
        basis_class: "CONFIGURED",
        freshness: "UNKNOWN",
        target_arn: "arn:aws:iam::123456789012:role/orders-worker",
        target_display_name: "orders-worker",
        target_type: "IAMRole",
        resource_canonical_resource_uid: "aws:ec2:eu-west-1:123456789012:instance/i-123",
        relationship: "USES_ROLE_VIA_INSTANCE_PROFILE",
        actions: [],
        evidence_refs: [],
        source_generation_refs: [{ plane: "authorization", generation: "a1", head_hash: "head-a1", evidence_binding: null }],
      }, {
        direction: "DOWNSTREAM",
        basis_class: "OBSERVED",
        freshness: "CURRENT",
        target_display_name: "3.253.40.255",
        target_type: "IPAddress",
        resource_canonical_resource_uid: "aws:ec2:eu-west-1:123456789012:instance/i-123",
        relationship: "ACTUAL_TRAFFIC",
        actions: [],
        evidence_refs: [],
        source_generation_refs: [{ plane: "behavioral", generation: "b1", head_hash: "head-b1", evidence_binding: null }],
      }],
      counts_by_basis: { OBSERVED: 1, CONFIGURED: 1, STRUCTURAL: 0 },
    },
    coverage: identityOnlyDossier.purpose.coverage,
    notes: "Observed and configured relationships are separate proof sets. No identified relationship is not proof that none exist.",
  },
  evidence: {
    ...identityOnlyDossier.evidence,
    serve_state: "PARTIAL",
    payload: {
      ...identityOnlyDossier.evidence.payload,
      diagnostics: ["4 assertions are generation-pinned but do not yet have object-level immutable bindings."],
      missing_immutable_evidence_bindings: 4,
    },
  },
  serve_state: "PARTIAL",
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("Resource Dossier v6", () => {
  it("formats service-specific configuration values with customer-facing units", () => {
    expect(formatFactValue("fifo_queue", false)).toBe("Standard")
    expect(formatFactValue("fifo_queue", true)).toBe("FIFO")
    expect(formatFactValue("memory_mb", 256)).toBe("256 MB")
    expect(formatFactValue("timeout_seconds", 60)).toBe("60 seconds")
    expect(formatFactValue("allocated_storage", 100)).toBe("100 GiB")
    expect(formatFactValue("maximum_message_size", 262144)).toBe("262,144 bytes")
  })

  it("locks background page scrolling while the fixed dossier is open", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}))
    const previousOverflow = document.body.style.overflow
    const view = render(
      <ResourceDossier
        resourceId="arn:aws:s3:::orders-data"
        resourceName="orders-data"
        resourceType="S3Bucket"
        systemName="orders"
        onClose={() => {}}
      />,
    )

    expect(document.body.style.overflow).toBe("hidden")
    view.unmount()
    expect(document.body.style.overflow).toBe(previousOverflow)
    expect(fetch).toHaveBeenCalledOnce()
  })

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
    expect(await screen.findByText("IAM role · orders-reader")).toBeInTheDocument()
    expect(await screen.findByText("arn:aws:iam::123456789012:role/orders-reader")).toBeInTheDocument()
    expect(screen.getByText(/intentionally not summed/)).toBeInTheDocument()
  })

  it("renders identity-only payloads without exposing internal NOT_READY states", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(identityOnlyDossier), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }))
    render(
      <ResourceDossier
        resourceId="i-123"
        resourceName="worker"
        resourceType="EC2"
        systemName="orders"
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText("Identity profile")).toBeInTheDocument()
    expect(screen.getByText(/Canonical identity is verified/)).toBeInTheDocument()
    expect(screen.queryByText("NOT READY")).not.toBeInTheDocument()
    expect(screen.getByText("aws:ec2:eu-west-1:123456789012:instance/i-123")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Dependencies" }))
    expect(await screen.findByText(/No dependency assertions are available/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Technical evidence" }))
    expect(await screen.findByText(/service-specific configuration and activity evidence are not available/i)).toBeInTheDocument()
    expect(screen.queryByText(/NOT_READY/)).not.toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/resource-dossier?"),
      expect.objectContaining({ cache: "no-store" }),
    ))
    const requestUrl = String(vi.mocked(globalThis.fetch).mock.calls[0][0])
    expect(requestUrl).toContain("resource_id=i-123")
    expect(requestUrl).not.toContain("resource_type=")
  })

  it("renders the shared EC2 configuration profile and generation-pinned relationships", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(configurationProfileDossier), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }))
    render(
      <ResourceDossier
        resourceId="i-123"
        resourceName="worker"
        resourceType="EC2"
        systemName="orders"
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText("Operational profile")).toBeInTheDocument()
    expect(screen.getByText(/EC2 instance · running · t3.micro/)).toBeInTheDocument()
    expect(screen.getByText("Lifecycle")).toBeInTheDocument()
    expect(screen.getByText("Instance state")).toBeInTheDocument()
    expect(screen.getByText("Last collected")).toBeInTheDocument()
    expect(screen.queryByText("2026-08-13T19:24:18.205543+00:00")).not.toBeInTheDocument()
    expect(screen.getByText("Configuration and posture")).toBeInTheDocument()
    expect(screen.getByText("Instance type")).toBeInTheDocument()
    expect(screen.queryByText("NOT READY")).not.toBeInTheDocument()
    expect(screen.getAllByText("Partial coverage").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: "Dependencies" }))
    expect(await screen.findByText("orders-worker")).toBeInTheDocument()
    expect(screen.getByText("Network endpoint · 3.253.40.255")).toBeInTheDocument()
    expect(screen.queryByText("Canonical identity unavailable")).not.toBeInTheDocument()
    expect(screen.getByText("authorization")).toBeInTheDocument()
    expect(screen.getByText("a1")).toBeInTheDocument()
  })
})
