'use client'

import React, { useState } from 'react'
import {
  Database, Users, Clock, Shield, ChevronDown, ChevronRight,
  AlertTriangle, Lock, Unlock, Eye, FileText
} from 'lucide-react'
import { ReconciliationBadge, PlaneBadges } from './reconciliation-badge'

// ============================================================================
// Types - Matches expected backend API structure
// ============================================================================

export interface BucketConfig {
  public_access_blocked: boolean
  encryption: string | null  // 'SSE-KMS', 'SSE-S3', null
  encryption_key?: string
  versioning: boolean
  logging_enabled: boolean
}

export interface BucketAccess {
  bucket_name: string
  bucket_arn: string
  top_principals: string[]
  read_ops: number
  write_ops: number
  delete_ops: number
  first_access: string | null
  last_access: string | null
  config?: BucketConfig
  planes: PlaneBadges
}

export interface DataPrincipal {
  principal_arn: string
  principal_name: string
  principal_type: string
  buckets_accessed: number
  read_ops: number
  write_ops: number
  top_actions: string[]
  planes: PlaneBadges
}

export interface FirstTimeAccessEvent {
  timestamp: string
  principal: string
  principal_name?: string
  bucket: string
  action: string
  source_ip?: string
  planes: PlaneBadges
}

export interface DataAccessSectionProps {
  buckets: BucketAccess[]
  principals: DataPrincipal[]
  firstTimeAccess: FirstTimeAccessEvent[]
  totalReadOps: number
  totalWriteOps: number
}

// ============================================================================
// Helpers
// ============================================================================

const formatTimestamp = (ts: string | null): string => {
  if (!ts) return '—'
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60))
    return `${diffMins}m ago`
  }
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const extractPrincipalName = (arn: string): string => {
  // Extract role/user name from ARN
  const parts = arn.split('/')
  return parts[parts.length - 1] || arn
}

const formatNumber = (n: number): string => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString()
}

// ============================================================================
// Sub-components
// ============================================================================

const CollapsibleTable: React.FC<{
  title: string
  icon: React.ReactNode
  count: number
  children: React.ReactNode
  defaultExpanded?: boolean
}> = ({ title, icon, count, children, defaultExpanded = true }) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-white font-medium">{title}</span>
          <span className="px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded text-xs">
            {count}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
      </button>
      {expanded && <div className="p-4">{children}</div>}
    </div>
  )
}

const BucketAccessTable: React.FC<{ buckets: BucketAccess[] }> = ({ buckets }) => {
  if (buckets.length === 0) {
    return (
      <div className="text-slate-500 text-sm text-center py-4">
        No bucket access data available
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-800/50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Bucket</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Top Principals</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Read</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Write</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Delete</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Last Access</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Planes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {buckets.map((bucket, idx) => (
            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-orange-400" />
                  <div>
                    <div className="text-white text-sm font-medium">{bucket.bucket_name}</div>
                    {bucket.config && (
                      <div className="flex items-center gap-1 mt-0.5">
                        {bucket.config.encryption ? (
                          <Lock className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Unlock className="w-3 h-3 text-amber-400" />
                        )}
                        <span className="text-xs text-slate-500">
                          {bucket.config.encryption || 'No encryption'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {bucket.top_principals.slice(0, 2).map((principal, i) => (
                    <span key={i} className="px-2 py-0.5 bg-slate-700/50 text-slate-300 rounded text-xs truncate max-w-[120px]">
                      {extractPrincipalName(principal)}
                    </span>
                  ))}
                  {bucket.top_principals.length > 2 && (
                    <span className="px-2 py-0.5 bg-slate-700/50 text-slate-500 rounded text-xs">
                      +{bucket.top_principals.length - 2}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-white font-medium">{formatNumber(bucket.read_ops)}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-white font-medium">{formatNumber(bucket.write_ops)}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`font-medium ${bucket.delete_ops > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                  {formatNumber(bucket.delete_ops)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-400 text-sm">{formatTimestamp(bucket.last_access)}</span>
              </td>
              <td className="px-4 py-3">
                <ReconciliationBadge planes={bucket.planes} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PrincipalsTable: React.FC<{ principals: DataPrincipal[] }> = ({ principals }) => {
  if (principals.length === 0) {
    return (
      <div className="text-slate-500 text-sm text-center py-4">
        No principal data available
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-800/50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Principal</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Buckets</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Read</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Write</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Top Actions</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Planes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {principals.map((principal, idx) => (
            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <div>
                    <div className="text-white text-sm font-medium">{principal.principal_name}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[200px]">{principal.principal_arn}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 bg-slate-700/50 text-slate-300 rounded text-xs">
                  {principal.principal_type}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-white font-medium">{principal.buckets_accessed}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-white font-medium">{formatNumber(principal.read_ops)}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-white font-medium">{formatNumber(principal.write_ops)}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {principal.top_actions.slice(0, 2).map((action, i) => (
                    <span key={i} className="px-2 py-0.5 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded text-xs">
                      {action}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                <ReconciliationBadge planes={principal.planes} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const FirstTimeAccessTable: React.FC<{ events: FirstTimeAccessEvent[] }> = ({ events }) => {
  if (events.length === 0) {
    return (
      <div className="text-slate-500 text-sm text-center py-4">
        No first-time access events detected
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-800/50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Time</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Principal</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Bucket</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Action</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Source IP</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Planes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {events.map((event, idx) => (
            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-3">
                <span className="text-slate-400 text-sm">{formatTimestamp(event.timestamp)}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-white text-sm">
                    {event.principal_name || extractPrincipalName(event.principal)}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="text-white text-sm">{event.bucket}</span>
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs">
                  {event.action}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-400 text-sm font-mono">{event.source_ip || '—'}</span>
              </td>
              <td className="px-4 py-3">
                <ReconciliationBadge planes={event.planes} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export const DataAccessSection: React.FC<DataAccessSectionProps> = ({
  buckets,
  principals,
  firstTimeAccess,
  totalReadOps,
  totalWriteOps,
}) => {
  const hasData = buckets.length > 0 || principals.length > 0 || firstTimeAccess.length > 0

  if (!hasData) {
    return (
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-8 text-center">
        <Database className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400 font-medium">No S3 Data Access Events</p>
        <p className="text-sm text-slate-500 mt-1">
          S3 data events not collected. Enable CloudTrail S3 data events to track bucket access.
        </p>
      </div>
    )
  }

  const accessedBuckets = buckets.filter(b => b.read_ops > 0 || b.write_ops > 0).length

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Database className="w-4 h-4" />
            Buckets Tracked
          </div>
          <div className="text-2xl font-bold text-white">{buckets.length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Eye className="w-4 h-4" />
            Accessed Buckets
          </div>
          <div className="text-2xl font-bold text-white">{accessedBuckets}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <FileText className="w-4 h-4" />
            Read Operations
          </div>
          <div className="text-2xl font-bold text-white">{formatNumber(totalReadOps)}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <FileText className="w-4 h-4" />
            Write Operations
          </div>
          <div className="text-2xl font-bold text-white">{formatNumber(totalWriteOps)}</div>
        </div>
      </div>

      {/* Bucket Access Table */}
      {buckets.length > 0 && (
        <CollapsibleTable
          title="Bucket Access Summary"
          icon={<Database className="w-4 h-4 text-orange-400" />}
          count={buckets.length}
        >
          <BucketAccessTable buckets={buckets} />
        </CollapsibleTable>
      )}

      {/* Principals Table */}
      {principals.length > 0 && (
        <CollapsibleTable
          title="Top Data Principals"
          icon={<Users className="w-4 h-4 text-blue-400" />}
          count={principals.length}
          defaultExpanded={false}
        >
          <PrincipalsTable principals={principals} />
        </CollapsibleTable>
      )}

      {/* First Time Access */}
      {firstTimeAccess.length > 0 && (
        <CollapsibleTable
          title="First-Time Access Events"
          icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
          count={firstTimeAccess.length}
          defaultExpanded={false}
        >
          <FirstTimeAccessTable events={firstTimeAccess} />
        </CollapsibleTable>
      )}
    </div>
  )
}

export default DataAccessSection
