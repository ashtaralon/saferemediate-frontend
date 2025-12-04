"use client"

import { useState } from "react"
import { X } from "lucide-react"

interface BulkAutomationModalProps {
  isOpen: boolean
  onClose: () => void
  selectedFindings: any[]
}

export function BulkAutomationModal({ isOpen, onClose, selectedFindings }: BulkAutomationModalProps) {
  const [executionStrategy, setExecutionStrategy] = useState<"sequential" | "canary" | "parallel">("sequential")
  const [canaryPercentage, setCanaryPercentage] = useState(20)
  const [monitoringTime, setMonitoringTime] = useState(30)
  const [autoProceed, setAutoProceed] = useState(true)
  const [enableRollback, setEnableRollback] = useState(true)
  const [healthThreshold, setHealthThreshold] = useState(70)
  const [errorThreshold, setErrorThreshold] = useState(5)
  const [performanceThreshold, setPerformanceThreshold] = useState(20)
  const [showExecution, setShowExecution] = useState(false)
  const [executionStage, setExecutionStage] = useState<"canary" | "monitoring" | "full" | "complete">("canary")
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set())

  if (!isOpen) return null

  if (showExecution) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/85" />

        <div
          className="relative w-[1200px] max-h-[90vh] overflow-y-auto rounded-2xl p-8 shadow-2xl"
          style={{ background: "var(--bg-secondary)" }}
        >
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              Automated Remediation in Progress
            </h2>
            <div className="flex items-center gap-4 mt-2">
              <span
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: "#F97316", color: "white" }}
              >
                Stage 1: Canary Rollout
              </span>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                35% complete • Elapsed: 12m 30s • ETA: 32m 15s
              </span>
              <button
                className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: "#DC2626" }}
              >
                ⏹ Stop Automation
              </button>
            </div>
          </div>

          {/* Live Metrics Panel */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Health Score", value: "72/100", status: "Stable ✅", color: "#10B981" },
              { label: "Error Rate", value: "1.2%", status: "Normal ✅", color: "#10B981" },
              { label: "Response Time", value: "245ms", status: "Normal ✅", color: "#10B981" },
              { label: "Active Connections", value: "1,247", status: "Stable", color: "#10B981" },
            ].map((metric, i) => (
              <div key={i} className="rounded-xl p-4" style={{ background: "var(--bg-primary)" }}>
                <div className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                  {metric.label}
                </div>
                <div className="text-2xl font-bold mb-1" style={{ color: metric.color }}>
                  {metric.value}
                </div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {metric.status}
                </div>
              </div>
            ))}
          </div>

          {/* Stage Progress */}
          <div className="rounded-xl p-6 mb-6" style={{ background: "var(--bg-primary)" }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
              Stage Progress:
            </h3>
            <div className="space-y-4">
              {/* Stage 1 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span>🔄</span>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    Stage 1: Canary Rollout (20%) - ACTIVE
                  </span>
                </div>
                <div className="ml-6 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span style={{ color: "#10B981" }}>✅</span>
                    <span style={{ color: "var(--text-secondary)" }}>Checkpoint created (cp-auto-123)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: "#10B981" }}>✅</span>
                    <span style={{ color: "var(--text-secondary)" }}>Fix 1: S3 bucket secured (2m 15s)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="animate-spin">🔄</span>
                    <span style={{ color: "var(--text-primary)" }}>Monitoring canary... (12/30 minutes)</span>
                  </div>
                </div>
              </div>

              {/* Stage 2 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span>⏳</span>
                  <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>
                    Stage 2: Full Rollout (80%) - PENDING
                  </span>
                </div>
                <div className="ml-6 space-y-2 text-sm">
                  <div className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                    <span>⏳</span>
                    <span>Fix 2: Security group restriction</span>
                  </div>
                  <div className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                    <span>⏳</span>
                    <span>Fix 3: RDS backup configuration</span>
                  </div>
                </div>
              </div>

              {/* Stage 3 */}
              <div>
                <div className="flex items-center gap-2">
                  <span>⏳</span>
                  <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>
                    Stage 3: Post-Deployment Monitoring - PENDING
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Rollback Monitoring */}
          <div className="rounded-xl p-6 mb-6" style={{ background: "var(--bg-primary)" }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
              Rollback Trigger Monitoring:
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Health Score Monitor", status: "Healthy", current: "72/100", threshold: "< 70" },
                { label: "Error Rate Monitor", status: "Normal", current: "1.2%", threshold: "> 5%" },
                { label: "Performance Monitor", status: "Normal", current: "+6.5%", threshold: "< 20%" },
                { label: "Service Availability", status: "Up", current: "100%", threshold: "Health check" },
              ].map((monitor, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {monitor.label}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Current: {monitor.current} • Threshold: {monitor.threshold}
                    </div>
                  </div>
                  <span style={{ color: "#10B981" }}>✅ {monitor.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Log */}
          <div className="rounded-xl p-6" style={{ background: "var(--bg-primary)" }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
              Activity Log:
            </h3>
            <div className="space-y-2 max-h-[200px] overflow-y-auto text-sm">
              {[
                "14:35:43 - 5-minute check: All metrics normal ✅",
                "14:31:00 - Health check: 72/100 ✅",
                "14:31:00 - Response time: 242ms ✅",
                "14:31:00 - Error rate: 1.1% ✅",
                "14:25:43 - Starting canary monitoring (30 minutes)",
                "14:25:42 - Validation passed ✅",
                "14:25:38 - Running validation tests...",
                "14:25:37 - Fix 1 applied successfully",
                "14:23:22 - Applying Fix 1: S3 bucket public access",
                "14:23:20 - Starting canary rollout (20%)",
                "14:23:18 - Checkpoint created successfully",
                "14:23:16 - Creating checkpoint cp-auto-123...",
                "14:23:15 - Automation started",
              ].map((log, i) => (
                <div key={i} style={{ color: "var(--text-secondary)" }}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/85" onClick={onClose} />

      <div
        className="relative w-[900px] max-h-[90vh] overflow-y-auto rounded-2xl p-8 shadow-2xl my-8"
        style={{ background: "var(--bg-secondary)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              Create Automated Remediation
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              {selectedFindings.length} findings selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: "var(--text-secondary)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Findings */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Selected Findings:
          </h3>
          <div className="space-y-3">
            {selectedFindings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-lg p-4 border-l-4"
                style={{
                  background: "var(--bg-primary)",
                  borderLeftColor: finding.borderColor,
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{finding.icon}</span>
                    <div>
                      <h4 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        {finding.title}
                      </h4>
                      <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                        Confidence: {finding.confidence}%
                      </p>
                    </div>
                  </div>
                  <button
                    className="text-xs transition-colors hover:opacity-70"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Execution Strategy */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Execution Strategy:
          </h3>
          <div className="space-y-3">
            {[
              {
                value: "sequential",
                label: "Sequential Rollout (Recommended)",
                desc: "Apply fixes one at a time, waiting for validation",
              },
              {
                value: "canary",
                label: "Canary Rollout",
                desc: "Test on subset before full deployment",
              },
              {
                value: "parallel",
                label: "Parallel Execution",
                desc: "Apply all fixes simultaneously (higher risk)",
              },
            ].map((option) => (
              <label
                key={option.value}
                className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors hover:bg-white/5"
                style={{
                  background: executionStrategy === option.value ? "rgba(139, 92, 246, 0.1)" : "transparent",
                  borderColor: executionStrategy === option.value ? "var(--action-primary)" : "var(--border)",
                }}
              >
                <input
                  type="radio"
                  name="strategy"
                  value={option.value}
                  checked={executionStrategy === option.value}
                  onChange={(e) => setExecutionStrategy(e.target.value as any)}
                  className="mt-1"
                />
                <div>
                  <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {option.label}
                  </div>
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {option.desc}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* Canary Configuration */}
          {executionStrategy === "canary" && (
            <div className="mt-4 rounded-lg p-4" style={{ background: "var(--bg-primary)" }}>
              <h4 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                Canary Rollout Configuration:
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                    Canary Percentage: {canaryPercentage}%
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="50"
                    step="10"
                    value={canaryPercentage}
                    onChange={(e) => setCanaryPercentage(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    <span>10%</span>
                    <span>20%</span>
                    <span>30%</span>
                    <span>40%</span>
                    <span>50%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                    Monitoring Period: {monitoringTime} minutes
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={monitoringTime}
                    onChange={(e) => setMonitoringTime(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={autoProceed} onChange={(e) => setAutoProceed(e.target.checked)} />
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                    Auto-proceed to full rollout if canary succeeds
                  </span>
                </label>

                {/* Visual Timeline */}
                <div className="mt-4 p-3 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
                  <div className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                    Timeline Preview:
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="px-3 py-1 rounded" style={{ background: "var(--action-primary)", color: "white" }}>
                      {canaryPercentage}% Canary
                    </div>
                    <span>→</span>
                    <div className="px-3 py-1 rounded" style={{ background: "#F59E0B", color: "white" }}>
                      Monitor {monitoringTime}min
                    </div>
                    <span>→</span>
                    <div className="px-3 py-1 rounded" style={{ background: "#10B981", color: "white" }}>
                      Full {100 - canaryPercentage}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Automatic Rollback Configuration */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={enableRollback}
              onChange={(e) => setEnableRollback(e.target.checked)}
              id="enableRollback"
            />
            <label
              htmlFor="enableRollback"
              className="text-lg font-semibold cursor-pointer"
              style={{ color: "var(--text-primary)" }}
            >
              Enable Automatic Rollback
            </label>
          </div>

          {enableRollback && (
            <div className="rounded-lg p-4 space-y-4" style={{ background: "var(--bg-primary)" }}>
              <h4 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                Rollback Triggers:
              </h4>

              {/* Health Score Trigger */}
              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input type="checkbox" defaultChecked />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Health score drops below:
                  </span>
                </label>
                <div className="ml-6">
                  <input
                    type="number"
                    value={healthThreshold}
                    onChange={(e) => setHealthThreshold(Number(e.target.value))}
                    className="w-20 px-3 py-1 rounded border text-sm"
                    style={{
                      background: "var(--bg-secondary)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <span className="ml-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    /100 (Current: 72)
                  </span>
                </div>
              </div>

              {/* Error Rate Trigger */}
              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input type="checkbox" defaultChecked />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Error rate exceeds:
                  </span>
                </label>
                <div className="ml-6">
                  <input
                    type="number"
                    value={errorThreshold}
                    onChange={(e) => setErrorThreshold(Number(e.target.value))}
                    className="w-20 px-3 py-1 rounded border text-sm"
                    style={{
                      background: "var(--bg-secondary)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <span className="ml-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    % (Measurement: Last 5 minutes)
                  </span>
                </div>
              </div>

              {/* Performance Trigger */}
              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input type="checkbox" defaultChecked />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Performance degrades by:
                  </span>
                </label>
                <div className="ml-6">
                  <input
                    type="number"
                    value={performanceThreshold}
                    onChange={(e) => setPerformanceThreshold(Number(e.target.value))}
                    className="w-20 px-3 py-1 rounded border text-sm"
                    style={{
                      background: "var(--bg-secondary)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <span className="ml-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    % (Response time, Throughput, CPU, Memory)
                  </span>
                </div>
              </div>

              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked />
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                  Service becomes unavailable
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Notifications & Approvals:
          </h3>
          <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--bg-primary)" }}>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked />
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                Notify on automation start
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked />
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                Notify on each stage completion
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked />
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                Notify on rollback trigger
              </span>
            </label>
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-xl p-6 mb-6" style={{ background: "var(--bg-primary)" }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Automation Summary:
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div style={{ color: "var(--text-secondary)" }}>Findings:</div>
              <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {selectedFindings.length} selected
              </div>
            </div>
            <div>
              <div style={{ color: "var(--text-secondary)" }}>Strategy:</div>
              <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {executionStrategy === "canary" && `Canary (${canaryPercentage}% → 100%)`}
                {executionStrategy === "sequential" && "Sequential rollout"}
                {executionStrategy === "parallel" && "Parallel execution"}
              </div>
            </div>
            <div>
              <div style={{ color: "var(--text-secondary)" }}>Estimated duration:</div>
              <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                ~45 minutes
              </div>
            </div>
            <div>
              <div style={{ color: "var(--text-secondary)" }}>Risk level:</div>
              <div className="font-semibold" style={{ color: "#10B981" }}>
                Low
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
              style={{
                color: "var(--text-secondary)",
                borderColor: "var(--border)",
              }}
            >
              Cancel
            </button>
            <button
              className="px-6 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
              style={{
                color: "var(--text-secondary)",
                borderColor: "var(--border)",
              }}
            >
              Save as Template
            </button>
          </div>
          <button
            onClick={() => setShowExecution(true)}
            className="px-8 py-3 rounded-lg text-base font-bold text-white transition-all hover:opacity-90"
            style={{ background: "var(--action-primary)" }}
          >
            Create Automation
          </button>
        </div>
      </div>
    </div>
  )
}
