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
import { PageHeader } from "@/components/ui/page-header"

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
      <PageHeader
        eyebrow="Cyntro · home"
        title="Security posture"
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
      {/* TODO: wire `provenance` once each card surfaces its trust state.
         Per design review, the header is the right place for a synthetic
         page-level provenance (worst-confidence + oldest-freshness across
         the cards below). Until each card emits provenance through the
         proxy, the header degrades to identity + actions only — better
         than a fabricated confidence pill. */}

      {/* ── B. Hero row — BRSS + family strip (left 2/3) | Issues by severity (1/3, full height) ── */}
      {/* Severity donut moved into the hero right slot per Alon — it
          surfaces total active findings + critical/high/medium/low
          breakdown, which is the operator's primary action lens. The
          card stretches via h-full to match the BRSS+strip stack on
          the left. Wildcard bloat moved into Section D where it sits
          above LP top issues. */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <HeroBrssCard />
          <FamilyStrip families={["data", "privilege", "network"]} />
        </div>
        <SeverityDonutCard />
      </section>

      {/* ── D. Attack paths (50%) + (Wildcard bloat + LP top issues) (50%) ── */}
      {/* Right column stacks Wildcard bloat above the LP-issues list so
          dead space below the bloat number becomes a real, sorted list
          of biggest LP offenders. */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <AttackPathsCard />
        <div className="flex flex-col gap-5">
          <WildcardBloatCard />
          <LPTopIssuesCard />
        </div>
      </section>

      {/* ── D. Top 5 systems ──────────────────────────────────────── */}
      <TopSystemsCard />

      {/* ── E. Decision routing per family ────────────────────────── */}
      {/* Bulk verdict aggregator: backend runs the canonical
          UnifiedConfidenceScorer + thresholds.decide() for each finding,
          buckets by (family × DecisionOutcome). Same matrix that gates
          real AWS mutations in the unified pipeline, so verdicts here
          can't drift from production. Card caps at 30 findings cold-
          start (~25-30s) due to scorer's per-resource graph cost; warm
          cache is instant. See backend api/findings_decision_routing.py. */}
      <DecisionRoutingCard />

      {/* ── F. Divergence banner — only renders when total_conflicts > 0 */}
      <DivergenceBanner />

      {/* ── G. Queues row ─────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SafeRemediationsQueueCard />
        <EvidenceHealthCardV3 />
      </section>

      {/* ── H. Activity row ───────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <NarrowingSummaryCard />
        <RecentActivityCard />
      </section>
    </div>
  )
}
