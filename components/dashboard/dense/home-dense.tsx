"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { LiveNowStrip } from "./live-now-strip"
import { DenseSystemsTable } from "./dense-systems-table"
import { HeroBrssCard } from "@/components/dashboard/v3/hero-brss-card"
import { WildcardBloatCard } from "@/components/dashboard/v3/wildcard-bloat-card"
import { AttackPathsCard } from "@/components/dashboard/v3/attack-paths-card"
import { SafeRemediationsQueueCard } from "@/components/dashboard/v3/safe-remediations-queue-card"
import { LPTopIssuesCard } from "@/components/dashboard/v3/lp-top-issues-card"
import { RecentActivityCard } from "@/components/dashboard/v3/recent-activity-card"
import { EvidenceHealthCardV3 } from "@/components/dashboard/v3/evidence-health-card"
import { DivergenceBanner } from "@/components/dashboard/v3/divergence-banner"

/**
 * Dense operator home — replaces the V3 card-grid layout with a
 * Wiz-density approach. Per the design conversation:
 *
 *   - Locked audience: operator (security engineer using daily). Not
 *     CISO demo. CISO framing is a presentation problem.
 *   - Card grid → dense systems table for the systems summary.
 *   - Live Now strip in the hero — with idle-state copy when empty
 *     ("Engine idle · last action 3h ago"), so the safety pipeline
 *     moat is visible 100% of the time, not 5%.
 *   - Action-driving cards (Safe Remediations, LP Top Issues,
 *     Attack Paths) above the fold. They were already V3 components
 *     with strict 10-min staleness — reused as-is here.
 *   - Right-rail / bottom strip for peripheral surfaces (Evidence
 *     Health, Recent Activity).
 *
 * No mocks, no fabricated numbers. If a piece of data isn't wired,
 * the corresponding component renders an honest empty/not-wired state.
 */

export function HomeDense() {
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-6" key={refreshKey}>
      {/* Header */}
      <PageHeader
        eyebrow="Cyntro · home (dense)"
        title="Security posture"
        subtitle="Operator view — sortable systems table, live engine pulse, action queue"
        actions={
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      {/* Live Now strip — single-line engine pulse. Always visible. */}
      <LiveNowStrip />

      {/* Hero row — Global BRSS (2/3) + Wildcard Bloat (1/3) */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <HeroBrssCard />
        </div>
        <WildcardBloatCard />
      </section>

      {/* Conditional divergence banner — only renders when there are real conflicts */}
      <DivergenceBanner />

      {/* Action row — Safe Remediations (2/3) + LP Top Issues (1/3) */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SafeRemediationsQueueCard />
        </div>
        <LPTopIssuesCard />
      </section>

      {/* Attack paths panel */}
      <AttackPathsCard />

      {/* Centerpiece — dense systems table */}
      <DenseSystemsTable />

      {/* Peripheral row — evidence health + recent activity */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <EvidenceHealthCardV3 />
        <RecentActivityCard />
      </section>
    </div>
  )
}
