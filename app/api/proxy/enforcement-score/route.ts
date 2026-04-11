import { NextRequest, NextResponse } from 'next/server'
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl()

/**
 * Enforcement Score API — Thin Proxy
 *
 * Backend computes 3 scores:
 *   1. coverage_score  (total_score) — simple avg of ALL resources (hygiene)
 *   2. customer_score  — risk-weighted avg of customer-controlled resources
 *   3. critical_score  — risk-weighted avg of critical-path resources
 *
 * This proxy:
 *   1. Fetches backend scoring + issues-summary + LP issues
 *   2. Transforms backend shape → frontend EnforcementScore shape
 *   3. Computes projected scores from LP data (customer-controlled only)
 *   4. Builds presentation values (headlines, risk labels)
 */

// ── Frontend types (UI contract) ──────────────────────────────────────

interface SeverityBuckets {
  strongly_enforced: number
  enforced_with_gaps: number
  weakly_enforced: number
  critically_exposed: number
}

interface LayerClassification {
  provider_managed: number
  critical_path: number
  customer: number
}

interface LayerScore {
  score: number
  enforced: number
  total: number
  gap: number
  gapPercent: number
  details: string
  riskLabel: string
  severityBuckets: SeverityBuckets
  classification: LayerClassification
  items: Array<{
    name: string
    status: 'enforced' | 'partial' | 'exposed' | 'critical'
    detail: string
    resourceClass: 'provider_managed' | 'critical_path' | 'customer'
    tier: string
    riskWeight: number
  }>
}

interface EnforcementAction {
  id: string
  layer: 'privilege' | 'network' | 'data'
  title: string
  detail: string
  impact: string
  risk: string
  confidence: 'high' | 'medium' | 'low'
  observationDays: number
  rollback: string
  count: number
}

interface EnforcementScore {
  systemName: string

  // 3 scores
  coverageScore: number       // Overall hygiene (all resources)
  customerScore: number       // Customer-controlled only (risk-weighted)
  criticalScore: number | null  // Critical attack surface only

  // Back-compat
  totalScore: number
  totalGap: number

  // Projected (computed on customer-controlled + remediable only)
  projected: {
    coverageScore: number
    customerScore: number
    criticalScore: number | null
    improvement: number       // customerScore delta (the sales number)
    privilege: number
    network: number
    data: number
    // Back-compat
    totalScore: number
  }

  // Resource classification
  resourceClassification: {
    provider_managed: number
    critical_path: number
    customer: number
    total: number
  }

  // 4-tier severity buckets
  enforcementTiers: SeverityBuckets

  layers: {
    privilege: LayerScore
    network: LayerScore
    data: LayerScore
  }

  actions: EnforcementAction[]

  impact: {
    attackPathsExposed: number
    reductionPercent: number
    primaryDriver: string
    riskStatement: string
    criticalGaps: number
    remediableGaps: number
  }

  headline: string
  canClose: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get('systemName') || 'alon-prod'

  try {
    // ── Fetch backend scoring + issues-summary + LP issues in parallel ─
    const [scoreResp, issuesResp, lpResp] = await Promise.allSettled([
      fetch(`${BACKEND_URL}/api/service-risk-scores/${encodeURIComponent(systemName)}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(90000),
        cache: 'no-store',
      }),
      fetch(`${BACKEND_URL}/api/issues/summary?system_name=${encodeURIComponent(systemName)}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000),
        cache: 'no-store',
      }),
      fetch(`${BACKEND_URL}/api/least-privilege/issues?systemName=${encodeURIComponent(systemName)}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000),
        cache: 'no-store',
      }),
    ])

    let scoreData: any = null
    let issuesData: any = {}
    let lpIssues: any[] = []

    if (scoreResp.status === 'fulfilled' && scoreResp.value.ok) {
      scoreData = await scoreResp.value.json()
    }
    if (issuesResp.status === 'fulfilled' && issuesResp.value.ok) {
      issuesData = await issuesResp.value.json()
    }
    if (lpResp.status === 'fulfilled' && lpResp.value.ok) {
      const lpData = await lpResp.value.json()
      lpIssues = lpData.resources || lpData.issues || []
    }

    // If backend scoring endpoint failed, return error
    if (!scoreData) {
      console.error('[enforcement-score] Backend scoring endpoint failed')
      return NextResponse.json(emptyResult(systemName, 'Backend scoring unavailable'), { status: 502 })
    }

    // ── Extract backend data ───────────────────────────────────────
    const backendLayers = scoreData.layers || {}
    const backendPrivilege = backendLayers.privilege || {}
    const backendNetwork = backendLayers.network || {}
    const backendData = backendLayers.data || {}

    const perResource: any[] = scoreData.per_resource || []

    // New backend fields
    const coverageScore = scoreData.total_score ?? 0
    const customerScore = scoreData.customer_score ?? coverageScore
    const criticalScore = scoreData.critical_score ?? null
    const resourceClassification = scoreData.resource_classification || {
      provider_managed: 0, critical_path: 0, customer: 0, total: perResource.length,
    }
    const enforcementTiers = scoreData.enforcement_tiers || {
      strongly_enforced: 0, enforced_with_gaps: 0, weakly_enforced: 0, critically_exposed: 0,
    }

    // ── Permission ratio from issues-summary ───────────────────────
    const permissions = issuesData.byCategory?.permissions || {}
    const privAllowed = permissions.allowed || 0
    const privUsed = permissions.used || 0
    const privUnused = permissions.unused || (privAllowed - privUsed)

    // ── Transform layers ───────────────────────────────────────────

    const privResources = perResource.filter((r: any) =>
      ['IAMRole', 'IAMPolicy', 'IAMUser'].includes(r.resource_type)
    )
    const netResources = perResource.filter((r: any) =>
      ['SecurityGroup', 'EC2', 'Lambda'].includes(r.resource_type)
    )
    const dataResources = perResource.filter((r: any) =>
      ['S3', 'S3Bucket', 'RDS', 'RDSInstance', 'DynamoDB', 'DynamoDBTable', 'KMS'].includes(r.resource_type)
    )

    const privilege: LayerScore = transformLayer(
      backendPrivilege,
      privResources,
      privAllowed > 0
        ? `${privUsed} of ${privAllowed} permissions actively used — ${privUnused} can be removed`
        : undefined,
      privAllowed > 0 ? { enforced: privUsed, total: privAllowed } : undefined,
    )

    const network: LayerScore = transformLayer(
      backendNetwork,
      netResources,
    )

    const data_layer: LayerScore = transformLayer(
      backendData,
      dataResources,
    )

    const totalGap = 100 - coverageScore

    // ── Projected scores (from real LP remediation data) ───────────
    //
    // Only scored resources contribute to the numeric projection.
    // Projection assumes detected non-missing gaps are closed across
    // privilege, network, and data, while missing-evidence penalties remain.

    // Parse LP issues with full metadata
    const remediableLP = lpIssues
      .filter((i: any) => i.remediable && (i.gapPercent || i.gapCount || 0) > 0)
      .map((i: any) => ({
        name: (i.resourceName || i.name || '').toLowerCase(),
        id: (i.resourceId || '').toLowerCase(),
        type: (i.resourceType || '').toLowerCase(),
        gapPercent: i.gapPercent || 0,
        gapCount: i.gapCount || 0,
      }))
    const remediableIssueCount = remediableLP.length
    const privilegeLPIssues = remediableLP.filter((lp) =>
      ['iamrole', 'iampolicy', 'iamuser'].includes(lp.type)
    )
    const remediablePrivilegePermissions = privilegeLPIssues.reduce(
      (sum, lp) => sum + Math.max(0, lp.gapCount || 0),
      0,
    )
    const projectedPrivilegePermissionScore = privAllowed > 0
      ? Math.round(
          Math.min(
            100,
            ((privUsed + Math.min(privUnused, remediablePrivilegePermissions)) / privAllowed) * 100,
          ),
        )
      : null

    function matchesLPIdentifier(id: string, candidate: string): boolean {
      if (!id || !candidate) return false
      if (id === candidate) return true
      return id.length > 3 && (candidate.startsWith(id) || id.startsWith(candidate))
    }

    function matchingLPIssues(resourceId: string): typeof remediableLP {
      const id = resourceId.toLowerCase()
      if (!id) return []
      return remediableLP.filter((lp) =>
        matchesLPIdentifier(id, lp.name) || matchesLPIdentifier(id, lp.id)
      )
    }

    function signalIsNegative(signal: any): boolean {
      if (!signal || signal.is_missing) return false
      const value = signal.value
      if (typeof value === 'boolean') return value === true
      if (typeof value === 'number') return value > 0
      return false
    }

    function resourceHasGap(resource: any): boolean {
      const id = String(resource.resource_id || resource.resource_name || '')
      const lpMatch = matchingLPIssues(id).length > 0
      const signals = Array.isArray(resource.signals) ? resource.signals : []
      const hasDetectedNegativeSignal = signals.some((signal: any) => signalIsNegative(signal))
      return lpMatch || hasDetectedNegativeSignal
    }

    function projectedResourceScore(resource: any): number {
      const currentScore = Math.max(0, Math.min(100, Number(resource.score ?? 100)))
      const signals = Array.isArray(resource.signals) ? resource.signals : []
      const hasGap = resourceHasGap(resource)
      if (signals.length === 0 && !hasGap) return currentScore

      const maxWeight = signals.reduce((sum: number, signal: any) => sum + (Number(signal?.weight) || 0), 0)
      if (maxWeight <= 0) {
        const id = String(resource.resource_id || resource.resource_name || '')
        return matchingLPIssues(id).length > 0 ? 100 : currentScore
      }

      const remainingDeductions = signals.reduce((sum: number, signal: any) => {
        const weight = Number(signal?.weight) || 0
        if (signal?.is_missing) return sum + weight * 0.3
        return sum
      }, 0)

      return Math.max(0, Math.min(100, Math.round(100 - (remainingDeductions / maxWeight) * 100)))
    }

    function weightedLayerMix(
      layers: Array<{ score: number; weight: number; present: boolean }>,
      defaultScore: number,
    ): number {
      const activeLayers = layers.filter((layer) => layer.present)
      if (activeLayers.length === 0) return defaultScore

      const totalWeight = activeLayers.reduce((sum, layer) => sum + layer.weight, 0)
      if (totalWeight === 0) return defaultScore

      const weightedScore = activeLayers.reduce(
        (sum, layer) => sum + layer.score * layer.weight,
        0,
      )
      return Math.round(weightedScore / totalWeight)
    }

    // Project coverage layer score (simple average — all scored resources)
    function projectedLayerScore(layerResources: any[]): number {
      if (layerResources.length === 0) return 100
      let sum = 0
      for (const r of layerResources) {
        sum += projectedResourceScore(r)
      }
      return Math.round(sum / layerResources.length)
    }

    // Risk-weighted projected score for customer resources
    function projectedCustomerLayerScore(
      layerResources: any[],
    ): number {
      const customerResources = layerResources.filter(
        (r: any) => r.resource_class !== 'provider_managed'
      )
      if (customerResources.length === 0) return 100

      let weightedSum = 0
      let totalWeight = 0
      for (const r of customerResources) {
        const w = r.risk_weight || 1.0
        const projectedScore = projectedResourceScore(r)
        weightedSum += projectedScore * w
        totalWeight += w
      }

      return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 100
    }

    // Risk-weighted projected score for critical-path resources
    function projectedCriticalLayerScore(layerResources: any[]): number {
      const critResources = layerResources.filter(
        (r: any) => r.resource_class === 'critical_path'
      )
      if (critResources.length === 0) return 100

      let weightedSum = 0
      let totalWeight = 0
      for (const r of critResources) {
        const w = r.risk_weight || 1.0
        const projectedScore = projectedResourceScore(r)
        weightedSum += projectedScore * w
        totalWeight += w
      }
      return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 100
    }

    const weights = { privilege: 0.50, network: 0.30, data: 0.20 }

    // Projected coverage (simple average — back-compat)
    const projCoveragePriv = privilegeLPIssues.length > 0
      ? Math.max(projectedPrivilegePermissionScore ?? 0, projectedLayerScore(privResources))
      : projectedLayerScore(privResources)
    const projCoverageNet = projectedLayerScore(netResources)
    const projCoverageData = projectedLayerScore(dataResources)
    const projectedCoverage = weightedLayerMix([
      { score: projCoveragePriv, weight: weights.privilege, present: privResources.length > 0 },
      { score: projCoverageNet, weight: weights.network, present: netResources.length > 0 },
      { score: projCoverageData, weight: weights.data, present: dataResources.length > 0 },
    ], 0)

    // Projected customer score (risk-weighted — the sales number)
    const projCustPriv = privilegeLPIssues.length > 0
      ? Math.max(projectedPrivilegePermissionScore ?? 0, projectedCustomerLayerScore(privResources))
      : projectedCustomerLayerScore(privResources)
    const projCustNet = projectedCustomerLayerScore(netResources)
    const projCustData = projectedCustomerLayerScore(dataResources)
    const projectedCustomer = weightedLayerMix([
      { score: projCustPriv, weight: weights.privilege, present: privResources.some((r: any) => r.resource_class !== 'provider_managed') },
      { score: projCustNet, weight: weights.network, present: netResources.some((r: any) => r.resource_class !== 'provider_managed') },
      { score: projCustData, weight: weights.data, present: dataResources.some((r: any) => r.resource_class !== 'provider_managed') },
    ], perResource.length > 0 ? 100 : 0)

    // Projected critical score (risk-weighted)
    const projCritPriv = projectedCriticalLayerScore(privResources)
    const projCritNet = projectedCriticalLayerScore(netResources)
    const projCritData = projectedCriticalLayerScore(dataResources)
    const hasCritical = criticalScore !== null
    const projectedCritical = hasCritical ? weightedLayerMix([
      { score: projCritPriv, weight: weights.privilege, present: privResources.some((r: any) => r.resource_class === 'critical_path') },
      { score: projCritNet, weight: weights.network, present: netResources.some((r: any) => r.resource_class === 'critical_path') },
      { score: projCritData, weight: weights.data, present: dataResources.some((r: any) => r.resource_class === 'critical_path') },
    ], 0) : null

    const customerImprovement = Math.max(0, projectedCustomer - customerScore)
    const scoredResourcesWithGaps = perResource.filter((resource: any) => resourceHasGap(resource)).length
    const unmatchedRemediableIssues = remediableLP.filter((lp) => {
      return !perResource.some((resource: any) => {
        const resourceId = String(resource.resource_id || resource.resource_name || '').toLowerCase()
        return matchesLPIdentifier(resourceId, lp.name) || matchesLPIdentifier(resourceId, lp.id)
      })
    }).length

    // ── Risk labels ────────────────────────────────────────────────
    const layerRisks = [
      { key: 'privilege' as const, gap: privilege.gapPercent, weight: weights.privilege },
      { key: 'network' as const, gap: network.gapPercent, weight: weights.network },
      { key: 'data' as const, gap: data_layer.gapPercent, weight: weights.data },
    ].sort((a, b) => (b.gap * b.weight) - (a.gap * a.weight))

    layerRisks.forEach((lr, i) => {
      const layer = lr.key === 'privilege' ? privilege : lr.key === 'network' ? network : data_layer
      if (lr.gap === 0) {
        layer.riskLabel = layer.total === 0 && lr.key === 'network'
          ? 'No lateral exposure detected'
          : 'Fully enforced'
      } else if (i === 0) {
        layer.riskLabel = 'Primary risk driver'
      } else if (lr.gap > 20) {
        layer.riskLabel = 'Significant exposure'
      } else {
        layer.riskLabel = 'Low contribution to risk'
      }
    })

    // ── Transform backend actions → frontend shape ─────────────────
    const actions: EnforcementAction[] = transformActions(
      scoreData.ranked_actions || [],
      privilege,
      network,
      data_layer,
      privUnused,
      privAllowed,
      issuesData,
    )

    // ── Impact framing (presentation) ──────────────────────────────
    const primaryDriver = layerRisks[0]
    const primaryDriverLabel = primaryDriver.key === 'privilege' ? 'Over-provisioned IAM'
      : primaryDriver.key === 'network' ? 'Unrestricted network paths'
      : 'Unprotected data resources'

    const criticalGaps = resourceClassification.critical_path || 0
    const remediableGaps = scoredResourcesWithGaps + unmatchedRemediableIssues
    const customerGap = 100 - customerScore

    const impact = {
      attackPathsExposed: privUnused + network.gap + data_layer.gap,
      reductionPercent: customerImprovement,
      primaryDriver: primaryDriverLabel,
      riskStatement: customerGap > 0
        ? `${customerGap}% of your customer-controlled attack surface is exposed — ${primaryDriverLabel.toLowerCase()} is the primary driver`
        : 'All customer-controlled enforcements active — monitoring for drift',
      criticalGaps,
      remediableGaps,
    }

    // ── Headlines (based on customer score, not coverage) ──────────
    let headline: string
    if (customerScore < 40) headline = `${customerGap}% of your attack surface is critically exposed`
    else if (customerScore < 60) headline = `${customerGap}% of your resources remain exploitable`
    else if (customerScore < 80) headline = `${customerGap}% enforcement gap in customer-controlled resources`
    else headline = `Strong enforcement at ${customerScore}% — ${customerGap}% gap remaining`

    const canClose = customerImprovement > 0
      ? `Cyntro can improve customer enforcement from ${customerScore}% to ${projectedCustomer}% — closing ${customerImprovement}% of exploitable gaps`
      : 'Fully enforced — monitoring for drift'

    const result: EnforcementScore = {
      systemName,

      // 3 scores
      coverageScore,
      customerScore,
      criticalScore,

      // Back-compat
      totalScore: coverageScore,
      totalGap,

      projected: {
        coverageScore: projectedCoverage,
        customerScore: projectedCustomer,
        criticalScore: projectedCritical,
        improvement: customerImprovement,
        privilege: projCustPriv,
        network: projCustNet,
        data: projCustData,
        // Back-compat
        totalScore: projectedCoverage,
      },

      resourceClassification,
      enforcementTiers,

      layers: { privilege, network, data: data_layer },
      actions,
      impact,
      headline,
      canClose,
    }

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('[enforcement-score] Error:', error)
    return NextResponse.json(emptyResult(systemName, error.message), { status: 500 })
  }
}


// ─── Transform helpers ──────────────────────────────────────────────────

function transformLayer(
  backendLayer: any,
  perResource: any[],
  overrideDetails?: string,
  overrideCounts?: { enforced: number; total: number },
): LayerScore {
  const score = backendLayer.score ?? 100
  const enforced = overrideCounts?.enforced ?? backendLayer.enforced_count ?? 0
  const total = overrideCounts?.total ?? backendLayer.resource_count ?? 0
  const gap = total - enforced
  const gapPercent = total > 0 ? Math.round((gap / total) * 100) : (score < 100 ? 100 - score : 0)

  const severityBuckets: SeverityBuckets = backendLayer.severity_buckets || {
    strongly_enforced: 0, enforced_with_gaps: 0, weakly_enforced: 0, critically_exposed: 0,
  }

  const classification: LayerClassification = backendLayer.classification || {
    provider_managed: 0, critical_path: 0, customer: 0,
  }

  // Build items from per-resource results
  const items: LayerScore['items'] = perResource.map((r: any) => {
    const resourceScore = r.score ?? 100
    const tier = r.enforcement_tier || 'strongly_enforced'
    let status: 'enforced' | 'exposed' | 'partial' | 'critical'
    if (resourceScore >= 90) status = 'enforced'
    else if (resourceScore >= 70) status = 'partial'
    else if (resourceScore >= 40) status = 'exposed'
    else status = 'critical'

    // Build detail from reasons or signals
    const detail = r.reasons?.length > 0
      ? r.reasons.slice(0, 3).join(' · ')
      : r.signals?.filter((s: any) => s.value === true && !s.is_missing)
          .slice(0, 2)
          .map((s: any) => s.detail)
          .join(' · ')
        || `Score: ${resourceScore}`

    return {
      name: r.resource_id || r.resource_name || 'Unknown',
      status,
      detail,
      resourceClass: r.resource_class || 'customer',
      tier,
      riskWeight: r.risk_weight || 1.0,
    }
  })

  // Sort: critical first, then exposed, then partial, then enforced
  const statusOrder = { critical: 0, exposed: 1, partial: 2, enforced: 3 }
  items.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])

  // Default details from top issues
  const defaultDetails = backendLayer.top_issues?.length > 0
    ? `${enforced} of ${total} resources enforced — ${backendLayer.exposed_count || gap} exposed`
    : `${enforced} of ${total} resources enforced`

  return {
    score,
    enforced,
    total,
    gap,
    gapPercent,
    details: overrideDetails || defaultDetails,
    riskLabel: '', // Set after all layers computed
    severityBuckets,
    classification,
    items,
  }
}


function transformActions(
  backendActions: any[],
  privilege: LayerScore,
  network: LayerScore,
  data_layer: LayerScore,
  privUnused: number,
  privAllowed: number,
  issuesData: any,
): EnforcementAction[] {
  const actions: EnforcementAction[] = []

  // ── Privilege action from issues-summary (permission ratio) ──────
  if (privUnused > 0) {
    const iamIssues = issuesData.issues?.filter((i: any) =>
      i.type === 'iam_unused_permissions' || i.type === 'unused_permission'
    ) || []

    const highConfidence = iamIssues.filter((i: any) => {
      const days = i.observationDays || i.observation_days || 90
      return days >= 90
    })

    const highUnused = highConfidence.reduce((sum: number, i: any) =>
      sum + (i.unusedCount || i.unused_count || 0), 0
    )

    const count = highUnused || privUnused
    const avgDays = highConfidence.length > 0
      ? Math.round(highConfidence.reduce((s: number, i: any) =>
          s + (i.observationDays || i.observation_days || 90), 0) / highConfidence.length)
      : 90

    actions.push({
      id: 'priv-remove-unused',
      layer: 'privilege',
      title: `Remove ${count} unused IAM permissions`,
      detail: `${highConfidence.length || iamIssues.length} roles with over-provisioned access`,
      impact: `Reduces blast radius by ${privilege.gapPercent}%`,
      risk: `${count} permissions remain exploitable — any compromised credential inherits full access`,
      confidence: 'high',
      observationDays: avgDays,
      rollback: 'Instant — Cyntro snapshots policy before change',
      count,
    })
  }

  // ── Group backend actions by layer + type for aggregation ────────
  const LAYER_MAP: Record<string, 'privilege' | 'network' | 'data'> = {
    IAMRole: 'privilege', IAMPolicy: 'privilege', IAMUser: 'privilege',
    SecurityGroup: 'network', EC2: 'network', Lambda: 'network',
    Subnet: 'network', VPC: 'network', InternetGateway: 'network',
    RouteTable: 'network', NetworkACL: 'network',
    S3: 'data', S3Bucket: 'data', RDS: 'data', RDSInstance: 'data',
    DynamoDB: 'data', DynamoDBTable: 'data', KMS: 'data',
  }

  // Group by action ID to aggregate counts
  const grouped: Record<string, {
    action: any
    resources: string[]
    layer: 'privilege' | 'network' | 'data'
  }> = {}

  for (const action of backendActions) {
    const key = action.id
    const layer = LAYER_MAP[action.resource_type] || 'network'

    if (!grouped[key]) {
      grouped[key] = { action, resources: [], layer }
    }
    grouped[key].resources.push(action.resource_id || action.resource_name || '')
  }

  // Convert grouped actions to frontend shape
  for (const [actionId, group] of Object.entries(grouped)) {
    // Skip privilege actions already handled from issues-summary
    if (group.layer === 'privilege' && actions.some(a => a.layer === 'privilege')) continue

    const a = group.action
    const count = group.resources.length
    const resourceList = group.resources.slice(0, 3).join(', ')
      + (count > 3 ? ` + ${count - 3} more` : '')

    actions.push({
      id: actionId,
      layer: group.layer,
      title: count > 1 ? `${a.title} (${count} resources)` : a.title,
      detail: resourceList,
      impact: a.impact || '',
      risk: a.risk_if_skipped || '',
      confidence: (a.confidence || 'medium').toLowerCase() as 'high' | 'medium' | 'low',
      observationDays: a.observation_days ?? 0,
      rollback: a.rollback || '',
      count,
    })
  }

  // Sort: high confidence first, then by layer importance
  const confOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const layerOrder: Record<string, number> = { privilege: 0, network: 1, data: 2 }
  actions.sort((a, b) => {
    if (confOrder[a.confidence] !== confOrder[b.confidence]) {
      return confOrder[a.confidence] - confOrder[b.confidence]
    }
    return layerOrder[a.layer] - layerOrder[b.layer]
  })

  return actions
}


function emptyResult(systemName: string, errorMessage?: string): any {
  return {
    systemName,
    coverageScore: 0,
    customerScore: 0,
    criticalScore: null,
    totalScore: 0,
    totalGap: 100,
    projected: {
      coverageScore: 0, customerScore: 0, criticalScore: null,
      improvement: 0, privilege: 0, network: 0, data: 0, totalScore: 0,
    },
    resourceClassification: { provider_managed: 0, critical_path: 0, customer: 0, total: 0 },
    enforcementTiers: { strongly_enforced: 0, enforced_with_gaps: 0, weakly_enforced: 0, critically_exposed: 0 },
    layers: {
      privilege: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', riskLabel: '', severityBuckets: { strongly_enforced: 0, enforced_with_gaps: 0, weakly_enforced: 0, critically_exposed: 0 }, classification: { provider_managed: 0, critical_path: 0, customer: 0 }, items: [] },
      network: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', riskLabel: '', severityBuckets: { strongly_enforced: 0, enforced_with_gaps: 0, weakly_enforced: 0, critically_exposed: 0 }, classification: { provider_managed: 0, critical_path: 0, customer: 0 }, items: [] },
      data: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', riskLabel: '', severityBuckets: { strongly_enforced: 0, enforced_with_gaps: 0, weakly_enforced: 0, critically_exposed: 0 }, classification: { provider_managed: 0, critical_path: 0, customer: 0 }, items: [] },
    },
    actions: [],
    impact: { attackPathsExposed: 0, reductionPercent: 0, primaryDriver: '', riskStatement: 'Unable to compute', criticalGaps: 0, remediableGaps: 0 },
    headline: 'Unable to compute enforcement score',
    canClose: '',
    ...(errorMessage ? { error: errorMessage } : {}),
  }
}
