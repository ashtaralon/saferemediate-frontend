"use client"

import { Suspense, use } from "react"
import SGSharedSGsDetailView from "@/components/sg-shared-sgs-detail-view"

export default function SGSharedSGsByPlanPage({
  params,
}: {
  params: Promise<{ plan_id: string }>
}) {
  const { plan_id } = use(params)
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
          <span className="text-sm">Loading plan…</span>
        </div>
      }
    >
      <SGSharedSGsDetailView planId={plan_id} />
    </Suspense>
  )
}
