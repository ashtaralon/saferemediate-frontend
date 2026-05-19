"use client"

// Data Leak Paths page — Phase 2 (skeleton + per-path cards, no flow map).
//
// One section card per (internet-capable workload → accessible crown
// jewel) pair, sorted by riskScore desc. Each card surfaces:
//   - risk score + plain-English risk explanation (backend-composed)
//   - workload → data store summary
//   - network plane summary (bucket + egress gate)
//   - observed access volume (Lane 8 from the future flow map)
//   - all 4 available mitigations with applicability + stub buttons
//
// Flow map (lanes COMPUTE→SUBNET→SG→NACL→ROUTE→IGW→IAM→STORE→APIs→
// INTERNET) is Phase 3 — this file only renders header + path-cards.
// Mitigation buttons are STUBS in Phase 2 — wired to UnifiedPipeline
// endpoints in Phase 4.
//
// Per feedback_no_mock_numbers_in_ui: every count comes from the live
// /api/data-leak-paths response — never fabricated. Loading / not-wired
// states render explicit copy ("not yet computed for this system")
// instead of "0".
//
// Per feedback_demo_safe_source_labels: operator-visible strings are
// vendor-neutral — we read `dataStore.crownJewelClass` ("Object storage")
// rather than the technical `dataStore.type` ("S3Bucket"). Same for
// mitigation titles (backend already neutral).

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Globe2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import {
  DATA_LEAK_BUCKET_LABEL,
  DATA_LEAK_DEPENDENCY_LABEL,
  DATA_LEAK_RISK_BAND_CONFIG,
  type DataLeakBucket,
  type DataLeakMitigation,
  type DataLeakPath,
  type DataLeakPathsResponse,
} from "@/lib/types"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import {
  INITIAL_SHARED_OVERRIDE_STATE,
  OverrideModalShared,
  buildOverrideStateForOpen,
  type OverrideLineagePayload,
  type SharedOverrideState,
} from "@/components/override-modal-shared"
import {
  useMitigationExecution,
  type MitigationStage,
  type MitigationStageResult,
} from "@/hooks/use-mitigation-execution"
import { DataLeakFlowMap } from "./data-leak-flow-map"
import { InternetDestinationsTable } from "./internet-destinations-table"

interface Props {
  systemName: string
  days?: number
}

export function DataLeakPathsPage({ systemName, days = 30 }: Props) {
  const url = systemName
    ? `/api/proxy/data-leak-paths?systemName=${encodeURIComponent(systemName)}&days=${days}`
    : null
  const cacheKey = `data-leak-paths:${systemName}:${days}`

  const { data, loading, error, isStale, cachedAt, retry } =
    useCachedFetch<DataLeakPathsResponse>(url, { cacheKey })

  if (!systemName) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        Pick a system to view its data-leak paths.
      </div>
    )
  }

  if (loading && !data) return <LoadingSkeleton />
  if (error && !data) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800 text-sm">
        <div className="font-medium mb-1">Couldn’t load data-leak paths.</div>
        <div className="text-xs">{error}</div>
        <button
          onClick={retry}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 hover:text-rose-900"
        >
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="space-y-5">
      <Header data={data} isStale={isStale} cachedAt={cachedAt} onRefresh={retry} />
      {data.paths.length === 0 ? (
        <EmptyState system={systemName} accessible={data.accessibleStores} />
      ) : (
        <div className="space-y-4">
          {data.paths.map((p) => (
            <PathCard key={p.pathId} path={p} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  data,
  isStale,
  cachedAt,
  onRefresh,
}: {
  data: DataLeakPathsResponse
  isStale: boolean
  cachedAt: number | null
  onRefresh: () => void
}) {
  const dep = DATA_LEAK_DEPENDENCY_LABEL[data.internetDependency.level]
  const depToneClass = useMemo(() => {
    if (dep.tone === "ok") return "bg-emerald-50 border-emerald-200 text-emerald-800"
    if (dep.tone === "warn") return "bg-amber-50 border-amber-200 text-amber-800"
    return "bg-rose-50 border-rose-200 text-rose-800"
  }, [dep.tone])

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
        <div className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-700">
          Data Leak Paths · {data.systemName}
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-slate-500">
          Last {data.evidenceAge.egressLookbackDays} days
          {isStale && cachedAt ? (
            <span
              className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700"
              title={new Date(cachedAt).toLocaleString()}
            >
              cached
            </span>
          ) : null}
          <button
            onClick={onRefresh}
            className="ml-1 p-1 rounded hover:bg-slate-200 text-slate-500"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </span>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiTile
          label="Exposed stores"
          value={data.exposedStores}
          suffix={`of ${data.accessibleStores}`}
          tone="bad"
          hint="Crown jewels reachable from internet-capable workloads."
        />
        <KpiTile
          label="Accessible stores"
          value={data.accessibleStores}
          suffix={`of ${data.totalStores} total`}
          tone="info"
          hint="Crown jewels any workload in this system can read."
        />
        <KpiTile
          label="Leak paths"
          value={data.pathCount}
          suffix={data.pathCount === 1 ? "path" : "paths"}
          tone={data.pathCount > 0 ? "warn" : "ok"}
          hint="One per workload→store pair, sorted by risk score."
        />
        <div
          className={`rounded-lg border p-3 flex flex-col ${depToneClass}`}
          title={data.internetDependency.summary}
        >
          <div className="text-[10px] uppercase tracking-wider opacity-80">Internet dependency</div>
          <div className="text-2xl font-semibold leading-tight mt-1">{dep.label}</div>
          <div className="text-[11px] leading-snug mt-1.5 opacity-90">
            {data.internetDependency.summary}
          </div>
        </div>
      </div>
    </section>
  )
}

function KpiTile({
  label,
  value,
  suffix,
  tone,
  hint,
}: {
  label: string
  value: number
  suffix?: string
  tone: "ok" | "info" | "warn" | "bad"
  hint?: string
}) {
  const toneCls =
    tone === "ok"   ? "border-emerald-200 bg-emerald-50 text-emerald-900" :
    tone === "info" ? "border-slate-200   bg-slate-50   text-slate-900"   :
    tone === "warn" ? "border-amber-200   bg-amber-50   text-amber-900"   :
                      "border-rose-200    bg-rose-50    text-rose-900"
  return (
    <div className={`rounded-lg border p-3 flex flex-col ${toneCls}`} title={hint}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-2xl font-semibold leading-tight">{value}</span>
        {suffix && <span className="text-[11px] opacity-70">{suffix}</span>}
      </div>
      {hint && <div className="text-[11px] leading-snug mt-1.5 opacity-80">{hint}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-path card
// ---------------------------------------------------------------------------

function PathCard({ path }: { path: DataLeakPath }) {
  const band = DATA_LEAK_RISK_BAND_CONFIG[path.riskBand]

  return (
    <article
      className="rounded-xl border bg-white shadow-sm overflow-hidden"
      style={{ borderLeftWidth: 4, borderLeftColor: band.borderColor }}
    >
      {/* Header strip */}
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center gap-3 flex-wrap">
        <RiskBadge band={path.riskBand} score={path.riskScore} />
        <BucketChip bucket={path.workload.bucket} />
        <div className="text-[11px] text-slate-500 font-mono truncate">{path.pathId}</div>
      </div>

      {/* Explanation */}
      <div className="px-5 pt-4 pb-3">
        <p className="text-[13px] leading-relaxed text-slate-800">{path.riskExplanation}</p>
      </div>

      {/* Flow map — same renderer as Attack Paths, fed an egress-flavored architecture */}
      <div className="px-5 pb-3">
        <DataLeakFlowMap path={path} />
      </div>

      {/* Internet destinations — answers "where could this workload phone home?" */}
      <div className="px-5 pb-4">
        <InternetDestinationsTable dests={path.networkPlane.internetDestinations} />
      </div>

      {/* Mitigations */}
      <div className="border-t border-slate-200 bg-slate-50/40 px-5 py-3">
        <div className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-700 mb-2">
          Mitigations
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {path.availableMitigations.map((m) => (
            <MitigationRow key={m.type} mitigation={m} />
          ))}
        </div>
        <div className="mt-2 text-[10px] text-slate-500">
          Each action POSTs to the UnifiedPipeline. Stage applies to a canary scope;
          Full runs end-to-end with a rollback snapshot. Full apply with override-lineage
          writes an audit event per Decision Contract §7.
        </div>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Small render units
// ---------------------------------------------------------------------------

function RiskBadge({ band, score }: { band: DataLeakPath["riskBand"]; score: number }) {
  const cfg = DATA_LEAK_RISK_BAND_CONFIG[band]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border"
      style={{ color: cfg.color, backgroundColor: cfg.bgColor, borderColor: cfg.borderColor }}
    >
      <AlertTriangle className="w-3 h-3" />
      {cfg.label} · {score}
    </span>
  )
}

function BucketChip({ bucket }: { bucket: DataLeakBucket }) {
  const label = DATA_LEAK_BUCKET_LABEL[bucket]
  const tone =
    bucket === "ACTIVE_INTERNET" ? "bg-rose-50 text-rose-800 border-rose-200" :
    bucket === "LATENT_EXPOSURE" ? "bg-amber-50 text-amber-800 border-amber-200" :
    bucket === "AWS_REDIRECTABLE" ? "bg-blue-50 text-blue-800 border-blue-200" :
                                    "bg-emerald-50 text-emerald-800 border-emerald-200"
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${tone}`}>
      <Globe2 className="w-3 h-3" />
      {label}
    </span>
  )
}

function MitigationRow({ mitigation }: { mitigation: DataLeakMitigation }) {
  const isApplicable = mitigation.applicable
  const planning = mitigation.requiresPlanning
  const override = mitigation.requiresOverrideLineage

  const exec = useMitigationExecution(mitigation)
  const [overrideState, setOverrideState] = useState<SharedOverrideState>(INITIAL_SHARED_OVERRIDE_STATE)

  // The Full button click splits into two paths:
  //   - mitigation.requiresOverrideLineage === true → open the
  //     OverrideModalShared form; on submit, call exec.run with the
  //     lineage payload and force=true (the hook merges it into the body).
  //   - otherwise → call exec.run({stage: "full"}) directly.
  const onFullClick = () => {
    if (!exec.canRun("full")) return
    if (override) {
      setOverrideState(
        buildOverrideStateForOpen([
          `This will apply "${mitigation.title}" to AWS via the UnifiedPipeline.`,
          "A rollback snapshot will be written before the change executes.",
        ]),
      )
      return
    }
    void exec.run({ stage: "full" })
  }

  const onOverrideSubmit = async (lineage: OverrideLineagePayload) => {
    const result = await exec.run({ stage: "full", overrideLineage: lineage })
    if (result?.ok) {
      setOverrideState((s) => ({
        ...s,
        phase: "success",
        resultMessage: result.summary,
      }))
    } else {
      setOverrideState((s) => ({
        ...s,
        phase: "error",
        resultMessage: result?.summary || "Apply failed",
      }))
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 flex items-start gap-3">
      <ChevronRight className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold text-slate-900">{mitigation.title}</span>
          {planning && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-800 border border-violet-200">
              Requires planning
            </span>
          )}
          {override && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
              Override lineage required
            </span>
          )}
          {!isApplicable && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              Not applicable
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-600 leading-snug mt-1">{mitigation.explanation}</p>
        {!isApplicable && mitigation.blockingReason && (
          <div className="text-[11px] text-slate-500 mt-1.5 italic">
            Blocked: {humanizeBlockingReason(mitigation.blockingReason)}
            {mitigation.safetySignals?.evidence
              ? ` — ${mitigation.safetySignals.evidence}`
              : ""}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <StageButton
            kind="simulate"
            disabled={!exec.canRun("simulate")}
            inflight={exec.state.phase === "simulating"}
            onClick={() => exec.run({ stage: "simulate" })}
          />
          <StageButton
            kind="stage"
            disabled={!exec.canRun("stage")}
            inflight={exec.state.phase === "staging"}
            onClick={() => exec.run({ stage: "stage" })}
          />
          <StageButton
            kind="full"
            disabled={!exec.canRun("full")}
            inflight={exec.state.phase === "applying"}
            onClick={onFullClick}
          />
          {mitigation.execution === null && (
            <span className="text-[10px] text-slate-500 italic">
              {mitigation.manualReason || "Manual change only"}
            </span>
          )}
        </div>

        {/* Inline result panel — appears once a stage has been run.
            Renders one row per stage with the latest captured result. */}
        {(exec.state.simulate || exec.state.stage || exec.state.full) && (
          <div className="mt-2 rounded border border-slate-200 bg-slate-50/70 p-2 space-y-1">
            <ResultRow label="Simulate" result={exec.state.simulate} />
            <ResultRow label="Stage"    result={exec.state.stage}    />
            <ResultRow label="Full"     result={exec.state.full}     />
          </div>
        )}
      </div>

      <OverrideModalShared
        state={overrideState}
        setState={setOverrideState}
        acknowledgedTags={["score_based_block", "operator_override"]}
        onSubmit={onOverrideSubmit}
        contextBlurb={
          `You are about to apply "${mitigation.title}" with force=true. ` +
          "Cyntro requires a recorded rationale before any auto-execution that bypasses a safety gate. " +
          "The override is written to the audit log."
        }
      />
    </div>
  )
}

function StageButton({
  kind,
  disabled,
  inflight,
  onClick,
}: {
  kind: MitigationStage
  disabled?: boolean
  inflight?: boolean
  onClick: () => void
}) {
  const label =
    kind === "simulate" ? "Simulate" :
    kind === "stage"    ? "Approve & Stage" :
                          "Approve & Full"
  return (
    <button
      type="button"
      disabled={disabled || inflight}
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors ${
        disabled || inflight
          ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {inflight && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </button>
  )
}

function ResultRow({ label, result }: { label: string; result: MitigationStageResult | null }) {
  if (!result) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <Circle className="w-3 h-3" />
        <span className="font-mono w-14 shrink-0">{label}</span>
        <span className="italic">pending</span>
      </div>
    )
  }
  const Icon = result.ok ? CheckCircle2 : XCircle
  const cls = result.ok ? "text-emerald-700" : "text-rose-700"
  return (
    <div className={`flex items-start gap-2 text-[11px] ${cls}`}>
      <Icon className="w-3 h-3 mt-0.5 shrink-0" />
      <span className="font-mono w-14 shrink-0">{label}</span>
      <span className="break-words" title={result.summary}>{result.summary}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty / loading
// ---------------------------------------------------------------------------

function EmptyState({ system, accessible }: { system: string; accessible: number }) {
  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 flex items-center gap-4">
      <ShieldCheck className="w-8 h-8 text-emerald-600 shrink-0" />
      <div>
        <div className="text-[14px] font-semibold text-emerald-900">
          All {accessible} accessible data store{accessible === 1 ? "" : "s"} in {system} are isolated from the public internet.
        </div>
        <div className="text-[12px] text-emerald-800 mt-0.5">
          No workload with read access can also egress externally. No action needed today.
        </div>
      </div>
    </section>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="h-10 bg-slate-50 border-b border-slate-200 animate-pulse" />
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="h-6 w-1/3 bg-slate-100 rounded animate-pulse mb-3" />
          <div className="h-4 w-3/4 bg-slate-100 rounded animate-pulse mb-2" />
          <div className="h-4 w-2/3 bg-slate-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanizeBlockingReason(code: string): string {
  switch (code) {
    case "permissions_in_use":            return "permissions to this data store are actively used"
    case "workload_not_internet_capable": return "workload has no internet egress to redirect"
    case "no_managed_service_match":      return "no matching managed-cloud service for this store"
    case "no_open_egress_rule":           return "no 0.0.0.0/0 egress rule to narrow"
    case "workload_isolated":             return "workload cannot reach the internet"
    default:                              return code.replace(/_/g, " ")
  }
}
