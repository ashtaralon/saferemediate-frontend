"use client"

import { useState } from "react"
import { Zap, RefreshCw, CheckCircle, XCircle } from "lucide-react"

interface SyncFromAWSButtonProps {
  onSyncComplete?: () => void
  className?: string
}

export function SyncFromAWSButton({ onSyncComplete, className = "" }: SyncFromAWSButtonProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    message?: string
    results?: any
  } | null>(null)

  const handleSync = async () => {
    setLoading(true)
    setResult(null)

    try {
      console.log("[SyncFromAWS] Starting complete sync...")

      const response = await fetch("/api/proxy/collectors/sync-all?days=7", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(120000), // 2 minute timeout
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log("[SyncFromAWS] Sync complete:", data)

      setResult({
        success: true,
        message: "Sync completed successfully",
        results: data.results,
      })

      // Callback to refresh UI
      if (onSyncComplete) {
        setTimeout(() => {
          onSyncComplete()
        }, 1000)
      }
    } catch (error: any) {
      console.error("[SyncFromAWS] Sync failed:", error)
      setResult({
        success: false,
        message: error.message || "Sync failed",
      })
    } finally {
      setLoading(false)
    }
  }

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
                {result.results.cloudtrail?.s3_buckets_discovered || 0} S3 buckets discovered
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

