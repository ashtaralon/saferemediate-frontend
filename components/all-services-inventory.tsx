'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSyncFromAWS } from '@/hooks/use-sync-from-aws'
import { 
  Server, Database, HardDrive, Shield, Key, Zap, Globe, 
  Network, Lock, RefreshCw, Search, Filter, Grid, List,
  ChevronRight, X, ExternalLink, Check, AlertTriangle,
  Box, FileText, Radio, Activity, Eye, Clock, ChevronDown,
  TrendingUp, CheckCircle, User
} from 'lucide-react'
import { BackToDashboard } from '@/components/back-to-dashboard'
import { ResourceConfigTab } from '@/components/inventory/resource-config-tab'
import { dedupeKmsListRows } from '@/lib/inventory-list'
import { ServiceTypeBadge } from '@/lib/service-type'
import {
  UNKNOWN,
  type EncryptionState,
  type FetchResult,
  type InventoryStatus,
  type RegionValue,
  failedGroupMessage,
  formatEncryptionLabel,
  formatLastSyncLabel,
  formatRegionLabel,
  formatStatusLabel,
  isActiveLikeStatus,
  mapEncryption,
  mapLastSyncEvidence,
  mapRegion,
  mapStatus,
  regionsQueryParam,
} from '@/lib/inventory-honesty'
import { useAccountScope } from '@/lib/account-scope-context'
import { resourceAccountId, withAccountScope, type ProductScope } from '@/lib/account-scope'

type InventoryScope = Pick<ProductScope, 'customerId' | 'groupId' | 'accountId' | 'region'>

// Icon + color for a resource type now come from the canonical
// `@/lib/service-type` badge — the old per-file `SERVICE_ICONS` map was
// retired (Phase 2, 2026-07-13). Category color still drives the tag pills
// (CATEGORIES below); the type tile is triple-coded by the badge.

// Types whose configuration the unified inspector (/api/proxy/inspector) can
// render. IAMRole is deliberately absent — it has its own "IAM Role &
// Policies" tab backed by gap-analysis.
const CONFIG_TAB_LABEL: Record<string, string> = {
  SecurityGroup: 'Rules',
  S3: 'Policies',
  S3Bucket: 'Policies',
  Subnet: 'Properties',
  RDS: 'Configuration',
  RDSInstance: 'Configuration',
  EC2: 'Configuration',
  NetworkACL: 'Configuration',
  KMSKey: 'Policies',
  Secret: 'Policies',
  SecretsManagerSecret: 'Policies',
  DynamoDB: 'Configuration',
  DynamoDBTable: 'Configuration',
}

// Category configuration
const CATEGORIES = {
  Compute: { color: 'amber', bg: 'bg-[#f9731610]0/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  Database: { color: 'blue', bg: 'bg-[#3b82f610]0/10', text: 'text-blue-400', border: 'border-[#3b82f6]/30' },
  Storage: { color: 'emerald', bg: 'bg-[#10b98110]0/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  Networking: { color: 'violet', bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/30' },
  Security: { color: 'red', bg: 'bg-[#ef444410]0/10', text: 'text-red-400', border: 'border-red-500/30' },
  Integration: { color: 'pink', bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30' },
  Edge: { color: 'cyan', bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  Management: { color: 'gray', bg: 'bg-gray-500/10', text: 'text-[var(--muted-foreground,#9ca3af)]', border: 'border-gray-500/30' },
}

interface ServiceItem {
  id: string
  name: string
  type: string
  category: string
  status: InventoryStatus
  region: RegionValue
  accountId?: string
  lpScore?: number
  usedCount?: number
  gapCount?: number
  connections?: number
  encryption: EncryptionState
  systemName?: string
  environment?: string
  criticality?: string
  details?: Record<string, any>
  /** Account-wide rows (KMS/secrets) — not system-filtered. */
  accountWide?: boolean
}

interface Props {
  systemName: string
}

type GroupedItems = {
  items: ServiceItem[]
  errors: string[]
  evidenceTimestamps: Array<string | number | null | undefined>
  accountWideListed: boolean
}

// Graph-backed listing rows (registry aliases in api/resource_inventory.py).
// Failures are typed — never silent empty success.
async function fetchGraphListRows(
  alias: string,
  systemName: string | undefined,
  scope: InventoryScope,
): Promise<FetchResult<any>> {
  try {
    const system = systemName ? `&system=${encodeURIComponent(systemName)}` : ''
    const res = await fetch(
      withAccountScope(
        `/api/proxy/resource-inventory/list?resource_type=${alias}${system}&limit=100`,
        scope,
      ),
    )
    if (!res.ok) {
      return {
        ok: false,
        error: failedGroupMessage(alias, `HTTP ${res.status}`),
      }
    }
    const data = await res.json()
    return {
      ok: true,
      items: Array.isArray(data.items) ? data.items : [],
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: failedGroupMessage(alias, msg) }
  }
}

// KMS keys, secrets, and DynamoDB tables. KMS and secrets are fetched
// account-wide (auto-tagger gap); that scope is surfaced to the operator.
// DynamoDB stays system-scoped.
async function fetchDataSecurityServiceItems(
  systemName: string,
  scope: InventoryScope,
): Promise<GroupedItems> {
  const [kmsResult, secretResult, ddbResult] = await Promise.all([
    fetchGraphListRows('kms', undefined, scope),
    fetchGraphListRows('secret', undefined, scope),
    fetchGraphListRows('dynamodb', systemName, scope),
  ])

  const items: ServiceItem[] = []
  const errors: string[] = []
  const evidenceTimestamps: Array<string | number | null | undefined> = []

  if (!kmsResult.ok) errors.push(kmsResult.error)
  else {
    for (const k of dedupeKmsListRows(kmsResult.items)) {
      if (!k.id) continue
      evidenceTimestamps.push(k.collected_at, k.synced_at, k.last_synced_at)
      items.push({
        id: String(k.id),
        name: String(k.name || k.key_id || k.id),
        type: 'KMSKey',
        category: 'Security',
        status: mapStatus(
          k.key_state === 'Enabled' ? 'active' : k.key_state,
          k.status,
          k.state,
        ),
        region: mapRegion(k.region),
        accountId: resourceAccountId(k) || undefined,
        encryption: mapEncryption({
          type: 'KMSKey',
          encryption_read_ok: true,
          encrypted: true,
        }),
        details: k,
        accountWide: true,
      })
    }
  }

  if (!secretResult.ok) errors.push(secretResult.error)
  else {
    for (const s of secretResult.items) {
      const id = s?.id || s?.arn
      if (!id) continue
      evidenceTimestamps.push(s.collected_at, s.synced_at, s.last_synced_at)
      items.push({
        id: String(id),
        name: String(s.name || id),
        type: 'Secret',
        category: 'Security',
        status: mapStatus(s.status, s.state),
        region: mapRegion(s.region),
        accountId: resourceAccountId(s) || undefined,
        encryption: mapEncryption({ type: 'Secret' }),
        details: s,
        accountWide: true,
      })
    }
  }

  if (!ddbResult.ok) errors.push(ddbResult.error)
  else {
    for (const t of ddbResult.items) {
      if (!t?.id) continue
      evidenceTimestamps.push(t.collected_at, t.synced_at, t.last_synced_at)
      items.push({
        id: String(t.id),
        name: String(t.name || t.id),
        type: 'DynamoDB',
        category: 'Database',
        status: mapStatus(t.status, t.state),
        region: mapRegion(t.region),
        accountId: resourceAccountId(t) || undefined,
        encryption: mapEncryption({
          type: 'DynamoDB',
          encrypted: t.encrypted,
          sse_enabled: t.sse_enabled,
          kms_key_id: t.kms_key_id,
          encryption_read_ok:
            t.encrypted === true ||
            t.encrypted === false ||
            t.sse_enabled === true ||
            t.sse_enabled === false,
        }),
        details: t,
      })
    }
  }

  return {
    items,
    errors,
    evidenceTimestamps,
    accountWideListed: true,
  }
}

async function fetchSubnetServiceItems(
  systemName: string,
  scope: InventoryScope,
): Promise<GroupedItems> {
  try {
    const res = await fetch(
      withAccountScope(
        `/api/proxy/resource-inventory/list?resource_type=subnet&system=${encodeURIComponent(systemName)}&limit=100`,
        scope,
      ),
    )
    if (!res.ok) {
      return {
        items: [],
        errors: [failedGroupMessage('subnet', `HTTP ${res.status}`)],
        evidenceTimestamps: [],
        accountWideListed: false,
      }
    }
    const data = await res.json()
    const evidenceTimestamps: Array<string | number | null | undefined> = []
    const items: ServiceItem[] = (data.items || [])
      .filter((s: any) => s?.id)
      .map((s: any) => {
        evidenceTimestamps.push(s.collected_at, s.synced_at, s.last_synced_at)
        const regionFromAz =
          typeof s.availability_zone === 'string' && s.availability_zone.length > 2
            ? s.availability_zone.slice(0, -1)
            : s.availability_zone
        return {
          id: s.id,
          name: s.name || s.id,
          type: 'Subnet',
          category: 'Networking',
          status: mapStatus(s.status, s.state),
          region: mapRegion(s.region, regionFromAz),
          accountId: resourceAccountId(s) || undefined,
          encryption: mapEncryption({ type: 'Subnet' }),
          details: s,
        }
      })
    return {
      items,
      errors: [],
      evidenceTimestamps,
      accountWideListed: false,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      items: [],
      errors: [failedGroupMessage('subnet', msg)],
      evidenceTimestamps: [],
      accountWideListed: false,
    }
  }
}

function tenantRegionsForQuery(scope: {
  region: string
  options: { accounts: Array<{ regions: string[] }> } | null
}): string[] {
  if (scope.region && scope.region !== 'all') return [scope.region]
  const fromAccounts = (scope.options?.accounts || []).flatMap((a) => a.regions || [])
  return [...new Set(fromAccounts.filter(Boolean))]
}

export default function AllServicesInventory({ systemName }: Props) {
  const accountScope = useAccountScope()
  const [services, setServices] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groupErrors, setGroupErrors] = useState<string[]>([])
  const [accountWideNotice, setAccountWideNotice] = useState(false)
  const [lastSync, setLastSync] = useState<string | typeof UNKNOWN | null>(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('connections')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null)
  const [iamData, setIamData] = useState<any>(null)
  const [iamLoading, setIamLoading] = useState(false)
  const [iamError, setIamError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'iam' | 'config'>('overview')
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set())
  const [showUsedPerms, setShowUsedPerms] = useState(true)
  const [showUnusedPerms, setShowUnusedPerms] = useState(true)

  // Fetch inventory groups. Failed groups surface as degraded state;
  // LP findings are never used as a substitute inventory.
  const fetchServices = useCallback(async () => {
    setLoading(true)
    setError(null)
    setGroupErrors([])
    setAccountWideNotice(false)

    const errors: string[] = []
    const evidenceTimestamps: Array<string | number | null | undefined> = []
    const allServices: ServiceItem[] = []

    try {
      const regions = tenantRegionsForQuery(accountScope)
      const regionQs = regionsQueryParam(regions)
      const resourcesUrl = withAccountScope(
        `/api/proxy/resources/all${regionQs}`,
        accountScope,
      )
      const response = await fetch(resourcesUrl)

      if (!response.ok) {
        errors.push(
          failedGroupMessage('resources/all', `HTTP ${response.status}`),
        )
      } else {
        const data = await response.json()
        evidenceTimestamps.push(
          data.computed_at,
          data.synced_at,
          data.last_sync,
          data.syncStatus?.lastSync,
        )

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
            evidenceTimestamps.push(r.collected_at, r.synced_at, r.last_synced_at)
            allServices.push({
              id: r.arn || r.id || r.name,
              name: r.name,
              type,
              category,
              status: mapStatus(r.status, r.state, r.key_state),
              region: mapRegion(r.region),
              accountId: resourceAccountId(r) || undefined,
              encryption: mapEncryption({
                type,
                encrypted: r.encrypted,
                sse_enabled: r.sse_enabled,
                kms_key_id: r.kms_key_id,
                encryption_read_ok:
                  r.encrypted === true ||
                  r.encrypted === false ||
                  r.sse_enabled === true ||
                  r.sse_enabled === false,
              }),
              details: r,
            })
          })
        })
      }

      const [subnetGroup, dataSecurityGroup] = await Promise.all([
        fetchSubnetServiceItems(systemName, accountScope),
        fetchDataSecurityServiceItems(systemName, accountScope),
      ])
      errors.push(...subnetGroup.errors, ...dataSecurityGroup.errors)
      evidenceTimestamps.push(
        ...subnetGroup.evidenceTimestamps,
        ...dataSecurityGroup.evidenceTimestamps,
      )
      if (dataSecurityGroup.accountWideListed) setAccountWideNotice(true)

      const seenIds = new Set(allServices.map((s) => s.id))
      for (const item of [...subnetGroup.items, ...dataSecurityGroup.items]) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id)
          allServices.push(item)
        }
      }

      setServices(allServices)
      setGroupErrors(errors)
      setLastSync(mapLastSyncEvidence(...evidenceTimestamps))
      if (errors.length > 0 && allServices.length === 0) {
        setError('Inventory reads failed for every group. See degraded groups below.')
      }
    } catch (err: any) {
      console.error('Error fetching services:', err)
      setError(err.message)
      setServices([])
      setLastSync(UNKNOWN)
    } finally {
      setLoading(false)
    }
  }, [
    systemName,
    accountScope.customerId,
    accountScope.groupId,
    accountScope.accountId,
    accountScope.region,
    accountScope.options,
  ])

  // Manual sync — refresh inventory; do not stamp browser clock as last sync.
  const { syncing, startSync } = useSyncFromAWS({
    onComplete: () => {
      void fetchServices()
    },
  })

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

    if (accountScope.accountId !== 'all') {
      result = result.filter(s => s.accountId === accountScope.accountId)
    }

    if (accountScope.region !== 'all') {
      result = result.filter(s => s.region === accountScope.region)
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
  }, [services, searchQuery, categoryFilter, typeFilter, statusFilter, sortBy, accountScope.accountId, accountScope.region])

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

  const getCategoryStyle = (category: string) => CATEGORIES[category as keyof typeof CATEGORIES] || CATEGORIES.Management

  // Extract IAM role name from service details
  const getIAMRoleName = useCallback((service: ServiceItem): string | null => {
    if (service.type === 'IAMRole') {
      // Extract role name from ARN or name
      if (service.id?.includes('arn:aws:iam::')) {
        const parts = service.id.split('/')
        return parts[parts.length - 1]
      }
      return service.name
    }
    
    // For Lambda functions
    if (service.type === 'Lambda' || service.type === 'LambdaFunction') {
      const roleArn = service.details?.role || service.details?.Role
      if (roleArn) {
        const parts = roleArn.split('/')
        return parts[parts.length - 1]
      }
      // Try to infer from name
      if (service.name) {
        return `${service.name}-Role`
      }
    }
    
    // For EC2 instances
    if (service.type === 'EC2') {
      const instanceProfile = service.details?.iam_instance_profile || service.details?.IamInstanceProfile
      if (instanceProfile) {
        const arn = typeof instanceProfile === 'string' ? instanceProfile : instanceProfile.Arn
        if (arn) {
          const parts = arn.split('/')
          return parts[parts.length - 1]
        }
      }
    }
    
    // For ECS tasks/services
    if (service.type === 'ECSService' || service.type === 'TaskDefinition') {
      const taskRoleArn = service.details?.taskRoleArn || service.details?.task_role_arn
      if (taskRoleArn) {
        const parts = taskRoleArn.split('/')
        return parts[parts.length - 1]
      }
    }
    
    // Try to find role in details
    if (service.details) {
      const roleKeys = ['role', 'Role', 'roleArn', 'role_arn', 'iamRole', 'iam_role']
      for (const key of roleKeys) {
        const roleValue = service.details[key]
        if (roleValue && typeof roleValue === 'string' && roleValue.includes('arn:aws:iam::')) {
          const parts = roleValue.split('/')
          return parts[parts.length - 1]
        }
      }
    }
    
    return null
  }, [])

  // Fetch IAM data when service is selected
  useEffect(() => {
    if (!selectedService) {
      setIamData(null)
      setIamError(null)
      return
    }

    const roleName = getIAMRoleName(selectedService)
    if (!roleName) {
      setIamData(null)
      setIamError(null)
      return
    }

    const fetchIAMData = async () => {
      setIamLoading(true)
      setIamError(null)
      
      try {
        const res = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis`)
        
        if (!res.ok) {
          // Try with service name as fallback
          const altRes = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(selectedService.name)}/gap-analysis`)
          if (altRes.ok) {
            const data = await altRes.json()
            setIamData(data)
            return
          }
          throw new Error('IAM role not found')
        }
        
        const data = await res.json()
        setIamData(data)
      } catch (e: any) {
        console.error('IAM fetch error:', e)
        setIamError(e.message || 'Unable to fetch IAM data')
        setIamData(null)
      } finally {
        setIamLoading(false)
      }
    }

    fetchIAMData()
  }, [selectedService, getIAMRoleName])

  const togglePolicy = (policyName: string) => {
    const newExpanded = new Set(expandedPolicies)
    if (newExpanded.has(policyName)) {
      newExpanded.delete(policyName)
    } else {
      newExpanded.add(policyName)
    }
    setExpandedPolicies(newExpanded)
  }

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
        <div className="flex items-start gap-3">
          <BackToDashboard className="p-2 -ml-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors mt-1 shrink-0" />
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Grid className="w-6 h-6 text-violet-500" />
              All Services Inventory
            </h2>
            <p className="text-slate-500">
              {filteredServices.length} of {services.length} services •
              Last sync: {formatLastSyncLabel(lastSync)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Auto-sync indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
            <div className="w-2 h-2 bg-[#22c55e10]0 rounded-full animate-pulse" />
            <span className="text-slate-500 text-sm">Auto-sync: 1h</span>
          </div>
          
          {/* Sync button */}
          <button
            onClick={() => void startSync()}
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

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {groupErrors.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Degraded inventory groups
          </div>
          <ul className="list-disc space-y-1 pl-5">
            {groupErrors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
          <p className="mt-2 text-amber-800/80">
            An empty list for a group means none exist. A message above means that group&apos;s fetch failed.
          </p>
        </div>
      )}

      {accountWideNotice && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          KMS keys and Secrets are listed account-wide (not filtered by system). DynamoDB and subnets remain system-scoped.
        </div>
      )}

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
        <div className="bg-[#ef444410] border border-[#ef444440] rounded-xl p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-[#ef4444] mb-4">{error}</p>
          <button
            onClick={fetchServices}
            className="px-4 py-2 bg-[#ef444410]0 text-white rounded-lg hover:bg-red-600"
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
                    <ServiceTypeBadge type={service.type} variant="tile" size={38} />
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm leading-tight truncate max-w-[120px]">
                        {service.name}
                      </h3>
                      <p className="text-xs text-slate-500">{service.type}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    isActiveLikeStatus(service.status)
                      ? 'bg-[#22c55e20] text-[#22c55e]'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {formatStatusLabel(service.status)}
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
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                    {formatRegionLabel(service.region)}
                  </span>
                  {service.accountId && accountScope.accountId === 'all' && (
                    <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded text-xs font-mono">
                      {service.accountId}
                    </span>
                  )}
                  {service.encryption === 'ENCRYPTED' && (
                    <span className="px-2 py-0.5 bg-[#22c55e20] text-[#22c55e] rounded text-xs flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Encrypted
                    </span>
                  )}
                  {service.encryption === UNKNOWN && (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                      Encryption {UNKNOWN}
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
                {accountScope.accountId === 'all' && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Account</th>
                )}
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
                        <ServiceTypeBadge type={service.type} variant="tile" size={30} />
                        <span className="font-medium text-slate-900">{service.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{service.type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${style.bg} ${style.text}`}>
                        {service.category}
                      </span>
                    </td>
                    {accountScope.accountId === 'all' && (
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{service.accountId || 'Unknown'}</td>
                    )}
                    <td className="px-4 py-3 text-slate-600 text-sm">{formatRegionLabel(service.region)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        isActiveLikeStatus(service.status)
                          ? 'bg-[#22c55e20] text-[#22c55e]'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {formatStatusLabel(service.status)}
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
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-4">
                <ServiceTypeBadge type={selectedService.type} variant="tile" size={44} />
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{selectedService.name}</h2>
                  <p className="text-slate-500">{selectedService.type} • {selectedService.category}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedService(null)
                  setActiveTab('overview')
                }}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Tabs */}
            {(getIAMRoleName(selectedService) || CONFIG_TAB_LABEL[selectedService.type]) && (
              <div className="flex border-b bg-slate-50">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-6 py-3 font-medium text-sm transition-colors ${
                    activeTab === 'overview'
                      ? 'border-b-2 border-violet-600 text-violet-600 bg-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Overview
                </button>
                {CONFIG_TAB_LABEL[selectedService.type] && (
                  <button
                    onClick={() => setActiveTab('config')}
                    className={`px-6 py-3 font-medium text-sm transition-colors flex items-center gap-2 ${
                      activeTab === 'config'
                        ? 'border-b-2 border-violet-600 text-violet-600 bg-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    {CONFIG_TAB_LABEL[selectedService.type]}
                  </button>
                )}
                {getIAMRoleName(selectedService) && (
                  <button
                    onClick={() => setActiveTab('iam')}
                    className={`px-6 py-3 font-medium text-sm transition-colors flex items-center gap-2 ${
                      activeTab === 'iam'
                        ? 'border-b-2 border-violet-600 text-violet-600 bg-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Key className="w-4 h-4" />
                    IAM Role & Policies
                  </button>
                )}
              </div>
            )}
            
            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {activeTab === 'config' && CONFIG_TAB_LABEL[selectedService.type] ? (
                <ResourceConfigTab
                  resourceId={selectedService.id}
                  resourceType={selectedService.type}
                  systemName={systemName}
                />
              ) : activeTab !== 'iam' || !getIAMRoleName(selectedService) ? (
                <>
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
                          <dd className="text-slate-900">{formatRegionLabel(selectedService.region)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Status</dt>
                          <dd className={isActiveLikeStatus(selectedService.status) ? 'text-[#22c55e]' : 'text-slate-600'}>
                            {formatStatusLabel(selectedService.status)}
                          </dd>
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
                        {/* `!= null` (loose) rather than `!== undefined`: null
                            passes the strict check, and React renders it as
                            nothing — so the row appeared with its "Used
                            Permissions" label and a blank value beside it.
                            Omitting the row is the honest render for a count
                            that was never measured. */}
                        {selectedService.usedCount != null && (
                          <div className="flex justify-between">
                            <dt className="text-slate-500">Used Permissions</dt>
                            <dd className="text-[#22c55e]">{selectedService.usedCount}</dd>
                          </div>
                        )}
                        {selectedService.gapCount != null && (
                          <div className="flex justify-between">
                            <dt className="text-slate-500">Unused Permissions</dt>
                            <dd className="text-[#ef4444]">{selectedService.gapCount}</dd>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Encrypted</dt>
                          <dd>{formatEncryptionLabel(selectedService.encryption)}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  
                  {/* Raw details */}
                  {selectedService.details && (
                    <div className="bg-slate-900 rounded-xl p-4">
                      <h3 className="text-sm font-medium text-slate-400 mb-3">Raw Details</h3>
                      <pre className="text-xs text-slate-300 overflow-x-auto max-h-64">
                        {JSON.stringify(selectedService.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                /* IAM Overview Tab */
                <div className="space-y-6">
                  {iamLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="w-8 h-8 animate-spin text-violet-500" />
                      <span className="ml-3 text-slate-600">Loading IAM data...</span>
                    </div>
                  ) : iamError ? (
                    <div className="bg-[#ef444410] border border-[#ef444440] rounded-xl p-6 text-center">
                      <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                      <p className="text-[#ef4444]">{iamError}</p>
                      <p className="text-sm text-[#ef4444] mt-2">Role: {getIAMRoleName(selectedService)}</p>
                    </div>
                  ) : iamData ? (
                    <>
                      {/* Role Header */}
                      <div className="bg-white rounded-xl p-6 border border-violet-200">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-violet-100 flex items-center justify-center">
                              <Key className="w-6 h-6 text-violet-600" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-slate-900">{iamData.role_name || getIAMRoleName(selectedService)}</h3>
                              {iamData.role_arn && (
                                <p className="text-xs font-mono text-slate-600 mt-1 break-all">{iamData.role_arn}</p>
                              )}
                            </div>
                          </div>
                          {iamData.summary?.lp_score !== undefined && (
                            <div className={`px-4 py-2 rounded-lg font-bold text-lg ${
                              iamData.summary.lp_score >= 80 ? 'bg-[#22c55e20] text-[#22c55e]' :
                              iamData.summary.lp_score >= 50 ? 'bg-[#f9731620] text-[#f97316]' :
                              'bg-[#ef444420] text-[#ef4444]'
                            }`}>
                              {iamData.summary.lp_score}% LP Score
                            </div>
                          )}
                        </div>

                        {/* Permission Stats */}
                        <div className="grid grid-cols-3 gap-4 mt-4">
                          <div className="bg-white rounded-lg p-3">
                            <div className="text-xs text-slate-500 mb-1">Total Permissions</div>
                            <div className="text-2xl font-bold text-slate-900">
                              {iamData.summary?.allowed_count || iamData.allowed_count || 0}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <div className="text-xs text-slate-500 mb-1">Used</div>
                            <div className="text-2xl font-bold text-[#22c55e]">
                              {iamData.summary?.used_count || iamData.used_count || 0}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <div className="text-xs text-slate-500 mb-1">Unused</div>
                            <div className="text-2xl font-bold text-[#ef4444]">
                              {iamData.summary?.unused_count || iamData.unused_count || 0}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Trust Policy */}
                      {iamData.trust_policy && (
                        <div className="bg-slate-50 rounded-xl p-4 border">
                          <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Trust Relationship
                          </h4>
                          <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">
                            {JSON.stringify(iamData.trust_policy, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Attached Policies */}
                      {iamData.policy_analysis && iamData.policy_analysis.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Attached Policies ({iamData.policy_analysis.length})
                          </h4>
                          {iamData.policy_analysis.map((policy: any, idx: number) => {
                            const policyName = policy.policy_name || policy.name || `Policy ${idx + 1}`
                            const isExpanded = expandedPolicies.has(policyName)
                            const permissions = policy.all_permissions || policy.permissions || []
                            const usedPerms = policy.used_permissions || []
                            const unusedPerms = policy.unused_permissions || []
                            
                            return (
                              <div key={idx} className="border rounded-lg overflow-hidden">
                                <button
                                  onClick={() => togglePolicy(policyName)}
                                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left ${
                                    policy.has_admin_access ? 'bg-[#ef444410]' : 
                                    unusedPerms.length > 0 ? 'bg-[#f9731610]' : ''
                                  }`}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-slate-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-400" />
                                  )}
                                  <FileText className="w-4 h-4 text-slate-500" />
                                  <div className="flex-1">
                                    <span className="font-medium">{policyName}</span>
                                    <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                                      policy.policy_type?.toLowerCase().includes('inline') 
                                        ? 'bg-[#3b82f620] text-[#3b82f6]' 
                                        : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {policy.policy_type || 'managed'}
                                    </span>
                                  </div>
                                  {policy.has_admin_access && (
                                    <span className="px-2 py-0.5 bg-[#ef444420] text-[#ef4444] text-xs font-medium rounded">
                                      ADMIN
                                    </span>
                                  )}
                                  {unusedPerms.length > 0 && !policy.has_admin_access && (
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                  )}
                                  <span className="text-sm text-slate-500">{permissions.length} permissions</span>
                                </button>
                                
                                {isExpanded && (
                                  <div className="border-t px-4 py-3 bg-slate-50 space-y-3">
                                    {policy.policy_arn && (
                                      <div className="text-xs">
                                        <span className="text-slate-500">ARN: </span>
                                        <span className="font-mono text-slate-700 break-all">{policy.policy_arn}</span>
                                      </div>
                                    )}
                                    {permissions.length > 0 && (
                                      <div>
                                        <div className="text-xs font-medium text-slate-700 mb-2">
                                          All Permissions ({permissions.length})
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {permissions.slice(0, 15).map((perm: string, i: number) => (
                                            <span key={i} className="px-2 py-1 bg-white border rounded text-xs font-mono">
                                              {perm}
                                            </span>
                                          ))}
                                          {permissions.length > 15 && (
                                            <span className="px-2 py-1 text-slate-500 text-xs">
                                              +{permissions.length - 15} more
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Used Permissions */}
                      {iamData.used_permissions && iamData.used_permissions.length > 0 && (
                        <div>
                          <button
                            onClick={() => setShowUsedPerms(!showUsedPerms)}
                            className="flex items-center gap-2 text-sm font-medium text-[#22c55e] mb-2 hover:text-[#22c55e]"
                          >
                            {showUsedPerms ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            <CheckCircle className="w-4 h-4" />
                            {iamData.used_permissions.length} Used Permissions
                          </button>
                          {showUsedPerms && (
                            <div className="p-3 bg-[#22c55e10] border border-[#22c55e40] rounded-lg">
                              <div className="flex flex-wrap gap-1.5">
                                {iamData.used_permissions.slice(0, 20).map((perm: string, i: number) => (
                                  <span key={i} className="px-2 py-1 bg-[#22c55e20] text-[#22c55e] rounded text-xs font-mono">
                                    {perm}
                                  </span>
                                ))}
                                {iamData.used_permissions.length > 20 && (
                                  <span className="px-2 py-1 text-[#22c55e] text-xs">
                                    +{iamData.used_permissions.length - 20} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Unused Permissions */}
                      {iamData.unused_permissions && iamData.unused_permissions.length > 0 && (
                        <div>
                          <button
                            onClick={() => setShowUnusedPerms(!showUnusedPerms)}
                            className="flex items-center gap-2 text-sm font-medium text-[#f97316] mb-2 hover:text-[#f97316]"
                          >
                            {showUnusedPerms ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            <AlertTriangle className="w-4 h-4" />
                            {iamData.unused_permissions.length} Unused Permissions
                          </button>
                          {showUnusedPerms && (
                            <div className="p-3 bg-[#f9731610] border border-[#f9731640] rounded-lg">
                              <div className="flex flex-wrap gap-1.5">
                                {iamData.unused_permissions.slice(0, 15).map((perm: string, i: number) => (
                                  <span key={i} className="px-2 py-1 bg-[#f9731620] text-[#f97316] rounded text-xs font-mono flex items-center gap-1">
                                    {perm}
                                    <X className="w-3 h-3 text-amber-500" />
                                  </span>
                                ))}
                                {iamData.unused_permissions.length > 15 && (
                                  <span className="px-2 py-1 text-[#f97316] text-xs">
                                    +{iamData.unused_permissions.length - 15} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <Key className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                      <p className="text-slate-500">No IAM data available</p>
                      <p className="text-sm text-slate-400 mt-1">Role: {getIAMRoleName(selectedService)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => {
                  setSelectedService(null)
                  setActiveTab('overview')
                }}
                className="px-4 py-2 border rounded-lg hover:bg-slate-50"
              >
                Close
              </button>
              {activeTab === 'iam' && iamData && (
                <button 
                  onClick={() => window.open(`https://console.aws.amazon.com/iam/home#/roles/${iamData.role_name}`, '_blank')}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in AWS Console
                </button>
              )}
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
