"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Play, ChevronDown, ChevronUp, X, Info } from "lucide-react"

export function SystemComplianceDashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null)
  const [modalTab, setModalTab] = useState<"overview" | "gaps" | "controls" | "evidence">("overview")
  const [expandedGap, setExpandedGap] = useState<string | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationStep, setSimulationStep] = useState(0)
  const [showSimulationResults, setShowSimulationResults] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [applyStep, setApplyStep] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)

  // No mock data - frameworks should come from backend API
  const frameworks: Array<{
    id: string
    name: string
    required: boolean
    score: number
    controlsPassing: number
    controlsTotal: number
    gaps: number
    nextAudit: string
    description: string
    status: string
  }> = []

  // No mock data - critical gaps should come from backend API
  const criticalGaps: Array<{
    id: string
    title: string
    framework: string
    controlId: string
    severity: string
    description: string
    impact: string
    businessImpact: string
    affected: string[]
    fixes: string[]
    confidence: number
    fixTime: string
  }> = []

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pass":
        return { bg: "#10b981", text: "white", border: "#059669" }
      case "warning":
        return { bg: "#f59e0b", text: "white", border: "#d97706" }
      case "fail":
        return { bg: "#ef4444", text: "white", border: "#dc2626" }
      default:
        return { bg: "#6b7280", text: "white", border: "#4b5563" }
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return { bg: "#fef2f2", border: "#ef4444", badge: "#ef4444" }
      case "high":
        return { bg: "#fff7ed", border: "#f97316", badge: "#f97316" }
      case "medium":
        return { bg: "#fefce8", border: "#eab308", badge: "#eab308" }
      default:
        return { bg: "#f9fafb", border: "#6b7280", badge: "#6b7280" }
    }
  }

  const openModal = (frameworkId: string) => {
    console.log("[v0] Opening modal for framework:", frameworkId)
    setSelectedFramework(frameworkId)
    setIsModalOpen(true)
    setModalTab("overview")
  }

  const closeModal = () => {
    console.log("[v0] Closing modal")
    setIsModalOpen(false)
    setSelectedFramework(null)
    setShowSimulationResults(false)
    setShowSuccess(false)
  }

  const startSimulation = () => {
    setIsSimulating(true)
    setSimulationStep(0)

    const steps = [0, 1, 2, 3, 4]
    steps.forEach((step, index) => {
      setTimeout(() => {
        setSimulationStep(step + 1)
        if (step === 4) {
          setTimeout(() => {
            setIsSimulating(false)
            setShowSimulationResults(true)
          }, 500)
        }
      }, index * 800)
    })
  }

  const handleApplyFix = () => {
    setShowSimulationResults(false)
    setIsApplying(true)
    setApplyStep(0)

    const steps = [0, 1, 2, 3]
    steps.forEach((step, index) => {
      setTimeout(() => {
        setApplyStep(step + 1)
        if (step === 3) {
          setTimeout(() => {
            setIsApplying(false)
            setShowSuccess(true)
          }, 500)
        }
      }, index * 1000)
    })
  }

  const getFrameworkData = (id: string) => {
    return frameworks.find((f) => f.id === id)
  }

  console.log("[v0] Render - Modal open:", isModalOpen, "Framework:", selectedFramework)

  return (
    <div className="space-y-6">
      {/* Overall Status Card */}
      <div
        className="rounded-lg p-6 border-2"
        style={{
          background: "linear-gradient(135deg, #fff7ed 0%, #fef2f2 100%)",
          borderColor: "#fb923c",
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="text-xs font-bold mb-2" style={{ color: "#ea580c" }}>
              OVERALL COMPLIANCE STATUS
            </div>
            <div className="text-5xl font-bold mb-3" style={{ color: "#ea580c" }}>
              80%
            </div>
            <p className="text-base mb-3" style={{ color: "#7c2d12" }}>
              21 critical gaps requiring immediate attention
            </p>
            <div className="flex items-center gap-2 text-sm" style={{ color: "#9a3412" }}>
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">2 required framework(s) are non-compliant</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm mb-2" style={{ color: "#7c2d12" }}>
              20% to Full Compliance
            </div>
            <button
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ background: "#ea580c" }}
            >
              Fix All Gaps (5)
            </button>
          </div>
        </div>
      </div>

      {/* Framework Cards Grid */}
      <div className="grid grid-cols-2 gap-4">
        {frameworks.map((framework) => {
          const colors = getStatusColor(framework.status)
          return (
            <div
              key={framework.id}
              className="rounded-lg p-6 border-l-4"
              style={{
                background: "white",
                borderLeftColor: colors.border,
                borderTop: "1px solid #e5e7eb",
                borderRight: "1px solid #e5e7eb",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold" style={{ color: "#111827" }}>
                      {framework.name}
                    </h3>
                    {framework.required && (
                      <span
                        className="px-2 py-0.5 rounded text-xs font-bold text-white"
                        style={{ background: "#ef4444" }}
                      >
                        REQUIRED
                      </span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: "#6b7280" }}>
                    {framework.description}
                  </p>
                </div>
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ml-4"
                  style={{ background: colors.bg }}
                >
                  <span className="text-xl font-bold" style={{ color: colors.text }}>
                    {framework.score}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded" style={{ background: "#f9fafb" }}>
                  <div className="text-xs mb-1" style={{ color: "#6b7280" }}>
                    Controls
                  </div>
                  <div className="text-base font-semibold" style={{ color: "#111827" }}>
                    {framework.controlsPassing}/{framework.controlsTotal}
                  </div>
                </div>
                <div className="p-3 rounded" style={{ background: "#fef2f2" }}>
                  <div className="text-xs mb-1" style={{ color: "#6b7280" }}>
                    Gaps
                  </div>
                  <div className="text-base font-semibold" style={{ color: "#ef4444" }}>
                    {framework.gaps}
                  </div>
                </div>
                <div className="p-3 rounded" style={{ background: "#f9fafb" }}>
                  <div className="text-xs mb-1" style={{ color: "#6b7280" }}>
                    Next Audit
                  </div>
                  <div className="text-base font-semibold" style={{ color: "#111827" }}>
                    {framework.nextAudit}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openModal(framework.id)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105"
                  style={{
                    background: "linear-gradient(to right, #3b82f6, #2563eb)",
                    cursor: "pointer",
                    touchAction: "manipulation",
                  }}
                  type="button"
                >
                  View Evidence
                </button>
                {framework.gaps > 0 && (
                  <button
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
                    style={{ background: colors.border }}
                  >
                    Fix {framework.gaps} Gaps
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {isModalOpen &&
        selectedFramework &&
        (() => {
          const framework = getFrameworkData(selectedFramework)
          if (!framework) return null

          return (
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              style={{ background: "rgba(0, 0, 0, 0.5)" }}
              onClick={(e) => {
                // Use onClick for closing on background click
                if (e.target === e.currentTarget) {
                  closeModal()
                }
              }}
            >
              <div
                className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl"
                style={{ background: "white" }}
                onClick={(e) => e.stopPropagation()} // Prevent clicks inside modal from closing it
              >
                {/* Modal Header */}
                <div
                  className="sticky top-0 z-10 px-6 py-4 border-b flex items-center justify-between"
                  style={{ background: "white", borderColor: "#e5e7eb" }}
                >
                  <div>
                    <h2 className="text-2xl font-bold mb-1" style={{ color: "#111827" }}>
                      {framework.name} - Compliance Evidence
                    </h2>
                    <p className="text-sm" style={{ color: "#6b7280" }}>
                      Payment-Prod System • {framework.description}
                    </p>
                  </div>
                  <button
                    onClick={closeModal} // Use onClick here too
                    className="p-2 rounded-lg hover:bg-gray-100"
                    style={{ color: "#6b7280", cursor: "pointer" }}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="px-6 pt-4 border-b" style={{ borderColor: "#e5e7eb" }}>
                  <div className="flex gap-1">
                    {[
                      { id: "overview", label: "Overview" },
                      { id: "gaps", label: "Critical Gaps" },
                      { id: "controls", label: "All Controls" },
                      { id: "evidence", label: "Evidence Documentation" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setModalTab(tab.id as any)}
                        className="px-4 py-2 text-sm font-medium transition-colors relative"
                        style={{
                          color: modalTab === tab.id ? "#3b82f6" : "#6b7280",
                        }}
                      >
                        {tab.label}
                        {modalTab === tab.id && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: "#3b82f6" }} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Modal Content */}
                <div className="p-6">
                  {/* Overview Tab */}
                  {modalTab === "overview" && (
                    <div className="space-y-6">
                      {/* Score Circle */}
                      <div className="text-center py-8">
                        <div
                          className="inline-flex w-48 h-48 rounded-full items-center justify-center mb-4"
                          style={{
                            background: `conic-gradient(${getStatusColor(framework.status).bg} ${framework.score}%, #e5e7eb ${framework.score}%)`,
                          }}
                        >
                          <div className="w-40 h-40 rounded-full bg-white flex items-center justify-center">
                            <div className="text-5xl font-bold" style={{ color: "#111827" }}>
                              {framework.score}%
                            </div>
                          </div>
                        </div>
                        <h3 className="text-xl font-bold mb-2" style={{ color: "#111827" }}>
                          Current Compliance Score
                        </h3>
                        <p className="text-sm" style={{ color: "#6b7280" }}>
                          {framework.controlsPassing} of {framework.controlsTotal} controls passing
                        </p>
                      </div>

                      {/* Quick Actions */}
                      <div className="grid grid-cols-3 gap-4 mt-8">
                        <div className="p-4 rounded-lg border text-left" style={{ borderColor: "#e5e7eb" }}>
                          <div className="text-2xl font-bold mb-1" style={{ color: "#ef4444" }}>
                            {framework.gaps}
                          </div>
                          <div className="text-sm" style={{ color: "#6b7280" }}>
                            Critical Gaps
                          </div>
                        </div>
                        <div className="p-4 rounded-lg border text-left" style={{ borderColor: "#e5e7eb" }}>
                          <div className="text-2xl font-bold mb-1" style={{ color: "#10b981" }}>
                            {framework.controlsPassing}
                          </div>
                          <div className="text-sm" style={{ color: "#6b7280" }}>
                            Controls Passing
                          </div>
                        </div>
                        <div className="p-4 rounded-lg border text-left" style={{ borderColor: "#e5e7eb" }}>
                          <div className="text-2xl font-bold mb-1" style={{ color: "#3b82f6" }}>
                            {framework.nextAudit}
                          </div>
                          <div className="text-sm" style={{ color: "#6b7280" }}>
                            Next Audit
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Critical Gaps Tab */}
                  {modalTab === "gaps" && (
                    <div className="space-y-4">
                      {criticalGaps
                        .filter((gap) => gap.framework === framework.name)
                        .map((gap) => {
                          const colors = getSeverityColor(gap.severity)
                          const isExpanded = expandedGap === gap.id

                          return (
                            <div
                              key={gap.id}
                              className="rounded-lg p-5 border-l-4"
                              style={{
                                background: colors.bg,
                                borderLeftColor: colors.border,
                                borderTop: "1px solid #e5e7eb",
                                borderRight: "1px solid #e5e7eb",
                                borderBottom: "1px solid #e5e7eb",
                              }}
                            >
                              {/* Gap content - same as main view */}
                              <div className="flex items-center gap-2 mb-3">
                                <span
                                  className="px-2.5 py-1 rounded text-xs font-bold text-white uppercase"
                                  style={{ background: colors.badge }}
                                >
                                  {gap.severity}
                                </span>
                                <span
                                  className="px-2.5 py-1 rounded text-xs font-medium"
                                  style={{ background: "#f3e8ff", color: "#7c3aed" }}
                                >
                                  {gap.framework}
                                </span>
                                <span
                                  className="px-2.5 py-1 rounded text-xs font-medium"
                                  style={{ background: "#f3f4f6", color: "#6b7280" }}
                                >
                                  {gap.controlId}
                                </span>
                              </div>

                              <h3 className="text-lg font-bold mb-2" style={{ color: "#111827" }}>
                                {gap.title}
                              </h3>
                              <p className="text-sm mb-4" style={{ color: "#4b5563" }}>
                                {gap.description}
                              </p>

                              {/* Current vs Desired State */}
                              <button
                                onClick={() => setExpandedGap(isExpanded ? null : gap.id)}
                                className="w-full text-left p-3 rounded-lg mb-4 flex items-center justify-between transition-colors"
                                style={{ background: "#eff6ff", color: "#1e40af" }}
                              >
                                <span className="text-sm font-semibold">View Current vs Desired State</span>
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>

                              {isExpanded && (
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                  <div
                                    className="p-4 rounded-lg border"
                                    style={{ borderColor: "#fee2e2", background: "#fef2f2" }}
                                  >
                                    <div className="text-xs font-bold mb-2" style={{ color: "#991b1b" }}>
                                      CURRENT STATE
                                    </div>
                                    <div className="text-sm" style={{ color: "#7f1d1d" }}>
                                      {gap.description}
                                    </div>
                                  </div>
                                  <div
                                    className="p-4 rounded-lg border"
                                    style={{ borderColor: "#d1fae5", background: "#d1fae5" }}
                                  >
                                    <div className="text-xs font-bold mb-2" style={{ color: "#065f46" }}>
                                      DESIRED STATE
                                    </div>
                                    <ul className="space-y-1">
                                      {gap.fixes.map((fix, idx) => (
                                        <li
                                          key={idx}
                                          className="text-sm flex items-start gap-2"
                                          style={{ color: "#047857" }}
                                        >
                                          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                          <span>{fix}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              )}

                              {/* Action Buttons */}
                              <div className="flex items-center justify-between">
                                <span
                                  className="px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5"
                                  style={{ background: "#d1fae5", color: "#065f46" }}
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  {gap.confidence}% Confidence
                                </span>

                                <div className="flex gap-2">
                                  <button
                                    onClick={startSimulation}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 flex items-center gap-2"
                                    style={{ background: "#7c3aed" }}
                                  >
                                    <Play className="w-4 h-4" />
                                    Simulate Fix
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}

                  {/* All Controls Tab */}
                  {modalTab === "controls" && (
                    <div>
                      <div className="mb-4">
                        <input
                          type="text"
                          placeholder="Search controls..."
                          className="w-full px-4 py-2 rounded-lg border"
                          style={{ borderColor: "#e5e7eb" }}
                        />
                      </div>
                      <div className="border rounded-lg" style={{ borderColor: "#e5e7eb" }}>
                        <table className="w-full">
                          <thead style={{ background: "#f9fafb" }}>
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "#6b7280" }}>
                                CONTROL ID
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "#6b7280" }}>
                                DESCRIPTION
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "#6b7280" }}>
                                STATUS
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {[1, 2, 3, 4, 5].map((i) => (
                              <tr key={i} className="border-t" style={{ borderColor: "#e5e7eb" }}>
                                <td className="px-4 py-3 text-sm font-mono" style={{ color: "#111827" }}>
                                  Req {i}.1.{i}
                                </td>
                                <td className="px-4 py-3 text-sm" style={{ color: "#4b5563" }}>
                                  Control description example
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className="px-2 py-1 rounded text-xs font-semibold"
                                    style={{ background: "#d1fae5", color: "#065f46" }}
                                  >
                                    PASSING
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Evidence Documentation Tab */}
                  {modalTab === "evidence" && (
                    <div className="space-y-4">
                      <div
                        className="p-4 rounded-lg border flex items-start gap-3"
                        style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}
                      >
                        <Info className="w-5 h-5 mt-0.5" style={{ color: "#1e40af" }} />
                        <div>
                          <div className="font-semibold mb-1" style={{ color: "#1e40af" }}>
                            Auditor-Ready Documentation
                          </div>
                          <div className="text-sm" style={{ color: "#1e40af" }}>
                            All evidence is automatically collected and formatted for audit purposes.
                          </div>
                        </div>
                      </div>

                      {[
                        "Control Implementation Evidence",
                        "Configuration Snapshots",
                        "Change History & Audit Logs",
                        "Remediation Documentation",
                      ].map((doc, idx) => (
                        <button
                          key={idx}
                          className="w-full p-4 rounded-lg border text-left hover:border-blue-500 transition-colors flex items-center justify-between"
                          style={{ borderColor: "#e5e7eb" }}
                        >
                          <span className="font-medium" style={{ color: "#111827" }}>
                            {doc}
                          </span>
                          <span className="text-sm" style={{ color: "#3b82f6" }}>
                            Download PDF →
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t px-6 py-4 flex justify-end gap-3" style={{ borderColor: "#e5e7eb" }}>
                  <button
                    onClick={closeModal}
                    className="px-6 py-2 rounded-lg border font-semibold"
                    style={{ borderColor: "#e5e7eb", color: "#6b7280" }}
                  >
                    Close
                  </button>
                  <button className="px-6 py-2 rounded-lg font-semibold text-white" style={{ background: "#10b981" }}>
                    Apply All Safe Fixes
                  </button>
                </div>

                {/* Simulation Modal */}
                {isSimulating && (
                  <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-white rounded-xl p-8 max-w-md w-full">
                      <h3 className="text-xl font-bold mb-4" style={{ color: "#111827" }}>
                        Running Simulation...
                      </h3>
                      <div className="space-y-3">
                        {[
                          "Preparing simulation environment",
                          "Analyzing current configuration",
                          "Applying proposed changes",
                          "Testing system behavior",
                          "Calculating confidence score",
                        ].map((step, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            {simulationStep > idx ? (
                              <CheckCircle2 className="w-5 h-5" style={{ color: "#10b981" }} />
                            ) : simulationStep === idx ? (
                              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: "#e5e7eb" }} />
                            )}
                            <span className="text-sm" style={{ color: simulationStep >= idx ? "#111827" : "#9ca3af" }}>
                              {step}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Simulation Results */}
                {showSimulationResults && (
                  <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl p-8 max-w-2xl w-full">
                      <div className="text-center mb-6">
                        <div
                          className="inline-flex w-24 h-24 rounded-full items-center justify-center mb-4"
                          style={{ background: "#d1fae5" }}
                        >
                          <CheckCircle2 className="w-12 h-12" style={{ color: "#059669" }} />
                        </div>
                        <h3 className="text-2xl font-bold mb-2" style={{ color: "#111827" }}>
                          Simulation Complete
                        </h3>
                        <p className="text-sm" style={{ color: "#6b7280" }}>
                          Safe to apply with 98% confidence
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="p-4 rounded-lg" style={{ background: "#f9fafb" }}>
                          <div className="text-xs font-semibold mb-1" style={{ color: "#6b7280" }}>
                            ESTIMATED FIX TIME
                          </div>
                          <div className="text-2xl font-bold" style={{ color: "#111827" }}>
                            2 hours
                          </div>
                        </div>
                        <div className="p-4 rounded-lg" style={{ background: "#d1fae5" }}>
                          <div className="text-xs font-semibold mb-1" style={{ color: "#065f46" }}>
                            SERVICES AFFECTED
                          </div>
                          <div className="text-2xl font-bold" style={{ color: "#059669" }}>
                            0
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowSimulationResults(false)}
                          className="flex-1 px-4 py-2 rounded-lg border"
                          style={{ borderColor: "#e5e7eb", color: "#6b7280" }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleApplyFix}
                          className="flex-1 px-4 py-2 rounded-lg text-white font-semibold"
                          style={{ background: "#10b981" }}
                        >
                          Apply Fix
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Apply Progress */}
                {isApplying && (
                  <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-white rounded-xl p-8 max-w-md w-full">
                      <h3 className="text-xl font-bold mb-4" style={{ color: "#111827" }}>
                        Applying Fix...
                      </h3>
                      <div className="space-y-3">
                        {[
                          "Creating checkpoint",
                          "Applying configuration",
                          "Validating changes",
                          "Running health checks",
                        ].map((step, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            {applyStep > idx ? (
                              <CheckCircle2 className="w-5 h-5" style={{ color: "#10b981" }} />
                            ) : applyStep === idx ? (
                              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: "#e5e7eb" }} />
                            )}
                            <span className="text-sm" style={{ color: applyStep >= idx ? "#111827" : "#9ca3af" }}>
                              {step}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Success Screen */}
                {showSuccess && (
                  <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl p-8 max-w-md w-full text-center">
                      <div
                        className="inline-flex w-24 h-24 rounded-full items-center justify-center mb-4"
                        style={{ background: "#d1fae5" }}
                      >
                        <CheckCircle2 className="w-12 h-12" style={{ color: "#059669" }} />
                      </div>
                      <h3 className="text-2xl font-bold mb-2" style={{ color: "#111827" }}>
                        Fix Applied Successfully!
                      </h3>
                      <p className="text-sm mb-6" style={{ color: "#6b7280" }}>
                        Compliance score will be updated in the next scan
                      </p>
                      <button
                        onClick={closeModal}
                        className="w-full px-4 py-2 rounded-lg text-white font-semibold"
                        style={{ background: "#10b981" }}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
    </div>
  )
}
