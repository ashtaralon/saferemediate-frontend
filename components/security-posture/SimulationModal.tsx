"use client"

import { useState, useEffect } from "react"
import { X, Play, CheckCircle, AlertTriangle, XCircle, Loader2, Shield, Activity } from "lucide-react"

interface Permission {
  service: string
  action: string
  resource: string | string[]
}

interface ImpactAnalysis {
  permissionsRemoved: number
  permissionsKept: number
  reductionPercentage: number
  affectedServices: string[]
}

interface SimulationResult {
  roleArn: string
  removeActions: string[]
  currentPermissions: Permission[]
  recommendedPermissions: Permission[]
  permissionsToRemove: Permission[]
  impactAnalysis: ImpactAnalysis
  warnings: string[]
  confidence: number
  safeToRemove: boolean
}

interface SimulationModalProps {
  isOpen: boolean
  onClose: () => void
  roleArn: string | null
  roleName: string
  unusedPermissions: string[]
}

export function SimulationModal({
  isOpen,
  onClose,
  roleArn,
  roleName,
  unusedPermissions,
}: SimulationModalProps) {
  const [loading, setLoading] = useState(false)
  const [fetchingPermissions, setFetchingPermissions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set())
  const [fetchedPermissions, setFetchedPermissions] = useState<string[]>([])

  // Fetch unused permissions if not provided
  useEffect(() => {
    // Check underlying values directly to avoid referencing effectivePermissions before definition
    const hasProvidedPermissions = unusedPermissions && unusedPermissions.length > 0
    const hasFetchedPermissions = fetchedPermissions.length > 0

    if (isOpen && roleArn && !hasProvidedPermissions && !hasFetchedPermissions) {
      const fetchPermissions = async () => {
        setFetchingPermissions(true)
        try {
          const res = await fetch(`/api/proxy/least-privilege/roles/${encodeURIComponent(roleArn)}`)
          if (res.ok) {
            const data = await res.json()
            const unused = (data.unusedPermissions || []).map((p: any) => p.action || p)
            setFetchedPermissions(unused)
            setSelectedActions(new Set(unused))
          }
        } catch (err) {
          console.error('Failed to fetch permissions:', err)
        } finally {
          setFetchingPermissions(false)
        }
      }
      fetchPermissions()
    }
  }, [isOpen, roleArn, unusedPermissions, fetchedPermissions.length])

  // Use provided or fetched permissions
  const effectivePermissions = unusedPermissions?.length > 0 ? unusedPermissions : fetchedPermissions

  // Initialize selected actions when unusedPermissions change
  useEffect(() => {
    if (unusedPermissions && effectivePermissions.length > 0) {
      setSelectedActions(new Set(unusedPermissions))
    }
  }, [unusedPermissions])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setResult(null)
      setError(null)
    } else {
      setFetchedPermissions([])
    }
  }, [isOpen])

  const runSimulation = async () => {
    if (!roleArn || selectedActions.size === 0) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/proxy/simulation/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role_arn: roleArn,
          remove_actions: Array.from(selectedActions),
        }),
      })

      if (!res.ok) {
        throw new Error(`Simulation failed: ${res.status}`)
      }

      const data = await res.json()
      setResult(data)
    } catch (err: any) {
      console.error("Error running simulation:", err)
      setError(err.message || "Failed to run simulation")
    } finally {
      setLoading(false)
    }
  }

  const toggleAction = (action: string) => {
    const newSelected = new Set(selectedActions)
    if (newSelected.has(action)) {
      newSelected.delete(action)
    } else {
      newSelected.add(action)
    }
    setSelectedActions(newSelected)
  }

  const selectAll = () => {
    setSelectedActions(new Set(effectivePermissions))
  }

  const selectNone = () => {
    setSelectedActions(new Set())
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-amber-500 to-orange-500 text-white">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6" />
            <div>
              <h2 className="text-lg font-semibold">Impact Simulation</h2>
              <p className="text-sm text-amber-100">{roleName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm text-blue-800 font-medium">Safe Simulation</p>
                <p className="text-sm text-blue-700">
                  This simulation checks if removing the selected permissions would break any
                  observed runtime calls. No changes will be made to your AWS environment.
                </p>
              </div>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Permission Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Permissions to Remove</h3>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={selectAll}
                    className="text-indigo-600 hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    onClick={selectNone}
                    className="text-indigo-600 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="border rounded-lg max-h-80 overflow-auto">
                {effectivePermissions.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                    <p className="text-sm">No unused permissions to simulate</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {effectivePermissions.map((action, idx) => (
                      <label
                        key={idx}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedActions.has(action)}
                          onChange={() => toggleAction(action)}
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                        />
                        <code className="text-sm text-gray-700 flex-1">{action}</code>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <p className="mt-2 text-xs text-gray-500">
                {selectedActions.size} of {effectivePermissions.length} permissions selected
              </p>
            </div>

            {/* Right: Simulation Results */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Simulation Results</h3>

              {!result && !loading && !error && (
                <div className="border rounded-lg p-8 text-center bg-gray-50">
                  <Play className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-gray-500 text-sm">
                    Select permissions and click "Run Simulation" to see the impact
                  </p>
                </div>
              )}

              {loading && (
                <div className="border rounded-lg p-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-500" />
                  <p className="text-gray-500 text-sm">Running simulation...</p>
                </div>
              )}

              {error && (
                <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <div className="flex items-center gap-2 text-red-700 mb-2">
                    <XCircle className="w-5 h-5" />
                    <span className="font-medium">Simulation Failed</span>
                  </div>
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  {/* Result Summary */}
                  <div className={`border rounded-lg p-4 ${
                    result.safeToRemove
                      ? 'bg-green-50 border-green-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    <div className="flex items-center gap-3 mb-2">
                      {result.safeToRemove ? (
                        <>
                          <CheckCircle className="w-6 h-6 text-green-600" />
                          <span className="font-semibold text-green-800">Safe to Remove</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-6 h-6 text-amber-600" />
                          <span className="font-semibold text-amber-800">Review Recommended</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {result.safeToRemove
                        ? `Removing ${result.permissionsToRemove?.length || result.removeActions.length} permissions appears safe based on observed usage.`
                        : `Review the ${result.warnings?.length || 0} warning(s) before proceeding.`}
                    </p>
                  </div>

                  {/* Impact Analysis */}
                  {result.impactAnalysis && (
                    <div className="bg-gray-50 rounded-lg p-4 border">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Impact Analysis</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-center p-2 bg-white rounded border">
                          <div className="text-xl font-bold text-red-600">
                            {result.impactAnalysis.permissionsRemoved || result.permissionsToRemove?.length || 0}
                          </div>
                          <div className="text-xs text-gray-500">Permissions Removed</div>
                        </div>
                        <div className="text-center p-2 bg-white rounded border">
                          <div className="text-xl font-bold text-green-600">
                            {result.impactAnalysis.permissionsKept || result.recommendedPermissions?.length || 0}
                          </div>
                          <div className="text-xs text-gray-500">Permissions Kept</div>
                        </div>
                      </div>
                      {result.impactAnalysis.reductionPercentage > 0 && (
                        <div className="mt-3 text-center">
                          <span className="text-sm text-gray-600">
                            <strong>{result.impactAnalysis.reductionPercentage.toFixed(1)}%</strong> reduction in attack surface
                          </span>
                        </div>
                      )}
                      {result.impactAnalysis.affectedServices?.length > 0 && (
                        <div className="mt-3">
                          <span className="text-xs text-gray-500">Affected services: </span>
                          <span className="text-xs text-gray-700">
                            {result.impactAnalysis.affectedServices.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Warnings List */}
                  {result.warnings && result.warnings.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        Warnings ({result.warnings.length})
                      </h4>
                      <div className="border rounded-lg divide-y max-h-32 overflow-auto">
                        {result.warnings.map((warning, idx) => (
                          <div key={idx} className="px-4 py-2 bg-amber-50/50 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            <span className="text-sm text-amber-800">{warning}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Permissions to Remove */}
                  {result.permissionsToRemove && result.permissionsToRemove.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        Permissions to Remove ({result.permissionsToRemove.length})
                      </h4>
                      <div className="border rounded-lg divide-y max-h-32 overflow-auto">
                        {result.permissionsToRemove.slice(0, 10).map((perm, idx) => (
                          <div key={idx} className="px-4 py-2 bg-red-50/50">
                            <code className="text-sm text-red-700">{perm.action}</code>
                          </div>
                        ))}
                        {result.permissionsToRemove.length > 10 && (
                          <div className="px-4 py-2 text-center text-xs text-gray-500">
                            ...and {result.permissionsToRemove.length - 10} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Confidence Score */}
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <span className="text-sm text-blue-800">Confidence Score</span>
                    <span className={`font-bold ${
                      result.confidence >= 0.8 ? 'text-green-600' :
                      result.confidence >= 0.5 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {(result.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Note */}
                  <div className="bg-gray-100 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs text-gray-600">
                      <strong>Note:</strong> This analysis is based on observed CloudTrail data.
                      Infrequently used permissions may not appear in the observation window.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center">
          <p className="text-xs text-gray-500">
            Simulation uses observed runtime data to predict impact
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
            <button
              onClick={runSimulation}
              disabled={loading || selectedActions.size === 0}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              Run Simulation
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
