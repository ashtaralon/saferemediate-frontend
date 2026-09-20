/**
 * Estate · Identity & access — payload to view model.
 *
 * This module decides EVERYTHING the Identity tab shows, and it is deliberately
 * React-free so those decisions are executable on their own. The tab component
 * renders what this returns and adds no judgement of its own.
 *
 * It reads the additive `identity_access` block off the SAME topology-risk
 * payload the Estate map already fetched (`estate-identity-access/v1`, built by
 * scripts/estate_identity_access.py and attached by the estate projection
 * worker). There is no second request: no route exists that serves this block
 * on its own, and inventing one would 404.
 *
 * The four states below are different facts and must never collapse into one
 * another — an empty screen is a claim, and three of these four are not "no
 * roles":
 *
 *   absent      The snapshot carries no identity block at all. The enricher is
 *               set only by the estate projection worker, so a v11 snapshot
 *               written by ordinary request serving has none. Says nothing
 *               about how many roles the account has.
 *   invalid     A block is present but is not this contract, or its own fields
 *               are not the shapes the contract promises. Never rendered as
 *               data, and never guessed at.
 *   unavailable The projector reached the canonical path and refused: a pointer
 *               was missing, drifted, or failed verification. The gap codes say
 *               which.
 *   incomplete  The projection is readable but rendered NO roles while its own
 *               counters say roles exist — omitted for an unresolved AWS
 *               RoleId, truncated, or held back by a binding gap. This is the
 *               state that must not be mistaken for "nothing is bound".
 *   ready       The active canonical generation was read and every role it
 *               counted is on screen. Only here can `roles: []` be an ANSWER,
 *               and only when the projection also counted zero, truncated
 *               nothing and omitted nothing.
 *
 * `status` is a CLOSED set: ready, partial, unavailable. Anything else —
 * missing, misspelled, or from a contract this code does not know — is invalid.
 * Treating an unrecognised status as readable would let an unknown backend
 * state render as authority.
 */

import type { TopologyRiskResponse } from "./types"

/** Closed set, mirrored from scripts/estate_relationship_capability.py. */
export const CAPABILITY_REASON_CODES = [
  "ASSET_ANCHORED_AUTHORITY_ONLY",
  "CANONICAL_PRODUCER_UNWIRED",
  "CLASSIFICATION_CONFLICT",
  "NOT_ROLE_ANCHORED",
  "NO_CANONICAL_PRODUCER",
] as const

export type CapabilityReasonCode = (typeof CAPABILITY_REASON_CODES)[number]

/** One relationship family's verdict about the INSTALLED data path. */
export interface RelationshipCapability {
  family: string
  status: "available" | "unavailable"
  /**
   * Null for every unavailable family, by contract. A family that cannot be
   * read has no evidence plane, and asserting one would label a configured
   * capability as observed evidence.
   */
  plane: string | null
  canonical_writer: string | null
  bounded_read: string | null
  reason_codes: string[]
  detail: string
}

/* ── wire shapes ───────────────────────────────────────────────────────────
 *
 * What MIGHT arrive, before anything has been checked. Fields are optional
 * here because the payload can genuinely lack them -- that is precisely what
 * the validators below exist to catch. These types describe untrusted input
 * and are never what the builder or the graph consume; the `Valid*` types
 * further down are, and there every producer-required field is required.
 */

export interface IdentityAuthority {
  projection_scope?: string | null
  generation?: number | null
  staging_run_id?: string | null
  source_vector_hash?: string | null
  projected_through?: string | null
  projection_receipt_hash?: string | null
  [key: string]: unknown
}

export interface IdentityScope {
  customer_id?: string | null
  account_id?: string | null
  region?: string | null
  system_name?: string | null
  vpc_id?: string | null
}

export interface IdentityGap {
  code: string
  detail: string
  [key: string]: unknown
}

export interface IdentityRole {
  role_id: string
  role_arn?: string | null
  name?: string | null
  lifecycle_state?: string | null
  workload_ids?: string[]
  attachment_modes?: string[]
  configured_grants?: { state?: string; exact_action_count?: number | null }
  observed_use?: {
    state?: string
    successful_action_count?: number | null
    denied_only_action_count?: number | null
    not_observed_action_count?: number | null
    unknown_action_count?: number | null
    coverage_counts?: { complete?: number; partial?: number; unknown?: number } | null
    last_success_at?: string | null
  }
  effective_authorization?: {
    availability?: string
    decision?: string | null
    granularity?: string
    reason_codes?: string[]
  }
  action_details_total?: number | null
  action_details_returned?: number
  action_details_truncated?: boolean
  gaps?: IdentityGap[]
}

export interface IdentityAccessBlock {
  contract_version?: string
  status?: string
  scope?: IdentityScope | null
  inventory_authority?: IdentityAuthority | null
  decision_authority?: IdentityAuthority | null
  roles_total?: number | null
  roles_returned?: number
  roles_truncated?: boolean
  roles_omitted_unresolved?: number | null
  roles?: IdentityRole[]
  gaps?: IdentityGap[]
  relationship_capabilities?: RelationshipCapability[]
}

export const IDENTITY_ACCESS_CONTRACT_VERSION = "estate-identity-access/v1"

/** Which evidence plane a rendered number stands on. Never inferred. */
export type Plane = "configured" | "observed"

export interface GraphWorkloadNode {
  kind: "workload"
  id: string
  /** The topology node id the projector resolved, so the canvas can link back. */
  visibleId: string
}

export interface GraphRoleNode {
  kind: "role"
  id: string
  roleId: string
  label: string
  roleArn: string | null
  lifecycleState: string | null
  attachmentModes: string[]
}

/**
 * The decision hop, as a discriminated union on `state`.
 *
 * A union rather than one shape with nullable numbers, because the two states
 * carry opposite obligations and the renderer must not have to guess. "ready"
 * means the decision authority was read, so the configured count IS a number;
 * "unavailable" means it was withheld, so every count is null and must stay
 * visibly absent rather than becoming a zero or a dash. Encoding that here
 * leaves no nullable field for a renderer to paper over.
 */
export interface GraphDecisionObserved {
  successful: number
  deniedOnly: number
  notObserved: number
  unknown: number
  /** Legitimately null: a role may have been observed with no success yet. */
  lastSuccessAt: string | null
}

interface GraphDecisionBase {
  kind: "decision"
  id: string
  roleId: string
  /**
   * v1 never decides effective authorization; availability is "unavailable" on
   * every record. Carried verbatim with its reason codes so the tab states the
   * limit instead of implying an allow.
   */
  effectiveAuthorization: {
    availability: string
    decision: string | null
    reasonCodes: string[]
  }
  gaps: IdentityGap[]
}

export interface GraphDecisionReady extends GraphDecisionBase {
  state: "ready"
  /** Plane "configured": how many actions the policy universe grants. */
  configuredGrantCount: number
  /**
   * Plane "observed", and present ONLY when observed_use.state is "ready".
   * A role whose observed evidence was withheld has no counts to show, and
   * zero is not the same as unknown.
   */
  observed: GraphDecisionObserved | null
}

export interface GraphDecisionUnavailable extends GraphDecisionBase {
  state: "unavailable"
  configuredGrantCount: null
  observed: null
}

export type GraphDecisionNode = GraphDecisionReady | GraphDecisionUnavailable

export type GraphNode = GraphWorkloadNode | GraphRoleNode | GraphDecisionNode

export interface GraphEdge {
  from: string
  to: string
  /** The capability family this edge is drawn from — never a legacy edge. */
  family: "WORKLOAD_USES_ROLE" | "ROLE_ACTION_DECISION"
  plane: Plane
  label: string
  /**
   * Whether the renderer may animate flow along this edge.
   *
   * Motion on an edge reads as "traffic is happening here", so it is allowed
   * ONLY where observed evidence was actually read AND a decision generation
   * stands behind it. A configured edge is a statement about policy, not about
   * anything observed, and must never move.
   */
  animated: boolean
}

export interface IdentityGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface ScopeBinding {
  /** Fields compared against the topology payload this block rides on. */
  verified: { field: string; value: string }[]
  /**
   * Fields the identity block states that the topology payload does not carry,
   * so they are echoed, not checked. Naming them is the point: an unchecked
   * field must not read as a verified one.
   */
  echoedOnly: { field: string; value: string }[]
  mismatches: { field: string; identity: string; topology: string }[]
}

export interface AuthorityReceipt {
  label: string
  /**
   * Every field but the receipt hash is unconditional on a validated
   * authority, so none of them is nullable here and no renderer needs a
   * placeholder for one. The receipt hash alone is legitimately null -- a
   * generation activated before receipts existed is readable and uncertifiable
   * -- and that is the one case a view has to show something for.
   */
  projectionScope: string
  generation: number
  sourceVectorHash: string
  projectionReceiptHash: string | null
  projectedThrough: string
  stagingRunId: string
}

export type IdentityViewState =
  | "absent"
  | "invalid"
  | "scope_mismatch"
  | "unavailable"
  | "incomplete"
  | "ready"

/** The only status values estate-identity-access/v1 emits. */
export const READABLE_STATUSES = ["partial", "ready"] as const
export const VALID_STATUSES = ["partial", "ready", "unavailable"] as const

export interface IdentityView {
  state: IdentityViewState
  /** One sentence naming the fact. Never "no data". */
  headline: string
  detail: string
  contractVersion: string | null
  /** "ready" | "partial" as the projector reported it; null unless readable. */
  projectionStatus: string | null
  scope: IdentityScope | null
  scopeBinding: ScopeBinding | null
  receipts: AuthorityReceipt[]
  graph: IdentityGraph
  roles: ValidRole[]
  rolesTotal: number | null
  rolesReturned: number
  rolesTruncated: boolean
  rolesOmittedUnresolved: number | null
  /**
   * True only in the "ready" state with zero roles: the canonical generation
   * WAS read and holds no workload->role binding in this scope. An answer.
   */
  emptyAuthoritative: boolean
  gaps: IdentityGap[]
  capabilities: RelationshipCapability[]
  /** Why the capability matrix is missing, when it is. Never a silent []. */
  capabilitiesUnavailableReason: string | null
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

/* ── bounded runtime validation ────────────────────────────────────────────
 *
 * The block arrives as JSON over the wire. TypeScript describes what it SHOULD
 * be and checks nothing at runtime, so `roles: {}` or `gaps: "none"` would
 * reach a spread or a sort and throw inside render — and a tab that throws
 * tells a reader less than a blank one.
 *
 * These checks are bounded on purpose: one pass, fixed depth, no recursion
 * into unknown structures. They verify the shapes this view actually touches
 * and nothing else, so a backend that adds a field stays readable while a
 * backend that changes one of these shapes is withheld rather than guessed at.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** A non-empty string. `str()` returns null for everything else, including []. */
function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== ""
}

/** An integer at or above zero. Rejects booleans, floats, NaN and numeric strings. */
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

/** An optional field that must be an array of strings when present. */
function optionalStringArray(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (Array.isArray(value) && value.every(item => typeof item === "string"))
  )
}

function validGap(value: unknown): boolean {
  return isPlainObject(value) && typeof value.code === "string" && typeof value.detail === "string"
}

function validGapList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(validGap))
}

/**
 * The tenant, account, system and region this projection was built for.
 *
 * These four are the authority the scope guard rests on: `bindScope` compares
 * them against the payload carrying the block. `str()` returns null for a
 * non-string, so WITHOUT this check a scope of `{account_id: []}` reads as an
 * absent account_id, skips the mismatch comparison entirely, and renders one
 * tenant's roles under another's estate. Malformed authority fails closed.
 *
 * `vpc_id` follows the producer: _scope() copies work.vpc_id straight through,
 * and that is null for an account- or region-wide projection. Null is fine; a
 * non-string that is not null is not.
 */
export const REQUIRED_SCOPE_FIELDS = ["customer_id", "account_id", "system_name", "region"] as const

function scopeViolation(value: unknown): string | null {
  if (!isPlainObject(value)) return "its `scope` is not an object"
  const missing = REQUIRED_SCOPE_FIELDS.filter(field => !isText(value[field]))
  if (missing.length > 0) {
    return `its scope does not carry ${missing.join(", ")} as text`
  }
  const vpc = value.vpc_id
  if (vpc !== undefined && vpc !== null && !isText(vpc)) {
    return "its scope carries a vpc_id that is neither text nor null"
  }
  return null
}

/**
 * The projection scope each authority MUST name.
 *
 * Mirrored from cyntro_data/projection/{inventory_authority_project,
 * role_action_decision_project}.py. Checked by POSITION, because two otherwise
 * complete authority objects are structurally identical: without this, the
 * inventory and decision authorities can be swapped and both still validate,
 * and every generation, receipt and "hash-verified" claim on screen is then
 * attributed to the wrong projection.
 */
export const INVENTORY_PROJECTION_SCOPE = "inventory.resource_state.v1"
export const ROLE_ACTION_DECISION_PROJECTION_SCOPE = "iam.role_action_decision.v1"

/**
 * One projection authority receipt, as _authority() emits it.
 *
 * Every key is unconditional at the source: _authority() writes all six on
 * every call, so a MISSING key is a different fact from a null value and is
 * not tolerated. ActiveProjection types generation, staging_run_id,
 * source_vector_hash and projected_through as required, and _iso_z always
 * returns a string.
 *
 * projection_receipt_hash is `pointer.projection_receipt_hash or None`: the
 * key is always written, the VALUE may be null, and the pointer documents why
 * -- a generation activated before that field existed stays READABLE and
 * merely uncertifiable. So null passes and absent does not.
 *
 * Without this, `inventory_authority: {}` passed the old object check and
 * rendered a receipt card of em-dashes, while `decision_authority: {}` let the
 * detail line claim a hash-verified decision authority at "generation unknown".
 */
function authorityViolation(
  value: unknown,
  label: string,
  expectedScope: string,
): string | null {
  if (!isPlainObject(value)) return `its ${label} is not an object`
  if (!isText(value.projection_scope)) return `its ${label} names no projection scope`
  if (value.projection_scope !== expectedScope) {
    return (
      `its ${label} names projection scope ${value.projection_scope}, but this ` +
      `position carries ${expectedScope} -- the two authorities appear to be swapped`
    )
  }
  if (!isCount(value.generation)) {
    return `its ${label} carries no non-negative integer generation`
  }
  for (const field of ["staging_run_id", "source_vector_hash", "projected_through"] as const) {
    if (!isText(value[field])) return `its ${label} carries no ${field}`
  }
  if (!("projection_receipt_hash" in value)) {
    return `its ${label} omits projection_receipt_hash, which the producer always writes`
  }
  const receipt = value.projection_receipt_hash
  if (receipt !== null && !isText(receipt)) {
    return `its ${label} carries a receipt hash that is neither text nor null`
  }
  return null
}

/**
 * One role's decision states, and what each state obliges it to carry.
 *
 * A state of "ready" is a claim that the numbers beside it were read. If those
 * numbers are missing or malformed, the state is lying -- and an observed_use
 * state of "ready" is what lets buildGraph put an edge on the observed plane
 * and animate it. Motion over numbers that were never read is exactly the
 * false claim the whole surface is built to avoid.
 *
 * "unavailable" carries the opposite obligation. _unavailable_role and
 * _cleared_role both set every count, the coverage block and last_success_at
 * to null, precisely so a withheld decision cannot be read as zero. A payload
 * that says "unavailable" while carrying numbers is claiming both at once, so
 * it is refused rather than rendered under whichever label the view happens to
 * key off.
 */
const DECISION_STATES = ["ready", "unavailable"] as const
const OBSERVED_COUNT_FIELDS = [
  "successful_action_count",
  "denied_only_action_count",
  "not_observed_action_count",
  "unknown_action_count",
] as const
const COVERAGE_FIELDS = ["complete", "partial", "unknown"] as const

function configuredGrantsViolation(value: unknown): string | null {
  if (!isPlainObject(value)) return "a role's configured_grants is not an object"
  const state = value.state
  if (!(DECISION_STATES as readonly unknown[]).includes(state)) {
    return "a role's configured_grants names a state this contract does not define"
  }
  if (!("exact_action_count" in value)) {
    return "a role's configured_grants omits exact_action_count"
  }
  if (state === "ready") {
    // "ready" here means the grant universe was enumerated exactly. Without a
    // sound count it cannot have been.
    if (!isCount(value.exact_action_count)) {
      return "a role claims a configured grant universe with no exact action count"
    }
  } else if (value.exact_action_count !== null) {
    return "a role reports an action count beside an unavailable configured state"
  }
  return null
}

function observedUseViolation(value: unknown): string | null {
  if (!isPlainObject(value)) return "a role's observed_use is not an object"
  const state = value.state
  if (!(DECISION_STATES as readonly unknown[]).includes(state)) {
    return "a role's observed_use names a state this contract does not define"
  }
  for (const field of [...OBSERVED_COUNT_FIELDS, "coverage_counts", "last_success_at"] as const) {
    if (!(field in value)) return `a role's observed_use omits ${field}`
  }

  if (state !== "ready") {
    for (const field of OBSERVED_COUNT_FIELDS) {
      if (value[field] !== null) {
        return `a role reports ${field} beside an unavailable observed state`
      }
    }
    if (value.coverage_counts !== null) {
      return "a role reports coverage counts beside an unavailable observed state"
    }
    if (value.last_success_at !== null) {
      return "a role reports a last success beside an unavailable observed state"
    }
    return null
  }

  for (const field of OBSERVED_COUNT_FIELDS) {
    if (!isCount(value[field])) return `a role claims observed use with no ${field}`
  }
  const coverage = value.coverage_counts
  if (!isPlainObject(coverage)) return "a role claims observed use with no coverage counts"
  for (const field of COVERAGE_FIELDS) {
    if (!isCount(coverage[field])) {
      return `a role claims observed use with no ${field} coverage count`
    }
  }
  const last = value.last_success_at
  if (last !== null && !isText(last)) {
    return "a role carries a last_success_at that is neither text nor null"
  }
  return null
}

/**
 * effective_authorization, which v1 never fills in but always writes.
 *
 * _effective_authorization emits all four keys on every call. Letting them be
 * absent meant the view defaulted availability to "unavailable" -- which reads
 * as an honest "we do not know" while being a value this code invented rather
 * than one the producer stated. A garbled block must not be able to arrive at
 * the same words a real refusal produces.
 *
 * The shape is pinned rather than the v1 values, so a later contract that does
 * project an effective decision stays readable -- but an availability other
 * than "unavailable" then has to name the decision it reached.
 */
function effectiveAuthorizationViolation(value: unknown): string | null {
  if (!isPlainObject(value)) return "a role's effective_authorization is not an object"
  for (const field of ["availability", "decision", "granularity", "reason_codes"] as const) {
    if (!(field in value)) return `a role's effective_authorization omits ${field}`
  }
  if (!isText(value.availability)) {
    return "a role's effective_authorization names no availability"
  }
  if (!isText(value.granularity)) {
    return "a role's effective_authorization names no granularity"
  }
  if (!Array.isArray(value.reason_codes) || !value.reason_codes.every(item => typeof item === "string")) {
    return "a role's effective_authorization reason_codes is not a list of text"
  }
  const decision = value.decision
  if (value.availability === "unavailable") {
    if (decision !== null) {
      return "a role reports an effective decision beside an unavailable availability"
    }
  } else if (!isText(decision)) {
    return "a role claims effective authorization without naming the decision"
  }
  return null
}

/**
 * One role, to the depth this view reads it.
 *
 * Every field below is written on EVERY emitted role: _read_bindings supplies
 * role_id, workload_ids and attachment_modes, and _ready_role, _unavailable_role
 * and _cleared_role each add configured_grants, observed_use,
 * effective_authorization and gaps. Tolerating an absent one meant buildGraph
 * invented the rest -- an empty workload list, an "unavailable" decision node
 * nobody reported -- and drew it as though the producer had said so.
 *
 * role_id must be usable text because it keys every graph node and edge; the
 * backend omits a role without one rather than emitting it (see _read_bindings
 * / ROLE_ID_UNRESOLVED).
 */
const REQUIRED_ROLE_FIELDS = [
  "workload_ids",
  "attachment_modes",
  "configured_grants",
  "observed_use",
  "effective_authorization",
  "gaps",
] as const

function roleViolation(value: unknown): string | null {
  if (!isPlainObject(value)) return "a role is not an object"
  if (!isText(value.role_id)) return "a role carries no role_id"
  const missing = REQUIRED_ROLE_FIELDS.filter(field => !(field in value))
  if (missing.length > 0) {
    return `a role omits ${missing.join(", ")}, which the producer always writes`
  }
  if (!Array.isArray(value.workload_ids) || !value.workload_ids.every(item => typeof item === "string")) {
    return "a role's workload_ids is not a list of text"
  }
  if (
    !Array.isArray(value.attachment_modes) ||
    !value.attachment_modes.every(item => typeof item === "string")
  ) {
    return "a role's attachment_modes is not a list of text"
  }
  if (!Array.isArray(value.gaps) || !value.gaps.every(validGap)) {
    return "a role's gaps is not a list of {code, detail}"
  }
  return (
    configuredGrantsViolation(value.configured_grants) ??
    observedUseViolation(value.observed_use) ??
    effectiveAuthorizationViolation(value.effective_authorization)
  )
}

/**
 * The counters and arrays, their status-aware nullability, and the
 * conservation law between them.
 *
 * Every one of these six keys is written on EVERY v1 return --
 * build_estate_identity_access's ready branch,
 * _projection_with_unavailable_decisions, _unavailable_projection, and both
 * rebuild branches of apply_decision_lifecycle. A missing key is therefore a
 * different fact from a null value, and tolerating one meant the view invented
 * a number: roles=[], rolesReturned=roles.length, rolesTruncated=false,
 * omitted=null. Those look like the producer's own answers and are not.
 *
 * Nullability follows the status, exactly:
 *
 *   ready / partial   total, returned, omitted are non-negative integers;
 *                     truncated is a boolean; roles and gaps are arrays.
 *   unavailable       _unavailable_projection pins the shape: total null,
 *                     returned 0, truncated false, omitted null, roles empty.
 *                     gaps is still an array -- that is where the reason is.
 *
 * And the conservation law, from _read_bindings returning
 * (resolved, len(entities), len(entities) - len(resolved), gaps) with the
 * builder rendering resolved[:MAX_ROLES]:
 *
 *     roles_returned            == roles.length
 *     roles_returned + omitted  <= roles_total
 *     roles_truncated           == (roles_total - omitted > roles_returned)
 *
 * The last is an equivalence, not an implication: a payload claiming no
 * truncation while its own totals say rows were dropped is contradicting
 * itself, and that contradiction is what a silent coercion to false would hide.
 */
const REQUIRED_COUNTER_FIELDS = [
  "roles",
  "gaps",
  "roles_total",
  "roles_returned",
  "roles_truncated",
  "roles_omitted_unresolved",
] as const

function counterViolation(block: Record<string, unknown>, status: string): string | null {
  const missing = REQUIRED_COUNTER_FIELDS.filter(field => !(field in block))
  if (missing.length > 0) {
    return `it omits ${missing.join(", ")}, which the producer always writes`
  }

  const roles = block.roles
  const gaps = block.gaps
  const total = block.roles_total
  const returned = block.roles_returned
  const omitted = block.roles_omitted_unresolved
  const truncated = block.roles_truncated

  if (!Array.isArray(roles)) return "its `roles` is not a list"
  if (!Array.isArray(gaps)) return "its `gaps` is not a list"

  if (status === "unavailable") {
    // _unavailable_projection pins every one of these. Anything else is a
    // payload claiming to have counted something it could not read.
    if (total !== null) return "an unavailable projection reports a roles_total"
    if (omitted !== null) return "an unavailable projection reports omitted roles"
    if (returned !== 0) return "an unavailable projection reports returned roles"
    if (truncated !== false) return "an unavailable projection reports truncation"
    if (roles.length > 0) return "an unavailable projection carries roles"
    return null
  }

  if (typeof truncated !== "boolean") return "its roles_truncated is not a boolean"
  if (!isCount(returned)) return "its roles_returned is not a non-negative integer"
  if (!isCount(total)) return "its roles_total is not a non-negative integer"
  if (!isCount(omitted)) {
    return "its roles_omitted_unresolved is not a non-negative integer"
  }
  if (returned !== roles.length) {
    return `it reports ${returned} roles returned but carries ${roles.length}`
  }
  if (returned + omitted > total) {
    return `it returns ${returned} and omits ${omitted} roles out of a total of ${total}`
  }
  const expectedTruncation = total - omitted > returned
  if (truncated !== expectedTruncation) {
    return expectedTruncation
      ? "its totals say roles were dropped, but it reports no truncation"
      : "it reports truncation that its own totals contradict"
  }
  return null
}

/**
 * Which authorities a status obliges the payload to carry.
 *
 * ready    Both. The builder only reaches its ready return after reading the
 *          inventory pointer AND verifying the decision generation.
 * partial  Inventory always; decision legitimately null, because
 *          _projection_with_unavailable_decisions is reached exactly when the
 *          decision authority could not be read.
 * unavailable  Neither is promised.
 */
function authorityObligationViolation(
  block: Record<string, unknown>,
  status: string,
): string | null {
  const inventory = block.inventory_authority
  const decision = block.decision_authority

  if (status === "ready" || status === "partial" || (inventory !== undefined && inventory !== null)) {
    const violation = authorityViolation(
      inventory,
      "inventory authority",
      INVENTORY_PROJECTION_SCOPE,
    )
    if (violation !== null) return violation
  }

  // partial legitimately carries none: _projection_with_unavailable_decisions
  // is reached exactly when the decision authority could not be read.
  if (status === "ready" || (decision !== undefined && decision !== null)) {
    const violation = authorityViolation(
      decision,
      "decision authority",
      ROLE_ACTION_DECISION_PROJECTION_SCOPE,
    )
    if (violation !== null) return violation
  }
  return null
}

/** Why a v1 block was withheld. One sentence, shown to the reader. */
function contractViolation(block: Record<string, unknown>, status: string): string | null {
  const scope = scopeViolation(block.scope)
  if (scope !== null) return scope

  const obligation = authorityObligationViolation(block, status)
  if (obligation !== null) return obligation

  const counters = counterViolation(block, status)
  if (counters !== null) return counters

  for (const role of block.roles as unknown[]) {
    const violation = roleViolation(role)
    if (violation !== null) return violation
  }
  if (!(block.gaps as unknown[]).every(validGap)) {
    return "its `gaps` is not a list of {code, detail}"
  }
  return null
}

/** Planes the producer asserts. An available family must stand on one of them. */
export const SUPPORTED_PLANES = ["configured", "configured_and_observed"] as const

/**
 * Every relationship family the matrix is required to have a verdict on.
 *
 * Mirrored from scripts/estate_relationship_capability.py, like the reason
 * codes beside it. The matrix's whole value is the CLAIM that every requested
 * family was ruled on; a family silently absent reads exactly like one nobody
 * asked about. An unknown EXTRA family is fine — a backend may rule on more
 * than this list — but a missing or duplicated one means the claim is false.
 */
export const REQUIRED_CAPABILITY_FAMILIES = [
  "ASSUMED_ROLE_OBSERVED",
  "ASSUMES_ROLE",
  "ASSUMES_ROLE_ACTUAL",
  "CAN_ASSUME",
  "DATA_ACCESS",
  "HAS_POLICY",
  "IN_ORG",
  "IN_ORG_UNIT",
  "LIMITED_BY_SCP",
  "MEMBER_OF",
  "ROLE_ACTION_DECISION",
  "TARGETS",
  "TRUSTS",
  "USES_KMS_KEY",
  "WORKLOAD_USES_ROLE",
] as const

/**
 * One capability row, against the producer's own invariants — not just shape.
 *
 * The two statuses are opposite claims and carry opposite obligations:
 *
 *   available    stands on a named plane, and names the writer that produces
 *                it and the bounded read that serves it. It has NO reason
 *                codes, because there is nothing to excuse.
 *   unavailable  asserts NO plane, names no writer and no read — the producer
 *                sets all three to null precisely so an unreadable family
 *                cannot be mistaken for evidence — and carries at least one
 *                reason from the closed set.
 *
 * A row that mixes these is not a row this view can render honestly: an
 * "unavailable" row carrying a plane would paint a gap as observed evidence,
 * and an "available" row with no bounded read claims a capability nothing
 * serves.
 */
function validCapabilityRow(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  if (!isText(value.family)) return false
  if (typeof value.detail !== "string") return false
  if (!Array.isArray(value.reason_codes)) return false
  if (!value.reason_codes.every(item => typeof item === "string")) return false
  if (!value.reason_codes.every(code => (CAPABILITY_REASON_CODES as readonly string[]).includes(code as string))) {
    return false
  }

  if (value.status === "available") {
    return (
      (SUPPORTED_PLANES as readonly unknown[]).includes(value.plane) &&
      isText(value.canonical_writer) &&
      isText(value.bounded_read) &&
      value.reason_codes.length === 0
    )
  }
  if (value.status === "unavailable") {
    return (
      value.plane === null &&
      value.canonical_writer === null &&
      value.bounded_read === null &&
      value.reason_codes.length > 0
    )
  }
  return false
}

/* ── the refined block ─────────────────────────────────────────────────────
 *
 * Validation above decides whether a payload may be read. Everything below
 * consumes the result through these types, in which every producer-required
 * field is NON-optional. That is the point: a `?? []` or `?? "unavailable"`
 * downstream is a value this code invents, and on screen an invented value is
 * indistinguishable from a reported one. Making the fields required means
 * there is nothing to fall back TO, so the fallback cannot be written.
 *
 * Only genuinely optional fields keep a presentation fallback. `name`,
 * `role_arn` and `lifecycle_state` are display text the producer may legitimately
 * emit as null, so `str()` narrows them to `string | null` and the renderer
 * chooses what to show instead.
 */

export type DecisionState = (typeof DECISION_STATES)[number]
export type ValidStatus = (typeof VALID_STATUSES)[number]

export interface ValidAuthority {
  projection_scope: string
  generation: number
  staging_run_id: string
  source_vector_hash: string
  /** Canonical UTC timestamp. */
  projected_through: string
  /** Null on a pointer activated before receipts existed: readable, uncertifiable. */
  projection_receipt_hash: string | null
  /** Scope-specific metadata the projector adds; not read by this view. */
  metadata: Record<string, unknown>
}

export interface ValidConfiguredGrants {
  state: DecisionState
  /** A count when state is "ready"; null when it is not. Never absent. */
  exact_action_count: number | null
}

export interface ValidObservedUse {
  state: DecisionState
  successful_action_count: number | null
  denied_only_action_count: number | null
  not_observed_action_count: number | null
  unknown_action_count: number | null
  coverage_counts: { complete: number; partial: number; unknown: number } | null
  last_success_at: string | null
}

export interface ValidEffectiveAuthorization {
  availability: string
  decision: string | null
  granularity: string
  reason_codes: string[]
}

export interface ValidRole {
  role_id: string
  /** Display only, and legitimately null. */
  role_arn: string | null
  name: string | null
  lifecycle_state: string | null
  workload_ids: string[]
  attachment_modes: string[]
  configured_grants: ValidConfiguredGrants
  observed_use: ValidObservedUse
  effective_authorization: ValidEffectiveAuthorization
  gaps: IdentityGap[]
}

export interface ValidBlock {
  contract_version: string
  status: ValidStatus
  scope: IdentityScope
  inventory_authority: ValidAuthority | null
  decision_authority: ValidAuthority | null
  roles_total: number | null
  roles_returned: number
  roles_truncated: boolean
  roles_omitted_unresolved: number | null
  roles: ValidRole[]
  gaps: IdentityGap[]
}

const AUTHORITY_FIELDS = new Set([
  "projection_scope",
  "generation",
  "staging_run_id",
  "source_vector_hash",
  "projected_through",
  "projection_receipt_hash",
])

function extractAuthority(value: unknown): ValidAuthority | null {
  if (value === null || value === undefined) return null
  const authority = value as Record<string, unknown>
  const metadata: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(authority)) {
    if (!AUTHORITY_FIELDS.has(key)) metadata[key] = item
  }
  return {
    projection_scope: authority.projection_scope as string,
    generation: authority.generation as number,
    staging_run_id: authority.staging_run_id as string,
    source_vector_hash: authority.source_vector_hash as string,
    projected_through: authority.projected_through as string,
    projection_receipt_hash: authority.projection_receipt_hash as string | null,
    metadata,
  }
}

function extractRole(value: unknown): ValidRole {
  const role = value as Record<string, unknown>
  const configured = role.configured_grants as Record<string, unknown>
  const observed = role.observed_use as Record<string, unknown>
  const effective = role.effective_authorization as Record<string, unknown>
  return {
    role_id: role.role_id as string,
    role_arn: str(role.role_arn),
    name: str(role.name),
    lifecycle_state: str(role.lifecycle_state),
    workload_ids: role.workload_ids as string[],
    attachment_modes: role.attachment_modes as string[],
    configured_grants: {
      state: configured.state as DecisionState,
      exact_action_count: configured.exact_action_count as number | null,
    },
    observed_use: {
      state: observed.state as DecisionState,
      successful_action_count: observed.successful_action_count as number | null,
      denied_only_action_count: observed.denied_only_action_count as number | null,
      not_observed_action_count: observed.not_observed_action_count as number | null,
      unknown_action_count: observed.unknown_action_count as number | null,
      coverage_counts: observed.coverage_counts as ValidObservedUse["coverage_counts"],
      last_success_at: observed.last_success_at as string | null,
    },
    effective_authorization: {
      availability: effective.availability as string,
      decision: effective.decision as string | null,
      granularity: effective.granularity as string,
      reason_codes: effective.reason_codes as string[],
    },
    gaps: role.gaps as IdentityGap[],
  }
}

/**
 * Narrow a payload contractViolation() has already accepted.
 *
 * Every read here is unconditional and every cast is discharged by a check
 * above: scopeViolation for scope, authorityViolation for both authorities,
 * counterViolation for the six counters and arrays, roleViolation for each
 * role. This is the ONLY place a v1 field is read without a guard, and it runs
 * only after that guard has passed.
 */
function extractBlock(block: Record<string, unknown>, status: ValidStatus): ValidBlock {
  return {
    contract_version: block.contract_version as string,
    status,
    scope: block.scope as IdentityScope,
    inventory_authority: extractAuthority(block.inventory_authority),
    decision_authority: extractAuthority(block.decision_authority),
    roles_total: block.roles_total as number | null,
    roles_returned: block.roles_returned as number,
    roles_truncated: block.roles_truncated as boolean,
    roles_omitted_unresolved: block.roles_omitted_unresolved as number | null,
    roles: (block.roles as unknown[]).map(extractRole),
    gaps: block.gaps as IdentityGap[],
  }
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function receipt(label: string, authority: ValidAuthority | null): AuthorityReceipt | null {
  if (authority === null) return null
  // Every field is required on ValidAuthority, so nothing is defaulted here.
  return {
    label,
    projectionScope: authority.projection_scope,
    generation: authority.generation,
    sourceVectorHash: authority.source_vector_hash,
    projectionReceiptHash: authority.projection_receipt_hash,
    projectedThrough: authority.projected_through,
    stagingRunId: authority.staging_run_id,
  }
}

export const INVENTORY_AUTHORITY_LABEL = "Canonical inventory"
export const DECISION_AUTHORITY_LABEL = "Role action decision"

function receipts(block: ValidBlock): AuthorityReceipt[] {
  const out: AuthorityReceipt[] = []
  const inventory = receipt(INVENTORY_AUTHORITY_LABEL, block.inventory_authority)
  if (inventory) out.push(inventory)
  const decision = receipt(DECISION_AUTHORITY_LABEL, block.decision_authority)
  if (decision) out.push(decision)
  return out
}

export function bindScope(
  scope: IdentityScope | null | undefined,
  payload: Pick<TopologyRiskResponse, "system" | "account_id" | "region" | "vpc_id"> | null | undefined,
): ScopeBinding {
  const verified: ScopeBinding["verified"] = []
  const echoedOnly: ScopeBinding["echoedOnly"] = []
  const mismatches: ScopeBinding["mismatches"] = []
  if (!scope) return { verified, echoedOnly, mismatches }

  const customer = str(scope.customer_id)
  if (customer) echoedOnly.push({ field: "customer_id", value: customer })

  const pairs: { field: string; identity: string | null; topology: string | null }[] = [
    { field: "system_name", identity: str(scope.system_name), topology: str(payload?.system) },
    { field: "account_id", identity: str(scope.account_id), topology: str(payload?.account_id) },
    { field: "region", identity: str(scope.region), topology: str(payload?.region) },
    { field: "vpc_id", identity: str(scope.vpc_id), topology: str(payload?.vpc_id) },
  ]
  for (const pair of pairs) {
    if (pair.identity === null) continue
    if (pair.topology === null) {
      echoedOnly.push({ field: pair.field, value: pair.identity })
      continue
    }
    if (pair.identity === pair.topology) {
      verified.push({ field: pair.field, value: pair.identity })
    } else {
      mismatches.push({ field: pair.field, identity: pair.identity, topology: pair.topology })
    }
  }
  return { verified, echoedOnly, mismatches }
}

/**
 * workload -> role -> decision, drawn only from this payload's own v1 fields.
 *
 * No traversal is performed and no other edge family is drawn. The two edges
 * here are exactly the two families the installed canonical path can serve.
 */
export function buildGraph(
  roles: ValidRole[],
  options: { decisionGeneration?: number | null } = {},
): IdentityGraph {
  const decisionGeneration = options.decisionGeneration ?? null
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const seenWorkloads = new Set<string>()

  for (const role of roles) {
    const roleNodeId = `role:${role.role_id}`
    // No fallbacks below: ValidRole makes every field required, and
    // roleViolation refused anything that did not carry it.
    const attachmentModes = [...role.attachment_modes].sort()
    nodes.push({
      kind: "role",
      id: roleNodeId,
      roleId: role.role_id,
      // `name` is display text the producer may legitimately emit as null, so
      // falling back to the role id here is a presentation choice, not an
      // invented fact.
      label: role.name ?? role.role_id,
      roleArn: role.role_arn,
      lifecycleState: role.lifecycle_state,
      attachmentModes,
    })

    for (const workloadId of [...role.workload_ids].sort()) {
      const workloadNodeId = `workload:${workloadId}`
      if (!seenWorkloads.has(workloadNodeId)) {
        seenWorkloads.add(workloadNodeId)
        nodes.push({ kind: "workload", id: workloadNodeId, visibleId: workloadId })
      }
      edges.push({
        from: workloadNodeId,
        to: roleNodeId,
        family: "WORKLOAD_USES_ROLE",
        // An attachment is a configured fact about the inventory generation.
        // Nothing here was observed, so this edge never moves.
        plane: "configured",
        label: attachmentModes.join(", ") || "uses role",
        animated: false,
      })
    }

    const decisionReady = role.configured_grants.state === "ready"
    const observedReady = role.observed_use.state === "ready"
    const decisionNodeId = `decision:${role.role_id}`
    const shared: GraphDecisionBase = {
      kind: "decision",
      id: decisionNodeId,
      roleId: role.role_id,
      effectiveAuthorization: {
        availability: role.effective_authorization.availability,
        decision: role.effective_authorization.decision,
        reasonCodes: [...role.effective_authorization.reason_codes],
      },
      gaps: [...role.gaps],
    }
    if (decisionReady) {
      // roleViolation refused a "ready" configured state without an exact
      // count, and a "ready" observed state without all four counts and a
      // coverage block, so every read below is unconditional.
      nodes.push({
        ...shared,
        state: "ready",
        configuredGrantCount: role.configured_grants.exact_action_count as number,
        observed: observedReady
          ? {
              successful: role.observed_use.successful_action_count as number,
              deniedOnly: role.observed_use.denied_only_action_count as number,
              notObserved: role.observed_use.not_observed_action_count as number,
              unknown: role.observed_use.unknown_action_count as number,
              lastSuccessAt: role.observed_use.last_success_at,
            }
          : null,
      })
    } else {
      nodes.push({ ...shared, state: "unavailable", configuredGrantCount: null, observed: null })
    }
    edges.push({
      from: roleNodeId,
      to: decisionNodeId,
      family: "ROLE_ACTION_DECISION",
      // An edge to a withheld decision stands on the configured plane only.
      // Calling it observed would assert evidence that was not read.
      plane: observedReady ? "observed" : "configured",
      label: decisionReady ? "decided" : "decision unavailable",
      // Motion needs BOTH: evidence that was read, and the generation it was
      // read from. Observed counts with no generation behind them are not
      // something to animate as live flow.
      animated: observedReady && decisionGeneration !== null,
    })
  }
  return { nodes, edges }
}

function capabilityRows(block: IdentityAccessBlock): {
  capabilities: RelationshipCapability[]
  capabilitiesUnavailableReason: string | null
} {
  const raw = block.relationship_capabilities
  if (!Array.isArray(raw)) {
    return {
      capabilities: [],
      capabilitiesUnavailableReason:
        "This payload carries no capability matrix. The backend that produced it " +
        "predates per-family capability metadata, so which relationship families " +
        "are servable is unknown here — not empty.",
    }
  }
  if (raw.length === 0) {
    return {
      capabilities: [],
      capabilitiesUnavailableReason:
        "The capability matrix arrived empty. A matrix with no families is not a " +
        "statement that every family is servable.",
    }
  }
  // All or nothing. Keeping the well-formed rows would hand the reader a
  // matrix that LOOKS complete while silently omitting the families it could
  // not parse — and a family missing from the matrix reads exactly like one
  // that was never requested.
  const malformed = raw.filter(row => !validCapabilityRow(row)).length
  if (malformed > 0) {
    return {
      capabilities: [],
      capabilitiesUnavailableReason:
        `${malformed} of ${raw.length} capability rows do not hold to this ` +
        "contract, so the whole matrix is withheld. Showing the rest would " +
        "present a partial matrix as a complete one.",
    }
  }
  const rows = raw as RelationshipCapability[]

  // Completeness is the matrix's actual claim, so it is checked rather than
  // assumed. A duplicate makes the row count overstate how many families were
  // ruled on; an absent family is indistinguishable from one nobody asked
  // about. Extra families are allowed through: a backend may rule on more.
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.family)) duplicates.add(row.family)
    seen.add(row.family)
  }
  const missing = REQUIRED_CAPABILITY_FAMILIES.filter(family => !seen.has(family))
  if (duplicates.size > 0 || missing.length > 0) {
    const parts: string[] = []
    if (missing.length > 0) parts.push(`no verdict for ${missing.sort().join(", ")}`)
    if (duplicates.size > 0) {
      parts.push(`${[...duplicates].sort().join(", ")} ruled on more than once`)
    }
    return {
      capabilities: [],
      capabilitiesUnavailableReason:
        `The capability matrix is incomplete — ${parts.join("; ")}. It is ` +
        "withheld rather than shown as a complete account of every family.",
    }
  }

  return {
    capabilities: [...rows].sort((a, b) => a.family.localeCompare(b.family)),
    capabilitiesUnavailableReason: null,
  }
}

const EMPTY_GRAPH: IdentityGraph = { nodes: [], edges: [] }

function shell(
  state: IdentityViewState,
  headline: string,
  detail: string,
  extra: Partial<IdentityView> = {},
): IdentityView {
  return {
    state,
    headline,
    detail,
    contractVersion: null,
    projectionStatus: null,
    scope: null,
    scopeBinding: null,
    receipts: [],
    graph: EMPTY_GRAPH,
    roles: [],
    rolesTotal: null,
    rolesReturned: 0,
    rolesTruncated: false,
    rolesOmittedUnresolved: null,
    emptyAuthoritative: false,
    gaps: [],
    capabilities: [],
    capabilitiesUnavailableReason: null,
    ...extra,
  }
}

/**
 * Decide what the Identity tab shows for one topology-risk payload.
 *
 * Every return names a fact. There is no branch that yields a blank panel.
 */
export function buildIdentityView(
  payload: TopologyRiskResponse | null | undefined,
): IdentityView {
  const raw = payload?.identity_access
  if (raw === undefined || raw === null) {
    return shell(
      "absent",
      "This snapshot carries no identity projection.",
      "The identity block is attached by the estate projection worker, so a snapshot " +
        "written by ordinary request serving has none. This says nothing about how " +
        "many roles the account has — refresh the estate projection to produce one.",
    )
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return shell(
      "invalid",
      "The identity block on this snapshot is not readable.",
      "A value is present where the identity projection should be, but it is not an " +
        "object. It is withheld rather than rendered as data.",
    )
  }

  if (!isPlainObject(raw)) {
    return shell(
      "invalid",
      "The identity block on this snapshot is not readable.",
      "A value is present where the identity projection should be, but it is not an " +
        "object. It is withheld rather than rendered as data.",
    )
  }

  const contractVersion = str(raw.contract_version)
  if (contractVersion !== IDENTITY_ACCESS_CONTRACT_VERSION) {
    return shell(
      "invalid",
      "The identity block names a contract this tab does not read.",
      `Expected ${IDENTITY_ACCESS_CONTRACT_VERSION}; the payload says ` +
        `${contractVersion ?? "nothing"}. Rendering it would mean guessing at field ` +
        "meanings, so it is withheld.",
      { contractVersion },
    )
  }

  // The capability matrix is validated and reported separately: it describes the
  // installed data path, not this tenant's data, so a malformed matrix does not
  // make the tenant's projection unreadable, and an unreadable projection does
  // not make the matrix wrong.
  const { capabilities, capabilitiesUnavailableReason } = capabilityRows(
    raw as IdentityAccessBlock,
  )
  const matrix = { capabilities, capabilitiesUnavailableReason }

  // Closed set. An unrecognised or missing status is NOT readable: rendering it
  // would let an unknown backend state reach a reader as authority. It is read
  // before the rest of the contract because which authorities the payload OWES
  // depends on which status it claims.
  const status = str(raw.status)
  if (status === null || !(VALID_STATUSES as readonly string[]).includes(status)) {
    return shell(
      "invalid",
      "The identity block reports a status this contract does not define.",
      `Expected one of ${VALID_STATUSES.join(", ")}; the payload says ` +
        `${status ?? "nothing"}. It is withheld rather than assumed readable.`,
      { ...matrix, contractVersion },
    )
  }

  const violation = contractViolation(raw, status)
  if (violation !== null) {
    return shell(
      "invalid",
      "The identity block claims this contract but does not match it.",
      `It is withheld because ${violation}. A field that is not the promised shape ` +
        "cannot be rendered without guessing what it means.",
      { ...matrix, contractVersion },
    )
  }

  // Everything from here reads the REFINED block. Its producer-required fields
  // are non-optional, so no branch below can substitute a value of its own.
  const block = extractBlock(raw, status as ValidStatus)
  const scopeBinding = bindScope(block.scope, payload)
  const common = { ...matrix, contractVersion, scope: block.scope, scopeBinding }

  if (scopeBinding.mismatches.length > 0) {
    const named = scopeBinding.mismatches
      .map(item => `${item.field} (identity ${item.identity}, topology ${item.topology})`)
      .join("; ")
    return shell(
      "scope_mismatch",
      "This identity projection was built for a different scope.",
      `It is withheld rather than shown against the wrong estate: ${named}. The ` +
        "capability matrix below describes the installed data path, not this " +
        "tenant's data, so it still applies.",
      { ...common, receipts: receipts(block) },
    )
  }

  const gaps = [...block.gaps]
  const authorities = receipts(block)
  if (status === "unavailable") {
    return shell(
      "unavailable",
      "The canonical identity projection could not be served for this scope.",
      gaps.length > 0
        ? "The projector reached the canonical path and refused. Each gap below names why."
        : "The projector reported the projection unavailable without naming a gap code.",
      { ...common, projectionStatus: status, receipts: authorities, gaps },
    )
  }

  const roles = [...block.roles]
  const rolesTotal = block.roles_total
  const rolesTruncated = block.roles_truncated
  const rolesOmittedUnresolved = block.roles_omitted_unresolved
  const decisionAuthority = authorities.find(
    item => item.label === DECISION_AUTHORITY_LABEL,
  )
  // Read from the refined block, with no fallback: the authority is either
  // absent (explicitly null, which partial legitimately is) or complete.
  const decisionGeneration =
    block.decision_authority === null ? null : block.decision_authority.generation

  /*
   * Empty-authoritative is the strongest claim this tab makes — "nothing is
   * bound here" — so it is allowed only when the projection is complete in
   * every dimension it reports. `roles.length === 0` alone is NOT enough:
   * _read_bindings drops a role whose AWS RoleId is unresolved, counts it in
   * roles_total and roles_omitted_unresolved, and raises a ROLE_ID_UNRESOLVED
   * gap. That payload has zero roles and status "partial" while workloads ARE
   * bound, and saying "no workload is bound" there is simply false.
   */
  const emptyAuthoritative =
    status === "ready" &&
    roles.length === 0 &&
    rolesTotal === 0 &&
    !rolesTruncated &&
    rolesOmittedUnresolved === 0 &&
    gaps.length === 0

  const base = {
    ...common,
    projectionStatus: status,
    receipts: authorities,
    roles,
    rolesTotal,
    rolesReturned: block.roles_returned,
    rolesTruncated,
    rolesOmittedUnresolved,
    gaps,
  }

  if (emptyAuthoritative) {
    return shell(
      "ready",
      "No workload in this scope is bound to an IAM role.",
      "The active canonical generation was read successfully and holds no " +
        "workload-to-role binding here. That is an answer, not a missing read.",
      { ...base, emptyAuthoritative: true },
    )
  }

  if (roles.length === 0) {
    // Readable, but nothing to draw and the projection's own counters say roles
    // exist. Naming each reason keeps this apart from "nothing is bound".
    const reasons: string[] = []
    if (rolesOmittedUnresolved !== null && rolesOmittedUnresolved > 0) {
      reasons.push(
        `${rolesOmittedUnresolved} role${rolesOmittedUnresolved === 1 ? " was" : "s were"} ` +
          "omitted because the canonical attachment carries no AWS RoleId",
      )
    }
    if (rolesTruncated) reasons.push("the role list was truncated")
    if (gaps.length > 0) {
      reasons.push(`the projector reported ${gaps.length} gap${gaps.length === 1 ? "" : "s"}`)
    }
    if (rolesTotal !== null && rolesTotal > 0 && reasons.length === 0) {
      reasons.push(`the projection counted ${rolesTotal} but returned none`)
    }
    return shell(
      "incomplete",
      rolesTotal !== null && rolesTotal > 0
        ? `${rolesTotal} role${rolesTotal === 1 ? "" : "s"} in this scope could not be shown.`
        : "This projection returned no roles, and it is not authoritative that none exist.",
      (reasons.length > 0
        ? `${reasons.join("; ")}. `
        : "The projection did not report why. ") +
        "This is NOT a statement that no workload is bound — the map is empty " +
        "because the roles could not be rendered, not because there are none.",
      { ...base, emptyAuthoritative: false },
    )
  }

  const decided = roles.filter(role => role.configured_grants?.state === "ready").length
  const withheld = roles.length - decided
  /*
   * "hash-verified" is a claim about a receipt, so it is said only when a
   * receipt exists. A pointer activated before that field existed carries a
   * generation and no receipt hash: it is readable and servable, and simply
   * not certifiable — the pointer contract says so in those words. Calling it
   * hash-verified would upgrade an uncertifiable generation to a certified one
   * in the reader's mind.
   */
  const decisionCertified = block.decision_authority?.projection_receipt_hash != null
  const decisionNamed = decisionCertified
    ? `hash-verified decision authority (generation ${decisionGeneration})`
    : `decision authority at generation ${decisionGeneration} (no projection ` +
      "receipt, so this generation is readable but not certifiable)"
  let detail: string
  if (decisionAuthority === undefined) {
    detail =
      "Read from the active canonical inventory generation. No decision authority " +
      "was read for this scope, so no role shows configured or observed action counts."
  } else if (withheld === 0) {
    detail = `Read from the active canonical inventory generation, joined to the ${decisionNamed}.`
  } else {
    detail =
      `Read from the active canonical inventory generation and joined to the ${decisionNamed}, ` +
      `which withheld decision evidence for ${withheld} of ${roles.length} ` +
      `role${roles.length === 1 ? "" : "s"}.`
  }

  return shell(
    "ready",
    `${roles.length} role${roles.length === 1 ? "" : "s"} bound to workloads in this scope.`,
    detail,
    {
      ...base,
      graph: buildGraph(roles, { decisionGeneration }),
      emptyAuthoritative: false,
    },
  )
}

/* ── map layout ────────────────────────────────────────────────────────────
 *
 * Deterministic geometry for the identity map, computed here rather than in
 * the component so the shape of the drawing is testable without a DOM.
 *
 * Three lanes, left to right, matching the direction authority actually flows:
 * a workload runs AS a role, and that role's actions are decided BY the
 * decision authority. Every edge points that way, and the renderer draws an
 * arrowhead at the target end.
 */

/** Viewport-independent units. The SVG scales via viewBox, never fixed pixels. */
export const LANE_X = { workload: 140, role: 430, decision: 760 } as const
export const NODE_W = { workload: 210, role: 210, decision: 260 } as const
export const NODE_H = 56
export const NODE_GAP = 22
export const CANVAS_W = 1020
export const CANVAS_PAD_Y = 56

export interface PlacedNode {
  node: GraphNode
  x: number
  y: number
  width: number
  height: number
  /** Which lane it sits in, so the renderer never infers a kind from geometry. */
  lane: "workload" | "role" | "decision"
}

export interface PlacedEdge {
  edge: GraphEdge
  /** Cubic bezier, left node's right edge to right node's left edge. */
  path: string
  /** Midpoint, for the plane label. */
  labelX: number
  labelY: number
}

export interface MapLayout {
  width: number
  height: number
  nodes: PlacedNode[]
  edges: PlacedEdge[]
}

function laneOf(node: GraphNode): "workload" | "role" | "decision" {
  return node.kind
}

/**
 * Place every node and route every edge.
 *
 * Each lane is centred vertically against the tallest lane, so a role with two
 * workloads sits between them instead of at the top — the branch reads as a
 * branch. Order within a lane follows the order buildGraph emitted, which is
 * the projector's own sort, so the drawing is stable across renders.
 */
export function layoutGraph(graph: IdentityGraph): MapLayout {
  const lanes: Record<"workload" | "role" | "decision", GraphNode[]> = {
    workload: [],
    role: [],
    decision: [],
  }
  for (const node of graph.nodes) lanes[laneOf(node)].push(node)

  const tallest = Math.max(
    lanes.workload.length,
    lanes.role.length,
    lanes.decision.length,
    1,
  )
  const height = CANVAS_PAD_Y * 2 + tallest * NODE_H + (tallest - 1) * NODE_GAP

  const placed: PlacedNode[] = []
  const byId = new Map<string, PlacedNode>()
  for (const lane of ["workload", "role", "decision"] as const) {
    const items = lanes[lane]
    const laneHeight = items.length * NODE_H + Math.max(0, items.length - 1) * NODE_GAP
    const top = (height - laneHeight) / 2
    items.forEach((node, index) => {
      const item: PlacedNode = {
        node,
        x: LANE_X[lane] - NODE_W[lane] / 2,
        y: top + index * (NODE_H + NODE_GAP),
        width: NODE_W[lane],
        height: NODE_H,
        lane,
      }
      placed.push(item)
      byId.set(node.id, item)
    })
  }

  const edges: PlacedEdge[] = []
  for (const edge of graph.edges) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    // An edge whose endpoints are not both placed is dropped rather than drawn
    // to a guessed coordinate. buildGraph never emits one; this is a guard, not
    // a behaviour.
    if (!from || !to) continue
    const x1 = from.x + from.width
    const y1 = from.y + from.height / 2
    const x2 = to.x
    const y2 = to.y + to.height / 2
    const bend = Math.max(28, (x2 - x1) / 2)
    edges.push({
      edge,
      path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2 - 8,
    })
  }

  return { width: CANVAS_W, height, nodes: placed, edges }
}
