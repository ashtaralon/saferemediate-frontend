"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Loader2, AlertTriangle, Shield, Globe, RefreshCw, ChevronLeft, ChevronRight, ShieldAlert, Play, Eye, CheckCircle2, XCircle } from "lucide-react"
import { CrownJewelListPanel } from "./crown-jewel-list-panel"
import { AttackPathFlowViz } from "./attack-path-flow-viz"
import { NodeDetailPanel } from "./node-detail-panel"
import { SeverityBadge } from "./severity-badge"
import type {
  IdentityAttackPathsResponse,
  IdentityAttackPath,
  PathNodeDetail,
  RemediationStatus,
  RemediationPreview,
  RemediationResult,
} from "./types"

interface IdentityAttackPathsProps {
  systemName: string
}

export function IdentityAttackPaths({ systemName }: IdentityAttackPathsProps) {
  const [data, setData] = useState<IdentityAttackPathsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedJewelId, setSelectedJewelId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPathIndex, setSelectedPathIndex] = useState(0)

  // Remediation state
  const [remediationStatus, setRemediationStatus] = useState<RemediationStatus>("idle")
  const [remediationPreview, setRemediationPreview] = useState<RemediationPreview | null>(null)
  const [remediationResult, setRemediationResult] = useState<RemediationResult | null>(null)
  const [remediateAllStatus, setRemediateAllStatus] = useState<"idle" | "previewing" | "executing" | "done">("idle")
  const [remediateAllResults, setRemediateAllResults] = useState<RemediationResult[]>([])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: IdentityAttackPathsResponse = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
      if ((json.crown_jewels?.length ?? 0) > 0 && !selectedJewelId) {
        setSelectedJewelId(json.crown_jewels[0].id)
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load attack paths")
    } finally {
      setIsLoading(false)
    }
  }, [systemName])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const jewelPaths = useMemo(() => {
    if (!data || !selectedJewelId) return []
    return (data.paths ?? []).filter((p) => p.crown_jewel_id === selectedJewelId)
  }, [data, selectedJewelId])

  const selectedNode = useMemo((): PathNodeDetail | null => {
    if (!selectedNodeId) return null
    const currentPath = jewelPaths?.[selectedPathIndex]
    if (!currentPath) return null
    return (currentPath.nodes ?? []).find((n) => n.id === selectedNodeId) ?? null
  }, [selectedNodeId, jewelPaths, selectedPathIndex])

  // ── Single-node remediation handler ──
  const handleNodeRemediate = useCallback(async (nodeId: string, dryRun: boolean) => {
    const currentPath = jewelPaths?.[selectedPathIndex]
    if (!currentPath) return
    const node = currentPath.nodes.find((n) => n.id === nodeId)
    if (!node) return

    if (dryRun) {
      // If we're already in confirming state and user clicks cancel, reset
      if (remediationStatus === "confirming") {
        setRemediationStatus("idle")
        setRemediationPreview(null)
        return
      }

      setRemediationStatus("previewing")
      setRemediationPreview(null)
      setRemediationResult(null)
      try {
        const res = await fetch("/api/proxy/attack-path-remediate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: node.id,
            node_type: node.type,
            node_name: node.name,
            dry_run: true,
          }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setRemediationPreview(data)
        setRemediationStatus("confirming")
      } catch (err: any) {
        setRemediationResult({ success: false, node_id: nodeId, message: err.message ?? "Preview failed" })
        setRemediationStatus("error")
      }
    } else {
      // Execute real remediation
      setRemediationStatus("executing")
      try {
        const res = await fetch("/api/proxy/attack-path-remediate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: node.id,
            node_type: node.type,
            node_name: node.name,
            dry_run: false,
            create_snapshot: true,
            permissions_to_remove: remediationPreview?.permissions_to_remove,
          }),
        })
        const data = await res.json()
        if (data.blocked) {
          setRemediationResult({ success: false, node_id: nodeId, message: data.block_reason ?? "Blocked", blocked: true, block_reason: data.block_reason })
          setRemediationStatus("error")
        } else if (data.success === false || data.error) {
          setRemediationResult({ success: false, node_id: nodeId, message: data.error ?? data.message ?? "Failed" })
          setRemediationStatus("error")
        } else {
          setRemediationResult(data)
          setRemediationStatus("success")
        }
      } catch (err: any) {
        setRemediationResult({ success: false, node_id: nodeId, message: err.message ?? "Remediation failed" })
        setRemediationStatus("error")
      }
    }
  }, [jewelPaths, selectedPathIndex, remediationStatus, remediationPreview])

  // ── Remediate All handler ──
  const handleRemediateAll = useCallback(async (dryRun: boolean) => {
    const currentPath = jewelPaths?.[selectedPathIndex]
    if (!currentPath) return

    if (dryRun) {
      setRemediateAllStatus("previewing")
      // We just show a confirmation prompt
      setRemediateAllStatus("previewing")
      return
    }

    setRemediateAllStatus("executing")
    const results: RemediationResult[] = []
    for (const node of currentPath.nodes) {
      try {
        const res = await fetch("/api/proxy/attack-path-remediate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: node.id,
            node_type: node.type,
            node_name: node.name,
            dry_run: false,
            create_snapshot: true,
          }),
        })
        const data = await res.json()
        results.push({
          success: data.success !== false && !data.error,
          node_id: node.id,
          message: data.message ?? (data.error ? `Error: ${data.error}` : "Done"),
          snapshot_id: data.snapshot_id,
          rollback_available: data.rollback_available,
          permissions_removed: data.permissions_removed,
        })
      } catch (err: any) {
        results.push({ success: false, node_id: node.id, message: err.message ?? "Failed" })
      }
    }
    setRemediateAllResults(results)
    setRemediateAllStatus("done")
  }, [jewelPaths, selectedPathIndex])

  const handleJewelSelect = useCallback((id: string) => {
    setSelectedJewelId(id)
    setSelectedPathIndex(0)
    setSelectedNodeId(null)
    setRemediationStatus("idle")
    setRemediationPreview(null)
    setRemediationResult(null)
    setRemediateAllStatus("idle")
    setRemediateAllResults([])
  }, [])

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (nodeId === prev ? null : nodeId))
    // Reset node-level remediation when switching nodes
    setRemediationStatus("idle")
    setRemediationPreview(null)
    setRemediationResult(null)
  }, [])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-sm text-slate-400">Analyzing identity attack paths...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
          <p className="text-sm text-white font-medium">Failed to load attack paths</p>
          <p className="text-xs text-slate-400">{error}</p>
          <button
            onClick={fetchData}
            className="mt-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Empty state
  if (!data || (data.total_paths ?? 0) === 0) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3">
          <Shield className="w-10 h-10 text-green-400" />
          <p className="text-sm text-white font-medium">No identity attack paths found</p>
          <p className="text-xs text-slate-400">No paths from entry points to crown jewels were detected</p>
        </div>
      </div>
    )
  }

  const currentPath = jewelPaths?.[selectedPathIndex] ?? null

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div
        className="px-6 py-4 border-b"
        style={{
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)",
          borderColor: "rgba(148, 163, 184, 0.15)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold text-white">Identity Attack Paths</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Identity-based paths from entry points to crown jewels &middot; {systemName}
            </p>
          </div>
          <button
            onClick={fetchData}
            className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <StatPill value={data.critical_paths ?? 0} label="Critical Paths" color="#ef4444" show={(data.critical_paths ?? 0) > 0} />
          <StatPill value={data.high_paths ?? 0} label="High Paths" color="#f97316" show={(data.high_paths ?? 0) > 0} />
          <StatPill value={data.total_jewels ?? 0} label="Crown Jewels" color="#8b5cf6" show />
          <StatPill value={data.exposed_jewels ?? 0} label="Exposed" color="#ef4444" icon={<Globe className="w-3 h-3" />} show={(data.exposed_jewels ?? 0) > 0} />
          <StatPill value={data.total_paths ?? 0} label="Total Paths" color="#64748b" show />
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        <CrownJewelListPanel
          jewels={data.crown_jewels ?? []}
          selectedJewelId={selectedJewelId}
          onSelect={handleJewelSelect}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Path selector with severity badges + Remediate All */}
          {jewelPaths.length > 0 && (
            <div
              className="flex items-center justify-between px-4 py-2 border-b"
              style={{ background: "rgba(15, 23, 42, 0.9)", borderColor: "rgba(148, 163, 184, 0.1)" }}
            >
              {/* Left: path nav */}
              <div className="flex items-center gap-3">
                {jewelPaths.length > 1 && (
                  <>
                    <button
                      onClick={() => setSelectedPathIndex(Math.max(0, selectedPathIndex - 1))}
                      disabled={selectedPathIndex === 0}
                      className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-30 text-slate-400"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-300">
                        Path {selectedPathIndex + 1} of {jewelPaths.length}
                      </span>
                      {currentPath?.severity?.severity && (
                        <SeverityBadge severity={currentPath.severity.severity} size="sm" />
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedPathIndex(Math.min(jewelPaths.length - 1, selectedPathIndex + 1))}
                      disabled={selectedPathIndex >= jewelPaths.length - 1}
                      className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-30 text-slate-400"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
                {jewelPaths.length === 1 && currentPath?.severity?.severity && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-300">Path 1</span>
                    <SeverityBadge severity={currentPath.severity.severity} size="sm" />
                  </div>
                )}
              </div>

              {/* Right: Remediate All Path */}
              <div className="flex items-center gap-2">
                {remediateAllStatus === "idle" && (
                  <button
                    onClick={() => handleRemediateAll(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:border-red-500/40 transition-all"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Remediate All Path
                  </button>
                )}
                {remediateAllStatus === "previewing" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-amber-400">
                      Remediate all {currentPath?.nodes.length ?? 0} nodes?
                    </span>
                    <button
                      onClick={() => handleRemediateAll(false)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-red-600/80 text-white hover:bg-red-600 transition-all"
                    >
                      <Play className="w-3 h-3" />
                      Confirm
                    </button>
                    <button
                      onClick={() => setRemediateAllStatus("idle")}
                      className="px-2 py-1 rounded-lg text-[11px] text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {remediateAllStatus === "executing" && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span className="text-[11px] text-amber-300">
                      Remediating {remediateAllResults.length}/{currentPath?.nodes.length ?? 0} nodes...
                    </span>
                  </div>
                )}
                {remediateAllStatus === "done" && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] text-emerald-400">
                      {remediateAllResults.filter((r) => r.success).length}/{remediateAllResults.length} remediated
                    </span>
                    <button
                      onClick={() => { setRemediateAllStatus("idle"); setRemediateAllResults([]); }}
                      className="text-[10px] text-slate-500 hover:text-white ml-1"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {jewelPaths.length > 0 ? (
            <AttackPathFlowViz
              paths={jewelPaths}
              selectedPathIndex={selectedPathIndex}
              onNodeClick={handleNodeClick}
              selectedNodeId={selectedNodeId}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-slate-400">Select a crown jewel to view attack paths</p>
            </div>
          )}
        </div>

        {selectedNode && currentPath && (
          <NodeDetailPanel
            node={selectedNode}
            path={currentPath}
            onClose={() => setSelectedNodeId(null)}
            onRemediate={handleNodeRemediate}
            remediationStatus={remediationStatus}
            remediationPreview={remediationPreview}
            remediationResult={remediationResult}
          />
        )}
      </div>
    </div>
  )
}

function StatPill({
  value,
  label,
  color,
  icon,
  show,
}: {
  value: number
  label: string
  color: string
  icon?: React.ReactNode
  show: boolean
}) {
  if (!show) return null
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
      style={{ background: `${color}10`, border: `1px solid ${color}25` }}
    >
      {icon || <div className="w-2 h-2 rounded-full" style={{ background: color }} />}
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  )
}
