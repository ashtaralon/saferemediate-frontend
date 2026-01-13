"use client"

import { useState, useEffect } from "react"

// Types for the Least Privilege Card
export type ResourceType = 'security_group' | 'iam_role' | 's3_bucket' | 'nacl' | 'ec2' | 'rds' | 'lambda' | 'dynamodb'

export interface LeastPrivilegeData {
  // Header
  resourceName: string
  resourceType: ResourceType
  resourceArn?: string
  system: string
  environment: string
  finding?: {
    ruleName: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    source: string // CSPM source
  }
  lastSeen: string

  // What's Broad (Current Configuration)
  currentConfig: {
    summary: string // One-line summary
    details: string[] // Expandable details
  }

  // Why It's Risky
  riskExplanation: string

  // What's Actually Used (Behavioral Evidence)
  observedBehavior: {
    // For Security Groups
    observedPorts?: { port: number; protocol: string; count: number }[]
    observedSources?: { source: string; type: 'sg' | 'cidr' | 'ip'; count: number }[]

    // For IAM Roles
    usedActions?: { action: string; count: number; lastUsed: string }[]
    unusedActions?: { service: string; count: number; actions: string[] }[]
    credentialContext?: string

    // For S3
    accessingPrincipals?: { principal: string; role: string; count: number }[]
    usedOperations?: { operation: string; count: number }[]
    accessSources?: string[]

    // Common
    lastActivity: string
    coverageLevel: 'high' | 'partial' | 'low'
    coverageNote: string
  }

  // Recommended Tightening
  recommendation: {
    action: 'replace' | 'remove' | 'restrict'
    before: string[]
    after: string[]
    generatedPolicy?: string // For IAM
    impactPreview?: string[]
  }

  // Data plane sources
  dataSources: {
    flowLogs: boolean
    cloudTrail: boolean
    awsConfig: boolean
    iam: boolean
  }
}

interface LeastPrivilegeCardProps {
  data: LeastPrivilegeData | null
  loading: boolean
  onClose: () => void
  onApplyFix?: (data: LeastPrivilegeData) => void
}

// Severity colors
const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: '#ef4444' },
  high: { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: '#f97316' },
  medium: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: '#f59e0b' },
  low: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: '#3b82f6' },
}

// Resource type icons
const RESOURCE_ICONS: Record<ResourceType, string> = {
  security_group: '🛡️',
  iam_role: '🔑',
  s3_bucket: '📦',
  nacl: '🚧',
  ec2: '🖥️',
  rds: '🗄️',
  lambda: 'λ',
  dynamodb: '⚡',
}

// Resource type labels
const RESOURCE_LABELS: Record<ResourceType, string> = {
  security_group: 'Security Group',
  iam_role: 'IAM Role',
  s3_bucket: 'S3 Bucket',
  nacl: 'Network ACL',
  ec2: 'EC2 Instance',
  rds: 'RDS Database',
  lambda: 'Lambda Function',
  dynamodb: 'DynamoDB Table',
}

export function LeastPrivilegeCard({ data, loading, onClose, onApplyFix }: LeastPrivilegeCardProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['config', 'observed', 'recommendation']))
  const [showGeneratedPolicy, setShowGeneratedPolicy] = useState(false)

  const toggleSection = (section: string) => {
    const newSet = new Set(expandedSections)
    if (newSet.has(section)) {
      newSet.delete(section)
    } else {
      newSet.add(section)
    }
    setExpandedSections(newSet)
  }

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center p-6" style={{ background: '#0f172a' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <span className="text-slate-400 text-base">Loading least-privilege analysis...</span>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="h-[400px] flex items-center justify-center p-6" style={{ background: '#0f172a', color: '#64748b' }}>
        <div className="text-center">
          <span className="text-5xl mb-4 block">🔍</span>
          <p className="text-base">Click on a service node to view its least-privilege analysis</p>
        </div>
      </div>
    )
  }

  const severityStyle = data.finding ? SEVERITY_COLORS[data.finding.severity] : null

  return (
    <div className="flex flex-col max-h-[85vh]" style={{ background: '#0f172a', color: '#e2e8f0' }}>
      {/* Header */}
      <div className="px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{RESOURCE_ICONS[data.resourceType]}</span>
            <div>
              <h3 className="text-base font-semibold">{data.resourceName}</h3>
              <span className="text-xs" style={{ color: '#64748b' }}>{RESOURCE_LABELS[data.resourceType]}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-xl px-1"
          >
            ×
          </button>
        </div>

        {/* System & Environment */}
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-1 rounded text-xs" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>
            {data.system}
          </span>
          <span className="text-xs" style={{ color: '#64748b' }}>•</span>
          <span className="text-xs" style={{ color: '#94a3b8' }}>{data.environment}</span>
        </div>

        {/* Finding */}
        {data.finding && severityStyle && (
          <div
            className="px-3 py-2 rounded-lg mb-3"
            style={{ background: severityStyle.bg, border: `1px solid ${severityStyle.border}` }}
          >
            <div className="flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded text-xs font-bold uppercase"
                style={{ background: severityStyle.border, color: '#0f172a' }}
              >
                {data.finding.severity}
              </span>
              <span className="text-sm font-medium" style={{ color: severityStyle.text }}>
                {data.finding.ruleName}
              </span>
            </div>
            <div className="text-xs mt-1" style={{ color: '#94a3b8' }}>
              Source: {data.finding.source}
            </div>
          </div>
        )}

        {/* Last Seen */}
        <div className="text-xs" style={{ color: '#64748b' }}>
          Last seen: <span style={{ color: '#94a3b8' }}>{data.lastSeen}</span>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Section 1: What's Broad (Current Configuration) */}
        <div className="border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
          <button
            onClick={() => toggleSection('config')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span className="text-sm font-semibold">What's Broad</span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}>
                Current Config
              </span>
            </div>
            <span className="text-slate-500">{expandedSections.has('config') ? '▼' : '▶'}</span>
          </button>

          {expandedSections.has('config') && (
            <div className="px-4 pb-4">
              {/* Summary line */}
              <div
                className="px-3 py-2 rounded-lg font-mono text-sm mb-2"
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
              >
                {data.currentConfig.summary}
              </div>

              {/* Expandable details */}
              {data.currentConfig.details.length > 0 && (
                <div className="space-y-1">
                  {data.currentConfig.details.map((detail, i) => (
                    <div key={i} className="text-xs font-mono px-2 py-1 rounded" style={{ background: 'rgba(30, 41, 59, 0.5)', color: '#94a3b8' }}>
                      {detail}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 2: Why It's Risky */}
        <div className="border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
          <button
            onClick={() => toggleSection('risk')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">💡</span>
              <span className="text-sm font-semibold">Why It's Risky</span>
            </div>
            <span className="text-slate-500">{expandedSections.has('risk') ? '▼' : '▶'}</span>
          </button>

          {expandedSections.has('risk') && (
            <div className="px-4 pb-4">
              <p className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>
                {data.riskExplanation}
              </p>
            </div>
          )}
        </div>

        {/* Section 3: What's Actually Used (Behavioral Evidence) */}
        <div className="border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
          <button
            onClick={() => toggleSection('observed')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">📊</span>
              <span className="text-sm font-semibold">What's Actually Used</span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                Behavioral Evidence
              </span>
            </div>
            <span className="text-slate-500">{expandedSections.has('observed') ? '▼' : '▶'}</span>
          </button>

          {expandedSections.has('observed') && (
            <div className="px-4 pb-4 space-y-4">
              {/* For Security Groups - Observed Ports */}
              {data.observedBehavior.observedPorts && data.observedBehavior.observedPorts.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#64748b' }}>
                    Observed Ports
                  </h5>
                  <div className="space-y-1">
                    {data.observedBehavior.observedPorts.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: 'rgba(30, 41, 59, 0.5)' }}>
                        <span className="font-mono text-sm" style={{ color: '#10b981' }}>
                          {p.protocol.toUpperCase()}/{p.port}
                        </span>
                        <span className="text-xs" style={{ color: '#94a3b8' }}>{p.count.toLocaleString()} connections</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* For Security Groups - Observed Sources */}
              {data.observedBehavior.observedSources && data.observedBehavior.observedSources.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#64748b' }}>
                    Observed Sources
                  </h5>
                  <div className="space-y-1">
                    {data.observedBehavior.observedSources.map((s, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: 'rgba(30, 41, 59, 0.5)' }}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{
                            background: s.type === 'sg' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                            color: s.type === 'sg' ? '#f59e0b' : '#3b82f6'
                          }}>
                            {s.type.toUpperCase()}
                          </span>
                          <span className="font-mono text-sm">{s.source}</span>
                        </div>
                        <span className="text-xs" style={{ color: '#94a3b8' }}>{s.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* For IAM Roles - Used Actions */}
              {data.observedBehavior.usedActions && data.observedBehavior.usedActions.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#64748b' }}>
                    Used Actions (CloudTrail)
                  </h5>
                  <div className="space-y-1">
                    {data.observedBehavior.usedActions.slice(0, 8).map((a, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: 'rgba(30, 41, 59, 0.5)' }}>
                        <span className="font-mono text-xs" style={{ color: '#10b981' }}>{a.action}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs" style={{ color: '#94a3b8' }}>{a.count}x</span>
                          <span className="text-xs" style={{ color: '#64748b' }}>{a.lastUsed}</span>
                        </div>
                      </div>
                    ))}
                    {data.observedBehavior.usedActions.length > 8 && (
                      <div className="text-xs text-center py-1" style={{ color: '#64748b' }}>
                        +{data.observedBehavior.usedActions.length - 8} more actions
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* For IAM Roles - Unused Actions (collapsed by service) */}
              {data.observedBehavior.unusedActions && data.observedBehavior.unusedActions.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#64748b' }}>
                    Unused Actions (by Service)
                  </h5>
                  <div className="space-y-1">
                    {data.observedBehavior.unusedActions.map((u, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: 'rgba(239, 68, 68, 0.05)' }}>
                        <span className="font-mono text-xs" style={{ color: '#f59e0b' }}>{u.service}</span>
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}>
                          {u.count} unused
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* For S3 - Accessing Principals */}
              {data.observedBehavior.accessingPrincipals && data.observedBehavior.accessingPrincipals.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#64748b' }}>
                    Accessing Principals
                  </h5>
                  <div className="space-y-1">
                    {data.observedBehavior.accessingPrincipals.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: 'rgba(30, 41, 59, 0.5)' }}>
                        <div>
                          <span className="font-mono text-xs block" style={{ color: '#10b981' }}>{p.principal}</span>
                          <span className="text-xs" style={{ color: '#64748b' }}>{p.role}</span>
                        </div>
                        <span className="text-xs" style={{ color: '#94a3b8' }}>{p.count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* For S3 - Used Operations */}
              {data.observedBehavior.usedOperations && data.observedBehavior.usedOperations.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#64748b' }}>
                    Used Operations
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {data.observedBehavior.usedOperations.map((op, i) => (
                      <span key={i} className="px-2 py-1 rounded text-xs font-mono" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                        {op.operation} ({op.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Credential Context (IAM) */}
              {data.observedBehavior.credentialContext && (
                <div className="px-3 py-2 rounded" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                  <span className="text-xs" style={{ color: '#64748b' }}>Credential context: </span>
                  <span className="text-xs font-medium" style={{ color: '#a78bfa' }}>{data.observedBehavior.credentialContext}</span>
                </div>
              )}

              {/* Last Activity & Coverage */}
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
                <div className="text-xs" style={{ color: '#64748b' }}>
                  Last activity: <span style={{ color: '#10b981' }}>{data.observedBehavior.lastActivity}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: data.observedBehavior.coverageLevel === 'high' ? '#10b981' :
                                  data.observedBehavior.coverageLevel === 'partial' ? '#f59e0b' : '#ef4444'
                    }}
                  />
                  <span className="text-xs" style={{ color: '#94a3b8' }}>{data.observedBehavior.coverageNote}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Recommended Tightening */}
        <div className="border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
          <button
            onClick={() => toggleSection('recommendation')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">🔧</span>
              <span className="text-sm font-semibold">Recommended Tightening</span>
            </div>
            <span className="text-slate-500">{expandedSections.has('recommendation') ? '▼' : '▶'}</span>
          </button>

          {expandedSections.has('recommendation') && (
            <div className="px-4 pb-4 space-y-4">
              {/* Before → After Diff */}
              <div className="grid grid-cols-2 gap-3">
                {/* Before */}
                <div>
                  <h5 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: '#ef4444' }}>
                    <span>✗</span> Replace
                  </h5>
                  <div className="space-y-1">
                    {data.recommendation.before.map((item, i) => (
                      <div key={i} className="px-2 py-1.5 rounded text-xs font-mono" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5' }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                {/* After */}
                <div>
                  <h5 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: '#10b981' }}>
                    <span>✓</span> With
                  </h5>
                  <div className="space-y-1">
                    {data.recommendation.after.map((item, i) => (
                      <div key={i} className="px-2 py-1.5 rounded text-xs font-mono" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#6ee7b7' }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Generated Policy Preview (for IAM) */}
              {data.recommendation.generatedPolicy && (
                <div>
                  <button
                    onClick={() => setShowGeneratedPolicy(!showGeneratedPolicy)}
                    className="flex items-center gap-2 text-xs mb-2"
                    style={{ color: '#a78bfa' }}
                  >
                    <span>{showGeneratedPolicy ? '▼' : '▶'}</span>
                    <span>View Generated Policy</span>
                  </button>
                  {showGeneratedPolicy && (
                    <pre className="px-3 py-2 rounded text-xs font-mono overflow-x-auto" style={{ background: 'rgba(30, 41, 59, 0.8)', color: '#94a3b8' }}>
                      {data.recommendation.generatedPolicy}
                    </pre>
                  )}
                </div>
              )}

              {/* Impact Preview */}
              {data.recommendation.impactPreview && data.recommendation.impactPreview.length > 0 && (
                <div className="px-3 py-2 rounded" style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                  <h5 className="text-xs font-semibold mb-1" style={{ color: '#3b82f6' }}>Impact Preview</h5>
                  {data.recommendation.impactPreview.map((impact, i) => (
                    <div key={i} className="text-xs" style={{ color: '#94a3b8' }}>• {impact}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Data Sources */}
        <div className="px-4 py-3">
          <h5 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#64748b' }}>
            Evidence Sources
          </h5>
          <div className="flex flex-wrap gap-2">
            {data.dataSources.flowLogs && (
              <span className="px-2 py-1 rounded text-xs" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                ✓ Flow Logs
              </span>
            )}
            {data.dataSources.cloudTrail && (
              <span className="px-2 py-1 rounded text-xs" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}>
                ✓ CloudTrail
              </span>
            )}
            {data.dataSources.awsConfig && (
              <span className="px-2 py-1 rounded text-xs" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                ✓ AWS Config
              </span>
            )}
            {data.dataSources.iam && (
              <span className="px-2 py-1 rounded text-xs" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899' }}>
                ✓ IAM Analysis
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-5 py-4 border-t flex gap-3 flex-shrink-0" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
        <button
          onClick={() => onApplyFix?.(data)}
          className="flex-1 py-3 text-sm font-semibold rounded-lg transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white' }}
        >
          Apply Fix
        </button>
        <button
          className="px-5 py-3 text-sm font-medium rounded-lg transition-colors hover:bg-slate-700"
          style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' }}
        >
          Export
        </button>
        <button
          onClick={onClose}
          className="px-5 py-3 text-sm font-medium rounded-lg transition-colors hover:bg-slate-700"
          style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

// Real data interface for passing actual backend data
export interface RealNodeData {
  node: { id: string; type: string; name: string; shortName?: string; [key: string]: any }
  systemName: string
  iamGaps: any[]
  edges?: any[] // Flow edges from dependency-map
  sgRules?: any[] // Security group rules
  configData?: {
    resource?: { type?: string; name?: string; arn?: string; configuration?: any }
    connections?: { inbound?: any[]; outbound?: any[] }
    configuration?: any
    summary?: string
  } // AWS Config data for this resource
  cloudTrailData?: any // CloudTrail activity
  findings?: any[] // CSPM findings for this resource
  detailedIamRole?: {
    role_name: string
    role_arn?: string
    allowed_permissions: number
    used_permissions: number
    unused_permissions: number
    allowed_actions_list?: string[]
    used_actions_list?: string[]
    unused_actions_list?: string[]
    used_actions?: string[]
    unused_by_service?: { service: string; count: number; permissions: string[] }[]
  } // Detailed IAM role data from /api/iam-roles/{role}/gap-analysis
  flowContext?: {
    inboundPorts: number[]
    outboundPorts: number[]
    inboundRequests: number
    outboundRequests: number
    securityGroups: any[]
    iamRoles: any[]
    nacls?: any[]
    sources: string[]
    destinations: string[]
  } // Flow context from the selected flow
  checkpointContext?: {
    checkpoint: any
    segment: any
    fromNode: any
    toNode: any
    port?: number
    protocol?: string
    requestCount: number
    sgData?: any // Detailed SG gap analysis data
    iamData?: any // Detailed IAM gap analysis data
    naclData?: any // Detailed NACL data
  } // Checkpoint context when clicking on SG/IAM/NACL checkpoints
}

// Helper function to generate least-privilege data for CHECKPOINTS (SG or IAM)
function generateCheckpointLeastPrivilegeData(data: RealNodeData): LeastPrivilegeData {
  const { node, systemName, checkpointContext, flowContext } = data
  const { checkpoint, segment, fromNode, toNode, port, requestCount, sgData, iamData } = checkpointContext!

  const isSecurityGroup = checkpoint.type === 'security_group'
  const resourceType: ResourceType = isSecurityGroup ? 'security_group' : 'iam_role'
  const cpName = checkpoint.name || checkpoint.shortName || 'Unknown'

  // For Security Groups - analyze rules
  if (isSecurityGroup) {
    const inboundRules = sgData?.inbound_rules || sgData?.rules?.inbound || sgData?.ip_permissions || []
    const totalRules = sgData?.total_rules || inboundRules.length || checkpoint.totalCount || 0
    const usedRules = sgData?.used_rules || checkpoint.usedCount || 0
    const unusedRules = totalRules - usedRules

    // Check for 0.0.0.0/0 rules (public internet access)
    const publicRules = inboundRules.filter((rule: any) => {
      const source = rule.source || rule.cidr || rule.cidr_ip || rule.ipRanges?.[0]?.cidrIp || ''
      return source === '0.0.0.0/0' || source === '::/0'
    })
    const hasPublicAccess = publicRules.length > 0

    // Build config details showing all rules
    const configDetails: string[] = []
    configDetails.push(`${totalRules} inbound rules configured`)
    if (usedRules > 0) configDetails.push(`${usedRules} rules actively used`)
    if (unusedRules > 0) configDetails.push(`${unusedRules} rules unused`)

    // Show each rule with its status
    inboundRules.slice(0, 6).forEach((rule: any) => {
      const rulePort = rule.port || rule.from_port || rule.toPort || '*'
      const source = rule.source || rule.cidr || rule.cidr_ip || rule.source_security_group || rule.ipRanges?.[0]?.cidrIp || 'unknown'
      const protocol = (rule.protocol || rule.ip_protocol || 'tcp').toUpperCase()
      const isUsed = rule.is_used || rule.hit_count > 0 || (port && rulePort == port)
      const isPublic = source === '0.0.0.0/0' || source === '::/0'

      configDetails.push(`  ${isUsed ? '✓' : '✗'} ${protocol}/${rulePort} ← ${source}${isPublic ? ' ⚠️ PUBLIC' : ''}`)
    })
    if (inboundRules.length > 6) {
      configDetails.push(`  +${inboundRules.length - 6} more rules`)
    }

    // Build recommendation - special handling for 0.0.0.0/0
    const beforeItems: string[] = []
    const afterItems: string[] = []

    if (hasPublicAccess) {
      beforeItems.push(`⚠️ ${publicRules.length} rule(s) allow 0.0.0.0/0 (public internet)`)
      publicRules.forEach((rule: any) => {
        const rulePort = rule.port || rule.from_port || '*'
        beforeItems.push(`  0.0.0.0/0 → :${rulePort}`)
      })

      // Suggest replacement based on observed traffic
      afterItems.push(`Replace with observed traffic:`)
      if (fromNode) {
        afterItems.push(`  Allow from ${fromNode.shortName || fromNode.name}`)
      }
      if (flowContext?.sources && flowContext.sources.length > 0) {
        flowContext.sources.slice(0, 3).forEach(src => {
          afterItems.push(`  Allow from ${src}`)
        })
      }
      if (port) {
        afterItems.push(`  On port :${port} only`)
      }
      afterItems.push(`Remove: 0.0.0.0/0 access`)
    } else {
      beforeItems.push(`${totalRules} rules configured:`)
      inboundRules.slice(0, 4).forEach((rule: any) => {
        const rulePort = rule.port || rule.from_port || '*'
        const source = rule.source || rule.cidr || 'unknown'
        beforeItems.push(`  ${source} → :${rulePort}`)
      })

      if (unusedRules > 0) {
        afterItems.push(`Remove ${unusedRules} unused rules:`)
        inboundRules.filter((r: any) => !r.is_used && !r.hit_count).slice(0, 3).forEach((rule: any) => {
          const rulePort = rule.port || rule.from_port || '*'
          const source = rule.source || rule.cidr || 'unknown'
          afterItems.push(`  ✗ ${source} → :${rulePort}`)
        })
      } else {
        afterItems.push(`All rules are actively used`)
        afterItems.push(`No changes recommended`)
      }
    }

    return {
      resourceName: cpName,
      resourceType,
      system: systemName,
      environment: systemName.includes('prod') ? 'Production' : systemName.includes('dev') ? 'Development' : 'N/A',
      lastSeen: new Date().toISOString().replace('T', ' ').substring(0, 19),

      finding: hasPublicAccess ? {
        ruleName: 'Public Internet Access (0.0.0.0/0)',
        severity: 'high' as const,
        source: 'Security Group Analysis',
      } : undefined,

      currentConfig: {
        summary: `${cpName} - ${totalRules} rules, ${usedRules} used`,
        details: configDetails,
      },

      riskExplanation: hasPublicAccess
        ? 'This security group allows inbound traffic from 0.0.0.0/0 (the entire internet). This significantly increases attack surface. Only specific observed sources should be allowed.'
        : 'Security group rules should be limited to only what is actively used. Unused rules increase attack surface.',

      observedBehavior: {
        observedPorts: port ? [{ port, protocol: 'tcp', count: requestCount || 0 }] : undefined,
        observedSources: fromNode ? [{
          source: fromNode.shortName || fromNode.name,
          type: 'sg' as const,
          count: requestCount || 0
        }] : undefined,
        lastActivity: requestCount ? `${requestCount.toLocaleString()} requests observed` : 'N/A',
        coverageLevel: 'high' as const,
        coverageNote: `Traffic: ${fromNode?.shortName || fromNode?.name || 'Unknown'} → ${toNode?.shortName || toNode?.name || 'Unknown'}`,
      },

      recommendation: {
        action: hasPublicAccess ? 'replace' : 'restrict',
        before: beforeItems,
        after: afterItems,
        impactPreview: hasPublicAccess ? [
          'Remove public internet access',
          `Allow only ${flowContext?.sources?.length || 1} observed source(s)`,
        ] : unusedRules > 0 ? [
          `Remove ${unusedRules} unused rule(s)`,
          `${usedRules} active rules will continue working`,
        ] : undefined,
      },

      dataSources: {
        flowLogs: true,
        cloudTrail: false,
        awsConfig: !!sgData,
        iam: false,
      },
    }
  }

  // For IAM Roles - analyze permissions
  const roleName = iamData?.role_name || checkpoint.name || 'Unknown Role'
  const allowedPerms = iamData?.allowed_permissions || checkpoint.totalCount || 0
  const usedPerms = iamData?.used_permissions || checkpoint.usedCount || 0
  const unusedPerms = iamData?.unused_permissions || (allowedPerms - usedPerms)
  const unusedByService = iamData?.unused_by_service || []
  const usedActions = iamData?.used_actions_list || iamData?.used_actions || []
  const unusedActions = iamData?.unused_actions_list || []

  // Build config details
  const configDetails: string[] = []
  configDetails.push(`${allowedPerms} permissions allowed`)
  if (usedPerms > 0) configDetails.push(`${usedPerms} permissions used`)
  if (unusedPerms > 0) configDetails.push(`${unusedPerms} permissions unused`)

  if (unusedByService.length > 0) {
    configDetails.push(`Unused by service:`)
    unusedByService.slice(0, 4).forEach((svc: any) => {
      configDetails.push(`  ${svc.service}: ${svc.count} unused`)
    })
  }

  // Build recommendation
  const beforeItems: string[] = []
  const afterItems: string[] = []

  beforeItems.push(`${roleName}`)
  beforeItems.push(`${allowedPerms} permissions allowed`)
  if (unusedByService.length > 0) {
    beforeItems.push(`Unused by service:`)
    unusedByService.slice(0, 3).forEach((svc: any) => {
      beforeItems.push(`  ${svc.service}: ${svc.count}`)
    })
  }

  if (unusedPerms > 0 && usedPerms > 0) {
    afterItems.push(`Reduce to ${usedPerms} permissions`)
    if (usedActions.length > 0) {
      afterItems.push(`Keep only:`)
      usedActions.slice(0, 4).forEach((action: string) => {
        afterItems.push(`  ✓ ${action}`)
      })
    }
    afterItems.push(`Remove ${unusedPerms} unused permissions`)
  } else if (usedPerms === 0) {
    afterItems.push(`No usage observed`)
    afterItems.push(`Enable CloudTrail for recommendations`)
  } else {
    afterItems.push(`All permissions are used`)
    afterItems.push(`No changes recommended`)
  }

  return {
    resourceName: roleName,
    resourceType,
    system: systemName,
    environment: systemName.includes('prod') ? 'Production' : systemName.includes('dev') ? 'Development' : 'N/A',
    lastSeen: new Date().toISOString().replace('T', ' ').substring(0, 19),

    finding: unusedPerms > allowedPerms * 0.5 ? {
      ruleName: 'Excessive Permissions',
      severity: 'medium' as const,
      source: 'IAM Analysis',
    } : undefined,

    currentConfig: {
      summary: `${roleName} - ${usedPerms}/${allowedPerms} permissions used`,
      details: configDetails,
    },

    riskExplanation: 'Excessive IAM permissions increase blast radius if credentials are compromised. Permissions should match actual usage observed in CloudTrail.',

    observedBehavior: {
      usedActions: usedActions.slice(0, 5).map((action: string) => ({
        action,
        count: 1,
        lastUsed: 'Last 90 days'
      })),
      unusedActions: unusedByService,
      credentialContext: `${roleName} - Service role`,
      lastActivity: usedPerms > 0 ? `${usedPerms} permissions observed in use` : 'N/A',
      coverageLevel: usedPerms > 0 ? 'high' as const : 'low' as const,
      coverageNote: `IAM: ${allowedPerms} permissions analyzed`,
    },

    recommendation: {
      action: 'restrict',
      before: beforeItems,
      after: afterItems,
      impactPreview: unusedPerms > 0 ? [
        `Remove ${unusedPerms} unused permissions`,
        `${Math.round(unusedPerms / allowedPerms * 100)}% reduction in attack surface`,
      ] : undefined,
    },

    dataSources: {
      flowLogs: false,
      cloudTrail: true,
      awsConfig: false,
      iam: true,
    },
  }
}

// Helper function to generate least-privilege data from REAL backend data only
export function generateLeastPrivilegeData(data: RealNodeData): LeastPrivilegeData {
  const { node, systemName, iamGaps, edges = [], sgRules = [], configData, cloudTrailData, findings = [], detailedIamRole, flowContext, checkpointContext } = data

  // If this is a checkpoint (SG or IAM), use specialized generation
  if (checkpointContext) {
    return generateCheckpointLeastPrivilegeData(data)
  }

  const nodeType = (node.type || '').toLowerCase()
  const nodeName = node.name || node.shortName || node.id || 'Unknown'

  // Determine resource type from actual node type
  let resourceType: ResourceType = 'ec2'
  if (nodeType.includes('security') || nodeType.includes('sg')) resourceType = 'security_group'
  else if (nodeType.includes('iam') || nodeType.includes('role')) resourceType = 'iam_role'
  else if (nodeType.includes('s3') || nodeType.includes('bucket') || nodeType.includes('storage')) resourceType = 's3_bucket'
  else if (nodeType.includes('nacl')) resourceType = 'nacl'
  else if (nodeType.includes('rds') || nodeType.includes('database')) resourceType = 'rds'
  else if (nodeType.includes('lambda')) resourceType = 'lambda'
  else if (nodeType.includes('dynamo')) resourceType = 'dynamodb'
  else if (nodeType.includes('ec2') || nodeType.includes('compute') || nodeType.includes('instance')) resourceType = 'ec2'

  // Prioritize detailedIamRole from individual role API, fallback to iamGaps
  let relevantRole: any = detailedIamRole || null

  if (!relevantRole) {
    relevantRole = iamGaps.find(role => {
      const roleName = (role.role_name || '').toLowerCase()
      const nodeNameLower = nodeName.toLowerCase()
      return roleName.includes(nodeNameLower) || nodeNameLower.includes(roleName.replace(/-role$/i, ''))
    })
  }

  // Find real edges connected to this node
  const connectedEdges = edges.filter(e =>
    e.source === node.id || e.target === node.id ||
    (e.source || '').includes(node.id) || (e.target || '').includes(node.id)
  )

  // Extract real flow data from edges
  const realFlowData = connectedEdges.length > 0 ? {
    totalFlows: connectedEdges.reduce((sum, e) => sum + (e.flows || e.count || 0), 0),
    ports: [...new Set(connectedEdges.map(e => e.port).filter(Boolean))],
    sources: [...new Set(connectedEdges.map(e => e.source).filter(Boolean))],
    lastSeen: connectedEdges[0]?.last_seen || null
  } : null

  // Extract finding from CSPM findings (real data)
  const primaryFinding = findings.length > 0 ? findings[0] : null
  const findingData = primaryFinding ? {
    ruleName: primaryFinding.title || primaryFinding.ruleName || primaryFinding.checkId || 'Security Finding',
    severity: (primaryFinding.severity || 'medium').toLowerCase() as 'critical' | 'high' | 'medium' | 'low',
    source: primaryFinding.source || primaryFinding.provider || 'CSPM',
  } : undefined

  // Build AWS Config summary from real resource data
  const configSummary = configData?.resource ?
    `${configData.resource.type || 'Resource'} - ${configData.resource.name || nodeName}` :
    configData?.summary || undefined

  // Build config details from real AWS Config data
  const configDetails: string[] = []
  if (configData?.resource?.configuration) {
    const config = configData.resource.configuration
    if (config.securityGroups) configDetails.push(`Security Groups: ${config.securityGroups.join(', ')}`)
    if (config.instanceType) configDetails.push(`Instance Type: ${config.instanceType}`)
    if (config.engine) configDetails.push(`Engine: ${config.engine}`)
    if (config.engineVersion) configDetails.push(`Version: ${config.engineVersion}`)
    if (config.publiclyAccessible !== undefined) configDetails.push(`Publicly Accessible: ${config.publiclyAccessible}`)
    if (config.encrypted !== undefined) configDetails.push(`Encrypted: ${config.encrypted}`)
    if (config.multiAZ !== undefined) configDetails.push(`Multi-AZ: ${config.multiAZ}`)
    if (config.vpcId) configDetails.push(`VPC: ${config.vpcId}`)
    if (config.subnetId) configDetails.push(`Subnet: ${config.subnetId}`)
  }
  if (configData?.connections) {
    if (configData.connections.inbound?.length) configDetails.push(`Inbound connections: ${configData.connections.inbound.length}`)
    if (configData.connections.outbound?.length) configDetails.push(`Outbound connections: ${configData.connections.outbound.length}`)
  }

  // Use flowContext data when AWS Config is not available
  if (configDetails.length === 0 && flowContext) {
    // Add traffic data from flow context
    if (flowContext.inboundPorts.length > 0) {
      configDetails.push(`Inbound ports: ${flowContext.inboundPorts.join(', ')}`)
    }
    if (flowContext.outboundPorts.length > 0) {
      configDetails.push(`Outbound ports: ${flowContext.outboundPorts.join(', ')}`)
    }
    if (flowContext.inboundRequests > 0) {
      configDetails.push(`Inbound requests: ${flowContext.inboundRequests.toLocaleString()}`)
    }
    if (flowContext.outboundRequests > 0) {
      configDetails.push(`Outbound requests: ${flowContext.outboundRequests.toLocaleString()}`)
    }
    if (flowContext.sources.length > 0) {
      configDetails.push(`Traffic from: ${flowContext.sources.slice(0, 3).join(', ')}${flowContext.sources.length > 3 ? ` +${flowContext.sources.length - 3} more` : ''}`)
    }
    if (flowContext.destinations.length > 0) {
      configDetails.push(`Traffic to: ${flowContext.destinations.slice(0, 3).join(', ')}${flowContext.destinations.length > 3 ? ` +${flowContext.destinations.length - 3} more` : ''}`)
    }
    // Add security group info
    if (flowContext.securityGroups.length > 0) {
      flowContext.securityGroups.forEach((sg: any) => {
        configDetails.push(`SG: ${sg.shortName || sg.name} (${sg.usedCount}/${sg.totalCount} rules used)`)
      })
    }
    // Add IAM role info
    if (flowContext.iamRoles.length > 0) {
      flowContext.iamRoles.forEach((role: any) => {
        configDetails.push(`IAM: ${role.shortName || role.name} (${role.usedCount}/${role.totalCount} perms used)`)
      })
    }
  }

  // Build config summary from flow context if AWS Config not available
  const flowContextSummary = flowContext ?
    `${nodeName} - ${flowContext.inboundRequests + flowContext.outboundRequests} requests observed` : undefined

  // Build the card with ONLY real data - N/A for missing data
  const result: LeastPrivilegeData = {
    resourceName: nodeName,
    resourceType,
    resourceArn: configData?.resource?.arn || node.arn || node.resourceArn || undefined,
    system: systemName,
    // Try to get environment from: node, AWS Config tags, or infer from system name
    environment: node.environment ||
      configData?.tags?.Environment ||
      configData?.tags?.environment ||
      configData?.resource?.tags?.Environment ||
      configData?.resource?.tags?.environment ||
      configData?.resource?.configuration?.tags?.Environment ||
      configData?.resource?.configuration?.tags?.environment ||
      (systemName.includes('prod') ? 'Production' :
       systemName.includes('dev') ? 'Development' :
       systemName.includes('staging') ? 'Staging' : 'N/A'),
    lastSeen: realFlowData?.lastSeen ||
      configData?.resource?.configuration?.instanceCreateTime ||
      cloudTrailData?.lastEvent ||
      new Date().toISOString().replace('T', ' ').substring(0, 19),

    // Finding - from real CSPM findings
    finding: findingData,

    // Current Config - from real AWS Config data or flow context
    currentConfig: {
      summary: configSummary || flowContextSummary || 'N/A - No data available',
      details: configDetails.length > 0 ? configDetails : ['Enable AWS Config or Flow Logs to see configuration'],
    },

    // Risk explanation based on resource type (this is educational text, not data)
    riskExplanation: getRiskExplanation(resourceType),

    // Observed Behavior - from real data or flow context
    observedBehavior: {
      // Real observed ports from flow logs or flow context
      observedPorts: realFlowData?.ports.length ?
        realFlowData.ports.map(p => ({ port: p, protocol: 'tcp', count: 0 })) :
        flowContext?.inboundPorts.length || flowContext?.outboundPorts.length ?
          [...(flowContext?.inboundPorts || []), ...(flowContext?.outboundPorts || [])].map(p => ({ port: p, protocol: 'tcp', count: 0 })) :
        undefined,

      // Real observed sources from flow logs or flow context
      observedSources: realFlowData?.sources.length ?
        realFlowData.sources.slice(0, 5).map(s => ({
          source: s,
          type: s.startsWith('sg-') ? 'sg' as const : 'cidr' as const,
          count: 0
        })) :
        flowContext?.sources.length ?
        flowContext.sources.slice(0, 5).map(s => ({
          source: s,
          type: s.startsWith('sg-') ? 'sg' as const : 'cidr' as const,
          count: 0
        })) :
        undefined,

      // Real IAM actions from CloudTrail or IAM gap analysis
      usedActions: cloudTrailData?.usedActions ||
        (relevantRole?.used_actions_list || relevantRole?.used_actions || relevantRole?.usedActions || []).map((action: string) => ({
          action,
          count: 1,
          lastUsed: 'Last 90 days'
        })) || undefined,

      // Unused actions by service from IAM gap analysis
      unusedActions: (relevantRole?.unused_by_service || relevantRole?.unusedByService || []).map((svc: any) => ({
        service: svc.service || svc.name || 'unknown',
        count: svc.count || svc.permissions?.length || 0,
        actions: svc.permissions || svc.actions || []
      })) || undefined,

      credentialContext: relevantRole ?
        `${relevantRole.role_name || relevantRole.name || 'IAM Role'} - ${
          node.type?.includes('lambda') ? 'Lambda execution role' :
          node.type?.includes('ec2') ? 'Instance profile role' : 'Service role'
        }` : undefined,

      // Real last activity - check multiple sources including flow context
      lastActivity: realFlowData?.lastSeen ?
        formatLastSeen(realFlowData.lastSeen) :
        flowContext ? `${(flowContext.inboundRequests + flowContext.outboundRequests).toLocaleString()} requests` :
        cloudTrailData?.lastEvent ? formatLastSeen(cloudTrailData.lastEvent) :
        configData?.resource?.configuration?.instanceCreateTime ? 'Resource active' :
        relevantRole ? 'IAM role attached' : 'N/A',

      // Coverage level - based on whether we have data
      coverageLevel: realFlowData ? 'high' : flowContext ? 'high' : (cloudTrailData || relevantRole) ? 'partial' : configData ? 'partial' : 'low',
      coverageNote: realFlowData ?
        `Flow logs: ${connectedEdges.length} edges observed` :
        flowContext ? `Traffic: ${(flowContext.inboundRequests + flowContext.outboundRequests).toLocaleString()} requests, ${flowContext.securityGroups.length} SGs` :
        relevantRole ? `IAM: ${relevantRole.allowed_permissions || relevantRole.total_permissions || 0} permissions analyzed` :
        configData ? `AWS Config: ${configDetails.length} properties` :
        cloudTrailData ? 'CloudTrail data available' :
        'No observability data available',
    },

    // Recommendations - only if we have enough data to make them
    recommendation: buildRecommendation(resourceType, relevantRole, realFlowData, configData, sgRules, flowContext),

    // Data sources - indicate what we actually have
    dataSources: {
      flowLogs: !!realFlowData || !!flowContext,
      cloudTrail: !!cloudTrailData || !!relevantRole,
      awsConfig: !!configData?.resource,
      iam: !!relevantRole || (flowContext?.iamRoles?.length || 0) > 0,
    },
  }

  return result
}

// Risk explanations (educational text, not data)
function getRiskExplanation(resourceType: ResourceType): string {
  switch (resourceType) {
    case 'security_group':
    case 'ec2':
      return 'Overly permissive security groups expose unnecessary attack surface. Only ports and sources actually in use should be allowed.'
    case 'iam_role':
      return 'Excessive IAM permissions increase blast radius if credentials are compromised. Permissions should match actual usage.'
    case 's3_bucket':
      return 'Unrestricted S3 access can lead to data exposure. Access should be limited to known principals and operations.'
    case 'rds':
      return 'Database exposure increases risk of unauthorized access. Network access should be restricted to application servers only.'
    case 'lambda':
      return 'Lambda execution roles with broad permissions can be exploited if function code is compromised.'
    case 'dynamodb':
      return 'DynamoDB tables should have access restricted to specific roles and operations.'
    default:
      return 'Resource permissions should follow least-privilege principle based on actual usage patterns.'
  }
}

// Format last seen timestamp
function formatLastSeen(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`
    return `${Math.floor(diffMins / 1440)} days ago`
  } catch {
    return 'N/A'
  }
}

// Build recommendation only if we have enough data
function buildRecommendation(
  resourceType: ResourceType,
  relevantRole: any,
  realFlowData: any,
  configData: any,
  sgRules?: any[],
  flowContext?: any
): LeastPrivilegeData['recommendation'] {
  const hasData = relevantRole || realFlowData || configData || (sgRules && sgRules.length > 0) || flowContext

  if (!hasData) {
    return {
      action: 'restrict',
      before: ['Insufficient data to determine current state'],
      after: ['Enable Flow Logs and CloudTrail to get recommendations'],
    }
  }

  // For IAM roles with real gap data - show detailed permissions
  if (relevantRole && resourceType === 'iam_role') {
    const used = relevantRole.used_permissions || relevantRole.used_count || 0
    const total = relevantRole.allowed_permissions || relevantRole.total_permissions || 0
    const unused = relevantRole.unused_permissions || relevantRole.unused_count || 0
    const roleName = relevantRole.role_name || relevantRole.name || 'IAM Role'

    // Real data only - check all possible field names from different API endpoints
    const unusedByService = relevantRole.unused_by_service || relevantRole.unusedByService || []
    const usedActions = relevantRole.used_actions_list || relevantRole.used_actions || relevantRole.usedActions || []
    const unusedActions = relevantRole.unused_actions_list || relevantRole.unused_actions || relevantRole.unusedActions || []

    // Build before items - current state with actual permissions
    const beforeItems: string[] = []
    beforeItems.push(`${roleName}`)

    if (total > 0) {
      beforeItems.push(`${total} permissions allowed`)
    } else {
      beforeItems.push(`Permissions: N/A (CloudTrail analysis pending)`)
    }

    // Show unused permissions by service if available
    if (unusedByService.length > 0) {
      beforeItems.push(`Unused by service:`)
      unusedByService.slice(0, 4).forEach((svc: any) => {
        const serviceName = svc.service || svc.name || 'unknown'
        const count = svc.count || svc.permissions?.length || 0
        beforeItems.push(`  ${serviceName}: ${count} unused`)
      })
      if (unusedByService.length > 4) {
        beforeItems.push(`  +${unusedByService.length - 4} more services`)
      }
    }

    // Show specific unused actions if available
    if (unusedActions.length > 0 && unusedByService.length === 0) {
      beforeItems.push(`Unused actions:`)
      unusedActions.slice(0, 4).forEach((action: string) => {
        beforeItems.push(`  ${action}`)
      })
      if (unusedActions.length > 4) {
        beforeItems.push(`  +${unusedActions.length - 4} more actions`)
      }
    }

    // Build after items - recommended state
    const afterItems: string[] = []

    if (total > 0 && used > 0) {
      afterItems.push(`Reduce to ${used} permissions`)

      // Show used permissions/actions if available
      if (usedActions.length > 0) {
        afterItems.push(`Keep only:`)
        usedActions.slice(0, 5).forEach((action: string) => {
          afterItems.push(`  ✓ ${action}`)
        })
        if (usedActions.length > 5) {
          afterItems.push(`  +${usedActions.length - 5} more`)
        }
      } else if (unused > 0) {
        afterItems.push(`Remove ${unused} unused permissions`)
      }
    } else {
      afterItems.push(`Enable CloudTrail analysis for recommendations`)
    }

    return {
      action: 'restrict',
      before: beforeItems,
      after: afterItems,
      impactPreview: unused > 0 ? [
        `${unused} permissions can be safely removed`,
        `${total > 0 ? Math.round(unused/total*100) : 0}% reduction in attack surface`,
      ] : undefined,
    }
  }

  // Always show detailed SG rules format
  const beforeItems: string[] = []

  // Extract actual inbound rules from SG data
  if (sgRules && sgRules.length > 0) {
    sgRules.forEach((sg: any) => {
      const sgName = sg.group_name || sg.name || sg.group_id || 'Security Group'
      const inboundRules = sg.inbound_rules || sg.rules?.inbound || sg.ip_permissions || []
      const totalRules = sg.total_rules || sg.rule_count || inboundRules.length || 0
      const usedRules = sg.used_rules || sg.used_count || 0
      const unusedRules = sg.unused_rules || sg.unused_count || (totalRules - usedRules)

      // Always show SG name and rule count
      beforeItems.push(`${sgName}: ${totalRules} inbound rules`)
      if (unusedRules > 0) {
        beforeItems.push(`  └ ${unusedRules} unused rules`)
      }

      // Show specific rules
      if (inboundRules.length > 0) {
        inboundRules.slice(0, 4).forEach((rule: any) => {
          const port = rule.port || rule.from_port || rule.toPort || '*'
          const source = rule.source || rule.cidr || rule.cidr_ip || rule.source_security_group || rule.ipRanges?.[0]?.cidrIp || '0.0.0.0/0'
          const protocol = (rule.protocol || rule.ip_protocol || 'tcp').toUpperCase()
          beforeItems.push(`  ${protocol}/${port} ← ${source}`)
        })
        if (inboundRules.length > 4) {
          beforeItems.push(`  +${inboundRules.length - 4} more rules`)
        }
      }
    })
  }

  // If no SG rules, show from flow observations with IP and port
  if (beforeItems.length === 0 && realFlowData) {
    // Show current state - what's being used
    beforeItems.push(`Current: Allow all inbound`)
    if (realFlowData.sources.length > 0) {
      realFlowData.sources.slice(0, 4).forEach((src: any) => {
        const source = typeof src === 'string' ? src : src?.ip || src?.name || src?.id || 'unknown'
        beforeItems.push(`  from ${source}`)
      })
    }
    if (realFlowData.ports.length > 0) {
      beforeItems.push(`  on ports: ${realFlowData.ports.slice(0, 5).join(', ')}`)
    }
  }

  // If still no data, try config connections - show actual IPs and ports
  if (beforeItems.length === 0 && configData?.connections?.inbound?.length) {
    const inbound = configData.connections.inbound
    console.log('[LeastPrivilege] Inbound connections structure:', inbound[0]) // Debug first connection
    beforeItems.push(`Current: ${inbound.length} inbound connections`)

    // Show each connection with IP, port, and protocol
    inbound.slice(0, 5).forEach((conn: any) => {
      // Extract IP from various possible structures
      const ip = conn.source_ip || conn.sourceIp || conn.ip ||
                 conn.source?.ip || conn.source?.name ||
                 (typeof conn.source === 'string' ? conn.source : null) ||
                 conn.resource_id || conn.name || 'unknown'

      // Extract port
      const port = conn.port || conn.dest_port || conn.destination_port ||
                   conn.from_port || conn.toPort || '*'

      // Extract protocol
      const protocol = (conn.protocol || conn.ip_protocol || 'TCP').toUpperCase()

      // Format: TCP/3306 ← 10.0.1.50
      beforeItems.push(`  ${protocol}/${port} ← ${ip}`)
    })

    if (inbound.length > 5) {
      beforeItems.push(`  +${inbound.length - 5} more connections`)
    }
  }

  // If no beforeItems yet, use flowContext data
  if (beforeItems.length === 0 && flowContext) {
    beforeItems.push(`Current traffic observed:`)
    if (flowContext.inboundPorts.length > 0) {
      beforeItems.push(`  Inbound: ${flowContext.inboundPorts.map((p: number) => `:${p}`).join(', ')}`)
    }
    if (flowContext.outboundPorts.length > 0) {
      beforeItems.push(`  Outbound: ${flowContext.outboundPorts.map((p: number) => `:${p}`).join(', ')}`)
    }
    if (flowContext.sources.length > 0) {
      beforeItems.push(`  From: ${flowContext.sources.slice(0, 3).join(', ')}${flowContext.sources.length > 3 ? ` +${flowContext.sources.length - 3} more` : ''}`)
    }
    if (flowContext.destinations.length > 0) {
      beforeItems.push(`  To: ${flowContext.destinations.slice(0, 3).join(', ')}${flowContext.destinations.length > 3 ? ` +${flowContext.destinations.length - 3} more` : ''}`)
    }
    if (flowContext.securityGroups.length > 0) {
      flowContext.securityGroups.forEach((sg: any) => {
        beforeItems.push(`  SG: ${sg.shortName || sg.name} (${sg.usedCount}/${sg.totalCount} used)`)
      })
    }
    beforeItems.push(`  ${(flowContext.inboundRequests + flowContext.outboundRequests).toLocaleString()} total requests`)
  }

  // Build after items - show specific IPs and ports to allow
  const afterItems: string[] = []
  if (realFlowData) {
    // Show the specific IPs to restrict to
    if (realFlowData.sources.length > 0) {
      realFlowData.sources.slice(0, 3).forEach((src: any) => {
        const ip = typeof src === 'string' ? src : src?.ip || src?.name || src?.id
        if (ip) afterItems.push(`Allow from ${ip}`)
      })
      if (realFlowData.sources.length > 3) {
        afterItems.push(`+${realFlowData.sources.length - 3} more sources`)
      }
    }
    // Show specific ports
    if (realFlowData.ports.length > 0) {
      afterItems.push(`Ports: ${realFlowData.ports.slice(0, 5).join(', ')}`)
    }
  } else if (configData?.connections?.inbound?.length) {
    // Use config connections to suggest tightening
    const inbound = configData.connections.inbound
    afterItems.push(`Review ${inbound.length} connections:`)

    // Group by port to show what ports are being used
    const portMap = new Map<string, string[]>()
    inbound.forEach((conn: any) => {
      const port = String(conn.port || conn.dest_port || conn.destination_port || '*')
      const ip = conn.source_ip || conn.sourceIp || conn.source?.ip ||
                 (typeof conn.source === 'string' ? conn.source : null) ||
                 conn.resource_id || conn.name || 'unknown'
      if (!portMap.has(port)) portMap.set(port, [])
      portMap.get(port)!.push(ip)
    })

    // Show recommendations per port
    Array.from(portMap.entries()).slice(0, 3).forEach(([port, ips]) => {
      const uniqueIps = [...new Set(ips)]
      if (uniqueIps.length <= 2) {
        afterItems.push(`  Port ${port}: Allow ${uniqueIps.join(', ')}`)
      } else {
        afterItems.push(`  Port ${port}: ${uniqueIps.length} sources`)
      }
    })
  } else if (flowContext) {
    // Use flow context for recommendations
    afterItems.push(`Restrict to observed traffic:`)
    if (flowContext.inboundPorts.length > 0) {
      afterItems.push(`  Allow inbound: ${flowContext.inboundPorts.map((p: number) => `:${p}`).join(', ')}`)
    }
    if (flowContext.outboundPorts.length > 0) {
      afterItems.push(`  Allow outbound: ${flowContext.outboundPorts.map((p: number) => `:${p}`).join(', ')}`)
    }
    if (flowContext.sources.length > 0) {
      afterItems.push(`  From: ${flowContext.sources.slice(0, 3).join(', ')}`)
    }
    if (flowContext.securityGroups.length > 0) {
      const unusedRules = flowContext.securityGroups.reduce((sum: number, sg: any) =>
        sum + (sg.totalCount - sg.usedCount), 0)
      if (unusedRules > 0) {
        afterItems.push(`  Remove ${unusedRules} unused SG rules`)
      }
    }
  } else {
    afterItems.push('Enable Flow Logs for specific recommendations')
  }

  // Impact preview
  const impactPreview: string[] = []
  if (realFlowData && realFlowData.totalFlows > 0) {
    impactPreview.push(`${realFlowData.totalFlows} flows will continue to work`)
  }

  return {
    action: 'restrict',
    before: beforeItems.length > 0 ? beforeItems : ['No configuration data available'],
    after: afterItems,
    impactPreview: impactPreview.length > 0 ? impactPreview : undefined,
  }
}
