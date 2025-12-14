"use client"

import { useState, useEffect } from "react"
import { Shield, Play, Loader2, AlertTriangle, CheckCircle2, RefreshCw, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SimulateModal } from "./simulate-modal"
import { fetchSecurityFindings, triggerScan, getScanStatus, type SecurityFinding } from "@/lib/api-client"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export function SecurityDashboard() {
  const [findings, setFindings] = useState<SecurityFinding[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState<string>("")
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null)
  const [simulateModalOpen, setSimulateModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load findings on mount
  useEffect(() => {
    loadFindings()
  }, [])

  const loadFindings = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSecurityFindings()
      setFindings(data)
      console.log("[Dashboard] Loaded", data.length, "findings")
    } catch (err: any) {
      console.error("[Dashboard] Error loading findings:", err)
      setError(err.message || "Failed to load findings")
    } finally {
      setLoading(false)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setScanStatus("Starting scan...")
    setError(null)

    try {
      const result = await triggerScan(30)
      if (!result.success) {
        throw new Error("Scan failed to start")
      }

      // Poll for scan status
      const pollInterval = setInterval(async () => {
        try {
          const status = await getScanStatus()
          setScanStatus(
            status.status === "scanning"
              ? `Scanning: ${status.roles_scanned || 0}/${status.total_roles || "?"} roles`
              : status.status === "completed"
              ? `Scan complete: ${status.findings_count || 0} findings found`
              : status.status || "Scanning..."
          )

          if (status.status === "completed" || status.status === "complete") {
            clearInterval(pollInterval)
            setScanning(false)
            setScanStatus("")
            // Reload findings after scan completes
            await new Promise((resolve) => setTimeout(resolve, 2000))
            await loadFindings()
          } else if (status.status === "error" || status.status === "failed") {
            clearInterval(pollInterval)
            setScanning(false)
            setError(status.error || "Scan failed")
          }
        } catch (err) {
          console.error("[Dashboard] Error polling scan status:", err)
        }
      }, 2000)

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval)
        if (scanning) {
          setScanning(false)
          setError("Scan timed out")
        }
      }, 300000)
    } catch (err: any) {
      console.error("[Dashboard] Error starting scan:", err)
      setError(err.message || "Failed to start scan")
      setScanning(false)
      setScanStatus("")
    }
  }

  const handleSimulate = (finding: SecurityFinding) => {
    setSelectedFinding(finding)
    setSimulateModalOpen(true)
  }

  const handleExecute = async (findingId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/simulate/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ finding_id: findingId }),
      })

      if (!response.ok) {
        throw new Error("Execution failed")
      }

      const result = await response.json()
      console.log("[Dashboard] Execution result:", result)

      // Reload findings to show updated status
      await loadFindings()
      setSimulateModalOpen(false)
      setSelectedFinding(null)

      return result
    } catch (err: any) {
      console.error("[Dashboard] Error executing:", err)
      throw err
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case "CRITICAL":
        return "bg-red-600 text-white"
      case "HIGH":
        return "bg-orange-500 text-white"
      case "MEDIUM":
        return "bg-yellow-500 text-black"
      case "LOW":
        return "bg-blue-500 text-white"
      default:
        return "bg-gray-500 text-white"
    }
  }

  const counts = {
    critical: findings.filter((f) => f.severity?.toUpperCase() === "CRITICAL").length,
    high: findings.filter((f) => f.severity?.toUpperCase() === "HIGH").length,
    medium: findings.filter((f) => f.severity?.toUpperCase() === "MEDIUM").length,
    low: findings.filter((f) => f.severity?.toUpperCase() === "LOW").length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Loading security findings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Scan Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Security Dashboard</h1>
          <p className="text-gray-600 mt-1">Least Privilege Analysis & Remediation</p>
        </div>
        <div className="flex items-center gap-3">
          {scanStatus && (
            <div className="text-sm text-gray-600 bg-gray-100 px-3 py-2 rounded-lg">
              {scanStatus}
            </div>
          )}
          <Button onClick={handleScan} disabled={scanning} className="bg-blue-600 hover:bg-blue-700">
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Run Scan
              </>
            )}
          </Button>
          <Button onClick={loadFindings} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{counts.critical}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">High</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{counts.high}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Medium</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{counts.medium}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Low</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{counts.low}</div>
          </CardContent>
        </Card>
      </div>

      {/* Findings List */}
      {findings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="w-16 h-16 text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Security Findings</h3>
            <p className="text-gray-500 text-center max-w-md mb-6">
              Run a scan to analyze your AWS infrastructure for least privilege violations.
            </p>
            <Button onClick={handleScan} disabled={scanning} className="bg-blue-600 hover:bg-blue-700">
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Scan
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {findings.map((finding) => {
            const findingId = (finding as any).finding_id || finding.id
            return (
              <Card key={finding.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className={getSeverityColor(finding.severity)}>
                          {finding.severity}
                        </Badge>
                        <Badge variant="outline">{finding.category}</Badge>
                        {finding.status && (
                          <Badge variant="outline" className="capitalize">
                            {finding.status}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg">{finding.title}</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">{finding.description}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span>Resource: {finding.resource || finding.resourceId || "N/A"}</span>
                        {finding.role_name && <span>Role: {finding.role_name}</span>}
                        {finding.unused_actions_count && (
                          <span>{finding.unused_actions_count} unused permissions</span>
                        )}
                        {finding.confidence && <span>Confidence: {finding.confidence}%</span>}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleSimulate(finding)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Simulate Fix
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            )
          })}
        </div>
      )}

      {/* Simulate Modal */}
      {selectedFinding && (
        <SimulateModal
          isOpen={simulateModalOpen}
          onClose={() => {
            setSimulateModalOpen(false)
            setSelectedFinding(null)
          }}
          finding={selectedFinding}
          onExecute={handleExecute}
        />
      )}
    </div>
  )
}
