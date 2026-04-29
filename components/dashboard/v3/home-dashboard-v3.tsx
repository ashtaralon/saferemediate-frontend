"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { EvidenceHealthCardV3 } from "./evidence-health-card"
import { NotWiredCard, Section } from "./card-shell"
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

      {/* ── B. Hero row — BRSS (2/3) + AUTO Surface (1/3) ─────────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NotWiredCard
            label="Global blast radius score"
            reason="Org-wide BRSS aggregation card not yet implemented. Per-system data exists at /api/issues/brss/history; Phase B will fan out and aggregate client-side."
            backlog="V3 Phase B"
          />
        </div>
        <NotWiredCard
          label="Auto surface this month"
          reason="No backend tracker for AUTO surface % exists. Per-CISO conversation, this card will be replaced with 'Wildcard bloat' (point-in-time) using /api/least-privilege/metrics in Phase C."
          backlog="V3 Phase C"
        />
      </section>

      {/* ── C. Family breakdown — Permissions / Network / Data ───── */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <NotWiredCard
          label="Permissions"
          reason="Aggregation across systems via /api/service-risk-scores/{sys}.layers needs a fan-out proxy. Phase C."
          backlog="V3 Phase C"
        />
        <NotWiredCard
          label="Network"
          reason="Same source — needs proxy fan-out across systems. Phase C."
          backlog="V3 Phase C"
        />
        <NotWiredCard
          label="Data"
          reason="Same source — needs proxy fan-out across systems. Phase C."
          backlog="V3 Phase C"
        />
      </section>

      {/* ── D. Top 5 systems ──────────────────────────────────────── */}
      <NotWiredCard
        label="Top 5 systems by blast radius"
        reason="/api/systems exposes scores; mix-bar requires per-family fan-out across /api/service-risk-scores. Phase B."
        backlog="V3 Phase B"
      />

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

      {/* ── F. Divergence banner (conditional render in Phase B) ──── */}
      <NotWiredCard
        label="Hard evidence conflicts"
        reason="/api/evidence/divergence/summary exists and works. Card not yet built. Phase B."
        backlog="V3 Phase B"
      />

      {/* ── G. Queues row ─────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <NotWiredCard
          label="Safe remediations queue"
          reason="/api/remediation-candidates exists with safety verdicts. Card not yet built. Phase B."
          backlog="V3 Phase B"
        />
        <EvidenceHealthCardV3 />
      </section>

      {/* ── H. Activity row ───────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <NotWiredCard
          label="This week's narrowing"
          reason="Only point-in-time bloat metric available (/api/least-privilege/metrics). Delta requires a backend narrowing-history endpoint. Phase C ships honest point-in-time framing."
          backlog="V3 Phase C"
        />
        <NotWiredCard
          label="Recent activity"
          reason="/api/snapshots and /api/automation-rules/rollback/history both exist. Card needs a merging proxy that aggregates by timestamp. Phase C."
          backlog="V3 Phase C"
        />
      </section>
    </div>
  )
}
