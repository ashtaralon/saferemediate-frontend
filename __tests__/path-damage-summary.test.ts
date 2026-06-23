import { describe, expect, it } from "vitest"
import {
  pathDamageSummary,
  pathSourceLabel,
  pathIdentityLabel,
} from "@/components/attack-paths-v2/path-damage-summary"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"

const PIVOT = "arn:aws:iam::745783559495:role/cyntro-demo-pivot-role"
const TREASURY = "arn:aws:iam::745783559495:role/cyntro-demo-treasury-role"
const PRODDATA = "arn:aws:s3:::cyntro-demo-prod-data-745783559495"
const ANALYTICS = "arn:aws:s3:::cyntro-demo-analytics-745783559495"

// BE-10: assume chains carry two IAMRole nodes — the source/identity labels
// must follow the assume edge direction (entry = assume source, identity = the
// role reaching the jewel), not nodes[0], which duplicated/inverted the spine.
describe("BE-10 assume-chain spine labels", () => {
  it("lateral-movement (treasury reaches jewel): entry=pivot, identity=treasury", () => {
    const path = {
      crown_jewel_id: PRODDATA,
      nodes: [
        { id: TREASURY, type: "IAMRole", name: "cyntro-demo-treasury-role" },
        { id: PIVOT, type: "IAMRole", name: "cyntro-demo-pivot-role", assume_escalation: true },
        { id: "bkt", canonical_id: PRODDATA, type: "S3Bucket", name: "cyntro-demo-prod-data" },
      ],
      edges: [
        { source: TREASURY, target: PRODDATA, type: "ACCESSES_RESOURCE", is_observed: false },
        { source: PIVOT, target: TREASURY, type: "ASSUMES_ROLE_ACTUAL", is_observed: true },
      ],
    } as unknown as IdentityAttackPath
    expect(pathSourceLabel(path)).toBe("cyntro-demo-pivot-role")
    expect(pathIdentityLabel(path)).toBe("cyntro-demo-treasury-role")
  })

  it("pivot's-own-reach (pivot reaches jewel): entry=identity=pivot (dedups)", () => {
    const path = {
      crown_jewel_id: ANALYTICS,
      nodes: [
        { id: PIVOT, type: "IAMRole", name: "cyntro-demo-pivot-role" },
        { id: TREASURY, type: "IAMRole", name: "cyntro-demo-treasury-role", assume_escalation: true },
        { id: "bkt2", canonical_id: ANALYTICS, type: "S3Bucket", name: "cyntro-demo-analytics" },
      ],
      edges: [
        { source: PIVOT, target: ANALYTICS, type: "ACCESSES_RESOURCE", is_observed: false },
        { source: PIVOT, target: TREASURY, type: "ASSUMES_ROLE_ACTUAL", is_observed: true },
      ],
    } as unknown as IdentityAttackPath
    expect(pathSourceLabel(path)).toBe("cyntro-demo-pivot-role")
    expect(pathIdentityLabel(path)).toBe("cyntro-demo-pivot-role")
  })

  it("non-assume compute path is unchanged (entry=compute, identity=role)", () => {
    const path = {
      crown_jewel_id: PRODDATA,
      nodes: [
        { id: "i-1", type: "EC2Instance", name: "web-1" },
        { id: "r-1", type: "IAMRole", name: "app-role" },
        { id: "bkt", canonical_id: PRODDATA, type: "S3Bucket", name: "prod-data" },
      ],
      edges: [
        { source: "r-1", target: PRODDATA, type: "ACCESSES_RESOURCE", is_observed: true },
      ],
    } as unknown as IdentityAttackPath
    expect(pathSourceLabel(path)).toBe("web-1")
    expect(pathIdentityLabel(path)).toBe("app-role")
  })
})

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
