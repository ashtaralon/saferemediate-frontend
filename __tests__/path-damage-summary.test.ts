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

  // Accuracy-audit F3 (2026-06-11): AWSServiceRoleForConfig showed
  // WRITE·READ from grant-ceiling verb counts while the materialized
  // :AttackPath node says damage_types=[read]. The graph wins.
  it("F3: materialized damage_types=[read] overrides overstated verb counts", () => {
    const path = {
      id: "p3",
      materialized: true,
      damage_types: ["read"],
      damage_capability: {
        state: "live",
        effective_damage: "live",
        materialized_damage_types: ["read"],
        // Stale verb counts (e.g. cached payload before backend alignment)
        direct_verbs: { read: 12, write: 4, delete: 0, admin: 0 },
      },
    } as IdentityAttackPath
    expect(pathDamageSummary(path)).toBe("READ")
  })

  // Accuracy-audit F2 (2026-06-11): full-takeover path must render its
  // real damage taxonomy, not a heuristic "Blocked" verdict, once the
  // backend reconciled effective_damage from the open materialized gates.
  it("F2: materialized admin/delete/read/write renders all four verbs", () => {
    const path = {
      id: "p4",
      materialized: true,
      damage_types: ["admin", "delete", "read", "write"],
      damage_capability: {
        state: "live",
        effective_damage: "live",
        materialized_damage_types: ["admin", "delete", "read", "write"],
        direct_verbs: { read: 1, write: 1, delete: 1, admin: 1 },
      },
    } as IdentityAttackPath
    expect(pathDamageSummary(path)).toBe("DELETE · ADMIN · WRITE · READ")
  })
})
