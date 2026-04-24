"use client"

import { useState, useEffect, useCallback } from "react"
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

interface PendingTag {
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
}

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

export function PendingApprovals({ systemName }: { systemName?: string }) {
  const [pending, setPending] = useState<PendingTag[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch("/api/proxy/auto-tagger/pending?status=pending", {
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      let items: PendingTag[] = data.pending || []
      if (systemName) {
        items = items.filter((p) => p.system_name === systemName)
      }
      setPending(items)
    } catch (err: any) {
      setError(err.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [systemName])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  const handleApprove = async (resourceName: string, system: string) => {
    const key = `${resourceName}:${system}`
    setActionLoading(key)
    try {
      const res = await fetch("/api/proxy/auto-tagger/pending/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource_name: resourceName, system_name: system }),
      })
      const data = await res.json()
      if (data.success) {
        setPending((prev) => prev.filter((p) => !(p.resource_name === resourceName && p.system_name === system)))
      }
    } catch (err) {
      console.error("Approve failed:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (resourceName: string, system: string) => {
    const key = `${resourceName}:${system}`
    setActionLoading(key)
    try {
      const res = await fetch("/api/proxy/auto-tagger/pending/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource_name: resourceName, system_name: system }),
      })
      const data = await res.json()
      if (data.success) {
        setPending((prev) => prev.filter((p) => !(p.resource_name === resourceName && p.system_name === system)))
      }
    } catch (err) {
      console.error("Reject failed:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleApproveAll = async () => {
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
          <button onClick={fetchPending} className="ml-auto text-slate-400 hover:text-white">
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
    return (
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 text-center" data-testid="pending-approvals-empty">
        <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-white">No pending tags</p>
        <p className="text-xs text-slate-400 mt-1">
          {systemName
            ? `All auto-tagger decisions for ${systemName} have been reviewed`
            : "All auto-tagger decisions have been reviewed"}
        </p>
        <button
          onClick={fetchPending}
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
          {/* Bulk actions */}
          <div className="px-5 py-2 flex items-center justify-between border-b border-slate-800/50">
            <span className="text-xs text-slate-500">
              {Object.keys(groupedByReason).length} reason categories
            </span>
            <div className="flex gap-2">
              <button
                onClick={fetchPending}
                className="px-3 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 inline mr-1 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                onClick={handleApproveAll}
                disabled={actionLoading === "approve-all"}
                className="px-3 py-1 text-xs rounded-md bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
              >
                <CheckCheck className="w-3 h-3 inline mr-1" />
                {actionLoading === "approve-all" ? "Approving..." : "Approve All"}
              </button>
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
                  {/* Reason header */}
                  <div className="px-5 py-2 bg-slate-800/20 flex items-center gap-2">
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
                    const key = `${p.resource_name}:${p.system_name}`
                    const isActioning = actionLoading === key

                    return (
                      <div
                        key={key}
                        className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-800/20 transition-colors"
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
                        </div>

                        {/* Target system */}
                        <div className="px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
                          <span className="text-xs text-blue-300">{p.system_name}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => handleApprove(p.resource_name, p.system_name)}
                            disabled={isActioning}
                            title="Approve"
                            className="p-1.5 rounded-md bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 transition-colors disabled:opacity-50"
                          >
                            {isActioning ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleReject(p.resource_name, p.system_name)}
                            disabled={isActioning}
                            title="Reject"
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
    </div>
  )
}
