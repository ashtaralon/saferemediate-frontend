'use client'

/**
 * Unified Resource Inspector
 * ==========================
 *
 * A unified inspector component that displays the correct template
 * based on resource type. Uses a consistent 3-section structure:
 *
 * 1. CURRENT STATE - What's configured today
 * 2. OBSERVED - What's actually being used (evidence)
 * 3. REMOVE - What's unused and safe to remove
 *
 * Shows REAL data only - no mocks.
 */

import React, { useState, useEffect } from 'react'
import {
  Shield,
  Globe,
  Key,
  Database,
  HardDrive,
  Server,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Download,
  RefreshCw,
  X,
  Clock,
  ExternalLink,
} from 'lucide-react'
import type { ResourceInspectorData, RemoveSection } from '@/types/resource-inspector'

// Icon mapping for resource types
const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  SecurityGroup: <Shield className="w-6 h-6 text-[#3b82f6]" />,
  NetworkACL: <Globe className="w-6 h-6 text-cyan-600" />,
  IAMRole: <Key className="w-6 h-6 text-[#f97316]" />,
  IAMUser: <Key className="w-6 h-6 text-amber-500" />,
  S3: <Database className="w-6 h-6 text-[#22c55e]" />,
  RDS: <Database className="w-6 h-6 text-[#8b5cf6]" />,
  EC2: <Server className="w-6 h-6 text-orange-600" />,
  Unknown: <HelpCircle className="w-6 h-6 text-[var(--muted-foreground,#9ca3af)]" />,
}

export interface ResourceInspectorProps {
  resourceId: string
  windowDays?: number
  onClose?: () => void
  onApplyFix?: (recommendations: any[]) => void
}

export function ResourceInspector({
  resourceId,
  windowDays = 30,
  onClose,
  onApplyFix,
}: ResourceInspectorProps) {
  const [data, setData] = useState<ResourceInspectorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/proxy/inspector/${encodeURIComponent(resourceId)}?window=${windowDays}d`
      )

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || err.detail || `HTTP ${response.status}`)
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (resourceId) {
      fetchData()
    }
  }, [resourceId, windowDays])

  const formatRelativeTime = (timestamp: string | null): string => {
    if (!timestamp) return 'Never'
    try {
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins} min ago`
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    } catch {
      return 'Unknown'
    }
  }

  const handleExport = () => {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inspector-${resourceId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Loading state
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-[var(--muted-foreground,#9ca3af)] mr-2" />
        <span className="text-[var(--muted-foreground,#4b5563)]">Loading resource data...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-[#ef444410] border border-[#ef444440] rounded-lg p-4 text-center">
          <AlertTriangle className="w-8 h-8 text-[#ef4444] mx-auto mb-2" />
          <p className="text-[#ef4444] font-medium">Error Loading Inspector</p>
          <p className="text-[#ef4444] text-sm mt-1">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 px-4 py-2 bg-[#ef444420] hover:bg-red-200 text-[#ef4444] rounded-lg text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  // Check if unsupported resource type
  if ('supported' in data && data.supported === false) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[var(--border,#e5e7eb)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border,#e5e7eb)] bg-gray-50">
          <div className="flex items-center gap-3">
            {RESOURCE_ICONS[data.resource_type] || RESOURCE_ICONS.Unknown}
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground,#111827)]">{data.resource_name}</h2>
              <p className="text-sm text-[var(--muted-foreground,#6b7280)]">{data.resource_type}</p>
            </div>
          </div>
        </div>
        <div className="p-6 text-center">
          <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-[var(--muted-foreground,#6b7280)]">{data.message}</p>
        </div>
        <Footer data={data} onClose={onClose} onExport={handleExport} />
      </div>
    )
  }

  // Render resource-specific template
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[var(--border,#e5e7eb)] overflow-hidden">
      {data.resource_type === 'SecurityGroup' && (
        <SecurityGroupTemplate data={data as any} formatTime={formatRelativeTime} />
      )}
      {data.resource_type === 'NetworkACL' && (
        <NetworkACLTemplate data={data as any} />
      )}
      {data.resource_type === 'IAMRole' && (
        <IAMRoleTemplate data={data as any} />
      )}
      {data.resource_type === 'S3' && (
        <S3Template data={data as any} />
      )}
      {data.resource_type === 'RDS' && (
        <RDSTemplate data={data as any} />
      )}
      {data.resource_type === 'EC2' && (
        <EC2Template data={data as any} />
      )}
      <Footer
        data={data}
        onClose={onClose}
        onExport={handleExport}
        onApplyFix={
          'remove' in data && data.remove?.count
            ? () => onApplyFix?.(data.remove?.items || [])
            : undefined
        }
      />
    </div>
  )
}

// ============================================================================
// SECURITY GROUP TEMPLATE
// ============================================================================

function SecurityGroupTemplate({
  data,
  formatTime,
}: {
  data: any
  formatTime: (t: string | null) => string
}) {
  const hasFlowLogs = data.evidence?.flow_logs?.available === true
  const hasRecommendations = data.recommendations && data.recommendations.length > 0

  // Health status depends on whether we have Flow Logs evidence
  const healthStatus = !hasFlowLogs
    ? { status: 'unknown', label: '? Unknown', color: 'gray' }
    : data.gap_count === 0
      ? { status: 'healthy', label: 'Healthy', color: 'green' }
      : { status: 'gaps', label: `${data.gap_count} Gap${data.gap_count > 1 ? 's' : ''}`, color: 'orange' }

  return (
    <>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border,#e5e7eb)] bg-gray-50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-[#3b82f6]" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground,#111827)]">{data.sg_name || data.resource_name}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">
                <span>Security Group</span>
                {data.system_name && (
                  <>
                    <span>•</span>
                    <span>{data.system_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div>
            {healthStatus.status === 'unknown' ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-[var(--muted-foreground,#4b5563)] rounded-full text-sm font-medium">
                <HelpCircle className="w-4 h-4" />
                {healthStatus.label}
              </span>
            ) : healthStatus.status === 'healthy' ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#22c55e20] text-[#22c55e] rounded-full text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                {healthStatus.label}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#f9731620] text-[#f97316] rounded-full text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                {healthStatus.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Current Rules Section */}
      <SectionHeader title={`Current Inbound Rules (${data.summary?.total_rules || 0})`} source="AWS Config" />
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted-foreground,#6b7280)] border-b border-[var(--border,#f3f4f6)]">
              <th className="pb-2 font-medium">Port</th>
              <th className="pb-2 font-medium">Source</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium text-right">Flows</th>
            </tr>
          </thead>
          <tbody>
            {data.configured_rules?.map((rule: any, idx: number) => (
              <tr key={idx} className="border-b border-gray-50 last:border-0">
                <td className="py-3">
                  <div className="font-mono text-[var(--foreground,#111827)]">{rule.port_display}</div>
                  {rule.port_name && (
                    <div className="text-xs text-[var(--muted-foreground,#9ca3af)]">({rule.port_name})</div>
                  )}
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    {rule.is_public ? (
                      <Globe className="w-4 h-4 text-orange-500" />
                    ) : (
                      <Server className="w-4 h-4 text-[var(--muted-foreground,#9ca3af)]" />
                    )}
                    <div>
                      <div className="font-mono text-[var(--foreground,#111827)]">
                        {rule.source_cidr || rule.source_sg || 'Unknown'}
                      </div>
                      {rule.is_public && (
                        <div className="text-xs text-orange-500">BROAD ACCESS</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3">
                  <StatusBadge status={rule.status} />
                </td>
                <td className="py-3 text-right">
                  <div className="font-medium text-[var(--foreground,#111827)]">
                    {rule.status === 'unknown' ? (
                      <span className="text-[var(--muted-foreground,#9ca3af)]">-</span>
                    ) : (
                      rule.flow_count?.toLocaleString() || 0
                    )}
                  </div>
                  {rule.last_seen && rule.status !== 'unknown' && (
                    <div className="text-xs text-[var(--muted-foreground,#9ca3af)]">{formatTime(rule.last_seen)}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top Source IPs Section */}
      {data.top_source_ips?.length > 0 && (
        <>
          <SectionHeader title={`Top Source IPs (${data.evidence?.flow_logs?.window_days || 30}d)`} source="VPC Flow Logs" />
          <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted-foreground,#6b7280)] border-b border-[var(--border,#f3f4f6)]">
                  <th className="pb-2 font-medium">Source IP</th>
                  <th className="pb-2 font-medium text-right">Flows</th>
                  <th className="pb-2 font-medium text-right">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {data.top_source_ips.slice(0, 10).map((src: any, idx: number) => (
                  <tr key={idx} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-mono text-[var(--foreground,#111827)]">{src.ip}</td>
                    <td className="py-2 text-right text-[var(--foreground,#111827)]">
                      {src.flow_count?.toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-[var(--muted-foreground,#6b7280)]">
                      {formatTime(src.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Remove Section */}
      {hasRecommendations && (
        <RemoveSectionUI
          title="Unused Rules to Remove"
          items={data.recommendations}
        />
      )}

      {/* Evidence */}
      <div className="px-6 py-3 bg-gray-50 text-xs text-[var(--muted-foreground,#6b7280)] flex items-center gap-2">
        <Clock className="w-3 h-3" />
        <span>Evidence:</span>
        {data.evidence?.flow_logs?.available ? (
          <span className="text-[#22c55e]">✓ VPC Flow Logs ({data.evidence.flow_logs.window_days}d)</span>
        ) : (
          <span className="text-[var(--muted-foreground,#9ca3af)]">⚠ No Flow Logs</span>
        )}
        <span>•</span>
        <span className="text-[#22c55e]">✓ AWS Config</span>
      </div>
    </>
  )
}

// ============================================================================
// NETWORK ACL TEMPLATE
// ============================================================================

function NetworkACLTemplate({ data }: { data: any }) {
  return (
    <>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border,#e5e7eb)] bg-gray-50">
        <div className="flex items-center gap-3">
          <Globe className="w-6 h-6 text-cyan-600" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground,#111827)]">{data.resource_name}</h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">
              <span>Network ACL</span>
              {data.current?.is_default && (
                <>
                  <span>•</span>
                  <span className="text-cyan-600">(Default)</span>
                </>
              )}
              {data.current?.vpc_id && (
                <>
                  <span>•</span>
                  <span>{data.current.vpc_id}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inbound Rules */}
      <SectionHeader title="Current Inbound Rules" source="AWS Config" />
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted-foreground,#6b7280)] border-b border-[var(--border,#f3f4f6)]">
              <th className="pb-2 font-medium">Rule</th>
              <th className="pb-2 font-medium">Traffic</th>
              <th className="pb-2 font-medium">Port</th>
              <th className="pb-2 font-medium">Source</th>
              <th className="pb-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.current?.inbound_rules?.map((rule: any, idx: number) => (
              <tr key={idx} className="border-b border-gray-50 last:border-0">
                <td className="py-2 font-mono text-[var(--foreground,#111827)]">
                  {rule.rule_number === 32767 ? '*' : rule.rule_number}
                </td>
                <td className="py-2 text-[var(--muted-foreground,#4b5563)]">All traffic</td>
                <td className="py-2 font-mono text-[var(--foreground,#111827)]">{rule.port_range}</td>
                <td className="py-2 font-mono text-[var(--foreground,#111827)]">{rule.source}</td>
                <td className="py-2">
                  {rule.action === 'ALLOW' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#22c55e20] text-[#22c55e] rounded text-xs font-medium">
                      <CheckCircle className="w-3 h-3" />
                      ALLOW
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#ef444420] text-[#ef4444] rounded text-xs font-medium">
                      <X className="w-3 h-3" />
                      DENY
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Associated Subnets */}
      {data.current?.associated_subnets?.length > 0 && (
        <>
          <SectionHeader title={`Associated Subnets (${data.current.associated_subnets.length})`} source="AWS Config" />
          <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
            <ul className="space-y-1 text-sm">
              {data.current.associated_subnets.map((subnet: any, idx: number) => (
                <li key={idx} className="font-mono text-[var(--foreground,#374151)]">
                  • {subnet.id}
                  {subnet.cidr && <span className="text-[var(--muted-foreground,#9ca3af)]"> ({subnet.cidr})</span>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Observed Section - NACLs don't have flow-level tracking */}
      <SectionHeader title="Traffic Analysis" source="VPC Flow Logs" />
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
        <div className="bg-gray-50 rounded-lg p-4 text-center text-sm text-[var(--muted-foreground,#6b7280)]">
          <HelpCircle className="w-6 h-6 text-gray-300 mx-auto mb-2" />
          Network ACL traffic analysis requires VPC Flow Logs.
          <br />
          NACLs operate at the subnet level and affect all traffic.
        </div>
      </div>

      {/* Remove Section */}
      {data.remove?.count > 0 && (
        <RemoveSectionUI title="Recommendations" items={data.remove.items} />
      )}

      <EvidenceBar sources={data.evidence || ['AWS Config']} />
    </>
  )
}

// ============================================================================
// IAM ROLE TEMPLATE
// ============================================================================

function IAMRoleTemplate({ data }: { data: any }) {
  return (
    <>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border,#e5e7eb)] bg-gray-50">
        <div className="flex items-center gap-3">
          <Key className="w-6 h-6 text-[#f97316]" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground,#111827)]">{data.resource_name}</h2>
            <p className="text-sm text-[var(--muted-foreground,#6b7280)]">IAM Role</p>
          </div>
        </div>
      </div>

      {/* Current Permissions */}
      <SectionHeader title={`Current Permissions (${data.current?.total_policies || 0} policies)`} source="IAM Policy Analysis" />
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
        {data.current?.policies?.length > 0 ? (
          <ul className="space-y-2">
            {data.current.policies.map((policy: any, idx: number) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <span className="text-[var(--muted-foreground,#9ca3af)]">
                  {policy.type === 'AWS Managed' ? '📜' : policy.type === 'Inline' ? '📝' : '📄'}
                </span>
                <div>
                  <span className="font-medium text-[var(--foreground,#111827)]">{policy.name}</span>
                  <span className="text-xs text-[var(--muted-foreground,#9ca3af)] ml-2">({policy.type})</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--muted-foreground,#6b7280)] text-sm">No policies attached</p>
        )}
      </div>

      {/* Observed Section */}
      <SectionHeader title="Observed Usage" source="CloudTrail" />
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
        <div className="bg-gray-50 rounded-lg p-4 text-center text-sm text-[var(--muted-foreground,#6b7280)]">
          <HelpCircle className="w-6 h-6 text-gray-300 mx-auto mb-2" />
          IAM activity analysis requires CloudTrail integration.
          <br />
          This will show which permissions are actually being used.
        </div>
      </div>

      <EvidenceBar sources={data.evidence || ['CloudTrail', 'IAM Analysis']} />
    </>
  )
}

// ============================================================================
// S3 BUCKET TEMPLATE
// ============================================================================

function S3Template({ data }: { data: any }) {
  const pab = data.current?.public_access_block

  return (
    <>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border,#e5e7eb)] bg-gray-50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-[#22c55e]" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground,#111827)]">{data.resource_name}</h2>
              <p className="text-sm text-[var(--muted-foreground,#6b7280)]">S3 Bucket</p>
            </div>
          </div>
          {pab && (
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
              pab.is_public
                ? 'bg-[#f9731620] text-[#f97316]'
                : 'bg-[#22c55e20] text-[#22c55e]'
            }`}>
              {pab.is_public ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  Public Access Possible
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Access Blocked
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Public Access Block Settings */}
      <SectionHeader title="Current Access Configuration" source="AWS Config" />
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
        {pab && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              {pab.block_public_acls ? (
                <CheckCircle className="w-4 h-4 text-[#22c55e]" />
              ) : (
                <X className="w-4 h-4 text-[#ef4444]" />
              )}
              <span>Block public ACLs</span>
            </div>
            <div className="flex items-center gap-2">
              {pab.ignore_public_acls ? (
                <CheckCircle className="w-4 h-4 text-[#22c55e]" />
              ) : (
                <X className="w-4 h-4 text-[#ef4444]" />
              )}
              <span>Ignore public ACLs</span>
            </div>
            <div className="flex items-center gap-2">
              {pab.block_public_policy ? (
                <CheckCircle className="w-4 h-4 text-[#22c55e]" />
              ) : (
                <X className="w-4 h-4 text-[#ef4444]" />
              )}
              <span>Block public policy</span>
            </div>
            <div className="flex items-center gap-2">
              {pab.restrict_public_buckets ? (
                <CheckCircle className="w-4 h-4 text-[#22c55e]" />
              ) : (
                <X className="w-4 h-4 text-[#ef4444]" />
              )}
              <span>Restrict public buckets</span>
            </div>
          </div>
        )}

        {/* Bucket Policy */}
        {data.current?.bucket_policy?.exists && (
          <div className="mt-4 pt-4 border-t border-[var(--border,#f3f4f6)]">
            <p className="text-sm font-medium text-[var(--foreground,#374151)] mb-2">Bucket Policy</p>
            <p className="text-xs text-[var(--muted-foreground,#6b7280)]">
              {data.current.bucket_policy.statements.length} statement(s)
            </p>
          </div>
        )}
      </div>

      {/* Observed Operations - S3 uses CloudTrail, NOT Flow Logs */}
      <SectionHeader title="Observed Operations" source="CloudTrail" />
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
        <div className="bg-gray-50 rounded-lg p-4 text-center text-sm text-[var(--muted-foreground,#6b7280)]">
          <HelpCircle className="w-6 h-6 text-gray-300 mx-auto mb-2" />
          S3 operation analysis requires CloudTrail integration.
          <br />
          This will show which API operations (GetObject, PutObject, etc.) are being used.
          <br />
          <span className="text-xs text-[var(--muted-foreground,#9ca3af)] mt-2 block">
            Note: S3 does not use VPC Flow Logs or TCP ports.
          </span>
        </div>
      </div>

      {/* Remove Section */}
      {data.remove?.count > 0 && (
        <RemoveSectionUI title="Recommendations" items={data.remove.items} />
      )}

      {/* Evidence - IMPORTANT: S3 uses CloudTrail, NOT Flow Logs */}
      <EvidenceBar sources={['CloudTrail', 'AWS Config']} />
    </>
  )
}

// ============================================================================
// RDS TEMPLATE
// ============================================================================

function RDSTemplate({ data }: { data: any }) {
  return (
    <>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border,#e5e7eb)] bg-gray-50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-[#8b5cf6]" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground,#111827)]">{data.resource_name}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">
                <span>{data.db_engine || 'RDS'}</span>
                {data.db_port && (
                  <>
                    <span>•</span>
                    <span>Port {data.db_port}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {data.current?.publicly_accessible && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#ef444420] text-[#ef4444] rounded-full text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              Publicly Accessible
            </span>
          )}
        </div>
      </div>

      {/* Current Access */}
      <SectionHeader title="Current Access Configuration" source="AWS Config" />
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-[var(--muted-foreground,#6b7280)]">Endpoint:</span>
            <span className="font-mono text-[var(--foreground,#111827)]">{data.current?.endpoint || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--muted-foreground,#6b7280)]">VPC:</span>
            <span className="font-mono text-[var(--foreground,#111827)]">{data.current?.vpc_id || 'N/A'}</span>
          </div>
          {data.current?.security_groups?.length > 0 && (
            <div>
              <span className="text-[var(--muted-foreground,#6b7280)]">Security Groups:</span>
              <ul className="mt-1 space-y-1">
                {data.current.security_groups.map((sg: any, idx: number) => (
                  <li key={idx} className="font-mono text-[var(--foreground,#374151)] ml-4">
                    • {sg.sg_id}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Observed Connections */}
      <SectionHeader title="Observed Connections" source="VPC Flow Logs" />
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
        <div className="bg-gray-50 rounded-lg p-4 text-center text-sm text-[var(--muted-foreground,#6b7280)]">
          <HelpCircle className="w-6 h-6 text-gray-300 mx-auto mb-2" />
          Connection analysis requires VPC Flow Logs integration.
          <br />
          This will show which sources are connecting to the database.
        </div>
      </div>

      {/* Remove Section */}
      {data.remove?.count > 0 && (
        <RemoveSectionUI title="Recommendations" items={data.remove.items} />
      )}

      <EvidenceBar sources={data.evidence || ['VPC Flow Logs', 'AWS Config']} />
    </>
  )
}

// ============================================================================
// EC2 TEMPLATE
// ============================================================================

function EC2Template({ data }: { data: any }) {
  const network = data.current?.network

  return (
    <>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border,#e5e7eb)] bg-gray-50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-orange-600" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground,#111827)]">{data.resource_name}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">
                <span>{data.instance_type}</span>
                <span>•</span>
                <span className={data.state === 'running' ? 'text-[#22c55e]' : 'text-[var(--muted-foreground,#9ca3af)]'}>
                  {data.state}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Current Configuration */}
      <SectionHeader title="Current Configuration" source="AWS Config" />
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
        <div className="space-y-3 text-sm">
          {/* Network */}
          {network && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[var(--muted-foreground,#6b7280)]">Private IP:</span>
                <span className="font-mono text-[var(--foreground,#111827)]">{network.private_ip || 'N/A'}</span>
              </div>
              {network.public_ip && (
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted-foreground,#6b7280)]">Public IP:</span>
                  <span className="font-mono text-orange-600">{network.public_ip}</span>
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[var(--muted-foreground,#6b7280)]">VPC:</span>
                <span className="font-mono text-[var(--foreground,#111827)]">{network.vpc_id || 'N/A'}</span>
              </div>
            </>
          )}

          {/* Security Groups */}
          {data.current?.security_groups?.length > 0 && (
            <div>
              <span className="text-[var(--muted-foreground,#6b7280)]">Security Groups:</span>
              <ul className="mt-1 space-y-1">
                {data.current.security_groups.map((sg: any, idx: number) => (
                  <li key={idx} className="font-mono text-[var(--foreground,#374151)] ml-4">
                    • {sg.sg_name || sg.sg_id}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* IAM Role */}
          {data.current?.iam_role && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--muted-foreground,#6b7280)]">IAM Role:</span>
              <span className="font-mono text-[var(--foreground,#111827)] text-xs break-all">
                {data.current.iam_role.arn}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Observed Activity */}
      <SectionHeader title="Observed Activity" source="Flow Logs + CloudTrail" />
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)]">
        <div className="bg-gray-50 rounded-lg p-4 text-center text-sm text-[var(--muted-foreground,#6b7280)]">
          <HelpCircle className="w-6 h-6 text-gray-300 mx-auto mb-2" />
          Activity analysis requires VPC Flow Logs and CloudTrail integration.
        </div>
      </div>

      {/* Remove Section */}
      {data.remove?.count > 0 && (
        <RemoveSectionUI title="Recommendations" items={data.remove.items} />
      )}

      <EvidenceBar sources={data.evidence || ['VPC Flow Logs', 'CloudTrail', 'AWS Config']} />
    </>
  )
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function SectionHeader({ title, source }: { title: string; source: string }) {
  return (
    <div className="px-6 py-2 bg-gray-50 border-b border-[var(--border,#f3f4f6)] flex items-center justify-between">
      <h3 className="text-sm font-semibold text-[var(--foreground,#374151)] uppercase tracking-wide">{title}</h3>
      <span className="text-xs text-[var(--muted-foreground,#9ca3af)]">from {source}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: 'used' | 'unused' | 'unknown' }) {
  if (status === 'used') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#22c55e20] text-[#22c55e] rounded text-xs font-medium">
        <CheckCircle className="w-3 h-3" />
        Used
      </span>
    )
  }
  if (status === 'unused') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#f9731620] text-[#f97316] rounded text-xs font-medium">
        <AlertTriangle className="w-3 h-3" />
        Unused
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-[var(--muted-foreground,#4b5563)] rounded text-xs font-medium">
      <HelpCircle className="w-3 h-3" />
      Unknown
    </span>
  )
}

function RemoveSectionUI({ title, items }: { title: string; items: any[] }) {
  return (
    <>
      <div className="px-6 py-2 bg-[#f9731610] border-b border-orange-100 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-orange-600" />
        <h3 className="text-sm font-semibold text-[#f97316] uppercase tracking-wide">
          {title} ({items.length})
        </h3>
      </div>
      <div className="px-6 py-4 border-b border-[var(--border,#f3f4f6)] bg-[#f9731610]/50">
        <ul className="space-y-2">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm text-[#f97316]">
              • {item.rule_summary || item.message}
              {item.reason && (
                <span className="text-orange-600 ml-1">— {item.reason}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function EvidenceBar({ sources }: { sources: string[] }) {
  return (
    <div className="px-6 py-3 bg-gray-50 text-xs text-[var(--muted-foreground,#6b7280)] flex items-center gap-2">
      <Clock className="w-3 h-3" />
      Evidence:
      {sources.map((source, idx) => (
        <span key={idx}>
          <span className="text-[#22c55e]">✓</span> {source}
          {idx < sources.length - 1 && ' •'}
        </span>
      ))}
    </div>
  )
}

function Footer({
  data,
  onClose,
  onExport,
  onApplyFix,
}: {
  data: any
  onClose?: () => void
  onExport: () => void
  onApplyFix?: () => void
}) {
  return (
    <div className="px-6 py-4 border-t border-[var(--border,#e5e7eb)] bg-gray-50 flex items-center justify-between">
      <div className="text-xs text-[var(--muted-foreground,#9ca3af)]">{data.resource_id}</div>
      <div className="flex items-center gap-2">
        {onApplyFix && (
          <button
            onClick={onApplyFix}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium"
          >
            Apply Fix
          </button>
        )}
        <button
          onClick={onExport}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[var(--foreground,#374151)] rounded-lg text-sm font-medium flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[var(--foreground,#374151)] rounded-lg text-sm font-medium"
          >
            Close
          </button>
        )}
      </div>
    </div>
  )
}

export default ResourceInspector
