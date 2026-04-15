import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert a 0-100 risk / damage score to a human label + color. Higher = worse. */
export function riskLabel(score: number): { label: string; color: string } {
  if (score <= 15) return { label: "Minimal", color: "#22c55e" }
  if (score <= 40) return { label: "Low", color: "#eab308" }
  if (score <= 70) return { label: "Medium", color: "#f97316" }
  return { label: "High", color: "#ef4444" }
}

/** Convert a 0-100 health score to a human label + color. Higher = better. */
export function healthLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Healthy", color: "#22c55e" }
  if (score >= 60) return { label: "Fair", color: "#eab308" }
  if (score >= 40) return { label: "At Risk", color: "#f97316" }
  return { label: "Critical", color: "#ef4444" }
}
