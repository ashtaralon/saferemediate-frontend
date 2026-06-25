"use client"

/**
 * Topology v0.2 — AWS canonical-frame canvas.
 *
 * Always renders the AWS reference architecture as visual scaffold:
 *   Cloud > Region > VPC > AZ columns × (Web / App / Data) tier rows
 *   Edge services rail on the right (S3, KMS, Secrets, DynamoDB)
 *   IGW + Users + Internet above the cloud, NAT/VPCE on perimeter
 *
 * The scaffold is structural — it always looks the same. Service icons
 * only appear when the corresponding Neo4j data confirms the resource
 * exists (per CLAUDE.md rule #1). Empty cells stay drawn but labeled
 * "no <type> observed in this AZ/tier" rather than fabricating decoration.
 *
 * Data input:
 *   - vpc_topology.subnets (id → az + tier)
 *   - vpc_topology.edges.{igws,nat_gws,vpces}
 *   - nodes[]: each scored/stale workload, placed via subnet_id → cell
 */

import { useMemo } from "react"
import {
  type EdgeIgw,
  type EdgeNatGw,
  type EdgeVpce,
  type ScoreTier,
  SIGNAL_LABEL,
  type SubnetMeta,
  type SubnetTier,
  type TopologyNode,
  type VpcTopology,
} from "./types"

interface Props {
  vpcTopology: VpcTopology
  nodes: TopologyNode[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
}

const TIER_LABEL: Record<SubnetTier, string> = {
  web: "Public subnet (web tier)",
  app: "Private subnet (app tier)",
  data: "Private subnet (data tier)",
  unknown: "Unclassified subnet",
}

const TIER_TINT: Record<SubnetTier, string> = {
  web: "bg-emerald-950/30 border-emerald-700/40",
  app: "bg-sky-950/30 border-sky-700/40",
  data: "bg-indigo-950/40 border-indigo-700/50",
  unknown: "bg-slate-900/40 border-slate-700/40",
}

const EDGE_SERVICE_TYPES = new Set(["S3", "KMSKey", "DynamoDB", "DynamoDBTable", "Secret", "SecretsManagerSecret"])

function tierBg(tier: ScoreTier): string {
  switch (tier) {
    case "WORST": return "bg-rose-500/30 text-rose-100"
    case "HIGH": return "bg-rose-500/20 text-rose-200"
    case "ELEVATED": return "bg-amber-500/20 text-amber-200"
    case "QUIET": return "bg-emerald-500/15 text-emerald-200"
  }
}

function severityRing(node: TopologyNode): string {
  if (node.stale) return "ring-1 ring-slate-700 opacity-60"
  if (!node.score) return "ring-1 ring-slate-700"
  switch (node.score.tier) {
    case "WORST": return "ring-2 ring-rose-500/80 shadow-[0_0_0_4px_rgba(244,63,94,0.15)]"
    case "HIGH": return "ring-2 ring-rose-400/60"
    case "ELEVATED": return "ring-2 ring-amber-400/55"
    case "QUIET": return "ring-1 ring-emerald-500/40"
  }
}

function nodeIcon(type: string | null): string {
  switch (type) {
    case "EC2": return "🖥"
    case "Lambda": return "λ"
    case "RDS": return "🗄"
    case "DynamoDB":
    case "DynamoDBTable": return "▤"
    case "S3": return "🪣"
    case "KMSKey": return "🔑"
    case "Secret":
    case "SecretsManagerSecret": return "🔐"
    case "LoadBalancer":
    case "ALB":
    case "ApplicationLoadBalancer": return "⇉"
    default: return "◇"
  }
}

function WorkloadChip({
  node,
  selected,
  onClick,
}: {
  node: TopologyNode
  selected: boolean
  onClick: () => void
}) {
  const stale = !!node.stale
  return (
    <button
      type="button"
      onClick={onClick}
      title={node.name}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-slate-900/80 border border-slate-700/60 text-left
        ${severityRing(node)}
        ${selected ? "ring-offset-2 ring-offset-slate-950 ring-teal-400" : ""}
        hover:bg-slate-800/80 transition-colors min-w-0 max-w-[230px]`}
    >
      <span className="text-base shrink-0 leading-none">{nodeIcon(node.type)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 min-w-0">
          {node.is_jewel && <span className="text-amber-300 text-[10px]" title="Crown jewel">♛</span>}
          <span className="text-[11px] font-semibold text-slate-100 truncate">{node.name}</span>
        </div>
        <div className="text-[9px] text-slate-500 font-mono truncate">{node.type ?? "?"}</div>
      </div>
      {node.score && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${tierBg(node.score.tier)}`}>
          {node.score.value}
        </span>
      )}
      {stale && (
        <span className="text-[9px] text-slate-500 shrink-0">STALE</span>
      )}
    </button>
  )
}

function SubnetCell({
  tier,
  az,
  subnetsHere,
  workloadsHere,
  selectedNodeId,
  onSelect,
}: {
  tier: SubnetTier
  az: string
  subnetsHere: SubnetMeta[]
  workloadsHere: TopologyNode[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
}) {
  const empty = subnetsHere.length === 0
  return (
    <div className={`rounded-lg border p-2.5 ${TIER_TINT[tier]} ${empty ? "opacity-60" : ""} min-h-[88px]`}>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-[0.12em] text-slate-300/80 font-semibold">
          {TIER_LABEL[tier]}
        </div>
        <div className="text-[10px] text-slate-400 font-mono">
          {subnetsHere.length === 0
            ? "—"
            : subnetsHere.map(s => s.cidr ?? s.name).join(" · ")}
        </div>
      </div>

      {empty ? (
        <div className="text-[10px] text-slate-500 italic">
          no {tier} subnet observed in {az}
        </div>
      ) : (
        <>
          {subnetsHere.map(s => (
            <div key={s.id} className="text-[9px] text-slate-500 font-mono mb-1 truncate">
              {s.name}
            </div>
          ))}
          {workloadsHere.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic">
              no workloads here
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {workloadsHere.map(n => (
                <WorkloadChip
                  key={n.id}
                  node={n}
                  selected={n.id === selectedNodeId}
                  onClick={() => onSelect(n.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EdgeService({
  node,
  selectedNodeId,
  onSelect,
}: {
  node: TopologyNode
  selectedNodeId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <WorkloadChip
      node={node}
      selected={node.id === selectedNodeId}
      onClick={() => onSelect(node.id)}
    />
  )
}

// Workload types that conceptually live OUTSIDE a VPC subnet when they
// have no subnet_id binding. Lambdas in particular: if not configured for
// VPC access, AWS runs them in the Lambda-managed VPC — they're not in
// the customer's network plane and so cannot be placed in any (az, tier)
// cell. Rendering them in a dedicated "Serverless / outside VPC" band
// preserves the rule "every Neo4j workload is on the canvas somewhere".
const SERVERLESS_TYPES = new Set(["Lambda", "LambdaFunction"])

export function AwsFrame({ vpcTopology, nodes, selectedNodeId, onSelect }: Props) {
  // Index subnets and workloads by (az, tier).
  const { byAzAndTier, edgeNodes, serverlessNodes, unplacedNodes, staleNodes } = useMemo(() => {
    const subnetById = new Map(vpcTopology.subnets.map(s => [s.id, s]))
    const byAzAndTier = new Map<string, Map<SubnetTier, TopologyNode[]>>()
    const edgeNodes: TopologyNode[] = []
    const serverlessNodes: TopologyNode[] = []
    const unplacedNodes: TopologyNode[] = []
    const staleNodes: TopologyNode[] = []

    for (const n of nodes) {
      if (n.stale) {
        staleNodes.push(n)
        continue
      }
      if (n.type && EDGE_SERVICE_TYPES.has(n.type)) {
        edgeNodes.push(n)
        continue
      }
      const sub = n.subnet_id ? subnetById.get(n.subnet_id) ?? null : null
      if (!sub || !sub.az) {
        // Lambda without subnet_id → "Serverless / outside VPC" band.
        // Other types without a subnet → "Unclassified subnets" band
        // (typically a data-quality signal worth surfacing).
        if (n.type && SERVERLESS_TYPES.has(n.type)) {
          serverlessNodes.push(n)
        } else {
          unplacedNodes.push(n)
        }
        continue
      }
      const azMap = byAzAndTier.get(sub.az) ?? new Map<SubnetTier, TopologyNode[]>()
      const cell = azMap.get(sub.tier) ?? []
      cell.push(n)
      azMap.set(sub.tier, cell)
      byAzAndTier.set(sub.az, azMap)
    }

    // Sort each cell by score desc.
    for (const azMap of byAzAndTier.values()) {
      for (const list of azMap.values()) {
        list.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
      }
    }
    edgeNodes.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
    serverlessNodes.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
    return { byAzAndTier, edgeNodes, serverlessNodes, unplacedNodes, staleNodes }
  }, [vpcTopology.subnets, nodes])

  // Group subnets by (az, tier) for the cell metadata.
  const subnetsByCell = useMemo(() => {
    const m = new Map<string, SubnetMeta[]>()
    for (const s of vpcTopology.subnets) {
      if (!s.az) continue
      const k = `${s.az}::${s.tier}`
      const list = m.get(k) ?? []
      list.push(s)
      m.set(k, list)
    }
    return m
  }, [vpcTopology.subnets])

  const azs = vpcTopology.azs.length > 0
    ? vpcTopology.azs
    : Array.from(new Set(vpcTopology.subnets.map(s => s.az).filter((a): a is string => !!a)))

  const tiers: SubnetTier[] = ["web", "app", "data"]
  const hasIgw = vpcTopology.edges.igws.length > 0
  const hasNats = vpcTopology.edges.nat_gws.length > 0
  const hasVpces = vpcTopology.edges.vpces.length > 0
  const hasUnknownSubnets = vpcTopology.subnets.some(s => s.tier === "unknown")

  return (
    <div className="rounded-xl border-2 border-slate-700 bg-gradient-to-b from-slate-950 to-slate-900 p-5 space-y-3">
      {/* Internet + IGW perimeter */}
      <div className="flex items-center justify-center gap-6 pb-2">
        <div className="flex flex-col items-center text-slate-300">
          <div className="text-2xl">👥</div>
          <div className="text-[10px] uppercase tracking-wider">Users</div>
        </div>
        <div className="flex-1 max-w-[160px] border-t border-dashed border-slate-600" />
        <div className="flex flex-col items-center text-slate-300">
          <div className="text-2xl">☁</div>
          <div className="text-[10px] uppercase tracking-wider">Internet</div>
        </div>
        <div className="flex-1 max-w-[160px] border-t border-dashed border-slate-600" />
        <div className={`flex flex-col items-center ${hasIgw ? "text-purple-300" : "text-slate-600"}`}>
          <div className="text-2xl">🌐</div>
          <div className="text-[10px] uppercase tracking-wider">
            {hasIgw ? `IGW · ${vpcTopology.edges.igws[0].name}` : "no IGW observed"}
          </div>
        </div>
      </div>

      {/* AWS Cloud frame */}
      <div className="rounded-lg border-2 border-slate-600 bg-slate-950/60 p-3 relative">
        <div className="absolute -top-2.5 left-3 px-2 bg-slate-950 text-[10px] uppercase tracking-[0.14em] text-slate-300 font-semibold">
          AWS Cloud {vpcTopology.account_id ? `· acct ${vpcTopology.account_id}` : ""}
        </div>

        {/* Region */}
        <div className="rounded-md border border-slate-600 bg-slate-950/50 p-3 mt-2 relative">
          <div className="absolute -top-2.5 left-3 px-2 bg-slate-950 text-[10px] uppercase tracking-[0.14em] text-slate-400 font-semibold">
            Region · {vpcTopology.region ?? "unknown"}
          </div>

          {/* VPC + edge rail flexbox */}
          <div className="flex gap-3 mt-2">
            {/* VPC frame */}
            <div className="flex-1 rounded-md border-2 border-teal-700/50 bg-slate-950/40 p-3 relative">
              <div className="absolute -top-2.5 left-3 px-2 bg-slate-950 text-[10px] uppercase tracking-[0.14em] text-teal-300 font-semibold">
                VPC · {vpcTopology.vpc_id ?? "unknown"}
              </div>

              {/* VPCE perimeter band */}
              {hasVpces && (
                <div className="mb-2 pb-2 border-b border-dashed border-slate-700 flex flex-wrap gap-1.5">
                  {vpcTopology.edges.vpces.map(v => (
                    <span key={v.id} className="text-[10px] px-2 py-0.5 rounded bg-purple-900/40 border border-purple-700/50 text-purple-200">
                      VPCE · {v.service_name ?? v.id}
                    </span>
                  ))}
                </div>
              )}

              {/* NAT GW perimeter band */}
              {hasNats && (
                <div className="mb-2 pb-2 border-b border-dashed border-slate-700 flex flex-wrap gap-1.5">
                  {vpcTopology.edges.nat_gws.map(n => (
                    <span key={n.id} className="text-[10px] px-2 py-0.5 rounded bg-orange-900/40 border border-orange-700/50 text-orange-200">
                      NAT GW · {n.name}
                    </span>
                  ))}
                </div>
              )}

              {/* AZ columns × tier rows */}
              {azs.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic py-6 text-center">
                  No subnets / AZs observed for this VPC.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* AZ headers */}
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${azs.length}, minmax(0, 1fr))` }}>
                    {azs.map(az => (
                      <div key={az} className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-semibold text-center pb-1 border-b border-slate-700">
                        AZ · {az}
                      </div>
                    ))}
                  </div>
                  {/* Tier rows */}
                  {tiers.map(tier => (
                    <div
                      key={tier}
                      className="grid gap-2"
                      style={{ gridTemplateColumns: `repeat(${azs.length}, minmax(0, 1fr))` }}
                    >
                      {azs.map(az => {
                        const subnetsHere = subnetsByCell.get(`${az}::${tier}`) ?? []
                        const workloadsHere = byAzAndTier.get(az)?.get(tier) ?? []
                        return (
                          <SubnetCell
                            key={`${az}-${tier}`}
                            tier={tier}
                            az={az}
                            subnetsHere={subnetsHere}
                            workloadsHere={workloadsHere}
                            selectedNodeId={selectedNodeId}
                            onSelect={onSelect}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}

              {/* Unclassified subnets footer */}
              {hasUnknownSubnets && (
                <div className="mt-3 pt-2 border-t border-slate-700">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-semibold mb-1.5">
                    Unclassified subnets ({vpcTopology.unknown_subnet_count})
                  </div>
                  <div className="text-[10px] text-slate-500 mb-2 italic">
                    Tier classification missing — Subnet.tier backfill follow-up.
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {vpcTopology.subnets
                      .filter(s => s.tier === "unknown")
                      .flatMap(s => {
                        const here = nodes.filter(
                          n => !n.stale && n.subnet_id === s.id,
                        )
                        return here.map(n => (
                          <WorkloadChip
                            key={n.id}
                            node={n}
                            selected={n.id === selectedNodeId}
                            onClick={() => onSelect(n.id)}
                          />
                        ))
                      })}
                    {unplacedNodes.map(n => (
                      <WorkloadChip
                        key={n.id}
                        node={n}
                        selected={n.id === selectedNodeId}
                        onClick={() => onSelect(n.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right edge rail — S3, KMS, DDB, Secrets */}
            <div className="w-[180px] rounded-md border border-slate-700 bg-slate-950/40 p-3 relative">
              <div className="absolute -top-2.5 left-3 px-2 bg-slate-950 text-[10px] uppercase tracking-[0.14em] text-slate-400 font-semibold">
                Edge services
              </div>
              {edgeNodes.length === 0 ? (
                <div className="text-[10px] text-slate-500 italic mt-2">
                  no S3 / KMS / DynamoDB observed in this system
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 mt-1">
                  {edgeNodes.map(n => (
                    <EdgeService
                      key={n.id}
                      node={n}
                      selectedNodeId={selectedNodeId}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Serverless / outside-VPC workloads.
          Lambdas that aren't configured for VPC access have no subnet_id
          and AWS runs them in a Lambda-managed VPC. They're still part of
          the system but don't sit in any (az, tier) cell. Render them in
          a dedicated band so they don't silently disappear from the canvas. */}
      {serverlessNodes.length > 0 && (
        <div className="rounded-md border border-slate-700 bg-slate-900/30 p-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-semibold">
              Serverless · outside VPC ({serverlessNodes.length})
            </div>
            <div className="text-[10px] text-slate-500">λ Lambda functions with no VPC binding</div>
          </div>
          <div className="text-[10px] text-slate-500 mb-2 italic">
            Run in the AWS-managed Lambda VPC — outside the customer network plane.
          </div>
          <div className="flex flex-wrap gap-1.5">
            {serverlessNodes.map(n => (
              <WorkloadChip
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onClick={() => onSelect(n.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stale workloads footer */}
      {staleNodes.length > 0 && (
        <div className="rounded-md border border-slate-700 bg-slate-900/30 p-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-semibold mb-1.5">
            Stale workloads ({staleNodes.length})
          </div>
          <div className="text-[10px] text-slate-500 mb-2 italic">
            aws_exists = false — kept for audit, excluded from rank.
          </div>
          <div className="flex flex-wrap gap-1.5">
            {staleNodes.map(n => (
              <WorkloadChip
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onClick={() => onSelect(n.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
