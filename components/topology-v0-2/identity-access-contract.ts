import type {
  IdentityAccessProjection,
  IdentityAccessGap,
  IdentityAccessRole,
  IdentityActionDetail,
  IdentityAuthorizationLayer,
  IdentityAuthorizationLayerVerdict,
  IdentityEffectiveAuthorization,
} from "./types"

const CONTRACT_VERSION = "estate-identity-access/v1" as const
const REQUIRED_LAYERS: readonly IdentityAuthorizationLayer[] = [
  "IDENTITY_POLICY",
  "RESOURCE_POLICY",
  "PERMISSIONS_BOUNDARY",
  "SCP_RCP",
  "SESSION_POLICY",
  "SERVICE_SPECIFIC",
]
const LAYER_VERDICTS = new Set<IdentityAuthorizationLayerVerdict>([
  "GRANT",
  "DENY",
  "NO_MATCH",
  "UNKNOWN",
  "NOT_APPLICABLE",
])
const USAGE_STATES = new Set(["SUCCESS_OBSERVED", "DENIED_ONLY", "NOT_OBSERVED", "UNKNOWN"])
const COVERAGE_STATES = new Set(["COMPLETE", "PARTIAL", "UNKNOWN"])
const CORROBORATION_STATES = new Set(["NOT_EVALUATED", "CONSISTENT", "CONFLICT"])
const ELIGIBILITY_STATES = new Set(["ELIGIBLE", "HELD", "PROTECTED", "CANNOT_ASSESS", "REEVALUATION_REQUIRED"])
const PURITY_STATES = new Set(["PURE_PRODUCTION", "SYNTHETIC", "MIXED", "UNKNOWN"])
const BASE_EFFECTIVE_GAPS = [
  "ACTION_AND_RESOURCE_SCOPE_REQUIRED",
  "NO_PROJECTED_EFFECTIVE_DECISION",
] as const

export interface IdentityAccessExpectedScope {
  account_id?: string | null
  region?: string | null
  system_name?: string | null
  vpc_id?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string" && item.length > 0)
}

function isGapList(value: unknown): boolean {
  return Array.isArray(value) && value.every(item =>
    isRecord(item) && isString(item.code) && isString(item.detail),
  )
}

function isAuthority(value: unknown): boolean {
  return isRecord(value)
    && isString(value.projection_scope)
    && isNonnegativeInteger(value.generation)
    && isString(value.staging_run_id)
    && isString(value.source_vector_hash)
    && isString(value.projected_through)
    && (value.projection_receipt_hash === null || isString(value.projection_receipt_hash))
}

function isInventoryAuthority(value: unknown): boolean {
  if (!isAuthority(value)) return false
  const authority = value as Record<string, unknown>
  return authority.projection_scope === "inventory.resource_state.v1"
    && isString(authority.projection_receipt_hash)
    && authority.workload_binding_completeness === "COMPLETE"
    && isNonnegativeInteger(authority.workload_binding_count)
    && isString(authority.workload_binding_set_hash)
    && Array.isArray(authority.workload_binding_supported_types)
    && authority.workload_binding_supported_types.length === 2
    && authority.workload_binding_supported_types[0] === "ec2:instance"
    && authority.workload_binding_supported_types[1] === "lambda:function"
}

function isVerifiedDecisionAuthority(value: unknown): boolean {
  if (!isAuthority(value)) return false
  const authority = value as Record<string, unknown>
  return authority.projection_scope === "iam.role_action_decision.v1"
    && isString(authority.projection_receipt_hash)
    && isString(authority.record_contract_version)
    && isNonnegativeInteger(authority.expected_count)
    && isString(authority.expected_set_hash)
    && isNonnegativeInteger(authority.expected_gap_count)
    && isString(authority.expected_gap_set_hash)
}

function isDecisionAuthorityReference(value: unknown): boolean {
  return isAuthority(value)
    && (value as Record<string, unknown>).projection_scope === "iam.role_action_decision.v1"
}

function isEffectiveAuthorization(value: unknown): value is IdentityEffectiveAuthorization {
  if (!isRecord(value)) return false
  const reasonCodes = value.reason_codes
  if (
    value.availability !== "unavailable"
    || value.decision !== null
    || value.granularity !== "action_resource_context"
    || !isStringList(reasonCodes)
  ) return false
  return BASE_EFFECTIVE_GAPS.every(code => reasonCodes.includes(code))
}

function isActionDetail(value: unknown): value is IdentityActionDetail {
  if (!isRecord(value)) return false
  if (
    !isString(value.action)
    || typeof value.configured_grant !== "boolean"
    || !USAGE_STATES.has(String(value.usage_state))
    || !COVERAGE_STATES.has(String(value.coverage_state))
    || !CORROBORATION_STATES.has(String(value.corroboration_state))
    || !ELIGIBILITY_STATES.has(String(value.eligibility_state))
    || !PURITY_STATES.has(String(value.purity))
    || typeof value.window_requirement_satisfied !== "boolean"
    || !isNullableString(value.hold_reason)
    || !(value.denial_layer === null || REQUIRED_LAYERS.includes(value.denial_layer as IdentityAuthorizationLayer))
    || !isNullableString(value.denied_hold_expires_at)
    || !isNullableString(value.reevaluation_basis)
    || !isNonnegativeInteger(value.policy_configuration_generation)
    || !isNonnegativeInteger(value.evidence_generation)
    || !isNonnegativeInteger(value.authorization_control_generation)
    || !isNullableString(value.observation_window_start)
    || !isNullableString(value.observation_window_end)
    || !isNullableString(value.first_success_at)
    || !isNullableString(value.last_success_at)
    || !isString(value.decision_as_of)
    || !isEffectiveAuthorization(value.effective_authorization)
    || !isRecord(value.authorization_layers)
  ) return false

  const authorizationLayers = value.authorization_layers as Record<string, unknown>
  const layerKeys = Object.keys(authorizationLayers).sort()
  return layerKeys.length === REQUIRED_LAYERS.length
    && REQUIRED_LAYERS.every(layer =>
      LAYER_VERDICTS.has(authorizationLayers[layer] as IdentityAuthorizationLayerVerdict)
        && layerKeys.includes(layer),
    )
}

function isRole(value: unknown): value is IdentityAccessRole {
  if (!isRecord(value)) return false
  const configuredGrants = value.configured_grants
  const observedUse = value.observed_use
  if (
    !isString(value.role_id)
    || !isString(value.role_arn)
    || !isString(value.name)
    || !isString(value.lifecycle_state)
    || !isStringList(value.workload_ids)
    || !isStringList(value.attachment_modes)
    || new Set(value.workload_ids).size !== value.workload_ids.length
    || new Set(value.attachment_modes).size !== value.attachment_modes.length
    || !isRecord(value.configured_grants)
    || !isRecord(value.observed_use)
    || !isEffectiveAuthorization(value.effective_authorization)
    || !Array.isArray(value.action_details)
    || !value.action_details.every(isActionDetail)
    || !isNonnegativeInteger(value.action_details_returned)
    || value.action_details_returned !== value.action_details.length
    || typeof value.action_details_truncated !== "boolean"
    || !isGapList(value.gaps)
  ) return false

  const configured = configuredGrants as Record<string, unknown>
  const observed = observedUse as Record<string, unknown>
  const configuredReady = configured.state === "ready"
  const configuredUnavailable = configured.state === "unavailable"
  if (!configuredReady && !configuredUnavailable) return false
  if (configuredReady !== isNonnegativeInteger(configured.exact_action_count)) return false
  if (configuredUnavailable && configured.exact_action_count !== null) return false

  const observedReady = observed.state === "ready"
  const observedUnavailable = observed.state === "unavailable"
  if (!observedReady && !observedUnavailable) return false
  if (configuredReady !== observedReady) return false
  const observedCountKeys = [
    "successful_action_count",
    "denied_only_action_count",
    "not_observed_action_count",
    "unknown_action_count",
  ] as const
  if (observedReady) {
    if (!observedCountKeys.every(key => isNonnegativeInteger(observed[key]))) return false
    const coverage = observed.coverage_counts
    if (!isRecord(coverage)) return false
    if (!isNonnegativeInteger(coverage.complete) || !isNonnegativeInteger(coverage.partial) || !isNonnegativeInteger(coverage.unknown)) return false
  } else {
    if (!observedCountKeys.every(key => observed[key] === null)) return false
    if (observed.coverage_counts !== null) return false
  }
  if (!isNullableString(observed.last_success_at)) return false

  const total = value.action_details_total
  if (configuredReady || observedReady) {
    if (!isNonnegativeInteger(total) || total < value.action_details_returned) return false
    const usageTotal = observedCountKeys.reduce((sum, key) => sum + Number(observed[key]), 0)
    const coverage = observed.coverage_counts as Record<string, number>
    const coverageTotal = coverage.complete + coverage.partial + coverage.unknown
    if (usageTotal !== total || coverageTotal !== total || Number(configured.exact_action_count) > total) return false
  } else if (total !== null) return false
  if (isNonnegativeInteger(total) && value.action_details_truncated !== (total > value.action_details_returned)) return false
  const actions = value.action_details.map(action => action.action)
  if (new Set(actions).size !== actions.length) return false
  return true
}

export type IdentityAccessResolution =
  | { state: "ready" | "partial"; projection: IdentityAccessProjection; reason: null }
  | { state: "unavailable"; projection: IdentityAccessProjection | null; reason: string }

/**
 * Validate the browser boundary before rendering authority claims. An absent or
 * malformed nested block is unavailable; it never falls back to legacy IAM
 * rollups and never becomes an exact-empty response.
 */
export function resolveIdentityAccess(
  responseContractVersion: unknown,
  value: unknown,
  expectedScope: IdentityAccessExpectedScope = {},
): IdentityAccessResolution {
  if (responseContractVersion !== "topology-risk/v11") {
    return { state: "unavailable", projection: null, reason: "Topology snapshot does not carry the v11 identity contract." }
  }
  if (!isRecord(value)) {
    return { state: "unavailable", projection: null, reason: "Identity & access was not projected in this snapshot." }
  }
  if (value.contract_version !== CONTRACT_VERSION) {
    return { state: "unavailable", projection: null, reason: "Identity & access contract version is unavailable." }
  }
  const status = value.status
  if (!(["ready", "partial", "unavailable"] as readonly unknown[]).includes(status)) {
    return { state: "unavailable", projection: null, reason: "Identity & access status is malformed." }
  }
  if (
    !isRecord(value.scope)
    || !isString(value.scope.customer_id)
    || !isString(value.scope.account_id)
    || !isString(value.scope.region)
    || !isString(value.scope.system_name)
    || !isString(value.scope.vpc_id)
    || !Array.isArray(value.roles)
    || !value.roles.every(isRole)
    || !isNonnegativeInteger(value.roles_returned)
    || value.roles_returned !== value.roles.length
    || typeof value.roles_truncated !== "boolean"
    || !isGapList(value.gaps)
  ) {
    return { state: "unavailable", projection: null, reason: "Identity & access response is malformed." }
  }

  const roleIds = value.roles.map(role => role.role_id)
  if (new Set(roleIds).size !== roleIds.length) {
    return { state: "unavailable", projection: null, reason: "Identity & access contains duplicate role identities." }
  }

  const scope = value.scope as Record<string, unknown>
  const scopeMismatch = Object.entries(expectedScope).some(([key, expected]) =>
    typeof expected === "string" && expected.length > 0 && scope[key] !== expected,
  )
  if (scopeMismatch) {
    return { state: "unavailable", projection: null, reason: "Identity & access belongs to a different Estate scope." }
  }

  const gaps = value.gaps as IdentityAccessGap[]
  if (status === "unavailable") {
    if (
      value.roles_total !== null
      || value.roles.length !== 0
      || value.roles_returned !== 0
      || value.roles_truncated !== false
      || value.roles_omitted_unresolved !== null
      || gaps.length === 0
      || (value.inventory_authority !== null && !isInventoryAuthority(value.inventory_authority))
      || (value.decision_authority !== null && !isDecisionAuthorityReference(value.decision_authority))
    ) {
      return { state: "unavailable", projection: null, reason: "Identity & access unavailable state is malformed." }
    }
    const firstGap = gaps[0]
    return {
      state: "unavailable",
      projection: value as unknown as IdentityAccessProjection,
      reason: typeof firstGap?.detail === "string" ? firstGap.detail : "Canonical identity evidence is unavailable.",
    }
  }

  if (
    !isNonnegativeInteger(value.roles_total)
    || !isNonnegativeInteger(value.roles_omitted_unresolved)
    || value.roles_total < value.roles_returned + value.roles_omitted_unresolved
    || !isInventoryAuthority(value.inventory_authority)
  ) {
    return { state: "unavailable", projection: null, reason: "Identity & access counts or inventory authority are malformed." }
  }
  if (value.roles_truncated && value.roles_total <= value.roles_returned) {
    return { state: "unavailable", projection: null, reason: "Identity & access truncation metadata is malformed." }
  }
  if (!value.roles_truncated && value.roles_total !== value.roles_returned + value.roles_omitted_unresolved) {
    return { state: "unavailable", projection: null, reason: "Identity & access role totals are malformed." }
  }
  if (status === "ready" && (
    !isVerifiedDecisionAuthority(value.decision_authority)
    || gaps.length > 0
    || value.roles_omitted_unresolved !== 0
    || value.roles.some(role => role.gaps.length > 0 || role.action_details_total === null)
  )) {
    return { state: "unavailable", projection: null, reason: "Ready identity evidence lacks a verified decision authority." }
  }
  if (value.decision_authority !== null && !isDecisionAuthorityReference(value.decision_authority)) {
    return { state: "unavailable", projection: null, reason: "Identity decision authority is malformed." }
  }

  return {
    state: status as "ready" | "partial",
    projection: value as unknown as IdentityAccessProjection,
    reason: null,
  }
}

export const identityAccessContractVersion = CONTRACT_VERSION
export const identityAccessRequiredLayers = REQUIRED_LAYERS
