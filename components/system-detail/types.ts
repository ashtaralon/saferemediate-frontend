export interface SystemDetailDashboardProps {
  systemName: string
  onBack: () => void
}

export interface GapAnalysis {
  allowed: number
  actual: number
  gap: number
  gapPercent: number
  confidence?: number
}

export interface AutoTagStatus {
  status: "running" | "stopped" | "error"
  totalCycles: number
  actualTrafficCaptured: number
  lastSync: string
}

export interface SeverityCounts {
  critical: number
  high: number
  medium: number
  passing: number
}

export interface ResourceType {
  name: string
  count: number
  icon: any
  color: string
  description: string
}

export interface Issue {
  id: string
  title: string
  severity: "critical" | "high" | "medium" | "low"
  description: string
  selected: boolean
  icon?: string
}

export interface TagForm {
  environment: string
  criticality: string
}

export interface TagResult {
  success: boolean
  tagged?: number
  total?: number
  failed?: number
  tags_applied?: Record<string, string>
  error?: string
}







