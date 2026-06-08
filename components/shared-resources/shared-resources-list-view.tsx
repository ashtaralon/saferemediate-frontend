"use client"

// Unified Shared Resources surface — Slice 0 + PR-3 per
// docs/shared-resources-real-data-wiring.md (backend repo).
//
// Fetches both /api/iam/shared-roles and /api/sg/shared-sgs, merges
// into one row stream, sorts by sort_score DESC so the top of the
// list IS the most actionable surface (highest-confidence narrowing
// opportunities first). Type discrimination by source endpoint; row
// shape normalized for uniform rendering.
//
// Discipline anchors:
//  - pattern_render_the_answer_not_the_inventory — the list answers
//    "what should I narrow next?" not "here are all my shared
//    resources." Default sort by sort_score makes the answer geometric.
//  - feedback_signal_language — chip labels are descriptive
//    ("Narrowable", "Already tight"), not accusative.
//  - pattern_no_phantom_capabilities_in_ui — when substrate has only
//    N=4 narrowing_available today, sidebar shows 4. Honest small
//    number; don't render fabricated counts.
//  - pattern_prd_anchored_on_empirical_data — every value here comes
//    from a live endpoint, no client-side fabrication.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Loader2,
  Network,
  Users,
} from "lucide-react"
import {
  HEADLINE_STATE_PRESENTATION,
  type HeadlineState,
  type NarrowingMetrics,
  type SharedResourceRow,
  type SharedRoleRow,
  type SharedSGRow,
  type SharedSGRowRaw,
} from "./types"
import { NarrowingDiffPanel } from "./narrowing-diff-panel"

interface SharedRolesApiResponse {
  shared_roles?: Array<Omit<SharedRoleRow, "type">>
  roles?: Array<Omit<SharedRoleRow, "type">>
}

interface SharedSGsApiResponse {
  shared_sgs?: SharedSGRowRaw[]
  sgs?: SharedSGRowRaw[]
}

/** Flatten an SG row's nested `narrowing` block to top-level so the
 *  list view can read uniform fields across both row types. */
function normalizeSG(raw: SharedSGRowRaw): SharedSGRow {
  const n = raw.narrowing ?? {
    allowed_count: 0,
    keep_count: 0,
    narrow_count: 0,
    investigation_count: 0,
    narrowable_pct: 0,
    headline_state: "no_rule_data" as HeadlineState,
    is_platform_owned: false,
    sort_score: 0,
  }
  const hardBlocks = (raw.verdict?.blocked_reasons ?? []).filter(
    (b) => b.severity === "hard",
  )
  return {
    type: "security-group",
    sg_id: raw.sg_id,
    sg_name: raw.sg_name,
    vpc_id: raw.vpc_id,
    consumer_count: raw.consumer_count,
    consumer_breakdown: raw.consumer_breakdown ?? {},
    rule_summary: raw.rule_summary,
    traffic_ports_observed: n.traffic_ports_observed ?? 0,
    has_blocked_reasons: hardBlocks.length > 0,
    blocked_reasons: raw.verdict?.blocked_reasons ?? [],
    ...({
      allowed_count: n.allowed_count,
      keep_count: n.keep_count,
      narrow_count: n.narrow_count,
      investigation_count: n.investigation_count,
      narrowable_pct: n.narrowable_pct,
      headline_state: n.headline_state,
      is_platform_owned: n.is_platform_owned,
      sort_score: n.sort_score,
    } satisfies NarrowingMetrics),
  }
}

function normalizeIAM(raw: Omit<SharedRoleRow, "type">): SharedRoleRow {
  return { type: "iam-role", ...raw }
}

interface Filters {
  showAllStates: boolean
  systemName: string
}

const DEFAULT_FILTERS: Filters = {
  showAllStates: false,
  systemName: "alon-prod",
}

export function SharedResourcesListView() {
  const router = useRouter()
  const [rows, setRows] = useState<SharedResourceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({
        system_name: filters.systemName,
      })
      const [iamRes, sgRes] = await Promise.all([
        fetch(`/api/proxy/iam/shared-roles?${qs}`, { cache: "no-store" }),
        fetch(`/api/proxy/sg/shared-sgs?${qs}`, { cache: "no-store" }),
      ])
      if (!iamRes.ok) {
        throw new Error(`IAM endpoint ${iamRes.status}: ${await iamRes.text()}`)
      }
      if (!sgRes.ok) {
        throw new Error(`SG endpoint ${sgRes.status}: ${await sgRes.text()}`)
      }
      const iamJson = (await iamRes.json()) as SharedRolesApiResponse
      const sgJson = (await sgRes.json()) as SharedSGsApiResponse
      const iamRows = (iamJson.shared_roles ?? iamJson.roles ?? []).map(
        normalizeIAM,
      )
      const sgRows = (sgJson.shared_sgs ?? sgJson.sgs ?? []).map(normalizeSG)
      // Default sort per spec §1: sort_score DESC so the top of the list
      // IS the actionable surface. Stable tie-break: type then name.
      const merged: SharedResourceRow[] = [...iamRows, ...sgRows].sort(
        (a, b) => {
          const dscore = b.sort_score - a.sort_score
          if (dscore !== 0) return dscore
          if (a.type !== b.type) return a.type.localeCompare(b.type)
          return rowDisplayName(a).localeCompare(rowDisplayName(b))
        },
      )
      setRows(merged)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [filters.systemName])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const filteredRows = useMemo(() => {
    if (!rows) return null
    if (filters.showAllStates) return rows
    // Default view per spec §4 — the actionable surface is rows with
    // narrowing_available. Operators wanting "what should I work on
    // next?" land here. Toggle to "all states" surfaces the broader
    // population (already-tight / evidence-pending / no-data).
    return rows.filter((r) => r.headline_state === "narrowing_available")
  }, [rows, filters.showAllStates])

  const narrowingAvailableCount = useMemo(
    () => (rows ?? []).filter((r) => r.headline_state === "narrowing_available").length,
    [rows],
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Shared Resources
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            IAM roles and security groups shared across multiple consumers.
            Sorted by narrowing opportunity — the top of the list is the most
            actionable. Counts and percentages come from live substrate
            analysis; no fabricated values.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-teal-500/50 bg-teal-500/10 text-teal-300 text-sm font-semibold"
            title={`${narrowingAvailableCount} resources with observed activity that supports narrowing`}
          >
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            {narrowingAvailableCount} narrowable
          </span>
        </div>
      </header>

      <div className="flex items-center gap-4 text-sm text-slate-400">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-slate-600 bg-slate-800"
            checked={filters.showAllStates}
            onChange={(e) =>
              setFilters((f) => ({ ...f, showAllStates: e.target.checked }))
            }
          />
          <span>Show all states (including evidence-pending and tight)</span>
        </label>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading shared resources…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-rose-500/50 bg-rose-500/10 text-rose-200">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Failed to load shared resources</div>
            <div className="text-xs text-rose-300/80 mt-1">{error}</div>
          </div>
        </div>
      )}

      {!loading && !error && rows && filteredRows && (
        <div className="flex flex-col gap-2">
          {filteredRows.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              {filters.showAllStates
                ? "No shared resources found on this system."
                : "No narrowing opportunities right now. Toggle “Show all states” to see evidence-pending and already-tight resources."}
            </div>
          ) : (
            <>
              <div className="px-4 py-2 text-xs text-slate-500 uppercase tracking-wider grid grid-cols-12 gap-3" data-shared-resources-header>
                <div className="col-span-4">Resource</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-2">Consumers</div>
                <div className="col-span-2">Narrowable</div>
                <div className="col-span-2">State</div>
              </div>
              {filteredRows.map((row) => (
                <SharedResourceRowCard
                  key={rowKey(row)}
                  row={row}
                  expanded={expandedId === rowKey(row)}
                  onToggle={() =>
                    setExpandedId((cur) =>
                      cur === rowKey(row) ? null : rowKey(row),
                    )
                  }
                  onOpenLegacy={() => {
                    if (row.type === "iam-role") {
                      router.push(
                        `/iam/shared-roles?focus=${encodeURIComponent(row.role_name)}`,
                      )
                    } else {
                      router.push(
                        `/sg/shared-sgs?focus=${encodeURIComponent(row.sg_id)}`,
                      )
                    }
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function rowKey(row: SharedResourceRow): string {
  return row.type === "iam-role" ? `iam:${row.role_arn}` : `sg:${row.sg_id}`
}

function rowDisplayName(row: SharedResourceRow): string {
  return row.type === "iam-role" ? row.role_name : row.sg_name
}

function rowIdentifier(row: SharedResourceRow): string {
  return row.type === "iam-role" ? row.role_arn : row.sg_id
}

interface SharedResourceRowCardProps {
  row: SharedResourceRow
  expanded: boolean
  onToggle: () => void
  onOpenLegacy: () => void
}

function SharedResourceRowCard({
  row,
  expanded,
  onToggle,
  onOpenLegacy,
}: SharedResourceRowCardProps) {
  const presentation = HEADLINE_STATE_PRESENTATION[row.headline_state]
  const Icon = row.type === "iam-role" ? KeyRound : Network
  return (
    <div
      data-shared-resource-row
      data-resource-type={row.type}
      data-resource-id={rowIdentifier(row)}
      data-headline-state={row.headline_state}
      data-narrowable-pct={row.narrowable_pct}
      data-sort-score={row.sort_score}
      className="rounded-lg border border-slate-700 bg-slate-800/40 hover:border-slate-600 transition-colors"
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 grid grid-cols-12 gap-3 items-center"
      >
        <div className="col-span-4 flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
          )}
          <Icon
            className={`w-4 h-4 flex-shrink-0 ${
              row.type === "iam-role" ? "text-pink-400" : "text-sky-400"
            }`}
          />
          <span className="text-sm font-semibold text-white truncate" title={rowIdentifier(row)}>
            {rowDisplayName(row)}
          </span>
          {row.is_platform_owned && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-600 bg-slate-800 text-slate-400"
              title="Platform-owned resource (e.g. default VPC SG, AWSServiceRole*) — sort_score downweighted to 0.4×"
            >
              Platform
            </span>
          )}
        </div>
        <div className="col-span-2 text-sm text-slate-300">
          {row.type === "iam-role" ? "IAM Role" : "Security Group"}
        </div>
        <div className="col-span-2 inline-flex items-center gap-1.5 text-sm text-slate-300">
          <Users className="w-3.5 h-3.5 text-slate-500" />
          {row.consumer_count}
        </div>
        <div className="col-span-2 text-sm text-slate-300 font-mono">
          {row.narrow_count}/{row.allowed_count} ({row.narrowable_pct}%)
        </div>
        <div className="col-span-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${presentation.chipClass}`}
            title={presentation.tooltip}
            data-headline-chip
          >
            {presentation.label}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-700 px-4 py-4 bg-slate-900/50">
          <NarrowingDiffPanel row={row} />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onOpenLegacy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500 rounded-md transition-colors"
            >
              Open full {row.type === "iam-role" ? "role" : "SG"} detail
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
