"use client"

import { useState, useEffect, useCallback } from "react"
import { AlertTriangle, Shield, RefreshCw, Play, CheckCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SimulateFixModal } from "@/components/SimulateFixModal"
import { fetchSecurityFindings, triggerScan, getScanStatus } from "@/lib/api-client"
import type { SecurityFinding } from "@/lib/types"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

interface Finding {
  id: string
  finding_id?: string
  title: string
  description: string
  severity: string
  resource: string
  resourceType: string
  resourceId?: string
  status: string
  category: string
  remediation?: string
  discoveredAt?: string
  type?: string
  role_name?: string
  sg_id?: string
  bucket_name?: string
  unused_actions?: string[]
  unused_rules?: any[]
  confidence?: number
  observation_days?: number
  traffic_source?: string
}

interface IssuesSectionProps {
  systemName?: string
}

export function IssuesSection({ systemName }: IssuesSectionProps) {
  const [findings, setFindings] = useState<Finding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState<string>("")
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [autoScanned, setAutoScanned] = useState(false)
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null)

  // Fetch findings from backend using api-client
  const fetchFindings = useCallback(async (): Promise<Finding[]> => {
    try {
      const data = await fetchSecurityFindings()
      return data as Finding[]
    } catch (err) {
      console.error("Error fetching findings:", err)
      throw err
    }
  }, [])

  // Trigger a scan with proper status polling
  const handleScan = useCallback(async () => {
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
              : status.status === "completed" || status.status === "complete"
              ? `Scan complete: ${status.findings_count || 0} findings found`
              : status.status || "Scanning..."
          )

          if (status.status === "completed" || status.status === "complete") {
            clearInterval(pollInterval)
            setScanning(false)
            setScanStatus("")
            setLastScanTime(new Date()) // ✅ Track last scan time
            // Wait a moment for backend to process, then reload findings
            await new Promise((resolve) => setTimeout(resolve, 2000))
            const newFindings = await fetchFindings()
            setFindings(newFindings)
            setError(null)
          } else if (status.status === "error" || status.status === "failed") {
            clearInterval(pollInterval)
            setScanning(false)
            setError(status.error || "Scan failed")
          }
        } catch (err) {
          console.error("[IssuesSection] Error polling scan status:", err)
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
    } catch (err) {
      console.error("[IssuesSection] Error starting scan:", err)
      setError(err instanceof Error ? err.message : "Failed to start scan")
      setScanning(false)
      setScanStatus("")
    }
  }, [fetchFindings, scanning])

  // Initial load - fetch findings, auto-scan if empty
  useEffect(() => {
    const loadFindings = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await fetchFindings()
        setFindings(data)

        // Don't auto-scan - let user decide (scanning is slow)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load findings")
      } finally {
        setLoading(false)
      }
    }

    loadFindings()
  }, [fetchFindings, autoScanned])

  // Handle simulate fix click
  const handleSimulateFix = (finding: Finding) => {
    setSelectedFinding(finding)
    setShowModal(true)
  }

  // Handle modal close and refresh
  const handleModalClose = () => {
    setShowModal(false)
    setSelectedFinding(null)
    // Refresh findings after remediation
    fetchFindings().then(setFindings).catch(console.error)
  }

  // Manual refresh
  const handleRefresh = async () => {
    setLoading(true)
    try {
      const data = await fetchFindings()
      setFindings(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh")
    } finally {
      setLoading(false)
    }
  }

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical":
        return "bg-red-600 text-white"
      case "high":
        return "bg-orange-500 text-white"
      case "medium":
        return "bg-yellow-500 text-black"
      case "low":
        return "bg-blue-500 text-white"
      default:
        return "bg-gray-500 text-white"
    }
  }

  // Get type icon
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "iam_unused_permissions":
        return "🔐"
      case "sg_unused_rules":
        return "🛡️"
      case "s3_public_no_external_access":
        return "🪣"
      default:
        return "⚠️"
    }
  }

  // Get type label
  const getTypeLabel = (type: string) => {
    switch (type) {
      case "iam_unused_permissions":
        return "IAM Role"
      case "sg_unused_rules":
        return "Security Group"
      case "s3_public_no_external_access":
        return "S3 Bucket"
      default:
        return "Unknown"
    }
  }

  // Get time ago helper
  const getTimeAgo = (date: Date): string => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  // Loading state
  if (loading && !scanning) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading findings...</span>
      </div>
    )
  }

  // Scanning state
  if (scanning) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="text-center">
          <h3 className="font-semibold text-lg">Scanning AWS Resources</h3>
          <p className="text-muted-foreground">{scanStatus}</p>
          <p className="text-sm text-muted-foreground mt-2">
            Analyzing CloudTrail, VPC Flow Logs, and S3 access patterns...
          </p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Security Findings</h3>
            <Badge variant="secondary">{findings.length}</Badge>
          </div>
          {lastScanTime && (
            <span className="text-sm text-muted-foreground">
              Last scan: {lastScanTime.toLocaleTimeString()} ({getTimeAgo(lastScanTime)})
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading || scanning}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="default" size="sm" onClick={handleScan} disabled={scanning || loading}>
            {scanning ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                Scan Now
              </>
            )}
          </Button>
        </div>
      </div>

      {/* No findings */}
      {findings.length === 0 && (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg">No Findings Loaded</h3>
          <p className="text-muted-foreground mb-4">
            Click "Scan Now" to analyze your AWS resources for security issues.
          </p>
          <Button variant="default" onClick={handleScan} size="lg" disabled={scanning}>
            {scanning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Scan AWS Resources
              </>
            )}
          </Button>
          {scanStatus && (
            <p className="text-sm text-blue-600 mt-2">{scanStatus}</p>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Scans IAM roles, Security Groups, and S3 buckets (takes 30-60 seconds)
          </p>
        </div>
      )}

      {/* Findings list */}
      <div className="space-y-3">
        {findings.map((finding) => (
          <div
            key={finding.id || finding.finding_id}
            className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {/* Header row */}
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={getSeverityColor(finding.severity)}>
                    {finding.severity?.toUpperCase()}
                  </Badge>
                  <Badge variant="outline">
                    {getTypeIcon(finding.type || "")} {getTypeLabel(finding.type || "")}
                  </Badge>
                  <Badge variant="secondary">{finding.category}</Badge>
                </div>

                {/* Title */}
                <h4 className="font-semibold text-base mb-1">{finding.title}</h4>

                {/* Description */}
                <p className="text-sm text-muted-foreground mb-2">{finding.description}</p>

                {/* Resource info */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>
                    <span className="font-medium">Resource:</span> {finding.resource}
                  </div>
                  {finding.traffic_source && (
                    <div>
                      <span className="font-medium">Traffic Source:</span> {finding.traffic_source}
                    </div>
                  )}
                  {finding.confidence && (
                    <div>
                      <span className="font-medium">Confidence:</span> {finding.confidence}% based on{" "}
                      {finding.observation_days} days of data
                    </div>
                  )}
                  {finding.discoveredAt && (
                    <div>
                      <span className="font-medium">Discovered:</span>{" "}
                      {new Date(finding.discoveredAt).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {/* Remediation suggestion */}
                {finding.remediation && (
                  <div className="mt-2 text-sm">
                    <span className="font-medium text-green-600">Remediation:</span>{" "}
                    {finding.remediation}
                  </div>
                )}
              </div>

              {/* Action button */}
              <div className="ml-4">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleSimulateFix(finding)}
                  className="whitespace-nowrap"
                >
                  Simulate Fix
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Simulate Fix Modal */}
      {showModal && selectedFinding && (
        <SimulateFixModal
          finding={selectedFinding}
          isOpen={showModal}
          onClose={handleModalClose}
        />
      )}
    </div>
  )
}
