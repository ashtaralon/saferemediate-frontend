import { describe, expect, it } from "vitest"

import {
  REFRESH_STATE_MESSAGE,
  REFRESH_STATE_VALUES,
  STALE_REASON_VALUES,
  isRefreshState,
  refreshIsStalled,
  refreshWasSubmitted,
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
    expect(note).toMatch(/could not be submitted/i)
  })

  it("does not claim an operator is the only way back", () => {
    // An enqueue failure proves THIS submission failed. It cannot prove no
    // scheduled or previously started job exists, so the copy must not send
    // the reader looking for a human.
    const note = staleNote("unavailable", "refresh_unavailable") ?? ""
    expect(note).not.toMatch(/operator|manual|until someone/i)
  })

  it("does not claim a worker is running just because a request exists", () => {
    // A dedupe key outlives a worker that died: a stalled job and a live one
    // look identical from here.
    const note = staleNote("duplicate", "refresh_requested") ?? ""
    expect(note).toMatch(/not confirmed/i)
    expect(note).not.toMatch(/in progress|is running/i)
  })

  it("distinguishes queued from in-progress", () => {
    expect(staleNote("queued", "refresh_queued")).not.toBe(
      staleNote("duplicate", "refresh_requested"),
    )
    expect(staleNote("queued", "refresh_queued")).toMatch(/submitted/i)
    expect(staleNote("duplicate", "refresh_requested")).toMatch(
      /previously requested/i,
    )
  })

  it("does not claim a queued refresh has NOT started either", () => {
    // Symmetry with the duplicate case: the serving process sees no worker,
    // so neither "is running" nor "has not started" is supportable.
    const note = staleNote("queued", "refresh_queued") ?? ""
    expect(note).toMatch(/not confirmed/i)
    expect(note).not.toMatch(/not started/i)
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

  it("treats only queued as a submission this request made", () => {
    expect(refreshWasSubmitted("queued")).toBe(true)
    for (const s of ["duplicate", "unavailable", "cached", "unknown"] as const) {
      expect(refreshWasSubmitted(s)).toBe(false)
    }
  })

  it("has a distinct message for the cached-within-TTL serve", () => {
    // "fresh" over a 29-minute-old body was the UI half of the age defect.
    expect(REFRESH_STATE_MESSAGE.cached).not.toBe(REFRESH_STATE_MESSAGE.fresh)
    expect(REFRESH_STATE_MESSAGE.cached).toMatch(/cache/i)
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
