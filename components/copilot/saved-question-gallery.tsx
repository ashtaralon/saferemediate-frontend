"use client"

import { useEffect, useState } from "react"
import { Sparkles, Loader2, AlertCircle, Shield, Send, Bot } from "lucide-react"
import { resolveIntent, type IntentRoute, type IntentContext } from "./intent-router"
import { fetchWithEnvelope } from "@/components/trust/use-trust-envelope"
import { TrustEnvelopeBadge, type Provenance } from "@/components/trust/trust-envelope-badge"

// Example prompts derive from the active system — never name a pinned one.
function examplePrompts(systemName?: string): string[] {
  const scope = systemName ? ` in ${systemName}` : ""
  const target = systemName ?? "my environment"
  return [
    "how many S3 buckets do I have?",
    "which IAM role has the most unused permissions?",
    `list lambda functions${scope}`,
    `what's the blast radius of ${target}?`,
    "what changed in the last 7 days?",
    "what can I safely remediate right now?",
  ]
}

interface SavedQuestionGalleryProps {
  systemName?: string
}

interface RouterDecision {
  chosen_tool: string
  tool_args: Record<string, any>
  explanation: string
  source: "llm" | "keyword"
}

interface AnswerState {
  loading: boolean
  error: string | null
  headline: string
  route: IntentRoute | null
  result: any
  provenance: Provenance | null
  decision: RouterDecision | null
  abstention: { explanation: string; reasonCode: string } | null
}

interface FreeformCapability {
  checking: boolean
  enabled: boolean
  code: string
  reason: string
  systemName: string | null
}

const INITIAL_STATE: AnswerState = {
  loading: false,
  error: null,
  headline: "",
  route: null,
  result: null,
  provenance: null,
  decision: null,
  abstention: null,
}

const INITIAL_CAPABILITY: FreeformCapability = {
  checking: true,
  enabled: false,
  code: "COPILOT_CAPABILITY_CHECK_PENDING",
  reason: "Checking authenticated system scope…",
  systemName: null,
}

export function SavedQuestionGallery({ systemName }: SavedQuestionGalleryProps) {
  const [answer, setAnswer] = useState<AnswerState>(INITIAL_STATE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [roleName, setRoleName] = useState("")
  const [freeformQuestion, setFreeformQuestion] = useState("")
  const [routing, setRouting] = useState(false)
  const [freeformCapability, setFreeformCapability] =
    useState<FreeformCapability>(INITIAL_CAPABILITY)

  const needsRoleName = selectedId === "unused-on-role" && !roleName

  useEffect(() => {
    const lockedSystemName = systemName?.trim()
    if (!lockedSystemName) {
      setFreeformCapability({
        checking: false,
        enabled: false,
        code: "COPILOT_SYSTEM_SCOPE_REQUIRED",
        reason: "Select an authorized system before asking a free-form question.",
        systemName: null,
      })
      return
    }

    const controller = new AbortController()
    setFreeformCapability(INITIAL_CAPABILITY)
    void fetch(
      `/api/proxy/copilot/ask?systemName=${encodeURIComponent(lockedSystemName)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (controller.signal.aborted) return
        setFreeformCapability({
          checking: false,
          enabled: response.ok && data?.enabled === true && data?.systemName === lockedSystemName,
          code: data?.code || "COPILOT_CAPABILITY_UNAVAILABLE",
          reason: data?.reason || "Free-form questions are unavailable for this system scope.",
          systemName: typeof data?.systemName === "string" ? data.systemName : null,
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setFreeformCapability({
          checking: false,
          enabled: false,
          code: "COPILOT_CAPABILITY_UNAVAILABLE",
          reason:
            error instanceof Error && error.message
              ? `Free-form scope check failed: ${error.message}`
              : "Free-form scope check failed.",
          systemName: null,
        })
      })

    return () => controller.abort()
  }, [systemName])

  async function runRoute(
    route: IntentRoute,
    decision: RouterDecision | null,
  ) {
    setAnswer({
      ...INITIAL_STATE,
      loading: true,
      headline: route.resultHeadline,
      route,
      decision,
    })
    try {
      const env = await fetchWithEnvelope<any>(route.url)
      setAnswer({
        ...INITIAL_STATE,
        loading: false,
        headline: route.resultHeadline,
        route,
        result: env.result,
        provenance: env.provenance,
        decision,
      })
    } catch (err: any) {
      setAnswer({
        ...INITIAL_STATE,
        loading: false,
        error: err?.message || "Failed to load answer",
        headline: route.resultHeadline,
        route,
        decision,
      })
    }
  }

  async function handleAsk(questionId: string) {
    const route = resolveIntent(questionId, { systemName, roleName: roleName || undefined })
    if (!route) {
      setAnswer({ ...INITIAL_STATE, error: `Unknown question id: ${questionId}` })
      return
    }
    setSelectedId(questionId)
    await runRoute(route, null)
  }

  async function handleFreeformAsk(overrideQuestion?: string) {
    const question = (overrideQuestion ?? freeformQuestion).trim()
    if (!question || routing) return
    const lockedSystemName = systemName?.trim()
    if (
      !lockedSystemName ||
      !freeformCapability.enabled ||
      freeformCapability.systemName !== lockedSystemName
    ) {
      setAnswer({
        ...INITIAL_STATE,
        error: freeformCapability.reason || "Free-form questions require an authenticated system scope.",
      })
      return
    }
    if (overrideQuestion) setFreeformQuestion(overrideQuestion)
    setRouting(true)
    setAnswer({ ...INITIAL_STATE, loading: true, headline: "Routing your question…", route: null })
    try {
      const res = await fetch("/api/proxy/copilot/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          systemName: lockedSystemName,
          roleName: roleName || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || "Router is unavailable")
      }
      if (data?.status === "abstained" && data?.chosen_tool === null) {
        setAnswer({
          ...INITIAL_STATE,
          headline: "Question not answered",
          abstention: {
            explanation: data?.explanation || "This question cannot be answered safely.",
            reasonCode: data?.reason_code || "unsupported_question",
          },
        })
        return
      }
      if (data?.status !== "routed" || !data?.chosen_tool) {
        throw new Error("Router returned an invalid decision")
      }
      const decision: RouterDecision = {
        chosen_tool: data.chosen_tool,
        tool_args: data.tool_args || {},
        explanation: data.explanation || "",
        source: data.source || "llm",
      }
      const returnedSystem = decision.tool_args.systemName
      if (
        typeof returnedSystem !== "string" ||
        returnedSystem.trim() !== lockedSystemName ||
        data?.request_scope?.systemName !== lockedSystemName
      ) {
        throw new Error("Router response conflicted with the immutable system scope")
      }
      const ctx: IntentContext = {
        // Never let model/tool arguments choose scope. The value captured at
        // submit time is the immutable scope for this request.
        systemName: lockedSystemName,
        roleName: decision.tool_args.roleName || roleName || undefined,
        windowDays: decision.tool_args.windowDays,
        resourceType: decision.tool_args.resourceType || undefined,
        region: decision.tool_args.region || undefined,
        nameContains: decision.tool_args.nameContains || undefined,
        createdBefore: decision.tool_args.createdBefore || undefined,
        createdAfter: decision.tool_args.createdAfter || undefined,
        sort: decision.tool_args.sort || undefined,
      }
      if (decision.tool_args.roleName) {
        setRoleName(decision.tool_args.roleName)
      }
      const route = resolveIntent(decision.chosen_tool, ctx)
      if (!route) {
        throw new Error(`Unknown tool from router: ${decision.chosen_tool}`)
      }
      setSelectedId(decision.chosen_tool)
      await runRoute(route, decision)
    } catch (err: any) {
      setAnswer({
        ...INITIAL_STATE,
        error: err?.message || "Failed to route question",
      })
    } finally {
      setRouting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#2D51DA]/15 bg-[#2D51DA]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2D51DA]">
          <Sparkles className="h-3.5 w-3.5" />
          Copilot
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--foreground,#111827)] xl:text-3xl">
          Ask anything about your cloud posture
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
          Every answer is traced to real evidence and carries a confidence badge.
        </p>
      </div>

      <div
        className="rounded-2xl border bg-white p-4 shadow-sm"
        style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={freeformQuestion}
            onChange={(e) => setFreeformQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleFreeformAsk()
              }
            }}
            placeholder={
              freeformCapability.enabled
                ? "Ask anything — e.g. how many S3 buckets do I have?"
                : "Free-form questions require an authenticated system scope"
            }
            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D51DA]/30"
            style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}
            disabled={!freeformCapability.enabled || routing || answer.loading}
            data-copilot-freeform-input
          />
          <button
            onClick={() => void handleFreeformAsk()}
            disabled={
              !freeformCapability.enabled ||
              !freeformQuestion.trim() ||
              routing ||
              answer.loading
            }
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#2D51DA] hover:bg-[#1e3fb5] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            data-copilot-freeform-submit
          >
            {routing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Ask
          </button>
        </div>
        {!freeformCapability.enabled && (
          <div
            className="mt-3 flex items-start gap-2 text-xs text-amber-700"
            data-copilot-freeform-disabled
            data-reason-code={freeformCapability.code}
          >
            {freeformCapability.checking ? (
              <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin" />
            ) : (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            )}
            <span>{freeformCapability.reason}</span>
          </div>
        )}
        {!answer.loading && !answer.result && !answer.error && (
          <div className="mt-3 flex flex-wrap gap-2">
            {examplePrompts(systemName).map((p) => (
              <button
                key={p}
                onClick={() => void handleFreeformAsk(p)}
                disabled={!freeformCapability.enabled}
                className="text-xs px-2.5 py-1 rounded-full border text-[var(--muted-foreground,#6b7280)] hover:text-[#2D51DA] hover:border-[#2D51DA]/40 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
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

      {(answer.loading || answer.error || answer.result || answer.abstention) && (
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

          {answer.decision && (
            <div
              className="px-5 py-2 border-b flex items-center gap-2 text-xs"
              style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}
            >
              <Bot className="h-3.5 w-3.5 text-[#2D51DA]" />
              <span className="font-semibold uppercase tracking-wider text-[var(--muted-foreground,#6b7280)]">
                {answer.decision.source === "llm" ? "LLM router" : "Keyword router"}
              </span>
              <span className="text-[var(--muted-foreground,#6b7280)]">picked</span>
              <code className="px-1.5 py-0.5 rounded bg-[#2D51DA]/10 text-[#2D51DA] font-semibold">
                {answer.decision.chosen_tool}
              </code>
              {answer.decision.explanation && (
                <span className="text-[var(--muted-foreground,#6b7280)] truncate">
                  — {answer.decision.explanation}
                </span>
              )}
            </div>
          )}

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

          {answer.abstention && (
            <div
              className="px-5 py-4 flex items-start gap-2 text-sm text-amber-700"
              data-copilot-abstention
              data-reason-code={answer.abstention.reasonCode}
            >
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>{answer.abstention.explanation}</div>
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
  if (result?.status === "unavailable" || result?.error_code === "GRAPH_UNAVAILABLE") {
    return (
      <div className="flex items-start gap-2 text-sm text-amber-700" data-copilot-data-unavailable>
        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          Graph data is unavailable, so Cyntro cannot return a trustworthy count or list yet.
          Please retry after graph connectivity is restored.
        </div>
      </div>
    )
  }

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
  if (route.family === "inventory") {
    const isCount = result.count !== undefined && result.items === undefined
    if (isCount) {
      return (
        <div className="flex items-center gap-4">
          <div className="text-4xl font-bold">{result.count}</div>
          <div>
            <div className="text-sm font-medium">{result.display_name}</div>
            {result.system && (
              <div className="text-xs text-[var(--muted-foreground,#6b7280)]">
                in system <strong>{result.system}</strong>
              </div>
            )}
          </div>
        </div>
      )
    }
    const items = result.items ?? []
    const columns: string[] = result.columns ?? []
    const filtersApplied: Record<string, string> = result.filters_applied ?? {}
    const filterEntries = Object.entries(filtersApplied)
    const activeSort = result.sort ?? result.default_sort
    return (
      <div>
        {filterEntries.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground,#6b7280)]">
              filters
            </span>
            {filterEntries.map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#2D51DA]/10 text-[#2D51DA] border border-[#2D51DA]/20"
              >
                <code className="font-mono">{k}</code>=<code className="font-mono">{String(v)}</code>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mb-2 text-xs text-[var(--muted-foreground,#6b7280)]">
          <span>
            {items.length} {result.display_name}
            {result.system ? ` in ${result.system}` : ""}
            {result.next_cursor ? " (more available)" : ""}
          </span>
          <span>sorted by {activeSort}</span>
        </div>
        <div className="overflow-auto border rounded-lg"
             style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-[var(--muted-foreground,#6b7280)]">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="text-left px-3 py-2 font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 25).map((it: any, i: number) => (
                <tr key={it._element_id || i} className="border-t"
                    style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}>
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2 font-mono text-xs truncate max-w-xs">
                      {it[c] ?? <span className="text-gray-400">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
