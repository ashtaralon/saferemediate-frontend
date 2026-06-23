"use client"

import { useState, useEffect } from "react"
import { ShieldAlert, Clock, Loader2, AlertCircle, ChevronDown, ChevronRight, KeyRound } from "lucide-react"
import { lpSeverityColor, lpSeverityLabel } from "@/lib/lp-severity"

// Mirror of the backend /api/resource-risk/{system} payload (api/resource_risk.py).
interface RiskFinding {
  resource_name: string
  resource_arn: string
  resource_type: string
  category: string
  severity: string
  attacker_narrative: string
  remediation_id: string
  evidence: Record<string, any>
  classified_at: string
}

interface ResourceRiskResponse {
  system_name: string
  total: number
  by_category: Record<string, number>
  by_severity: Record<string, number>
  classified_at: string | null
  findings: RiskFinding[]
}

// Category presentation — keyed on the HAS_RISK enum the classifier writes.
// Unknown categories degrade to the raw enum rather than fabricate a label.
const CATEGORY_META: Record<string, { label: string; icon: any }> = {
  BROAD_TRUST_POLICY: { label: "Broad Trust Policy", icon: ShieldAlert },
  DORMANT_ROLE: { label: "Dormant Role", icon: Clock },
}

// remediation_id → operator guidance. No Simulate/Apply button yet: the
// SCOPE_TRUST_POLICY / REVIEW_DORMANT_ROLE strategies land with Phase D, and
// we don't surface a control that doesn't exist (no phantom capabilities).
const REMEDIATION_TEXT: Record<string, string> = {
  SCOPE_TRUST_POLICY: "Scope the trust policy to the specific principal(s) that need it.",
  REVIEW_DORMANT_ROLE: "Confirm the role is still needed, or detach / delete it.",
}

function categoryMeta(cat: string) {
  return CATEGORY_META[cat] || { label: cat, icon: KeyRound }
}

// Compact evidence chips — only fields that exist, no fabricated values.
function evidenceChips(f: RiskFinding): Array<{ k: string; v: string }> {
  const ev = f.evidence || {}
  const chips: Array<{ k: string; v: string }> = []
  if (f.category === "BROAD_TRUST_POLICY") {
    const principals = Array.isArray(ev.broad_principals) ? ev.broad_principals : []
    if (principals.length) chips.push({ k: "principal", v: principals.join(", ") })
    if (ev.sub_type) chips.push({ k: "type", v: String(ev.sub_type).replace(/_/g, " ").toLowerCase() })
    if (ev.allowed_actions_count != null) chips.push({ k: "allowed actions", v: String(ev.allowed_actions_count) })
  } else if (f.category === "DORMANT_ROLE") {
    if (ev.idle_days != null) chips.push({ k: "idle", v: `${ev.idle_days}d` })
    if (ev.workload_count != null) chips.push({ k: "workloads", v: String(ev.workload_count) })
  }
  return chips
}

/**
 * Trust & Dormancy lens — surfaces the net-new HAS_RISK findings
 * (BROAD_TRUST_POLICY + DORMANT_ROLE) that no other Resource Risk surface
 * shows today. Read/triage only; remediation (Simulate→Apply) is Phase D.
 *
 * Every value is a graph fact from /api/proxy/resource-risk/{system}. Honest
 * loading / error / empty states — never a fabricated success view.
 */
export function TrustDormancyLens({ systemName }: { systemName?: string }) {
  const [data, setData] = useState<ResourceRiskResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (!systemName) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/proxy/resource-risk/by-system/${encodeURIComponent(systemName)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || `Backend ${res.status}`)
        }
        return res.json()
      })
      .then((json: ResourceRiskResponse) => {
        if (!cancelled) setData(json)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [systemName])

  if (!systemName) return null

  const findings = data?.findings ?? []
  const total = data?.total ?? 0

  return (
    <div className="rounded-lg border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
      {/* Section header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-2">
          {expanded
            ? <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
            : <ChevronRight className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
          <ShieldAlert className="w-4 h-4" style={{ color: "#a855f7" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Trust Exposure</span>
          {!loading && !error && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {total} finding{total === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {data && Object.entries(data.by_severity || {}).map(([sev, n]) => (
            <span
              key={sev}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: `${lpSeverityColor(sev)}22`, color: lpSeverityColor(sev) }}
            >
              {n} {lpSeverityLabel(sev)}
            </span>
          ))}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading trust findings…
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "#ef4444" }}>
              <AlertCircle className="w-4 h-4" /> Couldn’t load findings: {error}
            </div>
          )}

          {!loading && !error && total === 0 && (
            <div className="py-6 text-sm" style={{ color: "var(--text-muted)" }}>
              No broad-trust findings for{" "}
              <span style={{ color: "var(--text-secondary)" }}>{systemName}</span>.
            </div>
          )}

          {!loading && !error && total > 0 && (
            <div className="space-y-3 pt-3">
              {findings.map((f, i) => {
                const meta = categoryMeta(f.category)
                const Icon = meta.icon
                const color = lpSeverityColor(f.severity)
                return (
                  <div
                    key={`${f.resource_arn}-${f.category}-${i}`}
                    className="rounded-lg border p-3"
                    style={{ background: "var(--bg-primary, rgba(0,0,0,0.18))", borderColor: "var(--border-subtle)" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 shrink-0" style={{ color }} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                              {f.resource_name}
                            </span>
                            <span
                              className="text-[10px] px-1 py-0.5 rounded shrink-0"
                              style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}
                            >
                              {f.resource_type}
                            </span>
                          </div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{meta.label}</div>
                        </div>
                      </div>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: `${color}22`, color }}
                      >
                        {lpSeverityLabel(f.severity)}
                      </span>
                    </div>

                    <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {f.attacker_narrative}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {evidenceChips(f).map((c, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                        >
                          <span style={{ color: "var(--text-muted)" }}>{c.k}:</span> {c.v}
                        </span>
                      ))}
                    </div>

                    {REMEDIATION_TEXT[f.remediation_id] && (
                      <div className="text-xs mt-2 flex items-start gap-1.5" style={{ color: "var(--text-muted)" }}>
                        <span style={{ color: "#22c55e" }}>Recommended:</span>
                        <span>{REMEDIATION_TEXT[f.remediation_id]}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
