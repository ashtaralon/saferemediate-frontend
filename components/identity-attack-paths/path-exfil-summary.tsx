"use client"

/**
 * Path Exfil Summary — chunk #1.5
 * ================================
 *
 * Decorates the attack-path view with the External Egress Inventory's
 * exfil-risk data, per compute workload on the current path.
 *
 * Three layers (per the killer-feature spec):
 *   1. A compact chip per workload node in the path — color-coded by
 *      exfil tier (red/amber/muted) so the operator sees risk at a
 *      glance.
 *   2. A one-line narrative under the chips, combining IAM/data
 *      access with active outbound channels. The "potential exfil
 *      channel" wording is deliberate — we surface observed egress
 *      paths, not confirmed exfiltration.
 *   3. Clicking a chip triggers the existing node-detail-panel via
 *      onNodeClick(workload_id), which opens the inventory filtered
 *      to that workload (via the new ?workload_id= param).
 *
 * The graph itself is NOT decorated — TrafficFlowMap is shared with
 * other tabs and per-node chip rendering there has broader blast
 * radius. Operators get the same information here, visually adjacent
 * to the path graph, in a smaller-blast-radius component.
 */

import React, { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ExternalLink, Network, Shield, Zap } from "lucide-react"
import type { IdentityAttackPath, PathNodeDetail } from "./types"

interface ExfilSummary {
  workload_id: string
  workload_name: string
  exfil_risk: {
    tier: "high" | "medium" | "low" | "none"
    score: number
    total_bytes_out: number
    unknown_ip: number
    internet: number
    cloud_service: number
    saas: number
    cross_system: number
    strong_observations: number
  } | null
  loading: boolean
  error?: string
}

const TIER_THEME: Record<
  ExfilSummary["exfil_risk"] extends infer T ? (T extends { tier: infer X } ? X : never) : never,
  { label: string; bg: string; border: string; text: string; ringTitle: string }
> = {
  high: {
    label: "HIGH",
    bg: "rgba(239,68,68,0.18)",
    border: "rgba(239,68,68,0.55)",
    text: "#fecaca",
    ringTitle: "High exfil risk — heavy unknown-IP traffic and/or strong observation. Needs review.",
  },
  medium: {
    label: "MED",
    bg: "rgba(245,158,11,0.18)",
    border: "rgba(245,158,11,0.5)",
    text: "#fde68a",
    ringTitle: "Moderate exfil risk — internet/SaaS activity needs review.",
  },
  low: {
    label: "LOW",
    bg: "rgba(148,163,184,0.18)",
    border: "rgba(148,163,184,0.4)",
    text: "#e2e8f0",
    ringTitle: "Low exfil risk — mostly cloud-service traffic (expected AWS endpoints).",
  },
  none: {
    label: "NONE",
    bg: "rgba(71,85,105,0.18)",
    border: "rgba(71,85,105,0.4)",
    text: "#94a3b8",
    ringTitle: "No external egress observed for this workload in the lookback window.",
  },
}

function isComputeNode(node: PathNodeDetail): boolean {
  // Compute = the workloads we can drill into (EC2, Lambda, ECS, EKS).
  // tier=="compute" is the canonical signal when the backend stamped it;
  // fallback on type substring for older path records.
  if (node.tier === "compute") return true
  const t = (node.type ?? "").toLowerCase()
  return (
    t.includes("ec2") ||
    t.includes("lambda") ||
    t.includes("ecs") ||
    t.includes("eks") ||
    t.includes("fargate") ||
    t === "compute"
  )
}

function formatBytes(n: number): string {
  if (!n) return "0 B"
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`
  return `${n} B`
}

interface PathExfilSummaryProps {
  systemName: string
  path: IdentityAttackPath
  onNodeClick?: (nodeId: string) => void
  // Provided summaries lifted from the parent so the strip and the
  // Path Flow Map share one fetch. Keyed by workload_id (which
  // matches PathNodeDetail.id for compute nodes).
  externalSummaries?: Record<string, ExfilSummary["exfil_risk"]>
}

export function PathExfilSummary({ systemName, path, onNodeClick, externalSummaries }: PathExfilSummaryProps) {
  const computeNodes = useMemo(() => {
    const seen = new Set<string>()
    const out: PathNodeDetail[] = []
    for (const n of path.nodes ?? []) {
      if (!isComputeNode(n)) continue
      if (seen.has(n.id)) continue
      seen.add(n.id)
      out.push(n)
    }
    return out
  }, [path])

  const [summaries, setSummaries] = useState<Record<string, ExfilSummary>>({})

  // When the parent supplies summaries, mirror them into the component
  // state shape so the rendering branch below stays unchanged. Avoids
  // re-fetching the same data the parent already pulled for the map.
  useEffect(() => {
    if (!externalSummaries) return
    const mirrored: Record<string, ExfilSummary> = {}
    for (const n of computeNodes) {
      const e = externalSummaries[n.id]
      mirrored[n.id] = {
        workload_id: n.id,
        workload_name: n.name || n.id,
        exfil_risk: e ?? null,
        loading: !e,
      }
    }
    setSummaries(mirrored)
  }, [externalSummaries, computeNodes])

  useEffect(() => {
    // If the parent is supplying summaries, skip the self-fetch.
    if (externalSummaries) return
    if (!systemName || computeNodes.length === 0) {
      setSummaries({})
      return
    }
    const initial: Record<string, ExfilSummary> = {}
    for (const n of computeNodes) {
      initial[n.id] = {
        workload_id: n.id,
        workload_name: n.name || n.id,
        exfil_risk: null,
        loading: true,
      }
    }
    setSummaries(initial)

    let cancelled = false
    Promise.all(
      computeNodes.map(async (n) => {
        try {
          const url = `/api/proxy/egress/system/${encodeURIComponent(
            systemName,
          )}/external-inventory?workload_id=${encodeURIComponent(n.id)}&summary=true`
          const res = await fetch(url, { cache: "no-store" })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `HTTP ${res.status}`)
          }
          const j = await res.json()
          return { node: n, exfil_risk: j.exfil_risk }
        } catch (e: any) {
          return { node: n, error: e.message || "Failed to load exfil summary" }
        }
      }),
    ).then((results) => {
      if (cancelled) return
      setSummaries((prev) => {
        const next: Record<string, ExfilSummary> = { ...prev }
        for (const r of results) {
          if ("error" in r) {
            next[r.node.id] = {
              workload_id: r.node.id,
              workload_name: r.node.name || r.node.id,
              exfil_risk: null,
              loading: false,
              error: r.error,
            }
          } else {
            next[r.node.id] = {
              workload_id: r.node.id,
              workload_name: r.node.name || r.node.id,
              exfil_risk: r.exfil_risk,
              loading: false,
            }
          }
        }
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [systemName, computeNodes, externalSummaries])

  // Compose the narrative line. Wording stays defensible: "potential
  // exfil channel requiring review" — we observe outbound paths, we
  // do not claim confirmed exfiltration.
  const narrative = useMemo(() => {
    const compute = computeNodes
      .map((n) => summaries[n.id])
      .filter((s) => s && s.exfil_risk && s.exfil_risk.tier !== "none") as ExfilSummary[]
    if (compute.length === 0) return null

    const totalBytes = compute.reduce((acc, s) => acc + (s.exfil_risk?.total_bytes_out ?? 0), 0)
    const totalUnknown = compute.reduce((acc, s) => acc + (s.exfil_risk?.unknown_ip ?? 0), 0)
    const totalDest = compute.reduce(
      (acc, s) =>
        acc +
        (s.exfil_risk?.unknown_ip ?? 0) +
        (s.exfil_risk?.internet ?? 0) +
        (s.exfil_risk?.saas ?? 0) +
        (s.exfil_risk?.cross_system ?? 0) +
        (s.exfil_risk?.cloud_service ?? 0),
      0,
    )

    const entry = path.nodes?.find((n) => n.tier === "entry") ?? path.nodes?.[0]
    const jewel = path.nodes?.find((n) => n.tier === "crown_jewel") ?? path.nodes?.[path.nodes?.length - 1]
    const entryName = entry?.name || entry?.id || "this entry point"
    const jewelName = jewel?.name || jewel?.id || "the crown jewel"

    const workloadPhrase =
      compute.length === 1
        ? compute[0].workload_name
        : `${compute.length} workloads on this path`

    const unknownClause =
      totalUnknown > 0 ? `, including ${totalUnknown} unknown IPs` : ""

    return (
      <>
        If <span className="font-semibold text-slate-200">{entryName}</span> is
        compromised, the attacker inherits access to{" "}
        <span className="font-semibold text-slate-200">{jewelName}</span>{" "}
        and{" "}
        <span className="font-semibold text-slate-200">{workloadPhrase}</span>{" "}
        already has an active outbound channel to{" "}
        <span className="font-semibold text-slate-200">{totalDest.toLocaleString()}</span>{" "}
        external destinations over 30 days ({formatBytes(totalBytes)} outbound
        {unknownClause}) — potential exfil channel requiring review.
      </>
    )
  }, [computeNodes, summaries, path])

  if (computeNodes.length === 0) {
    // No compute workloads in this path — nothing to decorate.
    return null
  }

  return (
    <div
      className="mx-5 mt-3 rounded-md border px-3 py-2.5"
      style={{
        background: "rgba(15, 23, 42, 0.6)",
        borderColor: "rgba(148, 163, 184, 0.18)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Network className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Exfil channel
        </span>
        <span
          className="text-[9px] text-slate-500"
          title="Per-workload external egress observed in the last 30 days. Visibility + risk indication only — no policy push, no runtime change."
        >
          · alert-only · 30-day observation
        </span>
      </div>

      <div className="flex items-start gap-2 flex-wrap">
        {computeNodes.map((n) => {
          const s = summaries[n.id]
          const tier = s?.exfil_risk?.tier ?? "none"
          const theme = TIER_THEME[tier]
          return (
            <button
              key={n.id}
              onClick={() => onNodeClick?.(n.id)}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded border transition-colors hover:brightness-110"
              style={{ background: theme.bg, borderColor: theme.border }}
              title={`${n.name}\n\n${theme.ringTitle}\n\nClick to open the External Egress Inventory filtered to this workload.`}
            >
              <span className="flex flex-col items-start min-w-0">
                <span className="text-[10px] font-semibold text-slate-300 truncate max-w-[180px]">
                  {n.name || n.id}
                </span>
                <span className="flex items-center gap-1 mt-0.5">
                  <span
                    className="text-[8px] font-bold tracking-wider px-1 py-0.5 rounded"
                    style={{ background: theme.border, color: theme.text }}
                  >
                    {theme.label}
                  </span>
                  {s?.loading ? (
                    <span className="text-[10px] text-slate-500">loading…</span>
                  ) : s?.error ? (
                    <span className="text-[10px] text-red-400" title={s.error}>
                      —
                    </span>
                  ) : s?.exfil_risk ? (
                    <span className="text-[10px] text-slate-300">
                      ↗{" "}
                      {(
                        s.exfil_risk.unknown_ip +
                        s.exfil_risk.internet +
                        s.exfil_risk.saas +
                        s.exfil_risk.cross_system +
                        s.exfil_risk.cloud_service
                      ).toLocaleString()}{" "}
                      ext
                      {s.exfil_risk.unknown_ip > 0 && (
                        <span className="ml-1 text-red-300">
                          · {s.exfil_risk.unknown_ip} unknown
                        </span>
                      )}
                      <span className="ml-1 text-slate-400">
                        · {formatBytes(s.exfil_risk.total_bytes_out)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">—</span>
                  )}
                </span>
              </span>
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </button>
          )
        })}
      </div>

      {narrative && (
        <div
          className="mt-2 text-[11px] leading-relaxed text-slate-400 italic border-t pt-2"
          style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}
        >
          {narrative}
        </div>
      )}

      {/* chunk #2a: deep-link into the Traffic tab so operators can
          see the full row-by-row inventory for this path's workloads.
          Rendered outside the narrative block so it's available even
          for paths whose compute workloads have NO observed external
          egress (tier=none) — the operator may still want to confirm
          the empty state in the systemic view. CustomEvent pattern
          avoids prop-drilling the dashboard tab setter through
          identity-attack-paths.tsx. */}
      {computeNodes.length > 0 && (
        <div
          className={`text-[11px] ${narrative ? "mt-1" : "mt-2 border-t pt-2"}`}
          style={!narrative ? { borderColor: "rgba(148, 163, 184, 0.12)" } : undefined}
        >
          <button
            onClick={() => {
              const firstCompute = computeNodes[0]
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("cyntro:traffic:deep-link", {
                    detail: {
                      workloadId: firstCompute.id,
                      direction: "outbound",
                    },
                  }),
                )
                window.dispatchEvent(
                  new CustomEvent("cyntro:navigate-tab", {
                    detail: { tabId: "egress" },
                  }),
                )
              }
            }}
            className="text-blue-400 hover:text-blue-300 hover:underline font-semibold"
            title={`Open the Traffic tab filtered to ${computeNodes[0].name || computeNodes[0].id} (outbound)`}
          >
            View full inventory in Traffic →
          </button>
        </div>
      )}
    </div>
  )
}
