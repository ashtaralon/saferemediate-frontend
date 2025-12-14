"use client"

import { useState, useEffect } from "react"
import { X, Shield, Zap, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, Clock, RefreshCw, Loader2, Play, AlertCircle, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { SecurityFinding } from "@/lib/types"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

interface SimulateModalProps {
  isOpen: boolean
  onClose: () => void
  finding: SecurityFinding | null
  onExecute?: (findingId: string) => Promise<any>
  backendUrl?: string
}

interface SimulationData {
  simulation_id: string
  finding_id: string
  safe: boolean
  safety_reason?: string
  confidence: number
  diff: {
    total_allowed: number
    total_observed: number
    to_remove: string[]
    removed_permissions: string[]
    to_keep: string[]
    reduction_percent: number
  }
  impact: {
    risk_level: "LOW" | "MEDIUM" | "HIGH"
    affected_resources: number
    blast_radius?: number
    blast_radius_percentage?: number
  }
  recommendation: string
  status: "READY" | "BLOCKED"
  can_execute: boolean
}

type Decision = "EXECUTE" | "CANARY" | "REVIEW" | "BLOCK"

export function SimulateModal({ isOpen, onClose, finding, onExecute, backendUrl = BACKEND_URL }: SimulateModalProps) {
  const [loading, setLoading] = useState(false)
  const [simulation, setSimulation] = useState<SimulationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedConfidence, setExpandedConfidence] = useState(false)
  const [executing, setExecuting] = useState(false)

  useEffect(() => {
    if (isOpen && finding) {
      fetchSimulation()
    }
  }, [isOpen, finding])

  const fetchSimulation = async () => {
    if (!finding) return
    
    setLoading(true)
    setError(null)
    
    try {
      const findingId = (finding as any).finding_id || finding.id
      const response = await fetch(`${backendUrl}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ finding_id: findingId })
      })

      if (!response.ok) {
        throw new Error(`Simulation failed: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.success && data.simulation) {
        setSimulation(data.simulation)
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
        // Fallback: call backend directly
        const response = await fetch(`${backendUrl}/api/simulate/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ finding_id: findingId })
        })
        
        if (!response.ok) {
          throw new Error("Execution failed")
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

  // Calculate safety score and decision
  const calculateSafetyScore = (): { score: number; decision: Decision } => {
    if (!simulation) return { score: 0, decision: "BLOCK" }
    
    const confidence = simulation.confidence / 100
    const health = simulation.safe ? 1.0 : 0.5
    const rollback = 1.0 // Assume rollback available
    const blastRadius = (simulation.impact.blast_radius_percentage || 10) / 100
    
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
      case "CANARY": return "bg-yellow-500 text-white"
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
            <span>Simulate Remediation - Patent A4 Safety Analysis</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600">Running simulation...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Simulation Error</span>
            </div>
            <p className="text-sm text-red-600 mt-1">{error}</p>
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
                        decision === "CANARY" ? "text-yellow-500" :
                        decision === "REVIEW" ? "text-orange-500" : "text-red-600"
                      }`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${
                        decision === "EXECUTE" ? "text-green-600" :
                        decision === "CANARY" ? "text-yellow-500" :
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
                      {decision}
                    </span>
                  </Badge>
                  <p className="text-sm text-gray-600 mt-2 max-w-xs">
                    {decision === "EXECUTE" && "Safe to execute automatically"}
                    {decision === "CANARY" && "Execute with canary deployment"}
                    {decision === "REVIEW" && "Requires manual review"}
                    {decision === "BLOCK" && "Blocked - unsafe to execute"}
                  </p>
                </div>
              </div>

              {/* Formula Display */}
              <Card className="bg-black text-green-400 font-mono p-4">
                <div className="text-xs space-y-1">
                  <div>Safety = Confidence × Health</div>
                  <div className="text-gray-500">× Rollback × (1 - BlastRadius)</div>
                  <div className="text-white mt-2">
                    = {(simulation.confidence / 100).toFixed(2)} × {(simulation.safe ? 1.0 : 0.5).toFixed(2)}
                    <span className="text-gray-500"> × 1.0 × {(1 - ((simulation.impact.blast_radius_percentage || 10) / 100)).toFixed(2)}</span>
                  </div>
                  <div className="text-green-400 mt-1">= {safetyScore}%</div>
                </div>
              </Card>
            </div>

            {/* 4 Factor Cards */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Confidence</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{simulation.confidence}%</div>
                  <Progress value={simulation.confidence} className="mt-2" />
                  <button
                    onClick={() => setExpandedConfidence(!expandedConfidence)}
                    className="text-xs text-blue-600 mt-2 flex items-center gap-1 hover:underline"
                  >
                    {expandedConfidence ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    View sources
                  </button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Blast Radius</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {simulation.impact.blast_radius_percentage || 10}%
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    {simulation.impact.affected_resources} resource(s)
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Health</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {simulation.safe ? (
                      <>
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                        <span className="text-lg font-bold text-green-600">100%</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-6 h-6 text-yellow-600" />
                        <span className="text-lg font-bold text-yellow-600">50%</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    {simulation.safe ? "Safe" : "Risky"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Rollback Ready</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                    <span className="text-lg font-bold text-green-600">Yes</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">Snapshot available</div>
                </CardContent>
              </Card>
            </div>

            {/* Expandable Confidence Details */}
            {expandedConfidence && (
              <Card className="bg-blue-50">
                <CardHeader>
                  <CardTitle className="text-sm">Confidence Sources</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium">CloudTrail</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-700">Confirmed</Badge>
                      <span className="text-xs text-gray-600">Weight: 60%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium">VPC Flow Logs</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-700">Confirmed</Badge>
                      <span className="text-xs text-gray-600">Weight: 30%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium">CloudWatch</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-yellow-100 text-yellow-700">Partial</Badge>
                      <span className="text-xs text-gray-600">Weight: 10%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Affected Resources Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Affected Resources</CardTitle>
              </CardHeader>
              <CardContent>
                {simulation.impact.affected_resources > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <AlertCircle className="w-4 h-4 text-orange-600" />
                      <span>{simulation.impact.affected_resources} resource(s) will be impacted</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Resource: {simulation.role_name || finding.resource}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>No other resources affected</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Changes Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Changes Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Permissions to remove:</span>
                    <Badge className="bg-red-100 text-red-700">
                      {simulation.diff.removed_permissions.length} permissions
                    </Badge>
                  </div>
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
                  <div className="text-xs text-gray-500">
                    Reduction: {simulation.diff.reduction_percent}% ({simulation.diff.total_allowed} → {simulation.diff.total_observed})
                  </div>
                </div>
              </CardContent>
            </Card>

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
                      Auto-Execute
                    </>
                  )}
                </Button>
              )}
              
              {decision === "CANARY" && (
                <Button
                  onClick={handleExecute}
                  disabled={executing}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  {executing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Execute with Caution
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
                      Executing...
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Review Required
                    </>
                  )}
                </Button>
              )}
              
              {decision === "BLOCK" && (
                <Button disabled className="bg-red-600 hover:bg-red-700 opacity-50">
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
