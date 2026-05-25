"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { SystemsView } from "@/components/systems-view"

function SystemsPageInner() {
  // ?systemName=<X> deep-links into a specific system's detail view.
  // Used by e.g. /iam/shared-roles/by-plan/[id] when linking quarantine
  // candidates to their system's Inventory → Orphan tab. SystemsView
  // already accepts a `systemName` prop; the page just reads it from
  // the URL.
  //
  // Tab deep-link via ?tab= is a follow-up — requires plumbing through
  // SystemDetailDashboard's internal activeTab state. For now the
  // operator lands on the system's Overview and clicks Inventory →
  // Orphan manually (one more click than ideal, but the link target
  // is at least the right system, not the account-wide rollup).
  const sp = useSearchParams()
  const systemName = sp.get("systemName") || undefined
  return <SystemsView systemName={systemName} />
}

export default function SystemsPage() {
  return (
    <Suspense fallback={null}>
      <SystemsPageInner />
    </Suspense>
  )
}
