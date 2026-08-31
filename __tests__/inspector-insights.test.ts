import { describe, expect, it } from "vitest"
import {
  humanizeInspectorError,
  insightsFromPolicyStatements,
  summarizePolicyStatement,
} from "@/lib/inspector-insights"

describe("inspector-insights", () => {
  it("summarizes IAM allow statement in plain language", () => {
    const summary = summarizePolicyStatement({
      Effect: "Allow",
      Action: ["logs:CreateLogGroup", "logs:PutLogEvents"],
      Resource: "*",
    })
    expect(summary).toContain("Allows")
    expect(summary).toContain("CloudWatch Logs")
    expect(summary).toContain("any resource")
  })

  it("builds policy insights with wildcard warning", () => {
    const insights = insightsFromPolicyStatements([
      { Effect: "Allow", Action: "s3:GetObject", Resource: "*" },
    ])
    expect(insights).toHaveLength(1)
    expect(insights[0].detail).toMatch(/Wildcard/)
  })

  it("humanizes subnet graph errors", () => {
    const insights = humanizeInspectorError(
      'EC2 Instance arn:aws:ec2:eu-west-1:1:subnet/subnet-abc not found in graph',
      "Subnet",
    )
    expect(insights[0].title).toMatch(/subnet|Wrong resource/i)
  })

  it("distinguishes an unavailable inspector service from a slow account", () => {
    const insights = humanizeInspectorError("Inspector service suspended or unavailable")

    expect(insights[0].title).toBe("Inspector service unavailable")
    expect(insights[0].detail).toContain("inventory and dependency data remain valid")
  })

  it("explains the actual inspector deadline without blaming account size", () => {
    const insights = humanizeInspectorError("Inspector backend request timed out")

    expect(insights[0].title).toBe("Inspector timed out")
    expect(insights[0].detail).toContain("bounded retry deadline")
    expect(insights[0].detail).not.toContain("large accounts")
  })

  it("never renders an upstream HTML error document", () => {
    const insights = humanizeInspectorError(
      '<!DOCTYPE html><html><body><svg>Render</svg><h1>Not Found</h1></body></html>',
      "TargetGroup",
    )

    expect(insights[0].title).toBe("Inspector service unavailable")
    expect(insights[0].detail).not.toMatch(/<!DOCTYPE|<svg|<html>/)
  })
})
