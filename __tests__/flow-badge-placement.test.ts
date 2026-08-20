/**
 * Flow-badge collision solver — pins the Platform-map overlap fix.
 *
 * The pre-fix FlowOverlay Pass 4 nudged badges vertically only, so inside the
 * regional KMS rail (13 stacked cards, ~10px gaps — no clear y within ±160px)
 * the TRIGGERS / ENCRYPTED_BY chips stayed painted over the cards, and two
 * same-label sibling chips 14px apart overlapped (16px-tall boxes, 13px
 * minimum spacing). Both reproduced against the old algorithm before this fix.
 */
import { describe, expect, it } from "vitest"

import {
  badgeHalfWidth,
  formatDupBadgeLabel,
  resolveFlowBadgePlacements,
  type ObstacleRect,
} from "@/components/topology-v0-2/flow-badge-placement"

const HH = 8 // badge half-height, mirrors the module constant

function overlapsRect(x: number, y: number, hw: number, o: ObstacleRect): boolean {
  return x + hw > o.l && x - hw < o.r && y + HH > o.t && y - HH < o.b
}

/** 13 stacked regional-rail cards, 44px tall with 10px gaps. */
function kmsRailCards(): ObstacleRect[] {
  const cards: ObstacleRect[] = []
  for (let i = 0; i < 13; i++) {
    const t = 480 + i * 54
    cards.push({ l: 1700, t, r: 1850, b: t + 44 })
  }
  return cards
}

describe("resolveFlowBadgePlacements", () => {
  it("moves a badge off a dense card column (regional KMS rail pile)", () => {
    const cards = kmsRailCards()
    const anchor = { x: 1775, y: 480 + 6 * 54 + 22 } // centered on card #6
    const [p] = resolveFlowBadgePlacements(
      [{ label: "TRIGGERS", x: anchor.x, y: anchor.y, candidates: [{ x: 1400, y: anchor.y }] }],
      cards,
      { w: 1900, h: 1400 },
    )
    expect(p.suppressed).toBe(false)
    const hw = badgeHalfWidth("TRIGGERS")
    expect(cards.some(c => overlapsRect(p.x, p.y, hw, c))).toBe(false)
  })

  it("collapses same-label sibling chips anchored together into one ×N chip", () => {
    const res = resolveFlowBadgePlacements(
      [
        { label: "KMS", x: 1093, y: 806 },
        { label: "KMS", x: 1093, y: 820 },
      ],
      [],
      { w: 1900, h: 1400 },
    )
    expect(res[1].suppressed).toBe(true)
    expect(res[0].dupCount).toBe(2)
    expect(formatDupBadgeLabel("KMS", 2)).toBe("KMS ×2")
  })

  it("separates distinct-label badges by full box height, not 13px", () => {
    const res = resolveFlowBadgePlacements(
      [
        { label: "TARGETS", x: 400, y: 500 },
        { label: "HTTP:80", x: 400, y: 500 },
      ],
      [],
      { w: 1900, h: 1400 },
    )
    const [a, b] = res
    expect(a.suppressed).toBe(false)
    expect(b.suppressed).toBe(false)
    const collide =
      Math.abs(a.x - b.x) < badgeHalfWidth("TARGETS") + badgeHalfWidth("HTTP:80") &&
      Math.abs(a.y - b.y) < HH * 2
    expect(collide).toBe(false)
  })

  it("never dedupes or displaces pinned risk ledes", () => {
    const res = resolveFlowBadgePlacements(
      [
        { label: "exposed · RDS :5432", x: 700, y: 600, pinned: true },
        { label: "exposed · RDS :5432", x: 704, y: 610, pinned: true },
      ],
      [],
      { w: 1900, h: 1400 },
    )
    expect(res[0].suppressed).toBe(false)
    expect(res[1].suppressed).toBe(false)
    expect(res[0].x).toBe(700)
    expect(res[0].y).toBe(600)
  })

  it("falls back to a least-covered finite position when everything is blocked", () => {
    const [p] = resolveFlowBadgePlacements(
      [{ label: "VPCE", x: 900, y: 700 }],
      [{ l: 0, t: 0, r: 1900, b: 1400 }],
      { w: 1900, h: 1400 },
    )
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
  })

  it("passes empty labels through untouched and ignores them as obstacles", () => {
    const res = resolveFlowBadgePlacements(
      [
        { label: "", x: 100, y: 100 },
        { label: "TG", x: 100, y: 100 },
      ],
      [],
      { w: 1900, h: 1400 },
    )
    expect(res[0]).toMatchObject({ x: 100, y: 100, suppressed: false })
    expect(res[1]).toMatchObject({ x: 100, y: 100 })
  })

  it("escapes a walled-off anchor column via its own on-path candidate", () => {
    const wall: ObstacleRect[] = [{ l: 1740, t: 0, r: 1810, b: 1400 }]
    const [p] = resolveFlowBadgePlacements(
      [{ label: "KMS", x: 1775, y: 700, candidates: [{ x: 1300, y: 700 }] }],
      wall,
      { w: 1900, h: 1400 },
    )
    expect(p.x).toBe(1300)
    expect(Math.abs(p.y - 700)).toBeLessThanOrEqual(32)
  })
})
