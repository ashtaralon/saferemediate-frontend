"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/** Cyntro map presentation within the attack-path panel (not legacy cloud graph). */
export type MapViewVariant = "classic" | "target"

/**
 * classic — path-only linear spine (default)
 * target  — subnet-row × AZ-column grid (?map=target)
 */
export function useMapViewVariant(): {
  variant: MapViewVariant
  setVariant: (v: MapViewVariant) => void
} {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const variant: MapViewVariant =
    searchParams?.get("map") === "target" ? "target" : "classic"

  const setVariant = useCallback(
    (v: MapViewVariant) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (v === "target") {
        params.set("map", "target")
      } else if (params.get("map") === "target") {
        params.delete("map")
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [searchParams, router, pathname],
  )

  return { variant, setVariant }
}
