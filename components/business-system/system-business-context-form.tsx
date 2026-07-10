'use client'

import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'

const TIERS = [
  'MISSION_CRITICAL',
  'BUSINESS_CRITICAL',
  'IMPORTANT',
  'STANDARD',
] as const

type Props = {
  systemName: string
  initial?: {
    business_tier?: string | null
    owner?: string | null
    regulatory?: string[]
  } | null
  onSaved?: () => void
}

export function SystemBusinessContextForm({ systemName, initial, onSaved }: Props) {
  const [tier, setTier] = useState(initial?.business_tier || '')
  const [owner, setOwner] = useState(initial?.owner || '')
  const [regulatory, setRegulatory] = useState((initial?.regulatory || []).join(', '))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/proxy/system-context/${encodeURIComponent(systemName)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return
      const json = await res.json()
      setTier(json.business_tier || '')
      setOwner(json.owner || '')
      setRegulatory((json.regulatory || []).join(', '))
    } catch {
      /* ignore */
    }
  }, [systemName])

  useEffect(() => {
    if (initial) {
      setTier(initial.business_tier || '')
      setOwner(initial.owner || '')
      setRegulatory((initial.regulatory || []).join(', '))
    } else {
      void load()
    }
  }, [initial, load])

  const save = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const body: Record<string, unknown> = {
        context_source: 'AUTHORED',
      }
      if (tier) body.business_tier = tier
      body.owner = owner || null
      body.regulatory = regulatory
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const res = await fetch(
        `/api/proxy/system-context/${encodeURIComponent(systemName)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const json = await res.json()
      if (!res.ok) {
        setError(json.detail || json.error || `HTTP ${res.status}`)
        return
      }
      setMessage('Saved business context')
      onSaved?.()
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="system-business-context-form"
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Business context (authored)
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Never inferred from network topology. Required on ≥80% of rankable systems
        before ranking uses “business impact” copy.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-600">
          Business tier
          <select
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            data-testid="business-tier-select"
          >
            <option value="">— unset —</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-600">
          Owner
          <input
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-900"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Team or person"
            data-testid="business-owner-input"
          />
        </label>
        <label className="block text-xs text-slate-600 sm:col-span-2">
          Regulatory scope
          <input
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-900"
            value={regulatory}
            onChange={(e) => setRegulatory(e.target.value)}
            placeholder="PCI, SOX, HIPAA (comma-separated)"
            data-testid="business-regulatory-input"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save'}
        </button>
        {message && <span className="text-xs text-emerald-700">{message}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
