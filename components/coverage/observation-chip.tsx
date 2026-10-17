"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { CalendarClock, ChevronDown, ChevronUp } from "lucide-react"
import {
  HISTORY_BEFORE_UNKNOWN,
  OBSERVATION_NOT_RECORDED,
  coveragePageHref,
  formatCoverageInstant,
  formatCoverageRange,
  observedRangeLabel,
  sourceLabel,
  type Observation,
} from "@/lib/observation-coverage"

type Tone = "light" | "dark" | "theme"

const TONES: Record<Tone, { chip: string; muted: string; panel: string; gap: string; link: string }> = {
  light: {
    chip: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    muted: "border-dashed border-slate-300 bg-white text-slate-500",
    panel: "border-slate-200 bg-white text-slate-700",
    gap: "text-amber-800",
    link: "text-teal-700 hover:text-teal-800",
  },
  dark: {
    chip: "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700",
    muted: "border-dashed border-slate-600 bg-slate-800/60 text-slate-400",
    panel: "border-slate-700 bg-slate-800 text-slate-200",
    gap: "text-amber-300",
    link: "text-teal-300 hover:text-teal-200",
  },
  theme: {
    chip: "border-border bg-card text-foreground hover:bg-accent",
    muted: "border-dashed border-border bg-card text-muted-foreground",
    panel: "border-border bg-card text-foreground",
    gap: "text-amber-700 dark:text-amber-300",
    link: "text-emerald-700 hover:text-emerald-800 dark:text-emerald-300",
  },
}

/**
 * "Observed <from> → <to>" for the data a page renders, from the response's own
 * `observation` block (lib/observation-coverage.ts readObservation). Expands to
 * list each source's verified range and its gaps. Absent → "Observation not
 * recorded yet"; never a guessed range.
 */
export function ObservationChip({
  observation,
  pending = false,
  label,
  tone = "light",
  testId = "observation-chip",
}: {
  observation: Observation | null | undefined
  /** The response that would carry the observation has not arrived yet. */
  pending?: boolean
  /** Prefix that names what was observed, e.g. "Flows". */
  label?: string
  tone?: Tone
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const styles = TONES[tone]

  if (!observation) {
    return (
      <span
        data-testid={testId}
        data-observation="absent"
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${styles.muted}`}
      >
        <CalendarClock className="h-3 w-3" aria-hidden />
        {pending ? "Checking observation range" : label ? `${label}: ${OBSERVATION_NOT_RECORDED.toLowerCase()}` : OBSERVATION_NOT_RECORDED}
      </span>
    )
  }

  const gapCount = observation.sources.reduce((total, source) => total + source.gaps.length, 0)
  const range = observedRangeLabel(observation)
  const text = label ? `${label} · ${range}` : range
  const summary = [
    text,
    ...observation.sources.map((source) => `${sourceLabel(source.source)}${source.accountId ? ` · ${source.accountId}` : ""}${source.region ? ` · ${source.region}` : ""}: verified ${formatCoverageRange(source.earliestVerifiedAt, source.verifiedThrough)}${source.gaps.length ? `, ${source.gaps.length} gap${source.gaps.length === 1 ? "" : "s"}` : ""}`),
    HISTORY_BEFORE_UNKNOWN,
  ].join("\n")

  return (
    <span className="relative inline-flex" data-testid={testId} data-observation="present">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        title={summary}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${styles.chip}`}
      >
        <CalendarClock className="h-3 w-3" aria-hidden />
        <span>{text}</span>
        {gapCount ? <span className={styles.gap}>· {gapCount} gap{gapCount === 1 ? "" : "s"}</span> : null}
        {open ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Observation sources"
          className={`absolute left-0 top-full z-50 mt-1.5 w-[22rem] max-w-[90vw] rounded-lg border p-3 text-left text-xs shadow-xl ${styles.panel}`}
        >
          <p className="font-semibold">{range}</p>
          {observation.sources.length ? (
            <ul className="mt-2 space-y-2">
              {observation.sources.map((source, index) => (
                <li key={`${source.source}|${source.accountId ?? ""}|${source.region ?? ""}|${index}`}>
                  <p className="font-medium">
                    {sourceLabel(source.source)}
                    {source.accountId ? <span className="font-mono font-normal"> · {source.accountId}</span> : null}
                    {source.region ? <span className="font-normal"> · {source.region}</span> : null}
                  </p>
                  <p className="opacity-80">
                    Earliest verified {formatCoverageInstant(source.earliestVerifiedAt)} · verified through{" "}
                    {formatCoverageInstant(source.verifiedThrough)}
                  </p>
                  {source.gaps.length ? (
                    <ul className={`mt-0.5 space-y-0.5 ${styles.gap}`}>
                      {source.gaps.map((gap) => (
                        <li key={`${gap.from}|${gap.to}`}>
                          Gap {formatCoverageRange(gap.from, gap.to)}
                          {gap.reason ? ` — ${gap.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 opacity-80">The response named no sources for this range.</p>
          )}
          <p className="mt-2 opacity-80">{HISTORY_BEFORE_UNKNOWN} Not observed in this range is not proof of absence.</p>
          <Link href={coveragePageHref()} className={`mt-2 inline-block font-semibold ${styles.link}`}>
            Per-source coverage
          </Link>
        </div>
      ) : null}
    </span>
  )
}
