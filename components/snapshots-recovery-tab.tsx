"use client"

import { useState, useEffect } from 'react'
import { Shield, Calendar, User, ArrowDownToLine, ArrowUpFromLine, RotateCcw, RefreshCw, Trash2, MapPin, Server } from 'lucide-react'

interface Snapshot {
  snapshot_id: string
  sg_id: string
  sg_name: string
  vpc_id: string
  region: string
  timestamp: string
  reason: string
  triggered_by: string
  status: string
  rules_count: {
    inbound: number
    outbound: number
  }
  restored_at?: string
  // Legacy fields for backward compatibility
  finding_id?: string
  resource_type?: string
  created_at?: string
  current_state?: any
}

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
      
      const res = await fetch('/api/proxy/snapshots', {
        cache: 'no-store',
      })

      if (!res.ok) {
        throw new Error(`Failed to load: ${res.status}`)
      }

      const data = await res.json()
      
      // Handle both array response and object with snapshots property
      const snapshotList = Array.isArray(data) ? data : (data.snapshots || [])
      
      // Sort by timestamp (newest first)
      const sorted = snapshotList.sort((a: Snapshot, b: Snapshot) => {
        const dateA = new Date(a.timestamp || a.created_at || 0).getTime()
        const dateB = new Date(b.timestamp || b.created_at || 0).getTime()
        return dateB - dateA
      })
      
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

      // Delete each snapshot individually
      let deleted = 0
      for (const snapshot of snapshots) {
        try {
          const res = await fetch(`/api/proxy/snapshots/${snapshot.snapshot_id}`, {
            method: 'DELETE',
          })
          if (res.ok) deleted++
        } catch {
          // Continue with next
        }
      }

      alert(`✅ Deleted ${deleted} of ${snapshots.length} snapshots`)
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
    const resourceName = snapshot.sg_name || snapshot.sg_id || 'Security Group'

    if (!confirm(`⚠️ Restore this snapshot?\n\nThis will:\n• Remove ALL current inbound rules from ${resourceName}\n• Restore ${snapshot.rules_count?.inbound || 'all'} inbound rules from this snapshot\n\nContinue?`)) {
      return
    }

    try {
      setRestoring(snapshot.snapshot_id)
      setError(null)

      const res = await fetch(
        `/api/proxy/remediation/rollback/${snapshot.snapshot_id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.detail || `Failed: ${res.status}`)
      }

      const result = await res.json()
      
      if (result.success) {
        alert(`✅ Restored Successfully!\n\nSecurity Group: ${result.sg_name || result.sg_id}\nRules restored: ${result.rules_restored}`)
      } else {
        throw new Error(result.error || 'Rollback failed')
      }
      
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

  function formatDate(timestamp: string | undefined): string {
    if (!timestamp) return 'Unknown'
    try {
      return new Date(timestamp).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return 'Invalid date'
    }
  }

  function getTimeAgo(dateStr: string | undefined): string {
    if (!dateStr) return ''
    
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return ''
      
      const now = new Date()
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
      
      if (seconds < 0) return 'just now'
      if (seconds < 60) return `${seconds}s ago`
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
      return `${Math.floor(seconds / 86400)}d ago`
    } catch {
      return ''
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
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
          className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
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
          <p className="text-gray-600 mt-1">Restore Security Groups to previous snapshots</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={loadSnapshots}
            disabled={loading || deletingAll}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {snapshots.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={deletingAll || loading}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {deletingAll ? 'Deleting...' : 'Delete All'}
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {snapshots.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No snapshots yet</h3>
          <p className="mt-2 text-gray-600">
            Snapshots are automatically created when you execute Security Group remediations.
          </p>
        </div>
      ) : (
        /* Snapshot Cards Grid */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {snapshots.map((snapshot) => (
            <SnapshotCard
              key={snapshot.snapshot_id}
              snapshot={snapshot}
              onRestore={() => handleRestore(snapshot)}
              isRestoring={restoring === snapshot.snapshot_id}
              formatDate={formatDate}
              getTimeAgo={getTimeAgo}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Snapshot Card Component
function SnapshotCard({ 
  snapshot, 
  onRestore, 
  isRestoring,
  formatDate,
  getTimeAgo
}: { 
  snapshot: Snapshot
  onRestore: () => void
  isRestoring: boolean
  formatDate: (ts: string | undefined) => string
  getTimeAgo: (ts: string | undefined) => string
}) {
  const timestamp = snapshot.timestamp || snapshot.created_at
  const sgName = snapshot.sg_name || snapshot.current_state?.sg_name || 'Unknown Security Group'
  const sgId = snapshot.sg_id || snapshot.current_state?.sg_id || snapshot.finding_id || 'N/A'
  const vpcId = snapshot.vpc_id || snapshot.current_state?.vpc_id || 'N/A'
  const region = snapshot.region || 'eu-west-1'
  const triggeredBy = snapshot.triggered_by || 'system'
  const reason = snapshot.reason || snapshot.current_state?.reason || 'Remediation backup'
  const status = snapshot.status || 'available'
  const inboundRules = snapshot.rules_count?.inbound ?? snapshot.current_state?.rules_count?.inbound ?? 0
  const outboundRules = snapshot.rules_count?.outbound ?? snapshot.current_state?.rules_count?.outbound ?? 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{sgName}</h3>
              <p className="text-xs text-gray-500 font-mono">{sgId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              status === 'available' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-blue-100 text-blue-700'
            }`}>
              {status === 'available' ? '● Available' : '↺ Restored'}
            </span>
            <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {region}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* VPC Info */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Server className="w-4 h-4 text-gray-400" />
          <span className="text-gray-500">VPC:</span>
          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{vpcId}</span>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="w-4 h-4 text-gray-400" />
            <div>
              <span className="text-gray-900">{formatDate(timestamp)}</span>
              {getTimeAgo(timestamp) && (
                <span className="text-gray-400 ml-1">({getTimeAgo(timestamp)})</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <User className="w-4 h-4 text-gray-400" />
            <span>by <span className="text-gray-900">{triggeredBy}</span></span>
          </div>
        </div>

        {/* Rules Count */}
        <div className="flex items-center gap-4 py-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
            <ArrowDownToLine className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-700">{inboundRules} inbound</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-lg">
            <ArrowUpFromLine className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-medium text-orange-700">{outboundRules} outbound</span>
          </div>
        </div>

        {/* Reason */}
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-sm text-gray-600">
            <span className="text-gray-400">Reason:</span>{' '}
            <span className="text-gray-700">{reason}</span>
          </p>
        </div>

        {/* Restored At (if applicable) */}
        {snapshot.restored_at && (
          <div className="text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
            ↺ Restored on {formatDate(snapshot.restored_at)}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs font-mono text-gray-400">{snapshot.snapshot_id}</span>
        <button
          onClick={onRestore}
          disabled={isRestoring}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
            isRestoring 
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {isRestoring ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Restoring...
            </>
          ) : (
            <>
              <RotateCcw className="w-4 h-4" />
              Restore
            </>
          )}
        </button>
      </div>
    </div>
  )
}
