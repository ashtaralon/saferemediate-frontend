"use client"

import { useEffect, useState } from "react"
import { fetchCheckpointStates, type CheckpointStatesResult } from "@/lib/checkpoint-states"

/** The snapshot id whose saved states may be read, or null: only a ledger-recorded change has them. */
export function inspectableCheckpoint(remediationSource?: string | null, snapshotId?: string | null): string | null {
  return remediationSource === "operation_ledger" && snapshotId ? snapshotId : null
}

/**
 * The saved checkpoint states for one snapshot, read once per id. Null while
 * reading or when there is nothing to read; an answer that arrives for an
 * earlier id is never returned for the current one.
 */
export function useSavedCheckpointStates(snapshotId: string | null): CheckpointStatesResult | null {
  const [answer, setAnswer] = useState<{ snapshotId: string; result: CheckpointStatesResult } | null>(null)

  useEffect(() => {
    if (!snapshotId) return
    let current = true
    fetchCheckpointStates(snapshotId).then(result => {
      if (current) setAnswer({ snapshotId, result })
    })
    return () => {
      current = false
    }
  }, [snapshotId])

  return answer && answer.snapshotId === snapshotId ? answer.result : null
}
