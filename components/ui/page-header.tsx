"use client"

import { ReactNode } from "react"
import { TrustEnvelopeBadge, type Provenance } from "@/components/trust/trust-envelope-badge"

/**
 * PageHeader — shared header pattern for top-level dashboard views.
 *
 * Per the dashboard design review (2026-04-30): "the trust pill with
 * confidence + freshness + sources + completeness on every page. This
 * is uniquely yours. Promote it from being only on Attack Paths and
 * Remediation History to being on every page header."
 *
 * The header has three slots:
 *   1. Identity:  uppercase eyebrow + h1 title + optional subtitle
 *   2. Trust:     <TrustEnvelopeBadge> when a provenance is supplied
 *   3. Actions:   right-side slot for refresh / period / filter buttons
 *
 * Pages that don't yet wire provenance simply omit the prop — the
 * header degrades gracefully to identity + actions only. This is
 * intentional: the design-review recommendation is to surface trust
 * EVERYWHERE, but composing the synthetic page-level provenance for
 * each page (worst-confidence + oldest-freshness across cards) is a
 * separate piece of work for each page. Until that's in, the slot
 * stays absent rather than fabricating a confidence we can't prove
 * (per memory feedback_no_mock_numbers_in_ui.md).
 */

export interface PageHeaderProps {
  /** Small uppercase label above the title. e.g. "CYNTRO · HOME" */
  eyebrow?: string
  /** Primary page title. Required. */
  title: string
  /** Optional one-line description of what's on the page. */
  subtitle?: string
  /** Trust envelope provenance — renders the TrustEnvelopeBadge below the title. */
  provenance?: Provenance
  /** Right-side slot: refresh buttons, period selectors, etc. */
  actions?: ReactNode
  /** Extra classes on the wrapper. */
  className?: string
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  provenance,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <header
      className={`flex items-start justify-between gap-4 rounded-[14px] border border-slate-200 bg-white px-5 py-4 ${className}`}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {eyebrow}
          </div>
        )}
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        )}
        {provenance && (
          <div className="mt-3">
            <TrustEnvelopeBadge provenance={provenance} compact />
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
