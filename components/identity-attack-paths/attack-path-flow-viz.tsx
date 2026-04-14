"use client"

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react"
import {
  Server, Shield, Lock, Key, Database, Zap, Globe,
  AlertTriangle, Crown, HardDrive, Target,
} from "lucide-react"
import { SeverityBadge } from "./severity-badge"
import type { IdentityAttackPath, PathNodeDetail, PathEdgeDetail, RiskReduction } from "./types"
import {
  ServiceNodeBox,
  SecurityGroupPanel,
  NACLNode,
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

// ── Helpers ─────────────────────────────────────────────────────────
function mapNodeType(type: string): NodeType {
  const t = (type ?? "").toLowerCase()
  if (t === "ec2" || t === "ec2instance") return "compute"
  if (t === "lambdafunction" || t === "lambda") return "lambda"
  if (t === "rdsinstance" || t === "rds" || t.includes("database")) return "database"
  if (t === "s3bucket" || t === "s3" || t.includes("bucket")) return "storage"
  if (t.includes("dynamodb")) return "dynamodb"
  if (t.includes("sqs")) return "sqs"
  if (t.includes("sns")) return "sns"
  if (t.includes("kms") || t.includes("secret")) return "storage"
  if (t.includes("cloudtrailprincipal") || t.includes("awsprincipal")) return "principal"
  if (t.includes("iam") || t.includes("role")) return "iam_role"
  if (t.includes("instanceprofile")) return "iam_role"
  if (t.includes("security") || t.includes("sg")) return "security_group"
  if (t.includes("nacl")) return "nacl"
  return "network"
}

function shortName(name: string, maxLen = 20): string {
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

// ── Transform attack path data → SystemArchitecture ─────────────────
function buildArchitectureFromPath(path: IdentityAttackPath): SystemArchitecture {
  const nodes = path.nodes ?? []
  const edges = path.edges ?? []

  const computeServices: ServiceNode[] = []
  const resources: ServiceNode[] = []
  const securityGroups: SecurityCheckpoint[] = []
  const nacls: SecurityCheckpoint[] = []
  const iamRoles: SecurityCheckpoint[] = []
  const flows: TrafficFlow[] = []

  const seenIds = new Set<string>()

  for (const node of nodes) {
    if (seenIds.has(node.id)) continue
    seenIds.add(node.id)

    const lane = node.lane ?? ""
    const nodeType = mapNodeType(node.type ?? "")
    const sName = shortName(node.name ?? node.id)

    if (lane === "compute" || nodeType === "compute" || nodeType === "lambda") {
      computeServices.push({
        id: node.id,
        name: node.name ?? node.id,
        shortName: sName,
        type: nodeType,
        instanceId: node.type === "EC2Instance" ? node.id : undefined,
      })
    } else if (lane === "security_group" || nodeType === "security_group") {
      const inbound = node.rules?.inbound_count ?? 0
      const outbound = node.rules?.outbound_count ?? 0
      securityGroups.push({
        id: node.id,
        type: "security_group",
        name: node.name ?? node.id,
        shortName: sName,
        usedCount: inbound,
        totalCount: inbound + outbound,
        gapCount: node.gap_count ?? 0,
        connectedSources: [],
        connectedTargets: [],
        rules: (node.open_ports ?? []).map((port: number) => ({
          direction: "ingress" as const,
          protocol: "TCP",
          fromPort: port,
          toPort: port,
          portDisplay: `TCP/${port}`,
          source: node.rules?.open_to_internet ? "0.0.0.0/0" : "10.0.0.0/8",
          sourceType: "cidr" as const,
          status: (node.unused_ports ?? []).includes(port) ? ("unused" as const) : ("used" as const),
          flowCount: 0,
          lastSeen: null,
          isPublic: node.rules?.open_to_internet ?? false,
        })),
      })
    } else if (lane === "nacl" || nodeType === "nacl") {
      nacls.push({
        id: node.id,
        type: "nacl",
        name: node.name ?? node.id,
        shortName: sName,
        usedCount: node.rules?.inbound_count ?? 0,
        totalCount: (node.rules?.inbound_count ?? 0) + (node.rules?.outbound_count ?? 0),
        gapCount: node.gap_count ?? 0,
        connectedSources: [],
        connectedTargets: [],
      })
    } else if (
      lane === "iam" ||
      nodeType === "iam_role" ||
      node.type === "CloudTrailPrincipal" ||
      node.type === "AWSPrincipal" ||
      node.type === "InstanceProfile"
    ) {
      const totalPerms = node.permissions?.total ?? 0
      const usedPerms = node.permissions?.used ?? 0
      iamRoles.push({
        id: node.id,
        type: "iam_role",
        name: node.name ?? node.id,
        shortName: sName,
        usedCount: usedPerms,
        totalCount: totalPerms,
        gapCount: node.permissions?.unused ?? node.gap_count ?? 0,
        connectedSources: [],
        connectedTargets: [],
      })
    } else if (lane === "crown_jewel" || lane === "entry") {
      resources.push({
        id: node.id,
        name: node.name ?? node.id,
        shortName: sName,
        type: nodeType === "principal" ? "principal" : nodeType,
      })
    } else {
      // Default: if it looks like data, put in resources; else compute
      if (["database", "storage", "dynamodb", "sqs", "sns"].includes(nodeType)) {
        resources.push({
          id: node.id,
          name: node.name ?? node.id,
          shortName: sName,
          type: nodeType,
        })
      } else {
        computeServices.push({
          id: node.id,
          name: node.name ?? node.id,
          shortName: sName,
          type: nodeType,
        })
      }
    }
  }

  // Build flows from edges
  let totalBytes = 0
  let totalConnections = 0

  for (const edge of edges) {
    const bytes = edge.traffic_bytes ?? 0
    const connections = edge.hit_count ?? 1
    totalBytes += bytes
    totalConnections += connections

    // Find which SG/NACL/Role this flow passes through
    const sgId = securityGroups.length > 0 ? securityGroups[0].id : undefined
    const naclId = nacls.length > 0 ? nacls[0].id : undefined
    const roleId = iamRoles.length > 0 ? iamRoles[0].id : undefined

    flows.push({
      sourceId: edge.source,
      targetId: edge.target,
      sgId,
      naclId,
      roleId,
      ports: edge.port ? [String(edge.port)] : [],
      protocol: edge.protocol ?? "TCP",
      bytes,
      connections,
      isActive: edge.is_observed,
    })
  }

  // Wire up connections
  for (const sg of securityGroups) {
    sg.connectedSources = computeServices.map((c) => c.id)
    sg.connectedTargets = nacls.map((n) => n.id)
  }
  for (const nacl of nacls) {
    nacl.connectedSources = securityGroups.map((sg) => sg.id)
    nacl.connectedTargets = iamRoles.map((r) => r.id)
  }
  for (const role of iamRoles) {
    role.connectedSources = nacls.length > 0 ? nacls.map((n) => n.id) : computeServices.map((c) => c.id)
    role.connectedTargets = resources.map((r) => r.id)
  }

  return {
    computeServices,
    resources,
    securityGroups,
    nacls,
    iamRoles,
    flows,
    totalBytes,
    totalConnections,
    totalGaps: iamRoles.reduce((s, r) => s + r.gapCount, 0) + securityGroups.reduce((s, sg) => s + sg.gapCount, 0),
  }
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
  const [expandedSG, setExpandedSG] = useState<string | null>(null)

  const path = paths?.[selectedPathIndex] ?? null

  const architecture = useMemo(() => {
    if (!path) return null
    return buildArchitectureFromPath(path)
  }, [path])

  // Build flow info per compute node
  const computeFlowInfo = useMemo(() => {
    const map = new Map<string, { bytes: number; connections: number; ports: string[] }>()
    if (!architecture) return map
    for (const flow of architecture.flows) {
      const existing = map.get(flow.sourceId) ?? { bytes: 0, connections: 0, ports: [] }
      existing.bytes += flow.bytes
      existing.connections += flow.connections
      existing.ports.push(...flow.ports)
      map.set(flow.sourceId, existing)
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
          (f.sourceId === hoveredId && f.targetId === nodeId) ||
          (f.targetId === hoveredId && f.sourceId === nodeId) ||
          (f.sgId === hoveredId && (f.sourceId === nodeId || f.targetId === nodeId)) ||
          (f.naclId === hoveredId && (f.sourceId === nodeId || f.targetId === nodeId)) ||
          (f.roleId === hoveredId && (f.sourceId === nodeId || f.targetId === nodeId)) ||
          (f.sgId === nodeId && (f.sourceId === hoveredId || f.targetId === hoveredId)) ||
          (f.naclId === nodeId && (f.sourceId === hoveredId || f.targetId === hoveredId)) ||
          (f.roleId === nodeId && (f.sourceId === hoveredId || f.targetId === hoveredId))
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

  return (
    <div className="flex-1 flex flex-col overflow-auto" style={{ background: "rgba(2, 6, 23, 0.95)" }}>
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
        </div>
      </div>

      {/* ── Architecture diagram (same layout as System Map) ── */}
      <div className="flex-1 p-6">
        <div className="relative bg-slate-900/50 rounded-2xl border border-slate-700 p-6 overflow-hidden">
          {/* Stats header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                <Target className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Attack Path Infrastructure</h3>
                <p className="text-xs text-slate-400">
                  Full path from entry to crown jewel
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
              <div className="text-center px-3 border-l border-slate-700">
                <div className="text-blue-400 font-bold">{architecture.totalConnections}</div>
                <div className="text-[10px] text-slate-500">Connections</div>
              </div>
              {architecture.totalGaps > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 rounded-lg border-l border-slate-700">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-amber-400 font-bold">{architecture.totalGaps}</div>
                    <div className="text-[10px] text-slate-500">Gaps</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main diagram */}
          <div ref={containerRef} className="relative min-h-[400px]">
            <ConnectionLinesSVG
              architecture={architecture}
              hoveredId={hoveredId}
              containerRef={containerRef as React.RefObject<HTMLDivElement>}
              animate={true}
            />

            <div className="relative grid grid-cols-[1fr_auto_auto_1fr] gap-6 items-start" style={{ zIndex: 2 }}>
              {/* COMPUTE */}
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-400" />
                  Compute ({architecture.computeServices.length})
                </div>
                {architecture.computeServices.map((node) => (
                  <div key={node.id} data-compute-id={node.id} className="relative">
                    <ServiceNodeBox
                      node={node}
                      position="left"
                      flowInfo={computeFlowInfo.get(node.id)}
                      isHighlighted={isNodeHighlighted(node.id)}
                      onHover={setHoveredId}
                      onClick={() => onNodeClick(node.id)}
                    />
                  </div>
                ))}
                {architecture.computeServices.length === 0 && (
                  <div className="text-xs text-slate-500 italic p-4 text-center">No compute in path</div>
                )}
              </div>

              {/* SECURITY GROUPS */}
              <div className="flex flex-col gap-3 min-w-[180px]">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-orange-400" />
                  Security Groups ({architecture.securityGroups.length})
                </div>
                {architecture.securityGroups.map((sg) => (
                  <div key={sg.id} data-sg-id={sg.id}>
                    <SecurityGroupPanel
                      sg={sg}
                      isExpanded={expandedSG === sg.id}
                      onToggle={() => setExpandedSG(expandedSG === sg.id ? null : sg.id)}
                      isHighlighted={isNodeHighlighted(sg.id)}
                      onHover={setHoveredId}
                      onDetails={() => onNodeClick(sg.id)}
                    />
                  </div>
                ))}
                {architecture.securityGroups.length === 0 && (
                  <div className="text-xs text-slate-500 italic p-4 text-center">No SGs in path</div>
                )}
              </div>

              {/* NACLs */}
              <div className="flex flex-col gap-3 min-w-[140px]">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-cyan-400" />
                  NACLs ({architecture.nacls.length})
                </div>
                {architecture.nacls.map((nacl) => (
                  <div key={nacl.id} data-nacl-id={nacl.id}>
                    <NACLNode
                      nacl={nacl}
                      isHighlighted={isNodeHighlighted(nacl.id)}
                      onHover={setHoveredId}
                      onClick={() => onNodeClick(nacl.id)}
                    />
                  </div>
                ))}
                {architecture.nacls.length === 0 && (
                  <div className="text-xs text-slate-500 italic p-4 text-center">No NACLs</div>
                )}
              </div>

              {/* IAM ROLES */}
              <div className="flex flex-col gap-3 items-center">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Key className="w-4 h-4 text-pink-400" />
                  IAM Roles ({architecture.iamRoles.length})
                </div>
                {architecture.iamRoles.map((role) => (
                  <div key={role.id} data-role-id={role.id}>
                    <IAMRoleNode
                      role={role}
                      isHighlighted={isNodeHighlighted(role.id)}
                      onHover={setHoveredId}
                      onClick={() => onNodeClick(role.id)}
                    />
                  </div>
                ))}
                {architecture.iamRoles.length === 0 && (
                  <div className="text-xs text-slate-500 italic p-4 text-center">No Roles</div>
                )}
              </div>
            </div>

            {/* Resources row below */}
            <div className="mt-8 pt-6 border-t border-slate-700/50">
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Crown className="w-4 h-4 text-purple-400" />
                  Crown Jewels ({architecture.resources.length})
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {architecture.resources.map((node) => (
                    <div key={node.id} data-resource-id={node.id} className="relative">
                      <div className="absolute inset-0 rounded-xl pointer-events-none ring-2 ring-red-500/50 animate-pulse" />
                      <ServiceNodeBox
                        node={node}
                        position="right"
                        isHighlighted={isNodeHighlighted(node.id)}
                        onHover={setHoveredId}
                        onClick={() => onNodeClick(node.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
