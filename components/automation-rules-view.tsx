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
  lastRun?: string
  nextRun?: string
  successRate: number
  issuesFixed: number
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
}

export function AutomationRulesView({
  rules = [], // Default to empty array
  stats,
  onCreateRule,
  onEditRule,
  onDeleteRule,
  onToggleRule,
}: AutomationRulesViewProps) {
  const [selectedRule, setSelectedRule] = useState<AutomationRule | null>(null)

  const displayStats = stats || {
    activeRules: rules.filter((r) => r.enabled).length,
    pausedRules: rules.filter((r) => !r.enabled).length,
    issuesFixed: rules.reduce((sum, r) => sum + r.issuesFixed, 0),
    successRate: rules.length > 0 ? Math.round(rules.reduce((sum, r) => sum + r.successRate, 0) / rules.length) : 0,
    rollbacks: 0,
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
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Issues Fixed
            </span>
          </div>
          <div className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
            {displayStats.issuesFixed}
          </div>
          <div className="text-xs mt-1 text-green-500">Last 30 days</div>
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
          <div className="text-xs mt-1 text-green-500">Average across all rules</div>
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
                  <button
                    className="p-2 rounded hover:bg-gray-100"
                    title="Duplicate"
                    onClick={() => console.log("[v0] Duplicate rule:", rule.id)}
                  >
                    <Copy className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                  </button>
                  <button className="p-2 rounded hover:bg-gray-100" title="Edit" onClick={() => onEditRule?.(rule)}>
                    <Edit2 className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                  </button>
                  <button
                    className="p-2 rounded hover:bg-gray-100"
                    title={rule.enabled ? "Pause" : "Resume"}
                    onClick={() => onToggleRule?.(rule.id)}
                  >
                    {rule.enabled ? (
                      <Pause className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                    ) : (
                      <Play className="w-4 h-4" style={{ color: "var(--success)" }} />
                    )}
                  </button>
                  <button
                    className="p-2 rounded hover:bg-red-50"
                    title="Delete"
                    onClick={() => onDeleteRule?.(rule.id)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>

                <div className="text-right text-xs" style={{ color: "var(--text-secondary)" }}>
                  <div>Next run: {rule.nextRun || "Not scheduled"}</div>
                  <div className="mt-1">
                    <span className="text-green-500 font-medium">{rule.successRate}%</span> success •{" "}
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
