"use client"

import { useState, useEffect } from 'react'

interface Snapshot {
  snapshot_id: string
  finding_id?: string
  issue_id?: string
  resource_type: string
  resource_name?: string
  resource_id?: string
  system_name?: string
  created_at: string
  current_state?: any
}

export default function SnapshotsRecoveryTab({ systemName }: { systemName?: string }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSnapshots()
  }, [])

  async function loadSnapshots() {
    try {
      setLoading(true)
      setError(null)
      
      const res = await fetch('/api/proxy/snapshots', {
        cache: 'no-store',
      })

      if (!res.ok) {
        throw new Error(`Failed to load: ${res.status}`)
      }

      const data = await res.json()
      
      const snapshotList = Array.isArray(data) ? data : (data.snapshots || [])
      
      const sorted = snapshotList.sort((a: Snapshot, b: Snapshot) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      
      setSnapshots(sorted)
    } catch (err) {
      console.error('Load error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  function getDisplayName(snapshot: Snapshot): string {
    return snapshot.resource_name ||
           snapshot.system_name ||
           snapshot.resource_id ||
           snapshot.current_state?.role_name ||
           snapshot.current_state?.resource_name ||
           snapshot.finding_id ||
           snapshot.snapshot_id.substring(0, 20) + '...'
  }

  async function handleRestore(snapshot: Snapshot) {
    const displayName = getDisplayName(snapshot)

    if (!confirm(`Restore this snapshot?\n\nResource: ${displayName}\nType: ${snapshot.resource_type}`)) {
      return
    }

    try {
      setRestoring(snapshot.snapshot_id)
      setError(null)

      const res = await fetch(
        `/api/proxy/snapshots/${snapshot.snapshot_id}/rollback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || `Failed: ${res.status}`)
      }

      alert(`✅ Restored!\n\nResource: ${displayName}\nType: ${snapshot.resource_type}`)
      
      await loadSnapshots()
      
    } catch (err) {
      console.error('Restore error:', err)
      const message = err instanceof Error ? err.message : 'Restore failed'
      setError(message)
      alert(`❌ Failed: ${message}`)
    } finally {
      setRestoring(null)
    }
  }

  function getTimeAgo(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error && snapshots.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error</h3>
        <p className="text-red-600">{error}</p>
        <button
          onClick={loadSnapshots}
          className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {snapshots.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900">No snapshots yet</h3>
          <p className="mt-2 text-gray-600">Snapshots appear after remediations</p>
        </div>
      ) : (
        <div className="space-y-3">
          {snapshots.map((snapshot) => (
            <div key={snapshot.snapshot_id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {getDisplayName(snapshot)}
                    </h4>
                    <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                      {snapshot.resource_type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">ID: {snapshot.snapshot_id}</p>
                  <p className="text-xs text-gray-500 mt-1">Created: {getTimeAgo(snapshot.created_at)}</p>
                </div>
                <button
                  onClick={() => handleRestore(snapshot)}
                  disabled={restoring === snapshot.snapshot_id}
                  className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {restoring === snapshot.snapshot_id ? 'Restoring...' : 'Restore'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
