"use client"

import { useState, useEffect } from 'react'
import { Bug, Shield, AlertTriangle, RefreshCw, Search, Filter, ExternalLink } from 'lucide-react'
import { VulnerabilityExposurePanel } from './vulnerability-exposure-panel'
import { EnforcementModeSelector } from './enforcement-mode-selector'

interface SecurityGroup {
  sg_id: string
  sg_name: string
  vpc_id: string
  region?: string
  rule_count?: number
  systemName?: string
}

interface VulnerabilitySummary {
  total_sgs: number
  sgs_with_vulnerabilities: number
  total_cves: number
  critical_cves: number
  high_cves: number
  medium_cves: number
}

interface VulnerabilitiesSectionProps {
  systemName?: string  // If provided, filter by system
}

export function VulnerabilitiesSection({ systemName }: VulnerabilitiesSectionProps) {
  const [securityGroups, setSecurityGroups] = useState<SecurityGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSgId, setSelectedSgId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [summary, setSummary] = useState<VulnerabilitySummary>({
    total_sgs: 0,
    sgs_with_vulnerabilities: 0,
    total_cves: 0,
    critical_cves: 0,
    high_cves: 0,
    medium_cves: 0,
  })

  useEffect(() => {
    fetchSecurityGroups()
  }, [systemName])

  const fetchSecurityGroups = async () => {
    setLoading(true)
    setError(null)
    try {
      let sgs: SecurityGroup[] = []

      if (systemName) {
        // Use system-resources endpoint when filtering by system
        const response = await fetch(`/api/proxy/system-resources/${systemName}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch system resources: ${response.status}`)
        }
        const data = await response.json()
        console.log('[VulnerabilitiesSection] System resources response:', data)

        const resources = data.resources || []
        sgs = resources
          .filter((r: any) => r.type === 'SecurityGroup')
          .map((r: any) => ({
            sg_id: r.id?.startsWith('sg-') ? r.id : r.name,
            sg_name: r.name || r.id,
            vpc_id: r.vpc_id || 'unknown',
            region: r.region || 'eu-west-1',
            systemName: systemName,
          }))
      } else {
        // Use nodes endpoint for all SGs (account-wide view)
        const response = await fetch('/api/proxy/nodes')
        if (!response.ok) {
          throw new Error(`Failed to fetch nodes: ${response.status}`)
        }
        const data = await response.json()
        console.log('[VulnerabilitiesSection] Nodes response:', data)

        const nodes = data.nodes || data || []
        sgs = nodes
          .filter((n: any) => n.type === 'SecurityGroup')
          .map((n: any) => ({
            sg_id: n.id,
            sg_name: n.name || n.id,
            vpc_id: n.vpc_id || 'unknown',
            region: n.region || 'eu-west-1',
            systemName: n.systemName,
          }))
      }

      console.log(`[VulnerabilitiesSection] Found ${sgs.length} security groups${systemName ? ` for system ${systemName}` : ''}`)
      setSecurityGroups(sgs)
      setSummary(prev => ({ ...prev, total_sgs: sgs.length }))
    } catch (error) {
      console.error('Failed to fetch security groups:', error)
      setError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const filteredSGs = securityGroups.filter(sg =>
    sg.sg_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sg.sg_id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bug className="w-7 h-7 text-red-600" />
            {systemName ? `${systemName} Vulnerabilities` : 'Vulnerability Management'}
          </h1>
          <p className="text-gray-600 mt-1">
            {systemName
              ? `CVE exposure analysis for Security Groups in ${systemName}`
              : 'CVE exposure analysis and enforcement configuration for Security Groups'
            }
          </p>
        </div>
        <button
          onClick={fetchSecurityGroups}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <p className="font-medium">Failed to load security groups</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">Security Groups</div>
          <div className="text-3xl font-bold text-gray-900">{summary.total_sgs}</div>
        </div>
        <div className="bg-red-50 rounded-xl p-5 border border-red-200">
          <div className="text-sm text-red-600 mb-1">Critical CVEs</div>
          <div className="text-3xl font-bold text-red-600">{summary.critical_cves}</div>
        </div>
        <div className="bg-orange-50 rounded-xl p-5 border border-orange-200">
          <div className="text-sm text-orange-600 mb-1">High CVEs</div>
          <div className="text-3xl font-bold text-orange-600">{summary.high_cves}</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
          <div className="text-sm text-amber-600 mb-1">Medium CVEs</div>
          <div className="text-3xl font-bold text-amber-600">{summary.medium_cves}</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left: Security Groups List */}
        <div className="col-span-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-3">Security Groups</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search security groups..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading security groups...
              </div>
            ) : filteredSGs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No security groups found
              </div>
            ) : (
              filteredSGs.map((sg) => (
                <button
                  key={sg.sg_id}
                  onClick={() => setSelectedSgId(sg.sg_id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    selectedSgId === sg.sg_id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{sg.sg_name}</div>
                      <div className="text-xs text-gray-500 font-mono">{sg.sg_id}</div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Vulnerability Details */}
        <div className="col-span-2 space-y-6">
          {selectedSgId ? (
            <>
              {/* Vulnerability Exposure Panel */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <VulnerabilityExposurePanel sgId={selectedSgId} />
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
              <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Security Group</h3>
              <p className="text-gray-500">
                Choose a security group from the list to view its CVE exposure and vulnerability analysis.
              </p>
            </div>
          )}

          {/* Enforcement Mode Selector */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Enforcement Configuration
            </h2>
            <EnforcementModeSelector showDetails={true} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default VulnerabilitiesSection
