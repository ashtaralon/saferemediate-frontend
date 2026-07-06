"use client"

/**
 * Business System Blast Radius — the 7-section view.
 *
 * Renders the verdict served by
 *   GET /api/proxy/business-system/{systemName}/blast-radius
 * → backend read-composer → Neo4j. The FE computes NO hero metric (CLAUDE.md
 * rule #1): every number, path, and cut comes from the payload; absent values
 * render as honest "not computed" / empty states, never fabricated.
 *
 * Mental model this view encodes (Alon's product direction): zones organize
 * risk; VPCs stay network boundaries shown as OVERLAYS on the zone canvas,
 * never merged; shared crown jewels live in a separate dependency plane.
 */

import { type ReactNode, useMemo, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Layers,
  RefreshCw,
  Route,
  Scissors,
  ShieldAlert,
} from "lucide-react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { StatusChip } from "@/components/dashboard/v2/status-chip"
import {
  type BlastDependencyItem,
  type BlastRadiusResponse,
  type BlastRecommendedCut,
  type BlastTopPath,
  type BlastZone,
  CONFIDENCE_TONE,
  CUT_CONFIDENCE_META,
  gateTone,
  JEWEL_LABEL,
  ZONE_META,
  ZONE_ORDER,
  type BlastZoneKey,
} from "@/components/business-system/types"

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString())

function relativeAge(seconds: number | null): string {
  if (seconds == null) return ""
  if (seconds < 90) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}

// ── shell ──────────────────────────────────────────────────────────────
export function BlastRadiusView({ systemName }: { systemName: string }) {
  const url = `/api/proxy/business-system/${encodeURIComponent(systemName)}/blast-radius`
  const cacheKey = `bs-blast-radius:${systemName}`
  const { data, loading, error, isStale, retry } = useCachedFetch<BlastRadiusResponse>(url, {
    cacheKey,
    maxStaleMs: 10 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })

  const hasVerdict = !!data && !!data.verdict
  const hardError = (!!error || !!data?.error) && !hasVerdict

  if (loading && !hasVerdict) return <LoadingState systemName={systemName} />
  if (hardError) {
    return <ErrorState systemName={systemName} message={data?.error || error || undefined} onRetry={retry} />
  }
  if (!hasVerdict) return <EmptyState systemName={systemName} />

  const d = data as BlastRadiusResponse
  const stale = isStale || d.fromStaleCache

  return (
    <div className="min-h-screen" style={{ background: "#F4F6F8" }}>
      <div className="mx-auto max-w-[1240px] px-5 py-6">
        <Header d={d} stale={!!stale} />
        <VerdictBar d={d} />
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <TrustZoneCanvas zones={d.zones} />
            <TopPathsSection paths={d.top_paths} />
          </div>
          <div className="space-y-5">
            <ScopeSection d={d} />
            <DependencyPlaneSection items={d.dependency_plane} />
          </div>
        </div>
        <RecommendedCutsSection cuts={d.recommended_cuts} />
        <EvidenceSection d={d} />
      </div>
    </div>
  )
}

// ── header + verdict ─────────────────────────────────────────────────────
function Header({ d, stale }: { d: BlastRadiusResponse; stale: boolean }) {
  const gen = d.verdict.data_freshness.attack_paths_generated_at
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <ShieldAlert className="h-3.5 w-3.5" style={{ color: "#00C2A8" }} />
          Business System Blast Radius
        </div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{d.system.name}</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          What an attacker can reach across this system&rsquo;s VPCs, identities and shared data —
          then the safest cuts. Composed from observed behaviour, not policy alone.
        </p>
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
  )
}

function VerdictBar({ d }: { d: BlastRadiusResponse }) {
  const v = d.verdict
  const ja = v.observed_jewel_access
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
      <Stat value={fmt(v.attack_paths)} label="live attack paths" accent="#ef4444" />
      <Stat value={fmt(v.reachable_crown_jewels)} label="crown jewels reachable" accent="#c2410c" />
      <Stat value={fmt(v.source_workloads)} label="source workloads" accent="#1d4ed8" />
      <div className="flex flex-col justify-center">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">observed jewel access</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <StatusChip tone="blue">{fmt(ja.s3)} S3</StatusChip>
          <StatusChip tone="blue">{fmt(ja.dynamodb)} DynamoDB</StatusChip>
          <StatusChip tone="blue">{fmt(ja.kms)} KMS</StatusChip>
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div className="flex flex-col justify-center">
      <div className="text-3xl font-bold leading-none" style={{ color: accent }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}

// ── trust-zone canvas ────────────────────────────────────────────────────
function TrustZoneCanvas({ zones }: { zones: BlastZone[] }) {
  const byKey = useMemo(() => {
    const m = new Map<string, BlastZone>()
    zones.forEach((z) => m.set(z.key, z))
    return m
  }, [zones])

  return (
    <SectionCard
      icon={<Layers className="h-4 w-4" />}
      title="Trust-Zone Canvas"
      subtitle="Risk grouped by trust zone. VPC is an overlay on each node, not the grouping — network boundaries stay intact."
    >
      <div className="space-y-3">
        {ZONE_ORDER.map((key) => {
          const zone = byKey.get(key)
          const meta = ZONE_META[key as BlastZoneKey]
          const nodes = zone?.nodes ?? []
          return (
            <div
              key={key}
              className="rounded-lg border p-3"
              style={{ background: meta.tint, borderColor: meta.border }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold" style={{ color: meta.accent }}>
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-slate-500">{meta.blurb}</span>
                </div>
                <span className="text-xs font-semibold text-slate-400">{nodes.length}</span>
              </div>
              {nodes.length === 0 ? (
                <div className="mt-2 text-[11px] italic text-slate-400">no workloads observed in this zone</div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {nodes.slice(0, 40).map((n) => (
                    <ZoneChip key={n.id} name={n.name} kind={n.kind} vpcId={n.vpc_id} role={n.role} risk={n.risk} />
                  ))}
                  {nodes.length > 40 && (
                    <span className="self-center text-[11px] text-slate-400">+{nodes.length - 40} more</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

function ZoneChip({
  name,
  kind,
  vpcId,
  role,
  risk,
}: {
  name: string
  kind: string | null
  vpcId: string | null
  role: string | null
  risk: number | null
}) {
  const vpcShort = vpcId ? vpcId.replace(/^vpc-/, "").slice(0, 6) : null
  return (
    <span
      className="inline-flex max-w-[240px] items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] shadow-sm"
      title={[name, kind, role ? `role: ${role}` : "", vpcId ? `vpc: ${vpcId}` : ""].filter(Boolean).join(" · ")}
    >
      {risk != null && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: risk >= 70 ? "#ef4444" : risk >= 40 ? "#eab308" : "#22c55e" }}
        />
      )}
      <span className="truncate font-medium text-slate-700">{name}</span>
      {kind && <span className="shrink-0 text-slate-400">{kind}</span>}
      {vpcShort && (
        <span className="shrink-0 rounded bg-slate-100 px-1 font-mono text-[9px] text-slate-500" title={vpcId || ""}>
          {vpcShort}
        </span>
      )}
    </span>
  )
}

// ── top attack paths ─────────────────────────────────────────────────────
function TopPathsSection({ paths }: { paths: BlastTopPath[] }) {
  return (
    <SectionCard
      icon={<Route className="h-4 w-4" />}
      title="Top Attack Paths"
      subtitle={`${paths.length} highest-impact paths (identity ∩ route ∩ data-plane gates shown verbatim)`}
    >
      {paths.length === 0 ? (
        <EmptyRow text="No materialized attack paths for this system." />
      ) : (
        <div className="divide-y divide-slate-100">
          {paths.map((p) => (
            <PathRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function PathRow({ p }: { p: BlastTopPath }) {
  const [open, setOpen] = useState(false)
  const conf = CONFIDENCE_TONE[(p.impact_confidence || "").toUpperCase()] ?? CONFIDENCE_TONE.INFO
  return (
    <div className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-semibold text-slate-800">{p.workload_name || "unknown"}</span>
            {p.workload_kind && <span className="text-[11px] text-slate-400">{p.workload_kind}</span>}
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <span className="font-medium text-slate-700">{p.cj_name || p.cj_arn || "crown jewel"}</span>
            {p.cj_type && <span className="text-[11px] text-slate-400">{p.cj_type}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: `${conf.swatch}22`, color: conf.swatch }}
            >
              {p.impact_confidence || "—"}
            </span>
            <span className="text-[11px] text-slate-400">{p.hop_count} hops</span>
            <GatePill label="identity" gate={p.identity_gate} />
            <GatePill label="route" gate={p.route_gate} />
            <GatePill label="data" gate={p.data_plane_gate} />
          </div>
        </div>
        {p.business_sentence && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 text-[11px] font-medium text-slate-500 hover:text-slate-700"
          >
            {open ? "hide" : "why"}
          </button>
        )}
      </div>
      {open && p.business_sentence && (
        <p className="mt-2 rounded-md bg-slate-50 p-2.5 text-[12px] leading-relaxed text-slate-600">
          {p.business_sentence}
        </p>
      )}
    </div>
  )
}

function GatePill({ label, gate }: { label: string; gate: string | null }) {
  return (
    <StatusChip tone={gateTone(gate)}>
      <span className="opacity-60">{label}:</span> {gate || "—"}
    </StatusChip>
  )
}

// ── scope / membership ───────────────────────────────────────────────────
function ScopeSection({ d }: { d: BlastRadiusResponse }) {
  const s = d.system
  return (
    <SectionCard
      icon={<Database className="h-4 w-4" />}
      title="System Scope"
      subtitle="Accounts, regions and the VPCs this system's workloads occupy"
    >
      <div className="space-y-1 text-xs text-slate-600">
        <ScopeRow label="Accounts" values={s.accounts} />
        <ScopeRow label="Regions" values={s.regions} />
      </div>
      <div className="mt-3 space-y-2">
        {s.vpcs.map((v) => (
          <div key={v.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-slate-700">{v.id}</span>
              {v.is_foreign ? (
                <StatusChip tone="amber">foreign</StatusChip>
              ) : (
                <StatusChip tone="green">owned</StatusChip>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
              {v.cidr && <span className="font-mono">{v.cidr}</span>}
              <span>{v.workload_count} workloads</span>
            </div>
            {v.membership_note && (
              <p className="mt-1.5 text-[11px] leading-snug text-amber-700">{v.membership_note}</p>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function ScopeRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="flex flex-wrap gap-1">
        {values.length === 0 ? (
          <span className="text-slate-400">—</span>
        ) : (
          values.map((x) => (
            <span key={x} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
              {x}
            </span>
          ))
        )}
      </span>
    </div>
  )
}

// ── dependency plane ─────────────────────────────────────────────────────
function DependencyPlaneSection({ items }: { items: BlastDependencyItem[] }) {
  return (
    <SectionCard
      icon={<Database className="h-4 w-4" />}
      title="Shared Dependency Plane"
      subtitle="Regional crown jewels reached across the system — real blast radius (reached ≥ owned)"
    >
      {items.length === 0 ? (
        <EmptyRow text="No shared jewel access observed." />
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.jewel_type} className="rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  {JEWEL_LABEL[it.jewel_type] || it.jewel_type}
                </span>
                <span className="text-lg font-bold text-slate-900">{fmt(it.reachable_observed)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                <span>{it.observed_sources} sources</span>
                <span>{it.observed_edges} edges</span>
                {it.delete_capable_paths > 0 && (
                  <span className="font-semibold text-red-600">{it.delete_capable_paths} delete-capable</span>
                )}
                {it.write_capable_paths > 0 && (
                  <span className="font-semibold text-orange-600">{it.write_capable_paths} write-capable</span>
                )}
                {it.protects_crown_jewels != null && <span>protects {it.protects_crown_jewels}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── recommended cuts ─────────────────────────────────────────────────────
function RecommendedCutsSection({ cuts }: { cuts: BlastRecommendedCut[] }) {
  return (
    <div className="mt-5">
      <SectionCard
        icon={<Scissors className="h-4 w-4" />}
        title="Recommended Cuts"
        subtitle="Customer-actionable first. Each removes only unused permissions — access observed in the window is kept."
      >
        {cuts.length === 0 ? (
          <EmptyRow text="No cuts computed." />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {cuts.map((c) => (
              <CutCard key={`${c.rank}-${c.role_name}`} c={c} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function CutCard({ c }: { c: BlastRecommendedCut }) {
  const [open, setOpen] = useState(false)
  const conf = CUT_CONFIDENCE_META[c.confidence] ?? CUT_CONFIDENCE_META.unknown
  const shown = c.remove_actions.slice(0, open ? c.remove_actions.length : 6)
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">
              {c.rank}
            </span>
            <span className="truncate font-semibold text-slate-800">{c.role_name || c.workload_name || "role"}</span>
          </div>
          {c.workload_name && c.role_name && c.workload_name !== c.role_name && (
            <div className="mt-0.5 pl-[26px] text-[11px] text-slate-400">via {c.workload_name}</div>
          )}
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

      <div className="mt-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">remove (unused)</div>
        <div className="mt-1 flex flex-wrap gap-1">
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
      </div>

      <p className="mt-2 flex items-start gap-1 text-[10px] leading-snug text-emerald-700">
        <span className="mt-px">✓</span>
        {c.observed_safe_note}
      </p>
    </div>
  )
}

// ── evidence / freshness ─────────────────────────────────────────────────
function EvidenceSection({ d }: { d: BlastRadiusResponse }) {
  const f = d.verdict.data_freshness
  const sev = (s: string): "blue" | "amber" | "red" =>
    s === "critical" ? "red" : s === "warning" ? "amber" : "blue"
  return (
    <div className="mt-5">
      <SectionCard
        icon={<Clock className="h-4 w-4" />}
        title="Evidence & Freshness"
        subtitle="Where each number comes from and how current it is — audit trail, not trust-me"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1 text-[11px] text-slate-600">
            <FreshRow label="Attack paths generated" value={f.attack_paths_generated_at ? new Date(f.attack_paths_generated_at).toLocaleString() : "—"} />
            <FreshRow label="CloudTrail window" value={f.cloudtrail_window_days != null ? `${f.cloudtrail_window_days} days` : "—"} />
            <FreshRow
              label="VPC Flow Log window"
              value={f.flowlogs_window_days != null ? `${f.flowlogs_window_days} days` : "not computed per-system"}
            />
            <FreshRow label="Topology" value={d.from_snapshot ? `snapshot · ${relativeAge(d.snapshot_age_seconds)}` : "live"} />
          </div>
          <div className="space-y-1.5">
            {d.warnings.length === 0 ? (
              <span className="text-[11px] italic text-slate-400">no warnings</span>
            ) : (
              d.warnings.map((w) => (
                <div key={w.code} className="flex items-start gap-1.5">
                  <StatusChip tone={sev(w.severity)}>{w.code}</StatusChip>
                  <span className="text-[11px] leading-snug text-slate-500">{w.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

function FreshRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-50 py-0.5">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  )
}

// ── primitives + states ──────────────────────────────────────────────────
function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <div className="py-4 text-center text-[12px] italic text-slate-400">{text}</div>
}

function LoadingState({ systemName }: { systemName: string }) {
  return (
    <div className="min-h-screen p-8" style={{ background: "#F4F6F8" }}>
      <div className="mx-auto max-w-[1240px]">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" style={{ color: "#00C2A8" }} />
          Composing blast radius for {systemName}…
        </div>
        <div className="mt-4 grid animate-pulse grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-200/60" />
          ))}
        </div>
      </div>
    </div>
  )
}

function ErrorState({ systemName, message, onRetry }: { systemName: string; message?: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen p-8" style={{ background: "#F4F6F8" }}>
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
        <h2 className="mt-3 text-base font-semibold text-slate-800">Couldn&rsquo;t load the blast radius</h2>
        <p className="mt-1 text-xs text-slate-500">
          Backend didn&rsquo;t return a verdict for <span className="font-mono">{systemName}</span>.
          {message ? ` (${message})` : ""}
        </p>
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    </div>
  )
}

function EmptyState({ systemName }: { systemName: string }) {
  return (
    <div className="min-h-screen p-8" style={{ background: "#F4F6F8" }}>
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <ShieldAlert className="mx-auto h-8 w-8 text-slate-300" />
        <h2 className="mt-3 text-base font-semibold text-slate-800">No blast radius yet</h2>
        <p className="mt-1 text-xs text-slate-500">
          No materialized attack paths for <span className="font-mono">{systemName}</span>. Run the
          identity-attack-path analyzer, then reopen this view.
        </p>
      </div>
    </div>
  )
}
