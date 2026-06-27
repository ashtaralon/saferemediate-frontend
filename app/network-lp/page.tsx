"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { NetworkLpPanel } from "@/components/dependency-map/network-lp-panel"

function NetworkLpPageInner() {
  const sp = useSearchParams()
  return (
    <NetworkLpPanel
      systemId={sp.get("system") || undefined}
      initialSubnet={sp.get("subnet") || undefined}
    />
  )
}

export default function NetworkLpPage() {
  return (
    <Suspense fallback={null}>
      <NetworkLpPageInner />
    </Suspense>
  )
}
