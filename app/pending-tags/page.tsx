"use client"

/**
 * Global Pending Tags review surface.
 *
 * The PendingApprovals component was only mounted inside system-detail-
 * dashboard.tsx with `systemName={systemName}` — so it filtered to one
 * system per-view. The auto-tagger's queue spans all systems and had no
 * global entry point. Operators couldn't see the full backlog.
 *
 * This page mounts PendingApprovals without a systemName prop, which the
 * component interprets as "all systems" (see pending-approvals.tsx:79).
 */

import { PendingApprovals } from "@/components/pending-approvals"
import { BackToDashboard } from "@/components/back-to-dashboard"

export default function PendingTagsPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex items-start gap-3">
          <BackToDashboard
            className="p-2 -ml-2 rounded-lg hover:bg-slate-800 transition-colors mt-1 shrink-0"
            iconClassName="w-5 h-5 text-slate-300"
          />
          <div>
            <h1 className="text-2xl font-bold text-white">Pending Tag Approvals</h1>
            <p className="text-slate-400 text-sm mt-1">
              Resources flagged by the auto-tagger that require human review before an ownership claim is made.
              Typed service interactions are recorded automatically as consumer membership without overwriting a shared
              resource&apos;s owner; only ambiguous or conflicting ownership remains in this queue.
            </p>
          </div>
        </header>
        {/* No systemName prop → shows pending tags across all systems */}
        <PendingApprovals />
      </div>
    </div>
  )
}
