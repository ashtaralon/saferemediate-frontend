"use client"

import { Plug } from "lucide-react"
import { EmptyState } from "./empty-state"

export function IntegrationsSection() {
  const hasIntegrations = false // Set to true when data exists

  if (!hasIntegrations) {
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
            <Plug className="w-6 h-6" style={{ color: "#3b82f6" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Integrations
            </h2>
          </div>
        </div>
        <EmptyState
          icon="shield"
          title="No Integrations Connected"
          description="Connect your cloud providers, security tools, and monitoring services to start analyzing your infrastructure."
          actionLabel="Add Integration"
          onAction={() => console.log("Add integration clicked")}
        />
      </div>
    )
  }

  // When data exists, show integrations
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
        Integrations
      </h2>
      {/* Integration content will go here */}
    </div>
  )
}
