"use client"

/**
 * Topology v0.2 — Estate filter rail.
 *
 * Workload type, severity, and confidence filters. Client-side — trims the
 * nodes list rendered in the canvas pane. Summary counts come from
 * system_kpis (workload-type counts) or are computed from the nodes array
 * (severity / stale / low-confidence).
 */

import { useMemo } from "react"
import type { ScoreTier, SystemKpis, TopologyNode } from "./types"

export interface EstateFilters {
  types: Set<string>
  tiers: Set<ScoreTier | "STALE" | "UNSCORED">
  includeStaleOnly: boolean
  includeUnscoredOnly: boolean
}

export function defaultFilters(kpis: SystemKpis | null): EstateFilters {
  const types = new Set<string>()
  if (kpis) {
    for (const [t, v] of Object.entries(kpis.workloads_by_type)) {
      if (v > 0) types.add(t)
    }
  }
  return {
    types,
    tiers: new Set(["WORST", "HIGH", "ELEVATED", "QUIET", "STALE", "UNSCORED"]),
    includeStaleOnly: false,
    includeUnscoredOnly: false,
  }
}

interface Props {
  kpis: SystemKpis | null
  nodes: TopologyNode[]
  filters: EstateFilters
  onChange: (next: EstateFilters) => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2
        className="text-[11px] uppercase tracking-[0.16em] font-semibold mb-2"
        style={{ color: "#1A2330" }}
      >
        {title}
      </h2>
      {children}
    </div>
  )
}

function CountChip({ n, variant = "neutral" }: { n: number; variant?: "neutral" | "warn" | "amber" }) {
  const color =
    variant === "warn"
      ? "#E04545"
      : variant === "amber"
      ? "#F5A623"
      : "#5A6B7A"
  return (
    <span className="ml-auto font-mono text-[12px] font-semibold" style={{ color }}>
      {n}
    </span>
  )
}

export function FilterRail({ kpis, nodes, filters, onChange }: Props) {
  const tierCounts = useMemo(() => {
    const c: Record<string, number> = {
      WORST: 0, HIGH: 0, ELEVATED: 0, QUIET: 0, STALE: 0, UNSCORED: 0,
    }
    for (const n of nodes) {
      if (n.stale) {
        c.STALE++
        continue
      }
      if (!n.score) {
        c.UNSCORED++
        continue
      }
      c[n.score.tier]++
    }
    return c
  }, [nodes])

  const lowConfCount = useMemo(
    () => nodes.filter(n => n.score && n.score.confidence.tier !== "FULL").length,
    [nodes],
  )

  const toggleType = (type: string) => {
    const next = new Set(filters.types)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    onChange({ ...filters, types: next })
  }

  const toggleTier = (tier: ScoreTier | "STALE" | "UNSCORED") => {
    const next = new Set(filters.tiers)
    if (next.has(tier)) next.delete(tier)
    else next.add(tier)
    onChange({ ...filters, tiers: next })
  }

  const typeRows = kpis
    ? Object.entries(kpis.workloads_by_type)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
    : []

  const labelCls = "flex items-center gap-2 py-1 text-[13px] cursor-pointer"
  const divider = "border-t my-3"
  const dividerStyle = { borderColor: "#E2E8F0" }

  return (
    <aside
      className="rounded-lg p-4"
      style={{ background: "white", border: "1px solid #DDE3E8", color: "#1A2330" }}
    >
      <Section title="Workload type">
        {typeRows.length === 0 && (
          <div className="text-[11px]" style={{ color: "#5A6B7A" }}>
            No workload-type breakdown returned.
          </div>
        )}
        {typeRows.map(([t, v]) => (
          <label key={t} className={labelCls}>
            <input
              type="checkbox"
              checked={filters.types.has(t)}
              onChange={() => toggleType(t)}
              className="accent-teal-600"
            />
            <span>{t}</span>
            <CountChip n={v} />
          </label>
        ))}
      </Section>

      <div className={divider} style={dividerStyle} />

      <Section title="Severity">
        {(["WORST", "HIGH", "ELEVATED", "QUIET"] as const).map(t => (
          <label key={t} className={labelCls}>
            <input
              type="checkbox"
              checked={filters.tiers.has(t)}
              onChange={() => toggleTier(t)}
              className="accent-teal-600"
            />
            <span>{t.charAt(0) + t.slice(1).toLowerCase()}</span>
            <CountChip
              n={tierCounts[t]}
              variant={t === "WORST" || t === "HIGH" ? "warn" : "neutral"}
            />
          </label>
        ))}
        <label className={labelCls}>
          <input
            type="checkbox"
            checked={filters.tiers.has("STALE")}
            onChange={() => toggleTier("STALE")}
            className="accent-teal-600"
          />
          <span>Stale</span>
          <CountChip n={tierCounts.STALE} variant="amber" />
        </label>
        <label className={labelCls}>
          <input
            type="checkbox"
            checked={filters.tiers.has("UNSCORED")}
            onChange={() => toggleTier("UNSCORED")}
            className="accent-teal-600"
          />
          <span>Unscored</span>
          <CountChip n={tierCounts.UNSCORED} variant="amber" />
        </label>
      </Section>

      <div className={divider} style={dividerStyle} />

      <Section title="Confidence">
        <label className={labelCls}>
          <input
            type="checkbox"
            checked={filters.includeUnscoredOnly}
            onChange={() =>
              onChange({ ...filters, includeUnscoredOnly: !filters.includeUnscoredOnly })
            }
            className="accent-teal-600"
          />
          <span>Show only unscored nodes</span>
          <CountChip n={tierCounts.UNSCORED} variant="amber" />
        </label>
        <label className={labelCls}>
          <input
            type="checkbox"
            checked={filters.includeStaleOnly}
            onChange={() =>
              onChange({ ...filters, includeStaleOnly: !filters.includeStaleOnly })
            }
            className="accent-teal-600"
          />
          <span>Show only DEGRADED/LOW confidence</span>
          <CountChip n={lowConfCount} variant="amber" />
        </label>
      </Section>

      <div className="text-[10px] leading-snug mt-4 pt-3 border-t" style={{ borderColor: "#E2E8F0", color: "#5A6B7A" }}>
        Estate filters trim the canvas client-side. Counts reflect the full
        nodes payload returned by the endpoint.
      </div>
    </aside>
  )
}

export function applyFilters(nodes: TopologyNode[], filters: EstateFilters): TopologyNode[] {
  return nodes.filter(n => {
    const type = n.type ?? "?"
    if (!filters.types.has(type)) return false

    if (filters.includeUnscoredOnly && n.score) return false
    if (filters.includeStaleOnly) {
      if (!n.score) return false
      if (n.score.confidence.tier === "FULL") return false
    }

    if (n.stale) return filters.tiers.has("STALE")
    if (!n.score) return filters.tiers.has("UNSCORED")
    return filters.tiers.has(n.score.tier)
  })
}
