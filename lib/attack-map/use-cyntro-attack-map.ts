"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  layoutPayload,
  type AttackMapPayload,
  type Position,
  type TopologySnapshot,
} from "./slot-mapper"
import { adaptTopologyFull, densityFromApi } from "./topology-adapter"
import { normalizeAttackMapPayload } from "./normalize-payload"
import type { TopologySnapshotFullApi } from "./api-types"

export interface CyntroAttackMapResult {
  payload: AttackMapPayload
  topology: TopologySnapshot
  positions: Map<string, Position>
  density: ReturnType<typeof densityFromApi>
}

interface State {
  data: CyntroAttackMapResult | null
  loading: boolean
  error: string | null
}

// Coerce an error response body into a readable string. The backend sometimes
// returns `detail` as an object/array (e.g. FastAPI validation errors); passing
// that straight to `new Error()` produced a message of "[object Object]" on the
// map. Always resolve to a string the UI can show.
function errBodyMessage(body: unknown, fallback: string): string {
  const d = (body as { detail?: unknown; error?: unknown } | null)?.detail
    ?? (body as { error?: unknown } | null)?.error
  if (typeof d === "string" && d.trim()) return d
  if (d != null) {
    try {
      return typeof d === "object" ? JSON.stringify(d) : String(d)
    } catch {
      return fallback
    }
  }
  return fallback
}

export function useCyntroAttackMap(
  systemName: string | null | undefined,
  pathId: string | null | undefined,
  enabled: boolean,
) {
  const [state, setState] = useState<State>({
    data: null,
    loading: false,
    error: null,
  })
  const priorRef = useRef<Map<string, Position> | undefined>(undefined)
  const [nonce, setNonce] = useState(0)

  const retry = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!enabled || !systemName || !pathId) {
      setState({ data: null, loading: false, error: null })
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    ;(async () => {
      try {
        const [payloadRes, topoRes] = await Promise.all([
          fetch(
            `/api/proxy/attack-map/${encodeURIComponent(pathId)}?system=${encodeURIComponent(systemName)}`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/proxy/topology/${encodeURIComponent(systemName)}?shape=full`,
            { cache: "no-store" },
          ),
        ])

        if (!payloadRes.ok) {
          const body = await payloadRes.json().catch(() => ({}))
          throw new Error(errBodyMessage(body, `attack-map ${payloadRes.status}`))
        }
        if (!topoRes.ok) {
          const body = await topoRes.json().catch(() => ({}))
          throw new Error(errBodyMessage(body, `topology ${topoRes.status}`))
        }

        const rawPayload = (await payloadRes.json()) as AttackMapPayload
        const topoApi = (await topoRes.json()) as TopologySnapshotFullApi
        const payload = normalizeAttackMapPayload(rawPayload)
        const topology = adaptTopologyFull(topoApi)
        const density = densityFromApi(topoApi.density)
        const positions = layoutPayload(
          payload,
          topology,
          density,
          priorRef.current,
        )
        priorRef.current = positions

        if (cancelled) return
        setState({
          data: { payload, topology, positions, density },
          loading: false,
          error: null,
        })
      } catch (err) {
        if (cancelled) return
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load attack map",
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, systemName, pathId, nonce])

  return useMemo(
    () => ({
      ...state,
      retry,
    }),
    [state, retry],
  )
}
