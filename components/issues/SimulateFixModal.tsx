"use client"

/**
 * SimulateFixModal - Pre-Computed Simulation Results
 * 
 * Shows simulation results from background pre-computation.
 * Key principle: Reads pre-computed data (<100ms), not computed on click.
 * 
 * FIXED: Loading state now shows properly regardless of status
 */

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  RefreshCw, 
  ArrowLeft, 
  Send,
  Shield,
  Zap,
  ChevronDown,
  ChevronRight,
  Loader2
} from "lucide-react"
import type { SecurityFinding } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"

interface SimulateFixModalProps {
  isOpen: boolean
  onClose: () => void
  finding: SecurityFinding | null
  onExecute?: (findingId: string, options?: { createRollback?: boolean }) => Promise<void>
  onRequestApproval?: (findingId: string) => Promise<void>
}

// Pre-computed simulation data structure
interface ConfidenceCriterion {
  id: string
  description: string
  required: boolean
  met: boolean
  details?: string
}

interface Confidence {
  level: "HIGH" | "MEDIUM" | "LOW" | "BLOCKED"
  criteria: ConfidenceCriterion[]
  summary: string
}

interface ActionPolicy {
  autoApplyAllowed: boolean
  approvalRequired: boolean
  reviewOnly: boolean
  reason: string
}

interface ExecutionStep {
  step: number
  action: string
  description: string
  apiCall?: string
  rollbackAction?: string
}

interface ExecutionPlan {
  steps: ExecutionStep[]
  estimatedDuration: string
  rollbackAvailable: boolean
}

interface Risk {
  id: string
  description: string
  likelihood: "LOW" | "MEDIUM" | "HIGH"
  mitigation: string
  detected: boolean
}

interface BlastRadius {
  level: "ISOLATED" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN"
  affectedResources: Array<{
    resourceId: string
    resourceType: string
    resourceName: string
    impact: string
    description: string
  }>
  worstCaseScenario: string
}

interface Evidence {
  dataSource: string
  observationDays: number
  eventCount: number
  lastAnalyzed: string
  coverage: number
}

interface Simulation {
  findingId: string
  issueType: string
  resourceType: string
  resourceId: string
  resourceName: string
  confidence: Confidence
  proposedChange: any
  blastRadius: BlastRadius
  evidence: Evidence
  actionPolicy: ActionPolicy
  executionPlan: ExecutionPlan
  risks: Risk[]
  computedAt: string
  expiresAt: string
}

interface SimulationResponse {
  status: "READY" | "COMPUTING" | "DRIFT_DETECTED"
  simulation?: Simulation
  message?: string
  retryAfter?: number
}

export function SimulateFixModal({ 
  isOpen, 
  onClose, 
  finding,
  onExecute,
  onRequestApproval 
}: SimulateFixModalProps) {
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [status, setStatus] = useState<"READY" | "COMPUTING" | "DRIFT_DETECTED" | "LOADING">("LOADING")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createRollback, setCreateRollback] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["confidence", "proposedChange"]))
  const { toast } = useToast()

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen && finding) {
      // Reset state on open
      setSimulation(null)
      setStatus("LOADING")
      setError(null)
      fetchSimulation()
    } else if (!isOpen) {
      // Reset on close
      setSimulation(null)
      setStatus("LOADING")
      setError(null)
    }
  }, [isOpen, finding])

  const fetchSimulation = async () => {
    if (!finding) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/proxy/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finding_id: finding.id,
        })
      })

      if (!response.ok) {
        throw new Error(`Simulation request failed: ${response.statusText}`)
      }

      const data: SimulationResponse = await response.json()
      
      console.log("[SimulateFixModal] Response:", data)

      if (data.status === "READY" && data.simulation) {
        setSimulation(data.simulation)
        setStatus("READY")
      } else if (data.status === "COMPUTING") {
        setStatus("COMPUTING")
        // Poll for results
        setTimeout(() => fetchSimulation(), data.retryAfter ? data.retryAfter * 1000 : 3000)
      } else if (data.status === "DRIFT_DETECTED") {
        setStatus("DRIFT_DETECTED")
        // Resource changed, will refresh automatically
        setTimeout(() => fetchSimulation(), data.retryAfter ? data.retryAfter * 1000 : 60000)
      } else {
        // Handle unexpected response
        console.error("[SimulateFixModal] Unexpected response:", data)
        setError("Unexpected response format from server")
      }

    } catch (err: any) {
      console.error("[SimulateFixModal] Fetch error:", err)
      setError(err.message || "Failed to fetch simulation")
      toast({
        title: "Simulation Error",
        description: err.message || "Failed to load simulation results",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!finding || !onExecute) return

    setExecuting(true)
    try {
      await onExecute(finding.id, { createRollback })
      toast({
        title: "Remediation Started",
        description: "Fix is being applied. Monitoring for 5 minutes..."
      })
      onClose()
    } catch (err: any) {
      toast({
        title: "Execution Failed",
        description: err.message || "Failed to execute remediation",
        variant: "destructive"
      })
    } finally {
      setExecuting(false)
    }
  }

  const handleRequestApproval = async () => {
    if (!finding || !onRequestApproval) return

    try {
      await onRequestApproval(finding.id)
      toast({
        title: "Approval Requested",
        description: "Approval request has been submitted to the security team"
      })
      onClose()
    } catch (err: any) {
      toast({
        title: "Request Failed",
        description: err.message || "Failed to request approval",
        variant: "destructive"
      })
    }
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case "HIGH": return "bg-green-100 text-green-800 border-green-300"
      case "MEDIUM": return "bg-yellow-100 text-yellow-800 border-yellow-300"
      case "LOW": return "bg-orange-100 text-orange-800 border-orange-300"
      case "BLOCKED": return "bg-red-100 text-red-800 border-red-300"
      default: return "bg-gray-100 text-gray-800 border-gray-300"
    }
  }

  const getBlastRadiusColor = (level: string) => {
    switch (level) {
      case "ISOLATED": return "bg-green-600"
      case "LOW": return "bg-blue-600"
      case "MEDIUM": return "bg-yellow-600"
      case "HIGH": return "bg-orange-600"
      case "UNKNOWN": return "bg-gray-600"
      default: return "bg-gray-600"
    }
  }

  if (!finding) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            Simulate Fix: {finding.title}
          </DialogTitle>
          <DialogDescription>
            Review simulation results before applying remediation
          </DialogDescription>
        </DialogHeader>

        {/* FIXED: Loading State - Show when loading OR when status is LOADING/COMPUTING */}
        {(loading || status === "LOADING" || status === "COMPUTING") && !simulation && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {status === "COMPUTING" ? "Computing Simulation..." : "Loading Simulation..."}
            </h3>
            <p className="text-sm text-gray-600">
              {status === "COMPUTING" 
                ? "This may take up to 30 seconds" 
                : "Fetching pre-computed results..."
              }
            </p>
          </div>
        )}

        {/* Drift Detected State */}
        {status === "DRIFT_DETECTED" && !loading && (
          <div className="flex flex-col items-center justify-center py-12 border-2 border-orange-300 rounded-lg bg-orange-50">
            <AlertTriangle className="w-12 h-12 text-orange-600 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Resource Has Changed</h3>
            <p className="text-sm text-gray-600 mb-4 text-center max-w-md">
              The resource has changed since analysis. Re-analyzing...
            </p>
            <Button onClick={fetchSimulation} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Analysis
            </Button>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-4 border-2 border-red-300 rounded-lg bg-red-50">
            <div className="flex items-start gap-2">
              <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-900">Error Loading Simulation</h4>
                <p className="text-sm text-red-700">{error}</p>
                <Button onClick={fetchSimulation} variant="outline" size="sm" className="mt-2">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* FIXED: Simulation Results - Show when we have simulation data and not loading */}
        {simulation && status === "READY" && !loading && (
          <div className="space-y-6">
            {/* Confidence Badge */}
            <div className={`p-6 border-2 rounded-lg text-center ${getConfidenceColor(simulation.confidence.level)}`}>
              <div className="flex items-center justify-center gap-2 mb-2">
                {simulation.confidence.level === "HIGH" && <CheckCircle2 className="w-6 h-6" />}
                {simulation.confidence.level === "MEDIUM" && <AlertTriangle className="w-6 h-6" />}
                {simulation.confidence.level === "LOW" && <AlertTriangle className="w-6 h-6" />}
                {simulation.confidence.level === "BLOCKED" && <XCircle className="w-6 h-6" />}
                <span className="text-2xl font-bold">{simulation.confidence.level} CONFIDENCE</span>
              </div>
              <p className="text-sm">{simulation.confidence.summary}</p>
            </div>

            {/* Confidence Criteria Section */}
            <div className="border rounded-lg">
              <button
                onClick={() => toggleSection("confidence")}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <h3 className="text-lg font-semibold">Confidence Criteria</h3>
                {expandedSections.has("confidence") ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
              {expandedSections.has("confidence") && (
                <div className="p-4 border-t space-y-3">
                  {simulation.confidence.criteria.map((criterion) => (
                    <div key={criterion.id} className="flex items-start gap-3">
                      {criterion.met ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={criterion.met ? "text-green-900" : "text-red-900"}>
                            {criterion.description}
                          </span>
                          {criterion.required && (
                            <Badge variant="outline" className="text-xs">Required</Badge>
                          )}
                        </div>
                        {criterion.details && (
                          <p className="text-sm text-gray-600 mt-1">{criterion.details}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* What Will Change Section */}
            <div className="border rounded-lg">
              <button
                onClick={() => toggleSection("proposedChange")}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <h3 className="text-lg font-semibold">What Will Change</h3>
                {expandedSections.has("proposedChange") ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
              {expandedSections.has("proposedChange") && (
                <div className="p-4 border-t">
                  <p className="text-gray-700 mb-4">{simulation.proposedChange.summary}</p>
                  
                  {/* Before/After Comparison */}
                  {simulation.proposedChange.before && simulation.proposedChange.after && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-red-50 border border-red-200 rounded">
                        <h4 className="font-semibold text-red-900 mb-2">Before</h4>
                        {simulation.proposedChange.before.total_permissions !== undefined && (
                          <div className="text-sm space-y-1">
                            <p><strong>Total Permissions:</strong> {simulation.proposedChange.before.total_permissions}</p>
                            <p><strong>High-Risk:</strong> {simulation.proposedChange.before.high_risk_permissions || 0}</p>
                          </div>
                        )}
                      </div>
                      <div className="p-3 bg-green-50 border border-green-200 rounded">
                        <h4 className="font-semibold text-green-900 mb-2">After</h4>
                        {simulation.proposedChange.after.total_permissions !== undefined && (
                          <div className="text-sm space-y-1">
                            <p><strong>Total Permissions:</strong> {simulation.proposedChange.after.total_permissions}</p>
                            <p><strong>High-Risk:</strong> {simulation.proposedChange.after.high_risk_permissions || 0}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Permissions to Remove */}
                  {simulation.proposedChange.permissionsToRemove && simulation.proposedChange.permissionsToRemove.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-semibold mb-2">Permissions to Remove:</h4>
                      <div className="flex flex-wrap gap-2">
                        {simulation.proposedChange.permissionsToRemove.map((perm: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="font-mono text-xs">
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* S3 PAB Settings (for S3 findings) */}
                  {simulation.proposedChange.settings && (
                    <div className="mt-4">
                      <h4 className="font-semibold mb-2">Settings to Enable:</h4>
                      <div className="flex flex-wrap gap-2">
                        {simulation.proposedChange.settings.map((setting: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="font-mono text-xs bg-green-50">
                            {setting}: true
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Blast Radius */}
            <div className="border rounded-lg">
              <button
                onClick={() => toggleSection("blastRadius")}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Blast Radius</h3>
                  <Badge className={getBlastRadiusColor(simulation.blastRadius.level)}>
                    {simulation.blastRadius.level}
                  </Badge>
                </div>
                {expandedSections.has("blastRadius") ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
              {expandedSections.has("blastRadius") && (
                <div className="p-4 border-t space-y-3">
                  {simulation.blastRadius.affectedResources && simulation.blastRadius.affectedResources.length > 0 ? (
                    <>
                      <p className="text-sm text-gray-600">
                        {simulation.blastRadius.affectedResources.length} resource(s) affected
                      </p>
                      <div className="space-y-2">
                        {simulation.blastRadius.affectedResources.map((resource, idx) => (
                          <div key={idx} className="p-3 bg-gray-50 rounded border">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{resource.resourceName}</p>
                                <p className="text-xs text-gray-500">{resource.resourceType}</p>
                              </div>
                              <Badge variant="outline">{resource.impact}</Badge>
                            </div>
                            <p className="text-sm text-gray-600 mt-2">{resource.description}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-green-700">✓ No other resources affected</p>
                  )}
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-sm">
                      <strong>Worst Case:</strong> {simulation.blastRadius.worstCaseScenario}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Evidence */}
            <div className="border rounded-lg">
              <button
                onClick={() => toggleSection("evidence")}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <h3 className="text-lg font-semibold">Evidence</h3>
                {expandedSections.has("evidence") ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
              {expandedSections.has("evidence") && (
                <div className="p-4 border-t space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Data Source:</span>
                    <span className="font-medium">{simulation.evidence.dataSource}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Observation Period:</span>
                    <span className="font-medium">{simulation.evidence.observationDays} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Events Analyzed:</span>
                    <span className="font-medium">{simulation.evidence.eventCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Coverage:</span>
                    <span className="font-medium">{simulation.evidence.coverage}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Last Analyzed:</span>
                    <span className="font-medium">
                      {new Date(simulation.evidence.lastAnalyzed).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Risks */}
            {simulation.risks && simulation.risks.length > 0 && (
              <div className="border rounded-lg border-orange-200">
                <button
                  onClick={() => toggleSection("risks")}
                  className="w-full flex items-center justify-between p-4 hover:bg-orange-50"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                    <h3 className="text-lg font-semibold">What Could Go Wrong</h3>
                  </div>
                  {expandedSections.has("risks") ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                </button>
                {expandedSections.has("risks") && (
                  <div className="p-4 border-t space-y-3">
                    {simulation.risks.map((risk, idx) => (
                      <div key={risk.id || idx} className="p-3 bg-orange-50 rounded border border-orange-200">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium">{risk.description}</p>
                          <Badge variant="outline" className={
                            risk.likelihood === "HIGH" ? "border-red-300 text-red-700" :
                            risk.likelihood === "MEDIUM" ? "border-orange-300 text-orange-700" :
                            "border-yellow-300 text-yellow-700"
                          }>
                            {risk.likelihood} Likelihood
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-700">
                          <strong>Mitigation:</strong> {risk.mitigation}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Execution Plan */}
            <div className="border rounded-lg">
              <button
                onClick={() => toggleSection("executionPlan")}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <h3 className="text-lg font-semibold">Execution Plan</h3>
                {expandedSections.has("executionPlan") ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
              {expandedSections.has("executionPlan") && (
                <div className="p-4 border-t space-y-3">
                  {simulation.executionPlan.steps.map((step) => (
                    <div key={step.step} className="flex gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                        {step.step}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{step.action}</p>
                        <p className="text-sm text-gray-600">{step.description}</p>
                        {step.apiCall && (
                          <Badge variant="outline" className="mt-1 text-xs font-mono">
                            {step.apiCall}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span>{simulation.executionPlan.estimatedDuration}</span>
                      </div>
                      {simulation.executionPlan.rollbackAvailable && (
                        <div className="flex items-center gap-2 text-green-700">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Rollback available</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Policy */}
            <div className={`p-4 rounded-lg border-2 ${
              simulation.actionPolicy.autoApplyAllowed 
                ? "bg-green-50 border-green-200" 
                : "bg-yellow-50 border-yellow-200"
            }`}>
              <div className="flex items-start gap-3">
                {simulation.actionPolicy.autoApplyAllowed ? (
                  <CheckCircle2 className="w-6 h-6 text-green-600 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-yellow-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-semibold mb-1">
                    {simulation.actionPolicy.autoApplyAllowed 
                      ? "Safe to auto-apply based on strong evidence"
                      : simulation.actionPolicy.reviewOnly
                      ? "Review recommended before applying"
                      : "Approval required before applying"
                    }
                  </p>
                  <p className="text-sm text-gray-700">{simulation.actionPolicy.reason}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button onClick={onClose} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              
              <div className="flex items-center gap-4">
                {onRequestApproval && simulation.actionPolicy.approvalRequired && (
                  <Button 
                    onClick={handleRequestApproval}
                    variant="outline"
                    className="border-blue-300"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Request Approval
                  </Button>
                )}
                
                {onExecute && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={createRollback}
                        onChange={(e) => setCreateRollback(e.target.checked)}
                        className="rounded"
                      />
                      Create rollback checkpoint first
                    </label>
                    
                    <Button 
                      onClick={handleExecute}
                      disabled={executing || simulation.actionPolicy.reviewOnly}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {executing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-2" />
                          Apply Fix Now
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
