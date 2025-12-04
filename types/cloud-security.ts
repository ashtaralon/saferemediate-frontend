export interface CloudNode {
  id: string
  type: "ec2" | "lambda" | "rds" | "s3" | "alb" | "vpc" | "subnet" | "sg"
  name: string
  x: number
  y: number
  health: "healthy" | "warning" | "critical"
  metrics?: {
    cpu?: string
    memory?: string
    network?: string
  }
  details?: {
    instanceType?: string
    ip?: string
    size?: string
    objects?: string
  }
}

export interface CloudEdge {
  from: string
  to: string
  label: string
  bandwidth: string
  risk: "low" | "medium" | "high" | "critical"
}

export interface SecurityIssue {
  id: string
  title: string
  severity: "critical" | "high" | "medium" | "low"
  confidence: number
  affectedResource: string
  description?: string
}

export interface Checkpoint {
  id: string
  date: string
  time: string
  changes: number
  status: "stable" | "incident" | "rollback"
  healthScore: number
  author: string
  x: number
}

export interface AutomationRule {
  id: string
  name: string
  enabled: boolean
  targetSystems: string[]
  systemTags: string[]
  minSeverity: string
  minConfidence: number
  useCanary: boolean
  canaryPercentage: number
  createSnapshot: boolean
  autoRollback: boolean
  rollbackWindow: number
  schedule: string
  lastRun?: string
  nextRun?: string
  successRate: number
  issuesFixed: number
}
