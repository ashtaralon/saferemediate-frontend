'use client'

import React from 'react'
import {
  Activity, Eye, Settings, Shield, CheckCircle, XCircle, AlertCircle
} from 'lucide-react'

interface PlaneStatus {
  present: boolean
  data_points?: number
  gaps_hours?: number
  delay_minutes_p95?: number
  last_recorded_minutes_ago?: number
}

interface CoverageStatus {
  flow_logs: PlaneStatus
  cloudtrail: PlaneStatus
  config: PlaneStatus
  iam: PlaneStatus
}

interface CoverageStripProps {
  coverage: CoverageStatus
}

interface PlaneCardProps {
  name: string
  plane: string
  status: PlaneStatus
  icon: React.ReactNode
  color: string
}

const PlaneCard: React.FC<PlaneCardProps> = ({ name, plane, status, icon, color }) => {
  const getStatusIcon = () => {
    if (!status.present) {
      return <XCircle className="w-5 h-5 text-rose-400" />
    }
    if (status.gaps_hours && status.gaps_hours > 4) {
      return <AlertCircle className="w-5 h-5 text-amber-400" />
    }
    return <CheckCircle className="w-5 h-5 text-emerald-400" />
  }

  const getStatusLabel = () => {
    if (!status.present) return 'No Data'
    if (status.gaps_hours && status.gaps_hours > 4) return 'Gaps Detected'
    return 'Active'
  }

  const colorStyles: Record<string, string> = {
    emerald: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    violet: 'from-violet-500/20 to-violet-600/10 border-violet-500/30',
    amber: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
  }

  const iconColors: Record<string, string> = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    violet: 'text-violet-400',
    amber: 'text-amber-400',
  }

  return (
    <div className={`bg-gradient-to-br ${colorStyles[color]} border rounded-xl p-4 flex-1 min-w-[200px]`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={iconColors[color]}>{icon}</div>
          <span className="text-sm font-medium text-white">{name}</span>
        </div>
        {getStatusIcon()}
      </div>

      <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">
        {plane} Plane
      </div>

      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${
          status.present ? 'text-emerald-400' : 'text-rose-400'
        }`}>
          {getStatusLabel()}
        </span>
      </div>

      {/* Details */}
      <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-1 text-xs text-slate-400">
        {status.data_points !== undefined && (
          <div className="flex justify-between">
            <span>Data points</span>
            <span className="text-white font-medium">{status.data_points.toLocaleString()}</span>
          </div>
        )}
        {status.gaps_hours !== undefined && status.gaps_hours > 0 && (
          <div className="flex justify-between">
            <span>Gaps</span>
            <span className="text-amber-400 font-medium">{status.gaps_hours}h</span>
          </div>
        )}
        {status.delay_minutes_p95 !== undefined && (
          <div className="flex justify-between">
            <span>Delay (p95)</span>
            <span className="text-white font-medium">{status.delay_minutes_p95}m</span>
          </div>
        )}
        {status.last_recorded_minutes_ago !== undefined && (
          <div className="flex justify-between">
            <span>Last seen</span>
            <span className="text-white font-medium">{status.last_recorded_minutes_ago}m ago</span>
          </div>
        )}
      </div>
    </div>
  )
}

export const CoverageStrip: React.FC<CoverageStripProps> = ({ coverage }) => {
  // Calculate overall coverage
  const planes = [
    coverage.flow_logs,
    coverage.cloudtrail,
    coverage.config,
    coverage.iam,
  ]
  const presentCount = planes.filter(p => p.present).length
  const coveragePercent = Math.round((presentCount / planes.length) * 100)

  return (
    <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Data Plane Coverage</h2>
          <p className="text-sm text-slate-400">
            {presentCount} of 4 planes active ({coveragePercent}% coverage)
          </p>
        </div>
        <div className={`px-4 py-2 rounded-lg font-bold text-lg ${
          coveragePercent === 100 ? 'bg-emerald-500/20 text-emerald-400' :
          coveragePercent >= 75 ? 'bg-blue-500/20 text-blue-400' :
          coveragePercent >= 50 ? 'bg-amber-500/20 text-amber-400' :
          'bg-rose-500/20 text-rose-400'
        }`}>
          {coveragePercent}%
        </div>
      </div>

      {/* Plane Cards */}
      <div className="flex gap-4 flex-wrap">
        <PlaneCard
          name="VPC Flow Logs"
          plane="Observed"
          status={coverage.flow_logs}
          icon={<Activity className="w-5 h-5" />}
          color="emerald"
        />
        <PlaneCard
          name="CloudTrail"
          plane="Changed"
          status={coverage.cloudtrail}
          icon={<Eye className="w-5 h-5" />}
          color="blue"
        />
        <PlaneCard
          name="AWS Config"
          plane="Configured"
          status={coverage.config}
          icon={<Settings className="w-5 h-5" />}
          color="violet"
        />
        <PlaneCard
          name="IAM"
          plane="Authorized"
          status={coverage.iam}
          icon={<Shield className="w-5 h-5" />}
          color="amber"
        />
      </div>

      {/* Coverage Bar */}
      <div className="mt-6">
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: coverage.flow_logs.present ? '25%' : '0%' }}
          />
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: coverage.cloudtrail.present ? '25%' : '0%' }}
          />
          <div
            className="h-full bg-violet-500 transition-all duration-500"
            style={{ width: coverage.config.present ? '25%' : '0%' }}
          />
          <div
            className="h-full bg-amber-500 transition-all duration-500"
            style={{ width: coverage.iam.present ? '25%' : '0%' }}
          />
        </div>
        <div className="flex mt-2 text-xs">
          <div className="flex-1 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-400">Flow Logs</span>
          </div>
          <div className="flex-1 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-slate-400">CloudTrail</span>
          </div>
          <div className="flex-1 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-slate-400">Config</span>
          </div>
          <div className="flex-1 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-slate-400">IAM</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CoverageStrip
