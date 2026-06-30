"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import {
  DEFAULT_SYNC_TOTAL_STEPS,
  fetchSyncJobStatus,
  formatSyncSuccessMessage,
  startSyncAllJob,
  toSyncProgress,
  type StartSyncOptions,
  type SyncJobStatus,
  type SyncProgress,
} from "@/lib/sync-from-aws"

interface UseSyncFromAWSOptions {
  onComplete?: () => void
  pollIntervalMs?: number
  autoClearMessageMs?: number
}

export function useSyncFromAWS(options: UseSyncFromAWSOptions = {}) {
  const { onComplete, pollIntervalMs = 3000, autoClearMessageMs = 8000 } = options

  const [syncing, setSyncing] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  )
  const [results, setResults] = useState<Record<string, unknown> | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const handleTerminalMessage = useCallback(
    (message: { type: "success" | "error"; text: string }) => {
      setSyncMessage(message)
      if (autoClearMessageMs > 0) {
        setTimeout(() => setSyncMessage(null), autoClearMessageMs)
      }
    },
    [autoClearMessageMs],
  )

  const handleStatus = useCallback(
    (data: SyncJobStatus) => {
      setProgress(toSyncProgress(data))

      if (data.status === "completed") {
        setSyncing(false)
        setJobId(null)
        stopPolling()
        setResults(data.results ?? null)
        handleTerminalMessage({
          type: "success",
          text: formatSyncSuccessMessage(data.results),
        })
        onCompleteRef.current?.()
      } else if (data.status === "failed" || data.status === "stale") {
        setSyncing(false)
        setJobId(null)
        stopPolling()
        handleTerminalMessage({
          type: "error",
          text: data.error || (data.status === "stale" ? "Sync job became stale" : "Sync failed"),
        })
      }
    },
    [handleTerminalMessage, stopPolling],
  )

  const pollOnce = useCallback(
    async (id: string) => {
      try {
        const data = await fetchSyncJobStatus(id)
        if (data) {
          handleStatus(data)
        }
      } catch {
        // Server may be busy; keep polling.
      }
    },
    [handleStatus],
  )

  const startSync = useCallback(
    async (startOptions?: StartSyncOptions) => {
      setSyncing(true)
      setSyncMessage(null)
      setProgress(null)
      setResults(null)
      stopPolling()

      try {
        const result = await startSyncAllJob(startOptions)
        const id = result.job_id
        if (!id) {
          throw new Error("Failed to start sync job")
        }

        setJobId(id)
        setProgress({
          step: result.current_step || 0,
          total: result.total_steps || DEFAULT_SYNC_TOTAL_STEPS,
          stepName: "starting",
          label: "Starting...",
          percent: 0,
          message: result.message || "Starting sync...",
        })

        pollingRef.current = setInterval(() => {
          void pollOnce(id)
        }, pollIntervalMs)
        void pollOnce(id)
      } catch (error) {
        setSyncing(false)
        handleTerminalMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Sync failed",
        })
      }
    },
    [handleTerminalMessage, pollIntervalMs, pollOnce, stopPolling],
  )

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return {
    syncing,
    jobId,
    progress,
    syncMessage,
    results,
    startSync,
    setSyncMessage,
  }
}
