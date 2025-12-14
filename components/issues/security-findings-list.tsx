"use client"

import { useState, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Shield, CheckCircle2, Zap } from "lucide-react"
import type { SecurityFinding } from "@/lib/types"
import { SimulateFixModal } from "@/components/SimulateFixModal"
import { FindingTemplates } from "./FindingTemplates"
import { FindingCard } from "@/components/FindingCard"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

interface SecurityFindingsListProps {
  findings: SecurityFinding[]
  onRefreshFindings?: () => void
}

export function SecurityFindingsList({ findings, onRefreshFindings }: SecurityFindingsListProps) {
  const [showModal, setShowModal] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null)
  const [simulatingId, setSimulatingId] = useState<string | null>(null)
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
    const response = await fetch(`${BACKEND_URL}/api/simulate/execute`, {
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

      {/* FINDINGS LIST - Using FindingCard component */}
      <div className="space-y-4">
        {sortedFindings.map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            onSimulate={(f) => {
              setSelectedFinding(f)
              setShowModal(true)
              setSimulatingId(f.id)
            }}
            isSimulating={simulatingId === finding.id}
          />
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
