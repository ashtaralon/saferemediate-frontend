"use client"

import { useState } from "react"

import { LiveNowStrip } from "@/components/live-now-strip"
import { DecisionRoutingCard } from "./decision-routing-card"
import { FamilyStrip } from "./family-strip"
import { HeroBrssCard } from "./hero-brss-card"
import { LPTopIssuesCard } from "./lp-top-issues-card"
import { RecentActivityCard } from "./recent-activity-card"
import { SeverityDonutCard } from "./severity-donut-card"
import { WildcardBloatCard } from "./wildcard-bloat-card"
import type { BrssHold } from "@/lib/brss-held"
import { useRouter } from "next/navigation"
import { useOptionalAccountScope } from "@/lib/account-scope-context"
import { NO_ACCOUNTS_TITLE, noAccountsDescription, noAccountsInScope } from "@/lib/account-scope"

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
  // The hero owns the /global-org-score read; the strip beside it only needs
  // to know whether that score is held, to label its own numbers truthfully.
  const [orgBrssHold, setOrgBrssHold] = useState<BrssHold | null>(null)
  const scope = useOptionalAccountScope()
  const router = useRouter()
  // No workload account connected: one state for the whole view, not eight cards each
  // reporting the same server hold (every read here answers NO_DATA_ACCOUNTS).
  if (scope && noAccountsInScope(scope)) {
    return (
      <div className="rounded-[14px] border border-slate-200 bg-white p-5" data-testid="operations-no-accounts">
        <div className="text-sm font-medium text-slate-800">{NO_ACCOUNTS_TITLE}</div>
        <div className="mt-1 text-sm text-slate-600">{noAccountsDescription(scope.customerId)}</div>
        <button
          onClick={() => router.push("/settings/accounts")}
          className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Open Settings › Accounts
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-8">
      <LiveNowStrip />

      <Group title="Posture &amp; finding volume" destination="Issues">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <HeroBrssCard onHoldChange={setOrgBrssHold} />
          </div>
          <SeverityDonutCard />
        </div>
        <FamilyStrip families={["data", "privilege", "network"]} orgBrssHold={orgBrssHold} />
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
