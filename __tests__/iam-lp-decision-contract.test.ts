import { describe, expect, it } from "vitest"
import { buildDecisionSplit } from "@/components/iam-lp/resolvers/decisionSplit"
import { buildChangeSetCounts } from "@/components/iam-lp/resolvers/changeSetCounts"
import {
  buildExecutionReadiness,
  permissionSetsEqual,
} from "@/components/iam-lp/resolvers/executionReadiness"
import { normalizeIamGapAnalysis } from "@/components/iam-lp/resolvers/normalizeGap"
import type {
  ExecutionState,
  IamGapAnalysisWire,
} from "@/components/iam-lp/types"

function gapWire(overrides: Partial<IamGapAnalysisWire> = {}): IamGapAnalysisWire {
  return {
    role_name: "alon-demo-ec2-role",
    role_arn: "arn:aws:iam::745783559495:role/alon-demo-ec2-role",
    observation_days: 90,
    summary: {
      total_permissions: 4,
      used_count: 1,
      unused_count: 3,
      cloudtrail_events: 12,
    },
    used_permissions: ["s3:GetObject"],
    unused_permissions: [
      "s3:DeleteObject",
      "s3:PutBucketPolicy",
      "iam:ListRoles",
    ],
    confidence_groups: {
      groups: [
        {
          group_id: "safe",
          label: "Safe",
          action: "safe_to_remove",
          permission_count: 3,
          permissions: [
            { permission: "s3:DeleteObject" },
            { permission: "s3:PutBucketPolicy" },
            { permission: "iam:ListRoles" },
          ],
          protected: false,
          warn: false,
          auto_remediable: true,
        },
      ],
    },
    is_remediable: true,
    dependency_context: {
      status: "ready",
      dependencies: [],
      has_critical_dependencies: false,
    },
    ...overrides,
  }
}

describe("iam-lp normalized decision contract", () => {
  it("classifies a fully auto-remediable group per permission", () => {
    const gap = normalizeIamGapAnalysis(gapWire())
    const split = buildDecisionSplit(gap)

    expect(split.autoApplyPermissions).toEqual([
      "iam:ListRoles",
      "s3:DeleteObject",
      "s3:PutBucketPolicy",
    ])
    expect(split.autoApplyCount).toBe(3)
    expect(split.conservationError).toBe(false)
  })

  it("gives protected the strongest precedence across duplicate groups", () => {
    const wire = gapWire({
      summary: {
        total_permissions: 2,
        used_count: 1,
        unused_count: 1,
      },
      unused_permissions: ["s3:DeleteObject"],
      confidence_groups: {
        groups: [
          {
            group_id: "safe",
            label: "Safe",
            action: "safe_to_remove",
            permission_count: 1,
            permissions: [{ permission: "s3:DeleteObject" }],
            auto_remediable: true,
          },
          {
            group_id: "protected",
            label: "Protected",
            action: "protected",
            permission_count: 1,
            permissions: [{ permission: "s3:DeleteObject", protected: true }],
            protected: true,
            auto_remediable: false,
          },
        ],
      },
    })

    const split = buildDecisionSplit(normalizeIamGapAnalysis(wire))
    expect(split.protectedPermissions).toEqual(["s3:DeleteObject"])
    expect(split.autoApplyCount).toBe(0)
    expect(split.protectedCount).toBe(1)
    expect(split.conservationError).toBe(false)
  })

  it("lets an explicit protected row override an auto group copy", () => {
    const wire = gapWire({
      summary: {
        total_permissions: 2,
        used_count: 1,
        unused_count: 1,
      },
      unused_permissions: [
        { permission: "s3:DeleteObject", protected: true },
      ],
      confidence_groups: {
        groups: [
          {
            group_id: "safe",
            label: "Safe",
            action: "safe_to_remove",
            permission_count: 1,
            permissions: [{ permission: "s3:DeleteObject" }],
            auto_remediable: true,
          },
        ],
      },
    })

    const split = buildDecisionSplit(normalizeIamGapAnalysis(wire))
    expect(split.protectedPermissions).toEqual(["s3:DeleteObject"])
    expect(split.autoApplyCount).toBe(0)
  })

  it("ports telemetry-asymmetry partial remediation at permission level", () => {
    const wire = gapWire({
      used_permissions: [
        "s3:GetObject",
        { permission: "ec2:DescribeInstances", status: "USED" },
      ],
      unused_permissions: [
        "s3:DeleteObject",
        "ec2:TerminateInstances",
        "iam:ListRoles",
      ],
      confidence_groups: {
        groups: [
          {
            group_id: "asymmetry",
            label: "EC2, IAM, S3",
            action: "safe_to_remove",
            permission_count: 3,
            permissions: [
              { permission: "s3:DeleteObject" },
              { permission: "ec2:TerminateInstances" },
              { permission: "iam:ListRoles" },
            ],
            auto_remediable: false,
            block_reason_code: "telemetry_asymmetry",
          },
        ],
      },
    })

    const split = buildDecisionSplit(normalizeIamGapAnalysis(wire))
    expect(split.autoApplyPermissions).toEqual([
      "ec2:TerminateInstances",
      "s3:DeleteObject",
    ])
    expect(split.needsApprovalPermissions).toEqual(["iam:ListRoles"])
    expect(split.conservationError).toBe(false)
  })

  it("holds mutation when identities are truncated instead of inventing rows", () => {
    const wire = gapWire({
      summary: {
        total_permissions: 6,
        used_count: 1,
        unused_count: 5,
      },
      unused_permissions: ["s3:DeleteObject", "iam:ListRoles"],
      confidence_groups: {
        groups: [
          {
            group_id: "partial",
            label: "Partial payload",
            action: "safe_to_remove",
            permission_count: 5,
            permissions: [
              { permission: "s3:DeleteObject" },
              { permission: "iam:ListRoles" },
            ],
            auto_remediable: true,
          },
        ],
      },
    })

    const split = buildDecisionSplit(normalizeIamGapAnalysis(wire))
    expect(split.identifiedUnusedCount).toBe(2)
    expect(split.missingPermissionIdentityCount).toBe(3)
    expect(split.unclassifiedCount).toBe(3)
    expect(split.conservationError).toBe(true)
    expect(split.conservationErrors).toContain("unused_permission_identities_missing")
  })

  it("preserves absent counts as unknown rather than coercing them to zero", () => {
    const gap = normalizeIamGapAnalysis({
      role_name: "partial-role",
      summary: {},
    })
    const split = buildDecisionSplit(gap)

    expect(gap.summary.total_permissions).toBeNull()
    expect(gap.summary.unused_count).toBeNull()
    expect(split.conservationError).toBe(true)
    expect(split.conservationErrors).toContain("unused_count_missing")
  })

  it("keeps the safe outcome separate from the approval target", () => {
    const gap = normalizeIamGapAnalysis(
      gapWire({
        summary: {
          total_permissions: 36,
          used_count: 1,
          unused_count: 35,
        },
      }),
    )
    const counts = buildChangeSetCounts(gap, {
      autoApplyCount: 12,
      needsApprovalCount: 18,
      protectedCount: 5,
      unclassifiedCount: 0,
      identifiedUnusedCount: 35,
      missingPermissionIdentityCount: 0,
      expectedUnusedCount: 35,
      autoApplyPermissions: [],
      needsApprovalPermissions: [],
      protectedPermissions: [],
      unclassifiedPermissions: [],
      conservationError: false,
      conservationErrors: [],
    })

    expect(counts.afterSafeApply).toBe(24)
    expect(counts.targetAfterApproval).toBe(6)
  })
})

describe("iam-lp execution binding", () => {
  it("accepts a signed plan only for the exact normalized safe set and role", () => {
    const gap = normalizeIamGapAnalysis(gapWire())
    const split = buildDecisionSplit(gap)
    const execution: ExecutionState = {
      simulation: {
        ok: true,
        plan_token: "signed-plan",
        permissions_to_remove: [
          "s3:PutBucketPolicy",
          "iam:ListRoles",
          "s3:DeleteObject",
          "s3:DeleteObject",
        ],
        role_name: gap.role_name,
        role_arn: gap.role_arn,
      },
    }

    expect(buildExecutionReadiness(gap, split, execution).canApplySafe).toBe(true)
  })

  it("refuses stale or differently bound simulation sets", () => {
    const gap = normalizeIamGapAnalysis(gapWire())
    const split = buildDecisionSplit(gap)
    const readiness = buildExecutionReadiness(gap, split, {
      simulation: {
        ok: true,
        plan_token: "signed-plan",
        permissions_to_remove: ["s3:DeleteObject"],
        role_name: gap.role_name,
      },
    })

    expect(readiness.canApplySafe).toBe(false)
    expect(readiness.reasons).toContain("simulated_set_mismatch")
  })

  it("keeps real coverage failures hard-blocked", () => {
    const gap = normalizeIamGapAnalysis(
      gapWire({
        is_remediable: false,
        reason: "usage_not_computed",
        remediable_reason: "Usage has not been measured.",
      }),
    )
    const split = buildDecisionSplit(gap)
    const readiness = buildExecutionReadiness(gap, split, {
      simulation: {
        ok: true,
        plan_token: "signed-plan",
        permissions_to_remove: split.autoApplyPermissions,
      },
    })

    expect(readiness.canSimulate).toBe(false)
    expect(readiness.canApplySafe).toBe(false)
    expect(readiness.canRequestApproval).toBe(false)
    expect(readiness.reasons).toContain("coverage:usage_not_computed")
  })

  it("does not turn telemetry asymmetry into a global coverage block", () => {
    const gap = normalizeIamGapAnalysis(
      gapWire({
        is_remediable: false,
        reason: "telemetry_asymmetry",
      }),
    )
    const split = buildDecisionSplit(gap)
    const readiness = buildExecutionReadiness(gap, split, {})

    expect(readiness.canSimulate).toBe(true)
    expect(readiness.reasons.some((reason) => reason.startsWith("coverage:"))).toBe(false)
  })

  it("compares frozen permission sets independent of ordering and duplicates", () => {
    expect(
      permissionSetsEqual(
        ["s3:DeleteObject", "iam:ListRoles", "s3:DeleteObject"],
        ["iam:ListRoles", "s3:DeleteObject"],
      ),
    ).toBe(true)
  })
})
