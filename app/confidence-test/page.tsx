'use client'

import React, { useState } from 'react'
import { ConfidenceExplanationPanel } from '@/components/ConfidenceExplanationPanel'
import type { ConfidenceScore } from '@/lib/types'

export default function ConfidenceTestPage() {
  const [roleName, setRoleName] = useState('')
  const [permsText, setPermsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState<ConfidenceScore | null>(null)

  const handleCheck = async () => {
    if (!roleName.trim()) {
      setError('Enter a role name')
      return
    }
    setLoading(true)
    setError(null)
    setScore(null)
    try {
      const permissions = permsText
        .split(/[\s,\n]+/)
        .map(p => p.trim())
        .filter(Boolean)
      const res = await fetch('/api/proxy/confidence/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_name: roleName.trim(),
          permissions_to_remove: permissions,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`)
      }
      setScore(data as ConfidenceScore)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Agent 5 · Confidence Scorer Test</h1>
        <p className="text-sm text-slate-600 mt-1">
          End-to-end verification for the <code>/api/confidence/check</code> backend endpoint,
          including the LLM explanation layer.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4 bg-white">
        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Role name
          </label>
          <input
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
            placeholder="e.g. app-backend-role"
            value={roleName}
            onChange={e => setRoleName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Permissions to remove (optional, whitespace or comma separated)
          </label>
          <textarea
            className="mt-1 w-full border rounded px-3 py-2 text-sm font-mono"
            rows={3}
            placeholder="s3:DeleteObject&#10;iam:PassRole"
            value={permsText}
            onChange={e => setPermsText(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <button
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            onClick={handleCheck}
            disabled={loading || !roleName.trim()}
          >
            {loading ? 'Scoring...' : 'Get Confidence Score'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {score && <ConfidenceExplanationPanel score={score} />}

      {score && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-600">Raw JSON response</summary>
          <pre className="mt-2 bg-slate-900 text-slate-100 p-3 rounded overflow-auto">
            {JSON.stringify(score, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
