"use client"

import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

export function ConvergencePathList({
  paths,
  selectedPathId,
  onSelectPath,
  loading,
}: {
  paths: ConvergencePath[]
  selectedPathId: string | null
  onSelectPath: (pathId: string) => void
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading paths…</div>
    )
  }

  if (!paths.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No materialized paths reach this crown jewel.
      </div>
    )
  }

  const sorted = [...paths].sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === "observed" ? -1 : 1
    }
    return b.score - a.score
  })

  return (
    <div className="divide-y divide-border">
      {sorted.map((p) => {
        const active = p.path_id === selectedPathId
        return (
          <button
            key={p.path_id}
            type="button"
            onClick={() => onSelectPath(p.path_id)}
            className={`w-full text-left px-4 py-3 transition-colors hover:bg-muted/60 ${
              active ? "bg-muted border-l-2 border-l-cyan-500" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">
                {p.source ?? p.path_id}
              </span>
              <span className="text-xs font-mono text-muted-foreground shrink-0">
                {p.score}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span
                className={
                  p.confidence === "observed"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }
              >
                {p.confidence}
              </span>
              {p.identity_name ? <span>via {p.identity_name}</span> : null}
              {p.hop_count > 0 ? <span>{p.hop_count} hops</span> : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}
