"use client"

import { X, Globe, Shield, ShieldAlert, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import { SeverityBadge } from "./severity-badge"
import type { PathNodeDetail, IdentityAttackPath } from "./types"

interface NodeDetailPanelProps {
  node: PathNodeDetail
  path: IdentityAttackPath
  onClose: () => void
}

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  entry: { label: "Entry Point", color: "#ef4444" },
  identity: { label: "Identity", color: "#ec4899" },
  network_control: { label: "Network Control", color: "#f59e0b" },
  crown_jewel: { label: "Crown Jewel", color: "#8b5cf6" },
}

function getNodeTypeIcon(type: string) {
  const t = type?.toLowerCase() || ""
  if (t.includes("s3")) return "📦"
  if (t.includes("rds")) return "🗄️"
  if (t.includes("dynamo")) return "📊"
  if (t.includes("iam") || t.includes("role")) return "🔑"
  if (t.includes("ec2") || t.includes("instance")) return "🖥️"
  if (t.includes("lambda")) return "λ"
  if (t.includes("security") || t.includes("sg")) return "🛡️"
  if (t.includes("nacl")) return "🚧"
  if (t.includes("secret")) return "🔐"
  if (t.includes("kms")) return "🗝️"
  if (t.includes("external") || t.includes("internet")) return "🌍"
  return "•"
}

export function NodeDetailPanel({ node, path, onClose }: NodeDetailPanelProps) {
  const tierInfo = TIER_LABELS[node.tier] || TIER_LABELS.identity
  const alert = node.internet_exposure_alert
  const remediation = node.remediation

  return (
    <div
      className="w-[340px] min-w-[340px] border-l overflow-y-auto"
      style={{ background: "rgba(15, 23, 42, 0.97)", borderColor: "rgba(148, 163, 184, 0.15)" }}
    >
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: "rgba(148, 163, 184, 0.15)" }}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <span className="text-xl">{getNodeTypeIcon(node.type)}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{node.name || node.id}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{node.type}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${tierInfo.color}20`, color: tierInfo.color, border: `1px solid ${tierInfo.color}40` }}
          >
            {tierInfo.label}
          </span>
          {node.is_internet_exposed && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/40">
              Internet Exposed
            </span>
          )}
        </div>
      </div>

      {/* Internet Exposure Alert */}
      {alert && alert.is_exposed && (
        <div className="mx-4 mt-4 p-3 rounded-lg" style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-red-400" />
            <span className="text-xs font-bold text-red-400">Internet Exposure Alert</span>
          </div>
          {alert.message && (
            <p className="text-xs text-red-300/80 mb-3">{alert.message}</p>
          )}

          {/* Port info */}
          <div className="space-y-2">
            {alert.open_ports?.length > 0 && (
              <div className="flex items-start gap-2">
                <XCircle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-300 font-medium">Open Ports</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {alert.open_ports.map((p) => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {alert.observed_ports?.length > 0 && (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-300 font-medium">Observed Traffic Ports</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {alert.observed_ports.map((p) => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {alert.recommended_ports?.length > 0 && (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-300 font-medium">Recommended Ports</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {alert.recommended_ports.map((p) => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 font-mono">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Control checklist */}
          <div className="mt-3 pt-2 border-t border-red-500/20">
            <span className="text-[10px] text-slate-300 font-medium">Security Controls</span>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {Object.entries(alert.controls).map(([key, active]) => (
                <div key={key} className="flex items-center gap-1">
                  {active
                    ? <CheckCircle2 className="w-3 h-3 text-green-400" />
                    : <XCircle className="w-3 h-3 text-red-400" />
                  }
                  <span className={`text-[10px] ${active ? "text-green-300" : "text-red-300"}`}>
                    {key === "security_group" ? "SG" : key.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Severity Contribution */}
      <div className="p-4 border-b" style={{ borderColor: "rgba(148, 163, 184, 0.1)" }}>
        <h4 className="text-xs font-semibold text-slate-300 mb-3">Path Severity</h4>
        <div className="flex items-center gap-2 mb-3">
          <SeverityBadge severity={path.severity?.severity || "LOW"} score={path.severity?.overall_score} size="md" />
          <span className="text-[10px] text-slate-400">{path.evidence_type} evidence</span>
        </div>
        <div className="space-y-2">
          {(["impact", "internet_exposure", "permission_breadth", "data_sensitivity", "identity_chain", "network_controls"] as const).map((key) => {
            const score = (path.severity?.[key] as number) ?? 0
            const weight = path.severity?.weights?.[key] ?? 0
            const weighted = (score * weight) / 100
            return (
            <div key={key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-slate-400 capitalize">{key.replace(/_/g, " ")}</span>
                <span className="text-[10px] text-slate-300 font-mono">{weighted.toFixed(1)}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(148, 163, 184, 0.1)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(score, 100)}%`,
                    background: score >= 75 ? "#ef4444" : score >= 50 ? "#f97316" : score >= 25 ? "#eab308" : "#22c55e",
                  }}
                />
              </div>
            </div>
            )
          })}
        </div>
      </div>

      {/* Remediation */}
      {remediation && remediation.actions && remediation.actions.length > 0 && (
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-semibold text-slate-300">Remediation</h4>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: remediation.priority === "critical" ? "rgba(239,68,68,0.15)" : remediation.priority === "high" ? "rgba(249,115,22,0.15)" : "rgba(234,179,8,0.15)",
                color: remediation.priority === "critical" ? "#ef4444" : remediation.priority === "high" ? "#f97316" : "#eab308",
              }}
            >
              {remediation.priority}
            </span>
          </div>
          <div className="space-y-2">
            {remediation.actions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded" style={{ background: "rgba(148, 163, 184, 0.05)" }}>
                <ShieldAlert className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-slate-300">{action}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-wider">
            Service: {remediation.service}
          </p>
        </div>
      )}

      {/* Node stats */}
      <div className="p-4 border-t" style={{ borderColor: "rgba(148, 163, 184, 0.1)" }}>
        <div className="grid grid-cols-2 gap-3">
          {node.lp_score !== null && node.lp_score !== undefined && (
            <div>
              <p className="text-[10px] text-slate-400">LP Score</p>
              <p className="text-sm font-bold text-white">{node.lp_score}%</p>
            </div>
          )}
          {node.gap_count > 0 && (
            <div>
              <p className="text-[10px] text-slate-400">Permission Gaps</p>
              <p className="text-sm font-bold text-amber-400">{node.gap_count}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
