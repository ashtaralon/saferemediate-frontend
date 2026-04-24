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

export default function PendingTagsPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-white">Pending Tag Approvals</h1>
          <p className="text-slate-400 text-sm mt-1">
            Resources flagged by the auto-tagger that require human review before being attributed to a system.
            Edges like <code className="text-slate-300 bg-slate-800/80 px-1.5 rounded">ACTUAL_TRAFFIC</code> and{" "}
            <code className="text-slate-300 bg-slate-800/80 px-1.5 rounded">ACCESSES_RESOURCE</code> produce behavioral
            candidates that never auto-tag — they wait here for explicit approval.
          </p>
        </header>
        {/* No systemName prop → shows pending tags across all systems */}
        <PendingApprovals />
      </div>
    </div>
  )
}
