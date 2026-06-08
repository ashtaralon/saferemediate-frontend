"use client"

import type { ReactNode } from "react"

// SG-9d label-value row. Fixed 140px label column + 1fr value column
// fixes the visual gap that the legacy `Row` component (flex justify-
// between) showed on long mono IDs like vpc-0329e985173bed24f.
// Reusable across every card in the SG detail view.

export function KVRow({
  label,
  value,
  mono,
  emphasis,
  tone,
}: {
  label: string
  value: string | number | ReactNode | null | undefined
  mono?: boolean
  emphasis?: boolean
  /** Optional semantic tone for the value. */
  tone?: "neutral" | "good" | "warn" | "bad"
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "bad"
      ? "text-red-700 dark:text-red-300"
      : ""

  const isEmpty =
    value === null || value === undefined || value === "" || value === 0
      ? value === 0
        ? false // 0 is still a real value to show
        : true
      : false

  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1 text-sm items-baseline">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground pt-0.5">
        {label}
      </span>
      <span
        className={[
          mono ? "font-mono text-[12px] break-all" : "",
          emphasis ? "font-semibold" : "",
          toneClass,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isEmpty ? <span className="text-zinc-400">—</span> : value}
      </span>
    </div>
  )
}
