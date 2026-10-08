"use client"

import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { SystemsView } from "@/components/systems-view"
import { SystemDetailDashboard } from "@/components/system-detail-dashboard"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { systemDetailHref } from "@/lib/scoped-system-catalog"

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
  // A7 B5: on a v2 install the system's KEY rides with its name -- two systems may share a name, never a key.
  const systemKey = sp.get("system_key") || null
  // A tag / source key is one system PER ACCOUNT: the account the row was linked under rides with its key.
  const systemAccountId = systemKey ? sp.get("account_id") || null : null
  const rawTab = sp.get("tab") || undefined
  const jewel = sp.get("jewel")
  const path = sp.get("path")
  const mode = sp.get("mode")
  const hasAttackPathDeepLink = Boolean(jewel || path || mode)
  const initialTab =
    rawTab === "attacker-map" || hasAttackPathDeepLink
      ? "attack-paths"
      : rawTab
  const initialAttackPathMode =
    rawTab === "attacker-map"
      ? "attacker_map"
      : mode || (hasAttackPathDeepLink ? "attack-path" : undefined)

  if (systemName) {
    return (
      <ErrorBoundary componentName="System Dashboard">
        <SystemDetailDashboard
          systemName={systemName}
          systemKey={systemKey}
          systemAccountId={systemAccountId}
          initialTab={initialTab}
          initialAttackPathMode={initialAttackPathMode}
          onBack={() => router.push("/systems")}
        />
      </ErrorBoundary>
    )
  }

  return (
    <SystemsView
      systemName={systemName}
      onSystemSelect={(selectedSystem, selectedKey, selectedAccount) =>
        router.push(systemDetailHref(selectedSystem, selectedKey, selectedAccount))
      }
    />
  )
}

export default function SystemsPage() {
  return (
    <Suspense fallback={null}>
      <SystemsPageInner />
    </Suspense>
  )
}
