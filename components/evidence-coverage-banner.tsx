'use client'

import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'

/**
 * Says out loud how much OBSERVED evidence the findings below are built on.
 *
 * Cyntro's claim is "compare what is allowed against what is actually used".
 * When the behavioural sources fail, the allowed half still computes perfectly
 * — IAM policies and SG rules are config, and config collects fine. So the tab
 * renders a full set of confident risk numbers with no "actually used" behind
 * any of them, and nothing on screen says so.
 *
 * Measured on alon-prod 2026-08-01: 102 resources, 67 with config, and
 * evidence_collected = 0 across EVERY label, because VPC_FLOW, CLOUDTRAIL_MGMT
 * and S3_ACCESS_LOGS were all failing. The tab still showed "Excess
 * Permissions 73" and a Blast Radius of 65.
 *
 * This is the system-level twin of the row-level work: a role we could not
 * measure now renders "?" instead of a flattering number, and an ESTATE we
 * could not measure should not render confident totals silently either.
 *
 * Deliberately advisory, never blocking:
 *   - full evidence      -> renders nothing (no nagging when healthy)
 *   - partial            -> a quiet informational line
 *   - none, with config  -> a warning, because every number below is
 *                           config-only and that is not what the product claims
 *   - fetch fails        -> renders NOTHING. A coverage advisory must never
 *                           become another error surface on a tab that is
 *                           already reporting a backend problem.
 */

interface CoverageTotals {
  inventory_resources?: number
  config_collected?: number
  evidence_collected?: number
  remediation_ready?: number
}

export function EvidenceCoverageBanner({ systemName }: { systemName?: string }) {
  const [totals, setTotals] = useState<CoverageTotals | null>(null)

  useEffect(() => {
    if (!systemName) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/proxy/decision-coverage/system/${encodeURIComponent(systemName)}`,
          { cache: 'no-store' },
        )
        if (!res.ok) return // silence, not a second error card
        const payload = await res.json()
        if (!cancelled && payload?.totals) setTotals(payload.totals as CoverageTotals)
      } catch {
        /* advisory only — never surface */
      }
    })()
    return () => { cancelled = true }
  }, [systemName])

  if (!totals) return null

  const inventory = totals.inventory_resources ?? 0
  const evidence = totals.evidence_collected ?? 0
  if (inventory <= 0) return null
  if (evidence >= inventory) return null // fully covered — say nothing

  const none = evidence === 0
  const accent = none ? '#f59e0b' : 'var(--text-secondary)'

  return (
    <div
      data-testid="evidence-coverage-banner"
      className="flex items-start gap-2.5 rounded-lg border px-4 py-3 mb-4"
      style={{
        background: none ? 'rgba(245, 158, 11, 0.06)' : 'var(--bg-secondary)',
        borderColor: none ? 'rgba(245, 158, 11, 0.35)' : 'var(--border-subtle)',
      }}
    >
      <Eye className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: accent }} />
      <div className="text-sm">
        <div style={{ color: 'var(--text-primary)' }}>
          <span className="font-semibold">
            {none
              ? 'No observed evidence for this system'
              : `Observed evidence for ${evidence} of ${inventory} resources`}
          </span>
        </div>
        <div className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {none ? (
            <>
              Every finding below compares <em>configured</em> permissions and rules only —
              nothing here reflects what workloads actually did. Cyntro decides what is
              removable from observed traffic and API calls, so re-run the sync once the
              upstream sources are healthy before acting on these numbers.
            </>
          ) : (
            <>
              The remaining {inventory - evidence} are scored from configuration alone.
              Gaps for those reflect what is allowed, not what is used.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
