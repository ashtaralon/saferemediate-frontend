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
import { NotWiredCard } from "./card-shell"
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

      {/* ── B. Hero row — BRSS + Data (2/3 stacked) | Wildcard bloat (1/3) ── */}
      {/* Data tile sits under the BRSS hero (left column) so the
          posture-by-family lens leads with data — the family most
          customers care about first. Wildcard bloat extends the full
          height of the left stack via h-full so the right column
          doesn't visually float above empty space. */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <HeroBrssCard />
          <FamilyStrip families={["data"]} />
        </div>
        <WildcardBloatCard />
      </section>

      {/* ── C. Family breakdown — Permissions / Network ───────────── */}
      {/* Data has been hoisted into the hero stack above; this strip
          carries Permissions and Network only, in 2 cols. */}
      <FamilyStrip families={["privilege", "network"]} />

      {/* ── D. Attack paths (50%) + (Severity donut + LP top issues) (50%) ── */}
      {/* Right column stacks the donut on top of the LP-issues list so
          dead space below the donut becomes a real, sorted list of
          biggest LP offenders. */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <AttackPathsCard />
        <div className="flex flex-col gap-5">
          <SeverityDonutCard />
          <LPTopIssuesCard />
        </div>
      </section>

      {/* ── D. Top 5 systems ──────────────────────────────────────── */}
      <TopSystemsCard />

      {/* ── E. Decision routing per family ────────────────────────── */}
      {/* Held back until SG and S3 have simulate-fix endpoints that compute
          a canonical verdict. Today only IAMRole runs the full safety
          matrix (api/least_privilege.py simulate-fix); SG/S3 fall back to
          the legacy gate, so two of the three columns would be empty.
          Persisting decision_canonical on SecurityFinding is the smaller
          half of the work — the real blocker is parity across families. */}
      <NotWiredCard
        label="Decision routing · permissions / network / data"
        reason="Only IAMRole has a simulate-fix endpoint that computes a canonical verdict (AUTO_EXECUTE / REQUIRE_APPROVAL / BLOCK / …). SG and S3 still go through the legacy safety gate without producing a comparable verdict, so a 3-card row would have two empty columns. Holding the row until SG/S3 simulate-fix lands and persists decision_canonical."
        backlog="V3 Phase D · gated on sg-simulate-fix + s3-simulate-fix"
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
        <NarrowingSummaryCard />
        <RecentActivityCard />
      </section>
    </div>
  )
}
