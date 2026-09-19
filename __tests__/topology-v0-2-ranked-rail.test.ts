import { describe, expect, test } from "vitest"

import { buildHeadlineNarrative } from "@/components/topology-v0-2/headline-narrative"
import type {
  IdentityClaimAuthority,
  IdentityRoleObservation,
} from "@/components/topology-v0-2/identity-claim-authority"
import type { IamRoleRollup, TopologyNode, TopologyRiskResponse } from "@/components/topology-v0-2/types"

/** What the Identity & access panel resolves for a pre-v11 snapshot. */
const IDENTITY_UNAVAILABLE: IdentityClaimAuthority = {
  state: "unavailable",
  reason: "Topology snapshot does not carry the v11 identity contract.",
}

/** A fully assessed population: every in-scope role returned and complete. */
function readyAuthority(observations: IdentityRoleObservation[]): IdentityClaimAuthority {
  return {
    state: "ready",
    observations,
    population: {
      rolesTotal: observations.length,
      rolesReturned: observations.length,
      rolesAssessed: observations.length,
      rolesOmittedUnresolved: 0,
      rolesTruncated: false,
      complete: true,
    },
  }
}

function node(partial: Partial<TopologyNode> & { id: string; name: string }): TopologyNode {
  return {
    type: "EC2Instance",
    subnet_id: "subnet-a",
    score: null,
    stale: null,
    is_jewel: false,
    ...partial,
  }
}

function role(partial: Partial<IamRoleRollup> & { name: string }): IamRoleRollup {
  return {
    role_arn: "arn:aws:iam::123:role/x",
    allowed_actions: 10,
    used_actions: 2,
    unused_actions: 8,
    gap_percentage: 80,
    correlation_state: "correlated",
    last_remediated_at: null,
    workload_ids: [],
    attachment_modes: ["direct"],
    ...partial,
  }
}

describe("buildHeadlineNarrative", () => {
  test("names the highest-ranked workload when present", () => {
    const data: TopologyRiskResponse = {
      system: "alon-prod",
      scored_at: "2026-06-01T00:00:00Z",
      scoring_window_days: 365,
      vpc_id: "vpc-1",
      system_kpis: {
        workloads_total: 2,
        workloads_by_type: { EC2Instance: 2 },
        flagged_count: 1,
        stale_workloads_count: 0,
        posture_coverage: { scored: 2, total: 2, by_type: {} },
        posture_freshness: {
          most_recent_run: null,
          age_days: 3,
          threshold_days: 7,
          is_fresh: true,
          auto_resolves_when: "",
        },
      },
      nodes: [
        node({
          id: "a",
          name: "frontend-1",
          score: {
            value: 90,
            tier: "WORST",
            rank: 1,
            confidence: { value: 1, tier: "FULL", reasons: [] },
            contributors: [
              {
                signal: "network_exposure",
                weight: 0.5,
                value: 1,
                evidence: {
                  exposure_state: "LATENT_EXPOSURE",
                  observed_inbound_from_public_365d: false,
                },
                freshness: { source: "posture", as_of: null, is_fresh: true },
              },
              {
                signal: "internet_dependency",
                weight: 0.25,
                value: 0.95,
                evidence: { distinct_destinations: 566 },
                freshness: { source: "posture", as_of: null, is_fresh: true },
              },
            ],
          },
        }),
      ],
      vpc_topology: { region: "eu-west-1", account_id: "1", vpc_id: "vpc-1", azs: [], subnets: [], edges: { igws: [], nat_gws: [], vpces: [] }, unknown_subnet_count: 0, iam_roles: [] },
    }
    const h = buildHeadlineNarrative(data, IDENTITY_UNAVAILABLE)
    expect(h.title).toContain("frontend-1")
    expect(h.title).toContain("LATENT_EXPOSURE")
    expect(h.title).toContain("inbound path open, unused")
    expect(h.title).toContain("566")
    expect(h.title).not.toMatch(/while egressing/)
    expect(h.spotlightNodeId).toBe("a")
  })

  test("never states an identity claim from legacy rollups when the panel has no authority", () => {
    const data: TopologyRiskResponse = {
      system: "alon-prod",
      scored_at: "2026-06-01T00:00:00Z",
      scoring_window_days: 365,
      vpc_id: "vpc-1",
      system_kpis: null,
      nodes: [],
      vpc_topology: {
        region: "eu-west-1",
        account_id: "1",
        vpc_id: "vpc-1",
        azs: [],
        subnets: [],
        edges: { igws: [], nat_gws: [], vpces: [] },
        unknown_subnet_count: 0,
        iam_roles: [role({ name: "demo-ec2-s3-role", gap_percentage: 100, unused_actions: 7, allowed_actions: 7 })],
      },
    }
    const h = buildHeadlineNarrative(data, IDENTITY_UNAVAILABLE)
    expect(h.title).not.toContain("demo-ec2-s3-role")
    expect(h.title).not.toMatch(/unused|% gap/)
    expect(h.title).toBe("alon-prod · 0 workloads in scope")
    expect(h.spotlightRoleName).toBeNull()
    expect(h.identityNote).toBe(
      "Identity & access unavailable — Topology snapshot does not carry the v11 identity contract.",
    )
  })

  test("states the identity claim the authority carries, in the panel's own vocabulary", () => {
    const data: TopologyRiskResponse = {
      system: "alon-prod",
      scored_at: "2026-06-01T00:00:00Z",
      scoring_window_days: 365,
      vpc_id: "vpc-1",
      system_kpis: null,
      nodes: [node({ id: "w1", name: "payments-api" })],
      vpc_topology: {
        region: "eu-west-1", account_id: "1", vpc_id: "vpc-1", azs: [], subnets: [],
        edges: { igws: [], nat_gws: [], vpces: [] }, unknown_subnet_count: 0,
        iam_roles: [role({ name: "demo-ec2-s3-role", gap_percentage: 100, unused_actions: 7, allowed_actions: 7 })],
      },
    }
    const ready = readyAuthority([{
      roleId: "AROAEXAMPLE1",
      roleArn: "arn:aws:iam::1:role/payments-api-role",
      name: "payments-api-role",
      workloadIds: ["w1"],
      // One configured grant among four evaluated actions: the claim must
      // describe the evaluated population, which is what the counters cover.
      evaluatedActions: 4,
      notObservedActions: 3,
      configuredGrants: 1,
    }])
    const h = buildHeadlineNarrative(data, ready)
    expect(h.title).toBe(
      "payments-api-role has 3/4 evaluated actions not observed (complete coverage) — attached to payments-api",
    )
    expect(h.title).not.toContain("configured actions")
    expect(h.title).not.toMatch(/unused|% gap/)
    expect(h.spotlightRoleName).toBe("payments-api-role")
    expect(h.identityNote).toBeNull()
  })

  test("an immaterial or absent observation leaves the neutral headline", () => {
    const data: TopologyRiskResponse = {
      system: "alon-prod",
      scored_at: "2026-06-01T00:00:00Z",
      scoring_window_days: 365,
      vpc_id: "vpc-1",
      system_kpis: null,
      nodes: [],
      vpc_topology: {
        region: "eu-west-1", account_id: "1", vpc_id: "vpc-1", azs: [], subnets: [],
        edges: { igws: [], nat_gws: [], vpces: [] }, unknown_subnet_count: 0,
        iam_roles: [role({ name: "demo-ec2-s3-role" })],
      },
    }
    const barely = readyAuthority([{
      roleId: "AROAEXAMPLE1", roleArn: "arn:aws:iam::1:role/quiet", name: "quiet-role",
      workloadIds: [], evaluatedActions: 10, notObservedActions: 1, configuredGrants: 10,
    }])
    expect(buildHeadlineNarrative(data, barely).title).toBe("alon-prod · 0 workloads in scope")
    expect(buildHeadlineNarrative(data, readyAuthority([])).identityNote).toBeNull()
  })
})
