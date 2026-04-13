"use client"

interface SeverityBadgeProps {
  severity: string
  score?: number
  size?: "sm" | "md" | "lg"
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  CRITICAL: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", border: "rgba(239, 68, 68, 0.5)", glow: "0 0 12px rgba(239, 68, 68, 0.3)" },
  HIGH: { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316", border: "rgba(249, 115, 22, 0.5)", glow: "0 0 12px rgba(249, 115, 22, 0.3)" },
  MEDIUM: { bg: "rgba(234, 179, 8, 0.15)", text: "#eab308", border: "rgba(234, 179, 8, 0.5)", glow: "none" },
  LOW: { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e", border: "rgba(34, 197, 94, 0.5)", glow: "none" },
}

export function SeverityBadge({ severity, score, size = "md" }: SeverityBadgeProps) {
  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.LOW
  const sizeClasses = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-0.5",
    lg: "text-sm px-3 py-1",
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full ${sizeClasses[size]}`}
      style={{
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        boxShadow: colors.glow,
      }}
    >
      {severity}
      {score !== undefined && <span className="opacity-70">({score})</span>}
    </span>
  )
}
