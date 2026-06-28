"use client"

/**
 * Topology v0.2 — Estate SYSTEM view (risk-guided, serverless/managed-first).
 *
 * The default Estate Map. Proves business-system coverage first, then directs
 * attention by reachable damage. Lane order:
 *   1. Crown jewels / sensitive managed services  (what an attacker wants)
 *   2. Workloads that can reach them               (Lambda / EC2 / ECS …)
 *   3. Identity / roles on the path                (IAM rollups, gap-ranked)
 *   4. Internet / entry exposure                   (network-exposed workloads)
 *   5. Network placement                           (VPC/subnet — supporting only)
 *   6. Findings / recommended cuts                 (flagged count → drill-in)
 *
 * Reads the SAME `/api/topology-risk/{system}` response the subnet canvas uses
 * — no new backend. Severity (score tier) and confidence are encoded on two
 * separate channels per the security-UX rule. Empty lanes read honestly.
 */
import { useMemo } from "react"
import {
  AlertTriangle,
  Database,
  Diamond,
  Globe,
  Map as MapIcon,
  Network,
  Scissors,
  ShieldAlert,
  Zap,
} from "lucide-react"
import { createMap } from "./native-map"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import {
  buildJewelPathIndex,
  jewelPathMetaForNode,
  pathCountLabel,
  type DecisionRoutingSummary,
  type FindingsSeveritySummary,
} from "@/components/topology-v0-2/estate-enrichment"
import type {
  IamRoleRollup,
  ScoreTier,
  TopologyNode,
  TopologyRiskResponse,
} from "@/components/topology-v0-2/types"

const WORKLOAD_TYPES = new Set(["Lambda", "EC2", "ECS", "ECSTask", "Fargate"])
const MANAGED_TYPES = new Set(["S3", "DynamoDB", "RDS", "KMSKey", "Secret", "ALB"])

const TIER: Record<ScoreTier, { fg: string; bg: string; label: string }> = {
  WORST: { fg: "#B91C1C", bg: "#FBE9E9", label: "Worst" },
  HIGH: { fg: "#C2410C", bg: "#FFEAD6", label: "High" },
  ELEVATED: { fg: "#92500B", bg: "#FCF1D6", label: "Elevated" },
  QUIET: { fg: "#5A6B7A", bg: "#EDF1F4", label: "Quiet" },
}

const INK = "#1A2330"
const SLATE = "#5A6B7A"
const HAIR = "#DDE3E8"
const TEAL = "#00C2A8"

function scoreVal(n: TopologyNode): number {
  return n.score?.value ?? -1
}
function byScoreDesc(a: TopologyNode, b: TopologyNode): number {
  return scoreVal(b) - scoreVal(a)
}

function ConfidenceDots({ node }: { node: TopologyNode }) {
  const tier = node.score?.confidence?.tier
  const filled = tier === "FULL" ? 3 : tier === "DEGRADED" ? 2 : tier === "LOW" ? 1 : 0
  if (!tier) return null
  return (
    <span title={`Confidence: ${tier.toLowerCase()}`} className="inline-flex items-center gap-[2px]">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: i < filled ? INK : "transparent",
            border: `1px solid ${i < filled ? INK : "#C2CDD6"}`,
          }}
        />
      ))}
    </span>
  )
}

function TierBadge({ node }: { node: TopologyNode }) {
  const t = node.score?.tier
  if (!t) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#EDF1F4", color: SLATE }}>
        not scored
      </span>
    )
  }
  const c = TIER[t]
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>
      {c.label}
    </span>
  )
}

function Lane({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: SLATE }}>{icon}</span>
        <span className="text-sm font-semibold" style={{ color: INK }}>{title}</span>
        <span className="text-[11px]" style={{ color: SLATE }}>{subtitle}</span>
      </div>
      {children}
    </section>
  )
}

function RiskCard({
  node,
  selected,
  onSelect,
  accent,
  line2,
  line3,
}: {
  node: TopologyNode
  selected: boolean
  onSelect: (id: string) => void
  accent: string
  line2?: string
  line3?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className="text-left rounded-md p-2.5 transition-colors hover:bg-white"
      style={{
        background: "#FFFFFF",
        border: `0.5px solid ${HAIR}`,
        borderLeft: `3px solid ${accent}`,
        boxShadow: selected ? `0 0 0 2px ${TEAL}` : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold truncate" style={{ color: INK }} title={node.name}>
          {node.name}
        </span>
        <TierBadge node={node} />
      </div>
      {line2 ? (
        <div className="text-[11px] mt-1 font-mono truncate" style={{ color: SLATE }} title={line2}>
          {line2}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-[11px]">{line3}</span>
        <ConfidenceDots node={node} />
      </div>
    </button>
  )
}

export interface EstateSystemViewProps {
  data: TopologyRiskResponse
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
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
  onShowNetwork,
  onOpenTrafficMap,
  iapJewels = [],
  findingsSummary = null,
  decisionRouting = null,
}: EstateSystemViewProps) {
  const nodes = data.nodes ?? []
  const roles = data.vpc_topology?.iam_roles ?? []
  const kpis = data.system_kpis

  const roleByWorkload = useMemo(() => {
    const m = new Map<string, IamRoleRollup>()
    for (const r of roles) for (const wid of r.workload_ids ?? []) if (!m.has(wid)) m.set(wid, r)
    return m
  }, [roles])

  const jewels = useMemo(() => nodes.filter(n => n.is_jewel && !n.stale).sort(byScoreDesc), [nodes])
  const managed = useMemo(
    () => nodes.filter(n => !n.is_jewel && !n.stale && n.type != null && MANAGED_TYPES.has(n.type)).sort(byScoreDesc),
    [nodes],
  )
  const workloads = useMemo(
    () => nodes.filter(n => !n.stale && n.type != null && WORKLOAD_TYPES.has(n.type)).sort(byScoreDesc),
    [nodes],
  )
  const exposed = useMemo(
    () =>
      workloads.filter(n =>
        (n.score?.contributors ?? []).some(
          c => (c.signal === "network_exposure" || c.signal === "internet_dependency") && c.value > 0,
        ),
      ),
    [workloads],
  )
  const rankedRoles = useMemo(
    () => [...roles].sort((a, b) => (b.gap_percentage ?? -1) - (a.gap_percentage ?? -1)),
    [roles],
  )

  const jewelPathIndex = useMemo(() => buildJewelPathIndex(iapJewels), [iapJewels])

  const computeCount = kpis ? Object.entries(kpis.workloads_by_type ?? {}).reduce((s, [, v]) => s + v, 0) : nodes.length
  const flagged = kpis?.flagged_count ?? 0
  const typeSummary = kpis
    ? Object.entries(kpis.workloads_by_type ?? {})
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([t, v]) => `${v} ${t}`)
        .join(" · ")
    : ""

  const jewelLine = (n: TopologyNode) => {
    const pathMeta = jewelPathMetaForNode(n, jewelPathIndex)
    const pathPart = pathMeta ? pathCountLabel(pathMeta) : null
    const acc = n.observed_source_count
    const edges = n.observed_edge_count
    const accessPart =
      acc != null && acc > 0
        ? `${acc} sources · ${edges ?? 0} accesses`
        : "no observed access"
    if (pathPart && pathPart !== "0 attack paths") {
      return (
        <span style={{ color: SLATE }}>
          {pathPart}
          {accessPart !== "no observed access" ? ` · ${accessPart}` : ""}
        </span>
      )
    }
    return <span style={{ color: SLATE }}>{pathPart ?? accessPart}</span>
  }

  const workloadRoleLine = (n: TopologyNode): string | undefined => {
    const r = roleByWorkload.get(n.id)
    if (!r) return undefined
    if (r.gap_percentage != null) return `${r.name} · ${Math.round(r.gap_percentage)}% gap`
    if (r.unused_actions > 0 || r.allowed_actions > 0) return `${r.name} · ${r.unused_actions}/${r.allowed_actions} unused`
    return r.name
  }

  const jewelLine2 = (n: TopologyNode): string | undefined => {
    const meta = jewelPathMetaForNode(n, jewelPathIndex)
    const type = n.type ?? "?"
    if (meta && !meta.paths_not_computed && (meta.path_count ?? 0) > 0) {
      return `${type} · ${pathCountLabel(meta)}`
    }
    return type
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "#FFFFFF", border: `0.5px solid ${HAIR}` }}
      data-testid="topology-estate-system-view"
    >
      <div className="mb-4 pb-3 border-b" style={{ borderColor: HAIR }}>
        <div className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: TEAL }}>
          Risk inventory — not a diagram
        </div>
        <div className="text-[12px] mt-1" style={{ color: SLATE }}>
          Ranked cards for triage. For the visual topology, open a map below or use the{" "}
          <span className="font-semibold" style={{ color: INK }}>Traffic map</span> tab.
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {onOpenTrafficMap ? (
            <button
              type="button"
              onClick={onOpenTrafficMap}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-[#F0FDFA]"
              style={{ borderColor: TEAL, color: "#0E8B7A", background: "#FFFFFF" }}
              data-testid="topology-open-traffic-map"
            >
              <MapIcon className="h-3.5 w-3.5" />
              Open traffic map
            </button>
          ) : null}
          <button
            type="button"
            onClick={onShowNetwork}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-white"
            style={{ borderColor: "#CBD5E1", color: INK, background: "#FFFFFF" }}
            data-testid="topology-open-vpc-map"
          >
            <Network className="h-3.5 w-3.5" />
            Open VPC subnet map
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-3 text-[11px]" style={{ color: SLATE }}>
          <span><span className="font-semibold" style={{ color: INK }}>{computeCount}</span> compute &amp; data</span>
          <span><span className="font-semibold" style={{ color: INK }}>{roles.length}</span> roles</span>
          <span><span className="font-semibold" style={{ color: "#92500B" }}>{jewels.length}</span> crown jewels</span>
          {flagged > 0 ? (
            <span className="inline-flex items-center gap-1" style={{ color: "#B91C1C" }}>
              <AlertTriangle className="h-3 w-3" /> {flagged} flagged
            </span>
          ) : null}
        </div>
        {typeSummary ? <div className="text-[11px] font-mono" style={{ color: SLATE }}>{typeSummary}</div> : null}
      </div>

      <Lane
        icon={<Diamond className="h-4 w-4" />}
        title="Crown jewels"
        subtitle="sensitive data an attacker wants — ranked by risk"
      >
        {jewels.length === 0 ? (
          <div className="text-[12px] italic" style={{ color: SLATE }}>No crown jewels tagged in this system.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {jewels.map(n => (
              <RiskCard
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onSelect={onSelectNode}
                accent={TIER[n.score?.tier ?? "QUIET"].fg}
                line2={jewelLine2(n)}
                line3={jewelLine(n)}
              />
            ))}
          </div>
        )}
      </Lane>

      <Lane
        icon={<Zap className="h-4 w-4" />}
        title="Workloads"
        subtitle={`${workloads.length} compute — what runs the business`}
      >
        {workloads.length === 0 ? (
          <div className="text-[12px] italic" style={{ color: SLATE }}>No compute workloads in this system.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {workloads.slice(0, 12).map(n => (
              <RiskCard
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onSelect={onSelectNode}
                accent={TIER[n.score?.tier ?? "QUIET"].fg}
                line2={workloadRoleLine(n)}
                line3={<span style={{ color: SLATE }}>{n.type}{n.subnet_id ? " · in subnet" : " · serverless"}</span>}
              />
            ))}
          </div>
        )}
        {workloads.length > 12 ? (
          <div className="text-[11px] mt-2" style={{ color: SLATE }}>+ {workloads.length - 12} more workloads</div>
        ) : null}
      </Lane>

      <Lane
        icon={<Database className="h-4 w-4" />}
        title="Managed services"
        subtitle="data plane — S3 / DynamoDB / RDS / ALB / KMS"
      >
        {managed.length === 0 ? (
          <div className="text-[12px] italic" style={{ color: SLATE }}>No managed services beyond the crown jewels.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {managed.slice(0, 9).map(n => (
              <RiskCard
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onSelect={onSelectNode}
                accent={TIER[n.score?.tier ?? "QUIET"].fg}
                line2={n.type ?? undefined}
                line3={jewelLine(n)}
              />
            ))}
          </div>
        )}
      </Lane>

      <Lane
        icon={<ShieldAlert className="h-4 w-4" />}
        title="Identity on the path"
        subtitle={`${roles.length} roles — ranked by permission gap`}
      >
        {rankedRoles.length === 0 ? (
          <div className="text-[12px] italic" style={{ color: SLATE }}>No correlated roles for this system.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {rankedRoles.slice(0, 9).map(r => {
              const critical = (r.gap_percentage ?? 0) >= 80
              return (
                <div
                  key={r.role_arn ?? r.name}
                  className="rounded-md p-2.5"
                  style={{ background: "#FFFFFF", border: `0.5px solid ${HAIR}`, borderLeft: `3px solid ${critical ? "#B91C1C" : SLATE}` }}
                >
                  <div className="text-[13px] font-semibold truncate" style={{ color: INK }} title={r.name}>{r.name}</div>
                  <div className="text-[11px] mt-1" style={{ color: SLATE }}>
                    {r.gap_percentage != null
                      ? `${Math.round(r.gap_percentage)}% gap · ${r.unused_actions}/${r.allowed_actions} unused`
                      : r.correlation_state === "stale_rollup"
                        ? "recomputing · edges prove usage"
                        : "gap unknown"}
                    {r.scope_mode ? ` · ${r.scope_mode}` : ""}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Lane>

      <Lane
        icon={<Globe className="h-4 w-4" />}
        title="Internet exposure"
        subtitle="workloads with an inbound or egress entry path"
      >
        {exposed.length === 0 ? (
          <div className="text-[12px] italic" style={{ color: SLATE }}>No internet-exposed workloads observed.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {exposed.slice(0, 6).map(n => (
              <RiskCard
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onSelect={onSelectNode}
                accent="#C2410C"
                line2={n.type ?? undefined}
                line3={<span style={{ color: "#C2410C" }}>entry exposure</span>}
              />
            ))}
          </div>
        )}
      </Lane>

      <Lane
        icon={<Scissors className="h-4 w-4" />}
        title="Findings & recommended cuts"
        subtitle="open SecurityFindings — severity and execution readiness"
      >
        {findingsSummary?.error ? (
          <div className="text-[12px] italic" style={{ color: SLATE }}>Findings summary unavailable.</div>
        ) : findingsSummary && typeof findingsSummary.total === "number" ? (
          <div className="rounded-md p-3" style={{ background: "#F4F6F8", border: `0.5px solid ${HAIR}` }}>
            <div className="flex flex-wrap gap-3 text-[11px]">
              <span><span className="font-semibold" style={{ color: INK }}>{findingsSummary.total}</span> open</span>
              {(findingsSummary.critical ?? 0) > 0 ? (
                <span style={{ color: "#B91C1C" }}>{findingsSummary.critical} critical</span>
              ) : null}
              {(findingsSummary.high ?? 0) > 0 ? (
                <span style={{ color: "#C2410C" }}>{findingsSummary.high} high</span>
              ) : null}
              {(findingsSummary.medium ?? 0) > 0 ? (
                <span style={{ color: "#92500B" }}>{findingsSummary.medium} medium</span>
              ) : null}
              {(findingsSummary.low ?? 0) > 0 ? (
                <span style={{ color: SLATE }}>{findingsSummary.low} low</span>
              ) : null}
            </div>
            {decisionRouting && !decisionRouting.error ? (
              <div className="mt-2 pt-2 border-t text-[11px]" style={{ borderColor: HAIR, color: SLATE }}>
                {decisionRouting.scored_count != null ? (
                  <span>
                    Scored top {decisionRouting.scored_count}
                    {decisionRouting.total_findings != null ? ` of ${decisionRouting.total_findings}` : ""} findings
                  </span>
                ) : null}
                {decisionRouting.by_decision_total ? (
                  <span className="ml-2">
                    · {(decisionRouting.by_decision_total.AUTO_EXECUTE ?? 0) + (decisionRouting.by_decision_total.CANARY_FIRST ?? 0)} ready to cut
                    · {decisionRouting.by_decision_total.MANUAL_REVIEW ?? 0} manual review
                    · {decisionRouting.blocked_total ?? decisionRouting.by_decision_total.BLOCK ?? 0} blocked
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-[12px] italic" style={{ color: SLATE }}>Loading findings…</div>
        )}
      </Lane>

      <button
        type="button"
        onClick={onShowNetwork}
        className="w-full text-left rounded-xl p-3 transition-colors hover:bg-white"
        style={{ background: "#F4F6F8", border: `0.5px dashed #C2CDD6` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4" style={{ color: SLATE }} />
            <span className="text-[13px] font-semibold" style={{ color: SLATE }}>Network placement</span>
            <span className="text-[11px]" style={{ color: SLATE }}>VPC / subnet — supporting context for subnet-bound workloads</span>
          </div>
          <span className="text-[11px] font-semibold" style={{ color: TEAL }}>Open subnet map (fullscreen) →</span>
        </div>
      </button>
    </div>
  )
}
