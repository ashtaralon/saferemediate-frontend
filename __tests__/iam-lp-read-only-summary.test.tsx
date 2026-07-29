import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import asymmetryFixture from "./fixtures/iam-lp/alon-demo-asymmetry-sanitized.json"
import { IamLpReadOnlySummary } from "@/components/iam-lp/IamLpReadOnlySummary"
import type { IamGapAnalysisWire } from "@/components/iam-lp/types"

describe("IamLpReadOnlySummary", () => {
  it("renders the new count-first summary without mutation controls", () => {
    render(
      <IamLpReadOnlySummary
        gap={asymmetryFixture as IamGapAnalysisWire}
        pipelineDecision="REQUIRE_APPROVAL"
        pipelineReasons={["Operator approval required"]}
      />,
    )

    expect(screen.getByTestId("iam-lp-read-only-summary")).toBeTruthy()
    expect(screen.getByText("After safe apply")).toBeTruthy()
    expect(screen.getByText("Target after approval")).toBeTruthy()
    expect(screen.getByText(/12 safe now/)).toBeTruthy()
    expect(screen.getAllByText(/1 need approval/).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /apply safe set/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /request approval/i })).toBeNull()
  })

  it("surfaces unavailable pipeline authority instead of a ready verdict", () => {
    render(
      <IamLpReadOnlySummary
        gap={asymmetryFixture as IamGapAnalysisWire}
        pipelineDecision="UNAVAILABLE"
      />,
    )

    expect(screen.getByText("Safety unavailable")).toBeTruthy()
  })
})
