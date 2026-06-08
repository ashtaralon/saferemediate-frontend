"use client"

import { Suspense } from "react"
import IAMSharedRolesListView from "@/components/iam-shared-roles-list-view"

// Account-wide list — NOT system-scoped. Use the optional system_name
// filter in the page itself if you want to scope. No SystemGuard.
export default function IAMSharedRolesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
          <span className="text-sm">Loading shared-roles view…</span>
        </div>
      }
    >
      <IAMSharedRolesListView />
    </Suspense>
  )
}
