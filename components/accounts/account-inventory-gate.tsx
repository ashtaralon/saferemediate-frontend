"use client"

/**
 * The ONE state-aware entry to an account's inventory, shared by both routes that show it -- the account page's Inventory tab
 * (/accounts/{accountId}?tab=inventory) and /accounts/{accountId}/inventory -- so they cannot drift (r41, Alon 2026-10-08).
 *
 * It reads the account listing Settings reads (GET /api/proxy/admin/accounts) and decides, from the CURRENT registration,
 * before any inventory, census or authoring read:
 * - an option-C registration that has not been activated (collectionNotStarted): Cyntro has read nothing in the account and
 *   has not started collecting it -- the page says so and mounts no reader, rather than asking the inventory and census
 *   routes and wording their INVENTORY_SCOPE_MISMATCH refusal;
 * - a removed account (the listing's positive removed record, level 5): it says it was removed, and reads nothing;
 * - anything else (an activated or legacy account, an account the listing does not name, an unreadable listing): the normal
 *   readers mount and word their own answers (queued / not published / held / unavailable / refused) -- never as empty.
 */
import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { BasicInventoryView, identityKey, useDiscoveryStatus } from "@/components/accounts/basic-inventory-view"
import { DeclarableAccountInventory } from "@/components/system-boundary/declarable-account-inventory"
import { useAccountScope } from "@/lib/account-scope-context"
import {
  fetchDiscovery,
  fetchResourcesPage,
  statusFallback,
  type DiscoveryFetcher,
  type ResourcesFetcher,
} from "@/lib/account-resources"
import {
  accountAdminFailure,
  collectionNotStarted,
  removedAccountSentence,
  type AccountListResponse,
  type ManagedAccount,
  type RemovedAccount,
} from "@/lib/account-admin"

export type AccountListing =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; account: ManagedAccount | null; removed: RemovedAccount | null }

/** The listing's view of ONE account: its live row, or (when it is not listed again) its latest removal. */
export function useAccountListing(accountId: string): { listing: AccountListing; reload: () => Promise<void> } {
  const customerId = useAccountScope().customerId
  const [listing, setListing] = useState<AccountListing>({ state: "loading" })
  const reload = useCallback(async () => {
    if (!customerId) return
    try {
      const response = await fetch(`/api/proxy/admin/accounts?customer_id=${encodeURIComponent(customerId)}`)
      if (!response.ok) throw await accountAdminFailure(response, "Accounts")
      const body = (await response.json()) as AccountListResponse
      setListing({
        state: "ready",
        account: (body.accounts || []).find((a) => a.account_id === accountId) ?? null,
        // Newest first: the latest removal of this account, when it is not listed again.
        removed: (body.removed || []).find((r) => r.account_id === accountId) ?? null,
      })
    } catch (reason) {
      setListing({ state: "error", message: reason instanceof Error ? reason.message : String(reason) })
    }
  }, [customerId, accountId])
  useEffect(() => { void reload() }, [reload])
  return { listing, reload }
}

/** A removed account, from the listing's removed audit: who removed it, when, and what removing kept. */
export function RemovedAccountNotice({ removed }: { removed: RemovedAccount }) {
  return (
    <div data-testid="account-removed" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
      <p className="font-semibold text-slate-800">This account was removed from Cyntro.</p>
      <p className="mt-1">{removedAccountSentence(removed)}</p>
      <p className="mt-1">Adding it again in Settings › Accounts starts a new registration that collects afresh.</p>
    </div>
  )
}

/** Before activation: the one thing the registration proves about inventory is that collection has not started. */
export function InventoryNotCollected() {
  return (
    <div data-testid="inventory-not-collected" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
      <p className="font-semibold text-slate-800">Inventory not collected yet</p>
      <p className="mt-1">
        This account is registered but has not been confirmed. Cyntro has not started inventory collection. Inventory becomes
        available after the account is confirmed and its inventory collection begins.
      </p>
    </div>
  )
}

/** What the inventory view shows for this account, given the listing; no reader mounts before the listing has answered. */
export function AccountInventoryGate({ accountId, listing }: { accountId: string; listing: AccountListing }) {
  if (listing.state === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the account…
      </p>
    )
  }
  if (listing.state === "ready") {
    if (!listing.account && listing.removed) return <RemovedAccountNotice removed={listing.removed} />
    if (listing.account && collectionNotStarted(listing.account)) return <InventoryNotCollected />
  }
  // Keyed by account: nothing one account's reader holds (status, pages, an open drawer) is ever shown under another.
  return <InventorySource key={accountId} accountId={accountId} account={listing.state === "ready" ? listing.account : null} />
}

/** Basic discovery's current authority refuses the run (removed, reads off, purge pending, ...): nothing of it is shown. */
export function DiscoveryHeldNotice({ heldBy }: { heldBy: string | null }) {
  return (
    <div data-testid="discovery-held" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
      <p className="font-semibold text-slate-800">This account&apos;s resources cannot be shown now.</p>
      <p className="mt-1">
        Its current registration does not allow reading them{heldBy ? ` (${heldBy})` : ""}. Nothing discovered earlier is shown.
      </p>
    </div>
  )
}

/** The status read failed (network or server): nothing is proved, so no reader mounts -- named, with a retry. */
export function DiscoveryStatusUnavailable({ reasonCode, onRetry }: { reasonCode: string | null; onRetry: () => void }) {
  return (
    <div data-testid="discovery-unavailable" role="alert" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
      <p className="font-semibold text-slate-800">The inventory is unavailable right now.</p>
      <p className="mt-1">Cyntro could not read this account&apos;s discovery status{reasonCode ? ` (${reasonCode})` : ""}.</p>
      <button type="button" className="mt-2 text-sm font-semibold text-teal-700 underline" onClick={onRetry}>Retry</button>
    </div>
  )
}

/**
 * Which reader shows this account's inventory -- per REGISTRATION (basic resource discovery's rollout): a registration whose
 * confirmation started a discovery run reads its live BASIC listing (account_resources/v1), one view per account +
 * registration + run; a HELD run shows that it is held and nothing of it; a status that could not be read is named, with
 * a retry. No run (NOT_REQUESTED), a backend without the route or a refusal keeps the published inventory reader, exactly
 * as before. Mount one per account (the gate keys it).
 */
export function InventorySource({ accountId, account, fetchStatus = fetchDiscovery, fetchPage = fetchResourcesPage, pollMs }: {
  accountId: string
  account: ManagedAccount | null
  fetchStatus?: DiscoveryFetcher
  fetchPage?: ResourcesFetcher
  pollMs?: number
}) {
  const { status, refreshFailed, refresh } = useDiscoveryStatus(accountId, fetchStatus, pollMs)
  if (status.kind === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the inventory…
      </p>
    )
  }
  if (status.kind === "status" && status.coverageState === "HELD") return <DiscoveryHeldNotice heldBy={status.heldBy} />
  if (status.kind === "status" && status.coverageState !== "NOT_REQUESTED" && status.registrationId && status.runId) {
    const label = account?.display_name && account.display_name !== accountId ? `${account.display_name} (${accountId})` : accountId
    const bound = { ...status, registrationId: status.registrationId, runId: status.runId }
    return (
      <BasicInventoryView key={identityKey({ accountId, registrationId: bound.registrationId, runId: bound.runId })}
        accountId={accountId} accountLabel={label} status={bound} fetchPage={fetchPage} refreshFailed={refreshFailed}
        onRefreshStatus={() => void refresh()} />
    )
  }
  if (status.kind === "outcome" && statusFallback(status) === "unavailable") {
    return <DiscoveryStatusUnavailable reasonCode={status.reasonCode} onRetry={() => void refresh()} />
  }
  // The listed row (when there is one) lets the inventory and census say a not-yet-shown answer from the data's real stage.
  return <DeclarableAccountInventory accountId={accountId} account={account} />
}

/** /accounts/{accountId}/inventory: the same gate over its own listing read. */
export function AccountInventoryEntry({ accountId }: { accountId: string }) {
  const { listing } = useAccountListing(accountId)
  return <AccountInventoryGate accountId={accountId} listing={listing} />
}
