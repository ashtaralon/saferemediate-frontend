'use client'

import React, { useState } from 'react'
import {
  Network, ChevronRight, CheckCircle, XCircle, AlertTriangle,
  Eye, Settings, Database, Globe, Server, Shield
} from 'lucide-react'

interface CriticalPath {
  src_key: string
  src_name: string
  dst_key: string
  dst_name: string
  path: string[]
  port: number
  protocol: string
  observed: boolean
  configured_possible: boolean
  confidence: string
  risk_flags: string[]
}

interface CriticalPathsTableProps {
  paths: CriticalPath[]
}

const getResourceIcon = (key: string) => {
  const keyLower = key.toLowerCase()
  if (keyLower.includes('rds') || keyLower.includes('dynamodb') || keyLower.includes('database')) {
    return <Database className="w-4 h-4" />
  }
  if (keyLower.includes('internet') || keyLower.includes('igw') || keyLower.includes('0.0.0.0')) {
    return <Globe className="w-4 h-4" />
  }
  if (keyLower.includes('s3') || keyLower.includes('bucket')) {
    return <Server className="w-4 h-4" />
  }
  if (keyLower.includes('sg-') || keyLower.includes('security')) {
    return <Shield className="w-4 h-4" />
  }
  return <Network className="w-4 h-4" />
}

const RiskFlagBadge: React.FC<{ flag: string }> = ({ flag }) => {
  const flagColors: Record<string, string> = {
    database_access: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    no_iam_auth: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    internet_exposed: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    cross_account: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    sensitive_data: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    admin_access: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    write_access: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    default: 'bg-slate-600/50 text-slate-400 border-slate-500/30',
  }

  const color = flagColors[flag] || flagColors.default

  return (
    <span className={`px-2 py-0.5 rounded text-xs border ${color}`}>
      {flag.replace(/_/g, ' ')}
    </span>
  )
}

const PathRow: React.FC<{ path: CriticalPath; isExpanded: boolean; onToggle: () => void }> = ({
  path,
  isExpanded,
  onToggle,
}) => {
  const getConfidenceColor = () => {
    switch (path.confidence.toUpperCase()) {
      case 'HIGH':
        return 'text-emerald-400'
      case 'MEDIUM':
        return 'text-amber-400'
      case 'LOW':
        return 'text-rose-400'
      default:
        return 'text-slate-400'
    }
  }

  return (
    <>
      <tr
        className="hover:bg-slate-800/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        {/* Source */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="text-slate-500">{getResourceIcon(path.src_key)}</div>
            <div>
              <div className="text-white font-medium text-sm">{path.src_name}</div>
              <div className="text-xs text-slate-500 truncate max-w-[150px]">{path.src_key}</div>
            </div>
          </div>
        </td>

        {/* Arrow */}
        <td className="px-2 py-3">
          <div className="flex items-center text-slate-600">
            <div className="h-px w-4 bg-slate-600" />
            <ChevronRight className="w-4 h-4" />
            <div className="h-px w-4 bg-slate-600" />
          </div>
        </td>

        {/* Destination */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="text-slate-500">{getResourceIcon(path.dst_key)}</div>
            <div>
              <div className="text-white font-medium text-sm">{path.dst_name}</div>
              <div className="text-xs text-slate-500 truncate max-w-[150px]">{path.dst_key}</div>
            </div>
          </div>
        </td>

        {/* Port/Protocol */}
        <td className="px-4 py-3">
          <span className="px-2 py-1 bg-slate-700/50 rounded text-sm text-white font-mono">
            {path.port}/{path.protocol}
          </span>
        </td>

        {/* Observed */}
        <td className="px-4 py-3 text-center">
          {path.observed ? (
            <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto" />
          ) : (
            <XCircle className="w-5 h-5 text-slate-600 mx-auto" />
          )}
        </td>

        {/* Configured */}
        <td className="px-4 py-3 text-center">
          {path.configured_possible ? (
            <CheckCircle className="w-5 h-5 text-blue-400 mx-auto" />
          ) : (
            <XCircle className="w-5 h-5 text-slate-600 mx-auto" />
          )}
        </td>

        {/* Confidence */}
        <td className="px-4 py-3">
          <span className={`font-medium ${getConfidenceColor()}`}>
            {path.confidence}
          </span>
        </td>

        {/* Risk Flags */}
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {path.risk_flags.slice(0, 2).map((flag, idx) => (
              <RiskFlagBadge key={idx} flag={flag} />
            ))}
            {path.risk_flags.length > 2 && (
              <span className="px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded text-xs">
                +{path.risk_flags.length - 2}
              </span>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded Details */}
      {isExpanded && (
        <tr className="bg-slate-800/30">
          <td colSpan={8} className="px-4 py-4">
            <div className="space-y-4">
              {/* Full Path */}
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                  Full Path
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {path.path.map((node, idx) => (
                    <React.Fragment key={idx}>
                      <span className="px-3 py-1.5 bg-slate-700/50 rounded-lg text-sm text-white font-mono">
                        {node}
                      </span>
                      {idx < path.path.length - 1 && (
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* All Risk Flags */}
              {path.risk_flags.length > 0 && (
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                    Risk Flags
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {path.risk_flags.map((flag, idx) => (
                      <RiskFlagBadge key={idx} flag={flag} />
                    ))}
                  </div>
                </div>
              )}

              {/* Status Summary */}
              <div className="flex gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Eye className={`w-4 h-4 ${path.observed ? 'text-emerald-400' : 'text-slate-600'}`} />
                  <span className="text-slate-400">
                    {path.observed ? 'Traffic observed in flow logs' : 'No observed traffic'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Settings className={`w-4 h-4 ${path.configured_possible ? 'text-blue-400' : 'text-slate-600'}`} />
                  <span className="text-slate-400">
                    {path.configured_possible ? 'Allowed by security groups' : 'Blocked by configuration'}
                  </span>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export const CriticalPathsTable: React.FC<CriticalPathsTableProps> = ({ paths }) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<number>>(new Set())

  const togglePath = (idx: number) => {
    const next = new Set(expandedPaths)
    if (next.has(idx)) {
      next.delete(idx)
    } else {
      next.add(idx)
    }
    setExpandedPaths(next)
  }

  if (paths.length === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-8 text-center">
        <Network className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">No critical paths detected</p>
        <p className="text-sm text-slate-500 mt-1">
          No paths from internet to sensitive resources found
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Source
              </th>
              <th className="px-2 py-3" />
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Destination
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Port
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1">
                  <Eye className="w-3 h-3" />
                  Observed
                </div>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1">
                  <Settings className="w-3 h-3" />
                  Configured
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Confidence
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Risk Flags
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {paths.map((path, idx) => (
              <PathRow
                key={idx}
                path={path}
                isExpanded={expandedPaths.has(idx)}
                onToggle={() => togglePath(idx)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default CriticalPathsTable
