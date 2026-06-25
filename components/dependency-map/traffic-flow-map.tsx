'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { riskLabel } from '@/lib/utils';
import { useCachedFetch } from '@/lib/use-cached-fetch';
import { Globe, Server, Database, HardDrive, Zap, Network, Shield, ShieldOff, Key, RefreshCw, Maximize2, Minimize2, AlertTriangle, Cloud, Info, ChevronDown, ChevronRight, Lock, Unlock, X, ArrowRight, ArrowLeft, Activity, Layers, Target, GitBranch, Search, ExternalLink, Download, Crown, Clock, FileText } from 'lucide-react';
import { derivePrecedenceForDestination, type RoutePrecedence } from "@/lib/route-precedence";
import { buildSpotlightActiveNodeIds } from "@/lib/attack-paths/build-spotlight-active-node-ids";
import {
  countVpceLane,
  vpceCardChrome,
  vpceCardTitle,
  vpceLaneSubtitle,
  VPCE_INACTIVE_TOOLTIP,
  VPCE_NOT_USED_BADGE,
} from "@/lib/dependency-map/vpce-lane-visual";
import { enrichArchitectureForSpotlight } from "@/lib/attack-paths/enrich-architecture-for-spotlight";
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types";
import { AttackPathDetailPanel } from './attack-path-detail-panel';
import { StackSidebar } from './stack-sidebar';
import { HeatmapControls } from './heatmap-controls';
import { TimelineSlider } from './timeline-slider';
import { VPCBoundaries } from './vpc-boundaries';
import { ExportControls } from './export-controls';
import {
  type CanvasEdge,
  type EdgePlane,
  planeForString,
  PLANE_COLOR,
  PLANE_GLOW,
} from '@/lib/types/attack-canvas';

// ============================================
// TYPES
// ============================================
export type NodeType = 'internet' | 'compute' | 'database' | 'storage' | 'lambda' | 'api_gateway' | 'load_balancer' | 'dynamodb' | 'sqs' | 'sns' | 'iam_role' | 'instance_profile' | 'security_group' | 'nacl' | 'network' | 'api_call' | 'principal' | 'vpc_endpoint';

export interface ServiceNode {
  id: string;
  name: string;
  shortName: string;
  type: NodeType;
  instanceId?: string;
  isCrownJewel?: boolean;
  /** Attached ENIs (NetworkInterfaces) for EC2 / workload nodes.
   *  Rendered as compact chips on the workload card so the SG-ENI-EC2
   *  binding is visible without taking up a separate Compute row.
   *  Added 2026-05-23 after the audit flagged "ENI as its own COMPUTE
   *  row" as a UI clutter issue — the ENI is conceptually part of
   *  the EC2, not a peer workload. */
  enis?: Array<{ id: string; name: string; shortName: string }>;
}

export interface SGRule {
  direction: 'ingress' | 'egress';
  protocol: string;
  fromPort: number | null;
  toPort: number | null;
  portDisplay: string;
  source: string;
  sourceType: 'cidr' | 'security_group' | 'prefix_list' | 'self';
  status: 'used' | 'unused' | 'unobserved' | 'unknown';
  flowCount: number;
  lastSeen: string | null;
  isPublic: boolean;
}

export interface SecurityCheckpoint {
  id: string;
  type: 'security_group' | 'iam_role' | 'nacl';
  name: string;
  shortName: string;
  usedCount: number;
  totalCount: number;
  gapCount: number;
  connectedSources: string[];
  connectedTargets: string[];
  rules?: SGRule[];
  vpcId?: string;
  subnetId?: string;
  /** SG-only: collector's authoritative "this SG accepts 0.0.0.0/0
   *  inbound traffic" flag. Read from has_public_ingress on the
   *  SecurityGroup node. Drives a red "PUBLIC" badge on the chip
   *  WITHOUT needing the full rules[] array (which is expensive to
   *  pass on lateral neighbors). When `rules[]` IS available, the
   *  existing rules-based path counts public rules directly; this
   *  flag is the fallback so lateral SGs still surface the badge. */
  hasPublicIngress?: boolean;
  /** NACL-only: collector's authoritative "default NACL — 0.0.0.0/0
   *  ALLOW ALL on both inbound and outbound by AWS default" flag.
   *  Read from is_default on the NetworkACL node. */
  isDefault?: boolean;
  /** NACL-only: collector's authoritative "has at least one
   *  high-risk rule" flag. Read from has_high_risk. */
  hasHighRisk?: boolean;
  /** NACL-only: collector's authoritative "at least one inbound
   *  rule allows 0.0.0.0/0" flag. Read from
   *  has_public_inbound_allow. */
  hasPublicInboundAllow?: boolean;
  /** NACL-only: number of subnets this NACL is ASSOCIATED_WITH.
   *  Distinct count (label-set duplicates de-duped). Drives the
   *  "M subnets" pill on the chip. */
  subnetCount?: number;
  /** SG / NACL — true when this checkpoint sits ON the current path
   *  (has a real attachment edge to a path node: SECURED_BY for SG,
   *  ASSOCIATED_WITH / HAS_NACL for NACL). False when the checkpoint
   *  is lateral surface (same VPC, but no direct attachment to the
   *  path's workloads). Drives a visual dim + "LATERAL" badge so the
   *  operator reads at a glance which SG/NACL is the gate on this
   *  chain vs which are pivot opportunities. Undefined falls back
   *  to "treat as on-path" (back-compat for callers that don't yet
   *  surface this signal). */
  onPath?: boolean;
  /** SG — display names of the workload(s) this SG is attached to
   *  via SECURED_BY / HAS_SECURITY_GROUP. Populated by the Exfil
   *  view for multi-reader exfil paths so the operator can map each
   *  SG to the specific compute card to remediate (e.g. "default ·
   *  on cyntro-web-server" vs "alon-demo-app-sg · on alon-demo-app2").
   *  Undefined / empty → chip omitted (back-compat). */
  attachedWorkloads?: string[];
  /** IAM Role — observed-activity evidence from CloudTrail
   *  ACCESSES_RESOURCE edges. liveObservedTotalHits is the
   *  per-resource max-then-sum count of distinct API calls.
   *  liveObservedResourceCount is the count of distinct resources hit.
   *  When > 0 the role HAS been used in the observation window,
   *  regardless of what the scalar used_actions_count claims. Backend
   *  emits these via _enrich_live_usage. Drives the amber "live-
   *  evidence" chip on the role card that surfaces the
   *  "0/7 perms" ↔ "975K hits" data contradiction. */
  liveObservedTotalHits?: number;
  liveObservedResourceCount?: number;
  /** IAM Role — true when the collector-written scalar
   *  used_actions_count > 0 BUT zero corresponding :USED_ACTION edges
   *  exist (the inverse of the original "stale" condition). The
   *  scalar claims usage that the action-level edges don't back. The
   *  frontend renders a small "scalar=N · 0 edges" chip so operators
   *  see ingestion drift instead of a silent mismatch. */
  usageScalarEdgesDisagree?: boolean;
  /** IAM Role — sum of `count` properties across :USED_ACTION edges.
   *  Distinct from liveObservedTotalHits (which counts
   *  ACCESSES_RESOURCE hits). Distinct from the usedCount itself
   *  (which counts distinct edges). This is the event-volume
   *  metric — "the role used 3 distinct actions across 1,247
   *  CloudTrail events". Optional render below the main chip. */
  liveUsedActionEventCount?: number;
  /** IAM Role — BLAST RADIUS lateral surfaces (2026-05-27, Alon's
   *  "killer solution" framing). Both lists answer "what ELSE does
   *  this role unlock?" — surfaced as badges on the role chip in
   *  the EXFIL canvas so the operator sees in one glance:
   *    1. ALSO REACHES — same role → other crown jewels
   *       (cross-bucket lateral)
   *    2. SHARED WITH  — other workloads → same role
   *       (cross-workload lateral)
   *  Sorted hottest-jewel-first / most-recently-used-workload-first
   *  by the backend (_attach_accessor_blast_radius). */
  alsoReaches?: Array<{ id: string; name: string; type: string; hits: number }>;
  sharedWith?: Array<{ id: string; name: string; type: string; system_name: string | null }>;
  // ── Stack-components surfacing on the role chip — 2026-05-27 ─────
  // Inline ON THE CANVAS what previously hid in the collapsed sidebar
  // for the EXFIL view. Alon: "u change nothing - is the same" when
  // the canvas itself didn't get richer. Each field maps to one
  // section under the existing LateralFanOut, colored to match the
  // sidebar lane icon.
  assumedBy?: Array<{
    id: string
    session_name: string
    calls: number
    last_seen: string | null
  }>;
  policiesAttached?: Array<{
    name: string
    attachment_type: string | null
    is_aws_managed: boolean | null
  }>;
  actionsUsed?: Array<{ action: string; calls: number }>;
}

export interface TrafficFlow {
  sourceId: string;
  targetId: string;
  sgId?: string;
  naclId?: string;
  // InstanceProfile is the AWS binding between EC2 and IAMRole. When
  // set, ConnectionLinesSVG routes the polyline through the
  // [data-ip-id="..."] card so it sits BEFORE the role hop. Without
  // this checkpoint, the IP lane card renders but no flow points at
  // it → orphan card visually disconnected from the chain (2026-05-24
  // user report on SafeRemediate-Test-App-2 → cyntro-demo-prod-data).
  instanceProfileId?: string;
  roleId?: string;
  // VPC endpoint the packet egresses through to reach an AWS service
  // (e.g. S3 Gateway VPCE com.amazonaws.<region>.s3). Populated when the
  // target is an S3/DynamoDB service AND the source compute's VPC has a
  // matching Gateway endpoint. SG egress doesn't apply to Gateway VPCEs —
  // this is the missing hop that explains "0-rule SG → S3 still works".
  vpceId?: string;
  // Egress gateway the packet exits the VPC through when there's NO
  // Gateway VPCE for the target service — IGW for internet-routed
  // traffic (default S3 endpoint), NAT for outbound IPv4, etc.
  // ConnectionLinesSVG inserts this checkpoint between the role hop
  // and the target resource so the EGRESS GATEWAYS lane chip is
  // visually wired into the chain instead of floating as an orphan
  // box while the header reports observed bytes through it (the
  // 2026-05-23 audit caught this inconsistency).
  egressGatewayId?: string;
  ports: string[];
  protocol: string;
  bytes: number;
  connections: number;
  isActive?: boolean;
  // 2026-05-28 — Phase 2 V1 slice 2. Forensic provenance carried
  // through from the underlying graph edge. Surfaces in the hover
  // detail panel as a "Last seen … · First seen …" freshness pill,
  // making Cyntro's temporal-intelligence patent claim visible on
  // the canvas. Both fields are ISO 8601 strings (UTC) or null.
  // Optional — flows synthesized to fill chain gaps (no underlying
  // observed edge) leave them null.
  firstSeen?: string | null;
  lastSeen?: string | null;
  // 2026-05-28 — Phase 2 V1 slice 3 (edge semantic states). When
  // true, this flow represents an observed AWS-required relationship
  // the operator CAN'T remove (e.g. HAS_INSTANCE_PROFILE,
  // ASSUMES_ROLE). The renderer paints it solid green / static —
  // distinct from observed + remediable (animated bright) and from
  // config-derived (gray dotted). Gives the operator's eye a clear
  // signal of what's actionable vs what's AWS plumbing.
  // Optional — non-attacker consumers leave undefined and the
  // 3-state encoding doesn't activate.
  isLocked?: boolean;
}

// VPC endpoint chip for the "VPC ENDPOINTS" lane. Render-only — full
// AWS detail (DNS names, policy doc, route-table associations) is not
// pulled into this view; the lane exists to make the egress path
// visible, not to replace the endpoint inspector.
export interface VPCEndpointNode {
  id: string;            // vpce-xxxxxxxx
  name: string;
  shortName: string;
  vpcId: string | null;
  serviceName: string | null;     // com.amazonaws.<region>.<service>
  serviceShort: string;            // "S3", "DynamoDB", "EC2" — derived
  endpointType: 'Gateway' | 'Interface' | null;
}

// Chip item 10: explicit InternetGateway / NATGateway / Egress-only IGW
// rendering in the EGRESS lane. Previously the map showed IGW only
// implicitly (Subnet "Public" amber badge) — operators could read
// "this subnet has an IGW route" but couldn't see *which* IGW or how
// many. Per memory `project_pilot_decommissioned_2026_05_19` IGW typed
// labels were fixed 2026-05-19, so :InternetGateway label-keyed
// queries now resolve both production IGWs in alon-prod.
//
// kind discriminates the icon + chip palette; `kindLabel` is the
// operator-facing short name shown beneath the icon ("IGW", "NAT GW",
// "Egress-only IGW", "Transit GW").
export interface EgressGatewayNode {
  id: string;            // igw-xxxxxxxx / nat-xxxxxxxx / vpce-xxxxxxxx / etc.
  name: string;
  shortName: string;
  vpcId: string | null;
  // VPCEndpoint added 2026-05-29: gateway VPCEs (S3, DynamoDB) are
  // egress gateways too — AWS most-specific-route sends service-specific
  // traffic through them instead of via IGW. Surfacing them in the same
  // lane as IGW lets the operator see "S3 reads go via VPCE; everything
  // else via IGW" at a glance. Path-scoped on the backend (only the VPCE
  // whose service matches the path's target jewel surfaces).
  kind: 'InternetGateway' | 'NATGateway' | 'EgressOnlyInternetGateway' | 'TransitGateway' | 'VPCEndpoint';
  kindLabel: string;     // "IGW" | "NAT GW" | "Egress-only IGW" | "Transit GW" | "VPCE"
  // Optional service hint (e.g. "s3", "dynamodb") for VPCEndpoint kinds.
  // Lets the lane chip distinguish "VPCE · s3" vs "VPCE · dynamodb" when
  // multiple gateway endpoints attach to the same RT.
  serviceHint?: string;
  // Route provenance (2026-05-30) — when populated, the chip displays
  // "via 0.0.0.0/0" for IGW/NAT default routes or
  // "via com.amazonaws.eu-west-1.s3" for Gateway VPCEs. Backend emits
  // these so the canvas can show the AUTHORITATIVE path (subnet's
  // route table actually points here) vs the wrong-sibling-IGW that
  // just happens to live in the same VPC.
  routed?: boolean;
  routeDestinationCidr?: string | null;
  routeTargetService?: string | null;
}

// EXFIL view: items in the named EGRESS GATE lane (between IDENTITY and
// RESOURCES). Includes virtual gates (AWS service plane, S3 CRR rule,
// snapshot share, log subscription) that have no AWS resource backing
// them — these are the gates the design called out as "must be named,
// not hidden behind 'service plane · not tracked' in the destination".
// Border color is driven by gateStrength so the operator can scan-
// distinguish controllable gates (emerald) from unobservable ones
// (amber). The `hint` string is a one-line description of what control
// the gate is enforced by (e.g. "IAM policy + VPC Endpoint policy").
export interface ExfilGateNode {
  id: string;
  kind:
    | 'AWSServicePlane'
    | 'VPCEndpoint'
    | 'NATGateway'
    | 'InternetGateway'
    | 'CRRRule'
    | 'SnapshotShare'
    | 'SNSTopic'
    | 'CWLogsSubscription';
  kindLabel: string;     // "Service plane" | "VPC Endpoint" | etc.
  name: string;
  shortName: string;
  gateStrength: 'strong' | 'weak_observable' | 'weak_unobservable';
  /** One-liner — what control the gate is enforced by, if any. */
  hint?: string;
}

// Subnet posture for the SUBNETS column on the Path Flow Map.
// `isPublic` semantics:
//   true  → effective route table has a route to an IGW (per AWS canonical
//           definition). Renders amber "Public".
//   false → effective route table has no IGW route. Renders emerald "Private".
//   null  → no Subnet.public set in Neo4j (subnet_visibility_collector hasn't
//           classified it, or the workload's IN_SUBNET edge resolves to a
//           non-:Subnet duplicate). Renders slate "Unknown".
// Source: backend `subnet_is_public` field on the Subnet path node (see
// commits a400f79 + 639579c).
export interface SubnetNode {
  id: string;
  name: string;
  shortName: string;
  isPublic: boolean | null;
  vpcId?: string;
  /** Availability zone (e.g. eu-west-1b) — from graph key_properties.availability_zone */
  availabilityZone?: string;
  /** Subnet CIDR block — from graph key_properties.cidr_block */
  cidrBlock?: string;
  // Compute node ids that live in this subnet (via IN_SUBNET edges).
  // Lets the connection-line renderer draw compute→subnet edges so the
  // path reads "EC2 → Subnet → SG → NACL → IAM" visually.
  connectedComputeIds: string[];
  /** Effective route table for this subnet — chip on the subnet card
   *  carrying the "Allowed − Actual = Blast Radius" closure narrative
   *  onto the network plane. Sourced from the backend's RouteTable
   *  enrichment join (graph-view feat: join RouteTable into Subnet). */
  routeTableId?: string;
  routeTableCount?: number;
  routeTableIsMain?: boolean;
}

export interface SystemArchitecture {
  computeServices: ServiceNode[];
  /** Principals (AWSPrincipal, CloudTrailPrincipal, IAMUser, root). The
   *  actor making the API call. Rendered in a dedicated leftmost lane,
   *  not in Compute — operators correctly read Compute as "EC2 / Lambda
   *  / ECS workloads" and conflating it with API callers caused
   *  visual misclassification (e.g. `root` rendering as a Compute card
   *  on the SafeRemediate-Test-App-2 → S3 chain). Optional for back-
   *  compat with consumers that don't render the lane yet. */
  principals?: ServiceNode[];
  /** ENTRY lane (Phase 2 — 2026-05-25): explicit attacker-entry-point
   *  nodes. Surfaces the question "how does the attacker reach the
   *  workload?" before the chain proceeds. Includes network entry
   *  (Internet → IGW / ALB / NLB / APIGateway) and identity entry
   *  (root / IAMUser / federated principals). Optional for back-compat;
   *  the lane is hidden when empty so paths without a meaningful
   *  entry-point (e.g. internal lateral movement) don't grow a dead
   *  column. Cards carry `data-entry-id` for ConnectionLinesSVG. */
  entryPoints?: ServiceNode[];
  /** Override the ENTRY lane header text. Defaults to "Entry" which
   *  reads correctly for the per-path / attacker views (where the
   *  lane represents the attacker's entry point — Internet / IGW /
   *  IAMUser / federated principal). The EXFIL view passes "Source"
   *  because in that direction-inverted view the lane card IS the
   *  jewel itself (the data origin), not an attacker. Optional for
   *  back-compat. */
  entryLaneLabel?: string;
  /** What data the totalBytes / totalConnections counters were derived
   *  from. Drives label honesty in the inner canvas header:
   *    "vpc_flow_logs" (default) → "Traffic" + "Connections" (real
   *      TCP/UDP bytes + connection count from VPC Flow Logs).
   *    "cloudtrail"              → "Bytes" hidden (CloudTrail
   *      doesn't carry payload size; rendering "0 B Traffic"
   *      reads as "we saw no traffic" instead of the truth: "this
   *      data source can't tell us bytes"). Connection label
   *      becomes "API calls" (the counter is hit_count, not a
   *      TCP connection count).
   *  Optional; back-compat default is "vpc_flow_logs". */
  metricsBasis?: "vpc_flow_logs" | "cloudtrail";
  resources: ServiceNode[];
  subnets: SubnetNode[];
  securityGroups: SecurityCheckpoint[];
  nacls: SecurityCheckpoint[];
  iamRoles: SecurityCheckpoint[];
  /** InstanceProfile is AWS's "binding object" between an EC2 instance
   *  and an IAM role. Semantically distinct from a role — having three
   *  cards labeled "IAM Roles" when one is a role, one is the profile
   *  that binds it to EC2, and one is the attached policy is a count
   *  bug + a semantic bug. Kept optional so consumers that haven't
   *  updated still compile (they'll just not show the dedicated lane).
   *  Added 2026-05-22 to fix the "IAM ROLES (3)" miscount on the
   *  Attacker view. */
  instanceProfiles?: SecurityCheckpoint[];
  /** IAMPolicy nodes are the actual permission grants — the docstring
   *  finding the operator must see (e.g. S3OverPermissiveAccess on
   *  alon-prod). Previously rendered with a 📜 emoji prefix into the
   *  iamRoles bucket; now its own first-class array. Kept optional
   *  for back-compat. */
  iamPolicies?: SecurityCheckpoint[];
  vpcEndpoints: VPCEndpointNode[];
  /** Chip item 10: explicit IGW / NAT / Egress-only IGW / Transit GW
   * nodes for the EGRESS lane. Filtered to gateways attached to a VPC
   * that contains at least one compute on the current path. */
  egressGateways: EgressGatewayNode[];
  /** Optional API CALLS lane data — 2026-05-27. Surfaces the
   *  per-action breakdown of ACTUAL_API_CALL edges for the selected
   *  path's role. Populated by EXFIL view from stack_components.
   *  api_calls; absent on other consumers (sidebar falls back to
   *  regex-filtering resources). */
  apiCalls?: ServiceNode[];
  /** EXFIL view (2026-05-25): named EGRESS GATE lane that sits
   *  between IDENTITY and RESOURCES per the 5-stage exfil model
   *  (CJ → Reader → Handler → Gate → Destination). Unlike
   *  `egressGateways` which is filtered to real AWS gateway resources
   *  (IGW/NAT/etc), this lane includes VIRTUAL gates that have no
   *  AWS resource backing them — the "AWS service plane" for serverless
   *  paths, "S3 CRR rule" for replication paths, "Snapshot share + KMS
   *  grant" for share paths. The lane only renders when populated, so
   *  attacker / per-path / system-map views (which don't set it) keep
   *  their existing layout. Each gate carries a `gateStrength` for the
   *  color of its border (strong=emerald, weak_observable=blue,
   *  weak_unobservable=amber). */
  exfilGate?: ExfilGateNode[];
  flows: TrafficFlow[];
  /** EXPLICIT EDGES (2026-05-25) — when set, ConnectionLinesSVG draws
   *  one SVG line per entry, 1:1 with the data. Each edge carries its
   *  conceptual plane (identity / network / data) so colors stay
   *  honest and a single observed call can't be drawn as if it
   *  serially traversed Role AND IGW on one line. When `edges` is
   *  populated, the legacy `flows[]` synthesis is bypassed entirely
   *  — callers that have been migrated provide edges and leave flows
   *  empty (or for compat). The legacy path remains for unmigrated
   *  callers (System Map, exfil-view, attacker-view-v3, etc.). */
  edges?: CanvasEdge[];
  totalBytes: number;
  totalConnections: number;
  totalGaps: number;
  vpcGroups?: Array<{ vpcId: string; vpcName: string; cidrBlock?: string; subnets: Array<{ subnetId: string; subnetName: string; isPublic: boolean; nodeIds: string[] }> }>;
  /** AWS region (e.g. eu-west-1) — inferred from node ARNs in the graph */
  region?: string;
  /** EXFIL view authoritative VPC posture for the selected path's
   *  workload(s). Resolved on the backend by direct RUNS_IN_VPC /
   *  IN_SUBNET / SECURED_BY traversal. Drives the evidence-backed
   *  "No Network Controls" banner — previously the banner fired from
   *  "all 4 arrays empty" which was ambiguous between "verified non-
   *  VPC workload" and "this view didn't query network data."
   *  When present, the banner becomes:
   *    is_vpc_attached === false → real finding, evidence-cited
   *    is_vpc_attached === true  → suppressed, render real subnets/SGs
   *  When undefined/null → no banner (we didn't query). */
  workloadNetwork?: {
    is_vpc_attached: boolean;
    vpc_id: string | null;
    vpc_name: string | null;
    evidence: string;
    workload_count_queried: number;
    workload_count_in_sample: number;
  } | null;
  // V2-3 (2026-05-31): set of CanvasEdge.id values that belong to the
  // on-path chain. Computed at synthesis time from the same path /
  // lateral distinction the backend already returns (path edges
  // populated from `path.edges`; lateral edges populated from
  // `graph.laterals_by_node`). Pure passthrough — no FE inference,
  // matches the attack-canvas invariant. Optional for back-compat
  // with consumers that don't compute it (TFM falls back to "treat
  // all edges as path" when undefined — same as legacy behavior).
  onPathEdgeIds?: Set<string>;
  // V2-3: same idea for nodes — the set of ServiceNode/SecurityCheckpoint
  // ids that are on the chain (vs lateral pivots). Drives lateral
  // dimming on the node cards. Optional; legacy callers undefined.
  onPathNodeIds?: Set<string>;
  // Attack-path dominance (2026-06-11 design review). Set ONLY by
  // applyPathFilter when a TrafficFlowMapPathFilter is active — its
  // presence is the renderer's gate for the "one dominant path color,
  // everything else fades" treatment, so non-pathFilter consumers
  // (full System Map, Topology, EXFIL) are untouched.
  //   pathStepByNodeId: nodeId → 1-based step number along the path
  //     (1 = entry, N = crown jewel), from pathFilter.pathNodes order.
  //   pathEdgePairKeys: "src->tgt" + reverse keys for every
  //     pathFilter.pathEdges entry, so edge dominance can match the
  //     path's explicit edges as well as node-pair containment.
  pathStepByNodeId?: Map<string, number>;
  pathEdgePairKeys?: Set<string>;
}

// Attack Path types
interface AttackPathNode {
  id: string;
  name: string;
  type: string;
  is_internet_exposed: boolean;
  cve_count: number;
  critical_cves: number;
  high_cves: number;
}

interface AttackPath {
  id: string;
  nodes: AttackPathNode[];
  edges: { source: string; target: string; relationship_type: string }[];
  risk_score: number;
  path_length: number;
  source_type: string;
  target_type: string;
  target_name: string;
  total_cves: number;
  critical_cves: number;
  evidence_type: string;
  path_kind?: string;
}

// ============================================
// NODE CONFIGURATION
// ============================================
const NODE_CONFIG: Record<NodeType, { icon: typeof Globe; color: string; bg: string; border: string; text: string }> = {
  internet: { icon: Globe, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'Internet' },
  compute: { icon: Server, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'EC2' },
  database: { icon: Database, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-violet-500/20', border: 'border-purple-500/50', text: 'RDS' },
  storage: { icon: HardDrive, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'S3' },
  lambda: { icon: Zap, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-orange-500/20', border: 'border-amber-500/50', text: 'Lambda' },
  api_gateway: { icon: Network, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-violet-500/20', border: 'border-indigo-500/50', text: 'API GW' },
  load_balancer: { icon: Network, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'ALB' },
  dynamodb: { icon: Database, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'DynamoDB' },
  sqs: { icon: Network, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/20', border: 'border-rose-500/50', text: 'SQS' },
  sns: { icon: Network, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/20', border: 'border-violet-500/50', text: 'SNS' },
  iam_role: { icon: Key, color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-500/20', border: 'border-pink-500/50', text: 'IAM' },
  instance_profile: { icon: Layers, color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'Profile' },
  security_group: { icon: Shield, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'SG' },
  nacl: { icon: Lock, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'NACL' },
  api_call: { icon: Zap, color: 'text-lime-600 dark:text-lime-400', bg: 'bg-lime-500/20', border: 'border-lime-500/50', text: 'API' },
  network: { icon: Network, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', text: 'Network' },
  principal: { icon: Target, color: 'text-cyan-700 dark:text-cyan-300', bg: 'bg-cyan-500/20', border: 'border-cyan-400/50', text: 'Principal' },
  vpc_endpoint: { icon: Network, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-500/20', border: 'border-teal-500/50', text: 'VPCE' },
};

// ============================================
// HELPER FUNCTIONS
// ============================================
function nameFromArn(arn: string | undefined | null): string | null {
  if (!arn) return null;
  const parts = arn.split(':');
  if (parts.length < 6) return null;
  const resourcePart = parts.slice(5).join(':');
  const name = resourcePart.split('/').pop() || resourcePart.split(':').pop() || resourcePart;
  return name || null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Relative-time formatter for forensic provenance display.
// Used by the hover detail panel to render edge timestamps as
// "3h ago" / "2d ago" / "May 8" depending on age. Real data only —
// returns "—" for null/undefined/invalid input so the operator
// sees the missing-data signal honestly rather than a "0s ago"
// fabrication.
//
// 2026-05-28 — Phase 2 V1 slice 2 (temporal-intelligence
// surfacing). No mock data, no synthesized fallback.
function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const deltaMs = Date.now() - t;
  if (deltaMs < 0) return 'just now';
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  // Beyond 30 days: surface a calendar date so the operator sees
  // the staleness clearly (no compressed "2mo ago" — Cyntro's
  // freshness story is precise, not approximate).
  try {
    return new Date(t).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: deltaMs > 365 * 24 * 3600 * 1000 ? 'numeric' : undefined,
    });
  } catch {
    return new Date(t).toISOString().slice(0, 10);
  }
}

function shortName(name: string, maxLen = 18): string {
  // 2026-05-30 — removed customer/demo prefix replacements
  // (SafeRemediate-Test-, cyntro-demo-, hardcoded account 745783559495,
  // hardcoded region eu-west-1). They only shortened the demo data and
  // silently no-op'd for every other customer.
  //
  // Service-agnostic substitutions only:
  //   1. Generic ARN prefix strip (matches any service + account +
  //      region + resource type) — preserves the resource id tail.
  //   2. Slash-path tail extraction (matches AWS ARN sub-paths like
  //      `role/foo` → `foo`).
  //   3. Length-based truncation as the final fallback.
  let short = name
    // arn:aws:<service>:<region>:<account>:<resource-type>/<resource-id>
    // or                                  :<resource-type>:<resource-id>
    .replace(/^arn:aws:[^:]+:[^:]*:[^:]*:[^:/]+[:/]/, '')
    // arn:aws:s3:::<bucket-name>
    .replace(/^arn:aws:s3:::/, '')
    // arn:aws:<service>:<region>:<account>:<resource-id> (no type prefix)
    .replace(/^arn:aws:[^:]+:[^:]*:[^:]*:/, '');

  if (short.includes('/')) short = short.split('/').pop() || short;
  if (short.length > maxLen) short = short.substring(0, maxLen) + '...';
  return short;
}

function mapNodeType(type: string): NodeType {
  const t = type.toLowerCase();
  if (t === 'ec2' || t === 'ec2instance') return 'compute';
  if (t === 'lambdafunction' || t === 'lambda') return 'lambda';
  if (t === 'rdsinstance' || t === 'rds' || t.includes('database')) return 'database';
  if (t === 's3bucket' || t === 's3' || t.includes('bucket')) return 'storage';
  if (t.includes('dynamodb')) return 'dynamodb';
  if (t.includes('sqs')) return 'sqs';
  if (t.includes('sns')) return 'sns';
  if (t.includes('alb') || t.includes('elb') || t.includes('loadbalancer')) return 'load_balancer';
  if (t.includes('apigateway')) return 'api_gateway';
  if (t === 'iamrole' || t === 'iam_role') return 'iam_role';
  if (t === 'instanceprofile' || t === 'instance_profile' || t.includes('instanceprofile')) return 'instance_profile';
  if (t === 'securitygroup' || t === 'security_group') return 'security_group';
  if (t === 'vpcendpoint' || t === 'vpc_endpoint') return 'vpc_endpoint';
  return 'network';
}

// Pretty-print an AWS service endpoint name. Gateway endpoints carry the
// canonical "com.amazonaws.<region>.<service>" form; Interface endpoints
// the same. We want the "S3" / "DynamoDB" suffix as a compact chip label
// so operators can read the lane at a glance — full name lives in the
// tooltip.
function vpceServiceShort(serviceName: string | null | undefined): string {
  if (!serviceName) return '?';
  const m = serviceName.match(/com\.amazonaws\.[^.]+\.(.+)$/);
  const tail = (m ? m[1] : serviceName).split('.').pop() || serviceName;
  if (tail === 's3') return 'S3';
  if (tail === 'dynamodb') return 'DynamoDB';
  if (tail === 'sqs') return 'SQS';
  if (tail === 'sns') return 'SNS';
  if (tail === 'ec2') return 'EC2';
  if (tail === 'sts') return 'STS';
  if (tail === 'kms') return 'KMS';
  return tail.toUpperCase();
}

// ============================================
// SERVICE NODE COMPONENT
// ============================================
// chunk #1.5: optional exfil-risk summary that compute nodes render
// as a tier-coded chip in the bottom-right corner. Provided by the
// attack-paths parent via TrafficFlowMap's exfilByWorkloadId prop.
// Topology tab passes nothing → no behavior change there.
export interface NodeExfilSummary {
  tier: 'high' | 'medium' | 'low' | 'none';
  unknown_ip: number;
  internet: number;
  cloud_service: number;
  saas: number;
  cross_system: number;
  total_bytes_out: number;
  strong_observations: number;
}

const EXFIL_CHIP_THEME: Record<NodeExfilSummary['tier'], { label: string; bg: string; border: string; text: string; ring: string; tooltip: string }> = {
  high: {
    label: 'HIGH',
    bg: 'rgba(239,68,68,0.15)',
    border: 'rgba(239,68,68,0.6)',
    text: 'var(--canvas-danger)',
    ring: 'ring-2 ring-red-500/40',
    tooltip: 'High exfil risk — heavy unknown-IP traffic and/or strong observation. Click the node to see the External Egress Inventory for this workload.',
  },
  medium: {
    label: 'MED',
    bg: 'rgba(245,158,11,0.15)',
    border: 'rgba(245,158,11,0.55)',
    text: 'var(--canvas-capable)',
    ring: '',
    tooltip: 'Moderate exfil risk — internet/SaaS activity needs review.',
  },
  low: {
    label: 'LOW',
    bg: 'rgba(148,163,184,0.15)',
    border: 'rgba(148,163,184,0.45)',
    text: 'var(--color-foreground)',
    ring: '',
    tooltip: 'Low exfil risk — mostly cloud-service traffic (expected AWS endpoints).',
  },
  none: {
    label: 'NONE',
    bg: 'rgba(71,85,105,0.12)',
    border: 'rgba(71,85,105,0.4)',
    text: 'var(--color-muted-foreground)',
    ring: '',
    tooltip: 'No external egress observed.',
  },
};

function formatBytesShort(n: number): string {
  if (!n) return '0 B';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}KB`;
  return `${n}B`;
}

export function ServiceNodeBox({
  node,
  position,
  flowInfo,
  isHighlighted,
  onHover,
  onClick,
  exfilSummary,
  spineMode = false,
}: {
  node: ServiceNode;
  position: 'left' | 'right';
  flowInfo?: { bytes: number; connections: number; ports: string[] };
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  onClick?: () => void;
  exfilSummary?: NodeExfilSummary | null;
  // 2026-06-11 — 3-color map discipline. True when the parent diagram
  // renders an attack-path spine (architecture.pathStepByNodeId set).
  // Neutralizes the per-category hue (NODE_CONFIG color/bg/border) so
  // only risk (red/orange), safe (green) and neutral gray remain on
  // the canvas, and collapses secondary rows (instance id, ENI chips)
  // behind the existing hover mechanism. Optional + default false —
  // every other consumer (System Map, EXFIL, egress map, identity
  // attack-path viz) renders exactly as before.
  spineMode?: boolean;
}) {
  const config = NODE_CONFIG[node.type] || NODE_CONFIG.compute;
  const Icon = config.icon;
  // 2026-06-11 rebalance: icon color = category IDENTITY, it stays in
  // spine mode (founder feedback: full neutralization read as dead).
  // Card-bg tints stay neutral (bg-card) — only the icon chip + label
  // keep their hue; hover highlight stays a neutral accent.
  const iconBoxCls = config.bg;
  const iconCls = config.color;
  const labelCls = config.color;
  const highlightedCls = spineMode
    ? 'bg-accent border-border shadow-md scale-105'
    : `${config.bg} ${config.border} shadow-md scale-105`;
  // Secondary detail rows show by default; in spine mode they appear
  // only while the card is hovered/highlighted (Connection Details +
  // click drill-down still carry the full story).
  const showDetail = !spineMode || isHighlighted;

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200
        ${onClick ? "cursor-pointer" : "cursor-default"}
        ${isHighlighted ? highlightedCls : 'bg-card border-border hover:border-primary/40'}
        ${position === 'left' ? 'pr-6' : 'pl-6'}`}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      <div className={`w-11 h-11 rounded-lg ${iconBoxCls} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${iconCls}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-foreground truncate">{node.shortName}</div>
        {node.instanceId && showDetail && (
          <div className="text-[10px] text-muted-foreground font-mono">{node.instanceId}</div>
        )}
        <div className={`text-[10px] ${labelCls} uppercase tracking-wider`}>{config.text}</div>
        {/* ENI chips — attached NetworkInterface(s) folded onto the
            workload card so the SG-ENI-EC2 binding is visible
            without taking up a separate Compute row. Compact chip
            list; full ENI detail lives in the workload drill-down. */}
        {showDetail && node.enis && node.enis.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {node.enis.map((eni) => (
              <span
                key={eni.id}
                data-eni-id={eni.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-mono text-foreground"
                title={`Attached ENI: ${eni.name}`}
              >
                <Network className="w-2.5 h-2.5 text-muted-foreground" />
                <span className="truncate max-w-[100px]">{eni.shortName}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Live traffic indicator */}
      {flowInfo && flowInfo.bytes > 0 && (
        <div className="absolute -top-2 -right-2 flex items-center gap-1 px-2 py-0.5 bg-emerald-500 rounded-full shadow-lg">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-white">{formatBytes(flowInfo.bytes)}</span>
        </div>
      )}

      {/* Exfil chip — chunk #1.5. Renders on compute nodes when the
          attack-paths parent has supplied a per-workload summary.
          Topology tab passes nothing, so this chip is suppressed
          there. The chip is the operator's at-a-glance signal for
          "this workload talks to the outside world". */}
      {exfilSummary && exfilSummary.tier !== 'none' && (() => {
        const theme = EXFIL_CHIP_THEME[exfilSummary.tier];
        const totalExt =
          exfilSummary.unknown_ip +
          exfilSummary.internet +
          exfilSummary.saas +
          exfilSummary.cross_system +
          exfilSummary.cloud_service;
        return (
          <div
            className={`absolute -bottom-2 -right-2 flex items-center gap-1 px-2 py-0.5 rounded-full border shadow-lg ${theme.ring}`}
            style={{ background: theme.bg, borderColor: theme.border }}
            title={`${theme.tooltip}\n\nExternal destinations: ${totalExt.toLocaleString()}\nUnknown IPs: ${exfilSummary.unknown_ip.toLocaleString()}\nBytes out (30d): ${formatBytesShort(exfilSummary.total_bytes_out)}`}
          >
            <span
              className="text-[8px] font-semibold tracking-wider uppercase"
              style={{ color: theme.text }}
            >
              ↗ {theme.label}
            </span>
            <span className="text-[10px] font-semibold text-foreground">
              {totalExt.toLocaleString()}
            </span>
            {exfilSummary.unknown_ip > 0 && (
              <span className="text-[10px] font-semibold text-red-700 dark:text-red-200">
                · {exfilSummary.unknown_ip.toLocaleString()}?
              </span>
            )}
          </div>
        );
      })()}

      {/* Connection point */}
      <div className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-colors
        ${isHighlighted ? 'bg-emerald-500' : 'bg-muted-foreground/40'} border-2 border-border
        ${position === 'left' ? '-right-1.5' : '-left-1.5'}`} />
    </div>
  );
}

// ============================================
// RULE ROW COMPONENT
// ============================================
function RuleRow({ rule }: { rule: SGRule }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'used': return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400', label: 'USED', icon: '✓' };
      case 'unused': return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-600 dark:text-red-400', label: 'UNUSED', icon: '✗' };
      case 'unobserved': return { bg: 'bg-orange-500/10', border: 'border-amber-500/30', text: 'text-amber-600 dark:text-amber-400', label: 'GAP', icon: '?' };
      default: return { bg: 'bg-muted/50', border: 'border-border', text: 'text-muted-foreground', label: 'NO DATA', icon: '—' };
    }
  };

  // Clean up port display - avoid "TCP/TCP/80" redundancy
  const formatPortDisplay = () => {
    const protocol = rule.protocol?.toUpperCase() || 'TCP';
    let portStr = rule.portDisplay || '';

    // Remove redundant protocol prefix if portDisplay already contains it
    if (portStr.toUpperCase().startsWith(protocol + '/')) {
      portStr = portStr.slice(protocol.length + 1);
    }
    if (portStr.toUpperCase().startsWith('TCP/') || portStr.toUpperCase().startsWith('UDP/')) {
      portStr = portStr.slice(4);
    }

    // Handle port ranges
    if (rule.fromPort !== null && rule.toPort !== null) {
      if (rule.fromPort === rule.toPort) {
        portStr = String(rule.fromPort);
      } else if (rule.fromPort === 0 && rule.toPort === 65535) {
        portStr = 'All';
      } else {
        portStr = `${rule.fromPort}-${rule.toPort}`;
      }
    }

    return portStr || 'All';
  };

  // Format source/destination for display
  const formatSource = () => {
    const src = rule.source || '';
    if (src === '0.0.0.0/0') return 'Any (0.0.0.0/0)';
    if (src === '::/0') return 'Any IPv6';
    if (src.startsWith('sg-')) return src.slice(0, 15) + '...';
    if (src.startsWith('pl-')) return 'Prefix List';
    // For CIDR, show shortened version
    if (src.includes('/')) {
      const [ip, mask] = src.split('/');
      if (ip.length > 12) return ip.slice(0, 10) + '.../' + mask;
    }
    return src.length > 15 ? src.slice(0, 12) + '...' : src;
  };

  const statusStyle = getStatusColor(rule.status);
  const isUsed = rule.status === 'used';
  const protocol = rule.protocol?.toUpperCase() || 'TCP';
  const port = formatPortDisplay();

  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs ${statusStyle.bg} border ${statusStyle.border} mb-1`}>
      {/* Protocol & Port */}
      <div className="flex items-center gap-1.5 min-w-[70px]">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
          protocol === 'TCP' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
          protocol === 'UDP' ? 'bg-violet-500/20 text-purple-600 dark:text-purple-400' :
          protocol === 'ICMP' ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400' :
          'bg-muted text-muted-foreground'
        }`}>
          {protocol}
        </span>
        <span className="font-mono text-foreground font-medium">:{port}</span>
      </div>

      {/* Arrow */}
      <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />

      {/* Source/Destination */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {rule.isPublic && (
          <span className="text-[8px] px-1.5 py-0.5 bg-red-500/30 text-red-700 dark:text-red-300 rounded font-semibold flex-shrink-0">
            PUBLIC
          </span>
        )}
        <span className="font-mono text-foreground text-[10px] truncate" title={rule.source}>
          {formatSource()}
        </span>
      </div>

      {/* Traffic info */}
      {rule.flowCount > 0 && (
        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex-shrink-0">
          {rule.flowCount} hits
        </span>
      )}

      {/* Status badge */}
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
        {statusStyle.label}
      </span>
    </div>
  );
}

// ============================================
// SECURITY GROUP PANEL
// ============================================
export function SecurityGroupPanel({
  sg,
  isExpanded,
  onToggle,
  isHighlighted,
  onHover,
  onDetails,
  spineMode = false,
}: {
  sg: SecurityCheckpoint;
  isExpanded: boolean;
  onToggle: () => void;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  onDetails?: () => void;
  // 2026-06-11 — 3-color discipline + detail collapse in spine mode.
  // SG orange demotes to neutral gray; risk signals (red PUBLIC,
  // amber gap ring) keep their color. Default card = name + rule
  // count + risk chips; in/out counts and attachment chips show on
  // hover. Optional — non-spine consumers unchanged.
  spineMode?: boolean;
}) {
  const hasGap = sg.gapCount > 0;

  // Calculate rule stats
  const inboundRules = sg.rules?.filter(r => r.direction === 'ingress') || [];
  const outboundRules = sg.rules?.filter(r => r.direction === 'egress') || [];
  const publicRules = sg.rules?.filter(r => r.isPublic) || [];
  const usedRules = sg.rules?.filter(r => r.status === 'used') || [];
  const unusedRules = sg.rules?.filter(r => r.status === 'unused') || [];
  // 2026-05-25 user feedback: hasPublicIngress flag on the SG node is
  // authoritative even when rules[] is empty (lateral SGs only carry
  // counts + flags, not raw rules). Fall back to the flag so e.g. a
  // DB SG with public ingress still surfaces the red badge.
  const hasPublicAccess = publicRules.length > 0 || sg.hasPublicIngress === true;
  // 2026-05-26 user feedback: when an SG isn't on the current path
  // (lateral surface — in the same VPC but no SECURED_BY edge to the
  // path's compute), dim the chip and show a "LATERAL" badge so the
  // operator reads at a glance which SG is the gate vs which are
  // pivot opportunities. onPath===undefined treats as on-path
  // (back-compat for callers that don't supply the signal yet).
  const isLateral = sg.onPath === false;
  // Spine mode: secondary chips (in/out split, attachment, lateral
  // badge) appear on hover only; PUBLIC + rule count stay (risk +
  // the one key metric). Category orange demotes to neutral.
  const showDetail = !spineMode || isHighlighted;

  return (
    <div
      className={`relative rounded-xl border-2 transition-all duration-200 overflow-hidden
        ${isHighlighted ? (spineMode ? 'bg-accent border-border shadow-md' : 'bg-orange-500/20 border-orange-500/50 shadow-md') : 'bg-card border-border'}
        ${hasGap ? 'ring-2 ring-amber-400/50' : ''}
        ${hasPublicAccess ? 'ring-2 ring-red-400/30' : ''}
        ${isLateral ? 'opacity-50' : ''}`}
      onMouseEnter={() => onHover(sg.id)}
      onMouseLeave={() => onHover(null)}
      onDoubleClick={onDetails}
      title={isLateral
        ? "Lateral SG — in the same VPC as the path's compute but no SECURED_BY edge from the path's workload. Pivot surface, not a gate on this chain."
        : undefined}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent"
        onClick={onToggle}
      >
        {/* 2026-06-11 rebalance: SG orange icon = identity, kept in spine
            mode; red still wins when the SG has public ingress. */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          hasPublicAccess ? 'bg-red-500/20' : 'bg-orange-500/20'
        }`}>
          <Shield className={`w-5 h-5 ${hasPublicAccess ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{sg.shortName}</div>
          <div className="flex items-center gap-2 text-[10px] flex-wrap">
            <span className="text-muted-foreground">
              {sg.totalCount} rules
            </span>
            {showDetail && inboundRules.length > 0 && (
              <span className="text-blue-600 dark:text-blue-400">↓{inboundRules.length} in</span>
            )}
            {showDetail && outboundRules.length > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">↑{outboundRules.length} out</span>
            )}
            {hasPublicAccess && (
              <span
                className="px-1.5 py-0.5 bg-red-500/20 text-red-600 dark:text-red-400 rounded text-[10px] font-semibold"
                title="Security Group accepts inbound traffic from 0.0.0.0/0 — verified by has_public_ingress on the SecurityGroup node"
              >
                {publicRules.length > 0 ? `${publicRules.length} PUBLIC` : "PUBLIC"}
              </span>
            )}
            {showDetail && isLateral && (
              <span
                className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[10px] font-semibold uppercase tracking-wider"
                title="Lateral SG — not attached to the path's workload. Pivot surface only."
              >
                Lateral
              </span>
            )}
            {showDetail && sg.attachedWorkloads && sg.attachedWorkloads.length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${spineMode ? 'bg-muted text-muted-foreground' : 'bg-orange-500/15 text-orange-700 dark:text-orange-300'}`}
                title={`Attached to: ${sg.attachedWorkloads.join(", ")}`}
              >
                on {sg.attachedWorkloads.length === 1
                  ? sg.attachedWorkloads[0]
                  : `${sg.attachedWorkloads.length} workloads`}
              </span>
            )}
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* Expanded rules */}
      {isExpanded && sg.rules && (
        <div className="border-t border-border p-3 space-y-3 max-h-[400px] overflow-y-auto">
          {/* Quick Stats */}
          {sg.rules.length > 0 && (
            <div className="flex gap-2 pb-2 border-b border-border">
              {usedRules.length > 0 && (
                <span className="text-[10px] px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded">
                  {usedRules.length} used
                </span>
              )}
              {unusedRules.length > 0 && (
                <span className="text-[10px] px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded">
                  {unusedRules.length} unused
                </span>
              )}
              {usedRules.length === 0 && unusedRules.length === 0 && (
                <span className="text-[10px] px-2 py-1 bg-muted/50 border border-border text-muted-foreground rounded">
                  No VPC Flow data yet
                </span>
              )}
            </div>
          )}

          {/* Inbound Rules */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ArrowLeft className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                Inbound ({inboundRules.length})
              </span>
            </div>
            {inboundRules.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-2 pl-5">No inbound rules</div>
            ) : (
              <div className="space-y-1">
                {inboundRules.map((rule, i) => (
                  <RuleRow key={`in-${i}`} rule={rule} />
                ))}
              </div>
            )}
          </div>

          {/* Outbound Rules */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Outbound ({outboundRules.length})
              </span>
            </div>
            {outboundRules.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-2 pl-5">No outbound rules</div>
            ) : (
              <div className="space-y-1">
                {outboundRules.map((rule, i) => (
                  <RuleRow key={`out-${i}`} rule={rule} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connection points */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 rounded-full bg-muted-foreground/40 border-2 border-border" />
      <div className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 rounded-full bg-muted-foreground/40 border-2 border-border" />
    </div>
  );
}

// ============================================
// IAM ROLE NODE
// ============================================
// ============================================
// NACL NODE
// ============================================
export function NACLNode({
  nacl,
  isHighlighted,
  onHover,
  onClick,
  spineMode = false,
}: {
  nacl: SecurityCheckpoint;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  onClick?: () => void;
  // 2026-06-11 — 3-color discipline + detail collapse in spine mode.
  // NACL cyan demotes to neutral gray; risk chips (red Default·No
  // filtering, amber denies/high-risk) keep their color. Default
  // card = name + rule count + risk chips; subnet count and VPC-wide
  // context chips show on hover. Optional — non-spine consumers
  // unchanged.
  spineMode?: boolean;
}) {
  const hasGap = nacl.gapCount > 0;
  const blastRadius = nacl.connectedTargets?.length || nacl.connectedSources?.length || 0;
  // Subnets covered by this NACL. Pulled from Neo4j into SecurityCheckpoint
  // via the addAsNACL helper. The "0 affected" label this card used to
  // show was meaningless on chains where the NACL had only allow rules
  // (gapCount=0 by design); the operator's real question is "what does
  // this NACL apply to" — which is rule count + subnet attachment.
  const subnetCount = nacl.subnetCount ?? 0;
  // 2026-05-25 user feedback: surface the collector's authoritative
  // risk flags on the chip. is_default + has_public_inbound_allow on
  // an NACL is the AWS-default "0.0.0.0/0 ALLOW ALL on both directions"
  // posture — high-signal for the operator. has_high_risk wraps both.
  const isDefault = nacl.isDefault === true;
  const hasPublicInbound = nacl.hasPublicInboundAllow === true;
  const hasHighRisk = nacl.hasHighRisk === true;
  // On-path vs lateral. Same treatment as SG: NACLs without an
  // ASSOCIATED_WITH / HAS_NACL edge to a path-node subnet render
  // dimmed + "LATERAL" badged. onPath===undefined treats as
  // on-path (back-compat).
  const isLateral = nacl.onPath === false;
  // 2026-05-26 (Phase 1.6): distinguish VPC-WIDE default NACL from
  // chain-specific high-risk. A default NACL applied to >1 subnet is
  // AWS's catchall — every subnet has it whether attacked or not.
  // Red ring + red badge makes it look like a chain-specific finding;
  // it isn't. Reserve red for genuine chain-specific gaps (high-risk
  // rule on a non-default NACL, or non-default NACL with public allow).
  // Default-public NACLs covering multiple subnets get the slate/blue
  // "VPC-WIDE" treatment — context, not alert.
  const isVpcWideDefault = isDefault && hasPublicInbound && (nacl.subnetCount ?? 0) > 1;
  const ringClass = isVpcWideDefault
    ? "ring-2 ring-border"
    : (isDefault && hasPublicInbound)
      ? "ring-2 ring-red-400/60"
      : hasHighRisk
        ? "ring-2 ring-amber-400/60"
        : hasGap
          ? "ring-2 ring-amber-400/50"
          : "";

  const showDetail = !spineMode || isHighlighted;

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 min-w-[160px]
        ${onClick ? "cursor-pointer" : "cursor-default"}
        ${isHighlighted ? (spineMode ? 'bg-accent border-border shadow-md scale-105' : 'bg-cyan-500/20 border-cyan-500/50 shadow-md scale-105') : 'bg-card border-border hover:border-primary/40'}
        ${ringClass}
        ${isLateral ? 'opacity-50' : ''}`}
      onMouseEnter={() => onHover(nacl.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      title={isLateral
        ? "Lateral NACL — in the same VPC as the path's subnets but no ASSOCIATED_WITH edge to the path. Pivot surface only."
        : undefined}
    >
      {/* 2026-06-11 rebalance: NACL cyan icon = identity, kept in spine mode. */}
      <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
        <Lock className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-foreground truncate">
          {nacl.shortName}
        </div>
        <div className="text-[10px] text-muted-foreground">
          Network ACL
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {/* Rule count — the actionable signal for an attacker view.
              Replaces the old "{blastRadius} affected" label which was
              always 0 on NACLs with only allow rules (no denies =
              gapCount 0). N rules tells the operator what's enforceable
              here. */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${nacl.totalCount > 0 && !spineMode ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300' : 'bg-muted text-muted-foreground'}`}>
            {nacl.totalCount} {nacl.totalCount === 1 ? 'rule' : 'rules'}
          </span>
          {/* Deny count — only when there ARE denies. Coloured amber
              because explicit denies are what catch unintended egress. */}
          {nacl.gapCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-amber-600 dark:text-amber-400">
              {nacl.gapCount} {nacl.gapCount === 1 ? 'deny' : 'denies'}
            </span>
          )}
          {/* Subnet attachment count — shows the NACL's blast surface
              ("this NACL applies to N subnets"). Hidden when 0 (orphan
              NACL — operator should look elsewhere). */}
          {showDetail && subnetCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">
              {subnetCount} {subnetCount === 1 ? 'subnet' : 'subnets'}
            </span>
          )}
          {/* Default NACL handling. AWS default NACL has 0.0.0.0/0
              ALLOW ALL on both inbound and outbound. Two visual cases:
              (a) when it applies to >1 subnet — it's VPC-WIDE context,
                  not a chain-specific finding. Slate "VPC-WIDE
                  DEFAULT" chip + slate ring. Operator reads it as
                  "context: every subnet in this VPC has this NACL".
              (b) when it applies to 1 subnet (rare; e.g. NACL pinned
                  to a single isolated subnet) — chain-specific gap.
                  Red "DEFAULT · NO FILTERING" chip + red ring.
              The audit's "DEFAULT · NO FILTERING in red on the path"
              was case (a) being rendered as case (b). Fixed via
              isVpcWideDefault gate. */}
          {showDetail && isVpcWideDefault && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground border border-border font-semibold uppercase tracking-wider"
              title={`AWS-default NACL applied to all ${nacl.subnetCount} subnets in this VPC. Context, not a chain-specific finding. Every workload in this VPC sees the same NACL.`}
            >
              VPC-wide default
            </span>
          )}
          {isDefault && hasPublicInbound && !isVpcWideDefault && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/25 text-red-700 dark:text-red-300 font-semibold uppercase tracking-wider"
              title="Default NACL with 0.0.0.0/0 ALLOW ALL on inbound + outbound. Pinned to this chain's subnet — no filtering applied."
            >
              Default · No filtering
            </span>
          )}
          {/* High-risk catch-all when NOT a default-public NACL but
              the collector still flagged a high-risk rule (e.g. a
              wide-open custom rule on a non-default NACL). */}
          {hasHighRisk && !(isDefault && hasPublicInbound) && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-700 dark:text-amber-300 font-semibold uppercase tracking-wider"
              title="NACL has a high-risk rule. Verified by has_high_risk on the NetworkACL node."
            >
              High risk
            </span>
          )}
          {showDetail && isLateral && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold uppercase tracking-wider"
              title="Lateral NACL — not associated with the path's subnet. Pivot surface only."
            >
              Lateral
            </span>
          )}
        </div>
      </div>

      {/* Connection points */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 rounded-full bg-muted-foreground/40 border-2 border-border" />
      <div className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 rounded-full bg-muted-foreground/40 border-2 border-border" />
    </div>
  );
}

// ============================================
// LATERAL FAN-OUT — visible lateral surface for an IAM role
// Alon feedback 2026-05-27: previous chips were invisible. Each row
// is now a first-class clickable target. Jewel rows navigate to that
// jewel's EXFIL view. Workload rows surface the full name (drill-in
// deferred — clicking a workload would show its specific path within
// the same view, which requires a per-workload path index that's not
// wired yet).
// ============================================
function LateralFanOut({
  alsoReaches,
  sharedWith,
  assumedBy = [],
  policiesAttached = [],
  actionsUsed = [],
}: {
  alsoReaches: Array<{ id: string; name: string; type: string; hits: number }>;
  sharedWith: Array<{ id: string; name: string; type: string; system_name: string | null }>;
  assumedBy?: Array<{
    id: string;
    session_name: string;
    calls: number;
    last_seen: string | null;
  }>;
  policiesAttached?: Array<{
    name: string;
    attachment_type: string | null;
    is_aws_managed: boolean | null;
  }>;
  actionsUsed?: Array<{ action: string; calls: number }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Best-effort system inference: EXFIL view URL has ?system=...
  // When absent (other consumers of the chip), navigation falls back
  // to a system-less route which renders the jewel selector first.
  const systemName = searchParams?.get("system") ?? null;

  const onJewelClick = useCallback(
    (jewelId: string) => {
      const params = new URLSearchParams();
      if (systemName) params.set("system", systemName);
      params.set("jewel", jewelId);
      params.set("view", "exfil");
      router.push(`/attack-paths-v2?${params.toString()}`);
    },
    [router, systemName],
  );

  const workloadIcon = (t: string) =>
    t === "EC2Instance" ? "EC2" :
    t === "LambdaFunction" ? "λ" :
    t === "IAMUser" ? "User" :
    t === "ECSTask" || t === "ECSService" ? "ECS" :
    t;

  return (
    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border">
      {alsoReaches.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-fuchsia-700 dark:text-fuchsia-300">
              Also reaches
            </span>
            <span className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300/80">
              {alsoReaches.length} {alsoReaches.length === 1 ? "jewel" : "jewels"} — click to inspect
            </span>
          </div>
          {alsoReaches.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onJewelClick(j.id);
              }}
              className="group flex items-center gap-1.5 rounded border border-fuchsia-500/30 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 hover:border-fuchsia-400/60 px-2 py-1 text-left transition-colors cursor-pointer"
              title={`Switch to EXFIL view for ${j.name}`}
            >
              <span className="text-fuchsia-700 dark:text-fuchsia-300 font-bold text-[10px]">→</span>
              <span className="text-[10px] text-foreground font-mono truncate flex-1">
                {j.name}
              </span>
              {j.hits > 0 && (
                <span className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300/90 font-mono tabular-nums shrink-0">
                  {j.hits >= 1000 ? `${(j.hits / 1000).toFixed(0)}K` : String(j.hits)} hits
                </span>
              )}
              <span className="text-[8px] uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300/60 group-hover:text-fuchsia-800 dark:group-hover:text-fuchsia-300 shrink-0 font-semibold">
                Inspect
              </span>
            </button>
          ))}
        </div>
      )}
      {sharedWith.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-300">
              Shared with
            </span>
            <span className="text-[10px] text-amber-700 dark:text-amber-300/80">
              {sharedWith.length} other{" "}
              {sharedWith.length === 1 ? "workload" : "workloads"} — same role, alt foothold
            </span>
          </div>
          {sharedWith.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1"
              title={`${c.type}: ${c.name}${c.system_name ? ` (system: ${c.system_name})` : ""}`}
            >
              <span className="text-[8px] uppercase tracking-wider text-amber-700 dark:text-amber-300 font-semibold shrink-0">
                {workloadIcon(c.type)}
              </span>
              <span className="text-[10px] text-foreground font-mono truncate flex-1">
                {c.name}
              </span>
              {c.system_name && (
                <span className="text-[10px] text-amber-700 dark:text-amber-300/70 truncate max-w-[100px]">
                  {c.system_name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {/* ASSUMED BY — observed sessions that called this role
          (Principal nodes via ACTUAL_API_CALL). Cyan to match the
          sidebar Principals lane. */}
      {assumedBy.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-cyan-700 dark:text-cyan-300">
              Assumed by
            </span>
            <span className="text-[10px] text-cyan-700 dark:text-cyan-300/80">
              {assumedBy.length}{" "}
              {assumedBy.length === 1 ? "session" : "sessions"} observed
            </span>
          </div>
          {assumedBy.slice(0, 4).map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1"
              title={`Session ${s.session_name}${s.last_seen ? ` — last seen ${s.last_seen}` : ""}`}
            >
              <span className="text-[10px] text-foreground font-mono truncate flex-1">
                {s.session_name}
              </span>
              <span className="text-[10px] text-cyan-700 dark:text-cyan-300/90 font-mono tabular-nums shrink-0">
                {s.calls} call{s.calls === 1 ? "" : "s"}
              </span>
            </div>
          ))}
          {assumedBy.length > 4 && (
            <span className="text-[10px] text-cyan-700 dark:text-cyan-300/60 pl-1">
              +{assumedBy.length - 4} more sessions
            </span>
          )}
        </div>
      )}
      {/* POLICIES ATTACHED — managed + inline policies on this role.
          Rose to match the sidebar IAM Policies lane. */}
      {policiesAttached.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-rose-700 dark:text-rose-300">
              Policies attached
            </span>
            <span className="text-[10px] text-rose-700 dark:text-rose-300/80">
              {policiesAttached.length}{" "}
              {policiesAttached.length === 1 ? "policy" : "policies"}
            </span>
          </div>
          {policiesAttached.slice(0, 4).map((p, idx) => (
            <div
              key={`${p.name}:${idx}`}
              className="flex items-center gap-1.5 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1"
              title={`${p.name} (${p.attachment_type ?? "attached"})${p.is_aws_managed ? " · AWS-managed" : ""}`}
            >
              <span className="text-[10px] text-foreground font-mono truncate flex-1">
                {p.name}
              </span>
              {p.attachment_type && (
                <span className="text-[8px] uppercase tracking-wider text-rose-700 dark:text-rose-300/80 shrink-0">
                  {p.attachment_type === "HAS_INLINE_POLICY"
                    ? "inline"
                    : p.is_aws_managed
                      ? "AWS-managed"
                      : "attached"}
                </span>
              )}
            </div>
          ))}
          {policiesAttached.length > 4 && (
            <span className="text-[10px] text-rose-700 dark:text-rose-300/60 pl-1">
              +{policiesAttached.length - 4} more policies
            </span>
          )}
        </div>
      )}
      {/* ACTIONS USED — distinct iam_action observed on
          ACTUAL_API_CALL edges. Lime to match the sidebar API Calls
          lane. Capped at top 6 visible; the rest collapse. */}
      {actionsUsed.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-lime-700 dark:text-lime-300">
              Actions used
            </span>
            <span className="text-[10px] text-lime-700 dark:text-lime-300/80">
              {actionsUsed.length}{" "}
              {actionsUsed.length === 1 ? "distinct action" : "distinct actions"} observed
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {actionsUsed.slice(0, 6).map((a) => (
              <div
                key={a.action}
                className="flex items-center gap-1 rounded border border-lime-500/30 bg-lime-500/10 px-1.5 py-0.5"
                title={`${a.action} — ${a.calls} call${a.calls === 1 ? "" : "s"} observed`}
              >
                <span className="text-[10px] text-foreground font-mono">
                  {a.action}
                </span>
                <span className="text-[10px] text-lime-700 dark:text-lime-300/80 font-mono tabular-nums">
                  ·{a.calls}
                </span>
              </div>
            ))}
            {actionsUsed.length > 6 && (
              <span className="text-[10px] text-lime-700 dark:text-lime-300/60 self-center">
                +{actionsUsed.length - 6}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================
// ROLE COMPACT SUMMARY — 2026-05-27
// Single-line summary line at the bottom of the role chip. Tells the
// operator at a glance "this role has X lateral reach, Y sessions,
// Z policies, N actions observed" and prompts them to click for the
// full breakdown in the side panel. Replaces the prior 5-section
// stacked fan-out that Alon flagged as overwhelming.
// ============================================
function RoleCompactSummary({ role }: { role: SecurityCheckpoint }) {
  const lateralCount =
    (role.alsoReaches?.length ?? 0) + (role.sharedWith?.length ?? 0)
  const sessionsCount = role.assumedBy?.length ?? 0
  const policiesCount = role.policiesAttached?.length ?? 0
  const actionsCount = role.actionsUsed?.length ?? 0

  const facts: Array<{ count: number; label: string; tone: string }> = []
  if (lateralCount > 0)
    facts.push({
      count: lateralCount,
      label: lateralCount === 1 ? "lateral reach" : "lateral reaches",
      tone: "text-fuchsia-700 dark:text-fuchsia-300/90",
    })
  if (sessionsCount > 0)
    facts.push({
      count: sessionsCount,
      label: sessionsCount === 1 ? "session" : "sessions",
      tone: "text-cyan-700 dark:text-cyan-300/90",
    })
  if (policiesCount > 0)
    facts.push({
      count: policiesCount,
      label: policiesCount === 1 ? "policy" : "policies",
      tone: "text-rose-700 dark:text-rose-300/90",
    })
  if (actionsCount > 0)
    facts.push({
      count: actionsCount,
      label: actionsCount === 1 ? "action" : "actions",
      tone: "text-lime-700 dark:text-lime-300/90",
    })

  if (facts.length === 0) return null

  return (
    <div className="mt-2 pt-2 border-t border-border flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap text-[10px]">
        {facts.map((f, i) => (
          <span key={f.label} className="flex items-center gap-1">
            <span className={`font-bold tabular-nums ${f.tone}`}>
              {f.count}
            </span>
            <span className="text-muted-foreground">{f.label}</span>
            {i < facts.length - 1 && (
              <span className="text-muted-foreground ml-1">·</span>
            )}
          </span>
        ))}
      </div>
      <span className="text-[10px] uppercase tracking-wider font-semibold text-violet-700 dark:text-violet-300 ml-auto px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/30">
        Click for details →
      </span>
    </div>
  )
}


// ============================================
// IAM ROLE NODE
// ============================================
export function IAMRoleNode({
  role,
  isHighlighted,
  onHover,
  onClick,
  forceInstanceProfile = false,
  forceIAMPolicy = false,
  spineMode = false,
}: {
  role: SecurityCheckpoint;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  onClick?: () => void;
  // Callers that already know the node is an InstanceProfile (e.g.
  // Attacker view renders architecture.instanceProfiles[] in the IAM
  // Roles lane where the id is the role's ARN, not :instance-profile/)
  // can flip this to force amber Layers/Profile-badge styling.
  forceInstanceProfile?: boolean;
  // Same idea for IAMPolicy — when the caller passes a policy
  // checkpoint into this Role-shaped component, the icon + badge
  // colors switch to violet so the operator can scan-distinguish
  // Role cards from Policy cards in the IDENTITY column.
  forceIAMPolicy?: boolean;
  // 2026-06-11 — 3-color discipline + detail collapse in spine mode.
  // Pink/amber/violet identity hues demote to neutral gray; the
  // usage-status palette (emerald = healthy, amber/red = over-
  // provisioned) keeps its color because it IS the risk signal.
  // Default card = name + perms used/total + risk chip; blast-radius,
  // data-quality, event-volume chips and the compact summary show on
  // hover. Optional — non-spine consumers unchanged.
  spineMode?: boolean;
}) {
  const hasGap = role.gapCount > 0;
  const hasData = role.totalCount > 0;
  const usagePercent = hasData ? Math.round((role.usedCount / role.totalCount) * 100) : 0;
  const blastRadius = role.connectedTargets?.length || role.connectedSources?.length || 0;
  // Detect InstanceProfile by id/arn pattern — System Map buckets IP into
  // iam_role (single column), but operators can't distinguish IP from Role
  // when AWS gives them the same name. Render IP with amber Layers theme
  // + "Profile" badge so the two are visually disambiguated in this view.
  const isInstanceProfile =
    forceInstanceProfile ||
    role.id.includes(':instance-profile/') ||
    /instance.?profile/i.test(role.id);
  // IAMPolicy detection — caller-driven only. We don't auto-detect from id
  // because IAM policy ARNs can look like other IAM resources; the caller
  // passing forceIAMPolicy is the authoritative signal.
  const isIAMPolicy = forceIAMPolicy;

  // Determine status color based on usage
  const getStatusColor = () => {
    if (!hasData) return { bg: 'bg-muted', text: 'text-muted-foreground', ring: '' };
    if (usagePercent >= 80) return { bg: 'bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', ring: '' };
    if (usagePercent >= 50) return { bg: 'bg-orange-500/20', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-2 ring-amber-400/30' };
    return { bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400', ring: 'ring-2 ring-red-400/30' };
  };

  const statusColor = getStatusColor();
  // Three-way palette: policy (violet) > profile (amber) > role (pink).
  // Order matters: an IAMPolicy might match the InstanceProfile heuristic
  // if a caller wrongly passes a policy id, but explicit force flags win.
  // Spine mode collapses all three identity hues to neutral gray —
  // the usage statusColor (risk/safe) is the only color the card keeps.
  const accentBgHover = spineMode ? 'bg-accent' : isIAMPolicy ? 'bg-violet-500/15' : isInstanceProfile ? 'bg-amber-500/15' : 'bg-pink-500/20';
  const accentBorderHi  = spineMode ? 'border-border' : isIAMPolicy ? 'border-violet-500/50' : isInstanceProfile ? 'border-amber-500/50' : 'border-pink-500/50';
  const accentShadowHi  = isIAMPolicy ? 'shadow-md' : isInstanceProfile ? 'shadow-md' : 'shadow-md';
  // 2026-06-11 rebalance: icon chip keeps the identity hue (violet /
  // amber / pink) even in spine mode — icon color = identity. Card-bg
  // hover stays neutral above; usage statusColor still wins when data
  // exists because it carries the risk signal.
  const accentBgFallback = isIAMPolicy ? 'bg-violet-500/15' : isInstanceProfile ? 'bg-amber-500/15' : 'bg-pink-500/20';
  const accentTextFallback = isIAMPolicy ? 'text-violet-700 dark:text-violet-300' : isInstanceProfile ? 'text-amber-700 dark:text-amber-300' : 'text-pink-600 dark:text-pink-400';
  const showDetail = !spineMode || isHighlighted;

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 min-w-[160px]
        ${onClick ? "cursor-pointer" : "cursor-default"}
        ${isHighlighted ? `${accentBgHover} ${accentBorderHi} shadow-lg ${accentShadowHi} scale-105` : 'bg-card border-border hover:border-primary/40'}
        ${hasGap ? statusColor.ring : ''}`}
      onMouseEnter={() => onHover(role.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${hasData ? statusColor.bg : accentBgFallback}`}>
        {isIAMPolicy ? (
          <FileText className={`w-5 h-5 ${hasData ? statusColor.text : accentTextFallback}`} />
        ) : isInstanceProfile ? (
          <Layers className={`w-5 h-5 ${hasData ? statusColor.text : accentTextFallback}`} />
        ) : (
          <Key className={`w-5 h-5 ${hasData ? statusColor.text : accentTextFallback}`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
          {role.shortName}
          {isInstanceProfile && (
            <span className={`text-[8px] uppercase tracking-wider px-1 py-0.5 rounded border ${spineMode ? 'bg-muted text-muted-foreground border-border' : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40'}`}>
              Profile
            </span>
          )}
          {isIAMPolicy && (
            <span className={`text-[8px] uppercase tracking-wider px-1 py-0.5 rounded border ${spineMode ? 'bg-muted text-muted-foreground border-border' : 'bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/40'}`}>
              Policy
            </span>
          )}
        </div>
        {hasData ? (
          <>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] font-bold ${statusColor.text}`}>
                {role.usedCount}/{role.totalCount}
              </span>
              <span className="text-[10px] text-muted-foreground">perms</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {hasGap ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-amber-600 dark:text-amber-400">
                  {role.gapCount} unused
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  {usagePercent}% used
                </span>
              )}
              {showDetail && blastRadius > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {blastRadius} linked
                </span>
              )}
              {/* Bug N AC6 (2026-06-22) — surface role-sharing fact so
                  the operator can see at a glance whether closing this
                  role kills one workload's access or many. Reads
                  sharedWith[] (cross-workload lateral surface) which the
                  backend already populates via _attach_accessor_blast_
                  radius. Count includes only OTHER workloads (excludes
                  the focal one) so "1 other" reads as "this role is on
                  one more EC2 besides the one we're looking at". */}
              {Array.isArray(role.sharedWith) && role.sharedWith.length > 0 && !isInstanceProfile && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-700 dark:text-pink-300 border border-pink-500/40 font-semibold"
                  title={`Shared role — also used by: ${role.sharedWith.map(w => w.name || w.id).slice(0, 8).join(", ")}${role.sharedWith.length > 8 ? "…" : ""}`}
                >
                  Shared · {role.sharedWith.length} {role.sharedWith.length === 1 ? "workload" : "workloads"}
                </span>
              )}
              {/* Live-evidence chip — 2026-05-26 audit follow-up.
                  When CloudTrail shows real ACCESSES_RESOURCE hits
                  from this role but the scalar used_actions_count
                  says 0, the "0/7 perms · 7 unused" card reads as
                  "role is dormant" — which is the opposite of the
                  truth. This chip surfaces the contradiction so the
                  CISO sees the live evidence next to the static
                  counters. Numbers come from Phase-0 backend
                  enrichment (live_observed_total_hits +
                  live_observed_resource_count), per-resource
                  max-then-sum (not the inflated naive sum). */}
              {typeof role.liveObservedTotalHits === "number" &&
                role.liveObservedTotalHits > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-700 dark:text-amber-200 border border-amber-500/40 font-semibold"
                    title={`Live evidence: ${role.liveObservedTotalHits.toLocaleString()} observed CloudTrail hits across ${role.liveObservedResourceCount ?? 0} resource(s). Independent of the collector-written used_actions_count scalar.`}
                  >
                    ⚡{" "}
                    {role.liveObservedTotalHits >= 1_000_000
                      ? `${(role.liveObservedTotalHits / 1_000_000).toFixed(1)}M`
                      : role.liveObservedTotalHits >= 1_000
                        ? `${(role.liveObservedTotalHits / 1_000).toFixed(0)}K`
                        : String(role.liveObservedTotalHits)}{" "}
                    hits · {role.liveObservedResourceCount ?? 0} res
                  </span>
                )}
              {/* Data-quality chip — 2026-05-26 (revised plan after
                  reviewer pushback on strict-vs-fallback). The
                  collector-written scalar `used_actions_count` and the
                  canonical :USED_ACTION edges disagree when the scalar
                  was written by iam_usage_sync/behavioral_sync but
                  cloudtrail_silver hasn't yet materialized the
                  action-level edges. Rather than silently fall back
                  (which masks the ingestion drift) we render the
                  scalar's claim visibly so the operator KNOWS the
                  graph is incomplete here. */}
              {showDetail && role.usageScalarEdgesDisagree && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground border border-border font-semibold"
                  title={`Data quality: scalar used_actions_count=${role.usedCount} but no :USED_ACTION edges exist in the graph. The action-level evidence is missing — silver-layer ingestion may not have run for this role. Check cloudtrail_silver.py / iam_usage_sync.py.`}
                >
                  ⚠ scalar · no edges
                </span>
              )}
              {showDetail &&
                typeof role.liveUsedActionEventCount === "number" &&
                role.liveUsedActionEventCount > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40"
                    title={`Event-volume: ${role.liveUsedActionEventCount.toLocaleString()} :USED_ACTION events across ${role.usedCount} distinct actions. Source: silver-layer USED_ACTION edges, sum of .count property.`}
                  >
                    {role.liveUsedActionEventCount >= 1_000_000
                      ? `${(role.liveUsedActionEventCount / 1_000_000).toFixed(1)}M`
                      : role.liveUsedActionEventCount >= 1_000
                        ? `${(role.liveUsedActionEventCount / 1_000).toFixed(0)}K`
                        : String(role.liveUsedActionEventCount)}{" "}
                    events
                  </span>
                )}
            </div>
            {/* BLAST RADIUS strip — 2026-05-27 (Alon: "this is our
                killer solution!!"). The chip above shows ONE chain's
                read. These badges surface what ELSE the same role
                unlocks: other crown jewels (ALSO REACHES) + other
                workloads carrying the same key (SHARED WITH). Both
                lists come from the backend's _attach_accessor_blast_
                radius pass — real graph edges, no synthesis. Hidden
                when both lists are empty so the chip stays compact
                on roles with no lateral surface. */}
            {/* COMPACT SUMMARY — 2026-05-27, Alon feedback "i cant
                understand nothing." The stacked 5-section fan-out
                was too dense to read at a glance. Replaced with a
                one-line summary chip + "Details" CTA. Detail panel
                slides in from the right via the EXFIL view (the
                shared TFM stays generic; EXFIL view subscribes to
                role-chip clicks). */}
            {showDetail &&
              ((role.alsoReaches?.length ?? 0) > 0 ||
              (role.sharedWith?.length ?? 0) > 0 ||
              (role.assumedBy?.length ?? 0) > 0 ||
              (role.policiesAttached?.length ?? 0) > 0 ||
              (role.actionsUsed?.length ?? 0) > 0) && (
              <RoleCompactSummary role={role} />
            )}
          </>
        ) : (
          // 2026-05-25 user feedback: "Analyzing..." was a misleading
          // placeholder — it fired whenever totalCount=0, which covers
          // principals (root has no allowed_actions_count) and AWS-
          // managed service-linked roles (their perms aren't ingested
          // into Neo4j). The operator read it as "something's loading"
          // when in reality nothing more will arrive for that node.
          //
          // Honest empty state: render nothing — the role's name +
          // optional Profile badge already convey the full info we
          // have. The TFM card's height adjusts cleanly without the
          // placeholder line.
          null
        )}
      </div>

      {/* Connection points */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 rounded-full bg-muted-foreground/40 border-2 border-border" />
      <div className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 rounded-full bg-muted-foreground/40 border-2 border-border" />
    </div>
  );
}

// ============================================
// IDENTITY RISK TOKEN (spine mode only)
// ============================================
// 2026-06-11 — spine-mode identity consolidation. The identity lane's
// role + instance-profile + policy card stack (plus scalar/event/linked
// chips) read as "a security spreadsheet inside a graph" when the map
// is telling a single-path story. In spine mode each ON-PATH role
// renders as this ONE compact token: icon, IDENTITY micro-label, role
// name, one metric line, risk chip. The "details" affordance expands
// back to the existing detailed card stack (local toggle in
// UnifiedArchitectureDiagram). Reuses the role node's id + hover/click
// handlers so Connection Details / damage scope keep working.
function IdentityRiskToken({
  role,
  isHighlighted,
  onHover,
  onClick,
  onShowDetail,
}: {
  role: SecurityCheckpoint;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  onClick?: () => void;
  onShowDetail: () => void;
}) {
  const hasData = role.totalCount > 0;
  const unused = role.gapCount;
  const usagePercent = hasData ? Math.round((role.usedCount / role.totalCount) * 100) : 0;
  return (
    <div
      data-identity-token="true"
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 min-w-[160px]
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
        ${isHighlighted ? 'bg-accent border-border shadow-md' : 'bg-card border-border hover:border-primary/40'}`}
      onMouseEnter={() => onHover(role.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      {/* 2026-06-11 rebalance: identity pink icon = identity, kept in
          spine mode (token is spine-only, so no gate needed). */}
      <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center flex-shrink-0">
        <Key className="w-5 h-5 text-pink-600 dark:text-pink-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Identity</div>
        <div className="text-xs font-semibold text-foreground truncate">{role.shortName}</div>
        {hasData && (
          <div className={`text-[10px] mt-0.5 tabular-nums ${unused > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
            {role.usedCount}/{role.totalCount} perms · {unused} unused
          </div>
        )}
        {hasData && usagePercent < 50 && (
          <span className="inline-flex mt-1 text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 font-semibold uppercase tracking-wider">
            Over-provisioned
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onShowDetail();
        }}
        title="Expand to the detailed role / instance-profile / policy cards"
        className="flex items-center gap-0.5 self-end text-[9px] text-muted-foreground hover:text-foreground shrink-0"
      >
        <ChevronDown className="w-3 h-3" />
        details
      </button>
      {/* Connection points — same anchors as IAMRoleNode so edge
          endpoints land identically on the token. */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 rounded-full bg-muted-foreground/40 border-2 border-border" />
      <div className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 rounded-full bg-muted-foreground/40 border-2 border-border" />
    </div>
  );
}

// ============================================
// BLAST RADIUS DATA TYPES
// ============================================
interface BlastRadiusNode {
  id: string;
  name: string;
  type: string;
  depth: number;
  impact_score?: number;
  relationship?: string;
}

interface BlastRadiusData {
  resource_id: string;
  resource_name: string;
  resource_type: string;
  upstream: BlastRadiusNode[];
  downstream: BlastRadiusNode[];
  total_impact_score: number;
  critical_paths: { path: string[]; risk_level: string }[];
}

// ============================================
// SERVICE DETAILS POPUP
// ============================================
// Risk Assessment data type
interface RiskAssessment {
  resource_id: string;
  resource_name: string;
  resource_type: string;
  is_internet_exposed: boolean;
  cve_summary: {
    total: number;
    critical: number;
    high: number;
    details?: Array<{ id: string; severity: string; cvss: number; description: string }>;
  };
  exploitable_ports: Array<{
    port: number;
    service: string;
    risk: string;
    attack_vectors: string[];
    is_open_to_internet: boolean;
  }>;
  data_access_scope: {
    data_stores: Array<{ id: string; name: string; type: string }>;
    sensitive_permissions: Array<{ permission: string; role: string; impact: string; severity: string }>;
    iam_roles: string[];
  };
  attack_impacts: Array<{ type: string; description: string; severity: string }>;
  risk_score: number;
  risk_level: string;
}

function ServiceDetailsPopup({
  service,
  serviceType,
  architecture,
  onClose,
}: {
  service: ServiceNode | SecurityCheckpoint;
  serviceType: 'compute' | 'resource' | 'security_group' | 'nacl' | 'iam_role' | 'api_call';
  architecture: SystemArchitecture;
  onClose: () => void;
}) {
  const [blastRadius, setBlastRadius] = useState<BlastRadiusData | null>(null);
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Infer AWS service type from name when type is Unknown
  const inferTypeFromName = (name: string, type: string): string => {
    const t = (type || '').toLowerCase()
    if (t !== 'unknown' && t !== '') return type

    const n = (name || '').toLowerCase()
    if (n.includes('frontend') || n.includes('backend') || n.includes('app-')) return 'EC2'
    if (n.includes('lambda') || n.includes('function')) return 'Lambda'
    if (n.includes('-db') || n.includes('database') || n.includes('rds')) return 'RDS'
    if (n.includes('s3') || n.includes('bucket')) return 'S3'
    if (n.includes('dynamodb') || n.includes('table')) return 'DynamoDB'
    if (n.includes('resource-explorer')) return 'ResourceExplorer'
    if (n.includes('cloudwatch')) return 'CloudWatch'
    if (n.includes('root') || n.includes('iam') || n.includes('role')) return 'IAM'
    if (n.includes('sg-') || n.includes('security')) return 'SecurityGroup'
    if (n.includes('vpc-') || n.includes('subnet-')) return 'VPC'
    if (n.includes('secret')) return 'SecretsManager'
    if (n.includes('api') || n.includes('gateway')) return 'APIGateway'
    if (n.includes('ecs') || n.includes('fargate')) return 'ECS'
    if (n.includes('eks')) return 'EKS'
    if (n.includes('sqs')) return 'SQS'
    if (n.includes('sns')) return 'SNS'
    return type
  }

  // Get the icon for a node type
  const getNodeIcon = (type: string, name?: string) => {
    const t = inferTypeFromName(name || '', type).toLowerCase();
    if (t.includes('ec2') || t === 'compute') return <Server className="w-4 h-4" />;
    if (t.includes('lambda')) return <Zap className="w-4 h-4" />;
    if (t.includes('rds') || t.includes('database')) return <Database className="w-4 h-4" />;
    if (t.includes('s3') || t.includes('storage') || t.includes('bucket')) return <HardDrive className="w-4 h-4" />;
    if (t.includes('security') || t.includes('sg')) return <Shield className="w-4 h-4" />;
    if (t.includes('iam') || t.includes('role')) return <Key className="w-4 h-4" />;
    if (t.includes('nacl') || t.includes('acl')) return <Lock className="w-4 h-4" />;
    if (t.includes('dynamodb')) return <Database className="w-4 h-4" />;
    if (t.includes('sqs') || t.includes('sns')) return <Network className="w-4 h-4" />;
    if (t.includes('api') || t.includes('gateway')) return <Globe className="w-4 h-4" />;
    if (t.includes('resourceexplorer') || t.includes('explorer')) return <Search className="w-4 h-4" />;
    if (t.includes('cloudwatch')) return <Activity className="w-4 h-4" />;
    return <Layers className="w-4 h-4" />;
  };

  // Get color for a node type
  const getNodeColor = (type: string, name?: string) => {
    const t = inferTypeFromName(name || '', type).toLowerCase();
    if (t.includes('ec2') || t === 'compute') return 'text-blue-600 dark:text-blue-400 bg-blue-500/20 border-blue-500/50';
    if (t.includes('lambda')) return 'text-amber-600 dark:text-amber-400 bg-orange-500/20 border-amber-500/50';
    if (t.includes('rds') || t.includes('database')) return 'text-purple-600 dark:text-purple-400 bg-violet-500/20 border-purple-500/50';
    if (t.includes('s3') || t.includes('storage') || t.includes('bucket')) return 'text-green-600 dark:text-green-400 bg-green-500/20 border-green-500/50';
    if (t.includes('security') || t.includes('sg')) return 'text-orange-600 dark:text-orange-400 bg-orange-500/20 border-orange-500/50';
    if (t.includes('iam') || t.includes('role')) return 'text-pink-600 dark:text-pink-400 bg-pink-500/20 border-pink-500/50';
    if (t.includes('nacl') || t.includes('acl')) return 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/20 border-cyan-500/50';
    if (t.includes('resourceexplorer') || t.includes('explorer')) return 'text-indigo-600 dark:text-indigo-400 bg-violet-500/20 border-indigo-500/50';
    if (t.includes('cloudwatch')) return 'text-teal-600 dark:text-teal-400 bg-teal-500/20 border-teal-500/50';
    return 'text-muted-foreground bg-muted border-border';
  };

  // Fetch blast radius data
  useEffect(() => {
    // Helper to check if a string is an external IP (not internal AWS)
    const isExternalIP = (str: string): boolean => {
      if (!str) return false
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
      const isIP = ipv4Regex.test(str)
      if (!isIP) return false
      const parts = str.split('.').map(Number)
      if (parts.length === 4) {
        if (parts[0] === 10) return false // AWS VPC
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false
        if (parts[0] === 192 && parts[1] === 168) return false
        if (parts[0] === 127) return false
      }
      return true
    }

    // Helper to check if a service is a real AWS resource (not external IP or unknown)
    const isRealAWSService = (name: string, type: string, arn?: string): boolean => {
      if (!name) return false
      const nameLower = name.toLowerCase()
      const typeLower = (type || '').toLowerCase()
      const arnLower = (arn || '').toLowerCase()

      // Filter out if name is literally "Unknown" or empty
      if (nameLower === 'unknown' || nameLower === '' || nameLower === 'null') return false

      // Filter out external IPs
      if (isExternalIP(name)) return false

      // Check if it's just an IP in the name
      if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(name) && (typeLower === 'unknown' || !type)) return false

      // Known AWS types are always valid
      const awsTypes = ['ec2', 'lambda', 'rds', 's3', 'dynamodb', 'elasticloadbalancing',
        'securitygroup', 'iam', 'role', 'vpc', 'subnet', 'nacl', 'ecs', 'eks', 'fargate',
        'sqs', 'sns', 'kinesis', 'elasticache', 'secretsmanager', 'apigateway', 'cloudfront',
        'resource-explorer', 'cloudwatch', 'sns', 'sqs', 'route53', 'ec2instance', 'instance']
      if (awsTypes.some(t => typeLower.includes(t))) return true

      // Check ARN for service type (useful when type is "Unknown")
      if (arnLower.includes('arn:aws:')) {
        if (arnLower.includes(':ec2:') && arnLower.includes('instance')) return true
        if (arnLower.includes(':lambda:')) return true
        if (arnLower.includes(':rds:')) return true
        if (arnLower.includes(':s3:')) return true
        if (arnLower.includes(':dynamodb:')) return true
        if (arnLower.includes(':iam:') && arnLower.includes('role')) return true
        if (arnLower.includes(':iam:') && arnLower.includes('instance-profile')) return true
        if (arnLower.includes(':elasticloadbalancing:')) return true
        if (arnLower.includes(':ecs:')) return true
        if (arnLower.includes(':eks:')) return true
      }

      // Check for AWS ARN patterns
      if (name.includes('arn:aws:')) return true

      // Check for AWS ID patterns in name
      if (/i-[a-f0-9]{8,}/.test(nameLower)) return true
      if (nameLower.includes('sg-') || nameLower.includes('subnet-') || nameLower.includes('vpc-')) return true

      // Check for known AWS service name patterns
      if (nameLower.includes('saferemediate') || nameLower.includes('cyntro') ||
          nameLower.includes('frontend') || nameLower.includes('backend') ||
          nameLower.includes('app-') || nameLower.includes('-app') ||
          nameLower.includes('lambda') || nameLower.includes('function') ||
          nameLower.includes('bucket') || nameLower.includes('table') ||
          nameLower.includes('database') || nameLower.includes('-db') ||
          nameLower.includes('resource-explorer')) return true

      // Filter out if type is Unknown and name doesn't match known patterns
      if (typeLower === 'unknown') return false

      return true
    }

    const fetchBlastRadius = async () => {
      setLoading(true);
      setError(null);

      try {
        // Map service type to backend resource type for better query matching
        const getResourceType = () => {
          if (serviceType === 'compute') return 'EC2';
          if (serviceType === 'resource') {
            // Check the service's actual type if available
            const svc = service as any;
            if (svc.type) return svc.type;
            // Guess from name/id
            if (service.id.includes('rds') || service.name.toLowerCase().includes('db')) return 'RDSInstance';
            if (service.id.includes('s3') || service.id.includes('bucket')) return 'S3Bucket';
            if (service.id.includes('dynamodb')) return 'DynamoDBTable';
            return 'S3Bucket'; // Default for resources
          }
          if (serviceType === 'security_group') return 'SecurityGroup';
          if (serviceType === 'nacl') return 'NACL';
          if (serviceType === 'iam_role') return 'IAMRole';
          // For api_call, query the underlying resource type, not APICall
          if (serviceType === 'api_call') {
            // API call nodes are named after their target resource
            const name = service.name.toLowerCase();
            const id = service.id.toLowerCase();
            if (name.includes('db') || name.includes('rds') || id.includes('rds')) return 'RDSInstance';
            if (name.includes('s3') || name.includes('bucket') || id.includes('s3')) return 'S3Bucket';
            if (name.includes('dynamo') || id.includes('dynamo')) return 'DynamoDBTable';
            return 'RDSInstance'; // Default for API calls (most likely DB)
          }
          return '';
        };
        const resourceType = getResourceType();

        // For api_call, strip the 'api-' prefix to get the real resource ID
        const queryResourceId = serviceType === 'api_call' && service.id.startsWith('api-')
          ? service.id.slice(4)  // Remove 'api-' prefix
          : service.id;

        // Use blast-radius API (the working one)
        const apiUrl = `/api/proxy/blast-radius/${encodeURIComponent(queryResourceId)}?resource_type=${resourceType}&_t=${Date.now()}`;
        const res = await fetch(apiUrl);

        if (res.ok) {
          const data = await res.json();
          // Convert blast-radius API response to expected format
          const affectedResources = data.affected_resources || [];
          const upstream: BlastRadiusNode[] = [];
          const downstream: BlastRadiusNode[] = [];

          // All affected resources go into downstream (blast radius = services affected if this fails)
          // For DB/S3: services that depend ON this resource would be affected
          // For compute: services this compute connects to would be affected
          // Filter out external IPs and unknown external traffic
          affectedResources.forEach((r: any) => {
            const name = r.name || r.id || nameFromArn(r.arn) || 'Unknown';
            const type = r.type || 'Unknown';
            const arn = r.arn || '';
            // Skip external IPs and unknown external traffic
            if (!isRealAWSService(name, type, arn)) {
              return;
            }
            // Infer type from ARN if type is Unknown
            let inferredType = type;
            if (type === 'Unknown' && arn) {
              if (arn.includes(':ec2:') && arn.includes('instance')) inferredType = 'EC2';
              else if (arn.includes(':lambda:')) inferredType = 'Lambda';
              else if (arn.includes(':rds:')) inferredType = 'RDS';
              else if (arn.includes(':s3:')) inferredType = 'S3';
              else if (arn.includes(':iam:') && arn.includes('role')) inferredType = 'IAMRole';
              else if (arn.includes(':iam:') && arn.includes('instance-profile')) inferredType = 'InstanceProfile';
            }
            downstream.push({
              id: r.id || r.name,
              name,
              type: inferredType,
              depth: 1,
              relationship: serviceType === 'compute' ? 'DEPENDS_ON' : 'CONNECTS_TO',
            });
          });

          setBlastRadius({
            resource_id: service.id,
            resource_name: service.name,
            resource_type: serviceType,
            upstream,
            downstream,
            total_impact_score: data.total_affected * 10,
            critical_paths: [],
          });
        } else {
          // Build from local architecture data
          buildLocalBlastRadius();
        }
      } catch (err) {
        console.error('[ServiceDetailsPopup] Error fetching blast radius:', err);
        buildLocalBlastRadius();
      } finally {
        setLoading(false);
      }
    };

    // Build blast radius from local architecture data
    const buildLocalBlastRadius = () => {
      const upstream: BlastRadiusNode[] = [];
      const downstream: BlastRadiusNode[] = [];

      // Find flows involving this service
      architecture.flows.forEach(flow => {
        if (flow.sourceId === service.id || flow.sourceId.includes(service.id.slice(-12))) {
          // This service is the source - target is downstream
          const target = architecture.resources.find(r => r.id === flow.targetId);
          if (target && isRealAWSService(target.name, target.type)) {
            downstream.push({
              id: target.id,
              name: target.name,
              type: target.type,
              depth: 1,
              relationship: 'SENDS_TO',
            });
          }
          // SG is also in the path
          if (flow.sgId) {
            const sg = architecture.securityGroups.find(s => s.id === flow.sgId);
            if (sg) {
              downstream.push({ id: sg.id, name: sg.name, type: 'SecurityGroup', depth: 1, relationship: 'THROUGH_SG' });
            }
          }
        }

        if (flow.targetId === service.id || flow.targetId.includes(service.id.slice(-12))) {
          // This service is the target - source is upstream
          const source = architecture.computeServices.find(c => c.id === flow.sourceId);
          if (source && isRealAWSService(source.name, source.type)) {
            upstream.push({
              id: source.id,
              name: source.name,
              type: source.type,
              depth: 1,
              relationship: 'RECEIVES_FROM',
            });
          }
        }
      });

      // For compute services, also add SG and IAM as dependencies
      if (serviceType === 'compute') {
        const connectedFlows = architecture.flows.filter(f => f.sourceId === service.id || f.sourceId.includes(service.id.slice(-12)));
        connectedFlows.forEach(flow => {
          if (flow.sgId) {
            const sg = architecture.securityGroups.find(s => s.id === flow.sgId);
            if (sg && !upstream.find(u => u.id === sg.id)) {
              upstream.push({ id: sg.id, name: sg.name, type: 'SecurityGroup', depth: 1, relationship: 'PROTECTED_BY' });
            }
          }
          if (flow.roleId) {
            const role = architecture.iamRoles.find(r => r.id === flow.roleId);
            if (role && !upstream.find(u => u.id === role.id)) {
              upstream.push({ id: role.id, name: role.name, type: 'IAMRole', depth: 1, relationship: 'ASSUMES' });
            }
          }
        });
      }

      setBlastRadius({
        resource_id: service.id,
        resource_name: service.name,
        resource_type: serviceType,
        upstream,
        downstream,
        total_impact_score: downstream.length * 10,
        critical_paths: [],
      });
    };

    fetchBlastRadius();

    // Also fetch risk assessment for attack impact data
    const fetchRiskAssessment = async () => {
      try {
        const resourceType = serviceType === 'compute' ? 'EC2' :
                            serviceType === 'resource' ? 'RDSInstance' : '';
        const res = await fetch(`/api/proxy/resource-risk/${encodeURIComponent(service.id)}?resource_type=${resourceType}`);
        if (res.ok) {
          const data = await res.json();
          setRiskAssessment(data);
        }
      } catch (err) {
        console.error('[ServiceDetailsPopup] Risk assessment fetch error:', err);
      }
    };
    fetchRiskAssessment();
  }, [service.id, service.name, serviceType, architecture]);

  // Get related flows
  const relatedFlows = useMemo(() => {
    return architecture.flows.filter(f =>
      f.sourceId === service.id || f.targetId === service.id ||
      f.sourceId.includes(service.id.slice(-12)) || f.targetId.includes(service.id.slice(-12)) ||
      f.sgId === service.id || f.naclId === service.id || f.roleId === service.id
    );
  }, [architecture.flows, service.id]);

  // Calculate traffic stats
  const trafficStats = useMemo(() => {
    const totalBytes = relatedFlows.reduce((sum, f) => sum + f.bytes, 0);
    const totalConnections = relatedFlows.reduce((sum, f) => sum + f.connections, 0);
    const uniquePorts = [...new Set(relatedFlows.flatMap(f => f.ports))];
    return { totalBytes, totalConnections, uniquePorts };
  }, [relatedFlows]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${getNodeColor(serviceType)}`}>
              {getNodeIcon(serviceType)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{service.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded bg-muted text-foreground uppercase">
                  {serviceType.replace('_', ' ')}
                </span>
                <span className="text-xs text-muted-foreground font-mono">{service.id.slice(-20)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
              <span className="ml-3 text-muted-foreground">Loading dependencies...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Blast Radius Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/50 rounded-xl p-4 border border-border">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                    <Target className="w-5 h-5" />
                    <span className="text-sm font-semibold">Blast Radius</span>
                  </div>
                  <div className="text-3xl font-bold text-foreground">{blastRadius?.downstream?.length || 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">downstream services affected</div>
                </div>

                <div className="bg-muted/50 rounded-xl p-4 border border-border">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                    <GitBranch className="w-5 h-5" />
                    <span className="text-sm font-semibold">Dependencies</span>
                  </div>
                  <div className="text-3xl font-bold text-foreground">{blastRadius?.upstream?.length || 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">upstream dependencies</div>
                </div>

                <div className="bg-muted/50 rounded-xl p-4 border border-border">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-2">
                    <Activity className="w-5 h-5" />
                    <span className="text-sm font-semibold">Traffic</span>
                  </div>
                  <div className="text-3xl font-bold text-foreground">{formatBytes(trafficStats.totalBytes)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{trafficStats.totalConnections} connections</div>
                </div>
              </div>

              {/* Impact Score */}
              {blastRadius && blastRadius.total_impact_score > 0 && (
                <div className={`rounded-xl p-4 border ${
                  blastRadius.total_impact_score > 50 ? 'bg-red-500/10 border-red-500/30' :
                  blastRadius.total_impact_score > 20 ? 'bg-orange-500/10 border-amber-500/30' :
                  'bg-emerald-500/10 border-emerald-500/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-5 h-5 ${
                        blastRadius.total_impact_score > 50 ? 'text-red-600 dark:text-red-400' :
                        blastRadius.total_impact_score > 20 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`} />
                      <span className="font-semibold text-foreground">Impact Score</span>
                    </div>
                    <span className={`text-2xl font-bold ${
                      blastRadius.total_impact_score > 50 ? 'text-red-600 dark:text-red-400' :
                      blastRadius.total_impact_score > 20 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {blastRadius.total_impact_score}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {blastRadius.total_impact_score > 50 ? 'High risk - failure affects critical services' :
                     blastRadius.total_impact_score > 20 ? 'Medium risk - some services may be affected' :
                     'Low risk - minimal downstream impact'}
                  </p>
                </div>
              )}

              {/* Attack Risk Assessment - What can attackers actually do? */}
              {riskAssessment && (riskAssessment.attack_impacts?.length > 0 || riskAssessment.cve_summary?.total > 0 || riskAssessment.data_access_scope?.data_stores?.length > 0) && (
                <div className="bg-red-500/5 rounded-xl border border-red-500/20 overflow-hidden">
                  {/* Header with Risk Score */}
                  <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      <h3 className="text-sm font-bold text-foreground">Attack Risk Assessment</h3>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                      riskAssessment.risk_level === 'CRITICAL' ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/50' :
                      riskAssessment.risk_level === 'HIGH' ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/50' :
                      riskAssessment.risk_level === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/50' :
                      'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/50'
                    }`}>
                      {riskAssessment.risk_level} RISK ({riskLabel(riskAssessment.risk_score).label})
                    </div>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* CVE Exploitability */}
                    {riskAssessment.cve_summary?.total > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Shield className="w-4 h-4 text-red-600 dark:text-red-400" />
                          <span className="text-xs font-semibold text-foreground uppercase">Vulnerabilities</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-muted/50 rounded-lg p-2 text-center border border-red-500/30">
                            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{riskAssessment.cve_summary.critical}</div>
                            <div className="text-[10px] text-muted-foreground">CRITICAL</div>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-2 text-center border border-orange-500/30">
                            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{riskAssessment.cve_summary.high}</div>
                            <div className="text-[10px] text-muted-foreground">HIGH</div>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-2 text-center border border-border">
                            <div className="text-2xl font-bold text-foreground">{riskAssessment.cve_summary.total}</div>
                            <div className="text-[10px] text-muted-foreground">TOTAL</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Exploitable Ports */}
                    {riskAssessment.exploitable_ports?.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Network className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                          <span className="text-xs font-semibold text-foreground uppercase">Network Exposure</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {riskAssessment.exploitable_ports.map((port, i) => (
                            <div key={i} className={`px-2 py-1 rounded text-xs ${
                              port.is_open_to_internet ? 'bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/50' :
                              port.risk === 'CRITICAL' ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/50' :
                              'bg-muted text-foreground border border-border'
                            }`}>
                              <span className="font-mono font-bold">{port.port}</span>
                              <span className="text-muted-foreground mx-1">/</span>
                              <span>{port.service}</span>
                              {port.is_open_to_internet && <span className="ml-1 text-red-600 dark:text-red-400">INTERNET</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Data Access - What can be stolen */}
                    {riskAssessment.data_access_scope?.data_stores?.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Database className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          <span className="text-xs font-semibold text-foreground uppercase">Data at Risk</span>
                        </div>
                        <div className="space-y-1">
                          {riskAssessment.data_access_scope.data_stores.slice(0, 5).map((store, i) => (
                            <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded border border-purple-500/20">
                              <Database className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                              <span className="text-sm text-foreground">{store.name}</span>
                              <span className="text-[10px] text-purple-600 dark:text-purple-400 bg-violet-500/20 px-1.5 py-0.5 rounded">{store.type}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dangerous Permissions */}
                    {riskAssessment.data_access_scope?.sensitive_permissions?.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Key className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                          <span className="text-xs font-semibold text-foreground uppercase">Dangerous Permissions</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {riskAssessment.data_access_scope.sensitive_permissions.slice(0, 6).map((perm, i) => (
                            <span key={i} className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              perm.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-700 dark:text-red-300' :
                              perm.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300' :
                              'bg-muted text-foreground'
                            }`}>
                              {perm.permission}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Attack Impacts - What damage can be done */}
                    {riskAssessment.attack_impacts?.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                          <span className="text-xs font-semibold text-foreground uppercase">Potential Attack Impacts</span>
                        </div>
                        <div className="space-y-1">
                          {riskAssessment.attack_impacts.slice(0, 4).map((impact, i) => (
                            <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded border ${
                              impact.severity === 'CRITICAL' ? 'bg-red-500/10 border-red-500/30' :
                              impact.severity === 'HIGH' ? 'bg-orange-500/10 border-orange-500/30' :
                              'bg-card border-border'
                            }`}>
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                impact.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                                impact.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400' :
                                'bg-muted text-muted-foreground'
                              }`}>
                                {impact.type.replace(/_/g, ' ')}
                              </span>
                              <span className="text-xs text-foreground">{impact.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* API Actions - shown for api_call type - Simulated from VPC traffic */}
              {serviceType === 'api_call' && (
                <div className="bg-lime-500/10 rounded-xl p-4 border border-lime-500/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-lime-600 dark:text-lime-400" />
                      <h3 className="text-sm font-semibold text-foreground">API Actions</h3>
                    </div>
                    <span className="text-[10px] px-2 py-1 rounded bg-lime-500/20 text-lime-600 dark:text-lime-400 border border-lime-500/30">
                      Simulated from VPC Traffic
                    </span>
                  </div>

                  {/* Traffic basis info */}
                  <div className="grid grid-cols-2 gap-2 mb-4 p-2 rounded-lg bg-muted/50">
                    <div className="text-center">
                      <div className="text-lg font-bold text-foreground">{formatBytes((service as any).totalBytes || 0)}</div>
                      <div className="text-[10px] text-muted-foreground">Traffic Observed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-foreground">{((service as any).totalConnections || 0).toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground">Connections</div>
                    </div>
                  </div>

                  {/* API actions derived from traffic */}
                  <div className="grid grid-cols-2 gap-2">
                    {((service as any).apiActions || []).map((action: { action: string; count: number }, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border">
                        <span className="text-sm text-foreground font-mono">{action.action}</span>
                        <span className="text-xs text-lime-600 dark:text-lime-400 font-bold">{action.count.toLocaleString()}x</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>Total: {((service as any).totalCalls || 0).toLocaleString()} estimated calls</span>
                    <span>Based on VPC Flow Logs</span>
                  </div>

                  <p className="text-[10px] text-muted-foreground mt-2 italic">
                    * API calls estimated from observed network traffic patterns. Enable CloudTrail for actual API logging.
                  </p>
                </div>
              )}

              {/* Upstream Dependencies */}
              {blastRadius && blastRadius.upstream.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-sm font-semibold text-foreground">This Service Depends On ({blastRadius.upstream.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {blastRadius.upstream.map((node, i) => {
                      const displayType = inferTypeFromName(node.name, node.type);
                      return (
                        <div key={`upstream-${i}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getNodeColor(node.type, node.name)}`}>
                            {getNodeIcon(node.type, node.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{node.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{displayType}</span>
                              {node.relationship && (
                                <span className="text-[10px] text-blue-600 dark:text-blue-400">{node.relationship}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Downstream - Blast Radius */}
              {blastRadius && blastRadius.downstream.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowLeft className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <h3 className="text-sm font-semibold text-foreground">Services That Depend On This (Blast Radius: {blastRadius.downstream.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {blastRadius.downstream.map((node, i) => {
                      const displayType = inferTypeFromName(node.name, node.type);
                      return (
                        <div key={`downstream-${i}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-amber-500/20">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getNodeColor(node.type, node.name)}`}>
                            {getNodeIcon(node.type, node.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{node.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{displayType}</span>
                              {node.depth && node.depth > 1 && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400">depth: {node.depth}</span>
                              )}
                            </div>
                          </div>
                          {node.impact_score && (
                            <div className="text-amber-600 dark:text-amber-400 text-sm font-bold">+{node.impact_score}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Active Connections */}
              {relatedFlows.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-sm font-semibold text-foreground">Active Connections ({relatedFlows.length})</h3>
                  </div>
                  <div className="space-y-2">
                    {relatedFlows.slice(0, 5).map((flow, i) => {
                      const source = architecture.computeServices.find(c => c.id === flow.sourceId);
                      const target = architecture.resources.find(r => r.id === flow.targetId);
                      const sg = architecture.securityGroups.find(s => s.id === flow.sgId);
                      const role = architecture.iamRoles.find(r => r.id === flow.roleId);
                      // Show API badge for resources that have API calls (based on traffic)
                      const targetType = (target?.type || '').toLowerCase();
                      const hasApiCalls = targetType === 'database' || targetType === 'storage' || targetType === 'dynamodb';
                      const sourceName = (source?.shortName && source.shortName !== 'Unknown') ? source.shortName : (source?.name && source.name !== 'Unknown') ? shortName(source.name) : shortName(flow.sourceId.slice(-12));
                      const targetName = (target?.shortName && target.shortName !== 'Unknown') ? target.shortName : (target?.name && target.name !== 'Unknown') ? shortName(target.name) : shortName(flow.targetId.slice(-12));
                      return (
                        <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border text-sm">
                          <span className="text-blue-600 dark:text-blue-400 font-medium">{sourceName}</span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          {sg && (
                            <>
                              <span className="text-orange-600 dark:text-orange-400 text-xs">[SG]</span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            </>
                          )}
                          {role && (
                            <>
                              <span className="text-pink-600 dark:text-pink-400 text-xs">[IAM]</span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            </>
                          )}
                          {hasApiCalls && (
                            <>
                              <span className="text-lime-600 dark:text-lime-400 text-xs">[API]</span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            </>
                          )}
                          <span className="text-purple-600 dark:text-purple-400 font-medium">{targetName}</span>
                          <span className="ml-auto text-emerald-600 dark:text-emerald-400 font-mono text-xs">{formatBytes(flow.bytes)}</span>
                        </div>
                      );
                    })}
                    {relatedFlows.length > 5 && (
                      <div className="text-center text-xs text-muted-foreground py-2">
                        +{relatedFlows.length - 5} more connections
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No Dependencies Message */}
              {(!blastRadius || (blastRadius.upstream.length === 0 && blastRadius.downstream.length === 0)) && relatedFlows.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No dependencies or connections found for this service</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// ANIMATED TRAFFIC LINE
// ============================================
function AnimatedTrafficLine({
  x1, y1, x2, y2,
  isActive,
  isHighlighted,
  isAttackPath = false,
  flowData,
  animate,
  trafficIntensity = 'medium',
  heatmapMode = false,
  heatmapRatio = 0,
  ghosted = false,
  planeColor,
  planeGlow,
  edgeData,
  canvasV2 = false,
  isOnPath = true,
  dim = false,
  routePrecedence = null,
  waypoint = null,
  pathDominance,
}: {
  x1: number; y1: number; x2: number; y2: number;
  isActive: boolean;
  isHighlighted: boolean;
  isAttackPath?: boolean;
  /** Attack-path dominance (pathFilter mode only — 2026-06-11 design
   *  review "one dominant path color; everything else fades").
   *    'dominant' → edge is on the selected attack path: single hero
   *                 color var(--canvas-danger), width 3.5, full opacity.
   *    'lateral'  → pivot edge touching the path at one endpoint:
   *                 muted gray var(--canvas-config), width 1.5,
   *                 opacity 0.4 (3-color discipline — context, not
   *                 a fourth color family).
   *    'faded'    → unrelated edge: var(--color-border), width 1,
   *                 opacity 0.6, no animation.
   *  Undefined → pathFilter not active; every override below is a
   *  no-op and the legacy color resolution applies unchanged. */
  pathDominance?: 'dominant' | 'lateral' | 'faded';
  flowData?: TrafficFlow;
  animate: boolean;
  trafficIntensity?: 'low' | 'medium' | 'high';
  heatmapMode?: boolean;
  heatmapRatio?: number;
  ghosted?: boolean;
  // V2-3 (2026-05-31): canvas-v2 visual layer flags forwarded from
  // ConnectionLinesSVG. canvasV2 enables the polish layer; isOnPath
  // is computed from architecture.onPathEdgeIds; dim is the resolved
  // "should this edge render at ~30% opacity" boolean. All three are
  // no-ops when canvasV2 is false (legacy unchanged).
  canvasV2?: boolean;
  isOnPath?: boolean;
  dim?: boolean;
  /** When set (explicit-edges mode), overrides the default
   *  "active=blue / default=slate" color so identity edges read purple,
   *  network edges read teal, and data edges read warm orange. Attack-
   *  path red still wins (operators need to spot live attacks first).
   *  Heatmap still wins too. */
  planeColor?: string;
  planeGlow?: string;
  /** Backing edge in explicit-edges mode. Used for the hover label so
   *  operators see relationship type + port/protocol in the tooltip. */
  edgeData?: CanvasEdge;
  /** Canvas v3 — route-precedence anchored on this edge when it
   *  represents a data-plane access (role → bucket via a resolved
   *  egress gateway). When set, the verb chip on the edge midpoint
   *  carries the route-precedence suffix ("reads · via VPCE · private")
   *  so the operator reads the routing answer from the FLOW LINE, not
   *  from a chip floating beside the destination card. Drives
   *  data-chip-anchored-on-edge + data-route-precedence-via stamps on
   *  the edge group. Per pattern_geometry_must_match_label —
   *  the label REINFORCES the geometry of the edge. */
  routePrecedence?: RoutePrecedence | null;
  /** Canvas v3 Slice B — waypoint that the edge must geometrically
   *  pass through (the resolved egress gateway's center). When set,
   *  the source→target line becomes piecewise: source → waypoint →
   *  target, so the operator's eye follows the actual route. Per
   *  pattern_geometry_must_match_label — chip + geometry both say
   *  "via VPCE", reinforcing each other. ConnectionLinesSVG resolves
   *  the waypoint coords from the gateway's DOM rect; this component
   *  just consumes them. */
  waypoint?: { x: number; y: number } | null;
}) {
  const pathId = useMemo(() => `path-${Math.random().toString(36).substr(2, 9)}`, []);
  const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

  // ─── Curved path geometry (explicit-edges mode only) ───────────────
  //
  // Lane-based layout means a direct edge between non-adjacent lanes
  // (e.g. Subnet → NACL crossing Route Tables + SG columns) bisects
  // unrelated cards visually. Curving the line gracefully arches it
  // away from the straight path so it bends OVER the intermediate
  // cards instead of through them. Legacy flow mode keeps straight
  // segments (those are already short checkpoint-to-checkpoint hops).
  //
  // Curve: cubic Bezier with control points offset along the line
  // perpendicular by an archAmount proportional to line length.
  // For long lines (EC2 → IGW across the canvas) the arch is bigger,
  // bending the line clearly out of the way; for short edges
  // (EC2 → Subnet adjacent column) the curve is barely perceptible.
  //
  // Plane gives the arch its DIRECTION:
  //   identity  → arch upward (negative perpendicular Y)
  //   network   → arch downward (positive perpendicular Y)
  //   data      → arch downward, larger amount (more pronounced for
  //               observed traffic so the eye tracks them as the
  //               event lines rather than config plumbing)
  // This stacks parallel edges from one source/target pair instead of
  // collapsing them onto the same straight line.
  const useCurve = !!edgeData;
  const plane: EdgePlane | undefined = (() => {
    if (!edgeData) return undefined;
    // Inferred service-plane edges (VPCE → S3/DynamoDB/etc) carry
    // relationship="ROUTES_VIA" for semantic honesty (the edge IS a
    // route), but visually they represent the data-plane traversal —
    // bytes physically transit the VPCE to reach the bucket. Per the
    // Greenlight constraint #1, color them like data-flow edges
    // (orange) so the read direction is consistent with the
    // surrounding observed flows. Dash style still distinguishes them
    // from real observed edges.
    if (edgeData.inferred) return 'data';
    // Re-derive plane from relationship — passed-in planeColor reflects
    // the same logic, but we need the discrete plane label for arch
    // direction. Cheap; could also be threaded through as a prop later.
    const r = edgeData.relationship.toUpperCase();
    if (r === 'USES_ROLE' || r === 'ASSUMES_ROLE' || r === 'ASSUMES_ROLE_ACTUAL' ||
        r === 'HAS_INSTANCE_PROFILE' || r === 'HAS_POLICY') return 'identity';
    if (r === 'ACCESSES_RESOURCE' || r === 'ACTUAL_API_CALL' || r === 'ACTUAL_S3_ACCESS' ||
        r === 'READS_FROM' || r === 'WRITES_TO' || r === 'RUNTIME_CALLS') return 'data';
    return 'network';
  })();
  const archDir = plane === 'identity' ? -1 : 1; // -1 = up, +1 = down
  const archMultiplier = plane === 'data' ? 0.18 : 0.12;
  // For very short edges (adjacent-column hops) the arch is tiny — don't
  // distort what's already a clean line.
  const archAmount = useCurve ? Math.min(45, length * archMultiplier) : 0;

  // Cubic Bezier control points. Perpendicular vector = (-dy, dx)/len,
  // then scaled by archDir * archAmount and added to the 1/3 and 2/3
  // points along the source→target line.
  const dxBz = x2 - x1;
  const dyBz = y2 - y1;
  const lenBz = Math.max(1, length);
  const perpX = (-dyBz / lenBz) * archDir * archAmount;
  const perpY = (dxBz / lenBz) * archDir * archAmount;
  const cx1 = x1 + dxBz * 0.3 + perpX;
  const cy1 = y1 + dyBz * 0.3 + perpY;
  const cx2 = x1 + dxBz * 0.7 + perpX;
  const cy2 = y1 + dyBz * 0.7 + perpY;
  // Canvas v3 Slice B — when a waypoint is supplied (the resolved
  // egress gateway's center), the edge becomes piecewise: source →
  // waypoint → target. Two quadratic Bezier segments per the
  // pattern_geometry_must_match_label discipline — the chip claims
  // "via VPCE", the geometry must show the line passing through the
  // VPCE node. Control points for each segment are pulled toward the
  // straight midpoint, giving each half a gentle arch that converges
  // at the waypoint. Falls back to single-Bezier (or straight) when
  // no waypoint is supplied (legacy behavior, no regression for
  // non-route-precedence edges).
  const hasWaypoint = !!waypoint && useCurve;
  // Segment 1 (source → waypoint) control point: midpoint perp-offset.
  const seg1MidX = hasWaypoint ? (x1 + waypoint!.x) / 2 : 0;
  const seg1MidY = hasWaypoint ? (y1 + waypoint!.y) / 2 : 0;
  const seg1Len = hasWaypoint
    ? Math.sqrt(
        Math.pow(waypoint!.x - x1, 2) + Math.pow(waypoint!.y - y1, 2),
      )
    : 0;
  const seg1Arch = hasWaypoint ? Math.min(30, seg1Len * 0.12) : 0;
  const seg1PerpX = hasWaypoint
    ? ((-(waypoint!.y - y1)) / Math.max(1, seg1Len)) * archDir * seg1Arch
    : 0;
  const seg1PerpY = hasWaypoint
    ? ((waypoint!.x - x1) / Math.max(1, seg1Len)) * archDir * seg1Arch
    : 0;
  const seg1Cx = seg1MidX + seg1PerpX;
  const seg1Cy = seg1MidY + seg1PerpY;
  // Segment 2 (waypoint → target) control point: midpoint perp-offset.
  const seg2MidX = hasWaypoint ? (waypoint!.x + x2) / 2 : 0;
  const seg2MidY = hasWaypoint ? (waypoint!.y + y2) / 2 : 0;
  const seg2Len = hasWaypoint
    ? Math.sqrt(
        Math.pow(x2 - waypoint!.x, 2) + Math.pow(y2 - waypoint!.y, 2),
      )
    : 0;
  const seg2Arch = hasWaypoint ? Math.min(30, seg2Len * 0.12) : 0;
  const seg2PerpX = hasWaypoint
    ? ((-(y2 - waypoint!.y)) / Math.max(1, seg2Len)) * archDir * seg2Arch
    : 0;
  const seg2PerpY = hasWaypoint
    ? ((x2 - waypoint!.x) / Math.max(1, seg2Len)) * archDir * seg2Arch
    : 0;
  const seg2Cx = seg2MidX + seg2PerpX;
  const seg2Cy = seg2MidY + seg2PerpY;
  const pathD = hasWaypoint
    ? `M ${x1} ${y1} Q ${seg1Cx} ${seg1Cy}, ${waypoint!.x} ${waypoint!.y} Q ${seg2Cx} ${seg2Cy}, ${x2} ${y2}`
    : useCurve
      ? `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
      : `M ${x1} ${y1} L ${x2} ${y2}`;
  // Arrow rotation = tangent at the endpoint. For the piecewise path,
  // segment 2's endpoint tangent is (x2-seg2Cx, y2-seg2Cy). For cubic
  // Bezier at t=1 the tangent is along (P3 - P2). For straight lines
  // it's (y2-y1, x2-x1).
  const arrowDx = hasWaypoint
    ? x2 - seg2Cx
    : useCurve
      ? x2 - cx2
      : x2 - x1;
  const arrowDy = hasWaypoint
    ? y2 - seg2Cy
    : useCurve
      ? y2 - cy2
      : y2 - y1;
  const arrowAngleDeg = (Math.atan2(arrowDy, arrowDx) * 180) / Math.PI;

  // Speed based on intensity - faster = more traffic (slower base for better visibility)
  // Attack paths animate faster (2x speed) to draw attention
  const baseDuration = Math.max(3, length / 80);
  const duration = isAttackPath ? baseDuration * 0.4 :
                   trafficIntensity === 'high' ? baseDuration * 0.7 :
                   trafficIntensity === 'low' ? baseDuration * 1.3 : baseDuration;

  // More particles for attack paths and higher traffic
  const particleCount = isAttackPath ? 6 : trafficIntensity === 'high' ? 5 : trafficIntensity === 'medium' ? 3 : 2;
  const particleOffsets = Array.from({ length: particleCount }, (_, i) => i / particleCount);

  // Heatmap color calculation - RISK-BASED (not traffic volume)
  // Risk gradient: green (safe) → yellow (warning) → orange (high) → red (critical)
  const getHeatmapColor = (ratio: number): string => {
    if (ratio <= 0.2) return '#22c55e'; // green - safe
    if (ratio <= 0.4) return '#84cc16'; // lime - low risk
    if (ratio <= 0.6) return '#eab308'; // yellow - medium risk
    if (ratio <= 0.8) return '#f97316'; // orange - high risk
    return '#ef4444'; // red - critical risk
  };

  // Colors based on state - attack paths use red, heatmap overrides normal colors.
  // Plane color (when set) overrides the default "active=blue / default=slate"
  // — it's only consulted in explicit-edges mode (Phase 1 refactor). Attack
  // path red + heatmap still win; operators need attack signals to read first.
  const planeLine = planeColor; // may be undefined
  const planeP = planeGlow ?? planeColor;

  // 2026-05-28 — Phase 2 V1 slice 3 (edge semantic states). When the
  // consumer flagged this flow as locked (AWS-required relationship
  // the operator can't remove — HAS_INSTANCE_PROFILE, ASSUMES_ROLE,
  // USES_ROLE), render it as observed-but-static: lower-saturation
  // slate-emerald, no particle animation, slightly thinner. Distinct
  // from observed-remediable (animated bright) and from config-derived
  // (gray dotted, already handled by ghosted/inactive branches).
  // Cross-consumer safe: non-attacker callers leave flowData.isLocked
  // undefined; the override is then no-op.
  //
  // 2026-05-30 (FE follow-up #7): in explicit-edges mode (the active
  // canvas path for ATTACKER VIEW) the producer hands the renderer a
  // CanvasEdge instead of a TrafficFlow, and CanvasEdge has no
  // `isLocked` field — that was only on TrafficFlow. To keep PR #77's
  // 3-state encoding from being dead code on the new render path,
  // mirror the producer's isLockedEdgeType locally: derive lock from
  // the relationship name. List MUST stay in sync with the producer at
  // components/attack-paths-v2/attacker-view-panel.tsx::isLockedEdgeType.
  const isLockedRelationship = (rel: string | null | undefined): boolean => {
    if (!rel) return false;
    const R = rel.toUpperCase();
    return (
      R === 'HAS_INSTANCE_PROFILE' ||
      R === 'USES_ROLE' ||
      R === 'ASSUMES_ROLE' ||
      R === 'ASSUMES_ROLE_ACTUAL' ||
      R === 'USED_IDENTITY' ||
      R === 'HAS_POLICY'
    );
  };
  const isLockedFlow =
    (!!flowData?.isLocked || (!!edgeData && isLockedRelationship(edgeData.relationship)))
    && isActive && !isAttackPath && !heatmapMode;
  const lineColor = heatmapMode && !isAttackPath
    ? getHeatmapColor(heatmapRatio)
    : isAttackPath ? 'var(--canvas-danger)'
      : isHighlighted ? 'var(--canvas-observed)'
      : planeLine ?? (isActive ? 'var(--color-primary)' : 'var(--canvas-config)');
  const particleColor = isAttackPath ? 'var(--canvas-danger)'
    : isHighlighted ? 'var(--canvas-observed)'
    : heatmapMode ? getHeatmapColor(heatmapRatio)
    : isLockedFlow ? 'var(--canvas-config)'  // configured/locked gray (AWS-required)
    : planeP ?? 'var(--color-primary)';
  const glowColor = isAttackPath ? 'var(--canvas-danger)'
    : isHighlighted ? 'var(--canvas-observed)'
    : heatmapMode ? getHeatmapColor(heatmapRatio)
    : isLockedFlow ? 'var(--canvas-config)'  // softer treatment for locked
    : planeP ?? 'var(--color-primary)';

  // Heatmap stroke width - thicker = higher risk
  const heatmapStrokeWidth = heatmapMode && !isAttackPath ? 2 + (heatmapRatio * 8) : undefined;

  // Path-dominance overrides (2026-06-11 design review). When the map
  // renders a selected attack path (pathFilter), ONE color dominates:
  // on-path edges read var(--canvas-danger); laterals demote to a muted
  // gray (var(--canvas-config) at 0.4 — 3-color discipline: lateral is
  // CONTEXT, not a fourth color family competing with the red spine);
  // everything else fades to the border gray.
  // Highest precedence — wins over heatmap / plane / v2 styling. All
  // four consts are undefined/false when pathDominance is undefined
  // (non-pathFilter consumers → zero behavior change).
  const pathDominantLineColor =
    pathDominance === 'dominant' ? 'var(--canvas-danger)'
    : pathDominance === 'lateral' ? 'var(--canvas-config)'
    : pathDominance === 'faded' ? 'var(--color-border)'
    : undefined;
  const pathDominantStrokeWidth =
    pathDominance === 'dominant' ? 3.5
    : pathDominance === 'lateral' ? 1.5
    : pathDominance === 'faded' ? 1
    : undefined;
  // 2026-06-11 rebalance: raised floors (lateral 0.3→0.45, faded
  // 0.25→0.4) — context edges must stay readable, just quieter than
  // the spine.
  // Dominant pinned to 1 so the hero line can never inherit the V2
  // lateral dim (0.25 group opacity) when onPathEdgeIds and the
  // dominance pair-keys disagree about an edge.
  const pathDominantOpacity =
    pathDominance === 'dominant' ? 1
    : pathDominance === 'lateral' ? 0.45
    : pathDominance === 'faded' ? 0.4
    : undefined;
  const pathSuppressAnimation =
    pathDominance === 'lateral' || pathDominance === 'faded';
  // Single-narrative gate (2026-06-11): when the spine is active
  // (pathDominance defined), the LEGACY attack-path red treatment
  // (pulsing 14px glow, "10,5" red dash, oversized particles) must not
  // render alongside the dominance spine — two red systems compete.
  // legacyAttack carries isAttackPath styling only outside spine mode.
  const spineActive = pathDominance !== undefined;
  const legacyAttack = isAttackPath && !spineActive;
  // Spine-mode LIFE (2026-06-11 rebalance — "add colors, add live").
  // The single-narrative gate killed ALL motion in spine mode; founder
  // feedback: the map looked dead. Parallel spine treatment (NOT a
  // re-enable of the legacy overlays — no pulsing rings, no cyan):
  //   spineDominant      → marching-dash overlay + soft glow + particles
  //                        on the hero red line.
  //   spineLiveObserved  → edges with OBSERVED live traffic (isActive
  //                        encodes observed+bytes/hits) keep animated
  //                        GREEN particles even in spine mode when
  //                        they're on-path or lateral — live evidence
  //                        is the product's core signal. Locked AWS-
  //                        required flows stay static by design;
  //                        inferred edges never animate (honesty).
  const spineDominant = pathDominance === 'dominant';
  const spineLiveObserved =
    (pathDominance === 'dominant' || pathDominance === 'lateral') &&
    isActive && !isLockedFlow && !edgeData?.inferred;
  // Particle hue in spine mode: green when live evidence flows on this
  // edge (observed wins — it's the core signal), danger red otherwise
  // on the dominant spine.
  const spineParticleColor = spineLiveObserved
    ? 'var(--canvas-observed)'
    : spineDominant
      ? 'var(--canvas-danger)'
      : undefined;

  // Ghosted (outside spotlight / heatmap radius). 2026-06-23: changed
  // from opacity={0.08} (faintly visible) to NULL — when the spotlight
  // is active with a single path selected, every architecture edge
  // whose endpoints aren't both on the path was rendering as a
  // background line. With 3000+ flow edges the canvas became an
  // unreadable tangle even at 8% opacity. Hiding entirely is the only
  // way to honor "see ONLY this path's flow" — anything visible at all
  // is noise the operator has to filter mentally.
  if (ghosted) {
    return null;
  }

  // V2-3 (2026-05-31): top-level opacity for the dim layer + DOM data
  // attributes for empirical verification (DOM-probe pattern). When
  // canvasV2=false the data attribute defaults to "v1" so spot-checks
  // can distinguish legacy from V2 render without trusting CSS pixel
  // diffs.
  //
  // V2-6 (2026-06-01): multi-channel lateral differentiation. See memory
  // pattern_multi_channel_visual_differentiation. The previous single-
  // channel fix (stroke #64748b only) blended with on-path cyan because
  // slate-500 has cool-blue undertones — operators read laterals as
  // visually equivalent to on-path. New encoding: lateral edges differ
  // from on-path in FOUR channels (hue + width + dash pattern + opacity)
  // always. The dim/bright toggle (showLaterals) now moves opacity + dash
  // rhythm WITHIN the lateral class, never spanning the class boundary.
  //
  // Lateral state — three-valued:
  //   'on-path'  : edge is on the highlighted attack path (or canvasV2
  //                is off entirely). planeColor + solid + width 2 + full opacity.
  //   'dim'      : lateral edge with showLaterals=false (default).
  //                Maximally demoted; visible but clearly subordinate.
  //   'bright'   : lateral edge with showLaterals=true (operator opted
  //                in to see laterals). Still visually a lateral —
  //                different hue / width / pattern from on-path — but
  //                higher opacity + denser dash rhythm than 'dim'.
  // lateralState is derivable from the existing (canvasV2, isOnPath, dim)
  // props — no new prop needed. The producer (ConnectionLinesSVG) already
  // computes `dim = canvasV2 && !isOnPath && !showLaterals`, so:
  //   on-path  : !canvasV2 OR isOnPath
  //   dim      : canvasV2 + !isOnPath + dim (showLaterals=false default)
  //   bright   : canvasV2 + !isOnPath + !dim (showLaterals=true)
  const lateralState: 'on-path' | 'dim' | 'bright' =
    !canvasV2 || isOnPath
      ? 'on-path'
      : (dim ? 'dim' : 'bright')

  // Channel 1: hue. Lateral neutral zinc-400 (no cool-blue undertone that
  // collides with cyan on-path). On-path keeps planeColor.
  // Channel 2: stroke-opacity (applied on the group element via
  // v2GroupOpacity so it multiplies cleanly through inferred-edge dashes
  // and other path treatments).
  // Channel 3: stroke-width.
  // Channel 4: stroke-dasharray. attack-path's "10,5" and inferred's
  // "6,4" still win (set in the <path> element directly); lateral dash
  // applies when neither override is active.
  // Canvas v3 Slice C — crossing-internet edges (IGW/NAT route) get a
  // rose stroke override so they read as "this edge exits the AWS
  // backbone to the public internet" without text. Stays-private (VPCE
  // route) keeps the on-path planeColor so the contrast carries the
  // security signal. Per pattern_partition_boundaries_carry_security_state
  // — the boundary lives on the edge color when no explicit boundary
  // line is drawn (Slice C minimal version; full layout repartition is
  // a follow-up).
  const crossesInternet =
    routePrecedence ? !routePrecedence.isPrivate : false
  const crossingStrokeOverride = crossesInternet ? 'var(--canvas-danger)' : undefined
  const v2StrokeOverride =
    crossingStrokeOverride ??
    (lateralState === 'on-path' ? undefined : 'var(--canvas-lateral)')
  const v2GroupOpacity =
    lateralState === 'dim'    ? 0.25
    : lateralState === 'bright' ? 0.65
    : 1
  const v2LateralStrokeWidth =
    lateralState === 'dim'    ? 1
    : lateralState === 'bright' ? 1.5
    : undefined
  const v2LateralDasharray =
    lateralState === 'dim'    ? '4 4'
    : lateralState === 'bright' ? '6 3'
    : undefined
  // V2-4: verb chip mapping for on-path edges (canvasV2 + isOnPath).
  // 1-3 word labels at edge midpoint so the chain reads like a
  // sentence. Falls back to a lowercased rel name when no specific
  // mapping is defined. Lateral edges get NO chip (user's discipline:
  // chips on the eye's primary read, dim everything else).
  const verbForRelationship = (rel?: string): string | null => {
    if (!rel) return null
    const R = rel.toUpperCase()
    const map: Record<string, string> = {
      ASSUMES_ROLE: "assumes",
      ASSUMES_ROLE_ACTUAL: "assumes",
      USES_ROLE: "uses",
      HAS_INSTANCE_PROFILE: "via profile",
      HAS_POLICY: "has policy",
      ACCESSES_RESOURCE: "accesses",
      ACTUAL_S3_ACCESS: "reads",
      ACTUAL_API_CALL: "calls API",
      ACTUAL_TRAFFIC: "sends traffic to",
      READS_FROM: "reads",
      WRITES_TO: "writes",
      RUNTIME_CALLS: "calls",
      ROUTES_VIA: "via VPCE",
      IN_VPC: "in VPC",
      RUNS_IN_VPC: "in VPC",
      IN_SUBNET: "in subnet",
      ATTACHED_TO_SG: "uses SG",
      APPLIES_TO: "applies",
      // V2-4.1: USED_IDENTITY semantically describes the API call's
      // authenticated identity (CloudTrail "the call was made AS this
      // role"). "assumes" reads more naturally in the chain sentence
      // than the previous "as" — operators parse "X assumes Y" as the
      // pivot, not "X as Y" which reads like a label.
      USED_IDENTITY: "assumes",
      SECURED_BY: "secured by",
    }
    if (map[R]) return map[R]
    // Fallback: lowercase + space-separated, capped at 18 chars
    const friendly = R.toLowerCase().replace(/_/g, " ")
    return friendly.length > 18 ? friendly.slice(0, 17) + "…" : friendly
  }
  // Canvas v3 Slice A: extend the verb-chip with the route-precedence
  // suffix when this edge carries data-plane access to a destination
  // whose route resolved to a specific gateway. Example label transform:
  //   "reads"  →  "reads · via VPCE · s3 · private"
  //   "calls API"  →  "calls API · via IGW · public"
  // The chip becomes the EDGE'S label, not a separate annotation beside
  // the destination card. Per pattern_geometry_must_match_label, the
  // label reinforces the flow line — it sits on the line itself via the
  // existing Bezier-at-t=0.5 midpoint math.
  //
  // De-dup discipline: gateway.kindLabel sometimes already carries the
  // service hint (e.g. "VPCE · s3" from build-attacker-architecture.ts
  // assemblers), so appending serviceHint a second time would produce
  // "VPCE · s3 · s3". Only add the serviceHint suffix when kindLabel
  // doesn't already contain it.
  const baseVerb =
    canvasV2 && isOnPath && !dim && edgeData
      ? verbForRelationship(edgeData.relationship)
      : null
  const precedenceSuffix = routePrecedence
    ? (() => {
        const klabel = routePrecedence.gateway.kindLabel
        const hint = routePrecedence.gateway.serviceHint
        const serviceSegment =
          hint && !klabel.toLowerCase().includes(hint.toLowerCase())
            ? ` · ${hint}`
            : ""
        const privacy = routePrecedence.isPrivate ? "private" : "public"
        return ` · via ${klabel}${serviceSegment} · ${privacy}`
      })()
    : ""
  const verbChipLabel = baseVerb
    ? `${baseVerb}${precedenceSuffix}`
    : null
  return (
    <g
      data-canvas-mode={canvasV2 ? "v2" : "v1"}
      data-edge-onpath={canvasV2 ? (isOnPath ? "true" : "false") : undefined}
      // data-edge-dim kept for backward compat with any existing e2e probes
      // (PR #82-era). data-laterals is the canonical attribute going forward
      // — tri-state, distinguishes 'dim' vs 'bright' vs 'on-path' for DOM-probe
      // verification of the multi-channel encoding (PR for V2-6).
      data-edge-dim={canvasV2 && lateralState === 'dim' ? "true" : undefined}
      data-laterals={canvasV2 ? lateralState : undefined}
      // Canvas v3 Slice A — route-precedence anchored on edge (not card).
      // Stamped on the SVG group wrapping the edge + its chip so DOM
      // probes can verify "the chip is on the flow line."
      data-route-precedence-via={
        routePrecedence
          ? routePrecedence.isPrivate ? "private" : "public"
          : undefined
      }
      data-route-precedence-gateway-id={routePrecedence?.gateway.id}
      data-chip-anchored-on-edge={routePrecedence ? "true" : undefined}
      // Canvas v3 Slice B — when this edge has a waypoint resolved, the
      // path geometrically passes through the gateway node. The stamp
      // lets DOM probes confirm geometry (not just label) matches the
      // route-precedence claim per pattern_geometry_must_match_label.
      data-edge-via-gateway={
        waypoint && routePrecedence ? routePrecedence.gateway.id : undefined
      }
      // Canvas v3 Slice C — Internet-partition crossing classification.
      // true  → traffic exits via IGW/NAT/EIGW (public internet)
      // false → traffic stays on AWS backbone via VPCE
      // undefined → no route-precedence resolved (chip absent)
      // Drives the rose-stroke + crossing chip per pattern_partition_
      // boundaries_carry_security_state. Operators can DOM-probe for
      // [data-crosses-internet="true"] to find public-egress edges.
      data-crosses-internet={
        routePrecedence
          ? routePrecedence.isPrivate ? "false" : "true"
          : undefined
      }
      data-path-dominance={pathDominance}
      style={{ opacity: pathDominantOpacity ?? v2GroupOpacity, transition: "opacity 200ms ease-out" }}
    >
      {/* Glow effect for active lines and attack paths.
       *  Uses pathD so curves get glowed along their actual shape.
       *  Locked observed flows (Phase 2 V1 slice 3) skip the glow —
       *  they read as static observed presence, not animated traffic. */}
      {(spineDominant || ((isActive || isAttackPath) && !isLockedFlow && !pathSuppressAnimation)) && (
        <path
          d={pathD}
          fill="none"
          stroke={pathDominance === 'dominant' ? 'var(--canvas-danger)' : glowColor}
          strokeWidth={legacyAttack ? 14 : isHighlighted ? 12 : spineDominant ? 9 : 6}
          opacity={legacyAttack ? 0.5 : isHighlighted ? 0.4 : spineDominant ? 0.3 : 0.2}
          strokeLinecap="round"
          // 2026-06-11 rebalance: ONE tasteful glow on the hero spine —
          // CSS drop-shadow in the danger token, dominant edges only.
          style={spineDominant ? { filter: 'drop-shadow(0 0 4px var(--canvas-danger))' } : undefined}
        >
          {legacyAttack && (
            <animate
              attributeName="opacity"
              values="0.5;0.3;0.5"
              dur="1.5s"
              repeatCount="indefinite"
            />
          )}
        </path>
      )}

      {/* Main line — straight in legacy flow mode, Bezier curve in
       *  explicit-edges mode so lines bend around unrelated cards
       *  rather than bisecting them.
       *
       *  Stroke style precedence (most-specific first):
       *    1. attack path → red dashed (operator-critical signal)
       *    2. inferred service-plane edge (e.g. VPCE→S3 derived from
       *       VPCE.service_name) → dashed, same color as solid so the
       *       direction stays readable; provenance via line style not
       *       palette (Greenlight 2026-05-30 constraint #1). Hover
       *       tooltip shows inferred_reason.
       *    3. observed/config edge → solid.
       */}
      <path
        d={pathD}
        fill="none"
        stroke={pathDominantLineColor ?? v2StrokeOverride ?? lineColor}
        strokeWidth={
          pathDominantStrokeWidth
            ?? heatmapStrokeWidth
            ?? v2LateralStrokeWidth
            ?? (legacyAttack ? 4 : isHighlighted ? 3 : 2)
        }
        strokeLinecap="round"
        strokeDasharray={
          // Precedence (most-specific first):
          //   1. attack path → red dashed "10,5" (operator-critical signal)
          //   2. inferred edge → "6,4" (provenance via line style not palette)
          //   3. lateral edge → "4 4" dim / "6 3" bright (V2-6 multi-channel)
          //   4. observed/config on-path → solid
          legacyAttack
            ? "10,5"
            : edgeData?.inferred
              ? "6,4"
              // Dominant spine stays SOLID even if the V2 lateral
              // classifier would dash it (2026-06-11 rebalance).
              : spineDominant
                ? undefined
                : v2LateralDasharray ?? undefined
        }
        className="transition-all duration-300"
      >
        {edgeData?.inferred && edgeData.inferred_reason && (
          <title>Inferred edge — {edgeData.inferred_reason}</title>
        )}
        {/*
          2026-05-30 (FE follow-up #7): when the producer threaded
          first_seen / last_seen onto the CanvasEdge (PR #76's feature),
          surface them as a native browser <title> tooltip on the SVG
          path. The legacy TrafficFlow hover-panel (line ~4586) carries
          a richer pill UI; that fires only in flow-mode. Explicit-edges
          mode has no equivalent pill — a <title> is the lightest
          honest path to make the temporal evidence visible. Skips when
          the inferred-edge title already claimed the slot OR neither
          timestamp is populated.
        */}
        {!edgeData?.inferred && edgeData && (edgeData.first_seen || edgeData.last_seen) && (
          <title>
            {[
              edgeData.last_seen ? `Last seen ${edgeData.last_seen}` : null,
              edgeData.first_seen ? `First seen ${edgeData.first_seen}` : null,
            ].filter(Boolean).join(' · ')}
          </title>
        )}
      </path>

      {/* 2026-06-11 rebalance: marching-dash overlay on the dominant
       *  spine. A slightly wider dashed stroke in the same danger token
       *  rides on top of the solid hero line; the animated dashoffset
       *  (SMIL — same pattern as attacker-canvas-v2) makes bright pulses
       *  travel toward the crown jewel. Parallel spine treatment, NOT
       *  the legacyAttack "10,5" dash system. */}
      {spineDominant && animate && (
        <path
          d={pathD}
          fill="none"
          stroke="var(--canvas-danger)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray="5 16"
          opacity={0.55}
          pointerEvents="none"
          data-spine-march="true"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-42"
            dur="1.4s"
            repeatCount="indefinite"
          />
        </path>
      )}

      {/* V2-4 (2026-05-31): verb chip at edge midpoint, on-path
       *  edges only. Reads like a sentence when the operator scans
       *  left-to-right: "root assumes alon-demo-ec2-role accesses
       *  cyntro-demo-prod-data". Lateral edges intentionally get no
       *  chip (user discipline: chips on the eye's primary read).
       *
       *  Midpoint math: for curved edges use the cubic Bezier value
       *  at t=0.5 (B(0.5) = 0.125 P0 + 0.375 P1 + 0.375 P2 + 0.125 P3).
       *  For straight legacy lines fall back to the simple midpoint.
       *  Background rect renders behind the text so the chip stays
       *  readable on top of other lines / canvas chrome. */}
      {verbChipLabel && (() => {
        const midX = useCurve
          ? 0.125 * x1 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * x2
          : (x1 + x2) / 2
        const midY = useCurve
          ? 0.125 * y1 + 0.375 * cy1 + 0.375 * cy2 + 0.125 * y2
          : (y1 + y2) / 2
        // Approximate text width from char count (no canvas
        // measurement available in SSR-safe SVG). 6.5px per char at
        // font-size 10 is conservative.
        const labelW = verbChipLabel.length * 6.5 + 10
        return (
          <g
            data-verb-chip="true"
            data-verb-chip-text={verbChipLabel}
            pointerEvents="none"
          >
            <rect
              x={midX - labelW / 2}
              y={midY - 8}
              width={labelW}
              height={14}
              rx={4}
              ry={4}
              fill="var(--canvas-node-bg)"
              stroke="var(--canvas-node-border)"
              strokeWidth={0.5}
              opacity={0.92}
            />
            <text
              x={midX}
              y={midY + 2}
              textAnchor="middle"
              fontSize={10}
              fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
              fill="var(--canvas-label)"
              letterSpacing={0.2}
            >
              {verbChipLabel}
            </text>
          </g>
        )
      })()}

      {/* Animated particles - always show when animate is true.
       *  Suppressed for inferred service-plane edges — those are
       *  derived, not observed, and animating them would lie about
       *  having traffic evidence we don't have.
       *
       *  V2-6: also suppressed for lateral edges (dim OR bright).
       *  Lateral edges represent context, not the chain's primary
       *  traffic — animating them would compete with the on-path
       *  particles for the operator's eye and contradict the
       *  multi-channel demotion (lower opacity + dashed pattern
       *  signals "not the primary read"). */}
      {/* 2026-06-11 rebalance: spine mode gets its own particle gates —
       *  dominant spine edges always flow (red, or green when observed);
       *  lateral edges with OBSERVED live traffic keep their green
       *  particles (live evidence must visibly flow). Inferred edges
       *  still never animate. */}
      {((animate && !isLockedFlow && !edgeData?.inferred && lateralState === 'on-path' && !pathSuppressAnimation) ||
        (animate && !edgeData?.inferred && (spineDominant || spineLiveObserved))) && (
        <>
          {/* Define the path for animation — same shape as the visible
           *  line so the particles follow the curve. */}
          <path
            id={pathId}
            d={pathD}
            fill="none"
            stroke="transparent"
          />

          {/* Main particles - larger and more prominent for attack paths */}
          {particleOffsets.map((offset, i) => (
            <g key={i}>
              {/* Outer glow */}
              <circle r={legacyAttack ? 10 : isHighlighted ? 8 : 6} fill={spineParticleColor ?? glowColor} opacity={legacyAttack ? 0.5 : 0.3}>
                <animateMotion
                  dur={`${duration}s`}
                  repeatCount="indefinite"
                  begin={`${offset * duration}s`}
                >
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
              {/* Core particle */}
              <circle r={legacyAttack ? 7 : isHighlighted ? 5 : 4} fill={spineParticleColor ?? particleColor} opacity={1}>
                <animateMotion
                  dur={`${duration}s`}
                  repeatCount="indefinite"
                  begin={`${offset * duration}s`}
                >
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
              {/* Inner bright core */}
              <circle r={legacyAttack ? 3 : isHighlighted ? 2 : 1.5} fill="#ffffff" opacity={0.9}>
                <animateMotion
                  dur={`${duration}s`}
                  repeatCount="indefinite"
                  begin={`${offset * duration}s`}
                >
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
            </g>
          ))}
        </>
      )}

      {/* Hover label.
       *  Legacy flow mode: shows the first port (or "TCP").
       *  Explicit-edges mode: shows the relationship type (e.g.
       *  "ACTUAL_S3_ACCESS"), or port if it's a network-plane edge with
       *  a port populated. The relationship type is the most honest
       *  signal an operator wants when hovering — it tells them WHICH
       *  graph edge this is, not just an inferred protocol.
       */}
      {isHighlighted && (flowData || edgeData) && (
        (() => {
          let label = 'TCP';
          if (edgeData) {
            // Prefer port for network-plane edges, relationship for the rest
            if (edgeData.port != null) label = String(edgeData.port);
            else label = edgeData.relationship;
          } else if (flowData && flowData.ports.length > 0) {
            label = flowData.ports[0] || 'TCP';
          }
          // Width scales with label length so long relationship strings
          // ("HAS_INSTANCE_PROFILE") don't overflow the pill.
          const padX = 8;
          const charW = 7;
          const w = Math.max(60, label.length * charW + padX * 2);
          return (
            <g>
              <rect
                x={(x1 + x2) / 2 - w / 2}
                y={(y1 + y2) / 2 - 14}
                width={w}
                height="28"
                rx="6"
                fill="var(--canvas-node-bg)"
                stroke={particleColor}
                strokeWidth="2"
              />
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 + 5}
                textAnchor="middle"
                className="text-[11px] fill-[var(--canvas-label)] font-mono font-bold"
              >
                {label}
              </text>
            </g>
          );
        })()
      )}

      {/* Arrow at end — rotation follows the curve tangent at (x2,y2)
       *  in explicit-edges mode (so the arrow points along the curve's
       *  end direction, not along the straight source→target chord)
       *  and matches the straight chord in legacy flow mode. */}
      <polygon
        points={`${x2},${y2} ${x2 - 12},${y2 - 6} ${x2 - 12},${y2 + 6}`}
        fill={pathDominantLineColor ?? lineColor}
        transform={`rotate(${arrowAngleDeg}, ${x2}, ${y2})`}
      />
    </g>
  );
}

// ============================================
// CONNECTION LINES SVG
// ============================================
// Stable empty-set sentinels — using `= new Set()` defaults on every
// render created fresh references, which differed across renders, which
// fired the useEffect with the new Set as a dep, which called setLines,
// which caused a re-render — "Maximum update depth exceeded" loop. Module
// scope constants share identity across renders so the deps don't churn.
const EMPTY_EDGE_SET: ReadonlySet<string> = new Set<string>();
const EMPTY_NODE_SET: ReadonlySet<string> = new Set<string>();

export function ConnectionLinesSVG({
  architecture,
  hoveredId,
  containerRef,
  animate,
  attackPathEdges = EMPTY_EDGE_SET as Set<string>,
  heatmapMode = false,
  ghostedNodeIds = EMPTY_NODE_SET as Set<string>,
  canvasV2 = false,
  showLaterals = false,
  layoutEpoch = 0,
  showAllConnections = false,
}: {
  architecture: SystemArchitecture;
  hoveredId: string | null;
  containerRef: React.RefObject<HTMLDivElement>;
  animate: boolean;
  attackPathEdges?: Set<string>;
  heatmapMode?: boolean;
  ghostedNodeIds?: Set<string>;
  // V2-3 (2026-05-31): when canvasV2 is true and showLaterals is
  // false, edges whose CanvasEdge.id is NOT in architecture.
  // onPathEdgeIds render at ~30% opacity (path is the hero). When
  // showLaterals flips true, all edges render at full opacity. When
  // canvasV2 is false (legacy), both flags are no-ops.
  canvasV2?: boolean;
  showLaterals?: boolean;
  // 2026-06-11 (identity token): callers bump this when they swap lane
  // DOM outside of architecture changes (e.g. the spine-mode identity
  // token ↔ detailed-stack toggle) so line endpoints re-measure. Any
  // changing scalar works — included in the measure effect's deps.
  layoutEpoch?: number;
  // 2026-06-25: connection-density toggle. When false (the new
  // default), only render flows that touch the hovered chip OR sit
  // on an attack-path edge. Operator-facing rationale: the canvas
  // was rendering 400+ polylines on alon-prod (every EC2 → every SG
  // → every role → every resource), producing visual spaghetti and
  // dragging the layout pass on 40-EC2 systems. Toggle to true to
  // restore the legacy "show every flow" behavior — accessible via
  // the "Connections" toolbar button.
  showAllConnections?: boolean;
}) {
  const [lines, setLines] = useState<Array<{
    x1: number; y1: number; x2: number; y2: number;
    /** Legacy flow-synthesized line. Present when this segment came from
     *  the `architecture.flows[]` zigzag path. Mutually exclusive with
     *  `edge` — exactly one of the two is set per line. */
    flow?: TrafficFlow;
    /** Explicit-edges line. Present when this segment came from
     *  `architecture.edges[]` (Phase 1 contract). Carries the original
     *  CanvasEdge so the renderer can color by plane and label with the
     *  relationship type on hover. */
    edge?: CanvasEdge;
    /** Plane classification (only set in explicit-edges mode). Drives
     *  line color in AnimatedTrafficLine. */
    plane?: EdgePlane;
    /** Endpoint ids for the original edge (so isHighlighted can match
     *  the hoveredId against source/target without re-deriving from
     *  flow.sourceId / edge.source_aws_id). */
    sourceId: string;
    targetId: string;
    isHighlighted: boolean;
    isActive: boolean;
    trafficIntensity: 'low' | 'medium' | 'high';
    isAttackPath: boolean;
  }>>([]);

  // Calculate traffic intensity thresholds. In explicit-edges mode,
  // intensity is driven by per-edge bytes/hit_count (only data-plane
  // edges carry these); legacy flow mode keeps the prior behavior.
  const maxBytes = useMemo(() => {
    if (architecture.edges && architecture.edges.length > 0) {
      const all = architecture.edges.map(e => (e.bytes ?? 0));
      return Math.max(...all, 1);
    }
    return Math.max(...architecture.flows.map(f => f.bytes), 1);
  }, [architecture.flows, architecture.edges]);

  const getTrafficIntensity = useCallback((bytes: number): 'low' | 'medium' | 'high' => {
    const ratio = bytes / maxBytes;
    if (ratio > 0.6) return 'high';
    if (ratio > 0.2) return 'medium';
    return 'low';
  }, [maxBytes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateLines = () => {
      if (!container) return;

      const getNodeCenter = (el: Element | null, side: 'left' | 'right'): { x: number; y: number } | null => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        return {
          x: side === 'right' ? rect.right - containerRect.left - 6 : rect.left - containerRect.left + 6,
          y: rect.top + rect.height / 2 - containerRect.top,
        };
      };

      const newLines: typeof lines = [];

      // ─── EXPLICIT-EDGES MODE ─────────────────────────────────────────
      // Phase 1 (2026-05-25): when the caller provides `architecture.edges`,
      // bypass the legacy flow-synthesis zigzag entirely. Each edge becomes
      // ONE line (1:1 with the data), colored by its conceptual plane so a
      // single observed call can't be drawn through both Role and IGW on
      // the same polyline. The fabrication-class bug this fixes is
      // attacker-view-panel.tsx routing every flow through pathCheckpoints,
      // which bundled identity + network checkpoints onto one SVG path.
      // See feedback_test_both_sides_of_a_partition.md.
      if (architecture.edges && architecture.edges.length > 0) {
        // Generic node lookup — try every data-*-id selector the lane
        // renderers attach. Order doesn't matter for correctness; densest
        // selectors first shortens the hot path.
        //
        // 2026-06-24: also require the card to actually be visible.
        // PR #203 added `hidden` (display:none) to off-path cards
        // during spotlight, but querySelector still returns them as
        // DOM elements. Their getBoundingClientRect() is 0x0 at the
        // viewport origin, which would draw orphan lines into the
        // canvas top-left. `offsetParent === null` is the cheapest
        // reliable visibility check (set by browser for elements
        // whose computed display is none).
        const findCardForId = (awsId: string): Element | null => {
          if (!container) return null;
          const selectors = [
            'data-compute-id',
            'data-resource-id',
            'data-role-id',
            'data-ip-id',
            'data-sg-id',
            'data-nacl-id',
            'data-gateway-id',
            'data-vpce-id',
            'data-api-id',
            'data-subnet-id',
            'data-entry-id',
            'data-canvas-node-id',
          ];
          for (const attr of selectors) {
            const el = container.querySelector(`[${attr}="${CSS.escape(awsId)}"]`);
            if (el && (el as HTMLElement).offsetParent !== null) return el;
          }
          return null;
        };

        // Track endpoint-not-rendered drops for the debug log — keeps
        // the canvas honest by surfacing edges that point at nodes the
        // layout chose not to render. Counted, not invented.
        let droppedEndpoints = 0;

        for (const edge of architecture.edges) {
          const sourceEl = findCardForId(edge.source_aws_id);
          const targetEl = findCardForId(edge.target_aws_id);
          if (!sourceEl || !targetEl) {
            droppedEndpoints++;
            continue;
          }
          const sourcePos = getNodeCenter(sourceEl, 'right');
          const targetPos = getNodeCenter(targetEl, 'left');
          if (!sourcePos || !targetPos) {
            droppedEndpoints++;
            continue;
          }

          // Inferred service-plane edges (VPCE→S3 etc) override
          // plane to data so the line color matches the surrounding
          // observed data-flow edges (Greenlight constraint #1).
          const plane: EdgePlane = edge.inferred ? 'data' : planeForString(edge.relationship);
          const isHighlighted =
            hoveredId === edge.source_aws_id || hoveredId === edge.target_aws_id;
          // Animation gate: ONLY data-plane edges animate, AND only when
          // they carry actual observation (observed=true and bytes>0 or
          // hit_count>0). Identity- and network-plane edges never
          // animate — config relationships don't carry packets and
          // animating them was the visual misread that made operators
          // think Role/IGW lines were "live traffic".
          const isActive =
            plane === 'data' &&
            edge.observed === true &&
            ((edge.bytes ?? 0) > 0 || (edge.hit_count ?? 0) > 0);
          const trafficIntensity = getTrafficIntensity(edge.bytes ?? 0);
          const isAttackPath =
            attackPathEdges.has(`${edge.source_aws_id}->${edge.target_aws_id}`) ||
            attackPathEdges.has(`${edge.target_aws_id}->${edge.source_aws_id}`);

          newLines.push({
            x1: sourcePos.x,
            y1: sourcePos.y,
            x2: targetPos.x,
            y2: targetPos.y,
            edge,
            plane,
            sourceId: edge.source_aws_id,
            targetId: edge.target_aws_id,
            isHighlighted,
            isActive,
            trafficIntensity,
            isAttackPath,
          });
        }

        // Plane-breakdown log — operators can correlate "I see N purple
        // lines / M teal / K orange" against the data via the console.
        const byPlane = newLines.reduce(
          (acc, ln) => {
            const p = ln.plane ?? 'unknown';
            acc[p] = (acc[p] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );
        console.log(
          `[ConnectionLinesSVG] explicit-edges: ${newLines.length} lines drawn, ${droppedEndpoints} dropped. Breakdown:`,
          byPlane
        );
        setLines(newLines);
        return; // Skip legacy flow synthesis entirely.
      }

      // ─── LEGACY FLOW MODE (synthesized zigzag) ───────────────────────
      // Fallback path for callers that haven't been migrated to the
      // explicit-edges contract (System Map, exfil-view, attacker-view-v3,
      // path-analysis-panel, identity-attack-paths). They still pass
      // architecture.flows with sgId/naclId/.../egressGatewayId, and we
      // route a polyline through those checkpoints in order. This block
      // will be removed once all callers migrate.
      architecture.flows.forEach(flow => {
        // 2026-06-25: density gate. By default we ONLY draw lines that
        // either touch the hovered chip OR sit on an active attack-path
        // edge. The toolbar "Connections" toggle flips showAllConnections
        // to restore the legacy "every flow always" rendering for power
        // users. This kills the 400-polyline spaghetti the operator
        // complained about on alon-prod's Topology open.
        if (!showAllConnections) {
          const onPath =
            attackPathEdges.has(`${flow.sourceId}->${flow.targetId}`) ||
            attackPathEdges.has(`${flow.targetId}->${flow.sourceId}`);
          const touchesHover = hoveredId != null && (
            hoveredId === flow.sourceId || hoveredId === flow.targetId ||
            hoveredId === flow.sgId || hoveredId === flow.naclId ||
            hoveredId === flow.roleId || hoveredId === flow.egressGatewayId ||
            hoveredId === flow.vpceId ||
            hoveredId === `api-${flow.targetId}`
          );
          if (!onPath && !touchesHover) return;
        }

        // Source resolution: prefer compute, fall back to IAM role for
        // IAM-only paths (no workload code ran — e.g. AWS service roles
        // assumed by AWS itself, like AWSServiceRoleForResourceExplorer
        // calling GetObject on an S3 bucket). For those paths, the
        // synthesized flow's sourceId IS the role id; without this
        // fallback the line-drawing returned early and the operator saw
        // the IAM/API/Resource columns visually disconnected.
        //
        // 2026-05-25: also accept egress gateways as flow sources for
        // the EXFIL view (gateway → Internet destination flows). The
        // target-side gateway fallback already existed; mirror it on
        // the source side so the destination card isn't left orphaned
        // when the gateway is the upstream end of a synthesized flow.
        let sourceEl = container.querySelector(`[data-compute-id="${flow.sourceId}"]`);
        if (!sourceEl) {
          sourceEl = container.querySelector(`[data-role-id="${flow.sourceId}"]`);
        }
        if (!sourceEl) {
          sourceEl = container.querySelector(`[data-gateway-id="${flow.sourceId}"]`);
        }
        if (!sourceEl) {
          sourceEl = container.querySelector(`[data-entry-id="${flow.sourceId}"]`);
        }
        // Target lookup — primary is data-resource-id (the lane that holds
        // the crown-jewel / S3 / RDS cards). 2026-05-24 extension:
        // gateway-targeted flows (Internet → IGW) need
        // data-gateway-id as a target option too, otherwise the line
        // drawing returns early on a gateway terminus and the Internet
        // card stays orphaned even after we synthesize the source.
        let targetEl = container.querySelector(`[data-resource-id="${flow.targetId}"]`);
        if (!targetEl) {
          targetEl = container.querySelector(`[data-gateway-id="${flow.targetId}"]`);
        }
        // 2026-05-25: also accept IAM role + InstanceProfile cards as
        // flow targets. The EXFIL view synthesizes jewel → accessor
        // flows where the accessor is an IAMRole; without this
        // fallback ConnectionLinesSVG returned early on those flows
        // and the operator saw the jewel + accessors disconnected.
        if (!targetEl) {
          targetEl = container.querySelector(`[data-role-id="${flow.targetId}"]`);
        }
        if (!targetEl) {
          targetEl = container.querySelector(`[data-ip-id="${flow.targetId}"]`);
        }
        const sgEl = flow.sgId ? container.querySelector(`[data-sg-id="${flow.sgId}"]`) : null;
        const naclEl = flow.naclId ? container.querySelector(`[data-nacl-id="${flow.naclId}"]`) : null;
        // IP card carries both data-ip-id (preferred, new) and data-role-id
        // (back-compat). Query data-ip-id first so the IP checkpoint can
        // be distinguished from the role checkpoint even when both share
        // an underlying SecurityCheckpoint type.
        const ipEl = flow.instanceProfileId
          ? container.querySelector(`[data-ip-id="${flow.instanceProfileId}"]`)
          : null;
        const roleEl = flow.roleId ? container.querySelector(`[data-role-id="${flow.roleId}"]`) : null;
        // Find API call node for this target resource
        const apiEl = container.querySelector(`[data-api-id="${flow.targetId}"]`);
        // VPC endpoint hop — sits between API/IAM and the target. For an S3
        // Gateway VPCE, this is the actual egress point from the VPC; the
        // SG never gates Gateway-VPCE traffic, so showing the VPCE in the
        // polyline is how the operator sees why a 0-rule SG still permits
        // S3 access.
        const vpceEl = flow.vpceId ? container.querySelector(`[data-vpce-id="${flow.vpceId}"]`) : null;
        // Egress gateway hop — IGW / NAT / EgressOnlyIGW / TGW. Routed
        // AFTER the role hop and BEFORE the VPCE/target so the
        // polyline reads EC2 → SG → NACL → Role → IGW → S3.
        // Without this, the IGW chip renders as an orphan box even when
        // the path header reports observed bytes that genuinely flowed
        // through it (the 2026-05-23 audit's "egress orphan" issue).
        const igwEl = flow.egressGatewayId ? container.querySelector(`[data-gateway-id="${flow.egressGatewayId}"]`) : null;

        const sourcePos = getNodeCenter(sourceEl, 'right');
        const targetPos = getNodeCenter(targetEl, 'left');

        if (!sourcePos || !targetPos) return;

        const isHighlighted = hoveredId === flow.sourceId || hoveredId === flow.targetId ||
          hoveredId === flow.sgId || hoveredId === flow.naclId || hoveredId === flow.roleId ||
          hoveredId === flow.egressGatewayId ||
          hoveredId === `api-${flow.targetId}`;
        // Respect the per-flow isActive flag rather than hardcoding true.
        //
        // 2026-05-22 credibility audit fix: previously isActive was
        // hardcoded to true for every line, meaning a compute→resource
        // flow we synthesized with bytes=0 (because no direct
        // compute→resource edge exists in the path) STILL rendered as
        // an animated live blue line. Operator saw fake activity.
        //
        // Now we respect flow.isActive — applyPathFilter sets it
        // explicitly per (source, target) based on whether a direct
        // observed edge exists. Default-true preserves legacy flows
        // that don't set the field (System Map / Topology view).
        const isActive = flow.isActive !== false;
        const trafficIntensity = getTrafficIntensity(flow.bytes);

        // Check if this edge is part of an attack path
        const isAttackPath = attackPathEdges.has(`${flow.sourceId}->${flow.targetId}`) ||
                            attackPathEdges.has(`${flow.targetId}->${flow.sourceId}`);

        // Build checkpoint chain: Compute -> SG -> NACL -> IAM -> API -> Resource
        const checkpoints: { el: Element; posL: { x: number; y: number }; posR: { x: number; y: number } }[] = [];

        if (sgEl) {
          const posL = getNodeCenter(sgEl, 'left');
          const posR = getNodeCenter(sgEl, 'right');
          if (posL && posR) checkpoints.push({ el: sgEl, posL, posR });
        }
        if (naclEl) {
          const posL = getNodeCenter(naclEl, 'left');
          const posR = getNodeCenter(naclEl, 'right');
          if (posL && posR) checkpoints.push({ el: naclEl, posL, posR });
        }
        // InstanceProfile sits BEFORE the role hop. AWS chain shape:
        // EC2 → SG → NACL → IP → Role → resource. Drawing it here makes
        // the polyline pass through the IP card instead of bypassing it
        // and leaving the IP visually disconnected.
        if (ipEl) {
          const posL = getNodeCenter(ipEl, 'left');
          const posR = getNodeCenter(ipEl, 'right');
          if (posL && posR) checkpoints.push({ el: ipEl, posL, posR });
        }
        if (roleEl) {
          const posL = getNodeCenter(roleEl, 'left');
          const posR = getNodeCenter(roleEl, 'right');
          if (posL && posR) checkpoints.push({ el: roleEl, posL, posR });
        }
        // Add API call checkpoint after IAM role
        if (apiEl) {
          const posL = getNodeCenter(apiEl, 'left');
          const posR = getNodeCenter(apiEl, 'right');
          if (posL && posR) checkpoints.push({ el: apiEl, posL, posR });
        }
        // VPC endpoint hop — last gate before the AWS service / bucket.
        if (vpceEl) {
          const posL = getNodeCenter(vpceEl, 'left');
          const posR = getNodeCenter(vpceEl, 'right');
          if (posL && posR) checkpoints.push({ el: vpceEl, posL, posR });
        }
        // Egress gateway hop — IGW / NAT / etc. when traffic exits the
        // VPC to a public-endpoint service (S3 without a Gateway VPCE,
        // any non-AWS internet destination). Sits at the END of the
        // checkpoint chain so the line draws Role → IGW → target.
        // The 2026-05-23 audit specifically called this the single
        // biggest UI inconsistency: orphan IGW card while the path
        // header showed 771 KB observed bytes through it.
        if (igwEl) {
          const posL = getNodeCenter(igwEl, 'left');
          const posR = getNodeCenter(igwEl, 'right');
          if (posL && posR) checkpoints.push({ el: igwEl, posL, posR });
        }

        // Endpoint ids attached to every segment of this flow so the
        // new line state shape (which requires sourceId/targetId) is
        // satisfied for legacy callers too.
        const flowSourceId = flow.sourceId;
        const flowTargetId = flow.targetId;

        // Draw lines through all checkpoints
        if (checkpoints.length > 0) {
          // Source to first checkpoint
          newLines.push({ x1: sourcePos.x, y1: sourcePos.y, x2: checkpoints[0].posL.x, y2: checkpoints[0].posL.y, flow, sourceId: flowSourceId, targetId: flowTargetId, isHighlighted, isActive, trafficIntensity, isAttackPath });

          // Between checkpoints
          for (let i = 0; i < checkpoints.length - 1; i++) {
            newLines.push({ x1: checkpoints[i].posR.x, y1: checkpoints[i].posR.y, x2: checkpoints[i + 1].posL.x, y2: checkpoints[i + 1].posL.y, flow, sourceId: flowSourceId, targetId: flowTargetId, isHighlighted, isActive, trafficIntensity, isAttackPath });
          }

          // Last checkpoint to target
          const lastCheckpoint = checkpoints[checkpoints.length - 1];
          newLines.push({ x1: lastCheckpoint.posR.x, y1: lastCheckpoint.posR.y, x2: targetPos.x, y2: targetPos.y, flow, sourceId: flowSourceId, targetId: flowTargetId, isHighlighted, isActive, trafficIntensity, isAttackPath });
        } else {
          // Direct line if no checkpoints
          newLines.push({ x1: sourcePos.x, y1: sourcePos.y, x2: targetPos.x, y2: targetPos.y, flow, sourceId: flowSourceId, targetId: flowTargetId, isHighlighted, isActive, trafficIntensity, isAttackPath });
        }
      });

      // Debug: Log line creation
      console.log('[ConnectionLinesSVG] Lines created:', newLines.length);
      if (newLines.length === 0 && architecture.flows.length > 0) {
        console.log('[ConnectionLinesSVG] DEBUG - No lines created but flows exist!');
        architecture.flows.forEach(f => {
          const sourceEl = container.querySelector(`[data-compute-id="${f.sourceId}"]`);
          const targetEl = container.querySelector(`[data-resource-id="${f.targetId}"]`);
          console.log(`  Flow ${f.sourceId} -> ${f.targetId}:`);
          console.log(`    sourceEl found: ${!!sourceEl}`);
          console.log(`    targetEl found: ${!!targetEl}`);
        });
      }

      setLines(newLines);
    };

    updateLines();
    window.addEventListener('resize', updateLines);
    // Also update on scroll within container
    const scrollHandler = () => updateLines();
    container?.addEventListener('scroll', scrollHandler);
    return () => {
      window.removeEventListener('resize', updateLines);
      container?.removeEventListener('scroll', scrollHandler);
    };
  }, [architecture, hoveredId, containerRef, getTrafficIntensity, attackPathEdges, layoutEpoch, showAllConnections]);

  // Attack-path dominance (2026-06-11 design review). Gate: presence of
  // architecture.pathStepByNodeId — produced only when a pathFilter is
  // active (applyPathFilter, or the architectureOverride+pathFilter
  // branch in TrafficFlowMap via the shared derivePathDominance helper),
  // so non-pathFilter consumers never enter this branch.
  //   dominant : explicit pathEdges pair match OR both flow endpoints in
  //              the path's node set → single hero color, on top.
  //   lateral  : exactly one endpoint on the path (pivot context).
  //   faded    : neither endpoint on the path.
  const pathDominanceActive =
    !!architecture.pathStepByNodeId && architecture.pathStepByNodeId.size > 0;
  const dominanceForLine = (
    sourceId: string,
    targetId: string,
  ): 'dominant' | 'lateral' | 'faded' | undefined => {
    if (!pathDominanceActive) return undefined;
    const pairs = architecture.pathEdgePairKeys;
    if (pairs?.has(`${sourceId}->${targetId}`) || pairs?.has(`${targetId}->${sourceId}`)) {
      return 'dominant';
    }
    const nodes = architecture.onPathNodeIds;
    const srcOn = !!nodes?.has(sourceId);
    const tgtOn = !!nodes?.has(targetId);
    if (srcOn && tgtOn) {
      // Single-path enforcement (2026-06-11): both-endpoints-on-path is
      // NOT sufficient for 'dominant'. Screenshot evidence showed
      // branches entering the role from two directions reading as two
      // equally-valid red paths. 'dominant' now requires a CONSECUTIVE
      // spine hop — explicit pathEdgePairKeys match (above), or step
      // numbers differing by exactly 1. Non-consecutive on-path pairs
      // (shortcut/branch edges) demote to lateral context.
      const steps = architecture.pathStepByNodeId;
      const srcStep = steps?.get(sourceId);
      const tgtStep = steps?.get(targetId);
      if (
        srcStep !== undefined &&
        tgtStep !== undefined &&
        Math.abs(srcStep - tgtStep) === 1
      ) {
        return 'dominant';
      }
      return 'lateral';
    }
    if (srcOn || tgtOn) return 'lateral';
    return 'faded';
  };

  return (
    // width/height="100%" is REQUIRED — SVG's intrinsic default is 300x150
    // and `inset-0` only zeroes top/right/bottom/left, it does not stretch
    // the SVG to its container the way it does for divs. Without these
    // attrs the connection lines render clipped into the top-left 300x150
    // corner of the container, invisible past the first column. This
    // manifested in the Egress Flow Map as "SG cards present but no
    // lines drawn through them."
    <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: 1 }}>
      {/* Render non-highlighted lines first, then attack paths, then highlighted on top */}
      {lines
        .sort((a, b) => {
          // Attack paths render on top of normal lines; in pathFilter
          // mode the dominant path edges render on top of everything.
          const aScore = (a.isAttackPath ? 2 : 0) + (a.isHighlighted ? 1 : 0)
            + (dominanceForLine(a.sourceId, a.targetId) === 'dominant' ? 4 : 0);
          const bScore = (b.isAttackPath ? 2 : 0) + (b.isHighlighted ? 1 : 0)
            + (dominanceForLine(b.sourceId, b.targetId) === 'dominant' ? 4 : 0);
          return aScore - bScore;
        })
        .map((line, i) => {
          const isGhosted = ghostedNodeIds.size > 0 && (
            ghostedNodeIds.has(line.sourceId) || ghostedNodeIds.has(line.targetId)
          );
          // Risk-based heatmap ratio. In explicit-edges mode the flow
          // bundle isn't available, so heatmap falls back to a lighter
          // attack-path-only scoring — heatmap remains a feature of the
          // System Map / legacy flow callers; explicit-edges mode prefers
          // honest plane colors over a synthetic risk gradient.
          let riskRatio = 0;
          if (heatmapMode) {
            let riskScore = 0;
            if (line.isAttackPath) riskScore += 0.4;
            if (line.flow) {
              const sg = line.flow.sgId ? architecture.securityGroups.find(s => s.id === line.flow!.sgId) : null;
              if (sg?.rules?.some(r => r.isPublic)) riskScore += 0.3;
              if (sg && sg.gapCount > 0) riskScore += 0.2;
              if (!line.flow.naclId) riskScore += 0.1;
              if (!line.flow.roleId) riskScore += 0.1;
              riskScore += (line.flow.bytes / maxBytes) * 0.1;
            } else if (line.edge) {
              // Edge-mode heatmap: only data-plane edges contribute traffic
              // weight; identity/network edges add a flat 0.1 if not on the
              // attack path (no SG/NACL bundle to read).
              const b = line.edge.bytes ?? 0;
              riskScore += (b / maxBytes) * 0.1;
            }
            riskRatio = Math.min(1, riskScore);
          }
          // Plane-driven color in explicit-edges mode. Undefined for legacy
          // flow lines — AnimatedTrafficLine falls back to its prior
          // active/default color resolution.
          const planeColor = line.plane ? PLANE_COLOR[line.plane] : undefined;
          const planeGlow = line.plane ? PLANE_GLOW[line.plane] : undefined;
          // V2-3: derive on-path-ness from architecture.onPathEdgeIds.
          // When canvasV2 + !showLaterals + not-on-path → dim.
          // When canvasV2 is off, isOnPath stays true (no dimming).
          const isOnPath = !canvasV2
            ? true
            : line.edge && architecture.onPathEdgeIds
              ? architecture.onPathEdgeIds.has(line.edge.id)
              : true
          const dim = canvasV2 && !isOnPath && !showLaterals
          // Canvas v3 Slice A — anchor the route-precedence chip on the
          // edge whose target is the destination. Look up by the line's
          // targetId against architecture.resources (which carries the
          // NodeType the precedence function needs). Only on-path data-
          // plane edges carry the chip; lateral / context edges stay
          // unannotated. Per pattern_geometry_must_match_label — the
          // chip lives on the edge that represents the access, not on
          // the destination card.
          const isDataPlaneAccess =
            line.edge?.relationship === "ACCESSES_RESOURCE" ||
            line.edge?.relationship === "ACTUAL_S3_ACCESS" ||
            line.edge?.relationship === "ACTUAL_API_CALL" ||
            line.edge?.relationship === "ACTUAL_TRAFFIC" ||
            line.edge?.relationship === "READS_FROM" ||
            line.edge?.relationship === "WRITES_TO" ||
            line.edge?.relationship === "RUNTIME_CALLS"
          const targetResource = isDataPlaneAccess
            ? architecture.resources.find((r) => r.id === line.targetId)
            : undefined
          const linePrecedence =
            isOnPath && targetResource && architecture.egressGateways.length > 0
              ? derivePrecedenceForDestination(
                  targetResource,
                  architecture.egressGateways,
                )
              : null
          // Canvas v3 Slice B — when the edge has a resolved gateway,
          // look up the gateway's DOM center so AnimatedTrafficLine can
          // route the path geometrically through it. The lookup uses
          // the existing data-gateway-id stamps in the lane render. Per
          // pattern_geometry_must_match_label — chip claims "via VPCE",
          // geometry must show line passing through the VPCE node.
          let lineWaypoint: { x: number; y: number } | null = null;
          if (linePrecedence && containerRef.current) {
            const containerEl = containerRef.current;
            const gatewayEl = containerEl.querySelector(
              `[data-gateway-id="${linePrecedence.gateway.id}"]`,
            );
            if (gatewayEl) {
              const gRect = gatewayEl.getBoundingClientRect();
              const cRect = containerEl.getBoundingClientRect();
              lineWaypoint = {
                x: gRect.left + gRect.width / 2 - cRect.left,
                y: gRect.top + gRect.height / 2 - cRect.top,
              };
            }
          }
          return (
            <AnimatedTrafficLine
              key={`line-${i}-${line.sourceId}-${line.targetId}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              isActive={line.isActive}
              isHighlighted={line.isHighlighted}
              isAttackPath={line.isAttackPath}
              flowData={line.flow}
              edgeData={line.edge}
              planeColor={planeColor}
              planeGlow={planeGlow}
              animate={heatmapMode ? false : animate}
              trafficIntensity={line.trafficIntensity}
              heatmapMode={heatmapMode}
              heatmapRatio={riskRatio}
              ghosted={isGhosted}
              canvasV2={canvasV2}
              isOnPath={isOnPath}
              dim={dim}
              routePrecedence={linePrecedence}
              waypoint={lineWaypoint}
              pathDominance={dominanceForLine(line.sourceId, line.targetId)}
            />
          );
        })}
    </svg>
  );
}

// ============================================
// MAIN UNIFIED ARCHITECTURE DIAGRAM
// ============================================
export function UnifiedArchitectureDiagram({
  architecture,
  animate,
  onSelectService,
  attackPaths = [],
  selectedAttackPath,
  onSelectAttackPath,
  heatmapMode = false,
  ghostedNodeIds = new Set<string>(),
  spotlightActiveNodeIds = new Set<string>(),
  highlightedNodeId,
  showVPCBoundaries = false,
  pathMode = false,
  exfilByWorkloadId,
  innerTitleOverride,
  innerSubtitleOverride,
  observedMode = false,
  onRoleClick,
  jewelEmphasis = false,
  jewelSeverity,
  canvasV2 = false,
  showLaterals = false,
  entryNodeId,
  showAllConnections = false,
}: {
  architecture: SystemArchitecture;
  animate: boolean;
  onSelectService: (service: ServiceNode | SecurityCheckpoint, type: 'compute' | 'resource' | 'security_group' | 'nacl' | 'iam_role' | 'instance_profile' | 'api_call') => void;
  attackPaths?: AttackPath[];
  selectedAttackPath?: string | null;
  onSelectAttackPath?: (pathId: string | null) => void;
  heatmapMode?: boolean;
  ghostedNodeIds?: Set<string>;
  /** Positive on-path check (2026-06-23 hotfix). Negative-via-ghosted
   *  ringed nodes outside the architecture lanes by accident — fixed
   *  by passing the spotlight's active set through directly. */
  spotlightActiveNodeIds?: Set<string>;
  highlightedNodeId?: string | null;
  showVPCBoundaries?: boolean;
  // chunk #1.5: forwarded from TrafficFlowMap so compute ServiceNodeBox
  // can render the exfil chip. Optional — Topology tab supplies nothing.
  exfilByWorkloadId?: Record<string, NodeExfilSummary>;
  // When true (Attack Paths page), single-click on a node should open
  // the parent's remediation modal instead of the internal "service
  // details" popup. Compute/resource/iam/nacl already fire onSelectService
  // on click — only the SG card was using onToggle (expand rules) on click;
  // in path mode we promote `onDetails` to single-click on the SG card too.
  pathMode?: boolean;
  // Inner header overrides — forwarded from TrafficFlowMap. Data Leak
  // Paths overrides with egress-flavored copy.
  innerTitleOverride?: string;
  innerSubtitleOverride?: string;
  // When true, suppress the "(simulated)" tag and the Gaps badge —
  // caller is feeding real observed telemetry.
  observedMode?: boolean;
  // 2026-05-27 — forwarded from TrafficFlowMap. When set, role chip
  // clicks fire this instead of the existing service-selection
  // modal. Lets the EXFIL view render its own role detail panel.
  onRoleClick?: (role: SecurityCheckpoint) => void;
  // 2026-05-28 — Phase 2 V1 slice 1. When true, resource nodes flagged
  // as crown jewels render visibly heavier (scale + persistent
  // emerald glow). Opt-in per consumer; ATTACKER VIEW turns it on.
  // System Map, Per-Path View, Exfil View leave it off (default) so
  // their visual stays unchanged. No layout change, no new lanes —
  // pure visual weight emphasis on the existing jewel card.
  jewelEmphasis?: boolean;
  // V2-2 (2026-05-31): severity-driven halo color for the crown jewel
  // card. Undefined → emerald (legacy). CRITICAL/HIGH/MEDIUM → red /
  // orange / amber. See TrafficFlowMap.jewelSeverity for the full
  // rationale. The forward through here is just plumbing.
  jewelSeverity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string;
  // V2-3 (2026-05-31): canvas-v2 visual layer master switch + the
  // "Show laterals" toggle state. When canvasV2 is true and
  // showLaterals is false, lateral edges/nodes render at ~30%
  // opacity (path is hero). When showLaterals is true, laterals
  // brighten to full opacity. When canvasV2 is false (legacy), both
  // flags are no-ops. Forward from TrafficFlowMap.
  canvasV2?: boolean;
  showLaterals?: boolean;
  // V2-2b (2026-05-31): the id of the chain's hop[0] node — the
  // attacker's entry point. When canvasV2 is on AND a card with
  // matching id renders, an "ENTRY POINT" chip overlays the top-
  // right corner so the eye lands on the start of the story before
  // following edges to the jewel. Undefined → no overlay.
  entryNodeId?: string;
  // 2026-06-25 density toggle — forwarded from TrafficFlowMap. When
  // false (default), ConnectionLinesSVG only renders flows that touch
  // the hovered chip or sit on an active attack path. Toggling true
  // restores legacy "every flow always" rendering. See the toolbar
  // "Connections" button + the prop declaration on ConnectionLinesSVG.
  showAllConnections?: boolean;
}) {
  const [hoveredId, setHoveredIdLocal] = useState<string | null>(null);
  const setHoveredId = useCallback((id: string | null) => setHoveredIdLocal(id), []);
  const effectiveHoveredId = highlightedNodeId || hoveredId;
  const [expandedSG, setExpandedSG] = useState<string | null>(null);
  // Identity risk token (2026-06-11, spine mode only): false = on-path
  // roles render as the compact IdentityRiskToken; true = the operator
  // clicked "details" and the full role/profile/policy card stack
  // renders. No-op outside spine mode (pathFilterActive false).
  const [identityDetailOpen, setIdentityDetailOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get nodes that are part of attack paths for highlighting
  const attackPathNodeIds = useMemo(() => {
    const ids = new Set<string>();
    attackPaths.forEach(path => {
      path.nodes.forEach(n => ids.add(n.id));
    });
    return ids;
  }, [attackPaths]);

  // Get edges that are part of attack paths for highlighting
  const attackPathEdges = useMemo(() => {
    const edges = new Set<string>();
    attackPaths.forEach(path => {
      path.edges.forEach(edge => {
        // Create edge key from source -> target
        edges.add(`${edge.source}->${edge.target}`);
        // Also add reverse key for bidirectional matching
        edges.add(`${edge.target}->${edge.source}`);
      });
    });
    return edges;
  }, [attackPaths]);

  // Attack-path dominance on node cards (2026-06-11 design review).
  // architecture.pathStepByNodeId is set only when a pathFilter is
  // active (applyPathFilter, or the architectureOverride+pathFilter
  // branch via derivePathDominance), so everything below is a no-op
  // for the full System Map / Topology / EXFIL consumers. On-path cards get a subtle danger ring + a
  // numbered step badge (1 = entry, N = crown jewel); off-path cards
  // dim to 70% — extending the existing "Laterals: dim" discipline to
  // pathFilter mode instead of inventing a second dimming system.
  const pathStepById = architecture.pathStepByNodeId;
  const pathStepsTotal = useMemo(
    () => (pathStepById && pathStepById.size > 0 ? Math.max(...pathStepById.values()) : 0),
    [pathStepById],
  );
  const pathFilterActive = pathStepsTotal > 0;
  const isOnSelectedPath = useCallback(
    (nodeId: string): boolean =>
      !!(pathStepById?.has(nodeId) || architecture.onPathNodeIds?.has(nodeId)),
    [pathStepById, architecture.onPathNodeIds],
  );
  // Returns a class suffix (leading space) for a card wrapper.
  //
  // 2026-06-24 (operator override v2): HIDE off-path nodes entirely
  // when a spotlight/path filter is active. PR #202 tried full-opacity
  // for off-path nodes; operator response: "we need to see only the
  // path's components — remove all other services, no dim, REMOVE."
  //
  // Now:
  //   - Spotlight active + node on path → ring + shadow (visible spine)
  //   - Spotlight active + node off path → `hidden` (display:none, gone)
  //   - Legacy pathFilterActive + on path → red ring
  //   - Legacy pathFilterActive + off path → `hidden`
  //   - No spotlight + no path filter → '' (everything visible, no
  //     emphasis — the architecture-only view)
  //
  // Pairs with PR #196's edge-hide (lines to hidden nodes already
  // filtered out via ghostedNodeIds). Headers like "COMPUTE (40)" stay
  // showing the unfiltered count for now — operator can still see
  // "this system has 40 EC2s, but only 1 is on this path."
  const pathEmphasisClass = useCallback(
    (nodeId: string): string => {
      if (spotlightActiveNodeIds && spotlightActiveNodeIds.size > 0) {
        if (spotlightActiveNodeIds.has(nodeId)) {
          return ' rounded-xl ring-2 ring-amber-400/60 shadow-md';
        }
        return ' hidden';
      }
      if (!pathFilterActive) return '';
      return isOnSelectedPath(nodeId)
        ? ' rounded-xl ring-2 ring-[color:var(--canvas-danger)]/50 shadow-md'
        : ' hidden';
    },
    [pathFilterActive, isOnSelectedPath, spotlightActiveNodeIds],
  );

  // 2026-06-24: when a spotlight/path is active, column headers should
  // NOT show "(40)" / "(4)" / "(28)" — those counts reflect the whole
  // system inventory, but the columns are filtering to only the path's
  // visible nodes. Showing "COMPUTE (40)" next to a single visible
  // EC2 card is misleading. Drop the suffix during spotlight.
  const spotlightActive = (spotlightActiveNodeIds?.size ?? 0) > 0 || pathFilterActive;
  const countLabel = useCallback(
    (n: number) => (spotlightActive ? '' : ` (${n})`),
    [spotlightActive],
  );
  // Per-column visibility: when spotlight is active, hide a whole
  // column if NONE of its items are on the path. Eliminates the
  // empty "VPC ENDPOINTS (4)" header with no card under it that the
  // operator flagged in 2026-06-24 screenshot.
  const anyVisibleOnPath = useCallback(
    (items: ReadonlyArray<{ id?: string | null }>): boolean => {
      if (!spotlightActive) return true;
      if (pathFilterActive) {
        return items.some(i => i.id && isOnSelectedPath(i.id));
      }
      return items.some(i => i.id && spotlightActiveNodeIds!.has(i.id));
    },
    [spotlightActive, pathFilterActive, isOnSelectedPath, spotlightActiveNodeIds],
  );
  const vpceLaneCounts = useMemo(() => {
    const endpoints = architecture.vpcEndpoints ?? [];
    if (!endpoints.length) return null;
    const activeVpceIds = new Set(
      architecture.flows.map((f) => f.vpceId).filter(Boolean) as string[],
    );
    return countVpceLane(
      endpoints.map((v) => v.id),
      activeVpceIds,
    );
  }, [architecture.vpcEndpoints, architecture.flows]);
  // Numbered step badge — absolute top-left of the card wrapper (which
  // must be position:relative). Renders only for nodes that are actual
  // ordered path steps; rescued gates (SG/NACL that touch the path but
  // aren't BFS steps) get the ring but no number.
  //
  // absorbedIds (2026-06-11, identity-token follow-up): when a card
  // consolidates other path nodes (the spine-mode IdentityRiskToken
  // absorbs the on-path instance-profile/policy cards), pass their ids
  // so the badge shows the full step RANGE ("2–3") instead of leaving
  // a gap in the map's numbering (1, 3, 4…). Same range style as the
  // kill-chain strip's collapsed NETWORK segment.
  const renderPathStepBadge = (nodeId: string, absorbedIds?: string[]) => {
    if (!pathFilterActive) return null;
    const steps = [nodeId, ...(absorbedIds ?? [])]
      .map((id) => pathStepById?.get(id))
      .filter((s): s is number => s !== undefined)
      .sort((a, b) => a - b);
    if (steps.length === 0) return null;
    const lo = steps[0];
    const hi = steps[steps.length - 1];
    const label = lo === hi ? String(lo) : `${lo}–${hi}`;
    return (
      <div
        className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
        title={
          lo === hi
            ? `Step ${lo} of ${pathStepsTotal} on the attack path`
            : `Steps ${lo}–${hi} of ${pathStepsTotal} on the attack path (consolidated identity card)`
        }
        data-path-step={lo}
        data-path-step-end={lo === hi ? undefined : hi}
      >
        <div
          className={`${lo === hi ? 'w-[18px]' : 'px-1.5 min-w-[18px]'} h-[18px] rounded-full flex items-center justify-center text-[10px] font-semibold text-white shadow-md whitespace-nowrap`}
          style={{ backgroundColor: 'var(--canvas-danger)' }}
        >
          {label}
        </div>
      </div>
    );
  };

  // Identity-token derivations (2026-06-11, spine mode only).
  // identityCollapsed: the identity lane shows ONE compact token per
  // on-path role instead of the role+profile+policy stack. The
  // collapsed on-path profile/policy cards are NOT unmounted into
  // nothing — invisible anchor spans carrying their data-*-id attrs
  // render inside the first on-path role's token wrapper, so
  // ConnectionLinesSVG endpoint lookups still resolve (to the token's
  // box — keeping the EC2 → IP → Role spine geometrically continuous)
  // instead of dropping the edges or, worse, measuring a display:none
  // card as a 0×0 rect at the container origin.
  // First on-path REAL role (skip instance-profile ARNs that snuck into
  // iamRoles[] — they render as cards, not tokens, so they can't host
  // the collapsed anchors). If no such role exists, collapsing is
  // disabled entirely so on-path profile/policy cards never vanish
  // without a token to absorb their edge anchors.
  const firstOnPathRoleId = useMemo(
    () =>
      architecture.iamRoles.find(
        (r) =>
          isOnSelectedPath(r.id) &&
          !r.id.includes(':instance-profile/') &&
          !/instance.?profile/i.test(r.id),
      )?.id,
    [architecture.iamRoles, isOnSelectedPath],
  );
  const identityCollapsed =
    pathFilterActive && !identityDetailOpen && !!firstOnPathRoleId;
  const collapsedIdentityAnchors = useMemo(() => {
    if (!identityCollapsed) return [] as Array<{ id: string; kind: 'ip' | 'policy' }>;
    return [
      ...(architecture.instanceProfiles ?? [])
        .filter((ip) => isOnSelectedPath(ip.id))
        .map((ip) => ({ id: ip.id, kind: 'ip' as const })),
      ...(architecture.iamPolicies ?? [])
        .filter((p) => isOnSelectedPath(p.id))
        .map((p) => ({ id: p.id, kind: 'policy' as const })),
    ];
  }, [identityCollapsed, architecture.instanceProfiles, architecture.iamPolicies, isOnSelectedPath]);

  // Get vulnerability data for nodes
  const nodeVulnerabilities = useMemo(() => {
    const vulns = new Map<string, { cve_count: number; critical_cves: number }>();
    attackPaths.forEach(path => {
      path.nodes.forEach(n => {
        if (n.cve_count > 0 || n.critical_cves > 0) {
          const existing = vulns.get(n.id);
          if (!existing || n.cve_count > existing.cve_count) {
            vulns.set(n.id, { cve_count: n.cve_count, critical_cves: n.critical_cves });
          }
        }
      });
    });
    return vulns;
  }, [attackPaths]);

  // Debug: Log what the diagram receives
  useEffect(() => {
    console.log('[UnifiedArchitectureDiagram] Rendering with:', {
      computeServices: architecture.computeServices.length,
      resources: architecture.resources.length,
      flows: architecture.flows.length,
      securityGroups: architecture.securityGroups.length,
      flowDetails: architecture.flows.map(f => `${f.sourceId} -> ${f.targetId}`),
    });
  }, [architecture]);

  const computeFlowInfo = useMemo(() => {
    const info = new Map<string, { bytes: number; connections: number; ports: string[] }>();
    architecture.flows.forEach(f => {
      const existing = info.get(f.sourceId) || { bytes: 0, connections: 0, ports: [] };
      existing.bytes += f.bytes;
      existing.connections += f.connections;
      existing.ports = [...new Set([...existing.ports, ...f.ports])];
      info.set(f.sourceId, existing);
    });
    return info;
  }, [architecture.flows]);

  const resourceFlowInfo = useMemo(() => {
    const info = new Map<string, { bytes: number; connections: number; ports: string[] }>();
    architecture.flows.forEach(f => {
      const existing = info.get(f.targetId) || { bytes: 0, connections: 0, ports: [] };
      existing.bytes += f.bytes;
      existing.connections += f.connections;
      existing.ports = [...new Set([...existing.ports, ...f.ports])];
      info.set(f.targetId, existing);
    });
    return info;
  }, [architecture.flows]);

  const isNodeHighlighted = (nodeId: string): boolean => {
    if (!effectiveHoveredId) return false;
    if (nodeId === effectiveHoveredId) return true;
    return architecture.flows.some(f =>
      (f.sourceId === effectiveHoveredId && (f.targetId === nodeId || f.sgId === nodeId || f.roleId === nodeId)) ||
      (f.targetId === effectiveHoveredId && (f.sourceId === nodeId || f.sgId === nodeId || f.roleId === nodeId)) ||
      (f.sgId === effectiveHoveredId && (f.sourceId === nodeId || f.targetId === nodeId)) ||
      (f.roleId === hoveredId && (f.sourceId === nodeId || f.targetId === nodeId))
    );
  };

  return (
    <div className="relative bg-card rounded-2xl border border-border p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
            <Cloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">
              {innerTitleOverride ?? "System Architecture"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {innerSubtitleOverride ?? "Traffic flow from observed CloudTrail and VPC Flow Log events"}
            </p>
          </div>
          {/* LIVE indicator removed per the 2026-05-22 credibility audit.
              The badge was always rendered with an animated green pulse
              regardless of actual data age — combined with cached data
              and slow backend sync windows it could read LIVE when the
              graph was 30+ minutes stale. The outer TrafficFlowMap
              header already shows "Last sync: HH:MM:SS PM" and
              PAUSED/AUTO state, which conveys freshness honestly.
              Adding a separate inner "LIVE" badge with no freshness
              gating was misleading visual noise. */}
        </div>
        <div className="flex items-center gap-4 text-sm">
          {architecture.metricsBasis === "cloudtrail" ? (
            // CloudTrail data: bytes panel hidden (data source can't
            // observe payload size — rendering "0 B Traffic" lies by
            // implying "we saw no traffic"). Connections label is
            // "API calls" since the counter is CloudTrail hit_count.
            <div className="text-center px-3">
              <div className="text-blue-600 dark:text-blue-400 font-bold">{architecture.totalConnections.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">API calls</div>
            </div>
          ) : (
            <>
              <div className="text-center px-3">
                <div className="text-emerald-600 dark:text-emerald-400 font-bold">{formatBytes(architecture.totalBytes)}</div>
                <div className="text-[10px] text-muted-foreground">Traffic</div>
              </div>
              <div className="text-center px-3 border-l border-border">
                <div className="text-blue-600 dark:text-blue-400 font-bold">{architecture.totalConnections}</div>
                <div className="text-[10px] text-muted-foreground">Connections</div>
              </div>
            </>
          )}
          {architecture.totalGaps > 0 && !observedMode && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 rounded-lg border-l border-border">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <div>
                <div className="text-amber-600 dark:text-amber-400 font-bold">{architecture.totalGaps}</div>
                <div className="text-[10px] text-muted-foreground">Gaps</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Canvas v3 Slice C — Internet partition banner. Visible header
          showing the security boundary between AWS-backbone-routed
          traffic and public-internet-routed traffic. Renders the
          security claim's home (per pattern_partition_boundaries_carry_
          security_state) without requiring a full layout repartition.
          Counts of edges per side are computed from architecture.edges
          when present + the resolved route precedence for each.
          Banner suppressed when no destinations on path have route
          precedence (e.g. identity-only paths) — honest empty rather
          than rendering a meaningless boundary. */}
      {(() => {
        const resources = architecture.resources ?? []
        const gateways = architecture.egressGateways ?? []
        if (resources.length === 0 || gateways.length === 0) return null
        let privCount = 0
        let pubCount = 0
        for (const r of resources) {
          const rp = derivePrecedenceForDestination(r, gateways)
          if (!rp) continue
          if (rp.isPrivate) privCount++; else pubCount++;
        }
        if (privCount === 0 && pubCount === 0) return null
        return (
          <div
            className="mb-4 flex items-stretch gap-2 text-[10px] font-semibold uppercase tracking-wider"
            data-internet-partition="true"
            data-internet-partition-private-count={privCount}
            data-internet-partition-public-count={pubCount}
          >
            <div
              className={`flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg border ${
                privCount > 0
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                  : "bg-muted/30 border-border text-muted-foreground"
              }`}
              title="Traffic that stays inside the AWS backbone (VPCE-routed). Bytes never traverse the public internet."
            >
              <span className="flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
                AWS Backbone · private
              </span>
              <span className="font-mono text-[10px] opacity-80">{privCount} edge{privCount === 1 ? "" : "s"}</span>
            </div>
            <div className="self-center text-muted-foreground px-1">|</div>
            <div
              className={`flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg border ${
                pubCount > 0
                  ? "bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300"
                  : "bg-muted/30 border-border text-muted-foreground"
              }`}
              title="Traffic that exits via IGW/NAT/Egress-only IGW to the public internet. Bytes traverse the open internet."
            >
              <span className="flex items-center gap-1.5">
                <Globe className="w-3 h-3" />
                Public Internet · public
              </span>
              <span className="font-mono text-[10px] opacity-80">{pubCount} edge{pubCount === 1 ? "" : "s"}</span>
            </div>
          </div>
        )
      })()}

      {/* Main diagram. 2026-06-11 rebalance: spine views are sparse by
          design (one path, few cards) — the 450px floor left a dead
          band of empty canvas below the lanes. Lower floor in spine
          mode only. */}
      <div ref={containerRef} className={`relative ${pathFilterActive ? 'min-h-[320px]' : 'min-h-[450px]'}`}>
        {/* VPC Boundary boxes */}
        {showVPCBoundaries && architecture.vpcGroups && (
          <VPCBoundaries
            vpcGroups={architecture.vpcGroups}
            containerRef={containerRef as React.RefObject<HTMLDivElement>}
            visible={showVPCBoundaries}
          />
        )}
        <ConnectionLinesSVG
          architecture={architecture}
          hoveredId={effectiveHoveredId}
          containerRef={containerRef as React.RefObject<HTMLDivElement>}
          animate={animate}
          attackPathEdges={attackPathEdges}
          heatmapMode={heatmapMode}
          ghostedNodeIds={ghostedNodeIds}
          canvasV2={canvasV2}
          showLaterals={showLaterals}
          // Identity token toggle swaps the identity lane's DOM (token ↔
          // detailed stack) and shifts every card below it — bump the
          // epoch so line endpoints re-measure instead of waiting for
          // the next hover/scroll/resize.
          layoutEpoch={identityDetailOpen ? 1 : 0}
          showAllConnections={showAllConnections}
        />

        {/* When the path has no network controls at all — no subnets, no
            SGs, no NACLs — the three middle columns render as three
            empty cells that crush COMPUTE and IAM ROLES into the
            corners and make the path look like a bug rather than a
            real IAM-only attack path (e.g. a Lambda without VpcConfig
            calling an AWS service over the public API endpoint).
            Collapse to a single banner in that case so operators read
            "no network gate" as the security narrative, not as missing
            UI. The 3-col template gives COMPUTE and IAM ROLES room to
            breathe; API CALLS / RESOURCES on the row below adapt to
            whichever column count is active. */}
        <div
          // 2026-06-25: switched from CSS Grid to flex-row so every
          // lane (COMPUTE, SUBNETS, ROUTE-TABLES, SG, NACL, EGRESS-GW,
          // IDENTITY, API-CALLS, VPC-ENDPOINTS, RESOURCES) sits in a
          // single horizontal row. The old grid templates had 5-8
          // explicit columns; with up to 11 conditionally-rendered
          // lanes (ENTRY too on path mode), implicit-column auto-flow
          // started wrapping RESOURCES onto row 2, putting it
          // ~3500px below the rest of the canvas. ConnectionLinesSVG
          // dutifully drew the polylines but they spanned that whole
          // vertical distance — operators saw the source/role chips
          // and a VPCE chip but no visible line, because most of the
          // path ran off-screen down to the wrapped row.
          //
          // Flex-row with overflow-x-auto guarantees one row, with
          // horizontal scroll if the lane count overflows the
          // viewport. min-w-fit on each child (already present via
          // their flex-col + content widths) keeps lane chip widths
          // intact.
          //
          // The no-network case (the 3-col "no subnets/SGs/NACLs"
          // collapse) loses its centered-banner layout — that fallback
          // was a UI band-aid for IAM-only attack paths and is rarer
          // than the path-wraps-to-row-2 bug we're fixing. If needed,
          // reintroduce as a separate banner UI rather than a
          // template-switch.
          //
          // 2026-06-25 (visual hierarchy): flex-wrap lets the RESOURCES
          // lane explicitly take its own row via basis-full (see the
          // RESOURCES div className). Network architecture on top,
          // data resources/Crown Jewels visually separated below.
          // ConnectionLinesSVG re-measures on layout shifts; the line
          // density toggle already prevents the 3500px-polyline issue
          // by default.
          className="relative flex flex-row flex-wrap gap-6 items-start"
          style={{ zIndex: 2 }}
        >
          {/* ENTRY lane (Phase 2 — 2026-05-25). Leftmost column.
              Surfaces the attacker's entry point — Internet / IGW /
              ALB / APIGateway on the network side, root / IAMUser /
              federated principal on the identity side. Hidden when
              the path has no meaningful entry-point (lateral-only
              movement), so the grid doesn't grow a dead column on
              every chain.
              Principals are sourced from architecture.principals
              when entryPoints is unset (back-compat for older builds
              that haven't started populating entryPoints yet). */}
          {(() => {
            const entries = (architecture.entryPoints && architecture.entryPoints.length > 0)
              ? architecture.entryPoints
              : (architecture.principals || []);
            if (entries.length === 0) return null;
            return (
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4 text-cyan-700 dark:text-cyan-300" />
                  {architecture.entryLaneLabel ?? "Entry"}{countLabel(entries.length)}
                </div>
                {entries.map((node) => {
                  const isInAttackPath = attackPathNodeIds.has(node.id);
                  const isChainEntry = canvasV2 && entryNodeId && node.id === entryNodeId
                  return (
                    <div
                      key={`entry:${node.id}`}
                      data-entry-id={node.id}
                      data-compute-id={node.id}
                      data-chain-entry={isChainEntry ? "true" : undefined}
                      className={`relative mb-3${pathEmphasisClass(node.id)}`}
                    >
                      {renderPathStepBadge(node.id)}
                      {/* Legacy attack-path cyan ring + ENTRY chip — gated
                          off in spine mode (pathFilterActive): the numbered
                          spine badges + kill-chain strip ARE the narrative;
                          a second cyan/red overlay system competes with it. */}
                      {isInAttackPath && !pathFilterActive && (
                        <div className="absolute inset-0 rounded-xl pointer-events-none ring-2 ring-cyan-400/50" />
                      )}
                      {/* V2-2b: ENTRY POINT chip on hop[0]. Pinned to the
                          top-right corner so it doesn't fight the crown-jewel
                          marker (which lives top-left of the resource card).
                          Only renders when canvasV2 is on AND this node matches
                          the chain's hop[0] id passed via entryNodeId. */}
                      {isChainEntry && !pathFilterActive && (
                        <div className="absolute -top-2 -right-2 z-10 pointer-events-none">
                          <div className="px-1.5 py-0.5 rounded bg-cyan-500/90 text-cyan-950 text-[8px] font-semibold uppercase tracking-wider shadow-md ring-1 ring-cyan-300/60">
                            Entry
                          </div>
                        </div>
                      )}
                      <ServiceNodeBox
                        node={node}
                        position="left"
                        flowInfo={computeFlowInfo.get(node.id)}
                        isHighlighted={isNodeHighlighted(node.id)}
                        onHover={setHoveredId}
                        onClick={() => onSelectService(node, 'compute')}
                        spineMode={pathFilterActive}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* COMPUTE column.
              Workloads only — EC2/Lambda/ECS. Principals moved to the
              dedicated ENTRY lane above 2026-05-25.
              data-vpc-scoped-column anchors the VPC boundary's lane-based
              math (vpc-boundaries.tsx) — replaces the previous DOM-bounding-
              box-of-cards primitive that recurrently engulfed IAM/S3 cards
              when SG card heights grew. See pattern_recurring_cosmetic_fix_
              signals_wrong_primitive. */}
          <div className="flex flex-col gap-3" data-vpc-scoped-column="true" data-lane="compute">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Compute{countLabel(architecture.computeServices.length)}
            </div>
            {architecture.computeServices.map(node => {
              const vuln = nodeVulnerabilities.get(node.id);
              const isInAttackPath = attackPathNodeIds.has(node.id);
              const isChainEntry = canvasV2 && entryNodeId && node.id === entryNodeId
              return (
                <div
                  key={node.id}
                  data-compute-id={node.id}
                  data-chain-entry={isChainEntry ? "true" : undefined}
                  className={`relative${pathEmphasisClass(node.id)}`}
                >
                  {renderPathStepBadge(node.id)}
                  {/* Attack path vulnerability indicator — legacy overlay,
                      suppressed in spine mode (badge slot collides with the
                      numbered step badge; red ring competes with the spine). */}
                  {isInAttackPath && vuln && !pathFilterActive && (
                    <div className="absolute -top-2 -left-2 z-10">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-md ${
                        vuln.critical_cves > 0 ? 'bg-red-500 animate-pulse' : 'bg-orange-500'
                      }`}>
                        {vuln.cve_count}
                      </div>
                    </div>
                  )}
                  {isInAttackPath && !pathFilterActive && (
                    <div className={`absolute inset-0 rounded-xl pointer-events-none ${
                      vuln?.critical_cves ? 'ring-2 ring-red-500 animate-pulse' : 'ring-2 ring-orange-500/50'
                    }`} />
                  )}
                  {/* V2-2b: ENTRY POINT chip — same overlay as in the
                      entry/principals lane (some chains start in COMPUTE
                      with an EC2/Lambda hop[0] instead of root). Gated off
                      in spine mode — kill-chain strip carries ENTRY. */}
                  {isChainEntry && !pathFilterActive && (
                    <div className="absolute -top-2 -right-2 z-10 pointer-events-none">
                      <div className="px-1.5 py-0.5 rounded bg-cyan-500/90 text-cyan-950 text-[8px] font-semibold uppercase tracking-wider shadow-md ring-1 ring-cyan-300/60">
                        Entry
                      </div>
                    </div>
                  )}
                  <ServiceNodeBox
                    node={node}
                    position="left"
                    flowInfo={computeFlowInfo.get(node.id)}
                    isHighlighted={isNodeHighlighted(node.id)}
                    onHover={setHoveredId}
                    onClick={() => onSelectService(node, 'compute')}
                    exfilSummary={exfilByWorkloadId?.[node.id] ?? (node.instanceId ? exfilByWorkloadId?.[node.instanceId] : undefined)}
                    spineMode={pathFilterActive}
                  />
                  {/* Bug N AC2 (2026-06-22) — restore the InstanceProfile
                      name on the EC2 card as an inline sidecar chip. P1
                      removed the IP standalone Identity chips
                      (semantically correct — IPs are credential carriers,
                      not identities) but that hid the profile name from
                      the canvas. Find the attached profile by matching
                      attachedWorkloads[] against the node.id / instanceId
                      and render an amber "Profile: …" badge below the
                      EC2 chip. Click → still opens the profile in the
                      detail panel via onSelectService. */}
                  {(() => {
                    const profiles = architecture.instanceProfiles ?? [];
                    const attached = profiles.find(ip =>
                      (ip.attachedWorkloads || []).some(wId =>
                        wId === node.id || (node.instanceId && wId === node.instanceId)
                      )
                    );
                    if (!attached) return null;
                    const profileName = attached.shortName || attached.name || attached.id;
                    return (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onSelectService(attached, 'instance_profile'); }}
                        title={`Instance Profile: ${attached.name || attached.id}\n(EC2 receives temporary credentials for the attached IAM role through this profile.)`}
                        className="mt-1 ml-2 inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-[10px] font-mono text-amber-700 dark:text-amber-200 hover:bg-amber-500/20 transition-colors cursor-pointer"
                      >
                        <Layers className="w-3 h-3" />
                        <span className="text-amber-700/70 dark:text-amber-200/60 uppercase tracking-wider text-[9px] font-semibold">Profile</span>
                        <span className="truncate max-w-[180px]">{profileName}</span>
                      </button>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {/* When subnets=0, SGs=0, NACLs=0 we collapse the three
              network-control columns into a single banner cell so
              operators read "no network gate" as the security
              narrative, not as missing data. The banner is rendered
              once; the three column sections fall back to their
              normal layout when ANY of subnets/SGs/NACLs is non-empty
              (i.e. the path genuinely passes through network
              controls).

              2026-05-25: also suppress the banner when egressGateways
              is non-empty. The EXFIL view leaves subnets/SGs/NACLs
              empty by design (it focuses on identity → exit-point,
              not workload-side controls), but has IGW/NAT/VPCE cards
              in egressGateways. The "IAM is the only gate" narrative
              is specifically about direct-API-call paths with no
              network involvement at all — surfacing it on an EXFIL
              path that clearly has IGWs/VPCEs reads as a bug. */}
          {/* Banner gating, rewritten 2026-05-25 — see SystemArchitecture.
              workloadNetwork docstring above. Operator complaint that
              triggered the rewrite: this banner used to fire from
              absence-of-data on every "Serverless · Direct" EXFIL path,
              with no way to distinguish "verified non-VPC Lambda" from
              "we never queried." Now:
                - workloadNetwork.is_vpc_attached === false → evidence-
                  cited "Non-VPC Workload" banner (real finding).
                - workloadNetwork.is_vpc_attached === true → no banner
                  (real subnets/SGs render from real edges).
                - workloadNetwork absent → legacy empty-array fallback. */}
          {(() => {
            const wn = architecture.workloadNetwork
            if (wn) return !wn.is_vpc_attached
            return (
              (architecture.subnets?.length ?? 0) === 0 &&
              architecture.securityGroups.length === 0 &&
              architecture.nacls.length === 0 &&
              architecture.egressGateways.length === 0
            )
          })() ? (
            <div className="flex flex-col items-center justify-center min-h-[180px] px-6 py-8 rounded-xl border-2 border-dashed border-amber-500/40 bg-gradient-to-b from-amber-500/5 to-orange-500/5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center">
                  <ShieldOff className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="text-amber-600 dark:text-amber-400 text-lg font-bold uppercase tracking-wider">
                  {architecture.workloadNetwork ? "Non-VPC Workload" : "No Network Controls"}
                </div>
              </div>
              <div className="text-foreground text-base font-medium text-center mb-2">
                IAM is the only gate on this path.
              </div>
              <div className="text-muted-foreground text-sm text-center max-w-md leading-relaxed">
                {architecture.workloadNetwork
                  ? "This workload is not VPC-attached. It reaches AWS services via the public API endpoint, so VPC, subnet, Security Group and NACL defenses do not apply. Compromising the IAM role grants its full permissions on the resources below."
                  : "This workload reaches its target via the public AWS API endpoint — no VPC, no subnet, no Security Group, no NACL is involved. Network defenses do not apply. Compromising the IAM role on the right grants the role's full permissions on the resources below."}
              </div>
              {architecture.workloadNetwork && (
                <div className="mt-3 text-amber-700 dark:text-amber-300/80 text-[11px] text-center max-w-md font-mono">
                  Evidence: {architecture.workloadNetwork.evidence}
                  {architecture.workloadNetwork.workload_count_in_sample > 1 && (
                    <> · {architecture.workloadNetwork.workload_count_queried}/{architecture.workloadNetwork.workload_count_in_sample} workloads queried</>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
          {/* SUBNETS — Phase 1 cleanup (2026-05-25 user feedback):
              - VPC card dropped (was redundant with the dashed
                VPCBoundaries header).
              - Public/Private posture moved inline next to the
                subnet name as a chip (was awkwardly on its own row
                below).
              - Route Table promoted to its own sibling card in the
                ROUTE TABLES lane (next column) — the user wants it
                as a separated service in the flow, not nested
                inside the subnet card. */}
          <div className="flex flex-col gap-3 min-w-[170px]" data-column="subnets" data-vpc-scoped-column="true" data-lane="subnets">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Subnets{countLabel(architecture.subnets?.length ?? 0)}
            </div>
            {(architecture.subnets || []).map(subnet => {
              const postureCls =
                subnet.isPublic === true
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-200"
                  : subnet.isPublic === false
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-200"
                    : "bg-muted/50 border-border text-foreground";
              const postureLabel =
                subnet.isPublic === true ? "Public" : subnet.isPublic === false ? "Private" : "Unknown";
              const tooltip =
                subnet.isPublic === true
                  ? "Effective route table has a route to an Internet Gateway. Subnet is publicly-routable per AWS canonical definition. Does not include NAT-GW route inspection."
                  : subnet.isPublic === false
                    ? "Effective route table has no IGW route. Subnet is private. May still have NAT-GW egress (not inspected by this classifier)."
                    : "Subnet.public not set in Neo4j — either subnet_visibility_collector hasn't classified this subnet yet, or the workload's IN_SUBNET edge resolves to a duplicate without the :Subnet label. Never fabricated.";
              return (
                <div
                  key={subnet.id}
                  data-subnet-id={subnet.id}
                  // Spine mode (3-color discipline): subnet teal demotes to
                  // neutral card chrome; the posture chip keeps amber
                  // (public = review) / emerald (private = safe).
                  className={`relative rounded-lg border p-2.5 ${pathFilterActive ? 'border-border bg-card' : 'border-cyan-500/30 bg-cyan-500/5'}${pathEmphasisClass(subnet.id)}`}
                  title={tooltip}
                  onMouseEnter={() => setHoveredId(subnet.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {renderPathStepBadge(subnet.id)}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Globe className="w-3.5 h-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
                      <span className="text-xs font-semibold text-foreground truncate">
                        {subnet.shortName}
                      </span>
                    </div>
                    {/* Posture chip — inline with the subnet name so
                        operators see "subnet-xxx · Public" at a glance
                        instead of having to scan to the next row. */}
                    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border ${postureCls} shrink-0`}>
                      {postureLabel}
                    </span>
                  </div>
                  {subnet.connectedComputeIds.length > 1 &&
                    (!pathFilterActive || effectiveHoveredId === subnet.id) && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {subnet.connectedComputeIds.length} workloads
                    </div>
                  )}
                </div>
              );
            })}
            {(!architecture.subnets || architecture.subnets.length === 0) && (
              <div className="text-xs text-muted-foreground italic p-4 text-center">No subnets on this path</div>
            )}
          </div>

          {/* ROUTE TABLES — Phase 1 user feedback: route table is
              crucial (it's what makes a subnet public/private) and
              should be a separated service in the flow, not buried
              inside the subnet card. Renders one chip per subnet
              that has a route_table_id, surfacing the rtb-id +
              route count + main-flag. The card carries data-rtb-id
              so future flow routing can zigzag through it. */}
          {(architecture.subnets ?? []).some(s => s.routeTableId) && (
            <div className="flex flex-col gap-3 min-w-[160px]" data-vpc-scoped-column="true" data-lane="route-tables">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-foreground" />
                Route Tables{countLabel((architecture.subnets ?? []).filter(s => s.routeTableId).length)}
              </div>
              {(architecture.subnets ?? [])
                .filter(s => s.routeTableId)
                .map(s => (
                  <div
                    key={`rtb:${s.id}`}
                    data-rtb-id={s.routeTableId!}
                    className="rounded-lg border border-border bg-muted p-2.5"
                    title={`Effective route table for ${s.shortName}: ${s.routeTableId}${typeof s.routeTableCount === 'number' ? ` · ${s.routeTableCount} routes` : ''}${s.routeTableIsMain ? ' · main' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-semibold text-foreground truncate font-mono">
                        {s.routeTableId}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      {typeof s.routeTableCount === 'number' && (
                        <span className="text-foreground">{s.routeTableCount} {s.routeTableCount === 1 ? 'route' : 'routes'}</span>
                      )}
                      {s.routeTableIsMain && (
                        <span className="px-1 py-px text-[8px] uppercase tracking-wider rounded bg-muted text-foreground border border-border">main</span>
                      )}
                      <span className="ml-auto text-muted-foreground">for {s.shortName}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* SECURITY GROUPS */}
          <div className="flex flex-col gap-3 min-w-[180px]" data-vpc-scoped-column="true" data-lane="security-groups">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              Security Groups{countLabel(architecture.securityGroups.length)}
            </div>
            {architecture.securityGroups.map(sg => (
              <div key={sg.id} data-sg-id={sg.id} className={`relative${pathEmphasisClass(sg.id)}`}>
                {renderPathStepBadge(sg.id)}
                <SecurityGroupPanel
                  sg={sg}
                  isExpanded={expandedSG === sg.id}
                  onToggle={() =>
                    pathMode
                      ? onSelectService(sg, 'security_group')
                      : setExpandedSG(expandedSG === sg.id ? null : sg.id)
                  }
                  isHighlighted={isNodeHighlighted(sg.id)}
                  onHover={setHoveredId}
                  onDetails={() => onSelectService(sg, 'security_group')}
                  spineMode={pathFilterActive}
                />
              </div>
            ))}
            {architecture.securityGroups.length === 0 && (
              <div className="text-xs text-muted-foreground italic p-4 text-center">No SGs attached</div>
            )}
          </div>

          {/* NACLS — only render lane when at least one NACL is on
              the path. "No NACLs" placeholder was always-on noise
              (most paths have zero NACLs because NACLs are typically
              pass-through). Per 2026-05-25 user feedback: "If I don't
              have X, don't present it — I need to understand what we
              have, not what we don't." Other lanes that legitimately
              empty (SGs, IGW) still render their placeholders because
              their absence is itself a meaningful security signal. */}
          {architecture.nacls.length > 0 && (
            <div className="flex flex-col gap-3 min-w-[140px]" data-vpc-scoped-column="true" data-lane="nacls">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <Lock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                NACLs{countLabel(architecture.nacls.length)}
              </div>
              {architecture.nacls.map(nacl => (
                <div key={nacl.id} data-nacl-id={nacl.id} className={`relative${pathEmphasisClass(nacl.id)}`}>
                  {renderPathStepBadge(nacl.id)}
                  <NACLNode
                    nacl={nacl}
                    isHighlighted={isNodeHighlighted(nacl.id)}
                    onHover={setHoveredId}
                    onClick={() => onSelectService(nacl, 'nacl')}
                    spineMode={pathFilterActive}
                  />
                </div>
              ))}
            </div>
          )}
            </>
          )}

          {/* EGRESS GATEWAYS — chip item 10. Renders explicit
              InternetGateway / NATGateway / EgressOnlyIGW / TransitGW
              nodes when the path's VPCs have them. Previously this was
              implicit (Subnet "Public" amber badge meant "route table →
              IGW") which left operators guessing WHICH IGW or how many.
              The label-keyed extraction lives in buildArchitecture and
              filterArchitectureToPath. Empty array → lane hidden so the
              grid doesn't grow a dead column for IGW-less paths.

              2026-05-25 column-order swap: this lane used to sit AFTER
              IDENTITY (between Identity and Resources). That layout
              put IGW physically between the Role card and the S3
              card, so the Role → S3 data-plane Bezier curve naturally
              passed THROUGH the IGW card region — operators read the
              arc as a serial "Role → IGW → S3" chain even though no
              such edge exists in the graph (only Role → S3 and
              EC2 → IGW are real). Moving EGRESS to BEFORE Identity
              puts Identity adjacent to Resources, so Role → S3 is a
              short hop with no card between them; EC2 → IGW
              terminates the network plane on the left of Identity.
              The two planes converge at the S3 bucket from different
              sides instead of overlapping. */}
          {architecture.egressGateways.length > 0 && (
            <div className="flex flex-col gap-3 items-center" data-vpc-scoped-column="true" data-lane="egress-gateways">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Egress Gateways{countLabel(architecture.egressGateways.length)}
              </div>
              {/* Canvas v3 Slice A — visualize-by-negation on the gateway
                  lane. Compute the set of gateways that win SOMETHING on
                  this path (any destination's route resolves to them).
                  Gateways NOT in this winning set are rendered grayed
                  with a "Not used" annotation — the gap between full-
                  color (active) and grayed (alternative) IS the security
                  signal. Per pattern_visualize_by_negation. */}
              {architecture.egressGateways.map(gw => {
                const isWinningForAnyDestination =
                  architecture.resources.some(r => {
                    const rp = derivePrecedenceForDestination(
                      r,
                      architecture.egressGateways,
                    )
                    return rp?.gateway.id === gw.id
                  })
                // Some paths have no resources (identity-only paths) —
                // in that case no gateway "wins" anything; render at full
                // color since the canvas isn't making a routing claim.
                const noDestinationsAtAll = architecture.resources.length === 0
                const isGateUnused =
                  !noDestinationsAtAll && !isWinningForAnyDestination
                // Spine mode (3-color discipline): gateway kind hues (sky
                // NAT, violet TGW) demote to neutral. Internet-facing
                // gateways (IGW / egress-only IGW) keep the amber/orange
                // family — internet egress on an attack path is a risk
                // signal, not a category color.
                const isInternetFacingGw =
                  gw.kind === 'InternetGateway' || gw.kind === 'EgressOnlyInternetGateway';
                const palette =
                  isGateUnused ? 'bg-muted/30 border-border' :
                  pathFilterActive && !isInternetFacingGw ? 'bg-card border-border' :
                  gw.kind === 'InternetGateway' ? 'bg-amber-500/10 border-amber-500/40' :
                  gw.kind === 'NATGateway' ? 'bg-sky-500/10 border-sky-500/40' :
                  gw.kind === 'EgressOnlyInternetGateway' ? 'bg-orange-500/10 border-orange-500/40' :
                  'bg-violet-500/10 border-violet-500/40';
                // 2026-06-11 rebalance: gateway icon keeps its kind hue in
                // spine mode (icon color = identity); only the card bg
                // stays neutral and unused gateways stay muted.
                const iconColor =
                  isGateUnused ? 'text-muted-foreground' :
                  gw.kind === 'InternetGateway' ? 'text-amber-700 dark:text-amber-300' :
                  gw.kind === 'NATGateway' ? 'text-sky-700 dark:text-sky-300' :
                  gw.kind === 'EgressOnlyInternetGateway' ? 'text-orange-700 dark:text-orange-300' :
                  'text-violet-700 dark:text-violet-300';
                // Route subtitle — shows the AUTHORITATIVE answer to
                // "where does this gateway send traffic?":
                //   IGW / NAT default route → "via 0.0.0.0/0"
                //   Gateway VPCE for S3     → "via com.amazonaws.<region>.s3"
                // Empty when route provenance is missing (older API
                // response or in-vpc-only sibling gateway).
                const routeLine = gw.routeTargetService
                  ? `via ${gw.routeTargetService}`
                  : gw.routeDestinationCidr
                  ? `via ${gw.routeDestinationCidr}`
                  : null;
                const titleParts = [
                  `${gw.kindLabel} · ${gw.name}`,
                  gw.vpcId ? gw.vpcId : null,
                  routeLine,
                  gw.routed === false ? "sibling gateway — no route points here" : null,
                ].filter(Boolean);
                return (
                  <div
                    key={gw.id}
                    data-gateway-id={gw.id}
                    // Canvas v3 — gateway state stamp. "available-not-selected"
                    // is the descriptive replacement for "unused" (per
                    // feedback_signal_language — descriptive, not accusative).
                    // Operators read "this gateway exists in the path's VPC
                    // but route precedence didn't pick it for any destination
                    // on this path." Still backwards-compatible: the
                    // data-gateway-unused stamp is kept for any existing DOM
                    // probes that key off it.
                    data-gateway-state={isGateUnused ? "available-not-selected" : undefined}
                    data-gateway-unused={isGateUnused ? "true" : undefined}
                    className={`relative group cursor-default rounded-xl border-2 px-4 py-3 transition-all duration-300 min-w-[150px] ${palette} ${
                      isGateUnused ? "opacity-50" : ""
                    }${pathEmphasisClass(gw.id)}`}
                    title={
                      isGateUnused
                        ? `${titleParts.join(' · ')} — Available in this VPC but route precedence picked a different gateway for the destinations on this path.`
                        : titleParts.join(' · ')
                    }
                    onMouseEnter={() => setHoveredId(gw.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {renderPathStepBadge(gw.id)}
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Globe className={`w-4 h-4 ${iconColor}`} />
                      <span className={`text-sm font-semibold ${isGateUnused ? "text-muted-foreground" : "text-foreground"}`}>{gw.kindLabel}</span>
                    </div>
                    <div className={`text-[10px] text-center font-mono truncate max-w-[140px] ${iconColor}`}>
                      {gw.shortName}
                    </div>
                    {routeLine && (!pathFilterActive || effectiveHoveredId === gw.id) && (
                      <div
                        className="text-[10px] text-center text-muted-foreground mt-1 truncate max-w-[140px]"
                        title={routeLine}
                      >
                        {routeLine}
                      </div>
                    )}
                    {isGateUnused && (
                      <div
                        className="mt-1.5 inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-full border border-border bg-muted text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mx-auto w-fit"
                        title="This gateway exists in the path's VPC but route precedence didn't select it for any destination on this path."
                      >
                        Available · Not selected
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* IDENTITY — consolidates InstanceProfile + IAMRole into
              one lane (Phase 1 user feedback 2026-05-25). Previously
              IPs and Roles rendered in separate columns; the canvas
              grid put them on opposite ends of the chain, so an
              operator looking at "INSTANCE PROFILES (1)" next to
              the NACL column reasonably asked "is the IP attached
              to the NACL?". AWS semantics: IP and Role are both
              identity-plane and AWS BINDS them — IP wraps Role.
              Rendering both card stacks inside one column with the
              IP above the Role visually conveys the bind. The IP
              counts and Role counts are still surfaced separately
              in the header so the chain's hop count stays honest.
              data-lane-global signals to the VPC boundary renderer that
              this column lives OUTSIDE any VPC enclosure — IAM is a
              regional/global service, not VPC-scoped. The GLOBAL chip
              in the header makes the semantic explicit so operators
              don't read the VPC boundary's absence around this column
              as a bug. */}
          <div className="flex flex-col gap-3 items-center" data-lane-global="true" data-lane="identity">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <Key className="w-4 h-4 text-pink-600 dark:text-pink-400" />
              Identity
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-muted text-foreground border border-border"
                title="IAM is a regional/global service. IAM Roles, Instance Profiles, and Policies are not VPC-scoped and therefore sit outside any VPC enclosure on this canvas."
              >
                Global
              </span>
              {/* Bug N (2026-06-22) — InstanceProfile counter removed.
                  IPs no longer render as peer chips in this column;
                  they live as a sidecar badge on the EC2 card instead.
                  Counting them in the header without showing the chips
                  made operators look for a hidden count. */}
              <span className="text-pink-700 dark:text-pink-300/80">
                Roles{spotlightActive ? '' : ` ${architecture.iamRoles.length}`}
              </span>
              {(architecture.iamPolicies?.length ?? 0) > 0 && (
                <span className="text-violet-700 dark:text-violet-300/80">
                  Policies {architecture.iamPolicies?.length ?? 0}
                </span>
              )}
              {/* Spine mode: return from the expanded role/profile/policy
                  stack back to the compact identity token. */}
              {pathFilterActive && identityDetailOpen && (
                <button
                  type="button"
                  onClick={() => setIdentityDetailOpen(false)}
                  title="Collapse back to the compact identity token"
                  className="inline-flex items-center gap-0.5 normal-case text-[9px] text-muted-foreground hover:text-foreground border border-border rounded px-1 py-0.5"
                >
                  <ChevronDown className="w-2.5 h-2.5 rotate-180" />
                  collapse
                </button>
              )}
            </div>
            {/* Bug N (Alon, 2026-06-22) — InstanceProfiles are NOT a
                first-class identity. They are the EC2's credential
                carrier; the IAMRole is the actual identity with trust
                policy + permissions + observed API calls. Rendering IPs
                as peer chips in the Identity lane every-day misleads
                operators into thinking the EC2 has two identities. The
                profile name now belongs on the EC2 card as an inline
                sidecar badge (Phase 2 follow-up) + in the detail panel.
                Path chains compress automatically: with no IP chip in
                the column, the polyline routes NACL → IAMRole directly
                rather than NACL → IP → IAMRole.

                The IP data is preserved on `architecture.instanceProfiles`
                for the detail panel / RoleDetailPanel; only the
                in-column chip is suppressed here.

                Acceptance: AC1 of Bug N — "InstanceProfile no longer
                appears as a standalone chip in the Identity lane". */}
            {false && (architecture.instanceProfiles ?? [])
              .filter((ip) => !(identityCollapsed && isOnSelectedPath(ip.id)))
              .map((ip) => (
              <div key={`profile:${ip.id}`} data-ip-id={ip.id} data-role-id={ip.id} className={`relative${pathEmphasisClass(ip.id)}`}>
                {renderPathStepBadge(ip.id)}
                <IAMRoleNode
                  role={ip}
                  isHighlighted={isNodeHighlighted(ip.id)}
                  onHover={setHoveredId}
                  onClick={() => onSelectService(ip, 'instance_profile')}
                  forceInstanceProfile={true}
                  spineMode={pathFilterActive}
                />
              </div>
            ))}
            {/* IAM Roles — the actual permission carriers. Rendered
                BELOW their binding IP so the visual order reads
                top-to-bottom as the AWS attachment chain. */}
            {architecture.iamRoles.map((role) => {
              // ARN-pattern auto-detect remains as a fallback for cases
              // where a proper :instance-profile/ id snuck into the
              // iamRoles[] array via some upstream miscategorization.
              const isIP =
                role.id.includes(':instance-profile/') ||
                /instance.?profile/i.test(role.id);
              // Shared click behavior — the token MUST fire the exact
              // same handler chain as the detailed card so Connection
              // Details / damage scope / RoleDetailPanel keep working.
              const handleRoleClick = () => {
                // EXFIL view subscribes via onRoleClick to open
                // the RoleDetailPanel slide-in. When the prop
                // isn't set (Attacker view, System Map, etc.)
                // we fall through to the existing generic
                // service-selection behavior.
                if (onRoleClick && !isIP) {
                  onRoleClick(role);
                } else {
                  onSelectService(role, isIP ? 'instance_profile' : 'iam_role');
                }
              };
              // Spine mode: on-path roles render the compact identity
              // risk token (one card for the whole identity story).
              // Off-path roles keep the dimmed detailed card.
              if (identityCollapsed && isOnSelectedPath(role.id) && !isIP) {
                return (
                  <div key={`role:${role.id}`} data-role-id={role.id} className={`relative${pathEmphasisClass(role.id)}`}>
                    {/* Range badge ("2–3") — the token absorbs the on-path
                        profile/policy cards, so it carries their step
                        numbers too; a single number would leave a gap in
                        the map's 1..N sequence. */}
                    {renderPathStepBadge(
                      role.id,
                      role.id === firstOnPathRoleId
                        ? collapsedIdentityAnchors.map((a) => a.id)
                        : undefined,
                    )}
                    {/* Invisible edge anchors for the collapsed on-path
                        profile/policy cards — resolve to the token's box
                        so the spine stays geometrically continuous. Only
                        on the first on-path role to keep ids unique. */}
                    {role.id === firstOnPathRoleId &&
                      collapsedIdentityAnchors.map((a) =>
                        a.kind === 'ip' ? (
                          <span
                            key={`anchor:${a.id}`}
                            aria-hidden="true"
                            data-ip-id={a.id}
                            // The visible IP card carries BOTH attrs (legacy
                            // flow-mode looks profiles up via data-role-id);
                            // the anchor must mirror that.
                            data-role-id={a.id}
                            className="absolute inset-0 pointer-events-none"
                          />
                        ) : (
                          <span
                            key={`anchor:${a.id}`}
                            aria-hidden="true"
                            data-policy-id={a.id}
                            className="absolute inset-0 pointer-events-none"
                          />
                        ),
                      )}
                    <IdentityRiskToken
                      role={role}
                      isHighlighted={isNodeHighlighted(role.id)}
                      onHover={setHoveredId}
                      onClick={handleRoleClick}
                      onShowDetail={() => setIdentityDetailOpen(true)}
                    />
                  </div>
                );
              }
              return (
                <div key={`role:${role.id}`} data-role-id={role.id} className={`relative${pathEmphasisClass(role.id)}`}>
                  {renderPathStepBadge(role.id)}
                  <IAMRoleNode
                    role={role}
                    isHighlighted={isNodeHighlighted(role.id)}
                    onHover={setHoveredId}
                    onClick={handleRoleClick}
                    spineMode={pathFilterActive}
                  />
                </div>
              );
            })}
            {/* IAM Policies — the actual permission grant documents
                attached to the path's role. Added 2026-05-29 after the
                user's audit caught "2 Policies missing from canvas":
                the policies were already in iamPolicies[] (via
                addAsPolicy on path-node iteration + lateral
                HAS_POLICY expansion) but never rendered as cards.
                The sidebar showed "IAM POLICIES (N)" but the lane
                stayed silent — a credibility gap. Rendering them
                below the role in the same Identity column reflects
                the AWS attachment chain (EC2 → IP → Role → Policy).
                forceIAMPolicy gives them distinct styling so the
                operator can scan-distinguish Role vs Policy. */}
            {/* Spine mode (identityCollapsed): ON-PATH policies collapse
                into the role's IdentityRiskToken (anchors preserved in
                the token wrapper); off-path policies keep the dimmed
                card treatment. */}
            {(architecture.iamPolicies ?? [])
              .filter((policy) => !(identityCollapsed && isOnSelectedPath(policy.id)))
              .map((policy) => (
              <div key={`policy:${policy.id}`} data-policy-id={policy.id} className={`relative${pathEmphasisClass(policy.id)}`}>
                {renderPathStepBadge(policy.id)}
                <IAMRoleNode
                  role={policy}
                  isHighlighted={isNodeHighlighted(policy.id)}
                  onHover={setHoveredId}
                  onClick={() => onSelectService(policy, 'iam_role')}
                  forceIAMPolicy={true}
                  spineMode={pathFilterActive}
                />
              </div>
            ))}
            {architecture.iamRoles.length === 0 &&
              (architecture.instanceProfiles?.length ?? 0) === 0 &&
              (architecture.iamPolicies?.length ?? 0) === 0 && (
                <div className="text-xs text-muted-foreground italic p-4 text-center">
                  No identity on this path
                </div>
              )}
          </div>

          {/* API CALLS — synthetic-multiplier lane (totalBytes / 1024,
              totalBytes / 51200, totalBytes / 512). These are FABRICATED
              counts derived from byte aggregates × hardcoded divisors,
              not real CloudTrail / access-log data. Per the 2026-05-22
              credibility audit, fabricating numbers — even with a
              "(simulated)" tag next to them — is a hard credibility
              loss on a security platform. Stripped from production
              entirely; kept in dev for testing the lane visuals. The
              real fix is to wire actual CloudTrail action counts from
              the backend (separate slice).
              Existing observedMode flag still applies — Attack Paths v2
              and Data Leak Paths set it true → lane was already hidden
              there. This new NODE_ENV gate covers the Topology view
              that previously rendered the synthetic lane in prod. */}
          {process.env.NODE_ENV !== 'production' && !observedMode && (
          <div className="flex flex-col gap-3 items-center">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-lime-600 dark:text-lime-400" />
              API Calls ({architecture.resources.filter(r => {
                const t = (r.type || '').toLowerCase();
                return t === 'database' || t === 'storage' || t === 'dynamodb';
              }).length})
            </div>
            {/* Generate API call simulations based on actual VPC traffic */}
            {architecture.resources.filter(r => {
              const t = (r.type || '').toLowerCase();
              return t === 'database' || t === 'storage' || t === 'dynamodb';
            }).map(resource => {
              // Find all flows TO this resource to calculate traffic-based API calls
              const resourceFlows = architecture.flows.filter(f => f.targetId === resource.id);
              const totalBytes = resourceFlows.reduce((sum, f) => sum + f.bytes, 0);
              const totalConnections = resourceFlows.reduce((sum, f) => sum + f.connections, 0);

              const resourceType = (resource.type || '').toLowerCase();

              // Simulate realistic API calls based on traffic patterns
              let apiActions: { action: string; count: number }[] = [];
              let totalCalls = 0;

              if (resourceType === 'database') {
                // RDS: ~1KB per query average, 70% reads, 25% writes, 5% admin
                const queryCount = Math.max(1, Math.round(totalBytes / 1024));
                apiActions = [
                  { action: 'ExecuteStatement', count: Math.round(queryCount * 0.70) },
                  { action: 'BatchExecuteStatement', count: Math.round(queryCount * 0.15) },
                  { action: 'BeginTransaction', count: Math.round(queryCount * 0.10) },
                  { action: 'CommitTransaction', count: Math.round(queryCount * 0.05) },
                ];
                totalCalls = queryCount;
              } else if (resourceType === 'storage') {
                // S3: ~50KB per object average, 60% reads, 35% writes, 5% list
                const objectOps = Math.max(1, Math.round(totalBytes / 51200));
                apiActions = [
                  { action: 'GetObject', count: Math.round(objectOps * 0.60) },
                  { action: 'PutObject', count: Math.round(objectOps * 0.30) },
                  { action: 'ListObjects', count: Math.round(objectOps * 0.05) },
                  { action: 'HeadObject', count: Math.round(objectOps * 0.05) },
                ];
                totalCalls = objectOps;
              } else if (resourceType === 'dynamodb') {
                // DynamoDB: ~500 bytes per item average, 65% reads, 30% writes, 5% scans
                const itemOps = Math.max(1, Math.round(totalBytes / 512));
                apiActions = [
                  { action: 'GetItem', count: Math.round(itemOps * 0.45) },
                  { action: 'Query', count: Math.round(itemOps * 0.20) },
                  { action: 'PutItem', count: Math.round(itemOps * 0.25) },
                  { action: 'Scan', count: Math.round(itemOps * 0.10) },
                ];
                totalCalls = itemOps;
              }

              // Filter out zero-count actions
              apiActions = apiActions.filter(a => a.count > 0);

              if (totalCalls === 0) return null;

              return (
                <div
                  key={`api-${resource.id}`}
                  data-api-id={resource.id}
                  className="relative group cursor-pointer"
                  onClick={() => onSelectService({
                    ...resource,
                    id: `api-${resource.id}`,
                    name: `${resource.shortName || resource.name} API`,
                    type: 'api_call',
                    apiActions,
                    totalCalls,
                    totalBytes,
                    totalConnections,
                    isSimulated: true,
                  } as any, 'api_call')}
                >
                  <div className={`
                    px-4 py-3 rounded-xl border-2 transition-all duration-300
                    bg-lime-500/10 border-lime-500/50 hover:border-lime-400 hover:bg-lime-500/20
                    min-w-[140px] text-center
                  `}>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                      <span className="text-sm font-semibold text-foreground truncate max-w-[100px]">
                        {resource.shortName || resource.name}
                      </span>
                    </div>
                    <div className="text-xs text-lime-600 dark:text-lime-400">
                      {apiActions.slice(0, 2).map(a => a.action).join(', ')}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {totalCalls.toLocaleString()} {observedMode ? "events" : "calls"}
                      {!observedMode && <span className="text-muted-foreground ml-1">(simulated)</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            {architecture.resources.filter(r => {
              const t = (r.type || '').toLowerCase();
              return t === 'database' || t === 'storage' || t === 'dynamodb';
            }).length === 0 && (
              <div className="text-xs text-muted-foreground italic p-4 text-center">No API Calls</div>
            )}
          </div>
          )}

          {/* VPC ENDPOINTS — the missing egress hop between SG/IAM and
              the AWS service. Gateway endpoints (S3, DynamoDB) bypass
              SG egress entirely; this lane is what makes a "0-rule SG
              still reaches S3" path legible to the operator. Empty
              state renders a faint "No VPC endpoints" so the lane
              still occupies grid space when none apply to the path. */}
          {(architecture.vpcEndpoints?.length ?? 0) > 0 && anyVisibleOnPath(architecture.vpcEndpoints) && (
          <div className="flex flex-col gap-3 items-center" data-vpc-scoped-column="true" data-lane="vpc-endpoints">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex flex-col items-center gap-0.5 text-center">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                VPC Endpoints{countLabel(architecture.vpcEndpoints.length)}
              </div>
              {!spotlightActive && vpceLaneCounts && (
                <span className="text-[10px] normal-case font-normal opacity-70 tracking-normal">
                  · {vpceLaneSubtitle(vpceLaneCounts)}
                </span>
              )}
            </div>
            {architecture.vpcEndpoints.map(vpce => {
              const isActive = architecture.flows.some(f => f.vpceId === vpce.id);
              const serviceTitle = vpce.serviceName
                ? `${vpce.serviceName}${vpce.endpointType ? ` (${vpce.endpointType})` : ''}`
                : undefined;
              return (
                <div
                  key={vpce.id}
                  data-vpce-id={vpce.id}
                  data-active={isActive ? 'true' : 'false'}
                  className={`relative group cursor-default rounded-xl border-2 px-4 py-3 transition-all duration-300 min-w-[150px] ${vpceCardChrome(isActive, pathFilterActive)}${pathEmphasisClass(vpce.id)}`}
                  title={vpceCardTitle(isActive, pathFilterActive, serviceTitle, vpce.id)}
                  onMouseEnter={() => setHoveredId(vpce.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {renderPathStepBadge(vpce.id)}
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Cloud className={`w-4 h-4 ${isActive || pathFilterActive ? 'text-violet-700 dark:text-violet-300' : 'text-amber-600/70 dark:text-amber-400/70'}`} />
                    <span className={`text-sm font-semibold ${isActive || pathFilterActive ? 'text-foreground' : 'text-foreground/70'}`}>{vpce.serviceShort}</span>
                  </div>
                  {(!pathFilterActive || effectiveHoveredId === vpce.id) && (
                    <div className={`text-[10px] text-center font-mono truncate max-w-[140px] ${
                      pathFilterActive
                        ? 'text-muted-foreground'
                        : isActive
                          ? 'text-violet-700 dark:text-violet-300/90'
                          : 'text-amber-700/80 dark:text-amber-300/70'
                    }`}>
                      {vpce.shortName}
                    </div>
                  )}
                  {vpce.endpointType && (!pathFilterActive || effectiveHoveredId === vpce.id) && (
                    <div className="mt-1 text-center">
                      <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                        pathFilterActive
                          ? 'bg-muted border-border text-muted-foreground'
                          : isActive
                            ? 'bg-violet-500/10 border-violet-400/40 text-violet-700 dark:text-violet-200'
                            : 'bg-slate-500/10 border-slate-400/30 text-slate-600 dark:text-slate-400'
                      }`}>
                        {vpce.endpointType}
                      </span>
                    </div>
                  )}
                  {/* "Not used" badge — visible without hovering when
                      no flow.vpceId references this endpoint. Matches
                      pattern_visualize_by_negation: the gap between
                      "VPCE exists" and "VPCE carries traffic" IS the
                      security signal (e.g. private routing is
                      available but the workload egresses via IGW
                      instead). Path-filter-on hides this since the
                      filter narrative already implies the same. */}
                  {!isActive && !pathFilterActive && (
                    <div className="mt-1 text-center">
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border bg-slate-500/15 border-slate-500/40 text-slate-700 dark:text-slate-300"
                        title={VPCE_INACTIVE_TOOLTIP}
                      >
                        {VPCE_NOT_USED_BADGE}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}

          {/* EGRESS GATE — EXFIL view's 5-stage model: CJ → Reader →
              Handler → GATE → Destination. Sits between IDENTITY and
              RESOURCES so the operator reads "data leaves through this
              named gate to that destination" instead of the prior cop-
              out where "AWS service plane · not tracked" occupied the
              destination slot and there was no gate at all. Virtual
              gates (Service Plane, CRR Rule, Snapshot Share, etc.)
              render here just like real gateways — gateStrength drives
              the border color (emerald=strong, blue=weak-observable,
              amber=weak-unobservable). Lane only renders when populated
              (exfilGate is optional on SystemArchitecture) so attacker
              / per-path / system-map views keep their layout unchanged. */}
          {(architecture.exfilGate?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-3 items-center">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <ShieldOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Egress Gate ({architecture.exfilGate!.length})
              </div>
              {architecture.exfilGate!.map(gate => {
                // Border color from gate strength — strong=emerald,
                // weak_observable=blue, weak_unobservable=amber.
                const strengthBorder =
                  gate.gateStrength === 'strong'
                    ? 'border-emerald-500/50 bg-emerald-500/5'
                    : gate.gateStrength === 'weak_observable'
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : 'border-amber-500/50 bg-amber-500/5';
                const strengthIconColor =
                  gate.gateStrength === 'strong'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : gate.gateStrength === 'weak_observable'
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-amber-700 dark:text-amber-300';
                const strengthLabel =
                  gate.gateStrength === 'strong'
                    ? 'STRONG'
                    : gate.gateStrength === 'weak_observable'
                    ? 'WEAK · OBSERVABLE'
                    : 'WEAK · UNOBSERVABLE';
                return (
                  <div
                    key={gate.id}
                    data-exfil-gate-id={gate.id}
                    className={`relative group cursor-default rounded-xl border-2 px-4 py-3 transition-all duration-300 min-w-[170px] ${strengthBorder}`}
                    title={`${gate.kindLabel} · ${gate.name}${gate.hint ? ` — ${gate.hint}` : ''}`}
                    onMouseEnter={() => setHoveredId(gate.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <ShieldOff className={`w-4 h-4 ${strengthIconColor}`} />
                      <span className="text-sm font-semibold text-foreground">{gate.kindLabel}</span>
                    </div>
                    <div className={`text-[10px] text-center font-mono truncate max-w-[160px] ${strengthIconColor}`}>
                      {gate.shortName}
                    </div>
                    <div className={`mt-1.5 text-center text-[8px] font-semibold uppercase tracking-wider ${strengthIconColor}`}>
                      {strengthLabel}
                    </div>
                    {gate.hint && (
                      <div className="mt-1 text-[10px] text-center text-muted-foreground leading-tight">
                        {gate.hint}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* RESOURCES.
              data-lane-global: S3, DynamoDB, KMS — all regional services,
              not VPC-scoped. The GLOBAL chip makes the semantic explicit
              so the VPC boundary's exclusion of this column reads as
              correct AWS semantics, not a missing-data bug.
              2026-06-25: basis-full forces a row break before RESOURCES
              so it sits on its own row below the network architecture
              lanes (operator-readable visual hierarchy: "infra above,
              data targets below"). border-t + pt-6 + mt-2 add explicit
              separation. */}
          <div className="basis-full mt-2 pt-6 border-t border-border/40 flex flex-col gap-3" data-lane-global="true" data-lane="resources">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              Resources{countLabel(architecture.resources.length)}
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-muted text-foreground border border-border"
                title="S3, DynamoDB, KMS and other AWS data services are regional, not VPC-scoped. They sit outside any VPC enclosure on this canvas — traffic from inside a VPC reaches them via the VPC Endpoint or NAT/IGW gateway shown to the left."
              >
                Global
              </span>
            </div>
            {architecture.resources.map(node => {
              const vuln = nodeVulnerabilities.get(node.id);
              const isInAttackPath = attackPathNodeIds.has(node.id);
              const isTarget = attackPaths.some(p => p.nodes[p.nodes.length - 1]?.id === node.id);
              // Route-precedence chip — answers the operator's "does
              // this destination's traffic exit via the public IGW or
              // the private VPCE?" question without making them
              // mentally apply AWS most-specific-prefix routing to
              // the EGRESS GATEWAYS lane inventory. Pure derivation
              // from architecture.egressGateways (path-scoped on the
              // backend). Returns null when the lane has no gateway
              // that could carry this destination's traffic — chip
              // is omitted rather than fabricated. Anchor:
              // pattern_render_the_answer_not_the_inventory.
              const routePrecedence = derivePrecedenceForDestination(
                node,
                architecture.egressGateways,
              );
              // 2026-05-28 — emphasize crown jewels in attacker view.
              // jewelEmphasis is opt-in per consumer (ATTACKER VIEW turns it
              // on; System Map, Per-Path, Exfil leave it off so their
              // visual is unchanged). When on AND this resource is a crown
              // jewel, scale 1.15× and paint a persistent emerald glow.
              // The scale is intentionally moderate — bigger than 1.2 makes
              // the card overflow the resource lane on narrow viewports.
              const emphasizeJewel = jewelEmphasis && !!node.isCrownJewel;
              // V2-2: jewel halo color is severity-driven when jewelSeverity is
              // provided. Default (no prop, or LOW) keeps the legacy emerald
              // glow that signals "this is the crown jewel" regardless of
              // attacker reachability. Higher severities take over with their
              // own palette so the eye lands on the jewel weighted by risk:
              //   CRITICAL → red (rgba(239,68,68,…))
              //   HIGH     → orange (rgba(249,115,22,…))
              //   MEDIUM   → amber (rgba(234,179,8,…))
              //   LOW/none → emerald (rgba(16,185,129,…)) — legacy fallback
              const jewelSev = (jewelSeverity || "").toUpperCase()
              const jewelHaloFilter = (() => {
                if (jewelSev === "CRITICAL")
                  return "drop-shadow(0 0 8px rgba(239, 68, 68, 0.45))"
                if (jewelSev === "HIGH")
                  return "drop-shadow(0 0 8px rgba(249, 115, 22, 0.45))"
                if (jewelSev === "MEDIUM")
                  return "drop-shadow(0 0 8px rgba(234, 179, 8, 0.4))"
                // LOW / UNKNOWN / no prop → legacy emerald (back-compat)
                return "drop-shadow(0 0 8px rgba(16, 185, 129, 0.4))"
              })()
              return (
                <div
                  key={node.id}
                  data-resource-id={node.id}
                  data-jewel-severity={emphasizeJewel ? jewelSev || "LOW" : undefined}
                  data-route-precedence-via={
                    routePrecedence ? (routePrecedence.isPrivate ? "private" : "public") : undefined
                  }
                  data-route-precedence-gateway-id={routePrecedence?.gateway.id}
                  className={`relative transition-transform duration-200 ${
                    emphasizeJewel ? 'scale-[1.15] z-20' : ''
                  }${pathEmphasisClass(node.id)}`}
                  style={emphasizeJewel ? {
                    filter: jewelHaloFilter,
                  } : undefined}
                >
                  {renderPathStepBadge(node.id)}
                  {/* Crown jewel indicator — set by applyPathFilter when this
                      resource is the path's target. Renders ABOVE the
                      legacy attack-path target chip when both apply.
                      Shifts right when a numbered step badge occupies the
                      top-left corner (pathFilter mode) so the two markers
                      don't overlap. */}
                  {node.isCrownJewel && (
                    <div
                      className={`absolute -top-2 z-10 ${
                        pathFilterActive && pathStepById?.has(node.id) ? 'left-4' : '-left-2'
                      }`}
                      title="Crown jewel — attack-path target"
                    >
                      <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center shadow-lg ring-2 ring-amber-300/40">
                        <Crown className="w-3.5 h-3.5 text-amber-900" />
                      </div>
                    </div>
                  )}
                  {/* Attack path target indicator — legacy overlay, gated
                      off in spine mode (the Crown marker + dominant spine
                      already mark the target; a second pulsing red badge
                      competes with the single-red-narrative discipline). */}
                  {isInAttackPath && isTarget && !pathFilterActive && (
                    <div className="absolute -top-2 -right-2 z-10">
                      <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center animate-pulse shadow-lg">
                        <Target className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  )}
                  {isInAttackPath && !pathFilterActive && (
                    <div className={`absolute inset-0 rounded-xl pointer-events-none ${
                      isTarget ? 'ring-2 ring-red-500 animate-pulse' : 'ring-2 ring-orange-500/50'
                    }`} />
                  )}
                  <ServiceNodeBox
                    node={node}
                    position="right"
                    flowInfo={resourceFlowInfo.get(node.id)}
                    isHighlighted={isNodeHighlighted(node.id)}
                    onHover={setHoveredId}
                    onClick={() => onSelectService(node, 'resource')}
                    spineMode={pathFilterActive}
                  />
                  {/* Canvas v3 Slice A — destination-card chip from PR #93
                      removed. The route-precedence chip now lives on the
                      EDGE MIDPOINT (rendered by AnimatedTrafficLine via
                      verbChipLabel) so the chip labels the flow line,
                      not a floating annotation beside the bucket. The
                      data-route-precedence-via attribute on this wrapper
                      div is kept for spot-checks of "did precedence
                      resolve for this destination" (independent of where
                      the chip renders). Per pattern_geometry_must_match_label. */}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Flow details on hover */}
      {effectiveHoveredId && (
        <div className="mt-6 pt-4 border-t border-border animate-in fade-in duration-200">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Connection Details</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {architecture.flows
              .filter(f => f.sourceId === effectiveHoveredId || f.targetId === effectiveHoveredId || f.sgId === effectiveHoveredId || f.roleId === effectiveHoveredId)
              .map((flow, i) => {
                const source = architecture.computeServices.find(c => c.id === flow.sourceId);
                const target = architecture.resources.find(r => r.id === flow.targetId);
                return (
                  <div key={i} className="bg-muted/50 rounded-lg p-3 border border-border">
                    <div className="text-xs text-muted-foreground mb-2">
                      {source?.shortName} → {target?.shortName}
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono text-sm font-bold">
                        {flow.ports[0] || 'TCP'}
                      </span>
                      <span className="text-foreground font-bold">
                        {formatBytes(flow.bytes)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{flow.connections} conn</span>
                      {/*
                        Gate the "active" badge on the flow's actual state.
                        Previously rendered unconditionally — appeared on rows
                        with 0 connections, which read as "live traffic
                        observed" when there was none. Both legs (isActive
                        AND connections > 0) must hold so an upstream bug in
                        isActive can't silently re-introduce the issue.
                      */}
                      {flow.isActive && flow.connections > 0 && (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                          active
                        </span>
                      )}
                    </div>
                    {/*
                      2026-05-28 — Phase 2 V1 slice 2. Forensic provenance
                      surfaced on hover: "Last seen 3h ago · First seen 2d
                      ago". Renders only when at least one timestamp is
                      present on the underlying graph edge (synthesized
                      chain-completion flows leave both null). Makes the
                      temporal-intelligence patent claim visible on the
                      canvas without requiring an export or an admin click.
                    */}
                    {(flow.lastSeen || flow.firstSeen) && (
                      <div
                        className="mt-1.5 pt-1.5 border-t border-border flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground"
                        title={[
                          flow.firstSeen ? `First seen ${flow.firstSeen}` : null,
                          flow.lastSeen ? `Last seen ${flow.lastSeen}` : null,
                        ].filter(Boolean).join('\n')}
                      >
                        {flow.lastSeen && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                            <span className="text-foreground">last</span>
                            <span className="font-mono text-emerald-700 dark:text-emerald-300">{formatRelativeTime(flow.lastSeen)}</span>
                          </span>
                        )}
                        {flow.lastSeen && flow.firstSeen && <span className="text-muted-foreground">·</span>}
                        {flow.firstSeen && (
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">first</span>
                            <span className="font-mono text-foreground">{formatRelativeTime(flow.firstSeen)}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Legend — in spine mode the category hues are neutralized on the
          canvas (3-color discipline), so the legend icons go neutral too;
          Live Traffic (green) and Security Gap (amber) keep their color
          because those families survive on the spine canvas. */}
      <div className="mt-6 pt-4 border-t border-border flex flex-wrap items-center gap-4 text-xs">
        <span className="text-muted-foreground">Legend:</span>
        <span className="flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span className="text-muted-foreground">Compute</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
          <span className="text-muted-foreground">Security Group</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400" />
          <span className="text-muted-foreground">IAM Role</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
          <span className="text-muted-foreground">API Call</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          <span className="text-muted-foreground">Database</span>
        </span>
        <span className="flex items-center gap-1.5">
          <HardDrive className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
          <span className="text-muted-foreground">Storage</span>
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-emerald-600 dark:text-emerald-400">Live Traffic</span>
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span className="text-amber-600 dark:text-amber-400">Security Gap</span>
        </span>
      </div>
    </div>
  );
}

// ============================================
// DATA CHANGE TRACKER
// ============================================
interface DataChanges {
  newCompute: string[];
  newResources: string[];
  newConnections: number;
  removedCompute: string[];
  removedResources: string[];
  totalChanges: number;
}

function detectChanges(oldArch: SystemArchitecture | null, newArch: SystemArchitecture): DataChanges {
  if (!oldArch) {
    return {
      newCompute: newArch.computeServices.map(c => c.id),
      newResources: newArch.resources.map(r => r.id),
      newConnections: newArch.flows.length,
      removedCompute: [],
      removedResources: [],
      totalChanges: newArch.computeServices.length + newArch.resources.length + newArch.flows.length,
    };
  }

  const oldComputeIds = new Set(oldArch.computeServices.map(c => c.id));
  const newComputeIds = new Set(newArch.computeServices.map(c => c.id));
  const oldResourceIds = new Set(oldArch.resources.map(r => r.id));
  const newResourceIds = new Set(newArch.resources.map(r => r.id));
  const oldFlowKeys = new Set(oldArch.flows.map(f => `${f.sourceId}->${f.targetId}`));
  const newFlowKeys = new Set(newArch.flows.map(f => `${f.sourceId}->${f.targetId}`));

  const newCompute = newArch.computeServices.filter(c => !oldComputeIds.has(c.id)).map(c => c.name);
  const newResources = newArch.resources.filter(r => !oldResourceIds.has(r.id)).map(r => r.name);
  const newConnections = newArch.flows.filter(f => !oldFlowKeys.has(`${f.sourceId}->${f.targetId}`)).length;
  const removedCompute = oldArch.computeServices.filter(c => !newComputeIds.has(c.id)).map(c => c.name);
  const removedResources = oldArch.resources.filter(r => !newResourceIds.has(r.id)).map(r => r.name);

  return {
    newCompute,
    newResources,
    newConnections,
    removedCompute,
    removedResources,
    totalChanges: newCompute.length + newResources.length + newConnections + removedCompute.length + removedResources.length,
  };
}

// ============================================
// REFRESH STATUS INDICATOR
// ============================================
function RefreshStatusBadge({
  status,
  changes,
  onDismiss,
}: {
  status: 'idle' | 'fetching' | 'success' | 'error';
  changes: DataChanges | null;
  onDismiss: () => void;
}) {
  if (status === 'idle' && (!changes || changes.totalChanges === 0)) return null;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
      status === 'fetching' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
      status === 'error' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
      changes && changes.totalChanges > 0 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
      'bg-muted text-muted-foreground'
    }`}>
      {status === 'fetching' && (
        <>
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span>Syncing with Neo4j...</span>
        </>
      )}
      {status === 'success' && changes && changes.totalChanges > 0 && (
        <>
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span>
            +{changes.newCompute.length + changes.newResources.length} nodes,
            +{changes.newConnections} connections
          </span>
          <button onClick={onDismiss} className="ml-1 hover:text-foreground">✕</button>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertTriangle className="w-3 h-3" />
          <span>Sync failed</span>
        </>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
// Optional filter passed from the Attack-Paths Flow tab. When set, the
// architecture is reduced to ONLY the nodes in this attack path + the
// flows connecting them, so each path renders its own real data flow to
// the specific crown jewel instead of the whole system map.
//
// pathNodes/pathEdges are taken from the IdentityAttackPath payload so
// nodes that don't survive the System Map's "has observed traffic" filter
// (which is system-scoped) still appear when they're in the attack path,
// and edges carry the path's real traffic_bytes / hit_count.
export interface TrafficFlowMapPathFilter {
  nodeIds: string[];
  pathNodes?: Array<{ id: string; name: string; type: string; tier?: string; lane?: string }>;
  pathEdges?: Array<{
    source: string;
    target: string;
    type?: string;
    label?: string;
    port?: number | null;
    protocol?: string | null;
    bytes?: number;
    hits?: number;
    is_observed?: boolean;
  }>;
  // IDs of crown-jewel nodes (the path's targets). Resources matching
  // any of these IDs render with a crown icon overlay in the System Map
  // RESOURCES bucket so the operator sees which resource is the actual
  // attack target vs incidental neighbors on the path.
  crownJewelIds?: string[];
  jewelName?: string;
  pathLabel?: string;
}

function bucketForType(rawType: string): 'compute' | 'resource' | 'security_group' | 'nacl' | 'iam_role' | 'principal' | 'network' | 'unknown' {
  const t = (rawType || '').toLowerCase();
  if (t.includes('ec2') || t === 'ec2instance' || t.includes('lambda') || t.includes('fargate') || t.includes('ecs')) return 'compute';
  // 2026-05-23: extended resource bucketing for the AttackChain hop
  // graph. KMSKey, SecretsManagerSecret, and SSMParameter are first-
  // class targets in the v0.3 attack-chain materialization — chains
  // walk through KMS for crypto envelopes and Secrets/SSM for
  // credential sources. Previously they bucketed as 'unknown' and
  // were dropped from the flow map, hiding entire hops.
  if (
    t.includes('s3') ||
    t.includes('bucket') ||
    t.includes('dynamo') ||
    t.includes('rds') ||
    t.includes('aurora') ||
    t.includes('database') ||
    t.includes('kmskey') ||
    t === 'kms' ||
    t.includes('secret') ||
    t.includes('ssmparameter') ||
    t.includes('parameterstore')
  ) return 'resource';
  if (t.includes('securitygroup')) return 'security_group';
  if (t.includes('nacl') || t.includes('networkacl')) return 'nacl';
  // InstanceProfile is the AWS attachment container that binds an EC2 to an
  // IAMRole — bucketed alongside iam_role so the sidebar shows the real
  // 3-node chain (EC2 → InstanceProfile → IAMRole) instead of collapsing it.
  //
  // 2026-05-23: IAMPolicy + IAMUser + IAMGroup added. IAMPolicy is the
  // actual permission grant operators must remediate (e.g.
  // S3OverPermissiveAccess) — without this it dropped silently from
  // AttackChain hops and the "what to fix" anchor disappeared.
  if (
    t.includes('iamrole') ||
    t === 'role' ||
    t.includes('instanceprofile') ||
    t === 'instance_profile' ||
    t.includes('iampolicy') ||
    t === 'policy' ||
    t.includes('iamuser') ||
    t.includes('iamgroup')
  ) return 'iam_role';
  if (t.includes('principal')) return 'principal';
  if (t.includes('vpc') || t.includes('subnet') || t.includes('routetable') || t.includes('igw') || t.includes('gateway')) return 'network';
  return 'unknown';
}

// ---------------------------------------------------------------
// Attack-path dominance helpers — shared between applyPathFilter
// (rawArchitecture + pathFilter mode) and the architectureOverride
// branch in TrafficFlowMap (override + pathFilter mode, e.g. the
// merged Attack Path tab). Extracted 2026-06-11 so the override
// path gets the EXACT same step-numbering + principal→EC2 mirroring
// instead of a drifting duplicate.
// ---------------------------------------------------------------

// CloudTrailPrincipal sessions are often named with the EC2 instance
// id they ran on (e.g. "i-0ee29afa0048943e0"). Returns the instance
// id when the name IS one, else null.
function instanceIdFromName(name: string | undefined): string | null {
  if (!name) return null;
  const m = name.match(/^(i-[a-f0-9]+)$/i);
  return m ? m[1] : null;
}

// name/id → arch-compute index so a principal session named like an
// instance ID resolves back to the actual EC2 compute card. The
// IdentityAttackPaths BFS prefers the observed CloudTrail-session edge
// over the configured USES_ROLE edge, so the principal session shows
// up in the path instead of the EC2 it belongs to.
function buildComputeByInstanceId(
  computeServices: ServiceNode[],
): Map<string, ServiceNode> {
  const byInstanceId = new Map<string, ServiceNode>();
  computeServices.forEach((c) => {
    const m = c.id.match(/i-[a-f0-9]+/i);
    if (m) byInstanceId.set(m[0], c);
  });
  return byInstanceId;
}

// Derives the renderer's dominance payload from a path filter:
//   pathStepByNodeId : 1-based step numbers from the ORDERED pathNodes
//     list (1 = entry, N = crown jewel), falling back to nodeIds order.
//     Instance-session principals mirror their step onto the resolved
//     EC2 card id so the badge lands on the card the operator sees.
//   onPathNodeIds    : dominant node set (edge dominance + card emphasis).
//   pathEdgePairKeys : "src->tgt" + reverse for every explicit path edge.
function derivePathDominance(
  filter: TrafficFlowMapPathFilter,
  archComputeByInstanceId: Map<string, ServiceNode>,
): {
  pathStepByNodeId: Map<string, number>;
  onPathNodeIds: Set<string>;
  pathEdgePairKeys: Set<string>;
} {
  const orderedPathIds: string[] =
    filter.pathNodes && filter.pathNodes.length > 0
      ? filter.pathNodes.map((pn) => pn.id)
      : filter.nodeIds;
  const pathStepByNodeId = new Map<string, number>();
  orderedPathIds.forEach((id, idx) => {
    if (!pathStepByNodeId.has(id)) pathStepByNodeId.set(id, idx + 1);
  });
  (filter.pathNodes ?? []).forEach((pn, idx) => {
    const instId = instanceIdFromName(pn.name);
    if (!instId) return;
    const resolvedId = archComputeByInstanceId.get(instId)?.id ?? instId;
    if (!pathStepByNodeId.has(resolvedId)) pathStepByNodeId.set(resolvedId, idx + 1);
  });
  const onPathNodeIds = new Set<string>([
    ...filter.nodeIds,
    ...pathStepByNodeId.keys(),
  ]);
  const pathEdgePairKeys = new Set<string>();
  (filter.pathEdges ?? []).forEach((e) => {
    pathEdgePairKeys.add(`${e.source}->${e.target}`);
    pathEdgePairKeys.add(`${e.target}->${e.source}`);
  });
  return { pathStepByNodeId, onPathNodeIds, pathEdgePairKeys };
}

function applyPathFilter(arch: SystemArchitecture, filter: TrafficFlowMapPathFilter): SystemArchitecture {
  const ids = new Set(filter.nodeIds);
  const inPath = (id: string | undefined | null) => !!id && ids.has(id);

  // Start with arch buckets filtered to path
  const computeServices: ServiceNode[] = arch.computeServices.filter((c) => inPath(c.id));
  const resources: ServiceNode[] = arch.resources.filter((r) => inPath(r.id));
  // Keep subnets whose id is in the path OR that connect to a compute in
  // the path. The latter catches subnets that aren't BFS path nodes
  // themselves but are attached to a path compute via IN_SUBNET — operators
  // want to see the subnet posture even when the subnet isn't a path step.
  const filteredComputeIds = new Set(computeServices.map((c) => c.id));
  const subnets: SubnetNode[] = (arch.subnets || []).filter((s) =>
    inPath(s.id) || s.connectedComputeIds.some((cid) => filteredComputeIds.has(cid)),
  );

  // 2026-05-23 regression fix: applyPathFilter used to strict-filter
  // securityGroups / nacls / iamRoles by inPath(id) only. The path's
  // BFS (IdentityAttackPath) frequently produces a node list that only
  // contains the chain's identity + resource hops (e.g. principal →
  // role → S3), NOT the network gates attached to the workload (SG,
  // NACL, subnet, IGW) or the instance-profile binding. Strict-filter
  // therefore stripped every gate out → the embedded TrafficFlowMap
  // collapsed to the 3-column "NO NETWORK CONTROLS" banner with
  // COMPUTE 0 / SG 0 / NACL 0 / IAM ROLES 0, contradicting both the
  // chain card and the Neo4j graph.
  //
  // Mirror the subnet rescue above: keep any checkpoint whose
  // connectedSources / connectedTargets intersects the path's compute
  // or resource set. SecurityCheckpoint.connectedSources is populated
  // upstream from flowMap.sourceId (compute IDs that flow through this
  // gate) + role/SG/NACL attachment edges — so the overlap test
  // surfaces every gate that genuinely protects a workload on this
  // path, even when the BFS didn't enumerate it as a path step.
  const filteredResourceIds = new Set(resources.map((r) => r.id));
  const touchesPath = (cp: SecurityCheckpoint): boolean => {
    if (inPath(cp.id)) return true;
    const src = cp.connectedSources || [];
    const tgt = cp.connectedTargets || [];
    return (
      src.some((cid) => filteredComputeIds.has(cid) || filteredResourceIds.has(cid)) ||
      tgt.some((cid) => filteredComputeIds.has(cid) || filteredResourceIds.has(cid))
    );
  };
  // Strict path-only filter (2026-05-29 — operator audit):
  //   onPath === false ⇒ lateral surface (same VPC, no attach edge to
  //   any path workload). Lateral chips were previously surfaced with
  //   a dim + "LATERAL" badge as "pivot context", but the audit called
  //   them out as noise — the Attack Surface view is meant to be the
  //   modelled path, not "every SG / NACL in the VPC". Drop them here
  //   in addition to the upstream filter in attacker-view-panel.tsx so
  //   no future code path can resurrect them.
  //
  // Service-agnostic: gates only on the `onPath` flag (derived upstream
  // from edge types — SECURED_BY / HAS_SECURITY_GROUP / etc — not from
  // SG name patterns).
  const isOnPathOrUnknown = (cp: SecurityCheckpoint): boolean =>
    cp.onPath !== false;
  const securityGroups: SecurityCheckpoint[] = arch.securityGroups
    .filter(touchesPath)
    .filter(isOnPathOrUnknown);
  const nacls: SecurityCheckpoint[] = arch.nacls
    .filter(touchesPath)
    .filter(isOnPathOrUnknown);
  const iamRoles: SecurityCheckpoint[] = arch.iamRoles.filter(touchesPath);

  // Seed any path node that didn't survive the System Map's traffic-only
  // bucketing (e.g. an EC2 with no flow logs but reachable via the attack
  // path) by classifying from its raw type.
  const seenIds = new Set<string>([
    ...computeServices.map((c) => c.id),
    ...resources.map((r) => r.id),
    ...securityGroups.map((sg) => sg.id),
    ...nacls.map((n) => n.id),
    ...iamRoles.map((r) => r.id),
  ]);
  // Principal-session → EC2 resolution index + attack-path dominance
  // payload. Logic lives in the shared buildComputeByInstanceId /
  // derivePathDominance helpers above so the architectureOverride
  // branch in TrafficFlowMap derives the identical metadata.
  const archComputeByInstanceId = buildComputeByInstanceId(arch.computeServices);
  const isInstanceIdName = instanceIdFromName;
  const {
    pathStepByNodeId,
    onPathNodeIds: dominantPathNodeIds,
    pathEdgePairKeys,
  } = derivePathDominance(filter, archComputeByInstanceId);

  (filter.pathNodes ?? []).forEach((pn) => {
    if (seenIds.has(pn.id)) return;
    const bucket = bucketForType(pn.type);
    const sname = shortName(pn.name);

    // CloudTrailPrincipal session named like an instance ID → resolve to
    // the EC2 instance with that ID (System Map first, then synthesize).
    if (bucket === 'principal') {
      const instId = isInstanceIdName(pn.name);
      if (instId) {
        const archMatch = archComputeByInstanceId.get(instId);
        if (archMatch && !seenIds.has(archMatch.id)) {
          computeServices.push(archMatch);
          seenIds.add(archMatch.id);
        } else if (!archMatch) {
          computeServices.push({
            id: instId,
            name: instId,
            shortName: shortName(instId),
            type: 'compute',
            instanceId: instId,
          });
          seenIds.add(instId);
        }
      }
      seenIds.add(pn.id);
      return;
    }

    if (bucket === 'compute') {
      const ct = (pn.type || '').toLowerCase();
      const subtype: NodeType = ct.includes('lambda') ? 'lambda' : 'compute';
      computeServices.push({ id: pn.id, name: pn.name, shortName: sname, type: subtype, instanceId: pn.id.substring(0, 12) });
    } else if (bucket === 'resource') {
      const t = (pn.type || '').toLowerCase();
      const subtype: NodeType = t.includes('s3') || t.includes('bucket') ? 'storage' : t.includes('dynamo') ? 'dynamodb' : t.includes('rds') || t.includes('aurora') || t.includes('database') ? 'database' : 'storage';
      resources.push({ id: pn.id, name: pn.name, shortName: sname, type: subtype });
    } else if (bucket === 'security_group') {
      // Hydrate from arch.securityGroups when possible — the path node
      // might use a slightly different id (synthesized stub, cross-system
      // reference) so name match is the reliable bridge. Without this,
      // seeded SGs render with "0 rules" even when the real SG has
      // ingress/egress rules in Neo4j.
      //
      // Strict path-only gate (2026-05-29): if the matched arch SG was
      // tagged onPath===false (lateral surface, no SECURED_BY edge to a
      // path workload), skip it. Without this gate filter.pathNodes
      // would resurrect lateral SGs that the upstream filter dropped.
      const archMatch = arch.securityGroups.find(
        (sg) => sg.id === pn.id || sg.name === pn.name,
      );
      if (archMatch && archMatch.onPath !== false) {
        securityGroups.push(archMatch);
      } else if (!archMatch) {
        securityGroups.push({ id: pn.id, type: 'security_group', name: pn.name, shortName: sname, usedCount: 0, totalCount: 0, gapCount: 0, connectedSources: [], connectedTargets: [] });
      }
    } else if (bucket === 'nacl') {
      // Same strict path-only gate for NACLs.
      const archMatch = arch.nacls.find(
        (n) => n.id === pn.id || n.name === pn.name,
      );
      if (archMatch && archMatch.onPath !== false) {
        nacls.push(archMatch);
      } else if (!archMatch) {
        nacls.push({ id: pn.id, type: 'nacl', name: pn.name, shortName: sname, usedCount: 0, totalCount: 0, gapCount: 0, connectedSources: [], connectedTargets: [] });
      }
    } else if (bucket === 'iam_role') {
      const archMatch = arch.iamRoles.find(
        (r) => r.id === pn.id || r.name === pn.name,
      );
      if (archMatch) {
        iamRoles.push(archMatch);
      } else {
        iamRoles.push({ id: pn.id, type: 'iam_role', name: pn.name, shortName: sname, usedCount: 0, totalCount: 0, gapCount: 0, connectedSources: [], connectedTargets: [] });
      }
    }
    // 'network' / 'unknown' — skip (no System Map bucket)
    seenIds.add(pn.id);
  });

  // Flows: the System Map renders flows as compute → resource gated by
  // SG/NACL/IAM checkpoints. Path edges from IdentityAttackPath don't
  // match that shape directly (they include role→S3, EC2→SG attachments,
  // etc.). Translate: for each compute/resource pair in the path,
  // synthesize ONE flow whose bytes are the sum of all path-edge bytes
  // touching the resource, gated by the SG/role/NACL nodes that are in
  // the path. This makes the System Map's animated lines render the
  // path's actual data flow.
  const computeIds = computeServices.map((c) => c.id);
  const resourceIds = resources.map((r) => r.id);
  const sgIdInPath = securityGroups[0]?.id;
  const naclIdInPath = nacls[0]?.id;
  const roleIdInPath = iamRoles[0]?.id;
  const flowKey = (s: string, t: string) => `${s}->${t}`;
  const flowMap = new Map<string, TrafficFlow>();

  // Aggregate path-edge bytes per (source, target) pair.
  //
  // 2026-05-21 credibility audit fix: previously we aggregated all
  // bytes by target_id only, then attributed them to the synthesized
  // compute→resource flow regardless of which node actually carried
  // the bytes on the original edge. That's how the EC2 card ended up
  // showing 771.3 KB on a path where the EC2 has zero direct traffic
  // edges — those bytes actually lived on a downstream IAMRole→S3
  // ACCESSES_RESOURCE edge.
  //
  // Now we key per-pair so each synthesized flow only inherits bytes
  // from a path edge with matching (source, target). The compute→
  // resource flow gets 0 bytes when there's no direct compute→resource
  // edge; the role→resource flow inherits the role's actual observed
  // bytes. Operator sees the truth: bytes painted on the lane where
  // they actually were observed.
  type ByteAgg = { bytes: number; hits: number; observed: boolean; ports: Set<string>; protocols: Set<string> };
  const bytesBySrcTgt = new Map<string, ByteAgg>();
  // Keep the per-resource aggregate for the resource lane (which is
  // honest — total inbound bytes to a resource = sum of all edges
  // landing on it, regardless of source).
  const bytesByResource = new Map<string, ByteAgg>();
  (filter.pathEdges ?? []).forEach((e) => {
    if (!resourceIds.includes(e.target)) return;
    const pairKey = `${e.source}->${e.target}`;
    const pair = bytesBySrcTgt.get(pairKey) ?? { bytes: 0, hits: 0, observed: false, ports: new Set<string>(), protocols: new Set<string>() };
    pair.bytes += e.bytes ?? 0;
    pair.hits += e.hits ?? 0;
    if (e.is_observed) pair.observed = true;
    if (e.port) pair.ports.add(String(e.port));
    if (e.protocol) pair.protocols.add(e.protocol);
    bytesBySrcTgt.set(pairKey, pair);

    const resAgg = bytesByResource.get(e.target) ?? { bytes: 0, hits: 0, observed: false, ports: new Set<string>(), protocols: new Set<string>() };
    resAgg.bytes += e.bytes ?? 0;
    resAgg.hits += e.hits ?? 0;
    if (e.is_observed) resAgg.observed = true;
    if (e.port) resAgg.ports.add(String(e.port));
    if (e.protocol) resAgg.protocols.add(e.protocol);
    bytesByResource.set(e.target, resAgg);
  });

  // IAM role→resource flow synthesis. Now ALWAYS runs (was previously
  // gated to "computeIds.length === 0" only). Role→resource bytes are
  // the truth signal on EC2-rooted paths too — when the EC2 has no
  // direct traffic but the role does, the bytes belong on the role
  // edge, not the compute edge.
  if (iamRoles.length > 0 && resourceIds.length > 0) {
    iamRoles.forEach((role) => {
      resourceIds.forEach((rid) => {
        // Look for a direct role→resource edge in the path data
        const direct = bytesBySrcTgt.get(`${role.id}->${rid}`);
        if (!direct || (direct.bytes === 0 && !direct.observed)) return;
        flowMap.set(flowKey(role.id, rid), {
          sourceId: role.id,
          targetId: rid,
          sgId: undefined,
          naclId: undefined,
          roleId: role.id,
          ports: [...direct.ports],
          protocol: [...direct.protocols][0] || 'IAM',
          bytes: direct.bytes,
          connections: direct.hits > 0 ? direct.hits : (direct.bytes > 0 ? 1 : 0),
          isActive: direct.observed && direct.bytes > 0,
        });
      });
    });
  }

  computeIds.forEach((cid) => {
    resourceIds.forEach((rid) => {
      // STRICT: only include bytes if there's a DIRECT compute→resource
      // edge in the path. No more "inherit aggregate bytes from any
      // edge touching this resource."
      const direct = bytesBySrcTgt.get(`${cid}->${rid}`);
      const agg = direct ?? { bytes: 0, hits: 0, observed: false, ports: new Set<string>(), protocols: new Set<string>() };
      const bytes = agg.bytes;
      // Use 1 connection minimum when there's traffic so the animated
      // line renders. The path data sets hit_count to 0 even when bytes
      // are present (CloudTrail-derived).
      const connections = agg.hits > 0 ? agg.hits : (bytes > 0 ? 1 : 0);
      flowMap.set(flowKey(cid, rid), {
        sourceId: cid,
        targetId: rid,
        sgId: sgIdInPath,
        naclId: naclIdInPath,
        roleId: roleIdInPath,
        ports: [...agg.ports],
        protocol: [...agg.protocols][0] || (agg.observed ? 'TCP' : 'CONFIGURED'),
        bytes,
        connections,
        isActive: agg.observed && bytes > 0,
      });
    });
  });

  // Also keep any arch flows that match the path (different-shaped
  // checkpoint info we'd otherwise lose).
  arch.flows.forEach((f) => {
    if (!inPath(f.sourceId) || !inPath(f.targetId)) return;
    if (f.sgId && !inPath(f.sgId)) return;
    if (f.naclId && !inPath(f.naclId)) return;
    if (f.roleId && !inPath(f.roleId)) return;
    const key = flowKey(f.sourceId, f.targetId);
    const existing = flowMap.get(key);
    // Prefer the synthesized flow when it has bytes; otherwise fall back
    // to the arch flow.
    if (!existing || (existing.bytes === 0 && f.bytes > 0)) {
      flowMap.set(key, f);
    }
  });

  const flows: TrafficFlow[] = [...flowMap.values()];

  // VPCE rendering rule — STRICT after 2026-05-21 credibility audit.
  //
  // VPCEs render ONLY when there's actual evidence the path's traffic
  // uses them:
  //   (a) BFS path includes the VPCE as a node (filter.nodeIds), OR
  //   (b) A flow explicitly carries flow.vpceId from route-table-driven
  //       dep-map matching (filteredFlowVPCEIds).
  //
  // The old rule — "VPCE exists in the same VPC as a path compute" —
  // was fabrication-by-implication. Across all 48 paths on alon-prod,
  // ZERO have VPCEndpoint as a BFS node. The "same VPC" rule was
  // painting the S3 Gateway VPCE on every EC2-rooted path even though
  // we had no route table data to prove the traffic uses it. CISOs
  // would (rightly) ask "how do you know it goes via VPCE?" and we
  // had no answer.
  //
  // Per feedback_verify_against_sources — Neo4j is the single source
  // of truth. If the BFS didn't include the VPCE, and no flow has
  // route-table-driven evidence binding it, the VPCE lane stays empty.
  // Honest empty > fake placement.
  //
  // egressGateways (IGW/NAT) gets the same treatment for the same reason.
  const filteredFlowVPCEIds = new Set<string>(flows.map(f => f.vpceId).filter(Boolean) as string[]);
  const vpcEndpoints = arch.vpcEndpoints.filter(v =>
    inPath(v.id) || filteredFlowVPCEIds.has(v.id),
  );

  // Egress gateways — same evidence standard. Either the BFS includes
  // the gateway, or a flow explicitly carries gateway routing
  // evidence.
  //
  // Canvas v3 Slice C — relaxation for visualize-by-negation: we ALSO
  // include same-VPC sibling gateways (typically the IGW that lives in
  // the workload's VPC but isn't the winning route for the on-path
  // S3 destination). The renderer (Slice A) grays these as "Not used"
  // so the operator sees the unused alternative — the security claim
  // "VPCE wins, IGW exists but doesn't carry this traffic" becomes
  // palpable as the gap between full-color and grayed.
  //
  // Per pattern_visualize_by_negation. Without this relaxation, the
  // lane would only show the winning gateway and the negation half of
  // the security story stays invisible.
  const filteredFlowGatewayIds = new Set<string>(
    flows.map(f => (f as any).egressGatewayId).filter(Boolean) as string[],
  );
  // Collect VPCs that any path node lives in so we can include their
  // sibling gateways as visible-but-grayed alternatives.
  const pathVPCIds = new Set<string>();
  arch.subnets?.forEach(s => { if (s.vpcId) pathVPCIds.add(s.vpcId); });
  arch.vpcGroups?.forEach(g => { if (g.vpcId) pathVPCIds.add(g.vpcId); });
  const egressGateways = arch.egressGateways.filter(
    g =>
      inPath(g.id) ||
      filteredFlowGatewayIds.has(g.id) ||
      (g.vpcId !== null && g.vpcId !== undefined && pathVPCIds.has(g.vpcId)) ||
      // Trust-backend-inclusion: when the backend returns a gateway node
      // in canvas.nodes but the gateway has no vpc_id direct property
      // (IGW nodes in Neo4j carry their VPC via IN_VPC edges, not as a
      // property), the assembler stores it with vpcId=null. Empirically
      // verified 2026-06-01 on path-5203dfee3012: igw-0d1dd1d08b071f5cf
      // appears in canvas.nodes with key_properties.vpc_id missing — the
      // backend's inclusion is itself the signal that the gateway is
      // path-relevant. Don't reject the empirical truth because of a
      // property-shape gap. Surface it grayed (Slice A renderer) so the
      // operator sees the unused alternative.
      g.vpcId === null ||
      g.vpcId === undefined,
  );

  return {
    computeServices,
    resources: resources.map((r) =>
      filter.crownJewelIds && filter.crownJewelIds.includes(r.id) ? { ...r, isCrownJewel: true } : r,
    ),
    subnets,
    securityGroups,
    nacls,
    iamRoles,
    vpcEndpoints,
    egressGateways,
    flows,
    totalBytes: flows.reduce((s, f) => s + (f.bytes || 0), 0),
    totalConnections: flows.reduce((s, f) => s + (f.connections || 0), 0),
    totalGaps: securityGroups.reduce((s, sg) => s + sg.gapCount, 0) + iamRoles.reduce((s, r) => s + r.gapCount, 0),
    vpcGroups: arch.vpcGroups,
    // Attack-path dominance payload — presence of pathStepByNodeId is
    // the renderer's "pathFilter is active" gate.
    onPathNodeIds: dominantPathNodeIds,
    pathStepByNodeId,
    pathEdgePairKeys,
  };
}

// Per-node action callback. When set, clicking a node in path-filter
// mode short-circuits the internal "service details" popup and routes
// to the caller — e.g. the Attack Paths page wants SG clicks to open
// the SG remediation modal, IAM-role clicks to open the IAM modal,
// resource clicks (S3 jewel) to open the S3 modal.
//
// Falls back to the internal popup when this callback is not provided
// (used by the standalone Topology → System Map view).
export type PathNodeKind = "compute" | "resource" | "security_group" | "nacl" | "iam_role" | "instance_profile" | "api_call";
// `via` carries the InstanceProfile wrapper context when the click target
// is an IP. The parent resolves the wrapped role and routes to the IAM
// modal with that pedigree — InstanceProfile share names with their
// IAMRole, so name-based lookup is ambiguous; ARN + via context is the
// engineering-grade fix.
export type OnPathNodeAction = (
  kind: PathNodeKind,
  node: {
    id: string;
    name: string;
    type?: string;
    via?: { kind: "InstanceProfile"; id: string; name: string; arn?: string };
  },
) => void;

const DAMAGE_SCOPE_DATA_TYPES = new Set([
  'S3Bucket',
  'DynamoDBTable',
  'RDSInstance',
  'KMSKey',
  'SecretsManagerSecret',
]);

/** Canvas ServiceNode.type is NodeType (storage/database); backend expects S3Bucket etc. */
function resolveDamageScopeNodeType(
  service: { id?: string; type?: string },
  laneType: string,
): string | null {
  if (laneType !== 'resource') return null
  const t = String(service.type || '')
  const id = String(service.id || '').toLowerCase()
  if (DAMAGE_SCOPE_DATA_TYPES.has(t)) return t
  if (t === 'storage' || id.includes(':s3:') || id.includes('s3:::')) return 'S3Bucket'
  if (t === 'dynamodb' || id.includes('dynamodb')) return 'DynamoDBTable'
  if (t === 'database' || id.includes(':rds:')) return 'RDSInstance'
  if (id.includes('kms') || t.includes('kms')) return 'KMSKey'
  if (id.includes('secretsmanager')) return 'SecretsManagerSecret'
  return null
}

export default function TrafficFlowMap({
  systemName,
  pathFilter,
  onPathNodeAction,
  onDamageScopeDataNode,
  exfilByWorkloadId,
  architectureOverride,
  titleOverride,
  pathBadgeOverride,
  innerTitleOverride,
  innerSubtitleOverride,
  observedMode = false,
  defaultShowVPCBoundaries = false,
  headerSlot,
  onRoleClick,
  jewelEmphasis = false,
  jewelSeverity,
  canvasV2 = false,
  entryNodeId,
  fullscreenContainerRef,
  onCrownJewelSpotlight,
  spotlightActiveNodeIds,
  spotlightPaths,
  spotlightPathId,
  spotlightJewel,
  systemCrownJewelIds,
}: {
  systemName: string;
  pathFilter?: TrafficFlowMapPathFilter;
  onPathNodeAction?: OnPathNodeAction;
  /** Data-plane nodes (S3, DDB, RDS, KMS, Secrets) → damage-scope drawer */
  onDamageScopeDataNode?: (node: { id: string; name: string; type: string }) => void;
  /** Crown Jewel Spotlight (2026-06-22) — when a Resource node carries
   *  `isCrownJewel=true` AND this callback is provided, the canvas / sidebar
   *  click is intercepted and routed to Spotlight mode instead of the
   *  damage-scope drawer. Parent owns the URL sync (?cj=…). Non-CJ resources
   *  fall through to the existing damage-scope / detail-drawer paths
   *  unchanged. Real-data only: parent reads /api/proxy/attack-paths/
   *  <system>/by-crown-jewel via useCrownJewelConvergence. */
  onCrownJewelSpotlight?: (cj: { id: string; arn?: string | null; name: string; type: string }) => void;
  /** Crown Jewel Spotlight v1.2 (2026-06-22) — set of node IDs that
   *  participate in at least one attack path to the focused CJ. When
   *  non-empty, TFM dims every node NOT in this set (the canvas
   *  collapses to the kill-chain spine). Computed by the parent from
   *  the same by-crown-jewel response that drives the strip — single
   *  source of truth. Undefined / empty = Spotlight off, no dimming. */
  spotlightActiveNodeIds?: Set<string>;
  /** Bug L — live convergence paths for CJ spotlight union. When set,
   *  TFM unions workloads/SGs across all paths (unless spotlightPathId
   *  pins a single path) using architecture-aware id resolution. */
  spotlightPaths?: ConvergencePath[];
  spotlightPathId?: string | null;
  spotlightJewel?: { id: string; canonical_id?: string | null };
  /** Crown Jewel always-on marking (2026-06-22) — set of node IDs the
   *  parent knows are Crown Jewels for this system, fetched from the
   *  per-system attack-paths endpoint. When a resource's id is in this
   *  set, `isCrownJewel` is forced true so the amber crown badge renders
   *  in default canvas mode — not only inside an active path filter.
   *  Without this, operators couldn't tell which canvas nodes were CJs
   *  unless they opened the Spotlight. Single source of truth: the
   *  graph's `is_crown_jewel` flag, surfaced via the IAP fan-out. */
  systemCrownJewelIds?: Set<string>;
  // chunk #1.5: optional per-workload exfil-risk map keyed by node.id.
  // Provided by the attack-paths parent; the Topology tab does not
  // pass this, so the chip is suppressed there.
  exfilByWorkloadId?: Record<string, NodeExfilSummary>;
  // Optional ReactNode rendered inline in the TFM top toolbar, right
  // after the title + pathBadge. Used by the EXFIL view to inject its
  // per-path selector pills so they stay visible when TFM is in
  // full-screen mode (where the outer panel chrome is hidden).
  // 2026-05-25: shipped after the selector strip ended up unreachable
  // in fullscreen.
  headerSlot?: React.ReactNode;
  // When provided, this fully-formed SystemArchitecture is used in place
  // of the dependency-map fetch. The dep-map fetch is still kicked off
  // for stale-cache warming, but the override wins the render. This is
  // how Data Leak Paths feeds its per-path egress architecture through
  // the same renderer Attack Paths uses, so both pages share the visual
  // language (header, lanes, ServiceNodeBox, ConnectionLinesSVG).
  architectureOverride?: SystemArchitecture | null;
  // Header title + the "PATH → …" pill. Default copy is attack-paths
  // flavored; Data Leak Paths passes its own.
  titleOverride?: string;
  pathBadgeOverride?: string;
  // Inner canvas header (the "System Architecture / Live traffic flow
  // based on actual usage" copy). Data Leak Paths overrides both for
  // egress-flavored copy.
  innerTitleOverride?: string;
  innerSubtitleOverride?: string;
  // When true, the API CALLS lane drops the "(simulated)" tag and the
  // Gaps badge is suppressed. Use when the architecture carries real
  // observed telemetry (Data Leak Paths case).
  observedMode?: boolean;
  // When true, the VPC-boundary overlay is on by default (operator can
  // still toggle it off via the header VPC checkbox). Attacker view
  // turns this on so the VPC container hop on the path is visible
  // without requiring an extra click — the VPC is genuinely part of
  // the chain (EC2 → SG → VPC → Subnet → Role), not a layered overlay.
  defaultShowVPCBoundaries?: boolean;
  // Optional click hook on the IAM role chip. When provided, the EXFIL
  // view subscribes so clicking a role opens the RoleDetailPanel
  // (slides in from the right) instead of the existing generic
  // service-selection modal. Lets the canvas chip stay COMPACT —
  // the 5 stack-component sections live in the panel, not stacked on
  // the chip itself. 2026-05-27, Alon "i cant understand nothing".
  onRoleClick?: (role: SecurityCheckpoint) => void;
  // 2026-05-28 — Phase 2 V1 slice 1. Forwarded to
  // UnifiedArchitectureDiagram. When true, resource nodes flagged as
  // crown jewels render visibly heavier (1.15x scale + persistent
  // emerald glow). ATTACKER VIEW opts in; other consumers (System
  // Map, Per-Path View, Exfil View) leave the default off.
  jewelEmphasis?: boolean;
  // V2-2 (2026-05-31): when provided, the crown jewel's halo color
  // is driven by chain severity instead of the default emerald. Used
  // by the Attack Path tab's ?canvas=v2 visual layer so the eye
  // lands on the jewel weighted by attacker reachability:
  //   CRITICAL → red, HIGH → orange, MEDIUM → amber, LOW → emerald.
  // Pure visual — no behavior change. When undefined or LOW, the
  // existing emerald glow renders (back-compat preserved).
  jewelSeverity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string;
  // V2-3 (2026-05-31): visual v2 master switch. When true, the canvas
  // applies the lateral-dimming + verb-chips + 3-color palette layer
  // on top of the existing render. When undefined/false, the canvas
  // renders identically to its pre-V2 behavior (back-compat). Driven
  // by the ?canvas=v2 URL flag in PathAnalysisPanel.
  canvasV2?: boolean;
  // V2-2b (2026-05-31): id of the chain's hop[0] node. Drives the
  // "ENTRY" chip overlay on the matching card. When canvasV2 is off
  // or the prop is undefined, no chip renders.
  entryNodeId?: string;
  /** Set to the canvas root while in browser fullscreen (for Radix portal container). */
  fullscreenContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
}) {
  // rawArchitecture holds the unfiltered architecture from the most
  // recent fetch. We derive the displayed `architecture` from it (with
  // pathFilter applied if set) via useMemo, so switching attack paths
  // re-renders instantly without refetching and stale fetches can't
  // race-overwrite the right filter.
  const [rawArchitecture, setRawArchitecture] = useState<SystemArchitecture | null>(null);
  const baseArchitecture = useMemo(() => {
    // Always-on Crown Jewel marking pass. Applies AFTER any override /
    // pathFilter logic so existing `isCrownJewel: true` from
    // applyPathFilter is preserved (logical OR via `|| existing`).
    // Without this, the amber crown badge only renders inside a path
    // filter — operators on the default System Map have no visual way
    // to spot which resources are crown jewels.
    const markCjs = (arch: SystemArchitecture | null): SystemArchitecture | null => {
      if (!arch) return arch;
      if (!systemCrownJewelIds || systemCrownJewelIds.size === 0) return arch;
      return {
        ...arch,
        resources: arch.resources.map((r) =>
          systemCrownJewelIds.has(r.id) ? { ...r, isCrownJewel: true } : r,
        ),
      };
    };
    if (architectureOverride) {
      // 2026-06-11 bug fix: callers like the merged Attack Path tab
      // (path-analysis-panel.tsx) pass BOTH architectureOverride AND
      // pathFilter. The override used to short-circuit applyPathFilter
      // entirely, so pathStepByNodeId / pathEdgePairKeys / onPathNodeIds
      // were never populated — no dominant spine, no numbered step
      // badges, no ring emphasis, no faded background edges. Derive the
      // dominance payload here via the SAME shared helpers applyPathFilter
      // uses (incl. principal-session → EC2 step mirroring) and attach it
      // to a shallow copy — never mutate the caller's prop object.
      if (
        pathFilter &&
        !(architectureOverride.pathStepByNodeId && architectureOverride.pathStepByNodeId.size > 0)
      ) {
        const dom = derivePathDominance(
          pathFilter,
          buildComputeByInstanceId(architectureOverride.computeServices),
        );
        if (dom.pathStepByNodeId.size > 0) {
          return markCjs({
            ...architectureOverride,
            pathStepByNodeId: dom.pathStepByNodeId,
            pathEdgePairKeys: dom.pathEdgePairKeys,
            // Union with any caller-supplied on-path set (canvasV2
            // lateral dimming) — both claim "this node is on the chain".
            onPathNodeIds: architectureOverride.onPathNodeIds
              ? new Set([...architectureOverride.onPathNodeIds, ...dom.onPathNodeIds])
              : dom.onPathNodeIds,
          });
        }
      }
      return markCjs(architectureOverride);
    }
    if (!rawArchitecture) return null;
    return markCjs(pathFilter ? applyPathFilter(rawArchitecture, pathFilter) : rawArchitecture);
  }, [rawArchitecture, pathFilter, architectureOverride, systemCrownJewelIds]);

  const architecture = useMemo(() => {
    if (!baseArchitecture || !spotlightPaths?.length) return baseArchitecture;
    return enrichArchitectureForSpotlight(
      baseArchitecture,
      spotlightPaths,
      spotlightPathId ?? null,
    );
  }, [baseArchitecture, spotlightPaths, spotlightPathId]);

  const effectiveSpotlightActiveNodeIds = useMemo(() => {
    if (spotlightPaths?.length) {
      const built = buildSpotlightActiveNodeIds({
        paths: spotlightPaths,
        spotlightPathId: spotlightPathId ?? null,
        jewel: spotlightJewel ?? null,
        architecture: architecture
          ? {
              computeServices: architecture.computeServices,
              securityGroups: architecture.securityGroups.map((sg) => ({
                id: sg.id,
                name: sg.name,
                connectedSources: sg.connectedSources,
              })),
              iamRoles: architecture.iamRoles,
              flows: architecture.flows,
              vpcEndpoints: architecture.vpcEndpoints,
            }
          : null,
      })
      if (built.size > 0) return built
    }
    return spotlightActiveNodeIds
  }, [
    spotlightPaths,
    spotlightPathId,
    spotlightJewel,
    architecture,
    spotlightActiveNodeIds,
  ])

  const setArchitecture = setRawArchitecture;

  // Manual-refresh epoch. Bumping flips the URL (adds &_t=N) AND flips
  // the fetchInit to cache:'no-store', so retry busts both the
  // useCachedFetch localStorage layer and the proxy edge cache.
  const [manualBustEpoch, setManualBustEpoch] = useState(0);
  // Local error for the "fetch succeeded but returned 0 nodes" case.
  // Hook-level errors come from useCachedFetch directly; this one only
  // fires after a valid response with empty payload.
  const [emptyDataError, setEmptyDataError] = useState<string | null>(null);

  // V2-3 (2026-05-31): "Show laterals" toggle for canvas-v2 mode.
  // Default is FALSE → lateral edges + nodes render dimmed at ~30%
  // opacity (path is the hero). Toggle to TRUE → laterals at full
  // opacity (operator pivots to see the lateral story). State
  // persists in localStorage scoped per-user (not per-chain) so the
  // operator's preference sticks across navigation.
  const [showLaterals, setShowLateralsState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try {
      return window.localStorage.getItem("cyntro:canvasV2:showLaterals") === "true"
    } catch {
      return false
    }
  })
  const setShowLaterals = useCallback((next: boolean) => {
    setShowLateralsState(next)
    try {
      window.localStorage.setItem("cyntro:canvasV2:showLaterals", String(next))
    } catch {
      /* private mode / quota */
    }
  }, [])

  const depMapUrl = useMemo(() => {
    // maxNodes=300 (was 500). On alon-prod's graph, 500 nodes pushes
    // the backend past the 55s upstream timeout and surfaces 504/502
    // when the in-memory + edge caches are cold. 300 nodes still
    // covers all 7 EC2 instances + their SGs/NACLs/Subnets/VPCs + the
    // top IAM roles, which is what this viz actually renders.
    const cacheBust = manualBustEpoch > 0 ? `&_t=${manualBustEpoch}` : "";
    return `/api/proxy/dependency-map/full?systemName=${systemName}&includeUnused=true&maxNodes=300${cacheBust}`;
  }, [systemName, manualBustEpoch]);

  const depMapFetchInit = useMemo<RequestInit>(() => {
    return manualBustEpoch > 0
      ? { cache: "no-store", headers: { "Cache-Control": "no-cache" } }
      : {};
  }, [manualBustEpoch]);

  const {
    data: rawDepMap,
    loading: depMapLoading,
    error: depMapError,
    retry: retryDepMap,
  } = useCachedFetch<{ nodes?: any[]; edges?: any[]; relationships?: any[] }>(depMapUrl, {
    cacheKey: `tfm-depmap:${systemName}`,
    // 5-min freshness — aligns with the proxy's edge cache (s-maxage=120)
    // with headroom; older cache still renders with isStale=true (up to
    // the hook's 7d hard cap), keeping the architecture on screen even
    // when the backend is unreachable. First-visit cold-cache renders
    // hit the network and wait for the 30-40s backend; every subsequent
    // visit paints in ~1ms from localStorage.
    maxStaleMs: 5 * 60 * 1000,
    fetchInit: depMapFetchInit,
  });

  // Derived from the hook so the existing render gates ("Building
  // Architecture..." spinner and red error popup) work unchanged.
  // loading: only true on first-ever visit (no cache, hook still
  //   fetching). Subsequent visits paint from cache and skip the spinner.
  // error: emptyDataError (0-node response) wins over depMapError, which
  //   the hook only surfaces when there is no cached fallback at all —
  //   so a 504 during background refresh keeps the stale view rather
  //   than flashing the red popup.
  // When the caller passes an architectureOverride we already have the
  // data — never block the render on the dep-map fetch (which is best-
  // effort warming only in that mode).
  const loading = !architectureOverride && depMapLoading && !rawArchitecture;
  const error = architectureOverride ? null : (emptyDataError ?? depMapError);
  // Fetch-generation counter. Each runEnrichment call bumps this;
  // background enrichment closures capture the epoch at start and skip
  // their setArchitecture if a newer fetch has resolved in the meantime.
  //
  // Bug this prevents: operator navigates alon-prod → cyntroprod within
  // the ~5-10s background-enrichment window. The OLD closure still holds
  // alon-prod's archForGaps. When its slow IAM fetches complete, the
  // .then() callback would call setArchitecture({...alonProdArch}) and
  // silently overwrite the freshly-fetched cyntroprod architecture with
  // alon-prod data — wrong role counts, wrong SG list, all wrong.
  const fetchEpochRef = useRef(0);
  /** Skip duplicate IAM/SG batch POSTs when useCachedFetch re-fires with same arch. */
  const lastBatchEnrichmentKeyRef = useRef<string | null>(null);
  const [animate, setAnimate] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'fetching' | 'success' | 'error'>('idle');
  // Enrichment-failure flags (2026-06-22 P4): when an IAM or SG batch
  // request fails, the per-role / per-SG N+1 fallback was REMOVED (it
  // compounded the saturation that caused the batch to fail). So the
  // chips silently fall back to their build-time seed values — which
  // would have been a silent UX degradation. These flags drive a
  // toolbar chip that surfaces the gap honestly instead.
  const [iamEnrichmentFailed, setIamEnrichmentFailed] = useState(false);
  const [sgEnrichmentFailed, setSgEnrichmentFailed] = useState(false);
  const [lastChanges, setLastChanges] = useState<DataChanges | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false); // Manual refresh by default
  const [refreshInterval, setRefreshInterval] = useState(600); // 10 minutes
  const [selectedService, setSelectedService] = useState<{ service: ServiceNode | SecurityCheckpoint; type: 'compute' | 'resource' | 'security_group' | 'nacl' | 'iam_role' | 'api_call' } | null>(null);
  const [showAttackPaths, setShowAttackPaths] = useState(false);
  const [attackPaths, setAttackPaths] = useState<AttackPath[]>([]);
  // 2026-06-25 (density toggle): default ON. Operator workflow
  // pushback: defaulting OFF made the canvas look empty/broken to
  // operators inspecting the broad Topology — they expect to see
  // flows immediately. Toggling OFF stays as the escape hatch when
  // the spaghetti is too dense to read. ConnectionLinesSVG still
  // pre-filters to flows that touch hovered/attack-path edges when
  // off, so the off-state isn't "all hidden" — it's "narrow to
  // what you're looking at".
  const [showAllConnections, setShowAllConnections] = useState(true);
  const [loadingAttackPaths, setLoadingAttackPaths] = useState(false);
  const [selectedAttackPath, setSelectedAttackPath] = useState<string | null>(null);
  const [showPathDetails, setShowPathDetails] = useState<string | null>(null);
  // New killer map features.
  //
  // Default sidebar state is driven by the rendering mode:
  //   - Path-filter mode (Attack Paths v2, attack-paths drill-in): closed
  //     by default. The map shows only the path's nodes, the lane chips
  //     are the navigation, and the Stack Components tree just duplicates
  //     what the map already renders. Sidebar wastes ~280px of
  //     horizontal space the operator wants for the flow itself.
  //   - Unfiltered System Map (Topology tab): open by default. Operator
  //     uses the sidebar tree to navigate the full system inventory.
  //
  // A toggle button stays available either way so the operator can
  // re-open the sidebar on demand (per the 2026-05-21 design review:
  // "collapse by default, don't permanently hide").
  //
  // 2026-06-09: design pivot — operator review on the embedded per-path
  // canvas confirmed they want StackSidebar OPEN by default in both
  // contexts. The "closed when pathFilter" branch was hiding the rich
  // path-scoped inventory that is the operator's primary navigation
  // surface on the Per-Path tab. Defaulting open everywhere; toggle
  // remains available to collapse when the operator needs canvas
  // real-estate.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [hopDepth, setHopDepth] = useState(3);
  const [selectedNodeForHops, setSelectedNodeForHops] = useState<string | null>(null);
  const [showVPCBoundaries, setShowVPCBoundaries] = useState(defaultShowVPCBoundaries);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  // Resource-path filter — set when the user clicks a leaf in the
  // Stack Components sidebar drill-down (S3 prefix, RDS table, DDB
  // table). Shape: { resourceId, parentJewelId, accessorIds, ... }.
  // Used to highlight matching map nodes + show the active filter
  // banner. null = no filter.
  const [resourcePathsFilter, setResourcePathsFilter] = useState<{
    resourceId: string;
    resolvedTargetId: string;
    parentJewelId: string;
    resolvedTargetType: string | null;
    accessorIds: string[];
    sourceIps: string[];
    filter: { database?: string; table?: string } | null;
    leafType: string | null;
  } | null>(null);
  const [timelineActive, setTimelineActive] = useState(false);
  const [timeWindow, setTimeWindow] = useState<'7d' | '30d' | '90d'>('30d');
  const [timePoint, setTimePoint] = useState(100);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const previousArchRef = useRef<SystemArchitecture | null>(null);

  // BFS to find nodes within N hops for dependency depth
  const ghostedNodeIds = useMemo(() => {
    // ── Crown Jewel Spotlight v1.2 (2026-06-22) ──────────────────
    // When the parent has computed a non-empty spotlightActiveNodeIds
    // set, that takes precedence: ghost every node NOT on a path to
    // the focused CJ. The set is the union of source / identity /
    // cj_target / hop ids from the live by-crown-jewel response —
    // single source of truth shared with the strip. No heatmap
    // intersection here on purpose: Spotlight is a scoped view, the
    // operator already opted in by clicking a CJ.
    if (effectiveSpotlightActiveNodeIds && effectiveSpotlightActiveNodeIds.size > 0 && architecture) {
      const allNodeIds = new Set<string>();
      architecture.computeServices.forEach(n => allNodeIds.add(n.id));
      architecture.resources.forEach(n => allNodeIds.add(n.id));
      architecture.securityGroups.forEach(n => allNodeIds.add(n.id));
      architecture.nacls.forEach(n => allNodeIds.add(n.id));
      architecture.iamRoles.forEach(n => allNodeIds.add(n.id));
      (architecture.entryPoints ?? []).forEach(n => allNodeIds.add(n.id));
      (architecture.principals ?? []).forEach(n => allNodeIds.add(n.id));
      (architecture.instanceProfiles ?? []).forEach(n => allNodeIds.add(n.id));
      (architecture.iamPolicies ?? []).forEach(n => allNodeIds.add(n.id));
      (architecture.vpcEndpoints ?? []).forEach(n => allNodeIds.add(n.id));
      (architecture.egressGateways ?? []).forEach(n => allNodeIds.add(n.id));
      const ghosted = new Set<string>();
      allNodeIds.forEach(id => {
        if (!effectiveSpotlightActiveNodeIds.has(id)) ghosted.add(id);
      });
      return ghosted;
    }
    // ── Heatmap mode (existing behavior, unchanged) ──────────────
    if (!heatmapMode || !selectedNodeForHops || !architecture) return new Set<string>();
    const adj = new Map<string, Set<string>>();
    architecture.flows.forEach(f => {
      if (!adj.has(f.sourceId)) adj.set(f.sourceId, new Set());
      if (!adj.has(f.targetId)) adj.set(f.targetId, new Set());
      adj.get(f.sourceId)!.add(f.targetId);
      adj.get(f.targetId)!.add(f.sourceId);
      // Include checkpoint nodes
      [f.sgId, f.naclId, f.roleId].filter(Boolean).forEach(cp => {
        if (cp) {
          if (!adj.has(cp)) adj.set(cp, new Set());
          adj.get(f.sourceId)!.add(cp);
          adj.get(cp)!.add(f.targetId);
        }
      });
    });
    // BFS
    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: selectedNodeForHops, depth: 0 }];
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > hopDepth) continue;
      visited.add(id);
      const neighbors = adj.get(id);
      if (neighbors) {
        neighbors.forEach(n => {
          if (!visited.has(n)) queue.push({ id: n, depth: depth + 1 });
        });
      }
    }
    // All nodes NOT in visited are ghosted
    const allNodeIds = new Set<string>();
    architecture.computeServices.forEach(n => allNodeIds.add(n.id));
    architecture.resources.forEach(n => allNodeIds.add(n.id));
    architecture.securityGroups.forEach(n => allNodeIds.add(n.id));
    architecture.nacls.forEach(n => allNodeIds.add(n.id));
    architecture.iamRoles.forEach(n => allNodeIds.add(n.id));
    const ghosted = new Set<string>();
    allNodeIds.forEach(id => { if (!visited.has(id)) ghosted.add(id); });
    return ghosted;
  }, [heatmapMode, selectedNodeForHops, hopDepth, architecture, effectiveSpotlightActiveNodeIds]);

  const buildArchitecture = useCallback((nodes: any[], edges: any[], iamData: any[]): SystemArchitecture => {
    const extractInstanceId = (id: string | null | undefined): string => {
      if (!id) return 'unknown';
      const match = id.match(/i-[a-f0-9]+/);
      return match ? match[0] : id;
    };

    const extractResourceName = (id: string | null | undefined): string => {
      if (!id) return 'unknown';
      if (id.includes(':db:')) return id.split(':db:')[1];
      if (id.includes(':::')) return id.split(':::')[1];
      if (id.includes('/')) return id.split('/').pop() || id;
      return id;
    };

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const nodeByInstanceId = new Map<string, any>();
    const nodeByResourceName = new Map<string, any>();

    nodes.forEach(n => {
      const instanceId = extractInstanceId(n.id);
      const nTypeForIndex = (n.type || '').toLowerCase();
      const isRealComputeForIndex = nTypeForIndex.includes('ec2') || nTypeForIndex.includes('lambda');
      // Accuracy-audit F4 (2026-06-11): index compute by NODE IDENTITY,
      // not only by the AWS `i-...` instance-id shape. EC2 nodes with a
      // null instance_id surface with a name-like id (e.g. `xxxxweb1` on
      // alon-prod) and were silently dropped from the compute lane —
      // a real foothold with full-takeover damage never rendered. For
      // those nodes extractInstanceId() returns the raw id, which is
      // exactly the canonical key the flow/lane builders use.
      if (instanceId.startsWith('i-') || isRealComputeForIndex) {
        // Prefer actual EC2/Lambda nodes over CloudTrailPrincipal nodes that share the same instance ID
        const existing = nodeByInstanceId.get(instanceId);
        if (!existing || isRealComputeForIndex) {
          nodeByInstanceId.set(instanceId, n);
        }
      }
      const resourceName = extractResourceName(n.id);
      const existingByName = nodeByResourceName.get(resourceName);
      const nType = (n.type || '').toLowerCase();
      const isRealResource = !nType.includes('cloudtrailprincipal') && !nType.includes('principal');
      if (!existingByName || isRealResource) {
        nodeByResourceName.set(resourceName, n);
      }
      if (!nodeByResourceName.has(n.name || n.id) || isRealResource) {
        nodeByResourceName.set(n.name || n.id, n);
      }
    });

    const computeToSG = new Map<string, string>();
    const computeToNACL = new Map<string, string>();
    const computeToRole = new Map<string, string>();
    const sgNodeMap = new Map<string, any>();
    const naclNodeMap = new Map<string, any>();
    const roleNodeMap = new Map<string, any>();
    const subnetToNACL = new Map<string, string>();
    const nodeToVPC = new Map<string, string>();
    // vpcId → list of VPCEndpoint nodes in that VPC. Populated from
    // two sources: IN_VPC edges (canonical) and node.vpc_id properties
    // (fallback, since the dep-map flattens some properties without
    // emitting the edge for legacy schema reasons).
    const vpceByVPC = new Map<string, any[]>();
    // vpcId → list of InternetGateway / NATGateway / EgressOnlyIGW /
    // TransitGateway nodes attached to this VPC. Mirrors `vpceByVPC`:
    // two sources of truth, IN_VPC edge (canonical) and node.vpc_id
    // property fallback (since the dep-map flattens some properties
    // without emitting the IN_VPC edge for legacy schema reasons).
    // Drives the EGRESS GATEWAYS lane (chip item 10).
    const gatewayByVPC = new Map<string, any[]>();
    // isPublic kept tri-state (boolean | null) so the SUBNETS column can
    // render the three-state badge (Public / Private / Unknown). Coercing
    // null→false would silently lie when subnet_visibility_collector hasn't
    // classified a subnet yet.
    const nodeToSubnet = new Map<string, { subnetId: string; isPublic: boolean | null }>();

    // First pass: collect subnet to NACL mappings
    edges.forEach(edge => {
      const edgeType = (edge.edge_type || edge.type || '').toUpperCase();
      const srcId = edge.source || edge.from;
      const tgtId = edge.target || edge.to;

      // NACL is associated with a subnet (canonical AWS pattern) or
      // attached directly to a compute (legacy fallback).
      //
      // 2026-05-22 credibility audit fix: the canonical AWS edge type
      // is ASSOCIATED_WITH going (NACL)->(Subnet), matching AWS's
      // describe-network-acls Associations[].SubnetId field. The
      // legacy matcher only accepted (Subnet)->(NACL) edges named
      // HAS_NACL / USES_NACL / PROTECTED_BY_NACL — none of which the
      // collector actually writes for the alon-prod graph. Result:
      // every path subnet showed "No NACLs" while a real NACL was
      // associated. Verified against Neo4j for subnet-0ac239d3cb...
      // where acl-07e8be9e7f719df3e exists as a (:NACL)-[ASSOCIATED_WITH]->(:Subnet)
      // edge.
      //
      // Now accept ASSOCIATED_WITH and handle either direction —
      // when the edge starts on the NACL and ends on the subnet,
      // the canonical "subnet -> nacl" mapping needs the reverse
      // direction lookup.
      const sourceType = (nodeMap.get(srcId)?.type || '').toLowerCase();
      const targetType = (nodeMap.get(tgtId)?.type || '').toLowerCase();
      const sourceIsNACL = sourceType.includes('nacl') || sourceType.includes('networkacl');
      const targetIsNACL = targetType.includes('nacl') || targetType.includes('networkacl');
      const sourceIsSubnet = sourceType === 'subnet';
      const targetIsSubnet = targetType === 'subnet';
      const isNACLEdge =
        edgeType === 'HAS_NACL' ||
        edgeType === 'USES_NACL' ||
        edgeType === 'PROTECTED_BY_NACL' ||
        (edgeType === 'ASSOCIATED_WITH' && (sourceIsNACL || targetIsNACL));
      if (isNACLEdge) {
        // Normalize so subnetId is always srcId and naclId is always tgtId
        // for the rest of the existing wiring.
        let subnetId = srcId;
        let naclId = tgtId;
        if (sourceIsNACL && targetIsSubnet) {
          subnetId = tgtId;
          naclId = srcId;
        }
        subnetToNACL.set(subnetId, naclId);
        // Also directly map compute to NACL for EC2 -> NACL edges
        const canonicalSrc = extractInstanceId(subnetId);
        computeToNACL.set(canonicalSrc, naclId);
        const naclNode = nodeMap.get(naclId);
        if (naclNode) {
          naclNodeMap.set(naclId, naclNode);
        } else {
          // Create placeholder for NACL — only used when the dep-map
          // gave an edge but no node. Properties stay null (not
          // fabricated) so the UI honestly shows "not collected" for
          // the missing fields.
          naclNodeMap.set(naclId, {
            id: naclId,
            name: naclId.includes('acl-') ? naclId : `NACL-${naclId.slice(-8)}`,
            type: 'NetworkAcl',
            vpc_id: null,
          });
        }
      }
    });

    edges.forEach(edge => {
      const edgeType = (edge.edge_type || edge.type || '').toUpperCase();
      const srcId = edge.source || edge.from;
      const tgtId = edge.target || edge.to;

      // SECURED_BY is the canonical edge type written by
      // collectors/security_group_collector.py and is the only one
      // actually present in production Neo4j (36 SECURED_BY vs 0
      // USES_SECURITY_GROUP at the time of writing). HAS_SECURITY_GROUP
      // and USES_SECURITY_GROUP are kept as legacy aliases so older
      // graph data still renders, but new code aligning with the
      // collector should target SECURED_BY.
      if (
        edgeType === 'SECURED_BY' ||
        edgeType === 'HAS_SECURITY_GROUP' ||
        edgeType === 'USES_SECURITY_GROUP'
      ) {
        const canonicalSrc = extractInstanceId(srcId);
        computeToSG.set(canonicalSrc, tgtId);
        const sgNode = nodeMap.get(tgtId);
        if (sgNode) {
          sgNodeMap.set(tgtId, sgNode);
        } else {
          // Create placeholder for SG referenced in edge but missing as node
          sgNodeMap.set(tgtId, {
            id: tgtId,
            name: tgtId, // Will use SG ID as name
            type: 'SecurityGroup',
            vpc_id: null,
          });
        }
      }

      // EC2 in subnet -> get NACL from subnet
      if (edgeType === 'IN_SUBNET') {
        const canonicalSrc = extractInstanceId(srcId);
        const naclId = subnetToNACL.get(tgtId);
        if (naclId) {
          computeToNACL.set(canonicalSrc, naclId);
        }
        // Track subnet membership. Read backend's canonical `subnet_is_public`
        // first (set by subnet_visibility_collector via route-table → IGW
        // inspection, surfaced through _build_comprehensive_node_detail).
        // Fall back to legacy fields for partial graphs; never name-match
        // because "Public-1" / "Private-DB-2" are operator labels, not
        // routing classifications — they can lie (the alon-prod test VPC
        // has its Main RT routing 0.0.0.0/0 → IGW, so subnets named
        // "Private-*" are technically public-by-routing).
        const subnetNode = nodeMap.get(tgtId);
        // null is meaningful — explicitly unknown vs explicitly public/private.
        // The UI renders three states (Public/Private/Unknown), so preserve null.
        let isPublic: boolean | null = null;
        if (subnetNode) {
          if (subnetNode.subnet_is_public === true) isPublic = true;
          else if (subnetNode.subnet_is_public === false) isPublic = false;
          // Pre-backfill fallback: only when subnet_is_public is truly absent
          // (not just false) do we consult the AWS launch-default flag.
          else if (subnetNode.is_public === true || subnetNode.map_public_ip_on_launch === true) isPublic = true;
        }
        nodeToSubnet.set(canonicalSrc, { subnetId: tgtId, isPublic });
      }

      // Track VPC membership
      if (edgeType === 'IN_VPC' || edgeType === 'BELONGS_TO_VPC') {
        const canonicalSrc = extractInstanceId(srcId);
        nodeToVPC.set(canonicalSrc, tgtId);
        nodeToVPC.set(srcId, tgtId);
        // Index VPCE nodes by their parent VPC, so a compute→S3 flow can
        // be matched to the right S3 Gateway endpoint at flow-tag time.
        const srcNode = nodeMap.get(srcId);
        if (srcNode && (srcNode.type || '').toLowerCase() === 'vpcendpoint') {
          if (!vpceByVPC.has(tgtId)) vpceByVPC.set(tgtId, []);
          vpceByVPC.get(tgtId)!.push(srcNode);
        }
        // Chip item 10: index IGW / NATGateway / EgressOnlyIGW /
        // TransitGateway by parent VPC. Tolerant of label casing —
        // labels are written by the IGW collector (commit 88983a9)
        // and historically lower-cased some types.
        if (srcNode) {
          const sty = String(srcNode.type || '').toLowerCase();
          if (
            sty === 'internetgateway' ||
            sty === 'natgateway' ||
            sty === 'egressonlyinternetgateway' ||
            sty === 'transitgateway'
          ) {
            if (!gatewayByVPC.has(tgtId)) gatewayByVPC.set(tgtId, []);
            gatewayByVPC.get(tgtId)!.push(srcNode);
          }
        }
      }

      if (edgeType === 'USES_ROLE' || edgeType === 'ASSUMES_ROLE') {
        const canonicalSrc = extractInstanceId(srcId);
        computeToRole.set(canonicalSrc, tgtId);
        const roleNode = nodeMap.get(tgtId);
        if (roleNode) {
          roleNodeMap.set(tgtId, roleNode);
        } else {
          // Create placeholder for role referenced in edge but missing as node
          const roleName = tgtId.includes('/') ? tgtId.split('/').pop() : tgtId;
          roleNodeMap.set(tgtId, {
            id: tgtId,
            name: roleName,
            type: 'IAMRole',
          });
        }
      }
    });

    // Property-based VPCE→VPC index. Catches VPCEs whose IN_VPC edge
    // wasn't emitted by the dep-map slice (the backend strips some
    // structural edges to keep payload size down). serviceName +
    // endpoint_type come from the node payload; without them the lane
    // chip falls back to "?" which is honest about data absence.
    nodes.forEach(n => {
      const t = (n.type || '').toLowerCase();
      if (t !== 'vpcendpoint') return;
      const vpcId = n.vpc_id || n.vpcId || null;
      if (!vpcId) return;
      if (!vpceByVPC.has(vpcId)) vpceByVPC.set(vpcId, []);
      const existing = vpceByVPC.get(vpcId)!;
      if (!existing.find(v => v.id === n.id)) existing.push(n);
    });

    // Property-based gateway→VPC index for chip item 10. Same fallback
    // pattern as VPCE: dep-map sometimes drops IN_VPC edges for
    // IGW/NAT/Transit; the node payload carries vpc_id / vpcId.
    nodes.forEach(n => {
      const t = (n.type || '').toLowerCase();
      const isGateway =
        t === 'internetgateway' ||
        t === 'natgateway' ||
        t === 'egressonlyinternetgateway' ||
        t === 'transitgateway';
      if (!isGateway) return;
      const vpcId = n.vpc_id || n.vpcId || null;
      if (!vpcId) return;
      if (!gatewayByVPC.has(vpcId)) gatewayByVPC.set(vpcId, []);
      const existing = gatewayByVPC.get(vpcId)!;
      if (!existing.find(v => v.id === n.id)) existing.push(n);
    });

    // Compute → VPC index. nodeToVPC stores by canonical instance id
    // for compute, but flows are tagged with the canonical id too, so
    // a direct .get(canonicalId) works.
    const resolveComputeVPC = (canonicalSrc: string): string | null => {
      const direct = nodeToVPC.get(canonicalSrc);
      if (direct) return direct;
      const node = nodeByInstanceId.get(canonicalSrc) || nodeMap.get(canonicalSrc);
      return node?.vpc_id || node?.vpcId || null;
    };

    // Match flow target to a VPCE service. Gateway endpoints exist for
    // S3 + DynamoDB only (per AWS); interface endpoints exist for most
    // services. For the demo path the S3 Gateway is the case that
    // matters.
    const pickVPCEForTarget = (canonicalSrc: string, targetType: string): string | undefined => {
      const vpcId = resolveComputeVPC(canonicalSrc);
      if (!vpcId) return undefined;
      const candidates = vpceByVPC.get(vpcId) || [];
      const needle =
        targetType === 'storage' || targetType === 's3' ? 's3' :
        targetType === 'dynamodb' ? 'dynamodb' :
        targetType === 'sqs' ? 'sqs' :
        targetType === 'sns' ? 'sns' : null;
      if (!needle) return undefined;
      const match = candidates.find(v => {
        const svc = (v.service_name || v.serviceName || '').toLowerCase();
        return svc.endsWith(`.${needle}`) || svc === `com.amazonaws.${needle}`;
      });
      return match?.id;
    };

    const trafficEdges = edges.filter(e => {
      const type = (e.edge_type || e.type || '').toUpperCase();
      return ['ACTUAL_TRAFFIC', 'OBSERVED_TRAFFIC', 'S3_OPERATION', 'ACTUAL_S3_ACCESS',
              'ACCESSES_RESOURCE', 'ACTUAL_API_CALL'].includes(type);
    });

    const flowMap = new Map<string, TrafficFlow>();
    const computeWithTraffic = new Set<string>();
    const resourcesWithTraffic = new Set<string>();
    const usedPorts = new Set<string>();

    trafficEdges.forEach(edge => {
      const srcId = edge.source || edge.from;
      const tgtId = edge.target || edge.to;

      // Try multiple ways to find source node
      let sourceNode = nodeMap.get(srcId);
      if (!sourceNode) {
        const instanceId = extractInstanceId(srcId);
        if (instanceId.startsWith('i-')) {
          sourceNode = nodeByInstanceId.get(instanceId);
        }
      }
      if (!sourceNode) {
        const resourceName = extractResourceName(srcId);
        sourceNode = nodeByResourceName.get(resourceName);
      }

      // Try multiple ways to find target node
      let targetNode = nodeMap.get(tgtId);
      if (!targetNode) {
        const instanceId = extractInstanceId(tgtId);
        if (instanceId.startsWith('i-')) {
          targetNode = nodeByInstanceId.get(instanceId);
        }
      }
      if (!targetNode) {
        const resourceName = extractResourceName(tgtId);
        targetNode = nodeByResourceName.get(resourceName);
      }

      // If target node not found, create synthetic node from edge target (e.g., S3 buckets referenced by ARN)
      if (!targetNode && tgtId) {
        const edgeType = (edge.edge_type || edge.type || '').toUpperCase();
        if (edgeType === 'ACTUAL_S3_ACCESS' || tgtId.includes(':s3:::')) {
          const bucketName = tgtId.includes(':::') ? tgtId.split(':::')[1] : extractResourceName(tgtId);
          targetNode = { id: tgtId, name: bucketName, type: 'S3Bucket' };
          nodeMap.set(tgtId, targetNode);
          nodeByResourceName.set(bucketName, targetNode);
        } else if (tgtId.includes(':dynamodb:')) {
          const tableName = extractResourceName(tgtId);
          targetNode = { id: tgtId, name: tableName, type: 'DynamoDBTable' };
          nodeMap.set(tgtId, targetNode);
          nodeByResourceName.set(tableName, targetNode);
        }
      }

      // Skip if we can't find both nodes
      if (!sourceNode || !targetNode) return;

      // Normalize direction: Compute -> Resource
      // If target is compute and source is resource, swap them
      const srcType = (sourceNode.type || '').toLowerCase();
      const tgtType = (targetNode.type || '').toLowerCase();
      const sourceIsCompute = srcType === 'ec2' || srcType === 'ec2instance' || srcType === 'lambdafunction' || srcType === 'lambda';
      const targetIsCompute = tgtType === 'ec2' || tgtType === 'ec2instance' || tgtType === 'lambdafunction' || tgtType === 'lambda';
      const sourceIsResource = ['rdsinstance', 'rds', 's3bucket', 's3', 'dynamodb'].includes(srcType);
      const targetIsResource = ['rdsinstance', 'rds', 's3bucket', 's3', 'dynamodb'].includes(tgtType);

      if (targetIsCompute && sourceIsResource) {
        [sourceNode, targetNode] = [targetNode, sourceNode];
      }

      // After potential swap, verify we have compute -> resource
      const finalSrcType = (sourceNode.type || '').toLowerCase();
      const finalSourceIsCompute = finalSrcType === 'ec2' || finalSrcType === 'ec2instance' || finalSrcType === 'lambdafunction' || finalSrcType === 'lambda';
      const finalTargetType = mapNodeType(targetNode.type || 'unknown');

      if (!finalSourceIsCompute) return;
      if (!['database', 'storage', 'dynamodb', 'sqs', 'sns'].includes(finalTargetType)) return;

      const canonicalSrc = extractInstanceId(sourceNode.id);
      const flowKey = `${canonicalSrc}->${targetNode.id}`;

      computeWithTraffic.add(canonicalSrc);
      resourcesWithTraffic.add(targetNode.id);

      if (!flowMap.has(flowKey)) {
        flowMap.set(flowKey, {
          sourceId: canonicalSrc,
          targetId: targetNode.id,
          sgId: computeToSG.get(canonicalSrc),
          naclId: computeToNACL.get(canonicalSrc),
          roleId: computeToRole.get(canonicalSrc),
          vpceId: pickVPCEForTarget(canonicalSrc, finalTargetType),
          ports: [],
          protocol: 'TCP',
          bytes: 0,
          connections: 0,
          isActive: true,
        });
      }

      const flow = flowMap.get(flowKey)!;
      if (edge.port) {
        flow.ports.push(String(edge.port));
        usedPorts.add(String(edge.port));
      }
      flow.protocol = edge.protocol || 'TCP';
      flow.bytes += edge.traffic_bytes || 0;
      flow.connections += 1;
    });

    flowMap.forEach(flow => {
      flow.ports = [...new Set(flow.ports)].slice(0, 5);
    });

    // Debug logging
    console.log('[TrafficFlowMap] Traffic processing results:', {
      totalTrafficEdges: trafficEdges.length,
      validFlows: flowMap.size,
      computeWithTraffic: computeWithTraffic.size,
      resourcesWithTraffic: resourcesWithTraffic.size,
    });

    // Build compute services. Two-source bucketing:
    //   (1) `computeWithTraffic` — compute IDs whose ACTUAL_TRAFFIC /
    //       ACCESSES_RESOURCE / ACTUAL_API_CALL edges target a classified
    //       resource (S3/DynamoDB/RDS). Historical primary source.
    //   (2) `nodeByInstanceId` — every compute node returned by the dep-map
    //       regardless of whether its traffic edges happen to target a
    //       resource by the narrow `targetIsResource` check.
    //
    // (2) is necessary because the System Map on alon-prod-style systems
    // has compute-to-NetworkEndpoint traffic (egress to external IPs) and
    // compute-to-other-compute (cross-system) traffic, neither of which
    // is "compute → resource". The old single-source build returned 0
    // compute for those systems even with thousands of traffic edges.
    // Operators saw "0 compute" on a graph that obviously had EC2s and
    // no flow lines could draw.
    const seenCompute = new Set<string>();
    const computeServices: ServiceNode[] = [];
    const pushCompute = (canonicalId: string, node: any) => {
      if (seenCompute.has(canonicalId) || !node) return;
      seenCompute.add(canonicalId);
      const computeName = (node.name && node.name !== 'Unknown') ? node.name : node.id || canonicalId;
      computeServices.push({
        id: canonicalId,
        name: computeName,
        shortName: shortName(computeName),
        type: mapNodeType(node.type || 'compute'),
        instanceId: canonicalId.substring(0, 12),
      });
    };
    // Traffic-derived first (preserves any ordering tied to traffic).
    computeWithTraffic.forEach(canonicalId => {
      pushCompute(canonicalId, nodeByInstanceId.get(canonicalId));
    });
    // Then every compute node we discovered from the dep-map response.
    // De-dup happens via seenCompute.
    nodeByInstanceId.forEach((node, canonicalId) => {
      const nType = mapNodeType(node.type || '');
      if (nType === 'compute' || nType === 'lambda') {
        pushCompute(canonicalId, node);
      }
    });

    // Build resources
    const seenResources = new Set<string>();
    const resources: ServiceNode[] = [];
    resourcesWithTraffic.forEach(id => {
      const resourceName = extractResourceName(id);
      if (seenResources.has(resourceName)) return;
      seenResources.add(resourceName);
      const node = nodeMap.get(id) || nodeByResourceName.get(resourceName);
      if (!node) return;
      const resName = (node.name && node.name !== 'Unknown') ? node.name : node.id || id;
      resources.push({
        id: id,
        name: resName,
        shortName: shortName(resName),
        type: mapNodeType(node.type || 'storage'),
      });
    });

    // Always include DynamoDB tables and S3 buckets even without direct traffic edges
    nodes.forEach(node => {
      const nType = mapNodeType(node.type || '');
      if (['database', 'storage', 'dynamodb'].includes(nType)) {
        const rName = extractResourceName(node.id);
        if (!seenResources.has(rName)) {
          seenResources.add(rName);
          const dynName = (node.name && node.name !== 'Unknown') ? node.name : node.id;
          resources.push({
            id: node.id,
            name: dynName,
            shortName: shortName(dynName),
            type: nType,
          });
          // Create flows from all compute to this resource
          computeServices.forEach(cs => {
            const flowKey = `${cs.id}->${node.id}`;
            if (!flowMap.has(flowKey)) {
              flowMap.set(flowKey, {
                sourceId: cs.id, targetId: node.id,
                sgId: computeToSG.get(cs.id), naclId: computeToNACL.get(cs.id),
                roleId: computeToRole.get(cs.id),
                vpceId: pickVPCEForTarget(cs.id, nType),
                ports: [], protocol: 'TCP', bytes: 0, connections: 0, isActive: false,
              });
            }
          });
        }
      }
    });

    // Fallback: If no traffic flows found, build from all system nodes + structural edges
    if (computeServices.length === 0 && resources.length === 0 && nodes.length > 0) {
      console.log('[TrafficFlowMap] No traffic flows — falling back to structural view');
      nodes.forEach(node => {
        const nType = mapNodeType(node.type || '');
        const canonicalId = extractInstanceId(node.id);
        if ((nType === 'compute' || nType === 'lambda') && !seenCompute.has(canonicalId)) {
          seenCompute.add(canonicalId);
          computeServices.push({
            id: canonicalId,
            name: node.name || node.id,
            shortName: shortName(node.name || node.id),
            type: nType,
            instanceId: canonicalId.substring(0, 12),
          });
        } else if (['database', 'storage', 'dynamodb', 'sqs', 'sns'].includes(nType)) {
          const rName = extractResourceName(node.id);
          if (!seenResources.has(rName)) {
            seenResources.add(rName);
            resources.push({
              id: node.id,
              name: node.name || node.id,
              shortName: shortName(node.name || node.id),
              type: nType,
            });
          }
        }
      });
      // Create structural flows: connect every compute to every resource
      computeServices.forEach(cs => {
        resources.forEach(res => {
          const flowKey = `${cs.id}->${res.id}`;
          if (!flowMap.has(flowKey)) {
            flowMap.set(flowKey, {
              sourceId: cs.id, targetId: res.id,
              sgId: computeToSG.get(cs.id), naclId: computeToNACL.get(cs.id),
              roleId: computeToRole.get(cs.id),
              vpceId: pickVPCEForTarget(cs.id, res.type),
              ports: [], protocol: 'TCP', bytes: 0, connections: 0, isActive: true,
            });
          }
        });
      });
    }

    // Build SUBNETS column data. Every Subnet reachable from a compute on
    // this path via IN_SUBNET gets its own column entry, with the public/
    // private/unknown posture from subnet_is_public. Subnets that aren't
    // connected to any path compute are deliberately omitted — the column
    // is "subnets ON this path", not "all subnets in the system".
    const subnets: SubnetNode[] = [];
    const seenSubnetIds = new Set<string>();
    computeServices.forEach(cs => {
      const sub = nodeToSubnet.get(cs.id);
      if (!sub || seenSubnetIds.has(sub.subnetId)) return;
      seenSubnetIds.add(sub.subnetId);
      const subnetNode = nodeMap.get(sub.subnetId);
      const subnetName = subnetNode?.name || sub.subnetId;
      const connectedComputeIds = computeServices
        .filter(c => nodeToSubnet.get(c.id)?.subnetId === sub.subnetId)
        .map(c => c.id);
      subnets.push({
        id: sub.subnetId,
        name: subnetName,
        shortName: shortName(subnetName, 18),
        isPublic: sub.isPublic,
        vpcId: subnetNode?.vpc_id,
        connectedComputeIds,
      });
    });

    // Build security groups. Combine TWO sources:
    //   (a) SGs referenced by traffic flows (flowMap.f.sgId) — historical
    //       behavior; needed for connection-line rendering.
    //   (b) SGs from sgNodeMap (everything attached via SECURED_BY) — covers
    //       workloads on a path with no observed traffic edges, e.g. an
    //       IAM-only path through cyntro-demo-prod-data where the SG is
    //       attached to the EC2 but the BFS path didn't traverse it.
    // The column should reflect the operator's mental model ("which SGs
    // gate this workload?"), not just BFS-path traversal facts.
    const usedSGIds = new Set<string>([
      ...Array.from(flowMap.values()).map(f => f.sgId).filter(Boolean) as string[],
      ...Array.from(sgNodeMap.keys()),
    ]);
    const securityGroups: SecurityCheckpoint[] = [];
    usedSGIds.forEach(sgId => {
      if (!sgId) return;
      const sgNode = sgNodeMap.get(sgId);
      if (!sgNode) return;

      const connectedSources = Array.from(flowMap.values())
        .filter(f => f.sgId === sgId)
        .map(f => f.sourceId);

      // SECURED_BY attachments — workloads without observed traffic still
      // gate through their SG; spotlight union needs both SGs visible.
      computeToSG.forEach((attachedSgId, computeId) => {
        if (attachedSgId === sgId && !connectedSources.includes(computeId)) {
          connectedSources.push(computeId);
        }
      });

      // Rules will be populated by fetchSGRules() — no mock data. But
      // seed totalCount from whatever rule-count signal the dep-map
      // node carries, so the chip doesn't read "0 rules" between
      // build-time and the async inspector fetch completing.
      // Precedence: total_rules → (inbound+outbound) → gap_count.
      // Last fallback is `gap_count`, which is technically "rules with
      // gaps" but on every real SG it correlates with "has rules" and
      // gives the operator a non-zero floor. The fetchSGRules
      // completion later replaces this with the accurate rule list +
      // breakdown.
      //
      // This fixes the path screenshot from 2026-05-21 where the
      // 'default' SG (3 actual rules, including 0.0.0.0/0:0-65535)
      // rendered as "default · 0 rules" — a credibility bug that
      // contradicted the closure footer's "review ingress rules"
      // recommendation.
      const seedTotalCount =
        (typeof sgNode.total_rules === 'number' && sgNode.total_rules) ||
        ((sgNode.inbound_rule_count || 0) + (sgNode.outbound_rule_count || 0)) ||
        (typeof sgNode.gap_count === 'number' && sgNode.gap_count) ||
        0;
      securityGroups.push({
        id: sgId,
        type: 'security_group',
        name: sgNode.name || sgId,
        shortName: shortName(sgNode.name || sgId, 14),
        usedCount: 0,
        totalCount: seedTotalCount,
        gapCount: typeof sgNode.gap_count === 'number' ? sgNode.gap_count : 0,
        connectedSources,
        connectedTargets: [],
        rules: [], // Replaced by real data from /security-groups/{id}/inspector
        vpcId: sgNode.vpc_id,
      });
    });

    // Build NACLs. Same dual-source pattern as SGs above: flowMap-driven
    // (traffic-traversed) PLUS naclNodeMap (attached via USES_NACL/HAS_NACL/
    // PROTECTED_BY_NACL). Operator wants to see ALL NACLs gating the path
    // workloads, not just the ones a BFS edge happened to cross.
    const usedNACLIds = new Set<string>([
      ...Array.from(flowMap.values()).map(f => f.naclId).filter(Boolean) as string[],
      ...Array.from(naclNodeMap.keys()),
    ]);
    const nacls: SecurityCheckpoint[] = [];
    usedNACLIds.forEach(naclId => {
      if (!naclId) return;
      const naclNode = naclNodeMap.get(naclId);
      if (!naclNode) return;

      const connectedSources = Array.from(flowMap.values())
        .filter(f => f.naclId === naclId)
        .map(f => f.sourceId);

      nacls.push({
        id: naclId,
        type: 'nacl',
        name: naclNode.name || naclId,
        shortName: shortName(naclNode.name || naclId, 14),
        usedCount: 0,
        totalCount: 0,
        gapCount: 0,
        connectedSources,
        connectedTargets: [],
        vpcId: naclNode.vpc_id,
      });
    });

    // Build IAM roles. Same dual-source pattern as SGs/NACLs/compute:
    //   (1) flow-driven (roleId on a TrafficFlow — used when compute→
    //       resource flows exist)
    //   (2) USES_ROLE/ASSUMES_ROLE edges that populated roleNodeMap
    //       directly. Catches alon-prod-style systems whose traffic is
    //       compute→NetworkEndpoint (egress) rather than compute→resource,
    //       so flowMap never gets the roleId populated.
    const usedRoleIds = new Set<string>([
      ...Array.from(flowMap.values()).map(f => f.roleId).filter(Boolean) as string[],
      ...Array.from(roleNodeMap.keys()),
    ]);
    const iamRoles: SecurityCheckpoint[] = [];
    usedRoleIds.forEach(roleId => {
      if (!roleId) return;
      const roleNode = roleNodeMap.get(roleId);
      const iamInfo = (iamData || []).find((r: any) =>
        r.role_id === roleId || r.role_name === roleNode?.name || (roleId || '').includes(r.role_name || '')
      );
      const connectedSources = Array.from(flowMap.values())
        .filter(f => f.roleId === roleId)
        .map(f => f.sourceId);

      iamRoles.push({
        id: roleId,
        type: 'iam_role',
        name: roleNode?.name || roleId,
        shortName: shortName(roleNode?.name || roleId, 14),
        usedCount: iamInfo?.used_permissions ?? 0,
        totalCount: iamInfo?.allowed_permissions ?? 0,
        gapCount: iamInfo?.unused_permissions ?? 0,
        connectedSources,
        connectedTargets: [],
      });
    });

    // Synthesize IAM-only path flows when there's no compute. Operator-
    // visible bug this fixes: an attack path through an AWS service role
    // (e.g. AWSServiceRoleForResourceExplorer → GetObject → S3-prod-data)
    // has no compute node — flowMap is empty — so ConnectionLinesSVG had
    // nothing to render. The IAM ROLE, API CALL, and S3 RESOURCE columns
    // showed as visually disconnected even though they're a real attack
    // chain in Neo4j.
    //
    // Fix: when there are no compute services but there ARE IAM roles
    // and resources, synthesize a flow per (role, resource) pair using
    // the role as the source. ConnectionLinesSVG now falls back to
    // querying [data-role-id] when [data-compute-id] doesn't match, so
    // these synthesized flows produce real lines from IAM → API →
    // RESOURCE.
    if (computeServices.length === 0 && iamRoles.length > 0 && resources.length > 0) {
      iamRoles.forEach(role => {
        resources.forEach(res => {
          const flowKey = `${role.id}->${res.id}`;
          if (flowMap.has(flowKey)) return;
          flowMap.set(flowKey, {
            sourceId: role.id,
            targetId: res.id,
            sgId: undefined,
            naclId: undefined,
            roleId: role.id,
            ports: [],
            protocol: 'IAM',
            bytes: 0,
            connections: 0,
            isActive: false,
          });
        });
      });
    }

    const flows = Array.from(flowMap.values());
    const totalBytes = flows.reduce((sum, f) => sum + f.bytes, 0);
    const totalConnections = flows.reduce((sum, f) => sum + f.connections, 0);
    const totalGaps = securityGroups.reduce((sum, sg) => sum + sg.gapCount, 0) +
                      nacls.reduce((sum, n) => sum + n.gapCount, 0) +
                      iamRoles.reduce((sum, r) => sum + r.gapCount, 0);

    // Final debug logging
    console.log('[TrafficFlowMap] Architecture built:', {
      computeServices: computeServices.map(c => c.name),
      resources: resources.map(r => `${r.type}: ${r.name}`),
      securityGroups: securityGroups.map(sg => sg.name),
      nacls: nacls.map(n => n.name),
      iamRoles: iamRoles.map(r => r.name),
      flowCount: flows.length,
      totalBytes,
      totalConnections,
    });

    // Build VPC groups for VPC Boundaries visualization
    const vpcGroupsMap = new Map<string, { vpcId: string; vpcName: string; subnets: Map<string, { subnetId: string; subnetName: string; isPublic: boolean; nodeIds: string[] }> }>();

    // Collect VPC info from SGs, NACLs, and compute nodes
    const allVPCNodeMappings: Array<{ nodeId: string; vpcId: string; subnetId?: string; isPublic?: boolean }> = [];

    // Step 1: Build a map of compute node -> VPC from node properties and edges
    const computeVPCMap = new Map<string, string>();
    computeServices.forEach(cs => {
      let vpcId = nodeToVPC.get(cs.id);
      if (!vpcId) {
        const origNode = nodeByInstanceId.get(cs.id) || nodeMap.get(cs.id);
        if (origNode?.vpc_id) vpcId = origNode.vpc_id;
      }
      if (vpcId) computeVPCMap.set(cs.id, vpcId);
    });

    // Step 2: Add compute nodes to VPC groups. vpcGroups isPublic is
    // boolean-typed (pre-existing contract), so coerce null → false here.
    // The SUBNETS column above preserves the tri-state for its own badges;
    // vpcGroups only uses isPublic for legacy diagram coloring where the
    // distinction between false and null doesn't matter.
    computeServices.forEach(cs => {
      const vpcId = computeVPCMap.get(cs.id);
      if (vpcId) {
        const subnet = nodeToSubnet.get(cs.id);
        allVPCNodeMappings.push({ nodeId: cs.id, vpcId, subnetId: subnet?.subnetId, isPublic: subnet?.isPublic === true });
      }
    });

    // Step 3: Add SGs - from their own vpc_id OR from connected compute nodes
    securityGroups.forEach(sg => {
      if (sg.vpcId) {
        allVPCNodeMappings.push({ nodeId: sg.id, vpcId: sg.vpcId });
      } else {
        // Find VPC from connected compute nodes
        const connectedCompute = sg.connectedSources[0];
        if (connectedCompute) {
          const vpcId = computeVPCMap.get(connectedCompute);
          if (vpcId) allVPCNodeMappings.push({ nodeId: sg.id, vpcId });
        }
      }
    });

    // Step 4: Add NACLs - from their own vpc_id OR from connected compute nodes
    nacls.forEach(n => {
      if (n.vpcId) {
        allVPCNodeMappings.push({ nodeId: n.id, vpcId: n.vpcId });
      } else {
        const connectedCompute = n.connectedSources[0];
        if (connectedCompute) {
          const vpcId = computeVPCMap.get(connectedCompute);
          if (vpcId) allVPCNodeMappings.push({ nodeId: n.id, vpcId });
        }
      }
    });

    // Step 5: Add IAM Roles - from connected compute nodes
    iamRoles.forEach(role => {
      const connectedCompute = role.connectedSources[0];
      if (connectedCompute) {
        const vpcId = computeVPCMap.get(connectedCompute);
        if (vpcId) allVPCNodeMappings.push({ nodeId: role.id, vpcId });
      }
    });

    // Step 6: Add resources - from their own vpc_id OR connected compute
    resources.forEach(r => {
      const origNode = nodeMap.get(r.id) || nodeByResourceName.get(r.name);
      if (origNode?.vpc_id) {
        allVPCNodeMappings.push({ nodeId: r.id, vpcId: origNode.vpc_id });
      } else {
        const connectedFlow = flows.find(f => f.targetId === r.id);
        if (connectedFlow) {
          const vpcId = computeVPCMap.get(connectedFlow.sourceId);
          if (vpcId) allVPCNodeMappings.push({ nodeId: r.id, vpcId });
        }
      }
    });

    allVPCNodeMappings.forEach(({ nodeId, vpcId, subnetId, isPublic }) => {
      if (!vpcGroupsMap.has(vpcId)) {
        const vpcNode = nodeMap.get(vpcId);
        vpcGroupsMap.set(vpcId, {
          vpcId,
          vpcName: shortName(vpcNode?.name || vpcId, 20),
          subnets: new Map(),
        });
      }
      const vpc = vpcGroupsMap.get(vpcId)!;
      const subKey = subnetId || 'default';
      if (!vpc.subnets.has(subKey)) {
        const subnetNode = subnetId ? nodeMap.get(subnetId) : null;
        vpc.subnets.set(subKey, {
          subnetId: subKey,
          subnetName: subnetNode ? shortName(subnetNode.name || subnetId || '', 20) : 'Default Subnet',
          isPublic: isPublic || false,
          nodeIds: [],
        });
      }
      vpc.subnets.get(subKey)!.nodeIds.push(nodeId);
    });

    const vpcGroups = Array.from(vpcGroupsMap.values()).map(vpc => ({
      vpcId: vpc.vpcId,
      vpcName: vpc.vpcName,
      subnets: Array.from(vpc.subnets.values()),
    }));

    // Build the VPC ENDPOINTS lane. Only include VPCEs that sit in a VPC
    // reachable from a compute on this path — otherwise the lane fills
    // up with VPCEs from unrelated VPCs that have no causal relationship
    // to the rendered flows.
    const pathVPCs = new Set<string>();
    computeServices.forEach(cs => {
      const v = resolveComputeVPC(cs.id);
      if (v) pathVPCs.add(v);
    });
    const seenVPCEIds = new Set<string>();
    const vpcEndpoints: VPCEndpointNode[] = [];
    pathVPCs.forEach(vpcId => {
      (vpceByVPC.get(vpcId) || []).forEach(v => {
        if (seenVPCEIds.has(v.id)) return;
        seenVPCEIds.add(v.id);
        const serviceName = v.service_name || v.serviceName || null;
        const epTypeRaw = (v.vpc_endpoint_type || v.endpoint_type || '').toString();
        const endpointType: 'Gateway' | 'Interface' | null =
          /gateway/i.test(epTypeRaw) ? 'Gateway' :
          /interface/i.test(epTypeRaw) ? 'Interface' : null;
        vpcEndpoints.push({
          id: v.id,
          name: v.name || v.id,
          shortName: shortName(v.name || v.id, 16),
          vpcId,
          serviceName,
          serviceShort: vpceServiceShort(serviceName),
          endpointType,
        });
      });
    });

    // Chip item 10: collect egress gateways (IGW / NAT / Egress-only
    // IGW / Transit GW) per path VPC. Mirrors the VPCE pass above —
    // dedup by id since both IN_VPC edge and node.vpc_id property can
    // push the same gateway twice. Order: deterministic by id so the
    // lane doesn't reshuffle between renders.
    const seenGatewayIds = new Set<string>();
    const egressGateways: EgressGatewayNode[] = [];
    pathVPCs.forEach(vpcId => {
      (gatewayByVPC.get(vpcId) || []).forEach(g => {
        if (seenGatewayIds.has(g.id)) return;
        seenGatewayIds.add(g.id);
        const rawType = String(g.type || '');
        const kind =
          /internetgateway/i.test(rawType) && !/egress/i.test(rawType) ? 'InternetGateway' :
          /egressonly/i.test(rawType) ? 'EgressOnlyInternetGateway' :
          /natgateway/i.test(rawType) ? 'NATGateway' :
          /transitgateway/i.test(rawType) ? 'TransitGateway' :
          'InternetGateway';
        const kindLabel =
          kind === 'InternetGateway' ? 'IGW' :
          kind === 'NATGateway' ? 'NAT GW' :
          kind === 'EgressOnlyInternetGateway' ? 'Egress-only IGW' :
          'Transit GW';
        egressGateways.push({
          id: g.id,
          name: g.name || g.id,
          shortName: shortName(g.name || g.id, 18),
          vpcId,
          kind,
          kindLabel,
        });
      });
    });
    egressGateways.sort((a, b) => a.id.localeCompare(b.id));

    // ── InstanceProfile + role-sharing extraction ──────────────────
    // 2026-06-25 (Bug N P2 data wire-up): the AC2 Profile sidecar +
    // AC6 Shared·N chip both ship in this file (lines ~1779, ~4966)
    // and consume `architecture.instanceProfiles[].attachedWorkloads`
    // and `iamRoles[].sharedWith` respectively. The dep-map response
    // already carries InstanceProfile nodes + HAS_INSTANCE_PROFILE +
    // USES_ROLE edges (see saferemediate-backend/api/dependency_map_full.py:663),
    // but buildArchitecture never extracted them — so both chips
    // rendered null on cyntro.io despite the code being in the bundle.
    // Derive both fields here from the same nodes[] + edges[] the rest
    // of the function already walks. Pure derivation, no fetch.

    // Pass 1: gather HAS_INSTANCE_PROFILE edges (EC2 → InstanceProfile)
    // into a lookup so we can populate attachedWorkloads[] per profile.
    const ipIdToAttachedWorkloads = new Map<string, string[]>();
    edges.forEach(e => {
      const eType = (e.edge_type || e.type || '').toUpperCase();
      if (eType !== 'HAS_INSTANCE_PROFILE') return;
      const srcId = e.source || e.from;
      const tgtId = e.target || e.to;
      if (!srcId || !tgtId) return;
      // Edge direction in the graph: EC2 -[HAS_INSTANCE_PROFILE]-> InstanceProfile
      // (per the saferemediate-backend USES_ROLE/HAS_INSTANCE_PROFILE schema).
      // Be defensive about reversed edges by checking which endpoint is
      // an InstanceProfile.
      const srcType = (nodeMap.get(srcId)?.type || '').toLowerCase();
      const tgtType = (nodeMap.get(tgtId)?.type || '').toLowerCase();
      const srcIsIP = srcType.includes('instanceprofile') || srcType === 'instance_profile';
      const tgtIsIP = tgtType.includes('instanceprofile') || tgtType === 'instance_profile';
      const ipId = tgtIsIP ? tgtId : srcIsIP ? srcId : null;
      const workloadId = tgtIsIP ? srcId : srcIsIP ? tgtId : null;
      if (!ipId || !workloadId) return;
      const list = ipIdToAttachedWorkloads.get(ipId) ?? [];
      if (!list.includes(workloadId)) list.push(workloadId);
      ipIdToAttachedWorkloads.set(ipId, list);
    });

    // Pass 2: collect InstanceProfile nodes, attach the workload list.
    const instanceProfiles: SecurityCheckpoint[] = [];
    nodes.forEach(n => {
      const nType = (n.type || '').toLowerCase();
      const isIP = nType.includes('instanceprofile') || nType === 'instance_profile';
      if (!isIP) return;
      instanceProfiles.push({
        id: n.id,
        type: 'instance_profile',
        name: n.name || n.id,
        shortName: shortName(n.name || n.id, 14),
        usedCount: 0,
        totalCount: 0,
        gapCount: 0,
        connectedSources: [],
        connectedTargets: [],
        attachedWorkloads: ipIdToAttachedWorkloads.get(n.id) ?? [],
      });
    });

    // Pass 3: compute sharedWith[] per role. A role is "shared" when
    // more than one workload (EC2/Lambda/…) uses it — operationally the
    // damage of removing the role spans all workloads, so the chip must
    // surface the count at a glance. Build the role→workload set by
    // walking USES_ROLE edges (canonical: workload -[USES_ROLE]-> role).
    const roleIdToWorkloadIds = new Map<string, Set<string>>();
    edges.forEach(e => {
      const eType = (e.edge_type || e.type || '').toUpperCase();
      if (eType !== 'USES_ROLE') return;
      const srcId = e.source || e.from;
      const tgtId = e.target || e.to;
      if (!srcId || !tgtId) return;
      const srcType = (nodeMap.get(srcId)?.type || '').toLowerCase();
      const tgtType = (nodeMap.get(tgtId)?.type || '').toLowerCase();
      const srcIsRole = srcType === 'iamrole' || srcType === 'iam_role';
      const tgtIsRole = tgtType === 'iamrole' || tgtType === 'iam_role';
      const roleId = tgtIsRole ? tgtId : srcIsRole ? srcId : null;
      const workloadId = tgtIsRole ? srcId : srcIsRole ? tgtId : null;
      if (!roleId || !workloadId) return;
      // Skip principal nodes — they aren't workloads, they're attackers
      // walking the path. We only want concrete compute carriers.
      const wType = (nodeMap.get(workloadId)?.type || '').toLowerCase();
      if (wType.includes('principal')) return;
      const set = roleIdToWorkloadIds.get(roleId) ?? new Set<string>();
      set.add(workloadId);
      roleIdToWorkloadIds.set(roleId, set);
    });

    iamRoles.forEach(role => {
      const workloadIds = Array.from(roleIdToWorkloadIds.get(role.id) ?? new Set<string>());
      // sharedWith excludes any single "focal" workload — the chip is
      // about cross-workload reach, so report ALL workload bindings.
      // The chip renderer at line ~1779 decides whether to render
      // (>0 means show "Shared · N workloads").
      if (workloadIds.length <= 1) return;
      role.sharedWith = workloadIds.map(wId => {
        const w = nodeMap.get(wId);
        return {
          id: wId,
          name: w?.name || wId,
          type: String(w?.type || 'unknown'),
          system_name: w?.system_name ?? w?.systemName ?? null,
        };
      });
    });

    // ── IAMPolicy extraction (Q1 — 2026-06-25) ─────────────────────
    // The renderer at line ~5587 already iterates architecture.iamPolicies
    // and the lane header at ~5429 already counts them — but
    // buildArchitecture never extracted IAMPolicy nodes into the array.
    // Same shape as the InstanceProfile bug fixed earlier. The dep-map
    // response carries HAS_POLICY edges (already in the edge MATCH at
    // saferemediate-backend/api/dependency_map_full.py:663), so this is
    // pure FE derivation from nodes[] + edges[].
    const policyAttachedRoleIds = new Map<string, Set<string>>();
    edges.forEach(e => {
      const eType = (e.edge_type || e.type || '').toUpperCase();
      if (eType !== 'HAS_POLICY') return;
      const srcId = e.source || e.from;
      const tgtId = e.target || e.to;
      if (!srcId || !tgtId) return;
      const srcType = (nodeMap.get(srcId)?.type || '').toLowerCase();
      const tgtType = (nodeMap.get(tgtId)?.type || '').toLowerCase();
      const srcIsPolicy = srcType === 'iampolicy' || srcType === 'iam_policy';
      const tgtIsPolicy = tgtType === 'iampolicy' || tgtType === 'iam_policy';
      const policyId = tgtIsPolicy ? tgtId : srcIsPolicy ? srcId : null;
      const roleId = tgtIsPolicy ? srcId : srcIsPolicy ? tgtId : null;
      if (!policyId || !roleId) return;
      const set = policyAttachedRoleIds.get(policyId) ?? new Set<string>();
      set.add(roleId);
      policyAttachedRoleIds.set(policyId, set);
    });

    const iamPolicies: SecurityCheckpoint[] = [];
    nodes.forEach(n => {
      const nType = (n.type || '').toLowerCase();
      const isPolicy = nType === 'iampolicy' || nType === 'iam_policy';
      if (!isPolicy) return;
      // Only surface policies that attach to a role rendered on this
      // canvas — orphan or cross-account policies stay out of the lane.
      const attachedRoles = policyAttachedRoleIds.get(n.id);
      if (!attachedRoles || attachedRoles.size === 0) return;
      const anyRoleRendered = Array.from(attachedRoles).some(rId =>
        iamRoles.some(r => r.id === rId)
      );
      if (!anyRoleRendered) return;
      iamPolicies.push({
        id: n.id,
        type: 'iam_policy',
        name: n.name || n.id,
        shortName: shortName(n.name || n.id, 16),
        usedCount: 0,
        totalCount: 0,
        gapCount: 0,
        connectedSources: Array.from(attachedRoles),
        connectedTargets: [],
      });
    });

    // ── Filter unused VPCEs (Q2-A — 2026-06-25) ────────────────────
    // Operator complaint: SSM / SSMMESSAGES / EC2MESSAGES VPCEs took
    // ~30% of vertical space on alon-prod's canvas while contributing
    // zero signal (none of them carry observed flows). Per the chosen
    // option A, drop VPCEs that no flow.vpceId references. The "Not
    // used" badge introduced in #79 stays in the codebase for future
    // option B (collapse-to-pill) if we ever want to surface unused
    // VPCEs as a security signal again, but today the lane only shows
    // endpoints that are part of an active flow.
    const activeVpceIds = new Set<string>(
      flows.map(f => f.vpceId).filter(Boolean) as string[]
    );
    const filteredVpcEndpoints = vpcEndpoints.filter(v => activeVpceIds.has(v.id));

    return {
      computeServices,
      resources,
      subnets,
      securityGroups,
      nacls,
      iamRoles,
      iamPolicies,
      instanceProfiles,
      vpcEndpoints: filteredVpcEndpoints,
      egressGateways,
      flows,
      totalBytes,
      totalConnections,
      totalGaps,
      vpcGroups,
    };
  }, []);

  // Transform inspector API configured_rules → SGRule (shared by per-SG and bulk).
  const mapInspectorRulesToSGRules = useCallback((configuredRules: any[]): SGRule[] => {
    return configuredRules.map((rule: any) => {
      const isInbound = rule.direction === 'inbound' || rule.direction === 'ingress';
      return {
        direction: isInbound ? 'ingress' : 'egress',
        protocol: rule.protocol || rule.proto || 'tcp',
        fromPort: rule.from_port,
        toPort: rule.to_port,
        portDisplay: rule.port_display || (rule.from_port === rule.to_port ? String(rule.from_port || 'All') : `${rule.from_port}-${rule.to_port}`),
        source: rule.source_cidr || rule.source_sg || rule.peer_value || 'unknown',
        sourceType: rule.source_type || (rule.source_sg ? 'security_group' : 'cidr'),
        status: rule.status || 'unknown',
        flowCount: rule.flow_count || 0,
        lastSeen: rule.last_seen || null,
        isPublic: rule.is_public || (rule.source_cidr === '0.0.0.0/0'),
      };
    });
  }, []);

  // Fetch real SG rules from inspector API
  const fetchSGRules = useCallback(async (sgId: string): Promise<SGRule[]> => {
    try {
      const res = await fetch(`/api/proxy/security-groups/${sgId}/inspector?window=30d`);
      if (!res.ok) return [];

      const data = await res.json();
      return mapInspectorRulesToSGRules(data.configured_rules || []);
    } catch (err) {
      console.error(`Failed to fetch rules for SG ${sgId}:`, err);
      return [];
    }
  }, [mapInspectorRulesToSGRules]);

  // Fetch IAM role gap analysis data
  const fetchIAMRoleData = useCallback(async (roleName: string): Promise<{
    usedCount: number;
    totalCount: number;
    gapCount: number;
    lpScore: number;
  }> => {
    try {
      const res = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=365`);
      if (!res.ok) {
        console.warn(`[IAM] Failed to fetch gap analysis for ${roleName}: ${res.status}`);
        return { usedCount: 0, totalCount: 0, gapCount: 0, lpScore: 0 };
      }

      const data = await res.json();
      const summary = data.summary || {};

      return {
        usedCount: summary.used_count || data.used_count || 0,
        totalCount: summary.allowed_count || data.allowed_count || 0,
        gapCount: summary.unused_count || data.unused_count || 0,
        lpScore: summary.lp_score || 0,
      };
    } catch (err) {
      console.error(`[IAM] Error fetching gap analysis for ${roleName}:`, err);
      return { usedCount: 0, totalCount: 0, gapCount: 0, lpScore: 0 };
    }
  }, []);

  // RFC — dep-map fetch flow (post useCachedFetch migration):
  //
  //   useCachedFetch(depMapUrl, { cacheKey: `tfm-depmap:${systemName}` })
  //        │
  //        │ synchronous localStorage read on mount
  //        ▼
  //   rawDepMap (data) ────► useEffect([rawDepMap]) ─► runEnrichment()
  //        │                                              │
  //        │                                              ├─ buildArchitecture
  //        │                                              ├─ setArchitecture (epoch-guarded)
  //        │                                              ├─ Promise.all IAM gap-analysis ──► setArchitecture
  //        │                                              └─ Promise.all SG inspector     ──► setArchitecture
  //        ▼
  //   First paint on a cold backend now hits localStorage (1-2 ms) instead
  //   of waiting 30-40 s for the proxy. Background refresh updates the
  //   cache. If the refresh 504s, the hook keeps showing the cached
  //   architecture (error suppressed) — operator never sees the red popup
  //   unless there is no cache at all.
  //
  // Manual refresh (Refresh button) bumps `manualBustEpoch`, which:
  //   1. Mutates depMapUrl (adds &_t=N) → URL change triggers hook refetch
  //   2. Sets fetchInit.cache = 'no-store' → bypasses proxy edge cache
  //   This preserves the previous isManualRefresh semantics: bust BOTH the
  //   localStorage layer and the proxy edge layer.
  //
  // Auto-refresh interval calls retryDepMap() directly — refetches the same
  //   URL (so proxy edge cache may serve, matching the old loadData(false)).
  //
  // Race protection — fetchEpochRef still gates enrichment commits. If the
  //   operator navigates systems while IAM/SG fan-outs are in flight, the
  //   captured myEpoch goes stale and the late .then() callback drops its
  //   setArchitecture call. unchanged from the pre-migration design.
  //
  // The function below is now the enrichment runner (called from useEffect
  // on rawDepMap). It does NOT issue the dep-map HTTP call any more — that
  // is the hook's job. Kept inside useCallback so the auto-refresh
  // dependency array stays stable.
  const runEnrichment = useCallback((rawDepMap: { nodes?: any[]; edges?: any[]; relationships?: any[] }) => {
    setRefreshStatus('fetching');

    // Bump the epoch BEFORE any async work. Background enrichments
    // capture this value at start and only commit their setArchitecture
    // when the captured epoch still matches the ref's current value —
    // any newer runEnrichment call invalidates older in-flight enrichments.
    const myEpoch = ++fetchEpochRef.current;

    const nodes = rawDepMap.nodes || [];
    const edges = rawDepMap.edges || rawDepMap.relationships || [];

    console.log(`[TrafficFlowMap] Loaded ${nodes.length} nodes, ${edges.length} edges from Neo4j`);

    if (nodes.length === 0) {
      setEmptyDataError('No data available');
      setArchitecture(null);
      setRefreshStatus('error');
      return;
    }
    // Clear any previous "no data" state — fresh fetch returned nodes.
    setEmptyDataError(null);

    // Build architecture without IAM data first (will be fetched per-role)
    const arch = buildArchitecture(nodes, edges, []);

    // SG rules + IAM gap-analysis are BOTH background-fetched. Earlier
    // we left SG synchronous because "it's only ~9 SGs", but each
    // /api/proxy/security-groups/{id}/inspector call is 2-5s and on
    // path-filtered views with widened bucketing the SG list grew. Net:
    // a 10-20s wait on "Building Architecture..." even after the IAM
    // fix. Both enrichments now happen post-render so the operator sees
    // the architecture immediately and counts fill in as data arrives.
    //
    // Role cards render with placeholder counts (0/0) until the IAM
    // data arrives. No race risk: lookup is by role.id so a late-
    // arriving result still maps to the right card.
    const archForGaps = arch;

    // Detect changes from previous architecture (uses arch with
    // placeholder IAM counts — that's fine, the totalGaps update
    // below fires its own setArchitecture once IAM data arrives).
    const changes = detectChanges(previousArchRef.current, arch);
    previousArchRef.current = arch;

    if (changes.totalChanges > 0) {
      console.log(`[TrafficFlowMap] Changes detected:`, changes);
    }

    // Same epoch guard as the enrichment chains below. A slow render
    // arriving AFTER a newer runEnrichment has fired its own
    // setArchitecture would otherwise silently overwrite the fresh
    // data with stale data (e.g. user navigated systems mid-fetch).
    if (fetchEpochRef.current !== myEpoch) {
      console.log('[TrafficFlowMap] Initial render skipped — superseded by newer fetch');
      return;
    }
    setLastChanges(changes);
    // setRawArchitecture stores the unfiltered fetch result; the
    // displayed `architecture` is derived from it via useMemo so
    // pathFilter changes never trigger a refetch and stale fetches
    // can't race-overwrite the wrong filter.
    setArchitecture(arch);
    setLastUpdated(new Date());
    setRefreshStatus('success');

    // Reset the enrichment-failure flags for this fetch cycle. Either
    // batch retrying successfully clears its flag below; persistent
    // failures keep the toolbar chip lit until a retry succeeds.
    setIamEnrichmentFailed(false);
    setSgEnrichmentFailed(false);

    const batchKey = [
      archForGaps.iamRoles.map((r) => r.name).join(","),
      archForGaps.securityGroups.map((sg) => sg.id).join(","),
    ].join("|");
    const skipBatch = batchKey === lastBatchEnrichmentKeyRef.current;
    if (!skipBatch) {
      lastBatchEnrichmentKeyRef.current = batchKey;
    }

    // Background IAM gap-analysis enrichment. Fires-and-forgets;
    // does NOT block the architecture render.
    //
    // 2026-06-24: chunked to 8 roles per request to stay under Vercel's
    // 55s function ceiling. The BE handler caps concurrent role
    // computes at 4 (api/iam_gap_analysis.py via Semaphore(4)). Each
    // role takes ~3-7s warm on alon-prod; a single batch of 48 would
    // take ~84s (12 chunks of 4 sequential at the BE) — well over the
    // proxy timeout. Splitting into 8-role chunks bounds each request
    // to ~15s (2 BE sub-batches), leaving comfortable headroom. The
    // sister SG-inspector path below uses the same chunking helper.
    if (archForGaps.iamRoles.length > 0 && !skipBatch) {
      console.log(`[TrafficFlowMap] Background-fetching IAM data for ${archForGaps.iamRoles.length} roles (chunked at 8)...`);
      const loadIamEnrichment = async () => {
        const roleNames = archForGaps.iamRoles.map(r => r.name);
        const CHUNK_SIZE = 8;
        const merged: Record<string, any> = {};
        try {
          for (let i = 0; i < roleNames.length; i += CHUNK_SIZE) {
            const chunk = roleNames.slice(i, i + CHUNK_SIZE);
            const bulkRes = await fetch('/api/proxy/iam-roles/gap-analysis/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role_names: chunk, days: 365 }),
            });
            if (!bulkRes.ok) throw new Error(`bulk IAM chunk ${i / CHUNK_SIZE + 1} returned ${bulkRes.status}`);
            const bulk = await bulkRes.json();
            Object.assign(merged, bulk.results || {});
          }
          return archForGaps.iamRoles.map(role => {
            const data = merged[role.name];
            if (!data) return null;
            const summary = data.summary || {};
            return {
              roleId: role.id,
              usedCount: summary.used_count || data.used_count || 0,
              totalCount: summary.total_permissions || summary.allowed_count || data.allowed_count || 0,
              gapCount: summary.unused_count || data.unused_count || 0,
              lpScore: summary.lp_score || 0,
            };
          });
        } catch (bulkErr) {
          // 2026-06-22 P4 audit: REMOVED the per-role N+1 fallback. The
          // previous fallback fired one /api/proxy/iam-roles/<name> per
          // role (up to 48 on alon-prod) into the SAME backend that
          // just failed the bulk request — turning one batch failure
          // into 48 sequential failures on a saturated DB. Now: log
          // the failure, return null per role, AND set the toolbar
          // chip so the operator sees the gap honestly instead of
          // reading stale build-time seed counts on the chips.
          //
          // 2026-06-24: with chunking, a mid-loop failure may leave us
          // with PARTIAL data in `merged`. Surface what we have rather
          // than nuking it — partial enrichment beats zero enrichment.
          //
          // 2026-06-24 (later): only flag "unavailable" when ZERO
          // chunks succeeded. With 6 chunks of 8 roles each, a single
          // chunk failure used to light the chip — misleading because
          // 40 of 48 roles ARE enriched. Now: chip fires only when
          // the operator would actually see seed counts everywhere.
          const partialCount = Object.keys(merged).length;
          if (partialCount === 0) {
            console.warn('[TrafficFlowMap] IAM chunked fetch failed — NO enrichment available:', bulkErr);
            setIamEnrichmentFailed(true);
          } else {
            console.warn(`[TrafficFlowMap] IAM chunked fetch partial (${partialCount} roles enriched before failure):`, bulkErr);
          }
          return archForGaps.iamRoles.map(role => {
            const data = merged[role.name];
            if (!data) return null;
            const summary = data.summary || {};
            return {
              roleId: role.id,
              usedCount: summary.used_count || data.used_count || 0,
              totalCount: summary.total_permissions || summary.allowed_count || data.allowed_count || 0,
              gapCount: summary.unused_count || data.unused_count || 0,
              lpScore: summary.lp_score || 0,
            };
          });
        }
      };
      loadIamEnrichment().then(iamResults => {
        // Guard against stale enrichment: if a newer runEnrichment ran while
        // these IAM lookups were in flight, the architecture state has
        // since been replaced. Don't overwrite it with our stale data.
        if (fetchEpochRef.current !== myEpoch) {
          console.log('[TrafficFlowMap] IAM enrichment skipped — superseded by newer fetch');
          return;
        }
        iamResults.forEach(result => {
          if (!result) return;
          const { roleId, usedCount, totalCount, gapCount } = result;
          const role = archForGaps.iamRoles.find(r => r.id === roleId);
          if (role) {
            role.usedCount = usedCount;
            role.totalCount = totalCount;
            role.gapCount = gapCount;
          }
        });
        archForGaps.totalGaps =
          archForGaps.securityGroups.reduce((sum, sg) => sum + sg.gapCount, 0) +
          archForGaps.iamRoles.reduce((sum, r) => sum + r.gapCount, 0);
        setArchitecture({ ...archForGaps });
      });
    }

    // Background SG rules enrichment (parallel to IAM). Fires-and-
    // forgets; doesn't block architecture render.
    //
    // 2026-06-24: same 8-per-chunk pattern as IAM above. SG inspector
    // is cheaper per-call than IAM gap-analysis but the BE shares
    // Aura's connection pool, so a 48-role IAM thundering-herd
    // historically dragged SG calls down to timeout too. Chunking
    // keeps each request lean and lets the BE's existing
    // Semaphore(4) in sg_inspector_v2.py do its job.
    if (archForGaps.securityGroups.length > 0 && !skipBatch) {
      const loadSgEnrichment = async () => {
        const sgIds = archForGaps.securityGroups.map(sg => sg.id);
        const CHUNK_SIZE = 8;
        const merged: Record<string, any> = {};
        try {
          for (let i = 0; i < sgIds.length; i += CHUNK_SIZE) {
            const chunk = sgIds.slice(i, i + CHUNK_SIZE);
            const bulkRes = await fetch('/api/proxy/security-groups/inspector/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sg_ids: chunk, window: '30d' }),
            });
            if (!bulkRes.ok) throw new Error(`bulk SG chunk ${i / CHUNK_SIZE + 1} returned ${bulkRes.status}`);
            const bulk = await bulkRes.json();
            Object.assign(merged, bulk.results || {});
          }
          return archForGaps.securityGroups.map(sg => {
            const data = merged[sg.id];
            if (!data) return null;
            const rules = mapInspectorRulesToSGRules(data.configured_rules || []);
            return { sgId: sg.id, rules };
          });
        } catch (bulkErr) {
          // 2026-06-22 P4 audit: REMOVED the per-SG N+1 fallback. Same
          // logic as the IAM block above — when the batch fails we
          // were firing /api/proxy/security-groups/<id> per SG (up to
          // 9 on alon-prod) into the same overloaded DB. Log + skip
          // enrichment AND set the toolbar chip so the operator sees
          // that SG rule details couldn't load instead of trusting
          // stale build-time seed values on the chips.
          //
          // 2026-06-24: with chunking, partial enrichment is preserved
          // when a mid-loop chunk fails. Only flag "unavailable" when
          // ZERO chunks succeeded — same logic as the IAM block above.
          const partialCount = Object.keys(merged).length;
          if (partialCount === 0) {
            console.warn('[TrafficFlowMap] SG chunked fetch failed — NO enrichment available:', bulkErr);
            setSgEnrichmentFailed(true);
          } else {
            console.warn(`[TrafficFlowMap] SG chunked fetch partial (${partialCount} SGs enriched before failure):`, bulkErr);
          }
          return archForGaps.securityGroups.map(sg => {
            const data = merged[sg.id];
            if (!data) return null;
            const rules = mapInspectorRulesToSGRules(data.configured_rules || []);
            return { sgId: sg.id, rules };
          });
        }
      };
      loadSgEnrichment().then(sgRulesResults => {
        if (fetchEpochRef.current !== myEpoch) {
          console.log('[TrafficFlowMap] SG enrichment skipped — superseded by newer fetch');
          return;
        }
        sgRulesResults.forEach(result => {
          if (!result) return;
          const { sgId, rules } = result;
          const sg = archForGaps.securityGroups.find(s => s.id === sgId);
          if (sg) {
            sg.rules = rules;
            // Only overwrite totalCount when the inspector returned a
            // non-zero count. Otherwise keep the build-time seed
            // (gap_count fallback from buildArchitecture) so the chip
            // doesn't drop back to "0 rules" when the inspector returns
            // empty (cold, no policy parsed yet, or the endpoint
            // omits config-only rules). The 2026-05-21 demo bug:
            // alon-prod default SG has 3 real rules but inspector
            // returned empty array → chip read "0 rules" while the
            // closure footer said "review ingress rules."
            if (rules.length > 0) {
              sg.totalCount = rules.length;
            }
            sg.usedCount = rules.filter(r => r.status === 'used').length;
            sg.gapCount = rules.filter(r => r.status === 'unused' || r.status === 'unobserved').length;
          }
        });
        archForGaps.totalGaps =
          archForGaps.securityGroups.reduce((sum, sg) => sum + sg.gapCount, 0) +
          archForGaps.iamRoles.reduce((sum, r) => sum + r.gapCount, 0);
        setArchitecture({ ...archForGaps });
      });
    }

    if (changes.totalChanges > 0) {
      setTimeout(() => setRefreshStatus('idle'), 5000);
    } else {
      setRefreshStatus('idle');
    }
  }, [buildArchitecture, fetchSGRules, fetchIAMRoleData, mapInspectorRulesToSGRules]);

  // Drive runEnrichment off the cached dep-map data. Fires on initial
  // mount (when localStorage has cache, this runs synchronously with the
  // first render → architecture paints from cache in ~1ms instead of a
  // 30-40s cold backend wait), and again whenever the hook's background
  // refresh writes new data to its state.
  useEffect(() => {
    if (!rawDepMap) return;
    runEnrichment(rawDepMap);
  }, [rawDepMap, runEnrichment]);

  // Auto-refresh with configurable interval. retryDepMap refetches the
  // same URL → proxy edge cache may serve (matches old loadData(false)).
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      retryDepMap();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [retryDepMap, autoRefresh, refreshInterval]);

  // Resource-path focus: when a leaf was clicked in the Stack
  // Components sidebar (S3 prefix / RDS table / DDB), dim every map
  // node whose id is NOT in the active set (parent jewel, accessor
  // principals, source IPs) so the path context jumps out visually.
  //
  // Implementation choice — DOM walker via classList rather than a
  // React-state opacity prop on every node. The renderer is 5K LOC
  // with many node-render branches (compute, resource, sg, nacl,
  // role, instance_profile, api_call); threading an `isDimmed`
  // boolean through every branch would touch dozens of files and
  // risk subtle regressions in unrelated render paths. A one-shot
  // post-render DOM pass keyed on the existing `data-*-id`
  // attributes is surgical and reverts cleanly on cleanup.
  //
  // The CSS rule for `.focus-dimmed` lives in app/globals.css so
  // the transition is consistent with the rest of the design system.
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    const dimClass = 'focus-dimmed';

    // No filter → strip any leftover class and bail.
    if (!resourcePathsFilter) {
      container
        .querySelectorAll(`.${dimClass}`)
        .forEach((el) => el.classList.remove(dimClass));
      return;
    }

    const activeIds = new Set<string>(
      [
        resourcePathsFilter.parentJewelId,
        resourcePathsFilter.resolvedTargetId,
        resourcePathsFilter.resourceId,
        ...resourcePathsFilter.accessorIds,
        ...resourcePathsFilter.sourceIps,
      ].filter(Boolean) as string[],
    );

    // Selector covers every data-*-id attribute the map renders.
    // Keep this list in sync with the data attributes used on node
    // wrappers in this component (search for `data-resource-id=` /
    // `data-compute-id=` etc. to confirm coverage).
    const selector =
      '[data-resource-id], [data-compute-id], [data-sg-id], [data-nacl-id], [data-role-id]';
    const allNodes = container.querySelectorAll(selector);

    allNodes.forEach((n) => {
      const id =
        n.getAttribute('data-resource-id') ||
        n.getAttribute('data-compute-id') ||
        n.getAttribute('data-sg-id') ||
        n.getAttribute('data-nacl-id') ||
        n.getAttribute('data-role-id');
      if (id && !activeIds.has(id)) {
        n.classList.add(dimClass);
      } else {
        n.classList.remove(dimClass);
      }
    });

    // Cleanup on filter change / unmount.
    return () => {
      container
        .querySelectorAll(`.${dimClass}`)
        .forEach((el) => el.classList.remove(dimClass));
    };
    // architecture in deps so an auto-refresh that swaps node DOM
    // (new nodes appear) re-runs the dim pass and the fresh DOM
    // gets the right state. Without this, a refresh-during-active-
    // filter window would show all nodes bright until the user
    // toggles the filter.
  }, [resourcePathsFilter, architecture]);

  // Manual refresh: bump epoch so depMapUrl changes → hook useEffect
  // fires a fresh fetch with cache: 'no-store' (busts BOTH localStorage
  // and the proxy edge cache, matching pre-migration isManualRefresh=true).
  const handleManualRefresh = useCallback(() => {
    setManualBustEpoch(e => e + 1);
  }, []);

  // Load attack paths when enabled
  const loadAttackPaths = useCallback(async () => {
    if (!showAttackPaths) {
      setAttackPaths([]);
      return;
    }

    setLoadingAttackPaths(true);
    try {
      const res = await fetch(`/api/proxy/attack-paths/${systemName}`);
      if (res.ok) {
        const data = await res.json();
        const allPaths = data.paths || [];
        const vulnerabilityPaths = allPaths.filter((path: AttackPath) => path.total_cves > 0);
        setAttackPaths(vulnerabilityPaths);
        console.log(`[TrafficFlowMap] Loaded ${vulnerabilityPaths.length || 0} CVE attack paths (from ${allPaths.length || 0} total paths)`);
      }
    } catch (err) {
      console.error('[TrafficFlowMap] Failed to load attack paths:', err);
    } finally {
      setLoadingAttackPaths(false);
    }
  }, [showAttackPaths, systemName]);

  useEffect(() => { loadAttackPaths(); }, [loadAttackPaths]);

  // Inject CVE attack scenario into Neo4j
  const [injectingCVE, setInjectingCVE] = useState(false);
  const injectAttackScenario = useCallback(async () => {
    setInjectingCVE(true);
    try {
      const res = await fetch('/api/proxy/inject-cve/preset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        console.log('[TrafficFlowMap] Injected CVE data:', data);
        // Reload attack paths after injection
        if (showAttackPaths) {
          await loadAttackPaths();
        }
        alert(`✅ Injected attack scenario: ${data.updated_nodes} nodes updated with CVE data`);
      } else {
        const error = await res.text();
        console.error('[TrafficFlowMap] CVE injection failed:', error);
        alert('❌ Failed to inject CVE data. Make sure the backend is deployed with the inject-cve API.');
      }
    } catch (err) {
      console.error('[TrafficFlowMap] CVE injection error:', err);
      alert('❌ Failed to inject CVE data. Check console for details.');
    } finally {
      setInjectingCVE(false);
    }
  }, [showAttackPaths, loadAttackPaths]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (!fullscreenContainerRef) return;
    if (isFullscreen && containerRef.current) {
      fullscreenContainerRef.current = containerRef.current;
    } else if (!document.fullscreenElement) {
      fullscreenContainerRef.current = null;
    }
  }, [isFullscreen, fullscreenContainerRef]);

  useEffect(() => {
    if (!fullscreenContainerRef) return;
    const onFullscreenChange = () => {
      if (
        document.fullscreenElement instanceof HTMLElement &&
        containerRef.current &&
        document.fullscreenElement === containerRef.current
      ) {
        fullscreenContainerRef.current = containerRef.current;
        setIsFullscreen(true);
      } else {
        fullscreenContainerRef.current = null;
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [fullscreenContainerRef]);

  if (loading && !architecture) {
    return (
      <div className="dark h-full w-full flex items-center justify-center bg-card">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-foreground text-sm font-medium">Building Architecture...</p>
        </div>
      </div>
    );
  }

  if (error && !architecture) {
    return (
      <div className="dark h-full w-full flex items-center justify-center bg-card p-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center max-w-sm">
          <p className="text-red-600 dark:text-red-400 font-medium mb-2">Error</p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <button onClick={() => retryDepMap()} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    // `dark` class scopes the bright-theme design tokens (bg-card,
    // border-border, text-muted-foreground, etc.) back to their dark
    // values (.dark block in app/globals.css → Cyntro navy palette).
    // Reverts only TrafficFlowMap to dark without unwinding the
    // 92d9bc1 bright-theme conversion elsewhere; preserves the F4
    // audit fix + all subsequent commits' work. User request
    // 2026-06-09: "revert the traffic flow map to be dark mode".
    <div ref={containerRef} className="dark h-full w-full flex flex-row bg-card overflow-hidden">
      {/* Stack Components Sidebar */}
      {sidebarOpen && architecture && (
        <StackSidebar
          architecture={architecture}
          onSelectResource={(resource, type) => {
            // 2026-06-22 Crown Jewel Spotlight: parity with canvas card —
            // sidebar row click on a CJ-tagged Resource routes to Spotlight
            // when the parent wires it. Runs BEFORE damage-scope so the new
            // mode takes precedence; damage-scope still fires for non-CJ
            // data-plane nodes.
            if (
              (resource as ServiceNode).isCrownJewel &&
              onCrownJewelSpotlight
            ) {
              onCrownJewelSpotlight({
                id: resource.id,
                arn: (resource as ServiceNode & { arn?: string | null }).arn,
                name: (resource as { name?: string }).name ?? resource.id,
                type: (resource as { type?: string }).type ?? 'resource',
              });
              return;
            }
            // Attack Paths v2: Storage/DDB/RDS row click opens damage-scope
            // drawer (same as clicking the canvas node on the right).
            const damageScopeType = resolveDamageScopeNodeType(
              resource as { id?: string; type?: string },
              'resource',
            );
            if (onDamageScopeDataNode && damageScopeType) {
              onDamageScopeDataNode({
                id: resource.id,
                name: (resource as { name?: string }).name ?? resource.id,
                type: damageScopeType,
              });
              return;
            }
            setSelectedService({ service: resource, type: type as any });
            setSelectedNodeForHops(resource.id);
            // Scroll to node on map
            const el = mapContainerRef.current?.querySelector(
              `[data-compute-id="${resource.id}"], [data-resource-id="${resource.id}"], [data-sg-id="${resource.id}"], [data-nacl-id="${resource.id}"], [data-role-id="${resource.id}"]`
            );
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          highlightedNodeId={highlightedNodeId}
          onHighlightNode={setHighlightedNodeId}
          attackPaths={attackPaths}
          systemName={systemName}
          onFilterPaths={(filter) => {
            // Resource drill-down filter (S3 prefix / RDS table / DDB
            // table). The active filter is stored on local state so we
            // can highlight matching map nodes + show the active banner
            // in the sidebar. Defer the actual node-dimming overlay to
            // the follow-up commit — for now we scroll to the parent
            // jewel + select it so the path-context becomes visible.
            setResourcePathsFilter(filter);
            if (filter) {
              setSelectedNodeForHops(filter.parentJewelId);
              const el = mapContainerRef.current?.querySelector(
                `[data-resource-id="${filter.parentJewelId}"]`
              );
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }}
        />
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with refresh controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border flex-shrink-0 relative z-50 overflow-visible">
        <div className="flex items-center gap-4">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sidebarOpen ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'bg-muted text-muted-foreground'
            }`}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <Layers className="w-4 h-4" />
          </button>
          <h2 className="text-foreground font-bold text-lg">
            {titleOverride ?? (pathFilter ? 'Path Flow Map' : 'Traffic Flow Map')}
          </h2>
          {(pathBadgeOverride || (pathFilter && (pathFilter.jewelName || pathFilter.pathLabel))) && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30">
              <Target className="w-3.5 h-3.5 text-rose-700 dark:text-rose-300" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-200">
                {pathBadgeOverride
                  ? pathBadgeOverride
                  : pathFilter?.pathLabel
                    ? `Path → ${pathFilter.jewelName ?? pathFilter.pathLabel}`
                    : `Path to ${pathFilter?.jewelName}`}
              </span>
            </div>
          )}
          {/* Optional inline slot for parent-supplied chrome (EXFIL
              path selector pills). Renders in the same row as the
              title + path badge so it stays visible in TFM's
              full-screen mode where the outer panel header is hidden. */}
          {headerSlot}

          {/* Resource drill-down filter banner — set when the operator
              clicked a leaf (S3 prefix / RDS table) in the sidebar. */}
          {resourcePathsFilter && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30">
              <Target className="w-3.5 h-3.5 text-blue-700 dark:text-blue-300" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-200">
                {resourcePathsFilter.leafType === 'S3Prefix' && 'Prefix → '}
                {resourcePathsFilter.leafType === 'RDSTable' && 'Table → '}
                {!resourcePathsFilter.leafType && 'Resource → '}
                {resourcePathsFilter.resourceId.split('/').pop()?.split('::').pop() ?? resourcePathsFilter.resourceId}
              </span>
              <button
                onClick={() => setResourcePathsFilter(null)}
                className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 text-[11px] font-medium"
                title="Clear resource filter"
              >
                ×
              </button>
            </div>
          )}

          {/* Live indicator */}
          <div className="flex items-center gap-2 px-2 py-1 bg-emerald-500/10 rounded-full">
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              {autoRefresh ? 'LIVE' : 'PAUSED'}
            </span>
          </div>

          {/* Refresh status badge */}
          <RefreshStatusBadge
            status={refreshStatus}
            changes={lastChanges}
            onDismiss={() => setLastChanges(null)}
          />

          {lastUpdated && (
            <span className="text-muted-foreground text-xs">
              Last sync: {lastUpdated.toLocaleTimeString()}
            </span>
          )}

          {/* Enrichment-failure indicator. Surfaces honestly when an
              IAM or SG batch couldn't load, so the operator doesn't
              read the chips' build-time seed values as live data.
              Tooltip names exactly which enrichment is missing. Lives
              right after "Last sync" so it reads as a freshness signal
              for the detail layer, not a hard error on the canvas
              (which is fine — it rendered). */}
          {(iamEnrichmentFailed || sgEnrichmentFailed) && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-600 dark:text-amber-300 text-[11px] font-medium"
              title={[
                iamEnrichmentFailed && "IAM gap counts couldn't load — chips show build-time values",
                sgEnrichmentFailed && "SG rule details couldn't load — chips show build-time values",
                "Frontend backed off to avoid compounding backend load. Click Refresh Data to retry.",
              ]
                .filter(Boolean)
                .join("\n")}
            >
              <AlertTriangle className="w-3 h-3" />
              {iamEnrichmentFailed && sgEnrichmentFailed
                ? "IAM + SG details unavailable"
                : iamEnrichmentFailed
                  ? "IAM details unavailable"
                  : "SG details unavailable"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Connections toggle — 2026-06-25. Defaults OFF: the canvas
              shows zero global flow polylines, only the ones that
              touch the hovered chip + active attack paths. Toggling
              on restores legacy "every flow always" rendering. Lives
              before Attack Paths so the density story is the first
              thing on the toolbar. */}
          <button
            onClick={() => setShowAllConnections(!showAllConnections)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
              showAllConnections
                ? 'bg-violet-500 text-white shadow-md'
                : 'bg-muted text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-500/10'
            }`}
            title={showAllConnections
              ? "Showing all flow connections. Click to hide and only highlight on hover."
              : "Click to show all flow connections at once (heavier rendering)."}
          >
            <Network className="w-3 h-3" />
            Connections
          </button>
          {/* Attack Paths toggle */}
          <button
            onClick={() => setShowAttackPaths(!showAttackPaths)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
              showAttackPaths
                ? 'bg-red-500 text-white shadow-md animate-pulse'
                : 'bg-muted text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10'
            }`}
            title="Show CVE-driven attack paths to crown jewels"
          >
            {loadingAttackPaths ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <AlertTriangle className="w-3 h-3" />
            )}
            Attack Paths
            {attackPaths.length > 0 && showAttackPaths && (
              <span className="px-1.5 py-0.5 bg-red-700 rounded text-[10px] font-bold">
                {attackPaths.length}
              </span>
            )}
          </button>

          {/* Inject CVE Scenario — DEV-ONLY.
              This button writes SYNTHETIC CVE nodes into Neo4j. It's a
              developer test tool for exercising vulnerability-based
              paths and must NEVER ship to production. Per
              feedback_no_mock_numbers_in_ui + the 2026-05-21
              credibility audit — operators / customers / design
              partners can never see a "Inject Test Data" button on a
              security platform; that's instant credibility loss.
              Gated by NODE_ENV; Next.js inlines this at build time so
              the button code is dead-stripped from prod bundles. */}
          {process.env.NODE_ENV !== 'production' && (
            <button
              onClick={injectAttackScenario}
              disabled={injectingCVE}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                injectingCVE
                  ? 'bg-violet-500/50 text-purple-700 dark:text-purple-200 cursor-wait'
                  : 'bg-violet-500 hover:bg-violet-500 text-white'
              }`}
              title="DEV ONLY — inject synthetic CVE data for testing vulnerability-based paths"
            >
              {injectingCVE ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Target className="w-3 h-3" />
              )}
              [DEV] Inject CVE Test Data
            </button>
          )}

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              autoRefresh ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
            }`}
            title={autoRefresh ? `Auto-refresh every ${refreshInterval}s` : 'Auto-refresh disabled'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />
            Auto ({refreshInterval}s)
          </button>

          {/* Animation toggle */}
          <button
            onClick={() => setAnimate(!animate)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              animate ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'bg-muted text-muted-foreground'
            }`}
          >
            {animate ? '⏸ Pause' : '▶ Play'}
          </button>

          {/* Heatmap + VPC controls */}
          <HeatmapControls
            heatmapMode={heatmapMode}
            onToggleHeatmap={() => setHeatmapMode(!heatmapMode)}
            selectedNodeId={selectedNodeForHops}
            hopDepth={hopDepth}
            onHopDepthChange={setHopDepth}
            showVPCBoundaries={showVPCBoundaries}
            onToggleVPC={() => setShowVPCBoundaries(!showVPCBoundaries)}
          />

          {/* V2-3 (2026-05-31): "Show laterals" toggle. Visible only
              when canvasV2 is on (the polish layer is opt-in via the
              ?canvas=v2 flag). Default false → laterals dim at ~30%;
              true → laterals at full opacity. Persists in localStorage
              per-user, not per-chain. */}
          {canvasV2 && (
            <button
              onClick={() => setShowLaterals(!showLaterals)}
              data-canvas-v2-toggle="show-laterals"
              data-show-laterals={showLaterals ? "true" : "false"}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showLaterals
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              title={
                showLaterals
                  ? "Laterals at full opacity. Click to dim non-path edges/nodes."
                  : "Laterals dimmed to 30%. Click to surface them at full opacity."
              }
            >
              Laterals: {showLaterals ? "bright" : "dim"}
            </button>
          )}

          {/* Export */}
          <ExportControls
            containerRef={mapContainerRef as React.RefObject<HTMLDivElement>}
            systemName={systemName}
          />

          {/* Manual refresh button */}
          <button
            onClick={() => handleManualRefresh()}
            disabled={refreshStatus === 'fetching'}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              refreshStatus === 'fetching'
                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${refreshStatus === 'fetching' ? 'animate-spin' : ''}`} />
            {refreshStatus === 'fetching' ? 'Syncing...' : 'Refresh Data'}
          </button>

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            data-testid="canvas-fullscreen-toggle"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="px-3 py-1.5 bg-muted hover:bg-accent text-foreground rounded-lg text-xs font-medium"
          >
            {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <div ref={mapContainerRef} className="flex-1 overflow-y-auto p-4 relative">
        {architecture && (
          architecture.computeServices.length > 0 ||
          architecture.resources.length > 0 ||
          // EXFIL view (2026-05-25 user report) — the jewel-on-left
          // case has its only card in entryPoints + accessors in
          // iamRoles. The original guard only checked compute/resources,
          // so an architecture with 5 accessors and 0 network egress
          // fell through to the "No Active Traffic" empty state instead
          // of rendering the identity plane. Widen the guard so any
          // renderable lane keeps us on the diagram path.
          (architecture.entryPoints?.length ?? 0) > 0 ||
          architecture.iamRoles.length > 0 ||
          (architecture.principals?.length ?? 0) > 0
        ) ? (
          <UnifiedArchitectureDiagram
            architecture={architecture}
            animate={animate}
            spotlightActiveNodeIds={effectiveSpotlightActiveNodeIds}
            // pathMode is true whenever the caller has filtered the
            // architecture down to a single attack path (Attack Paths v2)
            // OR has registered a per-node action callback (legacy
            // attack-paths drill-in). Both surfaces want the path-
            // specific UI: 7-col grid template, click-to-modal SG card.
            pathMode={!!pathFilter || !!onPathNodeAction}
            innerTitleOverride={innerTitleOverride}
            innerSubtitleOverride={innerSubtitleOverride}
            observedMode={observedMode}
            onRoleClick={onRoleClick}
            jewelEmphasis={jewelEmphasis}
            jewelSeverity={jewelSeverity}
            canvasV2={canvasV2}
            showLaterals={showLaterals}
            entryNodeId={entryNodeId}
            // 2026-06-25: auto-on Connections when the canvas is in a
            // drilled-in mode (pathFilter set OR onPathNodeAction
            // registered — both match pathMode={!!pathFilter || !!onPathNodeAction}
            // above). Reason: when an operator drills into one chain
            // they EXPECT to see that chain's flow lines; defaulting
            // off was the right move for the unfiltered Topology
            // (40-EC2 spaghetti) but wrong when the canvas is already
            // narrowed to 1 chain. Toolbar toggle still works to flip
            // back to all-flows on the broad view.
            showAllConnections={showAllConnections || !!pathFilter || !!onPathNodeAction}
            onSelectService={(service, type) => {
              // 2026-06-22 Crown Jewel Spotlight: CJ-tagged Resources route
              // to Spotlight when the parent wires the callback. Runs BEFORE
              // damage-scope so Spotlight wins on CJ clicks; damage-scope
              // still handles non-CJ data-plane nodes.
              if (
                type === 'resource' &&
                (service as ServiceNode).isCrownJewel &&
                onCrownJewelSpotlight
              ) {
                onCrownJewelSpotlight({
                  id: service.id,
                  arn: (service as ServiceNode & { arn?: string | null }).arn,
                  name: (service as { name?: string }).name ?? service.id,
                  type: (service as { type?: string }).type ?? 'resource',
                });
                return;
              }
              const damageScopeType = resolveDamageScopeNodeType(service, type);
              if (onDamageScopeDataNode && damageScopeType) {
                onDamageScopeDataNode({
                  id: service.id,
                  name: (service as { name?: string }).name ?? service.id,
                  type: damageScopeType,
                });
                return;
              }
              // If the parent registered a path-node action callback
              // (Attack Paths page), route there — they'll open the
              // right remediation modal per node type.
              if (onPathNodeAction) {
                onPathNodeAction(type as PathNodeKind, {
                  id: service.id,
                  name: (service as any).name ?? service.id,
                  type: (service as any).type,
                });
                return;
              }
              setSelectedService({ service, type });
              setSelectedNodeForHops(service.id);
            }}
            attackPaths={showAttackPaths ? attackPaths : []}
            selectedAttackPath={selectedAttackPath}
            onSelectAttackPath={setSelectedAttackPath}
            heatmapMode={heatmapMode}
            ghostedNodeIds={ghostedNodeIds}
            highlightedNodeId={highlightedNodeId}
            showVPCBoundaries={showVPCBoundaries}
            exfilByWorkloadId={exfilByWorkloadId}
          />
        ) : (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📡</div>
            <p className="text-foreground text-lg font-semibold mb-2">No Active Traffic</p>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Generate traffic between services to see the live architecture diagram.
            </p>
            <button onClick={() => retryDepMap()} className="mt-6 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">
              Refresh
            </button>
          </div>
        )}

      </div>

      {/* Timeline Slider */}
      <TimelineSlider
        currentWindow={timeWindow}
        onWindowChange={(w) => setTimeWindow(w as '7d' | '30d' | '90d')}
        timePoint={timePoint}
        onTimePointChange={setTimePoint}
        isActive={timelineActive}
        onToggle={() => setTimelineActive(!timelineActive)}
      />

      {/* Service Details Popup */}
      {selectedService && architecture && (
        <ServiceDetailsPopup
          service={selectedService.service}
          serviceType={selectedService.type}
          architecture={architecture}
          onClose={() => setSelectedService(null)}
        />
      )}

      {/* Attack Path Detail Panel */}
      {showPathDetails && (
        <AttackPathDetailPanel
          systemName={systemName}
          pathId={showPathDetails}
          onClose={() => setShowPathDetails(null)}
        />
      )}
      </div>{/* Close main content area */}

      {/* Attack Paths Modal - fixed overlay, outside all overflow containers */}
      {showAttackPaths && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setShowAttackPaths(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-[380px] max-h-[80vh] bg-card rounded-xl border border-red-500/50 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-red-500/30 bg-red-500/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-red-600 dark:text-red-400 font-bold text-sm">Attack Paths</span>
              </div>
              <button
                onClick={() => setShowAttackPaths(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-52px)]">
              {/* Loading State */}
              {loadingAttackPaths && (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <RefreshCw className="w-6 h-6 text-red-600 dark:text-red-400 animate-spin" />
                  <span className="text-muted-foreground text-xs">Analyzing attack paths...</span>
                </div>
              )}

              {/* Empty State */}
              {!loadingAttackPaths && attackPaths.length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-center">
                    <div className="text-foreground text-xs font-medium mb-1">No CVE Attack Paths Found</div>
                    <div className="text-muted-foreground text-[10px] leading-relaxed">
                      No current CVE-driven routes to crown jewels were detected.
                      {process.env.NODE_ENV !== 'production' && ' You can still inject CVE test data to simulate vulnerability-based paths.'}
                    </div>
                  </div>
                  {/* DEV-only — see comment on the primary inject button.
                      This is the empty-state fallback inject; same gating. */}
                  {process.env.NODE_ENV !== 'production' && (
                    <button
                      onClick={() => { setShowAttackPaths(false); injectAttackScenario(); }}
                      className="mt-1 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded-lg text-violet-600 dark:text-violet-400 text-[10px] font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Target className="w-3 h-3" />
                      [DEV] Inject CVE Test Data
                    </button>
                  )}
                  <button
                    onClick={() => loadAttackPaths()}
                    className="px-3 py-1.5 bg-muted/50 hover:bg-accent border border-border rounded-lg text-muted-foreground text-[10px] font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </button>
                </div>
              )}

              {/* Results */}
              {!loadingAttackPaths && attackPaths.length > 0 && (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-red-500/20 rounded-lg p-2 text-center">
                      <div className="text-red-600 dark:text-red-400 text-xl font-bold">{attackPaths.length}</div>
                      <div className="text-[10px] text-muted-foreground">CVE Paths</div>
                    </div>
                    <div className="bg-orange-500/20 rounded-lg p-2 text-center">
                      <div className="text-orange-600 dark:text-orange-400 text-xl font-bold">
                        {attackPaths.filter(p => p.risk_score >= 15).length}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Critical</div>
                    </div>
                    <div className="bg-yellow-500/20 rounded-lg p-2 text-center">
                      <div className="text-yellow-600 dark:text-yellow-400 text-xl font-bold">
                        {attackPaths.filter(p => p.total_cves > 0).length}
                      </div>
                      <div className="text-[10px] text-muted-foreground">With CVEs</div>
                    </div>
                  </div>

                  {/* Path List */}
                  <div className="text-[10px] text-muted-foreground uppercase mb-2 font-medium">Vulnerability Paths</div>
                  <div className="space-y-2">
                    {attackPaths.slice(0, 8).map((path) => (
                      <div
                        key={path.id}
                        className={`p-2.5 rounded-lg cursor-pointer transition-all ${
                          selectedAttackPath === path.id
                            ? 'bg-red-500/30 ring-1 ring-red-500'
                            : 'bg-muted/50 hover:bg-accent'
                        }`}
                        onClick={() => setSelectedAttackPath(selectedAttackPath === path.id ? null : path.id)}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div className="text-foreground text-xs font-medium truncate flex-1">
                            {path.source_type} → {path.target_name}
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            path.risk_score >= 15 ? 'bg-red-500/30 text-red-600 dark:text-red-400' :
                            path.risk_score >= 10 ? 'bg-orange-500/30 text-orange-600 dark:text-orange-400' :
                            'bg-yellow-500/30 text-yellow-600 dark:text-yellow-400'
                          }`}>
                            {path.risk_score}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{path.path_length} hops</span>
                          {path.total_cves > 0 && (
                            <span className="text-red-600 dark:text-red-400">{path.total_cves} CVEs</span>
                          )}
                          {path.total_cves === 0 && path.path_kind && (
                            <span className="text-cyan-600 dark:text-cyan-400 capitalize">{path.path_kind.replace(/-/g, ' ')}</span>
                          )}
                          <span className={path.evidence_type === 'observed' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                            {path.evidence_type}
                          </span>
                        </div>
                        {/* Path nodes preview */}
                        <div className="flex items-center gap-1 mt-1.5 text-[9px] text-muted-foreground overflow-hidden">
                          {path.nodes.slice(0, 4).map((node, i) => (
                            <React.Fragment key={node.id}>
                              {i > 0 && <ArrowRight className="w-2 h-2 flex-shrink-0" />}
                              <span className={`truncate ${node.cve_count > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                                {node.name.slice(0, 12)}
                              </span>
                            </React.Fragment>
                          ))}
                          {path.nodes.length > 4 && <span>...</span>}
                        </div>
                        {/* View Details Button */}
                        {selectedAttackPath === path.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowPathDetails(path.id);
                              setShowAttackPaths(false);
                            }}
                            className="mt-2 w-full py-1.5 px-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-600 dark:text-red-400 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View Crown Jewel Analysis
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {attackPaths.length > 8 && (
                    <div className="text-center text-[10px] text-muted-foreground mt-2">
                      +{attackPaths.length - 8} more paths
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
