// Unified Shared Resources page — Slice 0 + PR-3 per
// docs/shared-resources-real-data-wiring.md (backend repo).
//
// The list view is the answer-rendering primitive: sorted by sort_score
// so the top of the list IS the actionable surface. Per
// pattern_render_the_answer_not_the_inventory.

import { SharedResourcesListView } from "@/components/shared-resources/shared-resources-list-view"

export const metadata = {
  title: "Shared Resources · Cyntro",
  description:
    "IAM roles and security groups shared across multiple consumers — sorted by narrowing opportunity.",
}

export default function SharedResourcesPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-[1500px]">
        <SharedResourcesListView />
      </div>
    </main>
  )
}
