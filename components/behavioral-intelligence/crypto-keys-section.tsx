'use client'

import React, { useState } from 'react'
import {
  Key, Users, Clock, Shield, ChevronDown, ChevronRight,
  AlertTriangle, RefreshCw, Trash2, Lock, CheckCircle, XCircle
} from 'lucide-react'
import { ReconciliationBadge, PlaneBadges } from './reconciliation-badge'

// ============================================================================
// Types - Matches expected backend API structure
// ============================================================================

export interface KeyConfig {
  rotation_enabled: boolean
  key_spec: string  // 'SYMMETRIC_DEFAULT', 'RSA_2048', etc.
  origin: string    // 'AWS_KMS', 'EXTERNAL', 'AWS_CLOUDHSM'
  multi_region: boolean
  grants_count: number
}

export interface KmsKey {
  key_id: string
  key_alias: string
  key_arn: string
  state: 'Enabled' | 'Disabled' | 'PendingDeletion' | 'PendingImport' | 'Unavailable'
  decrypt_ops: number
  encrypt_ops: number
  top_principals: string[]
  resources_using: string[]
  last_used: string | null
  config?: KeyConfig
  planes: PlaneBadges
}

export interface CryptoPrincipal {
  principal_arn: string
  principal_name: string
  principal_type: string
  keys_used: number
  decrypt_ops: number
  encrypt_ops: number
  top_keys: string[]
  planes: PlaneBadges
}

export interface KeyLifecycleEvent {
  timestamp: string
  principal: string
  principal_name?: string
  action: string
  key_alias: string
  key_id?: string
  details?: Record<string, any>
  planes: PlaneBadges
}

export interface CryptoKeysSectionProps {
  keys: KmsKey[]
  principals: CryptoPrincipal[]
  lifecycleEvents: KeyLifecycleEvent[]
  totalDecryptOps: number
  totalEncryptOps: number
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
  const parts = arn.split('/')
  return parts[parts.length - 1] || arn
}

const formatNumber = (n: number): string => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString()
}

const getKeyStateColor = (state: string): string => {
  switch (state) {
    case 'Enabled':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    case 'Disabled':
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
    case 'PendingDeletion':
      return 'bg-rose-500/20 text-rose-400 border-rose-500/30'
    default:
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  }
}

const getActionColor = (action: string): string => {
  const actionLower = action.toLowerCase()
  if (actionLower.includes('delete') || actionLower.includes('disable') || actionLower.includes('schedule')) {
    return 'bg-rose-500/20 text-rose-400 border-rose-500/30'
  }
  if (actionLower.includes('create') || actionLower.includes('enable')) {
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
  }
  if (actionLower.includes('put') || actionLower.includes('update') || actionLower.includes('grant')) {
    return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  }
  return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
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

const KeysTable: React.FC<{ keys: KmsKey[] }> = ({ keys }) => {
  if (keys.length === 0) {
    return (
      <div className="text-slate-500 text-sm text-center py-4">
        No KMS keys data available
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-800/50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Key</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">State</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Decrypt</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Encrypt</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Top Principals</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Last Used</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Planes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {keys.map((key, idx) => (
            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-white text-sm font-medium">{key.key_alias || 'No alias'}</div>
                    <div className="text-xs text-slate-500 font-mono truncate max-w-[150px]">
                      {key.key_id.substring(0, 8)}...
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded text-xs border ${getKeyStateColor(key.state)}`}>
                  {key.state}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-white font-medium">{formatNumber(key.decrypt_ops)}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-white font-medium">{formatNumber(key.encrypt_ops)}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {key.top_principals.slice(0, 2).map((principal, i) => (
                    <span key={i} className="px-2 py-0.5 bg-slate-700/50 text-slate-300 rounded text-xs truncate max-w-[100px]">
                      {extractPrincipalName(principal)}
                    </span>
                  ))}
                  {key.top_principals.length > 2 && (
                    <span className="px-2 py-0.5 bg-slate-700/50 text-slate-500 rounded text-xs">
                      +{key.top_principals.length - 2}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-400 text-sm">{formatTimestamp(key.last_used)}</span>
              </td>
              <td className="px-4 py-3">
                <ReconciliationBadge planes={key.planes} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PrincipalsTable: React.FC<{ principals: CryptoPrincipal[] }> = ({ principals }) => {
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
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Keys</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Decrypt</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Encrypt</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Top Keys</th>
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
                    <div className="text-xs text-slate-500 truncate max-w-[180px]">{principal.principal_arn}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 bg-slate-700/50 text-slate-300 rounded text-xs">
                  {principal.principal_type}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-white font-medium">{principal.keys_used}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-white font-medium">{formatNumber(principal.decrypt_ops)}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-white font-medium">{formatNumber(principal.encrypt_ops)}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {principal.top_keys.slice(0, 2).map((key, i) => (
                    <span key={i} className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs truncate max-w-[100px]">
                      {key}
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

const LifecycleEventsTable: React.FC<{ events: KeyLifecycleEvent[] }> = ({ events }) => {
  if (events.length === 0) {
    return (
      <div className="text-slate-500 text-sm text-center py-4">
        No key lifecycle events detected
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
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Action</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Key</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Details</th>
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
                <span className="text-white text-sm">
                  {event.principal_name || extractPrincipalName(event.principal)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded text-xs border ${getActionColor(event.action)}`}>
                  {event.action}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-white text-sm">{event.key_alias}</span>
              </td>
              <td className="px-4 py-3">
                {event.details && Object.keys(event.details).length > 0 ? (
                  <span className="text-slate-400 text-xs">
                    {Object.entries(event.details).map(([k, v]) => `${k}: ${v}`).join(', ')}
                  </span>
                ) : (
                  <span className="text-slate-600 text-xs">—</span>
                )}
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

export const CryptoKeysSection: React.FC<CryptoKeysSectionProps> = ({
  keys,
  principals,
  lifecycleEvents,
  totalDecryptOps,
  totalEncryptOps,
}) => {
  const hasData = keys.length > 0 || principals.length > 0 || lifecycleEvents.length > 0

  if (!hasData) {
    return (
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-8 text-center">
        <Key className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400 font-medium">No KMS Key Activity</p>
        <p className="text-sm text-slate-500 mt-1">
          KMS events not collected. Ensure CloudTrail is logging KMS API calls.
        </p>
      </div>
    )
  }

  const activeKeys = keys.filter(k => k.state === 'Enabled').length
  const pendingDeletion = keys.filter(k => k.state === 'PendingDeletion').length

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Key className="w-4 h-4" />
            Keys Tracked
          </div>
          <div className="text-2xl font-bold text-white">{keys.length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <CheckCircle className="w-4 h-4" />
            Active Keys
          </div>
          <div className="text-2xl font-bold text-emerald-400">{activeKeys}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Lock className="w-4 h-4" />
            Decrypt Operations
          </div>
          <div className="text-2xl font-bold text-white">{formatNumber(totalDecryptOps)}</div>
        </div>
        <div className={`bg-slate-800/50 border rounded-xl p-4 ${pendingDeletion > 0 ? 'border-rose-500/30' : 'border-slate-700/50'}`}>
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Trash2 className={`w-4 h-4 ${pendingDeletion > 0 ? 'text-rose-400' : ''}`} />
            Pending Deletion
          </div>
          <div className={`text-2xl font-bold ${pendingDeletion > 0 ? 'text-rose-400' : 'text-white'}`}>
            {pendingDeletion}
          </div>
        </div>
      </div>

      {/* Keys Table */}
      {keys.length > 0 && (
        <CollapsibleTable
          title="Key Usage Summary"
          icon={<Key className="w-4 h-4 text-amber-400" />}
          count={keys.length}
        >
          <KeysTable keys={keys} />
        </CollapsibleTable>
      )}

      {/* Principals Table */}
      {principals.length > 0 && (
        <CollapsibleTable
          title="Top Decrypting Principals"
          icon={<Users className="w-4 h-4 text-blue-400" />}
          count={principals.length}
          defaultExpanded={false}
        >
          <PrincipalsTable principals={principals} />
        </CollapsibleTable>
      )}

      {/* Lifecycle Events */}
      {lifecycleEvents.length > 0 && (
        <CollapsibleTable
          title="Key Lifecycle Events"
          icon={<RefreshCw className="w-4 h-4 text-violet-400" />}
          count={lifecycleEvents.length}
          defaultExpanded={false}
        >
          <LifecycleEventsTable events={lifecycleEvents} />
        </CollapsibleTable>
      )}
    </div>
  )
}

export default CryptoKeysSection
