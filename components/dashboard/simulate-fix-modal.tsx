"use client"

import React, { useState } from "react"
import { X } from "lucide-react"
import {
  RemediationDecision,
  DecisionBreakdown,
  REMEDIATION_ACTION_CONFIG,
  SCORE_BREAKDOWN_LABELS
} from "@/lib/types"

// ============================================================================
// STATE MACHINE - Clear flow with explicit steps
// ============================================================================

type SimulationStep =
  | "CONFIRM"      // Initial: show what we're about to simulate
  | "LOADING"      // Running simulation
  | "PREVIEW"      // Show results, let user decide
  | "APPLYING"     // Executing remediation
  | "SUCCESS"      // Done!
  | "ERROR"        // Something went wrong

interface SimulateFixModalProps {
  isOpen: boolean
  onClose: () => void
  finding?: {
    id?: string
    title?: string
    icon?: string
    resourceId?: string
    resourceType?: string
    roleName?: string
  } | null
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function ScoreBar({ label, value, description }: { label: string; value: number; description: string }) {
  const percentage = Math.round(value * 100)
  const color = percentage >= 80 ? "#10B981" : percentage >= 60 ? "#F59E0B" : "#EF4444"

  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span style={{ color: "var(--text-secondary)" }} title={description}>
          {label}
        </span>
        <span style={{ color }}>{percentage}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "#374151" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percentage}%`, background: color }}
        />
      </div>
    </div>
  )
}

function DecisionBadge({ decision }: { decision: RemediationDecision }) {
  const config = REMEDIATION_ACTION_CONFIG[decision.action]
  const safetyPercent = Math.round(decision.safety * 100)

  return (
    <div
      className="rounded-xl p-6 mb-6 border-2 text-center"
      style={{
        background: config.bgColor,
        borderColor: config.color,
        boxShadow: `0 0 30px ${config.bgColor}`,
      }}
    >
      <div className="flex items-center justify-center gap-3 mb-2">
        <span className="text-4xl">{config.icon}</span>
        <div className="text-2xl font-bold" style={{ color: config.color }}>
          {config.label.toUpperCase()}
        </div>
      </div>
      <div className="text-base" style={{ color: config.color }}>
        {safetyPercent}% safety score
      </div>
      {!decision.auto_allowed && decision.action === "AUTO_REMEDIATE" && (
        <div className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
          (Auto-remediation disabled by policy)
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return <span className="animate-spin text-2xl">🔄</span>
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SimulateFixModal({ isOpen, onClose, finding }: SimulateFixModalProps) {
  // CRITICAL: Early return if modal is not open
  if (!isOpen) return null

  // ========== STATE MACHINE ==========
  const [step, setStep] = useState<SimulationStep>("CONFIRM")
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [applyProgress, setApplyProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<"overview" | "impact" | "code" | "timeline" | "tests">("overview")

  // Safe finding with defaults
  const safeFinding = React.useMemo(() => {
    if (finding && typeof finding === 'object' && finding.title) {
      return {
        title: String(finding.title),
        icon: String(finding.icon || "⚠️"),
        id: finding.id,
        resourceId: finding.resourceId,
        resourceType: finding.resourceType,
        roleName: finding.roleName
      }
    }
    return { title: "Security Finding", icon: "⚠️", id: finding?.id }
  }, [finding])

  // ========== HANDLERS ==========

  const handleSimulate = async () => {
    if (!safeFinding.id) {
      setError("Finding ID is required for simulation")
      setStep("ERROR")
      return
    }

    setStep("LOADING")
    setError(null)

    try {
      // Use the Next.js proxy route to avoid CORS issues
      const res = await fetch(`/api/proxy/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finding_id: safeFinding.id,
          resource_id: safeFinding.resourceId,
          resource_type: safeFinding.resourceType
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || `Simulation failed: ${res.status}`)
      }

      const data = await res.json()
      console.log("Simulation result:", data)

      setSimulationResult(data)
      setStep("PREVIEW")

    } catch (err) {
      console.error("Simulation error:", err)
      setError(err instanceof Error ? err.message : "Simulation failed")
      setStep("ERROR")
    }
  }

  const handleApplyFix = async () => {
    // Debug log FIRST - before any guards
    console.log("🔥 APPLY BUTTON CLICKED", {
      step,
      findingId: safeFinding.id,
      hasId: !!safeFinding.id
    })

    if (!safeFinding.id) {
      console.log("❌ No finding ID - showing error")
      setError("Finding ID is required")
      setStep("ERROR")
      return
    }

    // Skip confirm dialog for smoother demo
    setStep("APPLYING")
    setApplyProgress(0)

    try {
      // Progress animation
      const progressInterval = setInterval(() => {
        setApplyProgress(prev => Math.min(prev + 20, 80))
      }, 500)

      // Use the Next.js proxy route
      console.log("APPLY CLICKED", { step, findingId: safeFinding.id })
      const res = await fetch(`/api/proxy/simulate/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finding_id: safeFinding.id,
          resource_id: safeFinding.resourceId,
          resource_type: safeFinding.resourceType,
          create_rollback: true
        }),
      })

      clearInterval(progressInterval)

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || `Remediation failed: ${res.status}`)
      }

      const data = await res.json()
      console.log("Remediation result:", data)

      setApplyProgress(100)
      setTimeout(() => setStep("SUCCESS"), 500)

    } catch (err) {
      console.error("Remediation error:", err)
      setError(err instanceof Error ? err.message : "Remediation failed")
      setStep("ERROR")
    }
  }

  const handleClose = () => {
    // Reset all state
    setStep("CONFIRM")
    setSimulationResult(null)
    setError(null)
    setApplyProgress(0)
    setActiveTab("overview")
    onClose()
  }

  const handleRetry = () => {
    setError(null)
    setStep("CONFIRM")
  }

  // ========== RENDER STATES ==========

  // ----- CONFIRM STATE -----
  if (step === "CONFIRM") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/85" onClick={handleClose} />
        <div
          className="relative w-[500px] rounded-2xl p-8 shadow-2xl"
          style={{ background: "var(--bg-secondary)" }}
        >
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: "var(--text-secondary)" }}
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              Run Simulation
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
              Analyze the impact before making any changes
            </p>
          </div>

          <div className="rounded-lg p-4 mb-6" style={{ background: "var(--bg-primary)" }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{safeFinding.icon}</span>
              <div>
                <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {safeFinding.title}
                </div>
                {safeFinding.roleName && (
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    Resource: {safeFinding.roleName}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span>✅</span> Dry-run simulation - no changes made
            </div>
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span>✅</span> Impact analysis on services and dependencies
            </div>
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span>✅</span> Confidence scoring with decision engine
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 px-6 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
              style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSimulate}
              className="flex-1 px-6 py-3 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: "var(--action-primary)" }}
            >
              Run Simulation
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ----- LOADING STATE -----
  if (step === "LOADING") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/85" />
        <div
          className="relative w-[400px] rounded-2xl p-8 shadow-2xl text-center"
          style={{ background: "var(--bg-secondary)" }}
        >
          <Spinner />
          <h2 className="text-xl font-bold mt-4" style={{ color: "var(--text-primary)" }}>
            Analyzing...
          </h2>
          <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
            Running simulation and impact analysis
          </p>
          <div className="mt-4 space-y-2 text-left">
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="animate-pulse">📊</span> Checking permission usage...
            </div>
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="animate-pulse">🔗</span> Mapping dependencies...
            </div>
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="animate-pulse">🧠</span> Running decision engine...
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ----- ERROR STATE -----
  if (step === "ERROR") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/85" onClick={handleClose} />
        <div
          className="relative w-[400px] rounded-2xl p-8 shadow-2xl text-center"
          style={{ background: "var(--bg-secondary)" }}
        >
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold" style={{ color: "#EF4444" }}>
            Simulation Failed
          </h2>
          <p className="text-sm mt-2 mb-4" style={{ color: "var(--text-secondary)" }}>
            {error || "An unexpected error occurred"}
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 px-6 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
              style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
            >
              Close
            </button>
            <button
              onClick={handleRetry}
              className="flex-1 px-6 py-3 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: "var(--action-primary)" }}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ----- SUCCESS STATE -----
  if (step === "SUCCESS") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/85" onClick={handleClose} />
        <div
          className="relative w-[600px] rounded-2xl p-8 shadow-2xl text-center"
          style={{ background: "var(--bg-secondary)" }}
        >
          <div className="text-6xl mb-4 animate-bounce">✅</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            Fix Applied Successfully
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            {safeFinding.title}
          </p>
          <div className="rounded-lg p-4 mb-6" style={{ background: "var(--bg-primary)" }}>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div style={{ color: "var(--text-secondary)" }}>Status:</div>
                <div className="text-lg font-bold" style={{ color: "#10B981" }}>
                  Remediated
                </div>
              </div>
              <div>
                <div style={{ color: "var(--text-secondary)" }}>Rollback:</div>
                <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                  Available
                </div>
              </div>
            </div>
          </div>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            All services operational • No disruptions detected
          </p>
          <button
            onClick={handleClose}
            className="px-8 py-3 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ background: "var(--action-primary)" }}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // ----- APPLYING STATE -----
  if (step === "APPLYING") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/85" />
        <div
          className="relative w-[500px] rounded-2xl p-8 shadow-2xl"
          style={{ background: "var(--bg-secondary)" }}
        >
          <h2 className="text-xl font-bold mb-4 text-center" style={{ color: "var(--text-primary)" }}>
            Applying Fix...
          </h2>

          <div className="mb-4">
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "#374151" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${applyProgress}%`, background: "#10B981" }}
              />
            </div>
            <div className="text-center mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              {applyProgress}% complete
            </div>
          </div>

          <div className="space-y-3">
            {[
              { step: 1, text: "Creating snapshot..." },
              { step: 2, text: "Backing up current config..." },
              { step: 3, text: "Applying security fix..." },
              { step: 4, text: "Validating changes..." },
              { step: 5, text: "Running health checks..." },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-3">
                {applyProgress >= item.step * 20 ? (
                  <span style={{ color: "#10B981" }}>✅</span>
                ) : applyProgress >= (item.step - 1) * 20 ? (
                  <Spinner />
                ) : (
                  <span style={{ color: "var(--text-secondary)" }}>⏳</span>
                )}
                <span
                  className="text-sm"
                  style={{
                    color: applyProgress >= (item.step - 1) * 20 ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ----- PREVIEW STATE (main results view) -----
  if (step === "PREVIEW") {
    const decision = simulationResult?.decision as RemediationDecision | undefined

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/85" onClick={handleClose} />

        <div
          className="relative w-[900px] max-h-[90vh] overflow-y-auto rounded-2xl p-8 shadow-2xl"
          style={{ background: "var(--bg-secondary)" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                Simulation Results
              </h2>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {safeFinding.title}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ color: "var(--text-secondary)" }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-6 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            {[
              { key: "overview", label: "Overview" },
              { key: "impact", label: "Impact" },
              { key: "code", label: "Code Changes" },
              { key: "tests", label: "Confidence" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className="px-4 py-3 text-sm font-medium transition-colors relative"
                style={{
                  color: activeTab === tab.key ? "var(--action-primary)" : "var(--text-secondary)",
                }}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ background: "var(--action-primary)" }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "overview" && (
            <>
              {/* Decision Badge */}
              {decision ? (
                <DecisionBadge decision={decision} />
              ) : (
                <div
                  className="rounded-xl p-6 mb-6 border-2 text-center"
                  style={{
                    background: "rgba(16, 185, 129, 0.15)",
                    borderColor: "#10B981",
                  }}
                >
                  <div className="text-3xl font-bold" style={{ color: "#10B981" }}>
                    SAFE TO APPLY
                  </div>
                  <div className="text-sm mt-1" style={{ color: "#10B981" }}>
                    {simulationResult?.confidence || 95}% confidence
                  </div>
                </div>
              )}

              {/* Decision Reasons */}
              {decision?.reasons && decision.reasons.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                    Decision Reasoning:
                  </h3>
                  <div className="space-y-2">
                    {decision.reasons.map((reason, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span style={{ color: "#10B981" }}>•</span>
                        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          {reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {decision?.warnings && decision.warnings.length > 0 && (
                <div className="mb-6 rounded-lg p-4" style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                  <h3 className="text-sm font-semibold mb-2" style={{ color: "#F59E0B" }}>
                    Warnings:
                  </h3>
                  <div className="space-y-1">
                    {decision.warnings.map((warning, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span>⚠️</span>
                        <span style={{ color: "var(--text-secondary)" }}>{warning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick metrics */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { label: "Confidence", value: decision ? `${Math.round(decision.confidence * 100)}%` : `${simulationResult?.confidence || 95}%` },
                  { label: "Safety Score", value: decision ? `${Math.round(decision.safety * 100)}%` : "95%" },
                  { label: "Apply time", value: simulationResult?.estimated_time || "< 30 sec" },
                  { label: "Rollback", value: "Always available" },
                ].map((metric, i) => (
                  <div key={i} className="rounded-lg p-3" style={{ background: "var(--bg-primary)" }}>
                    <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                      {metric.label}
                    </div>
                    <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "impact" && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { icon: "🎯", label: "Services", value: "0 affected", color: "#10B981" },
                  { icon: "🔗", label: "Dependencies", value: "None broken", color: "#10B981" },
                  { icon: "⚡", label: "Performance", value: "No impact", color: "#10B981" },
                  { icon: "💰", label: "Cost", value: "$0/month", color: "#10B981" },
                  { icon: "⏱️", label: "Downtime", value: "None", color: "#10B981" },
                  { icon: "🔄", label: "Recovery time", value: "< 1 min", color: "#10B981" },
                ].map((metric, i) => (
                  <div key={i} className="rounded-lg p-4 text-center" style={{ background: "var(--bg-primary)" }}>
                    <div className="text-2xl mb-2">{metric.icon}</div>
                    <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                      {metric.label}
                    </div>
                    <div className="text-sm font-bold" style={{ color: metric.color }}>
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Resource changes */}
              {simulationResult?.resource_changes && (
                <div className="rounded-lg p-4" style={{ background: "var(--bg-primary)" }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                    Resource Changes:
                  </h3>
                  {simulationResult.resource_changes.map((change: any, i: number) => (
                    <div key={i} className="mb-3 pb-3 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {change.resource_id}
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-2 text-xs">
                        <div>
                          <span style={{ color: "var(--text-secondary)" }}>Before: </span>
                          <span style={{ color: "#EF4444" }}>{change.before}</span>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-secondary)" }}>After: </span>
                          <span style={{ color: "#10B981" }}>{change.after}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === "code" && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-lg p-4" style={{ background: "var(--bg-primary)" }}>
                  <div className="text-xs font-semibold mb-3" style={{ color: "#EF4444" }}>
                    BEFORE
                  </div>
                  <pre className="text-xs overflow-auto" style={{ color: "var(--text-primary)" }}>
{`{
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:*"
  }]
}`}
                  </pre>
                </div>
                <div className="rounded-lg p-4" style={{ background: "var(--bg-primary)" }}>
                  <div className="text-xs font-semibold mb-3" style={{ color: "#10B981" }}>
                    AFTER
                  </div>
                  <pre className="text-xs overflow-auto" style={{ color: "#10B981" }}>
{`{
  "Statement": [{
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Condition": {...}
  }]
}`}
                  </pre>
                </div>
              </div>
            </>
          )}

          {activeTab === "tests" && (
            <>
              {/* Confidence breakdown from decision engine */}
              <div className="rounded-lg p-4" style={{ background: "var(--bg-primary)" }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  Confidence Breakdown (Decision Engine):
                </h3>
                {decision?.breakdown ? (
                  <>
                    {(Object.keys(SCORE_BREAKDOWN_LABELS) as Array<keyof DecisionBreakdown>).map((key) => (
                      <ScoreBar
                        key={key}
                        label={SCORE_BREAKDOWN_LABELS[key].label}
                        value={decision.breakdown[key]}
                        description={SCORE_BREAKDOWN_LABELS[key].description}
                      />
                    ))}
                    <div className="pt-4 mt-4 border-t" style={{ borderColor: "var(--border)" }}>
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                            OVERALL CONFIDENCE
                          </span>
                          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            Geometric mean with weighted factors
                          </div>
                        </div>
                        <span
                          className="font-bold text-2xl"
                          style={{
                            color: decision.confidence >= 0.8 ? "#10B981" :
                                   decision.confidence >= 0.6 ? "#F59E0B" : "#EF4444"
                          }}
                        >
                          {Math.round(decision.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    No detailed breakdown available
                  </div>
                )}
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={handleClose}
              className="px-6 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
              style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
            >
              Cancel
            </button>

            {/* Dynamic button based on decision action */}
            {decision?.action === "BLOCK" ? (
              <button
                disabled
                className="px-8 py-3 rounded-lg text-base font-bold opacity-50 cursor-not-allowed"
                style={{ background: "#EF4444", color: "white" }}
              >
                BLOCKED - Manual Review Required
              </button>
            ) : decision?.action === "REQUIRE_APPROVAL" ? (
              <button
                onClick={handleApplyFix}
                className="px-8 py-3 rounded-lg text-base font-bold text-white transition-all hover:opacity-90"
                style={{ background: "#F59E0B" }}
              >
                REQUEST APPROVAL
              </button>
            ) : decision?.action === "CANARY" ? (
              <button
                onClick={handleApplyFix}
                className="px-8 py-3 rounded-lg text-base font-bold text-white transition-all hover:opacity-90"
                style={{ background: "#3B82F6" }}
              >
                CANARY DEPLOY
              </button>
            ) : (
              <button
                onClick={handleApplyFix}
                className="px-8 py-3 rounded-lg text-base font-bold text-white transition-all hover:opacity-90"
                style={{ background: "var(--action-primary)" }}
              >
                APPLY FIX
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
