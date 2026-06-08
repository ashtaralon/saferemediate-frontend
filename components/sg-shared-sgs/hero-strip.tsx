"use client"

import { Card } from "@/components/ui/card"
import type { SharedSGBeforeSummary } from "@/lib/types"

// SG-9d hero strip. 5 inline KPIs at the top of the detail view:
//   CONSUMERS · SYSTEMS · BLAST RADIUS · REDUCTION · PHASE chip.
// Editorial style — big number, small uppercase label below it.
// Reduction % is the only colored number (emerald ≥50, amber ≥20).

export function HeroStrip({
  before,
  blastRadiusAfter,
  reductionPct,
}: {
  before: SharedSGBeforeSummary | null
  blastRadiusAfter: number | null
  reductionPct: number | null
}) {
  return (
    <Card className="p-0">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-zinc-200 dark:bg-zinc-800 rounded-xl overflow-hidden">
        <Tile
          number={fmt(before?.consumer_count)}
          label="Consumers today"
        />
        <Tile
          number={fmt(before?.system_count)}
          label="Systems in shared SG"
        />
        <Tile
          number={
            before
              ? `${before.blast_radius_if_any_compromised}${
                  blastRadiusAfter != null ? ` → ${blastRadiusAfter}` : ""
                }`
              : "—"
          }
          label="Blast radius (per compromise)"
        />
        <Tile
          number={reductionPct != null ? `${reductionPct.toFixed(0)}%` : "—"}
          label="Reduction (avg/consumer)"
          tone={
            reductionPct == null
              ? "neutral"
              : reductionPct >= 50
              ? "good"
              : reductionPct >= 20
              ? "warn"
              : "neutral"
          }
        />
        <PhaseTile />
      </div>
    </Card>
  )
}

function Tile({
  number,
  label,
  tone = "neutral",
}: {
  number: string
  label: string
  tone?: "neutral" | "good" | "warn"
}) {
  const numberTone =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
      ? "text-amber-700 dark:text-amber-300"
      : "text-foreground"
  return (
    <div className="bg-background p-4 flex flex-col items-start gap-1">
      <div className={`text-2xl md:text-3xl font-semibold tabular-nums ${numberTone}`}>
        {number}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

function PhaseTile() {
  return (
    <div className="bg-background p-4 flex flex-col items-start gap-1.5">
      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 text-[11px] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        Phase 1 · Decouple
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        No rule changes in this plan
      </div>
    </div>
  )
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  return String(n)
}
