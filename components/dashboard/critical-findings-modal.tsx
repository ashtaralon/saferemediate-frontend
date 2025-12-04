"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { BulkAutomationModal } from "./bulk-automation-modal"

interface Finding {
  id: string
  severity: "critical" | "high" | "medium" | "low"
  icon?: string
  title: string
  impact?: string
  description?: string
  confidence: number
  isNew?: boolean
  borderColor?: string
  resource?: string
  resourceType?: string
}

interface CriticalFindingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSimulateFix: (finding: Finding) => void
  onAutoFix?: (finding: Finding) => void
  findings?: Finding[] // Accept findings as props instead of hardcoding
}

export function CriticalFindingsModal({ isOpen, onClose, onSimulateFix, onAutoFix, findings = [] }: CriticalFindingsModalProps) {
  const [activeTab, setActiveTab] = useState<"all" | "critical" | "high" | "medium">("all")
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set())
  const [showBulkAutomation, setShowBulkAutomation] = useState(false)

  // Map findings to include default values - CRITICAL: ensure title always exists
  const mappedFindings: Finding[] = findings.map(f => ({
    ...f,
    title: f.title || f.description || f.impact || "Security Finding", // Ensure title always exists
    icon: f.icon || "⚠️",
    impact: f.impact || f.description || "Security issue detected",
    isNew: f.isNew ?? false,
    borderColor: f.borderColor || (f.severity === "critical" ? "#DC2626" : f.severity === "high" ? "#F97316" : "#F59E0B"),
  }))

  const criticalCount = mappedFindings.filter((f) => f.severity === "critical").length
  const highCount = mappedFindings.filter((f) => f.severity === "high").length

  const toggleFindingSelection = (id: string) => {
    const newSelected = new Set(selectedFindings)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedFindings(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedFindings.size === mappedFindings.length && mappedFindings.length > 0) {
      setSelectedFindings(new Set())
    } else {
      setSelectedFindings(new Set(mappedFindings.map((f) => f.id)))
    }
  }

  const getSelectedFindingObjects = () => {
    return mappedFindings.filter((f) => selectedFindings.has(f.id))
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/85" onClick={onClose} />

        {/* Modal */}
        <div
          className="relative w-[900px] max-h-[80vh] overflow-hidden rounded-2xl p-8 shadow-2xl"
          style={{ background: "var(--bg-secondary)" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
                Critical Findings
              </h2>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {mappedFindings.length === 0 
                  ? "No issues detected" 
                  : `${criticalCount} issue${criticalCount !== 1 ? 's' : ''} requiring immediate attention`}
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

          <div className="flex items-center gap-4 mb-4">
            {mappedFindings.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedFindings.size === mappedFindings.length && mappedFindings.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Select All
                </span>
              </label>
            )}

            {selectedFindings.size > 0 && (
              <>
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {selectedFindings.size} selected
                </span>
                <button
                  onClick={() => setShowBulkAutomation(true)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: "var(--action-primary)" }}
                >
                  Create Automation
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
                  style={{
                    color: "var(--text-secondary)",
                    borderColor: "var(--border)",
                  }}
                >
                  Bulk Actions
                </button>
              </>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mb-6 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            {[
              { key: "all", label: "All", count: mappedFindings.length },
              { key: "critical", label: "Critical", count: criticalCount },
              { key: "high", label: "High", count: highCount },
              { key: "medium", label: "Medium", count: mappedFindings.filter(f => f.severity === "medium").length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className="px-4 py-3 text-sm font-medium transition-colors relative"
                style={{
                  color: activeTab === tab.key ? "var(--action-primary)" : "var(--text-secondary)",
                }}
              >
                {tab.label} ({tab.count})
                {activeTab === tab.key && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ background: "var(--action-primary)" }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Findings List */}
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
            {mappedFindings.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-lg font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                  No Critical Findings
                </p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  All security checks passed. Your infrastructure is secure.
                </p>
              </div>
            ) : (
              mappedFindings
                .filter((f) => activeTab === "all" || f.severity === activeTab)
                .map((finding) => (
                <div
                  key={finding.id}
                  className={`rounded-xl p-6 border-l-8 transition-all cursor-pointer ${
                    selectedFindings.has(finding.id) ? "ring-2 ring-purple-500" : ""
                  }`}
                  style={{
                    background: "#2d3548",
                    borderLeftColor: finding.borderColor,
                  }}
                  onClick={() => toggleFindingSelection(finding.id)}
                >
                  <div className="flex items-start gap-4 mb-3">
                    <input
                      type="checkbox"
                      checked={selectedFindings.has(finding.id)}
                      onChange={() => toggleFindingSelection(finding.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 w-4 h-4"
                    />
                    <span className="text-3xl">{finding.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                          {finding.title}
                        </h3>
                        {finding.isNew && (
                          <span
                            className="px-2 py-1 rounded-full text-xs font-semibold text-white"
                            style={{ background: "var(--action-primary)" }}
                          >
                            NEW
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                        Impact: {finding.impact}
                      </p>
                    </div>
                  </div>

                  {/* Confidence Badge */}
                  <div
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border mb-4"
                    style={{
                      background: "rgba(16, 185, 129, 0.15)",
                      borderColor: "rgba(16, 185, 129, 0.3)",
                      color: "#10B981",
                    }}
                  >
                    <span>✅</span>
                    <span className="text-sm font-semibold">SAFE TO FIX • {finding.confidence}% confidence</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onSimulateFix(finding)}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
                      style={{ background: "var(--action-primary)" }}
                    >
                      ▶ SIMULATE FIX
                    </button>
                    {onAutoFix && (
                      <button
                        onClick={() => onAutoFix(finding)}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
                        style={{ background: "#10B981" }}
                      >
                        AUTO-FIX
                      </button>
                    )}
                    <button
                      className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
                      style={{
                        color: "var(--text-secondary)",
                        borderColor: "var(--border)",
                      }}
                    >
                      DETAILS
                    </button>
                    <button
                      className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      ⋮
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between mt-6 pt-6 border-t"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex gap-3">
              <button
                className="px-6 py-3 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
                style={{ background: "var(--action-primary)" }}
              >
                Fix All Critical Issues
              </button>
              <button
                className="px-6 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
                style={{
                  color: "var(--text-secondary)",
                  borderColor: "var(--border)",
                }}
              >
                Export Report
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: "var(--text-secondary)" }}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <BulkAutomationModal
        isOpen={showBulkAutomation}
        onClose={() => setShowBulkAutomation(false)}
        selectedFindings={getSelectedFindingObjects()}
      />
    </>
  )
}
