import { describe, expect, it } from "vitest"
import { compileThreeLayerChips } from "@/components/attack-paths-v2/three-layer-strip"
import { focusJewelIdFromMove } from "@/components/attack-paths-v2/lateral-moves-summary-card"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { LateralMove } from "@/components/attack-paths-v2/use-lateral-moves"

function minimalPath(overrides: Partial<IdentityAttackPath> = {}): IdentityAttackPath {
  return {
    id: "path-1",
    hop_count: 2,
    nodes: [],
    severity: { overall_score: 50, severity: "MEDIUM" } as IdentityAttackPath["severity"],
    ...overrides,
  } as IdentityAttackPath
}

function minimalReport(overrides: Partial<AttackPathReport> = {}): AttackPathReport {
  return {
    path_id: "path-1",
    compiler_version: "test",
    missing_evidence: [],
    damage_matrix: [],
    gates: {
      identity: "OPEN_OBSERVED",
      network: "OPEN_CONFIG",
      data_plane: "OPEN_OBSERVED",
    },
    current_state: {
      status: "OPEN_TODAY",
      summary: "test",
      source_label: "web",
      target_label: "data",
      severity: "HIGH",
      shape: "A",
    },
    ...overrides,
  } as AttackPathReport
}

describe("compileThreeLayerChips", () => {
  it("emits P/N/D simultaneously with observed ≠ config", () => {
    const chips = compileThreeLayerChips(minimalReport(), minimalPath())
    expect(chips.map((c) => c.key)).toEqual(["P", "N", "D"])
    expect(chips[0].answer).toBe("observed")
    expect(chips[1].answer).toBe("config-open")
    expect(chips[2].answer).toBe("observed")
  })

  it("marks Network N/A — standing access on IAM-only shape B", () => {
    const chips = compileThreeLayerChips(
      minimalReport({
        gates: {
          identity: "OPEN_CONFIG",
          network: "UNKNOWN",
          data_plane: "OPEN_CONFIG",
        },
        current_state: {
          status: "OPEN_TODAY",
          summary: "standing access",
          source_label: "role",
          target_label: "bucket",
          severity: "MEDIUM",
          shape: "B",
        },
      }),
      minimalPath(),
    )
    expect(chips[1].answer).toBe("N/A — standing access")
    expect(chips[1].tone).toBe("na")
  })
})

describe("focusJewelIdFromMove", () => {
  it("returns ARN target for additional_jewel and null otherwise", () => {
    const jewelMove: LateralMove = {
      type: "additional_jewel",
      target: "arn:aws:s3:::billing-db",
      evidence: "OBSERVED",
      risk: "REAL_DAMAGE",
    }
    expect(focusJewelIdFromMove(jewelMove)).toBe("arn:aws:s3:::billing-db")
    expect(
      focusJewelIdFromMove({
        type: "assume_role",
        target: "other-role",
        evidence: "OBSERVED",
        risk: "PIVOT",
      }),
    ).toBeNull()
  })
})
