'use client'

import React, { useState } from 'react'
import {
  AlertTriangle, ChevronDown, ChevronRight, Shield, Network,
  Eye, Settings, Activity, Clock, Database, Globe, Key
} from 'lucide-react'
import { ReconciliationBadge, PlaneBadges } from './reconciliation-badge'

export interface EvidenceRow {
  label: string
  value: string | number
  source: string  // "flow_logs", "cloudtrail", "config", "iam"
}

export interface Detection {
  type: string
  severity: string
  title?: string
  description: string
  evidence?: EvidenceRow[]
  port?: number
  hits?: number
  resource_key?: string
  resource_name?: string
  planes?: PlaneBadges
}

interface DetectionsSectionProps {
  detections: Detection[]
}

const getDetectionTitle = (type: string): string => {
  const titles: Record<string, string> = {
    unusual_port: 'Unusual Port Detected',
    new_outbound: 'New Outbound Destination',
    first_access: 'First-Time Access',
    config_change: 'Configuration Change',
    high_volume: 'High Traffic Volume',
    permission_unused: 'Unused Permission',
    permission_shadow: 'Shadow Permission',
    internet_exposed: 'Internet Exposed Resource',
  }
  return titles[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const getDetectionIcon = (type: string) => {
  const typeLower = type.toLowerCase()
  if (typeLower.includes('port') || typeLower.includes('network')) {
    return <Network className="w-5 h-5" />
  }
  if (typeLower.includes('outbound') || typeLower.includes('internet')) {
    return <Globe className="w-5 h-5" />
  }
  if (typeLower.includes('permission') || typeLower.includes('iam')) {
    return <Key className="w-5 h-5" />
  }
  if (typeLower.includes('config')) {
    return <Settings className="w-5 h-5" />
  }
  if (typeLower.includes('access') || typeLower.includes('data')) {
    return <Database className="w-5 h-5" />
  }
  return <AlertTriangle className="w-5 h-5" />
}

const getSeverityStyles = (severity: string) => {
  switch (severity.toLowerCase()) {
    case 'critical':
      return {
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
        badge: 'bg-rose-500/20 text-rose-400',
        icon: 'text-rose-400',
      }
    case 'high':
      return {
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        badge: 'bg-orange-500/20 text-orange-400',
        icon: 'text-orange-400',
      }
    case 'medium':
      return {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        badge: 'bg-amber-500/20 text-amber-400',
        icon: 'text-amber-400',
      }
    default:
      return {
        bg: 'bg-slate-800/30',
        border: 'border-slate-700/50',
        badge: 'bg-slate-600/50 text-slate-400',
        icon: 'text-slate-400',
      }
  }
}

const getSourceIcon = (source: string) => {
  switch (source.toLowerCase()) {
    case 'flow_logs':
    case 'observed':
      return <Activity className="w-3 h-3 text-emerald-400" />
    case 'cloudtrail':
    case 'changed':
      return <Eye className="w-3 h-3 text-blue-400" />
    case 'config':
    case 'configured':
      return <Settings className="w-3 h-3 text-violet-400" />
    case 'iam':
    case 'authorized':
      return <Shield className="w-3 h-3 text-amber-400" />
    default:
      return <Clock className="w-3 h-3 text-slate-400" />
  }
}

const DetectionCard: React.FC<{
  detection: Detection
  isExpanded: boolean
  onToggle: () => void
}> = ({ detection, isExpanded, onToggle }) => {
  const styles = getSeverityStyles(detection.severity)
  const title = detection.title || getDetectionTitle(detection.type)

  // Build evidence from detection data
  const evidence: EvidenceRow[] = detection.evidence || []
  if (detection.port && !evidence.find(e => e.label === 'Port')) {
    evidence.push({ label: 'Port', value: detection.port, source: 'flow_logs' })
  }
  if (detection.hits && !evidence.find(e => e.label === 'Hit Count')) {
    evidence.push({ label: 'Hit Count', value: detection.hits, source: 'flow_logs' })
  }

  // Default planes if not provided
  const planes: PlaneBadges = detection.planes || {
    observed: detection.type.includes('port') || detection.type.includes('traffic') ? true : null,
    configured: null,
    authorized: null,
    changed: null,
  }

  return (
    <div className={`${styles.bg} border ${styles.border} rounded-xl overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-800/20 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}

        <div className={styles.icon}>
          {getDetectionIcon(detection.type)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-medium">{title}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles.badge}`}>
              {detection.severity}
            </span>
          </div>
          <p className="text-sm text-slate-400 truncate">{detection.description}</p>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Full Description */}
          <div className="pl-9">
            <p className="text-slate-300">{detection.description}</p>
          </div>

          {/* Evidence Rows */}
          {evidence.length > 0 && (
            <div className="pl-9">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                Evidence
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg divide-y divide-slate-700/50">
                {evidence.map((row, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      {getSourceIcon(row.source)}
                      <span className="text-slate-400 text-sm">{row.label}</span>
                    </div>
                    <span className="text-white font-mono text-sm">
                      {typeof row.value === 'number' ? row.value.toLocaleString() : row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reconciliation Badges */}
          <div className="pl-9">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
              Data Plane Confirmation
            </div>
            <ReconciliationBadge planes={planes} />
          </div>

          {/* Resource Info */}
          {detection.resource_name && (
            <div className="pl-9 text-sm">
              <span className="text-slate-500">Resource: </span>
              <span className="text-white">{detection.resource_name}</span>
              {detection.resource_key && (
                <span className="text-slate-600 ml-2 font-mono text-xs">
                  ({detection.resource_key})
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const DetectionsSection: React.FC<DetectionsSectionProps> = ({
  detections,
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set([0])) // First one expanded
  const [filter, setFilter] = useState<string>('all')

  const toggleItem = (idx: number) => {
    const next = new Set(expandedItems)
    if (next.has(idx)) {
      next.delete(idx)
    } else {
      next.add(idx)
    }
    setExpandedItems(next)
  }

  // Count by severity
  const severityCounts = detections.reduce((acc, d) => {
    const sev = d.severity.toLowerCase()
    acc[sev] = (acc[sev] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Filter detections
  const filteredDetections = filter === 'all'
    ? detections
    : detections.filter(d => d.severity.toLowerCase() === filter)

  if (detections.length === 0) {
    return (
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-8 text-center">
        <Shield className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
        <p className="text-emerald-400 font-medium">No Detections</p>
        <p className="text-sm text-slate-500 mt-1">
          No anomalies or issues detected in the current time window
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            filter === 'all'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-700/50 text-slate-400 hover:text-white'
          }`}
        >
          All ({detections.length})
        </button>
        {severityCounts.critical && (
          <button
            onClick={() => setFilter('critical')}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filter === 'critical'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:text-white'
            }`}
          >
            Critical ({severityCounts.critical})
          </button>
        )}
        {severityCounts.high && (
          <button
            onClick={() => setFilter('high')}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filter === 'high'
                ? 'bg-orange-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:text-white'
            }`}
          >
            High ({severityCounts.high})
          </button>
        )}
        {severityCounts.medium && (
          <button
            onClick={() => setFilter('medium')}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filter === 'medium'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:text-white'
            }`}
          >
            Medium ({severityCounts.medium})
          </button>
        )}
        {severityCounts.low && (
          <button
            onClick={() => setFilter('low')}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filter === 'low'
                ? 'bg-slate-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:text-white'
            }`}
          >
            Low ({severityCounts.low})
          </button>
        )}
      </div>

      {/* Detection Cards */}
      <div className="space-y-3">
        {filteredDetections.map((detection, idx) => (
          <DetectionCard
            key={idx}
            detection={detection}
            isExpanded={expandedItems.has(idx)}
            onToggle={() => toggleItem(idx)}
          />
        ))}
      </div>
    </div>
  )
}

export default DetectionsSection
