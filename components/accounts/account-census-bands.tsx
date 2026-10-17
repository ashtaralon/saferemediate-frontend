"use client"

/**
 * The account census around the account's inventory (A7 S1c; agent-coordinator/claude-a7-s1c-page-semantics-2026-10-06.txt):
 *
 *   band 1 -- COVERAGE first: per Region and source, what each source answered, in words, with its count only beside its
 *             state (R-a); when neither AWS Config nor Resource Explorer answered in a Region, that never-tagged resources
 *             of uncollected types cannot be observed there (R-b);
 *   band 2 -- the account's inventory exactly as today (`children`: the inventory panel, its labels, its drill-down and its
 *             selection);
 *   band 3 -- LISTED ONLY: what only the census names, grouped by service, rendered generically ("service . type"), never
 *             selectable (R-d, R-e); deleted stack resources greyed and counted only as deleted (R-c); and, under their
 *             own heading, types Cyntro collects in depth whose rows wait for this account's inventory to be published.
 *
 * Every number comes from the published census; nothing is estimated. An answer without rows says why, in words.
 */
import type { ReactNode } from "react"
import { censusStageText, type ManagedAccount } from "@/lib/account-admin"
import { useCensusRead, PUBLICATION_MOVED, type CensusModel } from "@/components/accounts/use-census-read"
import {
  DEPTH_INVENTORY_PENDING,
  DEPTH_LISTED_ONLY,
  fetchCensusPage,
  groupByService,
  notObservableSentence,
  outcomeSentence,
  rowName,
  scopeSentence,
  sourceLabel,
  type CensusData,
  type CensusFetcher,
  type CensusRow,
} from "@/lib/account-census"

function asOf(data: CensusData): string {
  const newest = data.coverage.scopes.map((scope) => scope.collected_at).sort().at(-1)
  const instant = newest ? new Date(newest) : new Date(data.publication.publishedAtEpoch * 1000)
  return Number.isNaN(instant.getTime()) ? "an unknown time" : `${instant.toISOString().slice(0, 16).replace("T", " ")} UTC`
}

function inventoryWaitSentence(data: CensusData): string {
  const reason = data.publication.inventory.reason
  const why = reason === "no_publication_recorded" ? "it has not been published yet" : reason ? `it is held (${reason})` : "it is not served"
  return `These types are collected in depth, but this account's inventory is not shown: ${why}. They become selectable when it is published.`
}

function CoverageBand({ data }: { data: CensusData }) {
  const { coverage, totals } = data
  return (
    <section aria-label="Census coverage" className="rounded-md border border-slate-200 bg-white p-4 text-sm">
      <h2 className="text-base font-semibold text-slate-900">Everything in this account</h2>
      <p className="mt-1 text-slate-700">
        Census as of {asOf(data)}. Coverage: <strong>{coverage.accountState === "COMPLETE" ? "complete" : "partial"}</strong>.
      </p>
      <ul aria-label="Sources" className="mt-2 list-disc space-y-0.5 pl-5 text-slate-700">
        {coverage.scopes.map((scope) => (
          <li key={`${scope.region}/${scope.source}`}>{scopeSentence(scope)}</li>
        ))}
      </ul>
      {coverage.notObservable && (
        <p role="note" className="mt-2 text-amber-800">{notObservableSentence(coverage.notObservableRegions)}</p>
      )}
      {totals.byDepth.inventory_pending > 0 && (
        <p role="note" className="mt-2 text-amber-800">
          This account&apos;s inventory is not published, so {totals.byDepth.inventory_pending} resources of collected types are
          listed below until it is.
        </p>
      )}
      <p aria-label="Census totals" className="mt-2 text-slate-600">
        Collected in depth {totals.byDepth.collected} · Listed only {totals.byDepth.listed_only}
        {totals.byDepth.inventory_pending > 0 ? ` · Inventory pending ${totals.byDepth.inventory_pending}` : ""} · Deleted {totals.deleted}
      </p>
    </section>
  )
}

function CensusRowItem({ row }: { row: CensusRow }) {
  return (
    <li className={row.deleted ? "text-slate-400" : "text-slate-800"} aria-label={`${rowName(row)}${row.deleted ? " (deleted)" : ""}`}>
      <span className="mr-2 text-xs text-slate-500">{row.resource_type.replace(":", " · ")}</span>
      <span className="font-medium">{rowName(row)}</span>
      <span className="ml-2 text-xs text-slate-500">{row.region}</span>
      <span className="ml-2 text-xs text-slate-500">{row.sources.map(sourceLabel).join(", ")}</span>
      {row.cfn && <span className="ml-2 text-xs text-slate-500">stack resource {row.cfn.logical_id}</span>}
      {row.deleted && <span className="ml-2 text-xs font-semibold uppercase">deleted</span>}
      {row.tags && Object.keys(row.tags).length > 0 && (
        <span className="ml-2 text-xs text-slate-500">{Object.keys(row.tags).length} tags</span>
      )}
    </li>
  )
}

function RowGroups({ rows, label }: { rows: CensusRow[]; label: string }) {
  return (
    <div aria-label={label} className="space-y-3">
      {groupByService(rows).map((group) => (
        <div key={group.service}>
          <h4 className="text-sm font-semibold text-slate-800">{group.service}</h4>
          <ul aria-label={`${group.service} resources`} className="mt-1 space-y-0.5 pl-4 text-sm">
            {group.rows.map((row) => <CensusRowItem key={row.row_key} row={row} />)}
          </ul>
        </div>
      ))}
    </div>
  )
}

function MoreButton({ model, onMore, label }: { model: CensusModel; onMore: () => void; label: string }) {
  if (model.kind !== "data" || model.nextCursor === null) return null
  return (
    <button type="button" onClick={onMore} disabled={model.loadingMore}
      className="mt-2 rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-50">
      {model.loadingMore ? "Loading…" : `Show more ${label}`}
    </button>
  )
}

/** Census answers whose words the account's data stage may say more truly (census.state); an install fact -- census
 *  disabled or stopped -- is never replaced. */
function stageMaySpeak(outcome: { state: string; reasonCode?: string | null }): boolean {
  const code = outcome.reasonCode ?? ""
  if (outcome.state === "held") return code.includes("CONSUMER_NOT_READY")
  return outcome.state === "not_published" && code !== "CENSUS_DISABLED" && code !== "CENSUS_STOPPED"
}

export function AccountCensusBands({ accountId, children, fetchPage = fetchCensusPage, account = null }: {
  accountId: string
  children: ReactNode
  fetchPage?: CensusFetcher
  /** The account's listed row, when known: a census not shown yet is said from census.state and the data's stage. */
  account?: ManagedAccount | null
}) {
  const listed = useCensusRead(accountId, DEPTH_LISTED_ONLY, fetchPage)
  const pending = useCensusRead(accountId, DEPTH_INVENTORY_PENDING, fetchPage)
  const model = listed.model

  let band1: ReactNode
  if (model.kind === "loading") {
    band1 = <p className="text-sm text-slate-500">Loading the census…</p>
  } else if (model.kind === "outcome") {
    const sentence = model.outcome.reasonCode === PUBLICATION_MOVED
      ? "The census changed while it was being read; refresh to read the current one."
      : (account && stageMaySpeak(model.outcome) ? censusStageText(account) : null) ?? outcomeSentence(model.outcome)
    band1 = (
      <section aria-label="Census coverage" className="rounded-md border border-slate-200 bg-white p-4 text-sm">
        <h2 className="text-base font-semibold text-slate-900">Everything in this account</h2>
        <p role="status" className="mt-1 text-slate-700">{sentence}</p>
      </section>
    )
  } else {
    band1 = <CoverageBand data={model.first} />
  }

  const listedRows = model.kind === "data" ? model.rows : []
  const pendingRows = pending.model.kind === "data" ? pending.model.rows : []

  return (
    <div className="space-y-4">
      {band1}
      {children}
      {model.kind === "data" && (
        <section aria-label="Listed only" className="rounded-md border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-slate-900">Listed only (not yet collected in depth)</h3>
          <p className="mt-1 text-sm text-slate-600">
            Named by the census sources above. Becomes selectable once Cyntro collects the type in depth.
          </p>
          {listedRows.length === 0
            ? <p className="mt-2 text-sm text-slate-500">Nothing is listed only.</p>
            : <div className="mt-3"><RowGroups rows={listedRows} label="Listed only by service" /></div>}
          <MoreButton model={model} onMore={listed.loadMore} label="listed resources" />
          {pending.model.kind === "outcome" && model.first.totals.byDepth.inventory_pending > 0 && (
            <p role="status" className="mt-4 text-sm text-amber-800">
              {model.first.totals.byDepth.inventory_pending} resources of collected types wait for this account&apos;s
              inventory, but they could not be read: {outcomeSentence(pending.model.outcome)}
            </p>
          )}
          {pendingRows.length > 0 && pending.model.kind === "data" && (
            <div className="mt-4">
              <h3 className="text-base font-semibold text-slate-900">Collected in depth, inventory not published</h3>
              <p className="mt-1 text-sm text-slate-600">{inventoryWaitSentence(pending.model.first)}</p>
              <div className="mt-3"><RowGroups rows={pendingRows} label="Inventory pending by service" /></div>
              <MoreButton model={pending.model} onMore={pending.loadMore} label="pending resources" />
            </div>
          )}
        </section>
      )}
    </div>
  )
}
