import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()
const CACHE_KEY = "recent-activity"

/**
 * GET /api/proxy/recent-activity
 *
 * Merges three time-sorted sources into a single activity feed:
 *   1. /api/remediation-history/timeline — real RemediationEvent nodes
 *      (e.g. "Removed 7 unused permissions from cyntro-demo-ec2-s3-role")
 *   2. /api/snapshots                    — snapshot creation events
 *   3. /api/automation-rules/rollback/history — rollback history
 *
 * Originally only had #2 and #3. Added #1 (2026-04-30) because the
 * RemediationEvent nodes we write on every apply/rollback weren't
 * being surfaced — the card showed empty even after remediation
 * activity. Snapshot events alone don't tell the operator "what was
 * just applied"; they only tell them "we captured pre-state."
 *
 * Honest framing:
 *   - Each source is fetched independently; one failing doesn't kill
 *     the others. errors[] surfaces what didn't load.
 *   - All items time-sorted desc, top 20 returned.
 */

type ActivityItem = {
  kind: "remediation" | "snapshot" | "rollback"
  timestamp: string | null
  resource_type?: string
  resource_id?: string
  system?: string
  detail?: string
  action_type?: string
  status?: string
  permissions_removed?: number
}

// Per-fetch timeout. Render cold-start can be 30s+; most calls are
// <1s. We give each fetch 20s — enough to clear cold-start, short
// enough that one stuck endpoint doesn't burn the Vercel function's
// total time budget (default 10s on hobby, 60s on pro).
const PER_FETCH_TIMEOUT_MS = 20_000

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PER_FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(_req: NextRequest) {
  const cached = getCached(CACHE_KEY)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }
  const items: ActivityItem[] = []
  const errors: string[] = []

  // Fan all three fetches out in parallel. Earlier version ran them
  // sequentially, which meant the slowest single endpoint ate the
  // Vercel function's time budget and left the later fetches to be
  // killed mid-flight — surfacing as 502s for each. With Promise.
  // allSettled, each call has its own time budget independently.
  const [remediationRes, snapshotsRes, rollbacksRes] = await Promise.allSettled([
    fetchWithTimeout(`${BACKEND_URL}/api/remediation-history/timeline?limit=20`),
    fetchWithTimeout(`${BACKEND_URL}/api/snapshots`),
    fetchWithTimeout(`${BACKEND_URL}/api/automation-rules/rollback/history`),
  ])

  // Remediation events — most useful + operator-relevant. RemediationEvent
  // nodes carry per-action safety_signals (commit 9cb9104) so this feed
  // is the source of truth for "what just happened on this account".
  if (remediationRes.status === "fulfilled" && remediationRes.value.ok) {
    try {
      const data = await remediationRes.value.json()
      const events = Array.isArray(data?.events) ? data.events : []
      for (const ev of events) {
        items.push({
          kind: "remediation",
          timestamp: ev.timestamp ?? null,
          resource_type: ev.resource_type,
          resource_id: ev.resource_id,
          action_type: ev.action_type,
          status: ev.status,
          detail: ev.summary,
          permissions_removed:
            ev.metadata?.permissions_removed ??
            ev.metadata?.removed_permissions?.length ??
            undefined,
        })
      }
    } catch (e) {
      errors.push(`remediation-events parse: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else if (remediationRes.status === "fulfilled") {
    errors.push(`remediation-events: backend ${remediationRes.value.status}`)
  } else {
    errors.push(`remediation-events: ${String(remediationRes.reason)}`)
  }

  // Snapshots
  if (snapshotsRes.status === "fulfilled" && snapshotsRes.value.ok) {
    try {
      const data = await snapshotsRes.value.json()
      const snapshots = Array.isArray(data?.snapshots) ? data.snapshots : []
      for (const s of snapshots) {
        items.push({
          kind: "snapshot",
          timestamp: s.created_at ?? null,
          resource_type: s.resource_type,
          resource_id: s.resource_id ?? s.original_role,
          detail: s.snapshot_type,
        })
      }
    } catch (e) {
      errors.push(`snapshots parse: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else if (snapshotsRes.status === "fulfilled") {
    errors.push(`snapshots: backend ${snapshotsRes.value.status}`)
  } else {
    errors.push(`snapshots: ${String(snapshotsRes.reason)}`)
  }

  // Rollback history
  if (rollbacksRes.status === "fulfilled" && rollbacksRes.value.ok) {
    try {
      const data = await rollbacksRes.value.json()
      const rollbacks = Array.isArray(data?.rollbacks) ? data.rollbacks : []
      for (const rb of rollbacks) {
        items.push({
          kind: "rollback",
          timestamp: rb.timestamp ?? rb.rolled_back_at ?? null,
          resource_type: rb.resource_type,
          resource_id: rb.resource_id,
          detail: rb.reason ?? rb.rule_name,
        })
      }
    } catch (e) {
      errors.push(`rollbacks parse: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else if (rollbacksRes.status === "fulfilled") {
    errors.push(`rollbacks: backend ${rollbacksRes.value.status}`)
  } else {
    errors.push(`rollbacks: ${String(rollbacksRes.reason)}`)
  }

  // Sort by timestamp desc; null timestamps go last.
  items.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0
    if (!a.timestamp) return 1
    if (!b.timestamp) return -1
    return b.timestamp.localeCompare(a.timestamp)
  })

  const payload = {
    items: items.slice(0, 20),
    total: items.length,
    errors,
  }
  setCached(CACHE_KEY, payload, TTL_STD)
  return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } })
}
