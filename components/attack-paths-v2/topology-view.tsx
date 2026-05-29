"use client"

/**
 * Topology View — AWS reference-architecture containment renderer.
 *
 * Distinct mental model from the attack-path views: this shows the
 * customer's *architecture*, not the attacker's path. Renders a
 * nested layout matching the classic AWS 3-tier diagram:
 *
 *   AWS Cloud > Region > VPC (CIDR) > AZ columns
 *     > Public/Private Subnet (CIDR)
 *       > Workloads (EC2 / Lambda / RDS), each with their SGs
 *
 * Plus VPC-level IGW (top) and VPCEs (alongside).
 *
 * Phase 1: single-VPC focus, static layout, no interactivity beyond
 * scrolling. Data sourced from /api/topology-aws/{system} — every
 * node is a real Neo4j resource.
 */

import { useMemo } from "react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { Cloud, Server, Database, Lock, Globe, Layers, Network, ShieldCheck } from "lucide-react"

interface Workload {
  id: string
  name: string
  type: string // "ec2instance" | "lambdafunction" | "rdsinstance" | ...
  security_groups: string[]
}

interface Subnet {
  id: string
  name: string
  cidr: string | null
  is_public: boolean
  route_table_id: string | null
  nacl_id: string | null
  workloads: Workload[]
}

interface AZ {
  name: string
  subnets: Subnet[]
}

interface IGW { id: string; name: string }
interface VPCE { id: string; name: string; service: string | null }
interface SG { id: string; name: string; has_public_ingress: boolean }
interface NACL { id: string; name: string; subnet_ids: string[] }

interface VPC {
  id: string
  name: string
  cidr: string | null
  region: string | null
  azs: AZ[]
  internet_gateways: IGW[]
  vpc_endpoints: VPCE[]
  security_groups: SG[]
  nacls: NACL[]
}

interface TopologyResponse {
  system_name: string
  vpcs: VPC[]
}

interface TopologyViewProps {
  systemName: string | null
}

function shortName(s: string): string {
  if (!s) return ""
  if (s.length <= 28) return s
  return `${s.slice(0, 14)}…${s.slice(-10)}`
}

function workloadIcon(t: string) {
  const tt = (t || "").toLowerCase()
  if (tt.includes("rds") || tt.includes("database")) return Database
  if (tt.includes("lambda")) return Layers
  return Server
}

function workloadKind(t: string): string {
  const tt = (t || "").toLowerCase()
  if (tt.includes("ec2")) return "EC2"
  if (tt.includes("rds")) return "RDS"
  if (tt.includes("lambda")) return "Lambda"
  return tt.toUpperCase()
}

export default function TopologyView({ systemName }: TopologyViewProps) {
  const fetchUrl = systemName
    ? `/api/proxy/topology-aws/${encodeURIComponent(systemName)}`
    : null
  const { data, loading, error } = useCachedFetch<TopologyResponse>(fetchUrl, {
    cacheKey: `topology-aws:${systemName}`,
  })

  const vpcs = data?.vpcs ?? []

  if (loading && !data) {
    return (
      <div className="p-12 text-center text-xs text-slate-500">
        Loading topology…
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-12 text-center text-xs text-rose-400">
        Failed to load topology: {String(error)}
      </div>
    )
  }
  if (vpcs.length === 0) {
    return (
      <div className="p-12 text-center text-xs text-slate-500">
        No VPCs found for this system.
      </div>
    )
  }

  return (
    <div className="p-6 bg-slate-950 min-h-full overflow-auto">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-base font-bold text-slate-100 tracking-wide uppercase">Topology View</h2>
        <span className="text-[10px] text-slate-500 italic">
          AWS-style containment · sourced from Neo4j as-is
        </span>
      </div>

      {vpcs.map((vpc) => (
        <AwsCloudFrame key={vpc.id} vpc={vpc} />
      ))}
    </div>
  )
}

function AwsCloudFrame({ vpc }: { vpc: VPC }) {
  const regionLabel = vpc.region || "region"
  return (
    // Outer: AWS Cloud frame — solid blue rule, AWS icon top-left.
    <div className="border-2 border-blue-600/40 rounded-md p-4 mb-6 bg-blue-950/10">
      <div className="flex items-center gap-2 mb-3">
        <Cloud className="h-4 w-4 text-blue-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">AWS Cloud</span>
      </div>

      {/* Region container — dashed border */}
      <div className="border border-dashed border-emerald-600/50 rounded-md p-4 mb-2 bg-emerald-950/5">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            Region · {regionLabel}
          </span>
        </div>

        {/* VPC container — solid green rule */}
        <div className="border-2 border-emerald-500/40 rounded-md p-4 bg-emerald-900/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-emerald-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                VPC · {vpc.cidr ?? "cidr unknown"}
              </span>
              <span className="text-[9px] text-emerald-300/60">{shortName(vpc.id)}</span>
            </div>
            {/* IGW chip at the top of the VPC — classic AWS placement */}
            {vpc.internet_gateways.length > 0 && (
              <div className="flex items-center gap-2">
                {vpc.internet_gateways.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-900/20 px-2 py-1"
                    title={g.id}
                  >
                    <Globe className="h-3 w-3 text-violet-300" />
                    <span className="text-[9px] font-bold uppercase text-violet-200">IGW</span>
                    <span className="text-[8px] text-violet-300/70">{shortName(g.id)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* VPCEs row — below the IGW, AWS-style "service gateway" placement */}
          {vpc.vpc_endpoints.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3 ml-1">
              {vpc.vpc_endpoints.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-900/20 px-2 py-1"
                  title={g.id}
                >
                  <Globe className="h-3 w-3 text-cyan-300" />
                  <span className="text-[9px] font-bold uppercase text-cyan-200">
                    VPCE {g.service ? `· ${g.service}` : ""}
                  </span>
                  <span className="text-[8px] text-cyan-300/70">{shortName(g.id)}</span>
                </div>
              ))}
            </div>
          )}

          {/* AZ columns */}
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(vpc.azs.length, 1)}, minmax(0, 1fr))` }}>
            {vpc.azs.map((az) => (
              <AzColumn key={az.name} az={az} sgs={vpc.security_groups} />
            ))}
          </div>

          {/* NACLs footer — render as a row of chips with which subnets they apply to */}
          {vpc.nacls.length > 0 && (
            <div className="mt-3 pt-3 border-t border-emerald-500/20">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-2">Network ACLs (subnet-attached)</div>
              <div className="flex flex-wrap gap-2">
                {vpc.nacls.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-900/15 px-2 py-1"
                    title={`${n.id} · associated with subnets: ${n.subnet_ids.join(", ")}`}
                  >
                    <Lock className="h-3 w-3 text-sky-300" />
                    <span className="text-[9px] font-bold uppercase text-sky-200">NACL</span>
                    <span className="text-[8px] text-sky-300/70">{shortName(n.id)}</span>
                    <span className="text-[8px] text-sky-300/50">· {n.subnet_ids.length} subnet{n.subnet_ids.length === 1 ? "" : "s"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AzColumn({ az, sgs }: { az: AZ; sgs: SG[] }) {
  return (
    <div className="border border-dashed border-slate-600/60 rounded-md p-3 bg-slate-900/30">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
        AZ · {az.name}
      </div>
      <div className="flex flex-col gap-3">
        {az.subnets.map((s) => (
          <SubnetBox key={s.id} subnet={s} sgs={sgs} />
        ))}
      </div>
    </div>
  )
}

function SubnetBox({ subnet, sgs }: { subnet: Subnet; sgs: SG[] }) {
  // Public subnet → light-green tint. Private → light-blue tint.
  const tint = subnet.is_public
    ? "border-emerald-600/40 bg-emerald-800/15"
    : "border-sky-600/40 bg-sky-800/10"
  const labelColor = subnet.is_public ? "text-emerald-300" : "text-sky-300"

  // Group workloads by SG so we can draw a dashed boundary around the
  // set that shares an SG (mirroring the AWS reference where SG is a
  // dashed perimeter around the resources it protects).
  const groups = useMemo(() => {
    const byKey = new Map<string, { sgIds: string[]; workloads: Workload[] }>()
    for (const w of subnet.workloads) {
      const key = w.security_groups.length === 0
        ? "__no_sg__"
        : [...w.security_groups].sort().join("|")
      if (!byKey.has(key)) byKey.set(key, { sgIds: [...w.security_groups], workloads: [] })
      byKey.get(key)!.workloads.push(w)
    }
    return Array.from(byKey.values())
  }, [subnet.workloads])

  const sgById = useMemo(() => {
    const m = new Map<string, SG>()
    for (const sg of sgs) m.set(sg.id, sg)
    return m
  }, [sgs])

  return (
    <div className={`border rounded-md p-2.5 ${tint}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Lock className={`h-3 w-3 ${labelColor}`} />
          <span className={`text-[9px] font-bold uppercase tracking-wider ${labelColor}`}>
            {subnet.is_public ? "Public Subnet" : "Private Subnet"}
          </span>
          <span className="text-[9px] text-slate-400">{subnet.cidr ?? "—"}</span>
        </div>
        <span className="text-[8px] text-slate-500" title={subnet.id}>
          {shortName(subnet.id)}
        </span>
      </div>

      {/* Workloads — group SG-shared workloads in a dashed SG boundary */}
      {groups.length === 0 ? (
        <div className="text-[9px] text-slate-500 italic px-2 py-3 text-center">
          (no workloads in this subnet)
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g, i) => (
            <SGBoundary key={i} sgIds={g.sgIds} workloads={g.workloads} sgById={sgById} />
          ))}
        </div>
      )}
    </div>
  )
}

function SGBoundary({
  sgIds,
  workloads,
  sgById,
}: {
  sgIds: string[]
  workloads: Workload[]
  sgById: Map<string, SG>
}) {
  const hasSg = sgIds.length > 0
  return (
    <div
      className={`rounded-md p-2 ${hasSg ? "border border-dashed border-rose-500/50 bg-rose-950/10" : ""}`}
    >
      {hasSg && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <ShieldCheck className="h-3 w-3 text-rose-400" />
          {sgIds.map((id) => {
            const sg = sgById.get(id)
            return (
              <div
                key={id}
                className="flex items-center gap-1 rounded border border-rose-500/40 bg-rose-900/20 px-1.5 py-0.5"
                title={id}
              >
                <span className="text-[8px] font-bold uppercase text-rose-200">SG</span>
                <span className="text-[8px] text-rose-300/80">{shortName(sg?.name || id)}</span>
                {sg?.has_public_ingress && (
                  <span className="text-[7px] font-bold uppercase text-amber-300 bg-amber-500/20 rounded px-1">
                    Public
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {workloads.map((w) => (
          <WorkloadCard key={w.id} workload={w} />
        ))}
      </div>
    </div>
  )
}

function WorkloadCard({ workload }: { workload: Workload }) {
  const Icon = workloadIcon(workload.type)
  const kind = workloadKind(workload.type)
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-orange-500/40 bg-orange-900/15 px-2 py-1.5 min-w-0"
      title={workload.id}
    >
      <Icon className="h-3.5 w-3.5 text-orange-400 shrink-0" />
      <div className="flex flex-col min-w-0">
        <span className="text-[9px] font-bold text-orange-200 truncate">
          {shortName(workload.name)}
        </span>
        <span className="text-[8px] text-orange-300/60 uppercase tracking-wider">{kind}</span>
      </div>
    </div>
  )
}
