"use client"

import { useSearchParams } from "next/navigation"

/** Cyntro attack map stack — default on (re-enabled 2026-06-17 after
 * canvas v2: populated backdrop tiles, animated spine, deduped constraint
 * bands, VPC banner relocated above AZ row, hop ordinal badges on every
 * chain node).
 *
 * URL convention (mirrors ?canvas=v1 rollback hatch):
 *   - No ?map=        → new Cyntro map (default)
 *   - ?map=cyntro     → new map (explicit; keeps old bookmarks working)
 *   - ?map=legacy     → old Cloud Graph containment map
 *   - ?map=v1         → alias for legacy
 */
export function useAttackMapCyntro(): boolean {
  const searchParams = useSearchParams()
  const v = searchParams?.get("map")
  if (v === "legacy" || v === "v1") return false
  if (v === "cyntro" || v === "1") return true
  return true
}
