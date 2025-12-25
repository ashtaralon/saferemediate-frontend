/**
 * Least Privilege Type System
 * 
 * End-to-end type definitions for data-driven Least Privilege enforcement.
 * These types support the full lifecycle: Evidence → Analysis → Simulation → Enforcement → Rollback
 */

// ============================================================================
// IAM POLICY TYPES
// ============================================================================

export interface IAMPolicyStatement {
  Sid?: string
  Effect: "Allow" | "Deny"
  Principal?: string | string[] | { Service: string | string[] } | { AWS: string | string[] }
  NotPrincipal?: string | string[]
  Action?: string | string[]
  NotAction?: string | string[]
  Resource?: string | string[]
  NotResource?: string | string[]
  Condition?: Record<string, Record<string, string | string[]>>
}

export interface IAMPolicyDocument {
  Version: "2012-10-17" | "2008-10-17"
  Id?: string
  Statement: IAMPolicyStatement[]
}

// ============================================================================
// IDENTITY TYPES
// ============================================================================

export type IdentityType = 
  | "IAMRole"           // Primary focus
  | "IAMUser"           // Legacy / exception handling
  | "ServiceLinkedRole" // AWS-managed roles
  | "CrossAccountRole"  // Cross-account access
  | "K8sServiceAccount" // IRSA / OIDC

export interface Identity {
  id: string
  type: IdentityType
  name: string
  arn: string
  accountId: string
  systemName: string
  createdAt: string
  lastActivity?: string
  
  // System context
  isShared: boolean        // Shared across systems or dedicated
  isDedicated: boolean     // Single-system identity
  systemCount: number      // How many systems use this identity
  
  // Permission summary
  totalPermissions: number
  usedPermissions: number
  unusedPermissions: number
  
  // Risk indicators
  hasWildcardPermissions: boolean
  hasAdminPermissions: boolean
  hasPassRolePermissions: boolean
  
  // Least Privilege score (0-100, higher = better)
  lpScore: number
}

// ============================================================================
// PERMISSION CLASSIFICATION
// ============================================================================

export type PermissionStatus = 
  | "ACTIVE_REQUIRED"      // Active & Required - keep
  | "ACTIVE_ANOMALOUS"     // Active but Anomalous - investigate
  | "INACTIVE_NEEDED"      // Inactive but Potentially Needed - caution
  | "INACTIVE_SAFE"        // Inactive & Safe to Remove - remediate

export interface Permission {
  action: string           // e.g., "s3:GetObject"
  resource: string         // ARN or wildcard
  status: PermissionStatus
  
  // Evidence
  lastUsed?: string
  usageCount90d: number
  firstSeen: string
  
  // Risk assessment
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  riskReasons: string[]
  
  // Dependency context
  requiredByServices: string[]
  usedInCriticalPath: boolean
  
  // Confidence in classification
  classificationConfidence: number  // 0-100
}

// ============================================================================
// EVIDENCE COLLECTION
// ============================================================================

export type DataSource = 
  | "CloudTrail"          // API activity
  | "AccessAdvisor"       // IAM Access Advisor
  | "VPCFlowLogs"         // Network evidence
  | "ResourcePolicies"    // S3, KMS, etc.
  | "TrustPolicies"       // IAM trust relationships
  | "ConfigSnapshots"     // AWS Config
  | "CustomGraph"         // Our dependency graph

export interface EvidenceSource {
  type: DataSource
  enabled: boolean
  coverage: {
    regions: string[]
    complete: boolean
    percentComplete: number
  }
  lastSync: string
  observationDays: number
  recordCount: number
}

export interface Evidence {
  identityId: string
  permission: string
  
  // Temporal signals
  lastUsed?: string
  firstSeen: string
  usageFrequency: "NONE" | "LOW" | "MEDIUM" | "HIGH"
  usageCount90d: number
  
  // Sources
  sources: DataSource[]
  sourceDetails: Record<DataSource, {
    lastSeen?: string
    confidence: number
    recordCount: number
  }>
  
  // Context
  usedBy: string[]         // Which services/processes used this
  usedFrom: string[]       // Which IPs/regions
  usedIn: string[]         // Which systems
  
  // Confidence
  overallConfidence: number  // 0-100
  dataCompleteness: number   // 0-100
}

// ============================================================================
// SYSTEM-AWARE ANALYSIS
// ============================================================================

export interface SystemContext {
  systemName: string
  systemId: string
  
  // Identity relationships
  identities: Identity[]
  sharedIdentities: Identity[]
  dedicatedIdentities: Identity[]
  
  // Resource relationships
  resources: string[]      // ARNs of resources accessed
  services: string[]       // AWS services used
  
  // Dependencies
  dependsOn: string[]      // Other systems this depends on
  dependedBy: string[]     // Other systems depending on this
  
  // Criticality
  tier: "PRODUCTION" | "STAGING" | "DEVELOPMENT" | "SANDBOX"
  revenueGenerating: boolean
  complianceFrameworks: string[]
}

export interface PermissionAnalysis {
  identityId: string
  identityName: string
  identityType: IdentityType
  systemContext: SystemContext
  
  // Permission breakdown
  totalPermissions: number
  permissions: Permission[]
  
  // Classification summary
  activeRequired: number
  activeAnomalous: number
  inactiveNeeded: number
  inactiveSafe: number
  
  // Evidence summary
  evidenceSources: EvidenceSource[]
  observationDays: number
  dataCompleteness: number
  
  // Confidence
  analysisConfidence: number  // 0-100
  confidenceFactors: {
    timeWindow: number      // Observation period quality
    sourceCount: number     // Number of data sources
    coverage: number        // Data coverage %
    systemContext: number   // System understanding quality
  }
  
  // Recommendations
  recommendations: PermissionRecommendation[]
}

export interface PermissionRecommendation {
  id: string
  type: "REMOVE" | "NARROW" | "RESTRICT_CONDITION" | "SPLIT_ROLE"
  
  // What to change
  currentPermissions: string[]
  proposedPermissions: string[]
  
  // Impact
  impactedServices: string[]
  impactedSystems: string[]
  breakageRisk: "NONE" | "LOW" | "MEDIUM" | "HIGH"
  
  // Confidence
  confidence: number  // 0-100
  confidenceThreshold: "HIGH" | "MEDIUM" | "LOW"
  
  // Decision
  recommendedAction: "AUTO_APPLY" | "CANARY" | "APPROVAL_REQUIRED" | "MANUAL_ONLY"
  
  // Evidence
  evidenceSummary: string
  lastUsageDate?: string
  observationDays: number
}

// ============================================================================
// SIMULATION & SAFETY GATES
// ============================================================================

export interface SimulationRequest {
  identityId: string
  identityArn: string
  currentPolicy: IAMPolicyDocument       // IAM policy document
  proposedPolicy: IAMPolicyDocument      // Proposed IAM policy document
  
  // Change context
  changeType: "REMOVE_PERMISSIONS" | "NARROW_RESOURCES" | "ADD_CONDITIONS" | "FULL_REPLACE"
  affectedPermissions: string[]
  
  // Simulation config
  validateCriticalPaths: boolean
  validateDependencies: boolean
  validateResourceAccess: boolean
}

export interface SimulationResult {
  status: "SAFE" | "CAUTION" | "RISKY" | "BLOCKED"
  
  // Reachability analysis
  reachabilityPreserved: number  // 0-1 (percentage)
  criticalPathsAffected: string[]
  
  // Access impact
  permissionsTested: number
  permissionsSafe: number
  permissionsRisky: number
  
  // Service impact
  servicesTested: string[]
  servicesImpacted: string[]
  
  // Warnings & errors
  warnings: string[]
  errors: string[]
  blockingIssues: string[]
  
  // Confidence
  simulationConfidence: number  // 0-100
  
  // Recommendations
  safeToApply: boolean
  requiresCanary: boolean
  requiresApproval: boolean
}

// ============================================================================
// CONFIDENCE SCORING
// ============================================================================

export interface ConfidenceScore {
  overall: number  // 0-100, final confidence score
  
  // Component scores
  components: {
    usageEvidence: number       // Evidence of non-usage
    timeCoverage: number        // Observation period quality
    sourceCompleteness: number  // Data source coverage
    systemContext: number       // System understanding
    simulation: number          // Simulation results
    historicalData: number      // Past remediation outcomes
  }
  
  // Weights used
  weights: {
    usageEvidence: number
    timeCoverage: number
    sourceCompleteness: number
    systemContext: number
    simulation: number
    historicalData: number
  }
  
  // Decision thresholds
  thresholds: {
    autoApply: number      // >= this = auto-apply
    canary: number         // >= this = canary deployment
    approval: number       // >= this = approval required
    // < approval = blocked
  }
  
  // Recommended action based on score
  recommendedAction: "AUTO_APPLY" | "CANARY" | "APPROVAL_REQUIRED" | "BLOCKED"
  
  // Explanation
  factors: string[]
  warnings: string[]
}

// ============================================================================
// ENFORCEMENT
// ============================================================================

export interface EnforcementRequest {
  identityId: string
  identityArn: string
  
  // What to enforce
  recommendationId: string
  changeType: "REMOVE_PERMISSIONS" | "NARROW_RESOURCES" | "ADD_CONDITIONS" | "FULL_REPLACE"
  
  // Policy changes
  currentPolicy: IAMPolicyDocument
  proposedPolicy: IAMPolicyDocument
  
  // Safety requirements
  requireSnapshot: boolean
  requireSimulation: boolean
  requireApproval: boolean
  
  // Execution config
  executionMode: "AUTO" | "CANARY" | "MANUAL"
  canaryConfig?: {
    percentage: number
    duration: number
    successCriteria: string[]
  }
  
  // Approvals (if required)
  approvals?: {
    requestedBy: string
    approvedBy: string[]
    approvalDate: string
  }
}

export interface EnforcementResult {
  id: string
  identityId: string
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "ROLLED_BACK"
  
  // What was done
  changesApplied: {
    permissionsRemoved: string[]
    resourcesNarrowed: string[]
    conditionsAdded: string[]
  }
  
  // Snapshots
  snapshotId?: string
  snapshotCreatedAt?: string
  
  // Execution details
  executedAt: string
  executedBy: string
  executionDuration: number  // milliseconds
  
  // Validation
  postValidation: {
    healthChecksPassed: boolean
    criticalPathsWorking: boolean
    servicesOperational: string[]
    servicesFailed: string[]
  }
  
  // Rollback info
  rollbackAvailable: boolean
  rollbackId?: string
  autoRollbackTriggered?: boolean
  rollbackReason?: string
  
  // Errors
  errors: string[]
  warnings: string[]
}

// ============================================================================
// SNAPSHOTS
// ============================================================================

export interface LeastPrivilegeSnapshot {
  id: string
  identityId: string
  identityArn: string
  identityName: string
  
  // System context
  systemName: string
  accountId: string
  
  // Snapshot content
  iamPolicies: IAMPolicyDocument[]     // Full policy documents
  inlinePolicies: IAMPolicyDocument[]
  attachedPolicies: string[]           // Policy ARNs
  trustPolicy: IAMPolicyDocument
  permissionsBoundary?: IAMPolicyDocument
  
  // Metadata
  tags: Record<string, string>
  ownershipMetadata: Record<string, any>
  systemRelationships: string[]
  
  // Snapshot metadata
  createdAt: string
  createdBy: string
  reason: string
  preEnforcementId?: string    // If created before enforcement
  
  // Storage
  s3Location?: string
  checksumSHA256: string
  encrypted: boolean
  
  // Restore info
  restorable: boolean
  restoreCount: number
  lastRestored?: string
}

export interface RestoreRequest {
  snapshotId: string
  identityId: string
  
  // Validation
  validateBeforeRestore: boolean
  
  // Execution
  reason: string
  requestedBy: string
  emergencyRestore?: boolean   // Skip validation if true
}

export interface RestoreResult {
  id: string
  snapshotId: string
  identityId: string
  
  status: "SUCCESS" | "PARTIAL" | "FAILED"
  
  // What was restored
  policiesRestored: string[]
  trustPolicyRestored: boolean
  tagsRestored: boolean
  
  // Execution
  restoredAt: string
  restoredBy: string
  restoreDuration: number  // milliseconds
  
  // Validation
  postRestoreValidation: {
    policiesMatch: boolean
    trustPolicyMatches: boolean
    healthChecksPassed: boolean
  }
  
  // Audit trail
  auditTrailId: string
  
  errors: string[]
  warnings: string[]
}

// ============================================================================
// DRIFT MANAGEMENT
// ============================================================================

export interface DriftDetection {
  identityId: string
  identityName: string
  
  // What drifted
  driftType: "NEW_PERMISSIONS" | "REMOVED_PERMISSIONS" | "POLICY_CHANGE" | "TRUST_CHANGE"
  
  // Details
  baseline: IAMPolicyDocument       // Expected state
  current: IAMPolicyDocument        // Current state
  diff: {                          // Structured diff
    added?: string[]
    removed?: string[]
    modified?: string[]
  }
  
  // When
  detectedAt: string
  lastEnforcedAt?: string
  driftDuration: number    // milliseconds since last enforcement
  
  // Analysis
  driftSignificance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  requiresRemediation: boolean
  autoRemediable: boolean
  
  // Recommendations
  recommendedAction: "AUTO_REMEDIATE" | "ALERT" | "IGNORE"
}

export interface ContinuousEnforcementConfig {
  enabled: boolean
  
  // Frequency
  scanIntervalHours: number
  
  // Scope
  systems: string[]
  identityTypes: IdentityType[]
  
  // Thresholds
  minConfidenceForAuto: number
  maxDriftBeforeAlert: number  // days
  
  // Actions
  autoRemediate: boolean
  autoSnapshot: boolean
  notifyOnDrift: boolean
  
  // Safety
  maxRemediationsPerDay: number
  requireApprovalForProduction: boolean
}

// ============================================================================
// AUDIT & COMPLIANCE
// ============================================================================

export interface LeastPrivilegeAuditRecord {
  id: string
  timestamp: string
  
  // What happened
  action: "ANALYSIS" | "SIMULATION" | "ENFORCEMENT" | "SNAPSHOT" | "RESTORE" | "DRIFT_DETECTION"
  
  // Who
  actor: string
  actorType: "USER" | "SYSTEM" | "AUTOMATION"
  
  // What
  identityId: string
  identityArn: string
  systemName: string
  
  // Details
  changesSummary: string
  evidenceUsed: DataSource[]
  confidenceScore: number
  
  // Outcomes
  status: "SUCCESS" | "FAILED" | "PARTIAL"
  snapshotId?: string
  rollbackCapability: boolean
  
  // Approvals
  approvalPath?: {
    requested: boolean
    approvers: string[]
    approvedAt?: string
  }
  
  // Compliance
  complianceFrameworks: string[]
  policyViolations: string[]
}

export interface ComplianceReport {
  reportId: string
  generatedAt: string
  reportPeriod: {
    startDate: string
    endDate: string
  }
  
  // Summary
  totalIdentities: number
  identitiesAnalyzed: number
  identitiesRemediated: number
  
  // Metrics
  averageLPScore: number
  lpScoreImprovement: number
  permissionsRemoved: number
  attackSurfaceReduction: number  // percentage
  
  // By framework
  frameworkCompliance: Record<string, {
    requirement: string
    status: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT"
    evidence: string[]
    gaps: string[]
  }>
  
  // Audit trail
  auditRecords: LeastPrivilegeAuditRecord[]
  
  // Actions
  remediationsCount: number
  autoRemediationsCount: number
  manualRemediationsCount: number
  rollbacksCount: number
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface LeastPrivilegeAnalysisResponse {
  summary: {
    totalIdentities: number
    totalPermissions: number
    unusedPermissions: number
    averageLPScore: number
    systemsAnalyzed: number
    confidenceLevel: number
  }
  
  identities: PermissionAnalysis[]
  recommendations: PermissionRecommendation[]
  
  // Evidence
  evidenceSources: EvidenceSource[]
  observationPeriod: {
    startDate: string
    endDate: string
    days: number
  }
  
  // Metadata
  analyzedAt: string
  nextAnalysis?: string
}

export interface LeastPrivilegeIssuesResponse {
  summary: {
    totalResources: number
    totalExcessPermissions: number
    avgLPScore: number
    iamIssuesCount: number
    networkIssuesCount: number
    s3IssuesCount: number
    criticalCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    confidenceLevel: number
    observationDays: number
    attackSurfaceReduction: number
  }
  
  resources: Array<{
    id: string
    resourceType: IdentityType
    resourceName: string
    resourceArn: string
    systemName?: string
    lpScore: number
    allowedCount: number
    usedCount: number
    gapCount: number
    gapPercent: number
    allowedList: string[]
    usedList: string[]
    unusedList: string[]
    highRiskUnused: Array<{
      permission: string
      riskLevel: "CRITICAL" | "HIGH" | "MEDIUM"
      reason: string
    }>
    evidence: {
      dataSources: DataSource[]
      observationDays: number
      confidence: "HIGH" | "MEDIUM" | "LOW"
      lastUsed?: string
      coverage: {
        regions: string[]
        complete: boolean
      }
    }
    severity: "critical" | "high" | "medium" | "low"
    confidence: number
    observationDays: number
    title: string
    description: string
    remediation: string
  }>
  
  timestamp: string
}
