"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { RefreshCw, Loader2, Search, X } from "lucide-react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { PlanePulse } from "./PlanePulse"
import { CommandQueues } from "./CommandQueues"
import { ComponentList } from "./ComponentList"
import { ComponentDetail } from "./ComponentDetail"
import { S3BucketDetail, type S3BucketDetailData } from "./S3BucketDetail"
import { LeastPrivilegePolicyModal } from "./LeastPrivilegePolicyModal"
import { SimulationModal } from "./SimulationModal"
import { IAMPermissionAnalysisModal } from "../iam-permission-analysis-modal"
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
  // Handle both old format (permissions_analysis) and new format (unused_actions_list)
  let unusedPerms: string[] = []
  let allowedCount = 0
  let usedCount = 0
  let unusedCount = 0
  let lpScore = 0

  // New backend format
  if (detail.unused_actions_list) {
    unusedPerms = detail.unused_actions_list || []
    allowedCount = detail.allowed_count || detail.allowed_actions || 0
    usedCount = detail.used_count || detail.used_actions || 0
    unusedCount = detail.unused_count || detail.unused_actions || 0
    // Calculate LP score: higher score = better (more used, less unused)
    lpScore = allowedCount > 0 ? Math.round((usedCount / allowedCount) * 100) : 0
  }
  // Old format (permissions_analysis)
  else if (detail.permissions_analysis) {
    const permissions = detail.permissions_analysis || []
    unusedPerms = permissions.filter((p: any) => p.status === 'UNUSED').map((p: any) => p.permission)
    allowedCount = detail.summary?.total_permissions || 0
    usedCount = detail.summary?.used_count || 0
    unusedCount = detail.summary?.unused_count || 0
    lpScore = detail.summary?.lp_score || 0
  }

  const items: GapItem[] = unusedPerms.map((permission: string, idx: number) => {
    const riskTags: RiskTag[] = []
    if (permission?.includes('*')) riskTags.push('wildcard')
    if (permission?.toLowerCase().includes('admin') || permission?.includes(':*')) riskTags.push('admin')
    if (permission?.toLowerCase().includes('delete')) riskTags.push('delete')
    if (permission?.toLowerCase().includes('put') || permission?.toLowerCase().includes('create')) riskTags.push('write')

    return {
      id: `${roleName}-${permission}-${idx}`,
      componentId: roleName,
      componentName: roleName,
      componentType: 'iam_role' as ComponentType,
      type: 'iam_action' as const,
      identifier: permission,
      allowedBy: detail.policies?.inline?.[0]?.policy_name || detail.policies?.managed?.[0]?.policy_name || 'Attached Policy',
      observedCount: 0,
      lastSeen: null,
      riskTags,
      riskScore: riskTags.includes('admin') || riskTags.includes('wildcard') ? 80 : 40,
      recommendation: 'remove' as RecommendationAction,
      confidence: 85,
      reason: `Permission "${permission}" has not been used in the observation period. Consider removing to reduce attack surface.`,
    }
  })

  const confidenceLevel = lpScore >= 80 ? 'strong' : lpScore >= 50 ? 'medium' : 'weak'

  return {
    componentId: roleName,
    componentName: roleName,
    componentType: 'iam_role',
    allowed: allowedCount,
    observedUsed: usedCount,
    unusedCandidates: unusedCount,
    confidence: confidenceLevel,
    confidencePercent: lpScore,
    observationWindow: `${detail.observation_days || 365} days`,
    iamActions: {
      allowed: allowedCount,
      used: usedCount,
      unused: unusedCount,
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

  // State for API response data
  const [apiPlanePulse, setApiPlanePulse] = useState<PlanePulseData | null>(null)
  const [apiQueues, setApiQueues] = useState<CommandQueuesData | null>(null)
  const [apiSummary, setApiSummary] = useState<{ total_components: number; total_removal_candidates: number; high_risk_count: number } | null>(null)

  // S3-specific detail state
  const [s3BucketDetail, setS3BucketDetail] = useState<S3BucketDetailData | null>(null)

  // Modal state for LP Policy and Simulation
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [showSimulationModal, setShowSimulationModal] = useState(false)
  const [selectedUnusedPermissions, setSelectedUnusedPermissions] = useState<string[]>([])
  // State for IAM Remediation modal (reusing existing LP tab modal)
  const [showRemediationModal, setShowRemediationModal] = useState(false)
  const [selectedRoleName, setSelectedRoleName] = useState<string>("")

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearchInput, setShowSearchInput] = useState(false)

  // Derived data for new components - use API data when available, fallback to computed
  const windowDays = useMemo(() => {
    const mapping: Record<TimeWindow, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }
    return mapping[timeWindow]
  }, [timeWindow])

  const planePulseData = useMemo(() => {
    if (apiPlanePulse) return apiPlanePulse
    return buildPlanePulseData(components, evidenceCoverage, windowDays)
  }, [apiPlanePulse, components, evidenceCoverage, windowDays])

  const commandQueuesData = useMemo(() => {
    if (apiQueues) return apiQueues
    return buildCommandQueuesData(components, allGaps)
  }, [apiQueues, components, allGaps])

  // Summary stats - use API data when available
  const summary = useMemo(() => {
    if (apiSummary) {
      return {
        totalComponents: apiSummary.total_components,
        totalRemovalCandidates: apiSummary.total_removal_candidates,
        highRiskCandidates: apiSummary.high_risk_count,
      }
    }
    const totalComponents = components.length
    const totalRemovalCandidates = components.reduce((sum, c) => sum + c.unusedCount, 0)
    const highRiskCandidates = components.filter(c =>
      c.hasWildcards || c.hasAdminAccess || c.hasInternetExposure
    ).length

    return { totalComponents, totalRemovalCandidates, highRiskCandidates }
  }, [apiSummary, components])

  // Fetch all data from unified API
  const fetchAllData = useCallback(async () => {
    setLoading(true)
    try {
      // Use the new unified security-posture API endpoint
      const res = await fetch(`/api/proxy/security-posture/${systemName}?window=${timeWindow}&min_conf=${minConfidence}`)

      if (res.ok) {
        const data = await res.json()

        // Set API response data directly
        if (data.plane_pulse) {
          setApiPlanePulse(data.plane_pulse)
        }

        if (data.queues) {
          setApiQueues(data.queues)
        }

        if (data.summary) {
          setApiSummary(data.summary)
        }

        // Transform components for the list view, deduplicating by id
        const seenIds = new Set<string>()
        const transformedComponents: SecurityComponent[] = (data.components || [])
          .filter((c: any) => {
            if (!c.id || seenIds.has(c.id)) return false
            seenIds.add(c.id)
            return true
          })
          .map((c: any) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            lpScore: c.A_authorized_breadth?.value > 0
              ? Math.round(((c.A_authorized_breadth.value - (c.G_gap?.value || 0)) / c.A_authorized_breadth.value) * 100)
              : 100,
            allowedCount: c.A_authorized_breadth?.value || 0,
            observedCount: c.U_observed_usage?.value || 0,
            unusedCount: c.G_gap?.value || 0,
            highestRiskUnused: c.risk_flags?.[0] ? mapFlagToRiskTag(c.risk_flags[0]) : null,
            hasWildcards: c.risk_flags?.includes('wildcard_action'),
            hasAdminAccess: c.risk_flags?.includes('admin_policy'),
            hasInternetExposure: c.risk_flags?.includes('world_open'),
            confidence: c.confidence === 'high' ? 'strong' : c.confidence === 'medium' ? 'medium' : 'weak',
            evidenceSources: [
              { source: 'CloudTrail' as const, status: 'available' as const },
              { source: 'Config' as const, status: 'available' as const },
            ],
          }))

        setComponents(transformedComponents)

        // Update evidence coverage based on API response
        if (data.plane_pulse?.planes?.observed) {
          const observed = data.plane_pulse.planes.observed
          setEvidenceCoverage([
            { source: 'CloudTrail', status: observed.breakdown?.cloudtrail_usage > 50 ? 'available' : 'partial' },
            { source: 'FlowLogs', status: observed.breakdown?.flow_logs > 50 ? 'available' : observed.breakdown?.flow_logs > 0 ? 'partial' : 'unavailable' },
            { source: 'Config', status: 'available' },
            { source: 'IAM', status: 'available' },
          ])
        }
      } else {
        console.error('Failed to fetch security posture:', res.status)
        // Fallback to empty state
        setComponents([])
        setApiPlanePulse(null)
        setApiQueues(null)
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setComponents([])
    } finally {
      setLoading(false)
    }
  }, [systemName, timeWindow, minConfidence])

  // Helper to map API risk flags back to RiskTag
  function mapFlagToRiskTag(flag: string): RiskTag | null {
    const mapping: Record<string, RiskTag> = {
      admin_policy: 'admin',
      wildcard_action: 'wildcard',
      world_open: 'public',
      sensitive_ports: 'broad_ports',
      overly_permissive: 'write',
    }
    return mapping[flag] || null
  }

  // Fetch component detail
  const fetchComponentDetail = useCallback(async (component: SecurityComponent) => {
    setDiffLoading(true)
    // Clear both detail states when switching
    setComponentDiff(null)
    setS3BucketDetail(null)

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
      } else if (component.type === 's3_bucket') {
        // Use S3-specific endpoint
        const res = await fetch(`/api/proxy/s3-buckets/${encodeURIComponent(component.name)}/analysis?window=${timeWindow}`)
        if (res.ok) {
          const data = await res.json()
          setS3BucketDetail(data)
        } else {
          // Fallback to mock data structure when API not available
          setS3BucketDetail({
            bucketName: component.name,
            bucketArn: component.id,
            region: 'unknown',
            system: systemName,
            planes: {
              configured: { available: true, lastUpdated: new Date().toISOString() },
              observed: { available: false, confidence: 'unknown', lastUpdated: new Date().toISOString() },
              authorized: { available: true, lastUpdated: new Date().toISOString() },
              changed: { available: true, lastUpdated: new Date().toISOString() },
            },
            blockPublicAccess: {
              blockPublicAcls: true,
              ignorePublicAcls: true,
              blockPublicPolicy: true,
              restrictPublicBuckets: true,
              allEnabled: true,
            },
            bucketPolicy: {
              hasBucketPolicy: false,
              statementCount: 0,
              statements: [],
              publicStatements: [],
              crossAccountStatements: [],
            },
            aclGrants: [],
            observedUsage: {
              dataEventsStatus: 'unknown',
              dataEventsReason: 'S3 data events status could not be determined. Enable CloudTrail S3 data events to observe bucket access patterns.',
            },
            changeHistory: [],
            insights: [
              {
                type: 'warning',
                title: 'Observed Usage Unknown',
                description: 'S3 data events are not enabled or status could not be determined.',
                recommendation: 'Enable CloudTrail S3 data events to identify actual access patterns.',
              },
            ],
          })
        }
      }
    } catch (e) {
      console.error('Failed to fetch component detail:', e)
      setComponentDiff(null)
      setS3BucketDetail(null)
    } finally {
      setDiffLoading(false)
    }
  }, [timeWindow, systemName])

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

  // Filter components by confidence and search query
  const filteredComponents = useMemo(() => {
    const confidenceOrder: ConfidenceLevel[] = ['unknown', 'low', 'medium', 'high']
    const minIndex = confidenceOrder.indexOf(minConfidence)
    const searchLower = searchQuery.toLowerCase().trim()

    return components.filter(c => {
      const componentConfidence = mapConfidence(c.confidence)
      const componentIndex = confidenceOrder.indexOf(componentConfidence)
      const matchesConfidence = componentIndex >= minIndex
      const matchesSearch = !searchLower ||
        c.name.toLowerCase().includes(searchLower) ||
        c.type.toLowerCase().includes(searchLower) ||
        c.id.toLowerCase().includes(searchLower)
      return matchesConfidence && matchesSearch
    })
  }, [components, minConfidence, searchQuery])

  // Filter command queues by search query
  const filteredCommandQueuesData = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim()
    if (!searchLower) return commandQueuesData

    const filterItems = (items: QueueCardItem[]) => items.filter(item =>
      item.resource_name.toLowerCase().includes(searchLower) ||
      item.resource_type.toLowerCase().includes(searchLower) ||
      item.resource_arn?.toLowerCase().includes(searchLower)
    )

    return {
      high_confidence_gaps: filterItems(commandQueuesData.high_confidence_gaps),
      architectural_risks: filterItems(commandQueuesData.architectural_risks),
      blast_radius_warnings: filterItems(commandQueuesData.blast_radius_warnings),
    }
  }, [commandQueuesData, searchQuery])

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
            {/* Search input */}
            <div className="flex items-center gap-2">
              {showSearchInput ? (
                <div className="flex items-center bg-white/10 rounded-lg px-3 py-1.5">
                  <Search className="w-4 h-4 text-indigo-200" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name..."
                    className="bg-transparent border-none outline-none text-white placeholder-indigo-200 ml-2 w-48 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setSearchQuery("")
                      setShowSearchInput(false)
                    }}
                    className="ml-2 hover:bg-white/10 p-1 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSearchInput(true)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Search"
                >
                  <Search className="w-5 h-5" />
                </button>
              )}
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
          <ErrorBoundary componentName="Telemetry Coverage">
            <PlanePulse
              data={planePulseData}
              timeWindow={timeWindow}
              onTimeWindowChange={setTimeWindow}
              onFixCoverage={() => {
                console.log('Fix coverage clicked')
                // TODO: Navigate to telemetry setup
              }}
            />
          </ErrorBoundary>
        </div>

        {/* Command Queues Section */}
        <div className="px-6 py-4 border-b bg-gray-50">
          <ErrorBoundary componentName="Command Queues">
            <CommandQueues
              data={filteredCommandQueuesData}
              minConfidence={minConfidence}
              onMinConfidenceChange={setMinConfidence}
              onCardClick={handleQueueCardClick}
              onCTAClick={handleQueueCTAClick}
              onGeneratePolicy={(item, queue) => {
                // Find the component and open the LP Policy modal
                const component = components.find(c => c.id === item.id || c.name === item.resource_name)
                if (component) {
                  setSelectedComponent(component)
                  setShowPolicyModal(true)
                }
              }}
              onSimulate={(item, queue) => {
                // Find the component and open the Simulation modal
                const component = components.find(c => c.id === item.id || c.name === item.resource_name)
                if (component) {
                  setSelectedComponent(component)
                  // Extract gap actions for simulation
                  const gapValue = item.G_gap?.value || 0
                  // For now, we'll let the modal fetch unused permissions
                  setSelectedUnusedPermissions([])
                  setShowSimulationModal(true)
                }
              }}
              onRemediate={(item, queue) => {
                // Open the IAM Permission Analysis Modal (same as Least Privilege tab)
                if (item.resource_type === 'iam_role' || item.resource_type === 'iam_user') {
                  setSelectedRoleName(item.resource_name)
                  setShowRemediationModal(true)
                }
              }}
            />
          </ErrorBoundary>
        </div>

        {/* Main two-pane layout */}
        <div className="flex min-h-[500px]">
          {/* Left pane - Component list */}
          <div className="w-[480px] flex-shrink-0 bg-white border-r">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-900">Component Heatmap</h3>
              <p className="text-sm text-gray-500">
                {filteredComponents.length} components • Sorted by {listState.sortBy}
                {searchQuery && (
                  <span className="ml-2 text-indigo-600">
                    • Filtered by "{searchQuery}"
                  </span>
                )}
              </p>
            </div>
            <ErrorBoundary componentName="Component List">
              <ComponentList
                components={filteredComponents}
                selectedId={selectedComponent?.id || null}
                onSelect={handleSelectComponent}
                listState={listState}
                onListStateChange={(updates) => setListState(prev => ({ ...prev, ...updates }))}
              />
            </ErrorBoundary>
          </div>

          {/* Right pane - Component detail (resource-type specific) */}
          <div className="flex-1 bg-white">
            <ErrorBoundary componentName="Component Detail">
              {selectedComponent?.type === 's3_bucket' ? (
                <S3BucketDetail
                  data={s3BucketDetail}
                  loading={diffLoading}
                  onClose={() => {
                    setSelectedComponent(null)
                    setS3BucketDetail(null)
                  }}
                  onExport={() => {
                    console.log('Export S3 bucket report for', selectedComponent?.name)
                  }}
                  onCreateTicket={() => {
                    console.log('Create ticket for S3 bucket', selectedComponent?.name)
                  }}
                />
              ) : (
                <ComponentDetail
                  diff={componentDiff}
                  loading={diffLoading}
                  onClose={() => {
                    setSelectedComponent(null)
                    setComponentDiff(null)
                }}
                onGeneratePolicy={() => {
                  // Open LP Policy Modal
                  if (selectedComponent) {
                    setShowPolicyModal(true)
                  }
                }}
                onSimulateImpact={() => {
                  // Open Simulation Modal with unused permissions
                  if (selectedComponent && componentDiff) {
                    // Extract unused permission actions from the diff
                    const unusedActions = componentDiff.iamActions?.items
                      ?.filter(item => item.recommendation === 'remove' || item.observedCount === 0)
                      ?.map(item => item.identifier) || []
                    setSelectedUnusedPermissions(unusedActions)
                    setShowSimulationModal(true)
                  }
                }}
                onExport={() => {
                  console.log('Export for', selectedComponent?.name)
                }}
              />
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Least Privilege Policy Modal */}
      <LeastPrivilegePolicyModal
        isOpen={showPolicyModal}
        onClose={() => setShowPolicyModal(false)}
        roleArn={selectedComponent?.id || null}
        roleName={selectedComponent?.name || ''}
      />

      {/* Simulation Modal */}
      <SimulationModal
        isOpen={showSimulationModal}
        onClose={() => setShowSimulationModal(false)}
        roleArn={selectedComponent?.id || null}
        roleName={selectedComponent?.name || ''}
        unusedPermissions={selectedUnusedPermissions}
      />

      {/* IAM Remediation Modal - Same as Least Privilege tab */}
      <IAMPermissionAnalysisModal
        isOpen={showRemediationModal}
        onClose={() => {
          setShowRemediationModal(false)
          setSelectedRoleName("")
        }}
        roleName={selectedRoleName}
        systemName={systemName}
        onApplyFix={(data) => {
          console.log('[SecurityPosture] Apply fix requested:', data)
        }}
        onRemediationSuccess={(roleName) => {
          console.log('[SecurityPosture] Remediation successful for:', roleName)
          setShowRemediationModal(false)
          setSelectedRoleName("")
          // Refresh data to remove remediated resource from list
          fetchAllData()
        }}
      />
    </div>
  )
}
