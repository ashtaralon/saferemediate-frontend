"use client"

/**
 * Attacker View V2 — pure DTO renderer.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  ARCHITECTURAL INVARIANT (non-negotiable)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  This component does NO inference. It iterates the typed
 *  AttackCanvas DTO from the backend producer and renders.
 *
 *  Allowed imports:
 *    - lib/types/attack-canvas      (DTO contract)
 *    - lib/attack-canvas-client     (fetch function)
 *    - react, lucide-react, tailwind utilities
 *
 *  Forbidden imports (would compromise the v1/v2 isolation):
 *    - components/attack-paths-v2/attacker-view-panel  (V1)
 *    - components/dependency-map/traffic-flow-map      (V1 renderer)
 *    - any *bucketForGraphType*, *addAsX*, *_summarize_labels*
 *      utility from V1
 *    - any fallback "normalize this looks-broken-shape" wrappers
 *
 *  Forbidden patterns inside this file:
 *    ❌ regex on node.aws_id ("includes('instance-profile')")
 *    ❌ fuzzy name matching
 *    ❌ "if this property missing, derive it from this other one"
 *    ❌ visual-proximity grouping (VPC box comes from dto.groups only)
 *    ❌ silent fallback counts (read what the DTO says, render it,
 *       trust it)
 */

import React, { useEffect, useMemo, useState } from "react"
import {
  Server, Database, HardDrive, Key, Layers, Shield, Lock,
  Globe, Cloud, Target, FileText, Network, AlertTriangle,
  Loader2, ChevronDown, ChevronRight, X,
} from "lucide-react"
import type {
  AttackCanvas, CanvasNode, CanvasEdge, CanvasGroup, CanvasBinding,
  CanvasNodeType, CanvasRelationshipType, CanvasWarning, IncludedReason,
} from "@/lib/types/attack-canvas"
import { fetchAttackCanvas } from "@/lib/attack-canvas-client"

/** Schema version this renderer was built against. If the backend
 *  starts emitting a different version we refuse to render rather
 *  than silently misinterpret fields. Bump in lockstep with the
 *  Pydantic source. */
const RENDERER_SCHEMA_VERSION = "1.0" as const

interface AttackerCanvasV2Props {
  systemName: string
  pathId: string
}

export function AttackerCanvasV2({ systemName, pathId }: AttackerCanvasV2Props) {
  const [canvas, setCanvas] = useState<AttackCanvas | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setCanvas(null)
    const controller = new AbortController()
    fetchAttackCanvas({ systemName, pathId, signal: controller.signal })
      .then((result) => {
        if (cancelled) return
        if (!result.ok) {
          setError(`${result.error.message}${result.error.detail ? ` — ${result.error.detail}` : ""}`)
          return
        }
        setCanvas(result.canvas)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [systemName, pathId])

  if (loading) return <LoadingState />
  if (error) return <FetchErrorState message={error} />
  if (!canvas) return <FetchErrorState message="no_canvas_returned" />

  // Hard schema-version guard. If the wire format changes without
  // a matching renderer update, refuse to render rather than
  // silently mis-display data.
  if (canvas.schema_version !== RENDERER_SCHEMA_VERSION) {
    return <ContractErrorState received={canvas.schema_version} expected={RENDERER_SCHEMA_VERSION} />
  }

  return <CanvasBody canvas={canvas} />
}

// ─── Top-level states ───────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col h-full items-center justify-center p-12">
      <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
      <div className="text-sm text-slate-400">Building canvas from Neo4j…</div>
      <div className="text-[10px] text-slate-600 mt-1">V2 producer · edge-proven, no inference</div>
    </div>
  )
}

function FetchErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col h-full items-center justify-center p-12">
      <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
      <div className="text-sm font-semibold text-red-300">Canvas fetch failed</div>
      <div className="text-xs text-slate-500 mt-2 max-w-md text-center font-mono">{message}</div>
      <div className="text-[10px] text-slate-600 mt-3 max-w-sm text-center">
        The V2 producer reads from the IAP cache. If the IAP isn't warm,
        hit the path list first to warm it, then retry the attacker view.
      </div>
    </div>
  )
}

function ContractErrorState({ received, expected }: { received: string; expected: string }) {
  return (
    <div className="flex flex-col h-full items-center justify-center p-12">
      <AlertTriangle className="w-8 h-8 text-amber-400 mb-3" />
      <div className="text-sm font-semibold text-amber-300">Schema version mismatch</div>
      <div className="text-xs text-slate-400 mt-2 text-center max-w-md">
        Renderer expects schema_version <code className="text-cyan-300">{expected}</code>,
        backend returned <code className="text-red-300">{received}</code>.
        Refusing to render — would silently mis-display fields. Coordinate
        a renderer update before deploying the new backend schema.
      </div>
    </div>
  )
}

// ─── Canvas body ────────────────────────────────────────────────────

function CanvasBody({ canvas }: { canvas: AttackCanvas }) {
  // Lane buckets (pure layout — node.type → lane is static,
  // declarative). Each node only appears in exactly one lane.
  const lanes = useMemo(() => bucketByLane(canvas.nodes), [canvas.nodes])
  const hasInstanceProfiles = lanes.instanceProfiles.length > 0
  const hasIamPolicies = lanes.iamPolicies.length > 0
  const hasRemediationTargets = canvas.nodes.some((n) => n.included_reason === "REMEDIATION_TARGET")

  return (
    <div className="flex flex-col h-full">
      <Header canvas={canvas} />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex gap-6 min-w-max">
          <Lane title="Principals" icon={Target} iconColor="text-cyan-300" nodes={lanes.principals} />
          <LaneStack>
            <Lane title="Compute" icon={Server} iconColor="text-blue-400" nodes={lanes.compute} />
            <Lane title="Egress Gateways" icon={Globe} iconColor="text-amber-300" nodes={lanes.egressGateways} />
          </LaneStack>
          <Lane title="Subnets" icon={Globe} iconColor="text-cyan-400" nodes={lanes.subnets} canvas={canvas} />
          <Lane title="Security Groups" icon={Shield} iconColor="text-orange-400" nodes={lanes.securityGroups} />
          <Lane title="NACLs" icon=  {Lock} iconColor="text-cyan-400" nodes={lanes.nacls} />
          {hasInstanceProfiles && (
            <Lane title="Instance Profiles" icon={Layers} iconColor="text-amber-300" nodes={lanes.instanceProfiles} />
          )}
          <Lane title="IAM Roles" icon={Key} iconColor="text-pink-400" nodes={lanes.iamRoles} />
          {hasIamPolicies && (
            <Lane title="IAM Policies" icon={FileText} iconColor="text-rose-400" nodes={lanes.iamPolicies} />
          )}
          <LaneStack>
            <Lane title="Resources" icon={Database} iconColor="text-green-400" nodes={lanes.resources} />
            {hasRemediationTargets && (
              <Lane
                title="Remediation Targets"
                icon={AlertTriangle}
                iconColor="text-amber-400"
                nodes={lanes.remediationTargets}
                subtitle="Sibling resources covered by the same grant"
              />
            )}
          </LaneStack>
        </div>
      </div>
      {(canvas.warnings.length > 0 || Object.keys(canvas.diagnostics).length > 0) && (
        <DebugFooter canvas={canvas} />
      )}
    </div>
  )
}

// ─── Header (DTO metadata) ──────────────────────────────────────────

function Header({ canvas }: { canvas: AttackCanvas }) {
  const integrityBadge = {
    verified: { label: "Verified", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
    partial: { label: "Partial", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
    failed: { label: "Failed", cls: "bg-red-500/20 text-red-300 border-red-500/40" },
  }[canvas.path_integrity]
  return (
    <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur sticky top-0 z-10 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Cloud className="w-3 h-3 text-cyan-400" />
          ATTACK CANVAS V2 · edge-proven
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold uppercase tracking-wider ${integrityBadge.cls}`}>
          {integrityBadge.label}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono shrink-0">
        <span>{canvas.nodes.length} nodes</span>
        <span>·</span>
        <span>{canvas.edges.length} edges</span>
        <span>·</span>
        <span>{canvas.bindings.length} bindings</span>
        {canvas.warnings.length > 0 && (
          <>
            <span>·</span>
            <span className="text-amber-300">{canvas.warnings.length} warnings</span>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Lane components ────────────────────────────────────────────────

function LaneStack({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 min-w-[170px]">{children}</div>
}

interface LaneProps {
  title: string
  icon: typeof Server
  iconColor: string
  nodes: CanvasNode[]
  subtitle?: string
  canvas?: AttackCanvas
}

function Lane({ title, icon: Icon, iconColor, nodes, subtitle, canvas }: LaneProps) {
  if (nodes.length === 0) {
    return (
      <div className="flex flex-col gap-2 min-w-[150px]">
        <LaneHeader title={title} icon={Icon} iconColor={iconColor} count={0} />
        <div className="text-[10px] italic text-slate-600 px-2 py-3 text-center">none on this path</div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2 min-w-[170px]">
      <LaneHeader title={title} icon={Icon} iconColor={iconColor} count={nodes.length} />
      {subtitle && <div className="text-[9px] text-slate-500 italic px-1">{subtitle}</div>}
      <div className="flex flex-col gap-2">
        {/* VPC chip rendered above subnet cards when the canvas has
            a VPC group — pure DTO consumption, no inference. */}
        {title === "Subnets" && canvas?.groups
          .filter((g) => g.container_type === "VPC")
          .map((g) => {
            const vpcNode = canvas.nodes.find((n) => n.aws_id === g.container_aws_id)
            return (
              <div
                key={`vpc-${g.container_aws_id}`}
                data-canvas-vpc-id={g.container_aws_id}
                className="rounded-lg border border-blue-500/40 bg-blue-500/5 px-2.5 py-1.5"
                title={`VPC ${g.container_aws_id} contains ${g.member_aws_ids.length} members via ${g.proof_relationship}`}
              >
                <div className="flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                  <span className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold">VPC</span>
                </div>
                <div className="text-xs font-mono text-slate-200 truncate mt-0.5">
                  {vpcNode?.name ?? g.container_aws_id}
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">{g.member_aws_ids.length} members</div>
              </div>
            )
          })}
        {nodes.map((node) => (
          <NodeCard key={node.aws_id} node={node} />
        ))}
      </div>
    </div>
  )
}

function LaneHeader({ title, icon: Icon, iconColor, count }: { title: string; icon: typeof Server; iconColor: string; count: number }) {
  return (
    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
      <Icon className={`w-4 h-4 ${iconColor}`} />
      {title} ({count})
    </div>
  )
}

// ─── Node card (pure DTO rendering) ─────────────────────────────────

function NodeCard({ node }: { node: CanvasNode }) {
  const visual = visualForType(node.type)
  const isRemediationTarget = node.included_reason === "REMEDIATION_TARGET"
  return (
    <div
      data-canvas-node-id={node.aws_id}
      className={`relative rounded-lg border-2 px-3 py-2 ${visual.cardBg} ${visual.cardBorder} ${
        isRemediationTarget ? "border-dashed" : ""
      }`}
      title={`${node.aws_id} · included_reason=${node.included_reason}`}
    >
      <div className="flex items-center gap-2">
        <visual.Icon className={`w-4 h-4 shrink-0 ${visual.iconColor}`} />
        <span className="text-xs font-semibold text-white truncate">
          {node.name ?? node.aws_id}
        </span>
      </div>
      <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${visual.iconColor}`}>
        {visual.label}
      </div>
      {isRemediationTarget && (
        <span className="absolute -top-2 -right-2 text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/50">
          Reach
        </span>
      )}
      <NodeDetails node={node} />
    </div>
  )
}

// ─── Per-type detail blocks (read DTO properties, no derivation) ────

function NodeDetails({ node }: { node: CanvasNode }) {
  switch (node.type) {
    case "IAMRole":
    case "InstanceProfile":
      return <IAMRoleDetails node={node} />
    case "IAMPolicy":
      return <IAMPolicyDetails node={node} />
    case "SecurityGroup":
      return <SecurityGroupDetails node={node} />
    case "NetworkACL":
      return <NACLDetails node={node} />
    case "Subnet":
      return <SubnetDetails node={node} />
    default:
      return null
  }
}

function IAMRoleDetails({ node }: { node: CanvasNode }) {
  // Honest role math: intersection of used_actions ∩ allowed_actions.
  // Defends against v1's "1/7 · 6 unused" bug where the producer
  // counted sts:AssumeRole as one of the role's S3 actions.
  const allowed = (node.properties.allowed_actions as string[] | undefined) ?? []
  const used = (node.properties.used_actions as string[] | undefined) ?? []
  const allowedSet = new Set(allowed)
  const usedInAllowed = used.filter((a) => allowedSet.has(a))
  const total = allowed.length
  const usedCount = usedInAllowed.length
  const excess = Math.max(0, total - usedCount)

  if (total === 0) return null
  return (
    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-bold text-pink-300">
        {usedCount}/{total} used
      </span>
      {excess > 0 && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-amber-300">
          {excess} excess
        </span>
      )}
    </div>
  )
}

function IAMPolicyDetails({ node }: { node: CanvasNode }) {
  const permCount = (node.properties.permission_count as number | undefined) ?? null
  const isInline = (node.properties.is_inline as boolean | undefined) ?? null
  if (permCount == null) return null
  return (
    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-bold text-rose-300">{permCount} actions</span>
      {isInline === true && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">inline</span>
      )}
    </div>
  )
}

function SecurityGroupDetails({ node }: { node: CanvasNode }) {
  const total = (node.properties.total_rules as number | undefined) ?? 0
  const hasHighRisk = node.properties.has_high_risk === true
  const hasPublicInbound = node.properties.has_public_inbound === true
  return (
    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">
        {total} rules
      </span>
      {(hasHighRisk || hasPublicInbound) && (
        <span
          className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/30 text-red-200 border border-red-500/50 font-bold uppercase tracking-wider"
          title="DTO carries has_high_risk=true or has_public_inbound=true — public-facing rule on this SG"
        >
          High Risk
        </span>
      )}
    </div>
  )
}

function NACLDetails({ node }: { node: CanvasNode }) {
  const total = (node.properties.total_rules as number | undefined) ?? 0
  const denies =
    Number(node.properties.inbound_deny_count ?? 0) +
    Number(node.properties.outbound_deny_count ?? 0)
  const subnetCount = (node.properties.subnet_count as number | undefined) ?? 0
  const hasHighRisk = node.properties.has_high_risk === true
  const hasPubAllow = node.properties.has_public_inbound_allow === true
  return (
    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
        {total} {total === 1 ? "rule" : "rules"}
      </span>
      {denies > 0 && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-amber-300">
          {denies} {denies === 1 ? "deny" : "denies"}
        </span>
      )}
      {subnetCount > 0 && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300">
          {subnetCount} subnets
        </span>
      )}
      {(hasHighRisk || hasPubAllow) && (
        <span
          className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/30 text-red-200 border border-red-500/50 font-bold uppercase tracking-wider"
          title="DTO carries has_high_risk=true or has_public_inbound_allow=true — public-facing ALLOW rule on this NACL"
        >
          High Risk
        </span>
      )}
    </div>
  )
}

function SubnetDetails({ node }: { node: CanvasNode }) {
  const isPublic = node.properties.public as boolean | null | undefined
  const rt = node.properties.route_table_id as string | undefined
  const rtCount = node.properties.route_table_route_count as number | undefined
  return (
    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
      {isPublic === true && (
        <span className="text-[9px] px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/40 text-amber-200">
          Public
        </span>
      )}
      {isPublic === false && (
        <span className="text-[9px] px-1.5 py-0.5 rounded border bg-emerald-500/10 border-emerald-500/40 text-emerald-200">
          Private
        </span>
      )}
      {isPublic == null && (
        <span className="text-[9px] px-1.5 py-0.5 rounded border bg-slate-700/40 border-slate-600 text-slate-300">
          Unknown
        </span>
      )}
      {rt && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700/80 font-mono text-slate-300" title={rt}>
          {rt.slice(0, 12)}…
          {typeof rtCount === "number" ? ` · ${rtCount}r` : ""}
        </span>
      )}
    </div>
  )
}

// ─── Debug footer (warnings + diagnostics) ──────────────────────────

function DebugFooter({ canvas }: { canvas: AttackCanvas }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-t border-slate-800/60 bg-slate-950/95">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Debug · {canvas.warnings.length} warning{canvas.warnings.length === 1 ? "" : "s"}
        <span className="ml-auto font-mono text-slate-600">
          {(canvas.diagnostics.elapsed_ms as number | undefined) ?? "?"}ms
        </span>
      </button>
      {expanded && (
        <div className="px-6 py-3 max-h-64 overflow-auto space-y-2 text-[11px]">
          {canvas.warnings.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-amber-300/80">Warnings</div>
              {canvas.warnings.slice(0, 30).map((w, i) => (
                <WarningRow key={i} w={w} />
              ))}
              {canvas.warnings.length > 30 && (
                <div className="text-[10px] text-slate-500 italic">…+{canvas.warnings.length - 30} more</div>
              )}
            </>
          )}
          <div className="text-[10px] uppercase tracking-wider text-slate-500 pt-3">Diagnostics</div>
          <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap">
            {JSON.stringify(canvas.diagnostics, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function WarningRow({ w }: { w: CanvasWarning }) {
  const severityCls = {
    block_render: "border-red-500/40 bg-red-500/10 text-red-200",
    hide_node: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    info: "border-slate-700 bg-slate-800/60 text-slate-300",
  }[w.severity]
  return (
    <div className={`text-[10px] px-2 py-1 rounded border ${severityCls}`}>
      <span className="font-mono font-semibold">[{w.severity}]</span> {w.code}: {w.message}
    </div>
  )
}

// ─── Pure helpers ───────────────────────────────────────────────────

interface LaneBuckets {
  principals: CanvasNode[]
  compute: CanvasNode[]
  egressGateways: CanvasNode[]
  subnets: CanvasNode[]
  securityGroups: CanvasNode[]
  nacls: CanvasNode[]
  instanceProfiles: CanvasNode[]
  iamRoles: CanvasNode[]
  iamPolicies: CanvasNode[]
  resources: CanvasNode[]
  remediationTargets: CanvasNode[]
}

/** Pure lane bucketing — node.type → lane is a static, declarative
 *  mapping. Each node lands in exactly one lane. REMEDIATION_TARGET
 *  nodes split out so they render in their own subsection (visual
 *  signal that they're not on the chain itself). */
function bucketByLane(nodes: CanvasNode[]): LaneBuckets {
  const out: LaneBuckets = {
    principals: [],
    compute: [],
    egressGateways: [],
    subnets: [],
    securityGroups: [],
    nacls: [],
    instanceProfiles: [],
    iamRoles: [],
    iamPolicies: [],
    resources: [],
    remediationTargets: [],
  }
  for (const n of nodes) {
    if (n.included_reason === "REMEDIATION_TARGET") {
      out.remediationTargets.push(n)
      continue
    }
    switch (n.type) {
      case "AWSPrincipal":
      case "CloudTrailPrincipal":
      case "IAMUser":
        out.principals.push(n)
        break
      case "EC2Instance":
      case "LambdaFunction":
      case "ECSTask":
      case "FargateTask":
        out.compute.push(n)
        break
      case "InternetGateway":
      case "NATGateway":
      case "EgressOnlyInternetGateway":
      case "TransitGateway":
        out.egressGateways.push(n)
        break
      case "Subnet":
      case "VPC":  // VPC card itself if it's on the path; group renders separately
        if (n.type === "Subnet") out.subnets.push(n)
        // VPCs are surfaced via groups; if also a PATH_NODE we skip
        // here so we don't double-render. The Subnets lane's VPC
        // chip handles the visual.
        break
      case "SecurityGroup":
        out.securityGroups.push(n)
        break
      case "NetworkACL":
        out.nacls.push(n)
        break
      case "InstanceProfile":
        out.instanceProfiles.push(n)
        break
      case "IAMRole":
        out.iamRoles.push(n)
        break
      case "IAMPolicy":
        out.iamPolicies.push(n)
        break
      case "S3Bucket":
      case "DynamoDBTable":
      case "RDSInstance":
      case "KMSKey":
      case "Secret":
        out.resources.push(n)
        break
      case "NetworkInterface":
      case "RouteTable":
      case "VPCEndpoint":
        // Skipped: ENIs are conceptually part of the EC2 (folded
        // into compute card via a chip — TODO when properties carry
        // the ENI list). RouteTable + VPCEndpoint are shown as chips
        // on the subnet card via Subnet properties.
        break
    }
  }
  return out
}

interface NodeVisual {
  Icon: typeof Server
  iconColor: string
  cardBg: string
  cardBorder: string
  label: string
}

/** Per-type visual constants. Pure lookup table — no inference. */
function visualForType(t: CanvasNodeType): NodeVisual {
  switch (t) {
    case "EC2Instance":      return { Icon: Server,    iconColor: "text-blue-400",   cardBg: "bg-blue-500/10",   cardBorder: "border-blue-500/40",   label: "EC2" }
    case "LambdaFunction":   return { Icon: Server,    iconColor: "text-amber-400",  cardBg: "bg-amber-500/10",  cardBorder: "border-amber-500/40",  label: "Lambda" }
    case "ECSTask":
    case "FargateTask":      return { Icon: Server,    iconColor: "text-cyan-400",   cardBg: "bg-cyan-500/10",   cardBorder: "border-cyan-500/40",   label: "Container" }
    case "VPC":              return { Icon: Cloud,     iconColor: "text-blue-300",   cardBg: "bg-blue-500/5",    cardBorder: "border-blue-500/40",   label: "VPC" }
    case "Subnet":           return { Icon: Globe,     iconColor: "text-cyan-400",   cardBg: "bg-cyan-500/5",    cardBorder: "border-cyan-500/30",   label: "Subnet" }
    case "SecurityGroup":    return { Icon: Shield,    iconColor: "text-orange-400", cardBg: "bg-orange-500/10", cardBorder: "border-orange-500/40", label: "SG" }
    case "NetworkACL":       return { Icon: Lock,      iconColor: "text-cyan-400",   cardBg: "bg-cyan-500/10",   cardBorder: "border-cyan-500/40",   label: "Network ACL" }
    case "NetworkInterface": return { Icon: Network,   iconColor: "text-slate-400",  cardBg: "bg-slate-800/60",  cardBorder: "border-slate-700",     label: "ENI" }
    case "RouteTable":       return { Icon: Network,   iconColor: "text-slate-400",  cardBg: "bg-slate-800/60",  cardBorder: "border-slate-700",     label: "Route Table" }
    case "VPCEndpoint":      return { Icon: Globe,     iconColor: "text-violet-300", cardBg: "bg-violet-500/10", cardBorder: "border-violet-500/40", label: "VPCE" }
    case "InternetGateway":  return { Icon: Globe,     iconColor: "text-amber-300",  cardBg: "bg-amber-500/10",  cardBorder: "border-amber-500/40",  label: "IGW" }
    case "NATGateway":       return { Icon: Globe,     iconColor: "text-sky-300",    cardBg: "bg-sky-500/10",    cardBorder: "border-sky-500/40",    label: "NAT GW" }
    case "EgressOnlyInternetGateway": return { Icon: Globe, iconColor: "text-orange-300", cardBg: "bg-orange-500/10", cardBorder: "border-orange-500/40", label: "Egress-only IGW" }
    case "TransitGateway":   return { Icon: Globe,     iconColor: "text-violet-300", cardBg: "bg-violet-500/10", cardBorder: "border-violet-500/40", label: "Transit GW" }
    case "IAMRole":          return { Icon: Key,       iconColor: "text-pink-400",   cardBg: "bg-pink-500/10",   cardBorder: "border-pink-500/40",   label: "IAM Role" }
    case "InstanceProfile":  return { Icon: Layers,    iconColor: "text-amber-300",  cardBg: "bg-amber-500/10",  cardBorder: "border-amber-500/40",  label: "Instance Profile" }
    case "IAMPolicy":        return { Icon: FileText,  iconColor: "text-rose-400",   cardBg: "bg-rose-500/10",   cardBorder: "border-rose-500/40",   label: "IAM Policy" }
    case "IAMUser":          return { Icon: Target,    iconColor: "text-cyan-300",   cardBg: "bg-cyan-500/10",   cardBorder: "border-cyan-400/40",   label: "IAM User" }
    case "AWSPrincipal":
    case "CloudTrailPrincipal": return { Icon: Target, iconColor: "text-cyan-300",   cardBg: "bg-cyan-500/10",   cardBorder: "border-cyan-400/40",   label: "Principal" }
    case "S3Bucket":         return { Icon: HardDrive, iconColor: "text-green-400",  cardBg: "bg-green-500/10",  cardBorder: "border-green-500/40",  label: "S3" }
    case "DynamoDBTable":    return { Icon: Database,  iconColor: "text-orange-400", cardBg: "bg-orange-500/10", cardBorder: "border-orange-500/40", label: "DynamoDB" }
    case "RDSInstance":      return { Icon: Database,  iconColor: "text-purple-400", cardBg: "bg-purple-500/10", cardBorder: "border-purple-500/40", label: "RDS" }
    case "KMSKey":           return { Icon: Key,       iconColor: "text-pink-400",   cardBg: "bg-pink-500/10",   cardBorder: "border-pink-500/40",   label: "KMS Key" }
    case "Secret":           return { Icon: Lock,      iconColor: "text-rose-400",   cardBg: "bg-rose-500/10",   cardBorder: "border-rose-500/40",   label: "Secret" }
  }
}
