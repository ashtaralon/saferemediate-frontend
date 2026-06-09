import { describe, expect, it } from "vitest"
import { pathDamageSummary } from "@/components/attack-paths-v2/path-damage-summary"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"

describe("pathDamageSummary", () => {
  it("prefers matrix summary over raw dc.summary delete counts", () => {
    const path = {
      id: "p1",
      damage_capability: {
        state: "live",
        summary: "3 delete",
        direct_verbs: { read: 2, write: 1, delete: 3, admin: 0 },
      },
    } as IdentityAttackPath
    expect(pathDamageSummary(path)).toContain("DELETE")
    expect(pathDamageSummary(path)).not.toBe("3 delete")
  })

  it("maps network blocked summary to Blocked", () => {
    const path = {
      id: "p2",
      damage_capability: {
        state: "live",
        effective_damage: "network_blocked",
        summary: "network blocked: SG denies ingress",
        direct_verbs: { read: 5, write: 2, delete: 1, admin: 0 },
        gates: { network_reachable: false, data_plane_reachable: true },
      },
    } as IdentityAttackPath
    expect(pathDamageSummary(path)).toBe("Blocked")
  })
})
