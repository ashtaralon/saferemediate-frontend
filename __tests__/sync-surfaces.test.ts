/**
 * A screen may only claim freshness the backend actually granted.
 *
 * Observed 2026-08-24: "Sync from AWS" on seven surfaces ran one Inspector-only
 * operation; Identities then painted a green "Synced" stamped with
 * `new Date()` — the browser's clock — for data AWS never re-read. These pin
 * the two rules that prevent it: a lane is REFRESHED only if the backend said
 * so, and a timestamp comes only from a backend receipt.
 */
import { describe, expect, it } from "vitest"

import {
  SYNC_SURFACES,
  laneRefreshedAt,
  laneState,
  notRefreshedReason,
} from "@/lib/sync-surfaces"

// Exactly what POST /api/v2/sync/start returns on this tenant today.
const START = {
  sources: ["vulnerability_findings"],
  deferred_sources: [
    { source: "inventory_reconcile", label: "AWS inventory", state: "NOT_CONNECTED" },
    { source: "api_activity", label: "CloudTrail API activity", state: "NOT_CONNECTED" },
    { source: "network_flow", label: "VPC network flow", state: "NOT_CONNECTED" },
  ],
}

const COMPLETED = {
  ...START,
  refreshed_sources: ["vulnerability_findings"],
  completed_at: "2026-08-24T12:05:00Z",
}

describe("laneState", () => {
  it("marks the Inspector lane refreshed", () => {
    expect(laneState("vulnerability_findings", COMPLETED)).toBe("REFRESHED")
  })

  it.each(["inventory_reconcile", "api_activity", "network_flow"] as const)(
    "does not claim %s was refreshed",
    (lane) => {
      expect(laneState(lane, COMPLETED)).toBe("NOT_CONNECTED")
    },
  )

  it("is UNKNOWN before any round, never REFRESHED", () => {
    expect(laneState("inventory_reconcile", null)).toBe("UNKNOWN")
    expect(laneState("vulnerability_findings", {})).toBe("UNKNOWN")
  })

  it("treats a lane the backend never mentioned as UNKNOWN", () => {
    expect(laneState("network_flow", { sources: ["vulnerability_findings"] })).toBe("UNKNOWN")
  })
})

describe("laneRefreshedAt — the false-freshness guard", () => {
  it("returns the backend receipt for a refreshed lane", () => {
    expect(laneRefreshedAt("vulnerability_findings", COMPLETED)).toBe("2026-08-24T12:05:00Z")
  })

  it("returns null for a lane that was NOT refreshed, even on a successful round", () => {
    // This is the Identities bug: the round succeeded, so the screen stamped
    // the clock. Success of the ROUND is not freshness of THIS lane.
    expect(laneRefreshedAt("inventory_reconcile", COMPLETED)).toBeNull()
  })

  it("returns null when the lane refreshed but the backend gave no stamp", () => {
    // Never substitute a local clock for a missing receipt.
    expect(laneRefreshedAt("vulnerability_findings", START)).toBeNull()
  })
})

describe("surface contract", () => {
  it("never labels a button with a whole-cloud claim", () => {
    for (const surface of Object.values(SYNC_SURFACES)) {
      expect(surface.action).not.toMatch(/sync from aws/i)
      expect(surface.action).toMatch(/^Refresh /)
    }
  })

  it("binds every surface to a real backend lane", () => {
    const lanes = new Set([
      "vulnerability_findings",
      "inventory_reconcile",
      "api_activity",
      "network_flow",
    ])
    for (const surface of Object.values(SYNC_SURFACES)) {
      expect(lanes.has(surface.lane)).toBe(true)
    }
  })

  it("explains a not-connected lane instead of failing silently", () => {
    const reason = notRefreshedReason(SYNC_SURFACES.inventory, "NOT_CONNECTED")
    expect(reason).toContain("not connected")
    expect(notRefreshedReason(SYNC_SURFACES.cve, "REFRESHED")).toBeNull()
  })
})
