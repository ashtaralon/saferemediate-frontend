"use client"

import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { SystemsView } from "@/components/systems-view"
import { SystemDetailDashboard } from "@/components/system-detail-dashboard"
import { ErrorBoundary } from "@/components/error-boundary"

function SystemsPageInner() {
  // /systems supports two modes:
  //
  //   1. No ?systemName= -> org-wide systems list (SystemsView).
  //
  //   2. ?systemName=<X>[&tab=<leaf>] -> per-system dashboard
  //      (SystemDetailDashboard). The optional ?tab= preselects a
  //      leaf tab id from system-detail-dashboard.tsx (e.g.
  //      "orphan-services", "least-privilege"). Used by the IAM
  //      Quarantine-candidates flow to land operators directly on
  //      Inventory -> Orphan after a quarantine action.
  //
  // Before 2026-05-26 this page only ever rendered SystemsView, so
  // ?systemName= was effectively a no-op deep-link. The IAM view's
  // quarantine candidates linked here and dropped the user on the
  // org-wide list. Routing to the dashboard closes that gap.
  const sp = useSearchParams()
  const router = useRouter()
  const systemName = sp.get("systemName") || undefined
  const initialTab = sp.get("tab") || undefined

  if (systemName) {
    return (
      <ErrorBoundary componentName="System Dashboard">
        <SystemDetailDashboard
          systemName={systemName}
          initialTab={initialTab}
          onBack={() => router.push("/systems")}
        />
      </ErrorBoundary>
    )
  }

  return <SystemsView systemName={systemName} />
}

export default function SystemsPage() {
  return (
    <Suspense fallback={null}>
      <SystemsPageInner />
    </Suspense>
  )
}
