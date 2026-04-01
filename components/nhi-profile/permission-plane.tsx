"use client"

import { useState, useEffect } from "react"
import {
  Key, Shield, Eye, PenTool, Trash2, Lock, AlertTriangle,
  CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronRight, Target,
} from "lucide-react"

interface PermissionPlaneProps {
  identityName: string
  detail: any
  identity: any
  onRemediate: (result: any) => void
}

const DAMAGE_ICONS: Record<string, any> = { DELETE: Trash2, ADMIN: Shield, ENCRYPT: Lock, WRITE: PenTool, READ: Eye }
const DAMAGE_COLORS: Record<string, string> = { DELETE: "#ef4444", ADMIN: "#f97316", ENCRYPT: "#a855f7", WRITE: "#eab308", READ: "#3b82f6" }

export function PermissionPlane({ identityName, detail, identity, onRemediate }: PermissionPlaneProps) {
  const [gapData, setGapData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [applying, setApplying] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [snapshotId, setSnapshotId] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [rollbackDone, setRollbackDone] = useState(false)

  useEffect(() => {
    fetchGapAnalysis()
  }, [identityName])

  const fetchGapAnalysis = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(identityName)}/gap-analysis?days=90`)
      if (res.ok) setGapData(await res.json())
    } catch (err) {
      console.error("Error fetching gap analysis:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleSimulate = async () => {
    setSimulating(true)
    try {
      const res = await fetch("/api/proxy/cyntro/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_name: identityName,
          dry_run: true,
          detach_managed_policies: true,
        }),
      })
      if (res.ok) setSimulationResult(await res.json())
    } catch (err) {
      console.error("Simulation failed:", err)
    } finally {
      setSimulating(false)
    }
  }

  const handleApply = async () => {
    setApplying(true)
    try {
      // Step 1: Create pre-remediation snapshot
      const snapRes = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(identityName)}/snapshot`, {
        method: "POST", headers: { "Content-Type": "application/json" },
      })
      if (snapRes.ok) {
        const snapResult = await snapRes.json()
        if (snapResult.snapshot_id) setSnapshotId(snapResult.snapshot_id)
      }

      // Step 2: Apply remediation
      const res = await fetch("/api/proxy/cyntro/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_name: identityName,
          dry_run: false,
          create_snapshot: true,
          detach_managed_policies: true,
          detach_all_managed_policies: true,
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.snapshot_id) setSnapshotId(result.snapshot_id)
        onRemediate(result)
      }
    } catch (err) {
      console.error("Remediation failed:", err)
    } finally {
      setApplying(false)
    }
  }

  const handleRollback = async () => {
    if (!snapshotId) return
    setRollingBack(true)
    try {
      const res = await fetch(`/api/proxy/iam-snapshots/${encodeURIComponent(snapshotId)}/rollback`, {
        method: "POST", headers: { "Content-Type": "application/json" },
      })
      if (res.ok) {
        setRollbackDone(true)
        fetchGapAnalysis() // Refresh data
      }
    } catch (err) {
      console.error("Rollback failed:", err)
    } finally {
      setRollingBack(false)
    }
  }

  const permAnalysis = detail?.permission_analysis || gapData
  const damage = detail?.damage_classification

  // Helper: ensure we have a proper string array (filter out char-by-char broken data)
  const ensureStringArray = (val: any): string[] => {
    if (!val) return []
    if (typeof val === 'string') {
      try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed.filter((s: any) => typeof s === 'string' && s.length > 1) : [] } catch { return [] }
    }
    if (Array.isArray(val)) {
      return val
        .map((item: any) => {
          if (typeof item === 'string') return item
          if (typeof item === 'object' && item) return item.permission || item.action || item.name || ''
          return ''
        })
        .filter((s: string) => s.length > 2 && s.includes(':')) // Valid IAM permissions contain ":" like "s3:GetObject"
    }
    return []
  }

  // Use identity detail's allowed_actions (always correct format: ["s3:GetObject", ...])
  // The gap analysis permissions_analysis is broken (character-by-character) — avoid it
  const detailAllowed = ensureStringArray(permAnalysis?.allowed_actions)

  // For used/unused: the backend returns broken char arrays for these too
  // So use the COUNTS from the backend + the allowed_actions list to determine status
  const backendUsedCount = gapData?.summary?.used_count ?? permAnalysis?.used_count ?? 0
  const backendUnusedCount = gapData?.summary?.unused_count ?? permAnalysis?.unused_count ?? 0
  const backendTotal = gapData?.summary?.total_permissions ?? permAnalysis?.allowed_count ?? 0

  // Try to get proper used permission names from event_count or CloudTrail data
  const usedFromEvents = ensureStringArray(permAnalysis?.used_actions)

  // The allowed_actions list is the short explicit list (4 items)
  // The total count includes expanded managed policy actions (68)
  // Show the explicit list + indicate how many more from managed policies
  const allowedActions = detailAllowed
  const usedActions = new Set(usedFromEvents)
  const totalCount = backendTotal || allowedActions.length
  const unusedCount = backendUnusedCount || (totalCount - usedActions.size)
  const usedCount = backendUsedCount || usedActions.size
  const managedPolicyExpanded = totalCount > allowedActions.length ? totalCount - allowedActions.length : 0

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border, #e2e8f0)" }}>
      {/* Plane Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:opacity-90 transition-opacity"
        style={{ background: "#8b5cf608" }}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-5 h-5" style={{ color: "#8b5cf6" }} /> : <ChevronRight className="w-5 h-5" style={{ color: "#8b5cf6" }} />}
          <Key className="w-5 h-5" style={{ color: "#8b5cf6" }} />
          <span className="text-base font-semibold" style={{ color: "var(--text-primary, #0f172a)" }}>Permission Plane</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#8b5cf615", color: "#8b5cf6" }}>IAM</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {damage && (
            <span style={{ color: damage.damage_score >= 50 ? '#ef4444' : damage.damage_score >= 20 ? '#f97316' : '#22c55e' }}>
              Damage: {damage.damage_score}/100
            </span>
          )}
          <span style={{ color: "var(--text-secondary, #64748b)" }}>
            {usedCount} used / {totalCount} total
          </span>
          {unusedCount > 0 && (
            <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "#ef444420", color: "#ef4444" }}>
              {unusedCount} unused
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 py-5 space-y-4" style={{ background: "var(--bg-surface, #ffffff)" }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#8b5cf6" }} />
              <span className="ml-2 text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>Loading permission analysis...</span>
            </div>
          ) : (
            <>
              {/* Two-Column: Configured vs Observed */}
              <div className="grid grid-cols-2 gap-6">
                {/* Configured */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: "var(--text-muted, #94a3b8)" }}>
                    <Shield className="w-3.5 h-3.5" /> Configured (IAM Policy)
                  </h4>
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {allowedActions.map((action: string, i: number) => {
                      const isUsed = usedActions.has(action)
                      return (
                        <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded text-sm" style={{ background: "var(--bg-secondary, #f8fafc)" }}>
                          <code className="text-xs font-mono" style={{ color: "var(--text-primary, #334155)" }}>{action}</code>
                          {isUsed ? (
                            <span className="flex items-center gap-1 text-xs" style={{ color: "#22c55e" }}>
                              <CheckCircle className="w-3 h-3" /> Used
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs" style={{ color: "#ef4444" }}>
                              <XCircle className="w-3 h-3" /> Unused
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {managedPolicyExpanded > 0 && (
                      <div className="py-2 px-3 rounded text-xs" style={{ background: "#8b5cf608", color: "#8b5cf6" }}>
                        + {managedPolicyExpanded} more permissions from managed policy expansion ({totalCount} total)
                      </div>
                    )}
                    {allowedActions.length === 0 && (
                      <p className="text-xs py-2" style={{ color: "var(--text-muted, #94a3b8)" }}>No permission data available</p>
                    )}
                  </div>
                </div>

                {/* Observed */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: "var(--text-muted, #94a3b8)" }}>
                    <Eye className="w-3.5 h-3.5" /> Observed (CloudTrail 90d)
                  </h4>

                  {/* Damage Classification */}
                  {damage && (
                    <div className="rounded-lg p-3 mb-3 border" style={{ background: "var(--bg-secondary, #f8fafc)", borderColor: "var(--border, #e2e8f0)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--text-secondary, #64748b)" }}>
                          <Target className="w-3 h-3" /> Damage Potential
                        </span>
                        <span className="text-lg font-bold" style={{
                          color: damage.damage_score >= 50 ? '#ef4444' : damage.damage_score >= 20 ? '#f97316' : '#22c55e'
                        }}>{damage.damage_score}/100</span>
                      </div>
                      <div className="space-y-1.5">
                        {Object.entries(damage.details || {}).map(([cat, actions]) => {
                          const actList = actions as string[]
                          if (!actList || actList.length === 0) return null
                          const DIcon = DAMAGE_ICONS[cat] || AlertTriangle
                          const color = DAMAGE_COLORS[cat] || "#64748b"
                          return (
                            <div key={cat} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <DIcon className="w-3.5 h-3.5" style={{ color }} />
                                <span className="text-xs" style={{ color }}>{cat}</span>
                              </div>
                              <span className="text-xs font-bold" style={{ color }}>{actList.length} unused</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Trust & Policies */}
                  <div className="rounded-lg p-3 border" style={{ background: "var(--bg-secondary, #f8fafc)", borderColor: "var(--border, #e2e8f0)" }}>
                    {detail?.trust_principals?.length > 0 && (
                      <div className="mb-2">
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted, #94a3b8)" }}>Assumed by</span>
                        {detail.trust_principals.map((p: string, i: number) => (
                          <div key={i} className="text-xs font-mono mt-0.5" style={{ color: "var(--text-primary, #334155)" }}>{p}</div>
                        ))}
                      </div>
                    )}
                    {detail?.policies?.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted, #94a3b8)" }}>Policies ({detail.policies.length})</span>
                        {detail.policies.map((p: string, i: number) => (
                          <div key={i} className="text-xs font-mono mt-0.5" style={{ color: "var(--text-primary, #334155)" }}>{p}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              {unusedCount > 0 && (
                <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                  <div className="text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>
                    <span className="font-medium" style={{ color: "#ef4444" }}>{unusedCount}</span> unused permission(s) can be removed
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSimulate}
                      disabled={simulating}
                      className="px-4 py-2 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ borderColor: "#8b5cf640", color: "#8b5cf6" }}
                    >
                      {simulating ? "Simulating..." : "Simulate Fix"}
                    </button>
                    <button
                      onClick={handleApply}
                      disabled={applying}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ background: "#8b5cf6" }}
                    >
                      {applying ? "Applying..." : "Apply Permission Fix"}
                    </button>
                  </div>
                </div>
              )}

              {/* Simulation Result */}
              {simulationResult && (
                <div className="rounded-lg p-3 border" style={{ background: "#3b82f608", borderColor: "#3b82f630" }}>
                  <h4 className="text-xs font-semibold mb-1" style={{ color: "#3b82f6" }}>Simulation Result (Dry Run)</h4>
                  <pre className="text-xs font-mono overflow-auto max-h-[150px]" style={{ color: "var(--text-primary, #334155)" }}>
                    {JSON.stringify(simulationResult, null, 2)}
                  </pre>
                </div>
              )}

              {/* Snapshot & Rollback Banner */}
              {snapshotId && !rollbackDone && (
                <div className="rounded-lg p-3 border flex items-center justify-between" style={{ background: "#22c55e08", borderColor: "#22c55e30" }}>
                  <div>
                    <h4 className="text-xs font-semibold flex items-center gap-1" style={{ color: "#22c55e" }}>
                      <CheckCircle className="w-3.5 h-3.5" /> Remediation Applied — Snapshot Saved
                    </h4>
                    <p className="text-xs font-mono mt-0.5" style={{ color: "var(--text-secondary, #64748b)" }}>{snapshotId}</p>
                  </div>
                  <button
                    onClick={handleRollback}
                    disabled={rollingBack}
                    className="px-4 py-2 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ borderColor: "#ef444440", color: "#ef4444" }}
                  >
                    {rollingBack ? "Rolling back..." : "Rollback to Pre-Remediation"}
                  </button>
                </div>
              )}
              {rollbackDone && (
                <div className="rounded-lg p-3 border" style={{ background: "#f59e0b08", borderColor: "#f59e0b30" }}>
                  <h4 className="text-xs font-semibold flex items-center gap-1" style={{ color: "#f59e0b" }}>
                    <AlertTriangle className="w-3.5 h-3.5" /> Rolled Back Successfully
                  </h4>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary, #64748b)" }}>Permissions restored to pre-remediation state from snapshot {snapshotId}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
