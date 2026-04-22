"use client"

import { useState, useMemo } from "react"
import { Sparkles, ChevronRight, Loader2, AlertCircle, Shield } from "lucide-react"
import { CANONICAL_QUESTIONS, resolveIntent, type IntentRoute } from "./intent-router"
import { fetchWithEnvelope } from "@/components/trust/use-trust-envelope"
import { TrustEnvelopeBadge, type Provenance } from "@/components/trust/trust-envelope-badge"

interface SavedQuestionGalleryProps {
  systemName?: string
}

interface AnswerState {
  loading: boolean
  error: string | null
  headline: string
  route: IntentRoute | null
  result: any
  provenance: Provenance | null
}

const INITIAL_STATE: AnswerState = {
  loading: false,
  error: null,
  headline: "",
  route: null,
  result: null,
  provenance: null,
}

export function SavedQuestionGallery({ systemName }: SavedQuestionGalleryProps) {
  const [answer, setAnswer] = useState<AnswerState>(INITIAL_STATE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [roleName, setRoleName] = useState("")

  const needsRoleName = selectedId === "unused-on-role"

  const gallery = useMemo(() => {
    return CANONICAL_QUESTIONS.map((q) => ({
      ...q,
      disabled:
        q.id === "unused-on-role" && !roleName && selectedId !== "unused-on-role",
    }))
  }, [roleName, selectedId])

  async function handleAsk(questionId: string) {
    const route = resolveIntent(questionId, { systemName, roleName: roleName || undefined })
    if (!route) {
      setAnswer({ ...INITIAL_STATE, error: `Unknown question id: ${questionId}` })
      return
    }
    setSelectedId(questionId)
    setAnswer({ ...INITIAL_STATE, loading: true, headline: route.resultHeadline, route })
    try {
      const env = await fetchWithEnvelope<any>(route.url)
      setAnswer({
        loading: false,
        error: null,
        headline: route.resultHeadline,
        route,
        result: env.result,
        provenance: env.provenance,
      })
    } catch (err: any) {
      setAnswer({
        loading: false,
        error: err?.message || "Failed to load answer",
        headline: route.resultHeadline,
        route,
        result: null,
        provenance: null,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#2D51DA]/15 bg-[#2D51DA]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2D51DA]">
          <Sparkles className="h-3.5 w-3.5" />
          Copilot — Saved Questions
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--foreground,#111827)] xl:text-3xl">
          Ask anything about your cloud posture
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
          Pick a starter question. Every answer is traced to real evidence and carries a
          confidence badge.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {gallery.map((q) => {
          const isSelected = selectedId === q.id
          return (
            <button
              key={q.id}
              onClick={() => handleAsk(q.id)}
              disabled={q.disabled || answer.loading}
              className="relative text-left rounded-2xl border p-4 transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "var(--bg-primary, #ffffff)",
                borderColor: isSelected ? "#2D51DA" : "var(--border-subtle, #e5e7eb)",
              }}
              data-question-id={q.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground,#6b7280)]">
                    {q.family.replace("_", " ")}
                  </div>
                  <div className="mt-1 text-sm font-semibold leading-snug text-[var(--foreground,#111827)]">
                    {q.label}
                  </div>
                  <div className="mt-2 text-xs text-[var(--muted-foreground,#6b7280)]">
                    {q.hint}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--muted-foreground,#9ca3af)]" />
              </div>
            </button>
          )
        })}
      </div>

      {needsRoleName && (
        <div className="rounded-xl border border-[var(--border-subtle,#e5e7eb)] bg-white p-4">
          <label className="block text-sm font-medium mb-2">Role name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g., AWSServiceRoleForRDS"
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
            <button
              onClick={() => handleAsk("unused-on-role")}
              disabled={!roleName || answer.loading}
              className="px-4 py-2 bg-[#2D51DA] hover:bg-[#1e3fb5] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Ask
            </button>
          </div>
        </div>
      )}

      {(answer.loading || answer.error || answer.result) && (
        <div className="rounded-2xl border bg-white overflow-hidden"
             style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}
             data-copilot-answer>
          <div className="px-5 py-4 border-b flex items-center justify-between"
               style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#2D51DA]" />
              <div className="text-sm font-semibold">{answer.headline}</div>
            </div>
            {answer.loading && (
              <div className="text-xs text-[var(--muted-foreground,#6b7280)] flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
              </div>
            )}
          </div>

          {answer.provenance && (
            <div className="px-5 py-2 border-b" style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}>
              <TrustEnvelopeBadge provenance={answer.provenance} />
            </div>
          )}

          {answer.error && (
            <div className="px-5 py-4 flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>{answer.error}</div>
            </div>
          )}

          {answer.result && (
            <div className="p-5">
              <AnswerRenderer route={answer.route!} result={answer.result} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AnswerRenderer({ route, result }: { route: any; result: any }) {
  if (route.family === "aggregator") {
    const candidates = result.candidates ?? []
    const summary = result.summary ?? {}
    return (
      <div>
        <div className="grid grid-cols-4 gap-3 mb-4 text-center">
          <Stat label="total" value={summary.total_candidates ?? 0} />
          <Stat label="auto-applicable" value={summary.auto_applicable ?? 0} />
          <Stat label="blocked" value={summary.blocked ?? 0} />
          <Stat label="types" value={Object.keys(summary.by_type ?? {}).length} />
        </div>
        <div className="space-y-2">
          {candidates.slice(0, 10).map((c: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border"
                 style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground,#6b7280)]">
                  {c.resource_type} {c.system ? `· ${c.system}` : ""}
                </div>
                <div className="text-sm font-medium truncate">{c.resource_id}</div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span>unused: <strong>{c.unused_count}</strong></span>
                <span className={`px-2 py-0.5 rounded-full ${confidenceClass(c.gap_confidence)}`}>
                  {c.gap_confidence}
                </span>
                <span className={c.safety?.can_auto_apply ? "text-green-600" : "text-amber-600"}>
                  {c.safety?.can_auto_apply ? "auto-apply" : c.safety?.block_reason || "review"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (route.family === "history") {
    const events = result.events ?? []
    return (
      <div className="space-y-2">
        <div className="text-xs text-[var(--muted-foreground,#6b7280)]">
          {events.length} event{events.length === 1 ? "" : "s"} in window
        </div>
        {events.slice(0, 10).map((e: any, i: number) => (
          <div key={i} className="text-sm px-3 py-2 rounded-lg border"
               style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}>
            <div className="text-xs text-[var(--muted-foreground,#6b7280)]">{e.timestamp}</div>
            <div>{e.action_type} — {e.resource_id}</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-auto max-h-64">
      {JSON.stringify(result, null, 2)}
    </pre>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground,#6b7280)]">{label}</div>
    </div>
  )
}

function confidenceClass(conf: string) {
  switch (conf) {
    case "high": return "bg-green-100 text-green-700"
    case "medium": return "bg-amber-100 text-amber-700"
    case "low": return "bg-red-100 text-red-700"
    default: return "bg-gray-100 text-gray-600"
  }
}
