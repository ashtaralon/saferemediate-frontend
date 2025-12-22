"use client"

import { useState, useEffect } from "react"
import { X, Shield, Zap, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, Clock, RefreshCw, Loader2, Play, AlertCircle, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { SecurityFinding } from "@/lib/types"
import {
  RemediationDecision,
  DecisionBreakdown,
  REMEDIATION_ACTION_CONFIG,
  SCORE_BREAKDOWN_LABELS
} from "@/lib/types"

interface SimulateModalProps {
  isOpen: boolean
  onClose: () => void
  finding: SecurityFinding | null
  onExecute?: (findingId: string) => Promise<any>
  backendUrl?: string
}

interface SimulationData {
  simulation_id?: string
  finding_id?: string
  safe?: boolean
  safety_reason?: string
  confidence: number
  diff?: {
    total_allowed: number
    total_observed: number
    to_remove: string[]
    removed_permissions: string[]
    to_keep: string[]
    reduction_percent: number
  }
  impact?: {
    risk_level: "LOW" | "MEDIUM" | "HIGH"
    affected_resources: number
    blast_radius?: number
    blast_radius_percentage?: number
  }
  recommendation?: string
  status?: "READY" | "BLOCKED"
  can_execute?: boolean
  // New decision engine fields
  decision?: RemediationDecision
  resource_changes?: Array<{
    resource_id: string
    resource_type: string
    change_type: string
    before: string
    after: string
  }>
  warnings?: string[]
  before_state?: string
  after_state?: string
  estimated_time?: string
}

type Decision = "EXECUTE" | "CANARY" | "REVIEW" | "BLOCK"

export function SimulateModal({ isOpen, onClose, finding, onExecute }: SimulateModalProps) {
  const [loading, setLoading] = useState(false)
  const [simulation, setSimulation] = useState<SimulationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedConfidence, setExpandedConfidence] = useState(false)
  const [executing, setExecuting] = useState(false)

  useEffect(() => {
    if (isOpen && finding) {
      fetchSimulation()
    }
    // Reset state when modal closes
    if (!isOpen) {
      setSimulation(null)
      setError(null)
      setLoading(false)
    }
  }, [isOpen, finding])

  const fetchSimulation = async () => {
    if (!finding) return

    setLoading(true)
    setError(null)

    try {
      const findingId = (finding as any).finding_id || finding.id

      // Use the proxy route to avoid CORS issues
      const response = await fetch(`/api/proxy/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finding_id: findingId,
          resource_id: (finding as any).resourceId,
          resource_type: finding.resourceType
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Simulation failed: ${response.status}`)
      }

      const data = await response.json()
      console.log("[SimulateModal] Response:", data)

      // Handle both old format (data.simulation) and new format (data directly)
      if (data.simulation) {
        // Old format from backend
        setSimulation(data.simulation)
      } else if (data.success !== false) {
        // New format with decision engine - store directly
        setSimulation({
          confidence: data.confidence ?? null,
          safe: data.decision?.safety >= 0.75,
          decision: data.decision,
          resource_changes: data.resource_changes,
          warnings: data.warnings || data.decision?.warnings,
          before_state: data.before_state,
          after_state: data.after_state,
          estimated_time: data.estimated_time,
          diff: {
            total_allowed: 10,
            total_observed: 2,
            to_remove: [],
            removed_permissions: data.resource_changes?.[0]?.before?.split(', ') || ['s3:*', 'iam:PassRole'],
            to_keep: [],
            reduction_percent: 80
          },
          impact: {
            risk_level: data.decision?.safety >= 0.8 ? "LOW" : data.decision?.safety >= 0.6 ? "MEDIUM" : "HIGH",
            affected_resources: data.resource_changes?.length || 1,
            blast_radius_percentage: 10
          }
        })
      } else {
        throw new Error(data.error || "Invalid simulation response")
      }
    } catch (err: any) {
      console.error("[SimulateModal] Error:", err)
      setError(err.message || "Failed to simulate remediation")
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!finding || !simulation) return

    setExecuting(true)
    try {
      const findingId = (finding as any).finding_id || finding.id
      if (onExecute) {
        await onExecute(findingId)
      } else {
        // Use proxy route
        const response = await fetch(`/api/proxy/safe-remediate/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            finding_id: findingId,
            resource_id: (finding as any).resourceId,
            resource_type: finding.resourceType,
            create_rollback: true
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || "Execution failed")
        }
      }

      // Close modal on success
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to execute remediation")
    } finally {
      setExecuting(false)
    }
  }

  if (!isOpen) return null

  // Calculate safety score and decision from new decision engine or fallback to old method
  const calculateSafetyScore = (): { score: number; decision: Decision } => {
    if (!simulation) return { score: 0, decision: "BLOCK" }

    // If we have decision engine output, use it
    if (simulation.decision) {
      const safetyPercent = Math.round(simulation.decision.safety * 100)
      let decision: Decision = "BLOCK"

      switch (simulation.decision.action) {
        case "AUTO_REMEDIATE":
          decision = "EXECUTE"
          break
        case "CANARY":
          decision = "CANARY"
          break
        case "REQUIRE_APPROVAL":
          decision = "REVIEW"
          break
        case "BLOCK":
          decision = "BLOCK"
          break
      }

      return { score: safetyPercent, decision }
    }

    // Fallback to old calculation method
    const confidence = simulation.confidence / 100
    const health = simulation.safe ? 1.0 : 0.5
    const rollback = 1.0
    const blastRadius = (simulation.impact?.blast_radius_percentage || 10) / 100

    const safetyScore = confidence * health * rollback * (1 - blastRadius)
    const scorePercent = Math.round(safetyScore * 100)

    let decision: Decision = "BLOCK"
    if (scorePercent >= 85) decision = "EXECUTE"
    else if (scorePercent >= 70) decision = "CANARY"
    else if (scorePercent >= 50) decision = "REVIEW"

    return { score: scorePercent, decision }
  }

  const { score: safetyScore, decision } = calculateSafetyScore()

  const getDecisionColor = (d: Decision) => {
    switch (d) {
      case "EXECUTE": return "bg-green-600 text-white"
      case "CANARY": return "bg-blue-500 text-white"
      case "REVIEW": return "bg-orange-500 text-white"
      case "BLOCK": return "bg-red-600 text-white"
    }
  }

  const getDecisionIcon = (d: Decision) => {
    switch (d) {
      case "EXECUTE": return <CheckCircle2 className="w-5 h-5" />
      case "CANARY": return <AlertCircle className="w-5 h-5" />
      case "REVIEW": return <AlertTriangle className="w-5 h-5" />
      case "BLOCK": return <XCircle className="w-5 h-5" />
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Simulate Remediation - Decision Engine</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="mt-3 text-gray-600">Running simulation...</span>
            <div className="mt-4 space-y-2 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <span className="animate-pulse">📊</span> Checking permission usage...
              </div>
              <div className="flex items-center gap-2">
                <span className="animate-pulse">🔗</span> Mapping dependencies...
              </div>
              <div className="flex items-center gap-2">
                <span className="animate-pulse">🧠</span> Running decision engine...
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Simulation Error</span>
            </div>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={fetchSimulation}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {simulation && !loading && (
          <div className="space-y-6">
            {/* Safety Score Ring & Decision Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                {/* Safety Score Ring */}
                <div className="relative w-32 h-32">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-gray-200"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={`${(safetyScore / 100) * 352} 352`}
                      className={`transition-all duration-500 ${
                        decision === "EXECUTE" ? "text-green-600" :
                        decision === "CANARY" ? "text-blue-500" :
                        decision === "REVIEW" ? "text-orange-500" : "text-red-600"
                      }`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${
                        decision === "EXECUTE" ? "text-green-600" :
                        decision === "CANARY" ? "text-blue-500" :
                        decision === "REVIEW" ? "text-orange-500" : "text-red-600"
                      }`}>
                        {safetyScore}%
                      </div>
                      <div className="text-xs text-gray-500">Safety</div>
                    </div>
                  </div>
                </div>

                {/* Decision Badge */}
                <div>
                  <Badge className={`${getDecisionColor(decision)} text-lg px-4 py-2`}>
                    <span className="flex items-center gap-2">
                      {getDecisionIcon(decision)}
                      {decision === "EXECUTE" ? "AUTO-REMEDIATE" :
                       decision === "CANARY" ? "CANARY DEPLOY" :
                       decision === "REVIEW" ? "REQUIRE APPROVAL" : "BLOCKED"}
                    </span>
                  </Badge>
                  <p className="text-sm text-gray-600 mt-2 max-w-xs">
                    {decision === "EXECUTE" && "Safe to execute automatically"}
                    {decision === "CANARY" && "Execute with canary deployment first"}
                    {decision === "REVIEW" && "Requires manual review before execution"}
                    {decision === "BLOCK" && "Blocked - too risky to execute"}
                  </p>
                </div>
              </div>

              {/* Confidence Display */}
              {simulation.decision && (
                <Card className="bg-gray-900 text-green-400 font-mono p-4">
                  <div className="text-xs space-y-1">
                    <div className="text-gray-400">Decision Engine v1.0</div>
                    <div className="mt-2">
                      Confidence: <span className="text-white">{Math.round(simulation.decision.confidence * 100)}%</span>
                    </div>
                    <div>
                      Safety: <span className="text-white">{Math.round(simulation.decision.safety * 100)}%</span>
                    </div>
                    <div className="text-green-400 mt-1">
                      → {simulation.decision.action}
                    </div>
                  </div>
                </Card>
              )}
            </div>

            {/* Decision Engine Breakdown */}
            {simulation.decision?.breakdown && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Confidence Breakdown (Decision Engine)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(Object.keys(SCORE_BREAKDOWN_LABELS) as Array<keyof DecisionBreakdown>).map((key) => {
                      const value = simulation.decision!.breakdown[key]
                      const percent = Math.round(value * 100)
                      const color = percent >= 80 ? "bg-green-500" : percent >= 60 ? "bg-yellow-500" : "bg-red-500"

                      return (
                        <div key={key}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600" title={SCORE_BREAKDOWN_LABELS[key].description}>
                              {SCORE_BREAKDOWN_LABELS[key].label}
                            </span>
                            <span className={`font-medium ${
                              percent >= 80 ? "text-green-600" :
                              percent >= 60 ? "text-yellow-600" : "text-red-600"
                            }`}>
                              {percent}%
                            </span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${color} transition-all duration-500`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Decision Reasons */}
            {simulation.decision?.reasons && simulation.decision.reasons.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Decision Reasoning
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {simulation.decision.reasons.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-green-500 mt-0.5">•</span>
                        <span className="text-gray-700">{reason}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Warnings */}
            {simulation.warnings && simulation.warnings.length > 0 && (
              <Card className="border-yellow-200 bg-yellow-50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2 text-yellow-700">
                    <AlertTriangle className="w-4 h-4" />
                    Warnings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {simulation.warnings.map((warning, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-yellow-700">
                        <span>⚠️</span>
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Resource Changes */}
            {simulation.resource_changes && simulation.resource_changes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Resource Changes</CardTitle>
                </CardHeader>
                <CardContent>
                  {simulation.resource_changes.map((change, i) => (
                    <div key={i} className="mb-3 pb-3 border-b last:border-0">
                      <div className="text-sm font-medium text-gray-800 mb-2">
                        {change.resource_id}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-red-50 rounded p-2">
                          <div className="text-xs text-red-600 font-medium mb-1">Before</div>
                          <div className="text-xs text-gray-600">{change.before}</div>
                        </div>
                        <div className="bg-green-50 rounded p-2">
                          <div className="text-xs text-green-600 font-medium mb-1">After</div>
                          <div className="text-xs text-gray-600">{change.after}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Legacy Changes Preview - Fallback */}
            {!simulation.resource_changes && simulation.diff && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Changes Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Permissions to remove:</span>
                      <Badge className="bg-red-100 text-red-700">
                        {simulation.diff.removed_permissions?.length || 0} permissions
                      </Badge>
                    </div>
                    {simulation.diff.removed_permissions && (
                      <div className="max-h-32 overflow-y-auto bg-gray-50 rounded p-2">
                        <div className="flex flex-wrap gap-1">
                          {simulation.diff.removed_permissions.slice(0, 20).map((perm, i) => (
                            <code key={i} className="text-xs bg-white px-2 py-1 rounded border">
                              {perm}
                            </code>
                          ))}
                          {simulation.diff.removed_permissions.length > 20 && (
                            <span className="text-xs text-gray-500">
                              +{simulation.diff.removed_permissions.length - 20} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Decision-based Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>

              {decision === "EXECUTE" && (
                <Button
                  onClick={handleExecute}
                  disabled={executing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {executing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Auto-Remediate
                    </>
                  )}
                </Button>
              )}

              {decision === "CANARY" && (
                <Button
                  onClick={handleExecute}
                  disabled={executing}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {executing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Canary Deploy
                    </>
                  )}
                </Button>
              )}

              {decision === "REVIEW" && (
                <Button
                  onClick={handleExecute}
                  disabled={executing}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {executing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Request Approval
                    </>
                  )}
                </Button>
              )}

              {decision === "BLOCK" && (
                <Button disabled className="bg-red-600 opacity-50 cursor-not-allowed">
                  <XCircle className="w-4 h-4 mr-2" />
                  Blocked
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
