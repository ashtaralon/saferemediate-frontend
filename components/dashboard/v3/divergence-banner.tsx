"use client"

import { labelClass } from "./styles"
import { useCachedFetch } from "@/lib/use-cached-fetch"

/**
 * Divergence banner — conditional render only when total_conflicts > 0.
 *
 * When CT and AA disagree on whether a permission was used, that's a
 * hard binary conflict that BLOCKS auto-remediation per architecture
 * §11E. This banner surfaces those blockers.
 *
 * Real source: /api/proxy/evidence/divergence/summary (already
 * org-wide aggregated server-side).
 *
 * Returns null entirely when conflicts == 0 — no false-positive banner.
 */

type DivergenceSummary = {
  total_conflicts?: number
  by_type?: Record<string, number>
  error?: string
}

export function DivergenceBanner() {
  // Banner is non-blocking — absence is honest. Use the retry hook so a
  // cold-start 504 doesn't silently hide a real conflict; if all retries
  // fail we just don't render (same posture as the original silent catch).
  const { data } = useCachedFetch<DivergenceSummary>(
    "/api/proxy/evidence/divergence/summary",
    { cacheKey: "divergence-summary", fetchInit: { cache: "no-store" } }
  )

  const total = data?.total_conflicts ?? 0
  if (total === 0) return null

  const breakdown = Object.entries(data?.by_type ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${v} ${k.toLowerCase()}`)
    .join(" · ")

  return (
    <section className="rounded-[14px] border border-rose-200 bg-rose-50/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={labelClass}>Hard evidence conflicts detected</div>
          <div className="mt-1 text-sm text-slate-900">
            <span className="font-semibold">
              {total} CloudTrail-vs-Access-Analyzer conflict{total > 1 ? "s" : ""}
            </span>{" "}
            — these block auto-remediation until resolved.
            {breakdown && <span className="text-slate-600"> ({breakdown})</span>}
          </div>
        </div>
        <a
          href="/findings?filter=divergence"
          className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
        >
          Investigate →
        </a>
      </div>
    </section>
  )
}
