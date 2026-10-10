"use client"

/**
 * One account's resources as basic discovery finds them (backend account_resources/v1), in the existing Inventory layout:
 * the same heading, category cards, type groups with their icons, rows table and drill-down -- with the run's honest status.
 *
 * - Counts say "found so far" until the run is complete against its own plan (every enabled Region and global resources).
 * - The scope line names the Regions the run actually enumerated; a refused Region listing says so.
 * - Coverage gaps are named per type: access needed (with the missing action), not supported yet, partial, throttled --
 *   never "0 resources". An absence is claimed only where the listing that would have found it succeeded.
 * - While the run is moving the page refreshes every 2 seconds, only while the tab is visible; it stops once the run is
 *   complete, held or not requested.
 * - Rows are BASIC: never selectable, never "verified"; the drill-down says "Observed from AWS ... · Basic discovery".
 *
 * Everything shown is bound to ONE listing identity -- account + registration + run (Codex review of ea268c75, 1). The
 * caller mounts one view per identity (keyed), so a new account, a re-added registration or a new run starts from nothing:
 * no page, cursor, expanded group or open drawer survives it. Within an identity, every request is issued under an EPOCH
 * and dropped when it completes under another or after unmount; a page that names a different registration or run is
 * never shown (the status is re-read instead), and a cursor the backend no longer accepts (409) restarts at page one. A
 * failed request is named, with a retry (Codex review, 2) -- never an endless "Loading".
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
  emptyPageCopy,
  fetchDiscovery,
  fetchResourcesPage,
  gapStatusCopy,
  parseDiscoveryResponse,
  parseResourcesResponse,
  toInventoryRow,
  typeStateCopy,
  type BasicEvidence,
  type BasicItem,
  type DiscoveryFetcher,
  type DiscoveryStatus,
  type EmptyState,
  type ResourcesFetcher,
  type ResourcesOutcome,
  type TypeState,
  type TypeStateName,
} from "@/lib/account-resources"
import { INVENTORY_CATEGORY_LABEL, inventoryTypeMeta, type InventoryCategory } from "@/lib/inventory-types"

export const POLL_MS = 2000
const CATEGORY_ORDER: InventoryCategory[] = ["compute", "data", "identity", "network", "other"]
/** Types whose listing did not (fully) succeed: shown as groups even with nothing found, with their state. */
const PROBLEM_TYPE_STATES: ReadonlySet<TypeStateName> = new Set(["ACCESS_NEEDED", "UNREADABLE", "PARTIAL"])

type StatusModel = { kind: "loading" } | DiscoveryStatus | ResourcesOutcome

/** The identity a displayed listing belongs to. */
export interface ListingIdentity {
  accountId: string
  registrationId: string
  runId: string
}

export function identityKey(identity: ListingIdentity): string {
  return `${identity.accountId}:${identity.registrationId}:${identity.runId}`
}

/**
 * The run's status for ONE account, polled every POLL_MS while it is moving and the tab is visible. A status read for
 * another account is never returned (a new account reads "loading" until its own answer arrives). A failed refresh after a
 * good answer keeps that answer and says the refresh failed -- it proves nothing changed -- while any other answer
 * (another run, held, a refusal) replaces it.
 */
export function useDiscoveryStatus(accountId: string, fetcher: DiscoveryFetcher = fetchDiscovery, pollMs = POLL_MS) {
  const [state, setState] = useState<{ accountId: string; model: StatusModel; refreshFailed: boolean }>(
    { accountId, model: { kind: "loading" }, refreshFailed: false })
  const epoch = useRef(0)
  const load = useCallback(async () => {
    const mine = ++epoch.current
    let next: StatusModel
    try {
      const { status: code, body } = await fetcher(accountId)
      next = parseDiscoveryResponse(code, body, accountId)
    } catch {
      next = { kind: "outcome", status: 0, state: "unavailable", reasonCode: "NETWORK" }
    }
    if (mine !== epoch.current) return
    setState((current) => {
      const failed = next.kind === "outcome" && (next.status === 0 || next.status >= 500)
      if (failed && current.accountId === accountId && current.model.kind === "status") {
        return { ...current, refreshFailed: true }
      }
      return { accountId, model: next, refreshFailed: false }
    })
  }, [accountId, fetcher])
  useEffect(() => {
    void load()
    return () => { epoch.current += 1 }           // an older account's (or an unmounted view's) answer is dropped
  }, [load])
  const status: StatusModel = state.accountId === accountId ? state.model : { kind: "loading" }
  const live = status.kind === "status" && LIVE_COVERAGE.has(status.coverageState)
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void load()
    }, pollMs)
    return () => clearInterval(timer)
  }, [live, load, pollMs])
  return { status, refreshFailed: state.accountId === accountId && state.refreshFailed, refresh: load }
}

type PageModel =
  | { kind: "loading" }
  | { kind: "failed" }
  | ResourcesOutcome
  | {
    kind: "rows"; rows: BasicItem[]; nextCursor: string | null; loadingMore: boolean; moreFailed: boolean
    state: "populated" | EmptyState; typeState: TypeState | null
  }

/**
 * One live listing of ONE identity (optionally one type), reloaded from page one whenever ``revision`` changes. A page
 * naming another registration or run is never shown: ``onMoved`` re-reads the status, whose new identity remounts the view.
 */
export function useBasicPage(identity: ListingIdentity, resourceType: string | null, revision: unknown,
  fetcher: ResourcesFetcher = fetchResourcesPage, onMoved: () => void = () => {}) {
  const [model, setModel] = useState<PageModel>({ kind: "loading" })
  const epoch = useRef(0)
  const modelRef = useRef<PageModel>(model)
  const commit = (next: PageModel) => { modelRef.current = next; setModel(next) }
  const moved = useRef(onMoved)
  moved.current = onMoved
  const { accountId, registrationId, runId } = identity

  const first = useCallback(async () => {
    const mine = ++epoch.current
    if (modelRef.current.kind === "failed") commit({ kind: "loading" })
    try {
      const { status, body } = await fetcher(accountId, { resourceType, cursor: null })
      if (mine !== epoch.current) return
      const parsed = parseResourcesResponse(status, body, accountId, resourceType)
      if (parsed.kind === "page" && (parsed.registrationId !== registrationId || parsed.runId !== runId)) {
        moved.current()                             // the account moved on since its status was read: never shown here
        return
      }
      commit(parsed.kind === "page" ? {
        kind: "rows", rows: parsed.items, nextCursor: parsed.nextCursor, loadingMore: false, moreFailed: false,
        state: parsed.state, typeState: parsed.typeState,
      } : parsed)
    } catch {
      if (mine === epoch.current) commit({ kind: "failed" })
    }
  }, [accountId, registrationId, runId, resourceType, fetcher])

  useEffect(() => {
    void first()
    return () => { epoch.current += 1 }           // a later revision, another type, or unmount: drop what is in flight
  }, [first, revision])

  const loadMore = useCallback(async () => {
    const current = modelRef.current
    if (current.kind !== "rows" || current.nextCursor === null || current.loadingMore) return
    const mine = epoch.current
    commit({ ...current, loadingMore: true, moreFailed: false })
    try {
      const { status, body } = await fetcher(accountId, { resourceType, cursor: current.nextCursor })
      if (mine !== epoch.current) return
      const parsed = parseResourcesResponse(status, body, accountId, resourceType)
      if (parsed.kind === "outcome" && String(parsed.reasonCode ?? "").startsWith(CURSOR_RESTART_REQUIRED)) {
        void first()                                // the run or registration moved: start again at page one
        return
      }
      if (parsed.kind === "page" && (parsed.registrationId !== registrationId || parsed.runId !== runId)) {
        moved.current()
        return
      }
      if (parsed.kind !== "page") {
        commit(parsed)
        return
      }
      const seen = new Set(current.rows.map((row) => row.resource_key))
      commit({ ...current, rows: [...current.rows, ...parsed.items.filter((row) => !seen.has(row.resource_key))],
        nextCursor: parsed.nextCursor, loadingMore: false, moreFailed: false })
    } catch {
      if (mine === epoch.current) commit({ ...current, loadingMore: false, moreFailed: true })
    }
  }, [accountId, registrationId, runId, resourceType, fetcher, first])

  return { model, loadMore, retry: first }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function problemTypes(status: DiscoveryStatus): string[] {
  return Object.entries(status.types).filter(([, t]) => PROBLEM_TYPE_STATES.has(t.state)).map(([name]) => name)
}

function statusLine(status: DiscoveryStatus): string {
  const n = status.observedTotal
  const count = `${plural(n, "resource", "resources")} ${status.observedTotalLabel === "found" ? "found" : "found so far"}`
  if (status.coverageState === "STARTING") return `${count} · Starting discovery`
  if (status.coverageState === "DISCOVERING") return `${count} · Discovering`
  if (status.coverageState === "COMPLETE") return `${count} · Discovery complete`
  if (status.coverageState === "COMPLETE_WITH_GAPS") {
    const unread = problemTypes(status).length
    if (n === 0) {
      // Never "0 found" over listings that did not succeed: name what could not be read, or what was proved.
      return unread
        ? `No resources shown · Discovery finished · ${plural(unread, "resource type", "resource types")} could not be read`
        : "None found in the supported resource types · Discovery finished · other types are not supported yet"
    }
    const gaps = status.gaps.filter((gap) => gap.status !== "UNSUPPORTED").length
    return `${count} · Discovery finished${gaps ? ` · ${plural(gaps, "gap", "gaps")}` : ""}`
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
function runPublication(identity: ListingIdentity): PublicationIdentity {
  return { attempt: identity.runId, generation: 0, source_identity: "basic-discovery", authority_digest: "",
    registration_id: identity.registrationId }
}

export interface BasicInventoryViewProps {
  accountId: string
  accountLabel: string
  /** A status naming its registration and run (STARTING, DISCOVERING, COMPLETE, COMPLETE_WITH_GAPS). */
  status: DiscoveryStatus & { registrationId: string; runId: string }
  fetchPage?: ResourcesFetcher
  /** The status could not be refreshed: the shown answer is the last good one. */
  refreshFailed?: boolean
  /** Re-read the status (a retry, or a page that named another registration or run). */
  onRefreshStatus?: () => void
}

/** Mount ONE per listing identity (key={identityKey(...)}): nothing shown survives a change of account, registration or run. */
export function BasicInventoryView({ accountId, accountLabel, status, fetchPage = fetchResourcesPage, refreshFailed = false,
  onRefreshStatus = () => {} }: BasicInventoryViewProps) {
  const [layout, setLayout] = useState<"grouped" | "list">("grouped")
  const [category, setCategory] = useState<InventoryCategory | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [opened, setOpened] = useState<{ row: InventoryRow; evidence: BasicEvidence } | null>(null)
  const [coverageOpen, setCoverageOpen] = useState(false)
  const identity: ListingIdentity = { accountId, registrationId: status.registrationId, runId: status.runId }
  // Pages reload when the run's found-count or state moves (never more often than the status poll).
  const revision = `${status.coverageState}:${status.observedTotal}`
  const names = new Set([...Object.keys(status.totalsByType), ...problemTypes(status)])
  const types = [...names].map((resourceType) => ({
    meta: inventoryTypeMeta(resourceType), count: status.totalsByType[resourceType] ?? 0, state: status.types[resourceType] ?? null,
  }))
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
        {refreshFailed ? (
          <p className="mt-1 text-xs text-amber-800" role="alert" data-testid="discovery-refresh-failed">
            Discovery status could not be refreshed; showing the last answer.{" "}
            <button type="button" className="font-semibold underline" onClick={onRefreshStatus}>Retry</button>
          </p>
        ) : null}
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
            <p className="text-sm text-slate-600" role="status" data-testid="basic-empty">
              {live ? "No resources found yet. Discovering…"
                : status.coverageState === "COMPLETE" ? "None found: every planned listing succeeded and returned nothing."
                  : "None found in the supported resource types. Other types are not supported yet (see coverage)."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white" aria-label="Resource types">
              {shown.map(({ meta, count, state }) => {
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
                      {state && PROBLEM_TYPE_STATES.has(state.state) ? (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800" data-testid="inventory-group-state">
                          {typeStateCopy(state.state)}
                        </span>
                      ) : null}
                      <span className="text-[11px] text-slate-500">{INVENTORY_CATEGORY_LABEL[meta.category]}</span>
                      <span className="w-12 text-right text-sm font-semibold text-slate-800" data-testid="inventory-group-count">{count}</span>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-slate-100 px-3 py-2">
                        <BasicRows identity={identity} resourceType={meta.resourceType} revision={revision} fetchPage={fetchPage}
                          onOpen={open} onMoved={onRefreshStatus} />
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : (
        <BasicRows identity={identity} resourceType={null} revision={revision} fetchPage={fetchPage} onOpen={open}
          onMoved={onRefreshStatus} />
      )}

      {opened !== null ? (
        <InventoryResourceDrawer row={opened.row} basic={opened.evidence} accountLabel={accountLabel} onClose={() => setOpened(null)} />
      ) : null}
    </div>
  )
}

function BasicRows({ identity, resourceType, revision, fetchPage, onOpen, onMoved }: {
  identity: ListingIdentity
  resourceType: string | null
  revision: unknown
  fetchPage: ResourcesFetcher
  onOpen: (item: BasicItem) => void
  onMoved: () => void
}) {
  const { model, loadMore, retry } = useBasicPage(identity, resourceType, revision, fetchPage, onMoved)
  if (model.kind === "loading") return <p className="text-xs text-slate-500">Loading…</p>
  if (model.kind === "failed") {
    return (
      <p className="text-xs text-slate-700" role="alert" data-testid="basic-page-failed">
        These resources could not be loaded (the request did not complete).{" "}
        <button type="button" className="font-semibold text-teal-700 underline" onClick={() => void retry()}>Retry</button>
      </p>
    )
  }
  if (model.kind === "outcome") {
    return <p className="text-xs text-slate-700" role="status">These resources cannot be shown now ({model.reasonCode ?? model.state}).</p>
  }
  if (model.rows.length === 0) {
    const copy = model.state === "populated" ? emptyPageCopy("empty_so_far", null) : emptyPageCopy(model.state, model.typeState)
    return <p className="text-xs text-slate-700" role="status" data-testid="basic-page-empty">{copy}</p>
  }
  const byKey = new Map(model.rows.map((item) => [item.resource_key, item]))
  return (
    <div className="space-y-2">
      {model.typeState && PROBLEM_TYPE_STATES.has(model.typeState.state) ? (
        <p className="text-xs text-amber-800" data-testid="basic-page-type-state">
          {typeStateCopy(model.typeState.state)}: some places this type is listed could not be read
          {model.typeState.missing_actions.length ? ` (needs ${model.typeState.missing_actions.join(", ")})` : ""}.
        </p>
      ) : null}
      <InventoryRowsTable rows={model.rows.map(toInventoryRow)} resourceType={resourceType}
        onOpen={(row) => { const item = byKey.get(row.resource_uid); if (item) onOpen(item) }}
        publication={runPublication(identity)} />
      {model.nextCursor !== null ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()} disabled={model.loadingMore}>
            {model.loadingMore ? "Loading…" : model.moreFailed ? "Retry loading more" : "Load more"}
          </Button>
          {model.moreFailed ? (
            <span className="text-xs text-slate-700" role="alert" data-testid="basic-more-failed">The next page could not be loaded.</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
