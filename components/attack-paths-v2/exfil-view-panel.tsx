"use client"

/**
 * EXFIL View Panel — Phase A.
 *
 * The "where does the data go?" view. Complement of the Attacker
 * View (which answers "how does the attacker reach the jewel?").
 * BFS direction inverts: jewel is the SOURCE on the LEFT, exit
 * points are SINKS on the RIGHT.
 *
 * Five-column layout per PRD:
 *
 *   SOURCE → ACCESSORS → EGRESS PLANES → EXTERNAL GATES → DESTINATIONS
 *
 * EGRESS PLANES is three grouped sub-lanes:
 *   - NETWORK            (Phase A — populated)
 *   - IDENTITY           (Phase B — not-wired card)
 *   - DATA PROPAGATION   (Phase C — not-wired card)
 *
 * Color contract (the canonical Allowed-vs-Actual frame applied to
 * the exit side):
 *   capable  → amber outline   (allowed, no observation yet)
 *   observed → red fill        (CloudTrail-confirmed exfil)
 *
 * Render strategy: hand-rolled 5-column grid in this component, NOT
 * via TrafficFlowMap. TFM is sized for the REACH view (8-9 lanes,
 * polyline routing through SG/NACL/IGW); the EXFIL view has
 * different semantics and rendering it on TFM would force the
 * wrong shape.
 */

import { useMemo } from "react"
import { Crown, AlertTriangle, ArrowRight, RefreshCw, Globe, Key, Database, Server, Shield } from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { FreshnessBanner } from "@/components/freshness-banner"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"

// ─── Types ─────────────────────────────────────────────────────────

interface ExfilAccessor {
  id: string
  name: string
  type: string
  provenance: "capable" | "observed"
  allowed_actions_count: number | null
  used_actions_count: number | null
  unused_actions_count: number | null
  rel_types: string[]
  hit_count: number
  total_bytes: number
  last_seen: string | null
}

interface ExfilNetworkEgressItem {
  kind: string
  id: string
  name: string
  via_workload: { id: string; name: string; type: string }
  via_subnet: { id: string; name: string; public: boolean | null }
  via_vpc: { id: string; name: string }
  provenance: "capable" | "observed"
}

interface ExfilLaneNotWired {
  items: unknown[]
  not_wired: true
  not_wired_reason: string
}

interface ExfilDestination {
  kind: "internet" | "external_account" | "external_region"
  id: string
  label: string
  capable_route_count: number
  observed_route_count: number
  observed_bytes_24h: number
  icon: string
  provenance: "capable" | "observed"
}

interface ExfilPayload {
  ok: boolean
  error?: string
  system_name?: string
  jewel: { id: string; name: string; type: string; classification: string | null }
  accessors: ExfilAccessor[]
  egress_lanes: {
    network: ExfilNetworkEgressItem[]
    identity: ExfilLaneNotWired
    data_propagation: ExfilLaneNotWired
  }
  destinations: ExfilDestination[]
  observed_exfil: { available: boolean; not_wired_reason: string }
  freshness: {
    graph_last_synced_at_iso: string | null
    computed_at_iso: string
  }
  phase: string
  phase_note: string
}

// ─── Component ─────────────────────────────────────────────────────

interface ExfilViewPanelProps {
  systemName: string
  jewel: CrownJewelSummary | null
}

export function ExfilViewPanel({ systemName, jewel }: ExfilViewPanelProps) {
  const requestBody = useMemo(
    () =>
      JSON.stringify({
        system_name: systemName,
        jewel_id: jewel?.id ?? "",
        include_capable: true,
        include_observed: true,
        max_destinations: 50,
      }),
    [systemName, jewel?.id],
  )

  const fetchInit = useMemo<RequestInit>(
    () => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    }),
    [requestBody],
  )

  const enabled = !!systemName && !!jewel?.id
  const { data, loading, error, retry, retrying, attempt } = useRetryFetch<ExfilPayload>(
    enabled ? "/api/proxy/attack-chain/exfil-paths" : null,
    {
      fetchInit,
      refetchKey: `${systemName}:${jewel?.id ?? ""}`,
      maxRetries: 2,
      initialDelayMs: 1000,
    },
  )

  if (!enabled) {
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Select a crown jewel to see its exfil surface" />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          No crown jewel selected.
        </div>
      </div>
    )
  }

  if (loading) {
    const retryLabel =
      retrying && attempt > 0
        ? `Backend was slow — retrying (attempt ${attempt + 1})…`
        : "Walking forward from the jewel — mapping every door the data can leave through…"
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Computing the exfiltration surface…" />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          {retryLabel}
        </div>
      </div>
    )
  }

  if (error || !data || !data.ok) {
    const msg = error || data?.error || "Exfil paths failed"
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Could not load exfil view" />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 max-w-md text-sm text-red-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-semibold">Exfil view failed</span>
            </div>
            <div className="text-xs text-red-200/80">{msg}</div>
            <button
              type="button"
              onClick={retry}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/20"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  const capableCount = data.accessors.filter((a) => a.provenance === "capable").length
  const observedCount = data.accessors.filter((a) => a.provenance === "observed").length
  const destInternet = data.destinations.find((d) => d.kind === "internet")
  const subtitle = `${data.accessors.length} accessor${data.accessors.length === 1 ? "" : "s"} · ${data.egress_lanes.network.length} network egress route${data.egress_lanes.network.length === 1 ? "" : "s"} · ${data.destinations.length} destination${data.destinations.length === 1 ? "" : "s"}`

  return (
    <div className="flex flex-col h-full">
      <Header jewel={jewel} subtitle={subtitle} />

      {/* Five-column EXFIL grid. Each section is its own scroll-stable
          column so a heavy ACCESSORS list doesn't shift the EGRESS or
          DESTINATIONS columns. */}
      <div className="flex-1 overflow-auto p-6 bg-slate-950">
        <div className="grid grid-cols-[minmax(180px,220px)_minmax(220px,1fr)_minmax(420px,2fr)_minmax(140px,180px)_minmax(220px,1fr)] gap-4">
          {/* ─── Col 1: SOURCE (the crown jewel) ─── */}
          <Column title="SOURCE" icon={<Crown className="w-3.5 h-3.5 text-amber-400" />}>
            <SourceCard jewel={data.jewel} />
          </Column>

          {/* ─── Col 2: ACCESSORS ─── */}
          <Column
            title={`ACCESSORS (${data.accessors.length})`}
            icon={<Key className="w-3.5 h-3.5 text-pink-400" />}
            subtitle={
              data.accessors.length > 0
                ? `${capableCount} capable · ${observedCount} observed`
                : undefined
            }
          >
            {data.accessors.length === 0 ? (
              <Empty label="No roles or principals can reach this jewel." />
            ) : (
              data.accessors.map((a) => <AccessorCard key={a.id} accessor={a} />)
            )}
          </Column>

          {/* ─── Col 3: EGRESS PLANES (3 sub-lanes) ─── */}
          <Column title="EGRESS PLANES" icon={<ArrowRight className="w-3.5 h-3.5 text-slate-300" />}>
            <div className="grid grid-cols-3 gap-3">
              <SubLane title="NETWORK" tone="cyan">
                {data.egress_lanes.network.length === 0 ? (
                  <Empty label="No network egress route discovered." />
                ) : (
                  data.egress_lanes.network.map((e, i) => (
                    <NetworkEgressCard key={`${e.kind}:${e.id}:${i}`} item={e} />
                  ))
                )}
              </SubLane>
              <SubLane title="IDENTITY" tone="violet">
                <NotWired reason={data.egress_lanes.identity.not_wired_reason} />
              </SubLane>
              <SubLane title="DATA PROP" tone="emerald">
                <NotWired reason={data.egress_lanes.data_propagation.not_wired_reason} />
              </SubLane>
            </div>
          </Column>

          {/* ─── Col 4: EXTERNAL GATES (the conceptual hop between
                  egress and the destination world) ─── */}
          <Column title="EXTERNAL GATES" icon={<Shield className="w-3.5 h-3.5 text-orange-300" />}>
            <ExternalGatesSummary
              networkEgress={data.egress_lanes.network}
              destinations={data.destinations}
            />
          </Column>

          {/* ─── Col 5: DESTINATIONS ─── */}
          <Column
            title={`DESTINATIONS (${data.destinations.length})`}
            icon={<Globe className="w-3.5 h-3.5 text-amber-400" />}
          >
            {data.destinations.length === 0 ? (
              <Empty label="No exfil destination resolved from current data." />
            ) : (
              data.destinations.map((d) => <DestinationCard key={d.id} dest={d} />)
            )}
          </Column>
        </div>

        {/* Phase A honest footer — calls out which lanes are
            not-wired and why so the operator isn't surprised. */}
        <div className="mt-6 rounded-md border border-slate-800 bg-slate-900/40 p-3 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">Phase {data.phase}: </span>
          {data.phase_note}
        </div>
      </div>
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────

function Header({ jewel, subtitle }: { jewel: CrownJewelSummary | null; subtitle: string }) {
  return (
    <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur sticky top-0 z-10 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1.5">
          <ArrowRight className="h-3 w-3 text-amber-300" />
          EXFIL VIEW · where the data leaves
          <FreshnessBanner variant="pill" className="ml-2" />
        </div>
        <div className="text-[11px] text-slate-400">{subtitle}</div>
      </div>
      {jewel && (
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 justify-end mb-0.5">
            <Crown className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">source</span>
          </div>
          <div
            className="text-xs font-mono text-amber-200/90 truncate max-w-[260px]"
            title={jewel.name}
          >
            {jewel.name}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Layout primitives ───────────────────────────────────────────────

function Column({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string
  icon?: React.ReactNode
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-2">
        {icon}
        {title}
      </div>
      {subtitle && <div className="text-[10px] text-slate-500 -mt-2 mb-1">{subtitle}</div>}
      {children}
    </div>
  )
}

function SubLane({
  title,
  tone,
  children,
}: {
  title: string
  tone: "cyan" | "violet" | "emerald"
  children: React.ReactNode
}) {
  const toneClass = {
    cyan: "text-cyan-300 border-cyan-500/30 bg-cyan-500/5",
    violet: "text-violet-300 border-violet-500/30 bg-violet-500/5",
    emerald: "text-emerald-300 border-emerald-500/30 bg-emerald-500/5",
  }[tone]
  return (
    <div className={`flex flex-col gap-2 rounded-lg border ${toneClass} p-2 min-w-0`}>
      <div className={`text-[10px] font-bold uppercase tracking-wider`}>{title}</div>
      {children}
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return <div className="text-[11px] text-slate-500 italic p-2">{label}</div>
}

function NotWired({ reason }: { reason: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-700/80 bg-slate-800/30 p-2.5">
      <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
        Backend not wired
      </div>
      <div className="text-[10px] text-slate-400 leading-snug">{reason}</div>
    </div>
  )
}

// ─── Cards ───────────────────────────────────────────────────────────

function SourceCard({ jewel }: { jewel: ExfilPayload["jewel"] }) {
  return (
    <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/5 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Crown className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">
          {jewel.type}
        </span>
      </div>
      <div className="text-xs font-mono text-slate-100 break-all" title={jewel.name}>
        {jewel.name}
      </div>
      {jewel.classification && (
        <div className="mt-1.5 inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-500/15 text-amber-200 border border-amber-500/30">
          {jewel.classification}
        </div>
      )}
    </div>
  )
}

function AccessorCard({ accessor }: { accessor: ExfilAccessor }) {
  const isObserved = accessor.provenance === "observed"
  const toneCls = isObserved
    ? "border-red-500/60 bg-red-500/10"
    : "border-amber-500/40 bg-amber-500/5"
  const provenanceCls = isObserved
    ? "bg-red-600 text-white"
    : "bg-amber-500/20 text-amber-200 border border-amber-500/40"
  return (
    <div className={`rounded-lg border-2 ${toneCls} p-2.5 transition-colors`} title={accessor.id}>
      <div className="flex items-center gap-1.5 mb-1">
        <Key className="w-3 h-3 text-pink-400 shrink-0" />
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
          {accessor.type}
        </span>
        <span className={`ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded ${provenanceCls}`}>
          {accessor.provenance}
        </span>
      </div>
      <div className="text-xs font-semibold text-slate-100 truncate" title={accessor.name}>
        {accessor.name}
      </div>
      {(accessor.allowed_actions_count != null || accessor.used_actions_count != null) && (
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
          {accessor.allowed_actions_count != null && (
            <span>
              <span className="text-slate-200">{accessor.allowed_actions_count}</span> allowed
            </span>
          )}
          {accessor.used_actions_count != null && (
            <>
              <span className="text-slate-600">·</span>
              <span>
                <span className="text-slate-200">{accessor.used_actions_count}</span> used
              </span>
            </>
          )}
        </div>
      )}
      {isObserved && accessor.hit_count > 0 && (
        <div className="mt-1 text-[10px] text-red-300">
          {accessor.hit_count.toLocaleString()} hits observed
        </div>
      )}
    </div>
  )
}

function NetworkEgressCard({ item }: { item: ExfilNetworkEgressItem }) {
  const kindPalette =
    item.kind === "InternetGateway"
      ? "border-amber-500/40 bg-amber-500/10"
      : item.kind === "NATGateway"
        ? "border-sky-500/40 bg-sky-500/10"
        : "border-slate-600 bg-slate-800/40"
  const kindLabel =
    item.kind === "InternetGateway"
      ? "IGW"
      : item.kind === "NATGateway"
        ? "NAT"
        : item.kind === "EgressOnlyInternetGateway"
          ? "Egress IGW"
          : item.kind === "TransitGateway"
            ? "TGW"
            : item.kind
  return (
    <div className={`rounded-md border ${kindPalette} p-2`} title={`${item.kind} ${item.id} via ${item.via_workload.name}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Globe className="w-3 h-3 text-amber-300" />
        <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">
          {kindLabel}
        </span>
      </div>
      <div className="text-[10px] font-mono text-slate-200 truncate" title={item.name}>
        {item.name}
      </div>
      <div className="mt-1 text-[9px] text-slate-500 truncate">
        via {item.via_workload.name}
        {item.via_subnet.public === true ? " · public subnet" : ""}
      </div>
    </div>
  )
}

function ExternalGatesSummary({
  networkEgress,
  destinations,
}: {
  networkEgress: ExfilNetworkEgressItem[]
  destinations: ExfilDestination[]
}) {
  // Phase A only really has one external gate: the Internet, reached
  // via IGW/NAT. We render a single card summarizing the count and
  // type breakdown. Future phases (cross-account, cross-region) add
  // sibling cards here.
  const igwCount = networkEgress.filter((e) => e.kind === "InternetGateway").length
  const natCount = networkEgress.filter((e) => e.kind === "NATGateway").length
  const reachableInternet = igwCount + natCount > 0
  if (!reachableInternet && destinations.length === 0) {
    return <Empty label="No external gate reachable from existing edges." />
  }
  return (
    <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Shield className="w-3.5 h-3.5 text-orange-300" />
        <span className="text-[10px] uppercase tracking-wider text-orange-200 font-bold">
          public boundary
        </span>
      </div>
      <div className="text-xs font-semibold text-slate-100">VPC → Internet</div>
      <div className="mt-1 text-[10px] text-slate-400">
        {igwCount} IGW · {natCount} NAT
      </div>
      <div className="mt-2 text-[10px] text-slate-500">
        Cross-account + cross-region gates land with Phase C collectors.
      </div>
    </div>
  )
}

function DestinationCard({ dest }: { dest: ExfilDestination }) {
  const isObserved = dest.observed_route_count > 0
  const toneCls = isObserved
    ? "border-red-500/60 bg-red-500/10"
    : "border-amber-500/40 bg-amber-500/5"
  return (
    <div className={`rounded-lg border-2 ${toneCls} p-3`} title={dest.label}>
      <div className="flex items-center gap-1.5 mb-1">
        {dest.kind === "internet" ? (
          <Globe className="w-3.5 h-3.5 text-amber-300" />
        ) : dest.kind === "external_account" ? (
          <Database className="w-3.5 h-3.5 text-violet-300" />
        ) : (
          <Server className="w-3.5 h-3.5 text-emerald-300" />
        )}
        <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">
          {dest.kind.replace("_", " ")}
        </span>
      </div>
      <div className="text-sm font-bold text-slate-100">{dest.label}</div>
      <div className="mt-2 flex flex-col gap-1 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-amber-300">Capable routes</span>
          <span className="font-semibold text-amber-200">{dest.capable_route_count}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-red-300">Observed routes</span>
          <span className="font-semibold text-red-200">{dest.observed_route_count}</span>
        </div>
        {dest.observed_bytes_24h > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-red-300">Bytes / 24h</span>
            <span className="font-semibold text-red-200">{formatBytes(dest.observed_bytes_24h)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}
