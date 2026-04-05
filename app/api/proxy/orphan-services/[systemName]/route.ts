import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'
const NEO4J_URI = process.env.NEO4J_URI || process.env.NEXT_PUBLIC_NEO4J_URI || ''
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || process.env.NEXT_PUBLIC_NEO4J_USERNAME || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || process.env.NEXT_PUBLIC_NEO4J_PASSWORD || ''

const ORPHAN_THRESHOLD_DAYS = 30
const SEASONAL_LOOKBACK_DAYS = 365

// Only analyze actual AWS workload resources that cost money or pose security risk
// Use VARIANT types (EC2Instance, S3Bucket, etc.) — base types (EC2, S3, RDS) are
// polluted with IAM permission strings and service descriptors in Neo4j.
// Exclude: networking infra (VPC/Subnet/IGW), AWS-managed policies, permission strings
const ORPHAN_ELIGIBLE_TYPES = new Set([
  'EC2Instance', 'LambdaFunction',
  'RDSInstance', 'S3Bucket',
  'DynamoDBTable',
  'ECS', 'EKS', 'LoadBalancer', 'ALB', 'NLB',
  'IAMRole', 'IAMPolicy', 'IAMUser', 'SecurityGroup',
  'ElasticIP', 'NAT', 'NATGateway',
  'SQSQueue', 'StepFunction',
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
  seasonalInfo: { isSeasonal: boolean; pattern: string | null; nextRun: string | null }
): Omit<OrphanResource, 'id' | 'name' | 'type' | 'region' | 'status' | 'lastSeen' | 'properties'> {
  const isInternetFacing = resource.is_internet_facing || resource.properties?.is_internet_facing
  const isStopped = resource.instanceState === 'stopped' || resource.status === 'stopped'
  const type = (resource.type || '').replace(/Function$/i, '')
  const estimatedMonthlyCost = COST_ESTIMATES[resource.type] || COST_ESTIMATES[type] || 0

  let riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
  if (isInternetFacing && idleDays >= 60) riskLevel = 'HIGH'
  else if (idleDays >= 60 || (isInternetFacing && idleDays >= 30)) riskLevel = 'MEDIUM'
  else if (edgeCount === 0 && idleDays >= 30) riskLevel = 'MEDIUM'

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
  if (idleDays >= 90 && edgeCount === 0) confidence = 'HIGH'
  else if (idleDays >= 60 || (idleDays >= 30 && edgeCount === 0)) confidence = 'MEDIUM'

  let recommendation: 'DELETE' | 'DECOMMISSION' | 'REVIEW' | 'ARCHIVE' = 'REVIEW'
  let recommendationReason = ''

  if (seasonalInfo.isSeasonal) {
    recommendation = 'REVIEW'
    recommendationReason = `Detected ${seasonalInfo.pattern} usage pattern. Next expected activity: ${seasonalInfo.nextRun ? new Date(seasonalInfo.nextRun).toLocaleDateString() : 'unknown'}. Verify this is intentional.`
  } else if (isStopped && idleDays >= 90) {
    recommendation = 'DELETE'
    recommendationReason = `Stopped for ${idleDays} days with no activity. Safe to terminate and clean up associated resources.`
  } else if (edgeCount === 0 && idleDays >= 90) {
    recommendation = 'DELETE'
    recommendationReason = `No connections to any service and idle for ${idleDays} days. Completely isolated — safe to remove.`
  } else if (idleDays >= 60) {
    recommendation = 'DECOMMISSION'
    recommendationReason = `Inactive for ${idleDays} days. Schedule decommission after verifying no downstream dependencies.`
  } else if (edgeCount === 0) {
    recommendation = 'ARCHIVE'
    recommendationReason = `Isolated from other services. Consider archiving or snapshotting before removal.`
  } else {
    recommendation = 'REVIEW'
    recommendationReason = `Idle for ${idleDays} days but still has ${edgeCount} connection(s). Investigate if connections are stale.`
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
      { headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000) }
    )

    let resources: any[] = []
    if (resourcesResponse.ok) {
      const data = await resourcesResponse.json()
      resources = data.resources || []
    }

    if (resources.length === 0) {
      return NextResponse.json({ orphans: [], seasonal: [], summary: { total: 0, estimatedMonthlySavings: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0 } })
    }

    // 2. Fetch REAL activity evidence from the backend
    //    This queries ALL relationships (not just within-system), including:
    //    - CloudTrail ACCESSES_RESOURCE / PERFORMED_ACTION
    //    - VPC Flow Logs SENDS_TRAFFIC / RECEIVES_TRAFFIC
    //    - IAM Access Advisor HAS_PERMISSION_USAGE
    let evidence: Record<string, { total_relationships: number; cloudtrail_events: number; total_hits: number; access_advisor_services: number; last_activity: string | null }> = {}
    try {
      const evidenceResponse = await fetch(
        `${BACKEND_URL}/api/system-resources/${encodeURIComponent(systemName)}/activity-evidence`,
        { headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000) }
      )
      if (evidenceResponse.ok) {
        const evidenceData = await evidenceResponse.json()
        evidence = evidenceData.evidence || {}
      }
    } catch (e) {
      console.warn('[orphan-services] Could not fetch activity evidence, falling back to connection counts')
    }

    // Build lastUsedBy map from system-resources data
    const lastUsedByMap: Record<string, string> = {}
    for (const r of resources) {
      if (r.name && r.lastUsedBy) lastUsedByMap[r.name] = r.lastUsedBy
    }

    // 3. Classify each resource using real evidence
    const now = Date.now()
    const orphans: OrphanResource[] = []
    const seasonal: OrphanResource[] = []

    for (const r of resources) {
      // Skip non-service types (NetworkEndpoints, IPs, traffic artifacts)
      const resourceType = r.type || ''
      if (!ORPHAN_ELIGIBLE_TYPES.has(resourceType)) continue

      // Skip AWS-managed resources, service-linked roles, and permission string nodes
      const resourceName = r.name || ''
      if (isAWSManagedResource(resourceName, resourceType)) continue

      // Get evidence for this resource
      const ev = evidence[resourceName]
      const totalRels = ev?.total_relationships ?? (r.connections || 0)
      const cloudtrailEvents = ev?.cloudtrail_events ?? 0
      const totalHits = ev?.total_hits ?? 0
      const advisorServices = ev?.access_advisor_services ?? 0

      // Determine last activity from evidence (authoritative) or node property (fallback)
      const evidenceLastActivity = ev?.last_activity
      const nodeLastSeen = r.lastSeen || r.last_seen || r.properties?.lastSeen
      const bestLastSeen = evidenceLastActivity || nodeLastSeen
      const lastSeen = bestLastSeen ? new Date(bestLastSeen) : null
      const hasValidDate = lastSeen && !isNaN(lastSeen.getTime()) && lastSeen.getTime() > new Date('2020-01-01').getTime()

      // Calculate idle days from the best available timestamp
      let idleDays: number
      if (hasValidDate) {
        idleDays = Math.floor((now - lastSeen!.getTime()) / (1000 * 60 * 60 * 24))
      } else {
        // No timestamp at all — check if it has ANY evidence of being alive
        if (totalRels > 0 || cloudtrailEvents > 0 || totalHits > 0 || advisorServices > 0) {
          idleDays = 0  // Has evidence of use but no timestamp — NOT an orphan
        } else {
          idleDays = 90  // Truly no evidence of any activity
        }
      }

      const isStopped = r.instanceState === 'stopped' || r.status === 'stopped'

      // Skip resources with recent activity
      if (idleDays < ORPHAN_THRESHOLD_DAYS) continue

      // Skip resources with significant activity evidence even if "old"
      // (e.g. CloudTrail trail bucket that gets 1000s of writes but lastSeen was a while ago)
      if (totalHits > 10 && idleDays < 90) continue

      // Must meet at least one orphan criteria:
      // - Idle beyond threshold with no/few relationships
      // - Completely isolated (0 total relationships)
      // - Stopped
      const isOrphanCandidate = (
        (idleDays >= ORPHAN_THRESHOLD_DAYS && totalRels <= 2) ||
        totalRels === 0 ||
        isStopped
      )

      if (!isOrphanCandidate) continue

      // Check for scheduled tags
      const tags = r.tags || r.properties?.tags || {}
      if (tags['schedule'] || tags['Schedule'] || tags['keep'] || tags['Keep']) continue

      // Detect seasonal patterns
      const activityHistory: string[] = []
      const seasonalInfo = detectSeasonalPattern(activityHistory)

      const classification = classifyOrphan(r, totalRels, idleDays, seasonalInfo)

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

    // Sort: high risk first, then by idle days descending
    const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    orphans.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || b.idleDays - a.idleDays)

    const summary = {
      total: orphans.length,
      seasonalCount: seasonal.length,
      estimatedMonthlySavings: orphans.reduce((sum, o) => sum + o.estimatedMonthlyCost, 0),
      highRisk: orphans.filter(o => o.riskLevel === 'HIGH').length,
      mediumRisk: orphans.filter(o => o.riskLevel === 'MEDIUM').length,
      lowRisk: orphans.filter(o => o.riskLevel === 'LOW').length,
    }

    return NextResponse.json({ orphans, seasonal, summary })

  } catch (error: any) {
    console.error('[orphan-services] Error:', error)
    return NextResponse.json(
      { error: error.message, orphans: [], seasonal: [], summary: { total: 0, estimatedMonthlySavings: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0, seasonalCount: 0 } },
      { status: 500 }
    )
  }
}
