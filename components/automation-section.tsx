"use client"

import { useState } from "react"
import { useAutomationRules, type AutomationRule, type CreateRuleData, type ExecutionResult, type RollbackResult } from "@/hooks/useAutomationRules"
import { AutomationRulesView } from "./automation-rules-view"
import { CreateAutomationWizard } from "./create-automation-wizard"

interface AutomationSectionProps {
  systemName?: string
  systemEnvironment?: string
  systemCriticality?: string
}

function normalizeEnvironment(env?: string): string {
  const lower = (env || "").toLowerCase().trim()
  if (lower.includes("prod") && !lower.includes("pre")) return "prod"
  if (lower.includes("pre-prod") || lower.includes("pre prod") || lower.includes("preprod")) return "pre-prod"
  if (lower.includes("stag")) return "staging"
  if (lower.includes("test")) return "test"
  if (lower.includes("dev")) return "dev"
  return ""
}

function normalizeCriticality(crit?: string): string {
  const lower = (crit || "").toLowerCase().trim()
  if (lower.includes("mission")) return "mission-critical"
  if (lower.includes("business")) return "business-critical"
  if (lower.includes("important")) return "important"
  if (lower.includes("low")) return "low-priority"
  if (lower) return "standard"
  return ""
}

export function AutomationSection({ systemName, systemEnvironment, systemCriticality }: AutomationSectionProps) {
  const { rules, stats, loading, createRule, updateRule, deleteRule, toggleRule, executeRule, rollbackSnapshot } = useAutomationRules()
  const [showWizard, setShowWizard] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [executingRuleId, setExecutingRuleId] = useState<string | null>(null)
  const [lastExecution, setLastExecution] = useState<ExecutionResult | null>(null)
  const [rollingBackSnapshotId, setRollingBackSnapshotId] = useState<string | null>(null)

  const normalizedEnv = normalizeEnvironment(systemEnvironment)
  const normalizedCrit = normalizeCriticality(systemCriticality)

  const applicableRules = rules.filter((rule) => {
    if (!systemName) return true

    const explicitTargets = rule.targetSystems || []
    if (explicitTargets.length > 0 && !explicitTargets.includes(systemName)) {
      return false
    }

    if (rule.selectedEnvironments?.length > 0 && (!normalizedEnv || !rule.selectedEnvironments.includes(normalizedEnv))) {
      return false
    }

    if (rule.selectedCriticalities?.length > 0 && (!normalizedCrit || !rule.selectedCriticalities.includes(normalizedCrit))) {
      return false
    }

    return true
  })

  const handleSave = async (data: CreateRuleData) => {
    if (editingRule) {
      await updateRule(editingRule.id, data)
    } else {
      await createRule(systemName ? { ...data, target_systems: [systemName] } : data)
    }
    setShowWizard(false)
    setEditingRule(null)
  }

  // Map hook types to component types (add required `schedule` field)
  const viewRules = applicableRules.map((r) => ({
    ...r,
    schedule: r.schedule || `${r.scheduleType} at ${r.scheduleTime}`,
  }))

  const filteredStats = {
    activeRules: applicableRules.filter((r) => r.enabled).length,
    pausedRules: applicableRules.filter((r) => !r.enabled).length,
    issuesFixed: applicableRules.reduce((sum, r) => sum + r.issuesFixed, 0),
    successRate: applicableRules.length > 0
      ? Math.round(applicableRules.reduce((sum, r) => sum + r.successRate, 0) / applicableRules.length)
      : 0,
    rollbacks: applicableRules.reduce((sum, r) => sum + (r.rollbackCount || 0), 0),
  }

  return (
    <>
      <AutomationRulesView
        rules={viewRules}
        stats={systemName ? filteredStats : stats ? {
          activeRules: stats.activeRules,
          pausedRules: stats.pausedRules,
          issuesFixed: stats.issuesFixed,
          successRate: stats.successRate,
          rollbacks: stats.rollbacks,
        } : undefined}
        loading={loading}
        onCreateRule={() => {
          setEditingRule(null)
          setShowWizard(true)
        }}
        onEditRule={(rule) => {
          const full = rules.find((r) => r.id === rule.id)
          if (full) {
            setEditingRule(full)
            setShowWizard(true)
          }
        }}
        onDeleteRule={(id) => deleteRule(id)}
        onToggleRule={(id) => toggleRule(id)}
        onExecuteRule={async (id, dryRun) => {
          setExecutingRuleId(id)
          setLastExecution(null)
          try {
            const result = await executeRule(id, dryRun)
            setLastExecution(result)
          } catch (err) {
            console.error("Execution failed:", err)
          } finally {
            setExecutingRuleId(null)
          }
        }}
        executingRuleId={executingRuleId}
        lastExecution={lastExecution}
        onDismissExecution={() => setLastExecution(null)}
        rollingBackSnapshotId={rollingBackSnapshotId}
        onRollback={async (snapshotId) => {
          setRollingBackSnapshotId(snapshotId)
          try {
            await rollbackSnapshot(snapshotId)
          } catch (err) {
            console.error("Rollback failed:", err)
          } finally {
            setRollingBackSnapshotId(null)
          }
        }}
      />

      <CreateAutomationWizard
        isOpen={showWizard}
        onClose={() => {
          setShowWizard(false)
          setEditingRule(null)
        }}
        onSave={handleSave}
        editingRule={editingRule}
        lockedSystemName={!editingRule ? systemName : undefined}
      />
    </>
  )
}
