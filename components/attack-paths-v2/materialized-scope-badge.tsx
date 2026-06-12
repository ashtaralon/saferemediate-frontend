"use client"

/** Honest collector-scoped transparency — surfaced list vs live graph total. */
export function MaterializedScopeBadge({
  surfaced,
  graphTotal,
}: {
  surfaced: number
  graphTotal?: number
}) {
  if (graphTotal == null || graphTotal <= 0 || graphTotal <= surfaced) return null
  return (
    <span
      className="inline-flex items-center rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground tabular-nums"
      title="Collector-scoped synthesis shows a subset of live graph-backed attack paths for this jewel."
    >
      {surfaced} of {graphTotal} in graph
    </span>
  )
}
