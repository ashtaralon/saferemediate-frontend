"use client"

/**
 * Business System Blast Radius — verdict + the real estate map + cuts.
 *
 * This is NOT a bespoke canvas: the middle is the existing estate map
 * (`EstateMapView`, topology-v0-2) embedded and opened in attack-paths-only
 * mode. We only wrap it with the verdict header (top) and the ranked cuts
 * (bottom), both from GET /api/proxy/business-system/{system}/blast-radius.
 * Zones organize risk inside the map; VPCs stay separate network islands;
 * S3/DDB/KMS render on the map's regional rail as the shared dependency plane.
 *
 * Every value is graph-derived (CLAUDE.md #1). The verdict and the estate map
 * fetch independently, so a cold verdict never blanks the map and vice-versa.
 */

import { useEffect, useState } from "react"
import { AlertTriangle, Clock, RefreshCw, Scissors, ShieldAlert } from "lucide-react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { StatusChip } from "@/components/dashboard/v2/status-chip"
import { EstateMapView } from "@/components/topology-v0-2/estate-map-view"
import {
  type BlastRadiusResponse,
  type BlastRecommendedCut,
  CUT_CONFIDENCE_META,
} from "@/components/business-system/types"
import {
  BoundarySummaryCard,
  BrssDeltaPanel,
  TopRemediationActions,
  type DetailEnhancements,
} from "@/components/business-system/detail-enhancement-panels"
import { BoundaryEvidenceDrawer } from "@/components/business-system/boundary-evidence-drawer"

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString())

function relativeAge(seconds: number | null | undefined): string {
  if (seconds == null) return ""
  if (seconds < 90) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}

export function BlastRadiusView({ systemName }: { systemName: string }) {
  const url = `/api/proxy/business-system/${encodeURIComponent(systemName)}/blast-radius`
  const cacheKey = `bs-blast-radius:${systemName}`
  const { data, loading, error, isStale, retry } = useCachedFetch<BlastRadiusResponse>(url, {
    cacheKey,
    maxStaleMs: 10 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })

  const [pack, setPack] = useState<DetailEnhancements | null>(null)
  const [evidenceOpen, setEvidenceOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/proxy/business-system/${encodeURIComponent(systemName)}/detail-enhancements`,
          { cache: "no-store", signal: AbortSignal.timeout(120000) },
        )
        if (!res.ok) return
        const json = (await res.json()) as DetailEnhancements
        if (!cancelled) setPack(json)
      } catch {
        /* non-blocking — verdict/map still render */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [systemName])

  const d = data && data.verdict ? (data as BlastRadiusResponse) : null
  const verdictError = (!!error || !!data?.error) && !d

  return (
    <div className="min-h-screen" style={{ background: "#F4F6F8" }}>
      <div className="mx-auto max-w-[1440px] px-4 py-4">
        {d ? (
          <VerdictHeader d={d} stale={isStale || !!d.fromStaleCache} />
        ) : (
          <SlimHeader
            systemName={systemName}
            loading={loading && !verdictError}
            error={verdictError ? data?.error || error || undefined : undefined}
            onRetry={retry}
          />
        )}

        {pack && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <BrssDeltaPanel pack={pack} />
            <BoundarySummaryCard pack={pack} onOpenEvidence={() => setEvidenceOpen(true)} />
          </div>
        )}
        {pack && (
          <div className="mt-3">
            <TopRemediationActions pack={pack} />
          </div>
        )}

        {/* The estate map IS the canvas — reused verbatim, opened in
            attack-paths-only so it lands showing reachability. It manages its
            own loading / error / scope controls. */}
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {/* All-VPCs default: every VPC as its own island (the whole system),
              which is also where the empty-AZ collapse applies (e.g. alon-prod's
              empty eu-west-1c). Safe now that the keep-warm cron prewarms the
              merged topology snapshot each cycle (FE #314/#315) — before that it
              cold-502'd on first load. */}
          <EstateMapView
            systemName={systemName}
            embedded
            defaultFlowMode="attack_paths"
            defaultToAllVpcs
            collapseEmptyAzsByDefault
          />
        </div>

        {d && d.recommended_cuts.length > 0 && <CutsStrip cuts={d.recommended_cuts} />}
        {d && d.warnings.length > 0 && <WarningsLine warnings={d.warnings} />}
      </div>

      <BoundaryEvidenceDrawer
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        systemName={systemName}
      />
    </div>
  )
}

// ── verdict header ───────────────────────────────────────────────────────
function VerdictHeader({ d, stale }: { d: BlastRadiusResponse; stale: boolean }) {
  const v = d.verdict
  const ja = v.observed_jewel_access
  const topCut = d.recommended_cuts[0]
  const gen = v.data_freshness.attack_paths_generated_at
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <ShieldAlert className="h-3.5 w-3.5" style={{ color: "#00C2A8" }} />
            Business system blast radius
          </div>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-900">{d.system.name}</h1>
          <div className="mt-0.5 text-xs text-slate-500">
            acct {d.system.accounts.join(", ") || "—"} · {d.system.regions.join(", ") || "—"} ·{" "}
            {d.system.vpcs.length} {d.system.vpcs.length === 1 ? "VPC" : "VPCs"}
            {d.system.vpcs.some((x) => x.is_foreign) && " · 1 foreign / co-tenant"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-[11px] text-slate-400">
          {gen && <span>attack paths as of {new Date(gen).toLocaleString()}</span>}
          {d.from_snapshot && (
            <StatusChip tone="neutral">
              <Clock className="h-3 w-3" /> topology snapshot {relativeAge(d.snapshot_age_seconds)}
            </StatusChip>
          )}
          {stale && <StatusChip tone="amber">serving cached — refreshing…</StatusChip>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Stat value={fmt(v.attack_paths)} label="attack paths" accent="#ef4444" />
        <Stat value={fmt(v.reachable_crown_jewels)} label="crown jewels reachable" accent="#c2410c" />
        <Stat value={fmt(v.source_workloads)} label="source workloads" accent="#1d4ed8" />
        <div className="flex flex-col justify-center">
          <div className="flex flex-wrap gap-1.5">
            <StatusChip tone="blue">{fmt(ja.s3)} S3</StatusChip>
            <StatusChip tone="blue">{fmt(ja.dynamodb)} DynamoDB</StatusChip>
            <StatusChip tone="blue">{fmt(ja.kms)} KMS</StatusChip>
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">observed access</div>
        </div>
        {topCut && (
          <div className="ml-auto flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
            <Scissors className="h-4 w-4 text-amber-700" />
            <div className="text-[12px] leading-tight">
              <span className="font-semibold text-amber-800">top cut:</span>{" "}
              <span className="text-slate-700">{topCut.role_name || topCut.workload_name}</span>
              <span className="text-slate-500"> — closes {topCut.closes_paths} paths</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div className="flex flex-col justify-center">
      <div className="text-2xl font-bold leading-none" style={{ color: accent }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}

function SlimHeader({
  systemName,
  loading,
  error,
  onRetry,
}: {
  systemName: string
  loading: boolean
  error?: string
  onRetry: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <ShieldAlert className="h-3.5 w-3.5" style={{ color: "#00C2A8" }} />
          Business system blast radius
        </div>
        <h1 className="mt-0.5 text-2xl font-bold text-slate-900">{systemName}</h1>
      </div>
      {loading ? (
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" style={{ color: "#00C2A8" }} /> computing verdict…
        </span>
      ) : (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> verdict unavailable{error ? ` (${error})` : ""} — retry
        </button>
      )}
    </div>
  )
}

// ── recommended cuts strip ───────────────────────────────────────────────
function CutsStrip({ cuts }: { cuts: BlastRecommendedCut[] }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Scissors className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Recommended cuts</h2>
          <p className="text-[11px] text-slate-400">
            Customer-actionable first — each removes only unused permissions; access observed in the window is kept.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cuts.map((c) => (
          <CutCard key={`${c.rank}-${c.role_name}`} c={c} />
        ))}
      </div>
    </div>
  )
}

function CutCard({ c }: { c: BlastRecommendedCut }) {
  const [open, setOpen] = useState(false)
  const conf = CUT_CONFIDENCE_META[c.confidence] ?? CUT_CONFIDENCE_META.unknown
  const shown = c.remove_actions.slice(0, open ? c.remove_actions.length : 6)
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">
            {c.rank}
          </span>
          <span className="truncate font-semibold text-slate-800">{c.role_name || c.workload_name || "role"}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusChip tone={conf.tone}>{conf.label}</StatusChip>
          <span className="text-[11px] font-semibold text-slate-500">closes {c.closes_paths}</span>
        </div>
      </div>
      {c.is_aws_managed && (
        <div className="mt-2 flex items-center gap-1 rounded bg-slate-50 px-2 py-1 text-[10px] text-slate-500">
          <AlertTriangle className="h-3 w-3" /> AWS-managed service role — surfaced, not customer-modifiable
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {shown.map((a) => (
          <span
            key={a}
            className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 font-mono text-[10px] text-red-700"
          >
            {a}
          </span>
        ))}
        {c.remove_actions.length > 6 && (
          <button onClick={() => setOpen((v) => !v)} className="text-[10px] font-medium text-slate-500 hover:text-slate-700">
            {open ? "show less" : `+${c.remove_actions.length - 6} more`}
          </button>
        )}
      </div>
      <p className="mt-2 flex items-start gap-1 text-[10px] leading-snug text-emerald-700">
        <span className="mt-px">✓</span>
        {c.observed_safe_note}
      </p>
    </div>
  )
}

function WarningsLine({ warnings }: { warnings: BlastRadiusResponse["warnings"] }) {
  const tone = (s: string): "blue" | "amber" | "red" =>
    s === "critical" ? "red" : s === "warning" ? "amber" : "blue"
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 px-1 text-[11px] text-slate-400">
      {warnings.map((w) => (
        <span key={w.code} className="flex items-center gap-1">
          <StatusChip tone={tone(w.severity)}>{w.code}</StatusChip>
          <span>{w.message}</span>
        </span>
      ))}
    </div>
  )
}
