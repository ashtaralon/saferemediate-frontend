import { describe, expect, it } from "vitest"

import {
  REFRESH_STATE_MESSAGE,
  REFRESH_STATE_VALUES,
  STALE_REASON_VALUES,
  isRefreshState,
  refreshIsStalled,
} from "@/lib/types/snapshot"
import {
  formatLastSuccessfulUpdate,
  staleNote,
} from "@/components/topology-v0-2/headline-strip"

/**
 * The stale banner must say what actually happened to the refresh.
 *
 * It used to print " · backend timeout — serving stale" for EVERY stale serve.
 * Four different producers set `fromStaleCache` — the backend's
 * stale-while-revalidate path, its flap-exhausted fallback, its cap-denied
 * path, and the Next proxy's own serveStale() for timeout / fetch_failed /
 * backend_<status> / peer_computing — and the component collapsed all of them
 * into one sentence naming a timeout. Only one of them is a timeout.
 *
 * The case that matters most on C1: the backend could not enqueue a refresh at
 * all, so nothing is coming. The old UI said "backend timeout", the old API
 * said "snapshot_recomputing", and the map sat 22 hours stale while both
 * implied a rebuild was moments away.
 */

describe("refresh status is reported honestly", () => {
  it("names a refused refresh as stalled, not as a timeout", () => {
    const note = staleNote("unavailable", "refresh_unavailable")
    expect(note).toBe(REFRESH_STATE_MESSAGE.unavailable)
    expect(note).not.toContain("timeout")
    expect(note).toMatch(/not running|could not be started/i)
  })

  it("distinguishes queued from in-progress", () => {
    expect(staleNote("queued", "refresh_queued")).not.toBe(
      staleNote("duplicate", "snapshot_recomputing"),
    )
    expect(staleNote("queued", "refresh_queued")).toMatch(/not started/i)
    expect(staleNote("duplicate", "snapshot_recomputing")).toMatch(
      /in progress/i,
    )
  })

  it("says unknown rather than promising a rebuild", () => {
    const note = staleNote("unknown", "refresh_unknown")
    expect(note).toBe(REFRESH_STATE_MESSAGE.unknown)
    expect(note).not.toMatch(/in progress|queued/i)
  })

  it("falls back to the staleReason when refresh_state is absent", () => {
    // An older backend sends staleReason but not refresh_state.
    expect(staleNote(null, "refresh_unavailable")).toBe(
      REFRESH_STATE_MESSAGE.unavailable,
    )
    expect(staleNote(undefined, "post_sync_invalidation")).toMatch(
      /sync invalidated/i,
    )
  })

  it("renders nothing when the payload makes no claim", () => {
    // No mock reassurance: absent means absent.
    expect(staleNote(null, null)).toBeNull()
    expect(staleNote(undefined, undefined)).toBeNull()
  })

  it("never prints the old hardcoded timeout sentence for any state", () => {
    for (const state of REFRESH_STATE_VALUES) {
      expect(staleNote(state, null)).not.toContain("backend timeout")
    }
    for (const reason of STALE_REASON_VALUES) {
      expect(staleNote(null, reason)).not.toContain("backend timeout")
    }
  })

  it("has a message for every refresh state in the closed set", () => {
    for (const state of REFRESH_STATE_VALUES) {
      expect(REFRESH_STATE_MESSAGE[state]).toBeTruthy()
      expect(isRefreshState(state)).toBe(true)
    }
  })

  it("treats only unavailable and not_requested as stalled", () => {
    expect(refreshIsStalled("unavailable")).toBe(true)
    expect(refreshIsStalled("not_requested")).toBe(true)
    expect(refreshIsStalled("queued")).toBe(false)
    expect(refreshIsStalled("duplicate")).toBe(false)
    expect(refreshIsStalled(null)).toBe(false)
  })

  it("rejects a state that is not in the closed set", () => {
    expect(isRefreshState("running")).toBe(false)
    expect(isRefreshState("")).toBe(false)
  })
})

describe("last successful update is shown separately from age", () => {
  it("formats a real timestamp", () => {
    const out = formatLastSuccessfulUpdate("2026-09-12T09:15:00Z")
    expect(out).toMatch(/^Last updated /)
  })

  it("returns null rather than inventing a time", () => {
    expect(formatLastSuccessfulUpdate(null)).toBeNull()
    expect(formatLastSuccessfulUpdate(undefined)).toBeNull()
    expect(formatLastSuccessfulUpdate("not-a-date")).toBeNull()
  })
})
