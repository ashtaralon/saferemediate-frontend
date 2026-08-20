import { describe, expect, it } from "vitest"
import {
  ACK_SHORT_OBSERVATION_WINDOW,
  ACK_TERRAFORM_DIRECT_APPLY,
  iamDataReadinessCopy,
  iamExecutionReadiness,
  lpProceedAnywayHolds,
} from "@/lib/iam-execution-readiness"

describe("IAM execution readiness", () => {
  it("allows direct apply only for the AWS adapter", () => {
    expect(iamExecutionReadiness({ execution_adapter: "aws_api" }).directAwsApplyAllowed).toBe(true)
    expect(iamExecutionReadiness({ execution_adapter: "customer_pipeline" }).directAwsApplyAllowed).toBe(false)
    expect(iamExecutionReadiness({ execution_adapter: "terraform_pr_only" }).directAwsApplyAllowed).toBe(false)
    expect(iamExecutionReadiness(undefined).directAwsApplyAllowed).toBe(false)
    expect(iamExecutionReadiness({
      execution_adapter: "aws_api",
      iac_managed: true,
    }).directAwsApplyAllowed).toBe(false)
  })

  it("lets unregistered Terraform be overridden, not a registered pipeline", () => {
    expect(iamExecutionReadiness({
      execution_adapter: "terraform_pr_only",
      iac_binding_status: "unregistered",
    }).directApplyOverridable).toBe(true)
    expect(iamExecutionReadiness({
      execution_adapter: "customer_pipeline",
      iac_binding_status: "active",
    }).directApplyOverridable).toBe(false)
  })

  it("asks for proceed-anyway confirmation on short days and missing TF", () => {
    const holds = lpProceedAnywayHolds({
      execution_adapter: "terraform_pr_only",
      iac_binding_status: "unregistered",
      iac_managed: true,
      time_requirement_only: true,
      observation_days: 3,
      unsafe_reasons: [
        "Observation window 3d is below the 7d mutation floor",
        "Terraform ownership is detected but repository, workspace, resource address, and state serial are not registered; preview only.",
      ],
    })
    expect(holds.acknowledgedTags).toEqual([
      ACK_SHORT_OBSERVATION_WINDOW,
      ACK_TERRAFORM_DIRECT_APPLY,
    ])
    expect(holds.confirmations).toHaveLength(2)
    expect(holds.reasons[0]).toMatch(/3d/)
  })

  it("distinguishes complete data waiting on time from missing data", () => {
    expect(iamDataReadinessCopy({
      data_layer_complete: true,
      time_requirement_only: true,
      data_layer_gaps: [],
    }).detail).toContain("Only additional observation time")
    expect(iamDataReadinessCopy({
      data_layer_complete: false,
      time_requirement_only: false,
      data_layer_gaps: ["iam_usage_collector_run_not_fresh"],
    }).detail).toContain("iam_usage_collector_run_not_fresh")
  })
})
