'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  Server, Database, HardDrive, Shield, Key, Zap, Globe, 
  Network, Lock, RefreshCw, Search, Filter, Grid, List,
  ChevronRight, X, ExternalLink, Check, AlertTriangle,
  Box, FileText, Radio, Activity, Eye, Clock
} from 'lucide-react'

// Service icons by type
const SERVICE_ICONS: Record<string, React.ReactNode> = {
  EC2: <Server className="w-5 h-5" />,
  Lambda: <Zap className="w-5 h-5" />,
  LambdaFunction: <Zap className="w-5 h-5" />,
  RDS: <Database className="w-5 h-5" />,
  RDSInstance: <Database className="w-5 h-5" />,
  DynamoDB: <Database className="w-5 h-5" />,
  DynamoDBTable: <Database className="w-5 h-5" />,
  S3: <HardDrive className="w-5 h-5" />,
  S3Bucket: <HardDrive className="w-5 h-5" />,
  IAMRole: <Key className="w-5 h-5" />,
  IAM: <Key className="w-5 h-5" />,
  SecurityGroup: <Shield className="w-5 h-5" />,
  KMS: <Lock className="w-5 h-5" />,
  KMSKey: <Lock className="w-5 h-5" />,
  Secret: <Lock className="w-5 h-5" />,
  ECS: <Box className="w-5 h-5" />,
  ECSCluster: <Box className="w-5 h-5" />,
  ECSService: <Box className="w-5 h-5" />,
  CloudFront: <Globe className="w-5 h-5" />,
  CloudFrontDistribution: <Globe className="w-5 h-5" />,
  ALB: <Network className="w-5 h-5" />,
  LoadBalancer: <Network className="w-5 h-5" />,
  APIGateway: <Radio className="w-5 h-5" />,
  SQS: <FileText className="w-5 h-5" />,
  SNS: <Radio className="w-5 h-5" />,
  LogGroup: <FileText className="w-5 h-5" />,
  VPC: <Network className="w-5 h-5" />,
  VPCEndpoint: <Network className="w-5 h-5" />,
  NATGateway: <Network className="w-5 h-5" />,
  InternetGateway: <Globe className="w-5 h-5" />,
  ACMCertificate: <Shield className="w-5 h-5" />,
  default: <Server className="w-5 h-5" />
}

// Category configuration
const CATEGORIES = {
  Compute: { color: 'amber', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  Database: { color: 'blue', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  Storage: { color: 'emerald', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  Networking: { color: 'violet', bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/30' },
  Security: { color: 'red', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  Integration: { color: 'pink', bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30' },
  Edge: { color: 'cyan', bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  Management: { color: 'gray', bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30' },
}

interface ServiceItem {
  id: string
  name: string
  type: string
  category: string
  status: string
  region?: string
  lpScore?: number
  usedCount?: number
  gapCount?: number
  connections?: number
  isEncrypted?: boolean
  systemName?: string
  environment?: string
  criticality?: string
  details?: Record<string, any>
}

interface Props {
  systemName: string
}

export default function AllServicesInventory({ systemName }: Props) {
  const [services, setServices] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('connections')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null)

  // Fetch all services
  const fetchServices = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch from extended resources endpoint
      const response = await fetch(`/api/proxy/resources/all?regions=eu-west-1,us-east-1`)
      
      if (!response.ok) {
        // Fallback to LP issues
        const lpResponse = await fetch(`/api/proxy/least-privilege/issues?systemName=${encodeURIComponent(systemName)}`)
        const lpData = await lpResponse.json()
        
        const mappedServices: ServiceItem[] = (lpData.resources || []).map((r: any) => ({
          id: r.resourceArn || r.resourceName,
          name: r.resourceName,
          type: r.resourceType,
          category: getCategoryForType(r.resourceType),
          status: 'active',
          region: r.evidence?.coverage?.regions?.[0] || 'eu-west-1',
          lpScore: r.lpScore,
          usedCount: r.usedCount,
          gapCount: r.gapCount,
          connections: r.usedCount || 0,
          systemName: r.systemName,
          details: r
        }))
        
        setServices(mappedServices)
        setLastSync(new Date().toISOString())
        setLoading(false)
        return
      }
      
      const data = await response.json()
      
      // Map all resources to services
      const allServices: ServiceItem[] = []
      
      // Process each resource type
      const resourceTypes = [
        { key: 'kms_keys', type: 'KMSKey', category: 'Security' },
        { key: 'secrets', type: 'Secret', category: 'Security' },
        { key: 'ecs_clusters', type: 'ECSCluster', category: 'Compute' },
        { key: 'ecs_services', type: 'ECSService', category: 'Compute' },
        { key: 'task_definitions', type: 'TaskDefinition', category: 'Compute' },
        { key: 'log_groups', type: 'LogGroup', category: 'Management' },
        { key: 'internet_gateways', type: 'InternetGateway', category: 'Networking' },
        { key: 'nat_gateways', type: 'NATGateway', category: 'Networking' },
        { key: 'vpc_endpoints', type: 'VPCEndpoint', category: 'Networking' },
        { key: 'hosted_zones', type: 'HostedZone', category: 'Edge' },
        { key: 'domains', type: 'Domain', category: 'Edge' },
        { key: 'cloudfront_distributions', type: 'CloudFront', category: 'Edge' },
        { key: 'acm_certificates', type: 'ACMCertificate', category: 'Security' },
        { key: 'lambda_functions', type: 'Lambda', category: 'Compute' },
        { key: 'rds_instances', type: 'RDS', category: 'Database' },
        { key: 'dynamodb_tables', type: 'DynamoDB', category: 'Database' },
      ]
      
      resourceTypes.forEach(({ key, type, category }) => {
        const resources = data.resources?.[key] || []
        resources.forEach((r: any) => {
          allServices.push({
            id: r.arn || r.id || r.name,
            name: r.name,
            type,
            category,
            status: r.status || r.state || r.key_state || 'active',
            region: r.region,
            isEncrypted: r.encrypted || r.sse_enabled || !!r.kms_key_id,
            details: r
          })
        })
      })
      
      // Also fetch LP issues for IAM, SG, S3
      try {
        const lpResponse = await fetch(`/api/proxy/least-privilege/issues?systemName=${encodeURIComponent(systemName)}`)
        const lpData = await lpResponse.json()
        
        ;(lpData.resources || []).forEach((r: any) => {
          allServices.push({
            id: r.resourceArn || r.resourceName,
            name: r.resourceName,
            type: r.resourceType,
            category: getCategoryForType(r.resourceType),
            status: 'active',
            region: r.evidence?.coverage?.regions?.[0] || 'eu-west-1',
            lpScore: r.lpScore,
            usedCount: r.usedCount,
            gapCount: r.gapCount,
            connections: r.usedCount || 0,
            systemName: r.systemName,
            details: r
          })
        })
      } catch (e) {
        console.warn('LP issues fetch failed:', e)
      }
      
      setServices(allServices)
      setLastSync(new Date().toISOString())
      
    } catch (err: any) {
      console.error('Error fetching services:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [systemName])

  const getCategoryForType = (type: string): string => {
    const categoryMap: Record<string, string> = {
      IAMRole: 'Security',
      SecurityGroup: 'Networking',
      S3Bucket: 'Storage',
      Lambda: 'Compute',
      LambdaFunction: 'Compute',
      RDS: 'Database',
      RDSInstance: 'Database',
      DynamoDB: 'Database',
      EC2: 'Compute',
    }
    return categoryMap[type] || 'Other'
  }

  // Manual sync
  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch(`/api/proxy/least-privilege/issues?systemName=${encodeURIComponent(systemName)}&refresh=true`)
      await fetchServices()
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    fetchServices()
  }, [fetchServices])

  // Filter and sort
  const filteredServices = useMemo(() => {
    let result = [...services]
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(s => 
        s.name?.toLowerCase().includes(q) ||
        s.type?.toLowerCase().includes(q) ||
        s.id?.toLowerCase().includes(q)
      )
    }
    
    if (categoryFilter !== 'all') {
      result = result.filter(s => s.category === categoryFilter)
    }
    
    if (typeFilter !== 'all') {
      result = result.filter(s => s.type === typeFilter)
    }
    
    if (statusFilter !== 'all') {
      result = result.filter(s => s.status?.toLowerCase() === statusFilter)
    }
    
    result.sort((a, b) => {
      switch (sortBy) {
        case 'connections':
          return (b.connections || 0) - (a.connections || 0)
        case 'lpScore':
          return (b.lpScore || 0) - (a.lpScore || 0)
        case 'name':
          return (a.name || '').localeCompare(b.name || '')
        case 'type':
          return (a.type || '').localeCompare(b.type || '')
        default:
          return 0
      }
    })
    
    return result
  }, [services, searchQuery, categoryFilter, typeFilter, statusFilter, sortBy])

  // Get unique types
  const uniqueTypes = useMemo(() => [...new Set(services.map(s => s.type))].sort(), [services])

  // Category stats
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {}
    services.forEach(s => {
      stats[s.category] = (stats[s.category] || 0) + 1
    })
    return stats
  }, [services])

  const getIcon = (type: string) => SERVICE_ICONS[type] || SERVICE_ICONS.default

  const getCategoryStyle = (category: string) => CATEGORIES[category as keyof typeof CATEGORIES] || CATEGORIES.Management

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
          <span className="text-slate-500">Loading all services...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Grid className="w-6 h-6 text-violet-500" />
            All Services Inventory
          </h2>
          <p className="text-slate-500">
            {filteredServices.length} of {services.length} services • 
            Last sync: {lastSync ? new Date(lastSync).toLocaleTimeString() : 'Never'}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Auto-sync indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-slate-500 text-sm">Auto-sync: 1h</span>
          </div>
          
          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync from AWS'}
          </button>
          
          {/* View toggle */}
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-white shadow' : ''}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded ${viewMode === 'table' ? 'bg-white shadow' : ''}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="all">All Categories</option>
          {Object.keys(CATEGORIES).map(cat => (
            <option key={cat} value={cat}>{cat} ({categoryStats[cat] || 0})</option>
          ))}
        </select>
        
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="all">All Types</option>
          {uniqueTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="connections">Sort: Connections</option>
          <option value="lpScore">Sort: LP Score</option>
          <option value="name">Sort: Name</option>
          <option value="type">Sort: Type</option>
        </select>
      </div>

      {/* Category Quick Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Object.entries(CATEGORIES).map(([name, style]) => (
          <button
            key={name}
            onClick={() => setCategoryFilter(categoryFilter === name ? 'all' : name)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all border ${
              categoryFilter === name 
                ? `${style.bg} ${style.text} ${style.border}` 
                : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'
            }`}
          >
            {name}
            <span className="text-xs opacity-60">({categoryStats[name] || 0})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchServices}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            Retry
          </button>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="text-center py-20">
          <Search className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">No services found</p>
          <p className="text-slate-400 text-sm mt-1">Try adjusting your filters</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredServices.map(service => {
            const style = getCategoryStyle(service.category)
            return (
              <div
                key={service.id}
                onClick={() => setSelectedService(service)}
                className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-lg ${
                  selectedService?.id === service.id 
                    ? `${style.bg} ${style.border} shadow-lg` 
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${style.bg}`}>
                      <div className={style.text}>{getIcon(service.type)}</div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm leading-tight truncate max-w-[120px]">
                        {service.name}
                      </h3>
                      <p className="text-xs text-slate-500">{service.type}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    service.status === 'active' || service.status === 'running' || service.status === 'available' || service.status === 'Enabled'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {service.status || 'active'}
                  </span>
                </div>
                
                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {service.lpScore !== undefined && (
                    <div className="bg-slate-50 rounded-lg p-2">
                      <p className="text-xs text-slate-500">LP Score</p>
                      <p className="text-lg font-bold text-slate-900">{service.lpScore}%</p>
                    </div>
                  )}
                  {service.connections !== undefined && (
                    <div className="bg-slate-50 rounded-lg p-2">
                      <p className="text-xs text-slate-500">Used</p>
                      <p className="text-lg font-bold text-slate-900">{service.usedCount || service.connections}</p>
                    </div>
                  )}
                </div>
                
                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-xs ${style.bg} ${style.text}`}>
                    {service.category}
                  </span>
                  {service.region && (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                      {service.region}
                    </span>
                  )}
                  {service.isEncrypted && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Encrypted
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Service</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Region</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">LP Score</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredServices.map(service => {
                const style = getCategoryStyle(service.category)
                return (
                  <tr
                    key={service.id}
                    onClick={() => setSelectedService(service)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded ${style.bg}`}>
                          <div className={style.text}>{getIcon(service.type)}</div>
                        </div>
                        <span className="font-medium text-slate-900">{service.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{service.type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${style.bg} ${style.text}`}>
                        {service.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{service.region || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        service.status === 'active' || service.status === 'running' || service.status === 'available'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {service.status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {service.lpScore !== undefined ? `${service.lpScore}%` : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Details Panel */}
      {selectedService && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${getCategoryStyle(selectedService.category).bg}`}>
                  <div className={getCategoryStyle(selectedService.category).text}>
                    {getIcon(selectedService.type)}
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{selectedService.name}</h2>
                  <p className="text-slate-500">{selectedService.type} • {selectedService.category}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedService(null)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-slate-500 mb-3">Basic Info</h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">ID</dt>
                      <dd className="text-slate-900 font-mono text-xs truncate max-w-[180px]">{selectedService.id}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Region</dt>
                      <dd className="text-slate-900">{selectedService.region || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Status</dt>
                      <dd className="text-green-600">{selectedService.status || 'active'}</dd>
                    </div>
                  </dl>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-slate-500 mb-3">Security</h3>
                  <dl className="space-y-2 text-sm">
                    {selectedService.lpScore !== undefined && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">LP Score</dt>
                        <dd className="text-slate-900 font-bold">{selectedService.lpScore}%</dd>
                      </div>
                    )}
                    {selectedService.usedCount !== undefined && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Used Permissions</dt>
                        <dd className="text-green-600">{selectedService.usedCount}</dd>
                      </div>
                    )}
                    {selectedService.gapCount !== undefined && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Unused Permissions</dt>
                        <dd className="text-red-600">{selectedService.gapCount}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Encrypted</dt>
                      <dd>{selectedService.isEncrypted ? '✅ Yes' : '❌ No'}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              
              {/* Raw details */}
              {selectedService.details && (
                <div className="bg-slate-900 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-slate-400 mb-3">Raw Details</h3>
                  <pre className="text-xs text-slate-300 overflow-x-auto">
                    {JSON.stringify(selectedService.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setSelectedService(null)}
                className="px-4 py-2 border rounded-lg hover:bg-slate-50"
              >
                Close
              </button>
              <button className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                View in Least Privilege
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

