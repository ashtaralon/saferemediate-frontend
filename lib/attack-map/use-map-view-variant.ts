"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/** Cyntro map presentation within the attack-path panel (not legacy cloud graph). */
export type MapViewVariant = "classic" | "target" | "aws"

/**
 * aws     — AWS architecture view (Cloud·Region·VPC·AZ·subnet boxes) — DEFAULT
 * classic — path-only linear spine (?map=classic)
 * target  — subnet-row × AZ-column grid (?map=target)
 */
export function useMapViewVariant(): {
  variant: MapViewVariant
  setVariant: (v: MapViewVariant) => void
} {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const m = searchParams?.get("map")
  const variant: MapViewVariant =
    m === "target" ? "target" : m === "classic" ? "classic" : "aws"

  const setVariant = useCallback(
    (v: MapViewVariant) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (v === "target") {
        params.set("map", "target")
      } else if (v === "classic") {
        params.set("map", "classic")
      } else {
        // aws is the default — keep the URL clean (but don't clobber ?map=legacy,
        // which selects the separate containment map upstream).
        if (params.get("map") !== "legacy") params.delete("map")
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [searchParams, router, pathname],
  )

  return { variant, setVariant }
}
