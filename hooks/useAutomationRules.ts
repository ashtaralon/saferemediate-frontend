import { useState, useEffect, useCallback } from "react"

export interface AutomationRule {
  id: string
  name: string
  enabled: boolean
  targetSystems: string[]
  systemTags: string[]
  selectedEnvironments: string[]
  selectedCriticalities: string[]
  minSeverity: string
  minConfidence: number
  useCanary: boolean
  canaryPercentage: number
  createSnapshot: boolean
  autoRollback: boolean
  rollbackWindow: number
  scheduleType: string
  scheduleTime: string
  cronExpression: string
  schedule?: string
  lastRun?: string | null
  nextRun?: string | null
  successRate: number
  issuesFixed: number
  rollbackCount: number
}

export interface AutomationStats {
  activeRules: number
  pausedRules: number
  issuesFixed: number
  successRate: number
  rollbacks: number
}

export interface CreateRuleData {
  name: string
  target_systems: string[]
  system_tags: string[]
  selected_environments: string[]
  selected_criticalities: string[]
  min_severity: string
  min_confidence: number
  use_canary: boolean
  canary_percentage: number
  create_snapshot: boolean
  auto_rollback: boolean
  rollback_window: number
  schedule_type: string
  schedule_time: string
  cron_expression: string
}

// Convert snake_case backend response to camelCase frontend
function mapRule(raw: any): AutomationRule {
  return {
    id: raw.id,
    name: raw.name,
    enabled: raw.enabled,
    targetSystems: raw.target_systems || [],
    systemTags: raw.system_tags || [],
    selectedEnvironments: raw.selected_environments || [],
    selectedCriticalities: raw.selected_criticalities || [],
    minSeverity: raw.min_severity,
    minConfidence: raw.min_confidence,
    useCanary: raw.use_canary,
    canaryPercentage: raw.canary_percentage,
    createSnapshot: raw.create_snapshot,
    autoRollback: raw.auto_rollback,
    rollbackWindow: raw.rollback_window,
    scheduleType: raw.schedule_type,
    scheduleTime: raw.schedule_time,
    cronExpression: raw.cron_expression || "",
    schedule: formatSchedule(raw.schedule_type, raw.schedule_time),
    lastRun: raw.last_run,
    nextRun: raw.next_run,
    successRate: raw.success_rate || 0,
    issuesFixed: raw.issues_fixed || 0,
    rollbackCount: raw.rollback_count || 0,
  }
}

function formatSchedule(type: string, time: string): string {
  if (type === "daily") return `Daily at ${time}`
  if (type === "weekly") return `Weekly at ${time}`
  if (type === "interval") return `Every ${time}`
  if (type === "cron") return `Cron`
  return type
}

function mapStats(raw: any): AutomationStats {
  return {
    activeRules: raw.active_rules || 0,
    pausedRules: raw.paused_rules || 0,
    issuesFixed: raw.issues_fixed || 0,
    successRate: raw.success_rate || 0,
    rollbacks: raw.rollbacks || 0,
  }
}

export interface ExecutionDetail {
  finding_id: string
  title?: string
  severity?: string
  resource_id?: string
  status: string
  snapshot_id?: string
  reason?: string
  // Strategy execution fields
  simulation?: { success: boolean; blast_radius: string; details: any }
  aws_state_captured?: boolean
  rules_targeted?: number
  aws_calls?: string[]
  validated?: boolean
  auto_rolled_back?: boolean
  error?: string
}

export interface ExecutionResult {
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

interface UseAutomationRulesReturn {
  rules: AutomationRule[]
  stats: AutomationStats | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  createRule: (data: CreateRuleData) => Promise<AutomationRule>
  updateRule: (id: string, data: Partial<CreateRuleData>) => Promise<AutomationRule>
  deleteRule: (id: string) => Promise<void>
  toggleRule: (id: string) => Promise<AutomationRule>
  executeRule: (id: string, dryRun?: boolean) => Promise<ExecutionResult>
}

export function useAutomationRules(): UseAutomationRulesReturn {
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [stats, setStats] = useState<AutomationStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [rulesRes, statsRes] = await Promise.all([
        fetch("/api/proxy/automation-rules"),
        fetch("/api/proxy/automation-rules/stats"),
      ])

      if (rulesRes.ok) {
        const rulesData = await rulesRes.json()
        const mapped = (rulesData.rules || []).map(mapRule)
        setRules(mapped)
      } else {
        setRules([])
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(mapStats(statsData))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch automation rules"
      setError(msg)
      console.error("[useAutomationRules] Error:", err)
      setRules([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const createRule = useCallback(async (data: CreateRuleData): Promise<AutomationRule> => {
    const res = await fetch("/api/proxy/automation-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(err)
    }
    const raw = await res.json()
    await fetchRules()
    return mapRule(raw)
  }, [fetchRules])

  const updateRule = useCallback(async (id: string, data: Partial<CreateRuleData>): Promise<AutomationRule> => {
    const res = await fetch(`/api/proxy/automation-rules/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(err)
    }
    const raw = await res.json()
    await fetchRules()
    return mapRule(raw)
  }, [fetchRules])

  const deleteRule = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/proxy/automation-rules/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(err)
    }
    await fetchRules()
  }, [fetchRules])

  const toggleRule = useCallback(async (id: string): Promise<AutomationRule> => {
    const res = await fetch(`/api/proxy/automation-rules/${encodeURIComponent(id)}/toggle`, {
      method: "POST",
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(err)
    }
    const raw = await res.json()
    await fetchRules()
    return mapRule(raw)
  }, [fetchRules])

  const executeRule = useCallback(async (id: string, dryRun: boolean = true): Promise<ExecutionResult> => {
    const res = await fetch(
      `/api/proxy/automation-rules/${encodeURIComponent(id)}/execute?dry_run=${dryRun}`,
      { method: "POST" }
    )
    if (!res.ok) {
      const err = await res.text()
      throw new Error(err)
    }
    const raw = await res.json()
    await fetchRules() // refresh stats after execution
    return {
      ruleId: raw.rule_id,
      ruleName: raw.rule_name || "",
      status: raw.status,
      dryRun: raw.dry_run,
      findingsMatched: raw.findings_matched || 0,
      findingsRemediated: raw.findings_remediated || 0,
      findingsFailed: raw.findings_failed || 0,
      findingsSkipped: raw.findings_skipped || 0,
      snapshotsCreated: raw.snapshots_created || 0,
      details: raw.details || [],
    }
  }, [fetchRules])

  return {
    rules,
    stats,
    loading,
    error,
    refetch: fetchRules,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    executeRule,
  }
}
