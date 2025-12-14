"use client"

import { useState, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Shield, CheckCircle2, Zap } from "lucide-react"
import type { SecurityFinding } from "@/lib/types"
import { SimulateFixModal } from "@/components/issues/SimulateFixModal"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

interface SecurityFindingsListProps {
  findings: SecurityFinding[]
  onRefreshFindings?: () => void
}

export function SecurityFindingsList({ findings, onRefreshFindings }: SecurityFindingsListProps) {
  const [showModal, setShowModal] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null)
  const [remediatedIds, setRemediatedIds] = useState<Set<string>>(new Set())

  // Log render for debugging
  console.log("[LIST] Render - showModal:", showModal, "finding:", selectedFinding?.id, "remediated:", remediatedIds.size)

  const handleRefreshFindings = useCallback(() => {
    console.log("[LIST] Refreshing findings...")
    if (onRefreshFindings) {
      onRefreshFindings()
    }
  }, [onRefreshFindings])

  const markAsRemediated = useCallback((findingId: string) => {
    console.log("[LIST] Marking as remediated:", findingId)
    setRemediatedIds(prev => new Set([...prev, findingId]))
  }, [])

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
    console.log("[LIST] Button clicked, opening modal for:", finding.id)
    setSelectedFinding(finding)
    setShowModal(true)
  }

  const handleClose = () => {
    console.log("[LIST] Closing modal")
    setShowModal(false)
    setSelectedFinding(null)
  }

  const handleExecute = async (findingId: string, options?: { createRollback?: boolean }) => {
    console.log("[LIST] Executing remediation:", findingId)
    const response = await fetch('/api/proxy/safe-remediate/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        finding_id: findingId,
        create_rollback: options?.createRollback ?? true
      })
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      throw new Error(result.error || result.message || 'Execution failed')
    }

    // Mark as remediated locally
    markAsRemediated(findingId)

    return result
  }

  // Filter out remediated findings or show them with status
  const displayFindings = findings.map(f => ({
    ...f,
    isRemediated: remediatedIds.has(f.id) || f.status === 'resolved'
  }))

  // Sort: non-remediated first, then by severity
  const sortedFindings = [...displayFindings].sort((a, b) => {
    if (a.isRemediated !== b.isRemediated) {
      return a.isRemediated ? 1 : -1
    }
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    return (severityOrder[a.severity as keyof typeof severityOrder] || 4) -
           (severityOrder[b.severity as keyof typeof severityOrder] || 4)
  })

  return (
    <>
      {/* MODAL */}
      <SimulateFixModal
        isOpen={showModal}
        onClose={handleClose}
        finding={selectedFinding}
        onExecute={handleExecute}
        onRefreshFindings={() => {
          // Mark finding as remediated and refresh
          if (selectedFinding) {
            markAsRemediated(selectedFinding.id)
          }
          handleRefreshFindings()
        }}
      />

      {/* FINDINGS LIST */}
      <div className="space-y-3">
        {sortedFindings.map((finding) => (
          <Card
            key={finding.id}
            className={`p-4 transition-shadow ${
              finding.isRemediated
                ? 'bg-green-50 border-green-200 opacity-75'
                : 'hover:shadow-md'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`${
                finding.isRemediated
                  ? 'bg-green-600 text-white'
                  : getSeverityColor(finding.severity)
              } rounded-full p-2`}>
                {finding.isRemediated ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  getSeverityIcon(finding.severity)
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {finding.isRemediated ? (
                    <Badge className="bg-green-600 text-white">REMEDIATED</Badge>
                  ) : (
                    <Badge className={getSeverityColor(finding.severity)}>{finding.severity}</Badge>
                  )}
                  <Badge variant="outline">{finding.category}</Badge>
                  {finding.isRemediated && (
                    <span className="text-xs text-green-700 font-medium">Fixed</span>
                  )}
                </div>

                <h4 className={`text-base font-semibold mb-1 ${
                  finding.isRemediated ? 'text-green-800 line-through' : 'text-gray-900'
                }`}>
                  {finding.title}
                </h4>
                <p className={`text-sm mb-2 ${
                  finding.isRemediated ? 'text-green-700' : 'text-gray-600'
                }`}>
                  {finding.description}
                </p>

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{finding.resource}</span>
                  <span>•</span>
                  <span>{finding.resourceType}</span>
                  <span>•</span>
                  <span>Discovered {new Date(finding.discoveredAt).toLocaleDateString()}</span>
                </div>

                {finding.remediation && !finding.isRemediated && (
                  <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-900">
                    <strong>Remediation:</strong> {finding.remediation}
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  {finding.isRemediated ? (
                    <Badge variant="outline" className="text-green-700 border-green-300">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Issue Resolved
                    </Badge>
                  ) : (
                    <Button
                      onClick={() => handleSimulate(finding)}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Zap className="w-4 h-4 mr-1" />
                      Simulate Fix
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Summary bar */}
      {remediatedIds.size > 0 && (
        <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-700" />
            <span className="text-green-800 font-medium">
              {remediatedIds.size} finding{remediatedIds.size !== 1 ? 's' : ''} remediated this session
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshFindings}
            className="text-green-700 border-green-400 hover:bg-green-200"
          >
            Refresh List
          </Button>
        </div>
      )}
    </>
  )
}
