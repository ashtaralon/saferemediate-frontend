import { describe, expect, it } from "vitest"

import {
  isCancellable,
  isInFlight,
  isTerminal,
  operationFromSummary,
} from "@/components/fixes/s3-vpce-lifecycle"

describe("S3 operation queue lifecycle", () => {
  it("shows and allows cancellation of a simulation that holds the scope lock", () => {
    const operation = operationFromSummary("alon-prod", {
      operation_id: "s3-bpe-lock-holder",
      kind: "S3_BUCKET_POLICY_ENFORCEMENT",
      state: "SIMULATION_PENDING",
      resource_id: "arn:aws:s3:::data",
      bucket_name: "data",
      scope_claim_holder: "s3-bpe-lock-holder",
      scope_claim_active: true,
    }, undefined)

    expect(isInFlight(operation.state)).toBe(true)
    expect(isCancellable(operation.state)).toBe(true)
    expect(operation.scopeClaimActive).toBe(true)
    expect(operation.scopeClaimHolder).toBe("s3-bpe-lock-holder")
  })

  it("requires rollback rather than cancellation after mutation", () => {
    expect(isCancellable("CANARY_MONITORING")).toBe(false)
    expect(isInFlight("CANARY_MONITORING")).toBe(true)
  })

  it("does not present cancelled and expired operations as live work", () => {
    expect(isTerminal("SUPERSEDED")).toBe(true)
    expect(isTerminal("EXPIRED")).toBe(true)
    expect(isInFlight("SUPERSEDED")).toBe(false)
  })
})
