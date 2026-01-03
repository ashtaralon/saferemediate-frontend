'use client'

import React, { useState, useEffect } from 'react'
import { Key, Shield, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, FileText, RefreshCw } from 'lucide-react'

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
  unused_permissions?: string[]
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
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchIAMData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        // Try to get IAM role for this resource
        let roleName = resourceName
        
        // If it's not already an IAM role, try to find associated role
        if (resourceType !== 'IAMRole') {
          // For Lambda, the role name is often part of the function config
          // For EC2, we'd need the instance profile
          // For now, we'll try a direct lookup
          roleName = resourceName.includes('-Role') || resourceName.includes('Role') 
            ? resourceName 
            : `${resourceName}-Role`
        }
        
        // Fetch gap analysis for the role
        const res = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis`)
        
        if (!res.ok) {
          // Try alternative endpoint
          const altRes = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(resourceName)}/permissions`)
          if (altRes.ok) {
            const permData = await altRes.json()
            setData({
              role_name: resourceName,
              role_arn: permData.role_arn || '',
              policies: [{
                name: 'Attached Permissions',
                type: 'managed',
                permissions: permData.permissions || []
              }]
            })
            return
          }
          throw new Error('Unable to fetch IAM data')
        }
        
        const gapData = await res.json()
        
        // Transform gap analysis data
        const policies = (gapData.policy_analysis || []).map((p: any) => ({
          name: p.policy_name || p.name,
          type: p.policy_type?.toLowerCase().includes('inline') ? 'inline' : 'managed',
          arn: p.policy_arn,
          permissions: p.all_permissions || p.permissions || [],
          is_admin: p.has_admin_access,
          is_overpermissioned: (p.unused_permissions?.length || 0) > 0
        }))
        
        setData({
          role_name: gapData.role_name || roleName,
          role_arn: gapData.role_arn || '',
          trust_policy: gapData.trust_policy,
          policies,
          unused_permissions: gapData.unused_permissions || [],
          lp_score: gapData.lp_score
        })
        
      } catch (e) {
        console.error('IAM fetch error:', e)
        setError('No IAM data available for this resource')
      } finally {
        setLoading(false)
      }
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">IAM Permissions</h3>
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
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">IAM Permissions</h3>
            <p className="text-sm text-slate-500">{error || 'No IAM data found'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">IAM Permissions</h3>
            <p className="text-sm text-slate-500">Role: {data.role_name}</p>
          </div>
        </div>
        {data.lp_score !== undefined && (
          <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${
            data.lp_score >= 80 ? 'bg-green-100 text-green-700' :
            data.lp_score >= 50 ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'
          }`}>
            LP Score: {data.lp_score}%
          </div>
        )}
      </div>

      {/* Role ARN */}
      {data.role_arn && (
        <div className="mb-4 p-3 bg-slate-50 rounded-lg">
          <span className="text-xs text-slate-500">Role ARN</span>
          <p className="text-xs font-mono break-all mt-1">{data.role_arn}</p>
        </div>
      )}

      {/* Policies Tree */}
      <div className="space-y-2">
        {data.policies.map((policy, idx) => (
          <div key={idx} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => togglePolicy(policy.name)}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${
                policy.is_admin ? 'bg-red-50' : policy.is_overpermissioned ? 'bg-amber-50' : ''
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
                  policy.type === 'inline' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {policy.type}
                </span>
              </div>
              {policy.is_admin && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">
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

      {/* Unused Permissions Warning */}
      {data.unused_permissions && data.unused_permissions.length > 0 && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
            <AlertTriangle className="w-4 h-4" />
            {data.unused_permissions.length} Unused Permissions Detected
          </div>
          <div className="flex flex-wrap gap-1">
            {data.unused_permissions.slice(0, 10).map((perm, i) => (
              <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-mono">
                {perm}
              </span>
            ))}
            {data.unused_permissions.length > 10 && (
              <span className="text-xs text-amber-600">+{data.unused_permissions.length - 10} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


