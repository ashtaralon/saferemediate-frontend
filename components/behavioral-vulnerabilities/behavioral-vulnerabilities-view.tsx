'use client'

import React, { useState, useEffect } from 'react'
import {
  Bug, Shield, AlertTriangle, ChevronDown, ChevronRight,
  Activity, Eye, Settings, Clock, Search, Loader2,
  ArrowRight, Globe, Server, Database, RefreshCw
} from 'lucide-react'
import { ReconciliationBadge, type PlaneBadges } from '../behavioral-intelligence/reconciliation-badge'
import type {
  BehavioralVulnerability,
  BehavioralVulnerabilitiesResponse,
  EvidenceItem,
} from './types'


// =============================================================================
// CONSTANTS
// =============================================================================

const TIER_CONFIG: Record<number, { label: string; color: string; bg: string; border: string; badge: string; pulseClass?: string }> = {
  1: {
    label: 'Under Fire',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    badge: 'bg-rose-500/20 text-rose-400',
    pulseClass: 'animate-pulse',
  },
  2: {
    label: 'Exposed & Drifting',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    badge: 'bg-orange-500/20 text-orange-400',
  },
  3: {
    label: 'Exposed, Stable',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-400',
  },
  4: {
    label: 'Shielded',
    color: 'text-slate-400',
    bg: 'bg-slate-800/30',
    border: 'border-slate-700/50',
    badge: 'bg-slate-600/50 text-slate-400',
  },
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-rose-500/20 text-rose-400',
  HIGH: 'bg-orange-500/20 text-orange-400',
  MEDIUM: 'bg-amber-500/20 text-amber-400',
  LOW: 'bg-blue-500/20 text-blue-400',
}


// =============================================================================
// HELPERS
// =============================================================================

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

const getDstTypeIcon = (type: string) => {
  const t = type.toLowerCase()
  if (t.includes('rds') || t.includes('aurora') || t.includes('dynamo')) return <Database className="w-3 h-3" />
  if (t.includes('s3')) return <Database className="w-3 h-3" />
  return <Server className="w-3 h-3" />
}

function getScoreColor(score: number): string {
  if (score >= 75) return 'text-rose-400'
  if (score >= 50) return 'text-orange-400'
  if (score >= 25) return 'text-amber-400'
  return 'text-emerald-400'
}

function getScoreBg(score: number): string {
  if (score >= 75) return 'bg-rose-500/20'
  if (score >= 50) return 'bg-orange-500/20'
  if (score >= 25) return 'bg-amber-500/20'
  return 'bg-emerald-500/20'
}


// =============================================================================
// VULN CARD
// =============================================================================

const VulnCard: React.FC<{
  vuln: BehavioralVulnerability
  isExpanded: boolean
  onToggle: () => void
}> = ({ vuln, isExpanded, onToggle }) => {
  const tierConfig = TIER_CONFIG[vuln.tier]

  return (
    <div className={`${tierConfig.bg} border ${tierConfig.border} rounded-xl overflow-hidden transition-all`}>
      {/* Collapsed header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 text-left hover:bg-slate-800/20 transition-colors"
      >
        {/* Top row: tier badge + scores */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${tierConfig.badge} ${tierConfig.pulseClass || ''}`}>
              {tierConfig.label}
            </span>
            {vuln.cve_count > 0 && (
              <span className="text-xs text-slate-500">
                {vuln.cve_count} CVE{vuln.cve_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-2 py-0.5 rounded text-xs font-bold ${getScoreBg(vuln.behavioral_score)} ${getScoreColor(vuln.behavioral_score)}`}>
              {vuln.behavioral_score}
            </div>
            {vuln.cvss_score > 0 && (
              <span className="text-xs text-slate-500">
                CVSS {vuln.cvss_score.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        {/* Sentence — the main content */}
        <p className="text-sm font-medium text-white leading-snug mb-2">
          {vuln.sentence}
        </p>

        {/* Bottom row: planes + chevron */}
        <div className="flex items-center justify-between">
          <ReconciliationBadge planes={vuln.planes} compact />
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-700/30">

          {/* Evidence Chain */}
          {vuln.evidence.length > 0 && (
            <div className="pt-3">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                Evidence Chain
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg divide-y divide-slate-700/50">
                {vuln.evidence.map((row, idx) => (
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

          {/* What Changed */}
          {(vuln.drift_items.length > 0 || vuln.anomalies.length > 0) && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                What Changed
              </div>
              <div className="space-y-2">
                {vuln.drift_items.map((d, idx) => (
                  <div key={`drift-${idx}`} className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Eye className="w-3 h-3 text-blue-400" />
                      <span className="text-sm text-blue-300">{d.description}</span>
                    </div>
                  </div>
                ))}
                {vuln.anomalies.map((a, idx) => (
                  <div key={`anom-${idx}`} className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-orange-400" />
                      <span className="text-sm text-orange-300">{a.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top CVEs */}
          {vuln.top_cves.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                Top CVEs
              </div>
              <div className="space-y-1">
                {vuln.top_cves.map((cve) => (
                  <div key={cve.cve_id} className="flex items-center gap-2 text-sm">
                    <Bug className="w-3 h-3 text-slate-400" />
                    <span className="font-mono text-white">{cve.cve_id}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[cve.severity] || SEVERITY_COLORS.MEDIUM}`}>
                      {cve.severity}
                    </span>
                    <span className="text-slate-500">CVSS {cve.cvss_score.toFixed(1)}</span>
                    {cve.exploit_available && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-rose-500/20 text-rose-400">
                        EXPLOIT
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Blast Radius */}
          {vuln.blast_radius.affected_count > 0 && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                Blast Radius
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-white font-medium">
                  {vuln.blast_radius.affected_count} resource{vuln.blast_radius.affected_count !== 1 ? 's' : ''}
                </span>
                {vuln.blast_radius.has_production && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-rose-500/20 text-rose-400">
                    PRODUCTION
                  </span>
                )}
                {vuln.blast_radius.affected_types.length > 0 && (
                  <span className="text-slate-400">
                    {vuln.blast_radius.affected_types.join(', ')}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Critical Paths */}
          {vuln.critical_paths.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                Critical Paths
              </div>
              <div className="space-y-2">
                {vuln.critical_paths.map((path, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm bg-slate-800/50 rounded-lg px-3 py-2">
                    <Globe className="w-3 h-3 text-slate-400" />
                    <span className="text-white">{path.src_name}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <span className="text-white">:{vuln.port}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    {getDstTypeIcon(path.dst_type)}
                    <span className="text-white">{path.dst_name}</span>
                    {path.observed && (
                      <span className="ml-auto px-1.5 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400">
                        observed
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score Breakdown */}
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
              Score Breakdown
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Traffic', value: vuln.score_breakdown.traffic, max: 35 },
                { label: 'CVE', value: vuln.score_breakdown.cve, max: 25 },
                { label: 'Drift', value: vuln.score_breakdown.drift, max: 20 },
                { label: 'Blast', value: vuln.score_breakdown.blast_radius, max: 20 },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className="text-xs text-slate-500 mb-1">{item.label}</div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${(item.value / item.max) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-white mt-0.5">{item.value}/{item.max}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Data Plane Confirmation (full) */}
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
              Data Plane Confirmation
            </div>
            <ReconciliationBadge planes={vuln.planes} />
          </div>
        </div>
      )}
    </div>
  )
}


// =============================================================================
// MAIN VIEW
// =============================================================================

interface BehavioralVulnerabilitiesViewProps {
  systemName?: string | null
}

export function BehavioralVulnerabilitiesView({ systemName }: BehavioralVulnerabilitiesViewProps) {
  const [data, setData] = useState<BehavioralVulnerabilitiesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [tierFilter, setTierFilter] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const sysName = systemName
      const res = await fetch(`/api/proxy/vulnerability/behavioral-ranked?system_name=${encodeURIComponent(sysName)}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`)
      }
      const json: BehavioralVulnerabilitiesResponse = await res.json()
      setData(json)

      // Auto-expand first Tier 1 item
      if (json.vulnerabilities.length > 0) {
        const firstTier1 = json.vulnerabilities.find(v => v.tier === 1)
        if (firstTier1) {
          setExpandedItems(new Set([firstTier1.id]))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [systemName])

  const toggleItem = (id: string) => {
    const next = new Set(expandedItems)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedItems(next)
  }

  // Filter vulnerabilities
  const filtered = (data?.vulnerabilities || []).filter(v => {
    if (tierFilter !== null && v.tier !== tierFilter) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return (
        v.service_name.toLowerCase().includes(term) ||
        v.sentence.toLowerCase().includes(term) ||
        String(v.port).includes(term) ||
        v.sg_name.toLowerCase().includes(term) ||
        v.top_cves.some(c => c.cve_id.toLowerCase().includes(term))
      )
    }
    return true
  })

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <span className="ml-3 text-slate-400">Analyzing behavioral signals...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
        <p className="text-rose-400 font-medium">Failed to load vulnerabilities</p>
        <p className="text-sm text-slate-400 mt-1">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-600 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  // Empty state
  if (!data || data.total === 0) {
    return (
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-8 text-center">
        <Shield className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
        <p className="text-emerald-400 font-medium">No Vulnerabilities Detected</p>
        <p className="text-sm text-slate-500 mt-1">
          No vulnerable ports found for this system
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Vulnerabilities
            <span className="text-sm font-normal text-slate-400">({data.total})</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Ranked by behavioral evidence, not just CVSS</p>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tier filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTierFilter(null)}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            tierFilter === null
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700/50 text-slate-400 hover:text-white'
          }`}
        >
          All ({data.total})
        </button>
        {([1, 2, 3, 4] as const).map(tier => {
          const count = data.by_tier[tier] || 0
          if (count === 0) return null
          const config = TIER_CONFIG[tier]
          return (
            <button
              key={tier}
              onClick={() => setTierFilter(tierFilter === tier ? null : tier)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                tierFilter === tier
                  ? `${config.badge} font-medium`
                  : 'bg-slate-700/50 text-slate-400 hover:text-white'
              }`}
            >
              {config.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search by port, service, CVE..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
        />
      </div>

      {/* Vulnerability cards */}
      <div className="space-y-3">
        {filtered.map(vuln => (
          <VulnCard
            key={vuln.id}
            vuln={vuln}
            isExpanded={expandedItems.has(vuln.id)}
            onToggle={() => toggleItem(vuln.id)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm">
          No vulnerabilities match your filter
        </div>
      )}
    </div>
  )
}

export default BehavioralVulnerabilitiesView
