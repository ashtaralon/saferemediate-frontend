"use client"

import { useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Braces,
  CheckCircle2,
  CloudCog,
  Database,
  Diamond,
  ExternalLink,
  Eye,
  Fingerprint,
  Layers3,
  Map as MapIcon,
  RadioTower,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type {
  DecisionRoutingSummary,
  FindingsSeveritySummary,
} from "./estate-enrichment"
import {
  buildEstateCommandModel,
  isTopologyNodeExposed,
  type EstateLens,
  type EstatePlane,
  type EstatePriority,
} from "./estate-operations-model"
import type { IamRoleRollup, TopologyNode, TopologyRiskResponse } from "./types"

const COLORS = {
  ink: "#E8EEF5",
  muted: "#8FA2B8",
  line: "#26384E",
  board: "#07111F",
  panel: "#0C192A",
  panelRaised: "#102136",
  teal: "#2DD4BF",
  red: "#FB7185",
  amber: "#FBBF24",
  blue: "#60A5FA",
  violet: "#A78BFA",
}

const LENSES: Array<{
  id: EstateLens
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: "operations", label: "Operate", description: "resources and live dependencies", icon: Activity },
  { id: "reliability", label: "Reliability", description: "placement, resilience, and stale state", icon: ShieldCheck },
  { id: "security", label: "Security", description: "exposure, privilege, and crown jewels", icon: Fingerprint },
  { id: "ownership", label: "Ownership", description: "scope, shared boundaries, and consumers", icon: Users },
]

const PLANE_STYLE: Record<EstatePlane["id"], { color: string; icon: React.ComponentType<{ className?: string }> }> = {
  edge: { color: COLORS.blue, icon: RadioTower },
  runtime: { color: COLORS.teal, icon: Server },
  data: { color: COLORS.violet, icon: Database },
  control: { color: COLORS.amber, icon: CloudCog },
}

const PRIORITY_STYLE: Record<EstatePriority["tone"], { color: string; background: string }> = {
  critical: { color: COLORS.red, background: "rgba(251, 113, 133, 0.08)" },
  warning: { color: COLORS.amber, background: "rgba(251, 191, 36, 0.08)" },
  info: { color: COLORS.blue, background: "rgba(96, 165, 250, 0.08)" },
}

function scoreColor(node: TopologyNode): string {
  if (node.stale) return "#64748B"
  if (node.score?.tier === "WORST" || node.score?.tier === "HIGH") return COLORS.red
  if (node.score?.tier === "ELEVATED") return COLORS.amber
  return COLORS.teal
}

function resourceMeta(
  node: TopologyNode,
  lens: EstateLens,
  connections: number,
  azCount: number,
): string {
  if (node.stale) return `stale · ${node.stale.reason}`
  if (lens === "reliability") {
    if (azCount > 1) return `${azCount} AZs · ${connections} relationships`
    if (azCount === 1) return `1 AZ observed · ${connections} relationships`
    return `${node.subnet_id ? "AZ unknown" : "regional / managed"} · ${connections} relationships`
  }
  if (lens === "security") {
    const flags = [
      node.is_jewel ? "crown jewel" : null,
      isTopologyNodeExposed(node) ? "internet path" : null,
      node.score ? `risk ${node.score.value}` : "unscored",
    ].filter(Boolean)
    return flags.join(" · ")
  }
  if (lens === "ownership") {
    const owners = node.owner_systems?.length
      ? node.owner_systems.join(", ")
      : node.owner_system_name
    if (node.is_foreign || owners) return `shared${owners ? ` · ${owners}` : ""}`
    if ((node.foreign_consumer_system_count ?? 0) > 0) {
      return `${node.foreign_consumer_system_count} consumer systems`
    }
    return node.account_id ? `account ${node.account_id}` : "system scoped"
  }
  return `${node.type ?? "Resource"} · ${connections} relationship${connections === 1 ? "" : "s"}`
}

function ResourceRow({
  node,
  lens,
  selected,
  connections,
  azCount,
  onSelect,
}: {
  node: TopologyNode
  lens: EstateLens
  selected: boolean
  connections: number
  azCount: number
  onSelect: (id: string) => void
}) {
  const color = scoreColor(node)
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className="group w-full text-left px-3 py-2.5 border-b transition-colors last:border-b-0 hover:bg-white/[0.045]"
      style={{
        borderColor: COLORS.line,
        background: selected ? "rgba(45, 212, 191, 0.1)" : "transparent",
        boxShadow: selected ? `inset 3px 0 0 ${COLORS.teal}` : undefined,
      }}
      data-testid={`estate-command-resource-${node.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 10px ${color}70` }} />
        <span className="text-[12px] font-semibold truncate flex-1" style={{ color: COLORS.ink }} title={node.name}>
          {node.name}
        </span>
        {node.is_jewel ? <Diamond className="h-3.5 w-3.5 shrink-0" style={{ color: COLORS.violet }} /> : null}
        {node.is_foreign || node.owner_systems?.length ? (
          <Users className="h-3.5 w-3.5 shrink-0" style={{ color: COLORS.amber }} />
        ) : null}
        <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: COLORS.teal }} />
      </div>
      <div className="mt-1 pl-4 text-[10px] leading-snug truncate font-mono" style={{ color: COLORS.muted }}>
        {resourceMeta(node, lens, connections, azCount)}
      </div>
    </button>
  )
}

function PlaneColumn({
  plane,
  lens,
  selectedNodeId,
  onSelectNode,
  connectionsByNode,
  azCountByNode,
}: {
  plane: EstatePlane
  lens: EstateLens
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
  connectionsByNode: Map<string, number>
  azCountByNode: Map<string, number>
}) {
  const style = PLANE_STYLE[plane.id]
  const Icon = style.icon
  const visible = plane.nodes.slice(0, 8)
  return (
    <section className="min-w-[230px] flex-1 rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.line}`, background: COLORS.panel }}>
      <div className="px-3 py-3 border-b" style={{ borderColor: COLORS.line, borderTop: `3px solid ${style.color}` }}>
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg inline-flex items-center justify-center" style={{ background: `${style.color}18`, color: style.color }}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.15em] font-bold" style={{ color: COLORS.ink }}>{plane.label}</div>
            <div className="text-[10px] mt-0.5" style={{ color: COLORS.muted }}>{plane.purpose}</div>
          </div>
          <span className="ml-auto text-[11px] font-mono font-semibold" style={{ color: style.color }}>{plane.nodes.length}</span>
        </div>
      </div>
      <div className="min-h-[120px]">
        {visible.length ? visible.map(node => (
          <ResourceRow
            key={node.id}
            node={node}
            lens={lens}
            selected={selectedNodeId === node.id}
            connections={connectionsByNode.get(node.id) ?? 0}
            azCount={azCountByNode.get(node.id) ?? 0}
            onSelect={onSelectNode}
          />
        )) : (
          <div className="px-3 py-8 text-center text-[11px]" style={{ color: COLORS.muted }}>No resources in this plane</div>
        )}
      </div>
      {plane.nodes.length > visible.length ? (
        <div className="px-3 py-2 text-[10px] font-mono border-t" style={{ color: COLORS.muted, borderColor: COLORS.line }}>
          + {plane.nodes.length - visible.length} more in scope
        </div>
      ) : null}
    </section>
  )
}

function Stat({ label, value, detail, tone = COLORS.ink }: { label: string; value: string | number; detail: string; tone?: string }) {
  return (
    <div className="min-w-[140px] flex-1 px-4 py-3 border-r last:border-r-0" style={{ borderColor: COLORS.line }}>
      <div className="text-[9px] uppercase tracking-[0.17em] font-bold" style={{ color: COLORS.muted }}>{label}</div>
      <div className="text-[22px] font-semibold leading-none mt-2" style={{ color: tone }}>{value}</div>
      <div className="text-[10px] mt-1.5" style={{ color: COLORS.muted }}>{detail}</div>
    </div>
  )
}

function IdentityRow({ role, onSelect }: { role: IamRoleRollup; onSelect?: (name: string) => void }) {
  const risky = (role.gap_percentage ?? 0) >= 50
  return (
    <button
      type="button"
      disabled={!onSelect}
      onClick={() => onSelect?.(role.name)}
      className="text-left rounded-lg px-3 py-2.5 min-w-[210px] flex-1 transition-colors enabled:hover:bg-white/[0.045] disabled:cursor-default"
      style={{ border: `1px solid ${COLORS.line}`, background: COLORS.panelRaised }}
      data-testid={`estate-command-role-${role.name}`}
    >
      <div className="flex items-center gap-2">
        <Fingerprint className="h-3.5 w-3.5" style={{ color: risky ? COLORS.red : COLORS.teal }} />
        <span className="text-[11px] font-semibold truncate" style={{ color: COLORS.ink }}>{role.name}</span>
      </div>
      <div className="text-[10px] mt-1 font-mono" style={{ color: COLORS.muted }}>
        {role.gap_percentage != null
          ? `${Math.round(role.gap_percentage)}% gap · ${role.unused_actions}/${role.allowed_actions} unused`
          : role.correlation_state === "stale_rollup" ? "usage rollup recomputing" : "correlation pending"}
      </div>
    </button>
  )
}

export interface EstateSystemViewProps {
  data: TopologyRiskResponse
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
  onSelectRole?: (name: string) => void
  onShowNetwork: () => void
  onOpenTrafficMap?: () => void
  iapJewels?: CrownJewelSummary[]
  findingsSummary?: FindingsSeveritySummary | null
  decisionRouting?: DecisionRoutingSummary | null
}

export function EstateSystemView({
  data,
  selectedNodeId,
  onSelectNode,
  onSelectRole,
  onShowNetwork,
  onOpenTrafficMap,
  findingsSummary = null,
  decisionRouting = null,
}: EstateSystemViewProps) {
  const [lens, setLens] = useState<EstateLens>("operations")
  const model = useMemo(() => buildEstateCommandModel(data), [data])
  const posture = model.posture
  const activeLens = LENSES.find(item => item.id === lens) ?? LENSES[0]
  const priorities = model.priorities.filter(priority => priority.lenses.includes(lens)).slice(0, 4)
  const readyCuts = decisionRouting?.by_decision_total
    ? (decisionRouting.by_decision_total.AUTO_EXECUTE ?? 0) + (decisionRouting.by_decision_total.CANARY_FIRST ?? 0)
    : null

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: COLORS.board, border: `1px solid ${COLORS.line}`, color: COLORS.ink }}
      data-testid="topology-estate-system-view"
    >
      <header className="relative px-5 py-5 border-b overflow-hidden" style={{ borderColor: COLORS.line }}>
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, #36516f 1px, transparent 0)",
            backgroundSize: "22px 22px",
            maskImage: "linear-gradient(to right, black, transparent 75%)",
          }}
        />
        <div className="relative flex flex-col xl:flex-row xl:items-end justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.19em] font-bold" style={{ color: COLORS.teal }}>
              <Sparkles className="h-3.5 w-3.5" /> Estate command map
            </div>
            <h2 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.025em] mt-2" style={{ color: "#F8FAFC" }}>
              Understand what runs, what it depends on, and where to act.
            </h2>
            <p className="text-[12px] leading-relaxed mt-2 max-w-2xl" style={{ color: COLORS.muted }}>
              One live operating model for platform engineering, SRE, cloud architecture, and security. Every count and relationship comes from the scoped topology evidence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onOpenTrafficMap ? (
              <button type="button" onClick={onOpenTrafficMap} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold" style={{ color: COLORS.board, background: COLORS.teal }}>
                <Activity className="h-3.5 w-3.5" /> Live traffic
              </button>
            ) : null}
            <button type="button" onClick={onShowNetwork} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold" style={{ color: COLORS.ink, border: `1px solid ${COLORS.line}`, background: COLORS.panel }}>
              <MapIcon className="h-3.5 w-3.5" /> Network placement
            </button>
          </div>
        </div>
      </header>

      <div className="flex overflow-x-auto border-b" style={{ borderColor: COLORS.line, background: "#091625" }}>
        <Stat label="Live estate" value={posture.activeResources} detail={`${posture.relationships} observed relationships`} />
        <Stat label="Reliability" value={`${posture.availabilityZones} AZ`} detail={`${posture.multiAzResources} multi-AZ · ${posture.singleAzStateful} single-AZ stateful`} tone={posture.singleAzStateful ? COLORS.amber : COLORS.teal} />
        <Stat label="Exposure" value={posture.exposedResources} detail={`${posture.highRiskResources} high-risk · ${posture.crownJewels} crown jewels`} tone={posture.exposedResources ? COLORS.red : COLORS.teal} />
        <Stat label="Evidence" value={posture.evidenceCoveragePct == null ? "—" : `${posture.evidenceCoveragePct}%`} detail={`${posture.staleResources} stale · ${posture.degradedEvidence} degraded`} tone={posture.evidenceFresh === false ? COLORS.amber : COLORS.teal} />
        <Stat label="Scope" value={`${posture.vpcs} VPC${posture.vpcs === 1 ? "" : "s"}`} detail={`${posture.accounts} account${posture.accounts === 1 ? "" : "s"} · ${posture.regions} region${posture.regions === 1 ? "" : "s"}`} />
      </div>

      <div className="px-4 md:px-5 py-4 border-b" style={{ borderColor: COLORS.line }}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: COLORS.muted }}>Operating lens</div>
            <div className="text-[11px] mt-1" style={{ color: COLORS.ink }}>{activeLens.description}</div>
          </div>
          <div className="inline-flex flex-wrap gap-1.5" role="tablist" aria-label="Estate operating lens">
            {LENSES.map(item => {
              const Icon = item.icon
              const active = lens === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setLens(item.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] uppercase tracking-[0.1em] font-bold transition-colors"
                  style={{
                    color: active ? COLORS.board : COLORS.muted,
                    background: active ? COLORS.teal : COLORS.panel,
                    border: `1px solid ${active ? COLORS.teal : COLORS.line}`,
                  }}
                  data-testid={`estate-command-lens-${item.id}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {item.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: COLORS.muted }}>Architecture flow</div>
            <div className="text-[12px] mt-1" style={{ color: COLORS.ink }}>Entry → runtime → state, with regional services and control dependencies alongside.</div>
          </div>
          <div className="hidden md:flex items-center gap-3 text-[9px] font-mono" style={{ color: COLORS.muted }}>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLORS.red }} /> high risk</span>
            <span className="inline-flex items-center gap-1"><Diamond className="h-3 w-3" style={{ color: COLORS.violet }} /> crown jewel</span>
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" style={{ color: COLORS.amber }} /> shared</span>
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="flex items-stretch gap-2 min-w-[980px]" data-testid="estate-command-architecture-flow">
            {model.planes.map((plane, index) => (
              <div key={plane.id} className="contents">
                <PlaneColumn
                  plane={plane}
                  lens={lens}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={onSelectNode}
                  connectionsByNode={model.connectionsByNode}
                  azCountByNode={model.azCountByNode}
                />
                {index < model.planes.length - 1 ? (
                  <div className="w-5 shrink-0 flex items-center justify-center" aria-hidden="true">
                    <ArrowRight className="h-4 w-4" style={{ color: COLORS.line }} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <section className="mt-3 rounded-xl p-3" style={{ border: `1px solid ${COLORS.line}`, background: "rgba(16, 33, 54, 0.55)" }}>
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4" style={{ color: COLORS.violet }} />
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] font-bold" style={{ color: COLORS.ink }}>Identity control plane</div>
                <div className="text-[10px] mt-0.5" style={{ color: COLORS.muted }}>Roles attached to workloads in this estate scope</div>
              </div>
            </div>
            <span className="text-[10px] font-mono" style={{ color: posture.riskyRoles ? COLORS.red : COLORS.teal }}>{posture.riskyRoles} material gaps</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {model.roles.length ? model.roles.slice(0, 6).map(role => (
              <IdentityRow key={role.role_arn ?? role.name} role={role} onSelect={onSelectRole} />
            )) : (
              <div className="text-[11px] py-2" style={{ color: COLORS.muted }}>No correlated IAM roles in scope.</div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-3 mt-3">
          <section className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.line}`, background: COLORS.panel }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: COLORS.line }}>
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: COLORS.ink }}>Operator brief</div>
                <div className="text-[10px] mt-1" style={{ color: COLORS.muted }}>Highest-value checks for the selected lens</div>
              </div>
              <Eye className="h-4 w-4" style={{ color: COLORS.teal }} />
            </div>
            <div>
              {priorities.map(priority => {
                const style = PRIORITY_STYLE[priority.tone]
                return (
                  <button
                    type="button"
                    key={priority.id}
                    onClick={() => priority.nodeId ? onSelectNode(priority.nodeId) : priority.roleName ? onSelectRole?.(priority.roleName) : undefined}
                    className="w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-white/[0.035] transition-colors"
                    style={{ borderColor: COLORS.line, background: style.background }}
                  >
                    <div className="flex items-start gap-2.5">
                      {priority.tone === "critical" ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: style.color }} /> : priority.tone === "warning" ? <Braces className="h-4 w-4 mt-0.5 shrink-0" style={{ color: style.color }} /> : <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: style.color }} />}
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold" style={{ color: COLORS.ink }}>{priority.title}</div>
                        <div className="text-[10px] mt-1 leading-relaxed" style={{ color: COLORS.muted }}>{priority.detail}</div>
                      </div>
                      {priority.nodeId || priority.roleName ? <ExternalLink className="h-3.5 w-3.5 ml-auto shrink-0" style={{ color: style.color }} /> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl p-4" style={{ border: `1px solid ${COLORS.line}`, background: COLORS.panel }}>
            <div className="flex items-center gap-2">
              <Layers3 className="h-4 w-4" style={{ color: COLORS.blue }} />
              <div className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: COLORS.ink }}>Estate readiness</div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-lg p-3" style={{ background: COLORS.panelRaised }}>
                <div className="text-[20px] font-semibold" style={{ color: findingsSummary?.critical ? COLORS.red : COLORS.teal }}>{findingsSummary?.total ?? "—"}</div>
                <div className="text-[9px] uppercase tracking-wide mt-1" style={{ color: COLORS.muted }}>open findings</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: COLORS.panelRaised }}>
                <div className="text-[20px] font-semibold" style={{ color: readyCuts ? COLORS.teal : COLORS.muted }}>{readyCuts ?? "—"}</div>
                <div className="text-[9px] uppercase tracking-wide mt-1" style={{ color: COLORS.muted }}>ready actions</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: COLORS.panelRaised }}>
                <div className="text-[20px] font-semibold" style={{ color: posture.sharedResources ? COLORS.amber : COLORS.teal }}>{posture.sharedResources}</div>
                <div className="text-[9px] uppercase tracking-wide mt-1" style={{ color: COLORS.muted }}>shared resources</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: COLORS.panelRaised }}>
                <div className="text-[20px] font-semibold" style={{ color: posture.unknownPlacement ? COLORS.amber : COLORS.teal }}>{posture.unknownPlacement}</div>
                <div className="text-[9px] uppercase tracking-wide mt-1" style={{ color: COLORS.muted }}>placement gaps</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t text-[10px] leading-relaxed" style={{ borderColor: COLORS.line, color: COLORS.muted }}>
              <Boxes className="h-3.5 w-3.5 inline mr-1.5" />
              {posture.evidenceCoveragePct == null
                ? "Posture coverage is not available for this scope."
                : `${posture.evidenceCoveragePct}% of resources have posture scores.`}
              {posture.evidenceFresh === false ? " Evidence freshness is degraded; enforcement should remain gated." : " Evidence is within the configured freshness threshold."}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
