"use client"

import { useSearchParams } from "next/navigation"

/** Cyntro attack map stack — default on since #184/#185/#186 shipped.
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
