import { render, screen } from "@testing-library/react"
import { ExfiltrationSimulationSummary } from "@/components/attack-paths-v2/exfiltration-simulation-summary"

const base = {
  schema_version: "atlas-exfiltration-v1",
  verdict: "OPEN" as const,
  steps: [
    { step: 1, operation: "Establish foothold", subject: "app" },
    { step: 2, operation: "s3:GetObject", subject: "critical" },
    { step: 3, operation: "Transfer data out", subject: "Internet" },
  ],
  potential_damage: {
    headline: "Readable data can leave via the effective internet route.",
    damage_score: 58,
    severity: "HIGH",
  },
  missing_evidence: [],
  recommended_cuts: [{
    type: "authorization",
    intent: "Scope s3:GetObject to the legitimate prefix.",
    expected_effect: "Break the chain.",
  }],
}

describe("ExfiltrationSimulationSummary", () => {
  it("renders executable damage, attacker steps and the first cut", () => {
    render(<ExfiltrationSimulationSummary simulation={base} />)
    const panel = screen.getByTestId("atlas-exfiltration-simulation")
    expect(panel).toHaveAttribute("data-verdict", "OPEN")
    expect(panel).toHaveTextContent("Executable exfiltration path")
    expect(panel).toHaveTextContent("s3:GetObject")
    expect(panel).toHaveTextContent("Transfer data out")
    expect(panel).toHaveTextContent("Damage 58/100 · HIGH")
    expect(panel).toHaveTextContent("Fix first: Scope s3:GetObject")
  })

  it("does not present incomplete evidence as executable", () => {
    render(<ExfiltrationSimulationSummary simulation={{
      ...base,
      verdict: "UNKNOWN",
      missing_evidence: ["resource_policy_conditions_not_satisfied"],
    }} />)
    expect(screen.getByTestId("atlas-exfiltration-simulation")).toHaveTextContent(
      "Exfiltration evidence incomplete",
    )
    expect(screen.getByText(/resource_policy_conditions_not_satisfied/)).toBeInTheDocument()
  })
})
