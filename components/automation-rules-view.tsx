"use client"

import { useState } from "react"
import {
  Plus,
  Play,
  Pause,
  Edit2,
  Trash2,
  Copy,
  Zap,
  Clock,
  Camera,
  RotateCcw,
  Target,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Shield,
} from "lucide-react"

interface AutomationRule {
  id: string
  name: string
  enabled: boolean
  targetSystems: string[]
  systemTags: string[]
  minSeverity: string
  minConfidence: number
  useCanary: boolean
  canaryPercentage: number
  createSnapshot: boolean
  autoRollback: boolean
  rollbackWindow: number
  schedule: string
  lastRun?: string | null
  nextRun?: string | null
  successRate: number
  issuesFixed: number
  rollbackCount?: number
}

interface ExecutionDetail {
  finding_id: string
  title?: string
  severity?: string
  resource_id?: string
  status: string
  snapshot_id?: string
  reason?: string
  simulation?: { success: boolean; blast_radius: string; details: any }
  aws_state_captured?: boolean
  rules_targeted?: number
  aws_calls?: string[]
  validated?: boolean
  auto_rolled_back?: boolean
  error?: string
}

interface ExecutionResult {
  ruleId: string
  ruleName: string
  status: string
  dryRun: boolean
  findingsMatched: number
  findingsRemediated: number
  findingsFailed: number
  findingsSkipped: number
  snapshotsCreated: number
  details: ExecutionDetail[]
}

interface AutomationRulesViewProps {
  rules?: AutomationRule[]
  stats?: {
    activeRules: number
    pausedRules: number
    issuesFixed: number
    successRate: number
    rollbacks: number
  }
  onCreateRule?: () => void
  onEditRule?: (rule: AutomationRule) => void
  onDeleteRule?: (ruleId: string) => void
  onToggleRule?: (ruleId: string) => void
  onExecuteRule?: (ruleId: string, dryRun: boolean) => void
  onRollback?: (snapshotId: string) => void
  rollingBackSnapshotId?: string | null
  executingRuleId?: string | null
  lastExecution?: ExecutionResult | null
  onDismissExecution?: () => void
  loading?: boolean
}

export function AutomationRulesView({
  rules = [],
  stats,
  onCreateRule,
  onEditRule,
  onDeleteRule,
  onToggleRule,
  onExecuteRule,
  onRollback,
  rollingBackSnapshotId,
  executingRuleId,
  lastExecution,
  onDismissExecution,
  loading = false,
}: AutomationRulesViewProps) {
  const [selectedRule, setSelectedRule] = useState<AutomationRule | null>(null)

  const displayStats = stats || {
    activeRules: rules.filter((r) => r.enabled).length,
    pausedRules: rules.filter((r) => !r.enabled).length,
    issuesFixed: rules.reduce((sum, r) => sum + r.issuesFixed, 0),
    successRate: rules.length > 0 ? Math.round(rules.reduce((sum, r) => sum + r.successRate, 0) / rules.length) : 0,
    rollbacks: 0,
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              Automation Rules
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Configure automated remediation policies for your systems
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 rounded-lg animate-pulse" style={{ background: "var(--bg-secondary)" }}>
              <div className="h-4 w-24 rounded mb-3" style={{ background: "var(--bg-tertiary, #374151)" }} />
              <div className="h-8 w-16 rounded" style={{ background: "var(--bg-tertiary, #374151)" }} />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="p-5 rounded-lg animate-pulse" style={{ background: "var(--bg-secondary)" }}>
              <div className="h-5 w-64 rounded mb-3" style={{ background: "var(--bg-tertiary, #374151)" }} />
              <div className="h-4 w-48 rounded" style={{ background: "var(--bg-tertiary, #374151)" }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (rules.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              Automation Rules
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Configure automated remediation policies for your systems
            </p>
          </div>
        </div>

        <div className="text-center py-12 rounded-xl" style={{ background: "var(--bg-secondary)" }}>
          <div className="text-6xl mb-4">⚡</div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            No Automation Rules Yet
          </h3>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Create your first automation rule to start auto-fixing security issues
          </p>
          <button
            onClick={onCreateRule}
            className="px-6 py-3 rounded-lg font-semibold text-white shadow-md hover:shadow-lg transition-all"
            style={{ backgroundColor: "#8B5CF6" }}
          >
            <Plus className="w-5 h-5 inline mr-2" />
            Create First Rule
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Automation Rules
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Configure automated remediation policies for your systems
          </p>
        </div>
        <button
          onClick={onCreateRule}
          className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white shadow-md hover:shadow-lg transition-all hover:scale-105"
          style={{
            backgroundColor: "#8B5CF6",
            border: "2px solid #7C3AED",
          }}
        >
          <Plus className="w-5 h-5" />
          Create New Rule
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5" style={{ color: "var(--primary)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Active Rules
            </span>
          </div>
          <div className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
            {displayStats.activeRules}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {displayStats.pausedRules} paused
          </div>
        </div>

        <div className="p-4 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-[#22c55e]" />
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Issues Fixed
            </span>
          </div>
          <div className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
            {displayStats.issuesFixed}
          </div>
          <div className="text-xs mt-1 text-[#22c55e]">Last 30 days</div>
        </div>

        <div className="p-4 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5" style={{ color: "var(--primary)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Success Rate
            </span>
          </div>
          <div className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
            {displayStats.successRate}%
          </div>
          <div className="text-xs mt-1 text-[#22c55e]">Average across all rules</div>
        </div>

        <div className="p-4 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-2 mb-2">
            <RotateCcw className="w-5 h-5 text-orange-500" />
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Rollbacks
            </span>
          </div>
          <div className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
            {displayStats.rollbacks}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Last 30 days
          </div>
        </div>
      </div>

      {/* Execution Results Banner */}
      {lastExecution && (
        <div
          className="p-4 rounded-lg border-2"
          style={{
            background: lastExecution.findingsFailed > 0 ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
            borderColor: lastExecution.findingsFailed > 0 ? "#ef4444" : "#22c55e",
          }}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {lastExecution.findingsFailed > 0 ? (
                <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-[#22c55e]" />
              )}
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                Execution {lastExecution.dryRun ? "(Dry Run)" : ""} — {lastExecution.ruleName}
              </h3>
            </div>
            <button
              onClick={onDismissExecution}
              className="text-sm px-3 py-1 rounded hover:bg-white/10"
              style={{ color: "var(--text-secondary)" }}
            >
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-4 gap-4 text-sm mb-3">
            <div>
              <span style={{ color: "var(--text-secondary)" }}>Findings matched: </span>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{lastExecution.findingsMatched}</span>
            </div>
            <div>
              <span style={{ color: "var(--text-secondary)" }}>{lastExecution.dryRun ? "Simulated" : "Remediated"}: </span>
              <span className="font-semibold text-[#22c55e]">{lastExecution.findingsRemediated}</span>
            </div>
            <div>
              <span style={{ color: "var(--text-secondary)" }}>Failed: </span>
              <span className="font-semibold text-[#ef4444]">{lastExecution.findingsFailed}</span>
            </div>
            <div>
              <span style={{ color: "var(--text-secondary)" }}>Snapshots: </span>
              <span className="font-semibold" style={{ color: "#3B82F6" }}>{lastExecution.snapshotsCreated}</span>
            </div>
          </div>
          {lastExecution.details.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {lastExecution.details.map((d, i) => {
                const isSuccess = ["remediated", "simulated", "snapshot_created", "no_action_needed"].includes(d.status)
                return (
                  <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded" style={{ background: "rgba(0,0,0,0.2)" }}>
                    <span
                      className="px-1.5 py-0.5 rounded font-medium shrink-0"
                      style={{
                        background: isSuccess ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                        color: isSuccess ? "#22c55e" : "#ef4444",
                      }}
                    >
                      {d.status}
                    </span>
                    <span style={{ color: "#f1f5f9" }}>{d.title || d.finding_id}</span>
                    {d.resource_id && (
                      <span style={{ color: "#94a3b8" }}>({d.resource_id})</span>
                    )}
                    {/* Strategy details */}
                    {d.aws_state_captured && (
                      <span className="px-1 py-0.5 rounded" style={{ background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa" }}>
                        AWS
                      </span>
                    )}
                    {d.simulation?.blast_radius && (
                      <span style={{ color: "#94a3b8" }}>blast: {d.simulation.blast_radius}</span>
                    )}
                    {d.aws_calls && d.aws_calls.length > 0 && (
                      <span style={{ color: "#fbbf24" }}>{d.aws_calls.length} AWS call{d.aws_calls.length > 1 ? "s" : ""}</span>
                    )}
                    {d.validated !== undefined && (
                      <span style={{ color: d.validated ? "#22c55e" : "#ef4444" }}>
                        {d.validated ? "validated" : "drift detected"}
                      </span>
                    )}
                    {d.auto_rolled_back && (
                      <span className="px-1 py-0.5 rounded" style={{ background: "rgba(251, 191, 36, 0.2)", color: "#fbbf24" }}>
                        auto-rolled-back
                      </span>
                    )}
                    {d.snapshot_id && (
                      <button
                        className="ml-auto flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
                        style={{ color: "#3B82F6" }}
                        title="Click to rollback this snapshot"
                        disabled={rollingBackSnapshotId === d.snapshot_id}
                        onClick={() => onRollback?.(d.snapshot_id!)}
                      >
                        {rollingBackSnapshotId === d.snapshot_id ? (
                          <>
                            <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            Rolling back...
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3 h-3" />
                            <Camera className="w-3 h-3" /> {d.snapshot_id}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Automation Rules List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Configured Rules
        </h2>

        {rules.map((rule) => (
          <div
            key={rule.id}
            className="p-5 rounded-lg border"
            style={{
              background: "var(--bg-secondary)",
              borderColor: rule.enabled ? "var(--primary)" : "var(--border-color)",
              borderWidth: rule.enabled ? "2px" : "1px",
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-4 flex-1">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ background: rule.enabled ? "var(--primary-bg)" : "var(--bg-tertiary)" }}
                >
                  {rule.enabled ? (
                    <Zap className="w-6 h-6" style={{ color: "var(--primary)" }} />
                  ) : (
                    <Pause className="w-6 h-6" style={{ color: "var(--text-secondary)" }} />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                      {rule.name}
                    </h3>
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        background: rule.enabled ? "var(--success-bg)" : "var(--bg-tertiary)",
                        color: rule.enabled ? "var(--success)" : "var(--text-secondary)",
                      }}
                    >
                      {rule.enabled ? "Active" : "Paused"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                      <span style={{ color: "var(--text-secondary)" }}>Target:</span>
                      <span style={{ color: "var(--text-primary)" }}>
                        {rule.targetSystems.length > 0
                          ? rule.targetSystems.join(", ")
                          : `Tags: ${rule.systemTags.join(", ")}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                      <span style={{ color: "var(--text-secondary)" }}>Min Severity:</span>
                      <span className="font-medium" style={{ color: "var(--critical)" }}>
                        {rule.minSeverity}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                      <span style={{ color: "var(--text-secondary)" }}>Confidence:</span>
                      <span style={{ color: "var(--text-primary)" }}>≥{rule.minConfidence}%</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                      <span style={{ color: "var(--text-secondary)" }}>Schedule:</span>
                      <span style={{ color: "var(--text-primary)" }}>{rule.schedule}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3 text-xs">
                    {rule.useCanary && (
                      <span
                        className="px-2 py-1 rounded"
                        style={{ background: "var(--primary-bg)", color: "var(--primary)" }}
                      >
                        Canary {rule.canaryPercentage}%
                      </span>
                    )}
                    {rule.createSnapshot && (
                      <span
                        className="flex items-center gap-1 px-2 py-1 rounded"
                        style={{ background: "var(--info-bg)", color: "var(--info)" }}
                      >
                        <Camera className="w-3 h-3" />
                        Snapshot
                      </span>
                    )}
                    {rule.autoRollback && (
                      <span
                        className="flex items-center gap-1 px-2 py-1 rounded"
                        style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Auto-rollback {rule.rollbackWindow}h
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  {/* Run Now button */}
                  {rule.enabled && (
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                      style={{ backgroundColor: "#22c55e" }}
                      title="Run Now (Dry Run)"
                      disabled={executingRuleId === rule.id}
                      onClick={() => onExecuteRule?.(rule.id, true)}
                    >
                      {executingRuleId === rule.id ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          Run Now
                        </>
                      )}
                    </button>
                  )}
                  <button className="p-2 rounded hover:bg-white/10" title="Edit" onClick={() => onEditRule?.(rule)}>
                    <Edit2 className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                  </button>
                  <button
                    className="p-2 rounded hover:bg-white/10"
                    title={rule.enabled ? "Pause" : "Resume"}
                    onClick={() => onToggleRule?.(rule.id)}
                  >
                    {rule.enabled ? (
                      <Pause className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                    ) : (
                      <Play className="w-4 h-4" style={{ color: "#22c55e" }} />
                    )}
                  </button>
                  <button
                    className="p-2 rounded hover:bg-[#ef444410]"
                    title="Delete"
                    onClick={() => onDeleteRule?.(rule.id)}
                  >
                    <Trash2 className="w-4 h-4 text-[#ef4444]" />
                  </button>
                </div>

                <div className="text-right text-xs" style={{ color: "var(--text-secondary)" }}>
                  <div>Last run: {rule.lastRun ? new Date(rule.lastRun).toLocaleString() : "Never"}</div>
                  <div className="mt-1">
                    <span className="text-[#22c55e] font-medium">{rule.successRate}%</span> success •{" "}
                    <span className="font-medium">{rule.issuesFixed}</span> fixed
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
