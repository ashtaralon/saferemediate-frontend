"use client"

// Risk Potential panel — Step 4 of the exposure findings pipeline.
//
// Consumes GET /api/proxy/exposure/findings/sg/{sg_id} and renders the
// severity-sorted finding cards with DamageStatement prose from the
// backend translator. When the route is unavailable (404 feature flag)
// or the path has no SecurityGroup, the parent falls back to the legacy
// DamagePanel (IAM action translation).

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react"
import type { IdentityAttackPath, PathNodeDetail } from "@/components/identity-attack-paths/types"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { SGRemediationModal } from "@/components/sg-remediation-modal"
import type { ExposureFindingsResponse } from "./exposure-findings-types"

interface RiskPotentialPanelProps {
  path: IdentityAttackPath
  systemName: string
  /** When true, parent should render legacy DamagePanel instead. */
  onUnavailable?: () => void
}

function normalizeSgId(id: string): string {
  const match = id.match(/(sg-[0-9a-f]+)/i)
  return match ? match[1] : id
}

function pickPrimarySg(path: IdentityAttackPath): PathNodeDetail | null {
  const sgs = (path.nodes ?? []).filter((n) => n.type === "SecurityGroup")
  if (!sgs.length) return null
  const open = sgs.find((sg) => sg.rules?.open_to_internet)
  return open ?? sgs[0]
}

function severityStyles(severity: string) {
  const s = severity.toUpperCase()
  if (s === "CRITICAL") {
    return {
      border: "border-red-500/30",
      bg: "bg-red-500/[0.06]",
      headline: "text-red-800 dark:text-red-100",
      chip: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
      dot: "bg-red-400",
    }
  }
  if (s === "HIGH") {
    return {
      border: "border-orange-500/30",
      bg: "bg-orange-500/[0.05]",
      headline: "text-orange-800 dark:text-orange-100",
      chip: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
      dot: "bg-orange-400",
    }
  }
  if (s === "MEDIUM") {
    return {
      border: "border-amber-500/30",
      bg: "bg-amber-500/[0.04]",
      headline: "text-amber-800 dark:text-amber-100",
      chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
      dot: "bg-amber-400",
    }
  }
  return {
    border: "border-border",
    bg: "bg-card",
    headline: "text-foreground",
    chip: "bg-muted text-foreground border-border",
    dot: "bg-slate-500",
  }
}

function MetaPill({ label, value }: { label: string; value: number }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10px] text-foreground">
      <span className="uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </span>
  )
}

export function useRiskPotentialAvailability(path: IdentityAttackPath) {
  const sg = useMemo(() => pickPrimarySg(path), [path])
  const sgId = sg ? normalizeSgId(sg.id) : null
  const url = sgId
    ? `/api/proxy/exposure/findings/sg/${encodeURIComponent(sgId)}`
    : null

  const { data, loading, error } = useCachedFetch<ExposureFindingsResponse>(url, {
    cacheKey: sgId ? `exposure-findings:${sgId}` : "exposure-findings:none",
    maxStaleMs: 5 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })

  const flagOff = Boolean(error?.includes("404"))
  const available = Boolean(sgId && data && !flagOff && !error && (data.meta?.total ?? 0) > 0)

  return { sg, sgId, data, loading, error, flagOff, available }
}

function FindingCard({
  entry,
  onRemediate,
}: {
  entry: ExposureFindingsResponse["findings"][number]
  onRemediate: (sgId: string, sgName: string) => void
}) {
  const { finding, statement } = entry
  const styles = severityStyles(finding.severity)
  const sgId = finding.sg_id ? normalizeSgId(finding.sg_id) : null

  return (
    <article
      className={`rounded-lg border ${styles.border} ${styles.bg} p-4 space-y-3`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-[9px] font-semibold uppercase tracking-wider rounded border px-1.5 py-0.5 ${styles.chip}`}
        >
          {statement.layer_chip}
        </span>
        {statement.category_label ? (
          <span className="text-[11px] font-mono text-foreground">{statement.category_label}</span>
        ) : null}
        {statement.source_label ? (
          <span className="text-[11px] text-muted-foreground">{statement.source_label}</span>
        ) : null}
      </div>

      {statement.observed_pill ? (
        <div className="text-[10px] text-muted-foreground italic">{statement.observed_pill}</div>
      ) : null}

      <p className={`text-sm font-semibold leading-snug ${styles.headline}`}>
        {statement.headline}
      </p>

      {statement.supporting ? (
        <p className="text-[12px] text-muted-foreground leading-relaxed">{statement.supporting}</p>
      ) : null}

      {statement.evidence_lines.length > 0 ? (
        <ul className="space-y-1 border-t border-border pt-2">
          {statement.evidence_lines.map((line) => (
            <li
              key={line}
              className="text-[11px] font-mono text-foreground flex items-start gap-2"
            >
              <span className={`mt-1.5 inline-block h-1 w-1 rounded-full shrink-0 ${styles.dot}`} />
              {line}
            </li>
          ))}
        </ul>
      ) : statement.evidence_summary ? (
        <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
          {statement.evidence_summary}
        </p>
      ) : null}

      {statement.recommendation_label && sgId ? (
        <button
          type="button"
          onClick={() => onRemediate(sgId, finding.workload_name || sgId)}
          className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
          title={statement.recommendation_prompt || undefined}
        >
          {statement.recommendation_label} →
        </button>
      ) : null}
    </article>
  )
}

export function RiskPotentialPanel({ path, systemName }: RiskPotentialPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [sgModal, setSgModal] = useState<{ sgId: string; sgName: string } | null>(null)
  const { sg, data, loading, error, flagOff, available } = useRiskPotentialAvailability(path)

  if (!sg || flagOff) return null

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
        <div className="h-4 w-40 bg-muted rounded mb-3" />
        <div className="h-20 bg-muted rounded" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-[11px] text-muted-foreground italic">
          Risk Potential unavailable ({error}). Showing legacy damage projection below.
        </div>
      </div>
    )
  }

  if (!available || !data) return null

  const meta = data.meta

  return (
    <>
      <div className="rounded-xl border border-red-500/25 bg-red-500/[0.03] overflow-hidden">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-red-500/[0.05] transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <ShieldAlert className="h-4 w-4 text-red-700 dark:text-red-300" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
            Risk Potential
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {meta.total} finding{meta.total === 1 ? "" : "s"} · {sg.name}
          </span>
        </button>

        {!collapsed && (
          <div className="px-4 pb-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <MetaPill label="critical" value={meta.by_severity.CRITICAL ?? 0} />
              <MetaPill label="high" value={meta.by_severity.HIGH ?? 0} />
              <MetaPill label="medium" value={meta.by_severity.MEDIUM ?? 0} />
              <MetaPill label="sg rules" value={meta.by_layer.SG_RULE ?? 0} />
              <MetaPill label="subnet" value={meta.by_layer.SUBNET_PLACEMENT ?? 0} />
              <MetaPill label="egress" value={meta.by_layer.EGRESS_CAPABILITY ?? 0} />
              {meta.observation_window_days ? (
                <span className="text-[10px] text-muted-foreground self-center">
                  {meta.observation_window_days}d observation window
                </span>
              ) : null}
            </div>

            <div className="space-y-3">
              {data.findings.map((entry) => (
                <FindingCard
                  key={entry.finding.finding_id}
                  entry={entry}
                  onRemediate={(sgId, sgName) => setSgModal({ sgId, sgName })}
                />
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground italic border-t border-border pt-2">
              Chain-ranked exposure from {normalizeSgId(data.sg_id)} — deterministic
              damage statements, not LLM inference.
            </p>
          </div>
        )}
      </div>

      {sgModal ? (
        <SGRemediationModal
          isOpen
          onClose={() => setSgModal(null)}
          sgId={sgModal.sgId}
          sgName={sgModal.sgName}
          systemName={systemName}
        />
      ) : null}
    </>
  )
}

/** Slice 3 wrapper — Risk Potential when live, else legacy IAM damage panel. */
export function PotentialDamageSection({
  path,
  systemName,
  legacy,
}: {
  path: IdentityAttackPath
  systemName: string
  legacy: React.ReactNode
}) {
  const { available, loading, flagOff, sg, data } = useRiskPotentialAvailability(path)

  if (!sg || flagOff) return <>{legacy}</>
  if (loading && !data) {
    return <RiskPotentialPanel path={path} systemName={systemName} />
  }
  if (available) {
    return <RiskPotentialPanel path={path} systemName={systemName} />
  }
  return <>{legacy}</>
}
