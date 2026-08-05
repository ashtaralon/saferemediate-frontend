import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ImpactSummary } from "@/components/attack-paths-v2/impact-summary"
import type { PathListRow } from "@/components/attack-paths-v2/attack-path-report-types"

afterEach(cleanup)

describe("ImpactSummary contrast", () => {
  it("uses an explicit dark foreground on light destructive badges", () => {
    render(
      <ImpactSummary
        row={{
          impact_headline: "DESTRUCTIVE ACCESS",
          impact_buckets: ["DESTRUCTIVE"],
          impact_confidence: "HIGH",
        } as PathListRow}
      />,
    )

    const headline = screen.getByTestId("impact-headline")
    expect(headline).toHaveClass("bg-red-50", "text-red-800", "border-red-300")
    expect(headline).toHaveClass("dark:bg-red-500/15", "dark:text-red-200")

    const chip = screen.getByTestId("impact-chip-DESTRUCTIVE")
    expect(chip).toHaveClass("bg-red-50", "text-red-800", "border-red-300")
    expect(chip).toHaveClass("dark:bg-red-500/15", "dark:text-red-200")
  })

  it("keeps neutral configured-risk text readable in both themes", () => {
    render(
      <ImpactSummary
        row={{
          impact_headline: "CONFIGURED RISK",
          impact_buckets: ["UNKNOWN"],
          impact_confidence: "LOW",
        } as PathListRow}
      />,
    )

    expect(screen.getByTestId("impact-headline")).toHaveClass(
      "bg-slate-100",
      "text-slate-700",
      "dark:text-slate-300",
    )
    expect(screen.getByTestId("impact-chip-UNKNOWN")).toHaveClass(
      "bg-slate-100",
      "text-slate-700",
      "dark:text-slate-400",
    )
  })
})
