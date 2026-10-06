"use client"

/**
 * The account inventory by resource type (Alon 2026-10-06: "rows with service type, drill down to see all the relevant
 * services/components of the service, icons with the service type, colors"):
 * - summary cards per category, each the sum of the publication's own account-wide counts (totals.by_type) -- a card narrows
 *   the list to its category, nothing is fetched for it;
 * - the publication's count per Region (totals.by_region) when it records one;
 * - one expandable group per type: its icon and colors, its count, and -- once opened -- its rows, read by a reader of their
 *   own for exactly that type (the route's type filter, paged by cursor), shown with the type's own columns.
 * Every number on this view is the publication's; nothing is counted from the rows a browser happened to load.
 */
import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { InventoryRowsTable } from "@/components/accounts/inventory-rows-table"
import { InventoryTypeTile } from "@/components/accounts/inventory-type-tile"
import { useInventoryRead } from "@/components/accounts/use-inventory-read"
import { Button } from "@/components/ui/button"
import type { InventoryFetcher, InventoryRow } from "@/lib/account-inventory"
import { inventoryOutcomeCopy } from "@/lib/inventory-copy"
import { INVENTORY_CATEGORY_LABEL, inventoryTypeMeta, type InventoryCategory } from "@/lib/inventory-types"

const CATEGORY_ORDER: InventoryCategory[] = ["compute", "data", "identity", "network", "other"]

interface GroupedInventoryProps {
  customerId: string | null
  accountId: string
  byType: Record<string, number>
  byRegion: Record<string, number> | null
  accountTotal: number
  fetchPage: InventoryFetcher
  onOpen: (row: InventoryRow) => void
}

export function GroupedInventory({
  customerId, accountId, byType, byRegion, accountTotal, fetchPage, onOpen,
}: GroupedInventoryProps) {
  const [category, setCategory] = useState<InventoryCategory | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const types = Object.entries(byType).map(([resourceType, count]) => ({ meta: inventoryTypeMeta(resourceType), count }))
  const perCategory = new Map<InventoryCategory, number>()
  for (const { meta, count } of types) perCategory.set(meta.category, (perCategory.get(meta.category) ?? 0) + count)
  const shown = types
    .filter(({ meta }) => category === null || meta.category === category)
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.meta.category) - CATEGORY_ORDER.indexOf(b.meta.category)
      || b.count - a.count || a.meta.label.localeCompare(b.meta.label))

  const toggle = (resourceType: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(resourceType)) next.delete(resourceType)
    else next.add(resourceType)
    return next
  })

  const card = (key: InventoryCategory | null, label: string, count: number) => (
    <button
      key={key ?? "all"}
      type="button"
      aria-pressed={category === key}
      onClick={() => setCategory(key)}
      data-testid={`inventory-card-${key ?? "all"}`}
      className={`rounded-lg border p-3 text-left ${category === key ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{count}</p>
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {card(null, "All resources", accountTotal)}
        {CATEGORY_ORDER.filter((key) => (perCategory.get(key) ?? 0) > 0)
          .map((key) => card(key, INVENTORY_CATEGORY_LABEL[key], perCategory.get(key) ?? 0))}
      </div>

      {byRegion !== null && Object.keys(byRegion).length > 0 ? (
        <p className="text-xs text-slate-600" data-testid="inventory-regions">
          By Region:{" "}
          {Object.entries(byRegion)
            .map(([region, count]) => `${region === "global" ? "Global" : region} ${count}`)
            .join(" · ")}
        </p>
      ) : null}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white" aria-label="Resource types">
        {shown.map(({ meta, count }) => {
          const open = expanded.has(meta.resourceType)
          return (
            <li key={meta.resourceType} data-testid="inventory-group">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(meta.resourceType)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
              >
                {open ? <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
                  : <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />}
                <InventoryTypeTile resourceType={meta.resourceType} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{meta.label}</span>
                  <span className="block font-mono text-[11px] text-slate-400">{meta.resourceType}</span>
                </span>
                <span className="text-[11px] text-slate-500">{INVENTORY_CATEGORY_LABEL[meta.category]}</span>
                <span className="w-12 text-right text-sm font-semibold text-slate-800" data-testid="inventory-group-count">{count}</span>
              </button>
              {open ? (
                <div className="border-t border-slate-100 px-3 py-2">
                  <TypeGroup
                    key={meta.resourceType}
                    customerId={customerId}
                    accountId={accountId}
                    resourceType={meta.resourceType}
                    fetchPage={fetchPage}
                    onOpen={onOpen}
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** One opened type: its own reader (the route's type filter), paged by cursor; its own answer, worded like the page's. */
function TypeGroup({
  customerId, accountId, resourceType, fetchPage, onOpen,
}: {
  customerId: string | null
  accountId: string
  resourceType: string
  fetchPage: InventoryFetcher
  onOpen: (row: InventoryRow) => void
}) {
  const { model, loadMore, refresh } = useInventoryRead(customerId, accountId, resourceType, fetchPage)
  if (model.kind === "loading") return <p className="text-xs text-slate-500">Loading…</p>
  if (model.kind === "republishing") {
    return (
      <div className="flex items-center gap-3 text-xs text-slate-700" role="status">
        <span>This inventory is being republished.</span>
        <Button type="button" variant="outline" size="sm" onClick={refresh}>Retry</Button>
      </div>
    )
  }
  if (model.kind !== "data") return <p className="text-xs text-slate-700" role="status">{inventoryOutcomeCopy(model)}</p>
  if (model.state !== "populated") {
    return <p className="text-xs text-slate-700" role="status">The current publication has none of these resources.</p>
  }
  return (
    <div className="space-y-2">
      <InventoryRowsTable rows={model.rows} resourceType={resourceType} onOpen={onOpen} />
      {model.hasMore ? (
        <Button type="button" variant="outline" size="sm" onClick={loadMore} disabled={model.loadingMore}>
          {model.loadingMore ? "Loading…" : `Load more (${model.rows.length} of ${model.totals.filterTotal})`}
        </Button>
      ) : null}
    </div>
  )
}
