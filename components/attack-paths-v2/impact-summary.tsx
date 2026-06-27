// =============================================================================
// ImpactSummary — Sprint 0 visible artifact for a PathListRow.
//
// Renders the composite headline badge + the bucket chip row with confidence
// dots. Reads PathListRow.impact_* fields written by the BE impact-taxonomy
// classifier (PR 1 backend @ 0fa11f73). Spec: docs/specs/sprint_0_damage_taxonomy.md.
//
// No fallback heuristics: when the row carries impact_buckets=["UNKNOWN"]
// (legacy paths backfill hasn't reached yet, or paths with no actions),
// the chip reads "UNKNOWN" honestly. Per feedback_no_frontend_synthesis.
// =============================================================================

import type {
  HeadlineTag,
  ImpactBucket,
  ImpactConfidence,
  PathListRow,
} from "./attack-path-report-types"

// Headline colorway. Mapped to the existing severity palette so the badge
// reads consistently with the rest of the canvas.
const HEADLINE_STYLE: Record<HeadlineTag, { badge: string; ring: string }> = {
  CATASTROPHIC:        { badge: "bg-red-500/15 text-red-200 border-red-500/40",       ring: "ring-red-500/30" },
  TAKEOVER:            { badge: "bg-violet-500/15 text-violet-200 border-violet-500/40", ring: "ring-violet-500/30" },
  "SECRET LEAK":       { badge: "bg-orange-500/15 text-orange-200 border-orange-500/40", ring: "ring-orange-500/30" },
  "DATA BREACH":       { badge: "bg-amber-500/15 text-amber-200 border-amber-500/40",   ring: "ring-amber-500/30" },
  "DESTRUCTIVE ACCESS": { badge: "bg-red-500/15 text-red-200 border-red-500/40",       ring: "ring-red-500/30" },
  "EVASION ENABLED":   { badge: "bg-rose-500/15 text-rose-200 border-rose-500/40",     ring: "ring-rose-500/30" },
  EXPOSURE:            { badge: "bg-slate-500/15 text-slate-200 border-slate-500/40",  ring: "ring-slate-500/30" },
  "CONFIGURED RISK":   { badge: "bg-slate-700/30 text-slate-400 border-slate-600/40",  ring: "ring-slate-600/30" },
}

const BUCKET_STYLE: Record<ImpactBucket, string> = {
  READ:             "bg-slate-700/30 text-slate-300 border-slate-600/40",
  WRITE:            "bg-blue-500/15 text-blue-200 border-blue-500/40",
  EXFIL:            "bg-amber-500/15 text-amber-200 border-amber-500/40",
  DESTRUCTIVE:      "bg-red-500/15 text-red-200 border-red-500/40",
  PRIV_ESC:         "bg-violet-500/15 text-violet-200 border-violet-500/40",
  PERSISTENCE:      "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/40",
  EVASION:          "bg-rose-500/15 text-rose-200 border-rose-500/40",
  SECRET_EXPOSURE:  "bg-orange-500/15 text-orange-200 border-orange-500/40",
  EXECUTION:        "bg-teal-500/15 text-teal-200 border-teal-500/40",
  UNKNOWN:          "bg-slate-700/30 text-slate-400 border-slate-700/40",
}

const CONFIDENCE_DOT: Record<ImpactConfidence, string> = {
  HIGH:   "bg-emerald-400",
  MEDIUM: "bg-amber-400",
  LOW:    "bg-slate-500",
}

const CONFIDENCE_TITLE: Record<ImpactConfidence, string> = {
  HIGH:   "HIGH — resource-scoped policy + literal actions",
  MEDIUM: "MEDIUM — wildcard actions or conditional policy",
  LOW:    "LOW — service skips scope filtering (KMS/DDB) or Resource=*",
}

const BUCKET_LABEL: Record<ImpactBucket, string> = {
  READ: "READ",
  WRITE: "WRITE",
  EXFIL: "EXFIL",
  DESTRUCTIVE: "DESTRUCTIVE",
  PRIV_ESC: "PRIV ESC",
  PERSISTENCE: "PERSISTENCE",
  EVASION: "EVASION",
  SECRET_EXPOSURE: "SECRET",
  EXECUTION: "EXECUTION",
  UNKNOWN: "UNKNOWN",
}

export function ImpactSummary({
  row,
  compact = false,
}: {
  row: PathListRow
  /** compact mode for tight list rows — hides chip text, shows dot+abbreviation only. */
  compact?: boolean
}) {
  const headlineStyle = HEADLINE_STYLE[row.impact_headline] ?? HEADLINE_STYLE["CONFIGURED RISK"]
  const buckets = row.impact_buckets ?? ["UNKNOWN"]
  const conf = row.impact_confidence

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="impact-summary">
      {/* Headline badge */}
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${headlineStyle.badge}`}
        title={`Headline: ${row.impact_headline}${conf ? ` · confidence ${conf}` : ""}`}
        data-testid="impact-headline"
      >
        {row.impact_headline}
        <ConfidenceDot conf={conf} />
      </span>

      {/* Chips */}
      {!compact && (
        <div className="flex items-center gap-1 flex-wrap" data-testid="impact-chips">
          {buckets.map(bucket => (
            <span
              key={bucket}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${BUCKET_STYLE[bucket] ?? BUCKET_STYLE.UNKNOWN}`}
              title={`${BUCKET_LABEL[bucket]} · ${CONFIDENCE_TITLE[conf]}`}
              data-testid={`impact-chip-${bucket}`}
            >
              {BUCKET_LABEL[bucket]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ConfidenceDot({ conf }: { conf: ImpactConfidence }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${CONFIDENCE_DOT[conf]}`}
      title={CONFIDENCE_TITLE[conf]}
      aria-label={`confidence: ${conf}`}
    />
  )
}
