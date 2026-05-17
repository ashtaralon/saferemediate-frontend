"use client"

/**
 * CrownJewelEgressView — "where would the data go if exfiltrated"
 *
 * The inverse of the Crown Jewel Protection Plan (inbound attack paths).
 * Pivots from each crown jewel (S3 / DynamoDB / KMS) to its CloudTrail-
 * observed READERS, then renders each reader's egress topology
 * (subnet · SG · route table) plus the account-scope inspection-layer
 * finding (whether any AWS Network Firewall / WAFv2 is deployed at
 * all).
 *
 * Top-level finding chip surfaces "NO EGRESS INSPECTION" when zero
 * firewalls exist — the killer-slide one-liner ("18 crown jewels can
 * exfil through 0 inspection points"). Per-row NO FW lane reinforces
 * the same fact in-context for every reader.
 *
 * UX contract:
 *   - Three-state (live / loading / not-wired) — no fabricated numbers.
 *   - Vendor-neutral copy ("Egress inspection" not "AWS Network
 *     Firewall" as the customer-facing label, though we cite the
 *     specific AWS product name in the recommendation text since
 *     that's the actionable thing).
 *   - List-first: scrollable list with the highest-reader-count crown
 *     jewel at the top. Each row collapsible to show readers.
 *   - The NO FW lane is rendered ONCE per reader card as a muted
 *     amber strip between the route table and the gateway — the
 *     literal place AWS Network Firewall would sit if deployed.
 */

import { useEffect, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Database,
  Key,
  Loader2,
  Network,
  ShieldOff,
  Globe,
} from "lucide-react"

// ---------- Backend response shape -----------------------------------

interface CJReader {
  workload_id: string | null
  workload_name: string | null
  workload_labels?: string[] | null
  subnet_id: string | null
  subnet_name: string | null
  subnet_is_public: boolean | null
  route_table_id: string | null
  sg_ids?: string[] | null
}

interface CrownJewel {
  id: string
  name: string
  labels: string[]
  kind: "S3" | "DynamoDB" | "KMS" | "Other"
  reader_count: number
  readers: CJReader[]
}

interface InspectionLayer {
  network_firewall_count: number
  wafv2_count: number
  has_inspection: boolean
  affected_crown_jewels: number
  affected_workloads: number
  finding: "NO_EGRESS_INSPECTION" | null
  message: string
}

interface CJEgressResponse {
  systemName: string
  lookback_days: number
  crownJewels: CrownJewel[]
  inspection_layer: InspectionLayer
  timestamp?: string
  error?: string
}

// ---------- Component ------------------------------------------------

export function CrownJewelEgressView({ systemName }: { systemName: string }) {
  const [data, setData] = useState<CJEgressResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!systemName) return
    setLoading(true)
    setErr(null)
    fetch(
      `/api/proxy/crown-jewels/egress?systemName=${encodeURIComponent(systemName)}&lookbackDays=30&maxJewels=20`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error || `HTTP ${r.status}`)
        }
        return r.json() as Promise<CJEgressResponse>
      })
      .then((j) => setData(j))
      .catch((e: any) => setErr(e?.message || "fetch failed"))
      .finally(() => setLoading(false))
  }, [systemName])

  if (loading && !data) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-8 text-center">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
        <p className="text-slate-200 text-sm font-medium">Loading crown-jewel egress…</p>
        <p className="text-slate-500 text-xs mt-1">Pivoting from data assets to observed readers</p>
      </div>
    )
  }
  if (err) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-5">
        <div className="flex items-center gap-2 text-rose-300 mb-1">
          <AlertTriangle className="w-5 h-5" /> <span className="font-semibold">Failed to load</span>
        </div>
        <p className="text-rose-200/90 text-sm font-mono">{err}</p>
      </div>
    )
  }
  if (!data || (data.crownJewels.length === 0 && !data.inspection_layer)) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-8 text-center">
        <Database className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 text-sm font-medium">No crown jewels in this system</p>
        <p className="text-slate-500 text-xs mt-1">
          S3 buckets, DynamoDB tables, and KMS keys tagged to{" "}
          <span className="font-mono">{systemName}</span> will surface here.
        </p>
      </div>
    )
  }

  const cjs = data.crownJewels
  const insp = data.inspection_layer
  const totalReaders = cjs.reduce((s, c) => s + c.reader_count, 0)

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      {/* ---- Header strip ---- */}
      <div className="px-5 py-3 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 flex items-center gap-3">
        <div className="w-9 h-9 bg-amber-500/15 rounded-xl flex items-center justify-center">
          <ShieldOff className="w-4 h-4 text-amber-300" />
        </div>
        <div className="flex flex-col min-w-0">
          <h3 className="text-white font-semibold text-sm">Crown Jewel Egress</h3>
          <p className="text-slate-400 text-[10px]">
            {systemName} · {cjs.length} crown jewel{cjs.length === 1 ? "" : "s"} ·{" "}
            {totalReaders} observed reader{totalReaders === 1 ? "" : "s"} ·{" "}
            {data.lookback_days}-day window
          </p>
        </div>
      </div>

      {/* ---- Top-level inspection-layer finding (the killer-slide one-liner) ---- */}
      {insp.finding === "NO_EGRESS_INSPECTION" && (
        <div className="px-5 py-3 bg-rose-500/[0.07] border-b border-rose-500/30">
          <div className="flex items-baseline gap-3">
            <ShieldOff className="w-4 h-4 text-rose-300 shrink-0 translate-y-1" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-rose-200">
                No egress inspection deployed
              </div>
              <div className="text-base font-semibold text-rose-50 mt-0.5">
                {insp.affected_crown_jewels} crown jewel{insp.affected_crown_jewels === 1 ? "" : "s"} ·{" "}
                {insp.affected_workloads} reader workload{insp.affected_workloads === 1 ? "" : "s"} ·{" "}
                zero inspection points
              </div>
              <p className="mt-1 text-[11px] text-rose-200/80 leading-relaxed max-w-3xl">
                {insp.message}
              </p>
            </div>
          </div>
        </div>
      )}
      {insp.has_inspection && (
        <div className="px-5 py-2 bg-emerald-500/[0.06] border-b border-emerald-500/30 text-[11px] text-emerald-100">
          Egress inspection deployed: {insp.network_firewall_count} Network Firewall ·{" "}
          {insp.wafv2_count} WAFv2 (regional).
        </div>
      )}

      {/* ---- Crown-jewel list ---- */}
      <div className="px-5 py-4 space-y-2">
        {cjs.length === 0 && (
          <div className="text-center text-slate-500 text-[11px] py-8">
            No data-class resources (S3 / DynamoDB / KMS) tagged to {systemName}.
          </div>
        )}
        {cjs.map((cj) => (
          <CrownJewelCard
            key={cj.id}
            jewel={cj}
            hasInspectionLayer={insp.has_inspection}
          />
        ))}
      </div>
    </div>
  )
}

// ---------- Per-CJ card ----------------------------------------------

function CrownJewelCard({
  jewel,
  hasInspectionLayer,
}: {
  jewel: CrownJewel
  hasInspectionLayer: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const KindIcon = jewel.kind === "DynamoDB" ? Database : jewel.kind === "KMS" ? Key : Database
  const kindColor =
    jewel.kind === "S3"
      ? "#a78bfa"
      : jewel.kind === "DynamoDB"
        ? "#60a5fa"
        : jewel.kind === "KMS"
          ? "#fcd34d"
          : "#94a3b8"

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.02]"
      >
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-md shrink-0"
          style={{ background: kindColor + "20" }}
        >
          <KindIcon className="w-4 h-4" style={{ color: kindColor }} />
        </span>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-semibold text-slate-100 truncate">{jewel.name}</span>
          <span className="text-[10px] uppercase tracking-wider font-semibold mt-0.5" style={{ color: kindColor }}>
            {jewel.kind}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          Read by
        </span>
        <span className="text-lg font-semibold tabular-nums text-slate-100">{jewel.reader_count}</span>
        <ChevronRight
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-slate-800 bg-slate-950/40">
          {jewel.readers.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic py-3 text-center">
              No CloudTrail-observed reads in the 30-day window.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800/60">
              {jewel.readers.map((r, i) => (
                <li key={`${r.workload_id}-${i}`} className="py-2.5">
                  <ReaderChain reader={r} hasInspectionLayer={hasInspectionLayer} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Per-reader egress chain ---------------------------------

function ReaderChain({
  reader,
  hasInspectionLayer,
}: {
  reader: CJReader
  hasInspectionLayer: boolean
}) {
  const isPrincipal =
    !reader.subnet_id &&
    !reader.route_table_id &&
    (reader.workload_labels || []).some((l) => /IAMRole|IAMUser|Principal/.test(l))

  return (
    <div className="flex items-center gap-2 text-[11px] flex-wrap">
      {/* Reader identity */}
      <span className="font-semibold text-slate-100 truncate" title={reader.workload_id || ""}>
        {reader.workload_name || reader.workload_id || "(unknown)"}
      </span>
      {isPrincipal && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border border-purple-500/40 bg-purple-500/10 text-purple-200">
          Principal · not in VPC
        </span>
      )}
      {reader.subnet_is_public === true && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border border-amber-500/40 bg-amber-500/10 text-amber-200">
          Public subnet
        </span>
      )}
      {reader.subnet_is_public === false && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
          Private subnet
        </span>
      )}

      {/* Chain — show only if we have egress topology (skip for principals) */}
      {!isPrincipal && reader.subnet_id && (
        <>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <span className="font-mono text-[10px] text-slate-400" title={reader.subnet_id}>
            {reader.subnet_name || reader.subnet_id}
          </span>
        </>
      )}
      {!isPrincipal && (reader.sg_ids || []).length > 0 && (
        <>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <span className="font-mono text-[10px] text-orange-300">
            {reader.sg_ids![0]}
            {reader.sg_ids!.length > 1 && (
              <span className="text-slate-500"> +{reader.sg_ids!.length - 1}</span>
            )}
          </span>
        </>
      )}
      {!isPrincipal && reader.route_table_id && (
        <>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <span className="font-mono text-[10px] text-indigo-200">{reader.route_table_id}</span>
        </>
      )}

      {/* The NO FW lane — rendered as a separate strip in the chain.
          Reads as the literal place AWS Network Firewall would sit
          between the route table and the egress gateway. */}
      {!isPrincipal && reader.subnet_id && !hasInspectionLayer && (
        <>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200">
            <ShieldOff className="w-2.5 h-2.5" />
            <span className="text-[9px] font-semibold uppercase tracking-wider">No FW</span>
          </span>
        </>
      )}

      {/* Egress gateway placeholder — we don't yet have per-reader
          gateway resolved here (would require joining the route
          table's ROUTES_VIA edges). Phase 2 hooks in. */}
      {!isPrincipal && reader.subnet_id && (
        <>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Globe className="w-3 h-3" />
            <span className="text-[10px]">internet</span>
          </span>
        </>
      )}
    </div>
  )
}
