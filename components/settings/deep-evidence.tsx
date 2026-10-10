"use client"

/**
 * Settings › Accounts: the older collection pipeline's lines, said as the DEEP EVIDENCE they are when the account's basic
 * inventory is already being shown.
 *
 * A registration confirmed with basic resource discovery has its inventory from that run -- the row's "Resources" line is
 * its inventory status, and the account's Inventory lists those rows. The first-inventory / data-stage lines describe the
 * enrichment pipeline (deep collection, acceptance, Systems census); beside a shown basic inventory their "First inventory
 * not started" or "Its data cannot be shown yet" would read as if the Inventory were hidden. Inside this group they are
 * labelled deep evidence and their inventory wording says so. Revocation, removal and every hold code are unchanged, and an
 * account without a basic run (an older registration) never enters the group: its lines are exactly as before.
 */
import { createContext, useContext } from "react"

const DeepEvidenceContext = createContext(false)

/** True inside a DeepEvidenceGroup: the account's basic inventory is being shown beside these lines. */
export function useDeepEvidence(): boolean {
  return useContext(DeepEvidenceContext)
}

/** "First inventory …" / "First collection …" said as the deep evidence it is (every other word kept). */
export function deepEvidenceText(text: string): string {
  return text.replace(/^First (inventory|collection)\b/, "Deep evidence")
}

export function DeepEvidenceGroup({ accountId, children }: { accountId: string; children: React.ReactNode }) {
  return (
    <DeepEvidenceContext.Provider value={true}>
      <div data-testid={`deep-evidence-${accountId}`} className="space-y-1 border-l-2 border-slate-200 pl-2">
        <p className="text-[11px] font-semibold text-slate-500">
          Deep evidence (enrichment) · the Resources line above is this account&apos;s inventory
        </p>
        {children}
      </div>
    </DeepEvidenceContext.Provider>
  )
}
