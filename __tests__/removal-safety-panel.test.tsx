/// <reference types="vitest/globals" />

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  buildCanonicalPermissionView,
  RemovalSafetyPanel,
  resolveDefaultPermissionSelection,
  shouldOfferIamSimulation,
  type RemovalSafetyBundle,
} from "@/components/iam-permission-analysis-modal"

afterEach(cleanup)

describe("IAM simulation availability", () => {
  it("offers simulation only for an unremediated role with removal candidates", () => {
    expect(shouldOfferIamSimulation(true, 10)).toBe(true)
    expect(shouldOfferIamSimulation(true, 0)).toBe(false)
    expect(shouldOfferIamSimulation(false, 27)).toBe(false)
    expect(shouldOfferIamSimulation(true, 10, "2026-08-05T10:00:00Z")).toBe(false)
  })
})

describe("RemovalSafetyPanel", () => {
  it("explains a shared score as common evidence inputs, not a probability", () => {
    const permissions = ["ssm:GetDocument", "ssm:PutInventory"].map(permission => ({
      permission,
      disposition: "REMOVAL_CANDIDATE" as const,
      score: 62,
      band: "LOW" as const,
      consequence_class: permission.includes("Put") ? "OPERATIONAL" as const : "ROUTINE" as const,
      observation_days: 30,
      required_observation_days: 395,
      factors: {
        evidence_coverage: 30,
        observation_adequacy: 1.52,
        consumer_attribution: 10,
        dependency_certainty: 20,
        independent_corroboration: 0,
        raw_score: 61.52,
      },
      reason: "No usage was observed.",
      limiting_factors: ["Usage cadence is unknown.", "Consumer attribution is incomplete."],
    }))
    const bundle: RemovalSafetyBundle = {
      scorer_version: "2.0.0-shadow",
      plan_score: 62,
      scored_candidate_count: 2,
      used_count: 4,
      protected_count: 10,
      insufficient_evidence_count: 0,
      shadow_only: true,
      groups: [{ band: "LOW", count: 2, permissions: permissions.map(item => item.permission) }],
      permissions,
    }

    render(<RemovalSafetyPanel bundle={bundle} />)

    expect(screen.getByText("Why all 2 permissions score 62/100")).toBeTruthy()
    expect(screen.getByText(/30 observed days/i)).toBeTruthy()
    expect(screen.getByText(/requires 395 days/i)).toBeTruthy()
    expect(screen.getByText(/evidence 30 \+ history 2 \+ attribution 10 \+ dependencies 20 \+ corroboration 0 = 62/i)).toBeTruthy()
    expect(screen.getByText(/not a probability/i)).toBeTruthy()
    expect(screen.getByText("Breakage impact: operational")).toBeTruthy()
  })

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

  it("uses the simulation partition for every tab instead of legacy gap classifications", () => {
    const bundle: RemovalSafetyBundle = {
      scorer_version: "2.0.0-shadow",
      plan_score: null,
      scored_candidate_count: 0,
      used_count: 2,
      protected_count: 1,
      insufficient_evidence_count: 0,
      shadow_only: true,
      groups: [],
      permissions: [
        {
          permission: "ec2:DescribeInstances",
          disposition: "USED",
          score: null,
          band: null,
          consequence_class: "ROUTINE",
          reason: "Observed in use.",
          limiting_factors: [],
        },
        {
          permission: "s3:GetObject",
          disposition: "USED",
          score: null,
          band: null,
          consequence_class: "ROUTINE",
          reason: "Observed in use.",
          limiting_factors: [],
        },
        {
          permission: "ssm:PutInventory",
          disposition: "PROTECTED",
          score: null,
          band: null,
          consequence_class: "OPERATIONAL",
          reason: "Active managed-instance baseline.",
          limiting_factors: [],
        },
      ],
    }
    // Deliberately contradictory legacy response: it calls the two used
    // actions unused/removable, exactly like the production screenshots.
    const view = buildCanonicalPermissionView([
      {
        permission: "ec2:DescribeInstances",
        status: "UNUSED",
        risk_level: "MEDIUM",
        recommendation: "Remove",
        usage_count: 0,
      },
      {
        permission: "s3:GetObject",
        status: "UNUSED",
        risk_level: "MEDIUM",
        recommendation: "Remove",
        usage_count: 0,
      },
      {
        permission: "ssm:PutInventory",
        status: "UNUSED",
        risk_level: "MEDIUM",
        recommendation: "Keep",
        usage_count: 0,
      },
    ], bundle)

    expect(view.used.map(item => item.permission)).toEqual([
      "ec2:DescribeInstances",
      "s3:GetObject",
    ])
    expect(view.removable).toEqual([])
    expect(view.protected.map(item => item.permission)).toEqual(["ssm:PutInventory"])
    expect(view.usedCount).toBe(2)
    expect(view.totalCount).toBe(3)

    expect(resolveDefaultPermissionSelection(bundle, [
      "ssm:PutInventory",
    ])).toEqual([])
  })

  it("accepts a signed plan only when every planned action is a displayed candidate", () => {
    const bundle: RemovalSafetyBundle = {
      scorer_version: "2.0.0-shadow",
      plan_score: 80,
      scored_candidate_count: 1,
      used_count: 0,
      protected_count: 1,
      insufficient_evidence_count: 0,
      shadow_only: true,
      groups: [{ band: "REVIEW", count: 1, permissions: ["iam:ListRoles"] }],
      permissions: [
        {
          permission: "iam:ListRoles",
          disposition: "REMOVAL_CANDIDATE",
          score: 80,
          band: "REVIEW",
          consequence_class: "ROUTINE",
          reason: "No use observed.",
          limiting_factors: [],
        },
        {
          permission: "sts:AssumeRole",
          disposition: "PROTECTED",
          score: null,
          band: null,
          consequence_class: "ROUTINE",
          reason: "Protected baseline.",
          limiting_factors: [],
        },
      ],
    }

    expect(resolveDefaultPermissionSelection(bundle, ["iam:ListRoles"]))
      .toEqual(["iam:ListRoles"])
    expect(resolveDefaultPermissionSelection(bundle, [
      "iam:ListRoles",
      "sts:AssumeRole",
    ])).toEqual(["iam:ListRoles"])
  })
})
