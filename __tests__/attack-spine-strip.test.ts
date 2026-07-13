import { describe, expect, it } from "vitest"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"
import { buildSpineCards } from "@/components/attack-paths-v2/attack-spine-strip"

function baseReport(over: Partial<AttackPathReport> = {}): AttackPathReport {
  return {
    report_id: "apr-test",
    report_version: "1",
    compiler_version: "0.2.0",
    path_id: "p1",
    current_state: {
      status: "OPEN_TODAY",
      source_label: "legacy-source",
      target_label: "prod-data",
      summary: "x",
    },
    claims: [],
    gates: {},
    attacker_steps: [],
    damage_matrix: [],
    gap: null,
    remediation_diff: null,
    safety_decision: null,
    verification_target: null,
    missing_evidence: [],
    ...over,
  } as AttackPathReport
}

describe("buildSpineCards", () => {
  it("renders three nodes from current_state.spine with role as middle", () => {
    const { cards, hopBands, usedSpine } = buildSpineCards(
      baseReport({
        current_state: {
          status: "OPEN_TODAY",
          source_label: "legacy-source",
          target_label: "prod-data",
          summary: "x",
          spine: {
            origin_node: { id: "i-1", name: "payment-api", kind: "EC2Instance" },
            origin_category: "IMDS_CREDENTIAL_THEFT",
            origin_confidence: "config_complete",
            identity_hops: [
              {
                via: "instance_profile",
                from_node: { id: "i-1", name: "payment-api", kind: "EC2Instance" },
                to_node: { id: "r1", name: "app-role", kind: "IAMRole" },
                observed: false,
              },
              {
                via: "assume_role",
                from_node: { id: "r1", name: "app-role", kind: "IAMRole" },
                to_node: { id: "r2", name: "treasury-role", kind: "IAMRole" },
                observed: true,
              },
            ],
            effective_principal: { id: "r2", name: "treasury-role", kind: "IAMRole" },
            impact_target: { id: "b1", name: "prod-data", kind: "S3Bucket" },
            damage_verbs: ["delete"],
            identity_pivots: [],
            excess_service_reach: 3,
          },
        },
      }),
      null,
    )
    expect(usedSpine).toBe(true)
    expect(cards).toHaveLength(3)
    expect(cards[0].title).toBe("payment-api")
    expect(cards[1].title).toBe("treasury-role")
    expect(cards[2].title).toBe("prod-data")
    expect(hopBands).toHaveLength(2)
    expect(hopBands[0]).toMatch(/IDENTITY ACQUISITION/)
    expect(hopBands[1]).toMatch(/LATERAL PIVOT/)
  })

  it("collapses hop bands when identity_hops is empty", () => {
    const { cards, hopBands } = buildSpineCards(
      baseReport({
        current_state: {
          status: "OPEN_TODAY",
          source_label: "ingest",
          target_label: "prod-data",
          summary: "x",
          spine: {
            origin_node: { id: "fn", name: "ingest", kind: "LambdaFunction" },
            origin_confidence: "observed_complete",
            identity_hops: [],
            effective_principal: { id: "r", name: "ingest-role", kind: "IAMRole" },
            impact_target: { id: "b", name: "prod-data", kind: "S3Bucket" },
            damage_verbs: ["read"],
            identity_pivots: [],
          },
        },
      }),
      null,
    )
    expect(cards).toHaveLength(3)
    expect(hopBands).toHaveLength(0)
    expect(cards[0].originConfidence).toBe("observed_complete")
  })

  it("shows amber ORIGIN UNRESOLVED when origin_confidence is unresolved", () => {
    const { cards, pivotCount } = buildSpineCards(
      baseReport({
        current_state: {
          status: "OPEN_TODAY",
          source_label: "treasury-role",
          target_label: "prod-data",
          summary: "x",
          spine: {
            origin_node: { id: "r", name: "treasury-role", kind: "OrphanRole" },
            origin_confidence: "origin_unresolved",
            identity_hops: [],
            effective_principal: { id: "r", name: "treasury-role", kind: "OrphanRole" },
            impact_target: { id: "b", name: "prod-data", kind: "S3Bucket" },
            damage_verbs: ["delete"],
            identity_pivots: [{ id: "r3", name: "other-role", kind: "IAMRole" }],
          },
        },
      }),
      null,
    )
    expect(cards[0].title).toBe("Origin unresolved")
    expect(cards[0].badge).toBe("ORIGIN UNRESOLVED")
    expect(cards[0].originConfidence).toBe("origin_unresolved")
    expect(cards[1].title).toBe("treasury-role")
    expect(pivotCount).toBe(1)
  })

  it("falls back to source_label when spine is absent", () => {
    const { cards, usedSpine } = buildSpineCards(baseReport(), null)
    expect(usedSpine).toBe(false)
    expect(cards[0].title).toBe("legacy-source")
    expect(cards[2].title).toBe("prod-data")
  })
})
