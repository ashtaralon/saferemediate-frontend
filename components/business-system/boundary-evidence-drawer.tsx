'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Loader2 } from 'lucide-react'

export type BoundaryEvidencePayload = {
  system_name?: string
  resource?: string
  proposed_system?: string
  kind?: string
  rankable?: boolean
  rejected?: boolean
  boundary_reason?: string
  reason?: string
  bullets?: string[]
  competing_systems?: string[]
  decision_type?: string
  reversible?: boolean | null
  rejected_by?: string | null
  error?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** System boundary mode */
  systemName?: string | null
  /** PendingTag mode — POST fields to evidence builder */
  pendingTag?: Record<string, unknown> | null
  title?: string
}

export function BoundaryEvidenceDrawer({
  open,
  onOpenChange,
  systemName,
  pendingTag,
  title,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<BoundaryEvidencePayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setData(null)
      try {
        if (pendingTag) {
          const res = await fetch('/api/proxy/business-system/pending-tag-evidence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pendingTag),
          })
          const json = await res.json()
          if (!cancelled) {
            if (!res.ok) setError(json.error || `HTTP ${res.status}`)
            setData(json)
          }
        } else if (systemName) {
          const res = await fetch(
            `/api/proxy/business-system/${encodeURIComponent(systemName)}/detail-enhancements`,
            { cache: 'no-store' },
          )
          const json = await res.json()
          if (!cancelled) {
            if (!res.ok) setError(json.error || `HTTP ${res.status}`)
            setData(json.boundary_evidence || json)
          }
        } else {
          if (!cancelled) setError('No system or pending tag provided')
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load evidence')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, systemName, pendingTag])

  const heading =
    title ||
    (pendingTag
      ? 'Boundary review evidence'
      : `System boundary · ${systemName || ''}`)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{heading}</SheetTitle>
          <SheetDescription>
            Auditable reasons for this classification or pending membership decision.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4" data-testid="boundary-evidence-drawer">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading evidence…
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {data && !loading && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                {data.kind && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                    {data.kind}
                  </span>
                )}
                {data.reason && (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-800">
                    {data.reason}
                  </span>
                )}
                {data.boundary_reason && !data.reason && (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-800">
                    {data.boundary_reason}
                  </span>
                )}
                {data.rankable === false && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500">
                    not rankable
                  </span>
                )}
                {data.rejected && (
                  <span className="rounded bg-red-50 px-2 py-0.5 text-red-700">
                    rejected
                    {data.reversible ? ' · reversible' : ''}
                  </span>
                )}
              </div>

              {(data.resource || data.proposed_system) && (
                <div className="text-xs text-slate-600 space-y-1">
                  {data.resource && <div>Resource: {data.resource}</div>}
                  {data.proposed_system && <div>Proposed system: {data.proposed_system}</div>}
                </div>
              )}

              <ul className="space-y-2 text-sm text-slate-800 list-disc pl-5">
                {(data.bullets || []).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>

              {(data.competing_systems?.length || 0) > 0 && (
                <div className="text-xs text-slate-600">
                  Competing systems:{' '}
                  <span className="font-medium">{data.competing_systems!.join(', ')}</span>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
