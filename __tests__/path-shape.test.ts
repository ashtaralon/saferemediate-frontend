// Path-shape classifier + shape-aware narrative branching.
// Spec: cyntro_per-path-card_binding-spec.md §1 / §4. Fixtures mirror the live
// alon-prod shapes (2026-06-14): Shape A saferemediate-logs (compute-excess),
// Shape B pivot → treasury → prod-data (observed assume), Shape C treasury →
// prod-data (zero-excess orphan reach).

import { describe, it, expect } from "vitest"
import {
  classifyPathShape,
  damageVerbPhrase,
  friendlyRoleName,
  pathDamageTypes,
} from "@/components/attack-paths-v2/path-shape"
import { compileAttackPathReport } from "@/components/attack-paths-v2/compile-attack-path-report"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { ClosurePreview } from "@/components/attack-paths-v2/closure-outcome-types"

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Shape A — compute-excess: EC2 → role → saferemediate-logs, excess present. */
function shapeAPath(): IdentityAttackPath {
  return {
    id: "A1",
    crown_jewel_id: "bucket-logs",
    nodes: [
      { id: "ec2-1", name: "cyntro-web-server", type: "EC2Instance", tier: "entry" },
      {
        id: "role-1",
        name: "alon-demo-ec2-role",
        canonical_id: "arn:aws:iam::745783559495:role/alon-demo-ec2-role",
        type: "IAMRole",
        tier: "identity",
      },
      { id: "bucket-logs", name: "saferemediate-logs", type: "S3Bucket", tier: "crown_jewel" },
    ],
    edges: [{ source: "role-1", target: "bucket-logs", type: "ACCESS", is_observed: true }],
    damage_types: ["delete", "read", "write"],
  } as unknown as IdentityAttackPath
}

/** Shape B — assume-chain: pivot-role →[ASSUMES_ROLE_ACTUAL, observed]→
 *  treasury-role → prod-data. The assumed role reaches the jewel (on-spine). */
function shapeBPath(): IdentityAttackPath {
  return {
    id: "B1",
    crown_jewel_id: "bucket-prod-data",
    nodes: [
      {
        id: "pivot",
        name: "AROA00000PIVOT",
        canonical_id: "arn:aws:iam::745783559495:role/cyntro-demo-pivot-role",
        type: "IAMRole",
        tier: "identity",
      },
      {
        id: "treasury",
        name: "AROA0000TREASURY",
        canonical_id: "arn:aws:iam::745783559495:role/cyntro-demo-treasury-role",
        type: "IAMRole",
        tier: "identity",
      },
      { id: "bucket-prod-data", name: "prod-data", type: "S3Bucket", tier: "crown_jewel" },
    ],
    edges: [
      { source: "pivot", target: "treasury", type: "ASSUMES_ROLE_ACTUAL", is_observed: true, hit_count: 5 },
      { source: "treasury", target: "bucket-prod-data", type: "ACCESS", is_observed: true },
    ],
    damage_types: ["read", "write"],
  } as unknown as IdentityAttackPath
}

/** Shape C — zero-excess reach: orphan treasury-role → prod-data, no assume,
 *  no unused permission to strip. */
function shapeCPath(): IdentityAttackPath {
  return {
    id: "C1",
    crown_jewel_id: "bucket-prod-data",
    nodes: [
      {
        id: "treasury",
        name: "AROA0000TREASURY",
        canonical_id: "arn:aws:iam::745783559495:role/cyntro-demo-treasury-role",
        type: "IAMRole",
        tier: "identity",
      },
      { id: "bucket-prod-data", name: "prod-data", type: "S3Bucket", tier: "crown_jewel" },
    ],
    edges: [{ source: "treasury", target: "bucket-prod-data", type: "ACCESS", is_observed: true }],
    damage_types: ["read"],
  } as unknown as IdentityAttackPath
}

const afterBlock = {
  worst_damage_before: "admin_access",
  worst_damage_after: "write",
  excess_removed: true,
  blast_radius_before: "4 resources · admin",
  blast_radius_after: "4 resources · read/write",
  path_open_after: true,
}

const closureWithExcess: ClosurePreview = {
  diff: {
    role: "alon-demo-ec2-role",
    removed_actions: ["s3:DeleteObject", "s3:PutBucketAcl"],
    kept_actions: ["s3:GetObject", "s3:PutObject"],
    scoped_to_prefixes: ["cyntro-activity-test"],
    scoped_resource_count: 1,
    delivered_as: "IAM_DIFF",
  },
  after: afterBlock,
  verdict: "approval_required",
  verdict_reasons: [],
} as unknown as ClosurePreview

const closureZeroExcess: ClosurePreview = {
  diff: {
    role: "cyntro-demo-treasury-role",
    removed_actions: [],
    kept_actions: ["s3:GetObject"],
    scoped_to_prefixes: [],
    scoped_resource_count: 0,
    delivered_as: "IAM_DIFF",
  },
  after: { ...afterBlock, worst_damage_before: "read", worst_damage_after: "read", excess_removed: false },
  verdict: "auto_eligible",
  verdict_reasons: [],
} as unknown as ClosurePreview

// ── Classifier ───────────────────────────────────────────────────────────────

describe("classifyPathShape — §1.1 independent flags", () => {
  it("Shape A: compute foothold + excess present", () => {
    const s = classifyPathShape(shapeAPath(), ["s3:DeleteObject"])
    expect(s.kind).toBe("A")
    expect(s.hasCompute).toBe(true)
    expect(s.hasAssume).toBe(false)
    expect(s.excess).toBe("present")
    expect(s.assume).toBeNull()
  })

  it("Shape B: assume hop wins even when excess is unknown", () => {
    const s = classifyPathShape(shapeBPath())
    expect(s.kind).toBe("B")
    expect(s.hasAssume).toBe(true)
    expect(s.hasCompute).toBe(false)
    expect(s.assume).toMatchObject({
      entryRole: "cyntro-demo-pivot-role", // friendly name from ARN, not AROA…
      assumedRole: "cyntro-demo-treasury-role",
      observed: true,
      hitCount: 5,
      reachesJewel: true,
    })
  })

  it("Shape B beats Shape C: an assume path with empty excess is still B", () => {
    const s = classifyPathShape(shapeBPath(), [])
    expect(s.kind).toBe("B")
  })

  it("Shape C: zero-excess orphan reach, no assume", () => {
    const s = classifyPathShape(shapeCPath(), [])
    expect(s.kind).toBe("C")
    expect(s.hasCompute).toBe(false)
    expect(s.hasAssume).toBe(false)
    expect(s.excess).toBe("empty")
  })

  it("excess is UNKNOWN (never assumed empty) when no signal is given", () => {
    expect(classifyPathShape(shapeCPath()).excess).toBe("unknown")
    // …and with no assume + unknown excess we do NOT promote to C
    expect(classifyPathShape(shapeCPath()).kind).toBe("A")
  })
})

describe("friendlyRoleName / damage verbs", () => {
  it("derives the friendly name from role ARN, never the AROA principal id", () => {
    const node = {
      name: "AROA0000TREASURY",
      canonical_id: "arn:aws:iam::745783559495:role/cyntro-demo-treasury-role",
    } as never
    expect(friendlyRoleName(node)).toBe("cyntro-demo-treasury-role")
  })

  it("builds the verb phrase ONLY from damage_types (never hardcodes delete)", () => {
    expect(damageVerbPhrase(["read", "write"])).toBe("change / write and read")
    expect(damageVerbPhrase(["read"])).toBe("read")
    expect(damageVerbPhrase(["delete", "read", "write"])).toBe(
      "delete / wipe, change / write and read",
    )
    expect(damageVerbPhrase([])).toBe("access")
  })

  it("reads damage_types off the path", () => {
    expect(pathDamageTypes(shapeBPath())).toEqual(["read", "write"])
  })
})

// ── Narrative branching in the compiler ───────────────────────────────────────

describe("compileAttackPathReport — shape-aware narrative (§4)", () => {
  it("Shape B emits an observed assume-hop claim and an assume-chain headline", () => {
    const report = compileAttackPathReport(shapeBPath(), null, closureWithExcess)
    expect(report.current_state.shape).toBe("B")
    // identity gate is proven by the observed assume hop, not IMDS
    const assume = report.claims.find((c) => c.id === "identity.assume_hop")
    expect(assume?.grade).toBe("OBSERVED")
    expect(report.claims.find((c) => c.id === "identity.imds_chain")).toBeUndefined()
    expect(report.gates.identity).toBe("OPEN_OBSERVED")
    // headline tells the assume story and does NOT claim a workload compromise
    const h = report.current_state.headline ?? ""
    expect(h).toContain("cyntro-demo-treasury-role")
    expect(h).toContain("sts:AssumeRole")
    expect(h.toLowerCase()).not.toContain("instance role")
    // the pivot step is titled as a pivot, not "Become the role"
    const idStep = report.attacker_steps.find((s) => s.phase === "BECOME_IDENTITY")
    expect(idStep?.title).toBe("Pivot via sts:AssumeRole")
  })

  it("Shape C frames zero-excess as standing reach, not an empty diff", () => {
    const report = compileAttackPathReport(shapeCPath(), null, closureZeroExcess)
    expect(report.current_state.shape).toBe("C")
    const h = report.current_state.headline ?? ""
    expect(h).toContain("no unused permission to remove")
    expect(h).toContain("standing reach")
    // no IMDS claim (no compute), no fabricated gap step
    expect(report.claims.find((c) => c.id === "identity.imds_chain")).toBeUndefined()
    expect(report.attacker_steps.find((s) => s.phase === "EXPLOIT_GAP")).toBeUndefined()
  })

  it("Shape A keeps the IMDS chain and leaves headline to the renderer", () => {
    const report = compileAttackPathReport(shapeAPath(), null, closureWithExcess)
    expect(report.current_state.shape).toBe("A")
    expect(report.claims.find((c) => c.id === "identity.imds_chain")?.grade).toBe("INFERRED")
    expect(report.current_state.headline).toBeUndefined()
  })
})
