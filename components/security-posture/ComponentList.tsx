"use client"

import { useState, useMemo } from "react"
import { Search, ChevronUp, ChevronDown, User, Shield, Database, Server, Cloud, Key, AlertTriangle } from "lucide-react"
import type { SecurityComponent, ComponentListState, GroupingMode, ComponentType, RiskTag, EvidenceStrength } from "./types"

interface ComponentListProps {
  components: SecurityComponent[]
  selectedId: string | null
  onSelect: (component: SecurityComponent) => void
  listState: ComponentListState
  onListStateChange: (state: Partial<ComponentListState>) => void
}

const TYPE_ICONS: Record<ComponentType, typeof User> = {
  iam_role: Key,
  iam_user: User,
  security_group: Shield,
  s3_bucket: Database,
  lambda: Cloud,
  ec2: Server,
  rds: Database,
  dynamodb: Database,
}

const TYPE_LABELS: Record<ComponentType, string> = {
  iam_role: 'IAM Role',
  iam_user: 'IAM User',
  security_group: 'Security Group',
  s3_bucket: 'S3 Bucket',
  lambda: 'Lambda',
  ec2: 'EC2 Instance',
  rds: 'RDS Instance',
  dynamodb: 'DynamoDB Table',
}

const GROUPING_LABELS: Record<GroupingMode, string> = {
  identity: 'By Identity',
  workload: 'By Workload',
  service: 'By Service',
}

function LPScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-700 bg-green-100' :
                score >= 50 ? 'text-amber-700 bg-amber-100' :
                'text-red-700 bg-red-100'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${color}`}>
      {score}%
    </span>
  )
}

function ConfidenceBadge({ confidence }: { confidence: EvidenceStrength }) {
  const styles = {
    strong: 'text-green-700 bg-green-50',
    medium: 'text-amber-700 bg-amber-50',
    weak: 'text-gray-500 bg-gray-100',
  }
  const labels = { strong: 'High', medium: 'Med', weak: 'Low' }
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${styles[confidence]}`}>
      {labels[confidence]}
    </span>
  )
}

function RiskTagBadge({ tag }: { tag: RiskTag }) {
  const styles: Record<RiskTag, string> = {
    admin: 'text-red-700 bg-red-100',
    write: 'text-orange-700 bg-orange-100',
    delete: 'text-red-600 bg-red-50',
    wildcard: 'text-purple-700 bg-purple-100',
    public: 'text-red-700 bg-red-100',
    broad_ports: 'text-amber-700 bg-amber-100',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${styles[tag]}`}>
      {tag.replace('_', ' ')}
    </span>
  )
}

function MiniDiff({ allowed, used, unused }: { allowed: number; used: number; unused: number }) {
  return (
    <div className="flex items-center gap-1 text-xs font-mono">
      <span className="text-blue-600">{allowed}</span>
      <span className="text-gray-400">|</span>
      <span className="text-green-600">{used}</span>
      <span className="text-gray-400">|</span>
      <span className={`font-bold ${unused > 0 ? 'text-red-600' : 'text-gray-400'}`}>{unused}</span>
    </div>
  )
}

type SortField = 'lpScore' | 'unusedCount' | 'riskScore' | 'name'

function SortHeader({
  field,
  label,
  currentSort,
  currentOrder,
  onSort,
  className = ''
}: {
  field: SortField
  label: string
  currentSort: SortField
  currentOrder: 'asc' | 'desc'
  onSort: (field: SortField) => void
  className?: string
}) {
  const isActive = currentSort === field
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors ${className}`}
    >
      {label}
      <span className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`}>
        {currentOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </span>
    </button>
  )
}

export function ComponentList({
  components,
  selectedId,
  onSelect,
  listState,
  onListStateChange,
}: ComponentListProps) {
  const [localSearch, setLocalSearch] = useState(listState.searchQuery || '')

  // Handle sort
  const handleSort = (field: SortField) => {
    if (listState.sortBy === field) {
      onListStateChange({ sortOrder: listState.sortOrder === 'asc' ? 'desc' : 'asc' })
    } else {
      onListStateChange({ sortBy: field, sortOrder: 'desc' })
    }
  }

  // Filter and sort components
  const filteredComponents = useMemo(() => {
    let result = [...components]

    // Filter by search
    if (localSearch) {
      const query = localSearch.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.workload?.toLowerCase().includes(query) ||
        c.service?.toLowerCase().includes(query)
      )
    }

    // Filter by type
    if (listState.filterType) {
      result = result.filter(c => c.type === listState.filterType)
    }

    // Filter by risk
    if (listState.filterRisk) {
      result = result.filter(c => c.highestRiskUnused === listState.filterRisk)
    }

    // Filter by confidence
    if (listState.minConfidence !== undefined) {
      const strengthMap = { strong: 80, medium: 50, weak: 0 }
      result = result.filter(c => strengthMap[c.confidence] >= listState.minConfidence!)
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (listState.sortBy) {
        case 'lpScore':
          cmp = a.lpScore - b.lpScore
          break
        case 'unusedCount':
          cmp = a.unusedCount - b.unusedCount
          break
        case 'riskScore':
          // Higher risk = hasWildcards, hasAdminAccess, etc.
          const riskA = (a.hasWildcards ? 30 : 0) + (a.hasAdminAccess ? 30 : 0) + (a.hasInternetExposure ? 20 : 0) + (100 - a.lpScore)
          const riskB = (b.hasWildcards ? 30 : 0) + (b.hasAdminAccess ? 30 : 0) + (b.hasInternetExposure ? 20 : 0) + (100 - b.lpScore)
          cmp = riskA - riskB
          break
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
      }
      return listState.sortOrder === 'asc' ? cmp : -cmp
    })

    return result
  }, [components, localSearch, listState])

  // Group components if needed
  const groupedComponents = useMemo(() => {
    if (listState.groupBy === 'identity') {
      // No grouping, just return as-is (already identity-centric)
      return { '': filteredComponents }
    }

    const groups: Record<string, SecurityComponent[]> = {}
    filteredComponents.forEach(c => {
      const key = listState.groupBy === 'workload' ? (c.workload || 'Ungrouped') : (c.service || 'Other')
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    })
    return groups
  }, [filteredComponents, listState.groupBy])

  return (
    <div className="flex flex-col h-full bg-white border-r">
      {/* Header with search and grouping */}
      <div className="p-4 border-b space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search components..."
            value={localSearch}
            onChange={(e) => {
              setLocalSearch(e.target.value)
              onListStateChange({ searchQuery: e.target.value })
            }}
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Grouping tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['identity', 'workload', 'service'] as GroupingMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onListStateChange({ groupBy: mode })}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                listState.groupBy === mode
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {GROUPING_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {/* Table header */}
      <div className="px-4 py-2 bg-gray-50 border-b grid grid-cols-[1fr,60px,100px,60px,50px] gap-2 items-center">
        <SortHeader
          field="name"
          label="Component"
          currentSort={listState.sortBy}
          currentOrder={listState.sortOrder}
          onSort={handleSort}
        />
        <SortHeader
          field="lpScore"
          label="LP"
          currentSort={listState.sortBy}
          currentOrder={listState.sortOrder}
          onSort={handleSort}
          className="justify-center"
        />
        <div className="text-xs font-medium text-gray-500 text-center">
          <span className="text-blue-500">A</span>
          <span className="text-gray-300 mx-0.5">|</span>
          <span className="text-green-500">U</span>
          <span className="text-gray-300 mx-0.5">|</span>
          <span className="text-red-500">G</span>
        </div>
        <SortHeader
          field="unusedCount"
          label="Gap"
          currentSort={listState.sortBy}
          currentOrder={listState.sortOrder}
          onSort={handleSort}
          className="justify-center"
        />
        <span className="text-xs font-medium text-gray-500 text-center">Conf</span>
      </div>

      {/* Component list */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(groupedComponents).map(([group, items]) => (
          <div key={group || 'all'}>
            {/* Group header */}
            {group && (
              <div className="px-4 py-2 bg-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wide sticky top-0">
                {group} ({items.length})
              </div>
            )}

            {/* Items */}
            {items.map((component) => {
              const Icon = TYPE_ICONS[component.type]
              const isSelected = selectedId === component.id

              return (
                <button
                  key={component.id}
                  onClick={() => onSelect(component)}
                  className={`w-full px-4 py-3 grid grid-cols-[1fr,60px,100px,60px,50px] gap-2 items-center text-left transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 border-l-4 border-indigo-500'
                      : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                >
                  {/* Name & type */}
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">{component.name}</div>
                      <div className="text-xs text-gray-500 truncate">{TYPE_LABELS[component.type]}</div>
                    </div>
                    {/* Risk indicators */}
                    {(component.hasWildcards || component.hasAdminAccess || component.hasInternetExposure) && (
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    )}
                  </div>

                  {/* LP Score */}
                  <div className="flex justify-center">
                    <LPScoreBadge score={component.lpScore} />
                  </div>

                  {/* Mini diff: Allowed | Used | Gap */}
                  <div className="flex justify-center">
                    <MiniDiff
                      allowed={component.allowedCount}
                      used={component.observedCount}
                      unused={component.unusedCount}
                    />
                  </div>

                  {/* Highest risk unused */}
                  <div className="flex justify-center">
                    {component.highestRiskUnused ? (
                      <RiskTagBadge tag={component.highestRiskUnused} />
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </div>

                  {/* Confidence */}
                  <div className="flex justify-center">
                    <ConfidenceBadge confidence={component.confidence} />
                  </div>
                </button>
              )
            })}
          </div>
        ))}

        {filteredComponents.length === 0 && (
          <div className="p-8 text-center text-gray-500 text-sm">
            No components match your filters
          </div>
        )}
      </div>

      {/* Footer with count */}
      <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500">
        {filteredComponents.length} of {components.length} components
      </div>
    </div>
  )
}
