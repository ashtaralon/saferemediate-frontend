'use client'

import React, { useState } from 'react'
import {
  Users, Key, Shield, Eye, ChevronDown, ChevronRight,
  Clock, Activity, AlertTriangle
} from 'lucide-react'

export interface Principal {
  arn: string
  name: string
  type: string
  action_count: number
}

export interface ChangeEvent {
  principal: string
  action: string
  resource: string
  timestamp: string
  region?: string
  source_ip?: string
  user_agent?: string
  error_code?: string
}

interface IdentitySectionProps {
  workloadIdentities: Array<{
    resource_key: string
    resource_name: string
    role_arn: string
    role_name: string
  }>
  controlPlaneActors: Array<{
    actor: string
    actor_name: string
    actions: string[]
    action_count: number
  }>
  apiDependencies: Array<{
    service: string
    action: string
    actor: string
    hit_count: number
  }>
  totalRoles: number
  rolesWithUnused: number
  adminRoles: number
}

const formatTimestamp = (ts: string): string => {
  if (!ts) return '—'
  const date = new Date(ts)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getActionColor = (action: string): string => {
  const actionLower = action.toLowerCase()
  if (actionLower.includes('delete') || actionLower.includes('remove') || actionLower.includes('terminate')) {
    return 'text-rose-400 bg-rose-500/10 border-rose-500/30'
  }
  if (actionLower.includes('create') || actionLower.includes('put') || actionLower.includes('attach')) {
    return 'text-amber-400 bg-amber-500/10 border-amber-500/30'
  }
  if (actionLower.includes('authorize') || actionLower.includes('grant') || actionLower.includes('update')) {
    return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
  }
  return 'text-slate-400 bg-slate-700/30 border-slate-600/30'
}

const getServiceIcon = (service: string): string => {
  const icons: Record<string, string> = {
    kms: '🔐',
    s3: '📦',
    iam: '👤',
    ec2: '🖥️',
    rds: '🗄️',
    secretsmanager: '🔑',
    sts: '🎫',
    dynamodb: '📊',
  }
  return icons[service.toLowerCase()] || '☁️'
}

const CollapsibleSection: React.FC<{
  title: string
  icon: React.ReactNode
  count?: number
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
          {count !== undefined && (
            <span className="px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded text-xs">
              {count}
            </span>
          )}
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

export const IdentitySection: React.FC<IdentitySectionProps> = ({
  workloadIdentities,
  controlPlaneActors,
  apiDependencies,
  totalRoles,
  rolesWithUnused,
  adminRoles,
}) => {
  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Shield className="w-4 h-4" />
            Total Roles
          </div>
          <div className="text-2xl font-bold text-white">{totalRoles}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Users className="w-4 h-4" />
            Active Actors
          </div>
          <div className="text-2xl font-bold text-white">{controlPlaneActors.length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Key className="w-4 h-4" />
            Workload Identities
          </div>
          <div className="text-2xl font-bold text-white">{workloadIdentities.length}</div>
        </div>
        <div className={`bg-slate-800/50 border rounded-xl p-4 ${adminRoles > 0 ? 'border-amber-500/30' : 'border-slate-700/50'}`}>
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <AlertTriangle className={`w-4 h-4 ${adminRoles > 0 ? 'text-amber-400' : ''}`} />
            Admin Roles
          </div>
          <div className={`text-2xl font-bold ${adminRoles > 0 ? 'text-amber-400' : 'text-white'}`}>
            {adminRoles}
          </div>
        </div>
      </div>

      {/* Control Plane Actors */}
      <CollapsibleSection
        title="Control Plane Actors"
        icon={<Users className="w-4 h-4 text-blue-400" />}
        count={controlPlaneActors.length}
      >
        {controlPlaneActors.length === 0 ? (
          <div className="text-slate-500 text-sm">No control plane activity recorded</div>
        ) : (
          <div className="space-y-3">
            {controlPlaneActors.slice(0, 10).map((actor, idx) => (
              <div
                key={idx}
                className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{actor.actor_name}</div>
                    <div className="text-xs text-slate-500 truncate">{actor.actor}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-medium">{actor.action_count}</div>
                    <div className="text-xs text-slate-500">actions</div>
                  </div>
                </div>
                {actor.actions && actor.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {actor.actions.slice(0, 5).map((action, i) => (
                      <span
                        key={i}
                        className={`px-2 py-0.5 rounded text-xs border ${getActionColor(action)}`}
                      >
                        {action}
                      </span>
                    ))}
                    {actor.actions.length > 5 && (
                      <span className="px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded text-xs">
                        +{actor.actions.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Workload Identities */}
      <CollapsibleSection
        title="Workload Identities"
        icon={<Key className="w-4 h-4 text-emerald-400" />}
        count={workloadIdentities.length}
        defaultExpanded={false}
      >
        {workloadIdentities.length === 0 ? (
          <div className="text-slate-500 text-sm">No workload identities found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-slate-500 uppercase">
                  <th className="text-left py-2 px-2">Resource</th>
                  <th className="text-left py-2 px-2">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {workloadIdentities.map((wi, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="py-2 px-2">
                      <div className="text-white text-sm">{wi.resource_name}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[200px]">
                        {wi.resource_key}
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <div className="text-white text-sm">{wi.role_name}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[250px]">
                        {wi.role_arn}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* API Dependencies */}
      <CollapsibleSection
        title="API Dependencies"
        icon={<Activity className="w-4 h-4 text-violet-400" />}
        count={apiDependencies.length}
        defaultExpanded={false}
      >
        {apiDependencies.length === 0 ? (
          <div className="text-slate-500 text-sm">No API dependencies tracked</div>
        ) : (
          <div className="grid gap-2">
            {apiDependencies.slice(0, 10).map((dep, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-slate-800/30 border border-slate-700/50 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{getServiceIcon(dep.service)}</span>
                  <div>
                    <div className="text-white text-sm font-medium">
                      {dep.service}:{dep.action}
                    </div>
                    <div className="text-xs text-slate-500 truncate max-w-[200px]">
                      {dep.actor}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white font-medium">{dep.hit_count}</div>
                  <div className="text-xs text-slate-500">calls</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}

export default IdentitySection
