import { describe, expect, test } from "vitest"

import {
  buildHeadlineNarrative,
  buildRankedEntries,
} from "@/components/topology-v0-2/headline-narrative"
import type { IamRoleRollup, TopologyNode, TopologyRiskResponse } from "@/components/topology-v0-2/types"

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
            contributors: [{
              signal: "network_exposure",
              weight: 0.5,
              value: 1,
              evidence: { exposure_state: "LATENT_EXPOSURE", observed_inbound_from_public_365d: false },
              freshness: { source: "posture", as_of: null, is_fresh: true },
            }],
          },
        }),
      ],
      vpc_topology: { region: "eu-west-1", account_id: "1", vpc_id: "vpc-1", azs: [], subnets: [], edges: { igws: [], nat_gws: [], vpces: [] }, unknown_subnet_count: 0, iam_roles: [] },
    }
    const h = buildHeadlineNarrative(data)
    expect(h.title).toContain("frontend-1")
    expect(h.spotlightNodeId).toBe("a")
  })

  test("falls back to IAM role when no high-tier workloads", () => {
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
    const h = buildHeadlineNarrative(data)
    expect(h.title).toContain("demo-ec2-s3-role")
    expect(h.spotlightRoleName).toBe("demo-ec2-s3-role")
  })
})

describe("buildRankedEntries", () => {
  test("interleaves workloads and IAM roles up to eight entries", () => {
    const nodes = [
      node({
        id: "w1",
        name: "app-2",
        score: {
          value: 70,
          tier: "HIGH",
          rank: 1,
          confidence: { value: 1, tier: "FULL", reasons: [] },
          contributors: [],
        },
      }),
    ]
    const roles = [role({ name: "lambda-role", gap_percentage: 100 })]
    const entries = buildRankedEntries(nodes, roles)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.some(e => e.kind === "workload")).toBe(true)
    expect(entries.some(e => e.kind === "iam_role")).toBe(true)
  })
})
