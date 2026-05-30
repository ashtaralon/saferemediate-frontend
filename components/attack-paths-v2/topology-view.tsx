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
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"

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
// 2026-05-31 — backend returns these but TS interface + renderer
// were missing them, so the reference-architecture features
// (NAT GW chip on web tier, RT chip with actual routes) couldn't
// be drawn. Wiring through now.
interface NATGateway {
  id: string
  name: string
  subnet_id: string | null
}
interface RouteEntry {
  cidr: string
  target_id: string | null
  target_kind: string  // "igw" | "nat" | "vpce" | "local" | "tgw" | ...
}
interface RouteTable {
  id: string
  name: string
  main: boolean
  routes: RouteEntry[]
}

interface VPC {
  id: string
  name: string
  cidr: string | null
  region: string | null
  azs: AZ[]
  internet_gateways: IGW[]
  nat_gateways: NATGateway[]
  route_tables: RouteTable[]
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
  /**
   * Optional path — when provided, the renderer dims off-path subnets,
   * SGs, and workloads. The on-path set is derived from path.nodes ids
   * + any node whose neighbor_id appears in path.edges. Service-
   * agnostic at the code level: gating is by id membership, not by
   * resource name patterns.
   */
  selectedPath?: IdentityAttackPath | null
}

/** Set of node ids that appear in the path's nodes or edges. */
function deriveOnPathIds(path: IdentityAttackPath | null | undefined): Set<string> {
  const out = new Set<string>()
  if (!path) return out
  for (const n of path.nodes ?? []) {
    if (n.id) out.add(n.id)
  }
  for (const e of path.edges ?? []) {
    if (e.source) out.add(e.source)
    if (e.target) out.add(e.target)
  }
  return out
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

export default function TopologyView({ systemName, selectedPath }: TopologyViewProps) {
  const fetchUrl = systemName
    ? `/api/proxy/topology-aws/${encodeURIComponent(systemName)}`
    : null
  const { data, loading, error } = useCachedFetch<TopologyResponse>(fetchUrl, {
    cacheKey: `topology-aws:${systemName}`,
  })

  const vpcs = data?.vpcs ?? []
  const onPathIds = useMemo(() => deriveOnPathIds(selectedPath ?? null), [selectedPath])
  const hasPath = onPathIds.size > 0

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
        {hasPath && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 ml-2 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5">
            Path overlay · {onPathIds.size} on-path nodes highlighted
          </span>
        )}
      </div>

      {vpcs.map((vpc) => (
        <AwsCloudFrame key={vpc.id} vpc={vpc} onPathIds={onPathIds} hasPath={hasPath} />
      ))}
    </div>
  )
}

function AwsCloudFrame({ vpc, onPathIds, hasPath }: { vpc: VPC; onPathIds: Set<string>; hasPath: boolean }) {
  // Infer region from any subnet's AZ when the VPC.region property is
  // null (collector frequently doesn't tag it). AZs are like
  // "eu-west-1a" → "eu-west-1".
  const inferredRegion = useMemo(() => {
    if (vpc.region) return vpc.region
    for (const az of vpc.azs) {
      const m = az.name.match(/^([a-z]+-[a-z]+-\d+)/)
      if (m) return m[1]
    }
    return null
  }, [vpc.region, vpc.azs])
  const regionLabel = inferredRegion ?? "region unknown"
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
          {/* VPC banner — name + CIDR on its own row, centered emphasis */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-emerald-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                VPC{vpc.cidr ? ` · ${vpc.cidr}` : ""}
              </span>
              <span className="text-[9px] text-emerald-300/60">{shortName(vpc.id)}</span>
            </div>
            {/* Service endpoints (VPCEs) chip cluster — sit at the
                top-right of the VPC so they're visible without scrolling.
                Per the AWS reference, VPCEs are alternative egress to
                IGW for AWS services; they're a control-plane gate, not
                a tier resource. */}
            {vpc.vpc_endpoints.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] uppercase tracking-wider text-slate-500">
                  Service endpoints
                </span>
                {vpc.vpc_endpoints.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-900/20 px-1.5 py-0.5"
                    title={g.id}
                  >
                    <Globe className="h-3 w-3 text-cyan-300" />
                    <span className="text-[9px] font-bold uppercase text-cyan-200">
                      VPCE {g.service ? `· ${g.service}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* USER → IGW perimeter entry — matches AWS reference
              architecture exactly: user icon, vertical arrow, IGW
              chip centered above the VPC body. When no IGW exists
              on the VPC, render an honest "private VPC (no IGW)"
              state instead of hiding the perimeter. */}
          <div className="flex flex-col items-center mb-4">
            <div className="flex flex-col items-center gap-0.5">
              <div className="text-xl leading-none">👤</div>
              <span className="text-[8px] uppercase tracking-wider text-slate-400">
                User
              </span>
            </div>
            <div className="h-3 w-px bg-slate-500/60" />
            {vpc.internet_gateways.length > 0 ? (
              vpc.internet_gateways.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-col items-center gap-0.5 rounded-md border border-violet-500/60 bg-violet-900/30 px-3 py-1.5"
                  title={g.id}
                >
                  <Globe className="h-4 w-4 text-violet-300" />
                  <span className="text-[9px] font-bold uppercase text-violet-200">
                    Internet Gateway
                  </span>
                  <span className="text-[8px] text-violet-300/70 font-mono">
                    {shortName(g.id)}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-slate-700/60 bg-slate-900/40 px-3 py-1.5 text-[9px] text-slate-400 italic">
                Private VPC · no Internet Gateway
              </div>
            )}
          </div>

          {/* NAT Gateways — typically sit on the public-subnet edge of
              the Web Tier. Reference architecture renders them on the
              far-left of the Web Tier band. We surface them in their
              own row above the tier grid so the operator sees the
              egress path; backend's `subnet_id` tells us which AZ each
              NAT GW lives in (rendered in column-aligned position once
              we have ALB inter-AZ rendering — for now, single row). */}
          {vpc.nat_gateways.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[8px] uppercase tracking-wider text-slate-500">
                Egress
              </span>
              {vpc.nat_gateways.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-900/20 px-2 py-1"
                  title={`${n.id}${n.subnet_id ? ` · in subnet ${n.subnet_id}` : ""}`}
                >
                  <Globe className="h-3 w-3 text-amber-300" />
                  <span className="text-[9px] font-bold uppercase text-amber-200">
                    NAT GW
                  </span>
                  <span className="text-[8px] text-amber-300/70 font-mono">
                    {shortName(n.id)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Tier-row layout: tiers (Web / App / DB) as horizontal
              rows, AZs as columns. Mirrors the classic AWS reference
              architecture. When the data doesn't follow the naming
              convention (e.g. demo data where every subnet is public-
              routed), tiers collapse and everything lands in a single
              row — accurate to the data, no fake separation. */}
          <TierRowsLayout
            vpc={vpc}
            onPathIds={onPathIds}
            hasPath={hasPath}
            routeTablesById={routeTablesById(vpc)}
          />

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

// Service-agnostic tier classification. Three signals, in order of
// strength:
//   1. Subnet name substring ("public" / "private-db" / "private-app")
//   2. Workload type composition (RDS-only → DB; compute → App; ALB
//      present → Web — once collectors emit LoadBalancer for this
//      VPC)
//   3. Fallback: is_public → Web tier (the AWS convention),
//      otherwise → App tier
//
// New tiers are added by extending the order list + adding a case to
// classifySubnetTier. No hardcoded service names appear here.
type TierKey = "web" | "app" | "db" | "other"
const TIER_ORDER: TierKey[] = ["web", "app", "db", "other"]
const TIER_META: Record<TierKey, { label: string; accent: string; tint: string }> = {
  web: { label: "Web Tier", accent: "text-emerald-300", tint: "border-emerald-600/30 bg-emerald-900/10" },
  app: { label: "Application Tier", accent: "text-sky-300", tint: "border-sky-600/30 bg-sky-900/10" },
  db: { label: "Database Tier", accent: "text-violet-300", tint: "border-violet-600/30 bg-violet-900/10" },
  other: { label: "Other", accent: "text-slate-300", tint: "border-slate-600/30 bg-slate-900/10" },
}

function classifySubnetTier(s: Subnet): TierKey {
  const name = (s.name || "").toLowerCase()
  // Heuristic 1 — naming convention.
  if (name.includes("private") && (name.includes("db") || name.includes("data"))) return "db"
  if (name.includes("private") && (name.includes("app") || name.includes("application"))) return "app"
  if (name.includes("public") || name.includes("web") || name.includes("dmz")) return "web"
  if (name.includes("private")) return "app"
  // Heuristic 2 — workload composition.
  const types = new Set(s.workloads.map((w) => w.type))
  if (types.size > 0 && [...types].every((t) => t.includes("rds") || t.includes("database"))) return "db"
  // Heuristic 3 — public/private fallback.
  if (s.is_public) return "web"
  return s.workloads.length === 0 ? "other" : "app"
}

function routeTablesById(vpc: VPC): Map<string, RouteTable> {
  const m = new Map<string, RouteTable>()
  for (const rt of vpc.route_tables ?? []) m.set(rt.id, rt)
  return m
}

function TierRowsLayout({
  vpc,
  onPathIds,
  hasPath,
  routeTablesById: rtById,
}: {
  vpc: VPC
  onPathIds: Set<string>
  hasPath: boolean
  routeTablesById: Map<string, RouteTable>
}) {
  // Flatten subnets, attach az + tier, then bucket by tier.
  const byTier = useMemo(() => {
    const out: Record<TierKey, Array<{ subnet: Subnet; az: string }>> = {
      web: [], app: [], db: [], other: [],
    }
    for (const az of vpc.azs) {
      for (const s of az.subnets) {
        const tier = classifySubnetTier(s)
        out[tier].push({ subnet: s, az: az.name })
      }
    }
    return out
  }, [vpc.azs])

  const azNames = useMemo(() => vpc.azs.map((a) => a.name), [vpc.azs])
  const populatedTiers = TIER_ORDER.filter((t) => byTier[t].length > 0)

  if (populatedTiers.length === 0) {
    return <div className="text-[10px] text-slate-500 italic">No subnets to render.</div>
  }

  return (
    <div className="flex flex-col gap-3">
      {/* AZ column headers — repeated across the top so columns align
          with the tier rows below. The left "tier band" column
          reserves space for the tier label. */}
      <div
        className="grid gap-2 items-center"
        style={{
          gridTemplateColumns: `100px repeat(${Math.max(azNames.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        <div /> {/* tier-band placeholder */}
        {azNames.map((az) => (
          <div key={az} className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 text-center">
            AZ · {az}
          </div>
        ))}
      </div>

      {/* Tier rows. Each tier renders its own band on the left + a
          grid of subnet cells indexed by AZ. */}
      {populatedTiers.map((tier) => {
        const meta = TIER_META[tier]
        // Bucket this tier's subnets by AZ so we can render an empty
        // cell where the customer has no subnet for an AZ in this tier
        // (matches the reference architecture's gridded look).
        const byAz = new Map<string, Subnet[]>()
        for (const { subnet, az } of byTier[tier]) {
          if (!byAz.has(az)) byAz.set(az, [])
          byAz.get(az)!.push(subnet)
        }
        return (
          <div
            key={tier}
            className={`border border-dashed ${meta.tint} rounded-md p-2`}
          >
            <div
              className="grid gap-2 items-stretch"
              style={{
                gridTemplateColumns: `100px repeat(${Math.max(azNames.length, 1)}, minmax(0, 1fr))`,
              }}
            >
              {/* Tier band — vertical label on the left, matches the
                  AWS reference's "Web Tier" / "Application Tier" /
                  "Database Tier" sidebar. */}
              <div className="flex items-center justify-center">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.accent} writing-mode-vertical-rl`}
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                  {meta.label}
                </span>
              </div>
              {azNames.map((az) => {
                const cellSubnets = byAz.get(az) ?? []
                return (
                  <div key={az} className="flex flex-col gap-2">
                    {cellSubnets.length === 0 ? (
                      <div className="border border-dashed border-slate-700/40 rounded-md py-6 text-center text-[9px] text-slate-600 italic">
                        no subnet
                      </div>
                    ) : (
                      cellSubnets.map((s) => (
                        <SubnetBox
                          key={s.id}
                          subnet={s}
                          sgs={vpc.security_groups}
                          onPathIds={onPathIds}
                          hasPath={hasPath}
                          routeTable={
                            s.route_table_id ? rtById.get(s.route_table_id) ?? null : null
                          }
                        />
                      ))
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SubnetBox({
  subnet,
  sgs,
  onPathIds,
  hasPath,
  routeTable,
}: {
  subnet: Subnet
  sgs: SG[]
  onPathIds: Set<string>
  hasPath: boolean
  routeTable: RouteTable | null
}) {
  // Public subnet → light-green tint. Private → light-blue tint.
  const tint = subnet.is_public
    ? "border-emerald-600/40 bg-emerald-800/15"
    : "border-sky-600/40 bg-sky-800/10"
  const labelColor = subnet.is_public ? "text-emerald-300" : "text-sky-300"

  // Path-overlay dim: when a path is selected, dim subnets whose id is
  // not on the path AND whose workloads are all off-path. Service-
  // agnostic — gated on id membership, not name.
  const subnetOnPath = !hasPath || onPathIds.has(subnet.id) || subnet.workloads.some((w) => onPathIds.has(w.id))
  const dimClass = hasPath && !subnetOnPath ? "opacity-30" : ""

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
    <div className={`border rounded-md p-2.5 ${tint} ${dimClass} transition-opacity`}>
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
      {/* Route Table chip + route entries — matches the AWS reference
          where each subnet card shows its associated RT with the
          actual route destinations underneath (e.g. "0.0.0.0/0 → IGW",
          "local"). Backend returns route_tables[].routes already; we
          render the first 3 entries inline so the operator can read
          the egress posture without drilling. */}
      {subnet.route_table_id && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5 mb-1">
            <div
              className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-900/15 px-1.5 py-0.5"
              title={subnet.route_table_id}
            >
              <span className="text-[8px] font-bold uppercase text-amber-300">RT</span>
              <span className="text-[8px] text-amber-200/80 font-mono">
                {shortName(subnet.route_table_id)}
              </span>
              {routeTable?.main && (
                <span className="text-[7px] font-bold uppercase text-amber-300/80 bg-amber-500/10 rounded px-1">
                  main
                </span>
              )}
            </div>
            {routeTable && (
              <span className="text-[8px] text-amber-300/60">
                {routeTable.routes.length} route
                {routeTable.routes.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {routeTable && routeTable.routes.length > 0 && (
            <div className="flex flex-wrap gap-1 pl-2">
              {routeTable.routes.slice(0, 3).map((r, i) => {
                // Target-kind tone — IGW/NAT visually distinct from
                // local routes, so the operator clocks "internet-facing"
                // at a glance.
                const isInternet = r.target_kind === "igw" || r.target_kind === "nat"
                const isLocal = r.target_kind === "local"
                const tone = isInternet
                  ? "border-violet-500/40 bg-violet-900/20 text-violet-200"
                  : isLocal
                    ? "border-slate-600/40 bg-slate-800/40 text-slate-300"
                    : "border-cyan-500/40 bg-cyan-900/20 text-cyan-200"
                return (
                  <span
                    key={`${r.cidr}-${i}`}
                    className={`text-[8px] font-mono px-1 py-0.5 rounded border ${tone}`}
                    title={r.target_id ? `${r.cidr} → ${r.target_kind} ${r.target_id}` : `${r.cidr} → ${r.target_kind}`}
                  >
                    {r.cidr} → {r.target_kind}
                  </span>
                )
              })}
              {routeTable.routes.length > 3 && (
                <span className="text-[8px] text-amber-300/60">
                  +{routeTable.routes.length - 3} more
                </span>
              )}
            </div>
          )}
          {!routeTable && (
            <div className="text-[8px] text-slate-500 italic pl-2">
              Routes not collected for this table
            </div>
          )}
        </div>
      )}

      {/* Workloads — group SG-shared workloads in a dashed SG boundary */}
      {groups.length === 0 ? (
        <div className="text-[9px] text-slate-500 italic px-2 py-3 text-center">
          (no workloads in this subnet)
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g, i) => (
            <SGBoundary
              key={i}
              sgIds={g.sgIds}
              workloads={g.workloads}
              sgById={sgById}
              onPathIds={onPathIds}
              hasPath={hasPath}
            />
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
  onPathIds,
  hasPath,
}: {
  sgIds: string[]
  workloads: Workload[]
  sgById: Map<string, SG>
  onPathIds: Set<string>
  hasPath: boolean
}) {
  const hasSg = sgIds.length > 0
  const sgOnPath = sgIds.some((id) => onPathIds.has(id))
  const sgDim = hasPath && hasSg && !sgOnPath ? "opacity-50" : ""
  return (
    <div
      className={`rounded-md p-2 ${hasSg ? "border border-dashed border-rose-500/50 bg-rose-950/10" : ""} ${sgDim} transition-opacity`}
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
          <WorkloadCard key={w.id} workload={w} onPathIds={onPathIds} hasPath={hasPath} />
        ))}
      </div>
    </div>
  )
}

function WorkloadCard({ workload, onPathIds, hasPath }: { workload: Workload; onPathIds: Set<string>; hasPath: boolean }) {
  const Icon = workloadIcon(workload.type)
  const kind = workloadKind(workload.type)
  const onPath = !hasPath || onPathIds.has(workload.id)
  // On-path workloads get an amber ring; off-path get dimmed.
  const ringClass = hasPath && onPath
    ? "ring-2 ring-amber-400/70 shadow-[0_0_12px_rgba(251,191,36,0.4)]"
    : hasPath
      ? "opacity-40"
      : ""
  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-orange-500/40 bg-orange-900/15 px-2 py-1.5 min-w-0 ${ringClass} transition-all`}
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
