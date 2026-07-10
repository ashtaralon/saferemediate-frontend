"use client"

/**
 * Business System Mapping — /business-systems
 *
 * Sprint 2: default view is BRSS ranking of rankable systems.
 * ?systemName= / ?system= opens the existing blast-radius detail map.
 */

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { BlastRadiusView } from "@/components/business-system/blast-radius-view"
import { BusinessSystemsRanking } from "@/components/business-system/business-systems-ranking"

const SHELL = "min-h-screen"
const SHELL_STYLE = { background: "#F4F6F8", color: "#5A6B7A" }

function BusinessSystemsView() {
  const params = useSearchParams()
  const fromUrl = params.get("systemName") || params.get("system")

  if (fromUrl) {
    return <BlastRadiusView systemName={fromUrl} />
  }
  return <BusinessSystemsRanking />
}

export default function BusinessSystemsPage() {
  return (
    <Suspense
      fallback={
        <div className={`${SHELL} p-8`} style={SHELL_STYLE}>
          Loading…
        </div>
      }
    >
      <div className={SHELL} style={SHELL_STYLE}>
        <BusinessSystemsView />
      </div>
    </Suspense>
  )
}
