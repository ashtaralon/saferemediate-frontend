"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/** Cyntro map presentation within the attack-path panel (not legacy cloud graph). */
export type MapViewVariant = "classic" | "target" | "surface" | "aws"

/**
 * surface — Attack Surface Map (VPC nested groups) — DEFAULT
 * aws     — 3-D attack path map (?map=aws)
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
    m === "aws"
      ? "aws"
      : m === "target"
        ? "target"
        : m === "classic" || m === "cyntro" || m === "1"
          ? "classic"
          : m === "surface"
            ? "surface"
            : "surface"

  const setVariant = useCallback(
    (v: MapViewVariant) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (v === "aws") {
        params.set("map", "aws")
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
