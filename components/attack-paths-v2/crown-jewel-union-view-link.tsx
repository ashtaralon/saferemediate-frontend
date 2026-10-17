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
import { readConvergencePaths } from "@/lib/attack-paths/convergence-readiness"

export function CrownJewelUnionViewLink({
  systemName,
  systemKey = null,
  systemAccountId = null,
  jewel,
}: {
  systemName: string
  /** A7 B5: the system's KEY (+ a tag / source key's account) when the page was opened by key -- the summary read and the
   *  link name ONE system. Absent, both are by name exactly as before. */
  systemKey?: string | null
  systemAccountId?: string | null
  jewel: CrownJewelSummary | null
}) {
  const [realPathCount, setRealPathCount] = useState<number | null>(null)
  // AP188: why the count is not every path to the jewel (an install's capped publication is always PARTIAL), or null.
  const [countPartial, setCountPartial] = useState<string | null>(null)
  // AP190: the request the count and its reason answer. Evidence about another system or jewel is never shown: while
  // a new jewel's read is pending, or after it fails, is held or is not ready, there is no count.
  const requestKey = jewel && systemName ? [systemName, jewel.id, jewel.canonical_id ?? "", jewel.name ?? ""].join("\u0000") : null
  const [countKey, setCountKey] = useState<string | null>(null)

  useEffect(() => {
    if (!jewel || !systemName) {
      setRealPathCount(null)
      return
    }
    let cancelled = false
    const key = requestKey
    void (async () => {
      const summary = await fetchConvergenceSummary(systemName, jewel, systemKey, systemAccountId)
      if (cancelled) return
      // AP188: a count only from an answer that lists paths; a hold, a refusal, a not-ready or pathless body has none.
      const reading = readConvergencePaths(summary)
      setRealPathCount(reading.kind === "paths" ? filterRealConvergencePaths(reading.paths).length : null)
      setCountPartial(reading.kind === "paths" ? reading.partial : null)
      setCountKey(key)
    })().catch(() => {
      if (cancelled) return
      setRealPathCount(null)                            // a failed read is no count, never an unhandled rejection
      setCountKey(key)
    })
    return () => {
      cancelled = true
    }
  }, [systemName, jewel?.id, jewel?.canonical_id, jewel?.name, systemKey, systemAccountId])

  if (!jewel || countKey !== requestKey || realPathCount === null || realPathCount <= 1) return null

  const href = buildTfmSpotlightUrl(systemName, jewelIdForNavigation(jewel), systemKey, systemAccountId)

  return (
    <Link
      href={href}
      className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline shrink-0"
      title={
        countPartial
          ? `Open Traffic Flow Map union view. ${realPathCount} paths were listed for this jewel (${countPartial}); more may exist.`
          : "Open Traffic Flow Map union view — all workloads reaching this jewel"
      }
      data-count-partial={countPartial ?? undefined}
    >
      {countPartial
        ? `Advanced: ${realPathCount} listed paths to this jewel (more may exist) — view all`
        : `Advanced: ${realPathCount} paths to this jewel — view all`}
    </Link>
  )
}
