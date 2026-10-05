"use client"

/**
 * An account's overview on its own page (Alon 2026-10-05: "for each account ... click on it"): what Settings > Accounts
 * knows about it -- status, Regions, the connection facts the connector recorded, its first inventory and, by resource type,
 * what each of that inventory's runs recorded. Every value is the backend's listing (GET /api/admin/accounts); nothing is
 * computed here but the per-type rows' order. A count is shown only where its run measured it.
 */
import Link from "next/link"
import { FirstCollectionStatus } from "@/components/settings/registration-journey"
import { MemberStatusBadge } from "@/components/settings/connect-account-panel"
import {
  discoveryCaveats,
  discoverySummary,
  firstInventoryByType,
  formatUtcInstantExact,
  type ManagedAccount,
} from "@/lib/account-admin"

export function AccountOverview({ account }: { account: ManagedAccount }) {
  const outcome = account.registration?.first_inventory ?? null
  const rows = firstInventoryByType(outcome)
  const measured = rows.filter((row) => row.records !== null)
  const summary = account.onboarding_status === "CONNECTED" ? discoverySummary(account.sources) : null
  const caveats = account.onboarding_status === "CONNECTED" ? discoveryCaveats(account.sources) : []
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="account-connection-title">
        <h2 id="account-connection-title" className="text-sm font-semibold text-slate-900">Connection</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-slate-500">Status</dt><dd><MemberStatusBadge status={account.onboarding_status} /></dd>
          <dt className="text-slate-500">AWS account</dt><dd className="font-mono">{account.account_id}</dd>
          <dt className="text-slate-500">Name in AWS</dt><dd>{account.aws_account_name || "not read yet"}</dd>
          <dt className="text-slate-500">Regions</dt><dd>{account.regions?.length ? account.regions.join(", ") : "none recorded"}</dd>
          <dt className="text-slate-500">Read access</dt><dd>{account.read_enabled ? "on" : "off"}</dd>
        </dl>
        {account.validation_message ? <p className="mt-3 text-xs text-slate-600">{account.validation_message}</p> : null}
        {summary ? <p className="mt-1 text-xs text-slate-500">{summary}</p> : null}
        {caveats.map((caveat) => <p key={caveat} className="mt-1 text-xs text-amber-800">{caveat}</p>)}
        <div className="mt-3"><FirstCollectionStatus account={account} /></div>
        <Link href="/settings/accounts" className="mt-3 inline-block text-xs font-semibold text-teal-700 hover:text-teal-800">
          Manage in Settings › Accounts
        </Link>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="account-first-inventory-title">
        <h2 id="account-first-inventory-title" className="text-sm font-semibold text-slate-900">First inventory by resource type</h2>
        {!outcome || outcome.state === "NOT_ACTIVATED" ? (
          <p data-testid="first-inventory-by-type-empty" className="mt-2 text-xs text-slate-500">
            No first inventory yet: it is queued when the account is confirmed.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-slate-500">
              What each work item&apos;s run recorded
              {outcome.observed_at ? ` (as of ${formatUtcInstantExact(outcome.observed_at)})` : ""}.
              {measured.length === rows.length && typeof outcome.facts_emitted_total === "number"
                ? ` ${outcome.facts_emitted_total} resource records in all.`
                : " A count appears only where its run measured it."}
              {" "}These are collected records; the resources served on the Inventory tab come from the published inventory.
            </p>
            <table data-testid="first-inventory-by-type" className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 font-semibold">Resource type</th>
                  <th className="py-2 font-semibold">Region</th>
                  <th className="py-2 font-semibold">Status</th>
                  <th className="py-2 text-right font-semibold">Records</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.sourceType}|${row.region ?? ""}`} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-1.5">{row.label}</td>
                    <td className="py-1.5 font-mono text-xs text-slate-500">{row.region ?? "—"}</td>
                    <td className="py-1.5 text-xs text-slate-600">{row.state.toLowerCase().replace(/_/g, " ")}</td>
                    <td className="py-1.5 text-right font-mono">{row.records === null ? <span className="text-slate-400" title="not measured by its run">—</span> : row.records}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  )
}
