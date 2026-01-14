import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 60

/**
 * S3 Bucket Analysis API - Returns S3-specific security posture data
 *
 * GET /api/proxy/s3-buckets/{bucketName}/analysis?window=30d
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ bucketName: string }> }
) {
  const { bucketName } = await context.params
  const { searchParams } = new URL(req.url)
  const window = searchParams.get("window") || "365d"

  try {
    // Attempt to fetch S3 bucket data from backend
    // The backend would need to implement these endpoints
    const [bucketInfoRes, policyRes, aclRes, dataEventsRes, changesRes] = await Promise.allSettled([
      fetch(`${BACKEND_URL}/api/s3/${encodeURIComponent(bucketName)}/info`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
      fetch(`${BACKEND_URL}/api/s3/${encodeURIComponent(bucketName)}/policy`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
      fetch(`${BACKEND_URL}/api/s3/${encodeURIComponent(bucketName)}/acl`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
      fetch(`${BACKEND_URL}/api/s3/${encodeURIComponent(bucketName)}/data-events?window=${window.replace('d', '')}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
      fetch(`${BACKEND_URL}/api/s3/${encodeURIComponent(bucketName)}/changes?days=${window.replace('d', '')}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
    ])

    // Process bucket info
    let bucketInfo: any = null
    if (bucketInfoRes.status === "fulfilled" && bucketInfoRes.value.ok) {
      bucketInfo = await bucketInfoRes.value.json()
    }

    // Process bucket policy
    let bucketPolicy: any = null
    if (policyRes.status === "fulfilled" && policyRes.value.ok) {
      bucketPolicy = await policyRes.value.json()
    }

    // Process ACL
    let aclGrants: any[] = []
    if (aclRes.status === "fulfilled" && aclRes.value.ok) {
      const data = await aclRes.value.json()
      aclGrants = data.grants || []
    }

    // Process data events (observed usage)
    let observedUsage: any = {
      dataEventsStatus: 'unknown',
      dataEventsReason: 'S3 data events status could not be determined from backend.',
    }
    if (dataEventsRes.status === "fulfilled" && dataEventsRes.value.ok) {
      const data = await dataEventsRes.value.json()
      observedUsage = {
        dataEventsStatus: data.enabled ? 'enabled' : 'disabled',
        dataEventsReason: data.enabled ? undefined : 'S3 data events are not enabled for this bucket.',
        topPrincipals: data.top_principals || [],
        totalRequests: data.total_requests,
        uniquePrincipals: data.unique_principals,
        lastActivity: data.last_activity,
      }
    }

    // Process change history
    let changeHistory: any[] = []
    if (changesRes.status === "fulfilled" && changesRes.value.ok) {
      const data = await changesRes.value.json()
      changeHistory = (data.changes || []).map((c: any) => ({
        eventType: c.event_type || c.eventType,
        eventTime: c.event_time || c.eventTime,
        actor: c.actor || c.user_identity || 'unknown',
        summary: c.summary || c.description || c.event_type,
      }))
    }

    // Build Block Public Access status
    const bpa = bucketInfo?.block_public_access || {
      blockPublicAcls: true,
      ignorePublicAcls: true,
      blockPublicPolicy: true,
      restrictPublicBuckets: true,
    }
    const blockPublicAccess = {
      blockPublicAcls: bpa.block_public_acls ?? bpa.blockPublicAcls ?? true,
      ignorePublicAcls: bpa.ignore_public_acls ?? bpa.ignorePublicAcls ?? true,
      blockPublicPolicy: bpa.block_public_policy ?? bpa.blockPublicPolicy ?? true,
      restrictPublicBuckets: bpa.restrict_public_buckets ?? bpa.restrictPublicBuckets ?? true,
      allEnabled: false, // computed below
    }
    blockPublicAccess.allEnabled = blockPublicAccess.blockPublicAcls &&
      blockPublicAccess.ignorePublicAcls &&
      blockPublicAccess.blockPublicPolicy &&
      blockPublicAccess.restrictPublicBuckets

    // Build bucket policy summary
    const policyStatements = bucketPolicy?.statements || []
    const bucketPolicySummary = {
      hasBucketPolicy: !!bucketPolicy && policyStatements.length > 0,
      statementCount: policyStatements.length,
      statements: policyStatements.map((stmt: any) => ({
        sid: stmt.Sid || stmt.sid,
        effect: stmt.Effect || stmt.effect,
        principals: parsePrincipals(stmt.Principal || stmt.principal),
        actions: Array.isArray(stmt.Action || stmt.action)
          ? (stmt.Action || stmt.action)
          : [stmt.Action || stmt.action].filter(Boolean),
        resources: Array.isArray(stmt.Resource || stmt.resource)
          ? (stmt.Resource || stmt.resource)
          : [stmt.Resource || stmt.resource].filter(Boolean),
        conditions: parseConditions(stmt.Condition || stmt.condition),
        isPublicAccess: isPublicPrincipal(stmt.Principal || stmt.principal),
        isOverlyBroad: isOverlyBroadStatement(stmt),
      })),
      publicStatements: [],
      crossAccountStatements: [],
    }

    // Compute gap (only if observed data is available)
    let gap: any = {
      available: false,
      reason: 'Gap analysis requires observed usage data. Enable S3 data events to identify unused access.',
    }
    if (observedUsage.dataEventsStatus === 'enabled' && observedUsage.topPrincipals) {
      // Compare policy principals with observed principals
      const policyPrincipals = new Set<string>()
      bucketPolicySummary.statements.forEach((stmt: any) => {
        stmt.principals.forEach((p: any) => {
          if (!p.isPublic) policyPrincipals.add(p.value)
        })
      })

      const observedPrincipals = new Set(
        observedUsage.topPrincipals.map((p: any) => p.principal)
      )

      const unusedPrincipals = Array.from(policyPrincipals).filter(
        (p) => !observedPrincipals.has(p)
      )

      gap = {
        available: true,
        unusedPrincipals: unusedPrincipals.length > 0 ? unusedPrincipals : undefined,
        unusedActions: undefined, // Would need more detailed analysis
      }
    }

    // Build insights
    const insights: any[] = []

    if (!blockPublicAccess.allEnabled) {
      const disabled = []
      if (!blockPublicAccess.blockPublicAcls) disabled.push('BlockPublicAcls')
      if (!blockPublicAccess.ignorePublicAcls) disabled.push('IgnorePublicAcls')
      if (!blockPublicAccess.blockPublicPolicy) disabled.push('BlockPublicPolicy')
      if (!blockPublicAccess.restrictPublicBuckets) disabled.push('RestrictPublicBuckets')

      insights.push({
        type: 'critical',
        title: 'Block Public Access Partially Disabled',
        description: `The following settings are disabled: ${disabled.join(', ')}`,
        recommendation: 'Enable all Block Public Access settings unless public access is explicitly required.',
      })
    }

    const hasPublicStatements = bucketPolicySummary.statements.some((s: any) => s.isPublicAccess)
    if (hasPublicStatements) {
      insights.push({
        type: 'critical',
        title: 'Public Access via Bucket Policy',
        description: 'Bucket policy contains statements that grant public access (Principal: "*" or similar).',
        recommendation: 'Review if public access is necessary. Consider using CloudFront with OAI/OAC instead.',
      })
    }

    if (observedUsage.dataEventsStatus !== 'enabled') {
      insights.push({
        type: 'warning',
        title: 'Observed Usage Unknown',
        description: observedUsage.dataEventsReason || 'S3 data events are not enabled.',
        recommendation: 'Enable CloudTrail S3 data events to identify actual access patterns.',
      })
    }

    // Determine observed plane availability
    const observedAvailable = observedUsage.dataEventsStatus === 'enabled'
    const observedConfidence = observedAvailable
      ? (observedUsage.totalRequests && observedUsage.totalRequests > 100 ? 'high' : 'medium')
      : 'unknown'

    return NextResponse.json({
      bucketName,
      bucketArn: bucketInfo?.arn || `arn:aws:s3:::${bucketName}`,
      region: bucketInfo?.region || 'unknown',
      system: bucketInfo?.system,
      environment: bucketInfo?.environment,

      planes: {
        configured: { available: true, lastUpdated: new Date().toISOString() },
        observed: {
          available: observedAvailable,
          confidence: observedConfidence,
          lastUpdated: new Date().toISOString(),
        },
        authorized: { available: true, lastUpdated: new Date().toISOString() },
        changed: { available: changeHistory.length > 0, lastUpdated: new Date().toISOString() },
      },

      blockPublicAccess,
      bucketPolicy: bucketPolicySummary,
      aclGrants: aclGrants.map((g: any) => ({
        grantee: g.grantee || g.Grantee?.DisplayName || g.Grantee?.ID || 'unknown',
        granteeType: g.grantee_type || g.Grantee?.Type || 'CanonicalUser',
        permission: g.permission || g.Permission || 'READ',
        isPublic: g.is_public || isPublicGrantee(g),
      })),
      encryption: bucketInfo?.encryption,
      observedUsage,
      gap,
      changeHistory,
      insights,
    })
  } catch (error) {
    console.error("[s3-bucket-analysis] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch S3 bucket analysis", details: String(error) },
      { status: 500 }
    )
  }
}

// Helper functions

function parsePrincipals(principal: any): any[] {
  if (!principal) return []
  if (principal === '*') {
    return [{ type: '*', value: '*', isPublic: true }]
  }
  if (typeof principal === 'string') {
    return [{ type: 'AWS', value: principal, isPublic: principal === '*' }]
  }
  const results: any[] = []
  if (principal.AWS) {
    const awsPrincipals = Array.isArray(principal.AWS) ? principal.AWS : [principal.AWS]
    awsPrincipals.forEach((p: string) => {
      results.push({ type: 'AWS', value: p, isPublic: p === '*' })
    })
  }
  if (principal.Service) {
    const services = Array.isArray(principal.Service) ? principal.Service : [principal.Service]
    services.forEach((s: string) => {
      results.push({ type: 'Service', value: s, isPublic: false })
    })
  }
  if (principal.Federated) {
    const federated = Array.isArray(principal.Federated) ? principal.Federated : [principal.Federated]
    federated.forEach((f: string) => {
      results.push({ type: 'Federated', value: f, isPublic: false })
    })
  }
  return results
}

function parseConditions(condition: any): any[] {
  if (!condition) return []
  const results: any[] = []
  Object.entries(condition).forEach(([operator, keys]: [string, any]) => {
    if (keys && typeof keys === 'object') {
      Object.entries(keys).forEach(([key, values]: [string, any]) => {
        results.push({
          operator,
          key,
          values: Array.isArray(values) ? values : [values],
        })
      })
    }
  })
  return results
}

function isPublicPrincipal(principal: any): boolean {
  if (!principal) return false
  if (principal === '*') return true
  if (typeof principal === 'string' && principal === '*') return true
  if (principal.AWS === '*') return true
  if (Array.isArray(principal.AWS) && principal.AWS.includes('*')) return true
  return false
}

function isOverlyBroadStatement(stmt: any): boolean {
  const actions = stmt.Action || stmt.action || []
  const actionList = Array.isArray(actions) ? actions : [actions]

  // Check for wildcard actions
  if (actionList.some((a: string) => a === '*' || a === 's3:*')) return true

  // Check for dangerous action combinations
  const dangerousActions = ['s3:DeleteObject', 's3:DeleteBucket', 's3:PutBucketPolicy']
  if (dangerousActions.some((da) => actionList.includes(da))) return true

  return false
}

function isPublicGrantee(grant: any): boolean {
  const grantee = grant.Grantee || grant.grantee
  if (!grantee) return false

  // Check for AllUsers or AuthenticatedUsers groups
  const uri = grantee.URI || grantee.uri
  if (uri) {
    if (uri.includes('AllUsers') || uri.includes('AuthenticatedUsers')) return true
  }

  return false
}
