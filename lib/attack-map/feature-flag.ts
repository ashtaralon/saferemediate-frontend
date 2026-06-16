"use client"

import { useSearchParams } from "next/navigation"

/** Opt-in to the Cyntro attack map stack (?map=cyntro). Default off. */
export function useAttackMapCyntro(): boolean {
  const searchParams = useSearchParams()
  const v = searchParams?.get("map")
  return v === "cyntro" || v === "1"
}
