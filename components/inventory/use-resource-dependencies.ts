"use client"

// Reads the BOUNDED, resource-anchored dependency projection for one resource
// from the live backend, which reads the Neptune graph. NO MOCK — an
// unavailable projection returns null plus an honest error string, and an empty
// page renders as "nothing was found within collected scope" rather than as a
// claim that the resource has no dependencies.
//
// Paging is append-only and cursor-driven. The cursor encodes the generation it
// was minted against, so a projection that advances mid-read makes the backend
// answer 409 rather than silently stitching two generations into one list; that
// case is surfaced as its own state so the tab can offer a reload instead of
// showing a page that half belongs to a graph that no longer exists.

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

  useEffect(() => {
    if (!resourceId || !systemName) {
      setData(null)
      setRows([])
      setError(null)
      return
    }
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
          // 409 is the generation moving under the cursor, which is a different
          // thing from a failure and gets its own affordance.
          if (response.status === 409) {
            const conflict = new Error("generation_moved")
            ;(conflict as any).generationMoved = true
            throw conflict
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
  }, [systemName, resourceId, accountId, includeStale, pageSize, cursor, nonce])

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
