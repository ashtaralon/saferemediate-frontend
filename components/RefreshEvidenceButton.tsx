"use client"

import { AlertTriangle, Check, RefreshCw } from "lucide-react"
import { useState } from "react"

import { useSyncCapabilities } from "@/hooks/use-sync-capabilities"
import { useSyncFromAWS } from "@/hooks/use-sync-from-aws"
import {
  SYNC_SURFACES,
  type SyncSurfaceKey,
  notRefreshedReason,
  surfaceCapability,
  surfaceRefreshedAt,
  unsupportedLanes,
} from "@/lib/sync-surfaces"

interface RefreshEvidenceButtonProps {
  /** Which screen this is. Decides the label, the lanes and the enabled state. */
  surface: SyncSurfaceKey
  /** Called after a round completes, so the screen can refetch. */
  onRefreshed?: (payload: Record<string, unknown>) => void
  className?: string
}

/**
 * One refresh control for every screen, wired to what the backend can actually do.
 *
 * Replaces seven hand-rolled "Sync from AWS" buttons that all triggered the same
 * Inspector-only round and then reported success as if their own data had been
 * refreshed. Three properties make that impossible here:
 *
 * - The label names THIS screen's evidence, never the whole cloud.
 * - The control is DISABLED when any required lane is not connected, and says
 *   so up front — rather than launching a real collection round, waiting, and
 *   only then admitting the lane was never refreshed.
 * - The timestamp comes from a backend activation receipt covering every
 *   required lane, or it is not shown. The browser clock is never used.
 */
export function RefreshEvidenceButton({
  surface,
  onRefreshed,
  className = "",
}: RefreshEvidenceButtonProps) {
  const contract = SYNC_SURFACES[surface]
  const { capabilities, loadingCapabilities } = useSyncCapabilities()
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)
  const [lastPayload, setLastPayload] = useState<Record<string, unknown> | null>(null)

  const { syncing, startSync } = useSyncFromAWS({
    onComplete: (payload: Record<string, unknown>) => {
      setLastPayload(payload)
      setRefreshedAt(surfaceRefreshedAt(contract, payload))
      onRefreshed?.(payload)
    },
  })

  const capability = surfaceCapability(contract, capabilities)
  const unsupported = unsupportedLanes(contract, capabilities)
  const blocked = capability === "NOT_CONNECTED"
  const reason = notRefreshedReason(contract, capabilities, lastPayload)

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <button
        onClick={() => void startSync()}
        // Disabled while a round runs, and whenever this deployment cannot
        // refresh a lane this screen needs. The second half is the point:
        // an unsupported action must not spend a collection job to say "no".
        disabled={syncing || blocked || loadingCapabilities}
        title={blocked ? reason ?? undefined : undefined}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#3b82f6] text-white transition-colors hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {blocked ? (
          <>
            <AlertTriangle className="w-4 h-4" />
            Not connected
          </>
        ) : syncing ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Refreshing...
          </>
        ) : refreshedAt ? (
          <>
            <Check className="w-4 h-4" />
            {contract.action}
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4" />
            {contract.action}
          </>
        )}
      </button>

      {refreshedAt && (
        <span className="text-xs opacity-70">
          {contract.evidence} refreshed {new Date(refreshedAt).toLocaleString()}
        </span>
      )}

      {reason && (
        <span className="text-xs text-[#f59e0b]">
          {reason}
          {unsupported.length > 0 && ` (${unsupported.join(", ")})`}
        </span>
      )}
    </div>
  )
}
