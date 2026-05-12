"use client"

/**
 * Egress Visibility Panel
 * =======================
 *
 * Per-system outbound traffic view. Powered by VPC Flow Logs already in
 * Neo4j (`ACTUAL_TRAFFIC` edges) + AWS IP range classification +
 * ipinfo.io org/ASN enrichment.
 *
 * Honest-state UI per the no-fabricated-numbers rule:
 *   - live values render normally
 *   - missing fields render "—" (em dash), never "unknown" or placeholders
 *   - domain column reads "requires R53 Resolver Query Logs" until the
 *     Phase 2 collector lands (no domain fabrication, ever).
 *
 * Suspicious-signal chips:
 *   - cross_region_aws: dest AWS region ≠ workload region
 *   - cross_cloud: workload on AWS, destination on Azure/GCP/etc
 *   - non_aws_public_from_private_subnet: private-subnet workload reaching
 *     a non-AWS public IP (legit for SaaS; suspicious for service workers)
 */

import React, { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ExternalLink,
  Globe,
  Network,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react"

interface Destination {
  ip: string
  kind: "aws" | "external" | "internal" | "unknown"
  aws_service: string | null
  aws_region: string | null
  org: string | null
  asn: string | null
  country: string | null
  hostname: string | null
  ports: string[]
  protocols: string[]
  bytes: number
  hits: number
  last_seen: string | null
  signals: string[]
}

interface WorkloadEgress {
  workload: {
    id: string
    name: string
    labels: string[]
    region: string
    subnet_is_public: boolean | null
  }
  totals: {
    destinations: number
    aws_destinations: number
    external_destinations: number
    internal_destinations: number
    total_bytes: number
    total_hits: number
    suspicious_destinations: number
    signals_breakdown: Record<string, number>
  }
  top_destinations: Destination[]
}

interface EgressResponse {
  system_name: string
  workload_count: number
  total_destinations: number
  total_suspicious_destinations: number
  lookback_days: number
  workloads: WorkloadEgress[]
  domain_visibility: {
    available: boolean
    reason: string
  }
}

// Signal code → human label + tooltip. Source of truth for UI strings.
// If the backend adds a new signal code, the UI degrades gracefully
// (renders the raw code) — better than silently dropping signals.
const SIGNAL_META: Record<string, { label: string; tooltip: string; tone: "warning" | "info" }> = {
  cross_region_aws: {
    label: "Cross-region AWS",
    tooltip: "Workload and destination are both AWS but in different regions. Often expected (replication, cross-region access) but worth surfacing — costs $$ and can hint at misconfigured topology.",
    tone: "info",
  },
  cross_cloud: {
    label: "Cross-cloud",
    tooltip: "Workload is on AWS but talking to another cloud provider (Azure / GCP / etc.). Notable for both legitimate data-replication and exfiltration scenarios.",
    tone: "warning",
  },
  non_aws_public_from_private_subnet: {
    label: "Private → public (non-AWS)",
    tooltip: "Workload is in a private subnet but reaching a non-AWS public IP. Legit for SaaS vendors (Datadog, Splunk); review for service workers that shouldn't egress.",
    tone: "warning",
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

function dashIfEmpty(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  return String(v)
}

function destinationLabel(d: Destination): string {
  // Display priority: AWS service > org > ip. Operator wants to see
  // "AWS S3 us-east-1" or "Google LLC", not the raw IP, unless that's
  // all we have.
  if (d.kind === "aws" && d.aws_service) {
    return `AWS ${d.aws_service}${d.aws_region ? ` · ${d.aws_region}` : ""}`
  }
  if (d.org) return d.org
  if (d.hostname) return d.hostname
  return d.ip
}

function destinationKindBadge(kind: string): { label: string; cls: string } {
  switch (kind) {
    case "aws":
      return { label: "AWS", cls: "bg-blue-100 text-blue-800 border-blue-300" }
    case "external":
      return { label: "External", cls: "bg-amber-100 text-amber-800 border-amber-300" }
    case "internal":
      return { label: "Internal", cls: "bg-slate-100 text-slate-700 border-slate-300" }
    default:
      return { label: "Unknown", cls: "bg-slate-100 text-slate-500 border-slate-300" }
  }
}

function SignalChip({ code }: { code: string }) {
  const meta = SIGNAL_META[code]
  const label = meta?.label ?? code
  const tooltip = meta?.tooltip ?? code
  const cls =
    meta?.tone === "warning"
      ? "bg-red-100 text-red-800 border-red-300"
      : "bg-amber-50 text-amber-800 border-amber-200"
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border ${cls}`}
      title={tooltip}
    >
      <AlertTriangle className="w-2.5 h-2.5" />
      {label}
    </span>
  )
}

export function EgressVisibilityPanel({ systemName }: { systemName: string }) {
  const [data, setData] = useState<EgressResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchEgress = async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/proxy/egress/system/${encodeURIComponent(systemName)}?days=30&top_n=20${
        force ? `&_=${Date.now()}` : ""
      }`
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const j = await res.json()
      setData(j)
    } catch (e: any) {
      setError(e.message || "Failed to load egress data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!systemName) return
    fetchEgress(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemName])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const grandTotals = useMemo(() => {
    if (!data) return { workloads: 0, destinations: 0, suspicious: 0, bytes: 0 }
    return {
      workloads: data.workload_count,
      destinations: data.total_destinations,
      suspicious: data.total_suspicious_destinations,
      bytes: data.workloads.reduce((s, w) => s + w.totals.total_bytes, 0),
    }
  }, [data])

  if (!systemName) {
    return (
      <div className="text-sm text-slate-500 p-4">
        Select a system to see egress visibility.
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
            Egress Visibility
            <span className="text-xs font-normal text-slate-500">
              · {systemName} · 30-day window
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Which workloads are talking outbound, and to whom. Data comes
            from VPC Flow Logs already in the graph; org / ASN /
            country come from ipinfo.io.{" "}
            {data?.domain_visibility?.available === false && (
              <span className="text-amber-700">
                Specific domains require R53 Resolver Query Logs (planned for Phase 2).
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => fetchEgress(true)}
          disabled={loading}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Grand totals strip */}
      {data && !error && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded border border-slate-200 bg-white p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Workloads</div>
            <div className="text-2xl font-bold text-slate-800">{grandTotals.workloads}</div>
          </div>
          <div className="rounded border border-slate-200 bg-white p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Destinations</div>
            <div className="text-2xl font-bold text-slate-800">{grandTotals.destinations}</div>
          </div>
          <div
            className={`rounded border p-3 ${
              grandTotals.suspicious > 0
                ? "border-red-300 bg-red-50"
                : "border-emerald-300 bg-emerald-50"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Suspicious
            </div>
            <div
              className={`text-2xl font-bold ${
                grandTotals.suspicious > 0 ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {grandTotals.suspicious}
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-white p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Total bytes (30d)</div>
            <div className="text-2xl font-bold text-slate-800">{formatBytes(grandTotals.bytes)}</div>
          </div>
        </div>
      )}

      {/* States */}
      {loading && !data && (
        <div className="rounded border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 text-center">
          Loading egress data…
        </div>
      )}
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Failed to load egress data</div>
          <div className="text-xs mt-1">{error}</div>
          <button
            onClick={() => fetchEgress(true)}
            className="mt-2 px-2 py-1 text-xs font-semibold rounded border border-red-400 bg-white hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      )}
      {data && !loading && data.workloads.length === 0 && (
        <div className="rounded border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 text-center">
          No egress-capable workloads found in <code>{systemName}</code>. (EC2 / Lambda / Fargate / ECS only — RDS and S3 aren't covered.)
        </div>
      )}

      {/* Workload rows */}
      {data &&
        data.workloads.map((w) => {
          const isExpanded = expanded.has(w.workload.id)
          const subnetLabel =
            w.workload.subnet_is_public === true
              ? "public subnet"
              : w.workload.subnet_is_public === false
              ? "private subnet"
              : "subnet unknown"
          return (
            <div
              key={w.workload.id}
              className="rounded border border-slate-200 bg-white overflow-hidden"
            >
              <button
                onClick={() => toggleExpand(w.workload.id)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <Server className="w-4 h-4 text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-semibold text-slate-800 truncate">
                    {w.workload.name}
                    <span className="ml-2 text-[10px] font-normal text-slate-500">
                      · {w.workload.labels[0] ?? "Workload"} · {w.workload.region} · {subnetLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-600">
                    <span>{w.totals.destinations} destinations</span>
                    <span>· {formatBytes(w.totals.total_bytes)}</span>
                    <span>· {w.totals.aws_destinations} AWS</span>
                    <span>· {w.totals.external_destinations} external</span>
                    {w.totals.suspicious_destinations > 0 && (
                      <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-300 font-semibold">
                        <AlertTriangle className="w-3 h-3" />
                        {w.totals.suspicious_destinations} suspicious
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-400 shrink-0">{isExpanded ? "▾" : "▸"}</div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-200">
                  {w.top_destinations.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 text-center">
                      No outbound flows recorded in the lookback window.
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="px-4 py-2">Destination</th>
                          <th className="px-2 py-2">Kind</th>
                          <th className="px-2 py-2">ASN / Country</th>
                          <th className="px-2 py-2">Ports</th>
                          <th className="px-2 py-2 text-right">Bytes</th>
                          <th className="px-2 py-2 text-right">Hits</th>
                          <th className="px-4 py-2">Signals</th>
                        </tr>
                      </thead>
                      <tbody>
                        {w.top_destinations.map((d, i) => {
                          const kind = destinationKindBadge(d.kind)
                          return (
                            <tr
                              key={`${d.ip}-${i}`}
                              className={`border-t border-slate-100 ${
                                d.signals.length > 0 ? "bg-red-50/40" : ""
                              }`}
                            >
                              <td className="px-4 py-2">
                                <div className="font-semibold text-slate-800">{destinationLabel(d)}</div>
                                <div className="text-[10px] text-slate-500 font-mono">{d.ip}</div>
                              </td>
                              <td className="px-2 py-2">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border ${kind.cls}`}
                                >
                                  {kind.label}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-slate-600">
                                {dashIfEmpty(d.asn)}
                                {d.country ? ` · ${d.country}` : ""}
                              </td>
                              <td className="px-2 py-2 text-slate-600">
                                {d.ports.length > 0 ? d.ports.slice(0, 4).join(", ") : "—"}
                                {d.ports.length > 4 && <span className="text-slate-400"> +{d.ports.length - 4}</span>}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-slate-700">
                                {formatBytes(d.bytes)}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-slate-700">
                                {d.hits || "—"}
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {d.signals.map((s) => (
                                    <SignalChip key={s} code={s} />
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
