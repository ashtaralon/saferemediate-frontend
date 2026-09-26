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

  // These two cases are about a LIVE path, so they say so: a payload with no
  // effective_damage is unknown damage, never live (CF01 evidence contract;
  // see __tests__/cf01-attack-path-evidence-contract.test.tsx).
  it("does not mark Configured as Confirmed from path-hop alone", () => {
    const dc: DamageCapability = {
      state: "live",
      effective_damage: "live",
      direct_verbs: { read: 2, write: 1, delete: 0, admin: 0 },
    }
    const m = buildEffectiveDamageMatrix(dc, null, true)
    expect(m.read.confidence).toBe("Configured")
    expect(m.write.confidence).toBe("Configured")
  })

  it("upgrades S3 verbs to Observed when scope has prefix evidence", () => {
    const dc: DamageCapability = {
      state: "live",
      effective_damage: "live",
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

  it("a payload with no effective_damage is Unknown, not the grant ceiling", () => {
    const dc: DamageCapability = {
      state: "live",
      direct_verbs: { read: 2, write: 1, delete: 0, admin: 0 },
    }
    const m = buildEffectiveDamageMatrix(dc, null, false)
    expect(m.read).toMatchObject({ allowed: false, confidence: "Unknown" })
    expect(matrixToSummary(m)).toBe("Unknown")
  })
})
