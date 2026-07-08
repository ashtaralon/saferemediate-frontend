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
})
