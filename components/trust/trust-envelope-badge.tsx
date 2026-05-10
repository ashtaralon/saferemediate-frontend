"use client"

import React, { useState } from "react"
import { Clock, Database, AlertCircle, ChevronDown, ChevronUp, CheckCircle2, HelpCircle } from "lucide-react"

export type Confidence = "high" | "medium" | "low" | "unknown"
export type FreshnessStatus = "fresh" | "stale" | "unknown"
export type CompletenessStatus = "complete" | "partial" | "unknown"

export interface FreshnessEntry {
  last_sync: string | null
  age_seconds: number | null
  status: FreshnessStatus
  source_detail?: string | null
}

export interface Provenance {
  evidence_sources: string[]
  freshness: Record<string, FreshnessEntry>
  observation_window_days: number | null
  confidence: Confidence
  confidence_caveats: string[]
  scope: { system?: string | null; resource_type?: string | null; resource_id?: string | null }
  observed_vs_configured: { observed: string[]; configured: string[]; inferred: string[] }
  completeness: { status: CompletenessStatus; missing_sources: string[] }
  generated_at: string
}

export interface TrustEnvelope<T> {
  result: T
  provenance: Provenance
}

export function isTrustEnvelope(x: unknown): x is TrustEnvelope<unknown> {
  return !!x && typeof x === "object" && "result" in (x as any) && "provenance" in (x as any)
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return "unknown"
  if (seconds < 60) return `${seconds}s ago`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// Color palette per confidence tier. Two prior bugs caught by the
// dashboard design review (2026-04-30):
//  - high used text-emerald-300 on bg-emerald-900/30. Over the light-theme
//    pages (Remediation History) this rendered as near-invisible green-on-
//    green. Bumped to text-emerald-100 for foreground + a bolder bg/30
//    fill so contrast holds in both light- and dark-themed parents.
//  - low used the same amber palette as medium. Severity convention is
//    red for low/critical risk on confidence — restored to rose family.
function confidenceStyles(c: Confidence) {
  switch (c) {
    case "high":
      return { bg: "bg-emerald-600/20", border: "border-emerald-500/60", text: "text-emerald-100", dot: "bg-emerald-400" }
    case "medium":
      return { bg: "bg-amber-600/20", border: "border-amber-500/60", text: "text-amber-100", dot: "bg-amber-400" }
    case "low":
      return { bg: "bg-rose-600/20", border: "border-rose-500/60", text: "text-rose-100", dot: "bg-rose-400" }
    default:
      return { bg: "bg-slate-800/50", border: "border-slate-600/50", text: "text-slate-300", dot: "bg-slate-500" }
  }
}

function freshnessStyles(s: FreshnessStatus) {
  switch (s) {
    case "fresh":
      return "text-emerald-400"
    case "stale":
      return "text-amber-400"
    default:
      return "text-amber-500"
  }
}

// Map AWS-leaky source names to vendor-neutral Cyntro vocabulary per
// feedback_demo_safe_source_labels.md. Backend supplies source names
// like "Neo4j Graph Snapshot" / "IAM Attached Policies" / "IAM Access
// Advisor" / "CloudTrail (mgmt)" / "VPC Flow Logs" / "AWS Config" —
// all of which would leak the integration list in demo screen-
// recordings. Translates to the same labels used in the IAM modal's
// Evidence Used / Safety Scoring Breakdown panels so the operator
// sees one consistent vocabulary across the product.
function genericizeSourceName(raw: string): string {
  const norm = raw.toLowerCase()
  if (norm.includes('neo4j') || norm.includes('graph snapshot') || norm.includes('graph_snapshot')) return 'Identity graph'
  if (norm.includes('iam attached') || norm.includes('iam_attached') || norm.includes('attached polic')) return 'Identity policy graph'
  if (norm.includes('iam policy graph') || norm.includes('iam_policy_graph')) return 'Identity policy graph'
  if (norm.includes('access advisor') || norm.includes('access_advisor')) return 'Permission usage'
  if (norm.includes('access analyzer') || norm.includes('access_analyzer')) return 'Cross-source verification'
  if (norm.includes('cloudtrail') && (norm.includes('mgmt') || norm.includes('management') || norm.includes('_mgmt'))) return 'Activity history'
  if (norm.includes('cloudtrail') && (norm.includes('data'))) return 'Data-plane activity'
  if (norm === 'cloudtrail' || norm.includes('cloudtrail')) return 'Activity history'
  if (norm.includes('vpc flow') || norm.includes('vpc_flow') || norm.includes('flow log')) return 'Network behavior'
  if (norm.includes('aws config') || norm.includes('aws_config')) return 'Configuration baseline'
  if (norm.includes('x-ray') || norm.includes('xray') || norm.includes('x_ray')) return 'Application traces'
  if (norm.includes('s3 access') || norm.includes('s3_access') || norm.includes('server access log')) return 'Object access logs'
  if (norm.includes('dependency map') || norm.includes('dependency_map')) return 'Dependency graph'
  if (norm.includes('cyera') || norm.includes('dspm')) return 'Data classification'
  if (norm.includes('sts')) return 'Session evidence'
  if (norm.includes('rds query') || norm.includes('rds_query')) return 'Database query logs'
  // Pass-through for anything that's already vendor-neutral
  // (the new labels: Activity history, Permission usage, etc.)
  return raw
}

function genericizeSourceList(raws: string[]): string[] {
  // De-duplicate after mapping (e.g. cloudtrail_mgmt + CloudTrail both
  // collapse to "Activity history").
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of raws) {
    const g = genericizeSourceName(r)
    if (seen.has(g)) continue
    seen.add(g)
    out.push(g)
  }
  return out
}

interface Props {
  provenance: Provenance
  compact?: boolean
}

export function TrustEnvelopeBadge({ provenance, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  const c = confidenceStyles(provenance.confidence)

  const freshnessEntries = Object.entries(provenance.freshness)
  const hasMissing = provenance.completeness.missing_sources.length > 0
  const hasStale = freshnessEntries.some(([, e]) => e.status === "stale")

  // Oldest fresh-or-stale timestamp wins for the headline "as of" label.
  const headlineAge = freshnessEntries
    .map(([, e]) => e.age_seconds)
    .filter((x): x is number => x !== null)
    .reduce<number | null>((max, v) => (max === null || v > max ? v : max), null)

  return (
    <div
      className={`rounded-lg border ${c.border} ${c.bg} text-xs transition-all`}
      data-trust-envelope
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
          <span className={`font-medium ${c.text}`}>
            Confidence: {provenance.confidence}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400">
          <Clock className="w-3 h-3" />
          <span>as of {formatAge(headlineAge)}</span>
        </div>

        {provenance.evidence_sources.length > 0 && (() => {
          const generic = genericizeSourceList(provenance.evidence_sources)
          return (
            <div className="flex items-center gap-1.5 text-slate-400 min-w-0">
              <Database className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">
                {generic.slice(0, 3).join(" + ")}
                {generic.length > 3 ? ` +${generic.length - 3}` : ""}
              </span>
            </div>
          )
        })()}

        {(hasMissing || hasStale) && (
          <div className="flex items-center gap-1 text-amber-400">
            <AlertCircle className="w-3 h-3" />
            <span>{hasMissing ? "partial" : "stale"}</span>
          </div>
        )}

        <div className="ml-auto text-slate-500">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </div>
      </button>

      {expanded && !compact && (
        <div className="border-t border-slate-700/50 p-3 space-y-3 bg-slate-900 rounded-b-lg">
          {/* Freshness per source */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
              Source freshness
            </div>
            <div className="space-y-1">
              {freshnessEntries.length === 0 && (
                <div className="text-slate-500 italic">No freshness metadata</div>
              )}
              {freshnessEntries.map(([source, entry]) => (
                <div key={source} className="flex items-center gap-2">
                  <span className="text-slate-300 text-[11px] min-w-[140px]">{genericizeSourceName(source)}</span>
                  <span className={`${freshnessStyles(entry.status)} text-[11px]`}>
                    {entry.status}
                  </span>
                  <span className={`text-[11px] ${entry.last_sync ? "text-slate-400" : "text-amber-500"}`}>
                    {entry.last_sync ? formatAge(entry.age_seconds) : "never synced"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Observed vs configured vs inferred */}
          {(provenance.observed_vs_configured.observed.length > 0 ||
            provenance.observed_vs_configured.configured.length > 0 ||
            provenance.observed_vs_configured.inferred.length > 0) && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
                Based on
              </div>
              <div className="space-y-1 text-[11px]">
                {provenance.observed_vs_configured.observed.length > 0 && (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-emerald-400 flex-shrink-0" />
                    <div>
                      <span className="text-emerald-400 font-medium">Observed:</span>{" "}
                      <span className="text-slate-300">
                        {genericizeSourceList(provenance.observed_vs_configured.observed).join(", ")}
                      </span>
                    </div>
                  </div>
                )}
                {provenance.observed_vs_configured.configured.length > 0 && (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-blue-400 flex-shrink-0" />
                    <div>
                      <span className="text-blue-400 font-medium">Configured:</span>{" "}
                      <span className="text-slate-300">
                        {genericizeSourceList(provenance.observed_vs_configured.configured).join(", ")}
                      </span>
                    </div>
                  </div>
                )}
                {provenance.observed_vs_configured.inferred.length > 0 && (
                  <div className="flex items-start gap-2">
                    <HelpCircle className="w-3 h-3 mt-0.5 text-amber-400 flex-shrink-0" />
                    <div>
                      <span className="text-amber-400 font-medium">Inferred:</span>{" "}
                      <span className="text-slate-300">
                        {genericizeSourceList(provenance.observed_vs_configured.inferred).join(", ")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Caveats */}
          {provenance.confidence_caveats.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
                Caveats
              </div>
              <ul className="space-y-0.5 text-[11px]">
                {provenance.confidence_caveats.map((caveat, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-amber-300">
                    <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{caveat}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Observation window */}
          {provenance.observation_window_days !== null && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Clock className="w-3 h-3" />
              <span>
                Observation window: <span className="text-slate-200">{provenance.observation_window_days} days</span>
              </span>
            </div>
          )}

          {/* Scope */}
          {(provenance.scope.system || provenance.scope.resource_id) && (
            <div className="text-[11px] text-slate-400">
              <span className="text-slate-500">Scope:</span>{" "}
              {provenance.scope.resource_type && (
                <span className="text-slate-300">{provenance.scope.resource_type} / </span>
              )}
              <span className="text-slate-200">
                {provenance.scope.resource_id || provenance.scope.system}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
