/**
 * Keep an edge's verb chip off a prose block that shares its lane.
 *
 * Why this is not just a z-index: the chip is deliberately OPAQUE so it masks
 * the lane-card text it lands on rather than blending illegibly into it
 * (traffic-flow-map, 2026-07-27). That is right for a small card and ruinous
 * for a paragraph — on 2026-07-30 the "No Network Controls" banner rendered as
 *
 *   "Network defenses do [accesses · Configured] IAM role on the right grants…"
 *
 * with the chip masking "not apply. Compromising the". Raising the banner above
 * the chips would only swap which one is unreadable, so the chip moves instead.
 *
 * Vertical only, on purpose: x stays on the edge so the chip keeps reading as
 * that edge's label rather than drifting onto a neighbour's line.
 *
 * Pure and exported so the geometry is testable without mounting an 11k-line
 * component or standing up live data.
 */
export interface LabelExclusion {
  left: number
  right: number
  top: number
  bottom: number
}

/** Chip box extents around its anchor, matching the rect drawn in the SVG. */
const CHIP_TOP_OFFSET = 8
const CHIP_BOTTOM_OFFSET = 6
/** Clearance once moved, so the chip does not sit flush against the prose. */
const CLEAR_ABOVE = 10
const CLEAR_BELOW = 16

export function resolveVerbChipY(
  midX: number,
  midY: number,
  labelW: number,
  exclusion: LabelExclusion | null | undefined,
): number {
  if (!exclusion) return midY

  const halfW = labelW / 2
  const hitsX = midX + halfW > exclusion.left && midX - halfW < exclusion.right
  const hitsY =
    midY + CHIP_BOTTOM_OFFSET > exclusion.top &&
    midY - CHIP_TOP_OFFSET < exclusion.bottom
  if (!hitsX || !hitsY) return midY

  // Leave via the nearer horizontal edge — the shorter move is the one least
  // likely to drop the chip onto something else.
  return midY - exclusion.top <= exclusion.bottom - midY
    ? exclusion.top - CLEAR_ABOVE
    : exclusion.bottom + CLEAR_BELOW
}
