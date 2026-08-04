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
  atlas_rank?: number
  atlas_evaluation?: {
    state: "REACHABLE" | "DEAD_END" | "ERROR" | "NOT_EVALUATED"
    chain_count: number
    dead_end_count: number
    best_chain_id?: string | null
    best_feasibility_score?: number | null
    best_total_cost?: number | null
    best_damage_score?: number | null
    best_damage_severity?: string | null
    coverage_warning_count?: number
    error?: string
  }
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

export interface AtlasTruthClaim {
  verdict: "OPEN" | "CLOSED" | "UNKNOWN"
  basis: "OBSERVED" | "CONFIG" | "MODELED" | "COUNTERFACTUAL"
  scope: string | null
  as_of: string | null
  evidence_ids: string[]
  assumptions: string[]
  missing_evidence: string[]
}

export interface AtlasDamageOperation {
  action: string
  damage_type: string
  effect: string
  resource_scope: string
  claim: AtlasTruthClaim
}

export interface AtlasDamageNarration {
  executive: string
  operator: string
  remediation_intent: string
  source: string
  verified: boolean
  verification_reason: string
}

export interface AtlasReachableDamage {
  target_id: string
  target_name: string | null
  target_type: string | null
  reachability: AtlasTruthClaim
  operations: AtlasDamageOperation[]
  damage_types: string[]
  priority_score: number
  severity: string
  scoring_model: string
  deterministic_summary: string
  choke_point: {
    step_index: number
    primitive_id: string
    action: string | null
    identity_id: string | null
    intent: string
    expected_effect: string
  } | null
  narration: AtlasDamageNarration | null
}

export interface AtlasLateralChain {
  chain_id: string
  steps: AtlasLateralStep[]
  total_cost: number
  feasibility_score: number
  primitives_used: string[]
  blocking_controls: string[]
  assumptions_consumed: string[]
  reachable_damage?: AtlasReachableDamage | null
}

export interface AtlasLateralResponse {
  chains: AtlasLateralChain[]
  dead_ends: Array<{ dead_end_id: string; exhaustion_reason: string }>
  coverage_warnings: Array<{ code: string; message: string; detail?: Record<string, unknown> }>
  engine_version: string
  catalog_version: string
  assumption_set_version: string
  graph_snapshot_id: string
  evidence_bundle?: {
    algorithm: string
    content_hash: string
    fact_count: number
    schema_version: string
  } | null
  elapsed_ms: number
}

export interface AtlasFootholdEvaluation {
  coverage_state: "READY" | "PARTIAL" | "ERROR"
  eligible_count: number
  evaluated_count: number
  reachable_count: number
  dead_end_count: number
  error_count: number
  not_evaluated_count: number
  budget_ms?: number
  elapsed_ms?: number
  catalog_version?: string
  assumption_set_version?: string
  graph_snapshot_id?: string
}

export interface FootholdPayload {
  candidates: AtlasFootholdCandidate[]
  candidate_count: number
  coverage?: Record<string, unknown>
  recommended_candidate_id?: string | null
  recommended_basis?: string
  recommended_simulation?: AtlasLateralResponse | null
  evaluation?: AtlasFootholdEvaluation
}

export function selectRecommendedFootholdId(
  payload: FootholdPayload,
): string | null {
  const candidates = payload.candidates ?? []
  const recommended = payload.recommended_candidate_id
  if (recommended && candidates.some((item) => item.workload_id === recommended)) {
    return recommended
  }
  return (
    candidates.find((item) => item.atlas_evaluation?.state === "REACHABLE")?.workload_id ??
    candidates[0]?.workload_id ??
    null
  )
}

export interface UseAtlasLateralResult {
  candidates: AtlasFootholdCandidate[]
  selectedFootholdId: string | null
  selectFoothold: (id: string) => void
  selectedFoothold: AtlasFootholdCandidate | null
  response: AtlasLateralResponse | null
  evaluation: AtlasFootholdEvaluation | null
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
  const [evaluation, setEvaluation] = useState<AtlasFootholdEvaluation | null>(null)
  const [resolvedSearchKey, setResolvedSearchKey] = useState<string | null>(null)
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
      setEvaluation(null)
      setResolvedSearchKey(null)
      setLoadedScope(null)
      setError(null)
      return
    }
    let cancelled = false
    setCandidatesLoading(true)
    setLoadedScope(null)
    setResponse(null)
    setEvaluation(null)
    setResolvedSearchKey(null)
    setError(null)
    fetch(
      `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/jewel-footholds` +
        `?jewel_ref=${encodeURIComponent(jewelRef)}` +
        `&evaluate=true&evaluation_limit=30&evaluation_budget_ms=8000&max_hops=8`,
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
        const recommendedId = selectRecommendedFootholdId(body)
        setCandidates(next)
        setEvaluation(body.evaluation ?? null)
        setLoadedScope(scopeKey)
        setSelectedFootholdId(recommendedId)
        if (recommendedId && body.recommended_simulation) {
          setResponse(body.recommended_simulation)
          setResolvedSearchKey(`${scopeKey}\u0000${recommendedId}`)
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setCandidates([])
        setSelectedFootholdId(null)
        setEvaluation(null)
        setResolvedSearchKey(null)
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
    const searchKey = `${scopeKey}\u0000${selectedFootholdId}`
    if (resolvedSearchKey === searchKey) {
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
        if (!cancelled) {
          setResponse(body)
          setResolvedSearchKey(searchKey)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setResponse(null)
          setResolvedSearchKey(null)
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
    resolvedSearchKey,
  ])

  return {
    candidates,
    selectedFootholdId,
    selectFoothold: setSelectedFootholdId,
    selectedFoothold,
    response,
    evaluation,
    candidatesLoading,
    simulationLoading,
    error,
    retry,
  }
}
