'use client'

import React, { useState, useEffect } from 'react'
import { Key, Shield, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, FileText, RefreshCw, TrendingUp, X } from 'lucide-react'

interface IAMData {
  role_name: string
  role_arn: string
  trust_policy?: any
  policies: {
    name: string
    type: 'managed' | 'inline'
    arn?: string
    permissions: string[]
    is_admin?: boolean
    is_overpermissioned?: boolean
  }[]
  used_permissions: string[]
  unused_permissions: string[]
  total_permissions: number
  lp_score?: number
}

interface Props {
  resourceId: string
  resourceType: string
  resourceName: string
}

export default function IAMSection({ resourceId, resourceType, resourceName }: Props) {
  const [data, setData] = useState<IAMData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set())
  const [showUsed, setShowUsed] = useState(true)
  const [showUnused, setShowUnused] = useState(true)

  useEffect(() => {
    const fetchIAMData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        // Try to get IAM role for this resource
        let roleName = resourceName
        
        // If it's not already an IAM role, try to find associated role
        if (resourceType !== 'IAMRole') {
          roleName = resourceName?.includes('-Role') || resourceName?.includes('Role') 
            ? resourceName 
            : `${resourceName}-Role`
        }
        
        // Fetch gap analysis for the role
        const res = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis`)
        
        if (!res.ok) {
          // Try with original name
          const altRes = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(resourceName)}/gap-analysis`)
          if (altRes.ok) {
            const gapData = await altRes.json()
            processGapData(gapData, resourceName)
            return
          }
          
          // Try permissions endpoint as fallback
          const permRes = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(resourceName)}/permissions`)
          if (permRes.ok) {
            const permData = await permRes.json()
            setData({
              role_name: resourceName,
              role_arn: permData.role_arn || '',
              policies: [{
                name: 'Attached Permissions',
                type: 'managed',
                permissions: permData.permissions || []
              }],
              used_permissions: [],
              unused_permissions: [],
              total_permissions: permData.permissions?.length || 0
            })
            return
          }
          throw new Error('Unable to fetch IAM data')
        }
        
        const gapData = await res.json()
        processGapData(gapData, roleName)
        
      } catch (e) {
        console.error('IAM fetch error:', e)
        setError('No IAM data available for this resource')
      } finally {
        setLoading(false)
      }
    }
    
    const processGapData = (gapData: any, roleName: string) => {
      // Collect all permissions across policies
      const allPermissions = new Set<string>()
      const usedPermissions = new Set<string>()
      const unusedPermissions = new Set<string>()
      
      // Process policy analysis
      const policies = (gapData.policy_analysis || []).map((p: any) => {
        const permissions = p.all_permissions || p.permissions || []
        permissions.forEach((perm: string) => allPermissions.add(perm))
        
        // Add used permissions from this policy
        const policyUsed = p.used_permissions || []
        policyUsed.forEach((perm: string) => usedPermissions.add(perm))
        
        // Add unused permissions from this policy
        const policyUnused = p.unused_permissions || []
        policyUnused.forEach((perm: string) => unusedPermissions.add(perm))
        
        return {
          name: p.policy_name || p.name,
          type: p.policy_type?.toLowerCase().includes('inline') ? 'inline' as const : 'managed' as const,
          arn: p.policy_arn,
          permissions,
          is_admin: p.has_admin_access,
          is_overpermissioned: (policyUnused.length || 0) > 0
        }
      })
      
      // Also check top-level used/unused
      const topLevelUsed = gapData.used_permissions || []
      topLevelUsed.forEach((p: string) => usedPermissions.add(p))
      
      const topLevelUnused = gapData.unused_permissions || []
      topLevelUnused.forEach((p: string) => unusedPermissions.add(p))
      
      setData({
        role_name: gapData.role_name || roleName,
        role_arn: gapData.role_arn || '',
        trust_policy: gapData.trust_policy,
        policies,
        used_permissions: Array.from(usedPermissions),
        unused_permissions: Array.from(unusedPermissions),
        total_permissions: allPermissions.size || topLevelUsed.length + topLevelUnused.length,
        lp_score: gapData.lp_score
      })
    }
    
    fetchIAMData()
  }, [resourceId, resourceType, resourceName])

  const togglePolicy = (policyName: string) => {
    const newExpanded = new Set(expandedPolicies)
    if (newExpanded.has(policyName)) {
      newExpanded.delete(policyName)
    } else {
      newExpanded.add(policyName)
    }
    setExpandedPolicies(newExpanded)
  }

  // Calculate permission score
  const permissionScore = data 
    ? Math.round((data.used_permissions.length / Math.max(data.total_permissions, 1)) * 100)
    : 0

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#8b5cf615] flex items-center justify-center">
            <Key className="w-5 h-5 text-[#8b5cf6]" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">🔐 IAM Permissions</h3>
            <p className="text-sm text-slate-500">Loading...</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-8 bg-slate-100 rounded animate-pulse" />
          <div className="h-8 bg-slate-100 rounded animate-pulse w-3/4" />
          <div className="h-8 bg-slate-100 rounded animate-pulse w-1/2" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#8b5cf615] flex items-center justify-center">
            <Key className="w-5 h-5 text-[#8b5cf6]" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">🔐 IAM Permissions</h3>
            <p className="text-sm text-slate-500">{error || 'No IAM data found'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Header - Collapsible */}
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
          <div className="w-10 h-10 rounded-lg bg-[#8b5cf615] flex items-center justify-center">
            <Key className="w-5 h-5 text-[#8b5cf6]" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-lg">🔐 IAM Permissions</h3>
            <p className="text-sm text-slate-500">Role: {data.role_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data.lp_score !== undefined && (
            <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${
              data.lp_score >= 80 ? 'bg-[#22c55e20] text-[#22c55e]' :
              data.lp_score >= 50 ? 'bg-[#f9731620] text-[#f97316]' :
              'bg-[#ef444420] text-[#ef4444]'
            }`}>
              LP Score: {data.lp_score}%
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 border-t pt-4">
          {/* Role ARN */}
          {data.role_arn && (
            <div className="mb-4 p-3 bg-slate-50 rounded-lg">
              <span className="text-xs text-slate-500">Role ARN</span>
              <p className="text-xs font-mono break-all mt-1">{data.role_arn}</p>
            </div>
          )}

          {/* Permission Score Bar */}
          <div className="mb-6 p-4 bg-white rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Permission Score
              </span>
              <span className={`text-lg font-bold ${
                permissionScore >= 80 ? 'text-[#22c55e]' :
                permissionScore >= 50 ? 'text-[#f97316]' :
                'text-[#ef4444]'
              }`}>
                {permissionScore}%
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
              <span>{data.used_permissions.length} used</span>
              <span>/</span>
              <span>{data.total_permissions} allowed</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5">
              <div 
                className={`h-2.5 rounded-full transition-all ${
                  permissionScore >= 80 ? 'bg-[#22c55e10]0' :
                  permissionScore >= 50 ? 'bg-[#f9731610]0' :
                  'bg-[#ef444410]0'
                }`}
                style={{ width: `${permissionScore}%` }}
              />
            </div>
          </div>

          {/* Used Permissions */}
          {data.used_permissions.length > 0 && (
            <div className="mb-4">
              <button 
                onClick={() => setShowUsed(!showUsed)}
                className="flex items-center gap-2 text-sm font-medium text-[#22c55e] mb-2 hover:text-[#22c55e]"
              >
                {showUsed ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <CheckCircle className="w-4 h-4" />
                {data.used_permissions.length} Used Permissions (from CloudTrail)
              </button>
              {showUsed && (
                <div className="p-3 bg-[#22c55e10] border border-[#22c55e40] rounded-lg">
                  <div className="flex flex-wrap gap-1.5">
                    {data.used_permissions.slice(0, 20).map((perm, i) => (
                      <span key={i} className="px-2 py-1 bg-[#22c55e20] text-[#22c55e] rounded text-xs font-mono">
                        {perm}
                      </span>
                    ))}
                    {data.used_permissions.length > 20 && (
                      <span className="px-2 py-1 text-[#22c55e] text-xs">
                        +{data.used_permissions.length - 20} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Unused Permissions */}
          {data.unused_permissions.length > 0 && (
            <div className="mb-4">
              <button 
                onClick={() => setShowUnused(!showUnused)}
                className="flex items-center gap-2 text-sm font-medium text-[#f97316] mb-2 hover:text-[#f97316]"
              >
                {showUnused ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <AlertTriangle className="w-4 h-4" />
                {data.unused_permissions.length} Unused Permissions Detected
              </button>
              {showUnused && (
                <div className="p-3 bg-[#f9731610] border border-[#f9731640] rounded-lg">
                  <div className="flex flex-wrap gap-1.5">
                    {data.unused_permissions.slice(0, 15).map((perm, i) => (
                      <span key={i} className="px-2 py-1 bg-[#f9731620] text-[#f97316] rounded text-xs font-mono flex items-center gap-1">
                        {perm}
                        <X className="w-3 h-3 text-amber-500" />
                      </span>
                    ))}
                    {data.unused_permissions.length > 15 && (
                      <span className="px-2 py-1 text-[#f97316] text-xs">
                        +{data.unused_permissions.length - 15} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Policies Tree */}
          {data.policies.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Attached Policies ({data.policies.length})
              </div>
              {data.policies.map((policy, idx) => (
                <div key={idx} className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => togglePolicy(policy.name)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${
                      policy.is_admin ? 'bg-[#ef444410]' : policy.is_overpermissioned ? 'bg-[#f9731610]' : ''
                    }`}
                  >
                    {expandedPolicies.has(policy.name) ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <FileText className="w-4 h-4 text-slate-500" />
                    <div className="flex-1 text-left">
                      <span className="font-medium">{policy.name}</span>
                      <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                        policy.type === 'inline' ? 'bg-[#3b82f620] text-[#3b82f6]' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {policy.type}
                      </span>
                    </div>
                    {policy.is_admin && (
                      <span className="px-2 py-0.5 bg-[#ef444420] text-[#ef4444] text-xs font-medium rounded">
                        ADMIN
                      </span>
                    )}
                    {policy.is_overpermissioned && !policy.is_admin && (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                    <span className="text-sm text-slate-500">{policy.permissions.length} permissions</span>
                  </button>
                  
                  {expandedPolicies.has(policy.name) && (
                    <div className="border-t px-4 py-3 bg-slate-50">
                      <div className="flex flex-wrap gap-1.5">
                        {policy.permissions.slice(0, 20).map((perm, i) => (
                          <span key={i} className="px-2 py-1 bg-white border rounded text-xs font-mono">
                            {perm}
                          </span>
                        ))}
                        {policy.permissions.length > 20 && (
                          <span className="px-2 py-1 text-slate-500 text-xs">
                            +{policy.permissions.length - 20} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
