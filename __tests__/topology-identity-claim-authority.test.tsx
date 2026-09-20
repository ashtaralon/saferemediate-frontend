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
import { EstateSystemView } from "@/components/topology-v0-2/estate-system-view"
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

  it("describes the evaluated population, not the configured grants, and agrees with the panel", () => {
    // The producer counts usage over EVERY decision record and counts
    // configured grants separately (estate_identity_access._ready_role), so a
    // valid role can have one configured grant among four evaluated actions.
    const data = response()
    const role = (data.identity_access as unknown as { roles: Array<Record<string, unknown>> }).roles[0]
    Object.assign(role, {
      action_details_total: 4,
      action_details_returned: 1,
      action_details_truncated: true,
      configured_grants: { state: "ready", exact_action_count: 1 },
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
    const identity = resolveIdentityClaimAuthority(data.response_contract_version, data.identity_access, scopeOf(data))
    const model = buildEstateCommandModel(data, identity)
    const { narrative } = renderBoth(data)

    expect(identity.state === "ready" && identity.observations[0]).toMatchObject({
      evaluatedActions: 4, notObservedActions: 3, configuredGrants: 1,
    })
    expect(narrative.title).toContain("3/4 evaluated actions not observed")
    expect(narrative.title).not.toContain("configured actions")
    // The panel's own configured-grants figure stays 1; nothing claims 4 configured.
    expect(screen.getByTestId("topology-identity-configured-grants")).toHaveTextContent("1")
    expect(model.priorities.find(item => item.id === `role:${role.name}`)?.title)
      .toBe(`${role.name} has 3/4 evaluated actions not observed`)
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
      expect.objectContaining({ evaluatedActions: 4, notObservedActions: 3, name: String(role.name) }),
    ])
    expect(narrative.title).toContain(`${role.name} has 3/4 evaluated actions not observed`)
    expect(narrative.title).not.toMatch(/unused permissions|% gap/)
    expect(narrative.identityNote).toBeNull()
    expect(screen.queryByTestId("topology-headline-identity-unavailable")).toBeNull()
  })

  it("never turns an unassessed or partly assessed population into an exact zero", () => {
    const roles = (data: TopologyRiskResponse) =>
      (data.identity_access as unknown as { roles: Array<Record<string, unknown>> }).roles

    const usage = (notObserved: number, coverage: { complete: number; partial: number; unknown: number }) => ({
      state: "ready",
      successful_action_count: 4 - notObserved,
      denied_only_action_count: 0,
      not_observed_action_count: notObserved,
      unknown_action_count: 0,
      coverage_counts: coverage,
      last_success_at: "2026-09-14T06:00:00Z",
    })
    const roleShape = (name: string, notObserved: number, complete: boolean) => ({
      action_details_total: 4,
      action_details_returned: 1,
      action_details_truncated: true,
      configured_grants: { state: "ready", exact_action_count: 2 },
      observed_use: usage(notObserved, complete
        ? { complete: 4, partial: 0, unknown: 0 }
        : { complete: 2, partial: 2, unknown: 0 }),
      role_id: `AROA${name}`,
      role_arn: `arn:aws:iam::416651950952:role/${name}`,
      name,
    })

    // (a) every returned role incompletely covered: nothing was assessed.
    const allIncomplete = response()
    Object.assign(roles(allIncomplete)[0], roleShape("only-role", 3, false))
    const noneModel = buildEstateCommandModel(allIncomplete)
    expect([noneModel.posture.riskyRoles, noneModel.posture.riskyRolesAtLeast]).toEqual([null, 0])
    render(<EstateSystemView data={allIncomplete} selectedNodeId={null} onSelectNode={() => {}} onShowNetwork={() => {}} />)
    expect(screen.getByTestId("estate-command-material-gaps").textContent)
      .toBe("material gaps unavailable · 0/1 roles assessed")
    cleanup()

    // (b) one complete material role and one incomplete role: a lower bound.
    const mixed = response()
    const first = roles(mixed)[0]
    Object.assign(first, roleShape("assessed-role", 3, true))
    roles(mixed).push({ ...structuredClone(first), ...roleShape("unassessed-role", 3, false) })
    const mixedProjection = mixed.identity_access as unknown as Record<string, unknown>
    mixedProjection.roles_total = 2
    mixedProjection.roles_returned = 2
    const mixedModel = buildEstateCommandModel(mixed)
    expect([mixedModel.posture.riskyRoles, mixedModel.posture.riskyRolesAtLeast]).toEqual([null, 1])
    render(<EstateSystemView data={mixed} selectedNodeId={null} onSelectNode={() => {}} onShowNetwork={() => {}} />)
    expect(screen.getByTestId("estate-command-material-gaps").textContent)
      .toBe("at least 1 material gaps · 1/2 roles assessed")
    cleanup()

    // (c) a truncated role list: the omitted roles are unassessed.
    const truncated = response()
    Object.assign(roles(truncated)[0], roleShape("returned-role", 3, true))
    const truncatedProjection = truncated.identity_access as unknown as Record<string, unknown>
    truncatedProjection.roles_total = 7
    truncatedProjection.roles_returned = 1
    truncatedProjection.roles_truncated = true
    const truncatedModel = buildEstateCommandModel(truncated)
    expect([truncatedModel.posture.riskyRoles, truncatedModel.posture.riskyRolesAtLeast]).toEqual([null, 1])
    render(<EstateSystemView data={truncated} selectedNodeId={null} onSelectNode={() => {}} onShowNetwork={() => {}} />)
    expect(screen.getByTestId("estate-command-material-gaps").textContent)
      .toBe("at least 1 material gaps · 1/7 roles assessed")
    cleanup()

    // (d) the whole population assessed: an exact count, including zero.
    const complete = response()
    Object.assign(roles(complete)[0], roleShape("quiet-role", 0, true))
    const completeModel = buildEstateCommandModel(complete)
    expect([completeModel.posture.riskyRoles, completeModel.posture.riskyRolesAtLeast]).toEqual([0, null])
    render(<EstateSystemView data={complete} selectedNodeId={null} onSelectNode={() => {}} onShowNetwork={() => {}} />)
    expect(screen.getByTestId("estate-command-material-gaps").textContent).toBe("0 material gaps")
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
    expect(identity).toEqual({
      state: "ready",
      observations: [],
      population: {
        rolesTotal: 1, rolesReturned: 1, rolesAssessed: 0,
        rolesOmittedUnresolved: 0, rolesTruncated: false, complete: false,
      },
    })
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

/**
 * Independent Chrome QA of the positive v11 fixture (2026-09-16) found the
 * header reading "attached to no exact workload attachment returned" while the
 * same role's panel showed ATTACHED WORKLOADS (1) · i-web. The headline was
 * resolving the authoritative attachment ids through the RETURNED topology
 * nodes and reading an unresolved display name as an absent attachment.
 */
describe("headline attachment claims follow the authoritative id list", () => {
  /** A role the claim authority accepts: ready, fully covered, material gap. */
  function readyRole(data: TopologyRiskResponse, workloadIds: string[]) {
    const role = (data.identity_access as unknown as { roles: Array<Record<string, unknown>> }).roles[0]
    Object.assign(role, {
      name: "fixture-payments-api-role",
      workload_ids: workloadIds,
      action_details_total: 4,
      action_details_returned: 1,
      action_details_truncated: true,
      configured_grants: { state: "ready", exact_action_count: 1 },
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
    return data
  }

  function titleFor(data: TopologyRiskResponse) {
    const identity = resolveIdentityClaimAuthority(
      data.response_contract_version,
      data.identity_access,
      scopeOf(data),
    )
    return buildHeadlineNarrative(data, identity).title
  }

  it("keeps an exact attachment whose workload node was not returned in scope", () => {
    // The reported case: the projection binds i-web exactly, the scoped node
    // set carries only the two RDS workloads, so no display name resolves.
    const data = readyRole(response(), ["i-web"])
    expect((data.nodes ?? []).some(n => n.id === "i-web")).toBe(false)

    const title = titleFor(data)
    expect(title).toContain("attached to i-web")
    expect(title).toContain("workload details unresolved in this scope")
    expect(title).not.toContain("no exact workload attachment returned")
  })

  it("claims no attachment only when the authoritative list is actually empty", () => {
    const title = titleFor(readyRole(response(), []))

    expect(title).toContain("no exact workload attachment returned")
    expect(title).not.toContain("attached to")
    expect(title).not.toContain("unresolved")
  })

  it("still prefers the workload display name when the node is returned", () => {
    const data = readyRole(response(), [])
    const node = (data.nodes ?? [])[0]
    readyRole(data, [node.id])

    const title = titleFor(data)
    expect(title).toContain(`attached to ${node.name}`)
    expect(title).not.toContain(node.id)
    expect(title).not.toContain("unresolved")
  })

  it("counts attachments beyond the two it names instead of implying there are none", () => {
    const data = readyRole(response(), ["i-web", "i-api", "i-batch", "i-cron"])

    const title = titleFor(data)
    expect(title).toContain("attached to i-web, i-api +2 more")
    expect(title).not.toContain("i-batch")
  })
})
