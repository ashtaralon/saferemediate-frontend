"use client"

// Network LP panel — the primary operator/CISO surface for route-level
// least-privilege candidates. Consumes the scoped findings endpoint
// (/api/network-lp/findings), classifies every route into the five card types,
// and lets the operator scan, filter (by finding type / subnet), and read the
// evidence. Candidate-grade throughout — never "safe to remove".

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, Network } from "lucide-react"
import {
  CARD_META,
  RouteCard,
  classify,
  type CardKind,
  type NetworkLpResponse,
  type RouteOut,
} from "./network-lp-cards"

interface FindingsResponse {
  system_id?: string | null
  subnet_count: number
  candidate_count: number
  subnets: NetworkLpResponse[]
}

interface Finding {
  kind: CardKind
  route: RouteOut
  subnetId: string
  days?: number | null
}

const ALL_KINDS: CardKind[] = ["INTERNET", "CROSS_NETWORK", "BLACKHOLE", "SHARED_RT", "AWS_SERVICE"]

export function NetworkLpPanel({
  systemId,
  initialSubnet,
}: {
  systemId?: string
  initialSubnet?: string
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FindingsResponse | null>(null)
  const [kindFilter, setKindFilter] = useState<CardKind | "ALL">("ALL")
  const [subnetFilter, setSubnetFilter] = useState<string | "ALL">(initialSubnet || "ALL")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = systemId ? `?system_id=${encodeURIComponent(systemId)}` : ""
      const res = await fetch(`/api/proxy/network-lp-findings${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData((await res.json()) as FindingsResponse)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load findings")
    } finally {
      setLoading(false)
    }
  }, [systemId])

  useEffect(() => {
    void load()
  }, [load])

  const findings: Finding[] = useMemo(() => {
    const out: Finding[] = []
    for (const s of data?.subnets ?? []) {
      for (const r of s.routes) {
        const kind = classify(r)
        if (kind) out.push({ kind, route: r, subnetId: s.subnet_id, days: s.observation_days })
      }
    }
    return out.sort(
      (a, b) => ALL_KINDS.indexOf(a.kind) - ALL_KINDS.indexOf(b.kind),
    )
  }, [data])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of findings) c[f.kind] = (c[f.kind] || 0) + 1
    return c
  }, [findings])

  const subnetIds = useMemo(
    () => Array.from(new Set(findings.map((f) => f.subnetId))).sort(),
    [findings],
  )

  const visible = findings.filter(
    (f) =>
      (kindFilter === "ALL" || f.kind === kindFilter) &&
      (subnetFilter === "ALL" || f.subnetId === subnetFilter),
  )

  return (
    <div className="w-full max-w-3xl mx-auto p-4 text-left">
      <div className="flex items-center gap-2 mb-1">
        <Network className="w-5 h-5 text-teal-500" />
        <h2 className="text-base font-semibold text-foreground">
          Network least-privilege candidates
        </h2>
        <button
          onClick={() => void load()}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {systemId ? `System ${systemId}` : "All subnets"} ·{" "}
        {data ? `${findings.length} candidates across ${subnetIds.length} subnets` : "…"}
        {" · "}configured paths with no observed traffic requiring them. Candidate-grade only.
      </p>

      {/* Summary counts by finding type (also act as filters) */}
      {data && findings.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <SummaryPill
            label="All"
            count={findings.length}
            active={kindFilter === "ALL"}
            onClick={() => setKindFilter("ALL")}
          />
          {ALL_KINDS.filter((k) => counts[k]).map((k) => (
            <SummaryPill
              key={k}
              label={CARD_META[k].title}
              count={counts[k]}
              active={kindFilter === k}
              onClick={() => setKindFilter((cur) => (cur === k ? "ALL" : k))}
            />
          ))}
        </div>
      )}

      {/* Subnet filter */}
      {data && subnetIds.length > 1 && (
        <div className="mb-3">
          <select
            value={subnetFilter}
            onChange={(e) => setSubnetFilter(e.target.value)}
            className="text-xs rounded border border-border bg-background px-2 py-1"
          >
            <option value="ALL">All subnets ({subnetIds.length})</option>
            {subnetIds.map((sid) => (
              <option key={sid} value={sid}>
                {sid} ({findings.filter((f) => f.subnetId === sid).length})
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading network-LP candidates…
        </div>
      )}
      {error && !loading && (
        <div className="text-sm text-red-500 py-3">
          {error}.{" "}
          <button className="underline" onClick={() => void load()}>
            retry
          </button>
        </div>
      )}
      {!loading && !error && data && visible.length === 0 && (
        <div className="text-sm text-muted-foreground py-4">
          No route findings — configured routes match observed traffic.
        </div>
      )}

      <div className="space-y-3">
        {visible.map((f) => (
          <div key={`${f.subnetId}:${f.route.route_id}`}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              {f.subnetId}
            </div>
            <RouteCard kind={f.kind} r={f.route} days={f.days} />
          </div>
        ))}
      </div>

      {data && findings.length > 0 && (
        <p className="mt-4 text-[11px] text-muted-foreground border-t border-border pt-2">
          Candidate only — not validated for automatic removal. Enforcement
          requires shared-route-table analysis, simulation, canary, and rollback.
        </p>
      )}
    </div>
  )
}

function SummaryPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-md border text-xs flex items-center gap-1.5 transition-colors ${
        active
          ? "border-teal-500/60 bg-teal-500/10 text-foreground"
          : "border-border bg-card/50 text-muted-foreground hover:text-foreground"
      }`}
    >
      <span>{label}</span>
      <span className="font-semibold">{count}</span>
    </button>
  )
}

export default NetworkLpPanel
