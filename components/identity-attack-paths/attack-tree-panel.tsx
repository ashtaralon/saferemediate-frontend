"use client"

// Attack Tree panel — every door (IAM role + workload) that reaches a
// crown-jewel S3 bucket. Sits on the Attack Paths drill-in below the
// Crown Jewel Surface card and above the per-path list, so the operator
// gets the structural answer ("who can touch this bucket?") before
// drilling into one specific path.
//
// Data: GET /api/proxy/attack-tree/s3/{bucket} → returns rows + counters
// per the backend's AttackTreeResponse shape.
//
// Three-state UI per `feedback_no_mock_numbers_in_ui`:
//   loading      → skeleton row, no fabricated numbers
//   live         → table with role / workload / SG / VPC / flags
//   error/empty  → honest "no attack-tree data" with retry
//
// Only S3 jewels — the underlying query keys on (:S3Bucket). For
// DynamoDB / RDS / KMS jewels the panel is suppressed; revisit when
// the Cypher generalises to those node types.

import { useEffect, useState } from "react"
import { AlertTriangle, Crown, ExternalLink, Key, Loader2, Server, Shield, ShieldAlert, Layers } from "lucide-react"

interface AttackTreeRow {
  bucket: string
  role: string
  via_edges: string[]
  events: number
  workload_kind: string | null
  workload: string
  security_groups: string[]
  vpcs: string[]
  other_roles_on_workload: string[]
  flag_stale: boolean
  flag_default_sg: boolean
  flag_no_vpc: boolean
  flag_multi_role: boolean
}

interface AttackTreeResponse {
  bucket: string
  rows: AttackTreeRow[]
  total_rows: number
  distinct_roles: number
  distinct_workloads: number
}

interface AttackTreePanelProps {
  /** Bucket name, id, or ARN. Backend accepts all three. */
  bucketIdentifier: string
  /** Operator-facing bucket label for the panel header. */
  bucketLabel: string
}

export function AttackTreePanel({ bucketIdentifier, bucketLabel }: AttackTreePanelProps) {
  const [data, setData] = useState<AttackTreeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/proxy/attack-tree/s3/${encodeURIComponent(bucketIdentifier)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json: AttackTreeResponse) => {
        if (cancelled) return
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message || "Failed to load attack tree")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bucketIdentifier, refreshKey])

  // ─── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mx-4 my-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Building attack tree for {bucketLabel}…</span>
        </div>
      </div>
    )
  }

  // ─── Error ──────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="mx-4 my-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-300">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Attack tree unavailable — {error}</span>
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-xs text-red-200 underline hover:text-red-100"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ─── Empty (no doors found) ────────────────────────────────────
  if (!data || data.rows.length === 0) {
    return (
      <div className="mx-4 my-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 text-slate-300 mb-1">
          <Crown className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold">Attack Tree</span>
        </div>
        <div className="text-xs text-slate-500">
          No IAM role with an observed access edge reaches {bucketLabel} in
          the graph. This is either a freshly-created bucket with no
          CloudTrail history yet, or its consumers haven't been
          collected. Re-ingest CloudTrail to populate.
        </div>
      </div>
    )
  }

  // ─── Live ───────────────────────────────────────────────────────
  // Group rows by role so the operator reads "role → workloads" rather
  // than a flat workload list — multi-role pivots and shared roles are
  // the high-signal pattern, and grouping makes them obvious.
  const grouped = new Map<string, AttackTreeRow[]>()
  for (const row of data.rows) {
    const arr = grouped.get(row.role) ?? []
    arr.push(row)
    grouped.set(row.role, arr)
  }
  const roleEntries = Array.from(grouped.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  )

  return (
    <div className="mx-4 my-3 rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Attack Tree</span>
          <span className="text-xs text-slate-400">· every door to this bucket</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span>
            <span className="text-slate-200 font-semibold">{data.distinct_roles}</span>{" "}
            role{data.distinct_roles === 1 ? "" : "s"}
          </span>
          <span>
            <span className="text-slate-200 font-semibold">{data.distinct_workloads}</span>{" "}
            workload{data.distinct_workloads === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* Role groups */}
      <div className="divide-y divide-slate-800">
        {roleEntries.map(([role, rows]) => (
          <div key={role} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Key className="w-3.5 h-3.5 text-pink-400" />
              <span className="text-sm font-semibold text-pink-200 font-mono">
                {role}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                · via {Array.from(new Set(rows.flatMap((r) => r.via_edges))).join(", ")}
              </span>
            </div>

            <div className="ml-5 space-y-2">
              {rows.map((row, idx) => (
                <div
                  key={`${row.workload}-${idx}`}
                  className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: workload + network exposure */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Server
                          className={
                            "w-3.5 h-3.5 " +
                            (row.workload_kind === "LambdaFunction"
                              ? "text-orange-400"
                              : "text-blue-400")
                          }
                        />
                        <span className="text-sm text-white truncate font-mono">
                          {row.workload}
                        </span>
                        {row.workload_kind && (
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                            {row.workload_kind === "EC2Instance" ? "EC2" : "Lambda"}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          {row.security_groups.length > 0
                            ? row.security_groups.join(", ")
                            : <span className="italic text-slate-600">no SG attached</span>}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {row.vpcs.length > 0
                            ? row.vpcs.join(", ")
                            : <span className="italic text-slate-600">no VPC</span>}
                        </span>
                        {row.events > 0 && (
                          <span className="text-slate-500">
                            {row.events} observed event{row.events === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      {row.other_roles_on_workload.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
                          <span className="text-amber-400">+ also carries:</span>
                          {row.other_roles_on_workload.map((or) => (
                            <span
                              key={or}
                              className="font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5"
                            >
                              {or}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right: flag chips */}
                    <div className="flex flex-wrap gap-1 shrink-0 max-w-[180px] justify-end">
                      <FlagChip flag="stale" active={row.flag_stale} />
                      <FlagChip flag="default-sg" active={row.flag_default_sg} />
                      <FlagChip flag="no-vpc" active={row.flag_no_vpc} />
                      <FlagChip flag="multi-role" active={row.flag_multi_role} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Flag chips. Off-state shown muted so the operator can see WHICH
// signals were checked, not just the ones that fired — false-negatives
// are a real concern with structural flags, and a missing chip looks
// like missing data. Mirrors the "three-state card" pattern.
// ─────────────────────────────────────────────────────────────────────
function FlagChip({
  flag,
  active,
}: {
  flag: "stale" | "default-sg" | "no-vpc" | "multi-role"
  active: boolean
}) {
  const label =
    flag === "stale"
      ? "STALE"
      : flag === "default-sg"
        ? "DEFAULT SG"
        : flag === "no-vpc"
          ? "NO VPC"
          : "MULTI-ROLE"
  const tooltip =
    flag === "stale"
      ? "Workload is marked StaleResource — reconciliation pass couldn't confirm it in AWS truth."
      : flag === "default-sg"
        ? "Workload uses the AWS default VPC security group — wide ingress, easy to overlook."
        : flag === "no-vpc"
          ? "Workload is not attached to any VPC (public Lambda / boundary-less service)."
          : "Workload carries 2+ IAM roles — a compromise on the host can pivot across both blast radiuses."
  const activeCls =
    flag === "stale"
      ? "text-slate-300 bg-slate-700/50 border-slate-500/50"
      : flag === "default-sg"
        ? "text-orange-200 bg-orange-500/15 border-orange-500/50"
        : flag === "no-vpc"
          ? "text-rose-200 bg-rose-500/15 border-rose-500/50"
          : "text-amber-200 bg-amber-500/15 border-amber-500/50"
  return (
    <span
      title={tooltip}
      className={
        "inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded border px-1.5 py-0.5 " +
        (active ? activeCls : "text-slate-700 bg-slate-900 border-slate-800")
      }
    >
      {active && <ShieldAlert className="w-2.5 h-2.5" />}
      {label}
    </span>
  )
}
