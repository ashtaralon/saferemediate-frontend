"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import {
  buildTfmSpotlightUrl,
  fetchConvergenceSummary,
  filterRealConvergencePaths,
  jewelIdForNavigation,
} from "@/lib/attack-paths/crown-jewel-v2-navigation"

export function CrownJewelUnionViewLink({
  systemName,
  jewel,
}: {
  systemName: string
  jewel: CrownJewelSummary | null
}) {
  const [realPathCount, setRealPathCount] = useState<number | null>(null)

  useEffect(() => {
    if (!jewel || !systemName) {
      setRealPathCount(null)
      return
    }
    let cancelled = false
    void (async () => {
      const summary = await fetchConvergenceSummary(systemName, jewel)
      if (cancelled) return
      const n = summary ? filterRealConvergencePaths(summary.paths).length : 0
      setRealPathCount(n)
    })()
    return () => {
      cancelled = true
    }
  }, [systemName, jewel?.id, jewel?.canonical_id, jewel?.name])

  if (!jewel || realPathCount === null || realPathCount <= 1) return null

  const href = buildTfmSpotlightUrl(systemName, jewelIdForNavigation(jewel))

  return (
    <Link
      href={href}
      className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline shrink-0"
      title="Open Traffic Flow Map union view — all workloads reaching this jewel"
    >
      Advanced: {realPathCount} paths to this jewel — view all
    </Link>
  )
}
