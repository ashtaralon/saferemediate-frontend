import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

/**
 * Enforcement Score API
 *
 * Computes a 3-layer micro-enforcement score for a system by aggregating
 * data from the existing issues-summary and system-resources endpoints.
 *
 * Three enforcement layers:
 *   PRIVILEGE — used permissions / allowed permissions (IAM blast radius)
 *   NETWORK   — restricted rules / total rules (network exposure)
 *   DATA      — encrypted + access-controlled / total (data exposure)
 *
 * Total = weighted composite of the three layers.
 * The GAP (100% - score) is exactly what Cyntro closes.
 */

interface LayerScore {
  score: number           // 0-100 percentage
  enforced: number        // Numerator (what's locked down)
  total: number           // Denominator (total surface)
  gap: number             // total - enforced (what's exposed)
  gapPercent: number      // gap / total * 100
  details: string         // Human-readable summary
  items: Array<{ name: string; status: 'enforced' | 'exposed' | 'partial'; detail: string }>
}

interface EnforcementScore {
  systemName: string
  totalScore: number      // Weighted composite 0-100
  totalGap: number        // 100 - totalScore
  projected: {            // "With Cyntro" scores
    totalScore: number
    privilege: number
    network: number
    data: number
    improvement: number   // How much Cyntro improves the score
  }
  layers: {
    privilege: LayerScore
    network: LayerScore
    data: LayerScore
  }
  headline: string        // Sales headline
  canClose: string        // "Cyntro can improve from X% to Y%"
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get('systemName') || 'alon-prod'

  try {
    // Fetch issues-summary and system-resources in parallel
    const [issuesResp, resourcesResp, sgResp] = await Promise.allSettled([
      fetch(`${BACKEND_URL}/api/issues/summary?system_name=${encodeURIComponent(systemName)}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25000),
        cache: 'no-store',
      }),
      fetch(`${BACKEND_URL}/api/system-resources/${encodeURIComponent(systemName)}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25000),
        cache: 'no-store',
      }),
      fetch(`${BACKEND_URL}/api/system-resources/${encodeURIComponent(systemName)}/security-risk-factors`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25000),
        cache: 'no-store',
      }),
    ])

    // Parse responses
    let issuesData: any = {}
    let resourcesData: any = { resources: [] }
    let securityRisks: any = { security_risks: {} }

    if (issuesResp.status === 'fulfilled' && issuesResp.value.ok) {
      issuesData = await issuesResp.value.json()
    }
    if (resourcesResp.status === 'fulfilled' && resourcesResp.value.ok) {
      resourcesData = await resourcesResp.value.json()
    }
    if (sgResp.status === 'fulfilled' && sgResp.value.ok) {
      securityRisks = await sgResp.value.json()
    }

    const resources = resourcesData.resources || []
    const risks = securityRisks.security_risks || {}

    // ═══════════════════════════════════════════════════════════════
    // LAYER 1: PRIVILEGE ENFORCEMENT
    // ═══════════════════════════════════════════════════════════════
    // Score = used_permissions / allowed_permissions
    // Gap = unused_permissions (the blast radius Cyntro removes)
    const permissions = issuesData.byCategory?.permissions || {}
    const privAllowed = permissions.allowed || 0
    const privUsed = permissions.used || 0
    const privUnused = permissions.unused || (privAllowed - privUsed)

    // Also count IAM resources for detail items
    const iamResources = resources.filter((r: any) =>
      r.type === 'IAMRole' || r.type === 'IAMPolicy' || r.type === 'IAMUser'
    )

    const privilegeScore = privAllowed > 0 ? Math.round((privUsed / privAllowed) * 100) : 100
    const privilegeItems: LayerScore['items'] = []

    // Build per-role items from issues
    const iamIssues = issuesData.issues?.filter((i: any) =>
      i.type === 'iam_unused_permissions' || i.type === 'unused_permission'
    ) || []
    for (const issue of iamIssues.slice(0, 10)) {
      const allowed = issue.allowedCount || issue.allowed_count || 0
      const used = issue.usedCount || issue.used_count || 0
      const unused = issue.unusedCount || issue.unused_count || 0
      const roleScore = allowed > 0 ? Math.round((used / allowed) * 100) : 100
      privilegeItems.push({
        name: issue.resourceId || issue.role_name || 'Unknown Role',
        status: roleScore >= 80 ? 'enforced' : roleScore >= 50 ? 'partial' : 'exposed',
        detail: `${used}/${allowed} permissions used (${unused} removable)`,
      })
    }

    const privilege: LayerScore = {
      score: privilegeScore,
      enforced: privUsed,
      total: privAllowed,
      gap: privUnused,
      gapPercent: privAllowed > 0 ? Math.round((privUnused / privAllowed) * 100) : 0,
      details: `${privUsed} of ${privAllowed} permissions actively used — ${privUnused} can be removed`,
      items: privilegeItems,
    }

    // ═══════════════════════════════════════════════════════════════
    // LAYER 2: NETWORK ENFORCEMENT
    // ═══════════════════════════════════════════════════════════════
    // Score = restricted_rules / total_rules
    // A rule is "enforced" if it has specific CIDRs and observed traffic
    // A rule is "exposed" if it's 0.0.0.0/0 or has zero traffic
    const sgResources = resources.filter((r: any) => r.type === 'SecurityGroup')
    let netEnforced = 0
    let netTotal = 0
    const networkItems: LayerScore['items'] = []

    // Count SG findings from issues
    const sgIssues = issuesData.issues?.filter((i: any) =>
      i.type === 'sg_least_privilege' || i.type === 'SG_LEAST_PRIVILEGE' ||
      (i.title && i.title.toLowerCase().includes('security group'))
    ) || []

    for (const sg of sgResources) {
      const sgRisk = risks[sg.name]
      const sgIssue = sgIssues.find((i: any) =>
        i.resourceId === sg.name || i.resource === sg.name ||
        (i.title && i.title.includes(sg.name))
      )

      const ruleCount = sg.properties?.inbound_rule_count || sg.inbound_rule_count || 0
      const isPublic = sgRisk?.is_internet_facing || sg.properties?.has_public_inbound || false
      const usedRules = sgIssue ? (ruleCount - (sgIssue.unused_rules_count || sgIssue.zero_traffic_rules || 0)) : ruleCount
      const unusedRules = ruleCount - usedRules

      netTotal += ruleCount
      netEnforced += Math.max(0, usedRules)

      if (ruleCount > 0) {
        const sgScore = Math.round((usedRules / ruleCount) * 100)
        networkItems.push({
          name: sg.name,
          status: isPublic ? 'exposed' : sgScore >= 80 ? 'enforced' : sgScore >= 50 ? 'partial' : 'exposed',
          detail: isPublic
            ? `Internet-facing — ${unusedRules}/${ruleCount} rules with zero traffic`
            : `${usedRules}/${ruleCount} rules with observed traffic`,
        })
      }
    }

    // If we don't have SG data, use findings count
    if (netTotal === 0 && sgIssues.length > 0) {
      netTotal = sgIssues.length
      const exposedSGs = sgIssues.filter((i: any) => i.severity === 'CRITICAL' || i.severity === 'HIGH')
      netEnforced = netTotal - exposedSGs.length
    }

    const networkScore = netTotal > 0 ? Math.round((netEnforced / netTotal) * 100) : 100
    const netGap = netTotal - netEnforced

    const network: LayerScore = {
      score: networkScore,
      enforced: netEnforced,
      total: netTotal,
      gap: netGap,
      gapPercent: netTotal > 0 ? Math.round((netGap / netTotal) * 100) : 0,
      details: `${netEnforced} of ${netTotal} network rules have observed traffic — ${netGap} rules with zero traffic`,
      items: networkItems,
    }

    // ═══════════════════════════════════════════════════════════════
    // LAYER 3: DATA ENFORCEMENT
    // ═══════════════════════════════════════════════════════════════
    // Score = (encrypted + not-publicly-accessible) / total data resources
    const dataResourceTypes = new Set(['S3', 'S3Bucket', 'RDS', 'RDSInstance', 'DynamoDB', 'DynamoDBTable', 'KMS'])
    const dataResources = resources.filter((r: any) => dataResourceTypes.has(r.type))

    let dataEnforced = 0
    let dataTotal = dataResources.length
    const dataItems: LayerScore['items'] = []

    for (const dr of dataResources) {
      const drRisk = risks[dr.name]
      const encrypted = dr.properties?.encrypted || dr.properties?.sse_enabled || drRisk?.has_encryption || false
      const publicAccess = dr.properties?.publicly_accessible || dr.properties?.has_public_policy || drRisk?.is_internet_facing || false

      const isEnforced = encrypted && !publicAccess
      const isPartial = encrypted || !publicAccess
      if (isEnforced) dataEnforced++
      else if (isPartial) dataEnforced += 0.5  // Partial credit

      dataItems.push({
        name: dr.name,
        status: isEnforced ? 'enforced' : isPartial ? 'partial' : 'exposed',
        detail: `${encrypted ? 'Encrypted' : 'NOT encrypted'}${publicAccess ? ' · PUBLIC ACCESS' : ''}`,
      })
    }

    dataEnforced = Math.round(dataEnforced)
    const dataGap = dataTotal - dataEnforced
    const dataScore = dataTotal > 0 ? Math.round((dataEnforced / dataTotal) * 100) : 100

    const data_layer: LayerScore = {
      score: dataScore,
      enforced: dataEnforced,
      total: dataTotal,
      gap: dataGap,
      gapPercent: dataTotal > 0 ? Math.round((dataGap / dataTotal) * 100) : 0,
      details: `${dataEnforced} of ${dataTotal} data resources encrypted and access-controlled`,
      items: dataItems,
    }

    // ═══════════════════════════════════════════════════════════════
    // TOTAL SCORE (weighted composite)
    // ═══════════════════════════════════════════════════════════════
    // Weights: Privilege 50%, Network 30%, Data 20%
    const weights = { privilege: 0.50, network: 0.30, data: 0.20 }
    const totalScore = Math.round(
      privilege.score * weights.privilege +
      network.score * weights.network +
      data_layer.score * weights.data
    )
    const totalGap = 100 - totalScore

    // ═══════════════════════════════════════════════════════════════
    // PROJECTED SCORE (with Cyntro enforcement)
    // ═══════════════════════════════════════════════════════════════
    // What the score would be if Cyntro enforced recommendations:
    // - Privilege: remove all unused permissions → close ~90% of gap
    // - Network: restrict zero-traffic rules → close ~85% of gap
    // - Data: encrypt + block public access → close ~80% of gap
    const projectedPrivilege = Math.min(100, Math.round(privilege.score + privilege.gapPercent * 0.90))
    const projectedNetwork = Math.min(100, Math.round(network.score + network.gapPercent * 0.85))
    const projectedData = Math.min(100, Math.round(data_layer.score + data_layer.gapPercent * 0.80))
    const projectedTotal = Math.round(
      projectedPrivilege * weights.privilege +
      projectedNetwork * weights.network +
      projectedData * weights.data
    )
    const projectedImprovement = projectedTotal - totalScore

    // Sales headlines
    let headline: string
    if (totalScore < 40) headline = `Only ${totalScore}% of your environment is micro-enforced`
    else if (totalScore < 60) headline = `${totalGap}% of your attack surface is over-provisioned`
    else if (totalScore < 80) headline = `${totalGap}% enforcement gap — significant blast radius exposure`
    else headline = `Strong enforcement at ${totalScore}% — ${totalGap}% gap remaining`

    const canClose = projectedImprovement > 0
      ? `Cyntro can improve your score from ${totalScore}% to ${projectedTotal}% — closing ${projectedImprovement}% of the gap`
      : 'Fully enforced — monitoring for drift'

    const result: EnforcementScore = {
      systemName,
      totalScore,
      totalGap,
      projected: {
        totalScore: projectedTotal,
        privilege: projectedPrivilege,
        network: projectedNetwork,
        data: projectedData,
        improvement: projectedImprovement,
      },
      layers: {
        privilege,
        network,
        data: data_layer,
      },
      headline,
      canClose,
    }

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('[enforcement-score] Error:', error)
    return NextResponse.json(
      {
        systemName,
        totalScore: 0,
        totalGap: 100,
        layers: {
          privilege: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', items: [] },
          network: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', items: [] },
          data: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', items: [] },
        },
        headline: 'Unable to compute enforcement score',
        canClose: '',
        error: error.message,
      },
      { status: 500 }
    )
  }
}
