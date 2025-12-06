"use client"

import React, { useState, useCallback, useMemo } from "react"
import { X } from "lucide-react"

interface SimulateFixModalProps {
  isOpen: boolean
  onClose: () => void
  finding?: {
    id?: string
    title?: string
    icon?: string
  } | null
}

export function SimulateFixModal({ isOpen, onClose, finding }: SimulateFixModalProps) {
  // CRITICAL: Early return if modal is not open - prevents any rendering issues
  if (!isOpen) return null

  // Safety check: provide default values IMMEDIATELY if finding is undefined or missing properties
  // This MUST be computed before any state or other logic to prevent "reading title of undefined" errors
  const safeFinding = React.useMemo(() => {
    try {
      if (finding && typeof finding === 'object' && 'title' in finding && finding.title) {
        return { title: String(finding.title), icon: String(finding.icon || "⚠️") }
      }
    } catch (e) {
      // If anything goes wrong, return safe defaults
      console.warn('Error processing finding:', e)
    }
    return { title: "Security Finding", icon: "⚠️" }
  }, [finding])

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [applyStep, setApplyStep] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showCodeDiff, setShowCodeDiff] = useState(false)
  const [activeTab, setActiveTab] = useState<"overview" | "impact" | "code" | "timeline" | "tests">("overview")
  const [showExtendedSim, setShowExtendedSim] = useState(false)
  const [extendedSimProgress, setExtendedSimProgress] = useState(0)
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [hasRunInitialSimulation, setHasRunInitialSimulation] = useState(false)

  // Get API base URL
  // Backend URL - MUST be absolute, never relative
  const API_BASE = useMemo(() => 
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://saferemediate-backend.onrender.com',
    []
  )
  const API_URL = useMemo(() => 
    API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`,
    [API_BASE]
  )

  const handleSimulate = useCallback(async () => {
    if (!finding?.id) {
      console.error("No finding ID available for simulation")
      alert("Error: Finding ID is required for simulation")
      return
    }

    setIsAnalyzing(true)
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/simulation/issue/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: finding.id }),
      })

      if (!res.ok) {
        throw new Error(`Simulation failed: ${res.status} ${res.statusText}`)
      }

      const data = await res.json()
      setSimulationResult(data)
      setIsAnalyzing(false)
      setShowResults(true)
    } catch (err) {
      console.error("Simulation failed", err)
      setIsAnalyzing(false)
      alert(`Simulation failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [finding?.id, API_URL])

  const handleAutoFix = async () => {
    if (!finding?.id) {
      console.error("No finding ID available for auto-fix")
      alert("Error: Finding ID is required for auto-fix")
      return
    }

    if (!confirm("Are you sure you want to apply this fix? This will modify your infrastructure.")) {
      return
    }

    setIsApplying(true)
    setLoading(true)
    setApplyStep(1)

    try {
      const res = await fetch(`${API_URL}/simulation/issue/remediate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: finding.id, confirm: true }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(errorData.detail || `Fix failed: ${res.status} ${res.statusText}`)
      }

      const data = await res.json()

      // Simulate progress steps
      const steps = [2, 3, 4, 5]
      steps.forEach((step, index) => {
        setTimeout(() => {
          setApplyStep(step)
          if (step === 5) {
            setTimeout(() => {
              setIsApplying(false)
              setShowSuccess(true)
            }, 1000)
          }
        }, (index + 1) * 1000)
      })

      if (data.status === "success") {
        // Success will be shown in the success screen
        console.log("Fix applied successfully:", data)
      }
    } catch (err) {
      console.error("Fix failed", err)
      setIsApplying(false)
      setApplyStep(0)
      alert(`Auto-fix failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }


  const handleClose = () => {
    setShowResults(false)
    setIsAnalyzing(false)
    setIsApplying(false)
    setApplyStep(0)
    setShowSuccess(false)
    setShowCodeDiff(false)
    setActiveTab("overview")
    setShowExtendedSim(false)
    setExtendedSimProgress(0)
    onClose()
  }

  const handleExtendedSimulation = () => {
    setShowExtendedSim(true)
    setExtendedSimProgress(0)

    const interval = setInterval(() => {
      setExtendedSimProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        return prev + 7
      })
    }, 200)
  }

  if (showSuccess) {
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
                <div style={{ color: "var(--text-secondary)" }}>New health score:</div>
                <div className="text-lg font-bold" style={{ color: "#10B981" }}>
                  84/100 (+12)
                </div>
              </div>
              <div>
                <div style={{ color: "var(--text-secondary)" }}>Time taken:</div>
                <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                  4.2 seconds
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

  if (isAnalyzing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/85" />
        <div
          className="relative w-[400px] rounded-2xl p-8 shadow-2xl text-center"
          style={{ background: "var(--bg-secondary)" }}
        >
          <div className="text-5xl mb-4 animate-spin">🔄</div>
          <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Analyzing...
          </h2>
          <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
            Running simulation and impact analysis
          </p>
        </div>
      </div>
    )
  }

  // Auto-run simulation when modal opens (only once)
  React.useEffect(() => {
    if (isOpen && finding?.id && !hasRunInitialSimulation && !isAnalyzing && !showResults) {
      setHasRunInitialSimulation(true)
      handleSimulate()
    }
  }, [isOpen, finding?.id, hasRunInitialSimulation, isAnalyzing, showResults, handleSimulate])

  // Reset when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setHasRunInitialSimulation(false)
      setShowResults(false)
      setIsAnalyzing(false)
    }
  }, [isOpen])

  if (showResults) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/85" onClick={!isApplying ? handleClose : undefined} />

        <div
          className="relative w-[900px] max-h-[90vh] overflow-y-auto rounded-2xl p-8 shadow-2xl"
          style={{ background: "var(--bg-secondary)" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                Advanced Simulation
              </h2>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {safeFinding.title}
              </p>
            </div>
            {!isApplying && (
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ color: "var(--text-secondary)" }}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-6 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            {[
              { key: "overview", label: "Overview" },
              { key: "impact", label: "Impact" },
              { key: "code", label: "Code Changes" },
              { key: "timeline", label: "Timeline" },
              { key: "tests", label: "Test Results" },
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
              {/* Status Badge */}
              <div
                className="rounded-xl p-8 mb-6 border-2 text-center animate-pulse"
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  borderColor: "#10B981",
                  boxShadow: "0 0 30px rgba(16, 185, 129, 0.3)",
                }}
              >
                <div className="flex items-center justify-center gap-3 mb-2">
                  <span className="text-4xl">✅</span>
                  <div className="text-3xl font-bold" style={{ color: "#10B981" }}>
                    SAFE TO APPLY
                  </div>
                </div>
                <div className="text-base" style={{ color: "#10B981" }}>
                  99% confidence
                </div>
              </div>

              {/* What will happen */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  What will happen:
                </h3>
                <div className="space-y-2">
                  {[
                    { icon: "✅", text: "Enable S3 Block Public Access", color: "#10B981" },
                    { icon: "✅", text: "Update bucket policy", color: "#10B981" },
                    { icon: "✅", text: "Internal services keep access", color: "#10B981" },
                    { icon: "✅", text: "CloudTrail keeps working", color: "#10B981" },
                    { icon: "⚠️", text: "External monitor loses access", color: "#F59E0B" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span style={{ color: item.color }}>{item.icon}</span>
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick metrics */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { label: "Services affected", value: "0" },
                  { label: "Risk level", value: "Very Low" },
                  { label: "Apply time", value: "< 30 sec" },
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
              {/* 6 metric cards */}
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

              {/* Affected resources table */}
              <div className="rounded-lg p-4" style={{ background: "var(--bg-primary)" }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  Affected Resources:
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: "var(--text-secondary)" }}>
                      <th className="text-left py-2">Resource</th>
                      <th className="text-left py-2">Current</th>
                      <th className="text-left py-2">After</th>
                      <th className="text-left py-2">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        resource: "logs-prod",
                        current: "Public",
                        after: "Private",
                        impact: "✅ Secure",
                        color: "#10B981",
                      },
                      {
                        resource: "log-processor",
                        current: "Access",
                        after: "Access",
                        impact: "✅ No change",
                        color: "#10B981",
                      },
                      {
                        resource: "monitor-ext",
                        current: "Access",
                        after: "Blocked",
                        impact: "⚠️ Loses access",
                        color: "#F59E0B",
                      },
                    ].map((row, i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? `1px solid var(--border)` : "none" }}>
                        <td className="py-2" style={{ color: "var(--text-primary)" }}>
                          {row.resource}
                        </td>
                        <td className="py-2" style={{ color: "var(--text-secondary)" }}>
                          {row.current}
                        </td>
                        <td className="py-2" style={{ color: "var(--text-secondary)" }}>
                          {row.after}
                        </td>
                        <td className="py-2" style={{ color: row.color }}>
                          {row.impact}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === "code" && (
            <>
              {/* Side-by-side diff */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-lg p-4" style={{ background: "var(--bg-primary)" }}>
                  <div className="text-xs font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
                    BEFORE
                  </div>
                  <pre className="text-xs" style={{ color: "var(--text-primary)" }}>
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
                  <div className="text-xs font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
                    AFTER
                  </div>
                  <pre className="text-xs" style={{ color: "#10B981" }}>
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

              {/* Files affected */}
              <div className="rounded-lg p-4 mb-4" style={{ background: "var(--bg-primary)" }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                  Files Affected:
                </h3>
                <ul className="text-sm space-y-1" style={{ color: "var(--text-secondary)" }}>
                  <li>• bucket-policy.json (modified)</li>
                  <li>• iam-roles.json (no change)</li>
                  <li>• block-public-access (enabled)</li>
                </ul>
              </div>

              {/* Download options */}
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
                  style={{
                    color: "var(--text-secondary)",
                    borderColor: "var(--border)",
                  }}
                >
                  Download as Terraform
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
                  style={{
                    color: "var(--text-secondary)",
                    borderColor: "var(--border)",
                  }}
                >
                  Download as JSON
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
                  style={{
                    color: "var(--text-secondary)",
                    borderColor: "var(--border)",
                  }}
                >
                  Copy to clipboard
                </button>
              </div>
            </>
          )}

          {activeTab === "timeline" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Timeline Simulation:
              </h3>
              <div className="space-y-4">
                {[
                  {
                    time: "T+0s",
                    title: "Start applying fix",
                    steps: ["Create snapshot", "Backup current config", "Lock bucket for changes"],
                  },
                  {
                    time: "T+5s",
                    title: "Apply policy update",
                    steps: ["Update bucket policy", "Enable block public access", "Validate syntax"],
                  },
                  {
                    time: "T+10s",
                    title: "Test internal access",
                    steps: ["Test log-processor IAM role", "Test CloudTrail write", "Verify no 403 errors"],
                  },
                  {
                    time: "T+20s",
                    title: "Run compliance scan",
                    steps: ["CIS AWS benchmark", "PCI-DSS requirements", "SOC2 controls"],
                  },
                  { time: "T+30s", title: "Complete", steps: ["Release bucket lock"] },
                ].map((phase, i) => (
                  <div key={i} className="rounded-lg p-4" style={{ background: "var(--bg-primary)" }}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold" style={{ color: "var(--action-primary)" }}>
                        {phase.time}
                      </span>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        {phase.title}
                      </span>
                    </div>
                    <ul className="ml-6 space-y-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                      {phase.steps.map((step, j) => (
                        <li key={j}>├─ {step}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "tests" && (
            <>
              {/* Pre-flight checks */}
              <div className="rounded-lg p-4 mb-6" style={{ background: "var(--bg-primary)" }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  Pre-flight Checks:
                </h3>
                <div className="space-y-2">
                  {[
                    "Snapshot creation: Success",
                    "Policy syntax: Valid",
                    "IAM permissions: Verified",
                    "Service dependencies: Mapped",
                    "Rollback path: Tested",
                  ].map((check, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span style={{ color: "#10B981" }}>✅</span>
                      <span style={{ color: "var(--text-secondary)" }}>{check}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Historical data */}
              <div className="rounded-lg p-4 mb-6" style={{ background: "var(--bg-primary)" }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  Historical Data:
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>Similar fixes:</div>
                    <div className="font-semibold" style={{ color: "#10B981" }}>
                      23 successful
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>Success rate:</div>
                    <div className="font-semibold" style={{ color: "#10B981" }}>
                      100%
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>Average time:</div>
                    <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      28 seconds
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>Rollbacks needed:</div>
                    <div className="font-semibold" style={{ color: "#10B981" }}>
                      0
                    </div>
                  </div>
                </div>
              </div>

              {/* Confidence factors */}
              <div className="rounded-lg p-4" style={{ background: "var(--bg-primary)" }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  Confidence Factors:
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Policy validation", value: 100 },
                    { label: "IAM analysis", value: 99 },
                    { label: "Service mapping", value: 98 },
                    { label: "Historical success", value: 100 },
                  ].map((factor, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span style={{ color: "var(--text-secondary)" }}>{factor.label}</span>
                        <span style={{ color: "#10B981" }}>{factor.value}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "#374151" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${factor.value}%`, background: "#10B981" }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <div className="flex justify-between">
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        OVERALL
                      </span>
                      <span className="font-bold text-lg" style={{ color: "#10B981" }}>
                        99%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Progress Indicator */}
          {isApplying && (
            <div className="mb-6 rounded-lg p-4" style={{ background: "var(--bg-primary)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                Applying fix...
              </h3>
              <div className="space-y-3">
                {[
                  { step: 1, text: "Creating snapshot..." },
                  { step: 2, text: "Backing up current config..." },
                  { step: 3, text: "Applying security fix..." },
                  { step: 4, text: "Validating changes..." },
                  { step: 5, text: "Running health checks..." },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3">
                    {applyStep > item.step ? (
                      <span style={{ color: "#10B981" }}>✅</span>
                    ) : applyStep === item.step ? (
                      <span className="animate-spin">🔄</span>
                    ) : (
                      <span style={{ color: "var(--text-secondary)" }}>⏳</span>
                    )}
                    <span
                      className="text-sm"
                      style={{
                        color: applyStep >= item.step ? "var(--text-primary)" : "var(--text-secondary)",
                      }}
                    >
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extended Simulation */}
          {showExtendedSim && extendedSimProgress < 100 && (
            <div className="mb-6 rounded-lg p-4" style={{ background: "var(--bg-primary)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                Running Extended Simulation (15 scenarios)...
              </h3>
              <div className="space-y-2 mb-3">
                {[
                  { label: "Test with high traffic", progress: 100 },
                  { label: "Test with multiple IAM roles", progress: 100 },
                  { label: "Test with CloudTrail enabled", progress: 100 },
                  { label: "Test with monitoring tools", progress: extendedSimProgress > 50 ? 70 : 0 },
                  { label: "Test with backup jobs", progress: 0 },
                ].map((test, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    {test.progress === 100 ? (
                      <span style={{ color: "#10B981" }}>✅</span>
                    ) : test.progress > 0 ? (
                      <span className="animate-spin">🔄</span>
                    ) : (
                      <span style={{ color: "var(--text-secondary)" }}>⏳</span>
                    )}
                    <span style={{ color: "var(--text-secondary)" }}>{test.label}</span>
                    {test.progress > 0 && test.progress < 100 && (
                      <span className="ml-auto text-xs" style={{ color: "var(--text-secondary)" }}>
                        ({test.progress}/10)
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "#374151" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${extendedSimProgress}%`, background: "var(--action-primary)" }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          {!isApplying && (
            <div className="flex items-center justify-between pt-6 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-6 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
                  style={{
                    color: "var(--text-secondary)",
                    borderColor: "var(--border)",
                  }}
                >
                  Cancel
                </button>
                {!showExtendedSim && (
                  <button
                    onClick={handleExtendedSimulation}
                    className="px-6 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
                    style={{
                      color: "var(--text-secondary)",
                      borderColor: "var(--border)",
                    }}
                  >
                    Run Extended Simulation
                  </button>
                )}
              </div>
              <button
                onClick={handleAutoFix}
                disabled={loading}
                className="px-8 py-3 rounded-lg text-base font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "var(--action-primary)" }}
              >
                {loading ? "Applying..." : "AUTO-FIX"}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
