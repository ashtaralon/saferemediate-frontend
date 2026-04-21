"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Loader2, AlertTriangle, Shield, ShieldCheck, RefreshCw, ShieldAlert, ChevronDown, ChevronRight, Workflow } from "lucide-react"
import { CrownJewelListPanel } from "./crown-jewel-list-panel"
import { AttackPathFlowViz } from "./attack-path-flow-viz"
import { NodeDetailPanel } from "./node-detail-panel"
import { PathScoreHero } from "./path-score-hero"
import { PathRemediationPlan } from "./path-remediation-plan"
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
  const [listMode, setListMode] = useState<"at-risk" | "safe">("at-risk")

  const [showFlowViz, setShowFlowViz] = useState(true)

  // Remediation state
  const [remediationStatus, setRemediationStatus] = useState<RemediationStatus>("idle")
  const [remediationPreview, setRemediationPreview] = useState<RemediationPreview | null>(null)
  const [remediationResult, setRemediationResult] = useState<RemediationResult | null>(null)
  const [activeRemediationNodeId, setActiveRemediationNodeId] = useState<string | null>(null)
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
      // initial jewel pick now happens in the listMode-aware effect below
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

  // ── Partition jewels + paths by "safe" definition: no actionable remediation ──
  const { atRiskJewels, safeJewels, atRiskPathCount, safePathCount } = useMemo(() => {
    if (!data) return { atRiskJewels: [], safeJewels: [], atRiskPathCount: 0, safePathCount: 0 }
    const jewels = data.crown_jewels ?? []
    const paths = data.paths ?? []
    const pathHasAction = (p: IdentityAttackPath) =>
      (p.risk_reduction?.top_actions?.length ?? 0) > 0

    let atRiskPC = 0
    let safePC = 0
    const jewelAtRisk = new Map<string, boolean>()
    for (const p of paths) {
      const has = pathHasAction(p)
      if (has) atRiskPC++
      else safePC++
      jewelAtRisk.set(p.crown_jewel_id, (jewelAtRisk.get(p.crown_jewel_id) ?? false) || has)
    }
    const atRisk = jewels.filter((j) => jewelAtRisk.get(j.id) === true)
    const safe = jewels.filter((j) => jewelAtRisk.get(j.id) !== true)
    return {
      atRiskJewels: atRisk,
      safeJewels: safe,
      atRiskPathCount: atRiskPC,
      safePathCount: safePC,
    }
  }, [data])

  const filteredJewels = listMode === "at-risk" ? atRiskJewels : safeJewels

  // ── Auto-select first jewel in the active list when data loads or mode flips ──
  useEffect(() => {
    if (!data) return
    const stillValid = selectedJewelId && filteredJewels.some((j) => j.id === selectedJewelId)
    if (!stillValid) {
      setSelectedJewelId(filteredJewels[0]?.id ?? null)
      setSelectedPathIndex(0)
      setSelectedNodeId(null)
      setRemediationStatus("idle")
      setRemediationPreview(null)
      setRemediationResult(null)
      setActiveRemediationNodeId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, listMode])

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
      // If we're already in confirming state for THIS node and user clicks cancel, reset
      if (remediationStatus === "confirming" && activeRemediationNodeId === nodeId) {
        setRemediationStatus("idle")
        setRemediationPreview(null)
        setActiveRemediationNodeId(null)
        return
      }

      setRemediationStatus("previewing")
      setRemediationPreview(null)
      setRemediationResult(null)
      setActiveRemediationNodeId(nodeId)
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
  }, [jewelPaths, selectedPathIndex, remediationStatus, remediationPreview, activeRemediationNodeId])

  // ── Cancel single-node preview ──
  const handleCancelNodeRemediation = useCallback(() => {
    setRemediationStatus("idle")
    setRemediationPreview(null)
    setActiveRemediationNodeId(null)
  }, [])

  // ── Rollback handler — routes to the right snapshot endpoint ──
  const handleRollback = useCallback(async (snapshotId: string, nodeId: string) => {
    const currentPath = jewelPaths?.[selectedPathIndex]
    if (!currentPath) return
    const node = currentPath.nodes.find((n) => n.id === nodeId)
    if (!node) return

    const nodeType = (node.type ?? "").toLowerCase()
    // Choose the matching rollback proxy — all exist today
    let rollbackUrl: string
    if (nodeType.includes("iam")) {
      rollbackUrl = `/api/proxy/iam-snapshots/${encodeURIComponent(snapshotId)}/rollback`
    } else if (nodeType.includes("securitygroup") || nodeType.includes("security_group") || nodeType === "sg") {
      // Security-group rollback needs the SG id + snapshot body
      rollbackUrl = `/api/proxy/security-groups/${encodeURIComponent(node.id)}/rollback`
    } else if (nodeType.includes("s3") || nodeType.includes("bucket")) {
      rollbackUrl = `/api/proxy/s3-buckets/rollback`
    } else {
      // Generic snapshot rollback
      rollbackUrl = `/api/proxy/snapshots/${encodeURIComponent(snapshotId)}/rollback`
    }

    setRemediationStatus("executing") // reuse executing state for rollback spinner
    try {
      const res = await fetch(rollbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot_id: snapshotId, resource_id: node.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) {
        setRemediationResult({
          success: false,
          node_id: nodeId,
          message: data.error ?? data.message ?? `Rollback failed (${res.status})`,
        })
        setRemediationStatus("error")
        return
      }
      // Reset row + refetch to pick up restored scores
      setRemediationStatus("idle")
      setRemediationPreview(null)
      setRemediationResult(null)
      setActiveRemediationNodeId(null)
      await fetchData()
    } catch (err: any) {
      setRemediationResult({
        success: false,
        node_id: nodeId,
        message: err?.message ?? "Rollback failed",
      })
      setRemediationStatus("error")
    }
  }, [jewelPaths, selectedPathIndex, fetchData])

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
    setActiveRemediationNodeId(null)
    setRemediateAllStatus("idle")
    setRemediateAllResults([])
  }, [])

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (nodeId === prev ? null : nodeId))
    // Reset node-level remediation when switching nodes (unless the row clicked is the active one)
    if (nodeId !== activeRemediationNodeId) {
      setRemediationStatus("idle")
      setRemediationPreview(null)
      setRemediationResult(null)
      setActiveRemediationNodeId(null)
    }
  }, [activeRemediationNodeId])

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
      {/* Header — compact single-row title + right-aligned tabs, then one summary sentence */}
      <div
        className="px-5 py-3 border-b"
        style={{
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)",
          borderColor: "rgba(148, 163, 184, 0.15)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-white">Identity Attack Paths</h2>
              <span className="text-xs text-slate-400 truncate">{systemName}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              <span className="font-semibold text-slate-200 tabular-nums">{data.total_paths ?? 0}</span> paths expose{" "}
              <span className="font-semibold text-slate-200 tabular-nums">{data.total_jewels ?? 0}</span> crown jewels
              {(data.exposed_jewels ?? 0) > 0 ? (
                <>
                  {" · "}
                  <span className="font-semibold text-red-400 tabular-nums">{data.exposed_jewels}</span>{" "}
                  internet-exposed
                </>
              ) : (
                <> · <span className="text-slate-500">no internet-exposed jewels</span></>
              )}
              {(data.critical_paths ?? 0) > 0 ? (
                <> · <span className="font-semibold text-red-400 tabular-nums">{data.critical_paths}</span> critical</>
              ) : null}
              {(data.high_paths ?? 0) > 0 ? (
                <> · <span className="font-semibold text-amber-400 tabular-nums">{data.high_paths}</span> high</>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* At Risk / Safe tab pills — dark mode */}
            <div
              className="flex items-center p-0.5 rounded-md"
              style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.15)" }}
            >
              <button
                onClick={() => setListMode("at-risk")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                style={
                  listMode === "at-risk"
                    ? {
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "#fca5a5",
                        border: "1px solid rgba(239, 68, 68, 0.35)",
                      }
                    : { color: "#94a3b8", border: "1px solid transparent" }
                }
                title="Paths where the scoring engine found at least one action that reduces the score"
              >
                <ShieldAlert className="w-3 h-3" />
                At Risk
                <span
                  className="px-1 rounded text-[10px] font-mono tabular-nums"
                  style={{
                    background: listMode === "at-risk" ? "rgba(239,68,68,0.25)" : "rgba(148,163,184,0.1)",
                    color: listMode === "at-risk" ? "#fecaca" : "#94a3b8",
                  }}
                >
                  {atRiskPathCount}
                </span>
              </button>
              <button
                onClick={() => setListMode("safe")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                style={
                  listMode === "safe"
                    ? {
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#6ee7b7",
                        border: "1px solid rgba(16, 185, 129, 0.35)",
                      }
                    : { color: "#94a3b8", border: "1px solid transparent" }
                }
                title="Paths where no further remediation action was found (already hardened)"
              >
                <ShieldCheck className="w-3 h-3" />
                Safe
                <span
                  className="px-1 rounded text-[10px] font-mono tabular-nums"
                  style={{
                    background: listMode === "safe" ? "rgba(16,185,129,0.25)" : "rgba(148,163,184,0.1)",
                    color: listMode === "safe" ? "#a7f3d0" : "#94a3b8",
                  }}
                >
                  {safePathCount}
                </span>
              </button>
            </div>
            <button
              onClick={fetchData}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        <CrownJewelListPanel
          jewels={filteredJewels}
          selectedJewelId={selectedJewelId}
          onSelect={handleJewelSelect}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Hero banner — big, immediately-readable score + severity + risk + remediation */}
          {currentPath && (
            <PathScoreHero
              path={currentPath}
              pathIndex={selectedPathIndex}
              totalPaths={jewelPaths.length}
              onPrev={() => setSelectedPathIndex(Math.max(0, selectedPathIndex - 1))}
              onNext={() => setSelectedPathIndex(Math.min(jewelPaths.length - 1, selectedPathIndex + 1))}
            />
          )}

          {jewelPaths.length > 0 && currentPath ? (
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] overflow-hidden">
              {/* Left column — Remediation Plan, scrolls independently */}
              <div
                className="overflow-auto lg:border-r"
                style={{ borderColor: "rgba(148, 163, 184, 0.1)" }}
              >
                <PathRemediationPlan
                  path={currentPath}
                  activeNodeId={activeRemediationNodeId}
                  remediationStatus={remediationStatus}
                  remediationPreview={remediationPreview}
                  remediationResult={remediationResult}
                  onRemediate={handleNodeRemediate}
                  onRollback={handleRollback}
                  onCancel={handleCancelNodeRemediation}
                  isSafe={listMode === "safe"}
                  remediateAllStatus={listMode === "at-risk" ? remediateAllStatus : undefined}
                  remediateAllResultsCount={remediateAllResults.length}
                  remediateAllSuccessCount={remediateAllResults.filter((r) => r.success).length}
                  onRemediateAll={listMode === "at-risk" ? handleRemediateAll : undefined}
                  onResetRemediateAll={() => { setRemediateAllStatus("idle"); setRemediateAllResults([]); }}
                />
              </div>

              {/* Right column — Attack Graph */}
              <div className="flex flex-col overflow-hidden">
                <div
                  className="px-4 py-2 border-b flex items-center justify-between shrink-0"
                  style={{
                    background: "rgba(10, 16, 30, 0.6)",
                    borderColor: "rgba(148, 163, 184, 0.1)",
                  }}
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <Workflow className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-200 uppercase tracking-wider">
                      Attack graph
                    </span>
                    <span className="text-slate-500">
                      · {(currentPath?.nodes?.length ?? 0)} nodes across{" "}
                      {(currentPath?.nodes ? new Set(currentPath.nodes.map((n) => n.lane ?? n.tier ?? "other")).size : 0)} lanes
                    </span>
                  </div>
                  <button
                    onClick={() => setShowFlowViz((v) => !v)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors"
                    title={showFlowViz ? "Hide the geometric attack-flow graph" : "Show the geometric attack-flow graph"}
                  >
                    {showFlowViz ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {showFlowViz ? "Hide graph" : "Show graph"}
                  </button>
                </div>

                {showFlowViz && (
                  <div className="flex-1 overflow-auto">
                    <AttackPathFlowViz
                      paths={jewelPaths}
                      selectedPathIndex={selectedPathIndex}
                      onNodeClick={handleNodeClick}
                      selectedNodeId={selectedNodeId}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : filteredJewels.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center max-w-md px-6">
                {listMode === "safe" ? (
                  <>
                    <Shield className="w-10 h-10 text-slate-500" />
                    <p className="text-sm text-slate-300 font-medium">No fully-hardened paths yet</p>
                    <p className="text-xs text-slate-500">
                      Every crown jewel still has at least one remediation the scoring engine can apply.
                      Work through the <span className="text-red-400">At Risk</span> tab to move jewels here.
                    </p>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-10 h-10 text-emerald-400" />
                    <p className="text-sm text-white font-medium">All crown jewels are hardened</p>
                    <p className="text-xs text-slate-400">
                      No active attack paths need remediation. Check the{" "}
                      <span className="text-emerald-300">Safe</span> tab to confirm.
                    </p>
                  </>
                )}
              </div>
            </div>
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

