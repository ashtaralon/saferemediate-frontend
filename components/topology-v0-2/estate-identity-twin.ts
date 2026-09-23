/**
 * Identity & access as a 1:1 twin of the Network view (CF01, 2026-09-23).
 *
 * The Network view is frames + chips + FlowOverlay lines. The identity lens
 * used to add a SECOND grammar under the frame — sixteen kind-rows of chips
 * joined by one orthogonal line per relationship — and that is the hairball.
 * This module keeps the frame's grammar and swaps only the INPUTS the frame
 * already accepts:
 *
 *   - rail nodes: IAM roles (a lane beside the regional rail), the AWS services
 *     a role reaches (anchors on the regional rail / triggers band, one per
 *     service, because a RoleActionDecision row is action-scoped and cannot
 *     name a bucket), and the principals that may assume a role (the strip
 *     where the Network view keeps Users / Internet);
 *   - overlay edges: workload → role ("runs as", the mechanism as the badge),
 *     principal → role ("may assume"), role → service ("explicit N · used M"),
 *     with the producer's plane on every line and motion ONLY on observed use
 *     backed by a decision generation — the rule the Network view already
 *     applies to traffic.
 *
 * Nothing is drawn that the data does not carry. A role whose decision
 * evidence is not projected draws no reach line and says "usage not computed"
 * on its chip; a service prefix the canvas has no home for is listed on the
 * chip as "not drawn", never invented as a target; policies, decision records,
 * VPC-endpoint policies and organisation context are captions and counts,
 * never chips.
 */
import type { IdentityEdgeAnnotation, TopologyNode, TrafficEdge } from "./types"
import {
  DECISION_AUTHORITY_LABEL,
  INVENTORY_AUTHORITY_LABEL,
  identityFocusRelation,
  type IdentityLens,
  type IdentityLensEdge,
  type IdentityLensNode,
} from "./estate-identity-access-model"

export const IDENTITY_SERVICE_ANCHOR_PREFIX = "__identity:service:"

/** Canvas anchor for "role reaches <service> at action scope". */
export function identityServiceAnchorId(servicePrefix: string): string {
  return `${IDENTITY_SERVICE_ANCHOR_PREFIX}${servicePrefix}__`
}

export function isIdentityServiceAnchorId(id: string): boolean {
  return id.startsWith(IDENTITY_SERVICE_ANCHOR_PREFIX) && id.endsWith("__")
}

/**
 * Service prefixes the Network canvas already has a home for. The `type` is
 * the placement-catalog type that puts the anchor on the regional rail
 * (`regional` slot) or in the triggers band (`triggers` slot) — the same
 * slots the Network view draws these services in. A prefix absent here has
 * no honest place on the frame and is reported on the role chip instead.
 */
export const IDENTITY_SERVICE_TARGETS: Readonly<Record<string, { type: string; name: string }>> = {
  s3: { type: "S3", name: "S3 · any bucket" },
  kms: { type: "KMSKey", name: "KMS · any key" },
  secretsmanager: { type: "SecretsManagerSecret", name: "Secrets Manager · any secret" },
  dynamodb: { type: "DynamoDB", name: "DynamoDB · any table" },
  logs: { type: "CloudWatchLogGroup", name: "CloudWatch Logs · any group" },
  cloudtrail: { type: "CloudTrail", name: "CloudTrail · any trail" },
  athena: { type: "AthenaWorkgroup", name: "Athena · any workgroup" },
  sqs: { type: "SQS", name: "SQS · any queue" },
  sns: { type: "SNSTopic", name: "SNS · any topic" },
  events: { type: "EventBus", name: "EventBridge · any bus" },
}

/** The producer's resource_grant resource_type → the service prefix it protects. */
const GRANT_TYPE_TO_PREFIX: Readonly<Record<string, string>> = {
  "s3:bucket-authorization": "s3",
  "kms:key-authorization": "kms",
  "secretsmanager:secret-authorization": "secretsmanager",
  "sns:topic-authorization": "sns",
  "sqs:queue-authorization": "sqs",
  "events:event-bus-authorization": "events",
  "lambda:function-authorization": "lambda",
  "ec2:vpc-endpoint-authorization": "vpc-endpoint",
}

/** What the producer's `action_details` rows look like — read leniently. */
export interface RawActionDetail {
  action?: unknown
  configured_grant?: unknown
  usage_state?: unknown
  coverage_state?: unknown
  last_success_at?: unknown
}

export interface RawRoleActions {
  role_id?: unknown
  action_details?: unknown
  action_details_truncated?: unknown
}

export type TrustPrincipalClass =
  | "this_account_root"
  | "org_management"
  | "other_account"
  | "anyone"
  | "federated"
  | "iam_role"
  | "iam_user"
  | "canonical_user"
  | "unclassified"

export interface TrustPrincipalReading {
  class: TrustPrincipalClass
  /** The chip's short label. */
  label: string
  /** Placement-catalog type (icon). */
  type: string
  accountId: string | null
}

const ACCOUNT_ID_RE = /^\d{12}$/
const CANONICAL_USER_RE = /^[0-9a-f]{64}$/i

/**
 * Who a trust-policy principal is, from the raw `Principal` string the
 * producer carries (`scripts/estate_identity_graph.py` emits the string as
 * both arn and name). The account split is the load-bearing part: the
 * organisation's own management account must never read as an outside party,
 * and `:root` is the account-wide grant, not the root user.
 */
export function classifyTrustPrincipal(
  principal: { kind: IdentityLensNode["kind"]; arn: string | null; label: string },
  scope: { accountId: string | null; managementAccountId: string | null },
): TrustPrincipalReading {
  const raw = (principal.arn ?? principal.label ?? "").trim()
  const accountOf = (acct: string | null): TrustPrincipalReading => {
    if (!acct) return { class: "unclassified", label: raw || "principal", type: "AWSAccountPrincipal", accountId: null }
    const short = `${acct.slice(0, 4)}…${acct.slice(-4)}`
    if (scope.accountId && acct === scope.accountId) {
      return { class: "this_account_root", label: "this account (:root)", type: "AWSAccountPrincipal", accountId: acct }
    }
    if (scope.managementAccountId && acct === scope.managementAccountId) {
      return { class: "org_management", label: `acct ${short} · org management`, type: "AWSAccountPrincipal", accountId: acct }
    }
    return { class: "other_account", label: `acct ${short} · other account`, type: "AWSAccountPrincipal", accountId: acct }
  }
  if (principal.kind === "federated_principal") {
    const provider = raw.split("/").pop() ?? raw
    return { class: "federated", label: `${provider || "identity provider"} · SAML / OIDC`, type: "FederatedPrincipal", accountId: null }
  }
  if (raw === "*") return { class: "anyone", label: "anyone (*)", type: "AnyonePrincipal", accountId: null }
  if (ACCOUNT_ID_RE.test(raw)) return accountOf(raw)
  if (CANONICAL_USER_RE.test(raw)) {
    return { class: "canonical_user", label: "canonical user", type: "AWSAccountPrincipal", accountId: null }
  }
  const parts = raw.split(":")
  if (parts.length >= 6 && parts[0] === "arn" && parts[2] === "iam") {
    const acct = ACCOUNT_ID_RE.test(parts[4]) ? parts[4] : null
    const resource = parts.slice(5).join(":")
    if (resource === "root") return accountOf(acct)
    if (resource.startsWith("role/")) {
      const name = resource.slice("role/".length)
      const where = acct && scope.accountId && acct !== scope.accountId ? ` · acct ${acct.slice(-4)}` : ""
      return { class: "iam_role", label: `role ${name}${where}`, type: "IAMRole", accountId: acct }
    }
    if (resource.startsWith("user/")) {
      const name = resource.slice("user/".length)
      return { class: "iam_user", label: `user ${name}`, type: "IAMUser", accountId: acct }
    }
    if (resource.startsWith("saml-provider/") || resource.startsWith("oidc-provider/")) {
      const provider = resource.split("/").pop() ?? resource
      return { class: "federated", label: `${provider} · SAML / OIDC`, type: "FederatedPrincipal", accountId: acct }
    }
  }
  return { class: "unclassified", label: raw || "principal", type: "AWSAccountPrincipal", accountId: null }
}

/** Mechanism word for a workload → role binding, in AWS's own terms. */
export function bindingMechanismWord(attachmentModes: string, workloadType: string | null): string {
  const modes = attachmentModes.split(",").map(m => m.trim()).filter(Boolean)
  const type = (workloadType ?? "").toLowerCase()
  const words = modes.map(mode => {
    if (mode === "instance_profile") return "instance profile"
    if (mode === "direct") return type.startsWith("lambda") ? "execution role" : "attached directly"
    return mode.replace(/_/g, " ")
  })
  return words.length > 0 ? words.join(", ") : "runs as"
}

export interface IdentityReach {
  prefix: string
  explicit: number
  used: number
  notObserved: number
  denied: number
  unknown: number
  /** Any row in the prefix with partial or unknown coverage. */
  coverageIncomplete: boolean
  lastSuccessAt: string | null
}

function usageState(row: RawActionDetail): string {
  return typeof row.usage_state === "string" ? row.usage_state : "UNKNOWN"
}

function coverageState(row: RawActionDetail): string {
  return typeof row.coverage_state === "string" ? row.coverage_state : "UNKNOWN"
}

/** Group a role's decision rows by service prefix. */
export function reachByService(rows: readonly RawActionDetail[]): IdentityReach[] {
  const byPrefix = new Map<string, IdentityReach>()
  for (const row of rows) {
    if (typeof row.action !== "string") continue
    const prefix = row.action.includes(":") ? row.action.slice(0, row.action.indexOf(":")).toLowerCase() : row.action.toLowerCase()
    const reach = byPrefix.get(prefix) ?? {
      prefix, explicit: 0, used: 0, notObserved: 0, denied: 0, unknown: 0, coverageIncomplete: false, lastSuccessAt: null,
    }
    if (row.configured_grant === true) reach.explicit += 1
    const usage = usageState(row)
    if (usage === "SUCCESS_OBSERVED") reach.used += 1
    else if (usage === "DENIED_ONLY") reach.denied += 1
    else if (usage === "NOT_OBSERVED") reach.notObserved += 1
    else reach.unknown += 1
    if (coverageState(row) !== "COMPLETE") reach.coverageIncomplete = true
    if (typeof row.last_success_at === "string" && (!reach.lastSuccessAt || row.last_success_at > reach.lastSuccessAt)) {
      reach.lastSuccessAt = row.last_success_at
    }
    byPrefix.set(prefix, reach)
  }
  return [...byPrefix.values()].sort((a, b) => a.prefix.localeCompare(b.prefix))
}

export interface IdentityTwinCounts {
  /** Roles a visible workload runs as — the rows of the map. */
  boundRoles: number
  /** Bound roles whose decision evidence is not projected. */
  rolesUsageNotComputed: number
  /** Roles in the account no visible workload runs as (excluding service-linked). */
  otherAccountRoles: number
  /** AWS service-linked roles, hidden by name (`AWSServiceRole…`). */
  serviceLinkedRoles: number
  /** Workloads bound in the generation but not on this canvas. */
  boundWorkloadsOffCanvas: number
  /** VPC-endpoint policy rows: a bound on a path, annotated on the Endpoints tile. */
  endpointPolicyRows: number
  /** Protected resources the canvas could not place. */
  targetsNotOnMap: number
  /** IAM users the graph carried (coverage of that family is unknown). */
  users: number
  /** Trust entrances drawn, by class. */
  trustEntrances: Record<TrustPrincipalClass, number>
  /** Service prefixes reached that the canvas has no home for (never drawn). */
  reachNotDrawn: number
}

export interface IdentityTwin {
  roleNodes: TopologyNode[]
  principalNodes: TopologyNode[]
  serviceNodes: TopologyNode[]
  edges: TrafficEdge[]
  /** One caption line per chip id — workloads (mechanism · role), roles
   *  (explicit · used, or "usage not computed"), services (policy rows). */
  captions: Map<string, string>
  /** Per bound role: service prefixes reached that are not drawn on the canvas. */
  reachNotDrawn: Map<string, string[]>
  /** Per principal chip, the trust-principal class it was read as. */
  principalClasses: Map<string, TrustPrincipalClass>
  counts: IdentityTwinCounts
}

export interface IdentityTwinOptions {
  /** The raw `identity_access.roles[]` rows, for per-action reach. */
  rawRoles?: readonly RawRoleActions[] | null
  /** The frame's nodes, for workload types (mechanism words) and ids. */
  topologyNodes: readonly Pick<TopologyNode, "id" | "type">[]
  focusId?: string | null
}

function roleSuffix(name: string, keep = 28): string {
  return name.length > keep ? `…${name.slice(-keep)}` : name
}

function trafficEdge(
  edge: Pick<IdentityLensEdge, "family" | "plane" | "certainty" | "verdict" | "label" | "animated" | "generation" | "lastSeen" | "sourceId" | "targetId">,
  focusId: string | null | undefined,
): TrafficEdge {
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
    authority_state: observed ? (edge.animated ? "authoritative" : "legacy_unverified") : "configured",
    path_basis: observed ? "observed_segment" : "configured_route",
    projection_generation: edge.generation,
    last_seen: observed ? edge.lastSeen : null,
    identity: annotation,
  }
}

/**
 * Build the twin's rail nodes, overlay edges and captions from a lens that the
 * existing model already validated and scoped.
 */
export function buildIdentityTwin(lens: IdentityLens, options: IdentityTwinOptions): IdentityTwin {
  const focusId = options.focusId ?? null
  const typeById = new Map(options.topologyNodes.map(node => [node.id, node.type ?? null]))
  const nodeById = new Map(lens.nodes.map(node => [node.id, node]))
  const decisionGeneration = lens.receipts.find(r => r.label === DECISION_AUTHORITY_LABEL)?.generation ?? null
  const inventoryGeneration = lens.receipts.find(r => r.label === INVENTORY_AUTHORITY_LABEL)?.generation ?? null
  const scope = {
    accountId: lens.scope?.account_id ?? null,
    managementAccountId: lens.accountContext?.managementAccountId ?? null,
  }

  const edges: TrafficEdge[] = []
  const captions = new Map<string, string>()
  const roleNodes = new Map<string, TopologyNode>()
  const principalNodes = new Map<string, TopologyNode>()
  const serviceNodes = new Map<string, TopologyNode>()
  const reachNotDrawn = new Map<string, string[]>()
  const principalClasses = new Map<string, TrustPrincipalClass>()
  const trustEntrances: Record<TrustPrincipalClass, number> = {
    this_account_root: 0, org_management: 0, other_account: 0, anyone: 0, federated: 0,
    iam_role: 0, iam_user: 0, canonical_user: 0, unclassified: 0,
  }

  // ── 1. workload → role: the rows of the map ──────────────────────────────
  const boundRoleIds = new Set<string>()
  const workloadCaptionParts = new Map<string, string[]>()
  let boundWorkloadsOffCanvas = 0
  for (const edge of lens.edges) {
    if (edge.family !== "WORKLOAD_USES_ROLE") continue
    const workload = nodeById.get(edge.sourceId)
    const role = nodeById.get(edge.targetId)
    if (!workload || !role) continue
    if (!workload.onCanvas) {
      boundWorkloadsOffCanvas += 1
      continue
    }
    boundRoleIds.add(role.id)
    const modes = typeof edge.facts.attachment_modes === "string" ? edge.facts.attachment_modes : ""
    const mechanism = bindingMechanismWord(modes, typeById.get(workload.id) ?? null)
    edges.push(trafficEdge({ ...edge, label: mechanism }, focusId))
    const parts = workloadCaptionParts.get(workload.id) ?? []
    parts.push(`${mechanism} · ${roleSuffix(role.label)}`)
    workloadCaptionParts.set(workload.id, parts)
    if (!roleNodes.has(role.id)) {
      roleNodes.set(role.id, {
        id: role.id,
        name: role.label,
        type: "IAMRole",
        subnet_id: null,
        score: null,
        stale: null,
        is_jewel: false,
        account_id: scope.accountId,
        resource_id: role.arn,
      })
    }
  }
  for (const [workloadId, parts] of workloadCaptionParts) captions.set(workloadId, parts.join(" · "))

  // ── 2. principal → role: who else may assume it ──────────────────────────
  for (const edge of lens.edges) {
    if (edge.family !== "ROLE_TRUST_POLICY") continue
    if (!boundRoleIds.has(edge.targetId)) continue
    const principal = nodeById.get(edge.sourceId)
    if (!principal) continue
    // Service-principal trust is the mechanism of hop 1, not a second entrance.
    if (principal.kind === "service_principal") continue
    const reading = classifyTrustPrincipal(
      { kind: principal.kind, arn: principal.arn, label: principal.label },
      scope,
    )
    trustEntrances[reading.class] += 1
    principalClasses.set(principal.id, reading.class)
    if (!principalNodes.has(principal.id)) {
      principalNodes.set(principal.id, {
        id: principal.id,
        name: reading.label,
        type: reading.type,
        subnet_id: null,
        score: null,
        stale: null,
        is_jewel: false,
        account_id: reading.accountId,
        resource_id: principal.arn,
      })
    }
    const conditioned = edge.facts.has_conditions === true
    const denied = edge.verdict === "denied"
    const label = denied
      ? `statement denies · ${conditioned ? "conditioned" : "unconditioned"}`
      : `may assume · ${conditioned ? "conditioned" : "unconditioned"}`
    edges.push(trafficEdge({ ...edge, label, animated: false }, focusId))
  }

  // ── 3. role → service: explicit N · used M, at action scope ──────────────
  const rawByRoleId = new Map<string, RawRoleActions>()
  for (const raw of options.rawRoles ?? []) {
    if (typeof raw.role_id === "string") rawByRoleId.set(raw.role_id, raw)
  }
  let rolesUsageNotComputed = 0
  let reachNotDrawnTotal = 0
  for (const roleId of boundRoleIds) {
    const role = nodeById.get(roleId)
    if (!role) continue
    // The lens's own ROLE_ACTION_DECISION edge says whether counts exist.
    const decision = lens.edges.find(e => e.family === "ROLE_ACTION_DECISION" && e.sourceId === roleId)
    const configuredReady = decision !== undefined && decision.verdict !== "unknown"
    const captionParts: string[] = []
    if (!configuredReady) {
      rolesUsageNotComputed += 1
      captionParts.push("usage not computed")
    } else {
      const explicit = decision.facts.configured_grants
      const used = decision.facts.successful_action_count
      captionParts.push(
        `explicit ${typeof explicit === "number" ? explicit : "?"} · used ${typeof used === "number" ? used : "?"}`,
      )
      const raw = rawByRoleId.get(role.sublabel ?? "") ?? rawByRoleId.get(roleId)
      const rows = raw && Array.isArray(raw.action_details) ? (raw.action_details as RawActionDetail[]) : []
      // The producer serves at most the first 25 decision rows per role
      // (`action_details_truncated`). A per-service verdict computed from a
      // cut slice would fabricate "not observed" for a service whose rows
      // were cut, so under truncation only what the slice PROVES is drawn:
      // observed use is monotone (one observed row is enough) and its count
      // is a floor; nothing is said about the services the slice omits.
      const truncated = raw?.action_details_truncated === true
      const notDrawn: string[] = []
      let withheldByTruncation = 0
      for (const reach of reachByService(rows)) {
        const target = IDENTITY_SERVICE_TARGETS[reach.prefix]
        if (!target) {
          notDrawn.push(reach.prefix)
          continue
        }
        const observed = reach.used > 0
        if (truncated && !observed) {
          withheldByTruncation += 1
          continue
        }
        const anchorId = identityServiceAnchorId(reach.prefix)
        if (!serviceNodes.has(anchorId)) {
          serviceNodes.set(anchorId, {
            id: anchorId,
            name: target.name,
            type: target.type,
            subnet_id: null,
            score: null,
            stale: null,
            is_jewel: false,
            account_id: scope.accountId,
            resource_id: null,
          })
        }
        const verdict = observed ? "observed" : reach.denied > 0 && reach.used === 0 && reach.notObserved === 0 && reach.unknown === 0
          ? "denied"
          : reach.coverageIncomplete || reach.unknown > 0 ? "unknown" : "configured"
        const word = observed
          ? truncated ? `used ≥${reach.used}` : `used ${reach.used}`
          : verdict === "denied" ? "denied only" : verdict === "unknown" ? "use unknown" : "not observed"
        const explicitWord = truncated ? `explicit ≥${reach.explicit}` : `explicit ${reach.explicit}`
        const animated = observed && decisionGeneration !== null
        edges.push(trafficEdge({
          family: "ROLE_ACTION_DECISION",
          plane: observed ? "observed" : "configured",
          certainty: "resolved",
          verdict,
          label: `${reach.prefix} · ${explicitWord} · ${word}`,
          animated,
          generation: observed ? decisionGeneration : decisionGeneration ?? inventoryGeneration,
          lastSeen: reach.lastSuccessAt,
          sourceId: roleId,
          targetId: anchorId,
        }, focusId))
      }
      if (truncated) {
        captionParts.push(
          withheldByTruncation > 0
            ? `first 25 actions only · ${withheldByTruncation} service${withheldByTruncation === 1 ? "" : "s"} without observed use in them: not drawn`
            : "first 25 actions only · services beyond them: not served",
        )
      }
      if (notDrawn.length > 0) {
        reachNotDrawn.set(roleId, notDrawn)
        reachNotDrawnTotal += notDrawn.length
        captionParts.push(`not drawn: ${notDrawn.join(", ")}`)
      }
    }
    // The mechanism trust (ec2 / lambda.amazonaws.com) folds into the role caption.
    const serviceTrust = lens.edges
      .filter(e => e.family === "ROLE_TRUST_POLICY" && e.targetId === roleId && nodeById.get(e.sourceId)?.kind === "service_principal")
      .map(e => nodeById.get(e.sourceId)?.label ?? "")
      .filter(Boolean)
    if (serviceTrust.length > 0) captionParts.push(`trusts ${serviceTrust.sort().join(", ")}`)
    captions.set(roleId, captionParts.join(" · "))
  }

  // ── 4. resource-policy rows → captions on the service anchors, never lines ─
  const policyRowsByPrefix = new Map<string, number>()
  let endpointPolicyRows = 0
  for (const node of lens.nodes) {
    if (node.kind !== "resource_policy") continue
    const prefix = GRANT_TYPE_TO_PREFIX[node.label] ?? null
    if (prefix === "vpc-endpoint") {
      endpointPolicyRows += 1
      continue
    }
    if (prefix) policyRowsByPrefix.set(prefix, (policyRowsByPrefix.get(prefix) ?? 0) + 1)
  }
  for (const [prefix, rows] of policyRowsByPrefix) {
    const anchorId = identityServiceAnchorId(prefix)
    if (!serviceNodes.has(anchorId)) continue
    captions.set(anchorId, `${rows} policy row${rows === 1 ? "" : "s"} projected · present/absent: not served`)
  }

  // ── 5. counts for the footer: nothing hidden without a number ────────────
  let serviceLinkedRoles = 0
  let otherAccountRoles = 0
  let users = 0
  let targetsNotOnMap = 0
  for (const node of lens.nodes) {
    if (node.kind === "iam_role" && !boundRoleIds.has(node.id)) {
      if (node.label.startsWith("AWSServiceRole")) serviceLinkedRoles += 1
      else otherAccountRoles += 1
    } else if (node.kind === "iam_user") {
      users += 1
    } else if (node.kind === "protected_resource" && !node.onCanvas) {
      targetsNotOnMap += 1
    }
  }

  return {
    roleNodes: [...roleNodes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    principalNodes: [...principalNodes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    serviceNodes: [...serviceNodes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    edges,
    captions,
    reachNotDrawn,
    principalClasses,
    counts: {
      boundRoles: boundRoleIds.size,
      rolesUsageNotComputed,
      otherAccountRoles,
      serviceLinkedRoles,
      boundWorkloadsOffCanvas,
      endpointPolicyRows,
      targetsNotOnMap,
      users,
      trustEntrances,
      reachNotDrawn: reachNotDrawnTotal,
    },
  }
}
