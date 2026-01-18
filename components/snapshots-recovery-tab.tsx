"use client"

import { useState, useEffect } from 'react'
import { Shield, Calendar, User, ArrowDownToLine, ArrowUpFromLine, RotateCcw, RefreshCw, Trash2, MapPin, Server, Key, Lock, Database } from 'lucide-react'

interface Snapshot {
  snapshot_id: string
  sg_id?: string
  sg_name?: string
  vpc_id?: string
  region: string
  timestamp: string
  reason: string
  triggered_by: string
  status: string
  rules_count?: {
    inbound: number
    outbound: number
  }
  restored_at?: string
  // Legacy fields for backward compatibility
  finding_id?: string
  resource_type?: string
  created_at?: string
  current_state?: any
  // IAM Role fields
  type?: 'SecurityGroup' | 'IAMRole' | 'S3Bucket'
  role_name?: string
  role_arn?: string
  permissions_count?: number
  removed_permissions?: string[]
}

export default function RecoveryTab() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [selectedSnapshots, setSelectedSnapshots] = useState<Set<string>>(new Set())
  const [deletingSnapshot, setDeletingSnapshot] = useState<string | null>(null)

  useEffect(() => {
    loadSnapshots()
  }, [])

  async function loadSnapshots() {
    try {
      setLoading(true)
      setError(null)
      
      // Fetch both SG and IAM snapshots in parallel
      const [sgRes, iamRes] = await Promise.all([
        fetch('/api/proxy/snapshots', { cache: 'no-store' }),
        fetch('/api/proxy/iam-snapshots', { cache: 'no-store' }).catch(() => null)
      ])

      // Process SG snapshots (includes S3 bucket and IAM checkpoints)
      let sgSnapshots: Snapshot[] = []
      if (sgRes.ok) {
        const sgData = await sgRes.json()
        const sgList = Array.isArray(sgData) ? sgData : (sgData.snapshots || [])
        // Detect type - PRIORITIZE snapshot_id prefix as it's most reliable
        sgSnapshots = sgList.map((s: any) => {
          // Check snapshot_id prefix FIRST (most reliable)
          if (s.snapshot_id?.startsWith('IAMRole-') || s.snapshot_id?.startsWith('iam-')) {
            return { ...s, type: 'IAMRole' as const }
          }
          if (s.snapshot_id?.startsWith('S3Bucket-') || s.snapshot_id?.startsWith('s3-')) {
            return { ...s, type: 'S3Bucket' as const }
          }
          if (s.snapshot_id?.startsWith('SG-') || s.snapshot_id?.startsWith('sg-')) {
            return { ...s, type: 'SecurityGroup' as const }
          }
          // Fallback to resource_type or checkpoint_type
          if (s.resource_type === 'IAMRole' || s.current_state?.checkpoint_type === 'IAMRole') {
            return { ...s, type: 'IAMRole' as const }
          }
          if (s.resource_type === 'S3Bucket' || s.current_state?.checkpoint_type === 'S3Bucket') {
            return { ...s, type: 'S3Bucket' as const }
          }
          // Default to SecurityGroup
          return { ...s, type: 'SecurityGroup' as const }
        })
      }

      // Process IAM snapshots
      let iamSnapshots: Snapshot[] = []
      if (iamRes && iamRes.ok) {
        const iamData = await iamRes.json()
        const iamList = Array.isArray(iamData) ? iamData : (iamData.snapshots || [])
        iamSnapshots = iamList.map((s: any) => ({ ...s, type: 'IAMRole' as const }))
      }
      
      // Combine and sort by timestamp (newest first)
      const allSnapshots = [...sgSnapshots, ...iamSnapshots]
      const sorted = allSnapshots.sort((a: Snapshot, b: Snapshot) => {
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

  // Get correct delete endpoint based on snapshot type
  function getDeleteEndpoint(snapshot: Snapshot): string {
    if (snapshot.type === 'IAMRole') {
      return `/api/proxy/iam-roles/snapshots/${snapshot.snapshot_id}`
    }
    return `/api/proxy/snapshots/${snapshot.snapshot_id}`
  }

  // Delete a single snapshot
  async function handleDeleteSnapshot(snapshot: Snapshot) {
    if (!confirm(`⚠️ Delete this snapshot?\n\nResource: ${snapshot.type === 'IAMRole' ? snapshot.role_name : snapshot.sg_name}\nSnapshot ID: ${snapshot.snapshot_id}\n\nThis action cannot be undone!`)) {
      return
    }

    try {
      setDeletingSnapshot(snapshot.snapshot_id)
      setError(null)

      const res = await fetch(getDeleteEndpoint(snapshot), {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.detail || `Delete failed: ${res.status}`)
      }

      // Remove from local state
      setSnapshots(prev => prev.filter(s => s.snapshot_id !== snapshot.snapshot_id))
      setSelectedSnapshots(prev => {
        const newSet = new Set(prev)
        newSet.delete(snapshot.snapshot_id)
        return newSet
      })

    } catch (err) {
      console.error('Delete snapshot error:', err)
      const message = err instanceof Error ? err.message : 'Delete failed'
      setError(message)
      alert(`❌ Failed: ${message}`)
    } finally {
      setDeletingSnapshot(null)
    }
  }

  // Delete selected snapshots
  async function handleDeleteSelected() {
    if (selectedSnapshots.size === 0) {
      alert('No snapshots selected')
      return
    }

    if (!confirm(`⚠️ Delete ${selectedSnapshots.size} selected snapshot(s)?\n\nThis action cannot be undone!`)) {
      return
    }

    try {
      setDeletingAll(true)
      setError(null)

      let deleted = 0
      const selectedList = snapshots.filter(s => selectedSnapshots.has(s.snapshot_id))
      
      for (const snapshot of selectedList) {
        try {
          const res = await fetch(getDeleteEndpoint(snapshot), {
            method: 'DELETE',
          })
          if (res.ok) deleted++
        } catch {
          // Continue with next
        }
      }

      alert(`✅ Deleted ${deleted} of ${selectedSnapshots.size} snapshots`)
      setSelectedSnapshots(new Set())
      await loadSnapshots()
      
    } catch (err) {
      console.error('Delete selected error:', err)
      const message = err instanceof Error ? err.message : 'Delete failed'
      setError(message)
      alert(`❌ Failed: ${message}`)
    } finally {
      setDeletingAll(false)
    }
  }

  async function handleDeleteAll() {
    if (!confirm(`⚠️ Delete ALL ${snapshots.length} snapshots?\n\nThis action cannot be undone!`)) {
      return
    }

    try {
      setDeletingAll(true)
      setError(null)

      // Delete each snapshot individually with correct endpoint
      let deleted = 0
      for (const snapshot of snapshots) {
        try {
          const res = await fetch(getDeleteEndpoint(snapshot), {
            method: 'DELETE',
          })
          if (res.ok) deleted++
        } catch {
          // Continue with next
        }
      }

      alert(`✅ Deleted ${deleted} of ${snapshots.length} snapshots`)
      setSelectedSnapshots(new Set())
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

  // Toggle snapshot selection
  function toggleSelection(snapshotId: string) {
    setSelectedSnapshots(prev => {
      const newSet = new Set(prev)
      if (newSet.has(snapshotId)) {
        newSet.delete(snapshotId)
      } else {
        newSet.add(snapshotId)
      }
      return newSet
    })
  }

  // Toggle all selection
  function toggleSelectAll() {
    if (selectedSnapshots.size === snapshots.length) {
      setSelectedSnapshots(new Set())
    } else {
      setSelectedSnapshots(new Set(snapshots.map(s => s.snapshot_id)))
    }
  }

  async function handleRestore(snapshot: Snapshot) {
    const isIAMRole = snapshot.type === 'IAMRole'
    const isS3Bucket = snapshot.type === 'S3Bucket'
    const resourceName = isIAMRole
      ? (snapshot.role_name || 'IAM Role')
      : isS3Bucket
        ? (snapshot.finding_id || snapshot.current_state?.resource_name || 'S3 Bucket')
        : (snapshot.sg_name || snapshot.sg_id || 'Security Group')

    const confirmMessage = isIAMRole
      ? `⚠️ Restore IAM Role snapshot?\n\nThis will:\n• Restore ${snapshot.permissions_count || 'all'} permissions to ${resourceName}\n• Re-add any removed permissions\n\nContinue?`
      : isS3Bucket
        ? `⚠️ Restore S3 Bucket checkpoint?\n\nThis will:\n• Restore the bucket policy for ${resourceName}\n• Re-add any removed policy statements\n\nContinue?`
        : `⚠️ Restore Security Group snapshot?\n\nThis will:\n• Remove ALL current inbound rules from ${resourceName}\n• Restore ${snapshot.rules_count?.inbound || 'all'} inbound rules from this snapshot\n\nContinue?`

    if (!confirm(confirmMessage)) {
      return
    }

    try {
      setRestoring(snapshot.snapshot_id)
      setError(null)

      const endpoint = isIAMRole
        ? `/api/proxy/iam-snapshots/${snapshot.snapshot_id}/rollback`
        : isS3Bucket
          ? `/api/proxy/s3-buckets/rollback`
          : `/api/proxy/remediation/rollback/${snapshot.snapshot_id}`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(isS3Bucket && {
          body: JSON.stringify({
            checkpoint_id: snapshot.snapshot_id,
            bucket_name: snapshot.finding_id || ''
          })
        })
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.detail || `Failed: ${res.status}`)
      }

      const result = await res.json()
      
      if (result.success) {
        if (isIAMRole) {
          alert(`✅ Restored Successfully!\n\nIAM Role: ${result.role_name || resourceName}\nPermissions restored: ${result.permissions_restored || 'All'}`)
        } else if (isS3Bucket) {
          alert(`✅ Restored Successfully!\n\nS3 Bucket: ${result.bucket_name || resourceName}\nPolicy restored from checkpoint`)
        } else {
          alert(`✅ Restored Successfully!\n\nSecurity Group: ${result.sg_name || result.sg_id}\nRules restored: ${result.rules_restored}`)
        }
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
          <p className="text-gray-600 mt-1">Restore Security Groups, S3 Buckets, and IAM Roles to previous snapshots</p>
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
          {snapshots.length > 0 && selectedSnapshots.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deletingAll || loading}
              className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {deletingAll ? 'Deleting...' : `Delete Selected (${selectedSnapshots.size})`}
            </button>
          )}
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

      {/* Select All Checkbox */}
      {snapshots.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedSnapshots.size === snapshots.length && snapshots.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Select All ({selectedSnapshots.size} of {snapshots.length} selected)
            </span>
          </label>
        </div>
      )}

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
            Snapshots are automatically created when you execute Security Group or IAM Role remediations.
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
              onDelete={() => handleDeleteSnapshot(snapshot)}
              onToggleSelect={() => toggleSelection(snapshot.snapshot_id)}
              isSelected={selectedSnapshots.has(snapshot.snapshot_id)}
              isRestoring={restoring === snapshot.snapshot_id}
              isDeleting={deletingSnapshot === snapshot.snapshot_id}
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
  onDelete,
  onToggleSelect,
  isSelected,
  isRestoring,
  isDeleting,
  formatDate,
  getTimeAgo
}: {
  snapshot: Snapshot
  onRestore: () => void
  onDelete: () => void
  onToggleSelect: () => void
  isSelected: boolean
  isRestoring: boolean
  isDeleting: boolean
  formatDate: (ts: string | undefined) => string
  getTimeAgo: (ts: string | undefined) => string
}) {
  const isIAMRole = snapshot.type === 'IAMRole'
  const isS3Bucket = snapshot.type === 'S3Bucket'
  const timestamp = snapshot.timestamp || snapshot.created_at
  const region = snapshot.region || 'eu-west-1'
  const triggeredBy = snapshot.triggered_by || 'system'
  const reason = snapshot.reason || snapshot.current_state?.reason || 'Remediation backup'
  const status = snapshot.status || 'available'

  // SG-specific fields
  const sgName = snapshot.sg_name || snapshot.current_state?.sg_name || 'Unknown Security Group'
  const sgId = snapshot.sg_id || snapshot.current_state?.sg_id || snapshot.finding_id || 'N/A'
  const vpcId = snapshot.vpc_id || snapshot.current_state?.vpc_id || 'N/A'
  const inboundRules = snapshot.rules_count?.inbound ?? snapshot.current_state?.rules_count?.inbound ?? 0
  const outboundRules = snapshot.rules_count?.outbound ?? snapshot.current_state?.rules_count?.outbound ?? 0

  // IAM-specific fields - extract role name from snapshot_id if not provided
  let roleName = snapshot.role_name || snapshot.current_state?.role_name || snapshot.before_state?.role_name
  if (!roleName && snapshot.snapshot_id?.startsWith('IAMRole-')) {
    // Extract from snapshot ID: IAMRole-{roleName}-{hash}
    const parts = snapshot.snapshot_id.replace('IAMRole-', '').split('-')
    parts.pop() // Remove the hash
    roleName = parts.join('-') || 'Unknown Role'
  }
  roleName = roleName || 'Unknown Role'
  const roleArn = snapshot.role_arn || 'N/A'
  const permissionsCount = snapshot.permissions_count || 0
  const removedPermissions = snapshot.removed_permissions || []

  // S3-specific fields
  const bucketName = snapshot.finding_id || snapshot.current_state?.resource_name || 'Unknown Bucket'

  // Common display values
  const resourceName = isIAMRole ? roleName : isS3Bucket ? bucketName : sgName
  const resourceId = isIAMRole ? roleArn : isS3Bucket ? snapshot.snapshot_id : sgId

  return (
    <div className={`bg-white border-2 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden ${
      isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b border-gray-100 ${
        isIAMRole
          ? 'bg-gradient-to-r from-purple-50 to-violet-50'
          : isS3Bucket
            ? 'bg-gradient-to-r from-orange-50 to-amber-50'
            : 'bg-gradient-to-r from-blue-50 to-indigo-50'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div className={`p-2 rounded-lg ${
              isIAMRole ? 'bg-purple-100' : isS3Bucket ? 'bg-orange-100' : 'bg-blue-100'
            }`}>
              {isIAMRole ? (
                <Key className="w-5 h-5 text-purple-600" />
              ) : isS3Bucket ? (
                <Database className="w-5 h-5 text-orange-600" />
              ) : (
                <Shield className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{resourceName}</h3>
              <p className="text-xs text-gray-500 font-mono truncate max-w-[200px]">{resourceId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              isIAMRole
                ? 'bg-purple-100 text-purple-700'
                : isS3Bucket
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-blue-100 text-blue-700'
            }`}>
              {isIAMRole ? 'IAM Role' : isS3Bucket ? 'S3 Bucket' : 'Security Group'}
            </span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              status === 'available' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-blue-100 text-blue-700'
            }`}>
              {status === 'available' ? '● Available' : '↺ Restored'}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Resource-specific Info */}
        {isIAMRole ? (
          /* IAM Role Details */
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Lock className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500">Permissions:</span>
            <span className="font-medium text-gray-900">{permissionsCount} total</span>
            {removedPermissions.length > 0 && (
              <span className="text-red-600">({removedPermissions.length} removed)</span>
            )}
          </div>
        ) : isS3Bucket ? (
          /* S3 Bucket Details */
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Database className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500">Bucket:</span>
            <span className="font-mono text-xs bg-orange-50 px-2 py-0.5 rounded text-orange-700">{bucketName}</span>
          </div>
        ) : (
          /* Security Group Details */
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Server className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500">VPC:</span>
            <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{vpcId}</span>
          </div>
        )}

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

        {/* Rules/Permissions Count */}
        {isIAMRole ? (
          /* IAM Removed Permissions Preview */
          removedPermissions.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs text-red-600 font-medium mb-1">Removed Permissions:</p>
              <div className="flex flex-wrap gap-1">
                {removedPermissions.slice(0, 3).map((perm, i) => (
                  <span key={i} className="text-xs font-mono bg-red-100 text-red-700 px-2 py-0.5 rounded">
                    {perm}
                  </span>
                ))}
                {removedPermissions.length > 3 && (
                  <span className="text-xs text-red-600">
                    +{removedPermissions.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )
        ) : isS3Bucket ? (
          /* S3 Bucket Policy Info */
          <div className="flex items-center gap-4 py-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-lg">
              <Database className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-medium text-orange-700">Policy checkpoint saved</span>
            </div>
          </div>
        ) : (
          /* SG Rules Count */
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
        )}

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
        <div className="flex items-center gap-2">
          {/* Delete Button */}
          <button
            onClick={onDelete}
            disabled={isDeleting || isRestoring}
            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              isDeleting
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-red-100 hover:text-red-700'
            }`}
            title="Delete snapshot"
          >
            {isDeleting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
          {/* Restore Button */}
          <button
            onClick={onRestore}
            disabled={isRestoring || isDeleting}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              isRestoring
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : isIAMRole
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : isS3Bucket
                    ? 'bg-orange-600 text-white hover:bg-orange-700'
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
    </div>
  )
}
