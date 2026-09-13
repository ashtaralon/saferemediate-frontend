"use client"

// Reads the BOUNDED, resource-anchored dependency projection for one resource
// from the live backend, which reads the Neptune graph. NO MOCK — an
// unavailable projection returns null plus an honest error string, and an empty
// page renders as "nothing was found within collected scope" rather than as a
// claim that the resource has no dependencies.
//
// Paging is append-only and cursor-driven. A cursor is bound to the LIST it
// indexes — the projection generation, the anchor resource, and the filters —
// so the backend answers 409 rather than silently applying an offset to a
// sequence it never described. Two consequences are handled here:
//
//   1. Changing the resource, the account or a filter starts a NEW list, so the
//      cursor is dropped in the same render that changes them. Carrying it
//      would send a cursor bound to the previous list and earn a 409 for what
//      is really just a new query.
//   2. A 409 is only reported as "the projection advanced" when the backend
//      actually says so. It has more than one cause, and claiming the graph
//      moved when the real reason was something else is a fabricated
//      explanation — the honest fallback is the backend's own sentence.

import { useCallback, useEffect, useState } from "react"

export type Perspective = "USES" | "USED_BY" | "PEER"
export type BasisClass = "OBSERVED" | "CONFIGURED" | "STRUCTURAL"

export interface DependencyFact {
  fact_id?: string
  relationship?: string
  mechanism?: string | null
  basis_class?: BasisClass
  freshness?: string
  actions?: string[]
  observation_days?: number | null
  first_seen?: string | null
  last_seen?: string | null
  via_vpce?: string | null
  evidence_refs?: unknown[]
  source_generation_refs?: unknown[]
  derivation?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface DependencyRow {
  pair_key: string
  perspective: Perspective
  counterparty: {
    identity?: string | null
    label?: string | null
    type?: string | null
    account_id?: string | null
    region?: string | null
    scope?: "IN_ACCOUNT" | "EXTERNAL" | "AWS_SERVICE" | "UNKNOWN"
    is_service_endpoint?: boolean
    rolled_up_member_count?: number
  }
  facts: DependencyFact[]
}

export interface ResourceDependencies {
  schema: string
  scope: {
    tenant?: string
    account_id?: string
    system_name?: string
    anchor_uid?: string
    generation?: string
  }
  page: {
    rows: DependencyRow[]
    returned: number
    total: number
    offset: number
    next_cursor: string | null
  }
  filters_applied?: Record<string, unknown>
  counts?: Record<string, unknown>
  coverage?: {
    state?: string
    missing_sources?: string[]
    observation_days?: number | null
    [key: string]: unknown
  }
  type_views?: {
    family?: string
    views?: Array<{ title?: string; items?: unknown[] }>
  } | null
  assembly?: { latency_ms?: number }
}

interface UseResourceDependencies {
  data: ResourceDependencies | null
  /** Every row loaded so far, across pages. */
  rows: DependencyRow[]
  loading: boolean
  /** True only while a "load more" page is in flight, so the list stays visible. */
  loadingMore: boolean
  error: string | null
  /** Set when the generation moved under an in-flight cursor (backend 409). */
  generationMoved: boolean
  hasMore: boolean
  loadMore: () => void
  retry: () => void
}

interface Args {
  systemName: string
  resourceId: string | null | undefined
  accountId?: string | null
  includeStale?: boolean
  pageSize?: number
}

export function useResourceDependencies({
  systemName,
  resourceId,
  accountId,
  includeStale = true,
  pageSize = 50,
}: Args): UseResourceDependencies {
  const [data, setData] = useState<ResourceDependencies | null>(null)
  const [rows, setRows] = useState<DependencyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generationMoved, setGenerationMoved] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const retry = useCallback(() => {
    setCursor(null)
    setNonce((n) => n + 1)
  }, [])

  const loadMore = useCallback(() => {
    setCursor(data?.page?.next_cursor ?? null)
  }, [data])

  // The identity of the list being paged. When it changes the cursor is stale
  // by construction, so it is cleared BEFORE the fetch effect runs rather than
  // being sent and rejected.
  const listKey = `${systemName}\u001f${resourceId ?? ""}\u001f${accountId ?? ""}\u001f${includeStale}\u001f${pageSize}`
  const [pagedListKey, setPagedListKey] = useState(listKey)
  if (pagedListKey !== listKey) {
    setPagedListKey(listKey)
    if (cursor !== null) setCursor(null)
  }

  useEffect(() => {
    if (!resourceId || !systemName) {
      setData(null)
      setRows([])
      setError(null)
      return
    }
    // One render where the key has changed but the cursor has not yet been
    // cleared would otherwise page the new list from the old offset.
    if (pagedListKey !== listKey) return
    let cancelled = false
    const isFirstPage = cursor === null
    if (isFirstPage) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    const query = new URLSearchParams({
      resource_id: resourceId,
      include_stale: String(includeStale),
      page_size: String(pageSize),
    })
    if (accountId && accountId !== "all") query.set("account_id", accountId)
    if (cursor) query.set("cursor", cursor)

    fetch(
      `/api/proxy/resource-dependencies/${encodeURIComponent(systemName)}?${query}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          // 409 covers every way the request conflicts with server state, and
          // the projection advancing is only one of them. Claim that one ONLY
          // when the backend's own detail says so; otherwise surface what it
          // actually said rather than inventing a cause the user would act on.
          if (response.status === 409) {
            const detail = String(body?.detail ?? body?.error ?? "")
            if (/generation/i.test(detail)) {
              const conflict = new Error("generation_moved")
              ;(conflict as any).generationMoved = true
              throw conflict
            }
            throw new Error(detail || "http_409")
          }
          throw new Error(body?.error ?? `http_${response.status}`)
        }
        if (!body || body.error) throw new Error(body?.error ?? "empty_response")
        return body as ResourceDependencies
      })
      .then((body) => {
        if (cancelled) return
        setData(body)
        setGenerationMoved(false)
        setRows((existing) =>
          isFirstPage ? body.page.rows : [...existing, ...body.page.rows],
        )
      })
      .catch((cause) => {
        if (cancelled) return
        if ((cause as any)?.generationMoved) {
          setGenerationMoved(true)
          return
        }
        setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setLoadingMore(false)
      })

    return () => {
      cancelled = true
    }
  }, [systemName, resourceId, accountId, includeStale, pageSize, cursor, nonce, listKey, pagedListKey])

  return {
    data,
    rows,
    loading,
    loadingMore,
    error,
    generationMoved,
    hasMore: Boolean(data?.page?.next_cursor),
    loadMore,
    retry,
  }
}
