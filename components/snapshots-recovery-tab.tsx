"use client"

import { useState, useEffect } from 'react'

interface Snapshot {
  snapshot_id: string
  finding_id: string
  resource_type: string
  created_at: string
  current_state: any
}

// ✅ CORRECT BACKEND URL
const BACKEND_URL = 'https://saferemediate-backend-f.onrender.com'

export default function RecoveryTab() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)

  useEffect(() => {
    loadSnapshots()
  }, [])

  async function loadSnapshots() {
    try {
      setLoading(true)
      setError(null)
      
      // Use proxy route to avoid CORS and ensure proper routing
      const res = await fetch('/api/proxy/snapshots', {
        cache: 'no-store',
      })

      if (!res.ok) {
        throw new Error(`Failed to load: ${res.status}`)
      }

      const data = await res.json()
      
      // Handle both array response and object with snapshots property
      const snapshotList = Array.isArray(data) ? data : (data.snapshots || [])
      
      // Sort by created_at (newest first)
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

  async function handleDeleteAll() {
    if (!confirm(`⚠️ Delete ALL ${snapshots.length} snapshots?\n\nThis action cannot be undone!`)) {
      return
    }

    try {
      setDeletingAll(true)
      setError(null)

      const res = await fetch('/api/proxy/snapshots/delete-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || `Failed: ${res.status}`)
      }

      const result = await res.json()
      
      alert(`✅ Deleted ${result.deleted_count} of ${result.total_count} snapshots`)
      
      // Reload snapshots list
      await loadSnapshots()
      
    } catch (err) {
      console.error('Delete all error:', err)
      const message = err instanceof Error ? err.message : 'Delete failed'
      setError(message)
      alert(`❌ Failed: ${message}`)
    } finally {
      setDeletingAll(false)
    }
  }

  async function handleRestore(snapshot: Snapshot) {
    const resourceName = snapshot.current_state?.role_name || 
                        snapshot.current_state?.resource_name ||
                        snapshot.finding_id

    if (!confirm(`Restore this snapshot?\n\nResource: ${resourceName}\nType: ${snapshot.resource_type}`)) {
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

      const result = await res.json()
      
      alert(`✅ Restored!\n\nResource: ${resourceName}\nType: ${snapshot.resource_type}`)
      
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

  function getTimeAgo(dateStr: string | undefined | null): string {
    if (!dateStr) return 'Unknown'
    
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return 'Invalid date'
      
      const now = new Date()
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
      
      if (seconds < 0) return 'Just now'
      if (seconds < 60) return `${seconds}s ago`
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
      return `${Math.floor(seconds / 86400)}d ago`
    } catch {
      return 'Invalid date'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading snapshots...</p>
        </div>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Recovery & Rollback</h2>
          <p className="text-gray-600 mt-1">Restore infrastructure to previous snapshots</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={loadSnapshots}
            disabled={loading || deletingAll}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Refresh
          </button>
          {snapshots.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={deletingAll || loading}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
            >
              {deletingAll ? 'Deleting...' : 'Delete All'}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">{error}</p>
        </div>
      )}

      {/* List */}
      {snapshots.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900">No snapshots yet</h3>
          <p className="mt-2 text-gray-600">
            Snapshots appear after you execute remediations
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {snapshots.map((snapshot) => {
                const resourceName = snapshot.current_state?.role_name || 
                                   snapshot.current_state?.resource_name ||
                                   snapshot.finding_id?.replace('REAL-IAM-', '').replace('-unused-permissions', '') ||
                                   'Unknown Resource'
                const findingId = snapshot.finding_id || 'N/A'
                const reason = snapshot.reason || snapshot.current_state?.reason || 'Remediation snapshot'
                
                return (
                  <tr key={snapshot.snapshot_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {resourceName}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        <div>Finding: {findingId}</div>
                        <div className="mt-1">ID: {snapshot.snapshot_id.substring(0, 24)}...</div>
                        {reason && (
                          <div className="mt-1 text-blue-600">📋 {reason}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                        {snapshot.resource_type || 'IAMRole'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      <div>{getTimeAgo(snapshot.created_at)}</div>
                      {snapshot.created_at && !isNaN(new Date(snapshot.created_at).getTime()) && (
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(snapshot.created_at).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleRestore(snapshot)}
                        disabled={restoring === snapshot.snapshot_id}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
                        title={`Restore ${resourceName} to state before remediation`}
                      >
                        {restoring === snapshot.snapshot_id ? 'Restoring...' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
