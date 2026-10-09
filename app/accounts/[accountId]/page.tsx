"use client"

/**
 * /accounts/{accountId}: one account (Alon 2026-10-05: "for each account we need the option to click on it, and have like
 * inventory"). Opened from Settings > Accounts. Overview: what the account registry knows about it (status, connection
 * facts, its first inventory by resource type). Inventory: its published inventory (T11b), read-only.
 *
 * The PATH account is authoritative; the tab is in the URL (?tab=inventory) so a link or reload opens the same view.
 * A removed account is no longer listed; the listing's removed audit (level 5) says who removed it and when. Its Inventory
 * tab says the same instead of reading an inventory this installation no longer serves (QA-04: that read is refused as
 * INVENTORY_SCOPE_MISMATCH, which is not "you are not authorized"). An account whose option-C registration is not activated
 * yet says collection has not started, and reads nothing either (r41). Both decisions are the shared AccountInventoryGate's,
 * which /accounts/{id}/inventory uses too. Only those positive records hide the read: an account merely absent from the
 * listing is still read, and a refusal is worded by its own code (lib/inventory-copy.ts).
 * Nothing is fetched for the platform account's own collection here: the page reads the same listing Settings reads.
 */
import { Suspense, use, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { LeftSidebarNav } from "@/components/left-sidebar-nav"
import { AccountInventoryGate, RemovedAccountNotice, useAccountListing } from "@/components/accounts/account-inventory-gate"
import { AccountOverview } from "@/components/accounts/account-overview"
import { accountLabel } from "@/lib/account-admin"
import { DECLARE_FLOW_PARAM } from "@/lib/system-boundary-entry"

const TABS = [["overview", "Overview"], ["inventory", "Inventory"]] as const
type Tab = (typeof TABS)[number][0]

interface Props {
  params: Promise<{ accountId: string }>
}

function AccountPage({ accountId }: { accountId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab: Tab = searchParams.get("tab") === "inventory" ? "inventory" : "overview"
  const { listing } = useAccountListing(accountId)

  const select = useCallback((next: Tab) => {
    const query = new URLSearchParams(searchParams.toString())
    if (next === "overview") query.delete("tab")
    else query.set("tab", next)
    if (next !== "inventory") {
      query.delete("resource_type")
      query.delete(DECLARE_FLOW_PARAM)
    }
    const suffix = query.toString()
    router.replace(suffix ? `${pathname}?${suffix}` : pathname)
  }, [router, pathname, searchParams])

  const account = listing.state === "ready" ? listing.account : null
  const removed = listing.state === "ready" && !account ? listing.removed : null
  const removedName = removed?.display_name && removed.display_name !== accountId ? removed.display_name : null
  const title = account ? accountLabel(account) : removedName ?? accountId

  return (
    <div className="flex min-h-[calc(100vh-44px)] bg-[#f3f6f7] text-slate-900">
      <LeftSidebarNav activeItem="settings" />
      <main className="min-w-0 flex-1">
        <div className="border-b border-slate-200 bg-white px-8 py-6">
          <Link href="/settings/accounts" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Accounts
          </Link>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">AWS account</p>
          <h1 data-testid="account-page-title" className="mt-1 text-2xl font-semibold">{title}</h1>
          {title !== accountId ? <p className="mt-1 font-mono text-sm text-slate-500">{accountId}</p> : null}
          <div role="tablist" aria-label="Account views" className="mt-5 flex gap-4">
            {TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => select(value)}
                className={`border-b-2 px-1 pb-2 text-sm font-semibold ${tab === value ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-8 py-6">
          {tab === "inventory" && listing.state !== "loading" && removed === null ? (
            <AccountInventoryGate accountId={accountId} listing={listing} />
          ) : listing.state === "loading" ? (
            <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the account…</p>
          ) : listing.state === "error" ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{listing.message}</p>
          ) : removed ? (
            <RemovedAccountNotice removed={removed} />
          ) : account === null ? (
            <p data-testid="account-not-listed" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Account {accountId} is not in this installation&apos;s account list. Settings › Accounts lists the accounts this installation reads.
            </p>
          ) : (
            <AccountOverview account={account} />
          )}
        </div>
      </main>
    </div>
  )
}

export default function AccountRoute({ params }: Props) {
  const { accountId } = use(params)
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading account…</div>}>
      <AccountPage accountId={accountId} />
    </Suspense>
  )
}
