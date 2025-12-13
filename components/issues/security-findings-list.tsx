"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Shield, CheckCircle2, Zap } from "lucide-react"
import type { SecurityFinding } from "@/lib/types"
import { SimulateFixModal } from "@/components/issues/SimulateFixModal"
import { useToast } from "@/hooks/use-toast"

interface SecurityFindingsListProps {
  findings: SecurityFinding[]
  onFindingFixed?: (findingId: string) => void
}

export function SecurityFindingsList({ findings, onFindingFixed }: SecurityFindingsListProps) {
  const [showModal, setShowModal] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null)
  const [fixedFindings, setFixedFindings] = useState<Set<string>>(new Set())
  const [executingFix, setExecutingFix] = useState(false)
  const { toast } = useToast()

  if (findings.length === 0) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Security Issues Found</h3>
        <p className="text-gray-600">Your infrastructure is secure with no open security findings.</p>
      </Card>
    )
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-red-600 text-white"
      case "HIGH":
        return "bg-orange-600 text-white"
      case "MEDIUM":
        return "bg-purple-600 text-white"
      case "LOW":
        return "bg-gray-400 text-white"
      default:
        return "bg-gray-200 text-gray-800"
    }
  }

  const getSeverityIcon = (severity: string) => {
    if (severity === "CRITICAL" || severity === "HIGH") {
      return <AlertTriangle className="w-5 h-5" />
    }
    return <Shield className="w-5 h-5" />
  }

  const handleSimulate = (finding: SecurityFinding) => {
    setSelectedFinding(finding)
    setShowModal(true)
  }

  return (
    <>
      {showModal && selectedFinding && (
        <SimulateFixModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false)
            setSelectedFinding(null)
          }}
          finding={selectedFinding}
          onExecute={async (findingId, options) => {
            console.log('[SecurityFindingsList] onExecute called with findingId:', findingId)
            setExecutingFix(true)
            try {
              console.log('[SecurityFindingsList] Making execute request...')
              const response = await fetch('/api/proxy/simulate/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  finding_id: findingId,
                  create_rollback: options?.createRollback ?? true
                })
              })
              console.log('[SecurityFindingsList] Execute response status:', response.status)

              if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                console.error('[SecurityFindingsList] Execute failed:', error)
                throw new Error(error.message || 'Execution failed')
              }

              const result = await response.json()
              console.log('[SecurityFindingsList] Execute result:', result)

              // Mark this finding as fixed locally
              console.log('[SecurityFindingsList] Marking finding as fixed:', findingId)
              setFixedFindings(prev => {
                const newSet = new Set(prev)
                newSet.add(findingId)
                console.log('[SecurityFindingsList] Fixed findings now:', Array.from(newSet))
                return newSet
              })

              // Notify parent component if callback provided
              if (onFindingFixed) {
                onFindingFixed(findingId)
              }

              // Show a persistent success message
              console.log('[SecurityFindingsList] Showing success toast')
              toast({
                title: "Fix Applied Successfully",
                description: `Remediation for "${selectedFinding?.title || 'the issue'}" has been applied. The system is being monitored.`,
                duration: 10000, // Show for 10 seconds
              })
            } catch (err) {
              console.error('[SecurityFindingsList] Error in onExecute:', err)
              throw err
            } finally {
              setExecutingFix(false)
            }
          }}
          onRequestApproval={async (findingId) => {
            const response = await fetch('/api/proxy/simulate/approval', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ finding_id: findingId })
            })
            if (!response.ok) {
              const error = await response.json().catch(() => ({}))
              throw new Error(error.message || 'Approval request failed')
            }
          }}
        />
      )}

      <div className="space-y-3">
        {findings.map((finding) => {
          const isFixed = fixedFindings.has(finding.id)
          return (
            <Card
              key={finding.id}
              className={`p-4 hover:shadow-md transition-shadow ${isFixed ? 'border-green-300 bg-green-50/50' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className={`${isFixed ? 'bg-green-600 text-white' : getSeverityColor(finding.severity)} rounded-full p-2`}>
                  {isFixed ? <CheckCircle2 className="w-5 h-5" /> : getSeverityIcon(finding.severity)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isFixed ? (
                      <Badge className="bg-green-600 text-white">FIXED</Badge>
                    ) : (
                      <Badge className={getSeverityColor(finding.severity)}>{finding.severity}</Badge>
                    )}
                    <Badge variant="outline">{finding.category}</Badge>
                    {isFixed && (
                      <span className="text-xs text-green-700 font-medium">Remediation applied - monitoring in progress</span>
                    )}
                  </div>

                  <h4 className={`text-base font-semibold mb-1 ${isFixed ? 'text-green-900' : 'text-gray-900'}`}>
                    {finding.title}
                  </h4>

                  <p className="text-sm text-gray-600 mb-2">{finding.description}</p>

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{finding.resource}</span>
                    <span>•</span>
                    <span>{finding.resourceType}</span>
                    <span>•</span>
                    <span>Discovered {new Date(finding.discoveredAt).toLocaleDateString()}</span>
                  </div>

                  {finding.remediation && !isFixed && (
                    <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-900">
                      <strong>Remediation:</strong> {finding.remediation}
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    {isFixed ? (
                      <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        Fix applied successfully
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleSimulate(finding)}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={executingFix}
                      >
                        <Zap className="w-4 h-4 mr-1" />
                        Simulate Fix
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}



