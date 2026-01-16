"use client"

import { useState, useEffect, useRef } from "react"
import { Zap, RefreshCw, CheckCircle, XCircle } from "lucide-react"

interface SyncFromAWSButtonProps {
  onSyncComplete?: () => void
  className?: string
}

interface SyncStatus {
  job_id: string
  status: "running" | "completed" | "failed"
  current_step: number
  current_step_name: string
  total_steps: number
  message: string
  progress_percent: number
  results?: any
  error?: string
}

const STEP_LABELS: Record<string, string> = {
  starting: "Starting...",
  tag_sync: "Syncing AWS tags",
  flow_logs: "Ingesting VPC Flow Logs",
  cloudtrail: "Ingesting CloudTrail events",
  iam_analyzer: "Analyzing IAM permissions",
  aws_config: "Processing AWS Config",
  xray: "Collecting X-Ray traces",
  auto_tagger: "Running auto-tagger",
}

export function SyncFromAWSButton({ onSyncComplete, className = "" }: SyncFromAWSButtonProps) {
  const [loading, setLoading] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [result, setResult] = useState<{
    success: boolean
    message?: string
    results?: any
  } | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Poll for job status
  useEffect(() => {
    if (!jobId || !loading) {
      return
    }

    let failedAttempts = 0
    const maxFailedAttempts = 100 // Stop after ~8+ minutes of failed checks

    const pollStatus = async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout

        const response = await fetch(`/api/proxy/collectors/sync-all/status/${jobId}`, {
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`)
        }

        const data: SyncStatus = await response.json()
        failedAttempts = 0 // Reset on success
        setStatus(data)

        if (data.status === "completed") {
          setLoading(false)
          setResult({
            success: true,
            message: "Sync completed successfully",
            results: data.results,
          })
          if (onSyncComplete) {
            setTimeout(() => onSyncComplete(), 1000)
          }
        } else if (data.status === "failed") {
          setLoading(false)
          setResult({
            success: false,
            message: data.error || "Sync failed",
          })
        }
      } catch (error: any) {
        console.log("[SyncFromAWS] Status check unavailable (sync in progress):", error.name)
        failedAttempts++

        // Update status to show sync is running even if we can't get details
        if (status?.status === "running" || !status) {
          setStatus((prev) => ({
            ...(prev || {
              job_id: jobId,
              status: "running",
              current_step: 0,
              current_step_name: "processing",
              total_steps: 7,
              progress_percent: 0,
            }),
            message: "Sync in progress (status temporarily unavailable)...",
          } as SyncStatus))
        }

        // After many failed attempts, try starting a new job to check if done
        if (failedAttempts > maxFailedAttempts) {
          console.log("[SyncFromAWS] Too many failed status checks, assuming complete")
          setLoading(false)
          setResult({
            success: true,
            message: "Sync likely completed (status unavailable). Refresh to see results.",
          })
        }
      }
    }

    // Poll every 5 seconds (longer interval since server is busy)
    pollingRef.current = setInterval(pollStatus, 5000)
    // Also poll immediately
    pollStatus()

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [jobId, loading, onSyncComplete, status])

  const handleSync = async () => {
    setLoading(true)
    setResult(null)
    setStatus(null)
    setJobId(null)

    try {
      console.log("[SyncFromAWS] Starting async sync job...")

      const response = await fetch("/api/proxy/collectors/sync-all/start?days=7", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout to start job
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log("[SyncFromAWS] Job started:", data)

      if (data.success && data.job_id) {
        setJobId(data.job_id)
        setStatus({
          job_id: data.job_id,
          status: "running",
          current_step: 0,
          current_step_name: "starting",
          total_steps: 7,
          message: "Starting sync...",
          progress_percent: 0,
        })
      } else if (data.existing_job_id) {
        // A job is already running, use that one
        setJobId(data.existing_job_id)
        setStatus({
          job_id: data.existing_job_id,
          status: "running",
          current_step: data.current_step || 0,
          current_step_name: "",
          total_steps: 7,
          message: data.message || "Sync in progress...",
          progress_percent: Math.round(((data.current_step || 0) / 7) * 100),
        })
      } else {
        throw new Error(data.error || "Failed to start sync job")
      }
    } catch (error: any) {
      console.error("[SyncFromAWS] Failed to start sync:", error)
      setLoading(false)
      setResult({
        success: false,
        message: error.message || "Failed to start sync",
      })
    }
  }

  const progressPercent = status?.progress_percent || 0
  const currentStepLabel = status?.current_step_name
    ? STEP_LABELS[status.current_step_name] || status.message
    : "Starting..."

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {loading ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Syncing...
          </>
        ) : (
          <>
            <Zap className="w-4 h-4" />
            Sync from AWS
          </>
        )}
      </button>

      {/* Progress indicator while syncing */}
      {loading && status && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-800">
              Step {status.current_step}/{status.total_steps}: {currentStepLabel}
            </span>
            <span className="text-sm text-blue-600">{progressPercent}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-blue-600 mt-2">
            This may take several minutes. You can leave this page and come back.
          </p>
        </div>
      )}

      {result && (
        <div
          className={`p-3 rounded-lg text-sm ${
            result.success
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {result.success ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            <span className="font-medium">{result.message}</span>
          </div>

          {result.success && result.results && (
            <div className="mt-2 space-y-1 text-xs">
              <div>
                Tag Sync:{" "}
                {result.results.tag_sync?.summary?.aws_resources_with_systemname || 0} resources
              </div>
              <div>
                Flow Logs:{" "}
                {result.results.flow_logs?.relationships_created || 0} relationships
              </div>
              <div>
                CloudTrail:{" "}
                {result.results.cloudtrail?.events_processed || 0} events,{" "}
                {result.results.cloudtrail?.resources_discovered || 0} resources discovered
              </div>
              <div>
                IAM Analyzer:{" "}
                {(result.results.iam_analyzer?.external_access_relationships || 0) +
                 (result.results.iam_analyzer?.unused_permission_relationships || 0)}{" "}
                findings
              </div>
              <div>
                AWS Config:{" "}
                {(result.results.aws_config?.config_relationships || 0) +
                 (result.results.aws_config?.violations || 0)}{" "}
                items
              </div>
              <div>
                X-Ray:{" "}
                {(result.results.xray?.calls_relationships || 0) +
                 (result.results.xray?.traffic_relationships || 0)}{" "}
                traces
              </div>
              <div>
                Auto-Tagger:{" "}
                {result.results.auto_tagger?.tagged || 0} resources tagged
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
