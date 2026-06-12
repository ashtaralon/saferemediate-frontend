import { describe, expect, it } from "vitest"
import {
  selectRecommendedFix,
  expectedResultLabel,
  allowedCellCount,
  type DamageMatrix,
} from "@/components/attack-paths-v2/damage-matrix-fix"
import { boundFixToTarget } from "@/components/attack-paths-v2/remediation-target"

const BUCKET = "arn:aws:s3:::saferemediate-logs"

function cell(over: Partial<DamageMatrix["cells"][number]>): DamageMatrix["cells"][number] {
  return {
    cell: "read_object",
    label: "Read objects",
    verb: "read",
    allowed: false,
    scope: "object",
    prefixes: [],
    confidence: "configured_absent",
    severity: 2,
    cause: null,
    fix: null,
    expected_result: null,
    ...over,
  }
}

describe("selectRecommendedFix", () => {
  it("returns null when matrix is absent", () => {
    expect(selectRecommendedFix(null)).toBeNull()
    expect(selectRecommendedFix(undefined)).toBeNull()
  })

  it("prefers the backend-provided recommended_fix", () => {
    const matrix: DamageMatrix = {
      service: "s3",
      resource: BUCKET,
      principal: "alon-demo-ec2-role",
      cells: [],
      recommended_fix: {
        cell: "delete_object",
        label: "Delete objects",
        fix: {
          type: "iam_action_patch",
          operation: "remove_action",
          role: "alon-demo-ec2-role",
          action: "s3:DeleteObject",
          resource_scope: `${BUCKET}/*`,
        },
        cause: { principal: "alon-demo-ec2-role", action: "s3:DeleteObject", resource: `${BUCKET}/*` },
        expected_result: { removes: "delete_object", retains_read: true },
        action_label: "Remove s3:DeleteObject from alon-demo-ec2-role",
      },
    }
    expect(selectRecommendedFix(matrix)?.fix.action).toBe("s3:DeleteObject")
  })

  it("derives the most dangerous allowed cell when no recommended_fix is provided", () => {
    const matrix: DamageMatrix = {
      service: "s3",
      resource: BUCKET,
      principal: "r",
      recommended_fix: null,
      cells: [
        cell({ cell: "read_object", allowed: true, severity: 2 }),
        cell({
          cell: "delete_object", label: "Delete objects", verb: "delete", allowed: true, severity: 6,
          fix: { type: "iam_action_patch", operation: "remove_action", role: "r", action: "s3:DeleteObject", resource_scope: `${BUCKET}/*` },
          cause: { principal: "r", action: "s3:DeleteObject", resource: `${BUCKET}/*` },
          expected_result: { removes: "delete_object", retains_read: true },
        }),
        cell({
          cell: "put_bucket_policy", label: "Change bucket policy", verb: "admin", allowed: true, severity: 10,
          fix: { type: "iam_action_patch", operation: "remove_action", role: "r", action: "s3:PutBucketPolicy", resource_scope: BUCKET },
          cause: { principal: "r", action: "s3:PutBucketPolicy", resource: BUCKET },
          expected_result: { removes: "put_bucket_policy", retains_read: true },
        }),
      ],
    }
    const rec = selectRecommendedFix(matrix)
    expect(rec?.cell).toBe("put_bucket_policy")
    expect(rec?.action_label).toBe("Remove s3:PutBucketPolicy from r")
  })

  it("ignores pure read-only roles (nothing dangerous to remove)", () => {
    const matrix: DamageMatrix = {
      service: "s3", resource: BUCKET, principal: "r", recommended_fix: null,
      cells: [cell({ cell: "read_object", allowed: true }), cell({ cell: "list_bucket", allowed: true, severity: 1 })],
    }
    expect(selectRecommendedFix(matrix)).toBeNull()
  })
})

describe("expectedResultLabel", () => {
  it("notes retained read access", () => {
    const matrix: DamageMatrix = {
      service: "s3", resource: BUCKET, principal: "r",
      cells: [], recommended_fix: {
        cell: "delete_object", label: "Delete objects",
        fix: { type: "iam_action_patch", operation: "remove_action", role: "r", action: "s3:DeleteObject", resource_scope: `${BUCKET}/*` },
        cause: { principal: "r", action: "s3:DeleteObject", resource: `${BUCKET}/*` },
        expected_result: { removes: "delete_object", retains_read: true },
        action_label: "Remove s3:DeleteObject from r",
      },
    }
    expect(expectedResultLabel(selectRecommendedFix(matrix))).toBe("Delete objects removed; read access retained")
  })
})

describe("allowedCellCount", () => {
  it("counts allowed cells", () => {
    const matrix: DamageMatrix = {
      service: "s3", resource: BUCKET, principal: "r", recommended_fix: null,
      cells: [cell({ allowed: true }), cell({ allowed: true }), cell({ allowed: false })],
    }
    expect(allowedCellCount(matrix)).toBe(2)
  })
})

describe("boundFixToTarget", () => {
  it("maps a bound fix to an iam_action_patch modal target", () => {
    const t = boundFixToTarget({
      type: "iam_action_patch", operation: "remove_action",
      role: "alon-demo-ec2-role", action: "s3:DeleteObject", resource_scope: `${BUCKET}/*`,
    })
    expect(t).toEqual({
      kind: "iam_action_patch",
      roleName: "alon-demo-ec2-role",
      action: "s3:DeleteObject",
      resourceScope: `${BUCKET}/*`,
      operation: "remove_action",
    })
  })

  it("returns a none target for a null fix", () => {
    expect(boundFixToTarget(null).kind).toBe("none")
  })
})
