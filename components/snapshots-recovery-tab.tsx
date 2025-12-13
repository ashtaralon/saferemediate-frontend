"use client"

import { useState, useEffect } from "react"
import { Eye, PlayCircle, RotateCcw, Loader2, AlertCircle, Shield } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// Local storage key for remediation snapshots
const REMEDIATION_SNAPSHOTS_KEY = 'saferemediate_snapshots'

interface Snapshot {
  id: string
  issue_id?: string
  finding_id?: string
  execution_id?: string
  created_at: string
  created_by: string
  reason: string
  status: "simulated" | "applied" | "ACTIVE" | "APPLIED" | "ROLLED_BACK" | "FAILED" | "REMEDIATED"
  impact_summary?: any
  resource_id?: string
  resource_type?: string
  is_local?: boolean  // Flag to indicate locally stored snapshot
}

// Load locally stored remediation snapshots
function loadLocalSnapshots(): Snapshot[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(REMEDIATION_SNAPSHOTS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load local snapshots:', e)
  }
  return []
}

// Save a remediation snapshot locally
export function saveRemediationSnapshot(snapshot: {
  snapshot_id: string
  execution_id?: string
  finding_id: string
  resource_id?: string
  resource_type?: string
  timestamp?: string
  role_name?: string
  permissions_removed?: string[]
  permissions_kept?: string[]
}) {
  if (typeof window === 'undefined') return
  try {
    const existing = loadLocalSnapshots()
    const roleName = snapshot.role_name || snapshot.resource_id?.split('/').pop() || 'Unknown'
    const permissionsRemoved = snapshot.permissions_removed || []

    const newSnapshot: Snapshot = {
      id: snapshot.snapshot_id,
      execution_id: snapshot.execution_id,
      finding_id: snapshot.finding_id,
      issue_id: snapshot.finding_id,
      resource_id: snapshot.resource_id,
      resource_type: snapshot.resource_type || 'IAMRole',
      created_at: snapshot.timestamp || new Date().toISOString(),
      created_by: 'SafeRemediate',
      reason: `Removed ${permissionsRemoved.length} unused permissions from ${roleName}`,
      status: 'REMEDIATED',
      is_local: true,
      impact_summary: {
        role_name: roleName,
        permissions_removed: permissionsRemoved,
        permissions_kept: snapshot.permissions_kept || [],
        action: 'LEAST_PRIVILEGE_REMEDIATION'
      }
    }

    // Don't add duplicates
    if (!existing.find(s => s.id === newSnapshot.id)) {
      existing.unshift(newSnapshot)  // Add to beginning
      localStorage.setItem(REMEDIATION_SNAPSHOTS_KEY, JSON.stringify(existing.slice(0, 50))) // Keep last 50
    }
  } catch (e) {
    console.error('Failed to save remediation snapshot:', e)
  }
}

interface SnapshotsRecoveryTabProps {
  systemName: string
}

export function SnapshotsRecoveryTab({ systemName }: SnapshotsRecoveryTabProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchSnapshots()
  }, [systemName])

  const fetchSnapshots = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load local remediation snapshots first
      const localSnapshots = loadLocalSnapshots()
      console.log(`[SnapshotsRecoveryTab] Loaded ${localSnapshots.length} local snapshots`)

      let backendSnapshots: Snapshot[] = []
      try {
        const response = await fetch(`/api/proxy/systems/${encodeURIComponent(systemName)}/snapshots`)
        if (response.ok) {
          const data = await response.json()
          backendSnapshots = Array.isArray(data) ? data : (data.snapshots || [])
          console.log(`[SnapshotsRecoveryTab] Loaded ${backendSnapshots.length} backend snapshots for ${systemName}`)
        }
      } catch (backendErr) {
        console.log("[SnapshotsRecoveryTab] Backend snapshots unavailable, using local only")
      }

      // Merge: local first (most recent), then backend
      const allSnapshots = [...localSnapshots, ...backendSnapshots]

      // Remove duplicates by id
      const uniqueSnapshots = allSnapshots.filter((snap, index, self) =>
        index === self.findIndex(s => s.id === snap.id)
      )

      // Sort by created_at descending (newest first)
      uniqueSnapshots.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      setSnapshots(uniqueSnapshots)
      setError(null)
    } catch (err: any) {
      console.error("[SnapshotsRecoveryTab] Error fetching snapshots:", err)
      // Still try to show local snapshots even on error
      const localSnapshots = loadLocalSnapshots()
      if (localSnapshots.length > 0) {
        setSnapshots(localSnapshots)
        setError(null)
      } else {
        setError(err.message || "Failed to load snapshots")
        toast({
          title: "Error",
          description: "Failed to load snapshots.",
          variant: "destructive",
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleViewSnapshot = async (snapshotId: string) => {
    // First check if it's a local snapshot
    const localSnapshot = snapshots.find(s => s.id === snapshotId && s.is_local)
    if (localSnapshot) {
      setSelectedSnapshot(localSnapshot)
      return
    }

    // Otherwise fetch from backend
    try {
      const response = await fetch(`/api/proxy/snapshots/${encodeURIComponent(snapshotId)}`)
      if (!response.ok) {
        throw new Error("Failed to fetch snapshot details")
      }
      const snapshot = await response.json()
      setSelectedSnapshot(snapshot as any)
    } catch (err: any) {
      // If backend fails, try to show from current snapshots list
      const fallbackSnapshot = snapshots.find(s => s.id === snapshotId)
      if (fallbackSnapshot) {
        setSelectedSnapshot(fallbackSnapshot)
      } else {
        toast({
          title: "Error",
          description: "Failed to load snapshot details",
          variant: "destructive",
        })
      }
    }
  }

  const handleApplySnapshot = async (snapshotId: string) => {
    // Find the snapshot to get its details
    const snapshot = snapshots.find(s => s.id === snapshotId)
    const roleName = snapshot?.impact_summary?.role_name || snapshot?.resource_id?.split('/').pop() || 'this role'

    if (!confirm(`Are you sure you want to ROLLBACK "${roleName}"?\n\nThis will restore the original IAM permissions that were removed.`)) {
      return
    }

    setApplying(snapshotId)
    try {
      // Call the rollback endpoint
      const response = await fetch(`/api/proxy/safe-remediate/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot_id: snapshotId,
          execution_id: snapshot?.execution_id,
          finding_id: snapshot?.finding_id
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to rollback")
      }

      toast({
        title: "✅ Rollback Successful",
        description: `Restored original permissions for ${roleName}`,
      })

      // Update snapshot status locally
      const updated = snapshots.map(s =>
        s.id === snapshotId ? { ...s, status: 'ROLLED_BACK' as const } : s
      )
      setSnapshots(updated)
      // Also update localStorage
      localStorage.setItem(REMEDIATION_SNAPSHOTS_KEY, JSON.stringify(updated.filter(s => s.is_local)))
    } catch (err: any) {
      toast({
        title: "Rollback Failed",
        description: err.message || "Failed to rollback snapshot",
        variant: "destructive",
      })
    } finally {
      setApplying(null)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      simulated: "bg-blue-100 text-blue-700",
      applied: "bg-green-100 text-green-700",
      active: "bg-blue-100 text-blue-700",
      remediated: "bg-green-100 text-green-700",
      rolled_back: "bg-orange-100 text-orange-700",
      failed: "bg-red-100 text-red-700",
    }
    const normalizedStatus = status.toLowerCase()
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[normalizedStatus] || "bg-gray-100 text-gray-700"}`}>
        {status.toUpperCase()}
      </span>
    )
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleString()
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-600">Loading snapshots...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-sm font-medium text-gray-900 mb-1">Failed to load snapshots</p>
        <p className="text-xs text-gray-500 mb-4">{error}</p>
        <button
          onClick={fetchSnapshots}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
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
          <h3 className="text-xl font-semibold text-gray-900">Snapshots & Recovery</h3>
          <p className="text-sm text-gray-500 mt-1">
            View and manage system snapshots, backup schedules, and recovery points.
          </p>
        </div>
        <button
          onClick={fetchSnapshots}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      {/* Snapshots Table */}
      {snapshots.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No snapshots found for this system.</p>
          <p className="text-sm text-gray-400 mt-2">
            Run a simulation on an issue to create a snapshot.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Snapshot ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {snapshots.map((snapshot) => (
                <tr key={snapshot.id} className={`hover:bg-gray-50 ${snapshot.is_local ? 'bg-green-50/50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex items-center gap-2">
                      {snapshot.is_local && (
                        <Shield className="w-4 h-4 text-green-600" title="Remediation snapshot" />
                      )}
                      {formatDate(snapshot.created_at)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                    <div className="max-w-[200px] truncate" title={snapshot.id}>
                      {snapshot.id}
                    </div>
                    {snapshot.execution_id && (
                      <div className="text-xs text-gray-400 truncate" title={snapshot.execution_id}>
                        Exec: {snapshot.execution_id}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div className="max-w-[250px]">
                      {snapshot.resource_id ? (
                        <div className="truncate" title={snapshot.resource_id}>
                          {snapshot.resource_id.split('/').pop() || snapshot.resource_id}
                        </div>
                      ) : (
                        snapshot.issue_id || snapshot.finding_id || "N/A"
                      )}
                      {snapshot.resource_type && (
                        <div className="text-xs text-gray-400">{snapshot.resource_type}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(snapshot.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewSnapshot(snapshot.id)}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View snapshot details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {(snapshot.status === "ACTIVE" || snapshot.status === "simulated" || snapshot.status === "REMEDIATED") && (
                        <button
                          onClick={() => handleApplySnapshot(snapshot.id)}
                          disabled={applying === snapshot.id}
                          className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Rollback to this snapshot"
                        >
                          {applying === snapshot.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Snapshot Details Modal */}
      {selectedSnapshot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Snapshot Details</h3>
                <button
                  onClick={() => setSelectedSnapshot(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Snapshot ID</label>
                <p className="text-sm text-gray-900 mt-1 font-mono">{selectedSnapshot.id}</p>
              </div>
              {selectedSnapshot.execution_id && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Execution ID</label>
                  <p className="text-sm text-gray-900 mt-1 font-mono">{selectedSnapshot.execution_id}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">Created At</label>
                <p className="text-sm text-gray-900 mt-1">{formatDate(selectedSnapshot.created_at)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Created By</label>
                <p className="text-sm text-gray-900 mt-1">{selectedSnapshot.created_by}</p>
              </div>
              {selectedSnapshot.resource_id && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Resource</label>
                  <p className="text-sm text-gray-900 mt-1 font-mono break-all">{selectedSnapshot.resource_id}</p>
                  {selectedSnapshot.resource_type && (
                    <p className="text-xs text-gray-500 mt-1">{selectedSnapshot.resource_type}</p>
                  )}
                </div>
              )}
              {selectedSnapshot.finding_id && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Finding ID</label>
                  <p className="text-sm text-gray-900 mt-1 font-mono">{selectedSnapshot.finding_id}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">Reason</label>
                <p className="text-sm text-gray-900 mt-1">{selectedSnapshot.reason}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <div className="mt-1">{getStatusBadge(selectedSnapshot.status)}</div>
              </div>
              {selectedSnapshot.is_local && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    This is a remediation snapshot - original policy is preserved
                  </p>
                </div>
              )}
              {/* Show permissions removed */}
              {selectedSnapshot.impact_summary?.permissions_removed?.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Permissions Removed ({selectedSnapshot.impact_summary.permissions_removed.length})</label>
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg max-h-40 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {selectedSnapshot.impact_summary.permissions_removed.map((perm: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-red-100 text-red-700 text-xs font-mono rounded">
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {/* Show permissions kept */}
              {selectedSnapshot.impact_summary?.permissions_kept?.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Permissions Kept ({selectedSnapshot.impact_summary.permissions_kept.length})</label>
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg max-h-40 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {selectedSnapshot.impact_summary.permissions_kept.map((perm: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-green-100 text-green-700 text-xs font-mono rounded">
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setSelectedSnapshot(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              {(selectedSnapshot.status === "ACTIVE" || selectedSnapshot.status === "simulated" || selectedSnapshot.status === "REMEDIATED") && (
                <button
                  onClick={() => {
                    handleApplySnapshot(selectedSnapshot.id)
                    setSelectedSnapshot(null)
                  }}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Rollback to Original
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

