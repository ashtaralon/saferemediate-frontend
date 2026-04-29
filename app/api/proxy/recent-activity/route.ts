import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl()

/**
 * GET /api/proxy/recent-activity
 *
 * Merges /api/snapshots + /api/automation-rules/rollback/history into a
 * single time-sorted activity feed. Both already exist on the backend
 * with real data.
 *
 * Honest framing:
 *   - Snapshot = a remediation event (resource + before/after timestamp)
 *   - Rollback = an undo event (we reverted a previous change)
 *   - If one source fails, we still return the other; failure is
 *     tracked in errors[].
 */

type ActivityItem = {
  kind: "snapshot" | "rollback"
  timestamp: string | null
  resource_type?: string
  resource_id?: string
  system?: string
  detail?: string
}

export async function GET(_req: NextRequest) {
  const items: ActivityItem[] = []
  const errors: string[] = []

  // Snapshots
  try {
    const r = await fetch(`${BACKEND_URL}/api/snapshots`, { cache: "no-store" })
    if (r.ok) {
      const data = await r.json()
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
    } else {
      errors.push(`snapshots: backend ${r.status}`)
    }
  } catch (e) {
    errors.push(`snapshots: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Rollback history
  try {
    const r = await fetch(`${BACKEND_URL}/api/automation-rules/rollback/history`, {
      cache: "no-store",
    })
    if (r.ok) {
      const data = await r.json()
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
    } else {
      errors.push(`rollbacks: backend ${r.status}`)
    }
  } catch (e) {
    errors.push(`rollbacks: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Sort by timestamp desc; null timestamps go last.
  items.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0
    if (!a.timestamp) return 1
    if (!b.timestamp) return -1
    return b.timestamp.localeCompare(a.timestamp)
  })

  return NextResponse.json({
    items: items.slice(0, 20),
    total: items.length,
    errors,
  })
}
