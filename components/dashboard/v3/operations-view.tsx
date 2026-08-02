"use client"

import { LiveNowStrip } from "@/components/live-now-strip"
import { DecisionRoutingCard } from "./decision-routing-card"
import { FamilyStrip } from "./family-strip"
import { HeroBrssCard } from "./hero-brss-card"
import { LPTopIssuesCard } from "./lp-top-issues-card"
import { RecentActivityCard } from "./recent-activity-card"
import { SeverityDonutCard } from "./severity-donut-card"
import { WildcardBloatCard } from "./wildcard-bloat-card"

/**
 * Operations view — the technical surface, in full.
 *
 * Every card that lived in the old "Security operations detail" accordion
 * lives here instead, mounted exactly once in the product. Nothing was
 * deleted to make the Executive view clean; it was given a destination.
 *
 * This view is DELIBERATELY TEMPORARY. The end state is dedicated
 * Remediation / Evidence / Activity sections, with each card moved into
 * its real home and its new mount verified. Retire this view only when
 * that is done — not before, or the cards vanish, which is exactly what
 * happened the last time (SeverityDonutCard, FamilyStrip and
 * NarrowingSummaryCard were mounted NOWHERE for a while).
 *
 * Grouped by the destination each card is headed for, so the eventual
 * move is mechanical rather than archaeological.
 */

function Group({
  title,
  destination,
  children,
}: {
  title: string
  destination: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className="text-[11px] text-slate-400">future home · {destination}</span>
      </div>
      {children}
    </section>
  )
}

export function OperationsView() {
  return (
    <div className="flex flex-col gap-8">
      <LiveNowStrip />

      <Group title="Posture &amp; finding volume" destination="Issues">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <HeroBrssCard />
          </div>
          <SeverityDonutCard />
        </div>
        <FamilyStrip families={["data", "privilege", "network"]} />
      </Group>

      {/* Evidence HEALTH is promoted to Executive as the data-trust summary
          and is deliberately not re-mounted here — two mounts means two
          fetches and two possibly different readings of one fact. */}
      <Group title="Plane diagnostics" destination="Evidence">
        <DecisionRoutingCard />
      </Group>

      <Group title="Least-privilege diagnostics" destination="Resource Risk">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <WildcardBloatCard />
          <LPTopIssuesCard />
        </div>
      </Group>

      {/* Narrowing summary is promoted to Executive as verified outcomes;
          same reasoning. Detailed activity stays here. */}
      <Group title="Execution history" destination="Activity">
        <RecentActivityCard />
      </Group>
    </div>
  )
}
