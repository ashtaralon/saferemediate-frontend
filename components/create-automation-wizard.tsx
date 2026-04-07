"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, AlertTriangle, Shield, Camera, Activity, RotateCcw } from "lucide-react"
import type { AutomationRule, CreateRuleData } from "@/hooks/useAutomationRules"

interface CreateAutomationWizardProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: CreateRuleData) => Promise<void>
  editingRule?: AutomationRule | null
}

interface SystemItem {
  name: string
  environment: string
  criticality: string
}

const ENVIRONMENTS = [
  { id: "prod", label: "Production", color: "#DC2626" },
  { id: "pre-prod", label: "Pre-Production", color: "#F59E0B" },
  { id: "staging", label: "Staging", color: "#8B5CF6" },
  { id: "test", label: "Test", color: "#3B82F6" },
  { id: "dev", label: "Development", color: "#10B981" },
]

const CRITICALITIES = [
  { id: "mission-critical", label: "Mission Critical", description: "Business-stopping if down", color: "#DC2626" },
  { id: "business-critical", label: "Business Critical", description: "Significant business impact", color: "#F59E0B" },
  { id: "important", label: "Important", description: "Notable but manageable impact", color: "#8B5CF6" },
  { id: "standard", label: "Standard", description: "Normal operations", color: "#3B82F6" },
  { id: "low-priority", label: "Low Priority", description: "Minimal impact", color: "#6B7280" },
]

const TOTAL_STEPS = 5

export function CreateAutomationWizard({ isOpen, onClose, onSave, editingRule }: CreateAutomationWizardProps) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [systems, setSystems] = useState<SystemItem[]>([])
  const [loadingSystems, setLoadingSystems] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    selectedEnvironments: [] as string[],
    selectedCriticalities: [] as string[],
    selectedSystems: [] as string[],
    minSeverity: "Critical",
    minConfidence: 95,
    useCanary: false,
    canaryPercentage: 20,
    createSnapshot: true,
    autoRollback: true,
    rollbackWindow: 24,
    scheduleType: "daily",
    scheduleTime: "02:00",
    cronExpression: "",
  })

  // Reset form when modal opens/closes or editing rule changes
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      if (editingRule) {
        setFormData({
          name: editingRule.name,
          selectedEnvironments: editingRule.selectedEnvironments || [],
          selectedCriticalities: editingRule.selectedCriticalities || [],
          selectedSystems: editingRule.targetSystems || [],
          minSeverity: editingRule.minSeverity,
          minConfidence: editingRule.minConfidence,
          useCanary: editingRule.useCanary,
          canaryPercentage: editingRule.canaryPercentage,
          createSnapshot: editingRule.createSnapshot,
          autoRollback: editingRule.autoRollback,
          rollbackWindow: editingRule.rollbackWindow,
          scheduleType: editingRule.scheduleType || "daily",
          scheduleTime: editingRule.scheduleTime || "02:00",
          cronExpression: editingRule.cronExpression || "",
        })
      } else {
        setFormData({
          name: "",
          selectedEnvironments: [],
          selectedCriticalities: [],
          selectedSystems: [],
          minSeverity: "Critical",
          minConfidence: 95,
          useCanary: false,
          canaryPercentage: 20,
          createSnapshot: true,
          autoRollback: true,
          rollbackWindow: 24,
          scheduleType: "daily",
          scheduleTime: "02:00",
          cronExpression: "",
        })
      }
    }
  }, [isOpen, editingRule])

  // Fetch systems for step 3
  useEffect(() => {
    if (isOpen) {
      setLoadingSystems(true)
      fetch("/api/proxy/systems")
        .then((res) => res.ok ? res.json() : { systems: [] })
        .then((data) => {
          const sysList: SystemItem[] = (data.systems || []).map((s: any) => ({
            name: s.name || s.systemName || "Unknown",
            environment: s.environment || "prod",
            criticality: s.criticality || "standard",
          }))
          setSystems(sysList)
        })
        .catch(() => setSystems([]))
        .finally(() => setLoadingSystems(false))
    }
  }, [isOpen])

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!isOpen || !mounted) return null

  const filteredSystems = systems.filter(
    (s) =>
      (formData.selectedEnvironments.length === 0 || formData.selectedEnvironments.includes(s.environment)) &&
      (formData.selectedCriticalities.length === 0 || formData.selectedCriticalities.includes(s.criticality))
  )

  const handleSubmit = async () => {
    setSaving(true)
    try {
      await onSave({
        name: formData.name,
        target_systems: formData.selectedSystems,
        system_tags: [],
        selected_environments: formData.selectedEnvironments,
        selected_criticalities: formData.selectedCriticalities,
        min_severity: formData.minSeverity,
        min_confidence: formData.minConfidence,
        use_canary: formData.useCanary,
        canary_percentage: formData.canaryPercentage,
        create_snapshot: formData.createSnapshot,
        auto_rollback: formData.autoRollback,
        rollback_window: formData.rollbackWindow,
        schedule_type: formData.scheduleType,
        schedule_time: formData.scheduleTime,
        cron_expression: formData.cronExpression,
      })
    } finally {
      setSaving(false)
    }
  }

  const toggleList = (list: string[], item: string): string[] =>
    list.includes(item) ? list.filter((i) => i !== item) : [...list, item]

  return createPortal(
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] p-4">
      <div
        className="rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        style={{ background: "#1e293b" }}
      >
        {/* Header */}
        <div className="p-6 border-b" style={{ borderColor: "#374151" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold" style={{ color: "#f1f5f9" }}>
              {editingRule ? "Edit Automation Rule" : "Create Automation Rule"}
            </h2>
            <button onClick={onClose} className="p-2 rounded-lg transition-colors hover:bg-white/10">
              <X className="w-5 h-5" style={{ color: "#94a3b8" }} />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className="flex items-center flex-1">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium"
                  style={{
                    background:
                      step > i + 1 ? "#10B981" : step === i + 1 ? "#8B5CF6" : "#374151",
                    color: step >= i + 1 ? "white" : "#94a3b8",
                  }}
                >
                  {step > i + 1 ? "\u2713" : i + 1}
                </div>
                {i < TOTAL_STEPS - 1 && (
                  <div
                    className="flex-1 h-1 mx-2 rounded"
                    style={{ background: step > i + 1 ? "#10B981" : "#374151" }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6 space-y-6">
          {/* Step 1: Environment */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: "#f1f5f9" }}>
                  Step 1: Select Environment
                </h3>
                <p className="text-sm mb-4" style={{ color: "#94a3b8" }}>
                  Choose which environments this automation rule will target
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {ENVIRONMENTS.map((env) => (
                    <label
                      key={env.id}
                      className="flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md"
                      style={{
                        borderColor: formData.selectedEnvironments.includes(env.id) ? env.color : "#374151",
                        background: formData.selectedEnvironments.includes(env.id) ? `${env.color}10` : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.selectedEnvironments.includes(env.id)}
                        onChange={() =>
                          setFormData({ ...formData, selectedEnvironments: toggleList(formData.selectedEnvironments, env.id) })
                        }
                        className="w-4 h-4"
                      />
                      <span className="font-semibold" style={{ color: env.color }}>
                        {env.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Business Criticality */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: "#f1f5f9" }}>
                  Step 2: Select Business Criticality
                </h3>
                <p className="text-sm mb-4" style={{ color: "#94a3b8" }}>
                  Choose the business criticality levels to target
                </p>
                <div className="space-y-3">
                  {CRITICALITIES.map((crit) => (
                    <label
                      key={crit.id}
                      className="flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md"
                      style={{
                        borderColor: formData.selectedCriticalities.includes(crit.id) ? crit.color : "#374151",
                        background: formData.selectedCriticalities.includes(crit.id) ? `${crit.color}10` : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.selectedCriticalities.includes(crit.id)}
                        onChange={() =>
                          setFormData({ ...formData, selectedCriticalities: toggleList(formData.selectedCriticalities, crit.id) })
                        }
                        className="mt-1 w-4 h-4"
                      />
                      <div className="flex-1">
                        <div className="font-semibold mb-1" style={{ color: crit.color }}>
                          {crit.label}
                        </div>
                        <div className="text-sm" style={{ color: "#94a3b8" }}>
                          {crit.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Systems */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: "#f1f5f9" }}>
                  Step 3: Select Systems
                </h3>
                <p className="text-sm mb-4" style={{ color: "#94a3b8" }}>
                  {loadingSystems
                    ? "Loading systems..."
                    : `${filteredSystems.length} system(s) matching your filters`}
                </p>

                {formData.selectedEnvironments.length > 0 || formData.selectedCriticalities.length > 0 ? (
                  <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(59, 130, 246, 0.1)" }}>
                    <div className="text-sm" style={{ color: "#f1f5f9" }}>
                      <strong>Filters:</strong>{" "}
                      {formData.selectedEnvironments.length > 0
                        ? formData.selectedEnvironments
                            .map((id) => ENVIRONMENTS.find((e) => e.id === id)?.label)
                            .join(", ")
                        : "All environments"}{" "}
                      &bull;{" "}
                      {formData.selectedCriticalities.length > 0
                        ? formData.selectedCriticalities
                            .map((id) => CRITICALITIES.find((c) => c.id === id)?.label)
                            .join(", ")
                        : "All criticality levels"}
                    </div>
                  </div>
                ) : null}

                {loadingSystems ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="p-3 rounded-lg animate-pulse" style={{ background: "#374151" }}>
                        <div className="h-4 w-48 rounded" style={{ background: "#1e293b" }} />
                      </div>
                    ))}
                  </div>
                ) : filteredSystems.length === 0 ? (
                  <div className="p-8 text-center rounded-lg" style={{ background: "rgba(245, 158, 11, 0.1)" }}>
                    <AlertTriangle className="w-12 h-12 mx-auto mb-3" style={{ color: "#F59E0B" }} />
                    <p className="font-medium mb-1" style={{ color: "#f1f5f9" }}>
                      No systems match your criteria
                    </p>
                    <p className="text-sm" style={{ color: "#94a3b8" }}>
                      Go back and adjust your environment or criticality selections, or systems will be fetched from your cloud account
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    <label className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={formData.selectedSystems.length === filteredSystems.length && filteredSystems.length > 0}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            selectedSystems: e.target.checked ? filteredSystems.map((s) => s.name) : [],
                          })
                        }}
                        className="w-4 h-4"
                      />
                      <span className="font-medium" style={{ color: "#f1f5f9" }}>
                        Select All ({filteredSystems.length})
                      </span>
                    </label>

                    {filteredSystems.map((system) => {
                      const env = ENVIRONMENTS.find((e) => e.id === system.environment)
                      const crit = CRITICALITIES.find((c) => c.id === system.criticality)
                      return (
                        <label
                          key={system.name}
                          className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:border-purple-500"
                          style={{ borderColor: "#374151" }}
                        >
                          <input
                            type="checkbox"
                            checked={formData.selectedSystems.includes(system.name)}
                            onChange={() =>
                              setFormData({ ...formData, selectedSystems: toggleList(formData.selectedSystems, system.name) })
                            }
                            className="w-4 h-4"
                          />
                          <div className="flex-1">
                            <div className="font-medium" style={{ color: "#f1f5f9" }}>
                              {system.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {env && (
                                <span
                                  className="px-2 py-0.5 rounded text-xs font-medium"
                                  style={{ background: `${env.color}20`, color: env.color }}
                                >
                                  {env.label}
                                </span>
                              )}
                              {crit && (
                                <span
                                  className="px-2 py-0.5 rounded text-xs font-medium"
                                  style={{ background: `${crit.color}20`, color: crit.color }}
                                >
                                  {crit.label}
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Severity, Confidence, Name */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: "#f1f5f9" }}>
                  Step 4: Configure Remediation Criteria
                </h3>

                <label className="block text-sm font-medium mb-2 mt-4" style={{ color: "#f1f5f9" }}>
                  Minimum Severity Level
                </label>
                <p className="text-sm mb-3" style={{ color: "#94a3b8" }}>
                  Only remediate issues at or above this severity
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {(["Critical", "High", "Medium", "Low"] as const).map((severity) => {
                    const colors: Record<string, string> = {
                      Critical: "#DC2626",
                      High: "#F59E0B",
                      Medium: "#8B5CF6",
                      Low: "#3B82F6",
                    }
                    return (
                      <button
                        key={severity}
                        onClick={() => setFormData({ ...formData, minSeverity: severity })}
                        className="p-3 rounded-lg border-2 font-medium transition-all"
                        style={{
                          borderColor: formData.minSeverity === severity ? "#8B5CF6" : "#374151",
                          background: formData.minSeverity === severity ? "rgba(139, 92, 246, 0.1)" : "transparent",
                          color: colors[severity],
                        }}
                      >
                        {severity}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "#f1f5f9" }}>
                  Minimum Confidence Score: {formData.minConfidence}%
                </label>
                <p className="text-sm mb-3" style={{ color: "#94a3b8" }}>
                  Only auto-remediate when simulation confidence is at or above this level
                </p>
                <input
                  type="range"
                  min="70"
                  max="99"
                  step="5"
                  value={formData.minConfidence}
                  onChange={(e) => setFormData({ ...formData, minConfidence: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: "#94a3b8" }}>
                  <span>70% (More fixes)</span>
                  <span>99% (Safest)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "#f1f5f9" }}>
                  Rule Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Production Critical Auto-Fix"
                  className="w-full px-4 py-2 rounded-lg border text-sm"
                  style={{
                    background: "#0f172a",
                    borderColor: "#374151",
                    color: "#f1f5f9",
                  }}
                />
              </div>
            </div>
          )}

          {/* Step 5: Safety Features & Schedule */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: "#f1f5f9" }}>
                  Step 5: Safety Features & Schedule
                </h3>
              </div>

              {/* Safety info */}
              <div className="p-4 rounded-lg" style={{ background: "rgba(59, 130, 246, 0.1)" }}>
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 mt-0.5" style={{ color: "#3B82F6" }} />
                  <div>
                    <h3 className="font-medium mb-1" style={{ color: "#3B82F6" }}>
                      Safety Features
                    </h3>
                    <p className="text-sm" style={{ color: "#94a3b8" }}>
                      Configure snapshot creation, canary deployments, and auto-rollback policies
                    </p>
                  </div>
                </div>
              </div>

              {/* Snapshot */}
              <label className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer" style={{ borderColor: "#374151" }}>
                <input
                  type="checkbox"
                  checked={formData.createSnapshot}
                  onChange={(e) => setFormData({ ...formData, createSnapshot: e.target.checked })}
                  className="mt-1 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Camera className="w-4 h-4" style={{ color: "#f1f5f9" }} />
                    <span className="font-medium" style={{ color: "#f1f5f9" }}>
                      Create Snapshot Before Remediation
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: "#94a3b8" }}>
                    Automatically capture system state before applying fixes
                  </p>
                </div>
              </label>

              {/* Canary */}
              <label className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer" style={{ borderColor: "#374151" }}>
                <input
                  type="checkbox"
                  checked={formData.useCanary}
                  onChange={(e) => setFormData({ ...formData, useCanary: e.target.checked })}
                  className="mt-1 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-4 h-4" style={{ color: "#f1f5f9" }} />
                    <span className="font-medium" style={{ color: "#f1f5f9" }}>
                      Use Canary Deployment
                    </span>
                  </div>
                  <p className="text-sm mb-3" style={{ color: "#94a3b8" }}>
                    Roll out fixes gradually to a subset of resources first
                  </p>
                  {formData.useCanary && (
                    <div onClick={(e) => e.preventDefault()}>
                      <label className="block text-sm font-medium mb-2" style={{ color: "#f1f5f9" }}>
                        Canary Percentage: {formData.canaryPercentage}%
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="50"
                        step="10"
                        value={formData.canaryPercentage}
                        onChange={(e) => setFormData({ ...formData, canaryPercentage: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              </label>

              {/* Auto-rollback */}
              <label className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer" style={{ borderColor: "#374151" }}>
                <input
                  type="checkbox"
                  checked={formData.autoRollback}
                  onChange={(e) => setFormData({ ...formData, autoRollback: e.target.checked })}
                  className="mt-1 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <RotateCcw className="w-4 h-4" style={{ color: "#f1f5f9" }} />
                    <span className="font-medium" style={{ color: "#f1f5f9" }}>
                      Auto-Rollback on Failure
                    </span>
                  </div>
                  <p className="text-sm mb-3" style={{ color: "#94a3b8" }}>
                    Automatically revert changes if errors or performance degradation detected
                  </p>
                  {formData.autoRollback && (
                    <div onClick={(e) => e.preventDefault()}>
                      <label className="block text-sm font-medium mb-2" style={{ color: "#f1f5f9" }}>
                        Rollback Window: {formData.rollbackWindow} hours
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="36"
                        step="1"
                        value={formData.rollbackWindow}
                        onChange={(e) => setFormData({ ...formData, rollbackWindow: parseInt(e.target.value) })}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs mt-1" style={{ color: "#94a3b8" }}>
                        <span>1 hour</span>
                        <span>36 hours</span>
                      </div>
                    </div>
                  )}
                </div>
              </label>

              {/* Schedule */}
              <div className="border-t pt-6" style={{ borderColor: "#374151" }}>
                <label className="block text-sm font-medium mb-3" style={{ color: "#f1f5f9" }}>
                  Schedule
                </label>
                <div className="space-y-3">
                  {[
                    { value: "daily", label: "Daily", desc: "Run every day at a specific time" },
                    { value: "weekly", label: "Weekly", desc: "Run once per week" },
                    { value: "interval", label: "Interval", desc: "Run every X hours" },
                    { value: "cron", label: "Custom Cron Expression", desc: "Advanced scheduling with cron syntax" },
                  ].map((opt) => (
                    <div key={opt.value}>
                      <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer" style={{ borderColor: "#374151" }}>
                        <input
                          type="radio"
                          name="scheduleType"
                          checked={formData.scheduleType === opt.value}
                          onChange={() => setFormData({ ...formData, scheduleType: opt.value })}
                        />
                        <div>
                          <div className="font-medium" style={{ color: "#f1f5f9" }}>
                            {opt.label}
                          </div>
                          <div className="text-sm" style={{ color: "#94a3b8" }}>
                            {opt.desc}
                          </div>
                        </div>
                      </label>

                      {formData.scheduleType === opt.value && opt.value === "daily" && (
                        <div className="ml-8 mt-2">
                          <input
                            type="time"
                            value={formData.scheduleTime}
                            onChange={(e) => setFormData({ ...formData, scheduleTime: e.target.value })}
                            className="px-4 py-2 rounded-lg border text-sm"
                            style={{
                              background: "#0f172a",
                              borderColor: "#374151",
                              color: "#f1f5f9",
                            }}
                          />
                        </div>
                      )}

                      {formData.scheduleType === opt.value && opt.value === "cron" && (
                        <div className="ml-8 mt-2">
                          <input
                            type="text"
                            value={formData.cronExpression}
                            onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                            placeholder="0 2 * * *"
                            className="w-full px-4 py-2 rounded-lg border font-mono text-sm"
                            style={{
                              background: "#0f172a",
                              borderColor: "#374151",
                              color: "#f1f5f9",
                            }}
                          />
                          <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                            Example: 0 2 * * * (Every day at 2:00 AM)
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-6 border-t flex items-center justify-between"
          style={{ borderColor: "#374151" }}
        >
          <button
            onClick={() => {
              if (step > 1) setStep(step - 1)
              else onClose()
            }}
            className="px-4 py-2 rounded-lg font-medium transition-colors hover:bg-white/10"
            style={{ color: "#94a3b8" }}
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>

          <div className="flex items-center gap-2">
            {step < TOTAL_STEPS ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-6 py-2 rounded-lg font-medium text-white shadow-md hover:shadow-lg transition-all"
                style={{ backgroundColor: "#8B5CF6", border: "2px solid #7C3AED" }}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving || !formData.name.trim()}
                className="px-6 py-2 rounded-lg font-medium text-white shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                style={{ backgroundColor: "#8B5CF6", border: "2px solid #7C3AED" }}
              >
                {saving ? "Creating..." : editingRule ? "Save Changes" : "Create Rule"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
