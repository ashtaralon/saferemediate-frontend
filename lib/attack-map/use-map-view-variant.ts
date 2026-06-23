"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/** Cyntro map presentation within the attack-path panel (not legacy cloud graph). */
export type MapViewVariant = "classic" | "target" | "surface" | "topology"

/**
 * surface  — Attack Surface Map (VPC nested groups) — DEFAULT
 * classic  — path-only linear spine (?map=classic)
 * target   — subnet-row × AZ-column grid (?map=target)
 * topology — 3-pane Attack Graph on AWS topology (?map=topology)
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
    m === "topology"
      ? "topology"
      : m === "target"
        ? "target"
        : m === "classic" || m === "cyntro" || m === "1"
          ? "classic"
          : "surface"

  const setVariant = useCallback(
    (v: MapViewVariant) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (v === "topology") {
        params.set("map", "topology")
      } else if (v === "target") {
        params.set("map", "target")
      } else if (v === "classic") {
        params.set("map", "classic")
      } else if (v === "surface") {
        if (params.get("map") !== "legacy") params.delete("map")
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [searchParams, router, pathname],
  )

  return { variant, setVariant }
}
