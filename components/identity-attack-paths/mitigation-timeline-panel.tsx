"use client"

/**
 * MitigationTimelinePanel — dedicated right-side Sheet that opens when
 * an operator clicks "View full timeline" on a path node card.
 *
 * Stage C of the Tier-1 attack-paths enrichment (chip item 15). The
 * inline expansion on ChainCard is good for "is there any?" — this
 * panel handles the next question: "what happened, when, with what
 * outcome, and who fired it?"
 *
 * Per `feedback_remediation_safety_signals` we surface confidence,
 * success, partial, and rollback state next to every event — never
 * claim "safe", just report what was recorded.
 *
 * Per `feedback_signal_language` event copy is descriptive ("Rolled
 * back by alice@", "Forced past safety gate") — never editorial
 * ("Suspicious override").
 *
 * Per `feedback_not_detection_response` the panel frames these as
 * "prior closure actions" — Cyntro is closure-by-observation, not
 * detection/response.
 */

import { useMemo, useState } from "react"
import {
  Lock,
  RotateCcw,
  Shield,
  ShieldCheck,
  ShieldOff,
  Sparkles,
} from "lucide-react"

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

import type { MitigationEvent, MitigationKind } from "./types"

// Icon + label + chip palette per kind. Kept inline (not in lib/types)
// because it's view-only — backend never sees these. Palette follows
// the existing path-killer-map vocabulary.
const KIND_CONFIG: Record<
  MitigationKind,
  { label: string; Icon: typeof Shield; tone: string }
> = {
  RemediationEvent: {
    label: "Remediation",
    Icon: ShieldCheck,
    tone: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  },
  RollbackEvent: {
    label: "Rollback",
    Icon: RotateCcw,
    tone: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  },
  OverrideEvent: {
    label: "Override",
    Icon: ShieldOff,
    tone: "text-red-400 bg-red-500/10 border-red-500/30",
  },
  QuarantineRecord: {
    label: "Quarantine",
    Icon: Lock,
    tone: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  },
  MutationEvent: {
    label: "Mutation",
    Icon: Sparkles,
    tone: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  },
}

// Filter chip order — most-significant-first per operator expectation
// ("show me overrides before sweeping rollbacks").
const KIND_ORDER: MitigationKind[] = [
  "OverrideEvent",
  "QuarantineRecord",
  "RollbackEvent",
  "RemediationEvent",
  "MutationEvent",
]

type KindFilter = MitigationKind | "all"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeName: string
  nodeType?: string | null
  events: MitigationEvent[]
}

export function MitigationTimelinePanel({
  open,
  onOpenChange,
  nodeName,
  nodeType,
  events,
}: Props) {
  const [filter, setFilter] = useState<KindFilter>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const byKind = useMemo(() => {
    const m = new Map<MitigationKind, MitigationEvent[]>()
    for (const ev of events) {
      const list = m.get(ev.kind) ?? []
      list.push(ev)
      m.set(ev.kind, list)
    }
    for (const list of m.values()) {
      list.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    }
    return m
  }, [events])

  const visible = useMemo(() => {
    if (filter === "all") {
      return events.slice().sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    }
    return byKind.get(filter) ?? []
  }, [events, byKind, filter])

  // Only render filter chips for kinds that actually have data — no dead
  // chips reflecting absent data (three-state contract per
  // `feedback_no_mock_numbers_in_ui`).
  const availableKinds = useMemo(
    () => KIND_ORDER.filter((k) => (byKind.get(k)?.length ?? 0) > 0),
    [byKind],
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl bg-slate-900 border-slate-700 text-slate-100 overflow-y-auto"
      >
        <SheetHeader className="pb-4 border-b border-slate-800">
          <SheetTitle className="text-base font-semibold text-white">
            Prior closure actions
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-400">
            <span className="font-mono text-slate-300">{nodeName}</span>
            {nodeType ? (
              <span className="ml-1 text-slate-500">· {nodeType}</span>
            ) : null}
            <span className="ml-2 text-slate-500">
              {events.length} event{events.length === 1 ? "" : "s"} recorded
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pt-4 flex flex-wrap gap-1.5 text-[10px]">
          <FilterChip
            label={`All (${events.length})`}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {availableKinds.map((k) => {
            const cfg = KIND_CONFIG[k]
            const count = byKind.get(k)?.length ?? 0
            return (
              <FilterChip
                key={k}
                label={`${cfg.label} (${count})`}
                active={filter === k}
                onClick={() => setFilter(k)}
                tone={cfg.tone}
              />
            )
          })}
        </div>

        <div className="px-4 pt-3 pb-6 flex flex-col gap-2">
          {visible.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No events match this filter.
            </div>
          ) : (
            visible.map((ev) => (
              <EventRow
                key={ev.id}
                event={ev}
                expanded={expandedId === ev.id}
                onToggle={() =>
                  setExpandedId(expandedId === ev.id ? null : ev.id)
                }
              />
            ))
          )}
        </div>

        <div className="sticky bottom-0 bg-slate-900/95 border-t border-slate-800 px-4 py-3 flex justify-end">
          <SheetClose className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors">
            Close
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function FilterChip({
  label,
  active,
  onClick,
  tone,
}: {
  label: string
  active: boolean
  onClick: () => void
  tone?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 rounded border font-medium tracking-wide transition-colors",
        active
          ? tone ?? "text-white bg-slate-700 border-slate-600"
          : "text-slate-400 bg-slate-800/50 border-slate-700 hover:text-slate-200",
      )}
    >
      {label}
    </button>
  )
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: MitigationEvent
  expanded: boolean
  onToggle: () => void
}) {
  const cfg = KIND_CONFIG[event.kind] ?? KIND_CONFIG.RemediationEvent
  const Icon = cfg.Icon
  const at = event.at ? formatAt(event.at) : "—"
  const statusChip = statusChipFor(event)
  const confidenceChip = confidenceChipFor(event)
  const detailsAvailable = Boolean(
    event.rationale ||
      event.overridden_by ||
      event.rolled_back_by ||
      event.rolled_back_at ||
      event.initiated_by ||
      event.rel_type ||
      event.resource_type,
  )

  return (
    <div className="rounded-md border border-slate-700 bg-slate-800/40">
      <button
        type="button"
        onClick={detailsAvailable ? onToggle : undefined}
        className={cn(
          "w-full px-3 py-2 flex items-start gap-3 text-left",
          detailsAvailable ? "cursor-pointer" : "cursor-default",
        )}
      >
        <div
          className={cn(
            "w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5 border",
            cfg.tone,
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-100 truncate">
              {event.event_type ?? cfg.label}
            </span>
            {statusChip}
            {confidenceChip}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 flex items-center gap-2">
            <span>{at}</span>
            {event.resource_type ? (
              <span className="text-slate-500">· {event.resource_type}</span>
            ) : null}
            {event.rel_type ? (
              <span className="text-slate-500 font-mono">{event.rel_type}</span>
            ) : null}
          </div>
        </div>
        {detailsAvailable ? (
          <span className="text-[10px] text-slate-500 mt-1">
            {expanded ? "Hide" : "Details"}
          </span>
        ) : null}
      </button>
      {expanded && detailsAvailable ? (
        <div className="px-3 pb-3 pl-12 flex flex-col gap-1 text-[10px] text-slate-300">
          {event.rationale ? (
            <div>
              <span className="text-slate-500">Rationale:</span>{" "}
              <span className="text-slate-200">{event.rationale}</span>
            </div>
          ) : null}
          {event.overridden_by ? (
            <div>
              <span className="text-slate-500">Forced by:</span>{" "}
              <span className="text-slate-200">{event.overridden_by}</span>
            </div>
          ) : null}
          {event.initiated_by ? (
            <div>
              <span className="text-slate-500">Initiated by:</span>{" "}
              <span className="text-slate-200">{event.initiated_by}</span>
            </div>
          ) : null}
          {event.rolled_back_by || event.rolled_back_at ? (
            <div>
              <span className="text-slate-500">Rolled back:</span>{" "}
              <span className="text-slate-200">
                {event.rolled_back_by ?? "auto"}
                {event.rolled_back_at
                  ? ` · ${formatAt(event.rolled_back_at)}`
                  : ""}
              </span>
            </div>
          ) : null}
          {event.quarantined_at ? (
            <div>
              <span className="text-slate-500">Quarantined:</span>{" "}
              <span className="text-slate-200">{formatAt(event.quarantined_at)}</span>
            </div>
          ) : null}
          {event.restored_at ? (
            <div>
              <span className="text-slate-500">Restored:</span>{" "}
              <span className="text-slate-200">{formatAt(event.restored_at)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// Descriptive status — surface the recorded outcome without editorializing.
function statusChipFor(event: MitigationEvent): React.ReactNode {
  if (event.success === false) {
    return (
      <span className="px-1.5 py-0.5 text-[9px] rounded border bg-red-500/10 border-red-500/30 text-red-300">
        FAILED
      </span>
    )
  }
  if (event.rolled_back_at) {
    return (
      <span className="px-1.5 py-0.5 text-[9px] rounded border bg-amber-500/10 border-amber-500/30 text-amber-300">
        ROLLED BACK
      </span>
    )
  }
  if (event.status) {
    const s = event.status.toString().toUpperCase()
    const palette =
      event.success === true || s === "SUCCESS" || s === "RESTORED"
        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
        : s === "FAILED" || s === "ERROR"
          ? "bg-red-500/10 border-red-500/30 text-red-300"
          : "bg-slate-700/40 border-slate-600 text-slate-300"
    return (
      <span
        className={cn(
          "px-1.5 py-0.5 text-[9px] rounded border tabular-nums",
          palette,
        )}
      >
        {s}
      </span>
    )
  }
  return null
}

function confidenceChipFor(event: MitigationEvent): React.ReactNode {
  const raw = event.confidence
  if (raw == null) return null
  // Backend writes 0..1 for RemediationEvent.confidence_score and 0..100
  // for QuarantineRecord.safetyScore. Normalize.
  const pct = raw > 1 ? Math.round(raw) : Math.round(raw * 100)
  if (pct <= 0) return null
  return (
    <span className="px-1.5 py-0.5 text-[9px] rounded border bg-slate-700/40 border-slate-600 text-slate-300 tabular-nums">
      conf {pct}%
    </span>
  )
}

function formatAt(iso: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
