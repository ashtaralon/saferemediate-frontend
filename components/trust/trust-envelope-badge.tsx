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

function confidenceStyles(c: Confidence) {
  switch (c) {
    case "high":
      return { bg: "bg-emerald-900/30", border: "border-emerald-600/50", text: "text-emerald-300", dot: "bg-emerald-400" }
    case "medium":
      return { bg: "bg-amber-900/30", border: "border-amber-600/50", text: "text-amber-300", dot: "bg-amber-400" }
    case "low":
      return { bg: "bg-red-900/30", border: "border-red-600/50", text: "text-red-300", dot: "bg-red-400" }
    default:
      return { bg: "bg-slate-800/50", border: "border-slate-600/50", text: "text-slate-400", dot: "bg-slate-500" }
  }
}

function freshnessStyles(s: FreshnessStatus) {
  switch (s) {
    case "fresh":
      return "text-emerald-400"
    case "stale":
      return "text-amber-400"
    default:
      return "text-slate-500"
  }
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

        {provenance.evidence_sources.length > 0 && (
          <div className="flex items-center gap-1.5 text-slate-400 min-w-0">
            <Database className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">
              {provenance.evidence_sources.slice(0, 3).join(" + ")}
              {provenance.evidence_sources.length > 3 ? ` +${provenance.evidence_sources.length - 3}` : ""}
            </span>
          </div>
        )}

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
        <div className="border-t border-slate-700/50 p-3 space-y-3">
          {/* Freshness per source */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
              Source freshness
            </div>
            <div className="space-y-1">
              {freshnessEntries.length === 0 && (
                <div className="text-slate-500 italic">No freshness metadata</div>
              )}
              {freshnessEntries.map(([source, entry]) => (
                <div key={source} className="flex items-center gap-2">
                  <span className="text-slate-300 font-mono text-[11px] min-w-[120px]">{source}</span>
                  <span className={`${freshnessStyles(entry.status)} text-[11px]`}>
                    {entry.status}
                  </span>
                  <span className="text-slate-500 text-[11px]">
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
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
                Based on
              </div>
              <div className="space-y-1 text-[11px]">
                {provenance.observed_vs_configured.observed.length > 0 && (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-emerald-400 flex-shrink-0" />
                    <div>
                      <span className="text-emerald-400 font-medium">Observed:</span>{" "}
                      <span className="text-slate-300">
                        {provenance.observed_vs_configured.observed.join(", ")}
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
                        {provenance.observed_vs_configured.configured.join(", ")}
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
                        {provenance.observed_vs_configured.inferred.join(", ")}
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
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
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
