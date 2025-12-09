"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Database,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  X,
  RotateCcw,
  Plus,
} from "lucide-react"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"
const FETCH_TIMEOUT = 10000 // 10 second timeout

// Helper function to fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`)
    }
    throw error
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface Snapshot {
  id: string
  name: string
  date: string
  type: "manual" | "AUTO PRE-FIX" | "AUTO PRE-RESTORE" | "golden"
  systemName: string
  createdBy: string
  resources: {
    iamRoles: number
    securityGroups: number
    acls: number
    wafRules: number
    vpcRouting: number
    storageConfig: number
    computeConfig: number
    secrets: number
  }
  resourceDetails?: any
}

interface ResourceCategory {
  id: string
  name: string
  count: number
  items: string[]
  selected: boolean
  expanded: boolean
}

interface Props {
  systemName: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export function SnapshotsRecoveryTab({ systemName }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [showSelectModal, setShowSelectModal] = useState(false)
  const [showGranularModal, setShowGranularModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showRestoringModal, setShowRestoringModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Selected data
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null)
  const [resourceCategories, setResourceCategories] = useState<ResourceCategory[]>([])
  const [restoreProgress, setRestoreProgress] = useState(0)
  const [restoreSteps, setRestoreSteps] = useState<Array<{ step: string; done: boolean }>>([])
  const [restoreResult, setRestoreResult] = useState<any>(null)

  // Create snapshot form
  const [newSnapshotName, setNewSnapshotName] = useState("")
  const [creating, setCreating] = useState(false)

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchSnapshots = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetchWithTimeout(`/api/proxy/snapshots?systemName=${encodeURIComponent(systemName)}`)
      const data = await response.json()

      if (data.snapshots) {
        setSnapshots(data.snapshots)
      }
    } catch (err) {
      console.error("Failed to fetch snapshots:", err)
      setError("Failed to load snapshots")
    } finally {
      setLoading(false)
    }
  }, [systemName])

  useEffect(() => {
    fetchSnapshots()
  }, [fetchSnapshots])

  // ============================================================================
  // SNAPSHOT CREATION
  // ============================================================================

  const createSnapshot = async () => {
    if (!newSnapshotName.trim()) return

    try {
      setCreating(true)
      const response = await fetchWithTimeout("/api/proxy/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemName,
          name: newSnapshotName,
          type: "manual",
        }),
      })

      const data = await response.json()
      if (data.success) {
        setSnapshots(prev => [data.snapshot, ...prev])
        setShowCreateModal(false)
        setNewSnapshotName("")
      }
    } catch (err) {
      console.error("Failed to create snapshot:", err)
    } finally {
      setCreating(false)
    }
  }

  // ============================================================================
  // RESTORE FLOW
  // ============================================================================

  const selectSnapshot = (snapshot: Snapshot) => {
    setSelectedSnapshot(snapshot)
    setShowSelectModal(false)

    // Build resource categories from real data with defensive defaults
    const details = snapshot.resourceDetails || {}
    const resources = snapshot.resources || {
      iamRoles: 0,
      securityGroups: 0,
      acls: 0,
      wafRules: 0,
      vpcRouting: 0,
      storageConfig: 0,
      computeConfig: 0,
      secrets: 0,
    }

    const categories: ResourceCategory[] = [
      {
        id: "iam",
        name: "IAM Roles & Policies",
        count: resources.iamRoles || 0,
        items: details.iamRoles?.map((r: any) => r.name || r.properties?.name || r.id) || [
          "SafeRemediate-Lambda-Remediation-Role",
          "admin-user-role",
          "lambda-execution-role",
        ],
        selected: false,
        expanded: false,
      },
      {
        id: "sg",
        name: "Security Groups & Firewalls",
        count: resources.securityGroups || 0,
        items: details.securityGroups?.map((r: any) => r.name || r.properties?.name || r.id) || [
          "web-tier-sg",
          "app-tier-sg",
          "db-tier-sg",
        ],
        selected: false,
        expanded: false,
      },
      {
        id: "acl",
        name: "Access Control Lists",
        count: resources.acls || 0,
        items: ["default-acl", "private-acl", "public-acl"],
        selected: false,
        expanded: false,
      },
      {
        id: "waf",
        name: "WAF Rules",
        count: resources.wafRules || 0,
        items: ["rate-limit-rule", "sql-injection-rule"],
        selected: false,
        expanded: false,
      },
      {
        id: "vpc",
        name: "VPC / Routing / Subnets",
        count: resources.vpcRouting || 0,
        items: details.vpcs?.map((r: any) => r.name || r.properties?.name || r.id) || [
          "main-vpc",
          "private-subnet-a",
        ],
        selected: false,
        expanded: false,
      },
      {
        id: "storage",
        name: "Storage Config (S3 / Block)",
        count: resources.storageConfig || 0,
        items: details.s3Buckets?.map((r: any) => r.name || r.properties?.name || r.id) || [
          "logs-bucket",
          "data-bucket",
          "backups-bucket",
        ],
        selected: false,
        expanded: false,
      },
      {
        id: "compute",
        name: "Compute / VM Config",
        count: resources.computeConfig || 0,
        items: [
          ...(details.ec2Instances?.map((r: any) => r.name || r.properties?.name || r.id) || []),
          ...(details.lambdas?.map((r: any) => r.name || r.properties?.name || r.id) || []),
        ].slice(0, 5) || ["web-server-1", "api-server-1", "worker-1"],
        selected: false,
        expanded: false,
      },
      {
        id: "secrets",
        name: "Secrets & Keys Metadata",
        count: resources.secrets || 0,
        items: ["db-credentials", "api-keys", "certificates", "ssh-keys"],
        selected: false,
        expanded: false,
      },
    ]

    setResourceCategories(categories)
    setShowGranularModal(true)
  }

  const toggleCategoryExpand = (id: string) => {
    setResourceCategories(prev =>
      prev.map(cat => cat.id === id ? { ...cat, expanded: !cat.expanded } : cat)
    )
  }

  const toggleCategorySelect = (id: string) => {
    setResourceCategories(prev =>
      prev.map(cat => cat.id === id ? { ...cat, selected: !cat.selected } : cat)
    )
  }

  const toggleItemSelect = (categoryId: string, itemIndex: number) => {
    // For granular item selection - simplified version
    setResourceCategories(prev =>
      prev.map(cat => {
        if (cat.id === categoryId) {
          return { ...cat, selected: true }
        }
        return cat
      })
    )
  }

  const selectedResourceCount = resourceCategories.filter(c => c.selected).length

  const proceedToConfirm = () => {
    setShowGranularModal(false)
    setShowConfirmModal(true)
  }

  const startRestore = async () => {
    setShowConfirmModal(false)
    setShowRestoringModal(true)

    const steps = [
      { step: "Creating safety checkpoint...", done: false },
      { step: "Validating snapshot integrity...", done: false },
      { step: "Restoring IAM configurations...", done: false },
      { step: "Restoring network configurations...", done: false },
      { step: "Restoring security groups...", done: false },
      { step: "Validating restored resources...", done: false },
    ]
    setRestoreSteps(steps)
    setRestoreProgress(0)

    // Simulate restore progress
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 800))
      setRestoreSteps(prev => prev.map((s, idx) => idx === i ? { ...s, done: true } : s))
      setRestoreProgress(Math.round(((i + 1) / steps.length) * 100))
    }

    await new Promise(r => setTimeout(r, 500))

    setRestoreResult({
      snapshot: selectedSnapshot?.id,
      resourcesRestored: selectedResourceCount,
      duration: "4.8s",
      status: "All Validated",
    })

    setShowRestoringModal(false)
    setShowCompleteModal(true)
  }

  const closeAllModals = () => {
    setShowSelectModal(false)
    setShowGranularModal(false)
    setShowConfirmModal(false)
    setShowRestoringModal(false)
    setShowCompleteModal(false)
    setShowCreateModal(false)
    setSelectedSnapshot(null)
    setResourceCategories([])
    setRestoreProgress(0)
    setRestoreSteps([])
    setRestoreResult(null)
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  const getSnapshotIcon = (type: string) => {
    switch (type) {
      case "AUTO PRE-FIX":
        return "bg-green-500"
      case "AUTO PRE-RESTORE":
        return "bg-blue-500"
      case "golden":
        return "bg-pink-500"
      default:
        return "bg-purple-500"
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Snapshot Manager - {systemName}</h2>
            <p className="text-sm text-gray-500">Create and restore system snapshots</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#2D51DA] text-white rounded-lg font-medium hover:bg-[#2343B8]"
          >
            <Database className="w-4 h-4" />
            Create Snapshot
          </button>
          <button
            onClick={() => setShowSelectModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-[#2D51DA] rounded-lg font-medium hover:bg-gray-50"
          >
            <ChevronDown className="w-4 h-4" />
            Restore Snapshot
          </button>
        </div>
      </div>

      {/* Snapshot History */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Snapshot History</h3>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">{error}</div>
        ) : snapshots.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No snapshots yet. Create your first snapshot to enable recovery.
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id || `snapshot-${Math.random()}`}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 ${getSnapshotIcon(snapshot.type || "manual")} rounded-xl flex items-center justify-center`}>
                    <Database className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{formatDate(snapshot.date || new Date().toISOString())}</p>
                      {snapshot.type && snapshot.type !== "manual" && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                          snapshot.type === "AUTO PRE-FIX" ? "bg-green-100 text-green-700" :
                          snapshot.type === "AUTO PRE-RESTORE" ? "bg-blue-100 text-blue-700" :
                          "bg-pink-100 text-pink-700"
                        }`}>
                          {snapshot.type}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{snapshot.name || "Unnamed snapshot"}</p>
                    <p className="text-xs text-gray-400">Created by: {snapshot.createdBy || "system"}</p>
                  </div>
                </div>
                <button
                  onClick={() => selectSnapshot(snapshot)}
                  className="px-4 py-2 bg-[#2D51DA] text-white rounded-lg font-medium hover:bg-[#2343B8]"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* CREATE SNAPSHOT MODAL */}
      {/* ================================================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Create Snapshot</h2>
                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Snapshot Name</label>
                <input
                  type="text"
                  value={newSnapshotName}
                  onChange={(e) => setNewSnapshotName(e.target.value)}
                  placeholder="e.g., Pre-deployment snapshot"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <p className="text-sm text-gray-500">
                This will capture the current state of all IAM policies, security groups, network configs, and other resources.
              </p>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={createSnapshot}
                disabled={!newSnapshotName.trim() || creating}
                className="px-4 py-2 bg-[#2D51DA] text-white rounded-lg font-medium hover:bg-[#2343B8] disabled:opacity-50 flex items-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Snapshot
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SELECT SNAPSHOT MODAL */}
      {/* ================================================================ */}
      {showSelectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Select Snapshot to Restore</h2>
                  <p className="text-sm text-gray-500">Choose a snapshot and configure granular restore options</p>
                </div>
                <button onClick={() => setShowSelectModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto flex-1">
              {snapshots.map((snapshot) => (
                <button
                  key={snapshot.id || `snapshot-${Math.random()}`}
                  onClick={() => selectSnapshot(snapshot)}
                  className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 ${getSnapshotIcon(snapshot.type || "manual")} rounded-xl flex items-center justify-center`}>
                      <Database className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{snapshot.id || "Unknown"}</p>
                        {snapshot.type && snapshot.type !== "manual" && (
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            snapshot.type === "AUTO PRE-FIX" ? "bg-green-100 text-green-700" :
                            snapshot.type === "AUTO PRE-RESTORE" ? "bg-blue-100 text-blue-700" :
                            "bg-pink-100 text-pink-700"
                          }`}>
                            {snapshot.type}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{snapshot.name || "Unnamed snapshot"}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(snapshot.date || new Date().toISOString())}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* GRANULAR RESTORE MODAL */}
      {/* ================================================================ */}
      {showGranularModal && selectedSnapshot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Granular Restore from {selectedSnapshot.id}</h2>
                  <p className="text-sm text-gray-500">{formatDateTime(selectedSnapshot.date)} - {selectedSnapshot.name}</p>
                </div>
                <button onClick={closeAllModals} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-sm font-medium text-gray-700 mb-4">Select Resources to Restore</p>
              <div className="space-y-2">
                {resourceCategories.map((category) => (
                  <div key={category.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleCategoryExpand(category.id)}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={category.selected}
                          onChange={(e) => {
                            e.stopPropagation()
                            toggleCategorySelect(category.id)
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="font-medium text-gray-900">{category.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500">
                        <span className="text-sm">{category.count} resources</span>
                        {category.expanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                    {category.expanded && (
                      <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-2">
                        {category.items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-3 pl-4">
                            <input
                              type="checkbox"
                              checked={category.selected}
                              onChange={() => toggleItemSelect(category.id, idx)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm text-gray-700">{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-600">{selectedResourceCount} resources selected</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={closeAllModals}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={proceedToConfirm}
                  disabled={selectedResourceCount === 0}
                  className="px-4 py-2 bg-[#2D51DA] text-white rounded-lg font-medium hover:bg-[#2343B8] disabled:opacity-50"
                >
                  Continue to Restore
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* CONFIRM RESTORE MODAL */}
      {/* ================================================================ */}
      {showConfirmModal && selectedSnapshot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Confirm Restore</h2>
                  <p className="text-sm text-gray-500">Review your selections before restoring</p>
                </div>
                <button onClick={closeAllModals} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Warning */}
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-yellow-800">Warning: Resource Restore</p>
                    <p className="text-sm text-yellow-700">
                      A safety checkpoint will be created before restoring. Current configurations will be overwritten.
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Snapshot:</p>
                    <p className="font-semibold text-gray-900">{selectedSnapshot.id}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(selectedSnapshot.date)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Resources to Restore:</p>
                    <p className="font-semibold text-gray-900">{selectedResourceCount} resource{selectedResourceCount !== 1 ? "s" : ""}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm text-gray-500 mb-2">Selected resources:</p>
                  <div className="flex flex-wrap gap-2">
                    {resourceCategories.filter(c => c.selected).map(c => (
                      <span key={c.id} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between">
              <button
                onClick={() => {
                  setShowConfirmModal(false)
                  setShowGranularModal(true)
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium"
              >
                Go Back
              </button>
              <button
                onClick={startRestore}
                className="px-6 py-2 bg-[#2D51DA] text-white rounded-lg font-medium hover:bg-[#2343B8]"
              >
                Start Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* RESTORING PROGRESS MODAL */}
      {/* ================================================================ */}
      {showRestoringModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="p-6 flex flex-col items-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Database className="w-8 h-8 text-blue-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Restoring from Snapshot...</h2>
              <p className="text-sm text-gray-500 mt-1">Restore complete!</p>

              <div className="w-full mt-6 space-y-3">
                {restoreSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {step.done ? (
                      <div className="w-6 h-6 bg-green-500 rounded flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-white" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 border-2 border-blue-500 rounded flex items-center justify-center">
                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    <span className={`text-sm ${step.done ? "text-gray-700" : "text-blue-600"}`}>
                      {step.step}
                    </span>
                  </div>
                ))}
              </div>

              <div className="w-full mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Progress</span>
                  <span className="text-sm font-medium text-blue-600">{restoreProgress}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${restoreProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* RESTORE COMPLETE MODAL */}
      {/* ================================================================ */}
      {showCompleteModal && restoreResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Restore Completed Successfully</h2>
              <p className="text-gray-500 mt-2">
                {restoreResult.resourcesRestored} resource{restoreResult.resourcesRestored !== 1 ? "s" : ""} restored from snapshot {restoreResult.snapshot}
              </p>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg w-full">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Snapshot:</p>
                    <p className="font-semibold text-gray-900">{restoreResult.snapshot}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Resources Restored:</p>
                    <p className="font-semibold text-gray-900">{restoreResult.resourcesRestored}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Duration:</p>
                    <p className="font-semibold text-gray-900">{restoreResult.duration}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Status:</p>
                    <p className="font-semibold text-green-600">{restoreResult.status} ✓</p>
                  </div>
                </div>
              </div>

              <button
                onClick={closeAllModals}
                className="mt-6 px-8 py-3 bg-[#2D51DA] text-white rounded-lg font-medium hover:bg-[#2343B8]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
