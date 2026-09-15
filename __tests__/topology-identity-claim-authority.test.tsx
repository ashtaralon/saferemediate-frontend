/// <reference types="vitest/globals" />
/**
 * The Estate header and the Identity & access panel must agree.
 *
 * A user-visible acceptance failure (2026-09-16) had the panel reporting
 * "Identity & access unavailable — no unused conclusion is available" while
 * the headline above it asserted "15/25 unused permissions (60% gap)" from
 * the legacy vpc_topology.iam_roles counters. These tests pin both sides to
 * one resolution of one contract.
 */
import React from "react"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { buildEstateCommandModel } from "@/components/topology-v0-2/estate-operations-model"
import { buildHeadlineNarrative } from "@/components/topology-v0-2/headline-narrative"
import { HeadlineStrip } from "@/components/topology-v0-2/headline-strip"
import { IdentityAccessSurface } from "@/components/topology-v0-2/identity-access-panel"
import { resolveIdentityClaimAuthority } from "@/components/topology-v0-2/identity-claim-authority"
import type { SystemKpis, TopologyNode, TopologyRiskResponse } from "@/components/topology-v0-2/types"
import fixture from "./fixtures/topology-risk/estate-map-v11-contract.json"

afterEach(() => cleanup())

const KPIS: SystemKpis = {
  workloads_total: 2,
  workloads_by_type: {},
  flagged_count: 0,
  stale_workloads_count: 0,
  posture_coverage: { scored: 2, total: 2, by_type: {} },
  posture_freshness: { most_recent_run: null, age_days: 1, threshold_days: 7, is_fresh: true, auto_resolves_when: "" },
}
const LEGACY_ROLE = {
  name: "cyntro-tb-prod-loadgen-role",
  role_arn: "arn:aws:iam::416651950952:role/cyntro-tb-prod-loadgen-role",
  allowed_actions: 25,
  used_actions: 10,
  unused_actions: 15,
  gap_percentage: 60,
  correlation_state: "correlated" as const,
  last_remediated_at: null,
  workload_ids: [],
  attachment_modes: ["direct"],
}

function response(overrides: Record<string, unknown> = {}): TopologyRiskResponse {
  const base = structuredClone(fixture) as unknown as Record<string, unknown>
  const topology = (base.vpc_topology ?? {}) as Record<string, unknown>
  return {
    ...base,
    // The reported screenshot: legacy rollups present, identity contract not.
    vpc_topology: { ...topology, iam_roles: [LEGACY_ROLE] },
    ...overrides,
  } as unknown as TopologyRiskResponse
}

function scopeOf(data: TopologyRiskResponse) {
  const topology = data.vpc_topology
  return {
    account_id: topology?.account_id ?? data.account_id,
    region: topology?.region ?? data.region,
    system_name: data.system,
    vpc_id: topology?.vpc_id ?? data.vpc_id,
  }
}

function renderBoth(data: TopologyRiskResponse) {
  const identity = resolveIdentityClaimAuthority(data.response_contract_version, data.identity_access, scopeOf(data))
  const narrative = buildHeadlineNarrative(data, identity)
  render(
    <>
      <HeadlineStrip systemName={data.system} vpcId={data.vpc_id} narrative={narrative} kpis={KPIS} />
      <IdentityAccessSurface
        responseContractVersion={data.response_contract_version}
        identityAccess={data.identity_access}
        snapshotStale={false}
        nodes={(data.nodes ?? []) as TopologyNode[]}
        onSelect={() => {}}
        expectedScope={scopeOf(data)}
      />
    </>,
  )
  return { identity, narrative }
}

describe("header and panel share one identity authority", () => {
  it("makes no unused-permission claim while the panel reports the contract unavailable", () => {
    const { narrative } = renderBoth(response({ response_contract_version: "topology-risk/v10" }))

    expect(screen.getByTestId("topology-identity-access-surface")).toHaveAttribute("data-identity-status", "unavailable")
    expect(screen.getByTestId("topology-identity-access-unavailable").textContent).toContain(
      "No zero-role, unused, allow, or deny conclusion is available.",
    )
    expect(narrative.title).not.toContain("cyntro-tb-prod-loadgen-role")
    expect(narrative.title).not.toMatch(/unused permissions|% gap|15\/25/)
    expect(screen.getByTestId("topology-headline-identity-unavailable").textContent).toBe(
      "Identity & access unavailable — Topology snapshot does not carry the v11 identity contract.",
    )
  })

  it("keeps the legacy rollup out of the system view's gaps, priorities and role rows", () => {
    const data = response({ response_contract_version: "topology-risk/v10" })
    const identity = resolveIdentityClaimAuthority(data.response_contract_version, data.identity_access, scopeOf(data))
    const model = buildEstateCommandModel(data, identity)

    expect(model.posture.riskyRoles).toBeNull()
    expect(model.priorities.map(item => item.id)).not.toContain(`role:${LEGACY_ROLE.name}`)
    expect(model.roles.map(role => role.name)).toEqual([LEGACY_ROLE.name])  // attachment rows stay
  })

  it("states the authority's own counts when the panel is ready, in the panel's vocabulary", () => {
    const data = response()
    const role = (data.identity_access as unknown as { roles: Array<Record<string, unknown>> }).roles[0]
    Object.assign(role, {
      action_details_total: 4,
      action_details_returned: 1,
      action_details_truncated: true,
      configured_grants: { state: "ready", exact_action_count: 4 },
      observed_use: {
        state: "ready",
        successful_action_count: 1,
        denied_only_action_count: 0,
        not_observed_action_count: 3,
        unknown_action_count: 0,
        coverage_counts: { complete: 4, partial: 0, unknown: 0 },
        last_success_at: "2026-09-14T06:00:00Z",
      },
    })
    const { identity, narrative } = renderBoth(data)

    expect(screen.getByTestId("topology-identity-access-surface")).toHaveAttribute("data-identity-status", "ready")
    expect(identity.state === "ready" && identity.observations).toEqual([
      expect.objectContaining({ configuredActions: 4, notObservedActions: 3, name: String(role.name) }),
    ])
    expect(narrative.title).toContain(`${role.name} has 3/4 configured actions not observed`)
    expect(narrative.title).not.toMatch(/unused permissions|% gap/)
    expect(narrative.identityNote).toBeNull()
    expect(screen.queryByTestId("topology-headline-identity-unavailable")).toBeNull()
  })

  it("claims nothing for a role whose coverage is incomplete, without saying unavailable", () => {
    const data = response()
    const role = (data.identity_access as unknown as { roles: Array<Record<string, unknown>> }).roles[0]
    Object.assign(role, {
      action_details_total: 4,
      action_details_returned: 1,
      action_details_truncated: true,
      configured_grants: { state: "ready", exact_action_count: 4 },
      observed_use: {
        state: "ready",
        successful_action_count: 1,
        denied_only_action_count: 0,
        not_observed_action_count: 3,
        unknown_action_count: 0,
        coverage_counts: { complete: 2, partial: 2, unknown: 0 },
        last_success_at: "2026-09-14T06:00:00Z",
      },
    })
    const identity = resolveIdentityClaimAuthority(data.response_contract_version, data.identity_access, scopeOf(data))
    expect(identity).toEqual({ state: "ready", observations: [] })
    const narrative = buildHeadlineNarrative(data, identity)
    expect(narrative.title).not.toMatch(/not observed|unused/)
    expect(narrative.identityNote).toBeNull()
  })

  it("treats a partial projection as no conclusion, with an honest note", () => {
    const data = response()
    const projection = data.identity_access as unknown as Record<string, unknown>
    projection.status = "partial"
    projection.gaps = [{ code: "DECISION_EVIDENCE_INCOMPLETE", detail: "decision generation is staging" }]
    projection.decision_authority = null
    const identity = resolveIdentityClaimAuthority(data.response_contract_version, data.identity_access, scopeOf(data))
    expect(identity).toEqual({
      state: "unavailable",
      reason: "Identity evidence is partial; no role-level conclusion is available.",
    })
    expect(buildHeadlineNarrative(data, identity).identityNote).toBe(
      "Identity & access unavailable — Identity evidence is partial; no role-level conclusion is available.",
    )
  })

  it("refuses a projection pinned to another Estate scope, exactly as the panel does", () => {
    const data = response()
    const identity = resolveIdentityClaimAuthority(data.response_contract_version, data.identity_access, {
      ...scopeOf(data),
      account_id: "000000000000",
    })
    expect(identity).toEqual({
      state: "unavailable",
      reason: "Identity & access belongs to a different Estate scope.",
    })
  })
})
