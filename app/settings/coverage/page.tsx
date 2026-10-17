"use client"

import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { LeftSidebarNav } from "@/components/left-sidebar-nav"
import { SourceCoveragePanel } from "@/components/coverage/source-coverage-panel"
import { COVERAGE_PAGE_PATH } from "@/lib/observation-coverage"

/**
 * Settings > Evidence coverage. Reachable from Settings > Accounts (nav entry
 * and each account row) and from Systems. `?account_id=` scopes the record to
 * one account; member accounts are listed under their own account id.
 */
function CoveragePageInner() {
  const params = useSearchParams()
  const accountId = params.get("account_id")?.trim() || null
  return (
    <div className="flex min-h-[calc(100vh-44px)] bg-[#f3f6f7] text-slate-900">
      <LeftSidebarNav activeItem="settings" />
      <main className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-8 py-7">
          <div className="mx-auto max-w-[1500px]">
            <Link href="/settings/accounts" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800">
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Accounts
            </Link>
            <p className="mb-2 mt-3 text-[11px] font-bold uppercase tracking-[0.22em] text-teal-700">Customer estate</p>
            <h1 className="text-3xl font-semibold tracking-tight">Evidence coverage</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              The time range each evidence source has verified, per AWS account: earliest verified, verified through, completed
              windows and the gaps inside them.
            </p>
            {accountId ? (
              <p className="mt-3 text-sm text-slate-600">
                Showing account <span className="font-mono font-semibold">{accountId}</span> ·{" "}
                <Link href={COVERAGE_PAGE_PATH} className="font-semibold text-teal-700 hover:text-teal-800">Show all accounts</Link>
              </p>
            ) : null}
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] p-8">
          <SourceCoveragePanel accountId={accountId} />
        </div>
      </main>
    </div>
  )
}

export default function CoveragePage() {
  return (
    <Suspense fallback={null}>
      <CoveragePageInner />
    </Suspense>
  )
}
