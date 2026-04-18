"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

// ── Fetch types (aligned to existing proxy responses) ────────────────────

export interface EnforcementAction {
  id: string
  layer: "privilege" | "network" | "data"
  title: string
  detail: string
  impact: string
  risk: string
  confidence: "high" | "medium" | "low"
  observationDays: number
  rollback: string
  count: number
}

export interface EnforcementScoreData {
  systemName: string
  coverageScore: number
  customerScore: number
  criticalScore: number | null
  totalScore: number
  totalGap: number
  projected: {
    coverageScore: number
    customerScore: number
    criticalScore: number | null
    improvement: number
    privilege: number
    network: number
    data: number
    totalScore: number
  }
  resourceClassification: {
    provider_managed: number
    critical_path: number
    customer: number
    total: number
  }
  enforcementTiers: {
    strongly_enforced: number
    enforced_with_gaps: number
    weakly_enforced: number
    critically_exposed: number
  }
  layers: {
    privilege: any
    network: any
    data: any
  }
  actions: EnforcementAction[]
  impact: {
    attackPathsExposed: number
    reductionPercent: number
    primaryDriver: string
    riskStatement: string
    criticalGaps: number
    remediableGaps: number
  }
  headline: string
  canClose: string
  error?: string
}

export interface PostureScoreData {
  system_name: string
  overall_score: number
  grade: string
  dimensions: {
    least_privilege?: { score: number; weight: number }
    network_security?: { score: number; weight: number }
    data_protection?: { score: number; weight: number }
    compliance?: { score: number; weight: number }
    observability?: { score: number; weight: number }
  }
  top_issues?: Array<{ title: string; severity?: string }>
}

export interface IssuesSummaryData {
  timestamp?: string
  severity?: {
    critical?: number
    high?: number
    medium?: number
    low?: number
  }
  byCategory?: {
    permissions?: { allowed?: number; used?: number; unused?: number }
  }
  infrastructure?: Record<string, number> | { total?: number }
  bySource?: Record<string, number>
  issues?: Array<any>
  total?: number
}

export interface IdentityAttackPath {
  id?: string
  identity?: string
  identityName?: string
  permission?: string
  resource?: string
  resourceName?: string
  crownJewel?: boolean
  crown_jewel?: boolean
  severity?: string
  confidence?: number
  evidence?: string
  [k: string]: any
}

export interface IdentityAttackPathsData {
  system_name?: string
  paths?: IdentityAttackPath[]
  attack_paths?: IdentityAttackPath[]
  total?: number
  [k: string]: any
}

export interface FindingsListData {
  findings: any[]
}

export interface SystemSummary {
  name: string
  displayName?: string
  environment?: string
  region?: string
  owner?: string
  criticality?: string
  businessCriticality?: string
  status?: string
  resourceCount?: number
  healthScore?: number
  health_score?: number
  critical_count?: number
  high_count?: number
  medium_count?: number
  low_count?: number
  totalFindings?: number
  lastScan?: string
}

export interface SystemsData {
  systems: SystemSummary[]
  total?: number
  success?: boolean
}

// ── Per-source loading state ─────────────────────────────────────────────

export interface SourceState<T> {
  data: T | null
  loading: boolean
  error: string | null
  fetchedAt: number | null
}

const initialSourceState = <T,>(): SourceState<T> => ({
  data: null,
  loading: true,
  error: null,
  fetchedAt: null,
})

// ── Hook ─────────────────────────────────────────────────────────────────

export interface UseHomeDataResult {
  systemName: string
  enforcement: SourceState<EnforcementScoreData>
  posture: SourceState<PostureScoreData>
  issues: SourceState<IssuesSummaryData>
  attackPaths: SourceState<IdentityAttackPathsData>
  findings: SourceState<any[]>
  systems: SourceState<SystemSummary[]>
  refresh: () => void
  refreshOne: (key: HomeDataKey) => void
}

type HomeDataKey = "enforcement" | "posture" | "issues" | "attackPaths" | "findings" | "systems"

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const resp = await fetch(url, { signal, cache: "no-store" })
  if (!resp.ok) {
    let detail = ""
    try {
      const text = await resp.text()
      detail = text.slice(0, 200)
    } catch {
      // noop
    }
    throw new Error(`HTTP ${resp.status}${detail ? ` — ${detail}` : ""}`)
  }
  return (await resp.json()) as T
}

export function useHomeData(systemName: string): UseHomeDataResult {
  const [enforcement, setEnforcement] = useState<SourceState<EnforcementScoreData>>(
    initialSourceState<EnforcementScoreData>(),
  )
  const [posture, setPosture] = useState<SourceState<PostureScoreData>>(
    initialSourceState<PostureScoreData>(),
  )
  const [issues, setIssues] = useState<SourceState<IssuesSummaryData>>(
    initialSourceState<IssuesSummaryData>(),
  )
  const [attackPaths, setAttackPaths] = useState<SourceState<IdentityAttackPathsData>>(
    initialSourceState<IdentityAttackPathsData>(),
  )
  const [findings, setFindings] = useState<SourceState<any[]>>(initialSourceState<any[]>())
  const [systems, setSystems] = useState<SourceState<SystemSummary[]>>(
    initialSourceState<SystemSummary[]>(),
  )

  const abortRef = useRef<AbortController | null>(null)
  const systemRef = useRef(systemName)
  systemRef.current = systemName

  const runFetch = useCallback(
    <T,>(
      url: string,
      setter: React.Dispatch<React.SetStateAction<SourceState<T>>>,
      transform?: (raw: any) => T,
    ) => {
      if (!abortRef.current) {
        abortRef.current = new AbortController()
      }
      const signal = abortRef.current.signal

      setter((s) => ({ ...s, loading: true, error: null }))

      fetchJson<T>(url, signal)
        .then((raw) => {
          if (signal.aborted) return
          const data = transform ? transform(raw) : raw
          setter({ data, loading: false, error: null, fetchedAt: Date.now() })
        })
        .catch((err: any) => {
          if (signal.aborted || err?.name === "AbortError") return
          setter((s) => ({
            ...s,
            loading: false,
            error: err?.message || "Request failed",
            fetchedAt: Date.now(),
          }))
        })
    },
    [],
  )

  const fetchEnforcement = useCallback(() => {
    const sys = systemRef.current
    runFetch<EnforcementScoreData>(
      `/api/proxy/enforcement-score?systemName=${encodeURIComponent(sys)}`,
      setEnforcement,
    )
  }, [runFetch])

  const fetchPosture = useCallback(() => {
    const sys = systemRef.current
    runFetch<PostureScoreData>(
      `/api/proxy/posture-score/${encodeURIComponent(sys)}`,
      setPosture,
    )
  }, [runFetch])

  const fetchIssues = useCallback(() => {
    const sys = systemRef.current
    runFetch<IssuesSummaryData>(
      `/api/proxy/issues-summary?systemName=${encodeURIComponent(sys)}`,
      setIssues,
    )
  }, [runFetch])

  const fetchAttackPaths = useCallback(() => {
    const sys = systemRef.current
    runFetch<IdentityAttackPathsData>(
      `/api/proxy/identity-attack-paths/${encodeURIComponent(sys)}`,
      setAttackPaths,
    )
  }, [runFetch])

  const fetchFindings = useCallback(() => {
    const sys = systemRef.current
    runFetch<any>(`/api/proxy/findings?systemName=${encodeURIComponent(sys)}`, setFindings, (raw) => {
      if (Array.isArray(raw)) return raw
      if (Array.isArray(raw?.findings)) return raw.findings
      return []
    })
  }, [runFetch])

  // Systems list is global — does not depend on the selected system
  const fetchSystems = useCallback(() => {
    runFetch<any>(`/api/proxy/systems`, setSystems, (raw) => {
      if (Array.isArray(raw?.systems)) return raw.systems
      if (Array.isArray(raw)) return raw
      return []
    })
  }, [runFetch])

  const refresh = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    fetchEnforcement()
    fetchPosture()
    fetchIssues()
    fetchAttackPaths()
    fetchFindings()
    fetchSystems()
  }, [fetchEnforcement, fetchPosture, fetchIssues, fetchAttackPaths, fetchFindings, fetchSystems])

  const refreshOne = useCallback(
    (key: HomeDataKey) => {
      switch (key) {
        case "enforcement":
          fetchEnforcement()
          break
        case "posture":
          fetchPosture()
          break
        case "issues":
          fetchIssues()
          break
        case "attackPaths":
          fetchAttackPaths()
          break
        case "findings":
          fetchFindings()
          break
        case "systems":
          fetchSystems()
          break
      }
    },
    [fetchEnforcement, fetchPosture, fetchIssues, fetchAttackPaths, fetchFindings, fetchSystems],
  )

  // Use a ref so the effect only depends on systemName — avoids a re-run
  // loop when React 19 Strict Mode treats chained useCallback identities as
  // changing. refreshRef always points at the latest closure.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    refreshRef.current()
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [systemName])

  return useMemo(
    () => ({
      systemName,
      enforcement,
      posture,
      issues,
      attackPaths,
      findings,
      systems,
      refresh,
      refreshOne,
    }),
    [systemName, enforcement, posture, issues, attackPaths, findings, systems, refresh, refreshOne],
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function relativeTime(ts: number | string | null | undefined): string | null {
  if (!ts) return null
  const then = typeof ts === "number" ? ts : new Date(ts).getTime()
  if (Number.isNaN(then)) return null
  const diffMs = Date.now() - then
  if (diffMs < 0) return "just now"
  const secs = Math.round(diffMs / 1000)
  if (secs < 60) return `updated ${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `updated ${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `updated ${hours}h ago`
  const days = Math.round(hours / 24)
  return `updated ${days}d ago`
}
