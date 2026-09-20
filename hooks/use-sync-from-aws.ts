"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import {
  DEFAULT_SYNC_TOTAL_STEPS,
  MAX_CONSECUTIVE_POLL_FAILURES,
  SyncJobGoneError,
  fetchSyncJobStatus,
  formatSyncSuccessMessage,
  formatUnprovenCompletionMessage,
  isActivated,
  isForRun,
  startSyncAllJob,
  toSyncProgress,
  type StartSyncOptions,
  type SyncJobStatus,
  type SyncProgress,
  type SyncCompletionPayload,
} from "@/lib/sync-from-aws"

interface UseSyncFromAWSOptions {
  /**
   * Called once a round completes. Receives the FULL backend status payload —
   * `results`, `sources`, `deferred_sources`, `completed_at` — so a screen can
   * decide whether ITS lane was actually refreshed. Previously this took no
   * argument, so consumers could only observe "the round succeeded" and
   * several stamped `new Date()` as an AWS freshness claim on data the round
   * never touched. Pass the receipt; let the screen read it.
   */
  onComplete?: (payload: SyncCompletionPayload) => void
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
  const pollFailuresRef = useRef(0)
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

      if (data.status === "completed" && !isActivated(data)) {
        // A completed JOB is not a completed REFRESH. The worker exited; that
        // says nothing about whether a validated generation is active for
        // this scope. Rendering it green is the fabricated success this lane
        // exists to remove.
        setSyncing(false)
        setJobId(null)
        stopPolling()
        handleTerminalMessage({
          type: "error",
          text: formatUnprovenCompletionMessage(data),
        })
      } else if (data.status === "completed") {
        setSyncing(false)
        setJobId(null)
        stopPolling()
        setResults(data.results ?? null)
        handleTerminalMessage({
          type: "success",
          text: formatSyncSuccessMessage(data),
        })
        // Merge the status envelope with its `results` body: lane membership
        // arrives on both depending on stage, and a screen must be able to see
        // either without knowing which.
        // `{...status, ...status.results}` is the shape SyncCompletionPayload
        // describes: lane membership arrives on the envelope or the body
        // depending on stage, and a screen must see either without knowing
        // which. Spread directly -- the double cast through Record was what
        // erased the producer type at this boundary.
        onCompleteRef.current?.({
          ...data,
          ...(data.results ?? {}),
        })
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

  /** Give up polling and surface why. Used for every non-recoverable end
   *  that is not a status the backend reported. */
  const abandonPolling = useCallback(
    (text: string) => {
      setSyncing(false)
      setJobId(null)
      stopPolling()
      handleTerminalMessage({ type: "error", text })
    },
    [handleTerminalMessage, stopPolling],
  )

  const pollOnce = useCallback(
    async (id: string) => {
      try {
        const data = await fetchSyncJobStatus(id)
        if (data) {
          // Bind to the run we asked about. A poll in flight across a restart,
          // or a job id reused by another surface, can otherwise deliver
          // someone else's terminal state into this run's UI -- including
          // someone else's activation, reported as ours.
          if (!isForRun(data, id)) {
            pollFailuresRef.current += 1
          } else {
            pollFailuresRef.current = 0
            handleStatus(data)
            return
          }
        }
        // Readable response, but not OK — backend busy, redeploying or down.
        pollFailuresRef.current += 1
      } catch (error) {
        if (error instanceof SyncJobGoneError) {
          // Terminal: no store holds this job any more. Polling forever
          // cannot resurrect it.
          abandonPolling(error.message)
          return
        }
        // Network error or timeout — may recover.
        pollFailuresRef.current += 1
      }

      if (pollFailuresRef.current >= MAX_CONSECUTIVE_POLL_FAILURES) {
        abandonPolling(
          `Lost contact with the backend while tracking sync ${id.slice(0, 8)} ` +
            `(${pollFailuresRef.current} consecutive failed status checks). ` +
            `The sync may still be running — reopen this page once the ` +
            `backend is reachable to see its real state.`,
        )
      }
    },
    [abandonPolling, handleStatus],
  )

  const startSync = useCallback(
    async (startOptions?: StartSyncOptions) => {
      setSyncing(true)
      setSyncMessage(null)
      setProgress(null)
      setResults(null)
      pollFailuresRef.current = 0
      stopPolling()

      try {
        const result = await startSyncAllJob(startOptions)
        const id = result.job_id
        if (!id) {
          throw new Error("Failed to start sync job")
        }

        setJobId(id)
        setProgress({
          stepName: "collection_queued",
          label: "Queued for the dedicated projector",
          // null, not 0. The request has been accepted and nothing has been
          // measured; a 0% is a claim that work has started and is 0% done.
          percent: null,
          message: result.message || "Queued for the dedicated projector",
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
