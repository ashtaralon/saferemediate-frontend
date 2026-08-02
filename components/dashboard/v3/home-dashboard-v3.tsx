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
import { LPTopIssuesCard } from "./lp-top-issues-card"
import { DecisionRoutingCard } from "./decision-routing-card"
import { NarrowingSummaryCard } from "./narrowing-summary-card"
import { LiveNowStrip } from "@/components/live-now-strip"
import { EstateRiskBrief } from "./estate-risk-brief"

/**
 * V3 home dashboard — editorial typography, real-data discipline.
 *
 * Decision hierarchy:
 *   A. Five-second estate brief
 *   B. Business systems + crown-jewel damage paths
 *   C. Safe actions + evidence health
 *   D. Live execution + evidence conflicts
 *   E. Supporting SecOps diagnostics
 *
 * Every number remains backed by the existing real-data proxies. A
 * missing source renders as unknown/unavailable, never as a clean zero.
 */

interface HomeDashboardV3Props {
  initialSystem: string
  // See HomeDashboardV2Props.onNavigateToSection — same callback,
  // wired through so AttackPathsCard's "View all paths" button can
  // mutate activeSection state instead of navigating to a non-existent
  // /attack-paths route.
  onNavigateToSection?: (id: string) => void
}

export function HomeDashboardV3({ onNavigateToSection }: HomeDashboardV3Props) {
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-5 p-6" key={refreshKey}>
      {/* The first viewport is a decision brief, not a score dashboard. */}
      <EstateRiskBrief onNavigateToSection={onNavigateToSection} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Priority investigation</h2>
          <p className="mt-0.5 text-xs text-slate-500">Start with the business system and crown-jewel paths carrying the greatest potential damage.</p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Systems are the organizing object; paths explain the damage. */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <TopSystemsCard />
        <AttackPathsCard onNavigateToSection={onNavigateToSection} />
      </section>

      <div>
        <h2 className="text-base font-semibold text-slate-950">Safe action</h2>
        <p className="mt-0.5 text-xs text-slate-500">Every action is constrained by observed behavior, evidence integrity, validation, and rollback.</p>
      </div>
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SafeRemediationsQueueCard />
        <EvidenceHealthCardV3 />
      </section>

      <LiveNowStrip />

      {/* Evidence conflicts remain visible before diagnostics. */}
      <DivergenceBanner />

      <div>
        <h2 className="text-base font-semibold text-slate-950">Security operations detail</h2>
        <p className="mt-0.5 text-xs text-slate-500">Configuration pressure and plane-level diagnostics supporting the decisions above.</p>
      </div>
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2"><HeroBrssCard /></div>
        <SeverityDonutCard />
      </section>
      <FamilyStrip families={["data", "privilege", "network"]} />
      <DecisionRoutingCard />
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <WildcardBloatCard />
        <LPTopIssuesCard />
      </section>
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <NarrowingSummaryCard />
        <RecentActivityCard />
      </section>
    </div>
  )
}
