"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

export type FootholdLikelihood =
  | "EXPOSED"
  | "CREDENTIAL_EXPOSURE"
  | "ASSUMED_COMPROMISE"

export interface AtlasFootholdCandidate {
  workload_id: string
  workload_name: string
  workload_type: string
  role_arn: string | null
  role_name: string | null
  foothold_likelihood: FootholdLikelihood
  foothold_reasons: string[]
  observed_access_to_jewel: boolean
  access_last_seen: string | null
  security_group_ids: string[]
}

export interface AtlasStateDelta {
  added_compromised_workloads: string[]
  added_captured_identities: string[]
  added_accessible_resources: string[]
  added_synthetic_edges: string[]
  added_synthetic_nodes: string[]
}

export interface AtlasLateralStep {
  step_index: number
  primitive_id: string
  state_delta: AtlasStateDelta
  edge_evidence_ids: string[]
}

export interface AtlasLateralChain {
  chain_id: string
  steps: AtlasLateralStep[]
  total_cost: number
  feasibility_score: number
  primitives_used: string[]
  blocking_controls: string[]
  assumptions_consumed: string[]
}

export interface AtlasLateralResponse {
  chains: AtlasLateralChain[]
  dead_ends: Array<{ dead_end_id: string; exhaustion_reason: string }>
  coverage_warnings: Array<{ code: string; message: string }>
  engine_version: string
  catalog_version: string
  assumption_set_version: string
  graph_snapshot_id: string
  elapsed_ms: number
}

interface FootholdPayload {
  candidates: AtlasFootholdCandidate[]
  candidate_count: number
  coverage?: Record<string, unknown>
}

export interface UseAtlasLateralResult {
  candidates: AtlasFootholdCandidate[]
  selectedFootholdId: string | null
  selectFoothold: (id: string) => void
  selectedFoothold: AtlasFootholdCandidate | null
  response: AtlasLateralResponse | null
  candidatesLoading: boolean
  simulationLoading: boolean
  error: string | null
  retry: () => void
}

export function useAtlasLateral({
  systemName,
  jewelRef,
  enabled,
}: {
  systemName: string
  jewelRef: string | null
  enabled: boolean
}): UseAtlasLateralResult {
  const [candidates, setCandidates] = useState<AtlasFootholdCandidate[]>([])
  const [selectedFootholdId, setSelectedFootholdId] = useState<string | null>(null)
  const [response, setResponse] = useState<AtlasLateralResponse | null>(null)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [simulationLoading, setSimulationLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const retry = useCallback(() => setNonce((n) => n + 1), [])
  const scopeKey = enabled && systemName && jewelRef ? `${systemName}\u0000${jewelRef}` : null

  useEffect(() => {
    if (!enabled || !systemName || !jewelRef) {
      setCandidates([])
      setSelectedFootholdId(null)
      setResponse(null)
      setLoadedScope(null)
      setError(null)
      return
    }
    let cancelled = false
    setCandidatesLoading(true)
    setLoadedScope(null)
    setError(null)
    fetch(
      `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/jewel-footholds` +
        `?jewel_ref=${encodeURIComponent(jewelRef)}`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok || !body) throw new Error(body?.detail ?? body?.error ?? `http_${r.status}`)
        return body as FootholdPayload
      })
      .then((body) => {
        if (cancelled) return
        const next = body.candidates ?? []
        setCandidates(next)
        setLoadedScope(scopeKey)
        setSelectedFootholdId((current) =>
          current && next.some((c) => c.workload_id === current)
            ? current
            : next[0]?.workload_id ?? null,
        )
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setCandidates([])
        setSelectedFootholdId(null)
        setLoadedScope(null)
        setError(e instanceof Error ? e.message : "jewel_footholds_failed")
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, systemName, jewelRef, nonce, scopeKey])

  const selectedFoothold = useMemo(
    () => candidates.find((c) => c.workload_id === selectedFootholdId) ?? null,
    [candidates, selectedFootholdId],
  )

  useEffect(() => {
    if (
      !enabled ||
      !systemName ||
      !jewelRef ||
      !selectedFootholdId ||
      loadedScope !== scopeKey
    ) {
      setResponse(null)
      setSimulationLoading(false)
      return
    }
    let cancelled = false
    setSimulationLoading(true)
    setResponse(null)
    setError(null)
    fetch(`/api/proxy/atlas/search/${encodeURIComponent(systemName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_node_id: selectedFootholdId,
        target_node_id: jewelRef,
        max_hops: 8,
      }),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok || !body) throw new Error(body?.detail ?? body?.error ?? `http_${r.status}`)
        return body as AtlasLateralResponse
      })
      .then((body) => {
        if (!cancelled) setResponse(body)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setResponse(null)
          setError(e instanceof Error ? e.message : "atlas_search_failed")
        }
      })
      .finally(() => {
        if (!cancelled) setSimulationLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    enabled,
    systemName,
    jewelRef,
    selectedFootholdId,
    loadedScope,
    scopeKey,
    nonce,
  ])

  return {
    candidates,
    selectedFootholdId,
    selectFoothold: setSelectedFootholdId,
    selectedFoothold,
    response,
    candidatesLoading,
    simulationLoading,
    error,
    retry,
  }
}
