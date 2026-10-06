"use client"

/**
 * One account's published resource inventory, read-only (T11b). Browse only: no selection, assignment or
 * "add to system" control; authoring is not available here.
 *
 * The reader is KEYED by (customer, account, filter): a change of any of them mounts a fresh reader, so the very first
 * committed output after the change already belongs to the new key -- no row of the previous account or filter is ever
 * committed under the new heading, even before effects run. Inside one reader, every page request is issued under the
 * current EPOCH and checked again when it completes (lib/account-inventory.ts), so a same-key refresh, restart or retry
 * never revives an earlier answer; a superseded reader's completions are ignored outright.
 * The inventory is account-wide: the global Region selection does not filter it, and the page says so.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  applyInventoryResponse,
  fetchInventoryPage,
  firstPageRequest,
  nextPageRequest,
  parseInventoryResponse,
  startRead,
  type InventoryFetcher,
  type InventoryKey,
  type InventoryModel,
  type InventoryRequest,
} from "@/lib/account-inventory"

export type RosterState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; displayName: string | null }

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
}

const HELD_COPY: Record<string, string> = {
  AUTHORITY_CHANGED:
    "This account's registration changed after the inventory was published, so it is not shown. A new publication is needed.",
}

/** The route's readiness gate names its hold under the account: ``<account>:CONSUMER_NOT_READY:not_recorded`` when the
 *  account's consumer readiness check has not been recorded (backend semantic_onboarding.consumer_pass_verdict). */
const CONSUMER_PASS_NOT_RECORDED = /^[0-9]{12}:CONSUMER_NOT_READY:not_recorded$/

function heldCopy(reasonCode: string | null): string {
  const code = reasonCode ?? ""
  if (HELD_COPY[code]) return HELD_COPY[code]
  if (CONSUMER_PASS_NOT_RECORDED.test(code)) {
    return "Inventory is not shown yet: this account's readiness check has not been recorded."
  }
  return `Inventory is held and not shown (${reasonCode ?? "no reason given"}).`
}

function outcomeCopy(model: InventoryModel): string {
  if (model.kind === "evidence") {
    if (model.state === "not_published") return "Inventory has not been published for this account yet."
    if (model.state === "held") return heldCopy(model.reasonCode)
    if (model.state === "stale") return "The published inventory is older than allowed, so it is not shown."
    return "The published inventory could not be validated, so it is not shown."
  }
  if (model.kind === "refused") {
    if (model.status === 401) return "Sign in again to view this inventory."
    if (model.status === 403) return "You are not authorized to view this account's inventory."
    return `The request was refused (${model.reasonCode ?? model.status}).`
  }
  if (model.kind === "unavailable") return `Inventory is unavailable right now (${model.reasonCode ?? model.status}).`
  return ""
}

export function AccountInventoryView(props: AccountInventoryViewProps) {
  const readerKey = JSON.stringify([props.customerId, props.accountId, props.resourceType])
  return <InventoryReader key={readerKey} {...props} />
}

/**
 * The ONE reader of an account's published inventory for one key (customer, account, resource-type filter): epoch-guarded,
 * restarts on a moved publication, never revives an earlier answer. A component that uses it is KEYED by that key, so a new
 * key mounts a fresh reader. Shared by the page's own reader and each expanded type group.
 */
function useInventoryRead(customerId: string | null, accountId: string, resourceType: string | null, fetchPage: InventoryFetcher) {
  const epochRef = useRef(0)
  const alive = useRef(true)
  const controllers = useRef<AbortController[]>([])
  const [model, setModel] = useState<InventoryModel>(() => startRead(0, { customerId, accountId, resourceType }))
  // The model every response is judged against: written only through commit(), synchronously, so a completion always
  // compares with the latest state (never a stale render's).
  const modelRef = useRef<InventoryModel>(model)

  const commit = useCallback((next: InventoryModel) => {
    modelRef.current = next
    setModel(next)
  }, [])

  const issue = useCallback((request: InventoryRequest) => {
    const controller = new AbortController()
    controllers.current.push(controller)
    void fetchPage(request.key.accountId, { resourceType: request.key.resourceType, cursor: request.cursor },
      controller.signal).then(({ status, body }) => {
      if (!alive.current) return      // a superseded reader (another key, or unmounted): never touches state
      const current = modelRef.current
      const { model: next, effect } = applyInventoryResponse(current, request, parseInventoryResponse(status, body,
        request.key.accountId))
      if (effect === "restart") {
        epochRef.current += 1
        const fresh = startRead(epochRef.current, current.key, current.restarts + 1)
        commit(fresh)
        issue(firstPageRequest(fresh))
      } else if (next !== current) {
        commit(next)
      }
    })
  }, [fetchPage, commit])

  const read = useCallback((readKey: InventoryKey) => {
    for (const controller of controllers.current) controller.abort()
    controllers.current = []
    epochRef.current += 1
    const fresh = startRead(epochRef.current, readKey)
    commit(fresh)
    issue(firstPageRequest(fresh))
  }, [issue, commit])

  // One reader per key: read on mount; on unmount (a key change remounts) abort and ignore everything in flight.
  useEffect(() => {
    alive.current = true
    read({ customerId, accountId, resourceType })
    return () => {
      alive.current = false
      for (const controller of controllers.current) controller.abort()
      controllers.current = []
    }
  }, [customerId, accountId, resourceType, read])

  const loadMore = () => {
    const current = modelRef.current
    const request = nextPageRequest(current)
    if (request === null || current.kind !== "data") return
    commit({ ...current, loadingMore: true })
    issue(request)
  }

  return { model, loadMore, refresh: () => read({ customerId, accountId, resourceType }) }
}

function InventoryReader({
  accountId,
  customerId,
  region,
  resourceType,
  roster,
  onResourceTypeChange,
  fetchPage = fetchInventoryPage,
}: AccountInventoryViewProps) {
  const { model, loadMore, refresh } = useInventoryRead(customerId, accountId, resourceType, fetchPage)
  const [filterDraft, setFilterDraft] = useState(resourceType ?? "")

  const accountLabel = roster.status === "ready" && roster.displayName ? `${roster.displayName} (${accountId})` : accountId

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
        className="flex items-center gap-2"
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
        <p className="text-sm text-slate-700" role="status">{outcomeCopy(model)}</p>
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
          {model.state === "populated" ? (
            <>
              <p className="text-xs text-slate-500">
                Showing {model.rows.length} of {model.totals.filterTotal}
                {resourceType !== null ? ` ${resourceType}` : ""} resources
                {resourceType !== null ? ` (${model.totals.accountTotal} in the account)` : ""}.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Last verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {model.rows.map((row) => (
                    <TableRow key={`${row.resource_type}|${row.resource_uid}`}>
                      <TableCell className="font-mono text-xs">{row.name ?? row.native_id}</TableCell>
                      <TableCell className="text-xs">{row.resource_type}</TableCell>
                      <TableCell className="text-xs">{row.region}</TableCell>
                      <TableCell className="text-xs">{row.state}</TableCell>
                      <TableCell className="text-xs">{row.observation.last_verified_at ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {model.hasMore ? (
                <Button type="button" variant="outline" size="sm" onClick={loadMore} disabled={model.loadingMore}>
                  {model.loadingMore ? "Loading…" : "Load more"}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
