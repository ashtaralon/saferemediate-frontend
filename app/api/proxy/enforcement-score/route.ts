import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

/**
 * Enforcement Score API — Thin Proxy
 *
 * All scoring intelligence lives in the backend at:
 *   /api/service-risk-scores/{system_name}
 *
 * This proxy only:
 *   1. Fetches the backend scoring + issues-summary (for permission ratios)
 *   2. Transforms backend shape → frontend EnforcementScore shape
 *   3. Computes presentation-only values (projected scores, risk labels, headlines)
 */

// ── Frontend types (UI contract) ──────────────────────────────────────

interface LayerScore {
  score: number
  enforced: number
  total: number
  gap: number
  gapPercent: number
  details: string
  riskLabel: string
  items: Array<{ name: string; status: 'enforced' | 'exposed' | 'partial'; detail: string }>
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
  totalScore: number
  totalGap: number
  projected: {
    totalScore: number
    privilege: number
    network: number
    data: number
    improvement: number
  }
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
  }
  headline: string
  canClose: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get('systemName') || 'alon-prod'

  try {
    // ── Fetch backend scoring + issues-summary in parallel ──────────
    const [scoreResp, issuesResp] = await Promise.allSettled([
      fetch(`${BACKEND_URL}/api/service-risk-scores/${encodeURIComponent(systemName)}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        cache: 'no-store',
      }),
      fetch(`${BACKEND_URL}/api/issues/summary?system_name=${encodeURIComponent(systemName)}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25000),
        cache: 'no-store',
      }),
    ])

    let scoreData: any = null
    let issuesData: any = {}

    if (scoreResp.status === 'fulfilled' && scoreResp.value.ok) {
      scoreData = await scoreResp.value.json()
    }
    if (issuesResp.status === 'fulfilled' && issuesResp.value.ok) {
      issuesData = await issuesResp.value.json()
    }

    // If backend scoring endpoint failed, return error
    if (!scoreData) {
      console.error('[enforcement-score] Backend scoring endpoint failed')
      return NextResponse.json(emptyResult(systemName, 'Backend scoring unavailable'), { status: 502 })
    }

    // ── Extract backend layers ──────────────────────────────────────
    const backendLayers = scoreData.layers || {}
    const backendPrivilege = backendLayers.privilege || {}
    const backendNetwork = backendLayers.network || {}
    const backendData = backendLayers.data || {}

    // ── Permission ratio from issues-summary (for privilege details) ─
    const permissions = issuesData.byCategory?.permissions || {}
    const privAllowed = permissions.allowed || 0
    const privUsed = permissions.used || 0
    const privUnused = permissions.unused || (privAllowed - privUsed)

    // ── Transform: Backend layer → Frontend LayerScore ──────────────

    const privilege: LayerScore = transformLayer(
      backendPrivilege,
      scoreData.per_resource?.filter((r: any) =>
        ['IAMRole', 'IAMPolicy', 'IAMUser'].includes(r.resource_type)
      ) || [],
      // Override details with permission ratio if available
      privAllowed > 0
        ? `${privUsed} of ${privAllowed} permissions actively used — ${privUnused} can be removed`
        : undefined,
      // Override enforced/total with permission counts for IAM
      privAllowed > 0 ? { enforced: privUsed, total: privAllowed } : undefined,
    )

    const network: LayerScore = transformLayer(
      backendNetwork,
      scoreData.per_resource?.filter((r: any) =>
        ['SecurityGroup', 'EC2', 'Lambda', 'Subnet', 'VPC', 'InternetGateway', 'RouteTable', 'NetworkACL'].includes(r.resource_type)
      ) || [],
    )

    const data_layer: LayerScore = transformLayer(
      backendData,
      scoreData.per_resource?.filter((r: any) =>
        ['S3', 'S3Bucket', 'RDS', 'RDSInstance', 'DynamoDB', 'DynamoDBTable', 'KMS'].includes(r.resource_type)
      ) || [],
    )

    // ── Total score (from backend) ──────────────────────────────────
    const totalScore = scoreData.total_score ?? 0
    const totalGap = 100 - totalScore

    // ── Projected scores (presentation logic) ───────────────────────
    const weights = { privilege: 0.50, network: 0.30, data: 0.20 }
    const projectedPrivilege = Math.min(100, Math.round(privilege.score + privilege.gapPercent * 0.90))
    const projectedNetwork = Math.min(100, Math.round(network.score + network.gapPercent * 0.85))
    const projectedData = Math.min(100, Math.round(data_layer.score + data_layer.gapPercent * 0.80))
    const projectedTotal = Math.round(
      projectedPrivilege * weights.privilege +
      projectedNetwork * weights.network +
      projectedData * weights.data
    )
    const projectedImprovement = projectedTotal - totalScore

    // ── Risk labels (which layer is the biggest driver) ─────────────
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

    // ── Transform backend actions → frontend shape ──────────────────
    const actions: EnforcementAction[] = transformActions(
      scoreData.ranked_actions || [],
      privilege,
      network,
      data_layer,
      privUnused,
      privAllowed,
      issuesData,
    )

    // ── Impact framing (presentation) ───────────────────────────────
    const primaryDriver = layerRisks[0]
    const primaryDriverLabel = primaryDriver.key === 'privilege' ? 'Over-provisioned IAM'
      : primaryDriver.key === 'network' ? 'Unrestricted network paths'
      : 'Unprotected data resources'

    const impact = {
      attackPathsExposed: privUnused + network.gap + data_layer.gap,
      reductionPercent: projectedImprovement,
      primaryDriver: primaryDriverLabel,
      riskStatement: totalGap > 0
        ? `${totalGap}% of your attack surface remains exploitable — ${primaryDriverLabel.toLowerCase()} is the primary driver`
        : 'All enforcements active — monitoring for drift',
    }

    // ── Sales headlines ─────────────────────────────────────────────
    let headline: string
    if (totalScore < 40) headline = `${totalGap}% of your attack paths remain exploitable`
    else if (totalScore < 60) headline = `${totalGap}% of your attack surface remains exploitable`
    else if (totalScore < 80) headline = `${totalGap}% enforcement gap — blast radius still reachable`
    else headline = `Strong enforcement at ${totalScore}% — ${totalGap}% gap remaining`

    const canClose = projectedImprovement > 0
      ? `Cyntro can reduce exposure from ${totalGap}% to ${100 - projectedTotal}% — eliminating ${projectedImprovement}% of exploitable paths`
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

  // Build items from per-resource results
  const items: LayerScore['items'] = perResource.map((r: any) => {
    const resourceScore = r.score ?? 100
    const status: 'enforced' | 'exposed' | 'partial' =
      resourceScore >= 70 ? 'enforced' : resourceScore >= 40 ? 'partial' : 'exposed'

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
    }
  })

  // Sort: exposed first, then partial, then enforced
  const statusOrder = { exposed: 0, partial: 1, enforced: 2 }
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
    totalScore: 0,
    totalGap: 100,
    projected: { totalScore: 0, privilege: 0, network: 0, data: 0, improvement: 0 },
    layers: {
      privilege: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', riskLabel: '', items: [] },
      network: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', riskLabel: '', items: [] },
      data: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', riskLabel: '', items: [] },
    },
    actions: [],
    impact: { attackPathsExposed: 0, reductionPercent: 0, primaryDriver: '', riskStatement: 'Unable to compute' },
    headline: 'Unable to compute enforcement score',
    canClose: '',
    ...(errorMessage ? { error: errorMessage } : {}),
  }
}
