/**
 * Chip-avoiding legs: a clear leg is untouched, a blocked leg is re-routed
 * through a gap, and the result never crosses more chips than the original.
 */

import { describe, expect, it } from "vitest"

import { clearLeg, countCrossings, obstaclesForLeg, type Box } from "@/components/topology-v0-2/flow-route-clear"

const src: Box = { l: 0, t: 200, r: 60, b: 230 }
const dst: Box = { l: 0, t: 0, r: 60, b: 30 }
const straightUp = [{ x: 30, y: 200 }, { x: 30, y: 30 }]

describe("clearLeg", () => {
  it("returns a clear leg unchanged", () => {
    expect(clearLeg(straightUp, src, dst, [{ l: 200, t: 100, r: 260, b: 130 }])).toBe(straightUp)
  })

  it("routes around a chip sitting between the two ends", () => {
    const blocker: Box = { l: 10, t: 100, r: 50, b: 130 }
    expect(countCrossings(straightUp, [blocker])).toBe(1)
    const out = clearLeg(straightUp, src, dst, [blocker])
    expect(countCrossings(out, [blocker])).toBe(0)
    expect(out[0].y === src.t || out[0].y === src.b || out[0].x === src.l || out[0].x === src.r).toBe(true)
  })

  it("never returns a route with more crossings than it was given", () => {
    const wall: Box[] = [
      { l: -500, t: 100, r: 500, b: 130 },
      { l: 80, t: 0, r: 120, b: 230 },
    ]
    const out = clearLeg(straightUp, src, dst, wall)
    expect(countCrossings(out, wall)).toBeLessThanOrEqual(countCrossings(straightUp, wall))
  })

  it("does not treat a leg's own ends, or boxes around them, as obstacles", () => {
    const tile: Box = { l: -5, t: 195, r: 65, b: 235 }
    expect(obstaclesForLeg([src, dst, tile], src, dst)).toEqual([])
  })
})
