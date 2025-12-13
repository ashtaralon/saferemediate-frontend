export interface InfrastructureResource {
  id: string
  name: string
  type: string
  provider: string
  region: string
  status: "running" | "stopped" | "terminated" | "pending"
  healthScore: number
  criticalIssues: number
  highIssues: number
  mediumIssues: number
  lowIssues: number
  complianceScore: number
  tags: Record<string, string>
  lastScanned: string
  owner?: string
}

export interface InfrastructureStats {
  avgHealthScore: number
  healthTrend: number
  needsAttention: number
  totalIssues: number
  criticalIssues: number
  avgScore: number
  scoreTrend: number
  lastScanTime: string
}

export interface InfrastructureSummary {
  containerClusters: number
  kubernetesWorkloads: number
  vms: number
  vmScalingGroups: number
  databases: number
  blockStorage: number
  fileStorage: number
  objectStorage: number
}

export interface ComplianceIssue {
  systemName: string
  systemId: string
  criticalGaps: number
  totalControls: number
  owner: string
  complianceScore: number
}

export interface SecurityFinding {
  id: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  title: string
  resource: string
  resourceType: string
  description: string
  remediation?: string
  category: string
  discoveredAt: string
  status: "open" | "simulated" | "approved" | "executing" | "remediated" | "failed" | "rolled_back" | "resolved" | "suppressed"

  // IAM-specific fields (populated for IAM findings)
  type?: "iam" | "security_group" | "s3" | "network" | string
  iam_issue_id?: string  // Link to IAM issue in pipeline
  observed_actions?: string[]  // Actions actually used (from CloudTrail)
  allowed_actions?: string[]   // Actions allowed by policy
  unused_actions?: string[]    // allowed - observed
  confidence?: number          // Detection confidence (0-100)
  metadata?: {
    gap?: number
    allowed?: number
    actual?: number
    risk_score?: number
    last_used?: string | null
    permissions_level?: string
    [key: string]: any
  }
}

export interface SecurityData {
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    total: number
  }
  findings: SecurityFinding[]
}

export interface InfrastructureData {
  stats: InfrastructureStats
  summary: InfrastructureSummary
  resources: InfrastructureResource[]
  complianceIssues: ComplianceIssue[]
  securityIssues: {
    critical: number
    high: number
    medium: number
    low: number
  }
  securityFindings?: SecurityFinding[]
  trendsData: {
    newIssues: Array<{ date: string; count: number }>
    resolvedIssues: Array<{ date: string; count: number }>
    openIssues: Array<{ date: string; count: number }>
  }
}
