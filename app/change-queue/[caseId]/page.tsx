"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChangeCaseReview, type ChangeCaseArtifact } from '@/components/change-case-review'

export default function ChangeCasePage() {
  const params = useParams<{ caseId: string }>()
  const router = useRouter()
  const [changeCase, setChangeCase] = useState<ChangeCaseArtifact | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(`/api/proxy/change-cases/${encodeURIComponent(params.caseId)}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.detail || payload.error || 'Change Case failed')
        if (!cancelled) setChangeCase(payload)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Change Case failed')
      }
    })()
    return () => { cancelled = true }
  }, [params.caseId])

  if (error) return <main className="min-h-screen bg-slate-50 p-8 text-red-900">{error}</main>
  if (!changeCase) return <main className="min-h-screen bg-slate-50 p-8 text-slate-600">Loading Change Case…</main>
  return (
    <main className="min-h-screen bg-slate-100">
      <ChangeCaseReview
        changeCase={changeCase}
        executing={false}
        onClose={() => router.push('/change-queue')}
        onCaseUpdate={setChangeCase}
      />
    </main>
  )
}
