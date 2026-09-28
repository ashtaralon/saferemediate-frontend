/**
 * Chip-avoiding orthogonal legs for the flow overlay.
 *
 * `orthoLeg` picks a leg's shape from its two ends alone, so a line from a
 * private-subnet EC2 up to the NAT and the IGW ran straight through whatever
 * chip sat in between (live review, 2026-09-29: 21 line/chip crossings on one
 * VPC). This module takes that leg and, only when it crosses a chip that is
 * neither end, tries a small set of alternative right-angle routes through
 * the gaps between chips and keeps the one with the fewest crossings, then the
 * shortest. A leg that is already clear is returned untouched, so a clean map
 * draws exactly as before.
 *
 * Pure geometry in the overlay's natural coordinate space; no DOM.
 */

export interface Box {
  l: number
  t: number
  r: number
  b: number
}

export type Pt = { x: number; y: number }

const PAD = 3

function segHitsBox(a: Pt, b: Pt, o: Box): boolean {
  const l = o.l + PAD
  const r = o.r - PAD
  const t = o.t + PAD
  const bt = o.b - PAD
  if (r <= l || bt <= t) return false
  if (a.x === b.x) {
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    return a.x > l && a.x < r && y1 > t && y0 < bt
  }
  if (a.y === b.y) {
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    return a.y > t && a.y < bt && x1 > l && x0 < r
  }
  // Not axis-aligned: test the bounding box conservatively.
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  return x1 > l && x0 < r && y1 > t && y0 < bt
}

/** How many distinct obstacles a polyline passes through. */
export function countCrossings(pts: readonly Pt[], obstacles: readonly Box[]): number {
  let n = 0
  for (const o of obstacles) {
    for (let i = 0; i + 1 < pts.length; i++) {
      if (segHitsBox(pts[i], pts[i + 1], o)) {
        n++
        break
      }
    }
  }
  return n
}

function length(pts: readonly Pt[]): number {
  let s = 0
  for (let i = 0; i + 1 < pts.length; i++) s += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y)
  return s
}

function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue
    out.push(p)
  }
  return out
}

const same = (a: Box, b: Box) => Math.abs(a.l - b.l) < 1 && Math.abs(a.t - b.t) < 1 && Math.abs(a.r - b.r) < 1 && Math.abs(a.b - b.b) < 1
const contains = (outer: Box, inner: Box) => outer.l <= inner.l + 1 && outer.t <= inner.t + 1 && outer.r >= inner.r - 1 && outer.b >= inner.b - 1

/**
 * The obstacles one leg must avoid: every chip except its own two ends and
 * anything that contains or is contained by them (a stack tile and its chip,
 * a door and its label).
 */
export function obstaclesForLeg(all: readonly Box[], src: Box, dst: Box): Box[] {
  return all.filter(o => !same(o, src) && !same(o, dst) && !contains(o, src) && !contains(o, dst) && !contains(src, o) && !contains(dst, o))
}

/**
 * Keep `base` when it is clear; otherwise return the clearest alternative
 * right-angle route between the same two boxes. Never returns a route with
 * MORE crossings than `base`.
 */
export function clearLeg(base: Pt[], src: Box, dst: Box, obstacles: readonly Box[], maxCandidates = 400): Pt[] {
  if (base.length < 2 || obstacles.length === 0) return base
  const baseHits = countCrossings(base, obstacles)
  if (baseHits === 0) return base

  const scx = (src.l + src.r) / 2
  const scy = (src.t + src.b) / 2
  const dcx = (dst.l + dst.r) / 2
  const dcy = (dst.t + dst.b) / 2
  const G = 8

  // Candidate gutter coordinates: just outside every obstacle and both ends.
  const xs = new Set<number>([scx, dcx, src.l - 14, src.r + 14, dst.l - 14, dst.r + 14])
  const ys = new Set<number>([scy, dcy, src.t - 14, src.b + 14, dst.t - 14, dst.b + 14])
  for (const o of obstacles) {
    xs.add(o.l - G)
    xs.add(o.r + G)
    ys.add(o.t - G)
    ys.add(o.b + G)
  }
  const xList = [...xs]
  const yList = [...ys]

  const cands: Pt[][] = []
  const exitsV: Pt[] = [
    { x: scx, y: src.t },
    { x: scx, y: src.b },
  ]
  const entersV: Pt[] = [
    { x: dcx, y: dst.t },
    { x: dcx, y: dst.b },
  ]
  // Vertical exit -> horizontal run at y -> vertical entry.
  for (const e of exitsV) for (const n of entersV) for (const y of yList) {
    cands.push([e, { x: e.x, y }, { x: n.x, y }, n])
  }
  // Side exit -> vertical run at x -> side entry.
  const exitsH: Pt[] = [
    { x: src.l, y: scy },
    { x: src.r, y: scy },
  ]
  const entersH: Pt[] = [
    { x: dst.l, y: dcy },
    { x: dst.r, y: dcy },
  ]
  for (const e of exitsH) for (const n of entersH) for (const x of xList) {
    cands.push([e, { x, y: e.y }, { x, y: n.y }, n])
  }
  // Vertical exit -> gutter column x -> vertical entry (5 segments).
  for (const e of exitsV) for (const n of entersV) {
    const y1 = e.y === src.t ? src.t - 12 : src.b + 12
    const y2 = n.y === dst.t ? dst.t - 12 : dst.b + 12
    for (const x of xList) cands.push([e, { x: e.x, y: y1 }, { x, y: y1 }, { x, y: y2 }, { x: n.x, y: y2 }, n])
  }

  let best = base
  let bestScore = baseHits * 10000 + length(base) + base.length * 15
  let tried = 0
  for (const c0 of cands) {
    if (++tried > maxCandidates * 8) break
    const c = dedupe(c0)
    // A candidate may touch its own ends only at its first and last point: an
    // inner segment that runs back across the source or target is rejected.
    const inner = c.slice(1, -1)
    if (inner.length >= 2 && countCrossings(inner, [src, dst]) > 0) continue
    const hits = countCrossings(c, obstacles)
    const score = hits * 10000 + length(c) + c.length * 15
    if (score < bestScore) {
      best = c
      bestScore = score
    }
  }
  return best
}
