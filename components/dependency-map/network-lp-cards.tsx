"use client"

// Network-LP route cards — consumes the canonical api/network-lp/routes endpoint
// (NOT the raw graph) and renders candidate-grade blast-radius findings per
// subnet. Five card types: Unused Internet Access, Unused Cross-Network Route,
// Shared Route Table, AWS Service Path, Blackhole Route.
//
// Wording is deliberately candidate-grade. We say "configured path exists, no
// observed traffic requires it — candidate for blast-radius reduction." We never
// say "safe to remove" — that waits on hard gates + rollback/clone-reassociate.

import { useCallback, useEffect, useState } from "react"
import {
  Globe,
  GitBranch,
  Layers,
  Cloud,
  Ban,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from "lucide-react"

// ── Wire shapes (mirror api/network_lp_routes.py) ───────────────────────────
export interface RouteOut {
  route_id: string
  destination_cidr?: string | null
  target_kind?: string | null
  path_type: string
  risk_category: string
  used: boolean
  matched_flow_count: number
  last_used?: string | null
  recommendation: string
  suggested_cidr?: string | null
  blast_radius_reduction: string
  confidence: string
  safety_reasons: string[]
  rationale: string
  observed_aws_services: string[]
  observed_external_flows: number
  via_route_table?: string | null
  shared_route_table: boolean
  route_state?: string | null
  route_origin?: string | null
}
export interface NetworkLpResponse {
  subnet_id: string
  observation_days?: number | null
  route_count: number
  candidate_count: number
  routes: RouteOut[]
}

export type CardKind = "INTERNET" | "CROSS_NETWORK" | "SHARED_RT" | "AWS_SERVICE" | "BLACKHOLE"

export function classify(r: RouteOut): CardKind | null {
  if ((r.route_state || "").toLowerCase() === "blackhole") return "BLACKHOLE"
  // KEEP is never a candidate — not even on a shared route table. Without this
  // guard the `|| r.shared_route_table` below promoted every KEEP/local/VPCE
  // route on a shared RT to a SHARED_RT card, inflating the headline count
  // ("21 candidates" when only 3 were actionable). This page is candidate-grade:
  // only actionable recommendations count (the backend's candidate_count agrees).
  if (r.recommendation === "KEEP") return null
  if (r.recommendation === "SPLIT_ROUTE_TABLE_FIRST" || r.shared_route_table) return "SHARED_RT"
  if (r.path_type === "AWS_SERVICE" || r.recommendation === "REPLACE_NAT_WITH_VPCE") return "AWS_SERVICE"
  if (r.recommendation === "REMOVE_ROUTE_CANDIDATE" || r.recommendation === "NARROW_ROUTE_CIDR") {
    if (r.path_type === "PUBLIC_INTERNET" || r.path_type === "OUTBOUND_INTERNET") return "INTERNET"
    if (r.path_type === "CROSS_VPC" || r.path_type === "ENTERPRISE_NETWORK") return "CROSS_NETWORK"
  }
  return null // KEEP / used / local → no finding
}

export const CARD_META: Record<CardKind, { title: string; accent: string; Icon: any }> = {
  INTERNET: { title: "Unused Internet Access", accent: "red", Icon: Globe },
  CROSS_NETWORK: { title: "Unused Cross-Network Route", accent: "purple", Icon: GitBranch },
  SHARED_RT: { title: "Shared Route Table", accent: "amber", Icon: Layers },
  AWS_SERVICE: { title: "AWS Service Path", accent: "teal", Icon: Cloud },
  BLACKHOLE: { title: "Blackhole Route", accent: "slate", Icon: Ban },
}

const ACCENT: Record<string, string> = {
  red: "border-l-red-500/70 bg-red-500/5",
  purple: "border-l-purple-500/70 bg-purple-500/5",
  amber: "border-l-amber-500/70 bg-amber-500/5",
  teal: "border-l-teal-500/70 bg-teal-500/5",
  slate: "border-l-slate-500/70 bg-slate-500/5",
}

function meaningLine(kind: CardKind, r: RouteOut, days?: number | null): string {
  const w = days ? `the ${days}-day observation window` : "the observation window"
  switch (kind) {
    case "INTERNET":
      return `Configured internet path exists, but no internet-bound traffic was observed during ${w}. Candidate for blast-radius reduction (public exposure / exfiltration).`
    case "CROSS_NETWORK":
      return r.suggested_cidr
        ? `Cross-network route is broad; observed traffic only reaches ${r.suggested_cidr} during ${w}. Candidate to narrow the route.`
        : `Configured cross-network path exists, but no traffic to this destination was observed during ${w}. Candidate for blast-radius reduction (lateral movement).`
    case "SHARED_RT":
      return `This route table is associated with multiple subnets. Any change may affect other systems — split the route table before narrowing.`
    case "AWS_SERVICE":
      return r.recommendation === "REPLACE_NAT_WITH_VPCE"
        ? `Observed egress is AWS-service-only (${r.observed_aws_services.join(", ") || "AWS"}). Candidate to move this to a VPC endpoint instead of the internet path.`
        : `Traffic uses a private AWS-service path (VPC endpoint / prefix list). Usually retained.`
    case "BLACKHOLE":
      return `Route target exists but the route state is blackhole — traffic to ${r.destination_cidr || "this destination"} is dropped. Likely a misconfiguration to review.`
  }
}

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    muted: "bg-muted text-muted-foreground border-border",
    blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${tones[tone] ?? tones.muted}`}>
      {children}
    </span>
  )
}

export function RouteCard({ kind, r, days }: { kind: CardKind; r: RouteOut; days?: number | null }) {
  const meta = CARD_META[kind]
  const isAdvisoryKeep = kind === "AWS_SERVICE" && r.recommendation === "KEEP"
  return (
    <div className={`rounded-md border border-border border-l-4 p-2.5 ${ACCENT[meta.accent]}`}>
      <div className="flex items-center gap-2 mb-1">
        <meta.Icon className="w-4 h-4 shrink-0" />
        <span className="text-xs font-semibold">{meta.title}</span>
        <span className="ml-auto flex items-center gap-1">
          {r.target_kind && <Chip>{r.target_kind}</Chip>}
          {r.route_origin === "EnableVgwRoutePropagation" && <Chip tone="amber">propagated</Chip>}
        </span>
      </div>

      <div className="text-[11px] font-mono text-foreground/80 mb-1">
        {r.destination_cidr || "(prefix list)"} → {r.target_kind}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground mb-1.5">
        {meaningLine(kind, r, days)}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <Chip>{r.used ? `${r.matched_flow_count} flows` : "0 observed flows"}</Chip>
        {!isAdvisoryKeep && <Chip tone="blue">{r.recommendation.replaceAll("_", " ")}</Chip>}
        {!isAdvisoryKeep && <Chip>confidence: {r.confidence}</Chip>}
        {r.via_route_table && <Chip>{r.via_route_table}</Chip>}
      </div>

      {!isAdvisoryKeep && (
        <div className="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> {r.blast_radius_reduction}
        </div>
      )}
      {r.safety_reasons.length > 0 && (
        <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{r.safety_reasons.join(" · ")}</span>
        </div>
      )}
      {!isAdvisoryKeep && (
        <div className="mt-1 text-[9px] uppercase tracking-wide text-muted-foreground">
          Candidate only — not validated for automatic removal
        </div>
      )}
    </div>
  )
}

// Card render priority (most actionable first).
const ORDER: CardKind[] = ["INTERNET", "CROSS_NETWORK", "BLACKHOLE", "SHARED_RT", "AWS_SERVICE"]

export function NetworkLpCards({
  subnetId,
  subnetLabel,
}: {
  subnetId: string
  subnetLabel?: string
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<NetworkLpResponse | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/proxy/network-lp-routes?subnet_id=${encodeURIComponent(subnetId)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData((await res.json()) as NetworkLpResponse)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load route findings")
    } finally {
      setLoading(false)
    }
  }, [subnetId])

  useEffect(() => {
    void load()
  }, [load])

  const cards = (data?.routes ?? [])
    .map((r) => ({ kind: classify(r), r }))
    .filter((x): x is { kind: CardKind; r: RouteOut } => x.kind !== null)
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))

  return (
    <div className="w-full max-w-[420px] text-left">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground">
          Route findings · {subnetLabel || subnetId}
        </span>
        {data && (
          <button
            onClick={() => void load()}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> {data.observation_days ?? "?"}d window
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 justify-center">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading route findings…
        </div>
      )}
      {error && !loading && (
        <div className="text-xs text-red-500 py-2">
          {error}.{" "}
          <button className="underline" onClick={() => void load()}>
            retry
          </button>
        </div>
      )}
      {!loading && !error && data && cards.length === 0 && (
        <div className="text-xs text-muted-foreground py-2">
          No route findings — configured routes match observed traffic.
        </div>
      )}
      {!loading && !error && cards.length > 0 && (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {cards.map(({ kind, r }) => (
            <RouteCard key={r.route_id} kind={kind} r={r} days={data?.observation_days} />
          ))}
        </div>
      )}
    </div>
  )
}

export default NetworkLpCards
