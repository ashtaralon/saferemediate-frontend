"use client"

/**
 * External Egress Inventory — chunk #1 (alert-only, read-only)
 * =============================================================
 *
 * Flat-table view answering the operator's Tier-1 question:
 * "Which workloads in this system are talking outside the VPC/system,
 *  on what ports, with how much traffic, to what domains/services/IPs,
 *  and what should be reviewed or restricted?"
 *
 * One row per (workload, destination_ip, port, protocol). The backend
 * classifies every row into exactly one of five mutually-exclusive
 * destination classes (priority-ordered, first match wins, no overlap).
 *
 * Three independent confidence axes are rendered as separate column
 * signals:
 *   - domain_evidence:       dns_matched | unknown
 *   - observation_strength:  strong | medium | weak
 *   - enforcement_readiness: simulation_ready | review_required | not_ready
 *
 * Strict UI discipline:
 *   - No "block", "enforce", "deny", "allowlist" anywhere in operator
 *     copy. This view is alert-only — visibility + recommendation,
 *     never policy push.
 *   - Domain column reads "—" until R53 Resolver Query Logs are wired.
 *     No reverse-DNS guessing, no IP-org substitution. Honest blank
 *     beats invented data.
 *   - Three confidence axes stay visually separated so the operator
 *     never confuses "I saw it often" with "I know what it is".
 */

import React, { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ExternalLink,
  Globe,
  HelpCircle,
  Info,
  Network,
  RefreshCw,
  Server,
} from "lucide-react"

interface InternalTarget {
  workload_id: string
  workload_name: string | null
  system_name: string | null
  labels: string[]
}

interface InventoryRow {
  workload_id: string
  workload_name: string | null
  source_identity: {
    role_name: string | null
    role_arn: string | null
  }
  destination_class:
    | "internal_to_org_external_to_system"
    | "cloud_service"
    | "saas"
    | "internet"
    | "unknown_ip"
  destination_ip: string
  resolved_domain: string | null
  domain_evidence: "dns_matched" | "unknown"
  internal_target: InternalTarget | null
  aws_service: string | null
  aws_region: string | null
  org: string | null
  asn: string | null
  country: string | null
  port: string | null
  protocol: string | null
  bytes: number
  hits: number
  first_seen: string | null
  last_seen: string | null
  evidence: string[]
  observation_strength: "strong" | "medium" | "weak"
  recommendation:
    | "review"
    | "unknown_needs_owner"
    | "prefer_private_endpoint"
    | "restrict_candidate"
    | "keep"
  enforcement_readiness: "simulation_ready" | "review_required" | "not_ready"
  signals: string[]
}

interface InventoryResponse {
  system_name: string
  lookback_days: number
  rows: InventoryRow[]
  total: number
  limit: number
  offset: number
  filters: {
    destination_class: string | null
    recommendation: string | null
    strength: string | null
  }
  counts: {
    by_class: Record<string, number>
    by_recommendation: Record<string, number>
    by_strength: Record<string, number>
  }
  invariant: {
    A_raw_external_tuples: number
    B_classified_tuples: number
    C_inventory_pre_pagination_total: number
    raw_external_ip_groups: number
  }
  domain_visibility: { available: boolean; reason: string }
  first_seen_visibility: { available: boolean; reason: string }
  notes: string[]
}

// Destination-class metadata: label, tooltip, badge color. The class
// taxonomy is contract-locked with the backend; if a new class is
// added there, this map needs an entry or the row falls back to a
// neutral "Unknown class" badge.
const CLASS_META: Record<
  InventoryRow["destination_class"],
  { label: string; cls: string; tooltip: string }
> = {
  unknown_ip: {
    label: "Unknown IP",
    cls: "bg-red-100 text-red-800 border-red-300",
    tooltip:
      "Public IP with no enrichment data. True blackbox — operator literally cannot say what this is. Most security-interesting bucket.",
  },
  internet: {
    label: "Internet",
    cls: "bg-amber-100 text-amber-800 border-amber-300",
    tooltip:
      "Public IP with some identification (org / ASN, or AWS IP without a specific service). Named but not yet in the approved SaaS catalog.",
  },
  saas: {
    label: "SaaS",
    cls: "bg-blue-100 text-blue-800 border-blue-300",
    tooltip:
      "Matches the curated SaaS catalog by org. (Catalog is empty in this MVP; populated by operator approvals in a follow-up.)",
  },
  internal_to_org_external_to_system: {
    label: "Cross-system",
    cls: "bg-purple-100 text-purple-800 border-purple-300",
    tooltip:
      "Destination IP belongs to another workload in your org but in a different system. Lateral-movement signal, not internet egress. Public-IP detection only; peered-VPC RFC1918 is a known gap.",
  },
  cloud_service: {
    label: "Cloud service",
    cls: "bg-slate-100 text-slate-700 border-slate-300",
    tooltip:
      "AWS prefix-list match with a specific service identified (S3, KMS, STS, etc.). Generic AWS IP space without a named service falls through to Internet.",
  },
}

const RECOMMENDATION_META: Record<
  InventoryRow["recommendation"],
  { label: string; cls: string; tooltip: string }
> = {
  review: {
    label: "Review",
    cls: "bg-amber-50 text-amber-900 border-amber-200",
    tooltip:
      "Strong observation of an unfamiliar destination. Operator should classify or contact the owner.",
  },
  unknown_needs_owner: {
    label: "Owner mapping",
    cls: "bg-slate-50 text-slate-700 border-slate-200",
    tooltip:
      "Weak/medium observation without identification. Needs someone to claim it before stronger action.",
  },
  prefer_private_endpoint: {
    label: "Prefer VPC endpoint",
    cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
    tooltip:
      "AWS service has a VPC interface/gateway endpoint available. Routing through it avoids public-internet egress entirely.",
  },
  restrict_candidate: {
    label: "Restrict candidate",
    cls: "bg-orange-50 text-orange-900 border-orange-200",
    tooltip:
      "Candidate for tighter egress scope. Operator review still required — no automatic enforcement in this view.",
  },
  keep: {
    label: "Keep",
    cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
    tooltip:
      "Approved behavior. (Approvals not yet wired in this MVP — every row currently routes to Review or Owner mapping.)",
  },
}

const STRENGTH_META: Record<
  InventoryRow["observation_strength"],
  { label: string; cls: string }
> = {
  strong: { label: "Strong", cls: "bg-blue-100 text-blue-900 border-blue-300" },
  medium: { label: "Medium", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  weak: { label: "Weak", cls: "bg-slate-50 text-slate-600 border-slate-200" },
}

const READINESS_META: Record<
  InventoryRow["enforcement_readiness"],
  { label: string; cls: string; tooltip: string }
> = {
  simulation_ready: {
    label: "Simulation ready",
    cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
    tooltip:
      "Row has enough evidence and approval state to be fed into a future simulate → snapshot → canary flow.",
  },
  review_required: {
    label: "Needs review",
    cls: "bg-amber-50 text-amber-900 border-amber-200",
    tooltip:
      "Operator review must complete before this row can move toward simulation. No automatic actions are taken.",
  },
  not_ready: {
    label: "Not ready",
    cls: "bg-slate-50 text-slate-500 border-slate-200",
    tooltip:
      "Insufficient observation for any policy claim. Watch over time; revisit when traffic strengthens.",
  },
}

function formatBytes(n: number): string {
  if (!n) return "0 B"
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`
  return `${n} B`
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const now = Date.now()
    const ageMs = now - d.getTime()
    const days = Math.floor(ageMs / (24 * 3600 * 1000))
    if (days <= 0) return "today"
    if (days === 1) return "1d ago"
    if (days < 30) return `${days}d ago`
    return d.toISOString().slice(0, 10)
  } catch {
    return iso
  }
}

function dashIf(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  return String(v)
}

function ClassPill({ klass }: { klass: InventoryRow["destination_class"] }) {
  const meta = CLASS_META[klass]
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border ${meta.cls}`}
      title={meta.tooltip}
    >
      {meta.label}
    </span>
  )
}

function RecommendationPill({ rec }: { rec: InventoryRow["recommendation"] }) {
  const meta = RECOMMENDATION_META[rec]
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border ${meta.cls}`}
      title={meta.tooltip}
    >
      {meta.label}
    </span>
  )
}

function StrengthBars({ strength }: { strength: InventoryRow["observation_strength"] }) {
  const bars = strength === "strong" ? 3 : strength === "medium" ? 2 : 1
  const label = STRENGTH_META[strength].label
  return (
    <span
      className="inline-flex items-end gap-0.5"
      title={`Observation strength: ${label}. Independent from domain evidence — a strong-but-unknown talker is exactly what to investigate.`}
    >
      <span className={`inline-block w-1 h-1.5 ${bars >= 1 ? "bg-blue-700" : "bg-slate-200"}`} />
      <span className={`inline-block w-1 h-2 ${bars >= 2 ? "bg-blue-700" : "bg-slate-200"}`} />
      <span className={`inline-block w-1 h-2.5 ${bars >= 3 ? "bg-blue-700" : "bg-slate-200"}`} />
      <span className="ml-1 text-[10px] uppercase tracking-wider text-slate-600">{label}</span>
    </span>
  )
}

function DomainCell({ row }: { row: InventoryRow }) {
  if (row.domain_evidence === "dns_matched" && row.resolved_domain) {
    return (
      <span
        className="font-mono text-slate-800"
        title="Domain resolved by R53 Resolver Query Logs from this workload's ENI within the time window. Note: this proves DNS resolution evidence, not that the connection used the domain — could be DNS caching, shared CDN IPs, or connection reuse."
      >
        {row.resolved_domain}
      </span>
    )
  }
  return (
    <span
      className="text-slate-400"
      title="No DNS resolution evidence. Domain remains blank until Route 53 Resolver Query Logs are wired."
    >
      —
    </span>
  )
}

function ReadinessPill({ readiness }: { readiness: InventoryRow["enforcement_readiness"] }) {
  const meta = READINESS_META[readiness]
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border ${meta.cls}`}
      title={meta.tooltip}
    >
      {meta.label}
    </span>
  )
}

const CLASS_ORDER: InventoryRow["destination_class"][] = [
  "unknown_ip",
  "internet",
  "saas",
  "internal_to_org_external_to_system",
  "cloud_service",
]

const STRENGTH_ORDER: InventoryRow["observation_strength"][] = [
  "strong",
  "medium",
  "weak",
]

interface InventoryProps {
  systemName: string
  onSelectWorkload?: (workloadId: string, workloadName: string | null) => void
}

export function EgressExternalInventory({ systemName, onSelectWorkload }: InventoryProps) {
  const [data, setData] = useState<InventoryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [classFilter, setClassFilter] = useState<string | null>(null)
  const [strengthFilter, setStrengthFilter] = useState<string | null>(null)
  const [recommendationFilter, setRecommendationFilter] = useState<string | null>(null)

  const fetchInventory = async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ days: "30", limit: "200", offset: "0" })
      if (classFilter) qs.set("destination_class", classFilter)
      if (strengthFilter) qs.set("strength", strengthFilter)
      if (recommendationFilter) qs.set("recommendation", recommendationFilter)
      if (force) qs.set("_", String(Date.now()))
      const url = `/api/proxy/egress/system/${encodeURIComponent(
        systemName,
      )}/external-inventory?${qs.toString()}`
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const j = await res.json()
      setData(j)
    } catch (e: any) {
      setError(e.message || "Failed to load inventory")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!systemName) return
    fetchInventory(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemName, classFilter, strengthFilter, recommendationFilter])

  const invariantHealthy = useMemo(() => {
    if (!data?.invariant) return null
    const { A_raw_external_tuples, B_classified_tuples, C_inventory_pre_pagination_total } =
      data.invariant
    return (
      A_raw_external_tuples === B_classified_tuples &&
      B_classified_tuples === C_inventory_pre_pagination_total
    )
  }, [data])

  if (!systemName) {
    return (
      <div className="text-sm text-slate-500 p-4">
        Select a system to see external egress inventory.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            External Egress Inventory
            <span className="text-xs font-normal text-slate-500">
              · {systemName} · 30-day window
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Every observed connection from a workload in <code>{systemName}</code> to a
            destination outside the customer VPC or system. Classified into one of five
            mutually-exclusive buckets. Visibility + recommendation only — no policy push,
            no runtime change.
          </p>
        </div>
        <button
          onClick={() => fetchInventory(true)}
          disabled={loading}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* R53 + first_seen disclosure banners — always visible while
          the respective collectors aren't wired. Stops the operator
          from misreading blank columns as missing data. */}
      {data && (data.domain_visibility?.available === false || data.first_seen_visibility?.available === false) && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {data.domain_visibility?.available === false && (
              <div>
                <span className="font-semibold">Resolved domain</span> is blank on every row.{" "}
                {data.domain_visibility.reason}
              </div>
            )}
            {data.first_seen_visibility?.available === false && (
              <div>
                <span className="font-semibold">First seen</span> is unavailable.{" "}
                {data.first_seen_visibility.reason}
              </div>
            )}
            {data.notes?.map((n, i) => (
              <div key={i} className="text-amber-800">
                · {n}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Class-count chips — operator's first filter. Always show the
          full taxonomy so empty classes still appear with a "(0)"
          rather than disappearing. */}
      {data && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            <span className="uppercase tracking-wider text-slate-500 mr-2">Class</span>
            <button
              onClick={() => setClassFilter(null)}
              aria-pressed={classFilter === null}
              className={`px-2 py-1 rounded border font-semibold transition-colors ${
                classFilter === null
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              All
            </button>
            {CLASS_ORDER.map((c) => {
              const count = data.counts.by_class[c] ?? 0
              const active = classFilter === c
              const meta = CLASS_META[c]
              return (
                <button
                  key={c}
                  onClick={() => setClassFilter(active ? null : c)}
                  aria-pressed={active}
                  className={`px-2 py-1 rounded border font-semibold transition-colors ${
                    active
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                  title={meta.tooltip}
                >
                  {meta.label}{" "}
                  <span className={active ? "opacity-80" : "text-slate-400"}>({count})</span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            <span className="uppercase tracking-wider text-slate-500 mr-2">Strength</span>
            <button
              onClick={() => setStrengthFilter(null)}
              aria-pressed={strengthFilter === null}
              className={`px-2 py-1 rounded border font-semibold ${
                strengthFilter === null
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              Any
            </button>
            {STRENGTH_ORDER.map((s) => {
              const count = data.counts.by_strength[s] ?? 0
              const active = strengthFilter === s
              return (
                <button
                  key={s}
                  onClick={() => setStrengthFilter(active ? null : s)}
                  aria-pressed={active}
                  className={`px-2 py-1 rounded border font-semibold ${
                    active
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {STRENGTH_META[s].label}{" "}
                  <span className={active ? "opacity-80" : "text-slate-400"}>({count})</span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            <span className="uppercase tracking-wider text-slate-500 mr-2">Recommendation</span>
            <button
              onClick={() => setRecommendationFilter(null)}
              aria-pressed={recommendationFilter === null}
              className={`px-2 py-1 rounded border font-semibold ${
                recommendationFilter === null
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              Any
            </button>
            {Object.entries(data.counts.by_recommendation).map(([k, count]) => {
              const meta = RECOMMENDATION_META[k as InventoryRow["recommendation"]]
              if (!meta) return null
              const active = recommendationFilter === k
              return (
                <button
                  key={k}
                  onClick={() => setRecommendationFilter(active ? null : k)}
                  aria-pressed={active}
                  className={`px-2 py-1 rounded border font-semibold ${
                    active
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                  title={meta.tooltip}
                >
                  {meta.label}{" "}
                  <span className={active ? "opacity-80" : "text-slate-400"}>({count})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Invariant indicator — when A_raw == B_classified == C_inventory
          the lossless pipeline holds. Visible in the footer so reviewers
          can spot a regression at a glance, not just in the test suite. */}
      {data?.invariant && (
        <div
          className="text-[10px] text-slate-500 flex items-center gap-2"
          title="Pipeline invariant: every raw external-eligible flow group classified exactly once and reached the inventory total before pagination. Mismatch = silent row drop."
        >
          {invariantHealthy ? (
            <span className="text-emerald-700 font-semibold">● lossless</span>
          ) : (
            <span className="text-red-700 font-semibold">● invariant broken</span>
          )}
          <span>
            A(raw tuples)={data.invariant.A_raw_external_tuples} → B(classified)=
            {data.invariant.B_classified_tuples} → C(pre-pagination)=
            {data.invariant.C_inventory_pre_pagination_total}
            <span className="ml-2 text-slate-400">
              · {data.invariant.raw_external_ip_groups} unique (workload, IP) groups
            </span>
          </span>
        </div>
      )}

      {/* Empty / loading / error / data */}
      {loading && !data && (
        <div className="rounded border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 text-center">
          Loading inventory…
        </div>
      )}
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Failed to load inventory</div>
          <div className="text-xs mt-1">{error}</div>
          <button
            onClick={() => fetchInventory(true)}
            className="mt-2 px-2 py-1 text-xs font-semibold rounded border border-red-400 bg-white hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      )}
      {data && !loading && data.total === 0 && (
        <div className="rounded border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 text-center">
          No external egress observed under the current filters.
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div className="rounded border border-slate-200 bg-white overflow-x-auto">
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/60 text-[10px] uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>
              Showing {data.rows.length} of {data.total} rows
              {data.filters.destination_class
                ? ` · class=${CLASS_META[data.filters.destination_class as InventoryRow["destination_class"]]?.label ?? data.filters.destination_class}`
                : ""}
              {data.filters.strength ? ` · strength=${data.filters.strength}` : ""}
              {data.filters.recommendation ? ` · ${data.filters.recommendation}` : ""}
            </span>
            <span className="text-slate-400">sorted by class priority · bytes desc</span>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Source workload</th>
                <th className="px-2 py-2">Identity</th>
                <th className="px-2 py-2">Class</th>
                <th className="px-3 py-2">Destination IP</th>
                <th className="px-2 py-2">
                  Resolved domain{" "}
                  <span
                    className="inline-block align-middle text-slate-400"
                    title="DNS resolution evidence from R53 Resolver Query Logs only. Blank when no DNS evidence exists. Never inferred from reverse-DNS or IP ownership."
                  >
                    <HelpCircle className="w-3 h-3 inline" />
                  </span>
                </th>
                <th className="px-2 py-2">Port</th>
                <th className="px-2 py-2">Proto</th>
                <th className="px-2 py-2 text-right">Bytes out</th>
                <th className="px-2 py-2 text-right">Connections</th>
                <th className="px-2 py-2">Last seen</th>
                <th className="px-2 py-2">Strength</th>
                <th className="px-2 py-2">Recommendation</th>
                <th className="px-2 py-2">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => {
                const meta = CLASS_META[r.destination_class]
                return (
                  <tr
                    key={`${r.workload_id}-${r.destination_ip}-${r.port ?? ""}-${r.protocol ?? ""}-${i}`}
                    className={`border-t border-slate-100 ${
                      r.destination_class === "unknown_ip"
                        ? "bg-red-50/30"
                        : r.destination_class === "internet"
                          ? "bg-amber-50/30"
                          : ""
                    }`}
                  >
                    <td className="px-3 py-2 align-top">
                      <button
                        onClick={() =>
                          onSelectWorkload?.(r.workload_id, r.workload_name)
                        }
                        className="text-left font-semibold text-slate-800 hover:text-blue-700 hover:underline"
                        title="Drill into this workload's full destination view"
                      >
                        {r.workload_name || r.workload_id}
                      </button>
                    </td>
                    <td className="px-2 py-2 align-top text-slate-700">
                      {r.source_identity?.role_name ? (
                        <span
                          className="font-mono text-[11px]"
                          title={r.source_identity.role_arn ?? r.source_identity.role_name}
                        >
                          {r.source_identity.role_name}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <ClassPill klass={r.destination_class} />
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-[11px] text-slate-700">
                      {r.destination_ip}
                      {r.destination_class === "cloud_service" && r.aws_service && (
                        <div className="text-[10px] text-slate-500 font-sans">
                          AWS {r.aws_service}
                          {r.aws_region ? ` · ${r.aws_region}` : ""}
                        </div>
                      )}
                      {r.destination_class === "internal_to_org_external_to_system" &&
                        r.internal_target && (
                          <div className="text-[10px] text-slate-500 font-sans">
                            → {r.internal_target.workload_name ?? r.internal_target.workload_id}
                            {r.internal_target.system_name
                              ? ` · ${r.internal_target.system_name}`
                              : ""}
                          </div>
                        )}
                      {(r.destination_class === "internet" || r.destination_class === "saas") &&
                        (r.org || r.country) && (
                          <div className="text-[10px] text-slate-500 font-sans">
                            {r.org}
                            {r.country ? ` · ${r.country}` : ""}
                          </div>
                        )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <DomainCell row={r} />
                    </td>
                    <td className="px-2 py-2 align-top font-mono text-[11px] text-slate-700">
                      {dashIf(r.port)}
                    </td>
                    <td className="px-2 py-2 align-top text-slate-700">
                      {dashIf(r.protocol)}
                    </td>
                    <td className="px-2 py-2 align-top text-right font-mono text-slate-700">
                      {formatBytes(r.bytes)}
                    </td>
                    <td className="px-2 py-2 align-top text-right font-mono text-slate-700">
                      {r.hits || "—"}
                    </td>
                    <td className="px-2 py-2 align-top text-slate-600">
                      {formatLastSeen(r.last_seen)}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <StrengthBars strength={r.observation_strength} />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <RecommendationPill rec={r.recommendation} />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <ReadinessPill readiness={r.enforcement_readiness} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
