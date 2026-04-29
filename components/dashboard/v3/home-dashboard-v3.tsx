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

      {/* ── C. Family breakdown — Permissions / Network / Data ───── */}
      <FamilyStrip />

      {/* ── D. Top 5 systems ──────────────────────────────────────── */}
      <TopSystemsCard />

      {/* ── E. Decision routing per family ────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <NotWiredCard
          label="Permission gaps · decision routing"
          reason="decision_canonical is computed at simulate-fix time but NOT persisted on SecurityFinding nodes. Aggregating org-wide would require fanning out simulate-fix per finding (1k+ requests). Backend persistence work needed before this can be honest."
          backlog="V3 Phase D · backend ticket"
        />
        <NotWiredCard
          label="Network exposure · decision routing"
          reason="Same blocker — decision_canonical not persisted."
          backlog="V3 Phase D · backend ticket"
        />
        <NotWiredCard
          label="Data exposure · decision routing"
          reason="Same blocker — decision_canonical not persisted."
          backlog="V3 Phase D · backend ticket"
        />
      </section>

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
