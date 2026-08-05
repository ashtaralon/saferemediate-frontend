import { describe, expect, it } from "vitest"

import { insightsFromCurrentSection } from "@/lib/inspector-insights"

function currentWithAssessment(assessment: Record<string, unknown>) {
  return {
    network: {
      public_ip: "54.171.73.9",
      subnet_id: "subnet-123",
      exfiltration_assessment: assessment,
    },
  }
}

describe("EC2 exfiltration insights", () => {
  it("shows a configured but unused graph path without claiming observed compromise", () => {
    const insights = insightsFromCurrentSection(
      currentWithAssessment({
        state: "CONFIGURED_PATH",
        summary: "A public route and security-group egress allow internet access, but no internet traffic was observed.",
        observation_window_days: 90,
        configuration: { public_ip: "54.171.73.9" },
        observed: { public_destination_count: 0 },
        data_access: { graph_visible_store_count: 2 },
      }),
    )

    expect(insights).toHaveLength(1)
    expect(insights[0]).toMatchObject({
      severity: "warning",
      title: "Potential data-exfiltration path",
    })
    expect(insights[0].tags).toContain("No internet traffic observed in 90 days")
    expect(insights[0].title).not.toContain("Observed")
  })

  it("labels observed public traffic separately", () => {
    const [insight] = insightsFromCurrentSection(
      currentWithAssessment({
        state: "OBSERVED_PATH",
        summary: "Internet-bound traffic was observed from this workload.",
        configuration: { public_ip: "54.171.73.9" },
        observed: { public_destination_count: 3 },
        data_access: { graph_visible_store_count: 1 },
      }),
    )

    expect(insight.title).toBe("Observed outbound data path")
    expect(insight.tags).toContain("3 public destinations observed")
  })

  it("shows cannot verify and names missing evidence", () => {
    const [insight] = insightsFromCurrentSection(
      currentWithAssessment({
        state: "CANNOT_VERIFY",
        summary: "The outbound path cannot be verified from current evidence.",
        missing_evidence: ["subnet route", "NACL egress"],
      }),
    )

    expect(insight).toMatchObject({
      severity: "info",
      title: "Outbound path cannot be verified",
    })
    expect(insight.tags?.[0]).toBe("Missing: subnet route, NACL egress")
  })

  it("does not duplicate the old generic public-IP warning", () => {
    const insights = insightsFromCurrentSection(
      currentWithAssessment({
        state: "BLOCKED_PATH",
        summary: "Security-group egress blocks a direct internet path.",
      }),
    )

    expect(insights.map((item) => item.title)).toEqual([
      "Direct internet exfiltration path is blocked",
    ])
  })
})
