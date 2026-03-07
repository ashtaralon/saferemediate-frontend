"use client"

import React, { useState, useEffect, useMemo } from 'react'
import {
  Shield, AlertTriangle, RefreshCw, Search, Globe, Network, Server,
  ShieldAlert, ShieldCheck, Play, ExternalLink, Lock, Unlock, Activity,
  Clock, TrendingUp, TrendingDown, Zap, Target, CheckCircle2, XCircle,
  ArrowRight, Eye, Ban, AlertCircle, Info, ChevronDown, ChevronUp
} from 'lucide-react'

interface PortTraffic {
  bytes: number
  packets: number
  unique_sources: number
  last_seen?: string
  days_observed: number
}

interface CVEInfo {
  cve_id: string
  cvss_score: number
  severity: string
  exploit_available: boolean
  description: string
}

interface AffectedResource {
  name: string
  type: string
  id: string
}

interface SGRule {
  sg_id: string
  sg_name: string
  source: string
  is_public: boolean
}

interface RiskyPort {
  port: number
  protocol: string
  service: string
  // Risk info
  cve_count: number
  critical_cves: number
  highest_cvss: number
  exploits_available: boolean
  cves: CVEInfo[]
  // Traffic info
  traffic: PortTraffic
  classification: 'USED' | 'UNUSED' | 'LOW_USAGE' | 'OVERLY_BROAD'
  recommendation: 'BLOCK' | 'RESTRICT' | 'TIGHTEN' | 'KEEP'
  recommendation_reason: string
  // Exposure info
  is_public: boolean
  sg_rules: SGRule[]
  affected_resources: AffectedResource[]
}

interface SimulationResult {
  port: number
  can_remediate: boolean
  confidence: number
  reason: string
  traffic_summary: {
    total_bytes: number
    total_packets: number
    last_activity: string | null
    days_since_activity: number
    sources: number
  }
  impact: {
    affected_resources: number
    affected_sgs: number
    will_break_connections: boolean
  }
  recommendation: 'SAFE_TO_BLOCK' | 'BLOCK_WITH_CAUTION' | 'DO_NOT_BLOCK' | 'RESTRICT_INSTEAD'
  action_items: string[]
}

// Port to service mapping
const PORT_SERVICE_MAP: Record<number, string> = {
  22: 'SSH', 80: 'HTTP', 443: 'HTTPS', 3306: 'MySQL', 5432: 'PostgreSQL',
  6379: 'Redis', 27017: 'MongoDB', 8080: 'Tomcat', 8443: 'HTTPS-Alt',
  9200: 'Elasticsearch', 3389: 'RDP', 21: 'FTP', 25: 'SMTP', 53: 'DNS',
  110: 'POP3', 143: 'IMAP', 389: 'LDAP', 636: 'LDAPS', 1433: 'MSSQL',
  1521: 'Oracle', 5900: 'VNC', 11211: 'Memcached', 9092: 'Kafka', 5672: 'RabbitMQ'
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatTimeAgo = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMins = Math.floor(diffMs / (1000 * 60))

  if (diffDays > 30) return `${Math.floor(diffDays / 30)} months ago`
  if (diffDays > 0) return `${diffDays} days ago`
  if (diffHours > 0) return `${diffHours} hours ago`
  if (diffMins > 0) return `${diffMins} mins ago`
  return 'Just now'
}

export function RiskyPortsDashboard() {
  const [ports, setPorts] = useState<RiskyPort[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRisk, setFilterRisk] = useState<'all' | 'critical' | 'high' | 'medium'>('all')
  const [filterTraffic, setFilterTraffic] = useState<'all' | 'unused' | 'used'>('all')
  const [expandedPort, setExpandedPort] = useState<number | null>(null)
  const [simulating, setSimulating] = useState<number | null>(null)
  const [simulationResults, setSimulationResults] = useState<Record<number, SimulationResult>>({})
  const [runningBulkSimulation, setRunningBulkSimulation] = useState(false)

  useEffect(() => {
    fetchRiskyPorts()
  }, [])

  const fetchRiskyPorts = async () => {
    setLoading(true)
    setError(null)

    try {
      // Get all security groups
      const sgRes = await fetch('/api/proxy/infrastructure/security-groups?source=aws')
      if (!sgRes.ok) throw new Error('Failed to fetch security groups')
      const sgs = await sgRes.json()

      const portMap = new Map<number, RiskyPort>()

      // For each SG, get exposure data
      for (const sg of sgs) {
        try {
          const [exposureRes, analysisRes] = await Promise.all([
            fetch(`/api/proxy/vulnerability/sg/${sg.id}/exposure?source=aws`),
            fetch(`/api/proxy/sg-least-privilege/${sg.id}/analysis?source=aws`)
          ])

          let exposure = null
          let analysis = null

          if (exposureRes.ok) {
            exposure = await exposureRes.json()
          }
          if (analysisRes.ok) {
            analysis = await analysisRes.json()
          }

          // Process rules exposure
          if (exposure?.rules_exposure) {
            for (const rule of exposure.rules_exposure) {
              const port = rule.port
              if (!port) continue

              const vulnExposure = rule.vulnerability_exposure || {}
              // Find traffic info from analysis rules (not port_analysis)
              const analysisRule = analysis?.rules?.find((r: any) => r.from_port === port || r.to_port === port)
              const trafficInfo = analysisRule ? {
                traffic: {
                  bytes: analysisRule.traffic?.connection_count || 0, // Use connection_count as proxy for bytes
                  packets: analysisRule.traffic?.connection_count || 0,
                  unique_sources: analysisRule.traffic?.unique_sources || 0,
                  last_seen: null, // Not available in current API
                  days_observed: 90
                },
                classification: analysisRule.status || 'UNUSED',
                recommendation: analysisRule.recommendation?.action === 'DELETE' ? 'BLOCK' : 'KEEP',
                recommendation_reason: analysisRule.recommendation?.reason || 'No data'
              } : null

              const existing = portMap.get(port)

              // Merge CVEs from this rule
              const newCves: CVEInfo[] = []
              for (const cve of [...(vulnExposure.critical_cves || []), ...(vulnExposure.high_cves || []), ...(vulnExposure.medium_cves || [])]) {
                if (!existing?.cves.find(c => c.cve_id === cve.cve_id)) {
                  newCves.push({
                    cve_id: cve.cve_id,
                    cvss_score: cve.cvss_score,
                    severity: cve.severity,
                    exploit_available: cve.exploit_available,
                    description: cve.description
                  })
                }
              }

              if (existing) {
                // Merge with existing port entry
                existing.cves = [...existing.cves, ...newCves]
                existing.cve_count = existing.cves.length
                existing.critical_cves = existing.cves.filter(c => c.severity === 'CRITICAL').length
                existing.highest_cvss = Math.max(existing.highest_cvss, vulnExposure.highest_cvss || 0)
                existing.exploits_available = existing.exploits_available || vulnExposure.exploits_available
                existing.is_public = existing.is_public || rule.is_public

                // Add SG rule
                if (!existing.sg_rules.find(r => r.sg_id === sg.id)) {
                  existing.sg_rules.push({
                    sg_id: sg.id,
                    sg_name: sg.name,
                    source: rule.source,
                    is_public: rule.is_public
                  })
                }

                // Merge affected resources
                for (const res of exposure.affected_resources || []) {
                  if (!existing.affected_resources.find(r => r.id === res.id)) {
                    existing.affected_resources.push(res)
                  }
                }

                // Update traffic info if better data available
                if (trafficInfo) {
                  existing.traffic = {
                    bytes: Math.max(existing.traffic.bytes, trafficInfo.traffic?.bytes || 0),
                    packets: Math.max(existing.traffic.packets, trafficInfo.traffic?.packets || 0),
                    unique_sources: Math.max(existing.traffic.unique_sources, trafficInfo.traffic?.unique_sources || 0),
                    last_seen: trafficInfo.traffic?.last_seen || existing.traffic.last_seen,
                    days_observed: Math.max(existing.traffic.days_observed, trafficInfo.traffic?.days_observed || 0)
                  }
                  existing.classification = trafficInfo.classification || existing.classification
                  existing.recommendation = trafficInfo.recommendation || existing.recommendation
                  existing.recommendation_reason = trafficInfo.recommendation_reason || existing.recommendation_reason
                }
              } else {
                // Create new port entry
                portMap.set(port, {
                  port,
                  protocol: rule.protocol || 'tcp',
                  service: vulnExposure.service?.name || PORT_SERVICE_MAP[port] || `Port ${port}`,
                  cve_count: newCves.length,
                  critical_cves: newCves.filter(c => c.severity === 'CRITICAL').length,
                  highest_cvss: vulnExposure.highest_cvss || 0,
                  exploits_available: vulnExposure.exploits_available || false,
                  cves: newCves,
                  traffic: {
                    bytes: trafficInfo?.traffic?.bytes || 0,
                    packets: trafficInfo?.traffic?.packets || 0,
                    unique_sources: trafficInfo?.traffic?.unique_sources || 0,
                    last_seen: trafficInfo?.traffic?.last_seen,
                    days_observed: trafficInfo?.traffic?.days_observed || 0
                  },
                  classification: trafficInfo?.classification || 'UNUSED',
                  recommendation: trafficInfo?.recommendation || 'BLOCK',
                  recommendation_reason: trafficInfo?.recommendation_reason || 'No traffic observed',
                  is_public: rule.is_public,
                  sg_rules: [{
                    sg_id: sg.id,
                    sg_name: sg.name,
                    source: rule.source,
                    is_public: rule.is_public
                  }],
                  affected_resources: exposure.affected_resources || []
                })
              }
            }
          }
        } catch (err) {
          console.error(`Failed to fetch data for SG ${sg.id}:`, err)
        }
      }

      // Sort by risk (highest CVSS first, then by CVE count)
      const sortedPorts = Array.from(portMap.values()).sort((a, b) => {
        if (b.highest_cvss !== a.highest_cvss) return b.highest_cvss - a.highest_cvss
        return b.cve_count - a.cve_count
      })

      setPorts(sortedPorts)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const runSimulation = async (port: RiskyPort) => {
    setSimulating(port.port)

    try {
      // Get the first SG rule to run simulation
      const rule = port.sg_rules[0]
      if (!rule) throw new Error('No security group rule found')

      const response = await fetch(`/api/proxy/sg-least-privilege/${rule.sg_id}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: [{
            rule_id: `${rule.sg_id}-in-${port.protocol}-${port.port}-${rule.source}`,
            direction: 'inbound',
            protocol: port.protocol,
            from_port: port.port,
            to_port: port.port,
            source: rule.source,
            action: 'DELETE'
          }],
          create_snapshot: true,
          dry_run: true
        })
      })

      const simData = await response.json()

      // Build simulation result
      const trafficBytes = port.traffic.bytes
      const hasTraffic = trafficBytes > 0
      const isOld = port.traffic.days_observed > 30
      const daysSinceActivity = port.traffic.last_seen
        ? Math.floor((Date.now() - new Date(port.traffic.last_seen).getTime()) / (1000 * 60 * 60 * 24))
        : 999

      let recommendation: SimulationResult['recommendation']
      let confidence: number
      let reason: string
      let actionItems: string[] = []

      if (!hasTraffic) {
        recommendation = 'SAFE_TO_BLOCK'
        confidence = 95
        reason = 'No traffic observed on this port. Safe to block without service disruption.'
        actionItems = [
          'Create snapshot before blocking',
          'Block the port',
          'Monitor for 24h for any issues',
          'Remove snapshot after confirmation'
        ]
      } else if (daysSinceActivity > 30) {
        recommendation = 'SAFE_TO_BLOCK'
        confidence = 85
        reason = `Last activity was ${daysSinceActivity} days ago. Port appears dormant and safe to block.`
        actionItems = [
          'Verify with application team',
          'Create snapshot',
          'Block during maintenance window',
          'Keep snapshot for 7 days'
        ]
      } else if (trafficBytes < 1000000 && port.traffic.unique_sources < 5) {
        recommendation = 'BLOCK_WITH_CAUTION'
        confidence = 70
        reason = `Low traffic (${formatBytes(trafficBytes)}) from ${port.traffic.unique_sources} sources. Consider blocking with monitoring.`
        actionItems = [
          'Alert application owners',
          'Create snapshot',
          'Block during low-usage period',
          'Monitor closely for 48h'
        ]
      } else if (port.is_public && port.highest_cvss >= 9.0) {
        recommendation = 'RESTRICT_INSTEAD'
        confidence = 80
        reason = `High traffic but CRITICAL vulnerabilities (CVSS ${port.highest_cvss}). Restrict to known IPs instead of full block.`
        actionItems = [
          'Identify legitimate source IPs',
          'Replace 0.0.0.0/0 with specific CIDRs',
          'Apply patches urgently',
          'Consider WAF/firewall rules'
        ]
      } else {
        recommendation = 'DO_NOT_BLOCK'
        confidence = 90
        reason = `Active traffic (${formatBytes(trafficBytes)}) with ${port.traffic.unique_sources} unique sources. Blocking will disrupt services.`
        actionItems = [
          'Apply software patches instead',
          'Implement network segmentation',
          'Add monitoring/alerting',
          'Schedule maintenance window for patching'
        ]
      }

      const result: SimulationResult = {
        port: port.port,
        can_remediate: recommendation === 'SAFE_TO_BLOCK' || recommendation === 'BLOCK_WITH_CAUTION',
        confidence,
        reason,
        traffic_summary: {
          total_bytes: trafficBytes,
          total_packets: port.traffic.packets,
          last_activity: port.traffic.last_seen || null,
          days_since_activity: daysSinceActivity,
          sources: port.traffic.unique_sources
        },
        impact: {
          affected_resources: port.affected_resources.length,
          affected_sgs: port.sg_rules.length,
          will_break_connections: hasTraffic && daysSinceActivity < 7
        },
        recommendation,
        action_items: actionItems
      }

      setSimulationResults(prev => ({ ...prev, [port.port]: result }))
    } catch (err: any) {
      console.error('Simulation failed:', err)
    } finally {
      setSimulating(null)
    }
  }

  const runBulkSimulation = async () => {
    setRunningBulkSimulation(true)
    for (const port of filteredPorts) {
      if (!simulationResults[port.port]) {
        await runSimulation(port)
      }
    }
    setRunningBulkSimulation(false)
  }

  // Filter ports
  const filteredPorts = useMemo(() => {
    return ports.filter(port => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        if (!port.service.toLowerCase().includes(search) &&
            !port.port.toString().includes(search)) {
          return false
        }
      }

      // Risk filter
      if (filterRisk === 'critical' && port.highest_cvss < 9.0) return false
      if (filterRisk === 'high' && port.highest_cvss < 7.0) return false
      if (filterRisk === 'medium' && port.highest_cvss < 4.0) return false

      // Traffic filter
      if (filterTraffic === 'unused' && port.traffic.bytes > 0) return false
      if (filterTraffic === 'used' && port.traffic.bytes === 0) return false

      return true
    })
  }, [ports, searchTerm, filterRisk, filterTraffic])

  // Stats
  const stats = useMemo(() => {
    const safeToBlock = Object.values(simulationResults).filter(r => r.recommendation === 'SAFE_TO_BLOCK').length
    const blockWithCaution = Object.values(simulationResults).filter(r => r.recommendation === 'BLOCK_WITH_CAUTION').length
    const doNotBlock = Object.values(simulationResults).filter(r => r.recommendation === 'DO_NOT_BLOCK').length

    return {
      totalPorts: ports.length,
      criticalPorts: ports.filter(p => p.highest_cvss >= 9.0).length,
      unusedPorts: ports.filter(p => p.traffic.bytes === 0).length,
      publicPorts: ports.filter(p => p.is_public).length,
      safeToBlock,
      blockWithCaution,
      doNotBlock,
      simulated: Object.keys(simulationResults).length
    }
  }, [ports, simulationResults])

  const getRiskColor = (cvss: number) => {
    if (cvss >= 9.0) return 'bg-red-100 text-red-800 border-red-200'
    if (cvss >= 7.0) return 'bg-orange-100 text-orange-800 border-orange-200'
    if (cvss >= 4.0) return 'bg-amber-100 text-amber-800 border-amber-200'
    return 'bg-green-100 text-green-800 border-green-200'
  }

  const getRecommendationStyle = (rec: SimulationResult['recommendation']) => {
    switch (rec) {
      case 'SAFE_TO_BLOCK': return 'bg-green-100 text-green-800 border-green-300'
      case 'BLOCK_WITH_CAUTION': return 'bg-amber-100 text-amber-800 border-amber-300'
      case 'RESTRICT_INSTEAD': return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'DO_NOT_BLOCK': return 'bg-red-100 text-red-800 border-red-300'
    }
  }

  const getRecommendationIcon = (rec: SimulationResult['recommendation']) => {
    switch (rec) {
      case 'SAFE_TO_BLOCK': return <CheckCircle2 className="w-5 h-5 text-green-600" />
      case 'BLOCK_WITH_CAUTION': return <AlertTriangle className="w-5 h-5 text-amber-600" />
      case 'RESTRICT_INSTEAD': return <Shield className="w-5 h-5 text-blue-600" />
      case 'DO_NOT_BLOCK': return <XCircle className="w-5 h-5 text-red-600" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Network className="w-7 h-7 text-indigo-600" />
            Risky Ports Dashboard
          </h1>
          <p className="text-gray-600 mt-1">
            Analyze exposed ports, traffic patterns, and get remediation recommendations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={runBulkSimulation}
            disabled={loading || runningBulkSimulation || filteredPorts.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {runningBulkSimulation ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Run All Simulations
          </button>
          <button
            onClick={fetchRiskyPorts}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-6 gap-4">
        <div className="rounded-xl p-4 border bg-gray-50 border-gray-200">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Target className="w-4 h-4" />
            <span className="text-sm font-medium">Total Ports</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.totalPorts}</div>
        </div>

        <div className="rounded-xl p-4 border bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">Critical Risk</span>
          </div>
          <div className="text-3xl font-bold text-red-700">{stats.criticalPorts}</div>
          <div className="text-xs text-red-500 mt-1">CVSS 9.0+</div>
        </div>

        <div className="rounded-xl p-4 border bg-amber-50 border-amber-200">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <Globe className="w-4 h-4" />
            <span className="text-sm font-medium">Public Exposed</span>
          </div>
          <div className="text-3xl font-bold text-amber-700">{stats.publicPorts}</div>
          <div className="text-xs text-amber-500 mt-1">0.0.0.0/0</div>
        </div>

        <div className="rounded-xl p-4 border bg-green-50 border-green-200">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <Ban className="w-4 h-4" />
            <span className="text-sm font-medium">No Traffic</span>
          </div>
          <div className="text-3xl font-bold text-green-700">{stats.unusedPorts}</div>
          <div className="text-xs text-green-500 mt-1">Safe to block</div>
        </div>

        <div className="rounded-xl p-4 border bg-emerald-50 border-emerald-200">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">Can Block</span>
          </div>
          <div className="text-3xl font-bold text-emerald-700">{stats.safeToBlock}</div>
          <div className="text-xs text-emerald-500 mt-1">From {stats.simulated} simulated</div>
        </div>

        <div className="rounded-xl p-4 border bg-rose-50 border-rose-200">
          <div className="flex items-center gap-2 text-rose-600 mb-1">
            <Activity className="w-4 h-4" />
            <span className="text-sm font-medium">Keep Active</span>
          </div>
          <div className="text-3xl font-bold text-rose-700">{stats.doNotBlock}</div>
          <div className="text-xs text-rose-500 mt-1">In use</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by port number or service..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={filterRisk}
          onChange={(e) => setFilterRisk(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Risk Levels</option>
          <option value="critical">Critical (CVSS 9+)</option>
          <option value="high">High (CVSS 7+)</option>
          <option value="medium">Medium (CVSS 4+)</option>
        </select>

        <select
          value={filterTraffic}
          onChange={(e) => setFilterTraffic(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Traffic Status</option>
          <option value="unused">Unused (No Traffic)</option>
          <option value="used">In Use (Has Traffic)</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <p className="font-medium">Failed to load ports</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-600" />
          <p className="text-gray-600">Analyzing ports across all security groups...</p>
        </div>
      )}

      {/* Ports List */}
      {!loading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-900">
              Exposed Ports ({filteredPorts.length})
            </h2>
          </div>

          <div className="divide-y divide-gray-100">
            {filteredPorts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-green-500" />
                <p className="font-medium">No risky ports found</p>
                <p className="text-sm">All ports are secure</p>
              </div>
            ) : (
              filteredPorts.map((port) => {
                const simResult = simulationResults[port.port]
                const isExpanded = expandedPort === port.port

                return (
                  <div key={port.port} className="hover:bg-gray-50">
                    {/* Port Row */}
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => setExpandedPort(isExpanded ? null : port.port)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {/* Port/Service */}
                          <div className="w-24">
                            <div className="text-lg font-bold text-gray-900">{port.port}</div>
                            <div className="text-sm text-gray-500">{port.service}</div>
                          </div>

                          {/* Risk Badge */}
                          <div className={`px-3 py-1 rounded-lg text-sm font-bold border ${getRiskColor(port.highest_cvss)}`}>
                            CVSS {port.highest_cvss.toFixed(1)}
                          </div>

                          {/* CVE Count */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">{port.cve_count} CVEs</span>
                            {port.critical_cves > 0 && (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white">
                                {port.critical_cves} CRITICAL
                              </span>
                            )}
                            {port.exploits_available && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">
                                <Zap className="w-3 h-3" /> Exploits
                              </span>
                            )}
                          </div>

                          {/* Public Badge */}
                          {port.is_public && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">
                              <Globe className="w-3 h-3" /> PUBLIC
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4">
                          {/* Traffic Status */}
                          <div className="text-right">
                            {port.traffic.bytes > 0 ? (
                              <>
                                <div className="flex items-center gap-1 text-sm text-gray-900">
                                  <Activity className="w-4 h-4 text-green-500" />
                                  <span className="font-medium">{formatBytes(port.traffic.bytes)}</span>
                                </div>
                                <div className="text-xs text-gray-500">
                                  Last: {formatTimeAgo(port.traffic.last_seen)}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-1 text-sm text-gray-500">
                                  <Ban className="w-4 h-4 text-gray-400" />
                                  <span>No traffic</span>
                                </div>
                                <div className="text-xs text-green-600 font-medium">
                                  Safe to block
                                </div>
                              </>
                            )}
                          </div>

                          {/* Simulation Result Badge */}
                          {simResult && (
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${getRecommendationStyle(simResult.recommendation)}`}>
                              {getRecommendationIcon(simResult.recommendation)}
                              <span className="text-sm font-medium">
                                {simResult.recommendation.replace(/_/g, ' ')}
                              </span>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                runSimulation(port)
                              }}
                              disabled={simulating === port.port}
                              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {simulating === port.port ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                              Simulate
                            </button>

                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          {/* Traffic Analysis */}
                          <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <Activity className="w-4 h-4" />
                              Traffic Analysis
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-500">Total Data:</span>
                                <span className="font-medium">{formatBytes(port.traffic.bytes)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Packets:</span>
                                <span className="font-medium">{port.traffic.packets.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Unique Sources:</span>
                                <span className="font-medium">{port.traffic.unique_sources}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Last Activity:</span>
                                <span className="font-medium">{formatTimeAgo(port.traffic.last_seen)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Classification:</span>
                                <span className={`font-bold ${
                                  port.classification === 'UNUSED' ? 'text-green-600' :
                                  port.classification === 'LOW_USAGE' ? 'text-amber-600' :
                                  'text-blue-600'
                                }`}>{port.classification}</span>
                              </div>
                            </div>
                          </div>

                          {/* Security Groups */}
                          <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              Security Groups ({port.sg_rules.length})
                            </h4>
                            <div className="space-y-2">
                              {port.sg_rules.slice(0, 5).map((rule, idx) => (
                                <div key={idx} className="text-sm flex items-center justify-between">
                                  <span className="text-gray-700 truncate max-w-[150px]">{rule.sg_name}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    rule.is_public ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
                                  }`}>
                                    {rule.source.length > 15 ? rule.source.substring(0, 15) + '...' : rule.source}
                                  </span>
                                </div>
                              ))}
                              {port.sg_rules.length > 5 && (
                                <div className="text-xs text-gray-500">+{port.sg_rules.length - 5} more</div>
                              )}
                            </div>
                          </div>

                          {/* Affected Resources */}
                          <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <Server className="w-4 h-4" />
                              Affected Resources ({port.affected_resources.length})
                            </h4>
                            <div className="space-y-2">
                              {port.affected_resources.slice(0, 5).map((res, idx) => (
                                <div key={idx} className="text-sm flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                    res.type === 'instance' ? 'bg-orange-100 text-orange-700' :
                                    'bg-purple-100 text-purple-700'
                                  }`}>
                                    {res.type === 'instance' ? 'EC2' : res.type}
                                  </span>
                                  <span className="text-gray-700 truncate">{res.name}</span>
                                </div>
                              ))}
                              {port.affected_resources.length > 5 && (
                                <div className="text-xs text-gray-500">+{port.affected_resources.length - 5} more</div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Simulation Result Details */}
                        {simResult && (
                          <div className={`rounded-lg border-2 p-4 ${getRecommendationStyle(simResult.recommendation)}`}>
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                {getRecommendationIcon(simResult.recommendation)}
                                <div>
                                  <h4 className="font-bold text-lg">
                                    {simResult.recommendation.replace(/_/g, ' ')}
                                  </h4>
                                  <p className="text-sm opacity-80">
                                    Confidence: {simResult.confidence}%
                                  </p>
                                </div>
                              </div>
                              {simResult.can_remediate && (
                                <button className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center gap-2">
                                  <ShieldCheck className="w-4 h-4" />
                                  Apply Remediation
                                </button>
                              )}
                            </div>

                            <p className="mb-4">{simResult.reason}</p>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <h5 className="font-semibold mb-2">Impact Summary</h5>
                                <ul className="text-sm space-y-1">
                                  <li>• {simResult.impact.affected_resources} resources affected</li>
                                  <li>• {simResult.impact.affected_sgs} security groups</li>
                                  <li>• {simResult.impact.will_break_connections ? '⚠️ Will break active connections' : '✓ No active connections to break'}</li>
                                </ul>
                              </div>
                              <div>
                                <h5 className="font-semibold mb-2">Recommended Actions</h5>
                                <ol className="text-sm space-y-1 list-decimal list-inside">
                                  {simResult.action_items.map((item, idx) => (
                                    <li key={idx}>{item}</li>
                                  ))}
                                </ol>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* CVEs */}
                        {port.cves.length > 0 && (
                          <div className="bg-red-50 rounded-lg p-4">
                            <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              Vulnerabilities ({port.cves.length})
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                              {port.cves.slice(0, 6).map((cve) => (
                                <div key={cve.cve_id} className="bg-white rounded p-2 text-sm">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${getRiskColor(cve.cvss_score)}`}>
                                      {cve.severity}
                                    </span>
                                    <span className="font-mono text-xs">{cve.cve_id}</span>
                                    {cve.exploit_available && (
                                      <Zap className="w-3 h-3 text-red-500" />
                                    )}
                                  </div>
                                  <p className="text-gray-600 text-xs line-clamp-2">{cve.description}</p>
                                </div>
                              ))}
                            </div>
                            {port.cves.length > 6 && (
                              <div className="text-xs text-red-600 mt-2">+{port.cves.length - 6} more CVEs</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default RiskyPortsDashboard
