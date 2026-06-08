"use client"

import { Suspense } from "react"
import SGSharedSGsListView from "@/components/sg-shared-sgs-list-view"

export default function SGSharedSGsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
          <span className="text-sm">Loading shared-SGs view…</span>
        </div>
      }
    >
      <SGSharedSGsListView />
    </Suspense>
  )
}
