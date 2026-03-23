"use client"

interface FlowStripViewProps {
  systemName: string
}

export function FlowStripView({ systemName }: FlowStripViewProps) {
  return (
    <div
      className="flex items-center justify-center min-h-[400px] rounded-lg border"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="text-center">
        <p className="text-lg font-medium mb-1" style={{ color: "var(--text-primary)" }}>
          Full Stack Flow View
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          System: {systemName} — Flow strip visualization coming soon
        </p>
      </div>
    </div>
  )
}
