"use client"

import { useCallback, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FileText, RefreshCw } from "lucide-react"
import { ExecutiveCockpit } from "./executive-cockpit"
import { OperationsView } from "./operations-view"
import {
  ManagementReportDrawer,
  type ManagementReportContext,
} from "./management-report-drawer"
import { ViewSwitch, isDashboardView, type DashboardView } from "./view-switch"

/**
 * Home — two intentional views, not one endless page.
 *
 *   Executive   material risk, decisions, evidence confidence, outcomes
 *   Operations  findings, evidence sources, LP diagnostics, activity
 *
 * The previous layout stacked every dataset vertically, which gave them all
 * equal weight and made the reader scroll past plane diagnostics to reach a
 * decision. Below it sat a "Security operations detail" accordion — never
 * information architecture, just storage for cards that had no destination.
 *
 * Splitting the views resolves that WITHOUT deleting anything. Every card
 * that lived in the accordion now lives in Operations, mounted exactly once.
 * The alternative — deleting the accordion and moving cards to Remediation /
 * Evidence / Activity — is blocked because those sections do not exist in
 * left-sidebar-nav, and the last attempt at that left three cards mounted
 * nowhere in the product.
 *
 * URL: ?view=operations is shareable and survives refresh.
 *
 * That is deliberate and is NOT the ?section= mistake. ?section= was written
 * by CARDS, so a refresh silently re-pinned operators to a section they never
 * chose. ?view= is written only by the explicit switch below — user intent,
 * where persistence is the feature. Don't "fix" this by dropping the seed.
 */

interface HomeDashboardV3Props {
  initialSystem: string
  onNavigateToSection?: (id: string) => void
}

export function HomeDashboardV3({ onNavigateToSection }: HomeDashboardV3Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const urlView = searchParams.get("view")
  const [view, setViewState] = useState<DashboardView>(
    isDashboardView(urlView) ? urlView : "executive",
  )
  const [refreshKey, setRefreshKey] = useState(0)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportContext, setReportContext] = useState<ManagementReportContext>({
    scope: "Loading scope…",
    sources: [],
    snapshot: null,
  })

  const setView = (v: DashboardView) => {
    setViewState(v)
    // Report data describes the EXECUTIVE view. Leaving that view makes it
    // stale immediately, so drop it; the cockpit repopulates on return.
    if (v !== "executive") {
      setReportOpen(false)
      setReportContext({ scope: "Loading scope…", sources: [], snapshot: null })
    }
    const next = new URLSearchParams(Array.from(searchParams.entries()))
    if (v === "executive") next.delete("view")
    else next.set("view", v)
    const qs = next.toString()
    router.replace(qs ? `/?${qs}` : "/", { scroll: false })
  }

  // ONE refresh for the page. Remounting the subtree re-runs every card's
  // fetch, which is why the executive view has no per-card retry button.
  const refresh = () => setRefreshKey((k) => k + 1)

  // Stable identity so the cockpit's effect doesn't re-fire every render.
  const handleReportData = useCallback((report: ManagementReportContext) => {
    setReportContext((previous) =>
      JSON.stringify(previous) === JSON.stringify(report) ? previous : report,
    )
  }, [])

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Cyntro
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            Cloud Risk &amp; Remediation Overview
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ViewSwitch view={view} onChange={setView} />
          <button
            onClick={refresh}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          {/* Executive-only. Operations does not load the report sources. */}
          {view === "executive" && (
            <button
              onClick={() => setReportOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileText className="h-3.5 w-3.5" />
              Create report
            </button>
          )}
        </div>
      </div>

      <div key={refreshKey}>
        {view === "executive" ? (
          <ExecutiveCockpit
            onNavigateToSection={onNavigateToSection}
            onReportData={handleReportData}
          />
        ) : (
          <OperationsView />
        )}
      </div>

      <ManagementReportDrawer
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        report={reportContext}
      />
    </div>
  )
}
