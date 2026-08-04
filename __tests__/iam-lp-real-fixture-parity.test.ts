import { describe, expect, it } from "vitest"
import asymmetryFixture from "./fixtures/iam-lp/alon-demo-asymmetry-sanitized.json"
import protectedFixture from "./fixtures/iam-lp/alon-demo-protected-live-sanitized.json"
import inferredFixture from "./fixtures/iam-lp/inferred-usage-live-sanitized.json"
import noPolicyFixture from "./fixtures/iam-lp/no-policy-live-sanitized.json"
import truncatedFixture from "./fixtures/iam-lp/truncated-unused-sanitized.json"
import { buildDecisionSplit } from "@/components/iam-lp/resolvers/decisionSplit"
import {
  buildExecutionReadiness,
  hardCoverageBlockCode,
} from "@/components/iam-lp/resolvers/executionReadiness"
import { normalizeIamGapAnalysis } from "@/components/iam-lp/resolvers/normalizeGap"
import type { IamGapAnalysisWire } from "@/components/iam-lp/types"

type LegacyPermission = { permission?: string }
type LegacyGroup = {
  auto_remediable?: boolean
  block_reason_code?: string | null
  permissions?: LegacyPermission[]
}
type LegacyFixture = {
  used_permissions?: Array<string | LegacyPermission>
  confidence_groups?: { groups?: LegacyGroup[] }
}

/** Exact safe-set selection behavior currently embedded in the legacy modal. */
function legacyModalAutoSet(fixture: LegacyFixture): string[] {
  const observedServices = new Set<string>()
  for (const permission of fixture.used_permissions ?? []) {
    const value =
      typeof permission === "string" ? permission : permission.permission
    if (value?.includes(":")) {
      observedServices.add(value.split(":")[0].toLowerCase())
    }
  }

  const selected = new Set<string>()
  for (const group of fixture.confidence_groups?.groups ?? []) {
    if (group.auto_remediable === true) {
      for (const permission of group.permissions ?? []) {
        if (permission.permission) selected.add(permission.permission)
      }
    } else if (group.block_reason_code === "telemetry_asymmetry") {
      for (const permission of group.permissions ?? []) {
        const value = permission.permission
        if (!value?.includes(":")) continue
        if (observedServices.has(value.split(":")[0].toLowerCase())) {
          selected.add(value)
        }
      }
    }
  }
  return [...selected].sort()
}

function normalizedFixture(value: unknown) {
  return normalizeIamGapAnalysis(value as IamGapAnalysisWire)
}

describe("iam-lp parity on sanitized production-shaped fixtures", () => {
  it("matches the historical alon-demo asymmetry safe subset", () => {
    const gap = normalizedFixture(asymmetryFixture)
    const split = buildDecisionSplit(gap)

    expect(split.autoApplyPermissions).toEqual(
      legacyModalAutoSet(asymmetryFixture),
    )
    expect(split.autoApplyCount).toBe(12)
    expect(split.needsApprovalPermissions).toEqual(["iam:ListRoles"])
    expect(split.conservationError).toBe(false)
  })

  it("matches current alon-demo behavior while preserving protected rows", () => {
    const gap = normalizedFixture(protectedFixture)
    const split = buildDecisionSplit(gap)

    expect(split.autoApplyPermissions).toEqual(
      legacyModalAutoSet(protectedFixture),
    )
    expect(split.autoApplyCount).toBe(0)
    expect(split.needsApprovalCount).toBe(21)
    expect(split.protectedCount).toBe(25)
    expect(split.conservationError).toBe(false)
  })

  it("keeps inferred-usage groups approval-only", () => {
    const gap = normalizedFixture(inferredFixture)
    const split = buildDecisionSplit(gap)

    expect(split.autoApplyPermissions).toEqual(
      legacyModalAutoSet(inferredFixture),
    )
    expect(split.needsApprovalCount).toBe(6)
    expect(split.conservationError).toBe(false)
  })

  it("canonicalizes today's human no-policy response into a hard block", () => {
    const gap = normalizedFixture(noPolicyFixture)
    const split = buildDecisionSplit(gap)
    const readiness = buildExecutionReadiness(gap, split, {})

    expect(gap.reason_code).toBe("no_policy_attached")
    expect(hardCoverageBlockCode(gap)).toBe("no_policy_attached")
    expect(readiness.canSimulate).toBe(false)
    expect(readiness.canApplySafe).toBe(false)
  })

  it("holds truncated permission identities instead of padding a safe set", () => {
    const gap = normalizedFixture(truncatedFixture)
    const split = buildDecisionSplit(gap)

    expect(split.autoApplyCount).toBe(2)
    expect(split.missingPermissionIdentityCount).toBe(3)
    expect(split.unclassifiedCount).toBe(3)
    expect(split.conservationError).toBe(true)
    expect(buildExecutionReadiness(gap, split, {}).canSimulate).toBe(false)
  })
})
