/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { S3EnforcementWizard } from "@/components/fixes/s3-enforcement-wizard"
import { S3VpceWizard } from "@/components/fixes/s3-vpce-wizard"

const { operationalRequest } = vi.hoisted(() => ({ operationalRequest: vi.fn() }))

vi.mock("@/components/topology-v0-2/estate-operations", async () => {
  const actual = await vi.importActual<typeof import("@/components/topology-v0-2/estate-operations")>(
    "@/components/topology-v0-2/estate-operations",
  )
  return { ...actual, operationalRequest }
})

afterEach(() => {
  cleanup()
  operationalRequest.mockReset()
  window.localStorage.clear()
})

describe("S3 configuration-fix resume", () => {
  it("rehydrates the stored enforcement plan and safety result", async () => {
    operationalRequest.mockResolvedValue({
      operation_id: "s3-bpe-1",
      state: "APPROVAL_PENDING",
      version: 3,
      approval: { requested_by: "requester@example.com", approved_by: null },
      // Legacy durable documents stored blockers beside the plan. Resume must
      // normalize that shape rather than trusting the latest response type.
      blockers: [],
      plan: {
        readiness: "READY",
        operation_id: "s3-bpe-1",
        operation_state: "READY_FOR_SIMULATION",
        bucket_name: "customer-data",
        vpc_id: "vpc-1",
        vpc_ids: ["vpc-1"],
        region: "eu-west-1",
        vpce_ids: ["vpce-1"],
        enforcement_mode: "SINGLE_STAGE",
        exempt_principal_arns: [],
        canary_principal_arns: [],
        impact: {
          observed_consumers: 2,
          protected_consumers: 2,
          public_consumers: 0,
          unknown_consumers: 0,
          exempt_principals: 0,
          vpc_endpoints: 1,
          policy_statements_added: 1,
        },
      },
      simulation: {
        status: "COMPLETED",
        safe_to_apply: true,
        errors: [],
        plan_hash: "1234567890abcdef",
        operation_state: "SIMULATED",
        operation_version: 2,
        checks: {
          validator: "unavailable: AccessDeniedException for arn:aws:iam::123456789012:user/private",
          enforcement_mode: "SINGLE_STAGE",
          policy_drift: false,
        },
      },
      execution: null,
      verification: null,
    })

    render(
      <S3EnforcementWizard
        systemName="alon-prod"
        bucket={{ id: "arn:aws:s3:::customer-data", name: "customer-data", region: "eu-west-1" }}
        resume={{
          operationId: "s3-bpe-1",
          kind: "S3_BUCKET_POLICY_ENFORCEMENT",
          systemName: "alon-prod",
          bucketId: "arn:aws:s3:::customer-data",
          bucketName: "customer-data",
          vpcId: "vpc-1",
          state: "APPROVAL_PENDING",
          updatedAt: "2026-08-10T00:00:00Z",
        }}
        executionEnabled={false}
        onClose={() => undefined}
      />,
    )

    await screen.findByText(/Requested by/)

    fireEvent.click(screen.getByTestId("enforce-wizard-step-1"))
    expect(await screen.findByText(/Endpoint\(s\):/)).toBeInTheDocument()
    expect(screen.getByText("vpce-1")).toBeInTheDocument()
    expect(screen.queryByText("Run the analysis from the Review step first.")).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("enforce-wizard-step-2"))
    expect(await screen.findByText(/Core safety checks passed/)).toBeInTheDocument()
    expect(screen.getByText(/Additional policy lint unavailable/)).toBeInTheDocument()
    expect(screen.getByText(/1234567890/)).toBeInTheDocument()
    expect(screen.queryByText(/AccessDeniedException/)).not.toBeInTheDocument()
    expect(screen.queryByText(/arn:aws:iam/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No validation yet/)).not.toBeInTheDocument()
  })

  it("does not claim internet-path use when no consumer was observed", async () => {
    operationalRequest.mockResolvedValue({
      resource: {
        id: "arn:aws:s3:::unused-bucket",
        name: "unused-bucket",
        type: "S3Bucket",
        system_name: "alon-prod",
      },
      dependencies: {
        upstream: [],
        downstream: [],
        summary: { consumer_count: 0, observed: 0, configured: 0, inferred: 0 },
      },
      evidence: { window_days: 90, sources: [], coverage_state: "complete" },
      change_capabilities: [],
    })

    render(
      <S3VpceWizard
        systemName="alon-prod"
        bucket={{ id: "arn:aws:s3:::unused-bucket", name: "unused-bucket", region: "eu-west-1" }}
        onClose={() => undefined}
      />,
    )

    await waitFor(() => expect(screen.getByText(/No workload in this system was observed using/)).toBeInTheDocument())
    expect(screen.queryByText(/over the internet path today/i)).not.toBeInTheDocument()
  })
})
