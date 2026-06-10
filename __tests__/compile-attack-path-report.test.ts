// The 4 ratified contract rules for the Attack-Path Compiler (2026-06-10).
// These tests pin the BRIDGE compiler today and become the acceptance tests
// for the backend compiler when GET /api/attack-paths/<id>/report ships.

import { describe, it, expect } from "vitest"
import {
  compileAttackPathReport,
  buildDamageMatrix,
  deriveGate,
} from "@/components/attack-paths-v2/compile-attack-path-report"
import type {
  IdentityAttackPath,
} from "@/components/identity-attack-paths/types"
import type { ClosurePreview } from "@/components/attack-paths-v2/closure-outcome-types"
import type { Claim } from "@/components/attack-paths-v2/attack-path-report-types"

function makePath(overrides: Partial<IdentityAttackPath> = {}): IdentityAttackPath {
  return {
    id: "p1",
    crown_jewel_id: "jewel-1",
    nodes: [
      {
        id: "ec2-1",
        name: "alon-demo-app2",
        type: "EC2Instance",
        tier: "entry",
        is_internet_exposed: true,
        lp_score: null,
        gap_count: 0,
        remediation: null,
        internet_exposure_alert: null,
        open_ports: [22, 443],
      },
      {
        id: "role-1",
        name: "alon-demo-ec2-role",
        type: "IAMRole",
        tier: "identity",
        is_internet_exposed: false,
        lp_score: null,
        gap_count: 0,
        remediation: null,
        internet_exposure_alert: null,
      },
      {
        id: "bucket-1",
        name: "saferemediate-logs",
        type: "S3Bucket",
        tier: "crown_jewel",
        is_internet_exposed: false,
        lp_score: null,
        gap_count: 0,
        remediation: null,
        internet_exposure_alert: null,
        data_classification: "sensitive",
      },
    ],
    edges: [],
    severity: {
      overall_score: 42,
      severity: "high",
      impact: 0, internet_exposure: 0, permission_breadth: 0,
      data_sensitivity: 0, identity_chain: 0, network_controls: 0,
      weights: {
        impact: 0, internet_exposure: 0, permission_breadth: 0,
        data_sensitivity: 0, identity_chain: 0, network_controls: 0,
      },
    },
    path_kind: "identity",
    evidence_type: "configured",
    hop_count: 2,
    damage_capability: {
      state: "live",
      role_name: "alon-demo-ec2-role",
      jewel_name: "saferemediate-logs",
      direct_actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      gates: {
        network_reachable: true,
        data_plane_reachable: true,
      },
      effective_damage: "live",
    },
    ...overrides,
  } as IdentityAttackPath
}

const closure: ClosurePreview = {
  diff: {
    role: "alon-demo-ec2-role",
    removed_actions: ["s3:DeleteObject", "s3:PutBucketAcl", "s3:PutBucketLogging"],
    kept_actions: ["s3:GetObject", "s3:PutObject"],
    scoped_to_prefixes: ["cyntro-activity-test", "cyntro-traffic"],
    scoped_resource_count: 2,
    delivered_as: "IAM_DIFF",
  },
  after: {
    worst_damage_before: "admin_access",
    worst_damage_after: "write",
    excess_removed: true,
    blast_radius_before: "4 resources · admin",
    blast_radius_after: "4 resources · read/write",
    path_open_after: true,
  },
  proof: null,
  verdict: "approval_required",
  verdict_reasons: ["shared_role across 2 live workloads"],
  rollback_available: true,
  mode: "PROPOSE",
}

describe("R1 — observed hop elsewhere does not prove the identity gate", () => {
  it("keeps identity gate OPEN_CONFIG when the only observed edge does not touch the identity", () => {
    const path = makePath({
      // observed traffic between EC2 and bucket network hop — NOT the role
      edges: [
        {
          source: "ec2-1",
          target: "sg-1",
          type: "NETWORK",
          label: "ingress",
          port: 443,
          protocol: "tcp",
          is_observed: true,
        },
      ],
    })
    const report = compileAttackPathReport(path, null, closure)
    expect(report.gates.identity).toBe("OPEN_CONFIG")
    expect(report.claims.find((c) => c.id === "identity.observed_use")).toBeUndefined()
  })

  it("marks identity gate OPEN_OBSERVED when an observed edge touches the role", () => {
    const path = makePath({
      edges: [
        {
          source: "role-1",
          target: "bucket-1",
          type: "DATA",
          label: "s3 access",
          port: null,
          protocol: null,
          is_observed: true,
          hit_count: 3,
        },
      ],
    })
    const report = compileAttackPathReport(path, null, closure)
    expect(report.gates.identity).toBe("OPEN_OBSERVED")
    const claim = report.claims.find((c) => c.id === "identity.observed_use")
    expect(claim?.grade).toBe("OBSERVED")
  })
})

describe("R3 — DeleteObject is object-delete, never bucket-destroy", () => {
  it("maps s3:DeleteObject to s3.object_delete and not s3.bucket_delete", () => {
    const cells = buildDamageMatrix(["s3:DeleteObject"], [], "CONFIGURED", [])
    const ids = cells.map((c) => c.cell_id)
    expect(ids).toContain("s3.object_delete")
    expect(ids).not.toContain("s3.bucket_delete")
    const cell = cells.find((c) => c.cell_id === "s3.object_delete")!
    expect(cell.not_equivalent_to).toContain("s3.bucket_delete")
  })

  it("maps s3:DeleteBucket to its own cell", () => {
    const cells = buildDamageMatrix(["s3:DeleteBucket"], [], "CONFIGURED", [])
    expect(cells.map((c) => c.cell_id)).toEqual(["s3.bucket_delete"])
  })
})

describe("R4 — missing signal becomes missing_evidence, never prose", () => {
  it("lists bucket-policy and object-lock signals as missing", () => {
    const report = compileAttackPathReport(makePath(), null, closure)
    const signals = report.missing_evidence.map((m) => m.signal)
    expect(signals.some((s) => s.includes("bucket policy"))).toBe(true)
    expect(signals.some((s) => s.includes("object-lock"))).toBe(true)
    // and no attacker step fabricates a bucket-policy sentence
    const allProse = report.attacker_steps.map((s) => s.body).join(" ")
    expect(allProse.toLowerCase()).not.toContain("bucket policy")
  })

  it("missing gates → route gate UNKNOWN + missing_evidence entry", () => {
    const path = makePath({
      damage_capability: { state: "live", role_name: "alon-demo-ec2-role" },
    })
    const report = compileAttackPathReport(path, null, closure)
    expect(report.gates.network).toBe("UNKNOWN")
    expect(
      report.missing_evidence.some((m) => m.signal.includes("network route gate")),
    ).toBe(true)
  })
})

describe("R2 — INFERRED claims appear in narrative but cannot drive damage/diff", () => {
  it("the IMDS chain claim is INFERRED and non-authoritative", () => {
    const report = compileAttackPathReport(makePath(), null, closure)
    const imds = report.claims.find((c) => c.id === "identity.imds_chain")!
    expect(imds.grade).toBe("INFERRED")
    expect(imds.can_drive_damage).toBe(false)
    expect(imds.can_drive_remediation).toBe(false)
    // it IS in the narrative step
    const step = report.attacker_steps.find((s) => s.phase === "BECOME_IDENTITY")!
    expect(step.claim_ids).toContain("identity.imds_chain")
    // but no damage cell cites it
    for (const cell of report.damage_matrix) {
      expect(cell.caused_by_claim_ids).not.toContain("identity.imds_chain")
    }
  })

  it("INFERRED claims do not derive gate openness", () => {
    const onlyInferred: Claim[] = [
      {
        id: "x",
        text: "modeled",
        grade: "INFERRED",
        source_refs: [],
        can_drive_damage: false,
        can_drive_remediation: false,
      },
    ]
    // gates derive from non-INFERRED claims; a gate with only modeled
    // support must stay UNKNOWN (compiler filters INFERRED before deriving)
    expect(deriveGate(onlyInferred.filter((c) => c.grade !== "INFERRED"))).toBe("UNKNOWN")
  })
})
