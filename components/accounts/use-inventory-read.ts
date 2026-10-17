"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  applyInventoryResponse,
  firstPageRequest,
  nextPageRequest,
  parseInventoryResponse,
  startRead,
  type InventoryFetcher,
  type InventoryKey,
  type InventoryModel,
  type InventoryRequest,
} from "@/lib/account-inventory"

/**
 * The ONE reader of an account's published inventory for one key (customer, account, resource-type filter): epoch-guarded,
 * restarts on a moved publication, never revives an earlier answer. A component that uses it is KEYED by that key, so a new
 * key mounts a fresh reader. Shared by the page's own reader and each expanded type group.
 */
export function useInventoryRead(
  customerId: string | null,
  accountId: string,
  resourceType: string | null,
  fetchPage: InventoryFetcher,
) {
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
        request.key.accountId, request.key.resourceType))
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
