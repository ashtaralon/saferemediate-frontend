/**
 * One authority for every Estate identity claim made outside the Identity &
 * access panel.
 *
 * The panel shows role facts only from a validated `estate-identity-access/v1`
 * block with a verified decision authority (`resolveIdentityAccess`). The
 * headline, the operator priorities and the identity role rows derive their
 * eligibility from that same resolution, with the same expected scope, and
 * never from the legacy `vpc_topology.iam_roles` counters. A missing, older or
 * partial identity contract yields an honest unavailable state: no legacy
 * count, no zero, no percentage.
 */
import { resolveIdentityAccess, type IdentityAccessExpectedScope } from "./identity-access-contract"
import type { IdentityAccessRole } from "./types"

export interface IdentityRoleObservation {
  roleId: string
  roleArn: string
  name: string
  workloadIds: string[]
  /** Configured actions in the role's decision detail (`action_details_total`). */
  configuredActions: number
  /** Configured actions with no observed use in the same decision generation. */
  notObservedActions: number
}

export type IdentityClaimAuthority =
  | { state: "ready"; observations: IdentityRoleObservation[] }
  | { state: "unavailable"; reason: string }

/** Material when at least half of a role's configured actions were not observed. */
export const MATERIAL_NOT_OBSERVED_RATIO = 0.5

/**
 * A role-level observation claim exists only when every configured action was
 * evaluated with complete coverage and no unknown usage; otherwise the role is
 * shown without a claim rather than with a partial count.
 */
function completeObservation(role: IdentityAccessRole): IdentityRoleObservation | null {
  const observed = role.observed_use
  const total = role.action_details_total
  if (role.configured_grants.state !== "ready" || observed.state !== "ready") return null
  if (typeof total !== "number" || total <= 0) return null
  const coverage = observed.coverage_counts
  if (!coverage || coverage.partial !== 0 || coverage.unknown !== 0) return null
  if (observed.unknown_action_count !== 0 || typeof observed.not_observed_action_count !== "number") return null
  return {
    roleId: role.role_id,
    roleArn: role.role_arn,
    name: role.name,
    workloadIds: role.workload_ids,
    configuredActions: total,
    notObservedActions: observed.not_observed_action_count,
  }
}

export function resolveIdentityClaimAuthority(
  responseContractVersion: unknown,
  identityAccess: unknown,
  expectedScope: IdentityAccessExpectedScope = {},
): IdentityClaimAuthority {
  const resolution = resolveIdentityAccess(responseContractVersion, identityAccess, expectedScope)
  if (resolution.state === "unavailable") return { state: "unavailable", reason: resolution.reason }
  if (resolution.state === "partial") {
    return { state: "unavailable", reason: "Identity evidence is partial; no role-level conclusion is available." }
  }
  return {
    state: "ready",
    observations: resolution.projection.roles
      .map(completeObservation)
      .filter((item): item is IdentityRoleObservation => item !== null),
  }
}

export function notObservedRatio(observation: IdentityRoleObservation): number {
  return observation.notObservedActions / observation.configuredActions
}

export function isMaterialObservation(observation: IdentityRoleObservation): boolean {
  return notObservedRatio(observation) >= MATERIAL_NOT_OBSERVED_RATIO
}

/** The observation for a legacy role row, matched by exact ARN, never by a name alone when an ARN exists. */
export function observationForRole(
  authority: IdentityClaimAuthority,
  role: { role_arn?: string | null; name: string },
): IdentityRoleObservation | null {
  if (authority.state !== "ready") return null
  if (role.role_arn) return authority.observations.find(item => item.roleArn === role.role_arn) ?? null
  return authority.observations.find(item => item.name === role.name) ?? null
}

export function formatObservationClaim(observation: IdentityRoleObservation): string {
  return `${observation.notObservedActions}/${observation.configuredActions} configured actions not observed`
}

export function identityUnavailableNote(authority: IdentityClaimAuthority): string | null {
  return authority.state === "unavailable"
    ? `Identity & access unavailable — ${authority.reason}`
    : null
}
