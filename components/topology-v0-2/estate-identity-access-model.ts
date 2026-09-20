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
 *   invalid     A block is present but is not this contract. Never rendered as
 *               data.
 *   unavailable The projector reached the canonical path and refused: a pointer
 *               was missing, drifted, or failed verification. The gap codes say
 *               which.
 *   ready       The active canonical generation was read. `roles: []` here is
 *               an ANSWER — zero workload->role bindings in this scope — not a
 *               gap, and the tab says so in those words.
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

export interface GraphDecisionNode {
  kind: "decision"
  id: string
  roleId: string
  /** "ready" when the decision authority was read for this role. */
  state: "ready" | "unavailable"
  /** Plane "configured": how many actions the policy universe grants. */
  configuredGrantCount: number | null
  /**
   * Plane "observed", and present ONLY when observed_use.state is "ready".
   * A role whose decisions were withheld has no observed counts to show, and
   * zero is not the same as unknown.
   */
  observed: {
    successful: number | null
    deniedOnly: number | null
    notObserved: number | null
    unknown: number | null
    lastSuccessAt: string | null
  } | null
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

export type GraphNode = GraphWorkloadNode | GraphRoleNode | GraphDecisionNode

export interface GraphEdge {
  from: string
  to: string
  /** The capability family this edge is drawn from — never a legacy edge. */
  family: "WORKLOAD_USES_ROLE" | "ROLE_ACTION_DECISION"
  plane: Plane
  label: string
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
  projectionScope: string | null
  generation: number | null
  sourceVectorHash: string | null
  projectionReceiptHash: string | null
  projectedThrough: string | null
  stagingRunId: string | null
}

export type IdentityViewState = "absent" | "invalid" | "scope_mismatch" | "unavailable" | "ready"

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
  roles: IdentityRole[]
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

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function receipt(label: string, authority: IdentityAuthority | null | undefined): AuthorityReceipt | null {
  if (!authority || typeof authority !== "object") return null
  return {
    label,
    projectionScope: str(authority.projection_scope),
    generation: num(authority.generation),
    sourceVectorHash: str(authority.source_vector_hash),
    projectionReceiptHash: str(authority.projection_receipt_hash),
    projectedThrough: str(authority.projected_through),
    stagingRunId: str(authority.staging_run_id),
  }
}

function receipts(block: IdentityAccessBlock): AuthorityReceipt[] {
  const out: AuthorityReceipt[] = []
  const inventory = receipt("Canonical inventory", block.inventory_authority)
  if (inventory) out.push(inventory)
  const decision = receipt("Role action decision", block.decision_authority)
  if (decision) out.push(decision)
  return out
}

/**
 * Cross-check the identity block's scope against the payload carrying it.
 *
 * Only three fields exist on both. `customer_id` is echoed and NOT verified —
 * the topology payload does not carry a tenant id, so there is nothing here to
 * compare it to, and the view says which is which rather than implying a
 * tenant check this code cannot perform.
 */
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
export function buildGraph(roles: IdentityRole[]): IdentityGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const seenWorkloads = new Set<string>()

  for (const role of roles) {
    const roleNodeId = `role:${role.role_id}`
    const attachmentModes = [...(role.attachment_modes ?? [])].sort()
    nodes.push({
      kind: "role",
      id: roleNodeId,
      roleId: role.role_id,
      label: str(role.name) ?? role.role_id,
      roleArn: str(role.role_arn),
      lifecycleState: str(role.lifecycle_state),
      attachmentModes,
    })

    for (const workloadId of [...(role.workload_ids ?? [])].sort()) {
      const workloadNodeId = `workload:${workloadId}`
      if (!seenWorkloads.has(workloadNodeId)) {
        seenWorkloads.add(workloadNodeId)
        nodes.push({ kind: "workload", id: workloadNodeId, visibleId: workloadId })
      }
      edges.push({
        from: workloadNodeId,
        to: roleNodeId,
        family: "WORKLOAD_USES_ROLE",
        plane: "configured",
        label: attachmentModes.join(", ") || "uses role",
      })
    }

    const configured = role.configured_grants ?? {}
    const observedUse = role.observed_use ?? {}
    const decisionReady = configured.state === "ready"
    const observedReady = observedUse.state === "ready"
    const effective = role.effective_authorization ?? {}
    const decisionNodeId = `decision:${role.role_id}`
    nodes.push({
      kind: "decision",
      id: decisionNodeId,
      roleId: role.role_id,
      state: decisionReady ? "ready" : "unavailable",
      configuredGrantCount: decisionReady ? num(configured.exact_action_count) : null,
      observed: observedReady
        ? {
            successful: num(observedUse.successful_action_count),
            deniedOnly: num(observedUse.denied_only_action_count),
            notObserved: num(observedUse.not_observed_action_count),
            unknown: num(observedUse.unknown_action_count),
            lastSuccessAt: str(observedUse.last_success_at),
          }
        : null,
      effectiveAuthorization: {
        availability: str(effective.availability) ?? "unavailable",
        decision: str(effective.decision),
        reasonCodes: [...(effective.reason_codes ?? [])],
      },
      gaps: [...(role.gaps ?? [])],
    })
    edges.push({
      from: roleNodeId,
      to: decisionNodeId,
      family: "ROLE_ACTION_DECISION",
      // An edge to a withheld decision stands on the configured plane only.
      // Calling it observed would assert evidence that was not read.
      plane: observedReady ? "observed" : "configured",
      label: decisionReady ? "decided" : "decision unavailable",
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
  const rows = raw.filter(
    (row): row is RelationshipCapability => Boolean(row) && typeof row === "object",
  )
  if (rows.length === 0) {
    return {
      capabilities: [],
      capabilitiesUnavailableReason:
        "The capability matrix arrived empty. A matrix with no families is not a " +
        "statement that every family is servable.",
    }
  }
  return {
    capabilities: [...rows].sort((a, b) => String(a.family).localeCompare(String(b.family))),
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

  const block = raw as IdentityAccessBlock
  const contractVersion = str(block.contract_version)
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

  const { capabilities, capabilitiesUnavailableReason } = capabilityRows(block)
  const scope = block.scope ?? null
  const scopeBinding = bindScope(scope, payload)
  const common = {
    contractVersion,
    scope,
    scopeBinding,
    capabilities,
    capabilitiesUnavailableReason,
  }

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

  const gaps = [...(block.gaps ?? [])]
  const status = str(block.status)
  if (status === "unavailable") {
    return shell(
      "unavailable",
      "The canonical identity projection could not be served for this scope.",
      gaps.length > 0
        ? "The projector reached the canonical path and refused. Each gap below names why."
        : "The projector reported the projection unavailable without naming a gap code.",
      { ...common, projectionStatus: status, receipts: receipts(block), gaps },
    )
  }

  const roles = [...(block.roles ?? [])]
  const emptyAuthoritative = roles.length === 0
  const rolesTotal = num(block.roles_total)
  return shell(
    "ready",
    emptyAuthoritative
      ? "No workload in this scope is bound to an IAM role."
      : `${roles.length} role${roles.length === 1 ? "" : "s"} bound to workloads in this scope.`,
    emptyAuthoritative
      ? "The active canonical generation was read successfully and holds no " +
          "workload-to-role binding here. That is an answer, not a missing read."
      : "Read from the active canonical inventory generation, joined to the " +
          "hash-verified decision authority.",
    {
      ...common,
      projectionStatus: status,
      receipts: receipts(block),
      graph: buildGraph(roles),
      roles,
      rolesTotal,
      rolesReturned: num(block.roles_returned) ?? roles.length,
      rolesTruncated: block.roles_truncated === true,
      rolesOmittedUnresolved: num(block.roles_omitted_unresolved),
      emptyAuthoritative,
      gaps,
    },
  )
}
