"use client"

import { useState, useEffect, useMemo } from 'react'
import { 
  Shield, AlertTriangle, CheckCircle2, TrendingDown, Clock, 
  FileDown, Zap, ChevronRight, Loader2, RefreshCw, Search,
  Globe, Network, Database, Server, Filter, SlidersHorizontal,
  Eye, EyeOff, Download, Code, Play, X, Info
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ============================================================================
// TYPES
// ============================================================================

interface EvidenceCoverage {
  cloudtrail: boolean
  flowLogs: boolean
  config: boolean
  iam: boolean
}

interface GapItem {
  id: string
  componentId: string
  componentName: string
  componentType: 'IAMRole' | 'SecurityGroup' | 'S3Bucket' | 'NetworkACL' | 'EC2' | 'Lambda' | 'RDS'
  componentArn: string
  
  // Metrics
  lpScore: number | null
  allowedCount: number
  observedCount: number
  unusedCount: number
  gapPercent: number
  
  // Risk
  highestRiskUnused: string[]
  riskTags: Array<'Wildcard' | 'Admin' | 'Write' | 'Delete' | 'InternetExposed' | 'BroadPort'>
  
  // Evidence
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  observationDays: number
  evidenceCoverage: EvidenceCoverage
  lastSeen?: string
  
  // Grouping
  identity?: string  // For "By Identity" grouping
  workload?: string  // For "By Workload" grouping
  service?: string   // For "By Service" grouping
  
  // Detail data (loaded on demand)
  detailData?: {
    allowedItems: Array<{
      item: string
      allowedBy: string
      statementId?: string
      riskTag?: string
    }>
    observedItems: Array<{
      item: string
      observedCount: number
      lastSeen: string
    }>
    unusedItems: Array<{
      item: string
      allowedBy: string
      statementId?: string
      riskTag: string
      recommendation: 'Remove' | 'Scope' | 'Keep'
      why: string
      dependencies?: string[]
    }>
  }
}

interface TopRemoval {
  id: string
  componentId: string
  componentName: string
  componentType: string
  item: string
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM'
  reason: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  blastRadius: number
  score: number  // Ranking score
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LeastPrivilegeTabEnterprise({ 
  systemName = 'alon-prod' 
}: { 
  systemName?: string 
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  
  // Top bar controls
  const [timeWindow, setTimeWindow] = useState<7 | 30 | 90 | 365>(365)
  const [confidenceThreshold, setConfidenceThreshold] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM')
  const [evidenceCoverage, setEvidenceCoverage] = useState<EvidenceCoverage>({
    cloudtrail: true,
    flowLogs: false,
    config: false,
    iam: true
  })
  
  // Data
  const [gapItems, setGapItems] = useState<GapItem[]>([])
  const [topRemovals, setTopRemovals] = useState<TopRemoval[]>([])
  
  // UI state
  const [selectedComponent, setSelectedComponent] = useState<GapItem | null>(null)
  const [grouping, setGrouping] = useState<'identity' | 'workload' | 'service'>('identity')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'unusedCount' | 'lpScore' | 'risk'>('unusedCount')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  
  const { toast } = useToast()

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(
        `/api/proxy/least-privilege/issues?systemName=${systemName}&observationDays=${timeWindow}`
      )
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      // Transform API response to GapItem format
      const items: GapItem[] = (data.resources || []).map((r: any) => ({
        id: r.id || r.resourceArn,
        componentId: r.id || r.resourceArn,
        componentName: r.resourceName || r.name,
        // FIXED: Properly detect Network ACLs from resource ID
        componentType: (() => {
          const resourceId = r.id || r.resourceArn || ''
          if (resourceId.startsWith('acl-')) return 'NetworkACL'
          return r.resourceType || 'IAMRole'
        })(),
        componentArn: r.resourceArn,
        lpScore: r.lpScore,
        allowedCount: r.allowedCount || 0,
        observedCount: r.usedCount || 0,
        unusedCount: r.gapCount || 0,
        gapPercent: r.gapPercent || 0,
        highestRiskUnused: (r.highRiskUnused || []).map((h: any) => h.permission || h.item),
        riskTags: extractRiskTags(r),
        confidence: r.evidence?.confidence || r.confidence || 'LOW',
        observationDays: r.evidence?.observationDays || r.observationDays || timeWindow,
        evidenceCoverage: {
          cloudtrail: r.evidence?.dataSources?.includes('CloudTrail') || false,
          flowLogs: r.evidence?.dataSources?.includes('FlowLogs') || false,
          config: r.evidence?.dataSources?.includes('Config') || false,
          iam: true
        },
        lastSeen: r.evidence?.lastUsed,
        identity: r.resourceName,
        workload: r.systemName || systemName,
        service: r.resourceType
      }))
      
      setGapItems(items)
      
      // Calculate top removals
      const removals = calculateTopRemovals(items)
      setTopRemovals(removals)
      
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
      toast({
        title: "Error",
        description: err.message || 'Failed to load least privilege data',
        variant: "destructive"
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [systemName, timeWindow])

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const extractRiskTags = (resource: any): GapItem['riskTags'] => {
    const tags: GapItem['riskTags'] = []
    const unused = resource.unusedList || resource.highRiskUnused || []
    
    for (const item of unused) {
      const perm = item.permission || item.item || item
      if (perm.includes('*') || perm.endsWith(':*')) tags.push('Wildcard')
      if (perm.includes('admin') || perm.includes('Admin')) tags.push('Admin')
      if (perm.includes('write') || perm.includes('Write') || perm.includes('Put')) tags.push('Write')
      if (perm.includes('delete') || perm.includes('Delete') || perm.includes('Remove')) tags.push('Delete')
    }
    
    if (resource.networkExposure?.internetExposedRules > 0) tags.push('InternetExposed')
    if (resource.networkExposure?.highRiskPorts?.length > 0) tags.push('BroadPort')
    
    return Array.from(new Set(tags))
  }

  const calculateTopRemovals = (items: GapItem[]): TopRemoval[] => {
    const removals: TopRemoval[] = []
    
    for (const item of items) {
      for (const unused of item.highestRiskUnused) {
        let riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' = 'MEDIUM'
        let reason = 'Unused permission'
        let score = item.unusedCount
        
        // Risk scoring
        if (unused.includes('*') || unused.includes('PassRole')) {
          riskLevel = 'CRITICAL'
          reason = 'Wildcard or privilege escalation'
          score *= 10
        } else if (unused.includes('Delete') || unused.includes('Remove')) {
          riskLevel = 'HIGH'
          reason = 'Destructive action'
          score *= 5
        } else if (unused.includes('Admin') || unused.includes('Write')) {
          riskLevel = 'HIGH'
          reason = 'Administrative privilege'
          score *= 3
        }
        
        // Confidence multiplier
        if (item.confidence === 'HIGH') score *= 2
        else if (item.confidence === 'MEDIUM') score *= 1.5
        
        // Blast radius (how many resources use this)
        const blastRadius = 1 // TODO: Calculate from dependency graph
        
        removals.push({
          id: `${item.id}-${unused}`,
          componentId: item.componentId,
          componentName: item.componentName,
          componentType: item.componentType,
          item: unused,
          riskLevel,
          reason,
          confidence: item.confidence,
          blastRadius,
          score
        })
      }
    }
    
    return removals.sort((a, b) => b.score - a.score).slice(0, 20)
  }

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'HIGH': return 'bg-green-100 text-green-700 border-green-300'
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-700 border-yellow-300'
      case 'LOW': return 'bg-red-100 text-red-700 border-red-300'
      default: return 'bg-gray-100 text-gray-700 border-gray-300'
    }
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'CRITICAL': return 'bg-red-600 text-white'
      case 'HIGH': return 'bg-orange-500 text-white'
      case 'MEDIUM': return 'bg-yellow-500 text-white'
      default: return 'bg-gray-500 text-white'
    }
  }

  // ============================================================================
  // FILTERED & SORTED DATA
  // ============================================================================

  const filteredAndSortedItems = useMemo(() => {
    let filtered = gapItems.filter(item => {
      // Confidence threshold
      const confidenceOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 }
      if (confidenceOrder[item.confidence] < confidenceOrder[confidenceThreshold]) {
        return false
      }
      
      // Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!item.componentName.toLowerCase().includes(query) &&
            !item.componentType.toLowerCase().includes(query)) {
          return false
        }
      }
      
      return true
    })
    
    // Sort
    filtered.sort((a, b) => {
      let aVal: number, bVal: number
      
      switch (sortBy) {
        case 'unusedCount':
          aVal = a.unusedCount
          bVal = b.unusedCount
          break
        case 'lpScore':
          aVal = a.lpScore || 0
          bVal = b.lpScore || 0
          break
        case 'risk':
          aVal = a.highestRiskUnused.length
          bVal = b.highestRiskUnused.length
          break
        default:
          return 0
      }
      
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal
    })
    
    return filtered
  }, [gapItems, confidenceThreshold, searchQuery, sortBy, sortOrder])

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading && !gapItems.length) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-600">Loading least privilege data...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Error Loading Data</h3>
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top Bar */}
      <TopBar
        timeWindow={timeWindow}
        setTimeWindow={setTimeWindow}
        evidenceCoverage={evidenceCoverage}
        setEvidenceCoverage={setEvidenceCoverage}
        confidenceThreshold={confidenceThreshold}
        setConfidenceThreshold={setConfidenceThreshold}
        onRefresh={() => {
          setRefreshing(true)
          fetchData()
        }}
        refreshing={refreshing}
      />

      {/* Top Removals Queue */}
      {topRemovals.length > 0 && (
        <TopRemovalsQueue
          removals={topRemovals}
          onSelect={(removal) => {
            const item = gapItems.find(i => i.componentId === removal.componentId)
            if (item) setSelectedComponent(item)
          }}
        />
      )}

      {/* Main Content: Two Panes */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Component List */}
        <ComponentList
          items={filteredAndSortedItems}
          selectedComponent={selectedComponent}
          onSelect={setSelectedComponent}
          grouping={grouping}
          setGrouping={setGrouping}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
        />

        {/* Right Pane: Detail View */}
        <ComponentDetail
          component={selectedComponent}
          timeWindow={timeWindow}
          onClose={() => setSelectedComponent(null)}
        />
      </div>
    </div>
  )
}

// ============================================================================
// TOP BAR COMPONENT
// ============================================================================

function TopBar({
  timeWindow,
  setTimeWindow,
  evidenceCoverage,
  setEvidenceCoverage,
  confidenceThreshold,
  setConfidenceThreshold,
  onRefresh,
  refreshing
}: {
  timeWindow: 7 | 30 | 90 | 365
  setTimeWindow: (w: 7 | 30 | 90 | 365) => void
  evidenceCoverage: EvidenceCoverage
  setEvidenceCoverage: (e: EvidenceCoverage) => void
  confidenceThreshold: 'HIGH' | 'MEDIUM' | 'LOW'
  setConfidenceThreshold: (c: 'HIGH' | 'MEDIUM' | 'LOW') => void
  onRefresh: () => void
  refreshing: boolean
}) {
  const evidenceCount = Object.values(evidenceCoverage).filter(Boolean).length
  const evidenceStrength = evidenceCount >= 3 ? 'Strong' : evidenceCount >= 2 ? 'Medium' : 'Weak'
  const evidenceColor = evidenceCount >= 3 ? 'bg-green-100 text-green-700' : 
                       evidenceCount >= 2 ? 'bg-yellow-100 text-yellow-700' : 
                       'bg-red-100 text-red-700'

  return (
    <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-6">
        {/* Time Window */}
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600">Time Window:</span>
          <select
            value={timeWindow}
            onChange={(e) => setTimeWindow(Number(e.target.value) as 7 | 30 | 90 | 365)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value={7}>Last 7d</option>
            <option value={30}>Last 30d</option>
            <option value={90}>Last 90d</option>
            <option value={365}>Last 365d</option>
          </select>
        </div>

        {/* Evidence Coverage */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Evidence:</span>
          <div className={`px-2 py-1 rounded text-xs font-medium border ${evidenceColor}`}>
            {evidenceStrength}
          </div>
          <button
            className="text-xs text-blue-600 hover:underline"
            onClick={() => {
              // Toggle evidence details (expandable)
            }}
          >
            {evidenceCount}/4 sources
          </button>
        </div>

        {/* Confidence Threshold */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600">Confidence:</span>
          <select
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(e.target.value as 'HIGH' | 'MEDIUM' | 'LOW')}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="HIGH">High only</option>
            <option value="MEDIUM">Medium+</option>
            <option value="LOW">All</option>
          </select>
        </div>
      </div>

      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </div>
  )
}

// ============================================================================
// TOP REMOVALS QUEUE
// ============================================================================

function TopRemovalsQueue({
  removals,
  onSelect
}: {
  removals: TopRemoval[]
  onSelect: (removal: TopRemoval) => void
}) {
  return (
    <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-yellow-900 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Top Removals to Do Now
        </h3>
        <span className="text-xs text-yellow-700">{removals.length} high-value fixes</span>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {removals.slice(0, 10).map((removal) => (
          <button
            key={removal.id}
            onClick={() => onSelect(removal)}
            className="flex-shrink-0 px-3 py-1.5 bg-white border border-yellow-300 rounded text-xs hover:bg-yellow-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${getRiskColor(removal.riskLevel)}`}>
                {removal.riskLevel}
              </span>
              <span className="font-medium">{removal.componentName}</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-600 font-mono text-xs">{removal.item}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENT LIST (LEFT PANE)
// ============================================================================

function ComponentList({
  items,
  selectedComponent,
  onSelect,
  grouping,
  setGrouping,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder
}: {
  items: GapItem[]
  selectedComponent: GapItem | null
  onSelect: (item: GapItem) => void
  grouping: 'identity' | 'workload' | 'service'
  setGrouping: (g: 'identity' | 'workload' | 'service') => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  sortBy: 'unusedCount' | 'lpScore' | 'risk'
  setSortBy: (s: 'unusedCount' | 'lpScore' | 'risk') => void
  sortOrder: 'asc' | 'desc'
  setSortOrder: (o: 'asc' | 'desc') => void
}) {
  return (
    <div className="w-1/2 border-r bg-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        {/* Grouping Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Group by:</span>
          <div className="flex bg-gray-100 rounded p-1">
            <button
              onClick={() => setGrouping('identity')}
              className={`px-3 py-1 text-xs rounded ${grouping === 'identity' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            >
              Identity
            </button>
            <button
              onClick={() => setGrouping('workload')}
              className={`px-3 py-1 text-xs rounded ${grouping === 'workload' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            >
              Workload
            </button>
            <button
              onClick={() => setGrouping('service')}
              className={`px-3 py-1 text-xs rounded ${grouping === 'service' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            >
              Service
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Component</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">
                <button
                  onClick={() => {
                    if (sortBy === 'lpScore') {
                      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
                    } else {
                      setSortBy('lpScore')
                      setSortOrder('desc')
                    }
                  }}
                  className="hover:text-blue-600"
                >
                  LP Score {sortBy === 'lpScore' && (sortOrder === 'desc' ? '↓' : '↑')}
                </button>
              </th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Allowed</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Observed</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">
                <button
                  onClick={() => {
                    if (sortBy === 'unusedCount') {
                      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
                    } else {
                      setSortBy('unusedCount')
                      setSortOrder('desc')
                    }
                  }}
                  className="hover:text-blue-600 font-bold"
                >
                  Unused {sortBy === 'unusedCount' && (sortOrder === 'desc' ? '↓' : '↑')}
                </button>
              </th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Risk</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                onClick={() => onSelect(item)}
                className={`border-b hover:bg-blue-50 cursor-pointer ${
                  selectedComponent?.id === item.id ? 'bg-blue-100' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{item.componentName}</div>
                  <div className="text-xs text-gray-500">{item.componentType}</div>
                </td>
                <td className="px-4 py-3">
                  {item.lpScore !== null ? (
                    <span className={`font-bold ${
                      item.lpScore >= 80 ? 'text-green-600' :
                      item.lpScore >= 50 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {item.lpScore.toFixed(0)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">{item.allowedCount}</td>
                <td className="px-4 py-3 text-green-600">{item.observedCount}</td>
                <td className="px-4 py-3">
                  <span className="font-bold text-red-600">{item.unusedCount}</span>
                </td>
                <td className="px-4 py-3">
                  {item.riskTags.length > 0 ? (
                    <div className="flex gap-1 flex-wrap">
                      {item.riskTags.slice(0, 2).map((tag, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs border ${getConfidenceColor(item.confidence)}`}>
                    {item.confidence}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-600">
        {items.length} components • {items.reduce((sum, i) => sum + i.unusedCount, 0)} total unused permissions
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENT DETAIL (RIGHT PANE)
// ============================================================================

function ComponentDetail({
  component,
  timeWindow,
  onClose
}: {
  component: GapItem | null
  timeWindow: number
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'iam' | 'network' | 'resource'>('iam')
  const [detailData, setDetailData] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [policyPreview, setPolicyPreview] = useState<any>(null)
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [showSimulationModal, setShowSimulationModal] = useState(false)

  // Fetch detail data when component changes
  useEffect(() => {
    if (!component) return

    const fetchDetailData = async () => {
      setLoadingDetail(true)
      try {
        if (component.componentType === 'IAMRole') {
          const roleName = component.componentName
          const response = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=${timeWindow}`)
          if (response.ok) {
            const data = await response.json()
            setDetailData({
              allowedItems: (data.allowed_actions_list || []).map((action: string) => ({
                item: action,
                allowedBy: 'IAM Policy',
                statementId: 'Statement-1',
                riskTag: getRiskTagForAction(action)
              })),
              observedItems: (data.used_actions_list || []).map((action: string) => ({
                item: action,
                observedCount: 1,
                lastSeen: new Date().toISOString()
              })),
              unusedItems: (data.unused_actions_list || []).map((action: string) => ({
                item: action,
                allowedBy: 'IAM Policy',
                statementId: 'Statement-1',
                riskTag: getRiskTagForAction(action),
                recommendation: getRecommendationForAction(action),
                why: `Not observed in ${timeWindow} days of CloudTrail logs`,
                dependencies: []
              }))
            })
          }
        } else if (component.componentType === 'SecurityGroup') {
          const sgId = component.componentId.startsWith('sg-') ? component.componentId : 
                      component.componentId.match(/sg-[a-z0-9]+/)?.[0] || component.componentId
          const response = await fetch(`/api/proxy/security-groups/${sgId}/gap-analysis?days=${timeWindow}`)
          if (response.ok) {
            const data = await response.json()
            setDetailData({
              networkRules: (data.rules_analysis || []).map((rule: any) => ({
                ruleId: rule.rule_id,
                direction: rule.direction,
                protocol: rule.protocol,
                portRange: rule.port_range,
                source: rule.source,
                destination: rule.destination,
                isPublic: rule.is_public,
                observedHits: rule.traffic?.connection_count || 0,
                unused: rule.traffic?.connection_count === 0,
                exposureTag: rule.is_public ? '0.0.0.0/0' : null,
                recommendation: rule.recommendation?.action === 'remove' ? 'Remove' :
                               rule.recommendation?.action === 'tighten' ? 'Restrict' : 'Keep',
                impactEstimate: rule.traffic?.unique_sources?.length || 0,
                lastSeen: rule.traffic?.last_seen,
                confidence: rule.recommendation?.confidence || 0
              }))
            })
          }
        } else if (component.componentType === 'S3Bucket') {
          const bucketName = component.componentName
          const response = await fetch(`/api/proxy/s3-buckets/${bucketName}/gap-analysis?days=${timeWindow}`)
          if (response.ok) {
            const data = await response.json()
            setDetailData({
              resourcePolicies: (data.unused_actions_list || []).map((action: string) => ({
                action,
                allowedBy: 'Bucket Policy',
                observedCount: 0,
                lastSeen: null,
                riskTag: getRiskTagForAction(action),
                recommendation: 'Remove',
                why: `Not observed in ${timeWindow} days`
              }))
            })
          }
        } else if (component.componentType === 'NetworkACL') {
          // FIXED: Network ACLs use AWS Config/EC2 API, not gap-analysis endpoint
          const naclId = component.componentId.startsWith('acl-') ? component.componentId : 
                        component.componentId.match(/acl-[a-z0-9]+/)?.[0] || component.componentId
          const response = await fetch(`/api/proxy/system-resources/${systemName}?resource_type=NACL`)
          if (response.ok) {
            const data = await response.json()
            const nacl = (data.resources || []).find((r: any) => r.id === naclId || r.nacl_id === naclId)
            if (nacl) {
              // Parse inbound/outbound rules from NACL data
              const inboundRules = (nacl.inbound_rules || nacl.entries?.filter((e: any) => !e.Egress) || []).map((rule: any) => ({
                ruleId: rule.rule_number || rule.RuleNumber || '*',
                direction: 'Inbound',
                protocol: rule.protocol || rule.Protocol || 'All',
                portRange: rule.port_range || `${rule.FromPort || '*'}-${rule.ToPort || '*'}`,
                source: rule.cidr_block || rule.CidrBlock || '0.0.0.0/0',
                destination: null,
                isPublic: (rule.cidr_block || rule.CidrBlock || '') === '0.0.0.0/0',
                observedHits: 0,  // NACLs don't have traffic data
                unused: false,  // NACLs are stateless, can't determine "unused"
                exposureTag: (rule.cidr_block || rule.CidrBlock || '') === '0.0.0.0/0' ? '0.0.0.0/0' : null,
                recommendation: (rule.cidr_block || rule.CidrBlock || '') === '0.0.0.0/0' ? 'Restrict' : 'Keep',
                impactEstimate: 0,
                lastSeen: null,
                confidence: 100
              }))
              const outboundRules = (nacl.outbound_rules || nacl.entries?.filter((e: any) => e.Egress) || []).map((rule: any) => ({
                ruleId: rule.rule_number || rule.RuleNumber || '*',
                direction: 'Outbound',
                protocol: rule.protocol || rule.Protocol || 'All',
                portRange: rule.port_range || `${rule.FromPort || '*'}-${rule.ToPort || '*'}`,
                source: null,
                destination: rule.cidr_block || rule.CidrBlock || '0.0.0.0/0',
                isPublic: (rule.cidr_block || rule.CidrBlock || '') === '0.0.0.0/0',
                observedHits: 0,
                unused: false,
                exposureTag: (rule.cidr_block || rule.CidrBlock || '') === '0.0.0.0/0' ? '0.0.0.0/0' : null,
                recommendation: (rule.cidr_block || rule.CidrBlock || '') === '0.0.0.0/0' ? 'Restrict' : 'Keep',
                impactEstimate: 0,
                lastSeen: null,
                confidence: 100
              }))
              setDetailData({
                networkRules: [...inboundRules, ...outboundRules]
              })
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch detail data:', err)
      } finally {
        setLoadingDetail(false)
      }
    }

    fetchDetailData()
  }, [component, timeWindow])

  const generatePolicy = async () => {
    if (!component || component.componentType !== 'IAMRole') return

    try {
      // Generate least-privilege policy JSON
      const usedActions = detailData?.observedItems?.map((item: any) => item.item) || []
      const policy = {
        Version: '2012-10-17',
        Statement: [{
          Sid: 'LeastPrivilegePolicy',
          Effect: 'Allow',
          Action: usedActions,
          Resource: '*'
        }]
      }

      // Get current policy for diff
      const roleName = component.componentName
      const currentResponse = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=${timeWindow}`)
      const currentData = await currentResponse.ok ? await currentResponse.json() : null
      const currentActions = currentData?.allowed_actions_list || []

      setPolicyPreview({
        current: {
          Version: '2012-10-17',
          Statement: [{
            Sid: 'CurrentPolicy',
            Effect: 'Allow',
            Action: currentActions,
            Resource: '*'
          }]
        },
        recommended: policy,
        removed: currentActions.filter((a: string) => !usedActions.includes(a)),
        added: []
      })

      setShowPolicyModal(true)
    } catch (err) {
      console.error('Failed to generate policy:', err)
    }
  }

  const simulateImpact = async () => {
    if (!component) return

    try {
      // Query dependency graph for affected paths
      const response = await fetch(`/api/proxy/dependency-map/path/${component.componentId}/${component.componentId}?systemName=alon-prod`)
      if (response.ok) {
        const data = await response.json()
        setSimulationResult({
          affectedPaths: data.segments || [],
          blastRadius: data.segments?.length || 0,
          estimatedImpact: 'Low - No breaking changes expected'
        })
      } else {
        // Fallback simulation
        setSimulationResult({
          affectedPaths: [],
          blastRadius: 0,
          estimatedImpact: 'Unable to calculate - dependency graph unavailable'
        })
      }
      setShowSimulationModal(true)
    } catch (err) {
      console.error('Failed to simulate impact:', err)
    }
  }

  if (!component) {
    return (
      <div className="w-1/2 bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <Eye className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Select a component to view details</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-1/2 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{component.componentName}</h2>
          <p className="text-sm text-gray-500">{component.componentType} • {component.componentArn}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Summary Diff */}
      <div className="px-6 py-4 bg-gray-50 border-b">
        <h3 className="text-sm font-semibold mb-3">Summary</h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">Allowed</div>
            <div className="text-2xl font-bold">{component.allowedCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Observed Used</div>
            <div className="text-2xl font-bold text-green-600">{component.observedCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Unused Candidates</div>
            <div className="text-2xl font-bold text-red-600">{component.unusedCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Confidence</div>
            <div className={`text-sm font-medium px-2 py-1 rounded border inline-block ${getConfidenceColor(component.confidence)}`}>
              {component.confidence}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {component.observationDays}d coverage
            </div>
          </div>
        </div>
      </div>

      {/* Diff Table Tabs */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="flex gap-2 mb-4 border-b">
          <button
            onClick={() => setActiveTab('iam')}
            className={`px-4 py-2 border-b-2 font-medium text-sm ${
              activeTab === 'iam' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            IAM Actions
          </button>
          <button
            onClick={() => setActiveTab('network')}
            className={`px-4 py-2 border-b-2 font-medium text-sm ${
              activeTab === 'network' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Network Rules
          </button>
          <button
            onClick={() => setActiveTab('resource')}
            className={`px-4 py-2 border-b-2 font-medium text-sm ${
              activeTab === 'resource' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Resource Policies
          </button>
        </div>

        {/* Evidence Info */}
        <div className="text-sm text-gray-600 mb-4 p-3 bg-blue-50 rounded-lg">
          <Info className="w-4 h-4 inline mr-1" />
          Showing unused permissions from {timeWindow} days of observation. 
          Evidence: {Object.values(component.evidenceCoverage).filter(Boolean).length}/4 sources.
          {component.evidenceCoverage.cloudtrail && ' CloudTrail ✅'}
          {component.evidenceCoverage.flowLogs && ' Flow Logs ✅'}
          {!component.evidenceCoverage.flowLogs && component.componentType === 'SecurityGroup' && ' Flow Logs ⚠️'}
        </div>

        {/* Diff Table Content */}
        {loadingDetail ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading details...</span>
          </div>
        ) : (
          <>
            {activeTab === 'iam' && component.componentType === 'IAMRole' && (
              <IAMActionsTable
                detailData={detailData}
                timeWindow={timeWindow}
                evidenceCoverage={component.evidenceCoverage}
              />
            )}
            {activeTab === 'network' && (component.componentType === 'SecurityGroup' || component.componentType === 'NetworkACL') && (
              <NetworkRulesTable
                detailData={detailData}
                timeWindow={timeWindow}
              />
            )}
            {activeTab === 'resource' && component.componentType === 'S3Bucket' && (
              <ResourcePoliciesTable
                detailData={detailData}
                timeWindow={timeWindow}
              />
            )}
            {activeTab === 'iam' && component.componentType !== 'IAMRole' && (
              <div className="text-center text-gray-500 py-12">
                IAM Actions tab only available for IAM Roles
              </div>
            )}
            {activeTab === 'network' && component.componentType !== 'SecurityGroup' && component.componentType !== 'NetworkACL' && (
              <div className="text-center text-gray-500 py-12">
                Network Rules tab only available for Security Groups and Network ACLs
              </div>
            )}
            {activeTab === 'resource' && component.componentType !== 'S3Bucket' && (
              <div className="text-center text-gray-500 py-12">
                Resource Policies tab only available for S3 Buckets
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions Panel */}
      <div className="px-6 py-4 border-t bg-gray-50 space-y-2">
        <h3 className="text-sm font-semibold mb-2">Actions</h3>
        <div className="flex gap-2">
          {component.componentType === 'IAMRole' && (
            <button
              onClick={generatePolicy}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              <Code className="w-4 h-4" />
              Generate Least-Privilege Policy
            </button>
          )}
          <button
            onClick={simulateImpact}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-100"
          >
            <Play className="w-4 h-4" />
            Simulate Impact
          </button>
          <button
            onClick={() => {
              const data = JSON.stringify({ component, detailData }, null, 2)
              const blob = new Blob([data], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${component.componentName}-gap-analysis.json`
              a.click()
            }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-100"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Policy Preview Modal */}
      {showPolicyModal && policyPreview && (
        <PolicyPreviewModal
          preview={policyPreview}
          componentName={component.componentName}
          onClose={() => setShowPolicyModal(false)}
        />
      )}

      {/* Simulation Modal */}
      {showSimulationModal && simulationResult && (
        <SimulationModal
          result={simulationResult}
          componentName={component.componentName}
          onClose={() => setShowSimulationModal(false)}
        />
      )}
    </div>
  )
}

// ============================================================================
// DIFF TABLE COMPONENTS
// ============================================================================

function IAMActionsTable({
  detailData,
  timeWindow,
  evidenceCoverage
}: {
  detailData: any
  timeWindow: number
  evidenceCoverage: EvidenceCoverage
}) {
  if (!detailData?.unusedItems?.length && !detailData?.observedItems?.length) {
    return (
      <div className="text-center text-gray-500 py-12">
        <p>No IAM action data available</p>
        <p className="text-xs mt-2">
          {!evidenceCoverage.cloudtrail && 'CloudTrail data not available'}
        </p>
      </div>
    )
  }

  const allItems = [
    ...(detailData.observedItems || []).map((item: any) => ({ ...item, isUsed: true })),
    ...(detailData.unusedItems || []).map((item: any) => ({ ...item, isUsed: false }))
  ]

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">Action</th>
            <th className="px-4 py-2 text-left font-semibold">Allowed By</th>
            <th className="px-4 py-2 text-left font-semibold">Observed Count</th>
            <th className="px-4 py-2 text-left font-semibold">Last Seen</th>
            <th className="px-4 py-2 text-left font-semibold">Risk Tag</th>
            <th className="px-4 py-2 text-left font-semibold">Recommendation</th>
            <th className="px-4 py-2 text-left font-semibold">Why</th>
          </tr>
        </thead>
        <tbody>
          {allItems.map((item: any, idx: number) => (
            <tr key={idx} className={`border-b ${item.isUsed ? 'bg-green-50' : 'bg-red-50'}`}>
              <td className="px-4 py-3 font-mono text-xs">{item.item}</td>
              <td className="px-4 py-3 text-xs">{item.allowedBy || 'IAM Policy'}</td>
              <td className="px-4 py-3">
                {item.isUsed ? (
                  <span className="text-green-600 font-medium">{item.observedCount || 1}</span>
                ) : (
                  <span className="text-red-600 font-medium">0</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {item.lastSeen ? new Date(item.lastSeen).toLocaleDateString() : 'Never'}
              </td>
              <td className="px-4 py-3">
                {item.riskTag && (
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    item.riskTag === 'Wildcard' || item.riskTag === 'Admin' ? 'bg-red-100 text-red-700' :
                    item.riskTag === 'Write' || item.riskTag === 'Delete' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {item.riskTag}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  item.recommendation === 'Remove' ? 'bg-red-100 text-red-700' :
                  item.recommendation === 'Scope' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {item.recommendation || (item.isUsed ? 'Keep' : 'Remove')}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-gray-600">
                {item.why || (item.isUsed ? 'Active usage observed' : `Not observed in ${timeWindow} days`)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NetworkRulesTable({
  detailData,
  timeWindow
}: {
  detailData: any
  timeWindow: number
}) {
  if (!detailData?.networkRules?.length) {
    return (
      <div className="text-center text-gray-500 py-12">
        <p>No network rule data available</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">Rule</th>
            <th className="px-4 py-2 text-left font-semibold">Observed Hits</th>
            <th className="px-4 py-2 text-left font-semibold">Unused</th>
            <th className="px-4 py-2 text-left font-semibold">Exposure</th>
            <th className="px-4 py-2 text-left font-semibold">Recommendation</th>
            <th className="px-4 py-2 text-left font-semibold">Impact</th>
          </tr>
        </thead>
        <tbody>
          {detailData.networkRules.map((rule: any, idx: number) => (
            <tr key={idx} className={`border-b ${rule.unused ? 'bg-red-50' : 'bg-green-50'}`}>
              <td className="px-4 py-3">
                <div className="font-mono text-xs">
                  {rule.direction} {rule.protocol} {rule.portRange}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {rule.source} → {rule.destination}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={rule.observedHits > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                  {rule.observedHits}
                </span>
              </td>
              <td className="px-4 py-3">
                {rule.unused ? (
                  <span className="text-red-600 font-medium">Yes (0 hits)</span>
                ) : (
                  <span className="text-green-600">No</span>
                )}
              </td>
              <td className="px-4 py-3">
                {rule.exposureTag && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                    {rule.exposureTag}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  rule.recommendation === 'Remove' ? 'bg-red-100 text-red-700' :
                  rule.recommendation === 'Restrict' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {rule.recommendation}
                </span>
              </td>
              <td className="px-4 py-3 text-xs">
                {rule.impactEstimate} sources affected
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResourcePoliciesTable({
  detailData,
  timeWindow
}: {
  detailData: any
  timeWindow: number
}) {
  if (!detailData?.resourcePolicies?.length) {
    return (
      <div className="text-center text-gray-500 py-12">
        <p>No resource policy data available</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">Action</th>
            <th className="px-4 py-2 text-left font-semibold">Allowed By</th>
            <th className="px-4 py-2 text-left font-semibold">Observed Count</th>
            <th className="px-4 py-2 text-left font-semibold">Last Seen</th>
            <th className="px-4 py-2 text-left font-semibold">Risk Tag</th>
            <th className="px-4 py-2 text-left font-semibold">Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {detailData.resourcePolicies.map((policy: any, idx: number) => (
            <tr key={idx} className="border-b bg-red-50">
              <td className="px-4 py-3 font-mono text-xs">{policy.action}</td>
              <td className="px-4 py-3 text-xs">{policy.allowedBy}</td>
              <td className="px-4 py-3 text-red-600 font-medium">{policy.observedCount}</td>
              <td className="px-4 py-3 text-xs">{policy.lastSeen || 'Never'}</td>
              <td className="px-4 py-3">
                {policy.riskTag && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                    {policy.riskTag}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                  {policy.recommendation}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// MODAL COMPONENTS
// ============================================================================

function PolicyPreviewModal({
  preview,
  componentName,
  onClose
}: {
  preview: any
  componentName: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto m-4">
        <div className="p-6 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Least-Privilege Policy Preview: {componentName}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Removed Actions ({preview.removed.length})</h4>
            <div className="bg-red-50 border border-red-200 rounded p-3 max-h-40 overflow-auto">
              <pre className="text-xs text-red-700">
                {preview.removed.join('\n')}
              </pre>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Recommended Policy</h4>
            <div className="bg-gray-50 border rounded p-3">
              <pre className="text-xs overflow-auto">
                {JSON.stringify(preview.recommended, null, 2)}
              </pre>
            </div>
          </div>
        </div>
        <div className="p-6 border-t flex justify-end gap-2">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(preview.recommended, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${componentName}-least-privilege-policy.json`
              a.click()
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Download Policy
          </button>
          <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-100">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function SimulationModal({
  result,
  componentName,
  onClose
}: {
  result: any
  componentName: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto m-4">
        <div className="p-6 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Impact Simulation: {componentName}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Estimated Impact</h4>
            <p className="text-sm text-gray-600">{result.estimatedImpact}</p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Blast Radius</h4>
            <p className="text-sm">{result.blastRadius} affected paths</p>
          </div>
          {result.affectedPaths?.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Affected Paths</h4>
              <div className="space-y-2">
                {result.affectedPaths.slice(0, 10).map((path: any, idx: number) => (
                  <div key={idx} className="bg-gray-50 border rounded p-2 text-xs">
                    {path.source} → {path.target}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-6 border-t flex justify-end">
          <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-100">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRiskTagForAction(action: string): string {
  if (action.includes('*') || action.endsWith(':*')) return 'Wildcard'
  if (action.includes('PassRole') || action.includes('passrole')) return 'Admin'
  if (action.includes('Delete') || action.includes('Remove')) return 'Delete'
  if (action.includes('Write') || action.includes('Put') || action.includes('Create')) return 'Write'
  return ''
}

function getRecommendationForAction(action: string): 'Remove' | 'Scope' | 'Keep' {
  if (action.includes('*') || action.endsWith(':*')) return 'Scope'
  if (action.includes('Delete') || action.includes('Remove')) return 'Remove'
  return 'Remove'
}

// Helper function for risk colors
function getRiskColor(risk: string) {
  switch (risk) {
    case 'CRITICAL': return 'bg-red-600 text-white'
    case 'HIGH': return 'bg-orange-500 text-white'
    case 'MEDIUM': return 'bg-yellow-500 text-white'
    default: return 'bg-gray-500 text-white'
  }
}

function getConfidenceColor(confidence: string) {
  switch (confidence) {
    case 'HIGH': return 'bg-green-100 text-green-700 border-green-300'
    case 'MEDIUM': return 'bg-yellow-100 text-yellow-700 border-yellow-300'
    case 'LOW': return 'bg-red-100 text-red-700 border-red-300'
    default: return 'bg-gray-100 text-gray-700 border-gray-300'
  }
}

