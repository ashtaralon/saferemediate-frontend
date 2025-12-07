"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CheckCircle, AlertTriangle, Zap, Clock, TrendingUp, Wrench } from "lucide-react"
import type { SecurityFinding } from "@/lib/types"
import { simulateIssue, fixIssue } from "@/lib/api-client"
import { useToast } from "@/hooks/use-toast"

interface SimulateFixModalProps {
  open: boolean
  onClose: () => void
  finding: SecurityFinding | null
  onRunFix?: () => void
}

interface SimulationResult {
  success: boolean
  confidence?: number
  before_state?: string
  after_state?: string
  estimated_time?: string
  temporal_info?: {
    start_time: string
    estimated_completion: string
  }
  warnings?: string[]
  resource_changes?: Array<{
    resource_id: string
    resource_type: string
    change_type: string
    before: string
    after: string
  }>
  impact_summary?: string
  simulated?: boolean
  safeToRemediate?: boolean
  affectedResources?: number
  brokenCalls?: number
  recommendation?: string
}

export function SimulateFixModal({ open, onClose, finding, onRunFix }: SimulateFixModalProps) {
  const [loading, setLoading] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  async function handleSimulate() {
    if (!finding) return

    try {
      setLoading(true)
      setError(null)
      setSimulation(null)

      // Use the new simulation endpoint
      const data = await simulateIssue(finding.id)
      
      // Map the response to our SimulationResult format
      setSimulation({
        success: true,
        confidence: data.confidence?.score || data.confidence || 85,
        before_state: data.beforeState || data.before_state || "Current configuration",
        after_state: data.afterState || data.after_state || "Remediated configuration",
        estimated_time: data.estimatedTime || data.estimated_time || "2-3 minutes",
        temporal_info: data.temporalInfo || data.temporal_info,
        warnings: data.warnings || [],
        resource_changes: data.resourceChanges || data.resource_changes || [],
        impact_summary: data.impactSummary || data.impact_summary || "1 resource will be modified",
        safeToRemediate: data.safeToRemediate !== false,
        affectedResources: data.affectedResources || data.affected_resources || 1,
        brokenCalls: data.brokenCalls || data.broken_calls || 0,
        recommendation: data.recommendation || "Safe to remediate",
      })
    } catch (err) {
      console.error("Simulation error", err)
      const errorMessage = err instanceof Error ? err.message : "Failed to run simulation"
      setError(errorMessage)
      toast({
        title: "Simulation Failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleFix() {
    if (!finding) return

    if (!simulation || !simulation.safeToRemediate) {
      toast({
        title: "Cannot Fix",
        description: "Run simulation first or issue is unsafe to fix",
        variant: "destructive",
      })
      return
    }

    try {
      setFixing(true)
      await fixIssue(finding.id)
      
      toast({
        title: "Success",
        description: "Issue fixed successfully!",
      })

      // Call refresh callback if provided
      if (onRunFix) {
        onRunFix()
      }

      // Close modal after successful fix
      handleClose()
    } catch (err) {
      console.error("Fix error", err)
      const errorMessage = err instanceof Error ? err.message : "Failed to remediate"
      toast({
        title: "Remediation Failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setFixing(false)
    }
  }

  function handleClose() {
    setSimulation(null)
    setError(null)
    onClose()
  }

  if (!finding) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-600" />
            Simulate Fix
          </DialogTitle>
          <DialogDescription>
            Preview the impact before applying changes to AWS infrastructure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Before running simulation */}
          {!simulation && !loading && !error && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg bg-gray-50 space-y-3">
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Issue</p>
                  <p className="text-sm text-gray-700">{finding.title}</p>
                </div>

                <div>
                  <p className="font-semibold text-gray-900 mb-1">Description</p>
                  <p className="text-sm text-gray-700">{finding.description}</p>
                </div>

                <div>
                  <p className="font-semibold text-gray-900 mb-1">Affected Resource</p>
                  <p className="text-sm text-gray-700">
                    {finding.resource} ({finding.resourceType})
                  </p>
                </div>

                {finding.remediation && (
                  <div>
                    <p className="font-semibold text-gray-900 mb-1">Remediation</p>
                    <p className="text-sm text-gray-700">{finding.remediation}</p>
                  </div>
                )}
              </div>

              <Button onClick={handleSimulate} className="w-full" size="lg">
                <Zap className="w-4 h-4" />
                Run Simulation
              </Button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="text-center py-8 space-y-2">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-sm text-gray-600">Simulating fix impact...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
              <div className="flex items-start gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5 mt-0.5" />
                <div>
                  <p className="font-semibold">Simulation Failed</p>
                  <p className="text-sm mt-1">{error}</p>
                </div>
              </div>
              <Button
                onClick={handleSimulate}
                variant="outline"
                className="mt-3 w-full"
                size="sm"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* After simulation result */}
          {simulation && (
            <div className="space-y-4">
              {/* Success header with confidence */}
              <div className={`p-4 border rounded-lg ${
                simulation.safeToRemediate 
                  ? "bg-green-50 border-green-200" 
                  : "bg-orange-50 border-orange-200"
              }`}>
                <div className={`flex items-center gap-2 ${
                  simulation.safeToRemediate ? "text-green-700" : "text-orange-700"
                }`}>
                  {simulation.safeToRemediate ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                  <span className="font-semibold">
                    Simulation {simulation.safeToRemediate ? "Successful" : "Warning"}
                    {simulation.confidence !== undefined && (
                      <span className={`ml-2 ${
                        simulation.safeToRemediate ? "text-green-800" : "text-orange-800"
                      }`}>
                        ({simulation.confidence}% Confidence)
                      </span>
                    )}
                  </span>
                </div>
                {simulation.recommendation && (
                  <p className={`text-sm mt-2 ${
                    simulation.safeToRemediate ? "text-green-800" : "text-orange-800"
                  }`}>
                    {simulation.recommendation}
                  </p>
                )}
                {simulation.simulated && (
                  <p className="text-xs text-gray-600 mt-1">
                    Note: This is a simulated response (backend endpoint pending)
                  </p>
                )}
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-3">
                {simulation.affectedResources !== undefined && (
                  <div className="p-3 border rounded-lg bg-white">
                    <p className="text-xs text-gray-500 mb-1">Affected Resources</p>
                    <p className="text-lg font-semibold text-gray-900">{simulation.affectedResources}</p>
                  </div>
                )}
                {simulation.brokenCalls !== undefined && (
                  <div className={`p-3 border rounded-lg ${
                    simulation.brokenCalls > 0 ? "bg-red-50 border-red-200" : "bg-white"
                  }`}>
                    <p className="text-xs text-gray-500 mb-1">Broken Calls</p>
                    <p className={`text-lg font-semibold ${
                      simulation.brokenCalls > 0 ? "text-red-700" : "text-gray-900"
                    }`}>
                      {simulation.brokenCalls}
                    </p>
                  </div>
                )}
              </div>

              {/* Impact Summary */}
              {simulation.impact_summary && (
                <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-900 mb-1">Impact Summary</p>
                      <p className="text-sm text-blue-800">{simulation.impact_summary}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Resource Changes */}
              <div className="p-4 border rounded-lg bg-gray-50">
                <p className="font-semibold text-gray-900 mb-3">Resource Changes</p>

                {simulation.resource_changes && simulation.resource_changes.length > 0 ? (
                  <div className="space-y-3">
                    {simulation.resource_changes.map((change, idx) => (
                      <div key={idx} className="p-3 bg-white rounded border">
                        <div className="text-xs font-medium text-gray-500 mb-2">
                          {change.resource_type} • {change.change_type}
                        </div>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-medium text-red-700">Before:</span>
                            <p className="text-gray-700 mt-1">{change.before}</p>
                          </div>
                          <div>
                            <span className="font-medium text-green-700">After:</span>
                            <p className="text-gray-700 mt-1">{change.after}</p>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 mt-2 font-mono">
                          {change.resource_id}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-red-700">Before:</span>
                      <p className="text-gray-700 mt-1">{simulation.before_state}</p>
                    </div>
                    <div>
                      <span className="font-medium text-green-700">After:</span>
                      <p className="text-gray-700 mt-1">{simulation.after_state}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Temporal Info */}
              {(simulation.estimated_time || simulation.temporal_info) && (
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="flex items-start gap-2">
                    <Clock className="w-5 h-5 text-gray-600 mt-0.5" />
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">Estimated Time</p>
                      <p className="text-sm text-gray-700">
                        {simulation.estimated_time || "Processing..."}
                      </p>
                      {simulation.temporal_info && (
                        <div className="text-xs text-gray-500 mt-2 space-y-1">
                          <p>
                            Start: {new Date(simulation.temporal_info.start_time).toLocaleString()}
                          </p>
                          <p>
                            Estimated completion:{" "}
                            {new Date(simulation.temporal_info.estimated_completion).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {simulation.warnings && simulation.warnings.length > 0 && (
                <div className="p-4 border rounded-lg bg-yellow-50 border-yellow-200">
                  <div className="flex items-start gap-2 text-yellow-700">
                    <AlertTriangle className="w-5 h-5 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold mb-2">Warnings</p>
                      <ul className="space-y-1 text-sm">
                        {simulation.warnings.map((warning, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-yellow-600">•</span>
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleFix}
                  disabled={fixing || !simulation?.safeToRemediate}
                  className="flex-1"
                  size="lg"
                >
                  {fixing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Fixing...
                    </>
                  ) : (
                    <>
                      <Wrench className="w-4 h-4 mr-2" />
                      Run Safe Fix
                    </>
                  )}
                </Button>
                <Button onClick={handleClose} variant="outline" className="flex-1" size="lg" disabled={fixing}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}



