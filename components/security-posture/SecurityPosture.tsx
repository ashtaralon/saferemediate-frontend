"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { RefreshCw, Loader2 } from "lucide-react"
import { TopBar } from "./TopBar"
import { ComponentList } from "./ComponentList"
import { ComponentDetail } from "./ComponentDetail"
import { GapQueue } from "./GapQueue"
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
} from "./types"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

// Transform API data to our types
function transformIAMGapToComponent(gap: any): SecurityComponent {
  const allowed = gap.allowed_permissions || 0
  const used = gap.used_permissions || 0
  const unused = gap.unused_permissions || 0

  // Determine highest risk unused
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

  // Check for public exposure
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

export function SecurityPosture({ systemName, onViewOnMap }: SecurityPostureProps) {
  // State
  const [loading, setLoading] = useState(true)
  const [components, setComponents] = useState<SecurityComponent[]>([])
  const [selectedComponent, setSelectedComponent] = useState<SecurityComponent | null>(null)
  const [componentDiff, setComponentDiff] = useState<ComponentDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [allGaps, setAllGaps] = useState<GapItem[]>([])
  const [gapQueueCollapsed, setGapQueueCollapsed] = useState(false)

  // Top bar state
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('365d')
  const [confidenceThreshold, setConfidenceThreshold] = useState(0)
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

            // Create gap items for the queue
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
        // First get SG list
        const sgListRes = await fetch(`${BACKEND_URL}/api/security-groups/by-system?system_name=${encodeURIComponent(systemName)}`)
        if (sgListRes.ok) {
          const sgListData = await sgListRes.json()
          const sgList = sgListData.security_groups || []

          // Fetch details for each SG
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

              // Create gap items for unused public rules
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

      // Update evidence coverage based on what we actually have
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

  // Handle gap click (navigate to component)
  const handleGapClick = useCallback((gap: GapItem) => {
    const component = components.find(c => c.id === gap.componentId || c.name === gap.componentName)
    if (component) {
      handleSelectComponent(component)
    }
  }, [components, handleSelectComponent])

  // Initial fetch
  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  // Filter components by confidence threshold
  const filteredComponents = useMemo(() => {
    if (confidenceThreshold === 0) return components
    const strengthMap: Record<EvidenceStrength, number> = { strong: 80, medium: 50, weak: 0 }
    return components.filter(c => strengthMap[c.confidence] >= confidenceThreshold)
  }, [components, confidenceThreshold])

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
          <div className="flex items-center gap-4">
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

      {/* Top Bar */}
      <TopBar
        timeWindow={timeWindow}
        onTimeWindowChange={setTimeWindow}
        evidenceCoverage={evidenceCoverage}
        confidenceThreshold={confidenceThreshold}
        onConfidenceThresholdChange={setConfidenceThreshold}
      />

      {/* Gap Queue */}
      <div className="px-6 py-4 border-b bg-white">
        <GapQueue
          gaps={allGaps}
          components={components}
          onGapClick={handleGapClick}
          maxItems={5}
          collapsed={gapQueueCollapsed}
          onToggleCollapse={() => setGapQueueCollapsed(!gapQueueCollapsed)}
        />
      </div>

      {/* Main two-pane layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left pane - Component list */}
        <div className="w-[480px] flex-shrink-0">
          <ComponentList
            components={filteredComponents}
            selectedId={selectedComponent?.id || null}
            onSelect={handleSelectComponent}
            listState={listState}
            onListStateChange={(updates) => setListState(prev => ({ ...prev, ...updates }))}
          />
        </div>

        {/* Right pane - Component detail */}
        <div className="flex-1 border-l">
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
  )
}
