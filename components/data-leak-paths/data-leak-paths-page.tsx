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

import { useMemo } from "react"
import {
  AlertTriangle,
  ChevronRight,
  Database,
  Globe2,
  Lock,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
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
  const observed = path.dataPlane.observedApiCalls
  const dests = path.networkPlane.internetDestinations

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

      {/* Endpoints (workload → data store) */}
      <div className="px-5 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <EndpointTile
            icon={<Server className="w-4 h-4 text-slate-500" />}
            kind="Workload"
            primary={path.workload.name}
            secondary={path.workload.type}
            details={[
              ["Subnet", path.workload.subnet.name || path.workload.subnet.id || "—",
                path.workload.subnet.isPublic ? "public" : "private"],
              ["Role", path.workload.iamRole.name || "—"],
              ["SG", path.workload.securityGroup.name || path.workload.securityGroup.id || "—",
                path.workload.securityGroup.hasPublicEgress ? "0.0.0.0/0 egress" : undefined],
            ]}
          />
          <EndpointTile
            icon={<Database className="w-4 h-4 text-slate-500" />}
            kind={path.dataStore.crownJewelClass}
            primary={path.dataStore.name}
            secondary={path.dataStore.crownJewelClass}
            details={[
              ["Identifier", path.dataStore.id, undefined],
            ]}
          />
        </div>
      </div>

      {/* Dual-plane signals */}
      <div className="px-5 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <SignalTile
          title="Data plane · observed access"
          icon={<Lock className="w-4 h-4 text-slate-500" />}
          state={observed._state}
          notWiredCopy={observed.copy}
        >
          {observed._state !== "not_wired" && (
            <>
              <Row label="Events">
                {typeof observed.totalEvents === "number"
                  ? observed.totalEvents.toLocaleString()
                  : "—"}
              </Row>
              <Row label="Last seen">
                {observed.lastSeen
                  ? new Date(observed.lastSeen).toLocaleDateString()
                  : "—"}
              </Row>
              {!!observed.actions?.length && (
                <Row label="Actions">
                  <span className="text-[11px] font-mono text-slate-700">
                    {observed.actions.slice(0, 4).join(", ")}
                    {observed.actions.length > 4
                      ? `, +${observed.actions.length - 4} more`
                      : ""}
                  </span>
                </Row>
              )}
            </>
          )}
        </SignalTile>

        <SignalTile
          title="Network plane · egress"
          icon={path.networkPlane.bucket === "ISOLATED" ? (
            <WifiOff className="w-4 h-4 text-slate-500" />
          ) : (
            <Wifi className="w-4 h-4 text-slate-500" />
          )}
          state={dests._state}
        >
          <Row label="Egress gate">
            {path.networkPlane.egressGate
              ? `${egressGateLabel(path.networkPlane.egressGate.kind)} · ${path.networkPlane.egressGate.id ?? "—"}`
              : "—"}
          </Row>
          <Row label="Destinations">
            {dests.totalDistinct === 0
              ? "0 in last 30 days"
              : `${dests.totalDistinct} (aws ${dests.byClass.aws} · external ${dests.byClass.external}${dests.byClass.unknown ? ` · unknown ${dests.byClass.unknown}` : ""})`}
          </Row>
          {!!dests.signals.length && (
            <Row label="Signals">
              <span className="text-[11px] text-amber-700 font-mono">
                {dests.signals.join(", ")}
              </span>
            </Row>
          )}
        </SignalTile>
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
          Simulate / Stage / Full execute via the existing UnifiedPipeline — wiring lands in the next phase.
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

function EndpointTile({
  icon,
  kind,
  primary,
  secondary,
  details,
}: {
  icon: React.ReactNode
  kind: string
  primary: string
  secondary?: string
  details: Array<[string, string | null | undefined, string | undefined]>
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        {icon}
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{kind}</div>
      </div>
      <div className="mt-1.5">
        <div className="text-[13px] font-semibold text-slate-900 truncate" title={primary}>
          {primary}
        </div>
        {secondary && <div className="text-[11px] text-slate-500">{secondary}</div>}
      </div>
      <dl className="mt-2 space-y-1">
        {details.map(([k, v, badge]) => (
          <div key={k} className="flex items-center gap-2 text-[11px]">
            <dt className="text-slate-500 w-16 shrink-0">{k}</dt>
            <dd className="text-slate-800 truncate" title={v ?? ""}>{v || "—"}</dd>
            {badge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                {badge}
              </span>
            )}
          </div>
        ))}
      </dl>
    </div>
  )
}

function SignalTile({
  title,
  icon,
  state,
  notWiredCopy,
  children,
}: {
  title: string
  icon: React.ReactNode
  state: DataLeakPath["dataPlane"]["observedApiCalls"]["_state"]
  notWiredCopy?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        {icon}
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{title}</div>
        <StateChip state={state} />
      </div>
      <div className="mt-2 space-y-1">
        {state === "not_wired" ? (
          <div className="text-[11px] text-slate-500 italic">
            {notWiredCopy || "Not yet computed for this system."}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function StateChip({ state }: { state: DataLeakPath["dataPlane"]["observedApiCalls"]["_state"] }) {
  if (state === "wired") return (
    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
      live
    </span>
  )
  if (state === "partial") return (
    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
      partial
    </span>
  )
  if (state === "loading") return (
    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
      loading
    </span>
  )
  return (
    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">
      not wired
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-slate-500 w-20 shrink-0">{label}</span>
      <span className="text-slate-800 truncate">{children}</span>
    </div>
  )
}

function MitigationRow({ mitigation }: { mitigation: DataLeakMitigation }) {
  const isApplicable = mitigation.applicable
  const planning = mitigation.requiresPlanning
  const override = mitigation.requiresOverrideLineage

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
          <StubButton kind="simulate" disabled={!mitigation.execution?.simulate} />
          <StubButton kind="stage"    disabled={!mitigation.execution?.stage}    />
          <StubButton kind="full"     disabled={!mitigation.execution?.full}     />
          {mitigation.execution === null && (
            <span className="text-[10px] text-slate-500 italic">{mitigation.manualReason || "Manual change only"}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function StubButton({ kind, disabled }: { kind: "simulate" | "stage" | "full"; disabled?: boolean }) {
  const label = kind === "simulate" ? "Simulate" : kind === "stage" ? "Approve & Stage" : "Approve & Full"
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Not available for this path" : "Wired in the next phase"}
      className={`text-[11px] px-2 py-1 rounded border ${
        disabled
          ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
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

function egressGateLabel(kind: string): string {
  // Vendor-neutral display — the page must read clean even when the
  // gate kind is the underlying technical label.
  if (kind === "InternetGateway") return "Internet gateway"
  if (kind === "NATGateway") return "NAT gateway"
  if (kind === "EgressOnlyInternetGateway") return "Egress-only gateway"
  if (kind === "VPCEndpoint") return "Private network bridge"
  return kind || "Gateway"
}

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
