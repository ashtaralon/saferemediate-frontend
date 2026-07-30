/**
 * Verb chip must not cover a prose block sharing its lane.
 *
 * Regression: the "No Network Controls" banner rendered as
 *   "Network defenses do [accesses · Configured] IAM role on the right grants…"
 * because the chip is opaque by design (it has to mask lane-card text) and was
 * positioned at the raw edge midpoint with no collision awareness.
 */
import { describe, expect, it } from "vitest"
import {
  resolveVerbChipY,
  type LabelExclusion,
} from "@/lib/attack-paths/verb-chip-placement"

/** A banner occupying the middle of the lane, container-relative px. */
const BANNER: LabelExclusion = { left: 200, right: 600, top: 100, bottom: 280 }

const MID_X = 400 // horizontally inside the banner
const LABEL_W = 120

describe("resolveVerbChipY", () => {
  it("leaves the anchor alone when there is nothing to avoid", () => {
    expect(resolveVerbChipY(MID_X, 190, LABEL_W, null)).toBe(190)
    expect(resolveVerbChipY(MID_X, 190, LABEL_W, undefined)).toBe(190)
  })

  it("moves the chip out when it lands inside the prose block", () => {
    const y = resolveVerbChipY(MID_X, 190, LABEL_W, BANNER)
    expect(y).not.toBe(190)
    // Must end up fully outside the banner band, not merely shifted.
    expect(y + 6 <= BANNER.top || y - 8 >= BANNER.bottom).toBe(true)
  })

  it("exits via the top when the anchor sits in the upper half", () => {
    // 140 is 40px below top, 140px above bottom → up is the shorter move.
    expect(resolveVerbChipY(MID_X, 140, LABEL_W, BANNER)).toBe(BANNER.top - 10)
  })

  it("exits via the bottom when the anchor sits in the lower half", () => {
    expect(resolveVerbChipY(MID_X, 260, LABEL_W, BANNER)).toBe(
      BANNER.bottom + 16,
    )
  })

  // ── cases where it must NOT move: a chip that drifts off its own edge for
  // no reason is its own readability bug ────────────────────────────────────

  it("does not move a chip that is clear above the block", () => {
    expect(resolveVerbChipY(MID_X, 50, LABEL_W, BANNER)).toBe(50)
  })

  it("does not move a chip that is clear below the block", () => {
    expect(resolveVerbChipY(MID_X, 400, LABEL_W, BANNER)).toBe(400)
  })

  it("does not move a chip whose x is entirely left of the block", () => {
    // Chip spans 20..140; banner starts at 200.
    expect(resolveVerbChipY(80, 190, LABEL_W, BANNER)).toBe(190)
  })

  it("does not move a chip whose x is entirely right of the block", () => {
    expect(resolveVerbChipY(700, 190, LABEL_W, BANNER)).toBe(190)
  })

  it("accounts for chip WIDTH, not just its centre", () => {
    // Centre at 150 is left of the banner, but a 120px-wide chip reaches
    // x=210 and does overlap. Testing the centre alone would miss this.
    const y = resolveVerbChipY(150, 190, LABEL_W, BANNER)
    expect(y).not.toBe(190)
  })

  it("accounts for chip HEIGHT at the block's edges", () => {
    // Anchor 4px above the top: the chip's lower edge (+6) still intrudes.
    const y = resolveVerbChipY(MID_X, BANNER.top - 4, LABEL_W, BANNER)
    expect(y).toBe(BANNER.top - 10)
  })

  it("is idempotent — re-resolving a moved chip does not move it again", () => {
    const once = resolveVerbChipY(MID_X, 140, LABEL_W, BANNER)
    expect(resolveVerbChipY(MID_X, once, LABEL_W, BANNER)).toBe(once)
  })

  it("handles a degenerate zero-area exclusion without moving anything", () => {
    const empty: LabelExclusion = { left: 0, right: 0, top: 0, bottom: 0 }
    expect(resolveVerbChipY(MID_X, 190, LABEL_W, empty)).toBe(190)
  })
})
