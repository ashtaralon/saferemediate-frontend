"use client"

import { useState } from "react"
import {
  X, Globe, Shield, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  Key, Lock, Unlock, Server, Database, HardDrive, Zap, ArrowRightLeft,
  Crown, Play, Loader2, RotateCcw, Eye,
} from "lucide-react"
import { SeverityBadge } from "./severity-badge"
import type {
  PathNodeDetail, IdentityAttackPath,
  RemediationStatus, RemediationPreview, RemediationResult,
  SeverityFactor, RiskReductionAction,
} from "./types"
import { FACTOR_LABELS } from "./types"

interface NodeDetailPanelProps {
  node: PathNodeDetail
  path: IdentityAttackPath
  onClose: () => void
  onRemediate?: (nodeId: string, dryRun: boolean) => Promise<any>
  remediationStatus?: RemediationStatus
  remediationPreview?: RemediationPreview | null
  remediationResult?: RemediationResult | null
}

// ── Helpers ─────────────────────────────────────────────────────────
const TIER_LABELS: Record<string, { label: string; color: string }> = {
  entry: { label: "Entry Point", color: "#3b82f6" },
  identity: { label: "Identity", color: "#ec4899" },
  network_control: { label: "Network Control", color: "#f59e0b" },
  crown_jewel: { label: "Crown Jewel", color: "#8b5cf6" },
}

function getNodeTypeIcon(type: string): React.ReactNode {
  const t = (type ?? "").toLowerCase()
  if (t.includes("s3")) return <HardDrive className="w-5 h-5 text-emerald-400" />
  if (t.includes("dynamo")) return <Database className="w-5 h-5 text-amber-400" />
  if (t.includes("rds") || t.includes("database")) return <Database className="w-5 h-5 text-emerald-400" />
  if (t.includes("lambda")) return <Zap className="w-5 h-5 text-yellow-400" />
  if (t.includes("iam") || t.includes("role")) return <Key className="w-5 h-5 text-pink-400" />
  if (t.includes("security") || t.includes("sg")) return <Shield className="w-5 h-5 text-orange-400" />
  if (t.includes("nacl")) return <Lock className="w-5 h-5 text-cyan-400" />
  if (t.includes("ec2") || t.includes("instance") || t.includes("compute")) return <Server className="w-5 h-5 text-blue-400" />
  if (t.includes("secret") || t.includes("kms")) return <Key className="w-5 h-5 text-purple-400" />
  if (t.includes("external") || t.includes("internet")) return <Globe className="w-5 h-5 text-red-400" />
  return <Server className="w-5 h-5 text-slate-400" />
}

function formatBytes(bytes: number | undefined | null): string {
  if (!bytes) return "0 B"
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`
  return `${bytes} B`
}

function formatNumber(n: number | undefined | null): string {
  if (!n) return "0"
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return `${n}`
}

// ── Section wrapper ─────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-4 border-b" style={{ borderColor: "rgba(148, 163, 184, 0.1)" }}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="text-xs font-semibold text-slate-300">{title}</h4>
      </div>
      {children}
    </div>
  )
}

// ── Factor → color mapping for the weight/dominant-factor chip ──────
const FACTOR_COLORS: Record<SeverityFactor, string> = {
  impact: "#f87171",              // red
  internet_exposure: "#fb923c",   // orange
  permission_breadth: "#f59e0b",  // amber (weight 18)
  data_sensitivity: "#a78bfa",    // violet
  identity_chain: "#ec4899",      // pink
  network_controls: "#60a5fa",    // blue
}

// ── Per-action row — shows weight-correct impact + dominant factor chip
// (expand to see per-factor delta breakdown)
function RiskActionRow({ action }: { action: RiskReductionAction }) {
  const [expanded, setExpanded] = useState(false)
  const impactText = `${action.impact > 0 ? "+" : ""}${action.impact}`
  const dominant = action.dominant_factor
  const dominantColor = dominant ? FACTOR_COLORS[dominant] : "#94a3b8"
  const factorDeltas = Object.entries(action.delta_by_factor ?? {})
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .sort(([, a], [, b]) => (a as number) - (b as number))
  const hasDetail = factorDeltas.length > 0

  return (
    <div className="p-2 rounded bg-slate-800/40 border border-slate-700/40">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => hasDetail && setExpanded(!expanded)}
          className={`flex-1 min-w-0 text-left ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
          title={hasDetail ? "Click to see per-factor breakdown" : ""}
        >
          <p className="text-[10px] text-slate-300 break-words">{action.action}</p>
          {dominant ? (
            <span
              className="inline-block mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: `${dominantColor}22`,
                color: dominantColor,
                border: `1px solid ${dominantColor}44`,
              }}
            >
              reduces {FACTOR_LABELS[dominant]}
              {action.weights?.[dominant] != null ? ` (weight ${action.weights[dominant]})` : ""}
            </span>
          ) : null}
        </button>
        <span className="text-[11px] font-bold text-emerald-400 ml-2 font-mono">{impactText}</span>
      </div>

      {expanded && hasDetail && (
        <div className="mt-2 pt-2 border-t border-slate-700/40 space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Per-factor delta</p>
          {factorDeltas.map(([factor, delta]) => {
            const f = factor as SeverityFactor
            const color = FACTOR_COLORS[f] ?? "#94a3b8"
            return (
              <div key={factor} className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  <span className="text-slate-300">{FACTOR_LABELS[f] ?? factor}</span>
                </span>
                <span className="font-mono text-emerald-400">
                  {(delta as number) > 0 ? "+" : ""}{delta}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Bar chart helper ────────────────────────────────────────────────
function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-slate-400">{label}</span>
        <span className="text-[10px] text-slate-300 font-mono">{value}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(148, 163, 184, 0.1)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Main Panel ──────────────────────────────────────────────────────
export function NodeDetailPanel({
  node, path, onClose,
  onRemediate,
  remediationStatus = "idle",
  remediationPreview = null,
  remediationResult = null,
}: NodeDetailPanelProps) {
  const tierInfo = TIER_LABELS[node.tier] ?? TIER_LABELS.identity
  const alert = node.internet_exposure_alert
  const remediation = node.remediation
  const permissions = node.permissions
  const policyDetails = node.policy_details
  const rules = node.rules
  const accessSummary = node.access_summary
  const encryption = node.encryption
  const trafficSummary = node.traffic_summary
  const recommendations = node.recommendations ?? []
  const riskReduction = path.risk_reduction

  const nodeType = (node.type ?? "").toLowerCase()
  const isIAM = nodeType.includes("iam") || nodeType.includes("role") || node.tier === "identity"
  const isNetwork = nodeType.includes("security") || nodeType.includes("sg") || nodeType.includes("nacl") || node.tier === "network_control"
  const isCrownJewel = node.tier === "crown_jewel"

  return (
    <div
      className="w-[380px] min-w-[380px] border-l overflow-y-auto"
      style={{ background: "rgba(15, 23, 42, 0.97)", borderColor: "rgba(148, 163, 184, 0.15)" }}
    >
      {/* ── Header ── */}
      <div className="p-4 border-b" style={{ borderColor: "rgba(148, 163, 184, 0.15)" }}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {getNodeTypeIcon(node.type)}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white break-words">{node.name ?? node.id}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{node.type}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${tierInfo.color}20`, color: tierInfo.color, border: `1px solid ${tierInfo.color}40` }}
          >
            {tierInfo.label}
          </span>
          {node.is_internet_exposed && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/40 flex items-center gap-1">
              <Globe className="w-3 h-3" />
              Internet Exposed
            </span>
          )}
          {node.data_classification && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/40 uppercase">
              {node.data_classification}
            </span>
          )}
        </div>
      </div>

      {/* ── Risk Summary ── */}
      <Section title="Path Severity" icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}>
        <div className="flex items-center gap-2 mb-3">
          <SeverityBadge severity={path.severity?.severity ?? "LOW"} score={path.severity?.overall_score} size="md" />
          <span className="text-[10px] text-slate-400">{path.evidence_type ?? "configured"} evidence</span>
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
      </Section>

      {/* ── Internet Exposure Alert ── */}
      {alert?.is_exposed && (
        <div className="mx-4 mt-4 mb-2 p-3 rounded-lg" style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-red-400" />
            <span className="text-xs font-bold text-red-400">Internet Exposure Alert</span>
          </div>
          {alert.message && <p className="text-xs text-red-300/80 mb-3">{alert.message}</p>}

          <div className="space-y-2">
            {(alert.open_ports?.length ?? 0) > 0 && (
              <div className="flex items-start gap-2">
                <XCircle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-300 font-medium">Open Ports</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {alert.open_ports?.map((p) => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {(alert.observed_ports?.length ?? 0) > 0 && (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-300 font-medium">Observed Traffic Ports</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {alert.observed_ports?.map((p) => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {(alert.recommended_ports?.length ?? 0) > 0 && (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-300 font-medium">Recommended Ports</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {alert.recommended_ports?.map((p) => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 font-mono">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Control checklist */}
          {alert.controls && (
            <div className="mt-3 pt-2 border-t border-red-500/20">
              <span className="text-[10px] text-slate-300 font-medium">Security Controls</span>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {Object.entries(alert.controls ?? {}).map(([key, active]) => (
                  <div key={key} className="flex items-center gap-1">
                    {active ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                    <span className={`text-[10px] ${active ? "text-green-300" : "text-red-300"}`}>
                      {key === "security_group" ? "SG" : key === "private_subnet" ? "Private Subnet" : key.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Permissions (IAM nodes) ── */}
      {isIAM && permissions && (
        <Section title="Permissions" icon={<Key className="w-3.5 h-3.5 text-pink-400" />}>
          {/* Used vs unused bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400">Permission Usage</span>
              <span className="text-[10px] text-slate-300 font-mono">
                {permissions.used ?? 0} / {permissions.total ?? 0}
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden flex" style={{ background: "rgba(148, 163, 184, 0.1)" }}>
              <div
                className="h-full rounded-l-full bg-emerald-500/70"
                style={{ width: `${permissions.total ? ((permissions.used ?? 0) / permissions.total) * 100 : 0}%` }}
              />
              <div
                className="h-full bg-amber-500/50"
                style={{ width: `${permissions.total ? ((permissions.unused ?? 0) / permissions.total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500/70" />
                <span className="text-[9px] text-slate-400">Used ({permissions.used ?? 0})</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                <span className="text-[9px] text-slate-400">Unused ({permissions.unused ?? 0})</span>
              </div>
            </div>
          </div>

          {/* High-risk permissions */}
          {(permissions.high_risk?.length ?? 0) > 0 && (
            <div className="mb-3">
              <span className="text-[10px] text-red-400 font-medium">High-Risk Permissions</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {permissions.high_risk?.map((perm) => (
                  <span key={perm} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 font-mono">
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Policy details */}
          {policyDetails && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Inline Policies</span>
                <span className="text-[10px] text-slate-300 font-mono">{policyDetails.inline_policies ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Managed Policies</span>
                <span className="text-[10px] text-slate-300 font-mono">{policyDetails.managed_policies ?? 0}</span>
              </div>
              {(policyDetails.wildcards?.length ?? 0) > 0 && (
                <div>
                  <span className="text-[10px] text-red-400 font-medium">Wildcard Actions</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {policyDetails.wildcards?.map((w) => (
                      <span key={w} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-mono font-bold">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recommendation */}
          {(permissions.unused ?? 0) > 0 && (
            <div className="mt-3 p-2 rounded bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                <span className="text-[10px] text-amber-300">
                  Remove {permissions.unused} unused permissions to reduce attack surface
                </span>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── Network Rules (SG/NACL nodes) ── */}
      {isNetwork && (
        <Section title="Network Rules" icon={<Shield className="w-3.5 h-3.5 text-orange-400" />}>
          {rules && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="p-2 rounded bg-slate-800/50">
                <p className="text-[10px] text-slate-400">Inbound Rules</p>
                <p className="text-sm font-bold text-white">{rules.inbound_count ?? 0}</p>
              </div>
              <div className="p-2 rounded bg-slate-800/50">
                <p className="text-[10px] text-slate-400">Outbound Rules</p>
                <p className="text-sm font-bold text-white">{rules.outbound_count ?? 0}</p>
              </div>
            </div>
          )}

          {rules?.open_to_internet && (
            <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[10px] text-red-400 font-medium">Open to Internet (0.0.0.0/0)</span>
            </div>
          )}

          {/* Open ports */}
          {(node.open_ports?.length ?? 0) > 0 && (
            <div className="mb-3">
              <span className="text-[10px] text-slate-300 font-medium">Open Ports</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {node.open_ports?.map((p) => {
                  const isUnused = node.unused_ports?.includes(p)
                  return (
                    <span
                      key={p}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        isUnused
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-slate-700/50 text-slate-300"
                      }`}
                    >
                      {p}
                      {isUnused && <span className="text-[8px] ml-1 opacity-70">unused</span>}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Unused port recommendations */}
          {(node.unused_ports?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              {node.unused_ports?.map((p) => (
                <div key={p} className="p-2 rounded bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span className="text-[10px] text-amber-300">Close port {p} - no traffic observed in 90 days</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Data Access (Crown Jewel nodes) ── */}
      {isCrownJewel && (
        <Section title="Data Access" icon={<Database className="w-3.5 h-3.5 text-purple-400" />}>
          {accessSummary && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="p-2 rounded bg-slate-800/50 text-center">
                <p className="text-[10px] text-slate-400">Accessors</p>
                <p className="text-sm font-bold text-white">{formatNumber(accessSummary.total_accessors)}</p>
              </div>
              <div className="p-2 rounded bg-slate-800/50 text-center">
                <p className="text-[10px] text-slate-400">API Calls</p>
                <p className="text-sm font-bold text-white">{formatNumber(accessSummary.api_calls)}</p>
              </div>
              <div className="p-2 rounded bg-slate-800/50 text-center">
                <p className="text-[10px] text-slate-400">Data Volume</p>
                <p className="text-sm font-bold text-white">{formatBytes(accessSummary.data_volume_bytes)}</p>
              </div>
            </div>
          )}

          {/* Encryption status */}
          {encryption && (
            <div className="mb-3">
              <span className="text-[10px] text-slate-300 font-medium mb-1.5 block">Encryption</span>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {encryption.at_rest
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400" />
                  }
                  <span className={`text-[10px] ${encryption.at_rest ? "text-green-300" : "text-red-300"}`}>
                    Encryption at Rest
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {encryption.in_transit
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400" />
                  }
                  <span className={`text-[10px] ${encryption.in_transit ? "text-green-300" : "text-red-300"}`}>
                    Encryption in Transit
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Classification */}
          {node.data_classification && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-slate-400">Classification:</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/40 uppercase">
                {node.data_classification}
              </span>
            </div>
          )}
        </Section>
      )}

      {/* ── Traffic Summary (compute/general) ── */}
      {trafficSummary && !isCrownJewel && (
        <Section title="Traffic Summary" icon={<ArrowRightLeft className="w-3.5 h-3.5 text-blue-400" />}>
          <div className="space-y-2">
            <MiniBar
              label="Inbound"
              value={trafficSummary.inbound_bytes ?? 0}
              max={Math.max(trafficSummary.inbound_bytes ?? 0, trafficSummary.outbound_bytes ?? 0, 1)}
              color="#3b82f6"
            />
            <MiniBar
              label="Outbound"
              value={trafficSummary.outbound_bytes ?? 0}
              max={Math.max(trafficSummary.inbound_bytes ?? 0, trafficSummary.outbound_bytes ?? 0, 1)}
              color="#8b5cf6"
            />
            {trafficSummary.api_calls != null && trafficSummary.api_calls > 0 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-400">API Calls</span>
                <span className="text-[10px] text-slate-300 font-mono">{formatNumber(trafficSummary.api_calls)}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Remediation Actions ── */}
      {((remediation?.actions?.length ?? 0) > 0 || recommendations.length > 0) && (
        <Section title="Remediation Actions" icon={<ShieldAlert className="w-3.5 h-3.5 text-blue-400" />}>
          {remediation && (
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  background:
                    remediation.priority === "critical" ? "rgba(239,68,68,0.15)" :
                    remediation.priority === "high" ? "rgba(249,115,22,0.15)" :
                    "rgba(234,179,8,0.15)",
                  color:
                    remediation.priority === "critical" ? "#ef4444" :
                    remediation.priority === "high" ? "#f97316" :
                    "#eab308",
                }}
              >
                {remediation.priority} priority
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">{remediation.service}</span>
            </div>
          )}

          <div className="space-y-2">
            {remediation?.actions?.map((action, i) => (
              <div key={`rem-${i}`} className="flex items-start gap-2 p-2 rounded bg-slate-800/40 border border-slate-700/40">
                <ShieldAlert className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-slate-300">{action}</span>
              </div>
            ))}
            {recommendations.map((rec, i) => (
              <div key={`rec-${i}`} className="flex items-start gap-2 p-2 rounded bg-slate-800/40 border border-slate-700/40">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-slate-300">{rec}</span>
              </div>
            ))}
          </div>

          {/* ── Execute Remediation Button ── */}
          {onRemediate && (
            <div className="mt-4 pt-3 border-t" style={{ borderColor: "rgba(148, 163, 184, 0.1)" }}>
              {remediationStatus === "idle" && (
                <button
                  onClick={() => onRemediate(node.id, true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 hover:border-blue-500/50"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview Remediation
                </button>
              )}

              {remediationStatus === "previewing" && (
                <div className="flex items-center justify-center gap-2 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <span className="text-xs text-slate-400">Analyzing...</span>
                </div>
              )}

              {remediationStatus === "confirming" && remediationPreview && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-semibold text-amber-400">Remediation Preview</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mb-2">{remediationPreview.preview_message}</p>
                    {(remediationPreview.permissions_to_remove?.length ?? 0) > 0 && (
                      <div className="mt-2">
                        <span className="text-[10px] text-slate-400">Permissions to remove:</span>
                        <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                          {remediationPreview.permissions_to_remove?.slice(0, 20).map((p) => (
                            <span key={p} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-mono">{p}</span>
                          ))}
                          {(remediationPreview.permissions_to_remove?.length ?? 0) > 20 && (
                            <span className="text-[9px] text-slate-500">+{(remediationPreview.permissions_to_remove?.length ?? 0) - 20} more</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onRemediate(node.id, false)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-red-600/80 text-white hover:bg-red-600 transition-all"
                    >
                      <Play className="w-3 h-3" />
                      Execute
                    </button>
                    <button
                      onClick={() => onRemediate(node.id, true)}
                      className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {remediationStatus === "executing" && (
                <div className="flex items-center justify-center gap-2 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span className="text-xs text-amber-300">Executing remediation...</span>
                </div>
              )}

              {remediationStatus === "success" && remediationResult && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400">Remediation Complete</span>
                  </div>
                  <p className="text-[11px] text-slate-300">{remediationResult.message}</p>
                  {remediationResult.permissions_removed != null && (
                    <p className="text-[10px] text-emerald-300 mt-1">
                      {remediationResult.permissions_removed} permissions removed
                    </p>
                  )}
                  {remediationResult.rollback_available && (
                    <p className="text-[10px] text-slate-500 mt-1">Snapshot saved — rollback available</p>
                  )}
                </div>
              )}

              {remediationStatus === "error" && remediationResult && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs font-semibold text-red-400">
                      {remediationResult.blocked ? "Blocked by Safety Gate" : "Remediation Failed"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {remediationResult.block_reason ?? remediationResult.message}
                  </p>
                  <button
                    onClick={() => onRemediate(node.id, true)}
                    className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"
                  >
                    <RotateCcw className="w-3 h-3" /> Retry
                  </button>
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {/* ── Standalone Remediate (when no remediation/recommendations section) ── */}
      {onRemediate && !((remediation?.actions?.length ?? 0) > 0 || recommendations.length > 0) && (
        <Section title="Remediate" icon={<ShieldAlert className="w-3.5 h-3.5 text-blue-400" />}>
          {remediationStatus === "idle" && (
            <button
              onClick={() => onRemediate(node.id, true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 hover:border-blue-500/50"
            >
              <Eye className="w-3.5 h-3.5" />
              Preview Remediation
            </button>
          )}

          {remediationStatus === "previewing" && (
            <div className="flex items-center justify-center gap-2 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span className="text-xs text-slate-400">Analyzing...</span>
            </div>
          )}

          {remediationStatus === "confirming" && remediationPreview && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-400">Remediation Preview</span>
                </div>
                <p className="text-[11px] text-slate-300">{remediationPreview.preview_message}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRemediate(node.id, false)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-red-600/80 text-white hover:bg-red-600 transition-all"
                >
                  <Play className="w-3 h-3" />
                  Execute
                </button>
                <button
                  onClick={() => onRemediate(node.id, true)}
                  className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {remediationStatus === "executing" && (
            <div className="flex items-center justify-center gap-2 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span className="text-xs text-amber-300">Executing remediation...</span>
            </div>
          )}

          {remediationStatus === "success" && remediationResult && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400">Remediation Complete</span>
              </div>
              <p className="text-[11px] text-slate-300">{remediationResult.message}</p>
              {remediationResult.rollback_available && (
                <p className="text-[10px] text-slate-500 mt-1">Snapshot saved — rollback available</p>
              )}
            </div>
          )}

          {remediationStatus === "error" && remediationResult && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-semibold text-red-400">Failed</span>
              </div>
              <p className="text-[11px] text-slate-300">{remediationResult.message}</p>
              <button
                onClick={() => onRemediate(node.id, true)}
                className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"
              >
                <RotateCcw className="w-3 h-3" /> Retry
              </button>
            </div>
          )}
        </Section>
      )}

      {/* ── Risk Reduction ── */}
      {riskReduction && (
        <Section title="Risk Reduction" icon={<AlertTriangle className="w-3.5 h-3.5 text-emerald-400" />}>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400">Current Risk</span>
              <span className="text-sm font-bold text-red-400">{riskReduction.current_score}</span>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400">Achievable Risk</span>
              <span className="text-sm font-bold text-emerald-400">{riskReduction.achievable_score}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-slate-800 mt-2">
              <div className="relative h-full">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-red-500/50"
                  style={{ width: `${Math.min(riskReduction.current_score, 100)}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/70"
                  style={{ width: `${Math.min(riskReduction.achievable_score, 100)}%` }}
                />
              </div>
            </div>
            <p className="text-[10px] text-emerald-400 mt-1.5">
              Implementing changes reduces risk from {riskReduction.current_score} to {riskReduction.achievable_score}{" "}
              ({riskReduction.current_score > 0
                ? `-${Math.round(((riskReduction.current_score - riskReduction.achievable_score) / riskReduction.current_score) * 100)}%`
                : "0%"
              })
            </p>
          </div>

          {(riskReduction.top_actions?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-300 font-medium">Top Actions (weight-correct)</span>
                {riskReduction.total_reduction ? (
                  <span className="text-[10px] text-emerald-400 font-mono">-{riskReduction.total_reduction} joint</span>
                ) : null}
              </div>
              {riskReduction.top_actions?.map((a, i) => (
                <RiskActionRow key={i} action={a} />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Node Stats (fallback for basic data) ── */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          {node.lp_score != null && (
            <div className="p-2 rounded bg-slate-800/40">
              <p className="text-[10px] text-slate-400">LP Score</p>
              <p className="text-sm font-bold text-white">{node.lp_score}%</p>
            </div>
          )}
          {node.gap_count > 0 && (
            <div className="p-2 rounded bg-slate-800/40">
              <p className="text-[10px] text-slate-400">Permission Gaps</p>
              <p className="text-sm font-bold text-amber-400">{node.gap_count}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
