/**
 * Flow-badge collision solver — pure geometry, no DOM.
 *
 * FlowOverlay's Pass 4 used to nudge badges vertically only. In a dense
 * vertical card column (the regional KMS rail: 13 stacked cards with ~10px
 * gaps) NO clear y exists within the search window, so the ladder gave up and
 * left the label painted straight over a card — the "ENCRYPTED_BY / TRIGGERS
 * pile" on the Platform map's Dependencies lens. Two same-label chips from
 * sibling edges (RDS-1a→KMS + RDS-1b→KMS) also stacked at the same corridor
 * midpoint 13px apart — closer than the 16px chip box, so they overlapped.
 *
 * This module fixes both:
 *  1. Same-label badges anchored in the same spot collapse to ONE chip
 *     (label "×N"); risk ledes (`pinned`) are never collapsed or suppressed.
 *  2. Placement searches, in order: the anchor, a vertical ladder at the
 *     anchor, each on-path candidate (other segment midpoints) with a small
 *     vertical ladder, then a short horizontal slide. If everything is
 *     blocked it takes the least-overlapping candidate instead of giving up
 *     at the anchor.
 *  3. Badge↔badge separation is a real box test (half-height + gap), not the
 *     old |Δy| < 13 heuristic that let 16px-tall chips touch.
 */

export interface ObstacleRect {
  l: number
  t: number
  r: number
  b: number
}

export interface BadgeInput {
  label: string
  x: number
  y: number
  /** Alternate on-path anchors (other segment midpoints), preferred-first. */
  candidates?: ReadonlyArray<{ x: number; y: number }>
  /** Risk ledes (DB exposure) — never deduped, suppressed, or reordered. */
  pinned?: boolean
}

export interface BadgePlacement {
  x: number
  y: number
  /** True → a same-label sibling chip absorbed this one; draw no label. */
  suppressed: boolean
  /** 1 + number of suppressed duplicates folded into this badge. */
  dupCount: number
}

/** Chip label for a badge that absorbed duplicates — single format so the
 *  solver's width math and the caller's rendering agree. */
export function formatDupBadgeLabel(label: string, dupCount: number): string {
  return dupCount > 1 ? `${label} ×${dupCount}` : label
}

/** Matches the SVG pill exactly: rect x = -max(len·3.8, 14), so half-width is
 *  3.8px/char (the old inline pass under-modeled at 3.2px/char, which let
 *  wide labels poke past their computed box). */
export function badgeHalfWidth(label: string): number {
  return Math.max(14, label.length * 3.8)
}

const BADGE_HALF_HEIGHT = 8
const OBSTACLE_PAD = 4
const BADGE_GAP = 2
/** Anchors closer than this collapse into one chip when labels match. */
const DEDUPE_DX = 48
const DEDUPE_DY = 28

interface PlacedBox {
  x: number
  y: number
  hw: number
}

function overlapArea(
  x: number,
  y: number,
  hw: number,
  o: ObstacleRect,
  pad: number,
): number {
  const w = Math.min(x + hw, o.r + pad) - Math.max(x - hw, o.l - pad)
  const h =
    Math.min(y + BADGE_HALF_HEIGHT, o.b + pad) -
    Math.max(y - BADGE_HALF_HEIGHT, o.t - pad)
  return w > 0 && h > 0 ? w * h : 0
}

export function resolveFlowBadgePlacements(
  badges: ReadonlyArray<BadgeInput>,
  obstacles: ReadonlyArray<ObstacleRect>,
  bounds?: { w: number; h: number },
): BadgePlacement[] {
  const out: BadgePlacement[] = badges.map(b => ({
    x: b.x,
    y: b.y,
    suppressed: false,
    dupCount: 1,
  }))

  // Pass A — collapse same-label chips anchored in the same spot. Order
  // matters: the FIRST badge of a cluster survives; later ones fold into it.
  const keptByLabel = new Map<string, number[]>()
  for (let i = 0; i < badges.length; i++) {
    const b = badges[i]
    if (!b.label || b.pinned) continue
    const kept = keptByLabel.get(b.label) ?? []
    const host = kept.find(
      k =>
        Math.abs(badges[k].x - b.x) <= DEDUPE_DX &&
        Math.abs(badges[k].y - b.y) <= DEDUPE_DY,
    )
    if (host !== undefined) {
      out[i].suppressed = true
      out[host].dupCount += 1
    } else {
      kept.push(i)
      keptByLabel.set(b.label, kept)
    }
  }

  // Pass B — place survivors. Pinned (risk) badges claim space first so a
  // volume chip can never push an exposure lede off its anchor.
  const placed: PlacedBox[] = []
  const inBounds = (x: number, y: number, hw: number): boolean => {
    if (!bounds) return true
    return (
      x - hw >= 0 &&
      x + hw <= bounds.w &&
      y - BADGE_HALF_HEIGHT >= 0 &&
      y + BADGE_HALF_HEIGHT <= bounds.h
    )
  }
  const clearAt = (x: number, y: number, hw: number): boolean => {
    if (!inBounds(x, y, hw)) return false
    for (const o of obstacles) {
      if (
        x + hw > o.l - OBSTACLE_PAD &&
        x - hw < o.r + OBSTACLE_PAD &&
        y + BADGE_HALF_HEIGHT > o.t - OBSTACLE_PAD &&
        y - BADGE_HALF_HEIGHT < o.b + OBSTACLE_PAD
      ) {
        return false
      }
    }
    for (const q of placed) {
      if (
        Math.abs(q.x - x) < hw + q.hw + BADGE_GAP &&
        Math.abs(q.y - y) < BADGE_HALF_HEIGHT * 2 + BADGE_GAP
      ) {
        return false
      }
    }
    return true
  }

  const order = [...badges.keys()].sort((a, b) => {
    const pa = badges[a].pinned ? 0 : 1
    const pb = badges[b].pinned ? 0 : 1
    return pa - pb || a - b
  })

  for (const i of order) {
    const b = badges[i]
    if (!b.label || out[i].suppressed) continue
    const hw = badgeHalfWidth(formatDupBadgeLabel(b.label, out[i].dupCount))

    // Candidate ladder, nearest-to-anchor first.
    const cands: Array<{ x: number; y: number }> = [{ x: b.x, y: b.y }]
    for (let dist = 14; dist <= 160; dist += 14) {
      cands.push({ x: b.x, y: b.y - dist }, { x: b.x, y: b.y + dist })
    }
    for (const c of b.candidates ?? []) {
      for (const dy of [0, -16, 16, -32, 32]) {
        cands.push({ x: c.x, y: c.y + dy })
      }
    }
    for (let dist = 24; dist <= 168; dist += 24) {
      cands.push({ x: b.x - dist, y: b.y }, { x: b.x + dist, y: b.y })
    }

    let chosen: { x: number; y: number } | null = null
    for (const c of cands) {
      if (clearAt(c.x, c.y, hw)) {
        chosen = c
        break
      }
    }
    if (!chosen) {
      // Everything blocked — take the least-covered spot instead of giving
      // up at the anchor (the old behavior painted straight over a card).
      let bestPenalty = Infinity
      let best = cands[0]
      for (const c of cands) {
        if (!inBounds(c.x, c.y, hw)) continue
        let penalty = 0
        for (const o of obstacles) penalty += overlapArea(c.x, c.y, hw, o, OBSTACLE_PAD)
        for (const q of placed) {
          penalty += overlapArea(c.x, c.y, hw, {
            l: q.x - q.hw,
            r: q.x + q.hw,
            t: q.y - BADGE_HALF_HEIGHT,
            b: q.y + BADGE_HALF_HEIGHT,
          }, BADGE_GAP)
        }
        if (penalty < bestPenalty) {
          bestPenalty = penalty
          best = c
        }
      }
      chosen = best
    }
    out[i].x = chosen.x
    out[i].y = chosen.y
    placed.push({ x: chosen.x, y: chosen.y, hw })
  }

  return out
}
