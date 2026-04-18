"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { StatusChip } from "./status-chip"
import { useHomeData, relativeTime } from "./use-home-data"
import { EnforcementScoreCard } from "./enforcement-score-card"
import { SeverityDistributionCard } from "./severity-distribution-card"
import { PostureGradeCard } from "./posture-grade-card"
import { CoverageStrip } from "./coverage-strip"
import { SafeRemediationsQueue } from "./safe-remediations-queue"
import { IdentityAttackPathsQueue } from "./identity-attack-paths-queue"
import { CategoryGrid } from "./category-grid"
import { TopAccountsCard } from "./top-accounts-card"

interface HomeDashboardV2Props {
  initialSystem?: string
}

export function HomeDashboardV2({ initialSystem = "alon-prod" }: HomeDashboardV2Props) {
  const [systemName, setSystemName] = useState(initialSystem)
  const { enforcement, posture, issues, attackPaths, findings, systems, refresh, refreshOne } =
    useHomeData(systemName)

  const lastUpdated =
    [enforcement, posture, issues, attackPaths, findings, systems]
      .map((s) => s.fetchedAt)
      .filter((t): t is number => typeof t === "number")
      .sort((a, b) => b - a)[0] ?? null

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-6">
      {/* ── A. Header strip ────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 rounded-[14px] border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)] md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Security posture
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-slate-900">{systemName}</h1>
            <StatusChip tone="neutral">{relativeTime(lastUpdated) ?? "loading…"}</StatusChip>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SystemInput value={systemName} onChange={setSystemName} />
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </header>

      {/* ── B. Hero row — 3 cards ──────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <EnforcementScoreCard state={enforcement} onRetry={() => refreshOne("enforcement")} />
        <SeverityDistributionCard state={issues} onRetry={() => refreshOne("issues")} />
        <PostureGradeCard state={posture} onRetry={() => refreshOne("posture")} />
      </section>

      {/* ── C. Top accounts ────────────────────────────────────────── */}
      <TopAccountsCard
        state={systems}
        activeSystem={systemName}
        onSelect={setSystemName}
        onRetry={() => refreshOne("systems")}
      />

      {/* ── D. Queue row — 2 cards ─────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SafeRemediationsQueue state={enforcement} onRetry={() => refreshOne("enforcement")} />
        <IdentityAttackPathsQueue state={attackPaths} onRetry={() => refreshOne("attackPaths")} />
      </section>

      {/* ── D. Category grid ───────────────────────────────────────── */}
      <CategoryGrid state={findings} onRetry={() => refreshOne("findings")} />

      {/* ── E. Coverage strip ──────────────────────────────────────── */}
      <CoverageStrip posture={posture} issues={issues} />

      {/* dev-only data sanity ribbon — hidden in prod builds */}
      {process.env.NODE_ENV === "development" ? (
        <DebugRibbon
          states={{
            enforcement,
            posture,
            issues,
            attackPaths,
            findings,
            systems,
          }}
        />
      ) : null}
    </div>
  )
}

function SystemInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      System
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-[180px] rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none"
        spellCheck={false}
      />
    </label>
  )
}

function DebugRibbon({
  states,
}: {
  states: Record<string, { loading: boolean; error: string | null; fetchedAt: number | null; data: any }>
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-slate-200 bg-slate-50 px-5 py-3 text-[11px] text-slate-500">
      <div className="mb-1 font-semibold uppercase tracking-[0.14em]">dev · data sources</div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(states).map(([k, s]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="font-mono text-slate-700">{k}</span>
            {s.loading ? (
              <StatusChip tone="blue">loading</StatusChip>
            ) : s.error ? (
              <StatusChip tone="red">error</StatusChip>
            ) : s.data ? (
              <StatusChip tone="green">ok</StatusChip>
            ) : (
              <StatusChip tone="amber">empty</StatusChip>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
