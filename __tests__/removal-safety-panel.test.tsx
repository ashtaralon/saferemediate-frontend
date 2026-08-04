/// <reference types="vitest/globals" />

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  RemovalSafetyPanel,
  type RemovalSafetyBundle,
} from "@/components/iam-permission-analysis-modal"

afterEach(cleanup)

describe("RemovalSafetyPanel", () => {
  it("states remove, used, protected, and unassessed counts without a composite confidence claim", () => {
    const bundle: RemovalSafetyBundle = {
      scorer_version: "2.0.0-shadow",
      plan_score: 92,
      scored_candidate_count: 2,
      used_count: 5,
      protected_count: 3,
      insufficient_evidence_count: 1,
      shadow_only: true,
      groups: [
        { band: "STRONG", count: 2, permissions: ["iam:ListRoles", "iam:GetAccountSummary"] },
        { band: "CANNOT_ASSESS", count: 1, permissions: ["s3:GetObject"] },
      ],
      permissions: [
        {
          permission: "iam:ListRoles",
          disposition: "REMOVAL_CANDIDATE",
          score: 96,
          band: "STRONG",
          consequence_class: "ROUTINE",
          reason: "No usage was observed.",
          limiting_factors: [],
        },
        {
          permission: "iam:GetAccountSummary",
          disposition: "REMOVAL_CANDIDATE",
          score: 92,
          band: "STRONG",
          consequence_class: "ROUTINE",
          reason: "No usage was observed.",
          limiting_factors: [],
        },
        {
          permission: "s3:GetObject",
          disposition: "INSUFFICIENT_EVIDENCE",
          score: null,
          band: null,
          consequence_class: "ROUTINE",
          reason: "The required data-event source is not enabled.",
          limiting_factors: [],
        },
      ],
    }

    render(<RemovalSafetyPanel bundle={bundle} />)

    expect(screen.getByText("2 to remove · 5 in use · 3 protected")).toBeTruthy()
    expect(screen.getByText("1 cannot be assessed.")).toBeTruthy()
    expect(screen.getByText("92")).toBeTruthy()
    expect(screen.queryByText(/supporting confidence/i)).toBeNull()
    expect(screen.queryByText(/SafetyVector decision/i)).toBeNull()
  })
})
