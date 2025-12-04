"use client"

import { AlertTriangle } from "lucide-react"
import { SystemAtRiskCard } from "./system-at-risk-card"
import { EmptyState } from "./empty-state"

interface SystemAtRisk {
  name: string
  health: number
  critical: number
  high: number
  severity: "critical" | "high"
}

interface IssueStats {
  critical: number
  high: number
  medium: number
  low: number
}

interface IssuesSectionProps {
  systemsAtRisk?: SystemAtRisk[]
  stats?: IssueStats
  totalCritical?: number
  missionCriticalCount?: number
}

export function IssuesSection({
  systemsAtRisk = [],
  stats = { critical: 0, high: 0, medium: 0, low: 0 },
  totalCritical = 0,
  missionCriticalCount = 0,
}: IssuesSectionProps) {
  if (systemsAtRisk.length === 0 && totalCritical === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon="shield"
          title="No Security Issues Detected"
          description="Great job! Your systems are currently showing no critical security issues. Continue monitoring for new findings."
          actionLabel="Run Security Scan"
          onAction={() => console.log("Run scan clicked")}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Critical Issues Alert */}
      {totalCritical > 0 && (
        <div
          className="rounded-xl p-6 border-l-4"
          style={{
            background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
            borderLeftColor: "#dc2626",
            borderTop: "1px solid #fca5a5",
            borderRight: "1px solid #fca5a5",
            borderBottom: "1px solid #fca5a5",
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "#dc2626" }}
            >
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold mb-2" style={{ color: "#991b1b" }}>
                {totalCritical} Critical Security Issues Detected
              </h2>
              <p className="text-sm mb-4" style={{ color: "#7f1d1d" }}>
                {stats.critical} critical findings require immediate attention. {missionCriticalCount} mission-critical
                systems are at risk.
              </p>
              <div className="flex gap-3">
                <button
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: "#dc2626" }}
                >
                  Fix Critical Issues
                </button>
                <button
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                  style={{
                    background: "white",
                    color: "#dc2626",
                    border: "1px solid #dc2626",
                  }}
                >
                  View All Issues
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Systems at Risk */}
      {systemsAtRisk.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Systems at Risk
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {systemsAtRisk.map((system) => (
              <SystemAtRiskCard key={system.name} system={system} />
            ))}
          </div>
        </div>
      )}

      {/* Issue Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <div
          className="rounded-xl p-6"
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
          }}
        >
          <div className="text-4xl font-bold mb-2" style={{ color: "#dc2626" }}>
            {stats.critical}
          </div>
          <div className="text-sm font-medium" style={{ color: "#6b7280" }}>
            Critical Issues
          </div>
        </div>
        <div
          className="rounded-xl p-6"
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
          }}
        >
          <div className="text-4xl font-bold mb-2" style={{ color: "#f97316" }}>
            {stats.high}
          </div>
          <div className="text-sm font-medium" style={{ color: "#6b7280" }}>
            High Severity
          </div>
        </div>
        <div
          className="rounded-xl p-6"
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
          }}
        >
          <div className="text-4xl font-bold mb-2" style={{ color: "#eab308" }}>
            {stats.medium}
          </div>
          <div className="text-sm font-medium" style={{ color: "#6b7280" }}>
            Medium Severity
          </div>
        </div>
        <div
          className="rounded-xl p-6"
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
          }}
        >
          <div className="text-4xl font-bold mb-2" style={{ color: "#3b82f6" }}>
            {stats.low}
          </div>
          <div className="text-sm font-medium" style={{ color: "#6b7280" }}>
            Low Severity
          </div>
        </div>
      </div>
    </div>
  )
}
