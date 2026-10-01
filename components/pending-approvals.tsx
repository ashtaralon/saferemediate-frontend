"use client"

import { useState, useEffect, useCallback } from "react"
import { BoundaryEvidenceDrawer } from "@/components/business-system/boundary-evidence-drawer"
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Shield,
  Network,
  Server,
  ChevronDown,
  ChevronUp,
  CheckCheck,
  Clock,
  Zap,
  GitBranch,
} from "lucide-react"

/** A decision recorded as a request (customer-resident install): the projector worker applies it. */
export interface DecisionRequest {
  request_id: string | null
  pending_id: string | null
  decision: string | null
  state: "queued" | "running" | "applied" | "refused" | "failed" | string
  outcome_code?: string | null
  outcome_detail?: string | null
  requested_at?: string | null
  finished_at?: string | null
}

interface PendingTag {
  // The scoped identity: what a decision is sent with (never the display name).
  pending_id?: string | null
  identity_status?: string | null
  customer_id?: string | null
  account_id?: string | null
  region?: string | null
  resource_uid?: string | null
  system_key?: string | null
  resource_name: string
  resource_id: string
  resource_arn: string
  resource_type: string
  system_name: string
  reason: string
  relationship: string
  tagged_from: string
  hop: number
  direction: string
  competing_systems: string[]
  status: string
  created_at: string | null
  decision_request?: DecisionRequest | null
}

/** Whether approve / reject can be done on this deployment (GET /api/auto-tagger/pending/decisions/capability). */
interface DecisionCapability {
  mode: string
  available: boolean
  reason: string | null
  code: string | null
  message: string
}

const POLL_MS = 5000
const OPEN_STATES = new Set(["queued", "running"])

const REASON_CONFIG: Record<string, { label: string; icon: any; color: string; description: string }> = {
  conflict: {
    label: "Conflict",
    icon: AlertTriangle,
    color: "text-red-400 bg-red-500/10 border-red-500/20",
    description: "Reachable from multiple systems",
  },
  shared_infrastructure: {
    label: "Shared Infra",
    icon: Network,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    description: "VPC/Subnet shared across systems",
  },
  low_confidence_relationship: {
    label: "Low Confidence",
    icon: GitBranch,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    description: "Traffic or indirect relationship",
  },
  high_hop: {
    label: "Deep Chain",
    icon: Zap,
    color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    description: "More than 2 hops from seed",
  },
}

/**
 * One-sentence plain-English explanation of why the auto-tagger paused
 * on each resource. Shown both as a `title` tooltip on the reason chip
 * AND as a small caption under the resource name (so the answer is there
 * without requiring a hover). Written for a prospect, not an engineer.
 * `{relationship}` and `{hop}` are interpolated from the PendingTag.
 */
function getReasonExplanation(p: PendingTag): string {
  switch (p.reason) {
    case "conflict":
      return "This resource is reachable from multiple tagged systems — assigning it to just one may be wrong."
    case "shared_infrastructure":
      return "This is a VPC or subnet shared across systems — tagging it would apply to every consumer."
    case "low_confidence_relationship":
      return `"${p.relationship}" is a behavioral edge — we observed traffic, but observation alone isn't proof of ownership.`
    case "high_hop":
      return `${p.hop} hops from the nearest tagged resource — the association is indirect and may cross a system boundary.`
    default:
      return "Flagged by the auto-tagger for human review."
  }
}

function rowKey(p: PendingTag): string {
  return p.pending_id || `${p.resource_name}:${p.system_name}`
}

/** The body a decision is sent with: the identity the listing returned, never a display name. */
function decisionBody(p: PendingTag) {
  return {
    pending_id: p.pending_id,
    account_id: p.account_id,
    region: p.region,
    resource_uid: p.resource_uid,
    system_key: p.system_key,
    customer_id: p.customer_id,
  }
}

function describeRequest(request: DecisionRequest): { text: string; tone: string } {
  const action = request.decision === "reject" ? "Reject" : "Approve"
  switch (request.state) {
    case "queued":
      return { text: `${action} queued — applied by the projector worker on its next pass`, tone: "text-amber-300" }
    case "running":
      return { text: `${action} being applied…`, tone: "text-amber-300" }
    case "applied":
      return { text: `${action} applied`, tone: "text-emerald-300" }
    case "refused":
      return {
        text: `${action} refused: ${request.outcome_code || "refused"}${request.outcome_detail ? ` — ${request.outcome_detail}` : ""}`,
        tone: "text-red-300",
      }
    default:
      return {
        text: `${action} failed${request.outcome_detail ? `: ${request.outcome_detail}` : ""} — you can try again`,
        tone: "text-red-300",
      }
  }
}

export function PendingApprovals({ systemName }: { systemName?: string }) {
  const [pending, setPending] = useState<PendingTag[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [evidencePending, setEvidencePending] = useState<PendingTag | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [capability, setCapability] = useState<DecisionCapability | null>(null)
  const [requests, setRequests] = useState<Record<string, DecisionRequest>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [listMeta, setListMeta] = useState<{ published?: boolean; published_at?: string; message?: string }>({})

  const fetchCapability = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy/auto-tagger/pending/decisions/capability", {
        signal: AbortSignal.timeout(28000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data || typeof data.available !== "boolean") {
        setCapability({
          mode: "unknown",
          available: false,
          reason: data?.code || `HTTP_${res.status}`,
          code: data?.code || null,
          message: data?.error || `Could not determine whether decisions are available here (HTTP ${res.status}).`,
        })
        return
      }
      setCapability(data as DecisionCapability)
    } catch (err: any) {
      setCapability({
        mode: "unknown",
        available: false,
        reason: "UNREACHABLE",
        code: null,
        message: err?.message || "Could not determine whether decisions are available here.",
      })
    }
  }, [])

  const fetchPending = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch("/api/proxy/auto-tagger/pending?status=pending", {
        signal: AbortSignal.timeout(28000),
      })
      // The proxy now always returns 200 with a structured payload — a
      // non-OK here means the proxy itself failed (network blip, auth)
      // not the backend.
      if (!res.ok) throw new Error(`Approvals proxy HTTP ${res.status}`)
      const data = await res.json()
      // Proxy surfaces backend degradation as `unavailable: true` plus
      // an operator-readable `message`; treat that as an inline error
      // distinct from "no pending tags" (empty pending array).
      if (data?.unavailable) {
        setError(data.message || "Approvals service unavailable")
        setPending([])
        return
      }
      let items: PendingTag[] = data.pending || []
      if (systemName) {
        items = items.filter((p) => p.system_name === systemName)
      }
      setListMeta({ published: data.published, published_at: data.published_at, message: data.message })
      setPending(items)
      // A decision recorded earlier (before a reload) is still shown, and polled while it is open.
      const recorded: Record<string, DecisionRequest> = {}
      for (const item of items) {
        if (item.pending_id && item.decision_request) recorded[item.pending_id] = item.decision_request
      }
      if (Object.keys(recorded).length) setRequests((prev) => ({ ...recorded, ...prev }))
    } catch (err: any) {
      setError(err?.message || "Approvals service unreachable")
    } finally {
      setLoading(false)
    }
  }, [systemName])

  const refresh = useCallback(() => {
    fetchCapability()
    fetchPending()
  }, [fetchCapability, fetchPending])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Poll every decision request that is still open until it is applied, refused or failed.
  useEffect(() => {
    const open = Object.values(requests).filter((r) => r.pending_id && OPEN_STATES.has(r.state))
    if (open.length === 0) return
    const timer = setTimeout(async () => {
      const updates = await Promise.all(
        open.map(async (r) => {
          try {
            const res = await fetch(`/api/proxy/auto-tagger/pending/decisions/${encodeURIComponent(r.pending_id!)}`)
            if (!res.ok) return null
            const data = await res.json()
            return (data?.request as DecisionRequest) || null
          } catch {
            return null
          }
        }),
      )
      setRequests((prev) => {
        const next = { ...prev }
        for (const update of updates) {
          if (update?.pending_id) next[update.pending_id] = update
        }
        return next
      })
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [requests])

  const decisionsAvailable = capability?.available === true
  const requestMode = capability?.mode === "request"

  const handleDecision = async (p: PendingTag, action: "approve" | "reject") => {
    const key = rowKey(p)
    if (!p.pending_id || !decisionsAvailable) return
    setActionLoading(key)
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    try {
      const res = await fetch(`/api/proxy/auto-tagger/pending/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decisionBody(p)),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 202 && data?.request) {
        setRequests((prev) => ({ ...prev, [p.pending_id!]: data.request as DecisionRequest }))
        return
      }
      if (res.ok && data?.success) {
        // Applied by this deployment in the request (it may write the graph itself).
        setPending((prev) => prev.filter((item) => rowKey(item) !== key))
        return
      }
      if (data?.request) {
        setRequests((prev) => ({ ...prev, [p.pending_id!]: data.request as DecisionRequest }))
      }
      setRowErrors((prev) => ({
        ...prev,
        [key]: `${data?.code || `HTTP ${res.status}`}: ${data?.error || "the decision was not accepted"}`,
      }))
      if (data?.code === "PENDING_TAG_DECISIONS_NOT_AVAILABLE_HERE") fetchCapability()
    } catch (err: any) {
      setRowErrors((prev) => ({ ...prev, [key]: err?.message || "the decision could not be sent" }))
    } finally {
      setActionLoading(null)
    }
  }

  const handleApproveAll = async () => {
    // BSM Sprint 1: never bulk-approve conflict / shared_infrastructure —
    // those assign arbitrary ownership to multi-system or scaffold resources.
    const blocked = pending.filter(
      (p) => p.reason === "conflict" || p.reason === "shared_infrastructure"
    )
    if (blocked.length > 0) {
      console.warn(
        `Approve All blocked: ${blocked.length} conflict/shared_infrastructure item(s)`
      )
      return
    }
    setActionLoading("approve-all")
    try {
      const body = systemName ? { system_name: systemName } : {}
      const res = await fetch("/api/proxy/auto-tagger/pending/approve-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setPending([])
      }
    } catch (err) {
      console.error("Approve all failed:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const notAvailableBanner =
    capability && !capability.available ? (
      <div
        className="px-5 py-2.5 flex items-start gap-2 border-b border-slate-800/50 bg-slate-800/30"
        data-testid="pending-decisions-not-available"
        role="status"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
        <div className="text-xs">
          <p className="text-amber-300 font-medium">Approving or rejecting pending tags is not available here.</p>
          <p className="text-slate-400 mt-0.5">{capability.message}</p>
          {capability.reason && <p className="text-slate-500 mt-0.5 font-mono">{capability.reason}</p>}
        </div>
      </div>
    ) : null

  if (loading) {
    return (
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center gap-2 text-slate-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading pending approvals...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-slate-900/50 border border-red-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>Pending approvals: {error}</span>
          <button onClick={refresh} className="ml-auto text-slate-400 hover:text-white">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  if (pending.length === 0) {
    // Explicit empty state — previously `return null`, which made an empty
    // queue visually indistinguishable from a broken fetch. Operators
    // couldn't tell "no work to do" from "component silently failed".
    // An install whose projector has not published the open tags yet is NOT an empty queue.
    const unpublished = listMeta.published === false
    return (
      <div
        className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 text-center"
        data-testid={unpublished ? "pending-approvals-not-published" : "pending-approvals-empty"}
      >
        {unpublished ? (
          <>
            <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-white">Pending tags not computed yet</p>
            <p className="text-xs text-slate-400 mt-1">{listMeta.message}</p>
          </>
        ) : (
          <>
            <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-white">No pending tags</p>
            <p className="text-xs text-slate-400 mt-1">
              {systemName
                ? `All auto-tagger decisions for ${systemName} have been reviewed`
                : "All auto-tagger decisions have been reviewed"}
            </p>
          </>
        )}
        <button
          onClick={refresh}
          className="mt-3 text-xs text-slate-400 hover:text-white flex items-center gap-1 mx-auto"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
    )
  }

  const groupedByReason = pending.reduce<Record<string, PendingTag[]>>((acc, p) => {
    const reason = p.reason || "unknown"
    if (!acc[reason]) acc[reason] = []
    acc[reason].push(p)
    return acc
  }, {})

  return (
    <div className="bg-slate-900/50 border border-amber-500/30 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10">
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium text-white">
              Pending Tag Approvals
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300">
                {pending.length}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Edge cases detected by auto-tagger requiring human review
              {listMeta.published_at ? ` · as of ${new Date(listMeta.published_at).toLocaleString()}` : ""}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-700/50">
          {notAvailableBanner}
          {/* Bulk actions */}
          <div className="px-5 py-2 flex items-center justify-between border-b border-slate-800/50">
            <span className="text-xs text-slate-500">
              {Object.keys(groupedByReason).length} reason categories
            </span>
            <div className="flex gap-2">
              <button
                onClick={refresh}
                className="px-3 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 inline mr-1 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              {/* Approve All applies in the request; it is offered only where this deployment writes the
                  graph itself. Where decisions are recorded requests, each tag is approved on its own. */}
              {capability?.mode === "direct" && decisionsAvailable && (() => {
                const approveAllBlocked = pending.some(
                  (p) =>
                    p.reason === "conflict" || p.reason === "shared_infrastructure"
                )
                return (
                  <button
                    onClick={handleApproveAll}
                    disabled={actionLoading === "approve-all" || approveAllBlocked}
                    title={
                      approveAllBlocked
                        ? "Approve All disabled while conflict or shared-infrastructure items are in the queue — review those individually"
                        : "Approve all pending tags"
                    }
                    className="px-3 py-1 text-xs rounded-md bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCheck className="w-3 h-3 inline mr-1" />
                    {actionLoading === "approve-all" ? "Approving..." : "Approve All"}
                  </button>
                )
              })()}
            </div>
          </div>

          {/* Grouped items */}
          <div className="max-h-[400px] overflow-y-auto">
            {Object.entries(groupedByReason).map(([reason, items]) => {
              const config = REASON_CONFIG[reason] || {
                label: reason,
                icon: AlertTriangle,
                color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
                description: reason,
              }
              const Icon = config.icon

              return (
                <div key={reason} className="border-b border-slate-800/30 last:border-b-0">
                  {/* Reason header — `title` tooltip explains the category generically. */}
                  <div
                    className="px-5 py-2 bg-slate-800/20 flex items-center gap-2"
                    title={config.description}
                  >
                    <Icon className={`w-3.5 h-3.5 ${config.color.split(" ")[0]}`} />
                    <span className={`text-xs font-medium ${config.color.split(" ")[0]}`}>
                      {config.label}
                    </span>
                    <span className="text-xs text-slate-500">
                      ({items.length}) — {config.description}
                    </span>
                  </div>

                  {/* Items */}
                  {items.map((p) => {
                    const key = rowKey(p)
                    const isActioning = actionLoading === key
                    const request = p.pending_id ? requests[p.pending_id] : undefined
                    const requestOpen = !!request && OPEN_STATES.has(request.state)
                    const decided = request?.state === "applied"
                    const unscoped = !p.pending_id
                    const disabled = isActioning || !decisionsAvailable || unscoped || requestOpen || decided
                    const disabledTitle = unscoped
                      ? "Written before pending tags were scoped to an account; the next attribution run proposes it again"
                      : !decisionsAvailable
                        ? "Not available here"
                        : requestOpen
                          ? "A decision for this pending tag is in progress"
                          : undefined
                    const status = request ? describeRequest(request) : null

                    return (
                      <div
                        key={key}
                        className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-800/20 transition-colors"
                        // Full per-item explanation also surfaces on row hover for
                        // mouse users — belt-and-suspenders with the caption below.
                        title={getReasonExplanation(p)}
                        data-testid="pending-tag-row"
                      >
                        {/* Resource info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white font-medium truncate">
                              {p.resource_name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                              {p.resource_type || "Unknown"}
                            </span>
                            {p.account_id && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 font-mono">
                                {p.account_id}
                                {p.region ? ` · ${p.region}` : ""}
                              </span>
                            )}
                          </div>
                          {/* Plain-English "why blocked" — always visible, so a
                              prospect doesn't have to hover to understand. One
                              sentence, written for non-engineers. */}
                          <div className="text-xs text-slate-500 mt-0.5">
                            {getReasonExplanation(p)}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-slate-500">
                              {p.direction === "forward" ? "from" : "uses"}{" "}
                              <span className="text-slate-400">{p.tagged_from}</span>
                            </span>
                            <span className="text-xs text-slate-600">via {p.relationship}</span>
                            <span className="text-xs text-slate-600">hop {p.hop}</span>
                          </div>
                          {p.competing_systems && p.competing_systems.length > 1 && (
                            <div className="flex items-center gap-1 mt-1">
                              <AlertTriangle className="w-3 h-3 text-red-400" />
                              <span className="text-xs text-red-400">
                                Competing: {p.competing_systems.join(", ")}
                              </span>
                            </div>
                          )}
                          {status && (
                            <div className={`text-xs mt-1 ${status.tone}`} data-testid="pending-decision-status">
                              {status.text}
                            </div>
                          )}
                          {rowErrors[key] && (
                            <div className="text-xs mt-1 text-red-300" data-testid="pending-decision-error">
                              {rowErrors[key]}
                            </div>
                          )}
                        </div>

                        {/* Target system */}
                        <div className="px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
                          <span className="text-xs text-blue-300">{p.system_name}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => setEvidencePending(p)}
                            title="Why? — boundary evidence"
                            className="px-1.5 py-1 rounded-md text-[10px] text-slate-300 hover:bg-slate-700/50 transition-colors"
                            data-testid="pending-why"
                          >
                            Why?
                          </button>
                          <button
                            onClick={() => handleDecision(p, "approve")}
                            disabled={disabled}
                            title={disabledTitle || (requestMode ? "Approve (recorded, then applied by the projector worker)" : "Approve")}
                            aria-label="Approve"
                            className="p-1.5 rounded-md bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 transition-colors disabled:opacity-50"
                          >
                            {isActioning ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDecision(p, "reject")}
                            disabled={disabled}
                            title={disabledTitle || (requestMode ? "Reject (recorded, then applied by the projector worker)" : "Reject")}
                            aria-label="Reject"
                            className="p-1.5 rounded-md bg-red-600/10 text-red-400 hover:bg-red-600/20 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <BoundaryEvidenceDrawer
        open={!!evidencePending}
        onOpenChange={(open) => {
          if (!open) setEvidencePending(null)
        }}
        pendingTag={evidencePending ? { ...evidencePending } : null}
      />
    </div>
  )
}
