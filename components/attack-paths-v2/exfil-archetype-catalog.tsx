"use client"

/**
 * Two surfaces that consume lib/types/exfil-archetypes:
 *
 *  - <ExfilArchetypeDetailCard>  right-rail panel describing the
 *    selected archetype's trust story + closure action + gate strength.
 *    Replaces the prior free-form "NON-VPC WORKLOAD — IAM is the only
 *    gate" callout with a typed read from ARCHETYPE_CATALOG so copy
 *    stays consistent across paths and across releases.
 *
 *  - <ExfilArchetypeGrid>  8-card grid (active + not-collected-yet)
 *    rendered below the canvas. Master list of "every door the data
 *    could leave through" so the operator can't assume the current
 *    selected path is the only one. Not-collected-yet archetypes
 *    render with their collector backlog hint.
 *
 * Design memo: 2026-05-25 exfil-map planning session.
 */

import { AlertTriangle, ShieldOff, Wrench, Route as RouteIcon } from "lucide-react"
import {
  ARCHETYPE_CATALOG,
  ARCHETYPE_ORDER,
  BYTES_SOURCE_LABEL,
  GATE_STRENGTH_CONFIG,
  defaultGateStrength,
  destinationLabelFor,
  type ArchetypePresence,
  type ExfilArchetype,
  type GateStrength,
} from "@/lib/types/exfil-archetypes"

// ─────────────────────────────────────────────────────────────────
// Detail card (right rail)
// ─────────────────────────────────────────────────────────────────

interface DetailProps {
  archetype: ExfilArchetype
  gateStrength?: GateStrength
  /** Optional per-instance closure copy from the backend. */
  perInstanceClosure?: string
}

export function ExfilArchetypeDetailCard({
  archetype,
  gateStrength,
  perInstanceClosure,
}: DetailProps) {
  const spec = ARCHETYPE_CATALOG[archetype]
  const strength = gateStrength ?? defaultGateStrength(archetype)
  const strengthSpec = GATE_STRENGTH_CONFIG[strength]
  const closureCopy = perInstanceClosure || spec.closureAction
  const dest = destinationLabelFor(archetype)

  return (
    <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-sm space-y-3">
      {/* Header  archetype id + gate strength chip */}
      <div className="flex items-start gap-2">
        <div className="rounded-full bg-amber-500/15 p-1.5 shrink-0">
          <RouteIcon className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Exfil archetype
          </div>
          <div className="font-semibold text-foreground text-sm leading-tight mt-0.5">
            {spec.label}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider border shrink-0"
          style={{
            backgroundColor: `${strengthSpec.accent}20`,
            color: strengthSpec.accent,
            borderColor: `${strengthSpec.accent}30`,
          }}
          title={strengthSpec.description}
        >
          {strengthSpec.label}
        </span>
      </div>

      {/* Chain shape  the canonical READER  HANDLER  GATE  DEST */}
      <div className="rounded-lg border border-border bg-muted/50 px-3 py-2">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Chain
        </div>
        <div className="text-[11px] text-foreground leading-snug font-mono break-words">
          {spec.chainShape}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {!spec.hasHandler && (
            <span
              className="inline-flex items-center gap-1 rounded bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 text-[9px] font-medium text-rose-700 dark:text-rose-300"
              title="No workload — data bypasses compute, SG, NACL"
            >
              <ShieldOff className="h-2.5 w-2.5" />
              No workload  bypasses compute
            </span>
          )}
          <span
            className="inline-flex items-center gap-1 rounded bg-muted border border-border px-1.5 py-0.5 text-[9px] font-medium text-foreground"
            title={`Destination boundedness: ${dest.bounded}`}
          >
            Destination · {dest.primaryLabel}
          </span>
        </div>
      </div>

      {/* Trust story  why this path matters */}
      <div>
        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          <AlertTriangle className="h-2.5 w-2.5" />
          Why this path matters
        </div>
        <div className="text-[11px] text-foreground leading-relaxed">
          {spec.trustStory}
        </div>
      </div>

      {/* Closure action  what Cyntro will narrow */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300/80 mb-1">
          <Wrench className="h-2.5 w-2.5" />
          What Cyntro will close
        </div>
        <div className="text-[11px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
          {closureCopy}
        </div>
      </div>

      {/* Bytes-source footnote  honest about which signal feeds the arc */}
      <div className="text-[9px] text-muted-foreground leading-snug">
        <span className="font-semibold uppercase tracking-wider">Volume source · </span>
        {BYTES_SOURCE_LABEL[spec.bytesSource]}
      </div>

      {/* Collector-backlog footnote when applicable */}
      {spec.collectorStatus === "not_collected_yet" && (
        <div className="rounded border border-border bg-card px-2.5 py-1.5 text-[9px] text-muted-foreground leading-snug">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground">
            Not collected yet ·
          </span>
          {spec.collectorBacklog ?? "Collector pending"}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 8-card archetype grid (below canvas)
// ─────────────────────────────────────────────────────────────────

interface GridProps {
  /** Archetypes present in the current Exfil response, keyed by id.
   *  Computed from data.paths[] by the parent component. */
  present: Partial<Record<ExfilArchetype, ArchetypePresence>>
  /** Currently-selected archetype (so its card highlights). */
  selectedArchetype?: ExfilArchetype | null
  /** Click handler  selecting a card narrows the canvas to that
   *  archetype's first instance (parent owns the path-id swap). */
  onSelect?: (archetype: ExfilArchetype) => void
}

export function ExfilArchetypeGrid({
  present,
  selectedArchetype,
  onSelect,
}: GridProps) {
  return (
    <div className="px-6 py-3 border-t border-border bg-background/95">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Every door the data could leave through · 8 archetypes
        </div>
        <ArchetypeLegend />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {ARCHETYPE_ORDER.map((id) => {
          const spec = ARCHETYPE_CATALOG[id]
          const pres = present[id]
          const isActive = spec.collectorStatus === "active"
          const hasInstances = (pres?.instance_count ?? 0) > 0
          const observed = pres?.any_observed === true
          const isSelected = selectedArchetype === id

          // 4-state visual:
          //   active + observed       → rose (data already leaving)
          //   active + capable only   → amber (path exists, no traffic)
          //   active + no instances   → slate (eligible, none found)
          //   not_collected_yet       → dashed slate ("Not collected")
          const stateClass = (() => {
            if (!isActive) return "border-dashed border-border bg-card text-muted-foreground"
            if (observed) return "border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-700 dark:text-rose-300"
            if (hasInstances) return "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-700 dark:text-amber-300"
            return "border-border bg-card text-muted-foreground"
          })()

          const dotClass = (() => {
            if (!isActive) return "bg-muted-foreground/50"
            if (observed) return "bg-rose-400"
            if (hasInstances) return "bg-amber-400"
            return "bg-muted-foreground"
          })()

          const interactive = isActive && hasInstances

          return (
            <button
              key={id}
              type="button"
              onClick={() => interactive && onSelect?.(id)}
              disabled={!interactive}
              className={`text-left rounded-lg border ${stateClass} ${
                isSelected ? "ring-2 ring-primary/50" : ""
              } ${
                interactive ? "hover:bg-accent cursor-pointer" : "cursor-default"
              } px-2.5 py-2 transition-colors`}
              title={spec.trustStory}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                <span className="text-[10px] font-semibold truncate">{spec.label}</span>
                {!spec.hasHandler && (
                  <span
                    className="ml-auto text-[8px] font-mono uppercase tracking-wider text-muted-foreground shrink-0"
                    title="No workload — data bypasses compute"
                  >
                    {"∅"}
                  </span>
                )}
              </div>
              <div className="text-[9px] leading-tight opacity-80">
                {isActive
                  ? pres
                    ? `${pres.instance_count} path${pres.instance_count === 1 ? "" : "s"}${observed ? " · observed" : " · capable"}`
                    : "Eligible · no instances"
                  : "Not collected yet"}
              </div>
              {!isActive && spec.collectorBacklog && (
                <div
                  className="text-[8px] text-muted-foreground mt-1 truncate"
                  title={spec.collectorBacklog}
                >
                  {/* Show the sprint prefix; backlog strings are
                      formatted "Sprint X — detail" (em-dash separator).
                      Match prefix via regex so we don't depend on the
                      literal em-dash char surviving every editor pass. */}
                  {spec.collectorBacklog.match(/^Sprint\s+[A-Z0-9+]+/)?.[0] ?? "Pending"}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ArchetypeLegend() {
  return (
    <div className="flex items-center gap-2.5 text-[8px] uppercase tracking-wider text-muted-foreground">
      <LegendDot color="bg-rose-400" label="Observed" />
      <LegendDot color="bg-amber-400" label="Capable" />
      <LegendDot color="bg-muted-foreground" label="None found" />
      <LegendDot color="bg-muted-foreground/50" label="Not collected" dashed />
    </div>
  )
}

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string
  label: string
  dashed?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${color}${
          dashed ? " ring-1 ring-dashed ring-border" : ""
        }`}
      />
      <span>{label}</span>
    </span>
  )
}
