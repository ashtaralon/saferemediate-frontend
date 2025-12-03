"use client"

import { Zap } from "lucide-react"
import { EmptyState } from "./empty-state"

export function AutomationSection() {
  const hasAutomation = false // Set to true when data exists

  if (!hasAutomation) {
    return (
      <div
        className="rounded-xl p-6 border"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6" style={{ color: "#3b82f6" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Automation & Workflows
            </h2>
          </div>
        </div>
        <EmptyState
          icon="shield"
          title="No Automated Workflows"
          description="Set up automated remediation workflows to fix security issues automatically. Create rules, schedules, and approval chains for your security operations."
          actionLabel="Create Workflow"
          onAction={() => console.log("Create workflow clicked")}
        />
      </div>
    )
  }

  // When data exists
  return (
    <div
      className="rounded-xl p-6 border"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
        Automation & Workflows
      </h2>
      {/* Automation content will go here */}
    </div>
  )
}
