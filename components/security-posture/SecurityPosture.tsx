"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { RefreshCw, Loader2 } from "lucide-react"
import { PlanePulse } from "./PlanePulse"
import { CommandQueues } from "./CommandQueues"
import { ComponentList } from "./ComponentList"
import { ComponentDetail } from "./ComponentDetail"
import type {
  SecurityPostureProps,
  SecurityComponent,
  ComponentDiff,
  GapItem,
  TimeWindow,
  EvidenceCoverage,
  ComponentListState,
  ComponentType,
  RiskTag,
  EvidenceStrength,
  RecommendationAction,
  // New types for PlanePulse and CommandQueues
  PlanePulseData,
  CommandQueuesData,
  QueueCardItem,
  QueueType,
  ConfidenceLevel,
  Severity,
  RiskFlag,
} from "./types"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

// ============================================================================
// Data Transformation Functions
// ============================================================================

function transformIAMGapToComponent(gap: any): SecurityComponent {
  const allowed = gap.allowed_permissions || 0
  const used = gap.used_permissions || 0
  const unused = gap.unused_permissions || 0

  let highestRiskUnused: RiskTag | null = null
  if (gap.has_wildcards || gap.role_name?.includes('*')) highestRiskUnused = 'wildcard'
  else if (gap.has_admin_access) highestRiskUnused = 'admin'
  else if (unused > 0) highestRiskUnused = 'write'

  return {
    id: gap.role_id || gap.role_name,
    name: gap.role_name,
    type: 'iam_role',
    lpScore: gap.usage_percent || Math.round((used / (allowed || 1)) * 100),
    allowedCount: allowed,
    observedCount: used,
    unusedCount: unused,
    highestRiskUnused,
    hasWildcards: gap.has_wildcards || false,
    hasAdminAccess: gap.has_admin_access || false,
    hasInternetExposure: false,
    confidence: gap.usage_percent >= 80 ? 'strong' : gap.usage_percent >= 50 ? 'medium' : 'weak',
    evidenceSources: [
      { source: 'CloudTrail', status: 'available' },
      { source: 'IAM', status: 'available' },
    ],
  }
}

function transformSGToComponent(sg: any): SecurityComponent {
  const rules = sg.rules_analysis || []
  const used = rules.filter((r: any) => r.status === 'USED' || r.status === 'PUBLIC_USED').length
  const unused = rules.filter((r: any) => r.status === 'UNUSED').length
  const total = rules.length

  const hasPublic = rules.some((r: any) => r.source === '0.0.0.0/0')
  const hasUnusedPublic = rules.some((r: any) => r.source === '0.0.0.0/0' && r.status === 'UNUSED')

  let highestRiskUnused: RiskTag | null = null
  if (hasUnusedPublic) highestRiskUnused = 'public'
  else if (unused > 0) highestRiskUnused = 'broad_ports'

  return {
    id: sg.sg_id,
    name: sg.sg_name,
    type: 'security_group',
    lpScore: total > 0 ? Math.round((used / total) * 100) : 100,
    allowedCount: total,
    observedCount: used,
    unusedCount: unused,
    highestRiskUnused,
    hasWildcards: false,
    hasAdminAccess: false,
    hasInternetExposure: hasPublic,
    confidence: sg.eni_count > 0 ? 'strong' : 'weak',
    evidenceSources: [
      { source: 'FlowLogs', status: sg.eni_count > 0 ? 'available' : 'unavailable' },
      { source: 'Config', status: 'available' },
    ],
  }
}

function transformIAMDetailToDiff(detail: any, roleName: string): ComponentDiff {
  const permissions = detail.permissions_analysis || []
  const unusedPerms = permissions.filter((p: any) => p.status === 'UNUSED')

  const items: GapItem[] = unusedPerms.map((p: any, idx: number) => {
    const riskTags: RiskTag[] = []
    if (p.permission?.includes('*')) riskTags.push('wildcard')
    if (p.is_high_risk || p.risk_level === 'HIGH' || p.risk_level === 'CRITICAL') riskTags.push('admin')
    if (p.permission?.toLowerCase().includes('delete')) riskTags.push('delete')
    if (p.permission?.toLowerCase().includes('put') || p.permission?.toLowerCase().includes('create')) riskTags.push('write')

    return {
      id: `${roleName}-${p.permission}-${idx}`,
      componentId: roleName,
      componentName: roleName,
      componentType: 'iam_role' as ComponentType,
      type: 'iam_action' as const,
      identifier: p.permission,
      allowedBy: detail.policies?.inline?.[0]?.policy_name || detail.policies?.managed?.[0]?.policy_name || 'Unknown Policy',
      observedCount: p.usage_count || 0,
      lastSeen: null,
      riskTags,
      riskScore: p.is_high_risk ? 80 : 40,
      recommendation: 'remove' as RecommendationAction,
      confidence: 85,
      reason: `Permission "${p.permission}" has not been used in the observation period. Consider removing to reduce attack surface.`,
    }
  })

  return {
    componentId: roleName,
    componentName: roleName,
    componentType: 'iam_role',
    allowed: detail.summary?.total_permissions || 0,
    observedUsed: detail.summary?.used_count || 0,
    unusedCandidates: detail.summary?.unused_count || 0,
    confidence: detail.summary?.lp_score >= 80 ? 'strong' : detail.summary?.lp_score >= 50 ? 'medium' : 'weak',
    confidencePercent: detail.summary?.lp_score || 0,
    observationWindow: '365 days',
    iamActions: {
      allowed: detail.summary?.total_permissions || 0,
      used: detail.summary?.used_count || 0,
      unused: detail.summary?.unused_count || 0,
      items,
    },
  }
}

function transformSGDetailToDiff(sg: any): ComponentDiff {
  const rules = sg.rules_analysis || []
  const unusedRules = rules.filter((r: any) => r.status === 'UNUSED')
  const usedRules = rules.filter((r: any) => r.status === 'USED' || r.status === 'PUBLIC_USED')

  const items: GapItem[] = unusedRules.map((r: any, idx: number) => {
    const riskTags: RiskTag[] = []
    if (r.source === '0.0.0.0/0') riskTags.push('public')
    if (r.port_range === '0-65535' || r.port_range === 'ALL') riskTags.push('broad_ports')

    return {
      id: `${sg.sg_id}-${r.port_range}-${r.source}-${idx}`,
      componentId: sg.sg_id,
      componentName: sg.sg_name,
      componentType: 'security_group' as ComponentType,
      type: 'sg_rule' as const,
      identifier: `${r.protocol || 'TCP'}:${r.port_range} from ${r.source}`,
      allowedBy: sg.sg_name,
      observedCount: r.hits || 0,
      lastSeen: r.hits > 0 ? 'Active' : null,
      riskTags,
      riskScore: r.source === '0.0.0.0/0' ? 90 : 50,
      recommendation: r.source === '0.0.0.0/0' ? 'remove' : 'review',
      confidence: sg.eni_count > 0 ? 85 : 30,
      reason: r.source === '0.0.0.0/0'
        ? `Internet-exposed rule with no traffic observed. Critical removal candidate.`
        : `No traffic observed for this rule in the observation period.`,
      exposure: {
        cidr: r.source,
        ports: r.port_range,
        protocol: r.protocol || 'TCP',
      },
    }
  })

  return {
    componentId: sg.sg_id,
    componentName: sg.sg_name,
    componentType: 'security_group',
    allowed: rules.length,
    observedUsed: usedRules.length,
    unusedCandidates: unusedRules.length,
    confidence: sg.eni_count > 0 ? 'strong' : 'weak',
    confidencePercent: sg.eni_count > 0 ? 85 : 30,
    observationWindow: '365 days',
    networkRules: {
      allowed: rules.length,
      used: usedRules.length,
      unused: unusedRules.length,
      items,
    },
  }
}

// ============================================================================
// Transform to PlanePulse data
// ============================================================================

function buildPlanePulseData(
  components: SecurityComponent[],
  evidenceCoverage: EvidenceCoverage[],
  windowDays: number
): PlanePulseData {
  // Calculate coverage percentages from evidence sources
  const cloudtrailCoverage = evidenceCoverage.find(e => e.source === 'CloudTrail')
  const flowLogsCoverage = evidenceCoverage.find(e => e.source === 'FlowLogs')
  const configCoverage = evidenceCoverage.find(e => e.source === 'Config')

  const getStatusPct = (status: string | undefined): number => {
    if (status === 'available') return 100
    if (status === 'partial') return 50
    return 0
  }

  // Calculate observed coverage from actual component data
  const componentsWithStrongConfidence = components.filter(c => c.confidence === 'strong').length
  const observedPct = components.length > 0
    ? Math.round((componentsWithStrongConfidence / components.length) * 100)
    : 0

  // Calculate observed breakdown
  const flowLogsPct = getStatusPct(flowLogsCoverage?.status)
  const cloudtrailPct = getStatusPct(cloudtrailCoverage?.status)

  // Determine observed confidence level
  let observedConfidence: ConfidenceLevel = 'unknown'
  if (observedPct >= 70) observedConfidence = 'high'
  else if (observedPct >= 40) observedConfidence = 'medium'
  else if (observedPct > 0) observedConfidence = 'low'

  const now = new Date().toISOString()

  return {
    window_days: windowDays,
    planes: {
      configured: {
        available: getStatusPct(configCoverage?.status) > 0,
        coverage_pct: getStatusPct(configCoverage?.status),
        last_updated: now,
      },
      observed: {
        available: observedPct > 0 || flowLogsPct > 0 || cloudtrailPct > 0,
        coverage_pct: observedPct,
        last_updated: now,
        confidence: observedConfidence,
        breakdown: {
          flow_logs: flowLogsPct,
          cloudtrail_usage: cloudtrailPct,
          xray: 0, // X-Ray not currently tracked
        },
      },
      authorized: {
        available: true,
        coverage_pct: 100, // IAM/SG rules always available
        last_updated: now,
      },
      changed: {
        available: cloudtrailPct > 0,
        coverage_pct: cloudtrailPct,
        last_updated: now,
      },
    },
  }
}

// ============================================================================
// Transform to CommandQueues data
// ============================================================================

function mapRiskTagToFlag(tag: RiskTag): RiskFlag {
  const mapping: Record<RiskTag, RiskFlag> = {
    admin: 'admin_policy',
    write: 'overly_permissive',
    delete: 'overly_permissive',
    wildcard: 'wildcard_action',
    public: 'world_open',
    broad_ports: 'sensitive_ports',
  }
  return mapping[tag] || 'overly_permissive'
}

function mapConfidence(strength: EvidenceStrength): ConfidenceLevel {
  const mapping: Record<EvidenceStrength, ConfidenceLevel> = {
    strong: 'high',
    medium: 'medium',
    weak: 'low',
  }
  return mapping[strength] || 'unknown'
}

function buildCommandQueuesData(
  components: SecurityComponent[],
  gaps: GapItem[]
): CommandQueuesData {
  const highConfidenceGaps: QueueCardItem[] = []
  const architecturalRisks: QueueCardItem[] = []
  const blastRadiusWarnings: QueueCardItem[] = []

  // Process components into queue items
  components.forEach((component) => {
    // Skip components with no gaps
    if (component.unusedCount === 0 && !component.hasWildcards && !component.hasAdminAccess && !component.hasInternetExposure) {
      return
    }

    // Build risk flags
    const riskFlags: RiskFlag[] = []
    if (component.hasWildcards) riskFlags.push('wildcard_action')
    if (component.hasAdminAccess) riskFlags.push('admin_policy')
    if (component.hasInternetExposure) riskFlags.push('world_open')
    if (component.highestRiskUnused) {
      riskFlags.push(mapRiskTagToFlag(component.highestRiskUnused))
    }

    // Determine severity
    let severity: Severity = 'low'
    if (component.hasAdminAccess || component.hasWildcards) severity = 'critical'
    else if (component.hasInternetExposure) severity = 'high'
    else if (component.unusedCount > 20) severity = 'high'
    else if (component.unusedCount > 5) severity = 'medium'

    const confidence = mapConfidence(component.confidence)

    const queueItem: QueueCardItem = {
      id: component.id,
      resource_type: component.type,
      resource_name: component.name,
      severity,
      confidence,
      A_authorized_breadth: { value: component.allowedCount, state: 'value' },
      U_observed_usage: {
        value: component.observedCount,
        state: component.confidence === 'weak' ? 'unknown' : 'value',
      },
      G_gap: {
        value: component.unusedCount,
        state: component.confidence === 'weak' ? 'unknown' : 'value',
      },
      risk_flags: riskFlags,
      blast_radius: {
        neighbors: Math.floor(Math.random() * 20) + 1, // TODO: Calculate from actual dependency map
        critical_paths: Math.floor(Math.random() * 5),
        risk: component.hasInternetExposure || component.hasAdminAccess ? 'risky' : 'safe',
      },
      recommended_action: {
        cta: confidence === 'high' || confidence === 'medium' ? 'view_impact_report' : 'enable_telemetry',
        cta_label: confidence === 'high' || confidence === 'medium' ? 'View Impact Report' : 'Enable Telemetry',
        reason: component.unusedCount > 0
          ? `${component.unusedCount} unused ${component.type === 'iam_role' ? 'permissions' : 'rules'} detected`
          : 'Broad permissions detected',
      },
      evidence_window_days: 365,
    }

    // Route to appropriate queue
    if (confidence === 'high' && component.unusedCount > 0) {
      // High confidence gaps - safe to tighten
      highConfidenceGaps.push(queueItem)
    } else if (confidence === 'low' || confidence === 'unknown') {
      // Architectural risks - can't prove usage
      architecturalRisks.push({
        ...queueItem,
        risk_category: component.hasAdminAccess ? 'over_privileged' : component.hasInternetExposure ? 'public_exposure' : 'over_privileged',
        risk_description: confidence === 'unknown'
          ? `No telemetry data available to verify actual usage`
          : `Limited evidence (${confidence} confidence) - cannot fully verify usage`,
        recommended_action: {
          cta: 'enable_telemetry',
          cta_label: 'Enable Telemetry',
          reason: 'Cannot verify usage without additional telemetry',
        },
      })
    } else if (component.hasInternetExposure || component.hasAdminAccess) {
      // Blast radius warnings - high impact potential
      blastRadiusWarnings.push({
        ...queueItem,
        why_now: {
          recent_change: false, // TODO: Detect from CloudTrail
        },
        recommended_action: {
          cta: 'investigate_activity',
          cta_label: 'Investigate Activity',
          reason: 'High blast radius - verify before changes',
        },
      })
    } else if (confidence === 'medium' && component.unusedCount > 0) {
      // Medium confidence goes to high confidence gaps
      highConfidenceGaps.push(queueItem)
    }
  })

  // Sort queues by severity and gap size
  const sortBySeverity = (a: QueueCardItem, b: QueueCardItem) => {
    const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
    const aIdx = severityOrder.indexOf(a.severity)
    const bIdx = severityOrder.indexOf(b.severity)
    if (aIdx !== bIdx) return aIdx - bIdx
    return (b.G_gap.value || 0) - (a.G_gap.value || 0)
  }

  return {
    high_confidence_gaps: highConfidenceGaps.sort(sortBySeverity),
    architectural_risks: architecturalRisks.sort(sortBySeverity),
    blast_radius_warnings: blastRadiusWarnings.sort(sortBySeverity),
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function SecurityPosture({ systemName, onViewOnMap }: SecurityPostureProps) {
  // State
  const [loading, setLoading] = useState(true)
  const [components, setComponents] = useState<SecurityComponent[]>([])
  const [selectedComponent, setSelectedComponent] = useState<SecurityComponent | null>(null)
  const [componentDiff, setComponentDiff] = useState<ComponentDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [allGaps, setAllGaps] = useState<GapItem[]>([])

  // Top bar / PlanePulse state
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('365d')
  const [minConfidence, setMinConfidence] = useState<ConfidenceLevel>('low')
  const [evidenceCoverage, setEvidenceCoverage] = useState<EvidenceCoverage[]>([
    { source: 'CloudTrail', status: 'available' },
    { source: 'FlowLogs', status: 'partial' },
    { source: 'Config', status: 'available' },
    { source: 'IAM', status: 'available' },
  ])

  // List state
  const [listState, setListState] = useState<ComponentListState>({
    groupBy: 'identity',
    sortBy: 'unusedCount',
    sortOrder: 'desc',
  })

  // Derived data for new components
  const windowDays = useMemo(() => {
    const mapping: Record<TimeWindow, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }
    return mapping[timeWindow]
  }, [timeWindow])

  const planePulseData = useMemo(() =>
    buildPlanePulseData(components, evidenceCoverage, windowDays),
    [components, evidenceCoverage, windowDays]
  )

  const commandQueuesData = useMemo(() =>
    buildCommandQueuesData(components, allGaps),
    [components, allGaps]
  )

  // Summary stats
  const summary = useMemo(() => {
    const totalComponents = components.length
    const totalRemovalCandidates = components.reduce((sum, c) => sum + c.unusedCount, 0)
    const highRiskCandidates = components.filter(c =>
      c.hasWildcards || c.hasAdminAccess || c.hasInternetExposure
    ).length

    return { totalComponents, totalRemovalCandidates, highRiskCandidates }
  }, [components])

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    setLoading(true)
    try {
      const allComponents: SecurityComponent[] = []
      const gaps: GapItem[] = []

      // Fetch IAM gaps
      try {
        const iamRes = await fetch(`/api/proxy/iam-analysis/gaps/${systemName}`)
        if (iamRes.ok) {
          const iamData = await iamRes.json()
          const iamGaps = iamData.gaps || []
          iamGaps.forEach((gap: any) => {
            const component = transformIAMGapToComponent(gap)
            allComponents.push(component)

            if (gap.unused_permissions > 0) {
              gaps.push({
                id: `iam-${gap.role_name}`,
                componentId: gap.role_name,
                componentName: gap.role_name,
                componentType: 'iam_role',
                type: 'iam_action',
                identifier: `${gap.unused_permissions} unused permissions`,
                allowedBy: gap.role_name,
                observedCount: 0,
                lastSeen: null,
                riskTags: gap.has_wildcards ? ['wildcard'] : gap.has_admin_access ? ['admin'] : ['write'],
                riskScore: gap.has_wildcards ? 90 : gap.has_admin_access ? 80 : 50,
                recommendation: 'remove',
                confidence: 85,
                reason: `Role has ${gap.unused_permissions} permissions that haven't been used.`,
              })
            }
          })
        }
      } catch (e) {
        console.error('Failed to fetch IAM gaps:', e)
      }

      // Fetch Security Groups
      try {
        const sgListRes = await fetch(`${BACKEND_URL}/api/security-groups/by-system?system_name=${encodeURIComponent(systemName)}`)
        if (sgListRes.ok) {
          const sgListData = await sgListRes.json()
          const sgList = sgListData.security_groups || []

          const sgPromises = sgList.slice(0, 10).map(async (sg: any) => {
            try {
              const res = await fetch(`/api/proxy/security-groups/${sg.id}/gap-analysis?days=365`)
              if (res.ok) return await res.json()
              return { sg_id: sg.id, sg_name: sg.name, rules_analysis: [], eni_count: 0 }
            } catch {
              return { sg_id: sg.id, sg_name: sg.name, rules_analysis: [], eni_count: 0 }
            }
          })

          const sgResults = await Promise.all(sgPromises)
          sgResults.forEach((sg: any) => {
            if (sg?.sg_id) {
              const component = transformSGToComponent(sg)
              allComponents.push(component)

              const unusedPublic = (sg.rules_analysis || []).filter(
                (r: any) => r.source === '0.0.0.0/0' && r.status === 'UNUSED'
              )
              unusedPublic.forEach((r: any) => {
                gaps.push({
                  id: `sg-${sg.sg_id}-${r.port_range}`,
                  componentId: sg.sg_id,
                  componentName: sg.sg_name,
                  componentType: 'security_group',
                  type: 'sg_rule',
                  identifier: `TCP:${r.port_range} from 0.0.0.0/0`,
                  allowedBy: sg.sg_name,
                  observedCount: 0,
                  lastSeen: null,
                  riskTags: ['public'],
                  riskScore: 95,
                  recommendation: 'remove',
                  confidence: sg.eni_count > 0 ? 90 : 40,
                  reason: 'Internet-exposed rule with zero traffic. Immediate removal recommended.',
                  exposure: { cidr: '0.0.0.0/0', ports: r.port_range, protocol: 'TCP' },
                })
              })
            }
          })
        }
      } catch (e) {
        console.error('Failed to fetch SGs:', e)
      }

      setComponents(allComponents)
      setAllGaps(gaps)

      // Update evidence coverage based on actual data
      const hasFlowLogs = allComponents.some(c =>
        c.type === 'security_group' && c.confidence === 'strong'
      )
      setEvidenceCoverage([
        { source: 'CloudTrail', status: 'available' },
        { source: 'FlowLogs', status: hasFlowLogs ? 'available' : 'partial' },
        { source: 'Config', status: 'available' },
        { source: 'IAM', status: 'available' },
      ])
    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
    }
  }, [systemName])

  // Fetch component detail
  const fetchComponentDetail = useCallback(async (component: SecurityComponent) => {
    setDiffLoading(true)
    try {
      if (component.type === 'iam_role' || component.type === 'iam_user') {
        const res = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(component.name)}/gap-analysis`)
        if (res.ok) {
          const data = await res.json()
          setComponentDiff(transformIAMDetailToDiff(data, component.name))
        }
      } else if (component.type === 'security_group') {
        const res = await fetch(`/api/proxy/security-groups/${component.id}/gap-analysis?days=365`)
        if (res.ok) {
          const data = await res.json()
          setComponentDiff(transformSGDetailToDiff(data))
        }
      }
    } catch (e) {
      console.error('Failed to fetch component detail:', e)
      setComponentDiff(null)
    } finally {
      setDiffLoading(false)
    }
  }, [])

  // Handle component selection
  const handleSelectComponent = useCallback((component: SecurityComponent) => {
    setSelectedComponent(component)
    fetchComponentDetail(component)
  }, [fetchComponentDetail])

  // Handle queue card click
  const handleQueueCardClick = useCallback((item: QueueCardItem, queue: QueueType) => {
    const component = components.find(c => c.id === item.id || c.name === item.resource_name)
    if (component) {
      handleSelectComponent(component)
    }
  }, [components, handleSelectComponent])

  // Handle CTA click
  const handleQueueCTAClick = useCallback((item: QueueCardItem, queue: QueueType) => {
    console.log('CTA clicked:', item.recommended_action.cta, 'for', item.resource_name)
    // TODO: Implement CTA actions (view impact report, enable telemetry, etc.)
    const component = components.find(c => c.id === item.id || c.name === item.resource_name)
    if (component) {
      handleSelectComponent(component)
    }
  }, [components, handleSelectComponent])

  // Initial fetch
  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  // Filter components by confidence
  const filteredComponents = useMemo(() => {
    const confidenceOrder: ConfidenceLevel[] = ['unknown', 'low', 'medium', 'high']
    const minIndex = confidenceOrder.indexOf(minConfidence)

    return components.filter(c => {
      const componentConfidence = mapConfidence(c.confidence)
      const componentIndex = confidenceOrder.indexOf(componentConfidence)
      return componentIndex >= minIndex
    })
  }, [components, minConfidence])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="ml-3 text-gray-500">Loading security posture...</span>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Security Posture</h1>
            <p className="text-indigo-200 text-sm">{systemName} - Allowed vs Observed Analysis</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-3xl font-bold">{summary.totalRemovalCandidates}</div>
              <div className="text-indigo-200 text-xs">Removal Candidates</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-red-300">{summary.highRiskCandidates}</div>
              <div className="text-indigo-200 text-xs">High Risk</div>
            </div>
            <button
              onClick={fetchAllData}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-auto">
        {/* Plane Pulse Section */}
        <div className="px-6 py-4 border-b bg-white">
          <PlanePulse
            data={planePulseData}
            timeWindow={timeWindow}
            onTimeWindowChange={setTimeWindow}
            onFixCoverage={() => {
              console.log('Fix coverage clicked')
              // TODO: Navigate to telemetry setup
            }}
          />
        </div>

        {/* Command Queues Section */}
        <div className="px-6 py-4 border-b bg-gray-50">
          <CommandQueues
            data={commandQueuesData}
            minConfidence={minConfidence}
            onMinConfidenceChange={setMinConfidence}
            onCardClick={handleQueueCardClick}
            onCTAClick={handleQueueCTAClick}
          />
        </div>

        {/* Main two-pane layout */}
        <div className="flex min-h-[500px]">
          {/* Left pane - Component list */}
          <div className="w-[480px] flex-shrink-0 bg-white border-r">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-900">Component Heatmap</h3>
              <p className="text-sm text-gray-500">
                {filteredComponents.length} components • Sorted by {listState.sortBy}
              </p>
            </div>
            <ComponentList
              components={filteredComponents}
              selectedId={selectedComponent?.id || null}
              onSelect={handleSelectComponent}
              listState={listState}
              onListStateChange={(updates) => setListState(prev => ({ ...prev, ...updates }))}
            />
          </div>

          {/* Right pane - Component detail */}
          <div className="flex-1 bg-white">
            <ComponentDetail
              diff={componentDiff}
              loading={diffLoading}
              onClose={() => {
                setSelectedComponent(null)
                setComponentDiff(null)
              }}
              onGeneratePolicy={() => {
                console.log('Generate policy for', selectedComponent?.name)
              }}
              onSimulateImpact={() => {
                console.log('Simulate impact for', selectedComponent?.name)
              }}
              onExport={() => {
                console.log('Export for', selectedComponent?.name)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
