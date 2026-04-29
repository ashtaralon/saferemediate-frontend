"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { EvidenceHealthCardV3 } from "./evidence-health-card"
import { HeroBrssCard } from "./hero-brss-card"
import { TopSystemsCard } from "./top-systems-card"
import { DivergenceBanner } from "./divergence-banner"
import { SafeRemediationsQueueCard } from "./safe-remediations-queue-card"
import { WildcardBloatCard } from "./wildcard-bloat-card"
import { FamilyStrip } from "./family-strip"
import { RecentActivityCard } from "./recent-activity-card"
import { SeverityDonutCard } from "./severity-donut-card"
import { AttackPathsCard } from "./attack-paths-card"
import { NotWiredCard } from "./card-shell"
import { labelClass } from "./styles"

/**
 * V3 home dashboard — editorial typography, real-data discipline.
 *
 * Section order (locked):
 *   A. Header strip
 *   B. Hero (Global BRSS · AUTO Surface)
 *   C. Family breakdown (Permissions / Network / Data)
 *   D. Top 5 systems by BRSS
 *   E. Decision routing per family (3 cards)
 *   F. Divergence banner (conditional)
 *   G. Safe Remediations · Evidence Health
 *   H. This week's narrowing · Recent activity
 *
 * Phase A: scaffold + EvidenceHealthCard (real data) + every other
 * section in `not-wired` empty state with explicit "Backend tracker
 * not yet implemented" text. NO mock numbers anywhere.
 *
 * Phase B/C/D: replace not-wired stubs with real-data cards as the
 * proxy/backend work lands.
 */

interface HomeDashboardV3Props {
  initialSystem: string
}

export function HomeDashboardV3(_props: HomeDashboardV3Props) {
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-6" key={refreshKey}>
      {/* ── A. Header ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between rounded-[14px] border border-slate-200 bg-white px-5 py-4">
        <div>
          <div className={labelClass}>Cyntro · home</div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
            Security posture
          </h1>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </header>

      {/* ── B. Hero row — BRSS (2/3) + Wildcard bloat (1/3) ───────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <HeroBrssCard />
        </div>
        <WildcardBloatCard />
      </section>

      {/* ── B2. Top attack paths to crown jewels ──────────────────── */}
      {/* Promoted up here ('what's on fire right now') so it sits above
          the family breakdown and above the systems table. Drill-in
          to /attack-paths for the full graph view. */}
      <AttackPathsCard />

      {/* ── C. Family breakdown — Permissions / Network / Data ───── */}
      <FamilyStrip />

      {/* ── C2. Issues by severity (real donut) ───────────────────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SeverityDonutCard />
        <NotWiredCard
          label="Issue status distribution"
          reason="Donut for OPEN / IN_PROGRESS / RESOLVED. Backend /api/findings exposes status per finding but the org-wide rollup endpoint isn't there yet — needs a new aggregating proxy."
          backlog="V3 Phase D"
        />
      </section>

      {/* ── D. Top 5 systems ──────────────────────────────────────── */}
      <TopSystemsCard />

      {/* ── E. Decision routing per family ────────────────────────── */}
      {/* Collapsed into a single compact card while decision_canonical
          isn't persisted on findings. Will expand to 3 real cards once
          the backend ticket lands. */}
      <NotWiredCard
        label="Decision routing · permissions / network / data"
        reason="decision_canonical is computed at simulate-fix time but not persisted on SecurityFinding nodes. Aggregating org-wide would require fanning out simulate-fix per finding (1k+ requests). Will become a 3-card row once the backend persists the verdict."
        backlog="V3 Phase D · backend ticket"
      />

      {/* ── F. Divergence banner — only renders when total_conflicts > 0 */}
      <DivergenceBanner />

      {/* ── G. Queues row ─────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SafeRemediationsQueueCard />
        <EvidenceHealthCardV3 />
      </section>

      {/* ── H. Activity row ───────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <NotWiredCard
          label="This week's narrowing"
          reason="Only point-in-time wildcard bloat is shown above (hero row). Week-over-week delta still requires a backend narrowing-history endpoint that doesn't exist yet."
          backlog="backend ticket"
        />
        <RecentActivityCard />
      </section>
    </div>
  )
}
