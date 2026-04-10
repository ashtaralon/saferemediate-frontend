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
  riskLabel: string       // Risk contribution label (e.g. "Primary risk driver")
  items: Array<{ name: string; status: 'enforced' | 'exposed' | 'partial'; detail: string }>
}

interface EnforcementAction {
  id: string
  layer: 'privilege' | 'network' | 'data'
  title: string               // What to do
  detail: string              // Why / what specifically
  impact: string              // What happens if you do it
  risk: string                // What happens if you don't
  confidence: 'high' | 'medium' | 'low'
  observationDays: number     // How long we've been watching
  rollback: string            // How to undo
  count: number               // How many items affected
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
  actions: EnforcementAction[]  // Top enforcement opportunities
  impact: {
    attackPathsExposed: number  // Exploitable paths remaining
    reductionPercent: number    // % exposure reduction if enforced
    primaryDriver: string       // Which layer contributes most to risk
    riskStatement: string       // "X% of attack paths remain exploitable"
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
      riskLabel: '',  // Set after all layers computed
      items: privilegeItems,
    }

    // ═══════════════════════════════════════════════════════════════
    // LAYER 2: NETWORK ENFORCEMENT
    // ═══════════════════════════════════════════════════════════════
    // Score = enforced network controls / total network controls
    //
    // Network controls we check (from security-risk-factors):
    //   SGs: open 0.0.0.0/0 rules, high-risk ports
    //   EC2/Lambda: public IPs, public SG attached, no SG protection
    //   NACLs: overly permissive rules
    //   Subnets: public subnets with internet-facing resources
    //
    // Each control point is either enforced (locked down) or exposed (open)

    const sgResources = resources.filter((r: any) => r.type === 'SecurityGroup')
    const ec2Resources = resources.filter((r: any) => r.type === 'EC2' || r.type === 'Lambda')
    const naclResources = resources.filter((r: any) => r.type === 'NetworkACL')
    const subnetResources = resources.filter((r: any) => r.type === 'Subnet')

    let netEnforced = 0
    let netTotal = 0
    const networkItems: LayerScore['items'] = []

    // ── Security Groups: check for open CIDR rules and high-risk ports ──
    for (const sg of sgResources) {
      const sgRisk = risks[sg.name] || {}
      const factors = sgRisk.factors || []
      const hasPublicRules = factors.some((f: any) => f.factor === 'public_inbound_rules')
      const hasHighRiskPorts = factors.some((f: any) => f.factor === 'high_risk_ports')
      const publicDetail = factors.find((f: any) => f.factor === 'public_inbound_rules')
      const portsDetail = factors.find((f: any) => f.factor === 'high_risk_ports')

      netTotal++

      if (!hasPublicRules && !hasHighRiskPorts) {
        netEnforced++
        networkItems.push({
          name: sg.name,
          status: 'enforced',
          detail: 'No open CIDRs, no high-risk ports',
        })
      } else {
        // Build detail from actual findings
        const details: string[] = []
        if (publicDetail) details.push(publicDetail.detail)
        if (portsDetail) details.push(portsDetail.detail)
        networkItems.push({
          name: sg.name,
          status: 'exposed',
          detail: details.join(' · ') || 'Over-permissive rules',
        })
      }
    }

    // ── EC2/Lambda: check for network exposure ──
    // Threat model: attacker is already inside. Every compute resource without
    // a network boundary is blast radius — Lambdas without SG can reach
    // DynamoDB, S3, KMS, and every sensitive service.
    for (const ec2 of ec2Resources) {
      const ec2Risk = risks[ec2.name] || {}
      const factors = ec2Risk.factors || []
      if (factors.length === 0 && !ec2Risk.is_internet_facing) continue // Skip clean internal resources

      const hasPublicIP = factors.some((f: any) => f.factor === 'has_public_ip')
      const hasPublicSG = factors.some((f: any) => f.factor === 'public_sg_attached')
      const hasHighRiskSG = factors.some((f: any) => f.factor === 'high_risk_sg_attached')
      const noSGProtection = factors.some((f: any) => f.factor === 'no_sg_protection')
      const excessivePerms = factors.some((f: any) => f.factor === 'excessive_permissions')
      const noIAMRole = factors.some((f: any) => f.factor === 'no_iam_role')
      const isLambda = ec2.type === 'Lambda'

      netTotal++
      const isExposed = hasPublicIP || hasPublicSG || hasHighRiskSG || noSGProtection

      if (!isExposed) {
        netEnforced++
        networkItems.push({
          name: ec2.name,
          status: 'enforced',
          detail: `${ec2.type} — network boundary enforced`,
        })
      } else {
        const issues: string[] = []
        if (hasPublicIP) issues.push('Public IP')
        if (hasPublicSG) issues.push('Open SG attached')
        if (hasHighRiskSG) issues.push('High-risk SG')
        if (noSGProtection && isLambda) issues.push('No network boundary — can reach all services')
        else if (noSGProtection) issues.push('No SG protection')
        if (excessivePerms) issues.push('Excessive permissions')

        // Severity: high-risk SG or public IP = exposed, no SG on Lambda = partial (still internal)
        const severity = (hasHighRiskSG || (hasPublicIP && hasPublicSG)) ? 'exposed'
          : (hasPublicIP || hasPublicSG) ? 'exposed'
          : 'partial'

        networkItems.push({
          name: ec2.name,
          status: severity,
          detail: `${ec2.type} — ${issues.join(', ')}`,
        })
      }
    }

    // ── NACLs: check for risk factors ──
    for (const nacl of naclResources) {
      const naclRisk = risks[nacl.name] || {}
      const factors = naclRisk.factors || []
      netTotal++
      if (factors.length === 0 && (naclRisk.risk_score || 0) === 0) {
        netEnforced++
        networkItems.push({ name: nacl.name, status: 'enforced', detail: 'NACL — restrictive rules' })
      } else {
        networkItems.push({
          name: nacl.name,
          status: 'exposed',
          detail: `NACL — ${factors.map((f: any) => f.detail).join(', ') || 'over-permissive'}`,
        })
      }
    }

    // Fallback: if still no network controls found
    if (netTotal === 0) {
      // Use internet gateways as a proxy — each IGW is an exposure point
      const igws = resources.filter((r: any) => r.type === 'InternetGateway')
      netTotal = Math.max(1, igws.length)
      netEnforced = 0  // IGWs alone don't enforce anything
      for (const igw of igws) {
        networkItems.push({
          name: igw.name,
          status: 'partial',
          detail: 'Internet gateway — exposure point without WAF/firewall',
        })
      }
    }

    const networkScore = netTotal > 0 ? Math.round((netEnforced / netTotal) * 100) : 0
    const netGap = netTotal - netEnforced

    // Sort network items: exposed first, then partial, then enforced
    const statusOrder = { exposed: 0, partial: 1, enforced: 2 }
    networkItems.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])

    const exposedCount = networkItems.filter(i => i.status === 'exposed').length
    const partialCount = networkItems.filter(i => i.status === 'partial').length

    const network: LayerScore = {
      score: networkScore,
      enforced: netEnforced,
      total: netTotal,
      gap: netGap,
      gapPercent: netTotal > 0 ? Math.round((netGap / netTotal) * 100) : 100,
      details: netTotal > 0
        ? `${netEnforced} of ${netTotal} network controls enforced — ${exposedCount} exposed, ${partialCount} partial`
        : 'No network controls detected — lateral exposure unmonitored',
      riskLabel: '',
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
      riskLabel: '',
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

    // ═══════════════════════════════════════════════════════════════
    // RISK LABELS (which layer is the biggest risk driver)
    // ═══════════════════════════════════════════════════════════════
    const layerRisks = [
      { key: 'privilege', gap: privilege.gapPercent, weight: weights.privilege },
      { key: 'network', gap: network.gapPercent, weight: weights.network },
      { key: 'data', gap: data_layer.gapPercent, weight: weights.data },
    ].sort((a, b) => (b.gap * b.weight) - (a.gap * a.weight))

    const riskLabels: Record<string, string> = {}
    layerRisks.forEach((lr, i) => {
      if (lr.gap === 0) {
        riskLabels[lr.key] = lr.key === 'network' && netTotal === 0
          ? 'No lateral exposure detected'
          : 'Fully enforced'
      } else if (i === 0) {
        riskLabels[lr.key] = 'Primary risk driver'
      } else if (lr.gap > 20) {
        riskLabels[lr.key] = 'Significant exposure'
      } else {
        riskLabels[lr.key] = 'Low contribution to risk'
      }
    })
    privilege.riskLabel = riskLabels['privilege']
    network.riskLabel = riskLabels['network']
    data_layer.riskLabel = riskLabels['data']

    // ═══════════════════════════════════════════════════════════════
    // TOP ENFORCEMENT ACTIONS
    // ═══════════════════════════════════════════════════════════════
    const actions: EnforcementAction[] = []

    // Privilege actions — from IAM issues
    if (privUnused > 0) {
      // Group by confidence based on observation
      const highConfidenceIssues = iamIssues.filter((i: any) => {
        const days = i.observationDays || i.observation_days || 90
        return days >= 90
      })
      const medConfidenceIssues = iamIssues.filter((i: any) => {
        const days = i.observationDays || i.observation_days || 90
        return days >= 30 && days < 90
      })

      const highUnused = highConfidenceIssues.reduce((sum: number, i: any) =>
        sum + (i.unusedCount || i.unused_count || 0), 0
      )
      const medUnused = medConfidenceIssues.reduce((sum: number, i: any) =>
        sum + (i.unusedCount || i.unused_count || 0), 0
      )

      if (highUnused > 0 || highConfidenceIssues.length === 0) {
        const count = highUnused || privUnused
        const avgDays = highConfidenceIssues.length > 0
          ? Math.round(highConfidenceIssues.reduce((s: number, i: any) =>
              s + (i.observationDays || i.observation_days || 90), 0) / highConfidenceIssues.length)
          : 90
        actions.push({
          id: 'priv-remove-unused',
          layer: 'privilege',
          title: `Remove ${count} unused IAM permissions`,
          detail: `${highConfidenceIssues.length || iamIssues.length} roles with over-provisioned access`,
          impact: `Reduces blast radius by ${privilege.gapPercent}%`,
          risk: `${count} permissions remain exploitable — any compromised credential inherits full access`,
          confidence: 'high',
          observationDays: avgDays,
          rollback: 'Instant — Cyntro snapshots policy before change',
          count,
        })
      }

      if (medUnused > 0) {
        actions.push({
          id: 'priv-review-medium',
          layer: 'privilege',
          title: `Review ${medUnused} permissions with limited observation`,
          detail: `${medConfidenceIssues.length} roles observed for 30-90 days`,
          impact: `Could reduce an additional ${Math.round((medUnused / privAllowed) * 100)}% of privilege surface`,
          risk: 'Moderate — some usage may not yet be observed',
          confidence: 'medium',
          observationDays: 60,
          rollback: 'Instant — policy snapshot + canary deployment',
          count: medUnused,
        })
      }
    }

    // Network actions — from real SG / EC2 / Lambda risk factors
    const exposedSGItems = networkItems.filter(i => i.status === 'exposed' && !i.detail.includes('EC2') && !i.detail.includes('Lambda') && !i.detail.includes('NACL'))
    const exposedEC2Items = networkItems.filter(i => (i.status === 'exposed' || i.status === 'partial') && i.detail.includes('EC2'))
    const exposedLambdaItems = networkItems.filter(i => (i.status === 'exposed' || i.status === 'partial') && i.detail.includes('Lambda'))

    if (exposedSGItems.length > 0) {
      const totalOpenRules = exposedSGItems.reduce((sum, sg) => {
        const match = sg.detail.match(/(\d+) inbound/)
        return sum + (match ? parseInt(match[1]) : 1)
      }, 0)
      actions.push({
        id: 'net-restrict-sgs',
        layer: 'network',
        title: `Lock down ${exposedSGItems.length} over-permissive security groups`,
        detail: exposedSGItems.map(s => s.name).slice(0, 3).join(', ') + (exposedSGItems.length > 3 ? ` + ${exposedSGItems.length - 3} more` : ''),
        impact: `Closes ${totalOpenRules || exposedSGItems.length} inbound rules open to 0.0.0.0/0 — eliminates lateral movement paths`,
        risk: `${exposedSGItems.length} SGs allow unrestricted ingress from the internet — any port scan finds open high-risk ports`,
        confidence: 'high',
        observationDays: 90,
        rollback: 'Instant — security group rules restored from snapshot',
        count: exposedSGItems.length,
      })
    }

    if (exposedEC2Items.length > 0) {
      const publicIPs = exposedEC2Items.filter(i => i.detail.includes('Public IP'))
      const noSG = exposedEC2Items.filter(i => i.detail.includes('No SG'))
      actions.push({
        id: 'net-harden-instances',
        layer: 'network',
        title: `Harden ${exposedEC2Items.length} internet-exposed instances`,
        detail: exposedEC2Items.map(s => s.name).slice(0, 3).join(', ') + (exposedEC2Items.length > 3 ? ` + ${exposedEC2Items.length - 3} more` : ''),
        impact: `Removes public exposure from ${publicIPs.length} instances with public IPs${noSG.length > 0 ? ` and adds SG protection to ${noSG.length}` : ''}`,
        risk: `${exposedEC2Items.length} instances reachable from the internet — direct attack surface for RCE, credential theft`,
        confidence: 'high',
        observationDays: 90,
        rollback: 'Instant — EIP and SG associations restored from snapshot',
        count: exposedEC2Items.length,
      })
    }

    if (exposedLambdaItems.length > 0) {
      actions.push({
        id: 'net-isolate-lambdas',
        layer: 'network',
        title: `Isolate ${exposedLambdaItems.length} Lambdas with no network boundary`,
        detail: exposedLambdaItems.map(s => s.name).slice(0, 3).join(', ') + (exposedLambdaItems.length > 3 ? ` + ${exposedLambdaItems.length - 3} more` : ''),
        impact: `Places VPC boundaries on ${exposedLambdaItems.length} functions — limits blast radius to designated subnets only`,
        risk: `${exposedLambdaItems.length} Lambdas can reach every AWS service (DynamoDB, S3, KMS) — a compromised function has unlimited lateral movement`,
        confidence: 'high',
        observationDays: 90,
        rollback: 'Instant — VPC config and SG associations removed',
        count: exposedLambdaItems.length,
      })
    }

    if (netTotal === 0) {
      actions.push({
        id: 'net-enable-analysis',
        layer: 'network',
        title: 'Enable network path analysis',
        detail: 'No enforceable network paths detected yet — connect VPC flow logs for lateral exposure scoring',
        impact: 'Reveals hidden lateral movement paths between resources',
        risk: 'Blind spot — lateral exposure is unmonitored',
        confidence: 'low',
        observationDays: 0,
        rollback: 'N/A — read-only analysis',
        count: 0,
      })
    }

    // Data actions — from exposed data resources
    const exposedData = dataItems.filter(i => i.status === 'exposed' || i.status === 'partial')
    if (exposedData.length > 0) {
      const unencrypted = dataItems.filter(i => i.detail.includes('NOT encrypted'))
      const publicAccess = dataItems.filter(i => i.detail.includes('PUBLIC'))

      if (unencrypted.length > 0) {
        actions.push({
          id: 'data-encrypt',
          layer: 'data',
          title: `Encrypt ${unencrypted.length} unprotected data resources`,
          detail: unencrypted.map(d => d.name).slice(0, 3).join(', ') + (unencrypted.length > 3 ? ` + ${unencrypted.length - 3} more` : ''),
          impact: `Protects ${unencrypted.length} data stores from unauthorized read access`,
          risk: `${unencrypted.length} data stores readable in plaintext if accessed`,
          confidence: 'high',
          observationDays: 0,
          rollback: 'Encryption is non-destructive — can be disabled if needed',
          count: unencrypted.length,
        })
      }
      if (publicAccess.length > 0) {
        actions.push({
          id: 'data-restrict-public',
          layer: 'data',
          title: `Block public access on ${publicAccess.length} data resources`,
          detail: publicAccess.map(d => d.name).slice(0, 3).join(', ') + (publicAccess.length > 3 ? ` + ${publicAccess.length - 3} more` : ''),
          impact: `Eliminates ${publicAccess.length} internet-accessible data paths`,
          risk: `${publicAccess.length} resources reachable from the public internet`,
          confidence: 'high',
          observationDays: 0,
          rollback: 'Instant — access policy restored from snapshot',
          count: publicAccess.length,
        })
      }
    }

    // Sort actions by impact (highest gap contribution first)
    actions.sort((a, b) => {
      const layerOrder = { privilege: 0, network: 1, data: 2 }
      const confOrder = { high: 0, medium: 1, low: 2 }
      if (confOrder[a.confidence] !== confOrder[b.confidence]) return confOrder[a.confidence] - confOrder[b.confidence]
      return layerOrder[a.layer] - layerOrder[b.layer]
    })

    // ═══════════════════════════════════════════════════════════════
    // RISK / IMPACT FRAMING
    // ═══════════════════════════════════════════════════════════════
    const attackPathsExposed = privUnused + netGap + dataGap
    const primaryDriver = layerRisks[0]
    const primaryDriverLabel = primaryDriver.key === 'privilege' ? 'Over-provisioned IAM'
      : primaryDriver.key === 'network' ? 'Unrestricted network paths'
      : 'Unprotected data resources'

    const impact = {
      attackPathsExposed,
      reductionPercent: projectedImprovement,
      primaryDriver: primaryDriverLabel,
      riskStatement: totalGap > 0
        ? `${totalGap}% of your attack surface remains exploitable — ${primaryDriverLabel.toLowerCase()} is the primary driver`
        : 'All enforcements active — monitoring for drift',
    }

    // Sales headlines — risk-framed
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
      layers: {
        privilege,
        network,
        data: data_layer,
      },
      actions,
      impact,
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
          privilege: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', riskLabel: '', items: [] },
          network: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', riskLabel: '', items: [] },
          data: { score: 0, enforced: 0, total: 0, gap: 0, gapPercent: 0, details: 'Error loading', riskLabel: '', items: [] },
        },
        actions: [],
        impact: { attackPathsExposed: 0, reductionPercent: 0, primaryDriver: '', riskStatement: 'Unable to compute' },
        headline: 'Unable to compute enforcement score',
        canClose: '',
        error: error.message,
      },
      { status: 500 }
    )
  }
}
