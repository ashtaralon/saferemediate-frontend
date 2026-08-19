import { describe, expect, it } from "vitest"
import {
  iamDataReadinessCopy,
  iamExecutionReadiness,
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
