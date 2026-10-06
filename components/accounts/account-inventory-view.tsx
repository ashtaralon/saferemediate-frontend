"use client"

/**
 * One account's published resource inventory, read-only (T11b; grouped by type in I3). Browse only, unless a caller hands
 * it a selection hook (`selection`, lib/account-inventory.ts InventorySelection): then each table offers a box per
 * selectable row and the caller owns every pick. Nothing is ever assigned or changed from here.
 *
 * The reader is KEYED by (customer, account, filter): a change of any of them mounts a fresh reader, so the very first
 * committed output after the change already belongs to the new key -- no row of the previous account or filter is ever
 * committed under the new heading, even before effects run. Inside one reader, every page request is issued under the
 * current EPOCH and checked again when it completes (lib/account-inventory.ts), so a same-key refresh, restart or retry
 * never revives an earlier answer; a superseded reader's completions are ignored outright.
 * The inventory is account-wide: the global Region selection does not filter it, and the page says so.
 *
 * Unfiltered, a publication that records its account-wide counts (I2(b2) totals.by_type) is shown BY TYPE
 * (components/accounts/inventory-grouped.tsx); "List" shows every resource in one cursor-paged table, and an older backend
 * (no counts) only that. A type filter shows that type's own columns. Any resource's name opens its drill-down.
 */

import { useEffect, useRef, useState } from "react"
import { GroupedInventory } from "@/components/accounts/inventory-grouped"
import { InventoryResourceDrawer } from "@/components/accounts/inventory-resource-drawer"
import { InventoryRowsTable } from "@/components/accounts/inventory-rows-table"
import { useInventoryRead } from "@/components/accounts/use-inventory-read"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  fetchInventoryPage,
  publicationsEqual,
  type InventoryFetcher,
  type InventoryRow,
  type InventorySelection,
  type PublicationIdentity,
} from "@/lib/account-inventory"
import { inventoryOutcomeCopy } from "@/lib/inventory-copy"
import { inventoryTypeMeta } from "@/lib/inventory-types"

export type RosterState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; displayName: string | null }

export type InventoryLayout = "grouped" | "list"

export interface AccountInventoryViewProps {
  accountId: string
  customerId: string | null
  /** The global scope's Region ("all" when not narrowed); shown only -- it does not filter the inventory. */
  region: string
  resourceType: string | null
  roster: RosterState
  onResourceTypeChange: (resourceType: string | null) => void
  /** Injectable for tests; defaults to this console's proxy. */
  fetchPage?: InventoryFetcher
  /** Declaring from the inventory (AccountOnboardingPhase2's flow): the caller's picks. Absent: browse only. */
  selection?: InventorySelection
}

export function AccountInventoryView(props: AccountInventoryViewProps) {
  // The layout is the person's choice, kept across account and filter changes (outside the keyed reader).
  const [layout, setLayout] = useState<InventoryLayout>("grouped")
  const readerKey = JSON.stringify([props.customerId, props.accountId, props.resourceType])
  return <InventoryReader key={readerKey} {...props} layout={layout} onLayoutChange={setLayout} />
}

function InventoryReader({
  accountId,
  customerId,
  region,
  resourceType,
  roster,
  onResourceTypeChange,
  fetchPage = fetchInventoryPage,
  selection,
  layout,
  onLayoutChange,
}: AccountInventoryViewProps & { layout: InventoryLayout; onLayoutChange: (layout: InventoryLayout) => void }) {
  const { model, loadMore, refresh } = useInventoryRead(customerId, accountId, resourceType, fetchPage)
  // The shown publication, told to the selection's owner when it is first shown or changes.
  const told = useRef<PublicationIdentity | null>(null)
  const shownPublication = model.kind === "data" ? model.publication : null
  const onPublication = selection?.onPublication
  useEffect(() => {
    if (shownPublication === null || !onPublication) return
    if (told.current !== null && publicationsEqual(told.current, shownPublication)) return
    told.current = shownPublication
    onPublication(shownPublication)
  }, [shownPublication, onPublication])
  const [filterDraft, setFilterDraft] = useState(resourceType ?? "")
  const [opened, setOpened] = useState<InventoryRow | null>(null)

  const accountLabel = roster.status === "ready" && roster.displayName ? `${roster.displayName} (${accountId})` : accountId
  const grouping = model.kind === "data" && resourceType === null && model.byType !== null
  const grouped = grouping && layout === "grouped"

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Inventory — {accountLabel}</h1>
        {roster.status === "loading" ? <p className="text-xs text-slate-500">Loading account list…</p> : null}
        {roster.status === "unavailable" ? (
          <p className="text-xs text-slate-500">Account list unavailable; showing account {accountId}.</p>
        ) : null}
        <p className="mt-1 text-xs text-slate-600" data-testid="inventory-scope">
          Account-wide: every published Region of this account.
          {region && region !== "all" ? ` Your Region selection (${region}) does not filter this inventory.` : ""}
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const next = filterDraft.trim()
          onResourceTypeChange(next ? next : null)
        }}
      >
        <Input
          aria-label="Resource type"
          placeholder="Resource type, e.g. s3:bucket"
          value={filterDraft}
          onChange={(event) => setFilterDraft(event.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" variant="outline" size="sm">Filter</Button>
        {resourceType !== null ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onResourceTypeChange(null)}>Clear</Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={refresh}>
          Refresh
        </Button>
        {grouping ? (
          <div role="group" aria-label="Layout" className="ml-auto flex overflow-hidden rounded-md border border-slate-200">
            {(["grouped", "list"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={layout === value}
                onClick={() => onLayoutChange(value)}
                className={`px-3 py-1 text-xs font-semibold ${layout === value ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {value === "grouped" ? "By type" : "List"}
              </button>
            ))}
          </div>
        ) : null}
      </form>

      {model.kind === "loading" ? <p className="text-sm text-slate-500">Loading inventory…</p> : null}

      {model.kind === "republishing" ? (
        <div className="flex items-center gap-3 text-sm text-slate-700" role="status">
          <span>This inventory is being republished.</span>
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : null}

      {model.kind === "evidence" || model.kind === "refused" || model.kind === "unavailable" ? (
        <p className="text-sm text-slate-700" role="status">{inventoryOutcomeCopy(model)}</p>
      ) : null}

      {model.kind === "data" ? (
        <div className="space-y-3">
          {!model.inventoryComplete ? (
            <p className="text-sm text-amber-800" role="status">
              This inventory is partial: some resources of this account may be missing from it.
            </p>
          ) : null}
          {model.state === "complete_empty" ? (
            <p className="text-sm text-slate-700" role="status">
              This account&apos;s published inventory is complete and contains no resources.
            </p>
          ) : null}
          {model.state === "filter_empty" ? (
            <p className="text-sm text-slate-700" role="status">
              No resources of type {resourceType} in this account&apos;s published inventory
              ({model.totals.accountTotal} resources in total).
            </p>
          ) : null}
          {model.state === "populated" && grouped && model.byType !== null ? (
            <GroupedInventory
              customerId={customerId}
              accountId={accountId}
              byType={model.byType}
              byRegion={model.byRegion}
              accountTotal={model.totals.accountTotal}
              fetchPage={fetchPage}
              onOpen={setOpened}
              selection={selection}
            />
          ) : null}
          {model.state === "populated" && !grouped ? (
            <>
              <p className="text-xs text-slate-500">
                Showing {model.rows.length} of {model.totals.filterTotal}
                {resourceType !== null ? ` ${inventoryTypeMeta(resourceType).label} (${resourceType})` : ""} resources
                {resourceType !== null ? ` (${model.totals.accountTotal} in the account)` : ""}.
              </p>
              <InventoryRowsTable rows={model.rows} resourceType={resourceType} onOpen={setOpened}
                selection={selection} publication={model.publication} />
              {model.hasMore ? (
                <Button type="button" variant="outline" size="sm" onClick={loadMore} disabled={model.loadingMore}>
                  {model.loadingMore ? "Loading…" : "Load more"}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {opened !== null ? (
        <InventoryResourceDrawer row={opened} accountLabel={accountLabel} onClose={() => setOpened(null)} />
      ) : null}
    </div>
  )
}
