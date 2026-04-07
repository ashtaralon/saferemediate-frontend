"use client"

import { useState } from "react"
import { useAutomationRules, type AutomationRule, type CreateRuleData, type ExecutionResult } from "@/hooks/useAutomationRules"
import { AutomationRulesView } from "./automation-rules-view"
import { CreateAutomationWizard } from "./create-automation-wizard"

export function AutomationSection() {
  const { rules, stats, loading, createRule, updateRule, deleteRule, toggleRule, executeRule } = useAutomationRules()
  const [showWizard, setShowWizard] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [executingRuleId, setExecutingRuleId] = useState<string | null>(null)
  const [lastExecution, setLastExecution] = useState<ExecutionResult | null>(null)

  const handleSave = async (data: CreateRuleData) => {
    if (editingRule) {
      await updateRule(editingRule.id, data)
    } else {
      await createRule(data)
    }
    setShowWizard(false)
    setEditingRule(null)
  }

  // Map hook types to component types (add required `schedule` field)
  const viewRules = rules.map((r) => ({
    ...r,
    schedule: r.schedule || `${r.scheduleType} at ${r.scheduleTime}`,
  }))

  return (
    <>
      <AutomationRulesView
        rules={viewRules}
        stats={stats ? {
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
      />

      <CreateAutomationWizard
        isOpen={showWizard}
        onClose={() => {
          setShowWizard(false)
          setEditingRule(null)
        }}
        onSave={handleSave}
        editingRule={editingRule}
      />
    </>
  )
}
