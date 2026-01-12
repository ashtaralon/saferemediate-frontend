'use client'

import React, { useState } from 'react'
import {
  Network, Globe, Server, ChevronDown, ChevronRight,
  ArrowRight, Clock, Activity, Zap
} from 'lucide-react'
import { ReconciliationBadge, PlaneBadges } from './reconciliation-badge'

export interface EdgeFact {
  src_key: string
  src_name: string
  src_type: string
  dst_key: string
  dst_name: string
  dst_type: string
  port: number
  protocol: string
  first_seen: string
  last_seen: string
  hit_count: number
  bytes_total: number
  plane: string
  relationship_type?: string
}

interface ConnectivitySectionProps {
  inboundEdges: EdgeFact[]
  outboundEdges: EdgeFact[]
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const formatTimestamp = (ts: string): string => {
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

const isExternal = (edge: EdgeFact): boolean => {
  const name = edge.dst_name?.toLowerCase() || ''
  const type = edge.dst_type?.toLowerCase() || ''
  // External if it's an IP address or NetworkEndpoint type
  return type === 'networkendpoint' ||
         /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name) ||
         edge.dst_key === 'unknown'
}

const getResourceIcon = (type: string) => {
  const typeLower = type?.toLowerCase() || ''
  if (typeLower.includes('network') || typeLower === 'unknown') {
    return <Globe className="w-4 h-4 text-slate-400" />
  }
  return <Server className="w-4 h-4 text-slate-400" />
}

const EdgeTable: React.FC<{
  edges: EdgeFact[]
  title: string
  icon: React.ReactNode
  showSource?: boolean
  maxRows?: number
}> = ({ edges, title, icon, showSource = true, maxRows = 20 }) => {
  const [expanded, setExpanded] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const displayEdges = showAll ? edges : edges.slice(0, maxRows)

  if (edges.length === 0) {
    return (
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center gap-2 text-slate-500">
          {icon}
          <span>{title}</span>
          <span className="text-slate-600">(No data)</span>
        </div>
      </div>
    )
  }

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
            {edges.length}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                {showSource && (
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                    Source
                  </th>
                )}
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                  Destination
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                  Port/Proto
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">
                  Count
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">
                  Bytes
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                  First Seen
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                  Last Seen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {displayEdges.map((edge, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  {showSource && (
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {getResourceIcon(edge.src_type)}
                        <div>
                          <div className="text-white text-sm truncate max-w-[150px]">
                            {edge.src_name}
                          </div>
                          <div className="text-xs text-slate-500">{edge.src_type}</div>
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {getResourceIcon(edge.dst_type)}
                      <div>
                        <div className="text-white text-sm truncate max-w-[150px]">
                          {edge.dst_name}
                        </div>
                        <div className="text-xs text-slate-500">{edge.dst_type}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-1 bg-slate-700/50 rounded text-sm text-white font-mono">
                      {edge.port}/{edge.protocol}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-white font-medium">
                      {edge.hit_count.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-slate-400 text-sm">
                      {formatBytes(edge.bytes_total)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-slate-400 text-sm">
                      {formatTimestamp(edge.first_seen)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-slate-400 text-sm">
                      {formatTimestamp(edge.last_seen)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {edges.length > maxRows && (
            <div className="px-4 py-3 border-t border-slate-700/50">
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                {showAll ? 'Show less' : `Show all ${edges.length} edges`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const ConnectivitySection: React.FC<ConnectivitySectionProps> = ({
  inboundEdges,
  outboundEdges,
}) => {
  // Separate internal vs external for outbound
  const externalOutbound = outboundEdges.filter(isExternal)
  const internalOutbound = outboundEdges.filter(e => !isExternal(e))

  // Summary stats
  const totalInbound = inboundEdges.length
  const totalOutbound = outboundEdges.length
  const totalBytes = [...inboundEdges, ...outboundEdges].reduce((sum, e) => sum + (e.bytes_total || 0), 0)

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <ArrowRight className="w-4 h-4 rotate-180" />
            Inbound Sources
          </div>
          <div className="text-2xl font-bold text-white">{totalInbound}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <ArrowRight className="w-4 h-4" />
            Outbound Targets
          </div>
          <div className="text-2xl font-bold text-white">{totalOutbound}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Globe className="w-4 h-4" />
            External Destinations
          </div>
          <div className="text-2xl font-bold text-white">{externalOutbound.length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Activity className="w-4 h-4" />
            Total Traffic
          </div>
          <div className="text-2xl font-bold text-white">{formatBytes(totalBytes)}</div>
        </div>
      </div>

      {/* Edge Tables */}
      <EdgeTable
        edges={inboundEdges}
        title="Inbound Connections"
        icon={<ArrowRight className="w-4 h-4 text-blue-400 rotate-180" />}
        showSource={true}
      />

      <EdgeTable
        edges={externalOutbound}
        title="External Outbound"
        icon={<Globe className="w-4 h-4 text-amber-400" />}
        showSource={true}
      />

      {internalOutbound.length > 0 && (
        <EdgeTable
          edges={internalOutbound}
          title="Internal Outbound"
          icon={<Network className="w-4 h-4 text-emerald-400" />}
          showSource={true}
        />
      )}
    </div>
  )
}

export default ConnectivitySection
