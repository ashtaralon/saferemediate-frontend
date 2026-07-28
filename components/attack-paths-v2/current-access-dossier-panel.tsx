"use client"

/**
 * Pinned Current Access dossier — composed checkpoints for one path_id.
 * Selection surface stays on Zoom0; this panel is the investigation story.
 */

import { X } from "lucide-react"
import type { CurrentAccessDossier } from "@/lib/attack-paths/build-current-access-dossier"

function statusTone(status: string): string {
  const s = status.toUpperCase()
  if (s.includes("OPEN_OBSERVED") || s === "OBSERVED") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
  }
  if (s.includes("OPEN") || s === "CONFIGURED" || s === "RECOMMENDED") {
    return "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300"
  }
  if (s.includes("UNKNOWN") || s === "UNAVAILABLE" || s === "UNVERIFIED") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
  }
  if (s.includes("BLOCK") || s.includes("DENY") || s.includes("CLOSED")) {
    return "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300"
  }
  return "border-border bg-muted/40 text-muted-foreground"
}

export function CurrentAccessDossierPanel({
  dossier,
  jewelName,
  hopsPending,
  onClearPin,
}: {
  dossier: CurrentAccessDossier | null
  jewelName: string
  hopsPending?: boolean
  onClearPin?: () => void
}) {
  if (hopsPending) {
    return (
      <aside
        className="flex w-full flex-col bg-background min-h-[120px]"
        data-testid="current-access-dossier"
        data-state="loading"
      >
        <div className="px-4 py-3 text-[12px] text-muted-foreground">
          Loading hop DTO for pinned path…
        </div>
      </aside>
    )
  }

  if (!dossier) {
    return (
      <aside
        className="flex w-full flex-col bg-background min-h-[120px]"
        data-testid="current-access-dossier"
        data-state="missing"
      >
        <div className="px-4 py-3 text-[12px] text-muted-foreground">
          Pinned path not in SERVE fan-in — cannot open Current Access dossier.
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="flex w-full flex-col bg-background"
      data-testid="current-access-dossier"
      data-path-id={dossier.path_id}
      data-evidence={dossier.evidence}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-800 dark:text-rose-300">
            Current Access dossier
          </p>
          <p className="mt-0.5 text-[13px] font-semibold text-foreground leading-snug">
            {dossier.headline}
          </p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground truncate">
            → {jewelName}
          </p>
          <p
            className="mt-1 font-mono text-[10px] text-muted-foreground truncate"
            title={dossier.path_id}
            data-testid="dossier-path-id"
          >
            path {dossier.path_id.slice(0, 12)}…
          </p>
        </div>
        {onClearPin ? (
          <button
            type="button"
            onClick={onClearPin}
            className="shrink-0 rounded border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear path pin"
            data-testid="dossier-clear-pin"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <ol
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2"
        data-testid="dossier-checkpoints"
      >
        {dossier.checkpoints.map((cp, idx) => (
          <li
            key={cp.kind}
            className="rounded-lg border border-border bg-muted/20 px-3 py-2.5"
            data-testid={`dossier-checkpoint-${cp.kind}`}
            data-checkpoint={cp.kind}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] text-muted-foreground">
                {idx + 1}
              </span>
              <span className="text-[12px] font-semibold text-foreground">
                {cp.label}
              </span>
              <span
                className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${statusTone(cp.status)}`}
              >
                {cp.status}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
              {cp.summary}
            </p>
            <dl className="mt-2 space-y-1">
              {cp.details.map((row) => (
                <div key={`${cp.kind}-${row.label}`} className="grid grid-cols-[7.5rem_1fr] gap-2">
                  <dt className="font-mono text-[10px] text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="text-[11px] text-foreground break-words">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </aside>
  )
}
