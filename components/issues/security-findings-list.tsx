"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Shield, CheckCircle2, Zap } from "lucide-react"
import type { SecurityFinding } from "@/lib/types"
import { SimulateFixModal } from "@/components/issues/SimulateFixModal"

interface SecurityFindingsListProps {
  findings: SecurityFinding[]
}

export function SecurityFindingsList({ findings }: SecurityFindingsListProps) {
  const [showModal, setShowModal] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null)

  // DEBUG: Log every render
  console.log("🟢 [LIST] Render - showModal:", showModal, "finding:", selectedFinding?.id)

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
      case "CRITICAL": return "bg-red-600 text-white"
      case "HIGH": return "bg-orange-600 text-white"
      case "MEDIUM": return "bg-purple-600 text-white"
      case "LOW": return "bg-gray-400 text-white"
      default: return "bg-gray-200 text-gray-800"
    }
  }

  const getSeverityIcon = (severity: string) => {
    if (severity === "CRITICAL" || severity === "HIGH") {
      return <AlertTriangle className="w-5 h-5" />
    }
    return <Shield className="w-5 h-5" />
  }

  const handleSimulate = (finding: SecurityFinding) => {
    console.log("🟡 [LIST] Button clicked, opening modal for:", finding.id)
    setSelectedFinding(finding)
    setShowModal(true)
  }

  const handleClose = () => {
    console.log("🔴 [LIST] Closing modal")
    setShowModal(false)
    setSelectedFinding(null)
  }

  return (
    <>
      {/* DEBUG INDICATOR - Shows in bottom right */}
      <div style={{
        position: 'fixed',
        bottom: 10,
        right: 10,
        padding: '10px 20px',
        borderRadius: 8,
        backgroundColor: showModal ? '#22c55e' : '#ef4444',
        color: 'white',
        zIndex: 999999,
        fontSize: 14,
        fontWeight: 'bold',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
      }}>
        {showModal ? '🟢 MODAL: OPEN' : '🔴 MODAL: CLOSED'}
        <br/>
        <span style={{ fontSize: 11 }}>Finding: {selectedFinding?.id || 'none'}</span>
      </div>

      {/* MODAL - Always render, controlled by isOpen prop */}
      <SimulateFixModal
        isOpen={showModal}
        onClose={handleClose}
        finding={selectedFinding}
        onExecute={async (findingId, options) => {
          console.log("🟣 [LIST] Executing remediation:", findingId)
          const response = await fetch('/api/proxy/simulate/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              finding_id: findingId,
              create_rollback: options?.createRollback ?? true
            })
          })
          if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.message || 'Execution failed')
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

      {/* FINDINGS LIST */}
      <div className="space-y-3">
        {findings.map((finding) => (
          <Card key={finding.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-4">
              <div className={`${getSeverityColor(finding.severity)} rounded-full p-2`}>
                {getSeverityIcon(finding.severity)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={getSeverityColor(finding.severity)}>{finding.severity}</Badge>
                  <Badge variant="outline">{finding.category}</Badge>
                </div>

                <h4 className="text-base font-semibold text-gray-900 mb-1">{finding.title}</h4>
                <p className="text-sm text-gray-600 mb-2">{finding.description}</p>

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{finding.resource}</span>
                  <span>•</span>
                  <span>{finding.resourceType}</span>
                  <span>•</span>
                  <span>Discovered {new Date(finding.discoveredAt).toLocaleDateString()}</span>
                </div>

                {finding.remediation && (
                  <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-900">
                    <strong>Remediation:</strong> {finding.remediation}
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={() => handleSimulate(finding)}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Zap className="w-4 h-4 mr-1" />
                    Simulate Fix
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
