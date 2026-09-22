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

import type { IdentityEdgeAnnotation, TopologyRiskResponse, TrafficEdge } from "./types"

/**
 * Closed set, mirrored from scripts/estate_relationship_capability.py at
 * saferemediate-backend 41f5dda3 (seven codes; the two added with the
 * attribute-backed families are ENDPOINT_NOT_A_PROJECTED_RESOURCE and
 * SOURCE_CALL_NOT_ACQUIRED).
 */
export const CAPABILITY_REASON_CODES = [
  "ASSET_ANCHORED_AUTHORITY_ONLY",
  "CANONICAL_PRODUCER_UNWIRED",
  "CLASSIFICATION_CONFLICT",
  "ENDPOINT_NOT_A_PROJECTED_RESOURCE",
  "NOT_ROLE_ANCHORED",
  "NO_CANONICAL_PRODUCER",
  "SOURCE_CALL_NOT_ACQUIRED",
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
  "ACCOUNT_IN_ORGANIZATION",
  "ACCOUNT_IN_ORG_UNIT",
  "ACCOUNT_LIMITED_BY_RCP",
  "ACCOUNT_LIMITED_BY_SCP",
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
  "PRINCIPAL_HAS_INLINE_POLICY",
  "PRINCIPAL_HAS_MANAGED_POLICY",
  "PRINCIPAL_HAS_PERMISSIONS_BOUNDARY",
  "RESOURCE_POLICY_GRANT",
  "ROLE_ACTION_DECISION",
  "ROLE_TRUST_POLICY",
  "TARGETS",
  "TRUSTS",
  "USER_AUTHENTICATES_WITH",
  "USER_MEMBER_OF_GROUP",
  "USES_KMS_KEY",
  "WORKLOAD_USES_ROLE",
] as const

/**
 * One capability row, against the producer's own invariants — not just shape.
 *
 * The two statuses are opposite claims and carry opposite obligations:
 *
 *   available    stands on a named plane, and names the writer that produces
 *                it and the bounded read that serves it. Since 41f5dda3 an
 *                available ATTRIBUTE-BACKED family may carry a qualifying
 *                reason code from the closed set (USER_MEMBER_OF_GROUP and
 *                PRINCIPAL_HAS_INLINE_POLICY carry
 *                ENDPOINT_NOT_A_PROJECTED_RESOURCE; USER_AUTHENTICATES_WITH
 *                carries SOURCE_CALL_NOT_ACQUIRED) — a caveat on how the
 *                family is served, not an excuse for not serving it.
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
      isText(value.bounded_read)
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

/* ── the nested identity graph (estate-identity-graph/v1) ──────────────────
 *
 * saferemediate-backend nests a second, self-versioned block inside
 * the v1 payload: `identity_access.identity_graph`, built by
 * scripts/estate_identity_graph.py and read by
 * scripts/estate_identity_access._read_identity_graph. It carries the typed
 * principal / policy / group / trust / credential / resource-grant
 * relationships that the canonical inventory holds as ATTRIBUTES of the
 * principal rather than as graph edges. Every edge here is one the producer
 * derived and says so — `edge_type: None` in the capability matrix.
 *
 * The block versions itself and is additive. Before CF01 lane F (0a23a666),
 * unified/tenant_lifecycle/serving.py rebuilt the payload from an explicit key
 * list that omitted `identity_graph`, so EVERY lifecycle refusal deleted the
 * key. It no longer does: an inventory-visible refusal now carries the block
 * verbatim, a withholding refusal carries an explicit `unavailable` block whose
 * gap names the refusal code, and a source that never had the key still has
 * none. So absent, unavailable and empty remain three different facts — but
 * absent no longer implies "an old backend", and nothing here may key on that.
 */

export const IDENTITY_GRAPH_CONTRACT_VERSION = "estate-identity-graph/v1"

/** Mirrors scripts/estate_identity_graph.py NODE_KINDS (closed). */
export const IDENTITY_GRAPH_NODE_KINDS = [
  "iam_role",
  "iam_user",
  "iam_policy",
  "iam_group",
  "federated_principal",
  "service_principal",
  "aws_account_principal",
  "workload",
  "protected_resource",
  // CF01 lane F (6e08d6b2). `aws_account` is THIS account as a placed thing in
  // an organisation; `aws_account_principal` above is an account named in a
  // trust policy. One icon for both would let a trusted external account read
  // as the tenant's own, so they stay two kinds with two labels.
  "aws_account",
  "organization",
  "organizational_unit",
  "control_policy",
] as const
export type IdentityGraphNodeKind = (typeof IDENTITY_GRAPH_NODE_KINDS)[number]

/** Mirrors scripts/estate_identity_graph.py EDGE_FAMILIES (closed). */
export const IDENTITY_GRAPH_EDGE_FAMILIES = [
  "WORKLOAD_USES_ROLE",
  "PRINCIPAL_HAS_MANAGED_POLICY",
  "PRINCIPAL_HAS_INLINE_POLICY",
  "PRINCIPAL_HAS_PERMISSIONS_BOUNDARY",
  "USER_MEMBER_OF_GROUP",
  "ROLE_TRUST_POLICY",
  "USER_AUTHENTICATES_WITH",
  "RESOURCE_POLICY_GRANT",
  "ROLE_ACTION_DECISION",
  // CF01 lane F (6e08d6b2), from organizations:account-policy-context. These
  // are NOT the legacy IN_ORG / IN_ORG_UNIT / LIMITED_BY_SCP families in the
  // capability matrix, which stay unavailable: those ask "may I draw that
  // edge?" and the answer is still no. These answer "what bounds this
  // account?" from a generation-pinned attribute. IF-F1 §2: do not collapse
  // the two.
  "ACCOUNT_IN_ORGANIZATION",
  "ACCOUNT_IN_ORG_UNIT",
  // SCP and RCP are SEPARATE families and must not be merged in a legend or a
  // filter. An SCP bounds what principals IN this account may do; an RCP
  // bounds what anyone may do TO its resources.
  "ACCOUNT_LIMITED_BY_SCP",
  "ACCOUNT_LIMITED_BY_RCP",
] as const
export type IdentityGraphEdgeFamily = (typeof IDENTITY_GRAPH_EDGE_FAMILIES)[number]

/**
 * The account-context families, which are all CONFIGURED by construction.
 *
 * `_edge()` passes `plane="configured"` on every one of them at the producer,
 * so an account-context edge that arrived on the observed plane would be a
 * contract violation rather than a fact — and motion on one would claim an
 * organisation placement was *observed happening*, which nothing observes.
 */
export const ACCOUNT_CONTEXT_FAMILIES = [
  "ACCOUNT_IN_ORGANIZATION",
  "ACCOUNT_IN_ORG_UNIT",
  "ACCOUNT_LIMITED_BY_SCP",
  "ACCOUNT_LIMITED_BY_RCP",
] as const
export type AccountContextFamily = (typeof ACCOUNT_CONTEXT_FAMILIES)[number]

export function isAccountContextFamily(family: string): family is AccountContextFamily {
  return (ACCOUNT_CONTEXT_FAMILIES as readonly string[]).includes(family)
}

/**
 * The producer's closed set of account-context refusal codes.
 *
 * Mirrored from scripts/estate_identity_graph.account_context_graph. Each one
 * means NO account node was built, and each is a different reason. None of
 * them means "this account is in no organisation" — that claim has its own
 * positive signal (`organization_context_state: "STANDALONE_ACCOUNT"`).
 */
export const ACCOUNT_CONTEXT_GAP_CODES = {
  ACCOUNT_POLICY_CONTEXT_ABSENT: "unknown",
  ACCOUNT_POLICY_CONTEXT_AMBIGUOUS: "refused",
  ACCOUNT_POLICY_CONTEXT_FOREIGN: "refused",
  ACCOUNT_POLICY_CONTEXT_INCOMPLETE: "refused",
} as const satisfies Record<string, "unknown" | "refused">

export type AccountContextGapCode = keyof typeof ACCOUNT_CONTEXT_GAP_CODES

/**
 * Codes the producer publishes when a refusal happened that its own contract
 * CANNOT NAME.
 *
 * Every other gap code is a diagnosis: `ACCOUNT_POLICY_CONTEXT_FOREIGN` says
 * which thing was wrong. These three say only that something failed, and their
 * detail carries the exception TYPE rather than a cause — the producer emits
 * them instead of promoting an exception message into the payload's
 * vocabulary, which is how "Out of range float values are not JSON compliant"
 * once became a gap code a consumer had to parse.
 *
 * They are listed here because the lens prints a gap code beside its detail,
 * and a token printed that way reads as a named finding. `Canonical inventory
 * role bindings could not be verified: ValueError.` next to a real diagnosis
 * invites a reader to treat "ValueError" as the finding. The UI must show the
 * code — support needs it — while saying that the cause behind it is not
 * known, so an unnamed refusal is never mistaken for an identified one.
 *
 * The criterion is the producer's own: these are the gaps whose detail is
 * built from `type(exc).__name__`. Verified against
 * `scripts/estate_identity_access.py` at CF01-F `b0d94a74`.
 */
export const UNNAMED_REFUSAL_GAP_CODES = [
  "INVENTORY_AUTHORITY_INVALID",
  "IDENTITY_ACCESS_READ_FAILED",
  "IDENTITY_GRAPH_READ_FAILED",
] as const

export type UnnamedRefusalGapCode = (typeof UNNAMED_REFUSAL_GAP_CODES)[number]

/** Does this gap name a cause, or only report that one was not established? */
export function gapNamesItsCause(code: string): boolean {
  return !(UNNAMED_REFUSAL_GAP_CODES as readonly string[]).includes(code)
}

/**
 * The planes the producer's call sites actually emit. `_edge()` also accepts
 * "effective", but no call site at 41f5dda3 passes it, so it is not a plane
 * this lens knows how to draw; an edge carrying it withholds the block rather
 * than being guessed at.
 */
export const IDENTITY_GRAPH_EDGE_PLANES = ["configured", "observed"] as const

export const IDENTITY_GRAPH_STATUSES = ["partial", "ready", "unavailable"] as const

export interface IdentityGraphEndpoint {
  node_kind: string
  resource_uid: string | null
  arn: string | null
  name: string | null
  /** `_endpoint()` writes `resolved`; a full node (principal/policy/protected
   *  resource) omits it and is resolved by construction. */
  resolved: boolean
  unresolved_reason: string | null
  /** Every other producer field on the endpoint (a full node carries
   *  `protects_arn`, `resource_type`, `principal_id`, …), verbatim. */
  extra: Record<string, unknown>
}

export interface IdentityGraphEdge {
  family: IdentityGraphEdgeFamily
  plane: "configured" | "observed"
  source: IdentityGraphEndpoint | null
  target: IdentityGraphEndpoint | null
  /** Every producer field beyond family/plane/source/target, verbatim. */
  extra: Record<string, unknown>
}

export interface IdentityGraphNode {
  node_kind: IdentityGraphNodeKind
  resource_uid: string | null
  arn: string | null
  name: string | null
  extra: Record<string, unknown>
}

export type IdentityGraphState = "absent" | "invalid" | "unavailable" | "partial" | "ready"

/**
 * Was the identity graph actually READ?
 *
 * scripts/estate_identity_graph.unavailable_identity_graph hardcodes
 * nodes_total/edges_total to null, and its docstring names why: an empty
 * node/edge list on its own "claims an estate with no identities, which is the
 * inversion every other refusal in this contract exists to prevent". So the
 * lists are NOT the discriminator — a real empty and a failed read both carry
 * `nodes: []` and `edges: []`. An integer total (including 0) is an answer.
 */
export function identityGraphWasRead(graph: IdentityGraphView): boolean {
  return graph.state === "ready" || graph.state === "partial"
}

/**
 * What an empty identity canvas is allowed to claim.
 *
 *   "not_empty"       — relationships are drawn; no emptiness claim at all.
 *   "qualified_empty" — the roles projection is authoritatively empty AND the
 *                       identity graph was read and returned nothing. The
 *                       ROLE-BINDING claim is backed; the absence of every
 *                       other family is NOT, and must be named as unknown.
 *   "unread"          — nothing is drawn because the graph was never read.
 *
 * There is deliberately no unqualified "authoritative empty". See
 * IDENTITY_FAMILY_COVERAGE_MISSING_LINK: the installed producer cannot
 * establish that a family was acquired, so a frontend may never certify that
 * every source was read. A query returning no rows and a query that was never
 * issued are the same bytes.
 */
export type IdentityEmptyClaim = "not_empty" | "qualified_empty" | "unread"

/**
 * The exact producer contract gap that stops an empty canvas from being an
 * unqualified answer. Named here, in one place, so the UI quotes it rather
 * than inventing reassurance — and so it is obvious what has to land in the
 * backend before this qualification can be lifted.
 *
 * Reproduced against scripts/estate_identity_graph.py at 6e08d6b2: two users,
 * available policies, a positively standalone account and ZERO credential rows
 * returns status "ready" with no gaps and no credential edges. Nothing
 * reported that the per-user credential rows were never acquired, because:
 *   - estate_identity_access.py has no per-user missing-credential-row check;
 *   - it carries no family acquisition coverage, so "acquired and empty" and
 *     "never acquired" are indistinguishable;
 *   - estate_identity_graph.py derives status purely from the ABSENCE of gaps
 *     and truncation, which is readiness, not coverage.
 *
 * The producer does carry per-source acquisition booleans
 * (access_keys_acquired, console_access_acquired, mfa_acquired,
 * managed_policy_documents_available) but only raises SOURCE_CALL_NOT_ACQUIRED
 * when one is explicitly False — a missing or null flag raises nothing. The
 * predicate fails OPEN on absence, which is why silence cannot be read as
 * coverage.
 */
export const IDENTITY_FAMILY_COVERAGE_MISSING_LINK =
  "The producer reports readiness from the absence of gaps, not from evidence that each " +
  "relationship family was collected. It carries no per-family acquisition receipt, so a " +
  "family that returned no rows and a family that was never read are indistinguishable here. " +
  "Absence below is therefore unknown, not zero."

/**
 * Families whose absence on an empty canvas is UNKNOWN rather than zero.
 *
 * Workload-to-role binding is excluded: the v1 inventory_authority receipt
 * carries workload_binding_completeness / count / set hash, which IS positive
 * coverage evidence for that one family. Every other family the lens can draw
 * has no equivalent receipt.
 */
export const IDENTITY_FAMILIES_WITHOUT_COVERAGE_RECEIPT: readonly string[] =
  IDENTITY_GRAPH_EDGE_FAMILIES.filter(family => family !== "WORKLOAD_USES_ROLE")

export function identityEmptyClaim(
  view: IdentityView,
  graph: IdentityGraphView,
): IdentityEmptyClaim {
  const readable = view.state === "ready" || view.state === "incomplete"
  if (!readable) return "unread"
  // EITHER independent source having content means the canvas is not empty.
  // Judging emptiness from the nested graph alone called a lens with two real
  // WORKLOAD_USES_ROLE edges "unread" whenever the graph was refused — the
  // same graph-only bias that stopped the host mounting the canvas.
  if (graph.edges.length > 0 || view.roles.length > 0) return "not_empty"
  if (!identityGraphWasRead(graph)) return "unread"
  const rolesAuthoritativelyEmpty =
    view.emptyAuthoritative &&
    !graph.truncated &&
    !view.rolesTruncated &&
    view.gaps.length === 0 &&
    graph.gaps.length === 0
  return rolesAuthoritativelyEmpty ? "qualified_empty" : "unread"
}

export interface IdentityGraphView {
  state: IdentityGraphState
  headline: string
  detail: string
  contractVersion: string | null
  nodes: IdentityGraphNode[]
  edges: IdentityGraphEdge[]
  nodesTotal: number | null
  edgesTotal: number | null
  truncated: boolean
  gaps: IdentityGap[]
}

function endpointOf(value: unknown): IdentityGraphEndpoint | null | "malformed" {
  if (value === null || value === undefined) return null
  if (!isPlainObject(value)) return "malformed"
  if (!isText(value.node_kind)) return "malformed"
  const uid = value.resource_uid
  const arn = value.arn
  const name = value.name
  if (uid !== undefined && uid !== null && !isText(uid)) return "malformed"
  if (arn !== undefined && arn !== null && typeof arn !== "string") return "malformed"
  if (name !== undefined && name !== null && typeof name !== "string") return "malformed"
  const reason = value.unresolved_reason
  if (reason !== undefined && reason !== null && !isText(reason)) return "malformed"
  const resolved =
    typeof value.resolved === "boolean" ? value.resolved : isText(uid)
  const extra: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!["node_kind", "resource_uid", "arn", "name", "resolved", "unresolved_reason"].includes(key)) {
      extra[key] = item
    }
  }
  return {
    node_kind: value.node_kind,
    resource_uid: isText(uid) ? uid : null,
    arn: typeof arn === "string" && arn !== "" ? arn : null,
    name: typeof name === "string" && name !== "" ? name : null,
    resolved,
    unresolved_reason: isText(reason) ? reason : null,
    extra,
  }
}

function graphShell(
  state: IdentityGraphState,
  headline: string,
  detail: string,
  extra: Partial<IdentityGraphView> = {},
): IdentityGraphView {
  return {
    state,
    headline,
    detail,
    contractVersion: null,
    nodes: [],
    edges: [],
    nodesTotal: null,
    edgesTotal: null,
    truncated: false,
    gaps: [],
    ...extra,
  }
}

/**
 * Decide what the nested identity graph may contribute to the lens.
 *
 * `raw` is `identity_access.identity_graph` exactly as served. Absent, invalid,
 * unavailable, partial and ready are five different facts and each is named.
 */
export function buildIdentityGraphView(raw: unknown): IdentityGraphView {
  if (raw === undefined) {
    return graphShell(
      "absent",
      "This identity block carries no identity graph.",
      "The served block was rebuilt without its estate-identity-graph/v1 section, " +
        "or was produced by a backend that predates it. Policies, trust, groups, " +
        "credentials and resource-policy grants are unknown here — not absent.",
    )
  }
  if (raw === null || !isPlainObject(raw)) {
    return graphShell(
      "invalid",
      "The identity graph on this block is not readable.",
      "A value is present where the identity graph should be, but it is not an object. " +
        "It is withheld rather than rendered as data.",
    )
  }
  const contractVersion = str(raw.contract_version)
  if (contractVersion !== IDENTITY_GRAPH_CONTRACT_VERSION) {
    return graphShell(
      "invalid",
      "The identity graph names a contract this lens does not read.",
      `Expected ${IDENTITY_GRAPH_CONTRACT_VERSION}; the block says ` +
        `${contractVersion ?? "nothing"}. It is withheld rather than guessed at.`,
      { contractVersion },
    )
  }
  const status = str(raw.status)
  if (status === null || !(IDENTITY_GRAPH_STATUSES as readonly string[]).includes(status)) {
    return graphShell(
      "invalid",
      "The identity graph reports a status this contract does not define.",
      `Expected one of ${IDENTITY_GRAPH_STATUSES.join(", ")}; the block says ` +
        `${status ?? "nothing"}.`,
      { contractVersion },
    )
  }
  const violation = (why: string): IdentityGraphView =>
    graphShell(
      "invalid",
      "The identity graph claims its contract but does not match it.",
      `It is withheld because ${why}.`,
      { contractVersion },
    )
  for (const field of ["nodes", "edges", "nodes_total", "edges_total", "truncated", "gaps"] as const) {
    if (!(field in raw)) return violation(`it omits ${field}, which the producer always writes`)
  }
  if (!Array.isArray(raw.nodes)) return violation("its `nodes` is not a list")
  if (!Array.isArray(raw.edges)) return violation("its `edges` is not a list")
  if (!Array.isArray(raw.gaps) || !raw.gaps.every(validGap)) {
    return violation("its `gaps` is not a list of {code, detail}")
  }
  if (typeof raw.truncated !== "boolean") return violation("its `truncated` is not a boolean")
  const nodesTotal = raw.nodes_total
  const edgesTotal = raw.edges_total
  if (status === "unavailable") {
    if (nodesTotal !== null || edgesTotal !== null) {
      return violation("an unavailable graph reports totals")
    }
    if (raw.nodes.length > 0 || raw.edges.length > 0) {
      return violation("an unavailable graph carries nodes or edges")
    }
  } else {
    /**
     * A total is a MAINTAINED AUTHORITATIVE COUNT or an EXPLICIT UNKNOWN.
     *
     * This used to require an integer for every non-unavailable status, which
     * rejected the only honest answer a bounded read can give about a
     * population it did not finish. CF01-F now returns `null` in exactly that
     * case, so the old rule hid a capped partial graph completely — the same
     * class of failure as the host gates fixed earlier in this lane, arriving
     * from the producer side.
     *
     * `null` is accepted; a WRONG total is still rejected. Unknown and invalid
     * are different answers, which is the distinction this whole lens exists
     * to keep — so `isCount` is not loosened, it is simply not demanded of a
     * value that declines to make a claim.
     */
    if (nodesTotal !== null && !isCount(nodesTotal)) {
      return violation("its nodes_total is neither a non-negative integer nor null")
    }
    if (edgesTotal !== null && !isCount(edgesTotal)) {
      return violation("its edges_total is neither a non-negative integer nor null")
    }
    /**
     * Verified against cf01/be-F scripts/estate_identity_access.py:540 —
     * `edges_total=(None if truncated else len(edges))`. So when the producer
     * states an edge total at all, it has read the whole population and that
     * total IS the carried count; when it truncated, it states `null` rather
     * than a smaller number. The equality therefore still holds wherever a
     * number is present, and this check keeps its original job: catching a
     * block whose own totals contradict what it carries.
     *
     * It is deliberately NOT extended to `nodes_total`, which is a pre-cap
     * census (`_node_census`) and is expected to EXCEED `nodes.length`.
     */
    if (edgesTotal !== null && edgesTotal !== raw.edges.length) {
      return violation(`it reports ${edgesTotal} edges but carries ${raw.edges.length}`)
    }
  }

  const nodes: IdentityGraphNode[] = []
  for (const item of raw.nodes as unknown[]) {
    if (!isPlainObject(item)) return violation("a node is not an object")
    const kind = item.node_kind
    if (!(IDENTITY_GRAPH_NODE_KINDS as readonly unknown[]).includes(kind)) {
      return violation(`a node carries kind ${String(kind)}, which this contract does not define`)
    }
    const { node_kind, resource_uid, arn, name, ...extra } = item
    void node_kind
    nodes.push({
      node_kind: kind as IdentityGraphNodeKind,
      resource_uid: isText(resource_uid) ? resource_uid : null,
      arn: typeof arn === "string" && arn !== "" ? arn : null,
      name: typeof name === "string" && name !== "" ? name : null,
      extra,
    })
  }

  const edges: IdentityGraphEdge[] = []
  for (const item of raw.edges as unknown[]) {
    if (!isPlainObject(item)) return violation("an edge is not an object")
    const family = item.family
    if (!(IDENTITY_GRAPH_EDGE_FAMILIES as readonly unknown[]).includes(family)) {
      return violation(`an edge carries family ${String(family)}, which this contract does not define`)
    }
    const plane = item.plane
    if (!(IDENTITY_GRAPH_EDGE_PLANES as readonly unknown[]).includes(plane)) {
      return violation(
        `an edge carries plane ${String(plane)}, which no producer path emits and this lens does not draw`,
      )
    }
    const source = endpointOf(item.source)
    const target = endpointOf(item.target)
    if (source === "malformed" || target === "malformed") {
      return violation("an edge endpoint is not the shape _endpoint() writes")
    }
    const { family: f, plane: p, source: s, target: t, ...extra } = item
    void f
    void p
    void s
    void t
    edges.push({
      family: family as IdentityGraphEdgeFamily,
      plane: plane as "configured" | "observed",
      source,
      target,
      extra,
    })
  }

  const gaps = [...(raw.gaps as IdentityGap[])]
  if (status === "unavailable") {
    return graphShell(
      "unavailable",
      "The identity graph could not be read for this generation.",
      gaps.length > 0
        ? "The bounded reader refused. Each gap below names why."
        : "The reader reported the graph unavailable without naming a gap code.",
      { contractVersion, gaps },
    )
  }
  const truncated = raw.truncated
  const totalsNote =
    `${raw.edges.length} relationship${raw.edges.length === 1 ? "" : "s"} across ` +
    `${nodes.length} identity node${nodes.length === 1 ? "" : "s"}` +
    (truncated ? " — the producer truncated this read; totals name the cut." : ".")
  return graphShell(
    status === "partial" ? "partial" : "ready",
    status === "partial"
      ? "Identity graph read with gaps."
      : "Identity graph read from the active canonical generation.",
    status === "partial"
      ? `${totalsNote} ${gaps.length} gap${gaps.length === 1 ? "" : "s"} name what was not acquired or was cut.`
      : totalsNote,
    {
      contractVersion,
      nodes,
      edges,
      nodesTotal: nodesTotal as number,
      edgesTotal: edgesTotal as number,
      truncated,
      gaps,
    },
  )
}

/* ── the identity lens on the shared canvas ────────────────────────────────
 *
 * Everything the Estate canvas needs to draw identity relationships ON the
 * same AwsFrame the Network view uses: identity-plane nodes that become chips
 * with `data-flow-id` anchors, typed edges that become FlowOverlay lines, and
 * the family verdicts the legend reports. Workloads and protected resources
 * that already exist on the topology keep their topology ids, so the two
 * views share resource identity and placement.
 *
 * Nothing here is inferred. A node exists because the producer named it (as
 * a v1 role, a graph node, or an edge endpoint); an edge exists because the
 * producer emitted it; a plane is the producer's plane; certainty is the
 * producer's own `unresolved_reason`.
 */

export type IdentityPlane = "configured" | "observed"
export type IdentityCertainty = "resolved" | "unresolved_endpoint"

/**
 * The reading a line carries, stated as the producer stated it and in the
 * vocabulary the legend prints beside the line:
 *
 *   configured  a policy, binding, trust or placement fact from the canonical
 *               generation — never evidence that anything happened.
 *   observed    evidence that was read (a credential last used, an action
 *               decided against observed use).
 *   denied      the producer's own `effect: "Deny"` on a trust statement. A
 *               Deny is configured state, but a line that reads like an
 *               allowance is the opposite of what it says, so it is its own
 *               word and its own stroke.
 *   unknown     the producer withheld the far end: a decision record that was
 *               not read. Not zero, not allowed, not denied — not known here.
 *
 * "effective" / "allowed" is deliberately NOT a verdict. Nothing in the
 * installed contract projects an effective decision (every record carries
 * availability "unavailable" with ACTION_AND_RESOURCE_SCOPE_REQUIRED /
 * NO_PROJECTED_EFFECTIVE_DECISION), so no line may claim one.
 */
export type IdentityVerdict = "configured" | "observed" | "denied" | "unknown"

export type IdentityLensNodeKind =
  | "workload"
  | "iam_role"
  | "iam_user"
  | "iam_policy"
  | "iam_group"
  | "service_principal"
  | "federated_principal"
  | "aws_account_principal"
  | "credential"
  | "protected_resource"
  | "resource_policy"
  | "decision"
  // CF01 lane F (6e08d6b2) — the account's own Organizations placement.
  // `aws_account` is THIS account as a placed thing; `aws_account_principal`
  // above is an account named in a trust policy. They stay two kinds.
  | "aws_account"
  | "organization"
  | "organizational_unit"
  // One kind for both control-policy types, because that is the producer's
  // node_kind. WHICH type (SCP vs RCP) is the edge's `control_policy_type`,
  // carried onto the chip as its sublabel and never merged in a legend.
  | "control_policy"

export type IdentityLensEdgeFamily = IdentityGraphEdgeFamily

/**
 * Canvas anchor ids for identity-plane chips: `__identity:<kind>:<key>__`.
 *
 * The frame's existing rule (service-paths.ts `isCanvasAnchorId`) treats any
 * `__…__` id as a canvas anchor, and `inspectableResourceId` then refuses to
 * ask Inventory about it. Spelling identity anchors in that same convention
 * means the DetailPanel makes no dossier request for one without any lens
 * special-casing — the existing rule does the work.
 */
export const IDENTITY_ANCHOR_PREFIX = "__identity:"

export function identityAnchorId(kind: IdentityLensNodeKind, key: string): string {
  return `${IDENTITY_ANCHOR_PREFIX}${kind}:${key}__`
}

export function isIdentityAnchorId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(IDENTITY_ANCHOR_PREFIX) && id.endsWith("__")
}

export interface IdentityLensNode {
  id: string
  kind: IdentityLensNodeKind
  label: string
  sublabel: string | null
  /** The chip is already drawn by the topology (workload / regional service);
   *  the lens adds edges to it and never a second chip. */
  onCanvas: boolean
  /** False when the producer marked the endpoint as not a projected resource:
   *  the chip renders in a name-only, missing-evidence state. */
  resolved: boolean
  unresolvedReason: string | null
  arn: string | null
  resourceUid: string | null
  lifecycleState: string | null
  /** Short producer facts to print on the chip / in the inspector. */
  facts: string[]
  /** Gaps the producer attached to this node's resource_uid. */
  gaps: IdentityGap[]
}

export interface IdentityLensEdge {
  id: string
  family: IdentityLensEdgeFamily
  plane: IdentityPlane
  certainty: IdentityCertainty
  /** The word the legend prints for this line; see IdentityVerdict. */
  verdict: IdentityVerdict
  sourceId: string
  targetId: string
  /** Badge word on the line. */
  label: string
  /** Observed AND backed by a named generation: the only case that may move. */
  animated: boolean
  generation: number | null
  lastSeen: string | null
  facts: Record<string, string | number | boolean | null>
}

export interface IdentityFamilyVerdict {
  family: string
  status: "available" | "unavailable" | "no_verdict"
  plane: string | null
  reason_codes: string[]
  detail: string
  /** Edges of this family the lens actually produced. */
  drawn: number
}

export interface IdentityLens {
  /** The v1 view state — what the tenant projection said. */
  state: IdentityViewState
  graphState: IdentityGraphState
  headline: string
  detail: string
  /** True when NOTHING may be drawn: the canvas must show the reason, never a
   *  silent empty frame. */
  nothingToDraw: boolean
  /**
   * The ONE empty canvas that is an answer.
   *
   * An empty canvas means "we looked and there is nothing here" only when
   * EVERY source that feeds it is authoritative: the v1 roles projection is
   * authoritatively empty AND the identity graph was actually read AND
   * nothing anywhere was withheld, truncated or left unread.
   *
   * This is deliberately not `state === "ready" && edges.length === 0`.
   * `state` is the v1 ROLES projection's word; a payload can read its roles
   * perfectly and still have failed to read its identity graph, and that
   * combination produced a confident "that is an answer, not a missing read"
   * over a graph nobody had read. An authoritative empty and missing evidence
   * are different answers and must never render identically.
   *
   * NOTE: this is a QUALIFIED empty, never an unqualified one. See
   * IDENTITY_FAMILY_COVERAGE_MISSING_LINK — the installed producer cannot
   * prove that a family was acquired, so the backed claim is limited to
   * workload-to-role binding and every other family's absence stays unknown.
   */
  emptyAnswer: boolean
  /** The three-way claim an empty canvas is allowed to make. */
  emptyClaim: IdentityEmptyClaim
  /** Families whose absence carries no acquisition receipt — unknown, not zero. */
  familiesWithoutCoverageReceipt: string[]
  /** The producer contract gap, quoted rather than paraphrased. */
  coverageMissingLink: string
  nodes: IdentityLensNode[]
  edges: IdentityLensEdge[]
  families: IdentityFamilyVerdict[]
  truncation: {
    nodesTotal: number | null
    edgesTotal: number | null
    producerTruncated: boolean
    rolesTruncated: boolean
    rolesOmittedUnresolved: number | null
  }
  receipts: AuthorityReceipt[]
  gaps: IdentityGap[]
  scope: IdentityScope | null
  /** IF-F1 §6 — the account's Organizations placement, as one of the three
   *  states that must render differently (plus "not carried"). */
  accountContext: IdentityAccountContext
}

/**
 * IF-F1 §6: unknown, standalone and in-an-organisation are three facts that
 * must never collapse into one another, and "refused" (the producer read the
 * context and would not build the account node) is a fourth. "not_carried"
 * is the graph itself being absent/unavailable/invalid: nothing may be said
 * about placement at all.
 */
export type IdentityAccountContextState =
  | "in_organization"
  | "standalone"
  | "unknown"
  | "refused"
  | "not_carried"

export interface IdentityAccountContext {
  state: IdentityAccountContextState
  /** Customer-facing words for the indicator. */
  label: string
  detail: string
  /** The producer gap code behind an unknown/refused state. */
  gapCode: string | null
  organizationId: string | null
  managementAccountId: string | null
  /** `control_policy_type_statuses` verbatim, when the account node carries it. */
  controlPolicyTypeStatuses: Record<string, string> | null
  /** Control-policy attachments the graph carried, by type. Only counted when
   *  the state is in_organization; a DISABLED type is a reason, not a zero. */
  scpCount: number
  rcpCount: number
}

export const IDENTITY_FAMILY_LABEL: Record<IdentityLensEdgeFamily, string> = {
  WORKLOAD_USES_ROLE: "runs as",
  ROLE_ACTION_DECISION: "decided",
  PRINCIPAL_HAS_MANAGED_POLICY: "managed policy",
  PRINCIPAL_HAS_INLINE_POLICY: "inline policy",
  PRINCIPAL_HAS_PERMISSIONS_BOUNDARY: "boundary",
  USER_MEMBER_OF_GROUP: "member of",
  ROLE_TRUST_POLICY: "may assume",
  USER_AUTHENTICATES_WITH: "credential",
  RESOURCE_POLICY_GRANT: "resource policy",
  ACCOUNT_IN_ORGANIZATION: "in organization",
  ACCOUNT_IN_ORG_UNIT: "in OU",
  ACCOUNT_LIMITED_BY_SCP: "bounded by SCP",
  ACCOUNT_LIMITED_BY_RCP: "bounded by RCP",
}

export const IDENTITY_KIND_LABEL: Record<IdentityLensNodeKind, string> = {
  workload: "Workload",
  iam_role: "IAM role",
  iam_user: "IAM user",
  iam_policy: "IAM policy",
  iam_group: "IAM group",
  service_principal: "Service principal",
  federated_principal: "Federated principal",
  aws_account_principal: "AWS account principal",
  credential: "Credential",
  protected_resource: "Protected resource",
  resource_policy: "Resource policy",
  decision: "Action decision record",
  aws_account: "This AWS account",
  organization: "AWS Organization",
  organizational_unit: "Organizational unit",
  control_policy: "Control policy",
}

/** Producer node kinds that this lens renders under a lens kind. Every kind in
 *  IDENTITY_GRAPH_NODE_KINDS is here: a producer kind with no lens kind would
 *  make its edges vanish from the canvas without a word, which is the silent
 *  omission this lens exists to refuse. */
const GRAPH_KIND_TO_LENS: Record<IdentityGraphNodeKind, IdentityLensNodeKind> = {
  iam_role: "iam_role",
  iam_user: "iam_user",
  iam_policy: "iam_policy",
  iam_group: "iam_group",
  federated_principal: "federated_principal",
  service_principal: "service_principal",
  aws_account_principal: "aws_account_principal",
  workload: "workload",
  protected_resource: "protected_resource",
  aws_account: "aws_account",
  organization: "organization",
  organizational_unit: "organizational_unit",
  control_policy: "control_policy",
}

function isGraphNodeKind(value: string): value is IdentityGraphNodeKind {
  return (IDENTITY_GRAPH_NODE_KINDS as readonly string[]).includes(value)
}

/**
 * The producer's word for what an edge asserts, in the legend's vocabulary.
 * Read from the producer's own fields; nothing is inferred from resource type.
 */
export function identityVerdictOf(
  family: IdentityLensEdgeFamily,
  plane: IdentityPlane,
  extra: Record<string, unknown>,
  options: { decisionRead?: boolean } = {},
): IdentityVerdict {
  if (family === "ROLE_TRUST_POLICY" && extra.effect === "Deny") return "denied"
  if (family === "ROLE_ACTION_DECISION" && options.decisionRead === false) return "unknown"
  return plane
}

/** Customer-facing words for a control-policy type. SCP and RCP stay apart. */
export function controlPolicyTypeLabel(value: unknown): string | null {
  if (value === "SERVICE_CONTROL_POLICY") return "SCP"
  if (value === "RESOURCE_CONTROL_POLICY") return "RCP"
  return typeof value === "string" && value !== "" ? value : null
}

/**
 * IF-F1 §6 from the validated graph. The three states plus refused/not-carried,
 * read from the producer's own signals: the `aws_account` node's
 * `organization_context_state`, or the ACCOUNT_POLICY_CONTEXT_* gap that
 * explains why there is no such node.
 */
export function accountContextOf(graph: IdentityGraphView): IdentityAccountContext {
  const base: IdentityAccountContext = {
    state: "not_carried",
    label: "Organization context not carried",
    detail:
      "The identity graph was not read for this generation, so nothing is known here " +
      "about this account's Organizations placement or control policies.",
    gapCode: null,
    organizationId: null,
    managementAccountId: null,
    controlPolicyTypeStatuses: null,
    scpCount: 0,
    rcpCount: 0,
  }
  if (graph.state !== "ready" && graph.state !== "partial") return base

  const account = graph.nodes.find(node => node.node_kind === "aws_account")
  if (!account) {
    const gap = graph.gaps.find(item => item.code in ACCOUNT_CONTEXT_GAP_CODES)
    if (gap) {
      const kind = ACCOUNT_CONTEXT_GAP_CODES[gap.code as AccountContextGapCode]
      return {
        ...base,
        state: kind === "unknown" ? "unknown" : "refused",
        label:
          kind === "unknown"
            ? "Organization context not available"
            : "Organization context refused",
        detail:
          kind === "unknown"
            ? "The Organizations account-policy context was not acquired for this account. " +
              "This is NOT \"no organization\" — the acquiring role may never have been able " +
              "to call Organizations."
            : `The producer read an account-policy context it would not attribute to this account (${gap.code}). ` +
              "No placement or control policy is shown; that is a refusal, not \"no organization\".",
        gapCode: gap.code,
      }
    }
    return {
      ...base,
      state: "unknown",
      label: "Organization context not available",
      detail:
        "The identity graph carries no account node and names no reason. Placement and " +
        "control policies are unknown here — not absent.",
    }
  }

  const extra = account.extra
  const statuses = isPlainObject(extra.control_policy_type_statuses)
    ? Object.fromEntries(
        Object.entries(extra.control_policy_type_statuses).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>
    : null
  const organizationId = typeof extra.organization_id === "string" ? extra.organization_id : null
  const managementAccountId =
    typeof extra.management_account_id === "string" ? extra.management_account_id : null
  const contextState = extra.organization_context_state

  if (contextState === "STANDALONE_ACCOUNT") {
    return {
      ...base,
      state: "standalone",
      label: "Not part of an AWS Organization",
      detail:
        "The account-policy context was read from the canonical generation and states this " +
        "account is standalone. No SCP or RCP bounds it from an organization.",
      controlPolicyTypeStatuses: statuses,
    }
  }
  const scpCount = graph.edges.filter(edge => edge.family === "ACCOUNT_LIMITED_BY_SCP").length
  const rcpCount = graph.edges.filter(edge => edge.family === "ACCOUNT_LIMITED_BY_RCP").length
  const disabled = statuses
    ? Object.entries(statuses)
        .filter(([, status]) => status !== "ENABLED")
        .map(([type, status]) => `${controlPolicyTypeLabel(type) ?? type} ${status.toLowerCase()}`)
    : []
  return {
    ...base,
    state: "in_organization",
    label: organizationId ? `In organization ${organizationId}` : "In an AWS Organization",
    detail:
      `${scpCount} SCP and ${rcpCount} RCP attachment${scpCount + rcpCount === 1 ? "" : "s"} bound this ` +
      "account from the organization hierarchy (attachments above the account are inherited and still apply)." +
      (disabled.length > 0 ? ` ${disabled.join("; ")} — a disabled type is why it has no attachments.` : ""),
    organizationId,
    managementAccountId,
    controlPolicyTypeStatuses: statuses,
    scpCount,
    rcpCount,
  }
}

function fact(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) return value.map(item => String(item)).join(", ")
  return JSON.stringify(value)
}

interface TopologyRef {
  id: string
  name: string
  type: string | null
}

/**
 * Build the lens.
 *
 * `topologyNodes` are the nodes the canvas is drawing (after scope + filters):
 * a workload id or a protected resource that matches one of them by id, name
 * or ARN keeps that topology id and is NOT given a second chip.
 */
export function buildIdentityLens(
  view: IdentityView,
  graph: IdentityGraphView,
  options: { topologyNodes: readonly TopologyRef[] },
): IdentityLens {
  const topologyById = new Map<string, TopologyRef>()
  const topologyByName = new Map<string, TopologyRef>()
  for (const item of options.topologyNodes) {
    topologyById.set(item.id, item)
    if (item.name) topologyByName.set(item.name, item)
  }

  const nodes = new Map<string, IdentityLensNode>()
  const edges: IdentityLensEdge[] = []
  const drawnByFamily = new Map<string, number>()
  const bump = (family: string) => drawnByFamily.set(family, (drawnByFamily.get(family) ?? 0) + 1)

  const upsert = (node: IdentityLensNode): IdentityLensNode => {
    const existing = nodes.get(node.id)
    if (!existing) {
      nodes.set(node.id, node)
      return node
    }
    // Merge facts and resolution: a node first seen as a bare endpoint and
    // later as a full producer node keeps the fuller reading.
    existing.resolved = existing.resolved || node.resolved
    existing.unresolvedReason = existing.resolved ? null : existing.unresolvedReason ?? node.unresolvedReason
    existing.arn = existing.arn ?? node.arn
    existing.resourceUid = existing.resourceUid ?? node.resourceUid
    existing.lifecycleState = existing.lifecycleState ?? node.lifecycleState
    existing.sublabel = existing.sublabel ?? node.sublabel
    for (const item of node.facts) if (!existing.facts.includes(item)) existing.facts.push(item)
    for (const gap of node.gaps) if (!existing.gaps.includes(gap)) existing.gaps.push(gap)
    return existing
  }

  const blank = (
    id: string,
    kind: IdentityLensNodeKind,
    label: string,
    partial: Partial<IdentityLensNode> = {},
  ): IdentityLensNode => ({
    id,
    kind,
    label,
    sublabel: null,
    onCanvas: false,
    resolved: true,
    unresolvedReason: null,
    arn: null,
    resourceUid: null,
    lifecycleState: null,
    facts: [],
    gaps: [],
    ...partial,
  })

  // Indexes from the producer's own identifiers to lens node ids.
  const roleIdByPrincipalId = new Map<string, string>()
  const idByArn = new Map<string, string>()
  const idByUid = new Map<string, string>()

  // ── v1 roles: WORKLOAD_USES_ROLE and ROLE_ACTION_DECISION ──────────────
  // Read as a conditional, not a fallback: a receipt is either present with
  // its (required) generation or absent, and absent is a different fact.
  const decisionReceipt = view.receipts.find(r => r.label === DECISION_AUTHORITY_LABEL)
  const inventoryReceipt = view.receipts.find(r => r.label === INVENTORY_AUTHORITY_LABEL)
  const decisionGeneration = decisionReceipt ? decisionReceipt.generation : null
  const inventoryGeneration = inventoryReceipt ? inventoryReceipt.generation : null

  for (const role of view.roles) {
    const roleNodeId = identityAnchorId("iam_role", role.role_id)
    roleIdByPrincipalId.set(role.role_id, roleNodeId)
    if (role.role_arn) idByArn.set(role.role_arn, roleNodeId)
    const configuredReady = role.configured_grants.state === "ready"
    const observedReady = role.observed_use.state === "ready"
    const facts: string[] = []
    if (configuredReady) {
      facts.push(`${role.configured_grants.exact_action_count} action${role.configured_grants.exact_action_count === 1 ? "" : "s"} granted`)
    } else {
      facts.push("decision evidence withheld — not zero")
    }
    if (observedReady) {
      facts.push(
        `${role.observed_use.successful_action_count} used · ${role.observed_use.denied_only_action_count} denied-only`,
      )
    } else if (configuredReady) {
      facts.push("observed use not read")
    }
    upsert(
      blank(roleNodeId, "iam_role", role.name ?? role.role_id, {
        sublabel: role.role_id,
        arn: role.role_arn,
        lifecycleState: role.lifecycle_state,
        facts,
        gaps: [...role.gaps],
      }),
    )

    for (const workloadId of [...role.workload_ids].sort()) {
      const onCanvas = topologyById.has(workloadId)
      const workloadNodeId = onCanvas ? workloadId : identityAnchorId("workload", workloadId)
      upsert(
        blank(workloadNodeId, "workload", topologyById.get(workloadId)?.name ?? workloadId, {
          onCanvas,
          sublabel: onCanvas ? null : "not on this canvas scope",
          facts: onCanvas ? [] : ["bound in the canonical generation; outside the drawn scope"],
        }),
      )
      edges.push({
        id: `WORKLOAD_USES_ROLE:${workloadId}->${role.role_id}`,
        family: "WORKLOAD_USES_ROLE",
        plane: "configured",
        certainty: "resolved",
        verdict: "configured",
        sourceId: workloadNodeId,
        targetId: roleNodeId,
        label: [...role.attachment_modes].sort().join(", ") || IDENTITY_FAMILY_LABEL.WORKLOAD_USES_ROLE,
        animated: false,
        generation: inventoryGeneration,
        lastSeen: null,
        facts: { attachment_modes: role.attachment_modes.join(", ") },
      })
      bump("WORKLOAD_USES_ROLE")
    }

    const decisionNodeId = identityAnchorId("decision", role.role_id)
    upsert(
      blank(
        decisionNodeId,
        "decision",
        configuredReady
          ? `${role.configured_grants.exact_action_count} action${role.configured_grants.exact_action_count === 1 ? "" : "s"} granted`
          : "Decision unavailable",
        {
          sublabel: observedReady
            ? `${role.observed_use.successful_action_count} used · ${role.observed_use.denied_only_action_count} denied-only`
            : configuredReady
              ? "observed use not read"
              : "no counts — not zero",
          resolved: configuredReady,
          unresolvedReason: configuredReady ? null : "DECISION_UNAVAILABLE",
          facts: [
            `effective authorization: ${role.effective_authorization.availability}`,
            ...role.effective_authorization.reason_codes,
          ],
          gaps: [...role.gaps],
        },
      ),
    )
    edges.push({
      id: `ROLE_ACTION_DECISION:${role.role_id}`,
      family: "ROLE_ACTION_DECISION",
      plane: observedReady ? "observed" : "configured",
      certainty: configuredReady ? "resolved" : "unresolved_endpoint",
      verdict: identityVerdictOf("ROLE_ACTION_DECISION", observedReady ? "observed" : "configured", {}, {
        decisionRead: configuredReady,
      }),
      sourceId: roleNodeId,
      targetId: decisionNodeId,
      label: configuredReady ? IDENTITY_FAMILY_LABEL.ROLE_ACTION_DECISION : "decision unavailable",
      animated: observedReady && decisionGeneration !== null,
      generation: decisionGeneration,
      lastSeen: observedReady ? role.observed_use.last_success_at : null,
      facts: {
        configured_grants: role.configured_grants.exact_action_count,
        successful_action_count: role.observed_use.successful_action_count,
        denied_only_action_count: role.observed_use.denied_only_action_count,
        not_observed_action_count: role.observed_use.not_observed_action_count,
        unknown_action_count: role.observed_use.unknown_action_count,
        last_success_at: role.observed_use.last_success_at,
      },
    })
    bump("ROLE_ACTION_DECISION")
  }

  // ── graph nodes ────────────────────────────────────────────────────────
  const gapsByUid = new Map<string, IdentityGap[]>()
  for (const gap of graph.gaps) {
    const uid = gap.resource_uid
    if (typeof uid === "string") {
      const list = gapsByUid.get(uid) ?? []
      list.push(gap)
      gapsByUid.set(uid, list)
    }
  }

  const resolveTopology = (endpoint: { arn: string | null; name: string | null; resource_uid: string | null; extra?: Record<string, unknown> }): TopologyRef | null => {
    const protects = typeof endpoint.extra?.protects_arn === "string" ? endpoint.extra.protects_arn : null
    for (const key of [endpoint.resource_uid, endpoint.arn, protects, endpoint.name]) {
      if (!key) continue
      const byId = topologyById.get(key)
      if (byId) return byId
      const byName = topologyByName.get(key)
      if (byName) return byName
    }
    return null
  }

  /** Producer node kinds the graph carried that this lens could not place.
   *  Always empty while GRAPH_KIND_TO_LENS is total over the closed set; kept
   *  so a future producer kind is reported rather than silently dropped. */
  const unplacedKinds = new Map<string, number>()

  const lensNodeFor = (
    endpoint: IdentityGraphEndpoint | IdentityGraphNode,
    ownerKey: string | null,
    /** The edge this endpoint is on, when it is an endpoint: the control-policy
     *  type lives on the edge, not the endpoint. */
    edgeExtra: Record<string, unknown> = {},
  ): IdentityLensNode | null => {
    const extra = endpoint.extra
    const producerKind = endpoint.node_kind
    if (!isGraphNodeKind(producerKind)) {
      unplacedKinds.set(producerKind, (unplacedKinds.get(producerKind) ?? 0) + 1)
      return null
    }
    const lensKind = GRAPH_KIND_TO_LENS[producerKind]
    const resolved = "resolved" in endpoint ? endpoint.resolved : true
    const unresolvedReason = "unresolved_reason" in endpoint ? endpoint.unresolved_reason : null
    const uidGaps = endpoint.resource_uid ? gapsByUid.get(endpoint.resource_uid) ?? [] : []

    if (lensKind === "aws_account") {
      const key = endpoint.resource_uid ?? endpoint.name ?? "account"
      const id = identityAnchorId("aws_account", key)
      const contextState = typeof extra.organization_context_state === "string" ? extra.organization_context_state : null
      const facts: string[] = []
      if (contextState === "STANDALONE_ACCOUNT") facts.push("not part of an AWS Organization")
      else if (contextState === "IN_ORGANIZATION" && typeof extra.organization_id === "string") {
        facts.push(`in organization ${extra.organization_id}`)
      }
      if (isPlainObject(extra.control_policy_type_statuses)) {
        for (const [type, status] of Object.entries(extra.control_policy_type_statuses)) {
          if (typeof status === "string" && status !== "ENABLED") {
            facts.push(`${controlPolicyTypeLabel(type) ?? type} ${status.toLowerCase()}`)
          }
        }
      }
      return upsert(
        blank(id, "aws_account", endpoint.name ?? key, {
          resourceUid: endpoint.resource_uid,
          resolved,
          unresolvedReason,
          lifecycleState: typeof extra.lifecycle_state === "string" ? extra.lifecycle_state : null,
          sublabel: typeof extra.account_id === "string" ? `account ${extra.account_id}` : null,
          facts,
          gaps: uidGaps,
        }),
      )
    }
    if (lensKind === "organization") {
      const key = endpoint.arn ?? endpoint.name ?? "organization"
      return upsert(
        blank(identityAnchorId("organization", key), "organization", endpoint.name ?? key, {
          arn: endpoint.arn,
          resolved,
          unresolvedReason,
          sublabel: resolved ? null : "named by the account context",
          facts:
            typeof edgeExtra.management_account_id === "string"
              ? [`management account ${edgeExtra.management_account_id}`]
              : [],
        }),
      )
    }
    if (lensKind === "organizational_unit") {
      const key = endpoint.arn ?? endpoint.name ?? "ou"
      const isRoot = edgeExtra.parent_target_type === "ROOT" && edgeExtra.child_target_type === "ORGANIZATIONAL_UNIT"
      const label = endpoint.name ?? key
      return upsert(
        blank(identityAnchorId("organizational_unit", key), "organizational_unit", label, {
          arn: endpoint.arn,
          resolved,
          unresolvedReason,
          sublabel: isRoot ? "organization root" : resolved ? null : "named by the hierarchy",
        }),
      )
    }
    if (lensKind === "control_policy") {
      const key = endpoint.arn ?? endpoint.name ?? "control-policy"
      const type = controlPolicyTypeLabel(edgeExtra.control_policy_type)
      const facts: string[] = []
      if (edgeExtra.inherited === true && typeof edgeExtra.attached_at_target_type === "string") {
        facts.push(`inherited from ${edgeExtra.attached_at_target_type.toLowerCase().replace(/_/g, " ")}`)
      }
      if (edgeExtra.aws_managed === true) facts.push("AWS managed")
      if (edgeExtra.document_present === false) facts.push("document not carried")
      return upsert(
        blank(identityAnchorId("control_policy", key), "control_policy", endpoint.name ?? key, {
          arn: endpoint.arn,
          resolved,
          unresolvedReason,
          sublabel: type,
          facts,
        }),
      )
    }

    if (lensKind === "iam_role") {
      const principalId = typeof extra.principal_id === "string" ? extra.principal_id : null
      const known =
        (principalId && roleIdByPrincipalId.get(principalId)) ||
        (endpoint.arn && idByArn.get(endpoint.arn)) ||
        (endpoint.resource_uid && idByUid.get(endpoint.resource_uid)) ||
        null
      const id = known ?? identityAnchorId("iam_role", endpoint.resource_uid ?? endpoint.arn ?? endpoint.name ?? "unnamed")
      if (endpoint.arn) idByArn.set(endpoint.arn, id)
      if (endpoint.resource_uid) idByUid.set(endpoint.resource_uid, id)
      return upsert(
        blank(id, "iam_role", endpoint.name ?? endpoint.arn ?? id, {
          arn: endpoint.arn,
          resourceUid: endpoint.resource_uid,
          lifecycleState: typeof extra.lifecycle_state === "string" ? extra.lifecycle_state : null,
          sublabel: principalId,
          gaps: uidGaps,
        }),
      )
    }
    if (lensKind === "iam_user") {
      // A credential endpoint is emitted with node_kind iam_user by the
      // producer (`_endpoint(kind="iam_user", name=<key id>)`), unresolved by
      // construction. It is a credential, not a second user.
      if (!resolved && unresolvedReason === "ENDPOINT_NOT_A_PROJECTED_RESOURCE" && ownerKey) {
        const id = identityAnchorId("credential", `${ownerKey}:${endpoint.name ?? "credential"}`)
        return upsert(
          blank(id, "credential", endpoint.name ?? "credential", {
            resolved: false,
            unresolvedReason,
            sublabel: "not a projected resource",
          }),
        )
      }
      const key = endpoint.resource_uid ?? endpoint.arn ?? endpoint.name ?? "unnamed"
      const id = (endpoint.arn && idByArn.get(endpoint.arn)) || identityAnchorId("iam_user", key)
      if (endpoint.arn) idByArn.set(endpoint.arn, id)
      if (endpoint.resource_uid) idByUid.set(endpoint.resource_uid, id)
      return upsert(
        blank(id, "iam_user", endpoint.name ?? endpoint.arn ?? id, {
          arn: endpoint.arn,
          resourceUid: endpoint.resource_uid,
          lifecycleState: typeof extra.lifecycle_state === "string" ? extra.lifecycle_state : null,
          sublabel: typeof extra.principal_id === "string" ? extra.principal_id : null,
          gaps: uidGaps,
        }),
      )
    }
    if (lensKind === "iam_policy") {
      const key = endpoint.resource_uid ?? endpoint.arn ?? (ownerKey ? `${ownerKey}:${endpoint.name ?? "inline"}` : endpoint.name ?? "unnamed")
      const id = identityAnchorId("iam_policy", key)
      return upsert(
        blank(id, "iam_policy", endpoint.name ?? endpoint.arn ?? "policy", {
          arn: endpoint.arn,
          resourceUid: endpoint.resource_uid,
          resolved,
          unresolvedReason,
          sublabel: resolved
            ? typeof extra.aws_managed === "boolean" && extra.aws_managed ? "AWS managed" : "customer managed"
            : endpoint.arn
              ? "ARN not in this generation"
              : "not a projected resource",
          facts: typeof extra.attachment_count === "number" ? [`${extra.attachment_count} attachment${extra.attachment_count === 1 ? "" : "s"}`] : [],
        }),
      )
    }
    if (lensKind === "iam_group") {
      const id = identityAnchorId("iam_group", endpoint.name ?? "group")
      return upsert(
        blank(id, "iam_group", endpoint.name ?? "group", {
          resolved: false,
          unresolvedReason: unresolvedReason ?? "ENDPOINT_NOT_A_PROJECTED_RESOURCE",
          sublabel: "group name — no iam:group resource type",
        }),
      )
    }
    if (lensKind === "service_principal" || lensKind === "federated_principal" || lensKind === "aws_account_principal") {
      const key = endpoint.arn ?? endpoint.name ?? "principal"
      const id = identityAnchorId(lensKind, key)
      return upsert(
        blank(id, lensKind, endpoint.name ?? key, {
          arn: endpoint.arn,
          resolved: true,
          sublabel: "trust-policy principal",
        }),
      )
    }
    if (lensKind === "workload") {
      const key = endpoint.resource_uid ?? endpoint.arn ?? endpoint.name ?? "workload"
      const onCanvas = resolveTopology({ ...endpoint, extra })
      const id = onCanvas ? onCanvas.id : identityAnchorId("workload", key)
      return upsert(
        blank(id, "workload", onCanvas?.name ?? endpoint.name ?? key, {
          onCanvas: Boolean(onCanvas),
          arn: endpoint.arn,
          resourceUid: endpoint.resource_uid,
        }),
      )
    }
    // protected_resource
    const onCanvas = resolveTopology({ ...endpoint, extra })
    const isAuthorizationRecord = typeof extra.protects_arn === "string" || typeof extra.resource_type === "string"
    if (isAuthorizationRecord) {
      const id = identityAnchorId("resource_policy", endpoint.resource_uid ?? endpoint.arn ?? endpoint.name ?? "grant")
      const service = typeof extra.resource_type === "string" ? extra.resource_type : "resource policy"
      return upsert(
        blank(id, "resource_policy", `${service}`, {
          arn: endpoint.arn,
          resourceUid: endpoint.resource_uid,
          sublabel: endpoint.name ?? (typeof extra.protects_arn === "string" ? extra.protects_arn : null),
          facts: typeof extra.protects_arn === "string" ? [`protects ${extra.protects_arn}`] : [],
          gaps: uidGaps,
        }),
      )
    }
    const key = endpoint.resource_uid ?? endpoint.arn ?? endpoint.name ?? "resource"
    const id = onCanvas ? onCanvas.id : identityAnchorId("protected_resource", key)
    return upsert(
      blank(id, "protected_resource", onCanvas?.name ?? endpoint.name ?? key, {
        onCanvas: Boolean(onCanvas),
        arn: endpoint.arn,
        resourceUid: endpoint.resource_uid,
        sublabel: onCanvas ? null : "not on this canvas scope",
      }),
    )
  }

  for (const node of graph.nodes) lensNodeFor(node, null)

  let edgesWithoutEndpoints = 0
  for (const [index, edge] of graph.edges.entries()) {
    if (!edge.source || !edge.target) {
      edgesWithoutEndpoints += 1
      continue
    }
    const ownerKey = edge.source.resource_uid ?? edge.source.arn ?? edge.source.name
    const source = lensNodeFor(edge.source, ownerKey, edge.extra)
    const target = lensNodeFor(edge.target, ownerKey, edge.extra)
    if (!source || !target) {
      edgesWithoutEndpoints += 1
      continue
    }
    const certainty: IdentityCertainty =
      edge.source.unresolved_reason !== null || edge.target.unresolved_reason !== null
        ? "unresolved_endpoint"
        : "resolved"
    const observed = edge.plane === "observed"
    const lastSeen =
      typeof edge.extra.last_used_at === "string"
        ? edge.extra.last_used_at
        : typeof edge.extra.last_success_at === "string"
          ? edge.extra.last_success_at
          : null
    const facts: IdentityLensEdge["facts"] = {}
    for (const [key, value] of Object.entries(edge.extra)) facts[key] = fact(value)
    let label: string = IDENTITY_FAMILY_LABEL[edge.family]
    if (edge.family === "ROLE_TRUST_POLICY") {
      /**
       * A trust policy is CONFIGURED permission to assume. It is never
       * evidence that an assumption occurred (that is ASSUMED_ROLE_OBSERVED,
       * which has no wired producer) and never an effective authorization
       * verdict.
       *
       * A wildcard principal is only unconditional when the statement carries
       * no conditions. Real trust policies pair `Principal: "*"` with a
       * PrincipalOrgID / SourceArn / ExternalId condition, and that condition
       * is what actually constrains who may assume. Folding a conditional
       * wildcard into "ANYONE may assume" states the opposite of the document:
       * a reviewer would read a role restricted to one organisation as
       * world-assumable. The condition is the load-bearing part, so when it is
       * present it must be visible.
       */
      /**
       * Three things this badge must keep apart, because they are three
       * different facts and only the first is in evidence here:
       *   1. an ALLOWED (or DENIED) action in a trust STATEMENT — configured;
       *   2. an EFFECTIVE authorization verdict — never projected by the
       *      installed contract (ACTION_AND_RESOURCE_SCOPE_REQUIRED /
       *      NO_PROJECTED_EFFECTIVE_DECISION);
       *   3. an OBSERVED authentication — ASSUMED_ROLE_OBSERVED, which has no
       *      wired producer at all.
       * So every word below is statement language ("trusts", "denies"), never
       * "can", "is allowed to", or "did".
       */
      const effect = typeof edge.extra.effect === "string" ? edge.extra.effect : null
      const wildcard = edge.extra.is_wildcard_principal === true
      const conditioned = edge.extra.has_conditions === true
      const scope = wildcard
        ? conditioned
          ? "any principal matching its conditions"
          : "any principal, unconditionally"
        : conditioned
          ? "this principal, if its conditions match"
          : "this principal"
      if (effect === "Deny") {
        label = `statement DENIES ${scope}`
      } else if (effect === "Allow") {
        label = `statement trusts ${scope}`
      } else if (wildcard || conditioned) {
        label = `trust statement — ${scope}`
      }
    } else if (edge.family === "USER_AUTHENTICATES_WITH") {
      const kind = typeof edge.extra.credential_kind === "string" ? edge.extra.credential_kind : null
      label = kind === "access_key" ? "access key" : kind === "console_password" ? "console password" : kind === "mfa_device" ? "MFA device" : label
    } else if (edge.family === "PRINCIPAL_HAS_MANAGED_POLICY" && !edge.target.resolved) {
      label = "managed policy (ARN only)"
    } else if (edge.family === "ACCOUNT_LIMITED_BY_SCP" || edge.family === "ACCOUNT_LIMITED_BY_RCP") {
      // Inherited attachments still bound the account (IF-F1 §4); say so on
      // the line, so an account bounded only from above never reads as free.
      label = `${IDENTITY_FAMILY_LABEL[edge.family]}${edge.extra.inherited === true ? " (inherited)" : ""}`
    } else if (edge.family === "ACCOUNT_IN_ORG_UNIT" && typeof edge.extra.depth === "number") {
      label = edge.extra.parent_target_type === "ROOT" ? "under root" : IDENTITY_FAMILY_LABEL[edge.family]
    }
    edges.push({
      id: `${edge.family}:${index}:${source.id}->${target.id}`,
      family: edge.family,
      plane: edge.plane,
      certainty,
      verdict: identityVerdictOf(edge.family, edge.plane, edge.extra),
      sourceId: source.id,
      targetId: target.id,
      label,
      animated: observed && inventoryGeneration !== null,
      generation: observed ? inventoryGeneration : inventoryGeneration,
      lastSeen,
      facts,
    })
    bump(edge.family)
  }

  // ── family verdicts ────────────────────────────────────────────────────
  const families: IdentityFamilyVerdict[] = view.capabilities.map(row => ({
    family: row.family,
    status: row.status,
    plane: row.plane,
    reason_codes: [...row.reason_codes],
    detail: row.detail,
    drawn: drawnByFamily.get(row.family) ?? 0,
  }))
  if (view.capabilitiesUnavailableReason !== null) {
    // No matrix to rule on: still list every family this lens produced, and
    // say the verdict was not carried rather than inventing one.
    for (const [family, drawn] of drawnByFamily) {
      families.push({
        family,
        status: "no_verdict",
        plane: null,
        reason_codes: [],
        detail: view.capabilitiesUnavailableReason,
        drawn,
      })
    }
  }

  const readable = view.state === "ready" || view.state === "incomplete"
  const nothingToDraw = !readable || edges.length === 0

  /**
   * Did the identity graph actually get READ?
   *
   * scripts/estate_identity_graph.unavailable_identity_graph hardcodes
   * nodes_total/edges_total to null, and its docstring names the reason: an
   * empty node/edge list on its own "claims an estate with no identities,
   * which is the inversion every other refusal in this contract exists to
   * prevent". So `nodes: []` / `edges: []` is NOT the discriminator — both an
   * authoritative empty and a failed read carry them. An integer total
   * (including 0) is an answer; null is the absence of one.
   */
  const graphWasRead = identityGraphWasRead(graph)

  let headline = view.headline
  let detail = view.detail
  if (readable && view.emptyAuthoritative && graph.edges.length === 0) {
    headline = "No workload in this scope is bound to an IAM role."
    // The roles projection being authoritatively empty says nothing about
    // whether the identity GRAPH was read. When the graph was withheld, its
    // reason is appended rather than dropped — otherwise a payload whose
    // roles read cleanly and whose graph failed to read renders as a
    // confident "that is an answer, not a missing read" over a graph nobody
    // ever read. That is the exact collapse this branch used to produce.
    detail = graphWasRead ? view.detail : `${view.detail} ${graph.headline} ${graph.detail}`
  } else if (readable && !graphWasRead) {
    detail = `${view.detail} ${graph.headline} ${graph.detail}`
  }

  // A relationship the producer emitted but this lens could not place is a
  // gap on the canvas, said in words — never a line that quietly is not there.
  const lensGaps: IdentityGap[] = []
  if (edgesWithoutEndpoints > 0) {
    lensGaps.push({
      code: "LENS_EDGE_ENDPOINT_UNPLACED",
      detail:
        `${edgesWithoutEndpoints} relationship${edgesWithoutEndpoints === 1 ? "" : "s"} in the served graph ` +
        "could not be placed on this canvas" +
        (unplacedKinds.size > 0
          ? ` (node kind${unplacedKinds.size === 1 ? "" : "s"} this lens does not draw: ${[...unplacedKinds.keys()].sort().join(", ")})`
          : " (an endpoint was missing)") +
        ". They are counted here, not drawn.",
      count: edgesWithoutEndpoints,
    })
  }

  const allGaps = [...view.gaps, ...graph.gaps, ...lensGaps]

  /**
   * An empty canvas is an ANSWER only when every source feeding it is
   * authoritative and nothing was withheld:
   *   - the v1 roles projection is authoritatively empty (emptyAuthoritative
   *     already requires status ready, roles_total 0, not truncated, none
   *     omitted, no gaps);
   *   - the identity graph was actually read, not refused;
   *   - nothing anywhere raised a gap, and nothing was truncated.
   * Anything less is missing evidence and must keep the warning tone.
   */
  const claim = identityEmptyClaim(view, graph)
  const emptyClaim: IdentityEmptyClaim =
    claim === "qualified_empty" && (edges.length > 0 || allGaps.length > 0) ? "unread" : claim
  // Kept as the single boolean the views gate their calm styling on. It is now
  // a QUALIFIED empty: backed for workload-to-role binding, explicitly unknown
  // for every family without an acquisition receipt.
  const emptyAnswer = emptyClaim === "qualified_empty"

  return {
    state: view.state,
    graphState: graph.state,
    headline,
    detail,
    nothingToDraw,
    emptyAnswer,
    emptyClaim,
    familiesWithoutCoverageReceipt: [...IDENTITY_FAMILIES_WITHOUT_COVERAGE_RECEIPT],
    coverageMissingLink: IDENTITY_FAMILY_COVERAGE_MISSING_LINK,
    nodes: [...nodes.values()],
    edges,
    families: families.sort((a, b) => a.family.localeCompare(b.family)),
    truncation: {
      nodesTotal: graph.nodesTotal,
      edgesTotal: graph.edgesTotal,
      producerTruncated: graph.truncated || view.rolesTruncated,
      rolesTruncated: view.rolesTruncated,
      rolesOmittedUnresolved: view.rolesOmittedUnresolved,
    },
    receipts: view.receipts,
    gaps: allGaps,
    scope: view.scope,
    accountContext: accountContextOf(graph),
  }
}

/**
 * The identity lens for one topology-risk payload, end to end.
 */
export function buildIdentityLensForPayload(
  payload: TopologyRiskResponse | null | undefined,
  options: { topologyNodes: readonly TopologyRef[] },
): IdentityLens {
  const view = buildIdentityView(payload)
  const raw = payload?.identity_access
  const graphRaw =
    isPlainObject(raw) && (view.state === "ready" || view.state === "incomplete" || view.state === "unavailable")
      ? raw.identity_graph
      : undefined
  return buildIdentityLens(view, buildIdentityGraphView(graphRaw), options)
}

/** The nested graph view for a payload, under the same gating as the lens. */
export function identityGraphViewForPayload(
  payload: TopologyRiskResponse | null | undefined,
  view: IdentityView = buildIdentityView(payload),
): IdentityGraphView {
  const raw = payload?.identity_access
  const graphRaw =
    isPlainObject(raw) && (view.state === "ready" || view.state === "incomplete" || view.state === "unavailable")
      ? raw.identity_graph
      : undefined
  return buildIdentityGraphView(graphRaw)
}

/* ── the compact indicator above the map ───────────────────────────────────
 *
 * One line of scope, freshness and coverage in customer words. Everything
 * here is a restatement of a validated field; hashes, query names and the
 * per-family matrix stay in the Evidence drawer.
 */

export interface IdentityCoverageLimit {
  /** Stable key for tests and styling. */
  key: "observed_role_assumption" | "principal_data_access" | "effective_permission" | "kubernetes_rbac"
  label: string
  /** What the screen may NOT claim because of this limit. */
  detail: string
  /** The producer's own reason codes, when the matrix carried them. */
  reasonCodes: string[]
  status: "unavailable" | "not_projected" | "not_collected" | "no_verdict"
}

export interface IdentityIndicator {
  state: IdentityViewState
  /** Short customer-facing state word. */
  stateLabel: string
  tone: "ok" | "warn" | "muted"
  /** "account · region · system", from the validated scope. Null before a scope was read. */
  scopeLine: string | null
  scopeVerified: boolean
  scopeMismatch: boolean
  /** Inventory generation the map was read from, when one was. */
  inventoryGeneration: number | null
  inventoryProjectedThrough: string | null
  decisionGeneration: number | null
  decisionProjectedThrough: string | null
  /** The inventory receipt hash exists: the generation is certifiable. */
  inventoryCertified: boolean
  rolesShown: number
  rolesTotal: number | null
  graphState: IdentityGraphState
  graphEdges: number
  graphNodes: number
  /** Families the installed path can serve / rule on. Null with no matrix. */
  familiesAvailable: number | null
  familiesTotal: number | null
  /** Why the matrix is missing, when it is. */
  matrixUnavailableReason: string | null
  limits: IdentityCoverageLimit[]
  accountContext: IdentityAccountContext
}

function stateWords(state: IdentityViewState, projectionStatus: string | null): { label: string; tone: IdentityIndicator["tone"] } {
  switch (state) {
    case "ready":
      return projectionStatus === "partial"
        ? { label: "Read with gaps", tone: "warn" }
        : { label: "Read from the canonical generation", tone: "ok" }
    case "incomplete":
      return { label: "Read, roles not shown", tone: "warn" }
    case "unavailable":
      return { label: "Projection not available", tone: "warn" }
    case "scope_mismatch":
      return { label: "Built for a different scope", tone: "warn" }
    case "invalid":
      return { label: "Block not readable", tone: "warn" }
    case "absent":
    default:
      return { label: "No identity projection on this snapshot", tone: "muted" }
  }
}

/**
 * Compose the indicator. `view` and `graph` are the validated readings; this
 * function decides no honesty question of its own, it only picks words.
 */
export function buildIdentityIndicator(view: IdentityView, graph: IdentityGraphView): IdentityIndicator {
  const words = stateWords(view.state, view.projectionStatus)
  const scope = view.scope
  const scopeLine = scope
    ? [scope.account_id, scope.region, scope.system_name].filter((v): v is string => typeof v === "string" && v !== "").join(" · ")
    : null
  const inventory = view.receipts.find(r => r.label === INVENTORY_AUTHORITY_LABEL) ?? null
  const decision = view.receipts.find(r => r.label === DECISION_AUTHORITY_LABEL) ?? null

  const limits: IdentityCoverageLimit[] = []
  const rowFor = (family: string) => view.capabilities.find(row => row.family === family) ?? null
  const matrixKnown = view.capabilitiesUnavailableReason === null && view.capabilities.length > 0

  const assumed = rowFor("ASSUMED_ROLE_OBSERVED")
  if (!matrixKnown || (assumed && assumed.status === "unavailable")) {
    limits.push({
      key: "observed_role_assumption",
      label: "Observed role assumption",
      detail:
        "No producer records who actually assumed a role. Trust lines are configured permission " +
        "to assume, never evidence that an assumption happened, and no authentication method is claimed for a role.",
      reasonCodes: assumed ? [...assumed.reason_codes] : [],
      status: matrixKnown ? "unavailable" : "no_verdict",
    })
  }
  const dataAccess = rowFor("DATA_ACCESS")
  if (!matrixKnown || (dataAccess && dataAccess.status === "unavailable")) {
    limits.push({
      key: "principal_data_access",
      label: "Principal → data target",
      detail:
        "No principal-anchored read joins an identity to the data it reaches, so no line runs from a " +
        "role to a bucket, table or key as \"accesses\". Resource policies are shown on the resource they protect.",
      reasonCodes: dataAccess ? [...dataAccess.reason_codes] : [],
      status: matrixKnown ? "unavailable" : "no_verdict",
    })
  }
  const effectiveCodes = new Set<string>()
  let effectiveProjected = false
  for (const role of view.roles) {
    if (role.effective_authorization.availability === "unavailable") {
      for (const code of role.effective_authorization.reason_codes) effectiveCodes.add(code)
    } else {
      effectiveProjected = true
    }
  }
  if (view.roles.length > 0 && !effectiveProjected) {
    limits.push({
      key: "effective_permission",
      label: "Effective permission verdict",
      detail:
        "Configured grants and observed use are shown per role; no allow/deny verdict for a specific target " +
        "is projected, and a missing SCP, boundary or condition reading never implies allow.",
      reasonCodes: [...effectiveCodes].sort(),
      status: "not_projected",
    })
  }
  limits.push({
    key: "kubernetes_rbac",
    label: "Kubernetes RBAC",
    detail:
      "Service accounts, Roles/ClusterRoles and bindings are not part of the installed identity contract. " +
      "Nothing here is RBAC, and no cluster binding is drawn.",
    reasonCodes: [],
    status: "not_collected",
  })

  return {
    state: view.state,
    stateLabel: words.label,
    tone: words.tone,
    scopeLine,
    scopeVerified: Boolean(view.scopeBinding && view.scopeBinding.verified.length > 0 && view.scopeBinding.mismatches.length === 0),
    scopeMismatch: Boolean(view.scopeBinding && view.scopeBinding.mismatches.length > 0),
    inventoryGeneration: inventory ? inventory.generation : null,
    inventoryProjectedThrough: inventory ? inventory.projectedThrough : null,
    decisionGeneration: decision ? decision.generation : null,
    decisionProjectedThrough: decision ? decision.projectedThrough : null,
    inventoryCertified: inventory ? inventory.projectionReceiptHash !== null : false,
    rolesShown: view.rolesReturned,
    rolesTotal: view.rolesTotal,
    graphState: graph.state,
    graphEdges: graph.edges.length,
    graphNodes: graph.nodes.length,
    familiesAvailable: matrixKnown ? view.capabilities.filter(row => row.status === "available").length : null,
    familiesTotal: matrixKnown ? view.capabilities.length : null,
    matrixUnavailableReason: view.capabilitiesUnavailableReason,
    limits,
    accountContext: accountContextOf(graph),
  }
}

/* ── the lens as FlowOverlay edges ─────────────────────────────────────────
 *
 * The shared canvas draws TrafficEdge[] and gates motion by evidence fields
 * (aws-frame.tsx trafficMotionKind: observed + authoritative + observed
 * segment moves; anything configured stays still). The lens spells its planes
 * in exactly that vocabulary so the same renderer applies the same rule, and
 * adds an `identity` annotation for the lens-specific dash/colour treatment.
 */

export type { IdentityEdgeAnnotation } from "./types"

/**
 * How one drawn edge stands relative to the current selection.
 *
 * "outgoing"/"incoming" are the selected node's OWN access relationships —
 * what it reaches and what reaches it. "context" is the rest of the bounded
 * neighbourhood: real, evidence-backed, and drawn, but one or more hops away.
 * Without this split a two-hop expansion reads as if every line on the canvas
 * were the selected service's own access, which overstates what the producer
 * said. With no selection every edge is "context": nothing is emphasised
 * because nothing was asked about.
 */
export type IdentityFocusRelation = "outgoing" | "incoming" | "context"

export function identityFocusRelation(
  edge: Pick<IdentityLensEdge, "sourceId" | "targetId">,
  focusId: string | null | undefined,
): IdentityFocusRelation {
  if (!focusId) return "context"
  if (edge.sourceId === focusId) return "outgoing"
  if (edge.targetId === focusId) return "incoming"
  return "context"
}

export function identityLensTrafficEdges(
  lens: IdentityLens,
  focusId?: string | null,
): TrafficEdge[] {
  return lens.edges.map(edge => {
    const observed = edge.plane === "observed"
    const annotation: IdentityEdgeAnnotation = {
      family: edge.family,
      plane: edge.plane,
      certainty: edge.certainty,
      verdict: edge.verdict,
      label: edge.label,
      animated: edge.animated,
      generation: edge.generation,
      focusRelation: identityFocusRelation(edge, focusId),
    }
    return {
      source_id: edge.sourceId,
      target_id: edge.targetId,
      protocol: edge.family,
      port: null,
      edge_class: "identity",
      evidence_type: observed ? "observed" : "configured",
      // Observed WITH a generation is the map's "authoritative observed
      // segment" and moves; observed without one is "legacy_unverified" and
      // gets the outlined historical packet only when it has a timestamp;
      // configured is configured and never moves.
      authority_state: observed ? (edge.animated ? "authoritative" : "legacy_unverified") : "configured",
      path_basis: observed ? "observed_segment" : "configured_route",
      projection_generation: edge.generation,
      last_seen: observed ? edge.lastSeen : null,
      identity: annotation,
    }
  })
}

/* ── inspector detail for one selected node ────────────────────────────────
 */

export interface IdentitySelectionRelationship {
  edge: IdentityLensEdge
  direction: "outgoing" | "incoming"
  /** The node on the other end. */
  peer: IdentityLensNode
}

export interface IdentitySelectionDetail {
  node: IdentityLensNode
  kindLabel: string
  relationships: IdentitySelectionRelationship[]
  accessPath: IdentityFocusedAccessPath
  receipts: AuthorityReceipt[]
  gaps: IdentityGap[]
  scope: IdentityScope | null
  /** Producer-level state words for the panel header. */
  lensState: IdentityViewState
  graphState: IdentityGraphState
}

export function identitySelectionDetail(
  lens: IdentityLens,
  nodeId: string | null | undefined,
): IdentitySelectionDetail | null {
  if (!nodeId) return null
  const node = lens.nodes.find(item => item.id === nodeId)
  if (!node) return null
  const byId = new Map(lens.nodes.map(item => [item.id, item]))
  const relationships: IdentitySelectionRelationship[] = []
  for (const edge of lens.edges) {
    if (edge.sourceId === nodeId) {
      const peer = byId.get(edge.targetId)
      if (peer) relationships.push({ edge, direction: "outgoing", peer })
    } else if (edge.targetId === nodeId) {
      const peer = byId.get(edge.sourceId)
      if (peer) relationships.push({ edge, direction: "incoming", peer })
    }
  }
  return {
    node,
    kindLabel: IDENTITY_KIND_LABEL[node.kind],
    relationships,
    accessPath: identityFocusedAccessPath(lens, nodeId),
    receipts: lens.receipts,
    gaps: node.gaps,
    scope: lens.scope,
    lensState: lens.state,
    graphState: lens.graphState,
  }
}

export const ACCESS_PATH_BRANCH_CAP = 4

const ACCESS_PATH_TARGET_KINDS = new Set<IdentityLensNodeKind>(["protected_resource"])

export interface IdentityAccessPathEndpoint {
  id: string
  label: string
  kindLabel: string
  kind: IdentityLensNodeKind | "missing"
  missing: boolean
}

export interface IdentityAccessPathHop {
  id: string
  branch: "workload" | "trust" | "target" | "neighbourhood"
  edge: IdentityLensEdge | null
  from: IdentityAccessPathEndpoint
  to: IdentityAccessPathEndpoint
}

export interface IdentityFocusedAccessPath {
  hops: IdentityAccessPathHop[]
  role: IdentityAccessPathEndpoint | null
  focus: IdentityAccessPathEndpoint
  workloads: IdentityAccessPathHop[]
  trust: IdentityAccessPathHop[]
  targets: IdentityAccessPathHop[]
  /** Selected component’s direct role joins not represented by the access-path branches. */
  selectionJoins: IdentityAccessPathHop[]
  neighbourhoodIncoming: IdentityAccessPathHop[]
  neighbourhoodOutgoing: IdentityAccessPathHop[]
  roleId: string | null
  missingTarget: boolean
  gaps: Array<{ code: string; detail: string }>
}

export function boundAccessPathBranches<T>(
  items: readonly T[],
  cap: number,
  isSelected: (item: T) => boolean,
): { shown: T[]; omitted: number } {
  const selected = items.filter(isSelected)
  const rest = items.filter(item => !isSelected(item))
  const extra = rest.slice(0, Math.max(0, cap - selected.length))
  return {
    shown: [...selected, ...extra],
    omitted: rest.length - extra.length,
  }
}

function accessPathEndpoint(node: IdentityLensNode): IdentityAccessPathEndpoint {
  return {
    id: node.id,
    label: node.label,
    kindLabel: IDENTITY_KIND_LABEL[node.kind],
    kind: node.kind,
    missing: false,
  }
}

function missingTargetEndpoint(roleId: string): IdentityAccessPathEndpoint {
  return {
    id: `${roleId}::missing-target`,
    label: "Target not served",
    kindLabel: "No resource join",
    kind: "missing",
    missing: true,
  }
}

/**
 * The hop word on the focused diagram. Trust keeps the producer's Deny /
 * conditional statement wording — an action list must not overwrite it.
 */
export function identityAccessPathHopLabel(edge: IdentityLensEdge): string {
  if (edge.family === "WORKLOAD_USES_ROLE") {
    const modes = typeof edge.facts.attachment_modes === "string" ? edge.facts.attachment_modes : ""
    return modes && modes !== IDENTITY_FAMILY_LABEL.WORKLOAD_USES_ROLE ? `Uses role (${modes})` : "Uses role"
  }
  return edge.label
}

function sortPathEdges(edges: IdentityLensEdge[]): IdentityLensEdge[] {
  return [...edges].sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Workload → shared role → resource, plus trust callers into that same role.
 * Role-resource joins are followed in either direction. When no role is on
 * the served neighbourhood, the selected component still exposes every
 * touching join. Bounding and expansion happen in the panel so a selected
 * fifth caller is not dropped.
 */
export function identityFocusedAccessPath(
  lens: IdentityLens,
  nodeId: string,
): IdentityFocusedAccessPath {
  const byId = new Map(lens.nodes.map(item => [item.id, item]))
  const focusNode = byId.get(nodeId)
  const empty: IdentityFocusedAccessPath = {
    hops: [],
    role: null,
    focus: missingTargetEndpoint("selected-component"),
    workloads: [],
    trust: [],
    targets: [],
    selectionJoins: [],
    neighbourhoodIncoming: [],
    neighbourhoodOutgoing: [],
    roleId: null,
    missingTarget: false,
    gaps: [{
      code: "NO_SERVED_ACCESS_PATH",
      detail: "No served identity join is attached to this component.",
    }],
  }
  if (!focusNode) return empty

  const focus = accessPathEndpoint(focusNode)
  const neighbourhood = sortPathEdges(
    lens.edges.filter(edge => edge.sourceId === nodeId || edge.targetId === nodeId),
  )
  const neighbourhoodIncoming = neighbourhood.flatMap(edge => {
    if (edge.targetId !== nodeId) return []
    const peer = byId.get(edge.sourceId)
    if (!peer) return []
    return [{
      id: `${edge.id}:in`,
      branch: "neighbourhood" as const,
      edge,
      from: accessPathEndpoint(peer),
      to: focus,
    }]
  })
  const neighbourhoodOutgoing = neighbourhood.flatMap(edge => {
    if (edge.sourceId !== nodeId) return []
    const peer = byId.get(edge.targetId)
    if (!peer) return []
    return [{
      id: `${edge.id}:out`,
      branch: "neighbourhood" as const,
      edge,
      from: focus,
      to: accessPathEndpoint(peer),
    }]
  })

  const roleNode = resolveAccessPathRole(focusNode, neighbourhood, byId)
  if (!roleNode) {
    const hops = [...neighbourhoodIncoming, ...neighbourhoodOutgoing]
    return {
      hops,
      role: null,
      focus,
      workloads: [],
      trust: [],
      targets: [],
      selectionJoins: [],
      neighbourhoodIncoming,
      neighbourhoodOutgoing,
      roleId: null,
      missingTarget: false,
      gaps: hops.length === 0 ? empty.gaps : [],
    }
  }

  const role = accessPathEndpoint(roleNode)
  const workloads = sortPathEdges(
    lens.edges.filter(edge => edge.family === "WORKLOAD_USES_ROLE" && edge.targetId === roleNode.id),
  ).flatMap(edge => {
    const workload = byId.get(edge.sourceId)
    if (!workload) return []
    return [{
      id: `${edge.id}:workload`,
      branch: "workload" as const,
      edge,
      from: accessPathEndpoint(workload),
      to: role,
    }]
  })
  const trust = sortPathEdges(
    lens.edges.filter(edge => edge.family === "ROLE_TRUST_POLICY" && edge.targetId === roleNode.id),
  ).flatMap(edge => {
    const caller = byId.get(edge.sourceId)
    if (!caller) return []
    return [{
      id: `${edge.id}:trust`,
      branch: "trust" as const,
      edge,
      from: accessPathEndpoint(caller),
      to: role,
    }]
  })
  const targetEdges = sortPathEdges(
    lens.edges.filter(edge => isRoleResourceJoin(edge, roleNode.id, byId)),
  )
  const targets: IdentityAccessPathHop[] =
    targetEdges.length > 0
      ? targetEdges.flatMap(edge => {
          const resource = resourceEndOfJoin(edge, roleNode.id, byId)
          if (!resource) return []
          return [{
            id: `${edge.id}:target`,
            branch: "target" as const,
            edge,
            from: role,
            to: accessPathEndpoint(resource),
          }]
        })
      : [{
          id: `${roleNode.id}::missing-target`,
          branch: "target" as const,
          edge: null,
          from: role,
          to: missingTargetEndpoint(roleNode.id),
        }]

  const gaps: Array<{ code: string; detail: string }> = []
  if (workloads.length === 0) {
    gaps.push({
      code: "NO_SERVED_WORKLOAD_BINDING",
      detail: "No served WORKLOAD_USES_ROLE join reaches this role.",
    })
  }
  if (targetEdges.length === 0) {
    gaps.push({
      code: "NO_SERVED_TARGET_JOIN",
      detail:
        "No identity edge joins this role to a concrete resource in the served block. A role-level action decision or attached policy is not a target access path.",
    })
  }
  if (trust.length === 0) {
    gaps.push({
      code: "NO_SERVED_TRUST_CALLER",
      detail: "No served ROLE_TRUST_POLICY caller reaches this role.",
    })
  }

  // Policies, boundaries and role-level decisions are real neighbours, but
  // are not resource targets. Keep the selected component through its actual
  // directed edge without upgrading that edge to an access claim.
  const represented = new Set([...workloads, ...targets, ...trust].map(hop => hop.edge?.id))
  const selectionJoins = [...neighbourhoodIncoming, ...neighbourhoodOutgoing].filter(hop =>
    !represented.has(hop.edge?.id) &&
    (hop.from.id === role.id || hop.to.id === role.id) && focus.id !== role.id,
  )

  return {
    hops: [...workloads, ...targets, ...trust, ...selectionJoins],
    role,
    focus,
    workloads,
    trust,
    targets,
    selectionJoins,
    neighbourhoodIncoming,
    neighbourhoodOutgoing,
    roleId: roleNode.id,
    missingTarget: targetEdges.length === 0,
    gaps,
  }
}

function resolveAccessPathRole(
  focus: IdentityLensNode,
  neighbourhood: IdentityLensEdge[],
  byId: Map<string, IdentityLensNode>,
): IdentityLensNode | null {
  if (focus.kind === "iam_role") return focus
  for (const edge of neighbourhood) {
    const other = byId.get(edge.sourceId === focus.id ? edge.targetId : edge.sourceId)
    if (other?.kind === "iam_role") return other
  }
  return null
}

function isRoleResourceJoin(
  edge: IdentityLensEdge,
  roleId: string,
  byId: Map<string, IdentityLensNode>,
): boolean {
  const source = byId.get(edge.sourceId)
  const target = byId.get(edge.targetId)
  if (!source || !target) return false
  const roleEnd =
    (source.kind === "iam_role" && source.id === roleId) ||
    (target.kind === "iam_role" && target.id === roleId)
  const resourceEnd =
    ACCESS_PATH_TARGET_KINDS.has(source.kind) || ACCESS_PATH_TARGET_KINDS.has(target.kind)
  return roleEnd && resourceEnd
}

function resourceEndOfJoin(
  edge: IdentityLensEdge,
  roleId: string,
  byId: Map<string, IdentityLensNode>,
): IdentityLensNode | null {
  const source = byId.get(edge.sourceId)
  const target = byId.get(edge.targetId)
  if (source && ACCESS_PATH_TARGET_KINDS.has(source.kind) && source.id !== roleId) return source
  if (target && ACCESS_PATH_TARGET_KINDS.has(target.kind) && target.id !== roleId) return target
  return null
}

export interface IdentityRelationshipExplanation {
  edgeId: string
  family: IdentityLensEdgeFamily
  hopLabel: string
  plane: IdentityPlane
  certainty: IdentityCertainty
  peerLabel: string
  peerKindLabel: string
  actions: string | null
  conditionsPresent: boolean | null
  resourceScope: string | null
  evidence: string[]
  honesty: string
  facts: Array<{ name: string; value: string }>
}

export function identityRelationshipHonesty(edge: IdentityLensEdge): string {
  if (edge.family === "ROLE_TRUST_POLICY") {
    if (edge.facts.effect === "Deny") {
      return "This statement denies assumption. It is not an allow and not an observed assumption."
    }
    if (edge.facts.effect === "Allow") {
      return "This Allow trust statement is configured, not proof a role assumption occurred."
    }
    return "This is a configured trust-policy statement, not permission to assume and not an observed assumption."
  }
  if (edge.family === "ROLE_ACTION_DECISION") {
    return "A role-level action count is not a target-specific allow decision, and configured is not observed use."
  }
  if (edge.family === "WORKLOAD_USES_ROLE") {
    return "A workload-to-role binding is configured attachment, not observed use or effective authorization."
  }
  if (edge.family === "RESOURCE_POLICY_GRANT") {
    return "A resource-policy grant is a configured statement. It is not an evaluated allow on a caller."
  }
  return "This relationship is shown on the plane the producer stated. Configured is not observed, and neither is an effective authorization verdict."
}

export function identityActionResourceScope(edge: IdentityLensEdge): string | null {
  return typeof edge.facts.protects_arn === "string" && edge.facts.protects_arn
    ? edge.facts.protects_arn
    : null
}

export function identityRelationshipExplanation(
  edge: IdentityLensEdge,
  peerLabel: string,
  peerKindLabel: string,
): IdentityRelationshipExplanation {
  const actions = typeof edge.facts.actions === "string" && edge.facts.actions ? edge.facts.actions : null
  const conditionsPresent = typeof edge.facts.has_conditions === "boolean" ? edge.facts.has_conditions : null
  const evidence: string[] = []
  if (edge.generation !== null) evidence.push(`generation ${edge.generation}`)
  if (edge.lastSeen) evidence.push(`last seen ${edge.lastSeen}`)
  if (edge.animated) evidence.push("observed generation backs motion")
  const facts = Object.entries(edge.facts)
    .filter(([, value]) => value !== null && value !== "" && value !== false)
    .map(([name, value]) => ({ name, value: String(value) }))
  return {
    edgeId: edge.id,
    family: edge.family,
    hopLabel: identityAccessPathHopLabel(edge),
    plane: edge.plane,
    certainty: edge.certainty,
    peerLabel,
    peerKindLabel,
    actions,
    conditionsPresent,
    resourceScope: identityActionResourceScope(edge),
    evidence,
    honesty: identityRelationshipHonesty(edge),
    facts,
  }
}

export interface BoundIdentityEdges {
  edges: IdentityLensEdge[]
  /** Lens edges NOT drawn, for any reason (outside the neighbourhood or over the cap). */
  omitted: number
  focused: boolean
  /** With a focus: edges inside the neighbourhood that the cap left out. These
   *  are the ones "select fewer hops / raise the cap" would reach; the rest of
   *  `omitted` is outside the neighbourhood by construction. */
  omittedInNeighbourhood: number
  /** With a focus: edges inside the neighbourhood, before the cap. */
  reachable: number
}

/**
 * Bounded neighbourhood.
 *
 * With no focus: the first `cap` edges in producer order and the remainder
 * count, so a large graph is never drawn whole without saying it was cut.
 *
 * With a focus: the edges within `hops` of `focusId`, ALSO bounded by `cap`.
 * Every edge in the neighbourhood is ranked by the hop at which it was first
 * reached (the focus's own lines first, then their neighbours' …), ties kept
 * in producer order, and the first `cap` are drawn. This is deterministic for
 * one payload — the same selection always draws the same lines — and it keeps
 * the selected node's immediate context on the canvas whatever the cap, so a
 * dense two-hop expansion never pushes the focus's own relationships out.
 *
 * The count of what the cap left out INSIDE the neighbourhood is reported
 * separately from what lies outside it: "12 not drawn" must not read as
 * "12 unrelated" when 5 of them touch the selected node's neighbours.
 */
export function boundIdentityEdges(
  edges: readonly IdentityLensEdge[],
  focusId: string | null,
  hops: number,
  cap: number,
): BoundIdentityEdges {
  const limit = Math.max(0, cap)
  if (!focusId) {
    const kept = edges.slice(0, limit)
    return {
      edges: kept,
      omitted: edges.length - kept.length,
      focused: false,
      omittedInNeighbourhood: 0,
      reachable: edges.length,
    }
  }
  const reached = new Set<string>([focusId])
  /** Edge index → the hop at which both its ends were first inside the frontier. */
  const hopOfEdge = new Map<number, number>()
  for (let hop = 0; hop < hops; hop += 1) {
    // Expand from the frontier as it stood at the START of this hop; growing
    // `reached` mid-pass would let a later edge in the list ride one hop
    // further than the count promises.
    const frontier = new Set(reached)
    for (const [index, edge] of edges.entries()) {
      if (frontier.has(edge.sourceId) || frontier.has(edge.targetId)) {
        reached.add(edge.sourceId)
        reached.add(edge.targetId)
        if (!hopOfEdge.has(index)) hopOfEdge.set(index, hop + 1)
      }
    }
  }
  // An edge whose two ends were BOTH reached (possibly through different
  // paths) is inside the neighbourhood even if it was first touched late.
  const inside: { index: number; hop: number }[] = []
  for (const [index, edge] of edges.entries()) {
    if (reached.has(edge.sourceId) && reached.has(edge.targetId)) {
      inside.push({ index, hop: hopOfEdge.get(index) ?? hops })
    }
  }
  inside.sort((a, b) => a.hop - b.hop || a.index - b.index)
  const keptIndexes = inside.slice(0, limit).map(item => item.index).sort((a, b) => a - b)
  const kept = keptIndexes.map(index => edges[index])
  return {
    edges: kept,
    omitted: edges.length - kept.length,
    focused: true,
    omittedInNeighbourhood: inside.length - kept.length,
    reachable: inside.length,
  }
}
