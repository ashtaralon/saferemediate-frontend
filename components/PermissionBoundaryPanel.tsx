"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ShieldOff,
  Eye,
  Play,
  RotateCcw,
  Activity,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
  Settings,
  RefreshCw,
  RefreshCcw,
  Wrench,
} from "lucide-react"

// --- Types ---

interface ConfidenceBreakdown {
  base_telemetry_score: number
  observation_days: number
  observation_factor: number
  total_api_calls: number
  volume_factor: number
  resource_count: number
  blast_radius_penalty: number
}

interface DriftInfo {
  status: string
  severity: string
  detected_at: string | null
  details: string
}

interface Candidate {
  role_name: string
  role_arn: string
  allowed_count: number
  used_count: number
  unused_count: number
  gap_percentage: number
  used_actions: string[]
  confidence_score: number
  enforcement_tier: string
  confidence_breakdown: ConfidenceBreakdown
  resources_using_role: number
  enforcement_status: string
  existing_boundary_arn: string | null
  drift_info: DriftInfo | null
}

interface PreviewData {
  role_name: string
  role_arn: string
  current_policy_summary: {
    total_permissions: number
    used_count: number
    unused_count: number
    gap_percentage: number
  }
  proposed_boundary_policy: any
  permissions_kept: string[]
  permissions_removed: string[]
  permissions_removed_count: number
  permissions_kept_count: number
  confidence_score: number
  enforcement_tier: string
  blast_radius: { resources_using_role: number }
  enforcement_status: string
}

interface CandidatesResponse {
  candidates: Candidate[]
  total_count: number
  tier_summary: Record<string, number>
}

// --- Constants ---

const TIER_CONFIG: Record<string, {
  label: string
  shortLabel: string
  color: string
  bgColor: string
  borderColor: string
  icon: typeof ShieldCheck
}> = {
  AUTO_ENFORCE: {
    label: "Auto-Enforce",
    shortLabel: "Auto",
    color: "text-[#10b981]",
    bgColor: "bg-[#10b98110]",
    borderColor: "border-[#10b98140]",
    icon: ShieldCheck,
  },
  AUTO_WITH_APPROVAL: {
    label: "Auto + Approval",
    shortLabel: "Approve",
    color: "text-[#3b82f6]",
    bgColor: "bg-[#3b82f610]",
    borderColor: "border-[#3b82f640]",
    icon: Shield,
  },
  REVIEW_AND_APPLY: {
    label: "Review & Apply",
    shortLabel: "Review",
    color: "text-[#f97316]",
    bgColor: "bg-[#f9731610]",
    borderColor: "border-[#f9731640]",
    icon: Eye,
  },
  SUGGEST_WITH_WARNING: {
    label: "Suggestion",
    shortLabel: "Suggest",
    color: "text-[#f97316]",
    bgColor: "bg-[#f9731610]",
    borderColor: "border-[#f9731640]",
    icon: ShieldQuestion,
  },
  ALERT_ONLY: {
    label: "Alert Only",
    shortLabel: "Alert",
    color: "text-[var(--muted-foreground,#4b5563)]",
    bgColor: "bg-gray-50",
    borderColor: "border-[var(--border,#e5e7eb)]",
    icon: ShieldAlert,
  },
}

const STATUS_CONFIG: Record<string, {
  label: string
  color: string
  bgColor: string
}> = {
  ENFORCED: { label: "Enforced", color: "text-[#10b981]", bgColor: "bg-[#10b98120]" },
  DRIFT_DETECTED: { label: "Drift!", color: "text-[#ef4444]", bgColor: "bg-[#ef444420]" },
  ROLLED_BACK: { label: "Rolled Back", color: "text-[#f97316]", bgColor: "bg-[#f9731620]" },
  NONE: { label: "Not Enforced", color: "text-[var(--muted-foreground,#6b7280)]", bgColor: "bg-gray-100" },
}

const DRIFT_SEVERITY_CONFIG: Record<string, {
  label: string
  color: string
  bgColor: string
}> = {
  CRITICAL: { label: "Critical", color: "text-[#ef4444]", bgColor: "bg-[#ef444420]" },
  HIGH: { label: "High", color: "text-[#f97316]", bgColor: "bg-[#f9731620]" },
  MEDIUM: { label: "Medium", color: "text-[#f97316]", bgColor: "bg-[#f9731620]" },
  LOW: { label: "Low", color: "text-[#eab308]", bgColor: "bg-[#eab30820]" },
}

// --- Component ---

export function PermissionBoundaryPanel() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [tierSummary, setTierSummary] = useState<Record<string, number>>({})
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<string | null>(null)
  const [expandedRole, setExpandedRole] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [enforcing, setEnforcing] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState<string | null>(null)
  const [remediating, setRemediating] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [driftCount, setDriftCount] = useState(0)
  const [actionResult, setActionResult] = useState<{ role: string; type: string; message: string } | null>(null)

  // Count drifted roles
  useEffect(() => {
    const count = candidates.filter(c => c.drift_info !== null).length
    setDriftCount(count)
  }, [candidates])

  // Sync drift status
  const handleDriftSync = async () => {
    setSyncing(true)
    setActionResult(null)
    try {
      const res = await fetch("/api/proxy/boundary-drift/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_remediate: false }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Sync failed")
      const data = await res.json()
      setActionResult({
        role: "Drift Sync",
        type: data.drift_detected > 0 ? "warning" : "success",
        message: `Checked ${data.total_checked} roles. ${data.drift_detected} with drift detected.`,
      })
      // Refresh candidates to show updated drift status
      fetchCandidates()
    } catch (err: any) {
      setActionResult({ role: "Drift Sync", type: "error", message: err.message })
    } finally {
      setSyncing(false)
    }
  }

  // Remediate drift for a single role
  const handleRemediate = async (roleName: string) => {
    if (!confirm(`Reapply permission boundary to "${roleName}"? This will restore the enforced boundary.`)) {
      return
    }
    setRemediating(roleName)
    setActionResult(null)
    try {
      const res = await fetch(`/api/proxy/boundary-drift/remediate/${encodeURIComponent(roleName)}`, {
        method: "POST",
      })
      if (!res.ok) throw new Error((await res.json()).error || "Remediation failed")
      setActionResult({
        role: roleName,
        type: "success",
        message: "Boundary reapplied successfully. Drift remediated.",
      })
      fetchCandidates()
    } catch (err: any) {
      setActionResult({ role: roleName, type: "error", message: err.message })
    } finally {
      setRemediating(null)
    }
  }

  // Fetch candidates
  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (selectedTier) params.set("tier", selectedTier)
      const url = `/api/proxy/permission-boundary/candidates${params.toString() ? `?${params}` : ""}`
      const res = await fetch(url)
      if (!res.ok) throw new Error((await res.json()).error || "Failed to fetch")
      const data: CandidatesResponse = await res.json()
      setCandidates(data.candidates)
      setTierSummary(data.tier_summary)
      setTotalCount(data.total_count)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [selectedTier])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  // Preview boundary for a role
  const handlePreview = async (roleName: string) => {
    if (expandedRole === roleName && previewData?.role_name === roleName) {
      setExpandedRole(null)
      return
    }
    setExpandedRole(roleName)
    setPreviewLoading(true)
    setPreviewData(null)
    try {
      const res = await fetch(`/api/proxy/permission-boundary/preview/${encodeURIComponent(roleName)}`)
      if (!res.ok) throw new Error((await res.json()).error || "Preview failed")
      setPreviewData(await res.json())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Enforce boundary
  const handleEnforce = async (roleName: string, dryRun: boolean = false) => {
    if (!dryRun && !confirm(`Apply permission boundary to "${roleName}"? This will restrict the role to only observed permissions. Auto-rollback in 24 hours if errors detected.`)) {
      return
    }
    setEnforcing(roleName)
    setActionResult(null)
    try {
      const res = await fetch("/api/proxy/permission-boundary/enforce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_name: roleName, dry_run: dryRun, rollback_hours: 24 }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Enforcement failed")
      const data = await res.json()
      setActionResult({
        role: roleName,
        type: dryRun ? "dry_run" : "enforced",
        message: dryRun
          ? "Dry run complete. Review the boundary policy."
          : `Boundary applied. Checkpoint: ${data.checkpoint_id}. Auto-rollback in 24h if errors detected.`,
      })
      if (!dryRun) fetchCandidates()
    } catch (err: any) {
      setActionResult({ role: roleName, type: "error", message: err.message })
    } finally {
      setEnforcing(null)
    }
  }

  // Rollback boundary
  const handleRollback = async (roleName: string) => {
    if (!confirm(`Remove permission boundary from "${roleName}"? This will restore the original permissions.`)) {
      return
    }
    setRollingBack(roleName)
    setActionResult(null)
    try {
      const res = await fetch("/api/proxy/permission-boundary/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_name: roleName, reason: "manual" }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Rollback failed")
      setActionResult({ role: roleName, type: "rolled_back", message: "Boundary removed. Original permissions restored." })
      fetchCandidates()
    } catch (err: any) {
      setActionResult({ role: roleName, type: "error", message: err.message })
    } finally {
      setRollingBack(null)
    }
  }

  // --- Render ---

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground,#111827)] flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#8b5cf6]" />
            Permission Boundary Enforcement
          </h2>
          <p className="text-sm text-[var(--muted-foreground,#6b7280)] mt-0.5">
            Safe enforcement via IAM permission boundaries — caps permissions without modifying shared roles
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Drift Sync Button */}
          <button
            onClick={handleDriftSync}
            disabled={syncing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border ${
              driftCount > 0
                ? "text-[#ef4444] bg-[#ef444410] border-[#ef444440] hover:bg-[#ef444420]"
                : "text-[var(--foreground,#374151)] bg-white border-[var(--border,#d1d5db)] hover:bg-gray-50"
            } disabled:opacity-50`}
            title="Check all enforced boundaries for drift (removal or modification)"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : driftCount > 0 ? `${driftCount} Drifted` : "Check Drift"}
          </button>

          {/* Refresh Button */}
          <button
            onClick={fetchCandidates}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--foreground,#374151)] bg-white border border-[var(--border,#d1d5db)] rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tier Summary Cards */}
      <div className="grid grid-cols-5 gap-2">
        {Object.entries(TIER_CONFIG).map(([tierKey, config]) => {
          const count = tierSummary[tierKey] || 0
          const isSelected = selectedTier === tierKey
          const Icon = config.icon
          return (
            <button
              key={tierKey}
              onClick={() => setSelectedTier(isSelected ? null : tierKey)}
              className={`p-3 rounded-lg border text-left transition-all ${
                isSelected
                  ? `${config.bgColor} ${config.borderColor} ring-2 ring-offset-1 ring-indigo-300`
                  : "bg-white border-[var(--border,#e5e7eb)] hover:border-[var(--border,#d1d5db)]"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={`h-4 w-4 ${config.color}`} />
                <span className={`text-xs font-medium ${config.color}`}>{config.shortLabel}</span>
              </div>
              <div className="text-xl font-bold text-[var(--foreground,#111827)] mt-1">{count}</div>
              <div className="text-[10px] text-[var(--muted-foreground,#6b7280)]">{config.label}</div>
            </button>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[#ef444410] border border-[#ef444440] rounded-lg text-sm text-[#ef4444]">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-[#ef4444] hover:text-[#ef4444]">
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Action Result */}
      {actionResult && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${
            actionResult.type === "error"
              ? "bg-[#ef444410] border-[#ef444440] text-[#ef4444]"
              : actionResult.type === "warning"
              ? "bg-[#f9731610] border-[#f9731640] text-[#f97316]"
              : actionResult.type === "dry_run"
              ? "bg-[#3b82f610] border-[#3b82f640] text-[#3b82f6]"
              : "bg-[#10b98110] border-[#10b98140] text-[#10b981]"
          }`}
        >
          {actionResult.type === "error" ? (
            <XCircle className="h-4 w-4 flex-shrink-0" />
          ) : actionResult.type === "warning" ? (
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          )}
          <span>
            <strong>{actionResult.role}:</strong> {actionResult.message}
          </span>
          <button onClick={() => setActionResult(null)} className="ml-auto opacity-60 hover:opacity-100">
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-[var(--muted-foreground,#6b7280)]">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading candidates...
        </div>
      )}

      {/* Candidates List */}
      {!loading && candidates.length === 0 && (
        <div className="text-center py-12 text-[var(--muted-foreground,#9ca3af)]">
          <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>No enforcement candidates found{selectedTier ? ` for tier "${TIER_CONFIG[selectedTier]?.label}"` : ""}.</p>
        </div>
      )}

      {!loading && candidates.length > 0 && (
        <div className="border border-[var(--border,#e5e7eb)] rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_100px_80px_80px_100px_120px_180px] gap-2 px-4 py-2.5 bg-gray-50 border-b border-[var(--border,#e5e7eb)] text-xs font-medium text-[var(--muted-foreground,#6b7280)] uppercase tracking-wider">
            <div>Role</div>
            <div className="text-center">Gap</div>
            <div className="text-center">Used</div>
            <div className="text-center">Unused</div>
            <div className="text-center">Confidence</div>
            <div className="text-center">Status</div>
            <div className="text-right">Actions</div>
          </div>

          {/* Rows */}
          {candidates.map((c) => {
            const tierCfg = TIER_CONFIG[c.enforcement_tier] || TIER_CONFIG.ALERT_ONLY
            const hasDrift = c.drift_info !== null
            const statusCfg = hasDrift
              ? STATUS_CONFIG.DRIFT_DETECTED
              : (STATUS_CONFIG[c.enforcement_status] || STATUS_CONFIG.NONE)
            const TierIcon = tierCfg.icon
            const isExpanded = expandedRole === c.role_name
            const isEnforcing = enforcing === c.role_name
            const isRollingBack = rollingBack === c.role_name
            const isRemediating = remediating === c.role_name

            return (
              <div key={c.role_name}>
                {/* Drift Warning Banner */}
                {hasDrift && (
                  <div className="px-4 py-2 bg-[#ef444410] border-b border-[#ef444440] flex items-center gap-2 text-sm">
                    <ShieldOff className="h-4 w-4 text-[#ef4444] flex-shrink-0" />
                    <span className="text-[#ef4444] font-medium">Drift Detected:</span>
                    <span className="text-[#ef4444]">{c.drift_info?.details}</span>
                    <button
                      onClick={() => handleRemediate(c.role_name)}
                      disabled={isRemediating}
                      className="ml-auto flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      {isRemediating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                      Remediate
                    </button>
                  </div>
                )}

                {/* Row */}
                <div className={`grid grid-cols-[1fr_100px_80px_80px_100px_120px_180px] gap-2 px-4 py-3 border-b border-[var(--border,#f3f4f6)] items-center hover:bg-gray-50/50 transition-colors ${hasDrift ? "bg-[#ef444410]/30" : ""}`}>
                  {/* Role Name */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {hasDrift ? (
                        <ShieldOff className="h-4 w-4 flex-shrink-0 text-[#ef4444]" />
                      ) : (
                        <TierIcon className={`h-4 w-4 flex-shrink-0 ${tierCfg.color}`} />
                      )}
                      <span className="text-sm font-medium text-[var(--foreground,#111827)] truncate">{c.role_name}</span>
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground,#9ca3af)] mt-0.5 truncate">
                      {c.resources_using_role} resource{c.resources_using_role !== 1 ? "s" : ""} using this role
                    </div>
                  </div>

                  {/* Gap */}
                  <div className="text-center">
                    <span className={`text-sm font-semibold ${c.gap_percentage >= 70 ? "text-[#ef4444]" : c.gap_percentage >= 40 ? "text-[#f97316]" : "text-[var(--foreground,#374151)]"}`}>
                      {c.gap_percentage.toFixed(0)}%
                    </span>
                  </div>

                  {/* Used */}
                  <div className="text-center text-sm text-[var(--muted-foreground,#4b5563)]">{c.used_count}</div>

                  {/* Unused */}
                  <div className="text-center text-sm font-medium text-[var(--foreground,#111827)]">{c.unused_count}</div>

                  {/* Confidence */}
                  <div className="text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tierCfg.bgColor} ${tierCfg.color}`}>
                      {c.confidence_score.toFixed(0)}%
                    </span>
                  </div>

                  {/* Status */}
                  <div className="text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusCfg.bgColor} ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => handlePreview(c.role_name)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--muted-foreground,#4b5563)] bg-white border border-[var(--border,#e5e7eb)] rounded hover:bg-gray-50"
                    >
                      <Eye className="h-3 w-3" />
                      {isExpanded ? "Hide" : "Preview"}
                    </button>

                    {/* Show Remediate button if drift detected */}
                    {hasDrift ? (
                      <button
                        onClick={() => handleRemediate(c.role_name)}
                        disabled={isRemediating}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-red-600 border border-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        {isRemediating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                        Fix
                      </button>
                    ) : c.enforcement_status === "ENFORCED" ? (
                      <button
                        onClick={() => handleRollback(c.role_name)}
                        disabled={isRollingBack}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#f97316] bg-[#f9731610] border border-[#f9731640] rounded hover:bg-[#f9731620] disabled:opacity-50"
                      >
                        {isRollingBack ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Rollback
                      </button>
                    ) : (
                      <button
                        onClick={() => handleEnforce(c.role_name)}
                        disabled={isEnforcing}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-[#8b5cf6] border border-indigo-600 rounded hover:bg-[#7c3aed] disabled:opacity-50"
                      >
                        {isEnforcing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        Enforce
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Preview */}
                {isExpanded && (
                  <div className="px-4 py-4 bg-gray-50/80 border-b border-[var(--border,#e5e7eb)]">
                    {previewLoading ? (
                      <div className="flex items-center text-[var(--muted-foreground,#6b7280)] text-sm">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading preview...
                      </div>
                    ) : previewData ? (
                      <div className="space-y-4">
                        {/* Summary Row */}
                        <div className="grid grid-cols-4 gap-4">
                          <div className="bg-white rounded-lg border border-[var(--border,#e5e7eb)] p-3">
                            <div className="text-[11px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wider">Total Permissions</div>
                            <div className="text-lg font-bold text-[var(--foreground,#111827)]">{previewData.current_policy_summary.total_permissions}</div>
                          </div>
                          <div className="bg-white rounded-lg border border-[#10b98140] p-3">
                            <div className="text-[11px] text-[#10b981] uppercase tracking-wider">Kept (Observed)</div>
                            <div className="text-lg font-bold text-[#10b981]">{previewData.permissions_kept_count}</div>
                          </div>
                          <div className="bg-white rounded-lg border border-[#ef444440] p-3">
                            <div className="text-[11px] text-[#ef4444] uppercase tracking-wider">Blocked (Unused)</div>
                            <div className="text-lg font-bold text-[#ef4444]">{previewData.permissions_removed_count}</div>
                          </div>
                          <div className="bg-white rounded-lg border border-[#8b5cf640] p-3">
                            <div className="text-[11px] text-[#8b5cf6] uppercase tracking-wider">Confidence</div>
                            <div className="text-lg font-bold text-[#7c3aed]">{previewData.confidence_score.toFixed(1)}%</div>
                          </div>
                        </div>

                        {/* Permissions Lists */}
                        <div className="grid grid-cols-2 gap-4">
                          {/* Kept */}
                          <div>
                            <h4 className="text-xs font-medium text-[#10b981] mb-1.5 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Permissions Kept ({previewData.permissions_kept.length})
                            </h4>
                            <div className="bg-white border border-[var(--border,#e5e7eb)] rounded-lg p-2 max-h-40 overflow-y-auto">
                              {previewData.permissions_kept.map((p: string) => (
                                <div key={p} className="text-[11px] font-mono text-[var(--foreground,#374151)] py-0.5 px-1 hover:bg-[#10b98110] rounded">
                                  {p}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Removed */}
                          <div>
                            <h4 className="text-xs font-medium text-[#ef4444] mb-1.5 flex items-center gap-1">
                              <XCircle className="h-3.5 w-3.5" />
                              Permissions Blocked ({previewData.permissions_removed.length})
                            </h4>
                            <div className="bg-white border border-[var(--border,#e5e7eb)] rounded-lg p-2 max-h-40 overflow-y-auto">
                              {previewData.permissions_removed.map((p: string) => (
                                <div key={p} className="text-[11px] font-mono text-[var(--foreground,#374151)] py-0.5 px-1 hover:bg-[#ef444410] rounded line-through opacity-70">
                                  {p}
                                </div>
                              ))}
                              {previewData.permissions_removed_count > previewData.permissions_removed.length && (
                                <div className="text-[11px] text-[var(--muted-foreground,#9ca3af)] py-0.5 px-1 italic">
                                  ... and {previewData.permissions_removed_count - previewData.permissions_removed.length} more
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Boundary Policy JSON */}
                        <div>
                          <h4 className="text-xs font-medium text-[var(--muted-foreground,#4b5563)] mb-1.5 flex items-center gap-1">
                            <Info className="h-3.5 w-3.5" />
                            Proposed Boundary Policy
                          </h4>
                          <pre className="bg-gray-900 text-green-400 text-[11px] font-mono p-3 rounded-lg overflow-x-auto max-h-48 overflow-y-auto">
                            {JSON.stringify(previewData.proposed_boundary_policy, null, 2)}
                          </pre>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handleEnforce(c.role_name, true)}
                            disabled={enforcing === c.role_name}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#3b82f6] bg-[#3b82f610] border border-[#3b82f640] rounded-md hover:bg-[#3b82f620] disabled:opacity-50"
                          >
                            {enforcing === c.role_name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                            Dry Run
                          </button>
                          {c.enforcement_status !== "ENFORCED" && (
                            <button
                              onClick={() => handleEnforce(c.role_name)}
                              disabled={enforcing === c.role_name}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#8b5cf6] border border-indigo-600 rounded-md hover:bg-[#7c3aed] disabled:opacity-50"
                            >
                              {enforcing === c.role_name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                              Apply Boundary
                            </button>
                          )}
                          {c.enforcement_status === "ENFORCED" && (
                            <button
                              onClick={() => handleRollback(c.role_name)}
                              disabled={rollingBack === c.role_name}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#f97316] bg-[#f9731610] border border-[#f9731640] rounded-md hover:bg-[#f9731620] disabled:opacity-50"
                            >
                              {rollingBack === c.role_name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                              Rollback
                            </button>
                          )}
                          <div className="ml-auto flex items-center gap-1 text-[11px] text-[var(--muted-foreground,#9ca3af)]">
                            <Activity className="h-3 w-3" />
                            Blast radius: {previewData.blast_radius.resources_using_role} resource{previewData.blast_radius.resources_using_role !== 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-[var(--muted-foreground,#9ca3af)]">No preview data available.</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between text-xs text-[var(--muted-foreground,#9ca3af)] px-1">
          <span>
            Showing {candidates.length} of {totalCount} candidates
          </span>
          <span>
            Permission boundaries cap maximum permissions without modifying the role itself
          </span>
        </div>
      )}
    </div>
  )
}
