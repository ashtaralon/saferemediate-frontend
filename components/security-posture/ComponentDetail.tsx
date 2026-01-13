"use client"

import { useState } from "react"
import { X, FileText, Network, Database, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle, Minus, Info, Zap, Copy, Download, Play } from "lucide-react"
import type { ComponentDiff, GapItem, RiskTag, RecommendationAction, EvidenceStrength } from "./types"

interface ComponentDetailProps {
  diff: ComponentDiff | null
  loading: boolean
  onClose: () => void
  onGeneratePolicy: () => void
  onSimulateImpact: () => void
  onExport: () => void
}

type TabType = 'iam' | 'network' | 'resource'

const TAB_CONFIG = [
  { id: 'iam' as TabType, label: 'IAM Actions', icon: FileText },
  { id: 'network' as TabType, label: 'Network Rules', icon: Network },
  { id: 'resource' as TabType, label: 'Resource Policies', icon: Database },
]

const RISK_TAG_STYLES: Record<RiskTag, { bg: string; text: string }> = {
  admin: { bg: 'bg-red-100', text: 'text-red-700' },
  write: { bg: 'bg-orange-100', text: 'text-orange-700' },
  delete: { bg: 'bg-red-50', text: 'text-red-600' },
  wildcard: { bg: 'bg-purple-100', text: 'text-purple-700' },
  public: { bg: 'bg-red-100', text: 'text-red-700' },
  broad_ports: { bg: 'bg-amber-100', text: 'text-amber-700' },
}

const RECOMMENDATION_STYLES: Record<RecommendationAction, { bg: string; text: string; label: string }> = {
  remove: { bg: 'bg-red-100', text: 'text-red-700', label: 'Remove' },
  scope: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Scope Down' },
  keep: { bg: 'bg-green-100', text: 'text-green-700', label: 'Keep' },
  review: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Review' },
}

function SummaryDiff({
  allowed,
  observedUsed,
  unusedCandidates,
  confidence,
  confidencePercent,
  observationWindow,
}: {
  allowed: number
  observedUsed: number
  unusedCandidates: number
  confidence: EvidenceStrength
  confidencePercent: number
  observationWindow: string
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-4">
      {/* Main numbers */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
          <div className="text-3xl font-bold text-blue-600">{allowed}</div>
          <div className="text-xs text-blue-600 font-medium">Allowed</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
          <div className="text-3xl font-bold text-green-600">{observedUsed}</div>
          <div className="text-xs text-green-600 font-medium">Observed Used</div>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center border border-red-100">
          <div className="text-3xl font-bold text-red-600">{unusedCandidates}</div>
          <div className="text-xs text-red-600 font-medium">Unused Candidates</div>
        </div>
      </div>

      {/* Confidence info */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Confidence:</span>
          <span className={`px-2 py-0.5 rounded font-medium ${
            confidence === 'strong' ? 'bg-green-100 text-green-700' :
            confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {confidence === 'strong' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low'} ({confidencePercent}%)
          </span>
        </div>
        <div className="text-gray-500">
          {observationWindow} coverage
        </div>
      </div>
    </div>
  )
}

function GapItemRow({ item, expanded, onToggle }: { item: GapItem; expanded: boolean; onToggle: () => void }) {
  return (
    <div className={`border rounded-lg ${expanded ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200'}`}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
      >
        {/* Expand icon */}
        <span className="text-gray-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>

        {/* Identifier */}
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm font-medium text-gray-900 truncate">
            {item.identifier}
          </div>
          <div className="text-xs text-gray-500 truncate">
            Allowed by: {item.allowedBy}
            {item.allowedByStatement && ` (${item.allowedByStatement})`}
          </div>
        </div>

        {/* Observed count */}
        <div className={`text-sm font-medium ${item.observedCount === 0 ? 'text-red-600' : 'text-green-600'}`}>
          {item.observedCount === 0 ? '0 uses' : `${item.observedCount} uses`}
        </div>

        {/* Last seen */}
        <div className="text-xs text-gray-500 w-24 text-right">
          {item.lastSeen || 'Never'}
        </div>

        {/* Risk tags */}
        <div className="flex gap-1">
          {item.riskTags.slice(0, 2).map(tag => (
            <span key={tag} className={`px-1.5 py-0.5 rounded text-xs font-medium ${RISK_TAG_STYLES[tag].bg} ${RISK_TAG_STYLES[tag].text}`}>
              {tag}
            </span>
          ))}
        </div>

        {/* Recommendation */}
        <span className={`px-2 py-1 rounded text-xs font-medium ${RECOMMENDATION_STYLES[item.recommendation].bg} ${RECOMMENDATION_STYLES[item.recommendation].text}`}>
          {RECOMMENDATION_STYLES[item.recommendation].label}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-3">
          {/* Reason */}
          <div className="bg-white rounded-lg p-3 border">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm text-gray-700">{item.reason}</div>
                <div className="mt-2 text-xs text-gray-500">
                  Confidence: {item.confidence}%
                  {item.confidenceBreakdown && (
                    <span className="ml-2 text-gray-400">
                      (Evidence: {Math.round(item.confidenceBreakdown.evidenceCoverage * 100)}%,
                      Recency: {Math.round(item.confidenceBreakdown.recencyFrequency * 100)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Exposure details for SG rules */}
          {item.exposure && (
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
              <div className="text-xs font-medium text-amber-800 mb-1">Exposure Details</div>
              <div className="text-sm text-amber-700 font-mono">
                {item.exposure.protocol}:{item.exposure.ports} from {item.exposure.cidr}
              </div>
            </div>
          )}

          {/* Affected dependencies */}
          {item.affectedDependencies && item.affectedDependencies.length > 0 && (
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div className="text-xs font-medium text-blue-800 mb-1">Potential Dependencies</div>
              <div className="text-sm text-blue-700">
                {item.affectedDependencies.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DiffTable({ items, title, icon: Icon }: { items: GapItem[]; title: string; icon: typeof FileText }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Icon className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <div className="text-sm">No {title.toLowerCase()} to review</div>
      </div>
    )
  }

  // Sort by recommendation priority (remove first, then scope, then review, then keep)
  const priorityOrder: Record<RecommendationAction, number> = { remove: 0, scope: 1, review: 2, keep: 3 }
  const sortedItems = [...items].sort((a, b) => priorityOrder[a.recommendation] - priorityOrder[b.recommendation])

  return (
    <div className="space-y-2">
      {sortedItems.map(item => (
        <GapItemRow
          key={item.id}
          item={item}
          expanded={expandedId === item.id}
          onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
        />
      ))}
    </div>
  )
}

export function ComponentDetail({
  diff,
  loading,
  onClose,
  onGeneratePolicy,
  onSimulateImpact,
  onExport,
}: ComponentDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>('iam')

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-gray-500">Loading component details...</div>
        </div>
      </div>
    )
  }

  if (!diff) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm">Select a component to view details</div>
        </div>
      </div>
    )
  }

  const getTabItems = (): GapItem[] => {
    switch (activeTab) {
      case 'iam': return diff.iamActions?.items || []
      case 'network': return diff.networkRules?.items || []
      case 'resource': return diff.resourcePolicies?.items || []
      default: return []
    }
  }

  const getTabCounts = (tab: TabType) => {
    switch (tab) {
      case 'iam': return diff.iamActions?.unused || 0
      case 'network': return diff.networkRules?.unused || 0
      case 'resource': return diff.resourcePolicies?.unused || 0
      default: return 0
    }
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{diff.componentName}</h2>
          <p className="text-sm text-gray-500">{diff.componentType.replace('_', ' ')}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Summary diff */}
      <div className="px-6 py-4 border-b">
        <SummaryDiff
          allowed={diff.allowed}
          observedUsed={diff.observedUsed}
          unusedCandidates={diff.unusedCandidates}
          confidence={diff.confidence}
          confidencePercent={diff.confidencePercent}
          observationWindow={diff.observationWindow}
        />
      </div>

      {/* Tabs */}
      <div className="px-6 border-b">
        <div className="flex gap-1">
          {TAB_CONFIG.map(tab => {
            const count = getTabCounts(tab.id)
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Diff table */}
      <div className="flex-1 overflow-y-auto p-6">
        <DiffTable
          items={getTabItems()}
          title={TAB_CONFIG.find(t => t.id === activeTab)?.label || ''}
          icon={TAB_CONFIG.find(t => t.id === activeTab)?.icon || FileText}
        />
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
        <button
          onClick={onGeneratePolicy}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          <Zap className="w-4 h-4" />
          Generate Least-Privilege Policy
        </button>
        <button
          onClick={onSimulateImpact}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Play className="w-4 h-4" />
          Simulate
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>
    </div>
  )
}
