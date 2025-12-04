"use client"

import { Database, FileQuestion, Shield, Users } from "lucide-react"

interface EmptyStateProps {
  icon?: "database" | "file" | "shield" | "users"
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon = "database", title, description, actionLabel, onAction }: EmptyStateProps) {
  const icons = {
    database: Database,
    file: FileQuestion,
    shield: Shield,
    users: Users,
  }

  const Icon = icons[icon]

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ background: "rgba(59, 130, 246, 0.1)" }}
      >
        <Icon className="w-10 h-10" style={{ color: "#3b82f6" }} />
      </div>
      <h3 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
        {title}
      </h3>
      <p className="text-sm text-center max-w-md mb-6" style={{ color: "var(--text-secondary)" }}>
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: "#3b82f6" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
