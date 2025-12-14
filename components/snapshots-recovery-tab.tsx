"use client"

import { useState, useEffect } from "react"
import { Eye, PlayCircle, RotateCcw, Loader2, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

interface Snapshot {
  id: string
  finding_id?: string
  issue_id?: string
  role_name?: string
  resource_type?: string
  created_at: string
  created_by?: string
  reason?: string
  status: "simulated" | "applied" | "ACTIVE" | "APPLIED" | "ROLLED_BACK" | "available" | "FAILED"
  policies?: any
  policy_count?: number
  impact_summary?: any
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
      // Use direct backend endpoint
      const response = await fetch(`${BACKEND_URL}/api/snapshots`)
      if (!response.ok) {
        throw new Error(`Failed to fetch snapshots: ${response.status}`)
      }
      const data = await response.json()
      // Backend returns {success: true, snapshots: [...], count: N}
      const snapshotsArray = data.success && data.snapshots ? data.snapshots : []
      console.log(`[SnapshotsRecoveryTab] Loaded ${snapshotsArray.length} snapshots`)
      setSnapshots(snapshotsArray)
    } catch (err: any) {
      console.error("[SnapshotsRecoveryTab] Error fetching snapshots:", err)
      setError(err.message || "Failed to load snapshots")
      toast({
        title: "Error",
        description: "Failed to load snapshots from backend",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleViewSnapshot = async (snapshotId: string) => {
    try {
      // Find snapshot in local list (backend doesn't have individual snapshot endpoint yet)
      const snapshot = snapshots.find(s => s.id === snapshotId)
      if (snapshot) {
        setSelectedSnapshot(snapshot)
      } else {
        throw new Error("Snapshot not found")
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: "Failed to load snapshot details",
        variant: "destructive",
      })
    }
  }

  const handleRollback = async (snapshotId: string, findingId?: string) => {
    if (!confirm("Are you sure you want to rollback this remediation? This will restore the IAM role to its previous state.")) {
      return
    }

    setApplying(snapshotId)
    try {
      const response = await fetch(`${BACKEND_URL}/api/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot_id: snapshotId,
          finding_id: findingId || ""
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || "Failed to rollback")
      }
      
      const result = await response.json()
      
      toast({
        title: "Success",
        description: result.message || "Rollback completed successfully",
      })
      
      // Refresh snapshots list
      fetchSnapshots()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to rollback",
        variant: "destructive",
      })
    } finally {
      setApplying(null)
    }
  }

  const handleApplySnapshot = async (snapshotId: string) => {
    if (!confirm("Are you sure you want to apply this snapshot? This will execute the remediation changes.")) {
      return
    }

    setApplying(snapshotId)
    try {
      const response = await fetch(`/api/proxy/snapshots/${encodeURIComponent(snapshotId)}/apply`, {
        method: "POST",
      })
      if (!response.ok) {
        throw new Error("Failed to apply snapshot")
      }
      const result = await response.json()
      
      toast({
        title: "Success",
        description: result.result?.message || "Snapshot applied successfully",
      })
      
      // Refresh snapshots list
      fetchSnapshots()
    } catch (err: any) {
      toast({
        title: "Error",
        description: "Failed to apply snapshot",
        variant: "destructive",
      })
    } finally {
      setApplying(null)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      simulated: "bg-blue-100 text-blue-700",
      applied: "bg-green-100 text-green-700",
      ACTIVE: "bg-blue-100 text-blue-700",
      APPLIED: "bg-green-100 text-green-700",
      ROLLED_BACK: "bg-gray-100 text-gray-700",
      FAILED: "bg-red-100 text-red-700",
    }
    const normalizedStatus = status.toLowerCase()
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[normalizedStatus as keyof typeof styles] || styles.ACTIVE}`}>
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
                  Issue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
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
                <tr key={snapshot.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(snapshot.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {snapshot.issue_id || "N/A"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {snapshot.reason}
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
                      {(snapshot.status === "ACTIVE" || snapshot.status === "simulated") && (
                        <button
                          onClick={() => handleApplySnapshot(snapshot.id)}
                          disabled={applying === snapshot.id}
                          className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Apply snapshot"
                        >
                          {applying === snapshot.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <PlayCircle className="w-4 h-4" />
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
              <div>
                <label className="text-sm font-medium text-gray-700">Created At</label>
                <p className="text-sm text-gray-900 mt-1">{formatDate(selectedSnapshot.created_at)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Created By</label>
                <p className="text-sm text-gray-900 mt-1">{selectedSnapshot.created_by}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Reason</label>
                <p className="text-sm text-gray-900 mt-1">{selectedSnapshot.reason}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <div className="mt-1">{getStatusBadge(selectedSnapshot.status)}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Proposed Changes</label>
                <pre className="mt-2 p-4 bg-gray-50 rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify((selectedSnapshot as any).changes || {}, null, 2)}
                </pre>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setSelectedSnapshot(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              {(selectedSnapshot.status === "ACTIVE" || selectedSnapshot.status === "simulated") && (
                <button
                  onClick={() => {
                    handleApplySnapshot(selectedSnapshot.id)
                    setSelectedSnapshot(null)
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Apply Snapshot
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

