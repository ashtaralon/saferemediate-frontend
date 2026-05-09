"use client"

import React, { useState, useRef, useMemo, useCallback, useEffect } from "react"
import {
  Server, Shield, Lock, Key, Database, Zap, Globe,
  AlertTriangle, Crown, Target, UserCheck, ArrowRight,
  Maximize2, Minimize2, X,
} from "lucide-react"
import { SeverityBadge } from "./severity-badge"
import type { IdentityAttackPath, PathNodeDetail, PathEdgeDetail, RiskReduction } from "./types"
import {
  ServiceNodeBox,
  IAMRoleNode,
  ConnectionLinesSVG,
} from "@/components/dependency-map/traffic-flow-map"
import type {
  ServiceNode,
  SecurityCheckpoint,
  TrafficFlow,
  SystemArchitecture,
  NodeType,
} from "@/components/dependency-map/traffic-flow-map"

// ── Props ───────────────────────────────────────────────────────────
interface AttackPathFlowVizProps {
  paths: IdentityAttackPath[]
  selectedPathIndex: number
  onNodeClick: (nodeId: string) => void
  selectedNodeId: string | null
}

// ── Badge data for SG/NACL context on compute nodes ──────────────
interface ComputeBadge {
  id: string
  name: string
  kind: "sg" | "nacl"
  ruleCount?: number
  gapCount?: number
  isOpenToInternet?: boolean
}

// ── Extended architecture with rendering metadata ─────────────────
interface LateralArchitecture extends SystemArchitecture {
  _badges: Map<string, ComputeBadge[]>
}

// ── Helpers ─────────────────────────────────────────────────────────
function mapNodeType(type: string): NodeType {
  const t = (type ?? "").toLowerCase()
  if (t === "ec2" || t === "ec2instance") return "compute"
  if (t === "lambdafunction" || t === "lambda") return "lambda"
  if (t === "rdsinstance" || t === "rds" || t.includes("database")) return "database"
  if (t === "s3bucket" || t === "s3" || t.includes("bucket")) return "storage"
  if (t.includes("dynamodb") || t === "databasetable") return "dynamodb"
  if (t === "s3prefix") return "storage"
  if (t.includes("sqs")) return "sqs"
  if (t.includes("sns")) return "sns"
  if (t.includes("kms") || t.includes("secret")) return "storage"
  if (t === "accesskey" || t === "access_key") return "iam_role"
  if (t === "stssession" || t === "sts_session") return "iam_role"
  if (t.includes("cloudtrailprincipal") || t.includes("awsprincipal")) return "principal"
  if (t.includes("iam") || t.includes("role")) return "iam_role"
  if (t.includes("instanceprofile")) return "iam_role"
  if (t.includes("security") || t.includes("sg")) return "security_group"
  if (t.includes("nacl")) return "nacl"
  if (t.includes("stepfunction")) return "lambda"
  return "network"
}

function shortName(name: string, maxLen = 22): string {
  let short = (name ?? "Unknown")
    .replace("SafeRemediate-Test-", "")
    .replace("SafeRemediate-", "")
    .replace("saferemediate-test-", "")
    .replace("saferemediate-", "")
    .replace("arn:aws:s3:::", "")
    .replace("arn:aws:", "")
    .replace("cyntro-demo-", "")
    .replace("-745783559495", "")

  if (short.includes("/")) short = short.split("/").pop() || short
  if (short.length > maxLen) short = short.substring(0, maxLen) + "..."
  return short
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B"
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`
  return `${bytes} B`
}

const _SG_NACL_TYPES = new Set([
  "securitygroup", "security_group", "sg",
  "networkacl", "nacl",
])

const _NETWORK_CONTAINER_TYPES = new Set([
  "vpc", "subnet",
])

function isSgNaclType(type: string): boolean {
  return _SG_NACL_TYPES.has((type ?? "").toLowerCase())
}

function isNetworkContainerType(type: string): boolean {
  return _NETWORK_CONTAINER_TYPES.has((type ?? "").toLowerCase())
}

// ── Transform attack path data → Lateral Movement Architecture ──────
function buildArchitectureFromPath(path: IdentityAttackPath): LateralArchitecture {
  const nodes = path.nodes ?? []
  const edges = path.edges ?? []

  // ── Step 1: categorize all nodes by lane ──
  const entryNodes: PathNodeDetail[] = []
  const computeLaneNodes: PathNodeDetail[] = []
  const iamNodes: PathNodeDetail[] = []
  const pivotNodes: PathNodeDetail[] = []
  const jewelNodes: PathNodeDetail[] = []

  const seenIds = new Set<string>()

  for (const node of nodes) {
    if (seenIds.has(node.id)) continue
    seenIds.add(node.id)

    const lane = node.lane ?? ""
    const nodeType = mapNodeType(node.type ?? "")

    if (lane === "entry") {
      entryNodes.push(node)
    } else if (lane === "compute") {
      computeLaneNodes.push(node)
    } else if (lane === "iam") {
      iamNodes.push(node)
    } else if (lane === "pivot") {
      pivotNodes.push(node)
    } else if (lane === "crown_jewel") {
      jewelNodes.push(node)
    } else {
      // Fallback based on type
      if (["database", "storage", "dynamodb"].includes(nodeType)) {
        jewelNodes.push(node)
      } else if (nodeType === "iam_role") {
        iamNodes.push(node)
      } else if (["sqs", "sns"].includes(nodeType)) {
        pivotNodes.push(node)
      } else if (nodeType === "principal") {
        entryNodes.push(node)
      } else {
        computeLaneNodes.push(node)
      }
    }
  }

  // ── Step 2: separate compute lane into actual computes vs SG/NACL badges ──
  const actualComputes: ServiceNode[] = []
  const sgNaclNodes: PathNodeDetail[] = []

  for (const node of computeLaneNodes) {
    const t = (node.type ?? "").toLowerCase()
    if (isSgNaclType(t) || isNetworkContainerType(t)) {
      sgNaclNodes.push(node)
    } else {
      actualComputes.push({
        id: node.id,
        name: node.name ?? node.id,
        shortName: shortName(node.name ?? node.id),
        type: mapNodeType(node.type ?? ""),
      })
    }
  }

  // ── Step 3: build SG/NACL badge map per compute ──
  const badges = new Map<string, ComputeBadge[]>()
  const computeIdSet = new Set(actualComputes.map((c) => c.id))

  for (const sgNode of sgNaclNodes) {
    const kind: "sg" | "nacl" = isSgNaclType(sgNode.type ?? "") && (sgNode.type ?? "").toLowerCase().includes("nacl") ? "nacl" : "sg"
    // Find which compute this SG/NACL connects to via edges
    let parentComputeId: string | undefined
    for (const edge of edges) {
      if (edge.source === sgNode.id && computeIdSet.has(edge.target)) {
        parentComputeId = edge.target
        break
      }
      if (edge.target === sgNode.id && computeIdSet.has(edge.source)) {
        parentComputeId = edge.source
        break
      }
    }
    const targetId = parentComputeId ?? actualComputes[0]?.id
    if (targetId) {
      const existing = badges.get(targetId) ?? []
      existing.push({
        id: sgNode.id,
        name: shortName(sgNode.name ?? sgNode.id, 16),
        kind,
        ruleCount: (sgNode.rules?.inbound_count ?? 0) + (sgNode.rules?.outbound_count ?? 0),
        gapCount: sgNode.gap_count ?? 0,
        isOpenToInternet: sgNode.rules?.open_to_internet ?? sgNode.is_internet_exposed ?? false,
      })
      badges.set(targetId, existing)
    }
  }

  // ── Step 4: Build ServiceNode / SecurityCheckpoint arrays ──
  const entries: ServiceNode[] = entryNodes.map((n) => ({
    id: n.id,
    name: n.name ?? n.id,
    shortName: shortName(n.name ?? n.id),
    type: mapNodeType(n.type ?? "") === "iam_role" ? ("principal" as NodeType) : mapNodeType(n.type ?? ""),
  }))

  const identities: SecurityCheckpoint[] = iamNodes.map((n) => ({
    id: n.id,
    type: "iam_role" as any,
    name: n.name ?? n.id,
    shortName: shortName(n.name ?? n.id),
    usedCount: n.permissions?.used ?? 0,
    totalCount: n.permissions?.total ?? 0,
    gapCount: n.permissions?.unused ?? n.gap_count ?? 0,
    connectedSources: [],
    connectedTargets: [],
  }))

  const pivots: ServiceNode[] = pivotNodes.map((n) => ({
    id: n.id,
    name: n.name ?? n.id,
    shortName: shortName(n.name ?? n.id),
    type: mapNodeType(n.type ?? ""),
  }))

  const jewels: ServiceNode[] = jewelNodes.map((n) => ({
    id: n.id,
    name: n.name ?? n.id,
    shortName: shortName(n.name ?? n.id),
    type: mapNodeType(n.type ?? ""),
  }))

  // If no entries, promote first compute to entry
  if (entries.length === 0 && actualComputes.length > 0) {
    entries.push(actualComputes.shift()!)
  }

  // If still no entries but we have IAM nodes, promote first IAM to entry
  if (entries.length === 0 && identities.length > 0) {
    const iam = identities.shift()!
    entries.push({
      id: iam.id,
      name: iam.name,
      shortName: iam.shortName,
      type: "principal" as NodeType,
    })
  }

  // ── Step 5: Build flows ──
  // ConnectionLinesSVG routing: sourceId → sgId → naclId → roleId → targetId
  // Mapped to: entry → compute → identity → pivot → crown jewel
  const flows: TrafficFlow[] = []
  let totalBytes = 0
  let totalConnections = 0

  const entryIdSet = new Set(entries.map((e) => e.id))
  const identityIdSet = new Set(identities.map((i) => i.id))
  const pivotIdSet = new Set(pivots.map((p) => p.id))
  const jewelIdSet = new Set(jewels.map((j) => j.id))

  const identityEdgeTypes = new Set([
    "USES_ROLE", "ASSUMES_ROLE_ACTUAL", "ASSUMES_ROLE", "HAS_ROLE", "CAN_ASSUME",
    "HAS_ACCESS_KEY", "ASSUMED_ROLE", "ASSUMES_VIA_STS",
  ])
  const accessEdgeTypes = new Set([
    "ACCESSES_RESOURCE", "ACTUAL_API_CALL", "ACTUAL_S3_ACCESS", "QUERIES_DB",
    "ACTUAL_TRAFFIC", "CALLS", "RUNTIME_CALLS",
  ])
  const pivotEdgeTypes = new Set([
    "CALLS", "RUNTIME_CALLS", "TRIGGERS", "SENDS_TO", "PUBLISHES_TO",
    "ACCESSES_RESOURCE", "ACTUAL_API_CALL",
  ])
  const generalEdgeTypes = new Set([
    "ACTUAL_TRAFFIC", "SECURED_BY", "USES_SECURITY_GROUP", "RUNTIME_CALLS",
    "CALLS", "ACTUAL_API_CALL",
  ])

  function findConnected(fromId: string, targetSet: Set<string>, edgeTypes: Set<string>): string | undefined {
    for (const edge of edges) {
      const etype = edge.type ?? ""
      if (!edgeTypes.has(etype)) continue
      if (edge.source === fromId && targetSet.has(edge.target)) return edge.target
      if (edge.target === fromId && targetSet.has(edge.source)) return edge.source
    }
    return undefined
  }

  // For each entry → each jewel, build the full chain
  for (const entry of entries) {
    // Find compute connected to this entry
    const computeId = findConnected(entry.id, computeIdSet, generalEdgeTypes) ?? actualComputes[0]?.id
    // Find identity connected to compute (or entry)
    const identityId = computeId
      ? (findConnected(computeId, identityIdSet, identityEdgeTypes) ?? findConnected(entry.id, identityIdSet, identityEdgeTypes) ?? identities[0]?.id)
      : (findConnected(entry.id, identityIdSet, identityEdgeTypes) ?? identities[0]?.id)

    for (const jewel of jewels) {
      // Find pivot between identity and jewel
      let pivotId: string | undefined
      if (identityId) {
        pivotId = findConnected(identityId, pivotIdSet, pivotEdgeTypes)
      }
      if (!pivotId && computeId) {
        pivotId = findConnected(computeId, pivotIdSet, pivotEdgeTypes)
      }
      pivotId = pivotId ?? pivots[0]?.id

      // Collect traffic metrics from relevant edges
      const relevantEdges = edges.filter(
        (e) =>
          e.source === entry.id || e.target === jewel.id ||
          (computeId && (e.source === computeId || e.target === computeId))
      )
      const bytes = relevantEdges.reduce((s, e) => s + (e.traffic_bytes ?? 0), 0)
      const connections = relevantEdges.reduce((s, e) => s + (e.hit_count ?? 0), 0)

      totalBytes += bytes
      totalConnections += connections

      flows.push({
        sourceId: entry.id,
        targetId: jewel.id,
        sgId: computeId,
        naclId: identityId,
        roleId: pivotId,
        ports: [],
        protocol: "TCP",
        bytes,
        connections,
        isActive: true,
      })
    }
  }

  // Fallback: if no flows and we have computes, treat them as entries
  if (flows.length === 0 && actualComputes.length > 0 && jewels.length > 0) {
    for (const compute of actualComputes) {
      const identityId = findConnected(compute.id, identityIdSet, identityEdgeTypes) ?? identities[0]?.id
      for (const jewel of jewels) {
        flows.push({
          sourceId: compute.id,
          targetId: jewel.id,
          sgId: undefined as any,
          naclId: identityId,
          roleId: pivots[0]?.id,
          ports: [],
          protocol: "TCP",
          bytes: 0,
          connections: 0,
          isActive: true,
        })
      }
    }
    // Move computes to entries for rendering
    entries.push(...actualComputes)
    actualComputes.length = 0
  }

  // Wire checkpoint connections for ConnectionLinesSVG fallback routing
  const computeCheckpoints: SecurityCheckpoint[] = actualComputes.map((c) => ({
    id: c.id,
    type: c.type as any,
    name: c.name,
    shortName: c.shortName,
    usedCount: 0,
    totalCount: 0,
    gapCount: 0,
    connectedSources: entries.map((e) => e.id),
    connectedTargets: identities.map((i) => i.id),
  }))

  for (const id of identities) {
    id.connectedSources = actualComputes.length > 0 ? actualComputes.map((c) => c.id) : entries.map((e) => e.id)
    id.connectedTargets = pivots.length > 0 ? pivots.map((p) => p.id) : jewels.map((j) => j.id)
  }

  const pivotCheckpoints: SecurityCheckpoint[] = pivots.map((p) => ({
    id: p.id,
    type: p.type as any,
    name: p.name,
    shortName: p.shortName,
    usedCount: 0,
    totalCount: 0,
    gapCount: 0,
    connectedSources: identities.map((i) => i.id),
    connectedTargets: jewels.map((j) => j.id),
  }))

  return {
    // SystemArchitecture fields (repurposed for ConnectionLinesSVG)
    computeServices: entries,               // data-compute-id → Entry Points
    securityGroups: computeCheckpoints,      // data-sg-id → Compute
    nacls: identities,                       // data-nacl-id → Identity (IAM)
    iamRoles: pivotCheckpoints,              // data-role-id → Pivot Services
    resources: jewels,                       // data-resource-id → Crown Jewels
    flows,
    totalBytes,
    totalConnections,
    totalGaps: identities.reduce((s, r) => s + r.gapCount, 0),
    // Extra rendering metadata
    _badges: badges,
  }
}

// ── Pivot Service Card ─────────────────────────────────────────────
function PivotServiceCard({
  node,
  isHighlighted,
  onHover,
  onClick,
}: {
  node: ServiceNode
  isHighlighted: boolean
  onHover: (id: string | null) => void
  onClick: () => void
}) {
  const typeIcons: Record<string, React.ReactNode> = {
    lambda: <Zap className="w-4 h-4 text-amber-400" />,
    sqs: <ArrowRight className="w-4 h-4 text-orange-400" />,
    sns: <ArrowRight className="w-4 h-4 text-pink-400" />,
    storage: <Key className="w-4 h-4 text-cyan-400" />,
  }
  const icon = typeIcons[(node.type || "").toLowerCase()] ?? <Zap className="w-4 h-4 text-purple-400" />

  return (
    <div
      className={`
        px-4 py-3 rounded-xl border-2 cursor-pointer transition-all duration-300
        ${isHighlighted
          ? "border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/20"
          : "border-purple-500/30 bg-purple-500/10 hover:border-purple-400 hover:bg-purple-500/15"
        }
        min-w-[150px]
      `}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm font-semibold text-white truncate max-w-[110px]">
          {node.shortName || node.name}
        </span>
      </div>
      <div className="text-[10px] text-purple-300/80 capitalize">
        {(node.type || "service").replace(/_/g, " ")}
      </div>
    </div>
  )
}

// ── Compute Node Card (with SG/NACL badges) ────────────────────────
function ComputeNodeCard({
  node,
  badges,
  isHighlighted,
  onHover,
  onClick,
  onBadgeClick,
  flowInfo,
}: {
  node: ServiceNode
  badges: ComputeBadge[]
  isHighlighted: boolean
  onHover: (id: string | null) => void
  onClick: () => void
  onBadgeClick: (id: string) => void
  flowInfo?: { bytes: number; connections: number }
}) {
  const typeIcons: Record<string, React.ReactNode> = {
    compute: <Server className="w-4 h-4 text-blue-400" />,
    lambda: <Zap className="w-4 h-4 text-amber-400" />,
  }
  const icon = typeIcons[(node.type || "").toLowerCase()] ?? <Server className="w-4 h-4 text-blue-400" />

  return (
    <div
      className={`
        px-4 py-3 rounded-xl border-2 cursor-pointer transition-all duration-300
        ${isHighlighted
          ? "border-blue-400 bg-blue-500/20 shadow-lg shadow-blue-500/20"
          : "border-slate-600 bg-slate-800/80 hover:border-blue-400/60 hover:bg-slate-800"
        }
        min-w-[170px]
      `}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm font-semibold text-white truncate max-w-[120px]">
          {node.shortName || node.name}
        </span>
      </div>
      {flowInfo && (flowInfo.bytes > 0 || flowInfo.connections > 0) && (
        <div className="text-[10px] text-slate-400 mb-1.5">
          {formatBytes(flowInfo.bytes)} · {flowInfo.connections} conn
        </div>
      )}
      {/* SG/NACL badges — clickable for detail panel */}
      {badges.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-slate-700/50">
          {badges.map((badge) => (
            <button
              key={badge.id}
              onClick={(e) => {
                e.stopPropagation()
                onBadgeClick(badge.id)
              }}
              onMouseEnter={(e) => {
                e.stopPropagation()
                onHover(badge.id)
              }}
              onMouseLeave={(e) => {
                e.stopPropagation()
                onHover(null)
              }}
              className={`
                w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-medium
                transition-all duration-200 text-left
                ${badge.kind === "sg"
                  ? "bg-orange-500/10 text-orange-300 border border-orange-500/30 hover:bg-orange-500/25 hover:border-orange-400"
                  : "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 hover:border-cyan-400"
                }
              `}
            >
              {badge.kind === "sg" ? (
                <Shield className="w-3.5 h-3.5 flex-shrink-0" />
              ) : (
                <Lock className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="truncate font-semibold">{badge.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[8px] ${badge.kind === "sg" ? "text-orange-400/60" : "text-cyan-400/60"}`}>
                    {badge.kind === "sg" ? "Security Group" : "Network ACL"}
                  </span>
                  {(badge.ruleCount ?? 0) > 0 && (
                    <span className="text-[8px] text-slate-400">{badge.ruleCount} rules</span>
                  )}
                  {badge.isOpenToInternet && (
                    <span className="text-[8px] text-red-400 font-bold">PUBLIC</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Risk Reduction Bar ──────────────────────────────────────────────
function RiskReductionBar({ riskReduction }: { riskReduction: RiskReduction }) {
  const { current_score, achievable_score, top_actions } = riskReduction
  const reduction = current_score > 0 ? Math.round(((current_score - achievable_score) / current_score) * 100) : 0

  return (
    <div className="flex items-center gap-4 w-full">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-400">Risk Reduction Potential</span>
          <span className="text-[10px] font-bold text-emerald-400">-{reduction}%</span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden bg-slate-800">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/60"
            style={{ width: `${Math.min(current_score, 100)}%` }}
          />
          <div
            className="absolute inset-y-0 rounded-full bg-red-500/60"
            style={{
              left: `${Math.min(achievable_score, 100)}%`,
              width: `${Math.min(current_score - achievable_score, 100)}%`,
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[9px] text-slate-500 font-mono">{achievable_score}</span>
          <span className="text-[9px] text-red-400 font-mono">{current_score}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {(top_actions ?? []).slice(0, 3).map((a, i) => (
          <div key={i} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800/80 border border-slate-700/50">
            <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-[9px] text-slate-300 max-w-[100px] truncate">{a.action}</span>
            <span className="text-[9px] text-emerald-400 font-bold">-{Math.abs(a.impact)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────
export function AttackPathFlowViz({ paths, selectedPathIndex, onNodeClick, selectedNodeId }: AttackPathFlowVizProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Fullscreen toggle (matches the system-map graph-view-v2 pattern)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Esc closes fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isFullscreen])

  const path = paths?.[selectedPathIndex] ?? null

  const architecture = useMemo(() => {
    if (!path) return null
    return buildArchitectureFromPath(path)
  }, [path])

  // Aliases for clearer rendering
  const entries = architecture?.computeServices ?? []
  const computes = architecture?.securityGroups ?? []
  const identities = architecture?.nacls ?? []
  const pivots = architecture?.iamRoles ?? []
  const jewels = architecture?.resources ?? []
  const badgeMap = (architecture as LateralArchitecture)?._badges ?? new Map()

  // Build flow info per entry (source)
  const entryFlowInfo = useMemo(() => {
    const map = new Map<string, { bytes: number; connections: number; ports: string[] }>()
    if (!architecture) return map
    for (const flow of architecture.flows) {
      const existing = map.get(flow.sourceId) ?? { bytes: 0, connections: 0, ports: [] }
      existing.bytes += flow.bytes
      existing.connections += flow.connections
      map.set(flow.sourceId, existing)
    }
    return map
  }, [architecture])

  // Build flow info per compute
  const computeFlowInfo = useMemo(() => {
    const map = new Map<string, { bytes: number; connections: number }>()
    if (!architecture) return map
    for (const flow of architecture.flows) {
      if (flow.sgId) {
        const existing = map.get(flow.sgId) ?? { bytes: 0, connections: 0 }
        existing.bytes += flow.bytes
        existing.connections += flow.connections
        map.set(flow.sgId, existing)
      }
    }
    return map
  }, [architecture])

  // Build flow info per jewel (target)
  const jewelFlowInfo = useMemo(() => {
    const map = new Map<string, { bytes: number; connections: number; ports: string[] }>()
    if (!architecture) return map
    for (const flow of architecture.flows) {
      const existing = map.get(flow.targetId) ?? { bytes: 0, connections: 0, ports: [] }
      existing.bytes += flow.bytes
      existing.connections += flow.connections
      map.set(flow.targetId, existing)
    }
    return map
  }, [architecture])

  // Hover highlight logic
  const isNodeHighlighted = useCallback(
    (nodeId: string) => {
      if (!hoveredId || !architecture) return false
      if (nodeId === hoveredId) return true
      return architecture.flows.some(
        (f) =>
          (f.sourceId === hoveredId && (f.targetId === nodeId || f.sgId === nodeId || f.naclId === nodeId || f.roleId === nodeId)) ||
          (f.targetId === hoveredId && (f.sourceId === nodeId || f.sgId === nodeId || f.naclId === nodeId || f.roleId === nodeId)) ||
          (f.sgId === hoveredId && (f.sourceId === nodeId || f.targetId === nodeId || f.naclId === nodeId || f.roleId === nodeId)) ||
          (f.naclId === hoveredId && (f.sourceId === nodeId || f.targetId === nodeId || f.sgId === nodeId || f.roleId === nodeId)) ||
          (f.roleId === hoveredId && (f.sourceId === nodeId || f.targetId === nodeId || f.sgId === nodeId || f.naclId === nodeId))
      )
    },
    [hoveredId, architecture]
  )

  if (!path || !architecture) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <p className="text-sm">No path selected</p>
      </div>
    )
  }

  // Count columns that have content (for dynamic grid)
  const hasComputes = computes.length > 0
  const hasIdentities = identities.length > 0
  const hasPivots = pivots.length > 0

  // Fullscreen escapes the parent layout — fixed-position overlay covers viewport
  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 flex flex-col overflow-auto"
    : "flex-1 flex flex-col overflow-auto"

  return (
    <div className={containerClass} style={{ background: "rgba(2, 6, 23, 0.95)" }}>
      {/* ── Path header bar ── */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-2 border-b"
        style={{ background: "rgba(15, 23, 42, 0.95)", borderColor: "rgba(148, 163, 184, 0.15)" }}
      >
        <div className="flex items-center gap-3">
          <SeverityBadge severity={path.severity?.severity ?? "LOW"} score={path.severity?.overall_score} />
          <span className="text-xs text-slate-400">
            {path.hop_count ?? path.nodes?.length ?? 0} hops &middot; {path.evidence_type ?? "configured"}
          </span>
          {path.path_kind && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700/50 text-slate-300">
              {path.path_kind}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 rounded bg-green-500" />
            <span className="text-[10px] text-slate-500">Observed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 rounded border-t border-dashed border-slate-500" />
            <span className="text-[10px] text-slate-500">Configured</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] text-slate-500">Internet Exposed</span>
          </div>
          {/* Fullscreen toggle — same pattern as the system map graph-view-v2.
              Pops the attack graph into a fixed-position overlay covering the
              entire viewport so the user can see the full diagram without the
              sidebar / jewel-list / score-hero stealing space. Esc to close. */}
          <button
            onClick={() => setIsFullscreen((v) => !v)}
            className="ml-1 p-1.5 bg-slate-700 rounded hover:bg-slate-600 transition-colors"
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen attack graph"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-white" /> : <Maximize2 className="w-3.5 h-3.5 text-white" />}
          </button>
          {isFullscreen && (
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-1.5 bg-red-600 rounded hover:bg-red-700 transition-colors"
              title="Close fullscreen (Esc)"
            >
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* ── Lateral Movement Diagram ── */}
      <div className="flex-1 p-6">
        <div className="relative bg-slate-900/50 rounded-2xl border border-slate-700 p-6 overflow-hidden">
          {/* Stats header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                <Target className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Lateral Movement Path</h3>
                <p className="text-xs text-slate-400">
                  Entry → Compute → Identity → Pivot → Crown Jewel
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {architecture.totalBytes > 0 && (
                <div className="text-center px-3">
                  <div className="text-emerald-400 font-bold">{formatBytes(architecture.totalBytes)}</div>
                  <div className="text-[10px] text-slate-500">Traffic</div>
                </div>
              )}
              {architecture.totalConnections > 0 ? (
                <div className="text-center px-3 border-l border-slate-700">
                  <div className="text-blue-400 font-bold">{architecture.totalConnections}</div>
                  <div className="text-[10px] text-slate-500">Connections</div>
                </div>
              ) : (
                <div
                  className="text-center px-3 border-l border-slate-700"
                  title="Path inferred from configuration. No CloudTrail / VPC Flow Log signals on these edges in the observation window."
                >
                  <div className="text-slate-500 font-bold">—</div>
                  <div className="text-[10px] text-slate-500">no observed signals</div>
                </div>
              )}
              {architecture.totalGaps > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 rounded-lg border-l border-slate-700">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-amber-400 font-bold">{architecture.totalGaps}</div>
                    <div className="text-[10px] text-slate-500">Gaps</div>
                  </div>
                </div>
              )}
              {/* Phase 1: Damage Capability tile — concrete impact at end of path */}
              {path?.damage_capability?.state === "live" && (path.damage_capability.total_allowed_actions ?? 0) > 0 && (
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-l border-slate-700 ${
                    path.damage_capability.destructive_capable
                      ? "bg-red-500/20 ring-1 ring-red-500/30"
                      : "bg-slate-700/30"
                  }`}
                  title={
                    `Role: ${path.damage_capability.role_name}\n` +
                    `Allowed actions: ${path.damage_capability.total_allowed_actions}\n` +
                    `${path.damage_capability.summary ?? ""}\n` +
                    (path.damage_capability.reachable_services
                      ? "\nReachable: " + Object.entries(path.damage_capability.reachable_services).slice(0, 6).map(([k, v]) => `${v} ${k}`).join(", ")
                      : "")
                  }
                >
                  <Crown className={`w-4 h-4 ${path.damage_capability.destructive_capable ? "text-red-400" : "text-slate-400"}`} />
                  <div>
                    <div className={`font-bold text-sm ${path.damage_capability.destructive_capable ? "text-red-300" : "text-slate-300"}`}>
                      {(path.damage_capability.verbs?.read ?? 0) > 0 && `R${path.damage_capability.verbs?.read ?? 0}`}
                      {(path.damage_capability.verbs?.write ?? 0) > 0 && ` W${path.damage_capability.verbs?.write ?? 0}`}
                      {(path.damage_capability.verbs?.delete ?? 0) > 0 && ` D${path.damage_capability.verbs?.delete ?? 0}`}
                      {(path.damage_capability.verbs?.admin ?? 0) > 0 && ` A${path.damage_capability.verbs?.admin ?? 0}`}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {path.damage_capability.destructive_capable ? "Damage capability" : "Read-only impact"}
                    </div>
                  </div>
                </div>
              )}
              {/* Phase 0: path_kind_tag badge — identity / network / hybrid */}
              {path?.path_kind_tag && path.path_kind_tag !== "configured" && (
                <div
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide border-l border-slate-700 ${
                    path.path_kind_tag === "hybrid"
                      ? "text-purple-300 bg-purple-500/10"
                      : path.path_kind_tag === "network"
                      ? "text-cyan-300 bg-cyan-500/10"
                      : "text-blue-300 bg-blue-500/10"
                  }`}
                  title={
                    path.path_kind_tag === "hybrid"
                      ? "Hybrid path: combines identity (CloudTrail) and network (VPC Flow Logs) telemetry"
                      : path.path_kind_tag === "network"
                      ? "Network-only path: built from VPC Flow Logs / SG / NACL evidence — no identity events on this path"
                      : "Identity path: principal / role / API call evidence"
                  }
                >
                  {path.path_kind_tag}
                </div>
              )}
            </div>
          </div>

          {/* Main 5-column diagram: Entry | Compute | Identity | Pivot | Crown Jewels */}
          <div ref={containerRef} className="relative min-h-[400px]">
            <ConnectionLinesSVG
              architecture={architecture}
              hoveredId={hoveredId}
              containerRef={containerRef as React.RefObject<HTMLDivElement>}
              animate={true}
            />

            <div
              className={`relative grid gap-6 items-start`}
              style={{
                zIndex: 2,
                gridTemplateColumns: `1fr ${hasComputes ? "auto" : ""} ${hasIdentities ? "auto" : ""} ${hasPivots ? "auto" : ""} 1fr`,
              }}
            >
              {/* ── ENTRY POINTS ── */}
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-red-400" />
                  Entry Points ({entries.length})
                </div>
                {entries.map((node) => {
                  // Look up the original PathNodeDetail to get ip_metadata
                  // (org / country / asn) — backend attaches this for
                  // NetworkEndpoint nodes via _enrich_network_endpoint_node.
                  const original = path.nodes?.find((n) => n.id === node.id) as any
                  const ipMeta = original?.ip_metadata as
                    | { kind?: string; org?: string; isp?: string; asn?: string; country?: string; country_name?: string; city?: string; aws?: { service?: string; region?: string } }
                    | undefined
                  return (
                    <div key={node.id} data-compute-id={node.id} className="relative">
                      {node.type === "principal" && (
                        <div className="absolute -left-1 -top-1 w-3 h-3 rounded-full bg-red-500 animate-pulse z-10" />
                      )}
                      <ServiceNodeBox
                        node={node}
                        position="left"
                        flowInfo={entryFlowInfo.get(node.id)}
                        isHighlighted={isNodeHighlighted(node.id)}
                        onHover={setHoveredId}
                        onClick={() => onNodeClick(node.id)}
                      />
                      {/* IP metadata badge — renders directly under the
                          NetworkEndpoint card so the CISO sees the org name
                          inline ("ASIERA TECHNOLOGY · IE") instead of just
                          the bare IP. Per the CISO ask "I need to understand
                          what services it is, what the name of the service". */}
                      {ipMeta && (ipMeta.org || ipMeta.country || ipMeta.aws) && (
                        <div
                          className={`mt-1 px-2 py-1 rounded text-[10px] flex items-center gap-1.5 border ${
                            ipMeta.aws
                              ? "bg-orange-500/10 border-orange-500/30 text-orange-200"
                              : "bg-slate-800/60 border-slate-700 text-slate-300"
                          }`}
                          title={[
                            ipMeta.aws ? `AWS ${ipMeta.aws.service} in ${ipMeta.aws.region}` : "",
                            ipMeta.org,
                            ipMeta.country_name || ipMeta.country,
                            ipMeta.city,
                            ipMeta.asn,
                          ].filter(Boolean).join(" · ")}
                        >
                          {ipMeta.aws ? (
                            <>
                              <Globe className="w-2.5 h-2.5 shrink-0" />
                              <span className="font-semibold">AWS {ipMeta.aws.service}</span>
                              {ipMeta.aws.region && ipMeta.aws.region !== "GLOBAL" && (
                                <span className="opacity-70">· {ipMeta.aws.region}</span>
                              )}
                            </>
                          ) : (
                            <>
                              <Globe className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                              <span className="truncate flex-1 max-w-[140px]">{ipMeta.org || "external"}</span>
                              {ipMeta.country && (
                                <span className="text-slate-500 shrink-0">· {ipMeta.country}</span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {original?.infra_context && (
                        <InfraContextChips ctx={original.infra_context} />
                      )}
                    </div>
                  )
                })}
                {entries.length === 0 && (
                  <div className="text-xs text-slate-500 italic p-4 text-center">No entry points</div>
                )}
              </div>

              {/* ── COMPUTE ── */}
              {hasComputes && (
                <div className="flex flex-col gap-3 min-w-[170px]">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Server className="w-4 h-4 text-blue-400" />
                    Compute ({computes.length})
                  </div>
                  {computes.map((cp) => {
                    const sn: ServiceNode = { id: cp.id, name: cp.name, shortName: cp.shortName, type: cp.type as NodeType }
                    const nodeBadges = badgeMap.get(cp.id) ?? []
                    const original = path.nodes?.find((n) => n.id === cp.id) as any
                    return (
                      <div key={cp.id} data-sg-id={cp.id} className="flex flex-col gap-1.5">
                        <ComputeNodeCard
                          node={sn}
                          badges={nodeBadges}
                          isHighlighted={isNodeHighlighted(cp.id)}
                          onHover={setHoveredId}
                          onClick={() => onNodeClick(cp.id)}
                          onBadgeClick={(badgeId) => onNodeClick(badgeId)}
                          flowInfo={computeFlowInfo.get(cp.id)}
                        />
                        {original?.infra_context && (
                          <InfraContextChips ctx={original.infra_context} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── IDENTITY (IAM) ── */}
              {hasIdentities && (
                <div className="flex flex-col gap-3 items-center">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-pink-400" />
                    Identity ({identities.length})
                  </div>
                  {identities.map((role) => {
                    // Match this role's reachable_neighbors so we can render
                    // "also touches X tables, Y lambdas..." chips inline under
                    // the role card. Visualizes "more services in the flow"
                    // without the operator having to scroll down.
                    const roleNeighbors = path.reachable_neighbors?.find(
                      (rn) => rn.role_id === role.id
                    )
                    const original = path.nodes?.find((n) => n.id === role.id) as any
                    return (
                      <div key={role.id} data-nacl-id={role.id} className="flex flex-col gap-1.5">
                        <IAMRoleNode
                          role={role}
                          isHighlighted={isNodeHighlighted(role.id)}
                          onHover={setHoveredId}
                          onClick={() => onNodeClick(role.id)}
                        />
                        {original?.infra_context && (
                          <InfraContextChips ctx={original.infra_context} />
                        )}
                        {roleNeighbors && roleNeighbors.neighbors.length > 0 && (
                          <ReachableInlineChips role={role} neighbors={roleNeighbors} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── PIVOT SERVICES ── */}
              {hasPivots && (
                <div className="flex flex-col gap-3 items-center">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-400" />
                    Pivot Services ({pivots.length})
                  </div>
                  {pivots.map((cp) => {
                    const sn: ServiceNode = { id: cp.id, name: cp.name, shortName: cp.shortName, type: cp.type as NodeType }
                    return (
                      <div key={cp.id} data-role-id={cp.id}>
                        <PivotServiceCard
                          node={sn}
                          isHighlighted={isNodeHighlighted(cp.id)}
                          onHover={setHoveredId}
                          onClick={() => onNodeClick(cp.id)}
                        />
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── CROWN JEWELS ── */}
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-400" />
                  Crown Jewels ({jewels.length})
                </div>
                {jewels.map((node) => {
                  const original = path.nodes?.find((n) => n.id === node.id) as any
                  return (
                    <div key={node.id} data-resource-id={node.id} className="flex flex-col gap-1.5">
                      <div className="relative">
                        <div className="absolute inset-0 rounded-xl pointer-events-none ring-2 ring-red-500/50 animate-pulse" />
                        <ServiceNodeBox
                          node={node}
                          position="right"
                          flowInfo={jewelFlowInfo.get(node.id)}
                          isHighlighted={isNodeHighlighted(node.id)}
                          onHover={setHoveredId}
                          onClick={() => onNodeClick(node.id)}
                        />
                      </div>
                      {original?.infra_context && (
                        <InfraContextChips ctx={original.infra_context} />
                      )}
                    </div>
                  )
                })}
                {jewels.length === 0 && (
                  <div className="text-xs text-slate-500 italic p-4 text-center">No targets</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Reachable Services — "more services in the flow" ── */}
      {path.reachable_neighbors && path.reachable_neighbors.length > 0 && (
        <ReachableServicesSection neighbors={path.reachable_neighbors} />
      )}

      {/* ── Risk Reduction Footer ── */}
      {path.risk_reduction && (
        <div
          className="sticky bottom-0 z-20 px-4 py-2.5 border-t"
          style={{ background: "rgba(15, 23, 42, 0.97)", borderColor: "rgba(148, 163, 184, 0.12)" }}
        >
          <RiskReductionBar riskReduction={path.risk_reduction} />
        </div>
      )}
    </div>
  )
}

// ── Reachable Services section ──────────────────────────────────────
// Per the CISO ask: "I want to see all the services in the flow." For each
// IAM role on the path, list the OTHER resources the role touches that
// aren't on the BFS path. Collapsed by default, click to expand per role.
// Shared icon mapper — used by both ReachableInlineChips and ReachableServicesSection
function reachableTypeIcon(t: string) {
  const lt = (t || "").toLowerCase()
  if (lt.includes("s3")) return <Database className="w-3 h-3 text-emerald-400" />
  if (lt.includes("dynamo")) return <Database className="w-3 h-3 text-cyan-400" />
  if (lt.includes("lambda")) return <Zap className="w-3 h-3 text-amber-400" />
  if (lt.includes("ec2")) return <Server className="w-3 h-3 text-blue-400" />
  if (lt.includes("rds") || lt.includes("aurora") || lt.includes("redshift")) return <Database className="w-3 h-3 text-violet-400" />
  if (lt.includes("kms")) return <Key className="w-3 h-3 text-amber-300" />
  if (lt.includes("secret")) return <Lock className="w-3 h-3 text-rose-400" />
  return <Server className="w-3 h-3 text-slate-400" />
}

// ── InfraContextChips ────────────────────────────────────────────────
// Per CISO ask "I want to see all the services in each path" — for each
// node on the path, render its 1-hop infrastructure neighbors (VPC,
// Subnet, SG, NACL, IAM role, KMS, ALB, log groups, etc.) as compact
// chips directly under the node card. Discovers neighbors from the
// backend infra_context field that comes off PathNodeDetail.
function InfraContextChips({ ctx }: { ctx: NonNullable<PathNodeDetail["infra_context"]> }) {
  // Bucket order — operational priority: identity → network → data → infra
  const groups: Array<{ key: keyof typeof ctx; label: string; color: string; icon: React.ReactNode }> = [
    { key: "iam_roles",         label: "IAM",     color: "purple",  icon: <UserCheck className="w-2.5 h-2.5" /> },
    { key: "iam_policies",      label: "Policy",  color: "purple",  icon: <Lock className="w-2.5 h-2.5" /> },
    { key: "instance_profiles", label: "Profile", color: "purple",  icon: <Key className="w-2.5 h-2.5" /> },
    { key: "security_groups",   label: "SG",      color: "orange",  icon: <Shield className="w-2.5 h-2.5" /> },
    { key: "nacls",             label: "NACL",    color: "orange",  icon: <Shield className="w-2.5 h-2.5" /> },
    { key: "vpcs",              label: "VPC",     color: "cyan",    icon: <Globe className="w-2.5 h-2.5" /> },
    { key: "subnets",           label: "Subnet",  color: "cyan",    icon: <Globe className="w-2.5 h-2.5" /> },
    { key: "load_balancers",    label: "LB",      color: "blue",    icon: <Server className="w-2.5 h-2.5" /> },
    { key: "target_groups",     label: "TG",      color: "blue",    icon: <Server className="w-2.5 h-2.5" /> },
    { key: "kms_keys",          label: "KMS",     color: "amber",   icon: <Key className="w-2.5 h-2.5" /> },
    { key: "bucket_policies",   label: "Policy",  color: "emerald", icon: <Lock className="w-2.5 h-2.5" /> },
    { key: "log_groups",        label: "Logs",    color: "slate",   icon: <Database className="w-2.5 h-2.5" /> },
    { key: "monitors",          label: "Monitor", color: "slate",   icon: <AlertTriangle className="w-2.5 h-2.5" /> },
  ]
  const colorClasses: Record<string, string> = {
    purple:  "bg-purple-500/10 border-purple-500/30 text-purple-200",
    orange:  "bg-orange-500/10 border-orange-500/30 text-orange-200",
    cyan:    "bg-cyan-500/10 border-cyan-500/30 text-cyan-200",
    blue:    "bg-blue-500/10 border-blue-500/30 text-blue-200",
    amber:   "bg-amber-500/10 border-amber-500/30 text-amber-200",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-200",
    slate:   "bg-slate-700/40 border-slate-600 text-slate-300",
  }

  const allChips: { label: string; name: string; color: string; icon: React.ReactNode; tooltip: string }[] = []
  for (const g of groups) {
    const items = (ctx[g.key] as Array<{ id: string; name: string; type: string; edge_type: string }> | undefined) ?? []
    for (const item of items) {
      allChips.push({
        label: g.label,
        name: item.name,
        color: g.color,
        icon: g.icon,
        tooltip: `${item.type} · ${item.name}\nlinked via ${item.edge_type}`,
      })
    }
  }
  if (allChips.length === 0) return null

  const TOP_N = 6
  const visible = allChips.slice(0, TOP_N)
  const remaining = allChips.length - visible.length
  return (
    <div className="rounded border border-slate-700/50 bg-slate-900/40 p-1 max-w-[210px]">
      <div className="text-[8px] uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
        <span>related</span>
        <span className="text-slate-400 font-bold tabular-nums">{allChips.length}</span>
      </div>
      <div className="flex flex-wrap gap-0.5">
        {visible.map((c, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] border ${colorClasses[c.color]}`}
            title={c.tooltip}
          >
            {c.icon}
            <span className="font-semibold">{c.label}</span>
            <span className="opacity-80 max-w-[80px] truncate">{c.name}</span>
          </span>
        ))}
        {remaining > 0 && (
          <span className="text-[9px] text-slate-500 px-1 py-0.5">+{remaining}</span>
        )}
      </div>
    </div>
  )
}

// ── ReachableInlineChips ────────────────────────────────────────────
// Renders DIRECTLY UNDER each IAM role node in the Identity lane so the
// "more services in this flow" view is visible without scrolling. Per
// the CISO ask "why do I see only 3-4 services in every attack path?" —
// this surfaces the role's reachable_neighbors right inside the diagram.
function ReachableInlineChips({
  role,
  neighbors,
}: {
  role: SecurityCheckpoint
  neighbors: NonNullable<IdentityAttackPath["reachable_neighbors"]>[number]
}) {
  const TOP_N = 8
  const visible = neighbors.neighbors.slice(0, TOP_N)
  const remaining = neighbors.neighbors.length - visible.length
  return (
    <div
      className="rounded-md border border-slate-700/50 bg-slate-900/40 p-1.5 max-w-[210px]"
      title={`${role.name} also reaches ${neighbors.neighbor_count} other resource${neighbors.neighbor_count === 1 ? "" : "s"} via observed CloudTrail / API calls`}
    >
      <div className="text-[8px] uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
        <span>+ also reaches</span>
        <span className="text-amber-400 font-bold tabular-nums">{neighbors.neighbor_count}</span>
      </div>
      <div className="flex flex-wrap gap-0.5">
        {visible.map((n) => (
          <span
            key={n.id}
            className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] border ${
              n.is_internet_exposed
                ? "bg-rose-500/15 border-rose-500/30 text-rose-200"
                : "bg-slate-800/60 border-slate-700 text-slate-300"
            }`}
            title={`${n.type} · ${n.name} · ${n.edge_count}× edges (${n.edge_types.join(", ")})${n.is_internet_exposed ? "\n⚠ Internet-exposed" : ""}`}
          >
            {reachableTypeIcon(n.type)}
            <span className="max-w-[80px] truncate">{n.name}</span>
            <span className="text-slate-500 tabular-nums">{n.edge_count}×</span>
          </span>
        ))}
        {remaining > 0 && (
          <span className="text-[9px] text-slate-500 px-1 py-0.5">+{remaining}</span>
        )}
      </div>
    </div>
  )
}

function ReachableServicesSection({ neighbors }: { neighbors: NonNullable<IdentityAttackPath["reachable_neighbors"]> }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const typeIcon = reachableTypeIcon

  return (
    <div
      className="px-4 py-2 border-t"
      style={{ background: "rgba(15, 23, 42, 0.85)", borderColor: "rgba(148, 163, 184, 0.12)" }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Crown className="w-3 h-3 text-amber-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-200">
          More services in this flow
        </span>
        <span className="text-[10px] text-slate-500">
          · {neighbors.length} role{neighbors.length === 1 ? "" : "s"} reach {neighbors.reduce((s, r) => s + r.neighbor_count, 0)} other service{neighbors.reduce((s, r) => s + r.neighbor_count, 0) === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-1.5">
        {neighbors.map((roleN) => {
          const isOpen = !!expanded[roleN.role_id]
          const truncated = roleN.neighbor_count > roleN.neighbors_returned
          return (
            <div
              key={roleN.role_id}
              className="rounded border border-slate-700/60 bg-slate-900/40"
            >
              <button
                onClick={() => setExpanded((s) => ({ ...s, [roleN.role_id]: !isOpen }))}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-800/60 transition-colors rounded-t"
              >
                <UserCheck className="w-3 h-3 text-purple-300" />
                <span className="text-[11px] font-semibold text-slate-200 truncate">
                  {roleN.role_name ?? roleN.role_id}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {Object.entries(roleN.by_type).slice(0, 4).map(([t, c]) => (
                    <span key={t} className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300">
                      {typeIcon(t)}
                      <span className="font-bold tabular-nums">{c}</span>
                      <span className="opacity-70">{t}</span>
                    </span>
                  ))}
                  {Object.keys(roleN.by_type).length > 4 && (
                    <span className="text-[9px] text-slate-500">+{Object.keys(roleN.by_type).length - 4} types</span>
                  )}
                  <span className="text-[9px] text-slate-500">
                    {isOpen ? "▾" : "▸"}
                  </span>
                </div>
              </button>
              {isOpen && (
                <div className="px-2 pb-2 pt-0">
                  <div className="grid grid-cols-2 gap-1">
                    {roleN.neighbors.map((n) => (
                      <div
                        key={n.id}
                        className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] ${
                          n.is_internet_exposed ? "bg-rose-500/10 ring-1 ring-rose-500/30" : "bg-slate-800/50"
                        }`}
                        title={`${n.type} · ${n.edge_count} edge${n.edge_count === 1 ? "" : "s"} · ${n.edge_types.join(", ")}`}
                      >
                        {typeIcon(n.type)}
                        <span className="text-slate-300 truncate flex-1">{n.name}</span>
                        <span className="text-slate-500 tabular-nums shrink-0">{n.edge_count}×</span>
                        {n.is_internet_exposed && <Globe className="w-2.5 h-2.5 text-rose-400" />}
                      </div>
                    ))}
                  </div>
                  {truncated && (
                    <div className="mt-1.5 text-[9px] text-slate-500 italic">
                      Showing {roleN.neighbors_returned} of {roleN.neighbor_count} reachable resources (top by edge count)
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
