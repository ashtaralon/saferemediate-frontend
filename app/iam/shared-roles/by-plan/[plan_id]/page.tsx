"use client"

import { Suspense, use } from "react"
import IAMSharedRolesDetailView from "@/components/iam-shared-roles-detail-view"

interface Props {
  params: Promise<{ plan_id: string }>
}

export default function SplitPlanDetailPage({ params }: Props) {
  const { plan_id } = use(params)
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
          <span className="text-sm">Loading plan detail…</span>
        </div>
      }
    >
      <IAMSharedRolesDetailView planId={plan_id} />
    </Suspense>
  )
}
