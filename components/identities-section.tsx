"use client"

import { Key } from "lucide-react"
import { EmptyState } from "./empty-state"

export function IdentitiesSection() {
  const hasIdentities = false // Set to true when data exists

  if (!hasIdentities) {
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
            <Key className="w-6 h-6" style={{ color: "#3b82f6" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Identities & Access
            </h2>
          </div>
        </div>
        <EmptyState
          icon="users"
          title="No Identity Data Available"
          description="Identity and access management data will appear here once your integrations are configured. Track users, roles, permissions, and access policies."
          actionLabel="Configure IAM Scanning"
          onAction={() => console.log("Configure IAM clicked")}
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
        Identities & Access
      </h2>
      {/* Identity content will go here */}
    </div>
  )
}
