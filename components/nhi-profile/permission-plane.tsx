"use client"

import { useState, useEffect } from "react"
import { riskLabel } from "@/lib/utils"
import {
  Key, Shield, Eye, PenTool, Trash2, Lock, AlertTriangle,
  CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronRight, Target, Wrench,
} from "lucide-react"
import { IAMPermissionAnalysisModal } from "../iam-permission-analysis-modal"

interface PermissionPlaneProps {
  identityName: string
  detail: any
  identity: any
  onRemediate: (result: any) => void
}

const DAMAGE_ICONS: Record<string, any> = { DELETE: Trash2, ADMIN: Shield, ENCRYPT: Lock, WRITE: PenTool, READ: Eye }
const DAMAGE_COLORS: Record<string, string> = { DELETE: "#ef4444", ADMIN: "#f97316", ENCRYPT: "#a855f7", WRITE: "#eab308", READ: "#3b82f6" }

export function PermissionPlane({ identityName, detail, identity, onRemediate }: PermissionPlaneProps) {
  const [expanded, setExpanded] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const permAnalysis = detail?.permission_analysis
  const damage = detail?.damage_classification

  // Parse allowed actions safely
  const ensureStringArray = (val: any): string[] => {
    if (!val) return []
    if (Array.isArray(val)) return val.filter((s: any) => typeof s === 'string' && s.length > 2 && s.includes(':'))
    return []
  }

  const allowedActions = ensureStringArray(permAnalysis?.allowed_actions)
  const usedActions = new Set(ensureStringArray(permAnalysis?.used_actions))
  const totalCount = permAnalysis?.allowed_count || allowedActions.length
  const unusedCount = permAnalysis?.unused_count || (totalCount - usedActions.size)
  const usedCount = permAnalysis?.used_count || usedActions.size
  const managedPolicyExpanded = totalCount > allowedActions.length ? totalCount - allowedActions.length : 0

  return (
    <>
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
              <span style={{ color: riskLabel(damage.damage_score).color }}>
                Damage: {riskLabel(damage.damage_score).label}
              </span>
            )}
            <span style={{ color: "var(--text-secondary, #64748b)" }}>{usedCount} used / {totalCount} total</span>
            {unusedCount > 0 && (
              <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "#ef444420", color: "#ef4444" }}>{unusedCount} unused</span>
            )}
          </div>
        </button>

        {expanded && (
          <div className="px-6 py-5 space-y-4" style={{ background: "var(--bg-surface, #ffffff)" }}>
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
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#22c55e15", color: "#22c55e" }}>
                            <CheckCircle className="w-3 h-3" /> Used
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#ef444415", color: "#ef4444" }}>
                            <XCircle className="w-3 h-3" /> Unused
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {managedPolicyExpanded > 0 && (
                    <div className="py-2 px-3 rounded text-xs" style={{ background: "#8b5cf608", color: "#8b5cf6" }}>
                      + {managedPolicyExpanded} more from managed policy ({totalCount} total)
                    </div>
                  )}
                  {allowedActions.length === 0 && <p className="text-xs py-2" style={{ color: "var(--text-muted, #94a3b8)" }}>No permission data available</p>}
                </div>
              </div>

              {/* Observed */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: "var(--text-muted, #94a3b8)" }}>
                  <Eye className="w-3.5 h-3.5" /> Observed (CloudTrail 90d)
                </h4>
                {damage && (
                  <div className="rounded-lg p-3 mb-3 border" style={{ background: "var(--bg-secondary, #f8fafc)", borderColor: "var(--border, #e2e8f0)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--text-secondary, #64748b)" }}><Target className="w-3 h-3" /> Damage Potential</span>
                      <span className="text-lg font-bold" style={{ color: riskLabel(damage.damage_score).color }}>{riskLabel(damage.damage_score).label}</span>
                    </div>
                    <div className="space-y-1.5">
                      {Object.entries(damage.details || {}).map(([cat, actions]) => {
                        const actList = actions as string[]
                        if (!actList || actList.length === 0) return null
                        const DIcon = DAMAGE_ICONS[cat] || AlertTriangle
                        const color = DAMAGE_COLORS[cat] || "#64748b"
                        return (
                          <div key={cat} className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><DIcon className="w-3.5 h-3.5" style={{ color }} /><span className="text-xs" style={{ color }}>{cat}</span></div>
                            <span className="text-xs font-bold" style={{ color }}>{actList.length} unused</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
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

            {/* Remediate Button — opens existing IAM Permission Analysis Modal */}
            {unusedCount > 0 && (
              <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                <div className="text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>
                  <span className="font-medium" style={{ color: "#ef4444" }}>{unusedCount}</span> unused permission(s) can be removed
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 flex items-center gap-2"
                  style={{ background: "#8b5cf6" }}
                >
                  <Wrench className="w-4 h-4" /> Remediate Permissions
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Existing IAM Permission Analysis Modal */}
      {showModal && (
        <IAMPermissionAnalysisModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          roleName={identityName}
          systemName={identity?.system_name || detail?.basic_info?.system_name || ''}
          onSuccess={() => onRemediate({ plane: 'permission' })}
          onRemediationSuccess={() => onRemediate({ plane: 'permission' })}
        />
      )}
    </>
  )
}
