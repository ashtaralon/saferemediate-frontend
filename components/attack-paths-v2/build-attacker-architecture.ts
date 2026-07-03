// =============================================================================
// buildAttackerArchitecture — graph-view → SystemArchitecture synthesis.
// =============================================================================
//
// Lifted out of components/attack-paths-v2/attacker-view-panel.tsx during the
// 2026-05-31 Per-Path/Attacker-View merge so the merged AttackPathPanel can
// reuse the synthesis without depending on the deleted panel file.
//
// Inputs:
//   - GraphViewResponse: raw response from POST /api/attack-chain/graph-view
//     (nodes + per-node lateral fan-outs)
//   - IdentityAttackPath: the chain whose nodes/edges this graph is centered
//     on (used for on-path overlay + path-tier classification)
//
// Output:
//   - SystemArchitecture: the shape TrafficFlowMap renders. 9 lanes (compute,
//     subnets, route tables, security groups, NACLs, identity, egress
//     gateways, resources, plus principals), VPC boundaries, on-path vs
//     lateral edge distinction, hover-provenance fields preserved on the
//     CanvasEdge[] tail.
//
// History:
//   - 2026-05-22: rewritten from V1 tree-list to flow-map synthesis
//   - 2026-05-26: lateral_cap_per_node 30 → 200 (collector dedup pressure)
//   - 2026-05-28: edge semantic states (locked vs operator-controllable)
//   - 2026-05-29: VPCEndpoint added to egress-gateway lane
//   - 2026-05-30: explicit CanvasEdge[] (no cross-plane synthesis)
//   - 2026-05-31: extracted into its own module — same logic, no behavior
//     change
// =============================================================================

import type {
  SystemArchitecture,
  ServiceNode,
  SubnetNode,
  SecurityCheckpoint,
  TrafficFlow,
  EgressGatewayNode,
} from "@/components/dependency-map/traffic-flow-map"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { CanvasEdge, CanvasRelationshipType } from "@/lib/types/attack-canvas"
import { isOpaqueIamId } from "./friendly-names"

// ─── Graph-view response shape (forwarded verbatim from the backend) ──

export interface GraphViewNode {
  id: string
  name: string | null
  /** Canonical display identity (backend display-name contract,
   *  unified/graph/display_name.py): collector name → AWS Name tag →
   *  type-derived → id fallback, resolved server-side with provenance.
   *  Null until the reconciler has stamped the node — consumers fall
   *  back to `name`. */
  display_name?: string | null
  labels: string[]
  type: string
  key_properties: Record<string, any>
}

export interface GraphViewEdge {
  direction: "in" | "out"
  type: string
  neighbor_id: string
  neighbor_arn: string | null
  neighbor_name: string | null
  neighbor_labels: string[]
  neighbor_type: string
  observed: boolean | null
  bytes: number | null
  hit_count: number | null
  port: number | null
  protocol: string | null
  first_seen: string | null
  last_seen: string | null
  on_path: boolean
  significance:
    | "escalation"
    | "data"
    | "identity"
    | "network"
    | "forensic"
    | "control"
    | "misc"
}

export interface GraphViewResponse {
  system_name: string
  node_count: number
  nodes: GraphViewNode[]
  laterals_by_node: Record<string, GraphViewEdge[]>
  generated_at: string
}

const CLASS_LABELS = {
  escalation: "escalation",
  data: "data-access",
  identity: "identity",
  forensic: "observed",
  network: "network",
  control: "control",
  misc: "misc",
} as const

// Strip ARN noise from a name when present — "arn:aws:iam::1234:role/foo"
// → "foo". Keep the original when the input doesn't look like an ARN.
function friendlyName(rawName: string | null, id: string): string {
  const candidate = rawName || id
  if (!candidate) return id
  if (candidate.includes(":::")) {
    return candidate.split(":::")[1] || candidate
  }
  if (candidate.startsWith("arn:")) {
    const tail = candidate.split("/").pop()
    if (tail) return tail
  }
  return candidate
}

// Compact byte formatter used in the header subtitle.
function formatBytesShort(n: number): string {
  if (n <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

function shortName(name: string, maxLen = 22): string {
  if (!name) return ""
  if (name.length <= maxLen) return name
  // Middle-truncate so prefix AND suffix stay visible — "SafeRemediate-Test-Frontend-1"
  // becomes "SafeRem…Frontend-1" instead of "SafeRemediate-Tes…" which makes
  // every SafeRemediate-* instance look identical.
  const half = Math.floor((maxLen - 1) / 2)
  return name.slice(0, half) + "…" + name.slice(-(maxLen - half - 1))
}

// Map graph-view node type → TrafficFlowMap lane bucket. The TFM has
// 5 lanes the attacker view will populate:
//   compute            → COMPUTE
//   resource           → RESOURCES (S3, RDS, DynamoDB, KMS, Secret)
//   sg                 → SECURITY GROUPS
//   nacl               → NACLS
//   iam_role           → IAM ROLES (true IAMRoles only)
//   instance_profile   → INSTANCE PROFILES (separate from roles —
//                        AWS's binding object between EC2 and Role.
//                        Previously merged into iam_role which caused
//                        the "IAM ROLES (3)" miscount on Attacker view.
//                        Split 2026-05-22 per audit.)
//   iam_policy         → IAM POLICIES (the actual grant document; IS
//                        the finding for over-permissive paths)
//   subnet             → SUBNETS lane (rendered as decoration column)
//
// AWS Config writes ConfigurationSnapshot on the same Neo4j node as the
// live resource. Until graph-view/IAP label priority ships, infer the
// operator-meaningful type from the ARN (fix/attacker-view-s3-render).
function resolveGraphTypeForLane(type: string, nodeId?: string): string {
  if ((type || "").toLowerCase() !== "configurationsnapshot") return type
  const id = (nodeId || "").toLowerCase()
  if (id.includes(":s3:") || id.startsWith("arn:aws:s3:::")) return "S3Bucket"
  if (id.includes(":dynamodb:")) return "DynamoDBTable"
  if (id.includes(":rds:")) return "RDSInstance"
  if (id.includes(":role/") && !id.includes(":instance-profile/")) return "IAMRole"
  if (id.includes(":instance-profile/")) return "InstanceProfile"
  return type
}

function bucketForGraphType(
  type: string,
  nodeId?: string,
):
  | "compute"
  | "resource"
  | "sg"
  | "nacl"
  | "iam_role"
  | "instance_profile"
  | "iam_policy"
  | "subnet"
  | "vpc"
  | "principal"
  | "egress_gateway"
  | "network_interface"
  | "ignore" {
  const t = resolveGraphTypeForLane(type, nodeId).toLowerCase()
  if (t.includes("ec2") || t.includes("lambda") || t.includes("ecs") || t.includes("fargate"))
    return "compute"
  if (
    t === "s3bucket" ||
    t === "dynamodbtable" ||
    t === "rdsinstance" ||
    t === "rds" ||
    t === "kmskey" ||
    t === "secret"
  )
    return "resource"
  if (t === "securitygroup") return "sg"
  if (t === "networkacl" || t === "nacl") return "nacl"
  // IAMRole / InstanceProfile / IAMPolicy are THREE different node
  // types with different semantics. Exact-match checks only — the
  // earlier `t.includes("instanceprofile")` was too eager and silently
  // stripped IAMRole nodes from the path on the legacy Attacker View
  // (any node whose serialized type contained that substring fell out
  // of every lane). Per 2026-05-22 hotfix: keep exact-match dispatch
  // and accept the InstanceProfile-count edge case for multi-label
  // nodes (InstanceProfile-bucket lookups can resolve to 0 when the
  // backend surfaces "IAMRole" instead of "InstanceProfile" as
  // node.type — preferable to dropping the entire role from the view).
  if (t === "iamrole" || t === "role") return "iam_role"
  if (t === "instanceprofile") return "instance_profile"
  if (t === "iampolicy") return "iam_policy"
  if (t === "subnet") return "subnet"
  if (t === "vpc") return "vpc"
  if (t === "cloudtrailprincipal" || t === "iamuser" || t === "humanidentity" || t === "awsprincipal" || t.includes("principal"))
    return "principal"
  // Egress gateways — IGW, NAT, EgressOnlyIGW, TransitGateway, VPCEndpoint.
  // VPCEndpoint added 2026-05-29 (path-scoped): AWS most-specific-route
  // routes service-specific traffic (e.g. S3 reads) via the gateway VPCE
  // when one is attached to the path's RT. Surfacing it in the same
  // EGRESS GATEWAYS lane as IGW gives the operator the honest answer for
  // "where do bytes for THIS jewel actually go". The backend already
  // filters VPCEs by service-match against the path target, so anything
  // that reaches here is graph-grounded.
  if (
    t === "internetgateway" ||
    t === "natgateway" ||
    t === "egressonlyinternetgateway" ||
    t === "transitgateway" ||
    t === "vpcendpoint"
  )
    return "egress_gateway"
  // NetworkInterface — the ENI carries the SG attachment and IP. Right
  // now we route it to the compute lane (it acts as a workload-side
  // attachment). Visual distinction TBD; getting it on the canvas
  // matters more than which lane today.
  if (t === "networkinterface" || t === "eni") return "network_interface"
  return "ignore"
}

// Exported so the merged AttackPathPanel can reuse the synthesis
// without copy-pasting. When attacker-view-panel.tsx is deleted
// (M5 of the merge), move this function to its own module.
export function buildAttackerArchitecture(
  graph: GraphViewResponse,
  path: IdentityAttackPath,
): SystemArchitecture {
  const computeServices: ServiceNode[] = []
  const resources: ServiceNode[] = []
  const subnets: SubnetNode[] = []
  const securityGroups: SecurityCheckpoint[] = []
  const nacls: SecurityCheckpoint[] = []
  // Identity types are split (2026-05-22 fix). Previously all three
  // were mashed into iamRoles[] which made "IAM ROLES (3)" lie on
  // single-role paths and hid the EC2→InstanceProfile→Role chain.
  // 2026-05-28 — Phase 2 V1 slice 3 (edge semantic states).
  // Classify the underlying graph edge as "AWS-required" (locked,
  // operator can't remove via remediation) vs. "operator-controllable"
  // (the IAM permission / SG rule that drives this flow is scopable).
  //
  // Locked edges represent infrastructure plumbing — removing them
  // isn't the right remediation lever. The renderer paints them
  // static (no animation) so the operator's eye lands on edges with
  // real remediation handles.
  //
  // Generic categorization by relationship type. NOT a service-
  // specific list — every IAM/STS control-plane attachment belongs
  // here regardless of resource type (per
  // feedback_no_hardcoded_demo_service_names).
  const isLockedEdgeType = (t: string | undefined | null): boolean => {
    if (!t) return false
    const T = t.toUpperCase()
    return (
      T === "HAS_INSTANCE_PROFILE" ||
      T === "USES_ROLE" ||
      T === "ASSUMES_ROLE" ||
      T === "ASSUMES_ROLE_ACTUAL" ||
      T === "USED_IDENTITY" ||
      T === "HAS_POLICY"
    )
  }

  const iamRoles: SecurityCheckpoint[] = []
  const instanceProfiles: SecurityCheckpoint[] = []
  const iamPolicies: SecurityCheckpoint[] = []
  const egressGateways: EgressGatewayNode[] = []
  const flows: TrafficFlow[] = []
  // Principals (AWSPrincipal / CloudTrailPrincipal / IAMUser / root) —
  // rendered in their own dedicated lane on the canvas. Previously
  // pushed into computeServices with type:'principal' which made `root`
  // render under the Compute lane heading — a category mistake that
  // suggested root was a workload running on this chain. Per the
  // 2026-05-23 audit feedback: principals are actors, not compute.
  const principals: ServiceNode[] = []
  // VPC tracker — collected during the first pass so we can build the
  // TFM `vpcGroups` payload that drives the existing VPCBoundaries
  // renderer (toggled by the "VPC" checkbox in the header). VPCs were
  // previously dropped via the "ignore" bucket; for a path that goes
  // EC2 → SG → VPC → Subnet → Role the container hop just vanished
  // from the canvas without any indication. Now we surface them.
  const vpcsById = new Map<string, { vpcId: string; vpcName: string; cidrBlock?: string }>()

  // Crown jewel ids from the path so we can tag resource cards.
  const crownJewelIds = new Set(
    (path.nodes ?? []).filter((n) => n.tier === "crown_jewel").map((n) => n.id),
  )

  // Path target AWS service tokens — used downstream for the AWS
  // most-specific-route filter on the EGRESS GATEWAYS lane.
  //
  // 2026-05-30 v3: Discover-from-data with five fallback signals.
  // The collector already writes most of these for resource nodes;
  // we just need to consume more of them.
  //
  // For each crown jewel on the path, harvest service hints from
  // (in order of strength):
  //
  //   1. ARN service slot — arn:aws:<SERVICE>:... regex extract.
  //      Sources: node.id, node.arn (if id isn't ARN-shaped).
  //   2. Explicit `service` key property — collector sometimes
  //      writes "s3" / "dynamodb" / etc. directly.
  //   3. `resource_type` key property — e.g. "S3Bucket" lowercased.
  //   4. Neo4j labels[] — multi-label nodes carry "S3Bucket" /
  //      "DynamoDBTable" alongside generic "Resource"/"Service".
  //      We skip the generic ones and lowercase the rest.
  //   5. Top-level `type` — last-resort fallback.
  //
  // The bidirectional substring match in pathTargetMatchesServiceToken
  // below handles all the case variations ("s3" matches "s3bucket",
  // "S3Bucket" lowercased becomes "s3bucket" which contains "s3",
  // etc.) — no per-service mapping needed.
  //
  // Returns a Set because one path can target multiple resources of
  // different services. Empty when no crown jewel on the path has
  // any extractable hint — filter then degrades to "no filter" and
  // IGW/NAT remain visible because we can't prove they're off-path.
  const GENERIC_LABELS = new Set(["resource", "service", "node"])

  const pathTargetServiceTokens: Set<string> = (() => {
    const tokens = new Set<string>()
    const addArnService = (s: string | null | undefined): void => {
      const m = (s || "").match(/^arn:aws:([^:]+):/)
      if (m) tokens.add(m[1].toLowerCase())
    }
    for (const n of path.nodes ?? []) {
      if (n.tier !== "crown_jewel") continue

      // 1. ARN extraction from id.
      addArnService(n.id)

      // 5. Top-level type fallback — keeps the path.nodes shape's
      //    type as a hint when richer signals are absent.
      const t = (n.type || "").toLowerCase()
      if (t) tokens.add(t)

      // 2-4. Richer signals come from graph.nodes which carries
      //      key_properties + labels[]. path.nodes is sparser, so
      //      look up the same id in graph.nodes for the full
      //      payload.
      const enriched = graph.nodes.find((g) => g.id === n.id)
      if (enriched) {
        // 1b. ARN from key_properties.arn (e.g. when id is a short
        //     name but arn is set).
        addArnService(enriched.key_properties?.arn as string | undefined)
        // 2. Explicit service token.
        const svc = (enriched.key_properties?.service as string | undefined)?.toLowerCase()
        if (svc) tokens.add(svc)
        // 3. resource_type.
        const rt = (enriched.key_properties?.resource_type as string | undefined)?.toLowerCase()
        if (rt) tokens.add(rt)
        // 4. Labels — strip generic ones.
        for (const label of enriched.labels ?? []) {
          const l = label.toLowerCase()
          if (l && !GENERIC_LABELS.has(l)) tokens.add(l)
        }
      }
    }
    return tokens
  })()

  // Does the path's target set match a VPCE's service token? Checks
  // both directions (token vs every path-target string) so "s3" hits
  // type "S3Bucket" and ARN-derived "s3" alike — no service-specific
  // mapping needed.
  const pathTargetMatchesServiceToken = (serviceToken: string): boolean => {
    const tok = serviceToken.toLowerCase()
    for (const target of pathTargetServiceTokens) {
      if (target === tok) return true
      if (target.includes(tok)) return true
      if (tok.includes(target)) return true
    }
    return false
  }

  // Dedup key combines (lowercased friendly name, lane bucket) so that
  // a Role and an InstanceProfile sharing a name stay distinct, but
  // dual-label-graph duplicates of the same logical node collapse.
  // The Neo4j graph has each node under multiple ids (full ARN, short
  // id, dual-label Resource/Service) — without canonical dedup the
  // lanes end up with 2-3 cards for the same workload.
  const seen = new Set<string>() // raw ids already added
  const seenByCanonical = new Set<string>() // canonical "name|lane" keys

  const canonicalKey = (name: string | null, id: string, lane: string): string => {
    const fname = friendlyName(name, id).toLowerCase()
    return `${fname}|${lane}`
  }

  const computeSubtype = (type: string): "compute" | "lambda" => {
    return type.toLowerCase().includes("lambda") ? "lambda" : "compute"
  }
  const resourceSubtype = (type: string): "storage" | "database" | "dynamodb" => {
    const t = type.toLowerCase()
    if (t.includes("dynamo")) return "dynamodb"
    if (t.includes("rds") || t.includes("database")) return "database"
    return "storage"
  }

  const addAsCompute = (id: string, type: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "compute")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    computeServices.push({
      id,
      name: display,
      shortName: shortName(display),
      type: computeSubtype(type),
      instanceId: id.startsWith("i-") ? id : id.slice(-12),
    })
  }
  // Principal (CloudTrailPrincipal / AWSPrincipal / IAMUser / HumanIdentity)
  // — the actor making the API call. Pushed into a dedicated
  // `principals[]` array so the TFM canvas can render them in their
  // own leftmost lane.
  //
  // History note: an earlier version pushed principals into
  // `computeServices` with type:'principal'. That fixed the "only the
  // target renders" bug for API-only paths, but introduced a category
  // mistake — `root` rendered under "COMPUTE" which suggested it was
  // a workload on this chain. Per 2026-05-23 audit feedback the lane
  // is now separate so the visual reads correctly: principals are
  // actors, not compute.
  const addAsPrincipal = (id: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "principal")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    principals.push({
      id,
      name: display,
      shortName: shortName(display),
      type: "principal",
      instanceId: id.slice(-12),
    })
  }
  const addAsResource = (id: string, type: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "resource")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const sub = resourceSubtype(type)
    const node: ServiceNode = {
      id,
      name: display,
      shortName: shortName(display),
      type: sub,
    }
    if (crownJewelIds.has(id)) {
      ;(node as any).isCrownJewel = true
    }
    resources.push(node)
  }
  // True IAMRole only (InstanceProfile is handled by addAsInstanceProfile
  // and IAMPolicy by addAsPolicy — each owns its own array). usedCount /
  // totalCount / gapCount now pipe through from the role node's
  // key_properties (allowed_actions_count / used_actions_count /
  // unused_actions_count) so the IAM Roles lane card shows the real
  // gap story — "1 used / 6 excess" — instead of dashes. This is what
  // makes the Cyntro closure narrative visible on the canvas; the
  // 2026-05-23 audit called the empty IAM Policies lane "the most
  // visible product-value gap right now". With the counts piped here
  // the role's status ring also colour-codes by usage percent (the
  // shared IAMRoleNode logic already had the visual rules; just
  // wasn't getting real data).
  const addAsRole = (
    id: string,
    _type: string,
    name: string | null,
    props?: Record<string, any> | null,
  ) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "iam_role")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const p = props || {}
    const arn = typeof p.arn === "string" ? p.arn : undefined
    let display = friendlyName(name, id)
    if (isOpaqueIamId(display) && arn?.includes(":role/")) {
      display = arn.split("/").pop() || display
    }
    if (isOpaqueIamId(display) && path.damage_capability?.role_name) {
      display = path.damage_capability.role_name
    }
    const totalCount = Number(p.allowed_actions_count ?? 0) || 0
    // 2026-05-26 audit fix: trust LIVE evidence over collector scalars.
    // The `used_actions_count` field on cyntro-demo-ec2-s3-role lies
    // (=0) while the role has USES_PERMISSION → s3:GetObject + s3:PutObject
    // and 789K observed ACCESSES_RESOURCE hits. Phase 0 backend stamps
    // `used_actions_count_likely_stale=true` when the scalar is 0 but
    // real hits > 0. Prefer the live count in that case.
    //
    // live_uses_permission_edge_count = COUNT of distinct USES_PERMISSION
    // edges off the role — i.e., distinct actions observed in use.
    // That IS the operator-meaningful "used actions" number.
    const scalarUsed = Number(p.used_actions_count ?? 0) || 0
    const stale = p.used_actions_count_likely_stale === true
    // Canonical edge is :USED_ACTION (per cloudtrail_silver.py gold
    // output). The backend now reads from that edge type — the
    // previous USES_PERMISSION read was a wrong-relationship-name bug
    // caught in the 2026-05-26 audit. Old live_uses_permission_edge_count
    // is read as a fallback for stale Vercel deploys; new code prefers
    // live_used_action_count.
    const liveUsed = Number(
      p.live_used_action_count ??
        p.live_uses_permission_edge_count ??
        0,
    ) || 0
    const usedCount = stale && liveUsed > 0 ? liveUsed : scalarUsed
    // Math invariant: gap = max(0, allowed − used). DO NOT trust the
    // collector's `unused_actions_count` field — at least one writer
    // emits values that don't match. Recompute from the (now honest)
    // usedCount.
    const gapCount = Math.max(0, totalCount - usedCount)
    // 2026-05-26 (Phase 1.7-followup): pipe the live observed-activity
    // evidence through to the role card. Backend now reads :USED_ACTION
    // edges (canonical per cloudtrail_silver.py gold-output schema) and
    // emits live_used_action_count + live_used_action_event_count.
    // ACCESSES_RESOURCE evidence remains as a secondary signal via
    // live_observed_total_hits.
    const liveHits = Number(p.live_observed_total_hits ?? 0) || 0
    const liveResources = Number(p.live_observed_resource_count ?? 0) || 0
    const liveEventCount = Number(p.live_used_action_event_count ?? 0) || 0
    const scalarEdgesDisagree =
      p.used_actions_count_scalar_edges_disagree === true
    iamRoles.push({
      id,
      type: "iam_role",
      name: display,
      shortName: shortName(display),
      usedCount,
      totalCount,
      gapCount,
      connectedSources: [],
      connectedTargets: [],
      ...(liveHits > 0
        ? {
            liveObservedTotalHits: liveHits,
            liveObservedResourceCount: liveResources,
          }
        : {}),
      ...(liveEventCount > 0
        ? { liveUsedActionEventCount: liveEventCount }
        : {}),
      ...(scalarEdgesDisagree ? { usageScalarEdgesDisagree: true } : {}),
    })
  }
  // InstanceProfile — AWS's binding object that wires an EC2 instance
  // to an IAM role. Semantically distinct from a role; previously
  // collapsed into iamRoles which produced the wrong "IAM ROLES (3)"
  // count for a single-role path. The InstanceProfile typically shares
  // its name with the role it points at (alon-prod convention), so the
  // canonical key includes the "instance_profile" lane discriminator
  // to keep them as separate cards.
  const addAsInstanceProfile = (id: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "instance_profile")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    instanceProfiles.push({
      // Keep `type: "iam_role"` on the checkpoint so existing
      // SecurityCheckpoint consumers (status color, drilldown) still
      // work — the distinction is encoded by which array the node
      // lands in, not by the type discriminator. We can introduce a
      // dedicated 'instance_profile' type on SecurityCheckpoint in a
      // follow-up if the rendering needs to diverge further.
      id,
      type: "iam_role",
      name: display,
      shortName: shortName(display),
      usedCount: 0,
      totalCount: 0,
      gapCount: 0,
      connectedSources: [],
      connectedTargets: [],
    })
  }
  // SG populates totalCount from the graph node's rule counters. Per
  // 2026-05-22 audit the panel was initializing all SGs with
  // totalCount=0 which made TFM render "0 rules" even on the
  // saferemediate-test-app-sg (real rules in Neo4j). Now we pipe:
  //   - total_rules  (preferred — single canonical scalar set by the
  //                   security_group_collector)
  //   - inbound_rule_count + outbound_rule_count (fallback for older
  //                   collector versions that hadn't materialized
  //                   total_rules yet)
  //   - inbound_rules.length + outbound_rules.length (last-resort
  //                   fallback from the raw rule arrays)
  // gapCount uses unused_rules_count when present (rules with no
  // observed traffic match) — that's the "configured-but-unused"
  // signal the operator can act on.
  const addAsSG = (
    id: string,
    name: string | null,
    props?: Record<string, any> | null,
    onPath?: boolean,
  ) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "sg")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const p = props || {}
    const inboundCount = Number(p.inbound_rule_count ?? 0) || 0
    const outboundCount = Number(p.outbound_rule_count ?? 0) || 0
    const inboundArr = Array.isArray(p.inbound_rules) ? p.inbound_rules.length : 0
    const outboundArr = Array.isArray(p.outbound_rules) ? p.outbound_rules.length : 0
    // Fallback chain — prefer scalar total_rules, fall back to summed
    // count fields, then to array-length fallback. Don't use ??-chains
    // here: the intermediate sums are always numbers (never nullish),
    // so the chain collapses to the first non-null and skips the
    // fallbacks. Plain `||` on zero gives the right effect.
    let totalCount = Number(p.total_rules ?? 0) || 0
    if (totalCount === 0) totalCount = inboundCount + outboundCount
    if (totalCount === 0) totalCount = inboundArr + outboundArr
    const gapCount = Number(p.unused_rules_count ?? 0) || 0
    const usedCount = totalCount > 0 ? Math.max(0, totalCount - gapCount) : 0
    // Surface the collector's authoritative "this SG accepts inbound
    // 0.0.0.0/0" flag. The renderer uses it to badge SGs that are
    // public when rules[] isn't passed (lateral SGs carry counters +
    // flags but not the raw rule array). 2026-05-25 user feedback:
    // a DB SG with public_ingress was rendering plain because the
    // chip only inspected rules[].isPublic — and lateral chips have
    // no rules[]. Reading the flag bridges that gap.
    const hasPublicIngress =
      p.has_public_ingress === true || p.has_public_inbound === true
    securityGroups.push({
      id,
      type: "security_group",
      name: display,
      shortName: shortName(display),
      usedCount,
      totalCount,
      gapCount,
      connectedSources: [],
      connectedTargets: [],
      hasPublicIngress,
      // onPath defaults to undefined (back-compat for callers that
      // don't supply the signal — chip falls back to "treat as on-
      // path"). Explicit false dims the chip + adds the LATERAL badge.
      ...(onPath === false ? { onPath: false } : onPath === true ? { onPath: true } : {}),
    })
  }
  // NACL populates totalCount from rule counters on the graph node.
  // Per 2026-05-22 audit the panel rendered "NACLs (1) · 0 affected"
  // even when the subnet was associated and the NACL had rules. The
  // "0 affected" label comes from totalCount=0 (TFM checks blastRadius
  // from these scalars). Source fields on :NACL nodes:
  //   - total_rules (preferred)
  //   - inbound_rule_count + outbound_rule_count (fallback)
  //   - inbound_rules.length + outbound_rules.length (last-resort)
  // gapCount uses inbound_deny_count + outbound_deny_count when
  // present — explicit denies are the high-signal rules an operator
  // should know about.
  const addAsNACL = (
    id: string,
    name: string | null,
    props?: Record<string, any> | null,
    onPath?: boolean,
  ) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "nacl")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const p = props || {}
    const inboundCount = Number(p.inbound_rule_count ?? 0) || 0
    const outboundCount = Number(p.outbound_rule_count ?? 0) || 0
    // 2026-05-24 data-quirk fix: inbound_rules / outbound_rules come
    // back from Neo4j as JSON-encoded STRINGS (not arrays) on some
    // collector versions. Array.isArray() returned false, so the
    // previous fallback never fired even on NACLs with real rule
    // data. Parse the string defensively so the last-resort path
    // doesn't silently no-op. (`total_rules` scalar is preferred
    // when present, which it is on the current collector — this is
    // belt-and-suspenders against older/inconsistent writers.)
    const rulesArrayLength = (val: any): number => {
      if (Array.isArray(val)) return val.length
      if (typeof val === "string" && val.length > 0) {
        try {
          const parsed = JSON.parse(val)
          return Array.isArray(parsed) ? parsed.length : 0
        } catch {
          return 0
        }
      }
      return 0
    }
    const inboundArr = rulesArrayLength(p.inbound_rules)
    const outboundArr = rulesArrayLength(p.outbound_rules)
    // Same fallback chain pattern as addAsSG — see comment there.
    let totalCount = Number(p.total_rules ?? 0) || 0
    if (totalCount === 0) totalCount = inboundCount + outboundCount
    if (totalCount === 0) totalCount = inboundArr + outboundArr
    const denyCount = Number(p.inbound_deny_count ?? 0) + Number(p.outbound_deny_count ?? 0)
    const gapCount = denyCount || 0
    const usedCount = totalCount > 0 ? Math.max(0, totalCount - gapCount) : 0
    // subnet_count — number of subnets this NACL applies to. Drives
    // the "M subnets" pill on the NACL card so the operator sees the
    // blast surface; the previous "0 affected" label was always 0 on
    // NACLs with only allow rules.
    const subnetCount = Number(p.subnet_count ?? 0) || 0
    // 2026-05-25 user feedback: surface the NACL's risk flags so the
    // chip can render "Default · No filtering" (AWS default NACL is
    // 0.0.0.0/0 ALLOW ALL on both directions) and "High risk" badges.
    // Reads from the collector-written booleans on the NetworkACL
    // node. With these populated on lateral NACLs (via the graph-view
    // security-critical enrichment pass, commit 80fd29e on backend),
    // a default-public NACL no longer renders as a plain "2 rules"
    // chip — it screams "Default · No filtering" in red.
    const isDefault = p.is_default === true
    const hasHighRisk = p.has_high_risk === true
    const hasPublicInboundAllow = p.has_public_inbound_allow === true
    const naclEntry: SecurityCheckpoint = {
      id,
      type: "nacl",
      name: display,
      shortName: shortName(display),
      usedCount,
      totalCount,
      gapCount,
      connectedSources: [],
      connectedTargets: [],
      isDefault,
      hasHighRisk,
      hasPublicInboundAllow,
    }
    if (subnetCount > 0) {
      naclEntry.subnetCount = subnetCount
    }
    // onPath: explicit boolean only when caller supplied it (so chips
    // without the signal stay full-brightness as back-compat).
    if (onPath === true || onPath === false) {
      naclEntry.onPath = onPath
    }
    nacls.push(naclEntry)
  }
  // IAMPolicy — the actual permission grant document, IS the finding
  // for over-permissive paths (e.g. S3OverPermissiveAccess on
  // alon-prod). Promoted from "🤝 emoji-prefixed card in iamRoles lane"
  // to its own iamPolicies array per 2026-05-22 fix. No name prefix
  // needed now that they have their own lane and aren't competing for
  // visual space with role cards.
  //
  // totalCount = permission_count (the number of distinct actions the
  // policy grants) when present on the graph node. gapCount = unused
  // permissions when we can compute them (currently we can't from the
  // graph-view payload alone — would need to join against the role's
  // observed actions). usedCount falls out the same way.
  const addAsPolicy = (id: string, name: string | null, props?: Record<string, any> | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "iam_policy")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const p = props || {}
    const totalCount = Number(p.permission_count ?? 0) || 0
    iamPolicies.push({
      id,
      type: "iam_role", // keep existing checkpoint discriminator —
                       // SecurityCheckpoint.type doesn't yet have an
                       // 'iam_policy' variant; the distinction is
                       // encoded by being in iamPolicies[]
      name: display,
      shortName: shortName(display),
      usedCount: 0,
      totalCount,
      gapCount: 0,
      connectedSources: [],
      connectedTargets: [],
    })
  }

  // Egress gateway (IGW / NAT / EgressOnlyIGW / TransitGateway) →
  // egressGateways lane. The TFM already renders this lane (chip
  // item 10 from the topology work); we just need to populate it.
  const addAsEgressGateway = (
    id: string,
    name: string | null,
    gatewayType: string,
    vpcId: string | null,
    serviceName?: string | null,
  ) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "egress_gateway")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    // Map graph node-type → EgressGatewayNode.kind. Includes VPCEndpoint
    // (2026-05-29 — gateway VPCEs are egress gateways too, mirroring AWS
    // most-specific-route behavior). When the graph gives us an
    // unexpected string, default to InternetGateway — safer fallback
    // since most laterals we'd surface here historically were IGWs.
    const t = (gatewayType || "").toLowerCase()
    const kind: EgressGatewayNode["kind"] =
      t === "natgateway"
        ? "NATGateway"
        : t === "egressonlyinternetgateway"
          ? "EgressOnlyInternetGateway"
          : t === "transitgateway"
            ? "TransitGateway"
            : t === "vpcendpoint"
              ? "VPCEndpoint"
              : "InternetGateway"
    // For VPCEs, surface the service token ("s3", "dynamodb", etc.)
    // as the chip label so the operator can distinguish "VPCE · s3"
    // from "VPCE · dynamodb" when an account has multiple gateway
    // endpoints. service_name format: 'com.amazonaws.<region>.<service>'.
    const svcToken = (serviceName || "")
      .toLowerCase()
      .split(".")
      .pop() || ""
    const kindLabel: Record<EgressGatewayNode["kind"], string> = {
      InternetGateway: "IGW",
      NATGateway: "NAT GW",
      EgressOnlyInternetGateway: "Egress-only IGW",
      TransitGateway: "Transit GW",
      VPCEndpoint: svcToken ? `VPCE · ${svcToken}` : "VPCE",
    }
    egressGateways.push({
      id,
      name: display,
      shortName: shortName(display),
      vpcId,
      kind,
      kindLabel: kindLabel[kind],
      serviceHint: kind === "VPCEndpoint" ? svcToken || undefined : undefined,
    })
  }

  // NetworkInterface (ENI) — folded into its parent EC2 / workload as
  // a chip on the existing Compute card. Previously rendered as a
  // separate "ENI eni-…" Compute row, which the 2026-05-23 audit
  // flagged as visual clutter (the ENI is conceptually part of the
  // workload, not a peer compute resource). When parentComputeId is
  // omitted (e.g. orphan ENI surfaced via a Subnet path-node), fall
  // back to attaching to the first available compute on the path so
  // the ENI is visible somewhere; if no compute exists at all, skip.
  const addAsNetworkInterface = (id: string, name: string | null, parentComputeId?: string) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "network_interface")
    if (seenByCanonical.has(canon)) return
    const parent =
      (parentComputeId
        ? computeServices.find((c) => c.id === parentComputeId)
        : undefined) ?? computeServices[0]
    if (!parent) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const enis = parent.enis ?? (parent.enis = [])
    if (!enis.some((e) => e.id === id)) {
      enis.push({ id, name: display, shortName: shortName(display) })
    }
  }

  // VPC — render via TFM's VPCBoundaries by populating vpcGroups (built
  // at the end). Path nodes that match the VPC bucket land here; they
  // also seed seen/seenByCanonical so flow synthesis treats them as
  // legit endpoints (USES_VPC / IN_VPC config edges are filtered out
  // separately so they don't draw an extra line, but the visual
  // container box is what the operator actually wants here).
  const addAsVPC = (id: string, name: string | null, cidrBlock?: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "vpc")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    vpcsById.set(id, { vpcId: id, vpcName: display, cidrBlock: cidrBlock || undefined })
  }
  const addAsSubnet = (
    id: string,
    name: string | null,
    vpcId: string | null,
    isPublic: boolean | null,
    rt?: { id?: string | null; count?: number | null; isMain?: boolean | null } | null,
    az?: string | null,
    cidrBlock?: string | null,
  ) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "subnet")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    // shortName is what the TFM SubnetNode card renders as the
    // identifier — without it, the card shows ONLY the
    // Public/Private/Unknown posture chip and no name. v1.2 omitted
    // this field, which is why every subnet read as just "Private"
    // in the previous screenshot.
    subnets.push({
      id,
      name: display,
      shortName: shortName(display),
      // Preserve null three-state (Public / Private / Unknown). Coercing
      // to boolean lost the "Unknown" state when subnet_is_public is
      // unclassified — per the earlier credibility audit.
      isPublic,
      vpcId: vpcId || undefined,
      availabilityZone: az || undefined,
      cidrBlock: cidrBlock || undefined,
      connectedComputeIds: [],
      // Route-table chip metadata (backend feat 9bc86f9). All optional —
      // older backends without the RouteTable enrichment will simply
      // skip the chip rather than render blanks.
      routeTableId: rt?.id || undefined,
      routeTableCount:
        typeof rt?.count === "number" && rt.count > 0 ? rt.count : undefined,
      routeTableIsMain: rt?.isMain === true ? true : undefined,
    })
  }

  // On-path SG / NACL detection.
  //
  // A SecurityGroup is "on-path" if the path's compute is SECURED_BY
  // it (real graph edge from a path node). A NACL is "on-path" if a
  // path subnet ASSOCIATED_WITH it. Lateral SGs/NACLs are in the
  // same VPC but lack that direct edge — they're pivot surface, not
  // gates on this chain.
  //
  // Pre-pass over laterals_by_node before the lane-population loop:
  // any SG that appears as a neighbor under a SECURED_BY (or alias)
  // edge from ANY path node id gets marked on-path. Same for NACLs
  // with ASSOCIATED_WITH / HAS_NACL. Everything else stays undefined
  // and the chip falls back to "treat as on-path" — the SG/NACL
  // helpers below pass the explicit boolean only when the pre-pass
  // saw a real edge, so callers without the signal aren't penalized.
  //
  // 2026-05-26 user feedback: "why is there no traffic through
  // default / three-tier-lambda-sg?" — those are lateral SGs that
  // got pulled into the lane via VPC-membership enrichment (commit
  // 80fd29e) but have no SECURED_BY edge to the path's EC2.
  // Treating all 5 SGs as visually equal made the operator hunt
  // for the actual gate; dimming the 4 lateral ones surfaces the
  // one true gate at a glance.
  const SG_ATTACH_EDGES = new Set([
    "SECURED_BY",
    "HAS_SECURITY_GROUP",
    "USES_SECURITY_GROUP",
  ])
  const NACL_ATTACH_EDGES = new Set([
    "ASSOCIATED_WITH",
    "HAS_NACL",
  ])
  const onPathSgIds = new Set<string>()
  const onPathNaclIds = new Set<string>()
  for (const [, edges] of Object.entries(graph.laterals_by_node)) {
    for (const e of edges) {
      const neighborId = e.neighbor_id
      if (!neighborId) continue
      const t = (e.type || "").toUpperCase()
      if (SG_ATTACH_EDGES.has(t)) {
        onPathSgIds.add(neighborId)
      } else if (NACL_ATTACH_EDGES.has(t)) {
        onPathNaclIds.add(neighborId)
      }
    }
  }

  // First pass — add every path node to its canonical lane.
  // SG / NACL / IAMPolicy helpers now receive key_properties so
  // totalCount / gapCount / rule arrays come from real graph data
  // (fix for the "0 rules" / "0 affected" / "permission_count missing"
  // class of credibility bugs).
  for (const node of graph.nodes) {
    const bucket = bucketForGraphType(node.type, node.id)
    const props = (node.key_properties as Record<string, any> | undefined) ?? null
    // Canonical display identity — resolved ONCE here so every lane card
    // inherits the backend contract (display_name > name); key_properties
    // carries it too for payloads that predate the top-level projection.
    const displayName =
      node.display_name ??
      (props?.display_name as string | undefined) ??
      node.name
    if (bucket === "compute") addAsCompute(node.id, node.type, displayName)
    else if (bucket === "resource") addAsResource(node.id, node.type, displayName)
    else if (bucket === "iam_role") addAsRole(node.id, node.type, displayName, props)
    else if (bucket === "instance_profile") addAsInstanceProfile(node.id, displayName)
    else if (bucket === "iam_policy") addAsPolicy(node.id, displayName, props)
    else if (bucket === "sg") {
      // Strict path-only filter (user audit 2026-05-29): only render
      // SGs that have a SECURED_BY / HAS_SECURITY_GROUP / etc. attach
      // edge from a path node. Lateral SGs (same VPC, no attachment)
      // were previously rendered with a "Lateral" badge as "pivot
      // context", but the operator audit called them out as noise:
      // the Attack Surface view is meant to be the EC2 → bucket path,
      // not "every SG in this VPC". Lateral fan-out has its own
      // dedicated view; this stays strict.
      //
      // Service-agnostic — onPathSgIds is derived from edge types, not
      // SG name patterns.
      if (onPathSgIds.has(node.id)) {
        addAsSG(node.id, displayName, props, true)
      }
    }
    else if (bucket === "nacl") {
      // Same strict path-only filter for NACLs — only render NACLs
      // associated with the path's subnet, not every NACL in the VPC.
      if (onPathNaclIds.has(node.id)) {
        addAsNACL(node.id, displayName, props, true)
      }
    }
    else if (bucket === "principal") {
      // Category-error guard (2026-05-30 audit): the backend's
      // CloudTrailPrincipal nodes occasionally carry an EC2 instance
      // id ("i-<hex>") as their .id or .name when the role-session
      // name happens to be the instance id. An EC2 instance is NOT
      // an IAM Principal — it's a workload that CARRIES an identity
      // via an InstanceProfile. Surfacing it as PRINCIPAL is the
      // same class of mistake we caught with `root` earlier.
      //
      // Re-route ec2-id-shaped principals to the compute lane. Same
      // node still renders, just under the honest lane heading.
      // Service-agnostic: the gate is on the AWS instance-id format
      // (i-[a-f0-9]+), not on any specific resource name.
      const ec2IdPattern = /^i-[a-f0-9]+$/i
      const looksLikeEc2Id =
        ec2IdPattern.test(node.id || "") ||
        ec2IdPattern.test(node.name || "")
      if (looksLikeEc2Id) {
        addAsCompute(node.id, "EC2Instance", displayName)
      } else {
        addAsPrincipal(node.id, displayName)
      }
    }
    else if (bucket === "vpc") {
      addAsVPC(node.id, displayName, (props?.cidr_block as string | undefined) ?? null)
    }
    else if (bucket === "egress_gateway") {
      const vpcId = props?.vpc_id ?? null
      // service_name is set for VPCEndpoint nodes
      // ('com.amazonaws.<region>.<service>') by attack_chain_view.py's
      // SEC_CRITICAL_LABELS enrichment pass; unused for IGW/NAT.
      const serviceName = (props?.service_name as string | undefined) ?? null
      addAsEgressGateway(node.id, displayName, node.type, vpcId, serviceName)
    } else if (bucket === "network_interface") {
      addAsNetworkInterface(node.id, displayName)
    } else if (bucket === "subnet") {
      const vpcId = props?.vpc_id ?? null
      // Subnet is_public has three collector-side property names in
      // flight: `public` (canonical, written by
      // subnet_visibility_collector), `subnet_is_public` (legacy
      // CSPM ingest), `is_public` (older wrapper). Read all three
      // with `public` winning so the card stops rendering "Unknown"
      // when the visibility collector has already classified the
      // route table.
      const isPub =
        props?.public ??
        props?.subnet_is_public ??
        props?.is_public ??
        null
      // Route-table metadata — backend graph-view joins RouteTable
      // and injects route_table_route_count / route_table_is_main on
      // the Subnet's key_properties (feat 9bc86f9). Falls back to
      // just the route_table_id when count isn't surfaced.
      const rt = {
        id: (props?.route_table_id as string | undefined) ?? null,
        count: (props?.route_table_route_count as number | undefined) ?? null,
        isMain: (props?.route_table_is_main as boolean | undefined) ?? null,
      }
      addAsSubnet(
        node.id,
        displayName,
        vpcId,
        isPub,
        rt,
        (props?.availability_zone as string | undefined) ?? null,
        (props?.cidr_block as string | undefined) ?? null,
      )
    }
    // 'ignore' — bucket didn't match a node type we render in any lane.
  }

  // Slice 9.5 — distinguish PATH INFRASTRUCTURE from LATERAL PIVOTS.
  //
  // 9.4 stripped EVERY lateral. That was over-correction: it also
  // removed NACL / IGW / ENI / Policy, which aren't "what else this
  // role could do" — they're the actual network/identity controls
  // ATTACHED to path nodes, modeled as decoration edges in Neo4j
  // rather than as BFS hops.
  //
  // The honest rule:
  //   Path infrastructure (attached to a path node) → INCLUDE
  //     - NACL associated with the path's subnet
  //     - IGW/NAT the path's subnet routes through
  //     - ENI on the path's EC2
  //     - IAMPolicy attached to the path's role
  //   Lateral pivots (siblings/alternatives reachable from a path
  //   node but unrelated to THIS attack) → SKIP
  //     - Other roles the path role can ASSUME_ROLE into
  //     - Other resources the path role can ACCESSES_RESOURCE
  //     - Other workloads sharing the path role via USES_ROLE
  //     - Other accessors of the crown jewel
  // Operators who want the full pivot fan-out switch to Exposure view.
  // Path-infrastructure rule — RESTRICTED to attachments of the
  // CORRECT path-node type. The 2026-05-22 over-include bug: we were
  // adding every ENI lateral of every path node, including the SG's
  // reverse-associations (5 ENIs from sibling workloads sharing the
  // SG). Result: 6 ENI cards in Compute lane for what should be 1.
  //
  // Rule per neighbor type — only add when the SOURCE path node is
  // the natural carrier:
  //   ENI         → only when path node is a workload (EC2 / Lambda)
  //   NACL        → only when path node is a Subnet
  //   IGW/NAT     → only when path node is a Subnet or VPC
  //   IAMPolicy   → only when path node is an IAMRole
  //
  // Skip every other ENI / NACL / IGW reference (those are siblings
  // discovered via SG fan-out etc).
  const pathNodeTypeByKey = new Map<string, string>()
  for (const node of graph.nodes) {
    pathNodeTypeByKey.set(node.id, bucketForGraphType(node.type, node.id))
  }

  // Pre-compute the set of InstanceProfile ids that the path's IAMRole
  // ACTUALLY routes through. Read incoming USES_ROLE laterals on each
  // path role; any IP that appears there is a real on-chain hop.
  //
  // Background (2026-05-24 user report): when an EC2 has both a
  // HAS_INSTANCE_PROFILE edge (its static AWS config) AND a direct
  // USES_ROLE edge to a different role (CloudTrail-observed via STS
  // AssumeRole), the BFS picks the CloudTrail role (because that's
  // the one with ACCESSES_RESOURCE → jewel). The InstanceProfile's
  // USES_ROLE target is the *other* role, not the one on the path,
  // so adding it as a lateral produced an orphan card with no flow
  // line — the IP lane card rendered but couldn't be wired through
  // (its role isn't on the chain, and the TFM has no flow checkpoint
  // for InstanceProfile anyway).
  //
  // Filter: only add the IP if it directly USES_ROLE → a path role.
  // Otherwise it's a sibling attachment that belongs in System Detail
  // or Per-Path view, not the Attacker chain.
  const ipsOnPathChain = new Set<string>()
  for (const role of iamRoles) {
    const roleLaterals = graph.laterals_by_node[role.id] || []
    for (const e of roleLaterals) {
      if (
        e.direction === "in" &&
        e.type === "USES_ROLE" &&
        bucketForGraphType(e.neighbor_type) === "instance_profile"
      ) {
        ipsOnPathChain.add(e.neighbor_id)
      }
    }
  }

  // Dedupe flow synthesis — same edge can appear from both this
  // loop's on_path branch AND the path.edges loop below. Without a
  // key set we doubled the role→jewel flow's hit count (the
  // 1,579,582 connections bug).
  const flowKeys = new Set<string>()

  // 2026-05-25 (Phase 2 — explicit-edges refactor): the previous
  // `pathCheckpoints` object (getter-backed sgId/naclId/instanceProfileId/
  // roleId/egressGatewayId) was the source of the cross-plane drawing
  // bug — every synthesized flow routed its polyline through this
  // single bundle, which mixed identity-plane (Role, InstanceProfile)
  // checkpoints with network-plane (SG, NACL, IGW) checkpoints, then
  // drew them as a single continuous SVG path implying a serial
  // dependency. That implication was false — identity-plane and
  // network-plane are parallel pre-conditions, not steps.
  //
  // The new rendering contract (TrafficFlowMap `architecture.edges`)
  // takes one line per real graph edge, tagged with its plane, and
  // colors / animates by plane. We build the edges array below from
  // path.edges + graph.laterals_by_node directly. Routing through
  // bundled checkpoints is no longer needed.
  //
  // See feedback_test_both_sides_of_a_partition.md for the failure
  // mode that this fixes.

  // Branch A flows are deferred — synthesized AFTER the lateral loop
  // completes so that lateral-added checkpoints (IGW, etc.) populated
  // during the loop are available when the flow's egressGatewayId
  // getter resolves. Capturing during the loop would freeze the
  // getter against an incomplete egressGateways[] (depends on which
  // path node iterates first), which produced the 2026-05-23 audit's
  // "orphan IGW with 771 KB observed bytes" bug.
  const pendingOnPathFlows: Array<{
    sourceId: string
    targetId: string
    edge: GraphViewEdge
  }> = []

  for (const [pathNodeId, edges] of Object.entries(graph.laterals_by_node)) {
    const pathNodeBucket = pathNodeTypeByKey.get(pathNodeId)
    for (const e of edges) {
      // Inline IAM policies (and other inline-only nodes) arrive with an empty
      // neighbor_id — their stable identifier is the ARN (e.g.
      // "inline/<role>/<policy>"). Fall back to it so they aren't silently
      // dropped before reaching their bucket branch below.
      const neighborId = e.neighbor_id || e.neighbor_arn || ""
      if (!neighborId) continue

      // Branch A — edge between two path nodes (on_path=true). The
      // inter-hop observed-traffic edges that animate the chain.
      // Deferred: defer flow synthesis until after the lateral loop
      // (see pendingOnPathFlows above for rationale).
      if (e.on_path) {
        const hits = e.hit_count ?? 0
        const bytes = e.bytes ?? 0
        if (hits === 0 && bytes === 0 && !e.observed) continue
        if (!seen.has(neighborId)) continue
        const sourceId = e.direction === "out" ? pathNodeId : neighborId
        const targetId = e.direction === "out" ? neighborId : pathNodeId
        pendingOnPathFlows.push({ sourceId, targetId, edge: e })
        continue
      }

      // Branch B — true lateral. Only add when this neighbor is the
      // natural infrastructure attachment of the path node type.
      const neighborBucket = bucketForGraphType(e.neighbor_type)
      if (neighborBucket === "network_interface") {
        if (pathNodeBucket === "compute") {
          // Pass the path node id so the ENI attaches to THAT compute
          // card (rather than the first compute by accident on
          // multi-EC2 paths).
          addAsNetworkInterface(neighborId, e.neighbor_name, pathNodeId)
        }
        // ENI lateral on a non-workload path node (SG / Subnet / VPC)
        // — those are sibling-workload ENIs, skip.
        continue
      }
      if (neighborBucket === "nacl") {
        if (pathNodeBucket === "subnet") {
          // Lateral fallback. Typically no-ops because the on-path
          // NACL is added via the graph.nodes loop above (seen.has
          // short-circuits the helper). Passing onPath here in case
          // the lateral fallback is the only path that fires.
          addAsNACL(neighborId, e.neighbor_name, null, onPathNaclIds.has(neighborId))
        }
        continue
      }
      if (neighborBucket === "egress_gateway") {
        if (pathNodeBucket === "subnet" || pathNodeBucket === "ignore") {
          // VPC nodes bucket as 'ignore' currently (no VPC lane in
          // TFM). Subnet ROUTES_VIA → IGW or VPCE is the canonical edge.
          // service_name comes through on the neighbor node when it's
          // enriched server-side (the backend's SEC_CRITICAL_LABELS
          // path puts VPCEndpoint properties on graph.nodes); the
          // lateral edge itself doesn't carry it, so we look up the
          // enriched node from graph.nodes and pull service_name there.
          const enrichedNode = graph.nodes.find((n) => n.id === neighborId)
          const svcName =
            (enrichedNode?.key_properties as Record<string, any> | undefined)
              ?.service_name ?? null
          addAsEgressGateway(neighborId, e.neighbor_name, e.neighbor_type, null, svcName)
        }
        continue
      }
      if (neighborBucket === "iam_policy") {
        if (pathNodeBucket === "iam_role" || pathNodeBucket === "principal") {
          // Principal → IAMPolicy is the natural attachment too (an
          // IAMUser carries inline/attached policies directly, no role
          // hop). Surfacing it tells the operator WHICH grant document
          // authorized the observed API call.
          addAsPolicy(neighborId, e.neighbor_name)
        }
        continue
      }
      if (neighborBucket === "iam_role") {
        if (pathNodeBucket === "principal") {
          // Principal → IAMRole is path infrastructure for assumed-role
          // sessions: the CloudTrailPrincipal is a session, the role is
          // what gave it permissions. Without the role card the operator
          // sees only "<session> accessed <bucket>" with no answer to
          // "which role's permissions made this possible?" — exactly the
          // E2E context the user complained was missing. Sibling roles
          // (assume-role chains the path didn't take) still skip via the
          // default branch at the bottom.
          addAsRole(neighborId, e.neighbor_type, e.neighbor_name)
        }
        continue
      }
      if (neighborBucket === "instance_profile") {
        // Only add when (a) the path node is a compute (natural
        // carrier) AND (b) the IP actually USES_ROLE → a role on the
        // path. The second gate prevents the orphan-card class of
        // bug: an EC2 may carry HAS_INSTANCE_PROFILE → IP whose role
        // is NOT the one on this attack chain (see ipsOnPathChain
        // precompute above for full context).
        if (pathNodeBucket === "compute" && ipsOnPathChain.has(neighborId)) {
          addAsInstanceProfile(neighborId, e.neighbor_name)
        }
        continue
      }
      if (neighborBucket === "vpc") {
        // Phase 1.2 (2026-05-26): synthesize the VPC entry from
        // lateral edges so VPCBoundaries always has a named boundary
        // to render. The VPC node is rarely included in the path's
        // node_ids by upstream IAP (the chain is workload→subnet→
        // role→jewel, no VPC hop). Without this branch, vpcsById is
        // empty and the dashed boundary doesn't render — the operator
        // sees the path floating in the canvas with no container
        // context. IN_VPC / RUNS_IN_VPC laterals on Compute/Subnet
        // carry neighbor_name (e.g. "Payment-Production-VPC"), which
        // is exactly what we need for the label.
        if (pathNodeBucket === "compute" || pathNodeBucket === "subnet") {
          addAsVPC(neighborId, e.neighbor_name)
        }
        continue
      }
      // Otherwise: lateral pivot (sibling role / other bucket / etc).
      // Skip — Exposure view handles the full fan-out.
    }
  }

  // Drain the deferred on-path flows now that the lateral loop has
  // finished populating egressGateways / instanceProfiles / etc. The
  // pathCheckpoints getters resolve against the final state of each
  // array, so flow.egressGatewayId is now correctly set to the IGW
  // that lateral processing added during the loop.
  for (const { sourceId, targetId, edge: e } of pendingOnPathFlows) {
    const key = `${sourceId}->${targetId}`
    if (flowKeys.has(key)) continue
    flowKeys.add(key)
    const hits = e.hit_count ?? 0
    const bytes = e.bytes ?? 0
    flows.push({
      sourceId,
      targetId,
      // 2026-05-25 (Phase 2 explicit-edges refactor): checkpoint-bundle
      // fields (sgId/naclId/instanceProfileId/roleId/egressGatewayId)
      // are intentionally NOT populated. The renderer now consumes
      // `architecture.edges[]` (built below) and draws one line per
      // graph edge tagged with its plane. Routing one synthesized flow
      // through both Role (identity) AND IGW (network) on one polyline
      // was the cross-plane drawing bug the audit caught. Flow stays
      // for backward-compat header math (totalBytes / totalConnections).
      ports: e.port ? [String(e.port)] : [],
      protocol: e.protocol || (e.type.includes("S3") ? "s3" : "tcp"),
      bytes,
      connections: hits || 1,
      isActive: !!e.observed || hits > 0 || bytes > 0,
      // 2026-05-28 — carry forensic provenance through to TFM's
      // hover detail panel. ISO timestamps from the live graph edge.
      firstSeen: (e as any).first_seen ?? null,
      lastSeen: (e as any).last_seen ?? null,
      // 2026-05-28 — Phase 2 V1 slice 3 (edge semantic states).
      // Flag AWS-required relationships as locked so the renderer
      // can paint them as observed-static (slate, no animation)
      // rather than observed-animated (which implies "removable").
      isLocked: isLockedEdgeType(e.type),
    })
  }

  // Path edges — add as the primary flows (these are the chain).
  // Source/target must already be in seen for the TFM to render the
  // line between them. Most path edges are config-only (USES_ROLE,
  // SECURED_BY, IN_SUBNET) so they don't create new flow lines;
  // only the observed data-bearing edges do.
  //
  // 2026-05-22 fix: also keep edges with hit_count > 0. The IAP
  // backend's role→S3 ACCESSES_RESOURCE edge often carries
  // hit_count (CloudTrail action count) without populating
  // traffic_bytes — pre-fix we lost these flows entirely.
  for (const edge of path.edges ?? []) {
    if (!seen.has(edge.source) || !seen.has(edge.target)) continue
    const observed = edge.is_observed ?? false
    const bytes = edge.traffic_bytes ?? 0
    const hits = edge.hit_count ?? 0
    if (!observed && bytes === 0 && hits === 0) continue
    const t = (edge.type || "").toUpperCase()
    if (
      t === "USES_ROLE" ||
      t === "SECURED_BY" ||
      t === "USES_SECURITY_GROUP" ||
      t === "IN_SUBNET" ||
      t === "IN_VPC" ||
      t === "RUNS_IN_VPC" ||
      t === "HAS_INSTANCE_PROFILE" ||
      t === "HAS_POLICY" ||
      t === "ASSUMES_ROLE"
    )
      continue
    // Dedupe — same flow may also be in the lateral loop's on_path
    // branch. Without this guard the role→jewel observed flow showed
    // up twice (1,579,582 connections bug from the 2026-05-22 audit).
    const flowKey = `${edge.source}->${edge.target}`
    if (flowKeys.has(flowKey)) continue
    flowKeys.add(flowKey)
    flows.push({
      sourceId: edge.source,
      targetId: edge.target,
      // 2026-05-25: checkpoint fields removed — see Branch A note.
      // Rendering now driven by `architecture.edges[]` (built below).
      ports: edge.port ? [String(edge.port)] : [],
      protocol: edge.protocol || (t.includes("S3") ? "s3" : "tcp"),
      bytes,
      connections: edge.hit_count ?? 1,
      isActive: observed,
      // 2026-05-28 — forensic provenance from the path edge.
      firstSeen: (edge as any).first_seen ?? null,
      lastSeen: (edge as any).last_seen ?? null,
      // 2026-05-28 — Phase 2 V1 slice 3 (edge semantic states).
      isLocked: isLockedEdgeType(edge.type),
    })
  }

  // ─── Chain-completion flows ──────────────────────────────────────
  //
  // If we have a compute workload OR a principal AND a crown-jewel
  // resource on the path but NO synthesized observed flow between
  // them yet (because the BFS only emitted role→S3 with traffic, not
  // compute→S3), add a chain-completing flow so the line draws
  // source → SG → NACL → role → resource visually. Marked
  // isActive=false (dimmed gray) since it's a CONFIGURED relationship,
  // not observed traffic. Principals are included as sources now that
  // they're in their own lane — without this the principal lane
  // would render as a card with no outgoing line on direct-access
  // paths (root → S3 etc.) when the BFS edge filter dropped the
  // observed terminal edge for any reason.
  const pathComputes = computeServices.filter((c) => !c.name.startsWith("ENI "))
  const pathSources = [...pathComputes, ...principals]
  const pathResources = resources
  for (const source of pathSources) {
    for (const resource of pathResources) {
      const key = `${source.id}->${resource.id}`
      if (flowKeys.has(key)) continue
      flowKeys.add(key)
      flows.push({
        sourceId: source.id,
        targetId: resource.id,
        // 2026-05-25: checkpoint fields removed. Chain-completion is
        // now expressed via the real graph edges in `architecture.edges[]`
        // (the path's HAS_INSTANCE_PROFILE → USES_ROLE → HAS_POLICY →
        // ACCESSES_RESOURCE sequence). If no such graph edge exists,
        // no line is drawn — invented "configured chain" lines were
        // the source of the cross-plane visual bug.
        ports: [],
        protocol: "configured",
        bytes: 0,
        connections: 0,
        isActive: false,
      })
    }
  }

  // ─── vpcGroups assembly ──────────────────────────────────────────
  //
  // TFM's VPCBoundaries draws bounding boxes from this payload (gated
  // by the "VPC" toggle in the header). For each VPC node on the path
  // we group: its subnets (matched via subnet.vpcId) and a per-subnet
  // anchor set used to compute the bounding box.
  //
  // What MUST be in the anchor set (genuinely VPC-scoped — these are
  // the 6 in-VPC node types from the architecture writeup):
  //   - Compute (EC2 / Lambda living in the subnet)
  //   - Subnet card itself
  //   - Security Groups (VPC-scoped)
  //   - NACLs (subnet-scoped, so VPC-scoped)
  //   - (ENI + RouteTable are folded into compute / subnet cards as
  //     chips, not separate cards — anchoring the parents covers them)
  //
  // What's INTENTIONALLY excluded (and was the source of the prior
  // "VPC box engulfs S3" bug):
  //   - IAMRoles (IAM service, GLOBAL)
  //   - InstanceProfiles (IAM service, GLOBAL)
  //   - IAMPolicies (IAM service, GLOBAL)
  //   - Resources (S3/DynamoDB/KMS — global services; in-VPC RDS would
  //     anchor via IN_SUBNET on the rare path that has it)
  //   - EgressGateways (IGW/NAT — they ATTACH to a VPC but the canvas
  //     lays them out in row 2 next to RESOURCES; if anchored, the
  //     box stretches down and engulfs S3 geometrically. The IGW
  //     visually sits AT the boundary today, which is correct.)
  //
  // 2026-05-25 rewrite: previously the per-subnet anchor was ONLY
  // computes when IN_SUBNET edges existed (fallback added SG+NACL but
  // only fired when IN_SUBNET was empty). On paths WITH IN_SUBNET
  // edges — i.e. most paths — SGs and NACLs were missing from the
  // anchor, the bounding box was undersized, and operators saw the
  // SG / NACL cards visually OUTSIDE the dashed VPC box even though
  // they're VPC-scoped. The user's audit writeup specifically called
  // this out as "VPC boundary not drawn at all" (effectively: drawn
  // too small to register as the obvious container).
  const subnetToComputes = new Map<string, string[]>()
  const linkComputeToSubnet = (computeId: string, subnetId: string) => {
    if (!subnetId || !computeId) return
    if (!subnetToComputes.has(subnetId)) subnetToComputes.set(subnetId, [])
    const list = subnetToComputes.get(subnetId)!
    if (!list.includes(computeId)) list.push(computeId)
  }
  for (const edge of path.edges ?? []) {
    const t = (edge.type || "").toUpperCase()
    if (t !== "IN_SUBNET") continue
    // Direction: compute -> subnet
    linkComputeToSubnet(edge.source, edge.target)
  }
  // path.edges often omits IN_SUBNET — fall back to graph laterals + infra_context.
  for (const pn of path.nodes ?? []) {
    const subnetId = pn.infra_context?.subnets?.[0]?.id
    if (subnetId) {
      linkComputeToSubnet(pn.id, subnetId)
      for (const c of computeServices) {
        if (
          c.id === pn.id ||
          c.instanceId === pn.id ||
          c.name === pn.name ||
          (c.instanceId && pn.id?.includes(c.instanceId))
        ) {
          linkComputeToSubnet(c.id, subnetId)
        }
      }
    }
    for (const e of graph.laterals_by_node[pn.id] ?? []) {
      if ((e.type || "").toUpperCase() !== "IN_SUBNET") continue
      if (e.neighbor_id) linkComputeToSubnet(pn.id, e.neighbor_id)
    }
  }
  // Wire compute placement onto SubnetNode.connectedComputeIds so downstream
  // renderers (containment map) can place EC2 cards in their subnet.
  for (const sn of subnets) {
    const ids = subnetToComputes.get(sn.id)
    if (ids?.length) sn.connectedComputeIds = ids
  }
  // Backfill VPC CIDR from graph nodes when addAsVPC ran without key_properties.
  for (const v of vpcsById.values()) {
    if (v.cidrBlock) continue
    const vpcNode = graph.nodes.find((n) => n.id === v.vpcId)
    const cidr = vpcNode?.key_properties?.cidr_block
    if (typeof cidr === "string" && cidr) v.cidrBlock = cidr
  }

  // Architecture-wide set of network-scoped card ids — SGs + NACLs.
  // These get added to EVERY subnet's anchor so the outer VPC box
  // wraps them regardless of which subnet's bbox they sit closest to.
  // Duplicates across subnets are harmless (VPCBoundaries dedupes
  // implicitly via the element-set bounding-box math).
  const networkAnchorIds = [
    ...securityGroups.map((sg) => sg.id),
    ...nacls.map((n) => n.id),
  ]

  // 2026-05-24: REVERTED — the synthetic Internet node (added briefly
  // in commit 5ea36fe) was a category error. AWS IAM "Principal" means
  // an identity (user, role, federated user, service principal); the
  // public internet is a network traffic source, not an identity. A
  // CISO / cloud-engineer reviewer spots the mis-categorization in
  // seconds. The IGW + the SG's `tcp 0-65535 from 0.0.0.0/0` rule
  // (when surfaced) already communicate "this chain is internet-
  // exposed" without needing a separate node. Kept this block as a
  // hostile comment so future PRs don't re-add the node without the
  // upstream context.
  //
  // If we DO want a visible "outside the perimeter" anchor later,
  // either (a) add a dedicated ENTRY / NETWORK SOURCE lane (separate
  // grid column), or (b) render as an annotation chip on the IGW
  // card itself ("↔ Internet"). Both keep the AWS-IAM ontology
  // consistent. Don't put it in PRINCIPALS.

  const vpcGroups = Array.from(vpcsById.values()).map((v) => {
    const groupSubnets = subnets
      .filter((s) => s.vpcId === v.vpcId || !s.vpcId)
      .map((s) => ({
        subnetId: s.id,
        subnetName: s.shortName ?? s.name,
        // SubnetNode.isPublic is three-state (true/false/null). VPCBoundaries
        // expects boolean; coerce null → false (private fallback) for the
        // boundary-coloring decision only — the SubnetNode card itself
        // still renders the honest three-state Unknown chip.
        isPublic: s.isPublic === true,
        // Anchor set per subnet (2026-05-25 fix):
        //   1. computes in this subnet (via IN_SUBNET edges, if any)
        //   2. the subnet's own card (data-subnet-id anchor — locks the
        //      inner subnet-box bounds to the actual card position)
        //   3. all architecture-wide network anchors (SGs + NACLs) — see
        //      networkAnchorIds above. Without these the outer VPC box
        //      was undersized and the SG/NACL cards rendered outside it.
        nodeIds: [
          ...(subnetToComputes.get(s.id) ?? []),
          s.id,
          ...networkAnchorIds,
        ],
      }))
    return { vpcId: v.vpcId, vpcName: v.vpcName, cidrBlock: v.cidrBlock, subnets: groupSubnets }
  })

  // Region — infer from the first ARN in the graph (service slot).
  let region: string | undefined
  for (const n of graph.nodes ?? []) {
    const id = n.id || ""
    const m = id.match(/arn:aws:[^:]+:([a-z0-9-]+-\d):/)
    if (m) {
      region = m[1]
      break
    }
  }
  if (!region) {
    const az = subnets.find((s) => s.availabilityZone)?.availabilityZone
    if (az) {
      const m = az.match(/^([a-z0-9-]+-\d+)/i)
      if (m) region = m[1]
    }
  }
  if (!region) {
    for (const pn of path.nodes ?? []) {
      const fromArn = (pn.id || "").match(/arn:aws:[^:]+:([a-z0-9-]+-\d):/)
      if (fromArn) {
        region = fromArn[1]
        break
      }
      const awsRegion = pn.ip_metadata?.aws?.region
      if (awsRegion) {
        region = awsRegion
        break
      }
    }
  }

  // ── Mark role↔IP binding twins (Phase 1.1, revised 2026-05-26) ──
  //
  // Backend marks pairs via `key_properties.binding_twin_id`. We stamp
  // a `bindingTwinIp` flag on the role's checkpoint so the renderer
  // can show a hint chip, BUT we KEEP both cards in the architecture
  // arrays so the sidebar counts (IAM ROLES (1) · INSTANCE PROFILES (1))
  // reflect what's actually in the graph. The previous "collapse-and-
  // drop-the-IP" behavior produced INSTANCE PROFILES (0) which was a
  // lie about the graph state — the hop exists, just folded visually.
  // User audit caught the count regression and the fix is to keep the
  // count honest.
  for (const role of iamRoles) {
    const roleNode = graph.nodes.find((n) => n.id === role.id)
    const twinId = (roleNode?.key_properties as Record<string, any> | undefined)?.binding_twin_id
    if (typeof twinId === "string" && twinId && seen.has(twinId)) {
      if (instanceProfiles.some((ip) => ip.id === twinId)) {
        ;(role as any).bindingTwinIp = true
      }
    }
  }

  // ── Chain-scope live-evidence per role (Phase 1.8 — 2026-05-26) ──
  //
  // Backend's _enrich_live_usage sums per-resource MAX hit_count across
  // ALL resources the role has accessed (975,913 = 789,820 prod-data +
  // 186,093 analytics). Honest as a "this role HAS been used" signal,
  // but misleading on a chain-scoped view: the operator reads the
  // "976K hits" chip on a role card sitting next to ONE jewel and
  // assumes that's hits to THAT jewel. It isn't.
  //
  // Filter to outgoing ACCESSES_RESOURCE edges that target the chain's
  // CJ(s). Now the chip shows the chain-scoped number — 789,820 in this
  // case — matching what the operator expects from the chain context.
  for (const role of iamRoles as any[]) {
    const roleLaterals = graph.laterals_by_node?.[role.id] ?? []
    let cjHits = 0
    for (const e of roleLaterals) {
      if (e.type !== "ACCESSES_RESOURCE") continue
      if (e.direction !== "out") continue
      const nid = e.neighbor_id || ""
      if (!nid || !crownJewelIds.has(nid)) continue
      const h = e.hit_count ?? 0
      if (h > cjHits) cjHits = h
    }
    if (cjHits > 0) {
      role.liveObservedTotalHits = cjHits
      role.liveObservedResourceCount = 1
    } else if (role.liveObservedTotalHits) {
      // Role had cross-resource live activity but NOT to this chain's
      // jewel. Drop the chip on this view — showing cross-resource
      // totals here is exactly the audit's complaint.
      delete role.liveObservedTotalHits
      delete role.liveObservedResourceCount
    }
  }

  // ENTRY lane (Phase 2 — 2026-05-25): explicit attacker-entry nodes.
  // For now we surface every principal (root / IAMUser / federated /
  // CloudTrailPrincipal) — those are the identity-side entry points
  // the operator most often asks about ("how did the attacker get in?").
  // Network entry-points (Internet → IGW / ALB / APIGW) populate the
  // EGRESS lane today; promoting them into ENTRY when they're inbound
  // is a follow-up that needs ingress-vs-egress distinction in the
  // graph-view payload. Back-compat: TFM also falls back to
  // architecture.principals when entryPoints is empty.
  const entryPoints = principals.slice()

  // ─── Explicit edges (Phase 2 — 2026-05-25) ────────────────────────
  //
  // Build a 1:1 CanvasEdge[] from the real graph relationships that
  // TrafficFlowMap will draw as one line per edge, tagged with its
  // plane. Two sources:
  //
  //   1. `path.edges` — IAP-traced edges (the chain itself). All edge
  //      types are included; the renderer will filter / color by
  //      plane via planeForString. We keep config edges (USES_ROLE,
  //      HAS_INSTANCE_PROFILE, IN_SUBNET, ASSOCIATED_WITH, ROUTES_VIA,
  //      etc.) because they ARE the topology — without them the cards
  //      sit disconnected. Pre-refactor these were continued past in
  //      the flow-synthesis loop, which is why operators saw an
  //      EC2 with no lines to its SG/Subnet/Role unless we faked them.
  //
  //   2. `graph.laterals_by_node` — neighbor edges off path nodes,
  //      both on_path observed-traffic edges (data plane) and config
  //      edges to the lateral attachment cards (NACL, SG, IP, IGW).
  //
  // Both endpoints MUST be in `seen` (a card was actually rendered
  // for them). Edges to nodes the layout chose not to render are
  // dropped — counted but never invented. Dedupe by canonical key.
  const edgeKeys = new Set<string>()
  const builtEdges: CanvasEdge[] = []
  // V2-3 (2026-05-31): track which builtEdges belong to the on-path
  // chain (vs lateral fan-outs). Populated as pushCanvasEdge fires —
  // the path-edge loop passes isOnPath=true, the lateral loop passes
  // isOnPath = e.on_path (the backend already tags lateral edges
  // that coincide with the path). The Set ships in the architecture
  // return; TFM's canvasV2 layer reads it to dim non-on-path edges.
  // Pure passthrough — no FE inference; the path/lateral split came
  // from the backend's distinct response fields.
  const onPathEdgeIds = new Set<string>()
  // V2-3: same for nodes — derived from path.nodes verbatim. Used by
  // the renderer to dim node cards that aren't on the chain.
  const onPathNodeIds = new Set<string>(
    (path.nodes ?? []).map((n) => n.id),
  )

  // ── AWS most-specific-route filter on EGRESS GATEWAYS (2026-05-29) ──
  //
  // The path's route table can carry multiple targets — typically:
  //   pl-XXX (service prefix list) → VPCEndpoint  (specific route)
  //   0.0.0.0/0                    → IGW          (default route)
  //
  // AWS picks the *most specific* route. For a path whose target is
  // S3, this means traffic actually flows through the VPCE, NOT the
  // IGW. The IGW is in the RT but not on this flow.
  //
  // Previously we rendered both. The operator audit (2026-05-29)
  // called it out as misleading: the canvas was telling the operator
  // that IGW was on the EC2 → S3 path when in fact the data plane
  // routes via the VPCE.
  //
  // Logic, mirroring AWS (refined 2026-05-30 after operator audit on
  // cyntro-demo-prod-data: lane was showing 3 SSM-family VPCEs + IGW
  // for an EC2 → S3 path, when only the IGW is actually on the S3
  // flow):
  //
  //   Rule A (always-on, regardless of matching-VPCE presence):
  //     Drop VPCEs whose serviceHint is set AND doesn't match ANY of
  //     pathTargetServiceTokens (the set discovered from crown-jewel
  //     ARNs + types). A VPCE configured for SSM Messages can NEVER
  //     carry S3 traffic — it's a lateral surface of the VPC, not a
  //     node on this path. Same conceptual class as the lateral SGs
  //     we filtered earlier.
  //
  //   Rule B (only when a matching VPCE exists):
  //     Drop IGW / NAT / Transit / Egress-only IGW. AWS resolves the
  //     more-specific service-prefix-list route to the VPCE, so the
  //     default route (0.0.0.0/0 → IGW) is bypassed.
  //
  //   Rule C (no matching VPCE):
  //     IGW / NAT remain as the actual default route — they ARE the
  //     real path. Only Rule A's mismatched VPCEs drop.
  //
  // Service-agnostic at the code level: the gate is
  //   pathTargetMatchesServiceToken(gateway.serviceHint)
  // which checks the VPCE token against the set of service tokens
  // discovered from the path's crown jewels (ARN service slot + type
  // substring). New services slot in automatically — no table.
  //
  // VPCEs whose serviceHint is null/undefined (collector didn't tag)
  // stay — we can't prove they're off-path. Better to surface a
  // possibly-on-path edge than silently drop a real one.
  //
  // The droppedEgressIds set is removed from `seen` below so that
  // pushCanvasEdge skips any (subnet → IGW) ROUTES_VIA edges from the
  // lateral loop — the IGW card and its edges both go.
  const droppedEgressIds = new Set<string>()
  if (pathTargetServiceTokens.size > 0) {
    const hasMatchingVpce = egressGateways.some(
      (g) =>
        g.kind === "VPCEndpoint" &&
        g.serviceHint &&
        pathTargetMatchesServiceToken(g.serviceHint),
    )
    for (let i = egressGateways.length - 1; i >= 0; i--) {
      const g = egressGateways[i]
      if (g.kind === "VPCEndpoint") {
        // Rule A — drop VPCEs whose serviceHint matches NO path target.
        // These are noise (a DynamoDB VPCE on an S3-only path wouldn't
        // have been an alternative route for that S3 traffic) per the
        // user's "don't include gateways that wouldn't have been an
        // alternative" criterion.
        if (g.serviceHint && !pathTargetMatchesServiceToken(g.serviceHint)) {
          droppedEgressIds.add(g.id)
          egressGateways.splice(i, 1)
        }
      }
      // Rule B (KEPT, NOT DROPPED 2026-06-01 — canvas-v3-routing fix) —
      // IGW/NAT/EIGW/TGW when a service-matching VPCE exists are NOT
      // dropped anymore. They ARE the alternative the operator needs
      // to see grayed-but-present, per pattern_visualize_by_negation.
      // The frontend renderer (traffic-flow-map.tsx applyPathFilter
      // visualize-by-negation pass) grays them with the "Available ·
      // Not selected" label so the gap between full-color VPCE and
      // grayed IGW IS the security signal.
      //
      // OLD behavior dropped these silently, which made
      // pattern_visualize_by_negation impossible to render — the
      // alternative was invisible. New behavior keeps the data, lets
      // the renderer demote it visually.
      //
      // Rule C — non-VPCE gateway with no matching VPCE → keep (the
      // winning route for this path; rendered full color).
    }
  }
  // Remove the dropped gateway ids from `seen` so the edge build below
  // skips any edges referencing them. Without this, ROUTES_VIA edges
  // from subnet → dropped IGW would be pushed to builtEdges and the
  // renderer would draw a line into empty space.
  for (const id of droppedEgressIds) seen.delete(id)

  // ── Edge visual-noise filter (2026-05-26, Fix #3) ─────────────────
  //
  // Phase 2 wired ALL graph edges 1:1 to the canvas. Faithful but
  // visually noisy: 30 edges → 30 SVG bezier curves → curves crossing
  // unrelated lane cards. User-audit caught the "Role → IGW → S3"
  // misread, which was a curve from a different edge passing through
  // the IGW card geometrically.
  //
  // The fix is to drop edge types that are either:
  //   a) container/context edges already represented by other visuals
  //      (IN_VPC, RUNS_IN_VPC — the dashed VPC boundary IS this hop)
  //   b) shortcut aliases of a canonical edge that we already draw
  //      (USES_SECURITY_GROUP is a legacy alias for SECURED_BY;
  //      compute→role via USES_ROLE / ASSUMES_ROLE / ASSUMES_ROLE_ACTUAL
  //      duplicates the canonical compute→IP→role chain)
  //
  // The data is preserved in the Neo4j graph; we just don't draw a
  // visible line for these. Chain backbone (HAS_INSTANCE_PROFILE,
  // USES_ROLE on IP, ACCESSES_RESOURCE, SECURED_BY, IN_SUBNET,
  // ASSOCIATED_WITH, ROUTES_VIA) stays untouched.
  const SKIP_REL_TYPES = new Set([
    "IN_VPC",
    "RUNS_IN_VPC",
    "BELONGS_TO",         // VPC↔{SG, NACL} container — VPC boundary box renders this
    "BELONGS_TO_SYSTEM",
    "USES_SECURITY_GROUP", // legacy alias for SECURED_BY
  ])
  // For compute→role direct edges, only skip if the FULL IP chain is
  // also present (compute→IP exists AND IP→role exists). When the
  // chain is missing, the direct edge is the only thing tying the
  // compute to the role and we must keep it.
  const hasComputeToIpEdge = (path.edges ?? []).some(
    (e) => (e.type || "").toUpperCase() === "HAS_INSTANCE_PROFILE",
  )
  const computeRoleShortcutSkip = hasComputeToIpEdge
    ? new Set(["USES_ROLE", "ASSUMES_ROLE", "ASSUMES_ROLE_ACTUAL"])
    : new Set<string>()

  const pushCanvasEdge = (
    source: string,
    target: string,
    rawType: string,
    observed: boolean | null,
    bytes: number | null,
    hitCount: number | null,
    port: number | null,
    protocol: string | null,
    firstSeen: string | null,
    lastSeen: string | null,
    isOnPath: boolean = false,
  ) => {
    if (!source || !target) return
    if (!seen.has(source) || !seen.has(target)) return
    const rel = (rawType || "").toUpperCase()
    if (!rel) return
    if (SKIP_REL_TYPES.has(rel)) return
    // Compute→role shortcut filter — only when the canonical IP chain
    // is present. Check by id pattern: compute ids don't start with
    // `arn:`; role ids do.
    if (computeRoleShortcutSkip.has(rel)) {
      const looksLikeCompute = !source.startsWith("arn:")
      const looksLikeRole = target.includes(":role/")
      if (looksLikeCompute && looksLikeRole) return
    }
    const id = `${source}|${rel}|${target}`
    if (edgeKeys.has(id)) {
      // Dedup: if a later caller marks an already-pushed edge as on-
      // path, honor it (path is the more authoritative signal).
      if (isOnPath) onPathEdgeIds.add(id)
      return
    }
    edgeKeys.add(id)
    if (isOnPath) onPathEdgeIds.add(id)
    builtEdges.push({
      id,
      source_aws_id: source,
      target_aws_id: target,
      // Cast through string — CanvasRelationshipType is a closed enum,
      // but the IAP / graph-view producers emit raw Neo4j relationship
      // strings. planeForString handles unknowns conservatively
      // ("network"); the cast is safe because the renderer never
      // narrows on this field, only reads it for hover labels.
      relationship: rel as CanvasRelationshipType,
      observed,
      hit_count: hitCount,
      bytes,
      first_seen: firstSeen,
      last_seen: lastSeen,
      port,
      protocol,
    })
  }

  // (1) From the IAP path's edges — the chain backbone.
  //
  // 2026-05-30 (FE follow-up #7): backend B3 fix (PRs #47/#48/#49) made
  // `_build_comprehensive_path` surface first_seen / last_seen on every
  // observed-edge MapEdge. The producer here was the choke point that
  // dropped them by passing null/null to pushCanvasEdge — which made
  // PR #76's edge-hover provenance slice dead-code on this rendering
  // path. Thread the timestamps through so the renderer's <title>
  // tooltip surfaces them on hover in explicit-edges mode.
  for (const e of path.edges ?? []) {
    pushCanvasEdge(
      e.source,
      e.target,
      e.type,
      e.is_observed ?? null,
      e.traffic_bytes ?? null,
      e.hit_count ?? null,
      e.port ?? null,
      e.protocol ?? null,
      (e as any).first_seen ?? null,
      (e as any).last_seen ?? null,
      true, // V2-3: this loop ingests the on-path chain backbone.
    )
  }

  // (2) From laterals — both on_path observed edges AND lateral
  //     attachments to the cards we rendered (NACL, SG, IP, IGW, Role).
  for (const [pathNodeId, neighbors] of Object.entries(graph.laterals_by_node)) {
    for (const e of neighbors) {
      // Same inline-node fallback as the node pass: inline IAM policies carry
      // their id in neighbor_arn (neighbor_id is empty), so without this the
      // HAS_POLICY edge is never built and the policy is dropped in path mode.
      const neighborId = e.neighbor_id || e.neighbor_arn || ""
      if (!neighborId) continue
      const source = e.direction === "out" ? pathNodeId : neighborId
      const target = e.direction === "out" ? neighborId : pathNodeId
      pushCanvasEdge(
        source,
        target,
        e.type,
        e.observed,
        e.bytes,
        e.hit_count,
        e.port,
        e.protocol,
        e.first_seen,
        e.last_seen,
        // V2-3: the backend's lateral feed already tags edges that
        // coincide with the on-path chain via `on_path`. Honor it.
        // Lateral-only edges (the fan-outs) get isOnPath=false.
        e.on_path ?? false,
      )
    }
  }

  // ── Service-plane inferred edges (2026-05-30) ───────────────────
  //
  // Neo4j models the VPCE side (network route: Subnet → VPCE) and the
  // bucket side (data plane: Role → S3) as separate fact patterns —
  // there's no (VPCEndpoint)-[->]-(S3Bucket) edge. But at AWS data
  // plane every byte transits the VPCE on its way to the bucket, so
  // the canvas needs to draw that segment for the flow to read
  // complete.
  //
  // This is the generic primitive — same logic covers VPCE→S3,
  // VPCE→DynamoDB, VPCE→KMS, VPCE→SecretsManager, etc. The mapping
  // from VPCE.serviceHint to graph-resource-type is structural; no
  // hardcoded "drop X for Y" pairs.
  //
  // Three-condition guard (Greenlight feedback 2026-05-30):
  //   1. VPCE is in the egressGateways list (i.e. on the path).
  //   2. A resource on the path has type matching the VPCE
  //      serviceHint (S3Bucket for "s3", DynamoDBTable for "dynamodb",
  //      etc).
  //   3. Same-account/region: the VPCE.vpc_id account prefix and the
  //      resource id account prefix match. Without this, drawing
  //      inferred edges across accounts/regions would lie about flows
  //      that physically can't traverse the VPCE.
  //
  // Auto-graduate: if a real (non-inferred) edge already exists
  // between the same source/target, skip. When Option B lands (the
  // collector writes the real edge), this code transparently stops
  // synthesizing because builtEdges already carries the truth.
  //
  // Service matching — derived from the resource ARN's service slot
  // (arn:aws:<service>:...), which is the canonical AWS identifier
  // regardless of how the renderer bucketed the type. Works for
  // every AWS service that follows the standard ARN shape — no
  // mapping table needed for the common case.
  const serviceFromArn = (id: string | null | undefined): string | null => {
    if (!id) return null
    const m = id.match(/^arn:aws:([^:]+):/)
    return m ? m[1].toLowerCase() : null
  }

  // Helper: extract the AWS account id from an ARN-shaped id. Returns
  // null for ARN shapes that don't carry an account (e.g. S3 bucket
  // ARNs which have empty account field) — caller treats null as
  // "can't determine" and skips the same-account check.
  const accountFromArn = (idOrArn: string | null | undefined): string | null => {
    if (!idOrArn) return null
    const m = idOrArn.match(/^arn:aws:[^:]+:[^:]*:(\d+):/)
    return m ? m[1] : null
  }

  // For each VPCE in egressGateways with a matching jewel resource on
  // the path, synthesize the inferred edge. Service match is direct
  // string compare on the AWS service token — "s3" matches "s3", etc.
  for (const vpce of egressGateways) {
    if (vpce.kind !== "VPCEndpoint") continue
    if (!vpce.serviceHint) continue
    const vpceService = vpce.serviceHint.toLowerCase()

    for (const res of resources) {
      // Condition 2: resource ARN's service slot matches VPCE service.
      const resService = serviceFromArn(res.id)
      if (!resService || resService !== vpceService) continue

      // Condition 3: same account. VPCE id (vpce-XXX) doesn't carry
      // account; we resolve by checking the resource ARN's account
      // against any other ARN-bearing node on the path (e.g. the role
      // sitting on the path). When ARNs are unavailable we skip
      // rather than infer cross-account — safer to under-draw than
      // over-draw.
      const resAccount = accountFromArn(res.id)
      let pathAccount: string | null = null
      for (const r of iamRoles) {
        const a = accountFromArn(r.id)
        if (a) {
          pathAccount = a
          break
        }
      }
      if (resAccount && pathAccount && resAccount !== pathAccount) continue

      // Auto-graduate: skip if a real edge between VPCE and resource
      // already exists (Option B's (VPCE)-[:SERVES]->(Resource) edge,
      // when shipped, will populate builtEdges before this inference
      // runs).
      const realEdgeExists = builtEdges.some(
        (e) =>
          !e.inferred &&
          ((e.source_aws_id === vpce.id && e.target_aws_id === res.id) ||
            (e.source_aws_id === res.id && e.target_aws_id === vpce.id)),
      )
      if (realEdgeExists) continue

      const inferredId = `${vpce.id}|ROUTES_VIA_INFERRED|${res.id}`
      if (edgeKeys.has(inferredId)) continue
      edgeKeys.add(inferredId)
      builtEdges.push({
        id: inferredId,
        source_aws_id: vpce.id,
        target_aws_id: res.id,
        relationship: "ROUTES_VIA" as CanvasRelationshipType,
        observed: null,
        hit_count: null,
        bytes: null,
        first_seen: null,
        last_seen: null,
        port: null,
        protocol: null,
        inferred: true,
        inferred_reason: `VPCEndpoint serves "${vpce.serviceHint}". ${res.name || res.id} is a ${res.type} in the same account. AWS routes service traffic via the VPCE even though Neo4j doesn't stamp the edge.`,
      })
    }
  }

  return {
    computeServices,
    principals,
    entryPoints,
    resources,
    subnets,
    securityGroups,
    nacls,
    iamRoles,
    // 2026-05-22: identity types are split across three arrays so the
    // sidebar count is honest ("IAM ROLES (1) · INSTANCE PROFILES (1)
    // · IAM POLICIES (1)" instead of the previous wrong "IAM ROLES
    // (3)"). Both new arrays are optional on SystemArchitecture for
    // back-compat — consumers that don't know about them just ignore
    // the new lanes.
    //
    // 2026-05-26 (Phase 1.1, revised): the IP card stays in the
    // architecture so the sidebar count is honest about the graph
    // ("INSTANCE PROFILES (1)" reflects the real HAS_INSTANCE_PROFILE
    // hop). The role's checkpoint carries bindingTwinIp:true so the
    // renderer can disambiguate the visual without dropping the count.
    // The earlier "collapse-and-drop" approach lied about the graph
    // state — user audit caught it.
    instanceProfiles,
    iamPolicies,
    vpcEndpoints: [],
    egressGateways,
    flows,
    // 2026-05-25 (Phase 2 explicit-edges refactor): real graph edges
    // populate `edges`. ConnectionLinesSVG branches on this — when
    // non-empty it draws ONE line per CanvasEdge tagged with plane.
    // Cross-plane zigzag synthesis is eliminated.
    edges: builtEdges,
    totalBytes: flows.reduce((s, f) => s + (f.bytes || 0), 0),
    totalConnections: flows.reduce((s, f) => s + (f.connections || 0), 0),
    totalGaps: 0,
    vpcGroups,
    region,
    // V2-3 (2026-05-31): on-path classification for the canvas v2
    // dimming layer. Pure passthrough — populated during the path-
    // edge loop (isOnPath=true) and the lateral loop (e.on_path).
    onPathEdgeIds,
    onPathNodeIds,
  }
}
