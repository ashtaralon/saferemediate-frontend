"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { EstateRiskBrief } from "./estate-risk-brief"
import { TopSystemsCard } from "./top-systems-card"
import { SafeRemediationsQueueCard } from "./safe-remediations-queue-card"
import { DivergenceBanner } from "./divergence-banner"
import { HeroBrssCard } from "./hero-brss-card"
import { SeverityDonutCard } from "./severity-donut-card"
import { FamilyStrip } from "./family-strip"
import { WildcardBloatCard } from "./wildcard-bloat-card"
import { LPTopIssuesCard } from "./lp-top-issues-card"
import { DecisionRoutingCard } from "./decision-routing-card"
import { NarrowingSummaryCard } from "./narrowing-summary-card"
import { RecentActivityCard } from "./recent-activity-card"
import { EvidenceHealthCardV3 } from "./evidence-health-card"
import { AttackPathsCard } from "./attack-paths-card"
import { LiveNowStrip } from "@/components/live-now-strip"

/**
 * V3 home dashboard — three sections, one question.
 *
 *   1. Executive summary   four metrics
 *   2. Priority systems    one ranked table
 *   3. Recommended actions Ready / Held / Insufficient evidence
 *
 * Home answers only: where is our greatest material risk, and what can we
 * safely do next? That sentence is the product logic — deliberately NOT the
 * page title, which is a document heading, not a slogan.
 *
 * DEMOTED, not moved. An earlier cut unmounted eleven cards from here on the
 * reasoning that they "belong under Resource Risk / Issues / Security
 * Operations" — but those destinations were never built, and a check found
 * SeverityDonutCard, FamilyStrip and NarrowingSummaryCard mounted NOWHERE in
 * the product, with six more surviving only inside the rival home-dense
 * variant. Removing a card from one page does not move it; it deletes it from
 * the user\'s reach.
 *
 * So they live below the fold, collapsed, until real destination pages exist.
 * Long-and-complete beats short-and-missing. When those pages ship, move them
 * for real and delete this section — verifying the new mount, not assuming it.
 *
 * DivergenceBanner stays: an evidence conflict invalidates the numbers above
 * it, so it is a precondition for reading the page rather than a diagnostic.
 */

interface HomeDashboardV3Props {
  initialSystem: string
  onNavigateToSection?: (id: string) => void
}

export function HomeDashboardV3({ onNavigateToSection }: HomeDashboardV3Props) {
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-6 p-6" key={refreshKey}>
      {/* 1 — Executive summary. */}
      <EstateRiskBrief onNavigateToSection={onNavigateToSection} />

      {/* An evidence conflict makes everything below it unreliable, so it sits
          above the tables rather than in a diagnostics section. */}
      <DivergenceBanner />

      {/* 2 — Priority systems. */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Priority systems</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Ranked by potential damage. Open a system to investigate its crown jewels and paths.
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>
      <TopSystemsCard />

      {/* 3 — Top damage paths. Reach, sitting directly above remove: the
          pairing is the product, so the two must be adjacent and readable in
          one glance rather than separated by a fold. */}
      <div>
        <h2 className="text-base font-semibold text-slate-950">Top paths by potential damage</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          What an attacker can reach today, ranked by the damage a successful path would cause.
        </p>
      </div>
      <AttackPathsCard onNavigateToSection={onNavigateToSection} />

      {/* 4 — Recommended actions. */}
      <div>
        <h2 className="text-base font-semibold text-slate-950">Recommended actions</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Highest-priority safe changes only. Every action is constrained by observed behavior,
          evidence integrity, validation, and rollback.
        </p>
      </div>
      <SafeRemediationsQueueCard />

      {/* Collapsed by default: present and reachable, but not competing with
          the decision above it. */}
      <details className="group rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Security operations detail</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Posture scores, finding volume, plane diagnostics and activity. Supporting context —
              not the decision.
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-slate-500 group-open:hidden">
            Show
          </span>
          <span className="hidden shrink-0 text-xs font-medium text-slate-500 group-open:inline">
            Hide
          </span>
        </summary>

        <div className="flex flex-col gap-5 border-t border-slate-200 p-5">
          <LiveNowStrip />
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2"><HeroBrssCard /></div>
            <SeverityDonutCard />
          </section>
          <EvidenceHealthCardV3 />
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
      </details>
    </div>
  )
}
