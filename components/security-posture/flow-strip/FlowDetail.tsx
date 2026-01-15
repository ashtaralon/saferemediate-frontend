"use client"

import { useState } from "react"
import { X, Activity, CheckCircle, AlertTriangle, Zap, ChevronDown, ChevronUp, Trash2, Shield, Key, Loader2 } from "lucide-react"
import type { FlowDetail as FlowDetailType, FlowDetailProps } from "./types"

// Format numbers
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}

// Format bytes
function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

// Collapsible section component
function Section({
  title,
  icon: Icon,
  iconColor,
  bgColor,
  borderColor,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string
  icon: typeof Activity
  iconColor: string
  bgColor: string
  borderColor: string
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`border rounded-xl overflow-hidden ${borderColor}`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full px-4 py-3 ${bgColor} flex items-center justify-between`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <span className="font-semibold text-gray-800">{title}</span>
          {badge}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="p-4 bg-white">{children}</div>}
    </div>
  )
}

// Risk badge component
function RiskBadge({ risk }: { risk: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-green-100 text-green-700',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${styles[risk]}`}>
      {risk}
    </span>
  )
}

export function FlowDetail({ detail, loading, trafficDataLoading, hasRealTrafficData, onClose, onRemoveItem }: FlowDetailProps) {
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <span className="font-semibold text-gray-400">Loading...</span>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="px-6 py-4 border-b">
          <span className="font-semibold text-gray-400">Select a flow</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Click on a flow to see details
        </div>
      </div>
    )
  }

  const { flow, whatHappened, whatAllowedIt, whatsUnnecessary, whatCouldBreak, explanation } = detail

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">
            {flow.source.name} → {flow.destination.name}
          </h2>
          <p className="text-sm text-gray-500">Flow Analysis</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Auto-generated explanation */}
      <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100">
        <p className="text-sm text-indigo-800 leading-relaxed">
          {explanation}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Section 1: What Happened (Green) */}
        <Section
          title="What Happened"
          icon={Activity}
          iconColor="text-green-600"
          bgColor="bg-green-50"
          borderColor="border-green-200"
          badge={
            trafficDataLoading ? (
              <span className="flex items-center gap-1 text-xs text-gray-500 ml-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading traffic data...
              </span>
            ) : hasRealTrafficData ? (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-2">
                VPC Flow Logs
              </span>
            ) : (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full ml-2">
                Estimated
              </span>
            )
          }
        >
          {trafficDataLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading real traffic data from VPC Flow Logs...</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Ports</div>
                  <div className="font-mono text-sm">
                    {whatHappened.ports.length > 0 ? whatHappened.ports.map(p => `:${p}`).join(', ') : 'No data'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Total Requests</div>
                  <div className="font-semibold text-green-600">{formatNumber(whatHappened.totalRequests)}</div>
                </div>
                {whatHappened.latencyP95 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">P95 Latency</div>
                    <div className="font-semibold">{whatHappened.latencyP95}ms</div>
                  </div>
                )}
                {whatHappened.bytesTransferred && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Data Transferred</div>
                    <div className="font-semibold">{formatBytes(whatHappened.bytesTransferred)}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-gray-500 mb-1">Last Seen</div>
                  <div className="text-sm">{whatHappened.lastSeen}</div>
                </div>
              </div>
              {whatHappened.topSources && whatHappened.topSources.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs text-gray-500 mb-2">Top Sources</div>
                  <div className="flex flex-wrap gap-2">
                    {whatHappened.topSources.map((src, idx) => (
                      <span key={idx} className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                        {src}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Section>

        {/* Section 2: What Allowed It (Blue) */}
        <Section
          title="What Allowed It"
          icon={CheckCircle}
          iconColor="text-blue-600"
          bgColor="bg-blue-50"
          borderColor="border-blue-200"
          badge={
            <span className="text-xs text-blue-600 ml-2">
              {whatAllowedIt.sgRules.length + whatAllowedIt.iamPermissions.length} items
            </span>
          }
        >
          {/* SG Rules */}
          {whatAllowedIt.sgRules.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                <Shield className="w-3 h-3" />
                Security Group Rules
              </div>
              <div className="space-y-2">
                {whatAllowedIt.sgRules.map((rule, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium text-sm">{rule.sgName}</span>
                      <span className="text-gray-400 mx-2">→</span>
                      <span className="font-mono text-sm text-gray-600">{rule.rule}</span>
                    </div>
                    <span className="text-xs text-green-600">{formatNumber(rule.hits)} hits</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IAM Permissions */}
          {whatAllowedIt.iamPermissions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                <Key className="w-3 h-3" />
                IAM Permissions
              </div>
              <div className="space-y-2">
                {whatAllowedIt.iamPermissions.map((perm, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium text-sm">{perm.roleName}</span>
                      <span className="text-gray-400 mx-2">→</span>
                      <span className="font-mono text-sm text-gray-600">{perm.permission}</span>
                    </div>
                    <span className="text-xs text-green-600">{formatNumber(perm.usageCount)} uses</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Section 3: What's Unnecessary (Orange) */}
        <Section
          title="What's Unnecessary"
          icon={AlertTriangle}
          iconColor="text-amber-600"
          bgColor="bg-amber-50"
          borderColor="border-amber-200"
          badge={
            (whatsUnnecessary.unusedSgRules.length + whatsUnnecessary.unusedIamPerms.length) > 0 ? (
              <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full ml-2">
                {whatsUnnecessary.unusedSgRules.length + whatsUnnecessary.unusedIamPerms.length} removal candidates
              </span>
            ) : null
          }
        >
          {whatsUnnecessary.unusedSgRules.length === 0 && whatsUnnecessary.unusedIamPerms.length === 0 ? (
            <div className="text-center py-4 text-gray-500 text-sm">
              No unnecessary items found. This flow is optimized!
            </div>
          ) : (
            <>
              {/* Unused SG Rules */}
              {whatsUnnecessary.unusedSgRules.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                    <Shield className="w-3 h-3" />
                    Unused Security Group Rules
                  </div>
                  <div className="space-y-2">
                    {whatsUnnecessary.unusedSgRules.map((rule, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <div>
                          <span className="font-medium text-sm">{rule.sgName}</span>
                          <span className="text-gray-400 mx-2">→</span>
                          <span className="font-mono text-sm text-amber-700">{rule.rule}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{rule.confidence}% conf</span>
                          <button
                            onClick={() => onRemoveItem(`${rule.sgName}-${rule.rule}`, 'sg_rule')}
                            className="p-1 hover:bg-red-100 rounded text-red-500"
                            title="Remove this rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unused IAM Permissions */}
              {whatsUnnecessary.unusedIamPerms.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                    <Key className="w-3 h-3" />
                    Unused IAM Permissions
                  </div>
                  <div className="space-y-2">
                    {whatsUnnecessary.unusedIamPerms.map((perm, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-medium text-sm">{perm.roleName}</span>
                            <span className="text-gray-400 mx-2">→</span>
                            <span className="font-mono text-sm text-amber-700">{perm.permission}</span>
                          </div>
                          <RiskBadge risk={perm.riskLevel as 'high' | 'medium' | 'low'} />
                        </div>
                        <button
                          onClick={() => onRemoveItem(`${perm.roleName}-${perm.permission}`, 'iam_perm')}
                          className="p-1 hover:bg-red-100 rounded text-red-500"
                          title="Remove this permission"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Section>

        {/* Section 4: What Could Break (Red) */}
        <Section
          title="What Could Break"
          icon={Zap}
          iconColor="text-red-600"
          bgColor="bg-red-50"
          borderColor="border-red-200"
          defaultOpen={whatCouldBreak.length > 0}
        >
          {whatCouldBreak.length === 0 ? (
            <div className="text-center py-4 text-gray-500 text-sm">
              No breaking changes detected. Removals appear safe.
            </div>
          ) : (
            <div className="space-y-3">
              {whatCouldBreak.map((impact, idx) => (
                <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm text-red-700">{impact.item}</span>
                    <RiskBadge risk={impact.breakageRisk} />
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{impact.impactDescription}</p>
                  {impact.affectedServices.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {impact.affectedServices.map((svc, i) => (
                        <span key={i} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                          {svc}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
