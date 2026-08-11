import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { OperationsExplanation } from "@/components/fixes/operations-explanation"
import type { ConfigurationFixExplanation } from "@/components/topology-v0-2/estate-operations"

const explanation: ConfigurationFixExplanation = {
  kind: "S3_PRIVATE_PATH",
  headline: "Move observed S3 traffic onto a private AWS route",
  why_this_change: "3 observed consumers currently reach payments-data through a NAT gateway.",
  current_state: "A usable endpoint already exists: vpce-existing.",
  scope_summary: "The scope contains 5 workloads across 2 route tables.",
  steps: ["Freeze the plan.", "Snapshot the current route associations.", "Reuse vpce-existing."],
  verification: "Check the exact route and fresh S3 traffic.",
  rollback: "Restore the snapshotted route associations.",
  blocker_codes: [],
  readiness: "READY",
  source: "llm",
  grounded: true,
  grounding_reason: "ok",
  evidence_hash: "hash-1",
}

describe("OperationsExplanation", () => {
  it("presents the operator story and exact ordered steps", () => {
    render(<OperationsExplanation explanation={explanation} />)
    expect(screen.getByText("Why this change")).toBeInTheDocument()
    expect(screen.getByText(/3 observed consumers/)).toBeInTheDocument()
    expect(screen.getAllByText(/vpce-existing/)).toHaveLength(2)
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.getByText(/The explanation cannot approve or modify/)).toBeInTheDocument()
  })

  it("labels deterministic fallback honestly", () => {
    render(<OperationsExplanation explanation={{ ...explanation, source: "deterministic_fallback" }} />)
    expect(screen.getByText("Engine explanation")).toBeInTheDocument()
  })
})
