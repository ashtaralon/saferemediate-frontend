/**
 * Format graph-derived closes counts for the cut card (PRD S5).
 * Returns null when the backend omitted closes or both counts are zero —
 * never invents a number.
 */
import type { ClosureCloses } from "./closure-outcome-types"

export function formatClosureClosesLine(closes: ClosureCloses | null | undefined): string | null {
  if (!closes) return null
  const paths = closes.closes_paths ?? 0
  const lateral = closes.closes_lateral ?? 0
  if (paths <= 0 && lateral <= 0) return null

  const parts: string[] = []
  if (paths > 0) {
    parts.push(`${paths} path${paths === 1 ? "" : "s"} to this jewel`)
  }
  if (lateral > 0) {
    const jewelBit =
      closes.closes_lateral_jewels > 0
        ? ` (${closes.closes_lateral_jewels} other jewel${
            closes.closes_lateral_jewels === 1 ? "" : "s"
          })`
        : ""
    parts.push(`${lateral} lateral branch${lateral === 1 ? "" : "es"}${jewelBit}`)
  }
  return parts.join(" · ")
}
