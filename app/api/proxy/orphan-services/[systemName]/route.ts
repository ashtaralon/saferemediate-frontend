import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"
const NEO4J_URI = process.env.NEO4J_URI || process.env.NEXT_PUBLIC_NEO4J_URI || ''
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || process.env.NEXT_PUBLIC_NEO4J_USERNAME || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || process.env.NEXT_PUBLIC_NEO4J_PASSWORD || ''

const SEASONAL_LOOKBACK_DAYS = 365

// ═══════════════════════════════════════════════════════════════════════════
// ORPHAN DETECTION TIMELINE
// ═══════════════════════════════════════════════════════════════════════════
//
// A resource is ONLY considered an orphan candidate when we have EVIDENCE:
//   - A real last_activity timestamp from CloudTrail / Flow Logs / Access Advisor
//   - OR zero relationships across ALL evidence planes (truly isolated)
//
// Timeline (based on idle days since last observed activity):
//
//   0–99 days   → NOT an orphan. Normal operational window.
//                  No resource gets flagged before 100 days of inactivity.
//
// 100–149 days  → REVIEW. Flag only if isolated (0 connections).
//                  Confidence: LOW. Recommendation: REVIEW.
//                  "Idle for X days with zero connections — investigate."
//
// 150–179 days  → DECOMMISSION candidate. Flag if ≤2 relationships.
//                  Confidence: MEDIUM. Recommendation: DECOMMISSION.
//                  "Inactive for X days — schedule decommission after verification."
//
// 180+ days     → DELETE candidate (if isolated) or DECOMMISSION (if few rels).
//                  Confidence: HIGH (0 rels) or MEDIUM (1-2 rels).
//                  Recommendation: DELETE (0 rels) or DECOMMISSION (1-2 rels).
//
//  No timestamp + 0 rels + 0 hits → Treated as 180 days (completely unknown).
//  No timestamp + any evidence    → Treated as 0 days (can't prove idle).
//
// ═══════════════════════════════════════════════════════════════════════════
const ORPHAN_THRESHOLD_DAYS = 100      // Minimum idle days to flag at all
const DECOMMISSION_THRESHOLD_DAYS = 150 // Escalate to DECOMMISSION
const DELETE_THRESHOLD_DAYS = 180       // Escalate to DELETE (if isolated)
const NEW_RESOURCE_GRACE_DAYS = 30     // Don't flag resources discovered less than 30 days ago

// Only analyze actual AWS workload resources that cost money or pose security risk.
// Include BOTH base types (EC2, S3, Lambda) and variant types (EC2Instance, S3Bucket)
// since Neo4j may store either form depending on the collector.
// Exclude: networking infra (VPC/Subnet/IGW), traffic artifacts (IPs), permission strings.
const ORPHAN_ELIGIBLE_TYPES = new Set([
  // Base types (as stored by collectors)
  'EC2', 'Lambda', 'S3', 'RDS', 'DynamoDB', 'SQS', 'KMS',
  // Variant types (alternate naming)
  'EC2Instance', 'LambdaFunction', 'S3Bucket', 'RDSInstance',
  'DynamoDBTable', 'SQSQueue', 'StepFunction',
  // Container/load balancer types
  'ECS', 'EKS', 'LoadBalancer', 'ALB', 'NLB',
  // IAM types
  'IAMRole', 'IAMPolicy', 'IAMUser',
  // Network security
  'SecurityGroup',
  // Other billable resources
  'ElasticIP', 'NAT', 'NATGateway', 'EventBridge',
])

// AWS-managed IAM policy prefixes — these exist in every account, never orphans
const AWS_MANAGED_PREFIXES = [
  'AWS', 'Amazon', 'CloudWatch', 'CloudFront', 'CloudSearch',
  'AutoScaling', 'IAMFull', 'IAMRead', 'PowerUser', 'ReadOnly',
  'Administrator', 'SecurityAudit', 'SimpleWorkflow', 'ResourceGroups',
  'RDSCloud', 'APIGateway', 'DataPipeline',
]

// Service-linked role prefixes — AWS creates these automatically
const SERVICE_LINKED_PREFIXES = ['AWSServiceRoleFor']

// Exact names of known AWS-managed policies/roles that don't match prefixes
const AWS_MANAGED_EXACT = new Set([
  'flowlogs', // CloudWatch log group auto-created by VPC Flow Logs
])

function isAWSManagedResource(name: string, type: string): boolean {
  // Filter out known AWS-managed exact names
  if (AWS_MANAGED_EXACT.has(name)) return true
  // Filter out AWS-managed IAM policies (exist in every account)
  if (type === 'IAMPolicy') {
    if (AWS_MANAGED_PREFIXES.some(prefix => name.startsWith(prefix))) return true
  }
  // Filter out AWS service-linked roles (auto-created by AWS services)
  if (type === 'IAMRole') {
    if (SERVICE_LINKED_PREFIXES.some(prefix => name.startsWith(prefix))) return true
    // Also filter roles with AWS managed prefix
    if (AWS_MANAGED_PREFIXES.some(prefix => name.startsWith(prefix))) return true
  }
  // Filter out IAM permission strings stored as nodes (e.g., "ec2:CreateNetworkInterface")
  if (name.includes(':') && /^[a-z0-9]+:[A-Z]/.test(name)) return true
  // Filter out resources named "function" or "default" (generic placeholders)
  if (name === 'function' || name === 'default') return true
  return false
}

// Estimated monthly cost by resource type (USD)
// Cost estimates removed — we don't have real AWS Cost Explorer data yet.
// All costs are 0 until we integrate with ce:GetCostAndUsage.
const COST_ESTIMATES: Record<string, number> = {}

interface SecurityFactor {
  factor: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  detail: string
}

interface OrphanResource {
  id: string
  name: string
  type: string
  region: string
  status: string
  lastSeen: string
  lastUsedBy: string | null
  idleDays: number
  attachedResources: number
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  recommendation: 'DELETE' | 'DECOMMISSION' | 'REVIEW' | 'ARCHIVE'
  recommendationReason: string
  estimatedMonthlyCost: number
  isSeasonal: boolean
  seasonalPattern: string | null
  nextExpectedRun: string | null
  properties: Record<string, any>
  // Security risk fields
  securityRiskScore: number
  securityFactors: SecurityFactor[]
  isInternetFacing: boolean
  hasEncryption: boolean | null
  totalPermissions: number
}

interface ConfidenceSignal {
  raw: any
  normalized: number
  weighted: number
  label: string
  lower_env_boost?: boolean
}

interface NewResource {
  id: string
  name: string
  type: string
  region: string
  ageDays: number
  graceDaysRemaining: number
  firstSeen: string
  connections: number
  // Multi-signal confidence
  phase: 'DISCOVERY' | 'LEARNING' | 'ADVISORY' | 'ENFORCING'
  phaseLabel: string
  confidenceScore: number
  confidenceBreakdown: Record<string, ConfidenceSignal>
  reasons: string[]
  promotableIn: string | null
  // Day-0 posture
  day0Posture: {
    denyEastWest: boolean
    allowDeclaredDepsOnly: boolean
    enforceMinimumRole: boolean
    blockPrivilegeExpansion: boolean
    allowReadsOnly: boolean
    blockSensitiveExport: boolean
    tempExceptionTtlHours: number
  }
  properties: Record<string, any>
}

async function runNeo4jQuery(cypher: string): Promise<any[]> {
  if (!NEO4J_URI || !NEO4J_PASSWORD) return []

  try {
    let httpUri = NEO4J_URI
    if (httpUri.startsWith('neo4j+s://')) {
      httpUri = httpUri.replace('neo4j+s://', 'https://')
    } else if (httpUri.startsWith('neo4j://')) {
      httpUri = httpUri.replace('neo4j://', 'http://')
    }

    const endpoint = `${httpUri}/db/neo4j/tx/commit`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${NEO4J_USERNAME}:${NEO4J_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ statements: [{ statement: cypher }] }),
      signal: AbortSignal.timeout(25000),
    })

    if (!response.ok) return []

    const data = await response.json()
    if (data.errors?.length > 0) return []

    return data.results?.[0]?.data || []
  } catch {
    return []
  }
}

function detectSeasonalPattern(activityDates: string[]): { isSeasonal: boolean; pattern: string | null; nextRun: string | null } {
  if (activityDates.length < 2) return { isSeasonal: false, pattern: null, nextRun: null }

  const sorted = activityDates.map(d => new Date(d).getTime()).sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24))
  }

  if (gaps.length === 0) return { isSeasonal: false, pattern: null, nextRun: null }

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const variance = gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length
  const stdDev = Math.sqrt(variance)
  const isRegular = stdDev < avgGap * 0.4 // Pattern is regular if std dev < 40% of mean

  if (!isRegular) return { isSeasonal: false, pattern: null, nextRun: null }

  const lastDate = new Date(sorted[sorted.length - 1])
  const nextRun = new Date(lastDate.getTime() + avgGap * 24 * 60 * 60 * 1000)

  let pattern: string
  if (avgGap >= 300 && avgGap <= 400) pattern = 'Yearly'
  else if (avgGap >= 150 && avgGap < 300) pattern = 'Semi-annual'
  else if (avgGap >= 75 && avgGap < 150) pattern = 'Quarterly'
  else if (avgGap >= 25 && avgGap < 75) pattern = 'Monthly'
  else pattern = `Every ~${Math.round(avgGap)} days`

  return { isSeasonal: true, pattern, nextRun: nextRun.toISOString() }
}

function classifyOrphan(
  resource: any,
  edgeCount: number,
  idleDays: number,
  seasonalInfo: { isSeasonal: boolean; pattern: string | null; nextRun: string | null },
  securityRisk?: { is_internet_facing: boolean; risk_score: number; factors: SecurityFactor[]; has_encryption: boolean; sg_count: number; total_permissions: number },
  isDR: boolean = false,
): Omit<OrphanResource, 'id' | 'name' | 'type' | 'region' | 'status' | 'lastSeen' | 'properties'> {
  const isInternetFacing = securityRisk?.is_internet_facing || resource.is_internet_facing || resource.properties?.is_internet_facing
  const isStopped = resource.instanceState === 'stopped' || resource.status === 'stopped'
  const type = (resource.type || '').replace(/Function$/i, '')
  const estimatedMonthlyCost = COST_ESTIMATES[resource.type] || COST_ESTIMATES[type] || 0
  const secRiskScore = securityRisk?.risk_score ?? 0
  const secFactors = securityRisk?.factors ?? []
  const hasCriticalFactor = secFactors.some(f => f.severity === 'CRITICAL')
  const hasHighFactor = secFactors.some(f => f.severity === 'HIGH')

  // ── Risk Level ──
  // Combines idle duration + real security risk factors from Neo4j.
  //
  //  HIGH   = Internet-facing, or critical security factors (0.0.0.0/0, admin policy,
  //           publicly accessible), or completely isolated 180+ days
  //
  //  MEDIUM = High security factors, or idle 150+ days, or isolated 100+ days
  //
  //  LOW    = Meets orphan criteria but no critical security exposure
  //
  let riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
  // Security-driven escalation: critical factors or high risk score → HIGH regardless of idle time
  if (hasCriticalFactor && idleDays >= ORPHAN_THRESHOLD_DAYS) riskLevel = 'HIGH'
  else if (isInternetFacing && idleDays >= ORPHAN_THRESHOLD_DAYS) riskLevel = 'HIGH'
  else if (secRiskScore >= 50 && idleDays >= ORPHAN_THRESHOLD_DAYS) riskLevel = 'HIGH'
  else if (idleDays >= DELETE_THRESHOLD_DAYS && edgeCount === 0) riskLevel = 'HIGH'
  else if (isStopped && idleDays >= DELETE_THRESHOLD_DAYS) riskLevel = 'HIGH'
  // Medium escalation
  else if (hasHighFactor && idleDays >= ORPHAN_THRESHOLD_DAYS) riskLevel = 'MEDIUM'
  else if (secRiskScore >= 25 && idleDays >= ORPHAN_THRESHOLD_DAYS) riskLevel = 'MEDIUM'
  else if (idleDays >= DECOMMISSION_THRESHOLD_DAYS) riskLevel = 'MEDIUM'
  else if (edgeCount === 0 && idleDays >= ORPHAN_THRESHOLD_DAYS) riskLevel = 'MEDIUM'

  // ── Confidence ──
  // "How sure are we this is actually an orphan?"
  //
  //  HIGH   = 180+ days idle AND 0 connections across ALL evidence planes
  //           → No CloudTrail, no flow logs, no Access Advisor, nothing. Certain.
  //
  //  MEDIUM = 150+ days idle, or 100+ days idle with 0 connections
  //           → Strong evidence, but less history or a few stale refs remain
  //
  //  LOW    = 100–149 days idle with 1-2 connections
  //           → Meets threshold but connections need manual verification
  //
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
  if (idleDays >= DELETE_THRESHOLD_DAYS && edgeCount === 0) confidence = 'HIGH'
  else if (idleDays >= DECOMMISSION_THRESHOLD_DAYS) confidence = 'MEDIUM'
  else if (idleDays >= ORPHAN_THRESHOLD_DAYS && edgeCount === 0) confidence = 'MEDIUM'

  // ── Recommendation ──
  // "What should you do about it?"
  //
  //  DELETE       = 180+ days, 0 connections → safe to remove
  //  DECOMMISSION = 150+ days → schedule removal after dependency check
  //  REVIEW       = 100–149 days → investigate, don't act yet
  //
  let recommendation: 'DELETE' | 'DECOMMISSION' | 'REVIEW' | 'ARCHIVE' = 'REVIEW'
  let recommendationReason = ''

  if (isDR) {
    recommendation = 'REVIEW'
    confidence = 'LOW'
    riskLevel = 'LOW'
    recommendationReason = `Identified as DR/standby resource. Idle for ${idleDays} days is expected for disaster recovery. Verify DR plan is current and failover was tested recently.`
  } else if (seasonalInfo.isSeasonal) {
    recommendation = 'REVIEW'
    recommendationReason = `Detected ${seasonalInfo.pattern} usage pattern. Next expected activity: ${seasonalInfo.nextRun ? new Date(seasonalInfo.nextRun).toLocaleDateString() : 'unknown'}. Verify this is intentional.`
  } else if (idleDays >= DELETE_THRESHOLD_DAYS && edgeCount === 0) {
    recommendation = 'DELETE'
    recommendationReason = `No activity for ${idleDays} days and zero connections across all evidence planes (CloudTrail, flow logs, IAM Access Advisor). Completely isolated — safe to remove.`
  } else if (isStopped && idleDays >= DELETE_THRESHOLD_DAYS) {
    recommendation = 'DELETE'
    recommendationReason = `Stopped for ${idleDays} days with no observed activity. Safe to terminate and clean up associated resources.`
  } else if (idleDays >= DECOMMISSION_THRESHOLD_DAYS) {
    recommendation = 'DECOMMISSION'
    recommendationReason = `No activity for ${idleDays} days with only ${edgeCount} connection(s). Schedule decommission after verifying no downstream dependencies.`
  } else {
    recommendation = 'REVIEW'
    recommendationReason = `Idle for ${idleDays} days${edgeCount === 0 ? ' with zero connections' : ` but still has ${edgeCount} connection(s)`}. Investigate before taking action.`
  }

  // Append security context to recommendation reason
  if (secFactors.length > 0) {
    const criticalFactors = secFactors.filter(f => f.severity === 'CRITICAL')
    const highFactors = secFactors.filter(f => f.severity === 'HIGH')
    if (criticalFactors.length > 0) {
      recommendationReason += ` CRITICAL: ${criticalFactors.map(f => f.detail).join('; ')}.`
    } else if (highFactors.length > 0) {
      recommendationReason += ` Security concerns: ${highFactors.map(f => f.detail).join('; ')}.`
    }
  }

  return {
    lastUsedBy: resource.lastUsedBy || resource.lastAccessedBy || resource.properties?.lastAccessedBy || null,
    idleDays,
    attachedResources: edgeCount,
    riskLevel,
    confidence,
    recommendation,
    recommendationReason,
    estimatedMonthlyCost,
    isSeasonal: seasonalInfo.isSeasonal,
    seasonalPattern: seasonalInfo.pattern,
    nextExpectedRun: seasonalInfo.nextRun,
    securityRiskScore: secRiskScore,
    securityFactors: secFactors,
    isInternetFacing: !!isInternetFacing,
    hasEncryption: securityRisk?.has_encryption ?? null,
    totalPermissions: securityRisk?.total_permissions ?? 0,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  try {
    const { systemName } = await params

    // 1. Fetch all resources for this system
    const resourcesResponse = await fetch(
      `${BACKEND_URL}/api/system-resources/${encodeURIComponent(systemName)}`,
      { headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000), cache: 'no-store' }
    )

    let resources: any[] = []
    if (resourcesResponse.ok) {
      const data = await resourcesResponse.json()
      resources = data.resources || []
    }

    if (resources.length === 0) {
      return NextResponse.json({ orphans: [], seasonal: [], newResources: [], summary: { total: 0, estimatedMonthlySavings: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0, newCount: 0 } })
    }

    // 2. Fetch REAL activity evidence, security risk factors, AND AWS existence validation
    let evidence: Record<string, { total_relationships: number; cloudtrail_events: number; total_hits: number; access_advisor_services: number; last_activity: string | null; first_seen?: string | null; activity_dates?: string[]; is_attached?: boolean; attached_entities?: number; attached_to?: string[] }> = {}
    let securityRisks: Record<string, { is_internet_facing: boolean; risk_score: number; factors: SecurityFactor[]; has_encryption: boolean; sg_count: number; total_permissions: number }> = {}
    let awsValidation: Record<string, { exists: boolean; checked: boolean; type?: string; attachment_count?: number }> = {}

    // Fetch evidence, security risks, and AWS validation sequentially to avoid Next.js fetch issues
    try {
      const evidenceResp = await fetch(
        `${BACKEND_URL}/api/system-resources/${encodeURIComponent(systemName)}/activity-evidence`,
        { headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000), cache: 'no-store' }
      )
      if (evidenceResp.ok) {
        const evidenceJson = await evidenceResp.json()
        evidence = evidenceJson.evidence || {}
      }
    } catch (e: any) {
      console.warn('[orphan-services] Evidence fetch error:', e.message)
    }

    try {
      const securityResp = await fetch(
        `${BACKEND_URL}/api/system-resources/${encodeURIComponent(systemName)}/security-risk-factors`,
        { headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000), cache: 'no-store' }
      )
      if (securityResp.ok) {
        const securityJson = await securityResp.json()
        securityRisks = securityJson.security_risks || {}
      }
    } catch (e: any) {
      console.warn('[orphan-services] Security risks fetch error:', e.message)
    }

    // AWS validation is done AFTER candidate selection (see below) to avoid
    // checking all 1000+ resources. Only orphan candidates get validated.

    // Build lastUsedBy map from system-resources data
    const lastUsedByMap: Record<string, string> = {}
    for (const r of resources) {
      if (r.name && r.lastUsedBy) lastUsedByMap[r.name] = r.lastUsedBy
    }

    // 3. Classify each resource using real evidence
    const now = Date.now()
    const orphans: OrphanResource[] = []
    const seasonal: OrphanResource[] = []
    const newResources: NewResource[] = []

    for (const r of resources) {
      // Skip non-service types (NetworkEndpoints, IPs, traffic artifacts)
      const resourceType = r.type || ''
      if (!ORPHAN_ELIGIBLE_TYPES.has(resourceType)) continue

      // Skip AWS-managed resources, service-linked roles, and permission string nodes
      const resourceName = r.name || ''
      if (isAWSManagedResource(resourceName, resourceType)) continue

      // Get evidence for this resource.
      const ev = evidence[resourceName]

      // Grace period: new resources (< 30 days old) are tagged as NEW instead of
      // being analyzed for orphan status. They still appear in the response so the
      // UI can show them with their multi-signal confidence breakdown and day-0 posture.
      const firstSeen = ev?.first_seen ? new Date(ev.first_seen) : null
      if (firstSeen && !isNaN(firstSeen.getTime())) {
        const ageDays = Math.floor((now - firstSeen.getTime()) / (1000 * 60 * 60 * 24))
        if (ageDays < NEW_RESOURCE_GRACE_DAYS) {
          const totalRelsNew = Math.max(ev?.total_relationships ?? 0, r.connections || 0)
          const cloudtrailNew = ev?.cloudtrail_events ?? 0
          const totalHitsNew = ev?.total_hits ?? 0
          const advisorNew = ev?.access_advisor_services ?? 0

          // ── Multi-signal confidence computation ──
          // Telemetry coverage: proportion of evidence sources reporting
          const tcSources = [
            cloudtrailNew > 0 ? 1 : 0,        // CloudTrail
            advisorNew > 0 ? 1 : 0,            // Access Advisor
            totalHitsNew > 0 ? 1 : 0,          // Flow Logs / total hits
            totalRelsNew > 0 ? 1 : 0,          // Graph relationships
          ]
          const telemetryCoverage = tcSources.reduce((a, b) => a + b, 0) / tcSources.length

          // Dependency declared: has relationships in the graph
          const dependencyDeclared = totalRelsNew > 0

          // Change velocity: approximate from CloudTrail event density
          let changeVelocity: string
          if (cloudtrailNew > 50) changeVelocity = 'high'
          else if (cloudtrailNew > 10) changeVelocity = 'medium'
          else if (cloudtrailNew > 0) changeVelocity = 'low'
          else changeVelocity = 'unknown'

          // Pattern match: check if resource type is a well-known pattern
          const knownPatternTypes = new Set(['EC2', 'EC2Instance', 'Lambda', 'LambdaFunction', 'RDS', 'RDSInstance', 'S3', 'S3Bucket', 'ECS', 'EKS', 'LoadBalancer', 'ALB', 'NLB'])
          const patternMatchScore = knownPatternTypes.has(resourceType) ? 0.70 : 0.30

          // Environment type from system tags/name
          const sysNameLower = systemName.toLowerCase()
          let envType: string = 'production'
          if (sysNameLower.includes('dev') || sysNameLower.includes('sandbox')) envType = 'development'
          else if (sysNameLower.includes('stag') || sysNameLower.includes('test') || sysNameLower.includes('qa')) envType = 'staging'

          // Criticality: infer from system name
          let criticalityTier = 2 // standard
          if (sysNameLower.includes('prod') && (sysNameLower.includes('critical') || sysNameLower.includes('core'))) criticalityTier = 3
          else if (sysNameLower.includes('dev') || sysNameLower.includes('sandbox')) criticalityTier = 0
          else if (sysNameLower.includes('stag') || sysNameLower.includes('test')) criticalityTier = 1

          // ── Compute composite confidence (mirrors backend OnboardingSignals) ──
          const weights = { tc: 0.25, obs: 0.20, dep: 0.15, vel: 0.10, pat: 0.10, crit: 0.10, env: 0.10 }

          // Observation maturity (diminishing returns curve)
          let obsNorm: number
          if (ageDays >= 365) obsNorm = 1.0
          else if (ageDays >= 180) obsNorm = 0.95 + 0.05 * ((ageDays - 180) / 185)
          else if (ageDays >= 90) obsNorm = 0.85 + 0.10 * ((ageDays - 90) / 90)
          else if (ageDays >= 30) obsNorm = 0.60 + 0.25 * ((ageDays - 30) / 60)
          else if (ageDays >= 14) obsNorm = 0.40 + 0.20 * ((ageDays - 14) / 16)
          else if (ageDays >= 7) obsNorm = 0.20 + 0.20 * ((ageDays - 7) / 7)
          else obsNorm = ageDays > 0 ? ageDays * 0.20 / 7 : 0

          const velMap: Record<string, number> = { high: 1.0, medium: 0.7, low: 0.4, static: 0.2, unknown: 0.0 }
          const critMap: Record<number, number> = { 0: 1.0, 1: 0.8, 2: 0.5, 3: 0.2 }
          const envMap: Record<string, number> = { development: 1.0, staging: 0.7, production: 0.3 }

          const breakdown: Record<string, ConfidenceSignal> = {
            telemetry_coverage: {
              raw: Math.round(telemetryCoverage * 100) / 100,
              normalized: Math.round(telemetryCoverage * 100) / 100,
              weighted: Math.round(telemetryCoverage * weights.tc * 1000) / 1000,
              label: 'Telemetry Coverage',
            },
            observation_maturity: {
              raw: ageDays,
              normalized: Math.round(obsNorm * 100) / 100,
              weighted: Math.round(obsNorm * weights.obs * 1000) / 1000,
              label: 'Observation Period',
            },
            dependency_declared: {
              raw: dependencyDeclared,
              normalized: dependencyDeclared ? 1.0 : 0.0,
              weighted: Math.round((dependencyDeclared ? 1.0 : 0.0) * weights.dep * 1000) / 1000,
              label: 'Declared Dependencies',
            },
            change_velocity: {
              raw: changeVelocity,
              normalized: velMap[changeVelocity] ?? 0,
              weighted: Math.round((velMap[changeVelocity] ?? 0) * weights.vel * 1000) / 1000,
              label: 'Change Velocity',
            },
            pattern_match: {
              raw: Math.round(patternMatchScore * 100) / 100,
              normalized: Math.round(patternMatchScore * 100) / 100,
              weighted: Math.round(patternMatchScore * weights.pat * 1000) / 1000,
              label: 'Service Pattern Match',
            },
            criticality: {
              raw: criticalityTier,
              normalized: critMap[criticalityTier] ?? 0.5,
              weighted: Math.round((critMap[criticalityTier] ?? 0.5) * weights.crit * 1000) / 1000,
              label: 'Workload Criticality',
            },
            env_type: {
              raw: envType,
              normalized: Math.round((envMap[envType] ?? 0.3) * 100) / 100,
              weighted: Math.round((envMap[envType] ?? 0.3) * weights.env * 1000) / 1000,
              label: 'Environment Type',
            },
          }

          const compositeScore = Math.min(
            Object.values(breakdown).reduce((sum, s) => sum + s.weighted, 0),
            1.0
          )

          // Phase from composite score
          let phase: 'DISCOVERY' | 'LEARNING' | 'ADVISORY' | 'ENFORCING'
          let phaseLabel: string
          if (compositeScore >= 0.80) { phase = 'ENFORCING'; phaseLabel = 'Canary/auto-remediation eligible' }
          else if (compositeScore >= 0.55) { phase = 'ADVISORY'; phaseLabel = 'Findings visible — approval required for remediation' }
          else if (compositeScore >= 0.30) { phase = 'LEARNING'; phaseLabel = 'Building behavioral baseline — no enforcement' }
          else { phase = 'DISCOVERY'; phaseLabel = 'Collecting telemetry — restricted posture active' }

          // Reasons
          const reasons: string[] = []
          if (telemetryCoverage < 0.30) reasons.push('Telemetry below 30% — enable CloudTrail + Access Advisor')
          else if (telemetryCoverage < 0.60) reasons.push(`Telemetry at ${Math.round(telemetryCoverage * 100)}% — enable Flow Logs for faster promotion`)
          else reasons.push(`Telemetry at ${Math.round(telemetryCoverage * 100)}%`)
          if (ageDays < 14) reasons.push(`Only ${ageDays}d observed — minimum 14d for baseline`)
          else reasons.push(`${ageDays}d observed`)
          if (!dependencyDeclared) reasons.push('No declared dependencies — add to graph for faster promotion')
          else reasons.push('Dependencies declared in graph')
          if (patternMatchScore >= 0.70) reasons.push(`Matches known service pattern (${Math.round(patternMatchScore * 100)}%)`)
          if (criticalityTier >= 3) reasons.push('Critical workload — conservative enforcement ramp')

          // Promotable hint
          let promotableIn: string | null = null
          if (phase === 'DISCOVERY') promotableIn = `Need +${(0.30 - compositeScore).toFixed(2)} confidence to LEARNING (enable telemetry, declare dependencies)`
          else if (phase === 'LEARNING') promotableIn = `Need +${(0.55 - compositeScore).toFixed(2)} confidence to ADVISORY (more observation, add pattern match)`
          else if (phase === 'ADVISORY') promotableIn = `Need +${(0.80 - compositeScore).toFixed(2)} confidence to ENFORCING (more observation, verify dependencies)`

          // Day-0 posture based on env + criticality
          const isDevEnv = envType === 'development'
          const isStagingEnv = envType === 'staging'
          const isCritical = criticalityTier >= 3

          newResources.push({
            id: r.id || r.name || Math.random().toString(),
            name: r.name || 'Unknown',
            type: r.type || 'Unknown',
            region: r.region || r.properties?.region || 'eu-west-1',
            ageDays,
            graceDaysRemaining: NEW_RESOURCE_GRACE_DAYS - ageDays,
            firstSeen: firstSeen.toISOString(),
            connections: totalRelsNew,
            phase,
            phaseLabel,
            confidenceScore: Math.round(compositeScore * 1000) / 1000,
            confidenceBreakdown: breakdown,
            reasons,
            promotableIn,
            day0Posture: {
              denyEastWest: !isDevEnv,
              allowDeclaredDepsOnly: !isDevEnv && !isStagingEnv,
              enforceMinimumRole: true,
              blockPrivilegeExpansion: !isDevEnv,
              allowReadsOnly: !isDevEnv && !isStagingEnv,
              blockSensitiveExport: !isDevEnv,
              tempExceptionTtlHours: isCritical ? 4 : isDevEnv ? 168 : isStagingEnv ? 72 : 24,
            },
            properties: r.properties || {},
          })
          continue
        }
      }

      // Use the MAX of evidence and resource connections to avoid false positives:
      // the evidence endpoint may under-count structural relationships.
      const totalRels = Math.max(ev?.total_relationships ?? 0, r.connections || 0)
      const cloudtrailEvents = ev?.cloudtrail_events ?? 0
      const totalHits = ev?.total_hits ?? 0
      const advisorServices = ev?.access_advisor_services ?? 0
      const isAttached = ev?.is_attached ?? false

      // For IAM policies/roles: skip if attached to other entities in Neo4j
      // (the AWS attachment_count check above already handles the primary case,
      // this is a safety net for graph-level attachments)
      // For other resource types (EC2, SG, Lambda etc), structural relationships
      // don't prove the resource is actively used — idle time + relationship count
      // in the graduated criteria below are better indicators.
      if (isAttached && (resourceType === 'IAMPolicy' || resourceType === 'IAMUser')) continue

      // Determine last activity from evidence (authoritative) or node property (fallback).
      // IMPORTANT: nodeLastSeen is often just the sync timestamp (when the collector last
      // ran), NOT when the resource was last used. Only use it as fallback when the resource
      // has real activity evidence (rels, CloudTrail, hits) but no explicit timestamp.
      const evidenceLastActivity = ev?.last_activity
      const nodeLastSeen = r.lastSeen || r.last_seen || r.properties?.lastSeen
      const hasRealEvidence = totalRels > 0 || cloudtrailEvents > 0 || totalHits > 0 || advisorServices > 0

      // Only fall back to nodeLastSeen if there's real activity evidence backing it.
      // Without evidence, nodeLastSeen is just "when we last synced" — meaningless for orphan detection.
      const bestLastSeen = evidenceLastActivity || (hasRealEvidence ? nodeLastSeen : null)
      const lastSeen = bestLastSeen ? new Date(bestLastSeen) : null
      const hasValidDate = lastSeen && !isNaN(lastSeen.getTime()) && lastSeen.getTime() > new Date('2020-01-01').getTime()

      // Calculate idle days from the best available timestamp
      let idleDays: number
      if (hasValidDate) {
        idleDays = Math.floor((now - lastSeen!.getTime()) / (1000 * 60 * 60 * 24))
      } else {
        // No real activity timestamp
        if (hasRealEvidence) {
          idleDays = 0  // Has evidence of use but no timestamp — NOT an orphan
        } else {
          idleDays = 180  // Truly no evidence of any activity anywhere
        }
      }

      const isStopped = r.instanceState === 'stopped' || r.status === 'stopped'

      // Skip resources with recent activity (< 30 days)
      if (idleDays < ORPHAN_THRESHOLD_DAYS) continue

      // Skip resources with significant ongoing activity evidence
      if (totalHits > 10 && idleDays < DELETE_THRESHOLD_DAYS) continue

      // ── Graduated orphan criteria based on timeline ──
      // The longer a resource is idle, the more connections we tolerate and still flag it.
      //
      //  30–59 days: only flag if truly isolated (0 connections)
      //  60–89 days: flag if ≤2 connections (stale refs likely)
      //  90+ days:   flag if ≤2 connections OR stopped
      //
      let isOrphanCandidate = false
      if (idleDays >= DELETE_THRESHOLD_DAYS) {
        // 90+ days idle → flag if isolated or near-isolated
        isOrphanCandidate = totalRels <= 2 || isStopped
      } else if (idleDays >= DECOMMISSION_THRESHOLD_DAYS) {
        // 60–89 days idle → flag if ≤2 connections
        isOrphanCandidate = totalRels <= 2
      } else {
        // 30–59 days idle → only flag if completely isolated
        isOrphanCandidate = totalRels === 0
      }

      if (!isOrphanCandidate) continue

      // Check for tags that indicate the resource should be kept
      const tags = r.tags || r.properties?.tags || {}
      if (tags['schedule'] || tags['Schedule'] || tags['keep'] || tags['Keep']) continue

      // Check for DR / standby tags — these resources are intentionally idle
      const drTagKeys = ['dr', 'DR', 'disaster-recovery', 'DisasterRecovery', 'standby', 'Standby', 'failover', 'Failover', 'backup', 'Backup']
      const hasDRTag = drTagKeys.some(k => tags[k]) ||
        Object.values(tags).some(v => typeof v === 'string' && /\b(dr|disaster.?recovery|standby|failover|warm.?standby|pilot.?light)\b/i.test(v))
      const isDRByName = /\b(dr|disaster-recovery|standby|failover|warm-standby|pilot-light|backup-replica)\b/i.test(resourceName)

      // Detect seasonal patterns from real CloudTrail activity dates
      const activityHistory: string[] = ev?.activity_dates || []
      const seasonalInfo = detectSeasonalPattern(activityHistory)

      // Get security risk data for this resource
      const secRisk = securityRisks[resourceName]
      const isDR = hasDRTag || isDRByName
      const classification = classifyOrphan(r, totalRels, idleDays, seasonalInfo, secRisk, isDR)

      const orphanResource: OrphanResource = {
        id: r.id || r.name || Math.random().toString(),
        name: r.name || 'Unknown',
        type: r.type || 'Unknown',
        region: r.region || r.properties?.region || 'eu-west-1',
        status: isStopped ? 'stopped' : (idleDays >= ORPHAN_THRESHOLD_DAYS ? 'idle' : 'isolated'),
        lastSeen: hasValidDate ? lastSeen!.toISOString() : '',
        properties: r.properties || {},
        lastUsedBy: classification.lastUsedBy || lastUsedByMap[r.name] || null,
        ...classification,
      }

      if (seasonalInfo.isSeasonal) {
        seasonal.push(orphanResource)
      } else {
        orphans.push(orphanResource)
      }
    }

    // 4. Validate orphan candidates against AWS (only the ~20-30 candidates, not all 1000+ resources)
    if (orphans.length > 0) {
      try {
        const candidates = orphans.map(o => ({
          name: o.name,
          type: o.type,
          arn: o.properties?.arn || '',
          id: o.properties?.id || o.id || '',
        }))

        const validateResp = await fetch(
          `${BACKEND_URL}/api/system-resources/${encodeURIComponent(systemName)}/validate-candidates`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(candidates),
            signal: AbortSignal.timeout(30000),
            cache: 'no-store',
          }
        )

        if (validateResp.ok) {
          const validateJson = await validateResp.json()
          awsValidation = validateJson.validation || {}

          // Filter out stale resources (don't exist in AWS) and attached IAM policies
          const validatedOrphans = orphans.filter(o => {
            const awsStatus = awsValidation[o.name]
            if (awsStatus?.checked && !awsStatus.exists) {
              console.log(`[orphan-services] Removing stale orphan "${o.name}" — does not exist in AWS`)
              return false
            }
            if (o.type === 'IAMPolicy' && awsStatus?.checked && awsStatus.exists && (awsStatus.attachment_count ?? 0) > 0) {
              console.log(`[orphan-services] Removing attached IAM policy "${o.name}" — ${awsStatus.attachment_count} attachments in AWS`)
              return false
            }
            return true
          })

          // Replace orphans with validated list
          orphans.length = 0
          orphans.push(...validatedOrphans)
        }
      } catch (e: any) {
        console.warn('[orphan-services] AWS validation of candidates failed (proceeding without):', e.message)
      }
    }

    // Sort: high risk first, then by idle days descending
    const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    orphans.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || b.idleDays - a.idleDays)

    const summary = {
      total: orphans.length,
      seasonalCount: seasonal.length,
      newCount: newResources.length,
      estimatedMonthlySavings: orphans.reduce((sum, o) => sum + o.estimatedMonthlyCost, 0),
      highRisk: orphans.filter(o => o.riskLevel === 'HIGH').length,
      mediumRisk: orphans.filter(o => o.riskLevel === 'MEDIUM').length,
      lowRisk: orphans.filter(o => o.riskLevel === 'LOW').length,
    }

    return NextResponse.json({ orphans, seasonal, newResources, summary })

  } catch (error: any) {
    console.error('[orphan-services] Error:', error)
    return NextResponse.json(
      { error: error.message, orphans: [], seasonal: [], newResources: [], summary: { total: 0, estimatedMonthlySavings: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0, seasonalCount: 0, newCount: 0 } },
      { status: 500 }
    )
  }
}
