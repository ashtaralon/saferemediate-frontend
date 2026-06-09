import { describe, expect, it } from "vitest"
import { buildGranularDamageLines } from "@/components/attack-paths-v2/granular-damage-lines"
import { buildEffectiveDamageMatrix } from "@/components/attack-paths-v2/effective-damage-matrix"
import type { DamageCapability } from "@/components/identity-attack-paths/types"

describe("buildGranularDamageLines", () => {
  it("emits plain-English IAM lines from direct_actions", () => {
    const dc: DamageCapability = {
      state: "live",
      jewel_service: "s3",
      direct_actions: ["s3:GetObject", "s3:DeleteObject"],
      direct_verbs: { read: 1, write: 0, delete: 1, admin: 0 },
    }
    const matrix = buildEffectiveDamageMatrix(dc, null, false)
    const lines = buildGranularDamageLines(dc, null, matrix)
    const labels = lines.map((l) => l.label)
    expect(labels.some((l) => /read|get/i.test(l))).toBe(true)
    expect(labels.some((l) => /delete/i.test(l))).toBe(true)
  })

  it("adds observed prefix lines from damage-scope", () => {
    const dc: DamageCapability = {
      state: "live",
      jewel_service: "s3",
      direct_verbs: { read: 1, write: 0, delete: 0, admin: 0 },
    }
    const scope = {
      node_id: "x",
      node_type: "S3Bucket",
      principal_arn: "arn",
      scope_today: { actions: ["s3:GetObject"], headline: "" },
      scope_observed: { read_prefixes: ["logs"], headline: "" },
      scope_post_lp: { kept_actions: [], removed_actions: [], headline: "" },
      damage_reduction_percent: 0,
      narrative: { today: "", observed: "", post_remediation: "", summary: "" },
      lp_confidence: { score: 0, level: "HIGH", vetos: [], evidence_gaps: [] },
      remediation_action: { endpoint: "", method: "POST", payload: {} },
    }
    const matrix = buildEffectiveDamageMatrix(dc, scope, false)
    const lines = buildGranularDamageLines(dc, scope, matrix)
    const observed = lines.find((l) => l.confidence === "Observed")
    expect(observed?.detail).toMatch(/logs/)
  })
})
