"use client"

import { AlertTriangle, XOctagon } from "lucide-react"
import type { LPIntegrity } from "@/lib/lp-integrity"
import { lpIntegrityCopy, lpIntegrityFooter } from "@/lib/lp-integrity"

/**
 * Banner shown when an LP analyzer sweep did not complete.
 *
 * Renders nothing on READY — this is an exception state, not a status strip.
 *
 * Deliberately NOT dismissible. The whole point is that the list below it is a
 * subset of unknown size; letting an operator close the banner and then act on
 * the rows recreates the failure it exists to prevent.
 */
export function AnalysisIntegrityBanner({
  integrity,
  className = "",
}: {
  integrity: LPIntegrity
  className?: string
}) {
  if (integrity.state === "READY") return null

  const notReady = integrity.state === "NOT_READY"
  const { title, body } = lpIntegrityCopy(integrity)
  const footer = lpIntegrityFooter(integrity)
  const Icon = notReady ? XOctagon : AlertTriangle

  // NOT_READY (nothing ran) is red; INTEGRITY_HELD (some analyzers ran) amber.
  // Both block Apply — the colour distinguishes how much we know, not how
  // much is permitted.
  const tone = notReady
    ? "border-l-red-600 bg-red-950/30 text-red-100"
    : "border-l-amber-500 bg-amber-950/30 text-amber-100"
  const iconTone = notReady ? "text-red-400" : "text-amber-400"

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 rounded-md border border-white/10 border-l-4 px-4 py-3 ${tone} ${className}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="text-sm leading-snug opacity-90">{body}</p>
        {footer ? <p className="text-xs opacity-75">{footer}</p> : null}
      </div>
    </div>
  )
}

/**
 * Inline marker for a number that came from a partial sweep.
 *
 * Use next to counts rather than hiding them — an operator can still act on
 * partial data usefully, but must never read a shrunken count as an improved
 * posture. Fewer findings from an incomplete sweep looks like a healthier
 * account, which is the most dangerous shape in this whole feature.
 */
export function PartialCountMarker({ className = "" }: { className?: string }) {
  return (
    <span
      title="Partial — one or more analyzers did not finish, so this number is a floor, not a total."
      className={`ml-1 align-middle text-xs font-medium text-amber-400 ${className}`}
    >
      partial
    </span>
  )
}
