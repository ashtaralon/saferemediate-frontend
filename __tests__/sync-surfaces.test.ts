/**
 * A screen may only claim freshness the backend actually granted.
 *
 * Two bugs are pinned here, both of which shipped:
 *
 * 1. Identities called setLastSync(new Date()) — the BROWSER's clock — whenever
 *    a round completed, painting a green "Synced" for IAM evidence that an
 *    Inspector-only round never collected.
 * 2. The first fix then read `sources` as proof of refresh. `sources` is the
 *    QUEUED list; treating it as freshness moves the same lie from the clock
 *    into the payload.
 *
 * And a screen rarely depends on one lane: IAM needs configuration AND observed
 * use, so it is only as fresh as its least fresh lane.
 */
import { describe, expect, it } from "vitest"

import {
  SYNC_SURFACES,
  laneCapability,
  laneRefreshedAt,
  laneState,
  notRefreshedReason,
  surfaceCapability,
  surfaceRefreshedAt,
  surfacesWithUndispatchableLaneSets,
  unsupportedLanes,
} from "@/lib/sync-surfaces"
import { buildSyncAllStartUrl } from "@/lib/sync-from-aws"

// Exactly what GET /api/v2/sync/capabilities returns on this deployment.
const CAPS = {
  lanes: [
    { lane: "vulnerability_findings", state: "CONNECTED" },
    { lane: "inventory_reconcile", state: "NOT_CONNECTED", missing_env: ["CYNTRO_INVENTORY_QUEUE_URL"] },
    { lane: "api_activity", state: "NOT_CONNECTED", missing_env: ["CYNTRO_CLOUDTRAIL_QUEUE_URL"] },
    { lane: "network_flow", state: "NOT_CONNECTED", missing_env: ["CYNTRO_FLOWLOG_QUEUE_URL"] },
  ],
}

const START = {
  sources: ["vulnerability_findings"],
  deferred_sources: [
    { source: "inventory_reconcile", state: "NOT_CONNECTED" },
    { source: "api_activity", state: "NOT_CONNECTED" },
    { source: "network_flow", state: "NOT_CONNECTED" },
  ],
}

const DONE = {
  ...START,
  refreshed_sources: ["vulnerability_findings"],
  completed_at: "2026-08-24T12:05:00Z",
}

describe("`sources` is queued, not refreshed", () => {
  it("maps a queued lane to QUEUED, never REFRESHED", () => {
    expect(laneState("vulnerability_findings", START)).toBe("QUEUED")
  })

  it("grants no freshness for a merely queued lane", () => {
    expect(laneRefreshedAt("vulnerability_findings", START)).toBeNull()
  })

  it("marks refreshed only from refreshed_sources on a completed round", () => {
    expect(laneState("vulnerability_findings", DONE)).toBe("REFRESHED")
    expect(laneRefreshedAt("vulnerability_findings", DONE)).toBe("2026-08-24T12:05:00Z")
  })

  it("returns null when a lane refreshed but carries no receipt", () => {
    const noStamp = { refreshed_sources: ["vulnerability_findings"] }
    expect(laneRefreshedAt("vulnerability_findings", noStamp)).toBeNull()
  })
})

describe("a surface is as fresh as its least fresh required lane", () => {
  it("models IAM as configuration AND observed use", () => {
    expect(SYNC_SURFACES.iam.requiredLanes).toEqual(["inventory_reconcile", "api_activity"])
  })

  it("is not fresh when only some required lanes refreshed", () => {
    const partial = {
      refreshed_sources: ["inventory_reconcile"],
      completed_at: "2026-08-24T13:00:00Z",
    }
    expect(surfaceRefreshedAt(SYNC_SURFACES.iam, partial)).toBeNull()
  })

  it("is fresh only when every required lane refreshed", () => {
    const both = {
      refreshed_sources: ["inventory_reconcile", "api_activity"],
      completed_at: "2026-08-24T14:00:00Z",
    }
    expect(surfaceRefreshedAt(SYNC_SURFACES.iam, both)).toBe("2026-08-24T14:00:00Z")
  })

  it("gives IAM no freshness from an Inspector-only round", () => {
    // The original Identities bug, now unexpressible.
    expect(surfaceRefreshedAt(SYNC_SURFACES.iam, DONE)).toBeNull()
  })
})

describe("capability is known before the click", () => {
  it("reads per-lane capability from the backend map", () => {
    expect(laneCapability("vulnerability_findings", CAPS)).toBe("CONNECTED")
    expect(laneCapability("api_activity", CAPS)).toBe("NOT_CONNECTED")
  })

  it("marks a surface unsupported when ANY required lane is not connected", () => {
    expect(surfaceCapability(SYNC_SURFACES.cve, CAPS)).toBe("CONNECTED")
    expect(surfaceCapability(SYNC_SURFACES.iam, CAPS)).toBe("NOT_CONNECTED")
    expect(surfaceCapability(SYNC_SURFACES.behavioral, CAPS)).toBe("NOT_CONNECTED")
    expect(surfaceCapability(SYNC_SURFACES.dependencyMap, CAPS)).toBe("NOT_CONNECTED")
  })

  it("names which lanes are missing, not a bare unavailable", () => {
    expect(unsupportedLanes(SYNC_SURFACES.iam, CAPS)).toEqual([
      "inventory_reconcile",
      "api_activity",
    ])
  })

  it("is UNKNOWN before capabilities load, so nothing is assumed", () => {
    expect(surfaceCapability(SYNC_SURFACES.cve, null)).toBe("UNKNOWN")
  })

  it("explains itself when capability is UNKNOWN, because UNKNOWN disables", () => {
    // UNKNOWN used to return no reason, which was survivable only while
    // UNKNOWN left the button ENABLED. Now that it fails closed, a silent
    // greyed-out control would read as a broken screen.
    const reason = notRefreshedReason(SYNC_SURFACES.iam, null, DONE)
    expect(reason).not.toBeNull()
    expect(reason).toMatch(/cannot tell/i)
    expect(reason).toMatch(/disabled/i)
  })

  it("treats a capability the backend did not call CONNECTED as not connected", () => {
    // Fail closed on an unrecognised state too: a future backend word must not
    // fall through to enabled just because it is not the string NOT_CONNECTED.
    const odd = { lanes: [{ lane: "vulnerability_findings", state: "DEGRADED" }] }
    expect(laneCapability("vulnerability_findings", odd)).toBe("NOT_CONNECTED")
    expect(surfaceCapability(SYNC_SURFACES.cve, odd)).toBe("NOT_CONNECTED")
  })

  it("is NOT_CONNECTED for a lane that can be dispatched but not confirmed", () => {
    // The backend requires dispatch AND a completion receipt for CONNECTED.
    // Mirrors api/v2_sync.py::lane_capabilities on the wire this reads.
    const noReceipt = {
      lanes: [
        {
          lane: "inventory_reconcile",
          state: "NOT_CONNECTED",
          receipt: "none",
          blocked_by: ["no_completion_receipt"],
        },
      ],
    }
    expect(laneCapability("inventory_reconcile", noReceipt)).toBe("NOT_CONNECTED")
  })
})

describe("a surface asks for its own lanes", () => {
  it("declares lane sets the backend can dispatch in one round", () => {
    // The backend refuses to mix vulnerability_findings with generic
    // collection work (mixed_sync_round_not_supported, 400). A surface that
    // declared both would render an enabled button that fails on every click.
    expect(surfacesWithUndispatchableLaneSets()).toEqual([])
  })

  it("builds a start URL carrying this surface's lanes", () => {
    // A bare start URL is not "refresh everything" — the backend defaults to
    // the Inspector lane, so a dropped selection silently downgrades the round.
    expect(buildSyncAllStartUrl({ sources: SYNC_SURFACES.iam.requiredLanes })).toBe(
      "/api/proxy/sync/start?sources=inventory_reconcile%2Capi_activity",
    )
    expect(buildSyncAllStartUrl({ sources: SYNC_SURFACES.cve.requiredLanes })).toBe(
      "/api/proxy/sync/start?sources=vulnerability_findings",
    )
  })

  it("still refuses to revive legacy sync-all options", () => {
    expect(buildSyncAllStartUrl({ days: 90, skipFlowLogs: true })).toBe(
      "/api/proxy/sync/start",
    )
  })
})

describe("labels", () => {
  it("never claims to sync the whole cloud", () => {
    for (const surface of Object.values(SYNC_SURFACES)) {
      expect(surface.action).not.toMatch(/sync from aws/i)
      expect(surface.action).toMatch(/^Refresh /)
      expect(surface.requiredLanes.length).toBeGreaterThan(0)
    }
  })

  it("explains an unsupported surface up front", () => {
    expect(notRefreshedReason(SYNC_SURFACES.iam, CAPS, DONE)).toContain("not connected")
  })
})
