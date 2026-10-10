"use client"

/**
 * One account's resources as basic discovery finds them (backend account_resources/v1), in the existing Inventory layout:
 * the same heading, category cards, type groups with their icons, rows table and drill-down -- with the run's honest status.
 *
 * - Counts say "found so far" until the run is complete against its own plan (every enabled Region and global resources).
 * - The scope line names the Regions the run actually enumerated; a refused Region listing says so.
 * - Coverage gaps are named per type: access needed (with the missing action), not supported yet, partial, throttled --
 *   never "0 resources".
 * - While the run is moving the page refreshes every 2 seconds, only while the tab is visible; it stops once the run is
 *   complete, held or not requested.
 * - Rows are BASIC: never selectable, never "verified"; the drill-down says "Observed from AWS ... · Basic discovery".
 *
 * Every page request is issued under the current EPOCH and dropped when it completes under another (an older account, filter
 * or refresh never replaces a newer answer); a cursor the backend no longer accepts (409) restarts at page one.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { InventoryResourceDrawer } from "@/components/accounts/inventory-resource-drawer"
import { InventoryRowsTable } from "@/components/accounts/inventory-rows-table"
import { InventoryTypeTile } from "@/components/accounts/inventory-type-tile"
import { Button } from "@/components/ui/button"
import type { InventoryRow, PublicationIdentity } from "@/lib/account-inventory"
import {
  CURSOR_RESTART_REQUIRED,
  LIVE_COVERAGE,
  basicEvidence,
  fetchDiscovery,
  fetchResourcesPage,
  gapStatusCopy,
  parseDiscoveryResponse,
  parseResourcesResponse,
  toInventoryRow,
  type BasicEvidence,
  type BasicItem,
  type DiscoveryFetcher,
  type DiscoveryStatus,
  type ResourcesFetcher,
  type ResourcesOutcome,
} from "@/lib/account-resources"
import { INVENTORY_CATEGORY_LABEL, inventoryTypeMeta, type InventoryCategory } from "@/lib/inventory-types"

export const POLL_MS = 2000
const CATEGORY_ORDER: InventoryCategory[] = ["compute", "data", "identity", "network", "other"]

type StatusModel = { kind: "loading" } | DiscoveryStatus | ResourcesOutcome

/** The run's status, polled every POLL_MS while it is moving and the tab is visible. */
export function useDiscoveryStatus(accountId: string, fetcher: DiscoveryFetcher = fetchDiscovery, pollMs = POLL_MS) {
  const [status, setStatus] = useState<StatusModel>({ kind: "loading" })
  const epoch = useRef(0)
  const load = useCallback(async () => {
    const mine = ++epoch.current
    try {
      const { status: code, body } = await fetcher(accountId)
      if (mine === epoch.current) setStatus(parseDiscoveryResponse(code, body, accountId))
    } catch {
      if (mine === epoch.current) setStatus({ kind: "outcome", status: 0, state: "unavailable", reasonCode: "NETWORK" })
    }
  }, [accountId, fetcher])
  useEffect(() => { void load() }, [load])
  const live = status.kind === "status" && LIVE_COVERAGE.has(status.coverageState)
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void load()
    }, pollMs)
    return () => clearInterval(timer)
  }, [live, load, pollMs])
  return { status, refresh: load }
}

type PageModel =
  | { kind: "loading" }
  | ResourcesOutcome
  | { kind: "rows"; rows: BasicItem[]; nextCursor: string | null; loadingMore: boolean; runId: string; registrationId: string }

/** One live listing (optionally one type), reloaded from page one whenever ``revision`` changes. */
export function useBasicPage(accountId: string, resourceType: string | null, revision: unknown,
  fetcher: ResourcesFetcher = fetchResourcesPage) {
  const [model, setModel] = useState<PageModel>({ kind: "loading" })
  const epoch = useRef(0)
  const modelRef = useRef<PageModel>(model)
  const commit = (next: PageModel) => { modelRef.current = next; setModel(next) }

  const first = useCallback(async () => {
    const mine = ++epoch.current
    const { status, body } = await fetcher(accountId, { resourceType, cursor: null })
    if (mine !== epoch.current) return
    const parsed = parseResourcesResponse(status, body, accountId, resourceType)
    commit(parsed.kind === "page" ? { kind: "rows", rows: parsed.items, nextCursor: parsed.nextCursor, loadingMore: false,
      runId: parsed.runId, registrationId: parsed.registrationId } : parsed)
  }, [accountId, resourceType, fetcher])

  useEffect(() => { void first() }, [first, revision])

  const loadMore = useCallback(async () => {
    const current = modelRef.current
    if (current.kind !== "rows" || current.nextCursor === null || current.loadingMore) return
    const mine = epoch.current
    commit({ ...current, loadingMore: true })
    const { status, body } = await fetcher(accountId, { resourceType, cursor: current.nextCursor })
    if (mine !== epoch.current) return
    const parsed = parseResourcesResponse(status, body, accountId, resourceType)
    if (parsed.kind === "outcome" && String(parsed.reasonCode ?? "").startsWith(CURSOR_RESTART_REQUIRED)) {
      void first()                                  // the run or registration moved: start again at page one
      return
    }
    if (parsed.kind !== "page" || parsed.runId !== current.runId) {
      if (parsed.kind === "page") void first()
      else commit(parsed)
      return
    }
    const seen = new Set(current.rows.map((row) => row.resource_key))
    commit({ ...current, rows: [...current.rows, ...parsed.items.filter((row) => !seen.has(row.resource_key))],
      nextCursor: parsed.nextCursor, loadingMore: false })
  }, [accountId, resourceType, fetcher, first])

  return { model, loadMore }
}

function statusLine(status: DiscoveryStatus): string {
  const n = status.observedTotal
  const count = `${n} ${n === 1 ? "resource" : "resources"} ${status.observedTotalLabel === "found" ? "found" : "found so far"}`
  if (status.coverageState === "STARTING") return `${count} · Starting discovery`
  if (status.coverageState === "DISCOVERING") return `${count} · Discovering`
  if (status.coverageState === "COMPLETE") return `${count} · Discovery complete for supported types`
  if (status.coverageState === "COMPLETE_WITH_GAPS") {
    const gaps = status.gaps.filter((gap) => gap.status !== "UNSUPPORTED").length
    return `${count} · Discovery finished${gaps ? ` · ${gaps} ${gaps === 1 ? "gap" : "gaps"}` : ""}`
  }
  return count
}

function scopeLine(status: DiscoveryStatus): string {
  if (status.plan === null) return "Account-wide: every enabled AWS Region plus global resources (Regions are being listed)."
  if (status.plan.regionsStatus !== "LISTED") {
    return `This account's Regions could not be listed: showing ${status.plan.regions.join(", ")} and global resources only.`
  }
  const regions = status.plan.regions
  return `Account-wide: ${regions.length} enabled ${regions.length === 1 ? "Region" : "Regions"} plus global resources.`
}

/** A pseudo publication for the shared table: a BASIC row is never selectable, so it names only the run it came from. */
function runPublication(runId: string, registrationId: string): PublicationIdentity {
  return { attempt: runId, generation: 0, source_identity: "basic-discovery", authority_digest: "", registration_id: registrationId }
}

export interface BasicInventoryViewProps {
  accountId: string
  accountLabel: string
  status: DiscoveryStatus
  fetchPage?: ResourcesFetcher
}

export function BasicInventoryView({ accountId, accountLabel, status, fetchPage = fetchResourcesPage }: BasicInventoryViewProps) {
  const [layout, setLayout] = useState<"grouped" | "list">("grouped")
  const [category, setCategory] = useState<InventoryCategory | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [opened, setOpened] = useState<{ row: InventoryRow; evidence: BasicEvidence } | null>(null)
  const [coverageOpen, setCoverageOpen] = useState(false)
  // Pages reload when the run's found-count or state moves (never more often than the status poll).
  const revision = `${status.coverageState}:${status.observedTotal}`
  const types = Object.entries(status.totalsByType).map(([resourceType, count]) => ({ meta: inventoryTypeMeta(resourceType), count }))
  const perCategory = new Map<InventoryCategory, number>()
  for (const { meta, count } of types) perCategory.set(meta.category, (perCategory.get(meta.category) ?? 0) + count)
  const shown = types.filter(({ meta }) => category === null || meta.category === category)
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.meta.category) - CATEGORY_ORDER.indexOf(b.meta.category)
      || b.count - a.count || a.meta.label.localeCompare(b.meta.label))
  const open = (item: BasicItem) => setOpened({ row: toInventoryRow(item), evidence: basicEvidence(item) })
  const live = LIVE_COVERAGE.has(status.coverageState)

  return (
    <div className="space-y-4 p-6" data-testid="basic-inventory">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Inventory — {accountLabel}</h1>
        <p className="mt-1 text-xs text-slate-600" data-testid="inventory-scope">{scopeLine(status)}</p>
        <p className="mt-1 flex items-center gap-2 text-sm text-slate-800" role="status" aria-live="polite" data-testid="discovery-status">
          {live ? <Loader2 className="h-4 w-4 animate-spin text-teal-700" aria-hidden /> : null}
          {statusLine(status)}
          {status.gaps.length > 0 ? (
            <button type="button" className="text-xs font-semibold text-teal-700 underline" onClick={() => setCoverageOpen((v) => !v)}>
              {coverageOpen ? "Hide coverage" : "View coverage"}
            </button>
          ) : null}
        </p>
      </div>

      {coverageOpen ? (
        <ul className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-xs" data-testid="discovery-gaps">
          {status.gaps.map((gap) => (
            <li key={`${gap.resource_type}:${gap.status}`}>
              <span className="font-semibold">{gap.resource_type === "regions" ? "AWS Regions" : inventoryTypeMeta(gap.resource_type).label}</span>
              {" "}<span className="font-mono text-slate-400">{gap.resource_type}</span>: {gapStatusCopy(gap.status)}
              {gap.regions.length ? ` (${gap.regions.length > 3 ? `${gap.regions.length} Regions` : gap.regions.join(", ")})` : ""}
              {gap.missing_actions.length ? ` · needs ${gap.missing_actions.join(", ")}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex justify-end">
        <div role="group" aria-label="Layout" className="flex overflow-hidden rounded-md border border-slate-200">
          {(["grouped", "list"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={layout === value} onClick={() => setLayout(value)}
              className={`px-3 py-1 text-xs font-semibold ${layout === value ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              {value === "grouped" ? "By type" : "List"}
            </button>
          ))}
        </div>
      </div>

      {layout === "grouped" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[null, ...CATEGORY_ORDER.filter((key) => (perCategory.get(key) ?? 0) > 0)].map((key) => (
              <button key={key ?? "all"} type="button" aria-pressed={category === key} onClick={() => setCategory(key)}
                data-testid={`inventory-card-${key ?? "all"}`}
                className={`rounded-lg border p-3 text-left ${category === key ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {key === null ? "All resources" : INVENTORY_CATEGORY_LABEL[key]}
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{key === null ? status.observedTotal : perCategory.get(key) ?? 0}</p>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-slate-600" role="status">
              {live ? "No resources found yet. Discovering…" : "No resources were found in the supported types."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white" aria-label="Resource types">
              {shown.map(({ meta, count }) => {
                const isOpen = expanded.has(meta.resourceType)
                return (
                  <li key={meta.resourceType} data-testid="inventory-group">
                    <button type="button" aria-expanded={isOpen} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => setExpanded((current) => {
                        const next = new Set(current)
                        if (next.has(meta.resourceType)) next.delete(meta.resourceType)
                        else next.add(meta.resourceType)
                        return next
                      })}>
                      {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden /> : <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />}
                      <InventoryTypeTile resourceType={meta.resourceType} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{meta.label}</span>
                        <span className="block font-mono text-[11px] text-slate-400">{meta.resourceType}</span>
                      </span>
                      <span className="text-[11px] text-slate-500">{INVENTORY_CATEGORY_LABEL[meta.category]}</span>
                      <span className="w-12 text-right text-sm font-semibold text-slate-800" data-testid="inventory-group-count">{count}</span>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-slate-100 px-3 py-2">
                        <BasicRows accountId={accountId} resourceType={meta.resourceType} revision={revision} fetchPage={fetchPage} onOpen={open} />
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : (
        <BasicRows accountId={accountId} resourceType={null} revision={revision} fetchPage={fetchPage} onOpen={open} />
      )}

      {opened !== null ? (
        <InventoryResourceDrawer row={opened.row} basic={opened.evidence} accountLabel={accountLabel} onClose={() => setOpened(null)} />
      ) : null}
    </div>
  )
}

function BasicRows({ accountId, resourceType, revision, fetchPage, onOpen }: {
  accountId: string
  resourceType: string | null
  revision: unknown
  fetchPage: ResourcesFetcher
  onOpen: (item: BasicItem) => void
}) {
  const { model, loadMore } = useBasicPage(accountId, resourceType, revision, fetchPage)
  if (model.kind === "loading") return <p className="text-xs text-slate-500">Loading…</p>
  if (model.kind === "outcome") {
    return <p className="text-xs text-slate-700" role="status">These resources cannot be shown now ({model.reasonCode ?? model.state}).</p>
  }
  if (model.rows.length === 0) return <p className="text-xs text-slate-700" role="status">None found so far.</p>
  const byKey = new Map(model.rows.map((item) => [item.resource_key, item]))
  return (
    <div className="space-y-2">
      <InventoryRowsTable rows={model.rows.map(toInventoryRow)} resourceType={resourceType}
        onOpen={(row) => { const item = byKey.get(row.resource_uid); if (item) onOpen(item) }}
        publication={runPublication(model.runId, model.registrationId)} />
      {model.nextCursor !== null ? (
        <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()} disabled={model.loadingMore}>
          {model.loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  )
}
