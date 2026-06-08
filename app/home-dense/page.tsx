"use client"

import { Suspense } from "react"
import { LeftSidebarNav } from "@/components/left-sidebar-nav"
import { HomeDense } from "@/components/dashboard/dense/home-dense"
import { ErrorBoundary } from "@/components/ui/error-boundary"

/**
 * /home-dense — operator-density home dashboard.
 *
 * Lives at its own route so it can be tested side-by-side with the
 * existing V3 home (at /). When the dense home is good enough, the
 * default home flag (NEXT_PUBLIC_DASHBOARD_V3 etc) flips to it and
 * /home-dense becomes redundant. Until then, this is the steering
 * surface for the operator-home work.
 *
 * Sidebar still uses the section-state pattern from app/page.tsx, but
 * since this is a separate route, clicking a sidebar item navigates
 * back to / with the right ?section=. Per the IA revert (commit
 * 7c15e9b → fc8be91), home-button-onClick lives in app/page.tsx; here
 * the sidebar is decorative-with-nav-links since we're already on a
 * dedicated route.
 */

function NoOpItemClick(_id: string) {
  // No-op — sidebar items in this dedicated route fall through to
  // their hrefs. Section-state navigation lives in /, not here.
}

export default function HomeDensePage() {
  return (
    <Suspense fallback={null}>
      <div className="flex min-h-screen bg-gray-50">
        <LeftSidebarNav
          activeItem="home"
          onItemClick={NoOpItemClick}
          issuesCount={0}
          pendingTagsCount={0}
        />
        <div className="flex-1">
          <ErrorBoundary componentName="HomeDense">
            <HomeDense />
          </ErrorBoundary>
        </div>
      </div>
    </Suspense>
  )
}
