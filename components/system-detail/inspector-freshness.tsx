"use client"

import { useCallback, useState } from "react"

import type { SyncCompletionPayload } from "@/lib/sync-from-aws"
import { SYNC_SURFACES, surfaceRefreshedAt } from "@/lib/sync-surfaces"

/**
 * The system dashboard's Inspector freshness, extracted so it is REAL code
 * with one owner rather than wiring copied into a header.
 *
 * It exists because the previous version lived inline as
 * `onSyncComplete={() => { setLastSyncedAt(new Date().toISOString()); ... }}`
 * and was rendered as a generic "Last sync" for a page that also shows
 * inventory, behavioral, dependency, least-privilege and attack-path
 * evidence. A vulnerability-only round therefore stamped the browser clock
 * onto all of it — rule 1 of lib/sync-surfaces.ts, verbatim.
 *
 * There is no truthful aggregate contract for this dashboard: it aggregates
 * lanes of which only `vulnerability_findings` is CONNECTED. So nothing here
 * claims whole-system freshness. It names ONE lane and takes its stamp from
 * the backend receipt.
 */
export function useInspectorFreshness() {
  const [inspectorRefreshedAt, setInspectorRefreshedAt] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const onRefreshed = useCallback((payload: SyncCompletionPayload) => {
    // `surfaceRefreshedAt` returns a stamp only when the backend listed
    // vulnerability_findings in `refreshed_sources` AND sent a completion
    // time. Otherwise null, and nothing is claimed.
    const at = surfaceRefreshedAt(SYNC_SURFACES.cve, payload)
    setInspectorRefreshedAt(at)

    // `refreshKey` is the React key on ~15 dashboard tabs, so bumping it
    // remounts and refetches every lane. Gated on the SAME receipt, for the
    // reason RefreshEvidenceButton states: "Only tell the screen to refetch
    // when the backend's receipt covers EVERY lane this screen displays.
    // Firing on any completed round is how a one-lane Inspector refresh
    // became a whole-cloud freshness claim: the screen refetches, sees
    // unchanged data, and paints it as just-synced."
    //
    // A run this surface cannot prove refreshed anything must not churn the
    // whole dashboard. Residual, recorded rather than invented away: when the
    // receipt IS present this still remounts tabs that show other lanes.
    // Narrowing that needs a per-lane key, which is a separate change.
    if (at !== null) {
      setRefreshKey((k) => k + 1)
    }
  }, [])

  /**
   * Re-read what the graph already holds, without claiming anything was
   * collected. This is the header's plain "Refresh" control: it remounts the
   * tabs so they refetch, and deliberately does NOT touch
   * `inspectorRefreshedAt` -- re-reading is not refreshing, and a local
   * re-read must never move a freshness stamp.
   */
  const remountTabs = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return { inspectorRefreshedAt, refreshKey, onRefreshed, remountTabs }
}

/**
 * The freshness note the dashboard header renders.
 *
 * Names the evidence. A bare "Last sync" on this page is the claim that
 * cannot be true, and is what this replaced.
 */
export function InspectorFreshnessNote({ at }: { at: string | null }) {
  if (!at) return null
  return (
    <>
      {" • Inspector findings refreshed: "}
      {new Date(at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
    </>
  )
}
