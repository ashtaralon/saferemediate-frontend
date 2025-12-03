"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { AlertTriangle, Shield, CheckCircle2 } from "lucide-react"
import type { SecurityFinding } from "@/lib/types"

interface SecurityFindingsListProps {
  findings: SecurityFinding[]
}

export function SecurityFindingsList({ findings }: SecurityFindingsListProps) {
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

  return (
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
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
