/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest"

import { buildPairs, dedupeEvidenceRefs, dedupeSourceRefs } from "@/lib/dependency-pairs"
import type { Dependency } from "@/lib/resource-dossier-types"

const UID = "aws:ec2:eu-west-1:123456789012:instance/i-0abc"

function row(overrides: Partial<Dependency>): Dependency {
  return {
    direction: "DOWNSTREAM",
    basis_class: "STRUCTURAL",
    freshness: "UNKNOWN",
    relationship: "SECURED_BY",
    resource_canonical_resource_uid: UID,
    evidence_refs: [],
    source_generation_refs: [],
    ...overrides,
  }
}

const SG = {
  target_arn: "arn:aws:ec2:eu-west-1:123456789012:security-group/sg-1",
  target_type: "SecurityGroup",
}

describe("dependency pair projection (§5.5)", () => {
  it("puts both evidence axes on one pair row", () => {
    const { rows } = buildPairs([
      row({ relationship: "SECURED_BY", basis_class: "STRUCTURAL", ...SG }),
      row({ relationship: "ACTUAL_API_CALL", basis_class: "OBSERVED", ...SG }),
    ])
    const uses = rows.filter(item => item.perspective === "USES")
    expect(uses).toHaveLength(1)
    expect(uses[0].facts).toHaveLength(2)
  })

  it("collapses legacy spellings of one attachment and discloses them", () => {
    const { rows } = buildPairs([
      row({ relationship: "SECURED_BY", ...SG }),
      row({ relationship: "HAS_SECURITY_GROUP", ...SG }),
      row({ relationship: "USES_SECURITY_GROUP", ...SG }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].facts).toHaveLength(1)
    expect([...rows[0].facts[0].aliasesCollapsed].sort())
      .toEqual(["HAS_SECURITY_GROUP", "USES_SECURITY_GROUP"])
  })

  it("never hides a stale twin behind a current one when collapsing", () => {
    const { rows } = buildPairs([
      row({ relationship: "SECURED_BY", freshness: "CURRENT", ...SG }),
      row({ relationship: "HAS_SECURITY_GROUP", freshness: "STALE", ...SG }),
    ])
    expect(rows[0].facts[0].freshness).toBe("STALE")
  })

  it("does not let silence downgrade a positive currency signal", () => {
    const { rows } = buildPairs([
      row({ relationship: "SECURED_BY", freshness: "CURRENT", ...SG }),
      row({ relationship: "HAS_SECURITY_GROUP", freshness: "UNKNOWN", ...SG }),
    ])
    expect(rows[0].facts[0].freshness).toBe("CURRENT")
  })

  it("keeps every action and the longest window when collapsing", () => {
    const policy = { target_arn: "arn:aws:iam::123456789012:policy/p", target_type: "IAMPolicy" }
    const { rows } = buildPairs([
      row({ relationship: "HAS_POLICY", basis_class: "CONFIGURED", actions: ["s3:GetObject"], observation_days: 3, last_seen: "2026-08-01T00:00:00Z", ...policy }),
      row({ relationship: "ATTACHED_POLICY", basis_class: "CONFIGURED", actions: ["s3:PutObject"], observation_days: 90, last_seen: "2026-08-30T00:00:00Z", ...policy }),
    ])
    expect([...rows[0].facts[0].actions].sort()).toEqual(["s3:GetObject", "s3:PutObject"])
    expect(rows[0].facts[0].observationDays).toBe(90)
    expect(rows[0].facts[0].lastSeen).toBe("2026-08-30T00:00:00Z")
  })

  it("counts unresolved endpoints, not unresolved rows", () => {
    const endpoint = { target_display_name: "10.0.0.7", target_type: "IPAddress" }
    const { unresolvedIdentities } = buildPairs([
      row({ relationship: "ACTUAL_TRAFFIC", basis_class: "OBSERVED", ...endpoint }),
      row({ relationship: "ACTUAL_API_CALL", basis_class: "OBSERVED", ...endpoint }),
      row({ relationship: "CALLS", basis_class: "OBSERVED", ...endpoint }),
    ])
    expect(unresolvedIdentities).toHaveLength(1)
  })

  it("keeps two distinct unidentified endpoints apart", () => {
    const { rows } = buildPairs([
      row({ relationship: "ACTUAL_TRAFFIC", basis_class: "OBSERVED", target_display_name: "10.0.0.1", target_type: "IPAddress" }),
      row({ relationship: "ACTUAL_TRAFFIC", basis_class: "OBSERVED", target_display_name: "10.0.0.2", target_type: "IPAddress" }),
    ])
    expect(rows).toHaveLength(2)
  })

  it("keeps one counterparty on both sides as two rows", () => {
    const other = { target_arn: "arn:aws:iam::123456789012:role/other", target_type: "IAMRole" }
    const { rows } = buildPairs([
      row({ relationship: "TRUSTS", basis_class: "CONFIGURED", ...other }),
      row({ relationship: "USES_ROLE", basis_class: "CONFIGURED", ...other }),
    ])
    expect(rows.map(item => item.perspective).sort()).toEqual(["USED_BY", "USES"])
  })

  it("orders rows deterministically regardless of ledger order", () => {
    const make = (suffix: string) => row({
      relationship: "PROTECTS",
      target_arn: `arn:aws:ec2:eu-west-1:123456789012:instance/i-${suffix}`,
      target_type: "EC2Instance",
    })
    const first = buildPairs([make("c"), make("a"), make("b")]).rows.map(item => item.label)
    const second = buildPairs([make("b"), make("c"), make("a")]).rows.map(item => item.label)
    expect(first).toEqual(second)
  })

  it("withholds derived rows instead of listing them as attachments", () => {
    const { rows, derived } = buildPairs([
      row({ relationship: "CAN_REACH", target_arn: "arn:aws:s3:::orders" }),
      row({ relationship: "MAY_ACCESS", target_arn: "arn:aws:s3:::orders" }),
    ])
    expect(rows).toHaveLength(0)
    expect(derived).toHaveLength(2)
  })
})

describe("evidence pointer deduplication", () => {
  it("emits one entry for a reference returned twice", () => {
    // §3.3 measured 40 unique links returned twice by the resolver.
    const ref = { object_key: "k", version_id: "v", digest: "d0d0d0d0d0d0" }
    const gen = { plane: "configuration", generation: "c1", head_hash: "h", evidence_binding: null }
    const { rows } = buildPairs([
      row({ relationship: "SECURED_BY", evidence_refs: [ref], source_generation_refs: [gen], ...SG }),
      row({ relationship: "HAS_SECURITY_GROUP", evidence_refs: [ref], source_generation_refs: [gen], ...SG }),
    ])
    expect(rows[0].facts[0].evidenceRefs).toHaveLength(1)
    expect(rows[0].facts[0].sourceGenerationRefs).toHaveLength(1)
  })

  it("keeps the drawer's flattened refs unique across facts", () => {
    const gen = { plane: "configuration", generation: "c1", head_hash: "h", evidence_binding: null }
    const { rows } = buildPairs([
      row({ relationship: "SECURED_BY", basis_class: "STRUCTURAL", source_generation_refs: [gen], ...SG }),
      row({ relationship: "ACTUAL_API_CALL", basis_class: "OBSERVED", source_generation_refs: [gen], ...SG }),
    ])
    const flattened = dedupeSourceRefs(rows[0].facts.flatMap(fact => fact.sourceGenerationRefs))
    expect(flattened).toHaveLength(1)
    expect(dedupeEvidenceRefs([])).toHaveLength(0)
  })
})
