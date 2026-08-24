"use client"

import { Zap, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react"
import { useSyncFromAWS } from "@/hooks/use-sync-from-aws"

interface SyncFromAWSButtonProps {
  onSyncComplete?: () => void
  className?: string
}

export function SyncFromAWSButton({ onSyncComplete, className = "" }: SyncFromAWSButtonProps) {
  const { syncing, progress, syncMessage, results, startSync } = useSyncFromAWS({
    onComplete: onSyncComplete,
    pollIntervalMs: 5000,
    autoClearMessageMs: 0,
  })

  const progressPercent = progress?.percent || 0
  const currentStepLabel = progress?.label || "Starting..."
  const showResult = syncMessage && !syncing
  const vulnerability = results?.vulnerability_findings as Record<string, unknown> | undefined
  const deferredSources = Array.isArray(results?.deferred_sources)
    ? (results.deferred_sources as Array<{ source?: string; label?: string }>)
    : []
  const completedWithGaps = syncMessage?.type === "success" && deferredSources.length > 0

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        onClick={() => void startSync()}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {syncing ? (
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

      {syncing && progress && (
        <div className="p-3 rounded-lg bg-[#3b82f610] border border-[#3b82f640]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#3b82f6]">
              Step {progress.step}/{progress.total}: {currentStepLabel}
            </span>
            <span className="text-sm text-[#3b82f6]">{progressPercent}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-[#3b82f6] mt-2">
            The web tier only queues the request. Collection and graph writes run in the dedicated
            Neptune projector.
          </p>
        </div>
      )}

      {showResult && (
        <div
          className={`p-3 rounded-lg text-sm ${
            completedWithGaps
              ? "bg-[#f59e0b10] text-[#b45309] border border-[#f59e0b40]"
              : syncMessage.type === "success"
              ? "bg-[#22c55e10] text-[#22c55e] border border-[#22c55e40]"
              : "bg-[#ef444410] text-[#ef4444] border border-[#ef444440]"
          }`}
        >
          <div className="flex items-center gap-2">
            {completedWithGaps ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : syncMessage.type === "success" ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            <span className="font-medium">{syncMessage.text}</span>
          </div>

          {syncMessage.type === "success" && results && (
            <div className="mt-2 space-y-1 text-xs">
              {vulnerability && (
                <div>
                  Activated in Neptune: {Number(vulnerability.active_findings || 0)} active findings,
                  {" "}{Number(vulnerability.active_coverage || 0)} covered resources.
                </div>
              )}
              {deferredSources.length > 0 && (
                <div>
                  Not refreshed by this run: {deferredSources.map((source) => source.label || source.source).join(", ")}.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
