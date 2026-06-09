import { describe, expect, it } from "vitest"
import { buildEffectiveDamageMatrix, matrixToSummary } from "@/components/attack-paths-v2/effective-damage-matrix"
import type { DamageCapability } from "@/components/identity-attack-paths/types"

describe("buildEffectiveDamageMatrix", () => {
  it("marks all verbs blocked when network is blocked", () => {
    const dc: DamageCapability = {
      state: "live",
      effective_damage: "network_blocked",
      gates: { network_reachable: false, network_reason: "SG blocks ingress", data_plane_reachable: true },
      direct_verbs: { read: 5, write: 2, delete: 1, admin: 0 },
    }
    const m = buildEffectiveDamageMatrix(dc, null, false)
    expect(m.read.confidence).toBe("Blocked")
    expect(m.write.allowed).toBe(false)
    expect(matrixToSummary(m)).toBe("Blocked")
  })

  it("upgrades S3 verbs to Observed when scope has prefix evidence", () => {
    const dc: DamageCapability = {
      state: "live",
      direct_verbs: { read: 2, write: 1, delete: 1, admin: 0 },
    }
    const m = buildEffectiveDamageMatrix(
      dc,
      {
        node_id: "x",
        node_type: "S3Bucket",
        principal_arn: "arn",
        scope_today: { actions: ["s3:GetObject"], headline: "Read" },
        scope_observed: { read_prefixes: ["app-logs"], headline: "Read to /app-logs/" },
        scope_post_lp: { kept_actions: [], removed_actions: [], headline: "" },
        damage_reduction_percent: 0,
        narrative: { today: "", observed: "", post_remediation: "", summary: "" },
        lp_confidence: { score: 0, level: "AUTO", vetos: [], evidence_gaps: [] },
        remediation_action: { endpoint: "", method: "POST", payload: {} },
      },
      true,
    )
    expect(m.read.confidence).toBe("Observed")
    expect(m.read.detail).toMatch(/app-logs/)
    expect(matrixToSummary(m)).toContain("READ")
  })
})
