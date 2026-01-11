'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, Server, Database, Key, Shield, Globe, Cloud, Layers,
  RefreshCw, CheckCircle, Search, ArrowRight, ChevronDown, ChevronUp,
  Activity, Clock, Zap, Network, Eye, Filter, AlertTriangle, Lock,
  Radio, Wifi, Building2, ExternalLink
} from 'lucide-react'
import ResourceSelector from './resource-selector'

interface Resource {
  id: string
  name: string
  type: string
  arn?: string
}

interface Connection {
  id: string
  name: string
  type: string
  port: number | string
  protocol: string
  direction: 'inbound' | 'outbound'
  relationshipType: string // ACTUAL_TRAFFIC, ACCESSES_RESOURCE, IN_VPC, etc.
  verified: boolean
  lastSeen?: string
  firstSeen?: string
  hitCount?: number
}

interface DependencyData {
  inbound: Connection[]
  outbound: Connection[]
  iamRoles: { name: string }[]
  securityGroups: string[]
  loading: boolean
}

// Behavioral bucket types for traffic aggregation
type BucketType = 'internal' | 'external_api' | 'anomalous' | 'maintenance'

interface BehavioralBucket {
  type: BucketType
  label: string
  description: string
  icon: any
  color: string
  bgColor: string
  borderColor: string
  connections: Connection[]
  totalHits: number
  uniquePorts: Set<number | string>
  riskLevel: 'low' | 'medium' | 'high'
}

interface AggregatedConnection {
  name: string
  type: string
  ports: (number | string)[]
  protocols: string[]
  totalHits: number
  lastSeen?: string
  connections: Connection[]
  // Identity evidence fields
  iamPrincipal?: string
  iamAction?: string
  authMethod?: string
  insightType?: 'healthy' | 'anomaly' | 'critical' | 'info'
  insightMessage?: string
}

// Identity Evidence types
interface IdentityConnection {
  direction: 'inbound' | 'outbound'
  peer: {
    id: string
    name: string
    arn?: string
    ip?: string
    type: string
  }
  network: {
    port?: number
    protocol?: string
    hit_count: number
    first_seen?: string
    last_seen?: string
    relationship_type: string
  }
  identity: {
    iam_principal?: string
    iam_principal_arn?: string
    iam_action?: string
    auth_method: string
  }
  insight: {
    type: 'healthy' | 'anomaly' | 'critical' | 'info'
    message: string
  }
}

// Risk factor from backend risk scoring
interface RiskFactor {
  factor: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  score: number
}

// Credential source types from CloudTrail
type CredentialSourceType = 'AssumedRole' | 'IAMUser' | 'AWSService' | 'Root' | 'FederatedUser' | 'Unknown'

interface IAMAccessEvent {
  principal: {
    arn: string
    name: string
    type: string
  }
  credential_source_type?: CredentialSourceType
  action?: string
  hit_count: number
  first_seen?: string
  last_seen?: string
  insight: {
    type: 'healthy' | 'anomaly' | 'critical' | 'info'
    message: string
    risk_score?: number
    risk_factors?: RiskFactor[]
  }
}

interface IdentityEvidence {
  connections: IdentityConnection[]
  iam_access_events: IAMAccessEvent[]
  summary: {
    total_connections: number
    healthy: number
    anomaly: number
    critical: number
    iam_events: number
    has_root_access: boolean
  }
  loading: boolean
}

interface Props {
  systemName: string
  selectedResource: Resource | null
  resources: Resource[]
  resourcesLoading: boolean
  onSelectResource: (resource: Resource) => void
  onBackToGraph: () => void
}

const RESOURCE_COLORS: Record<string, string> = {
  Lambda: '#F58536',
  EC2: '#F58536',
  RDS: '#3F48CC',
  DynamoDB: '#3F48CC',
  S3Bucket: '#759C3E',
  S3: '#759C3E',
  SecurityGroup: '#7B2FBE',
  IAMRole: '#759C3E',
  Internet: '#D13212',
  IP: '#64748b',
  NetworkEndpoint: '#64748b',
  Principal: '#8B5CF6',
  default: '#64748b',
}

const RESOURCE_ICONS: Record<string, any> = {
  Lambda: Cloud,
  EC2: Server,
  RDS: Database,
  DynamoDB: Database,
  S3Bucket: Database,
  S3: Database,
  SecurityGroup: Shield,
  IAMRole: Key,
  Internet: Globe,
  NetworkEndpoint: Globe,
  Principal: Key,
  default: Layers,
}

// Relationship type categories
const RELATIONSHIP_CATEGORIES = {
  traffic: ['ACTUAL_TRAFFIC'],
  access: ['ACCESSES_RESOURCE'],
  infrastructure: ['IN_VPC', 'IN_SUBNET', 'HAS_SECURITY_GROUP', 'CONTAINS', 'BELONGS_TO_SYSTEM'],
}

// Format relative time
function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// Get category color for relationship type
function getRelationshipColor(relType: string): string {
  if (RELATIONSHIP_CATEGORIES.traffic.includes(relType)) return 'emerald'
  if (RELATIONSHIP_CATEGORIES.access.includes(relType)) return 'violet'
  return 'slate'
}

// Check if IP is internal (private RFC1918 ranges)
function isInternalIP(name: string): boolean {
  // Match 10.x.x.x, 172.16-31.x.x, 192.168.x.x patterns
  const privateIPPatterns = [
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/,
    /^192\.168\.\d{1,3}\.\d{1,3}$/,
  ]
  return privateIPPatterns.some(pattern => pattern.test(name))
}

// Check if IP/host is AWS service
function isAWSService(name: string): boolean {
  const awsPatterns = [
    /\.amazonaws\.com$/i,
    /\.aws\.amazon\.com$/i,
    /^ec2-\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}/,
    /^ip-\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}/,
    /^3\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // AWS IP range
    /^52\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // AWS IP range
    /^54\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // AWS IP range
  ]
  return awsPatterns.some(pattern => pattern.test(name))
}

// Classify a connection into a behavioral bucket
function classifyConnection(conn: Connection): BucketType {
  const port = Number(conn.port) || 0
  const protocol = (conn.protocol || '').toUpperCase()
  const name = conn.name || ''

  // UDP/NTP Maintenance - Port 123 or UDP protocol with time sync
  if (port === 123 || (protocol === 'UDP' && port > 0)) {
    return 'maintenance'
  }

  // Internal infrastructure - private IPs
  if (isInternalIP(name)) {
    return 'internal'
  }

  // External API Services - HTTPS (443) to AWS or known API endpoints
  if (port === 443 && (isAWSService(name) || conn.verified)) {
    return 'external_api'
  }

  // Anomalous - unverified, unusual ports, or mixed traffic
  const anomalousPorts = [80, 3306, 5432, 6379, 27017] // HTTP, MySQL, PostgreSQL, Redis, MongoDB
  if (!conn.verified || anomalousPorts.includes(port) || (port !== 443 && port > 0)) {
    return 'anomalous'
  }

  // Default to external API for verified HTTPS
  return 'external_api'
}

// Aggregate connections by endpoint (group same destinations)
function aggregateConnections(connections: Connection[]): AggregatedConnection[] {
  const groups = new Map<string, AggregatedConnection>()

  for (const conn of connections) {
    const key = conn.name.toLowerCase()

    if (groups.has(key)) {
      const group = groups.get(key)!
      if (conn.port && !group.ports.includes(conn.port)) {
        group.ports.push(conn.port)
      }
      if (conn.protocol && !group.protocols.includes(conn.protocol)) {
        group.protocols.push(conn.protocol)
      }
      group.totalHits += conn.hitCount || 0
      group.connections.push(conn)
      // Update lastSeen if newer
      if (conn.lastSeen && (!group.lastSeen || new Date(conn.lastSeen) > new Date(group.lastSeen))) {
        group.lastSeen = conn.lastSeen
      }
    } else {
      groups.set(key, {
        name: conn.name,
        type: conn.type,
        ports: conn.port ? [conn.port] : [],
        protocols: conn.protocol ? [conn.protocol] : [],
        totalHits: conn.hitCount || 0,
        lastSeen: conn.lastSeen,
        connections: [conn]
      })
    }
  }

  // Sort by total hits descending
  return Array.from(groups.values()).sort((a, b) => b.totalHits - a.totalHits)
}

// Create behavioral buckets from connections
function createBehavioralBuckets(connections: Connection[]): BehavioralBucket[] {
  const bucketDefs: Omit<BehavioralBucket, 'connections' | 'totalHits' | 'uniquePorts'>[] = [
    {
      type: 'internal',
      label: 'System Infrastructure',
      description: 'Internal VPC traffic (10.0.x.x)',
      icon: Building2,
      color: 'text-slate-600',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-300',
      riskLevel: 'low',
    },
    {
      type: 'external_api',
      label: 'External API Services',
      description: 'Verified HTTPS to AWS/APIs',
      icon: Lock,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-300',
      riskLevel: 'low',
    },
    {
      type: 'anomalous',
      label: 'Anomalous / Unverified',
      description: 'Unusual ports or unverified traffic',
      icon: AlertTriangle,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
      riskLevel: 'medium',
    },
    {
      type: 'maintenance',
      label: 'UDP / NTP Maintenance',
      description: 'Time sync and UDP services',
      icon: Radio,
      color: 'text-slate-500',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-200',
      riskLevel: 'low',
    },
  ]

  // Group connections by bucket type
  const grouped = new Map<BucketType, Connection[]>()
  for (const conn of connections) {
    const bucketType = classifyConnection(conn)
    if (!grouped.has(bucketType)) {
      grouped.set(bucketType, [])
    }
    grouped.get(bucketType)!.push(conn)
  }

  // Build buckets with metrics
  return bucketDefs.map(def => {
    const conns = grouped.get(def.type) || []
    const totalHits = conns.reduce((sum, c) => sum + (c.hitCount || 0), 0)
    const uniquePorts = new Set(conns.filter(c => c.port).map(c => c.port))

    // Adjust risk level based on hit counts and unverified traffic
    let riskLevel = def.riskLevel
    if (def.type === 'anomalous') {
      const unverifiedHits = conns.filter(c => !c.verified).reduce((sum, c) => sum + (c.hitCount || 0), 0)
      if (unverifiedHits > 1000) riskLevel = 'high'
      else if (unverifiedHits > 100) riskLevel = 'medium'
    }

    return {
      ...def,
      connections: conns,
      totalHits,
      uniquePorts,
      riskLevel,
    }
  }).filter(bucket => bucket.connections.length > 0) // Only show non-empty buckets
}

// Get heat map color based on hit count relative to max
function getHeatColor(hits: number, maxHits: number): string {
  if (maxHits === 0) return 'bg-slate-100'
  const ratio = hits / maxHits
  if (ratio > 0.75) return 'bg-red-100'
  if (ratio > 0.5) return 'bg-orange-100'
  if (ratio > 0.25) return 'bg-yellow-100'
  return 'bg-slate-50'
}

// Insight Badge Component for behavioral insights
function InsightBadge({ type, message }: { type: 'healthy' | 'anomaly' | 'critical' | 'info'; message?: string }) {
  const configs = {
    healthy: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      icon: CheckCircle,
      label: 'Healthy'
    },
    anomaly: {
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      icon: AlertTriangle,
      label: 'Anomaly'
    },
    critical: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      icon: AlertTriangle,
      label: 'Critical'
    },
    info: {
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      icon: Eye,
      label: 'Info'
    }
  }

  const config = configs[type]
  const IconComp = config.icon

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
      title={message}
    >
      <IconComp className="w-3 h-3" />
      {config.label}
    </div>
  )
}

// IAM Action Badge
function IAMActionBadge({ action }: { action?: string }) {
  if (!action) return null

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-xs font-mono">
      <Key className="w-3 h-3" />
      {action.length > 20 ? action.slice(0, 20) + '...' : action}
    </span>
  )
}

// Credential Source Badge - shows how the principal authenticated
function CredentialSourceBadge({ source }: { source?: CredentialSourceType }) {
  if (!source || source === 'Unknown') return null

  const configs: Record<CredentialSourceType, { bg: string; text: string; icon: any; label: string }> = {
    'AssumedRole': { bg: 'bg-purple-100', text: 'text-purple-700', icon: Shield, label: 'Assumed Role' },
    'IAMUser': { bg: 'bg-blue-100', text: 'text-blue-700', icon: Key, label: 'IAM User' },
    'AWSService': { bg: 'bg-slate-100', text: 'text-slate-600', icon: Cloud, label: 'AWS Service' },
    'Root': { bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle, label: 'Root Account' },
    'FederatedUser': { bg: 'bg-orange-100', text: 'text-orange-700', icon: Globe, label: 'Federated' },
    'Unknown': { bg: 'bg-slate-100', text: 'text-slate-500', icon: Eye, label: 'Unknown' }
  }

  const config = configs[source] || configs['Unknown']
  const IconComp = config.icon

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <IconComp className="w-3 h-3" />
      {config.label}
    </span>
  )
}

// Risk Score Badge - shows numerical risk score with color coding
function RiskScoreBadge({ score, factors }: { score?: number; factors?: RiskFactor[] }) {
  if (score === undefined || score === null) return null

  const color = score >= 60 ? 'red' : score >= 30 ? 'amber' : 'green'
  const colors = {
    red: 'bg-red-100 text-red-700 border-red-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    green: 'bg-green-100 text-green-700 border-green-200'
  }

  // Build tooltip with risk factors
  const tooltip = factors && factors.length > 0
    ? factors.filter(f => f.score > 0).map(f => `${f.factor} (+${f.score})`).join('\n')
    : undefined

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-xs font-medium ${colors[color]}`}
      title={tooltip}
    >
      <span className="font-bold">{score}</span>
      <span className="opacity-75">risk</span>
    </div>
  )
}

// Connection Card Component with behavioral data
function ConnectionCard({ conn, direction }: { conn: Connection; direction: 'inbound' | 'outbound' }) {
  const Icon = RESOURCE_ICONS[conn.type] || RESOURCE_ICONS.default
  const color = RESOURCE_COLORS[conn.type] || RESOURCE_COLORS.default
  const borderColor = direction === 'inbound' ? 'border-green-200' : 'border-blue-200'
  const hoverBorder = direction === 'inbound' ? 'hover:border-green-400' : 'hover:border-blue-400'
  const relColor = getRelationshipColor(conn.relationshipType)

  return (
    <div className={`bg-white rounded-lg border ${borderColor} ${hoverBorder} p-3 transition-all hover:shadow-sm`}>
      <div className="flex items-start gap-2">
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm text-slate-800 truncate" title={conn.name}>
              {conn.name}
            </span>
            {conn.verified && (
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            )}
          </div>

          {/* Port & Protocol */}
          <div className="flex items-center gap-2 mt-1">
            {conn.port ? (
              <span className="text-xs px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-600">
                :{conn.port}
              </span>
            ) : null}
            {conn.protocol && conn.protocol !== 'TCP' && (
              <span className="text-xs text-slate-400">{conn.protocol}</span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded bg-${relColor}-50 text-${relColor}-600`}>
              {conn.relationshipType.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Behavioral data */}
          {(conn.hitCount || conn.lastSeen) && (
            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
              {conn.hitCount ? (
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {conn.hitCount} hits
                </span>
              ) : null}
              {conn.lastSeen ? (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(conn.lastSeen)}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Behavioral Insights Card
function InsightCard({ icon: IconComp, label, value, subtext, color }: {
  icon: any; label: string; value: string | number; subtext?: string; color: string
}) {
  const bgColors: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200',
    blue: 'bg-blue-50 border-blue-200',
    violet: 'bg-violet-50 border-violet-200',
    amber: 'bg-amber-50 border-amber-200',
  }
  const textColors: Record<string, string> = {
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    violet: 'text-violet-600',
    amber: 'text-amber-600',
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${bgColors[color]}`}>
      <IconComp className={`w-5 h-5 ${textColors[color]}`} />
      <div>
        <div className="text-lg font-semibold text-slate-800">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
        {subtext && <div className="text-xs text-slate-400">{subtext}</div>}
      </div>
    </div>
  )
}

// Behavioral Bucket Card Component
function BucketCard({
  bucket,
  maxHits,
  expanded,
  onToggle
}: {
  bucket: BehavioralBucket
  maxHits: number
  expanded: boolean
  onToggle: () => void
}) {
  const IconComp = bucket.icon
  const aggregated = aggregateConnections(bucket.connections)

  const riskColors = {
    low: 'bg-green-500',
    medium: 'bg-amber-500',
    high: 'bg-red-500',
  }

  return (
    <div className={`rounded-xl border-2 ${bucket.borderColor} overflow-hidden`}>
      {/* Bucket Header */}
      <button
        onClick={onToggle}
        className={`w-full ${bucket.bgColor} px-4 py-3 flex items-center justify-between hover:opacity-90 transition-opacity cursor-pointer`}
      >
        <div className="flex items-center gap-3">
          <IconComp className={`w-5 h-5 ${bucket.color}`} />
          <div className="text-left">
            <div className="font-semibold text-slate-800">{bucket.label}</div>
            <div className="text-xs text-slate-500">{bucket.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-bold text-slate-800">{bucket.connections.length}</div>
            <div className="text-xs text-slate-500">connections</div>
          </div>
          <div className="text-right">
            <div className="font-bold text-slate-800">{bucket.totalHits.toLocaleString()}</div>
            <div className="text-xs text-slate-500">hits</div>
          </div>
          <div className={`w-2 h-2 rounded-full ${riskColors[bucket.riskLevel]}`} title={`${bucket.riskLevel} risk`} />
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="bg-white max-h-[300px] overflow-y-auto">
          {aggregated.length === 0 ? (
            <div className="text-center text-slate-400 py-6">
              <p className="text-sm">No connections in this bucket</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {aggregated.map((agg, idx) => {
                const heatColor = getHeatColor(agg.totalHits, maxHits)
                const Icon = RESOURCE_ICONS[agg.type] || RESOURCE_ICONS.default
                const iconColor = RESOURCE_COLORS[agg.type] || RESOURCE_COLORS.default

                return (
                  <div
                    key={agg.name + '-' + idx}
                    className={`flex items-center justify-between px-4 py-2.5 ${heatColor} hover:bg-opacity-80`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: iconColor }}
                      >
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-slate-800 truncate" title={agg.name}>
                          {agg.name}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          {agg.ports.length > 0 && (
                            <span className="font-mono">
                              {agg.ports.length <= 3
                                ? agg.ports.map(p => `:${p}`).join(', ')
                                : `:${agg.ports[0]}, +${agg.ports.length - 1} more`}
                            </span>
                          )}
                          {agg.protocols.length > 0 && (
                            <span className="text-slate-400">{agg.protocols.join('/')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm font-semibold text-slate-700">
                          <Zap className="w-3 h-3 text-amber-500" />
                          {agg.totalHits.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 w-16 text-right">
                        {formatRelativeTime(agg.lastSeen)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Stats Badge Component
function StatBadge({ count, label, color }: { count: number; label: string; color: 'green' | 'blue' | 'purple' | 'amber' }) {
  const colors = {
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    amber: 'bg-amber-100 text-amber-700',
  }
  const dotColors = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${colors[color]}`}>
      <div className={`w-2 h-2 rounded-full ${dotColors[color]}`} />
      <span className="font-semibold">{count}</span>
      <span className="text-xs opacity-80">{label}</span>
    </div>
  )
}

type FilterType = 'all' | 'traffic' | 'access' | 'infrastructure'

export default function ResourceView({
  systemName,
  selectedResource,
  resources,
  resourcesLoading,
  onSelectResource,
  onBackToGraph
}: Props) {
  const [dependencies, setDependencies] = useState<DependencyData>({
    inbound: [],
    outbound: [],
    iamRoles: [],
    securityGroups: [],
    loading: true
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [viewMode, setViewMode] = useState<'buckets' | 'columns'>('buckets')
  const [expandedBuckets, setExpandedBuckets] = useState<Set<BucketType>>(new Set(['anomalous']))
  const [showIdentityOverlay, setShowIdentityOverlay] = useState(false)
  const [identityEvidence, setIdentityEvidence] = useState<IdentityEvidence>({
    connections: [],
    iam_access_events: [],
    summary: {
      total_connections: 0,
      healthy: 0,
      anomaly: 0,
      critical: 0,
      iam_events: 0,
      has_root_access: false
    },
    loading: false
  })

  // Fetch dependency data - show ALL connections with full behavioral data
  useEffect(() => {
    if (!selectedResource) return

    const fetchDependencies = async () => {
      setDependencies(prev => ({ ...prev, loading: true }))

      try {
        const connectionsRes = await fetch(
          `/api/proxy/resource-view/${encodeURIComponent(selectedResource.id)}/connections`
        )

        let inbound: Connection[] = []
        let outbound: Connection[] = []

        if (connectionsRes.ok) {
          const data = await connectionsRes.json()
          const connections = data.connections || {}

          // Process inbound
          ;(connections.inbound || []).forEach((conn: any) => {
            const rel = conn.relationship || {}
            const source = conn.source || {}
            const relType = rel.type || rel.relationship_type || 'UNKNOWN'

            inbound.push({
              id: source.id || source.arn || `inbound-${Math.random()}`,
              name: source.name || source.arn?.split(':').pop() || source.id || 'Unknown',
              type: source.type || 'NetworkEndpoint',
              port: rel.port || 0,
              protocol: (rel.protocol || '').toUpperCase(),
              direction: 'inbound',
              relationshipType: relType,
              verified: relType === 'ACTUAL_TRAFFIC',
              lastSeen: rel.last_seen,
              firstSeen: rel.first_seen,
              hitCount: rel.hit_count || 0
            })
          })

          // Process outbound
          ;(connections.outbound || []).forEach((conn: any) => {
            const rel = conn.relationship || {}
            const target = conn.target || {}
            const relType = rel.type || rel.relationship_type || 'UNKNOWN'

            outbound.push({
              id: target.id || target.arn || `outbound-${Math.random()}`,
              name: target.name || target.arn?.split(':').pop() || target.id || 'Unknown',
              type: target.type || 'NetworkEndpoint',
              port: rel.port || 0,
              protocol: (rel.protocol || '').toUpperCase(),
              direction: 'outbound',
              relationshipType: relType,
              verified: relType === 'ACTUAL_TRAFFIC',
              lastSeen: rel.last_seen,
              firstSeen: rel.first_seen,
              hitCount: rel.hit_count || 0
            })
          })
        }

        setDependencies({
          inbound,
          outbound,
          iamRoles: [],
          securityGroups: [],
          loading: false
        })
      } catch (err) {
        console.error('Failed to fetch dependencies:', err)
        setDependencies(prev => ({ ...prev, loading: false }))
      }
    }

    fetchDependencies()
  }, [selectedResource])

  // Fetch identity evidence when overlay is enabled
  useEffect(() => {
    if (!selectedResource || !showIdentityOverlay) return

    const fetchIdentityEvidence = async () => {
      setIdentityEvidence(prev => ({ ...prev, loading: true }))

      try {
        const res = await fetch(
          `/api/proxy/resource-view/${encodeURIComponent(selectedResource.id)}/identity-evidence`
        )

        if (res.ok) {
          const data = await res.json()
          setIdentityEvidence({
            connections: data.connections || [],
            iam_access_events: data.iam_access_events || [],
            summary: data.summary || {
              total_connections: 0,
              healthy: 0,
              anomaly: 0,
              critical: 0,
              iam_events: 0,
              has_root_access: false
            },
            loading: false
          })
        } else {
          console.error('Failed to fetch identity evidence:', res.status)
          setIdentityEvidence(prev => ({ ...prev, loading: false }))
        }
      } catch (err) {
        console.error('Failed to fetch identity evidence:', err)
        setIdentityEvidence(prev => ({ ...prev, loading: false }))
      }
    }

    fetchIdentityEvidence()
  }, [selectedResource, showIdentityOverlay])

  // Compute behavioral insights
  const insights = useMemo(() => {
    const all = [...dependencies.inbound, ...dependencies.outbound]
    const trafficConns = all.filter(c => c.relationshipType === 'ACTUAL_TRAFFIC')
    const accessConns = all.filter(c => c.relationshipType === 'ACCESSES_RESOURCE')

    const totalHits = all.reduce((sum, c) => sum + (c.hitCount || 0), 0)
    const uniquePorts = new Set(all.filter(c => c.port).map(c => c.port)).size
    const uniqueEndpoints = new Set(all.map(c => c.name)).size

    // Find most recent activity
    const recentActivity = all
      .filter(c => c.lastSeen)
      .sort((a, b) => new Date(b.lastSeen!).getTime() - new Date(a.lastSeen!).getTime())[0]

    return {
      totalConnections: all.length,
      trafficConnections: trafficConns.length,
      accessConnections: accessConns.length,
      totalHits,
      uniquePorts,
      uniqueEndpoints,
      recentActivity: recentActivity?.lastSeen,
    }
  }, [dependencies])

  // Create behavioral buckets
  const behavioralBuckets = useMemo(() => {
    const allConns = [...dependencies.inbound, ...dependencies.outbound]
    return createBehavioralBuckets(allConns)
  }, [dependencies])

  // Get max hits for heat map coloring
  const maxHitsForHeatMap = useMemo(() => {
    const allConns = [...dependencies.inbound, ...dependencies.outbound]
    return Math.max(...allConns.map(c => c.hitCount || 0), 1)
  }, [dependencies])

  // Toggle bucket expansion
  const toggleBucket = (type: BucketType) => {
    setExpandedBuckets(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  // Filter connections by type
  const filterConnections = (conns: Connection[]): Connection[] => {
    if (activeFilter === 'all') return conns
    const types = RELATIONSHIP_CATEGORIES[activeFilter] || []
    return conns.filter(c => types.includes(c.relationshipType))
  }

  const filteredInbound = useMemo(() => filterConnections(dependencies.inbound), [dependencies.inbound, activeFilter])
  const filteredOutbound = useMemo(() => filterConnections(dependencies.outbound), [dependencies.outbound, activeFilter])

  // All connections for table
  const allConnections = useMemo(() => {
    const all = [
      ...filteredInbound.map(c => ({ ...c, direction: 'inbound' as const })),
      ...filteredOutbound.map(c => ({ ...c, direction: 'outbound' as const }))
    ]

    if (!searchQuery) return all

    const query = searchQuery.toLowerCase()
    return all.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.type.toLowerCase().includes(query) ||
      String(c.port).includes(query) ||
      c.protocol.toLowerCase().includes(query) ||
      c.relationshipType.toLowerCase().includes(query)
    )
  }, [filteredInbound, filteredOutbound, searchQuery])

  const handleRefresh = () => {
    if (selectedResource) {
      setDependencies(prev => ({ ...prev, loading: true }))
      const currentResource = selectedResource
      onSelectResource({ ...currentResource })
    }
  }

  const Icon = selectedResource ? (RESOURCE_ICONS[selectedResource.type] || RESOURCE_ICONS.default) : Layers
  const resourceColor = selectedResource ? (RESOURCE_COLORS[selectedResource.type] || RESOURCE_COLORS.default) : '#64748b'

  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToGraph}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="h-6 w-px bg-slate-200" />

          <div className="w-[280px]">
            <ResourceSelector
              systemName={systemName}
              selectedResource={selectedResource}
              onSelectResource={onSelectResource}
              resources={resources}
              isLoading={resourcesLoading}
            />
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={dependencies.loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${dependencies.loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Content */}
      {!selectedResource ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mb-4">
            <Layers className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-700 mb-2">Select a Resource</h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Choose a resource to view its connections, dependencies, and behavioral insights
          </p>
        </div>
      ) : dependencies.loading ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
          <p className="text-sm text-slate-500">Loading connections...</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Resource Info Bar with Stats */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-100 to-white border-b">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
                style={{ backgroundColor: resourceColor }}
              >
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-800 text-lg">{selectedResource.name}</h2>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="px-2 py-0.5 bg-slate-200 rounded text-xs font-medium">
                    {selectedResource.type}
                  </span>
                  <span>{systemName}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatBadge count={dependencies.inbound.length} label="Inbound" color="green" />
              <StatBadge count={dependencies.outbound.length} label="Outbound" color="blue" />
              <StatBadge count={insights.trafficConnections} label="Traffic" color="amber" />
            </div>
          </div>

          {/* Behavioral Insights Section */}
          <div className="px-4 py-3 bg-white border-b">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Behavioral Insights</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <InsightCard
                icon={Zap}
                label="Total Hits"
                value={insights.totalHits.toLocaleString()}
                subtext="Observed connections"
                color="emerald"
              />
              <InsightCard
                icon={Network}
                label="Unique Endpoints"
                value={insights.uniqueEndpoints}
                subtext="IPs & resources"
                color="blue"
              />
              <InsightCard
                icon={Shield}
                label="Unique Ports"
                value={insights.uniquePorts}
                subtext="Network ports used"
                color="violet"
              />
              <InsightCard
                icon={Clock}
                label="Last Activity"
                value={formatRelativeTime(insights.recentActivity)}
                subtext="Most recent traffic"
                color="amber"
              />
            </div>
          </div>

          {/* View Mode Toggle & Filters */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-100 border-b">
            <div className="flex items-center gap-4">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border">
                <button
                  onClick={() => setViewMode('buckets')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    viewMode === 'buckets'
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Behavioral Buckets
                </button>
                <button
                  onClick={() => setViewMode('columns')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    viewMode === 'columns'
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Flow View
                </button>
              </div>

              {/* Identity Overlay Toggle */}
              <button
                onClick={() => setShowIdentityOverlay(!showIdentityOverlay)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  showIdentityOverlay
                    ? 'bg-violet-600 text-white border-violet-600 font-medium'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400 hover:text-violet-600'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                Identity Evidence
                {showIdentityOverlay && identityEvidence.summary.critical > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                    {identityEvidence.summary.critical}
                  </span>
                )}
              </button>

              {/* Filters (only show in columns view) */}
              {viewMode === 'columns' && (
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <div className="flex gap-1">
                    {[
                      { key: 'all', label: 'All', count: dependencies.inbound.length + dependencies.outbound.length },
                      { key: 'traffic', label: 'Traffic', count: insights.trafficConnections },
                      { key: 'access', label: 'IAM Access', count: insights.accessConnections },
                      { key: 'infrastructure', label: 'Infrastructure', count: dependencies.inbound.length + dependencies.outbound.length - insights.trafficConnections - insights.accessConnections },
                    ].map(({ key, label, count }) => (
                      <button
                        key={key}
                        onClick={() => setActiveFilter(key as FilterType)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          activeFilter === key
                            ? 'bg-white text-slate-900 shadow-sm font-medium'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {label} ({count})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bucket summary (only show in buckets view) */}
            {viewMode === 'buckets' && behavioralBuckets.length > 0 && !showIdentityOverlay && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{behavioralBuckets.length} behavioral categories</span>
                <span>•</span>
                <span>{behavioralBuckets.filter(b => b.riskLevel === 'high').length > 0 ? (
                  <span className="text-red-600 font-medium">
                    {behavioralBuckets.filter(b => b.riskLevel === 'high').length} high risk
                  </span>
                ) : behavioralBuckets.filter(b => b.riskLevel === 'medium').length > 0 ? (
                  <span className="text-amber-600 font-medium">
                    {behavioralBuckets.filter(b => b.riskLevel === 'medium').length} needs attention
                  </span>
                ) : (
                  <span className="text-green-600 font-medium">All normal</span>
                )}</span>
              </div>
            )}

            {/* Identity Evidence Summary (show when overlay is enabled) */}
            {showIdentityOverlay && (
              <div className="flex items-center gap-3 text-xs">
                {identityEvidence.loading ? (
                  <span className="text-slate-500">Loading identity evidence...</span>
                ) : (
                  <>
                    <span className="text-green-600 font-medium">
                      {identityEvidence.summary.healthy} Healthy
                    </span>
                    {identityEvidence.summary.anomaly > 0 && (
                      <span className="text-amber-600 font-medium">
                        {identityEvidence.summary.anomaly} Anomaly
                      </span>
                    )}
                    {identityEvidence.summary.critical > 0 && (
                      <span className="text-red-600 font-medium">
                        {identityEvidence.summary.critical} Critical
                      </span>
                    )}
                    {identityEvidence.summary.has_root_access && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                        Root Access Detected
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Identity Evidence Panel (show when overlay is enabled) */}
          {showIdentityOverlay && !identityEvidence.loading && identityEvidence.iam_access_events.length > 0 && (
            <div className="px-4 py-3 bg-violet-50 border-b border-violet-200">
              <div className="flex items-center gap-2 mb-3">
                <Key className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-medium text-violet-800">IAM Access Events</span>
                <span className="text-xs text-violet-500">({identityEvidence.iam_access_events.length})</span>
              </div>
              <div className="space-y-2">
                {identityEvidence.iam_access_events.slice(0, 5).map((event, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                      event.insight.type === 'critical'
                        ? 'bg-red-50 border-red-200'
                        : event.insight.type === 'anomaly'
                        ? 'bg-amber-50 border-amber-200'
                        : event.insight.type === 'healthy'
                        ? 'bg-green-50 border-green-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* Principal name with icon */}
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <Key className="w-4 h-4 text-violet-500 flex-shrink-0" />
                      <span className="font-semibold text-sm text-slate-800 truncate" title={event.principal.name}>
                        {event.principal.name}
                      </span>
                    </div>

                    {/* Credential Source Badge */}
                    <CredentialSourceBadge source={event.credential_source_type} />

                    {/* IAM Action */}
                    {event.action && <IAMActionBadge action={event.action} />}

                    {/* Hit count */}
                    <span className="text-xs text-slate-500 whitespace-nowrap">{event.hit_count} calls</span>

                    {/* Insight Badge */}
                    <InsightBadge type={event.insight.type} message={event.insight.message} />

                    {/* Risk Score */}
                    <RiskScoreBadge score={event.insight.risk_score} factors={event.insight.risk_factors} />
                  </div>
                ))}
                {identityEvidence.iam_access_events.length > 5 && (
                  <div className="text-xs text-violet-500 text-center pt-1">
                    +{identityEvidence.iam_access_events.length - 5} more principals
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Behavioral Buckets View */}
          {viewMode === 'buckets' ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {behavioralBuckets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Network className="w-12 h-12 mb-3 opacity-50" />
                  <p className="text-sm">No connections to categorize</p>
                </div>
              ) : (
                behavioralBuckets.map(bucket => (
                  <BucketCard
                    key={bucket.type}
                    bucket={bucket}
                    maxHits={maxHitsForHeatMap}
                    expanded={expandedBuckets.has(bucket.type)}
                    onToggle={() => toggleBucket(bucket.type)}
                  />
                ))
              )}
            </div>
          ) : (
            /* Three-Column Flow View */
            <div className="flex-1 flex gap-4 p-4 min-h-0 overflow-hidden">
            {/* Inbound Column */}
            <div className="flex-1 flex flex-col border-2 border-green-400 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="bg-green-50 px-4 py-2.5 border-b border-green-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-green-600 rotate-180" />
                  <span className="font-semibold text-green-700">INBOUND</span>
                </div>
                <span className="text-sm text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                  {filteredInbound.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredInbound.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No inbound connections</p>
                  </div>
                ) : (
                  filteredInbound.map((conn, idx) => (
                    <ConnectionCard key={conn.id + '-' + idx} conn={conn} direction="inbound" />
                  ))
                )}
              </div>
            </div>

            {/* Central Resource */}
            <div className="flex flex-col items-center justify-center px-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-6 border-t-2 border-dashed border-green-400" />
                <ArrowRight className="w-5 h-5 text-green-500" />
              </div>

              <div
                className="w-24 h-24 rounded-2xl flex flex-col items-center justify-center shadow-lg border-4 border-white"
                style={{ backgroundColor: resourceColor }}
              >
                <Icon className="w-8 h-8 text-white mb-1" />
                <span className="text-[10px] text-white/90 font-medium">{selectedResource.type}</span>
              </div>

              <div className="mt-2 text-center max-w-[120px]">
                <div className="font-medium text-slate-800 text-xs truncate" title={selectedResource.name}>
                  {selectedResource.name}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <ArrowRight className="w-5 h-5 text-blue-500" />
                <div className="w-6 border-t-2 border-dashed border-blue-400" />
              </div>
            </div>

            {/* Outbound Column */}
            <div className="flex-1 flex flex-col border-2 border-blue-400 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="bg-blue-50 px-4 py-2.5 border-b border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-blue-700">OUTBOUND</span>
                </div>
                <span className="text-sm text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                  {filteredOutbound.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredOutbound.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No outbound connections</p>
                  </div>
                ) : (
                  filteredOutbound.map((conn, idx) => (
                    <ConnectionCard key={conn.id + '-' + idx} conn={conn} direction="outbound" />
                  ))
                )}
              </div>
            </div>
          </div>
          )}

          {/* Connections Table - only show in columns view */}
          {viewMode === 'columns' && (
          <div className="border-t bg-white">
            <div className="px-4 py-2 flex items-center justify-between bg-slate-50 border-b">
              <span className="font-medium text-slate-700">All Connections ({allConnections.length})</span>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search connections..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="max-h-[180px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Direction</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Resource</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Type</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Port</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Relationship</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Hits</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allConnections.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        {searchQuery ? 'No connections match your search' : 'No connections found'}
                      </td>
                    </tr>
                  ) : (
                    allConnections.map((conn, idx) => (
                      <tr key={conn.id + '-table-' + idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            conn.direction === 'inbound'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            <ArrowRight className={`w-3 h-3 ${conn.direction === 'inbound' ? 'rotate-180' : ''}`} />
                            {conn.direction}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800 max-w-[150px] truncate" title={conn.name}>
                          {conn.name}
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
                            {conn.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">{conn.port || '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            conn.relationshipType === 'ACTUAL_TRAFFIC'
                              ? 'bg-emerald-100 text-emerald-700'
                              : conn.relationshipType === 'ACCESSES_RESOURCE'
                              ? 'bg-violet-100 text-violet-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {conn.relationshipType.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {conn.hitCount ? (
                            <span className="flex items-center gap-1">
                              <Zap className="w-3 h-3 text-amber-500" />
                              {conn.hitCount}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 text-slate-500 text-xs">
                          {formatRelativeTime(conn.lastSeen)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  )
}
