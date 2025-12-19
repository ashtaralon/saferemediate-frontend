"use client"

import { useState } from "react"
import { X, Play, CheckCircle, AlertTriangle, RotateCcw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

interface Finding {
  id: string
  finding_id?: string
  title: string
  description: string
  severity: string
  resource: string
  resourceType: string
  resourceId?: string
  type?: string
  role_name?: string
  sg_id?: string
  bucket_name?: string
  unused_actions?: string[]
  unused_rules?: any[]
  remediation?: string
}

interface SimulateFixModalProps {
  finding: Finding
  isOpen: boolean
  onClose: () => void
}

type Step = "simulate" | "simulating" | "review" | "executing" | "success" | "error"

export function SimulateFixModal({ finding, isOpen, onClose }: SimulateFixModalProps) {
  const [step, setStep] = useState<Step>("simulate")
  const [simulation, setSimulation] = useState<any>(null)
  const [execution, setExecution] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const findingId = finding.finding_id || finding.id

  const handleSimulate = async () => {
    setStep("simulating")
    setError(null)

    try {
      const response = await fetch(`${BACKEND_URL}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finding_id: findingId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || `Simulation failed: ${response.status}`)
      }

      const data = await response.json()
      setSimulation(data.simulation || data)
      setStep("review")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed")
      setStep("error")
    }
  }

  const handleExecute = async () => {
    setStep("executing")
    setError(null)

    try {
      // Use proxy route to avoid CORS and ensure proper routing
      const response = await fetch(`/api/proxy/simulate/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finding_id: findingId,
          simulation_id: simulation?.simulation_id,
          create_rollback: true,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `Execution failed: ${response.status}` }))
        throw new Error(errorData.detail || errorData.message || `Execution failed: ${response.status}`)
      }

      const data = await response.json()
      setExecution(data)
      setStep("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed")
      setStep("error")
    }
  }

  const handleClose = () => {
    setStep("simulate")
    setSimulation(null)
    setExecution(null)
    setError(null)
    onClose()
  }

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical": return "bg-red-600 text-white"
      case "high": return "bg-orange-500 text-white"
      case "medium": return "bg-yellow-500 text-black"
      case "low": return "bg-blue-500 text-white"
      default: return "bg-gray-500 text-white"
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Badge className={getSeverityColor(finding.severity)}>
              {finding.severity?.toUpperCase()}
            </Badge>
            <h2 className="text-lg font-semibold">Remediation</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="mb-6">
            <h3 className="font-semibold text-base mb-1">{finding.title}</h3>
            <p className="text-sm text-muted-foreground mb-2">{finding.description}</p>
            <p className="text-xs text-muted-foreground">Resource: {finding.resource}</p>
          </div>

          {step === "simulate" && (
            <div className="text-center py-8">
              <Play className="h-12 w-12 mx-auto text-primary mb-4" />
              <h3 className="font-semibold text-lg mb-2">Ready to Simulate</h3>
              <p className="text-muted-foreground mb-6">
                Preview the changes before applying them to your AWS resources.
              </p>
              <Button onClick={handleSimulate} size="lg">
                <Play className="h-4 w-4 mr-2" />
                Run Simulation
              </Button>
            </div>
          )}

          {step === "simulating" && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 mx-auto text-primary mb-4 animate-spin" />
              <h3 className="font-semibold text-lg mb-2">Simulating...</h3>
              <p className="text-muted-foreground">Analyzing impact and generating preview...</p>
            </div>
          )}

          {step === "review" && simulation && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-semibold">Simulation Complete - Safe to Apply</span>
              </div>

              <div className="bg-muted rounded-lg p-4">
                <h4 className="font-semibold mb-2">Changes to be Applied</h4>
                
                {simulation.diff?.removed_permissions && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-red-600 mb-1">
                      Permissions to Remove ({simulation.diff.removed_permissions.length}):
                    </p>
                    <div className="max-h-32 overflow-y-auto bg-background rounded p-2 text-xs font-mono">
                      {simulation.diff.removed_permissions.slice(0, 10).map((action: string, i: number) => (
                        <div key={i} className="text-red-600">- {action}</div>
                      ))}
                      {simulation.diff.removed_permissions.length > 10 && (
                        <div className="text-muted-foreground">
                          ... and {simulation.diff.removed_permissions.length - 10} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {simulation.diff?.removed_rules && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-red-600 mb-1">
                      Rules to Remove ({simulation.diff.removed_rules.length}):
                    </p>
                    <div className="max-h-32 overflow-y-auto bg-background rounded p-2 text-xs font-mono">
                      {simulation.diff.removed_rules.map((rule: any, i: number) => (
                        <div key={i} className="text-red-600">
                          - {rule.protocol}:{rule.from_port}-{rule.to_port} from {rule.cidr}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {simulation.diff?.action && (
                  <div className="mb-3">
                    <p className="text-sm font-medium mb-1">Action:</p>
                    <p className="text-sm">{simulation.diff.action}</p>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Risk: {simulation.impact?.risk_level || "LOW"}
                    </Badge>
                    <span className="text-muted-foreground">
                      {simulation.impact?.reason || "Based on traffic analysis"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RotateCcw className="h-4 w-4" />
                <span>A snapshot will be created for instant rollback if needed</span>
              </div>
            </div>
          )}

          {step === "executing" && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 mx-auto text-primary mb-4 animate-spin" />
              <h3 className="font-semibold text-lg mb-2">Applying Remediation...</h3>
              <p className="text-muted-foreground">Creating snapshot and modifying AWS resources...</p>
            </div>
          )}

          {step === "success" && execution && (
            <div className="text-center py-8">
              <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
              <h3 className="font-semibold text-xl mb-2 text-green-600">Remediation Successful!</h3>
              <p className="text-muted-foreground mb-4">
                {execution.total_removed || 0} items removed from {finding.resourceId || finding.resource}
              </p>
              
              <div className="bg-muted rounded-lg p-4 text-left text-sm mb-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-muted-foreground">Execution ID:</div>
                  <div className="font-mono text-xs">{execution.execution_id}</div>
                  <div className="text-muted-foreground">Snapshot ID:</div>
                  <div className="font-mono text-xs">{execution.snapshot_id}</div>
                  <div className="text-muted-foreground">Rollback:</div>
                  <div className="text-green-600">Available ✓</div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                You can rollback this change anytime from the Snapshots section.
              </p>
            </div>
          )}

          {step === "error" && (
            <div className="text-center py-8">
              <AlertTriangle className="h-16 w-16 mx-auto text-red-500 mb-4" />
              <h3 className="font-semibold text-xl mb-2 text-red-600">Remediation Failed</h3>
              <p className="text-muted-foreground mb-4">The remediation could not be applied.</p>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left mb-4">
                <p className="text-sm font-medium text-red-600 mb-1">Error Details</p>
                <p className="text-sm text-red-700 font-mono">{error}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t bg-muted/50">
          <Button variant="ghost" onClick={handleClose}>
            ← {step === "success" ? "Close" : "Back to Simulation"}
          </Button>

          {step === "review" && (
            <Button onClick={handleExecute} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              Apply Fix
            </Button>
          )}

          {step === "error" && (
            <Button onClick={() => setStep("simulate")} variant="outline">
              Try Again
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
