'use client'

import React, { useState, useEffect } from 'react'
import { Key, Lock, ChevronDown, ChevronRight, AlertCircle, Clock, CheckCircle, Shield, RefreshCw } from 'lucide-react'

interface KMSKey {
  key_id: string
  alias?: string
  arn?: string
  description?: string
  key_state: string
  key_spec?: string
  creation_date?: string
  last_used?: string
  usage?: string
  tags?: Record<string, string>
}

interface Secret {
  name: string
  arn: string
  description?: string
  last_accessed?: string
  last_rotated?: string
  rotation_enabled?: boolean
  next_rotation?: string
  tags?: Record<string, string>
}

interface SecretsData {
  kms_keys: KMSKey[]
  secrets: Secret[]
}

interface Props {
  resourceId: string
  resourceType: string
  resourceName: string
}

export default function SecretsSection({ resourceId, resourceType, resourceName }: Props) {
  const [data, setData] = useState<SecretsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [showAllKMS, setShowAllKMS] = useState(false)
  const [showAllSecrets, setShowAllSecrets] = useState(false)

  useEffect(() => {
    const fetchSecretsData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const [kmsRes, secretsRes] = await Promise.all([
          fetch('/api/proxy/resources/kms?region=eu-west-1'),
          fetch('/api/proxy/resources/secrets?region=eu-west-1')
        ])
        
        const kmsData = kmsRes.ok ? await kmsRes.json() : { kms_keys: [] }
        const secretsData = secretsRes.ok ? await secretsRes.json() : { secrets: [] }
        
        // Get system prefix for filtering
        const systemPrefix = resourceName.split('-')[0].toLowerCase()
        
        // Filter KMS keys by system tag or name
        const filteredKms = (kmsData.kms_keys || kmsData.keys || [])
          .filter((k: KMSKey) => 
            k.alias?.toLowerCase().includes(systemPrefix) ||
            k.description?.toLowerCase().includes(systemPrefix) ||
            k.tags?.SystemName?.toLowerCase().includes(systemPrefix) ||
            k.tags?.System?.toLowerCase().includes(systemPrefix)
          )
          .map((k: any) => ({
            key_id: k.key_id || k.KeyId,
            alias: k.alias || k.AliasName,
            arn: k.arn || k.Arn,
            description: k.description || k.Description,
            key_state: k.key_state || k.KeyState || 'Enabled',
            key_spec: k.key_spec || k.KeySpec,
            creation_date: k.creation_date || k.CreationDate,
            last_used: k.last_used || k.LastUsedDate,
            usage: k.usage || k.KeyUsage,
            tags: k.tags
          }))
        
        // Filter secrets by system prefix
        const filteredSecrets = (secretsData.secrets || [])
          .filter((s: Secret) =>
            s.name?.toLowerCase().includes(systemPrefix) ||
            s.description?.toLowerCase().includes(systemPrefix) ||
            s.tags?.SystemName?.toLowerCase().includes(systemPrefix) ||
            s.tags?.System?.toLowerCase().includes(systemPrefix)
          )
          .map((s: any) => ({
            name: s.name || s.Name,
            arn: s.arn || s.ARN,
            description: s.description || s.Description,
            last_accessed: s.last_accessed || s.LastAccessedDate,
            last_rotated: s.last_rotated || s.LastRotatedDate,
            rotation_enabled: s.rotation_enabled ?? s.RotationEnabled ?? false,
            next_rotation: s.next_rotation || s.NextRotationDate,
            tags: s.tags
          }))
        
        setData({
          kms_keys: filteredKms,
          secrets: filteredSecrets
        })
        
      } catch (e) {
        console.error('Secrets fetch error:', e)
        setError('Unable to load secrets data')
      } finally {
        setLoading(false)
      }
    }
    
    fetchSecretsData()
  }, [resourceId, resourceType, resourceName])

  const formatDate = (dateStr?: string): { text: string; isRecent: boolean; isOld: boolean } => {
    if (!dateStr) return { text: 'Never', isRecent: false, isOld: true }
    
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffDays = Math.floor(diffHours / 24)
      
      if (diffHours < 1) return { text: 'Just now', isRecent: true, isOld: false }
      if (diffHours < 24) return { text: `${diffHours} hours ago`, isRecent: true, isOld: false }
      if (diffDays < 7) return { text: `${diffDays} days ago`, isRecent: true, isOld: false }
      if (diffDays < 30) return { text: `${diffDays} days ago`, isRecent: false, isOld: false }
      return { text: `${Math.floor(diffDays / 30)} months ago`, isRecent: false, isOld: true }
    } catch {
      return { text: 'Unknown', isRecent: false, isOld: false }
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">🔑 Secrets & Encryption Keys</h3>
            <p className="text-sm text-slate-500">Loading...</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-8 bg-slate-100 rounded animate-pulse" />
          <div className="h-8 bg-slate-100 rounded animate-pulse w-3/4" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">🔑 Secrets & Encryption Keys</h3>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const hasData = (data?.kms_keys?.length || 0) > 0 || (data?.secrets?.length || 0) > 0

  if (!hasData) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">🔑 Secrets & Encryption Keys</h3>
            <p className="text-sm text-slate-500">No secrets or KMS keys found for this resource</p>
          </div>
        </div>
      </div>
    )
  }

  const displayedKMS = showAllKMS ? data?.kms_keys : data?.kms_keys?.slice(0, 3)
  const displayedSecrets = showAllSecrets ? data?.secrets : data?.secrets?.slice(0, 3)

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
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-lg">🔑 Secrets & Encryption Keys</h3>
            <p className="text-sm text-slate-500">
              {data?.kms_keys?.length || 0} KMS keys • {data?.secrets?.length || 0} secrets
            </p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 border-t pt-4 space-y-6">
          {/* KMS Keys */}
          {data?.kms_keys && data.kms_keys.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-600" />
                KMS Keys (from IAM policy)
              </h4>
              <div className="space-y-2">
                {displayedKMS?.map((key, i) => {
                  const lastUsed = formatDate(key.last_used)
                  return (
                    <div key={i} className="p-4 bg-slate-50 rounded-lg border-l-4 border-emerald-400">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-medium text-sm flex items-center gap-2">
                            {key.alias || `Key ${key.key_id.slice(0, 8)}...`}
                          </div>
                          {key.arn && (
                            <div className="text-xs font-mono text-slate-400 mt-1 break-all">
                              ├── ARN: {key.arn}
                            </div>
                          )}
                          {key.usage && (
                            <div className="text-xs text-slate-500 mt-1">
                              ├── Usage: {key.usage}
                            </div>
                          )}
                          <div className="text-xs mt-1 flex items-center gap-1">
                            <span className="text-slate-500">└── Last used:</span>
                            <span className={`flex items-center gap-1 ${
                              lastUsed.isRecent ? 'text-green-600' : 
                              lastUsed.isOld ? 'text-amber-600' : 'text-slate-600'
                            }`}>
                              {lastUsed.text}
                              {lastUsed.isRecent && <CheckCircle className="w-3 h-3" />}
                              {lastUsed.isOld && <AlertCircle className="w-3 h-3" />}
                            </span>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          key.key_state === 'Enabled' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {key.key_state}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {(data.kms_keys.length > 3) && (
                  <button
                    onClick={() => setShowAllKMS(!showAllKMS)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showAllKMS ? 'Show less' : `+${data.kms_keys.length - 3} more keys`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Secrets */}
          {data?.secrets && data.secrets.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-600" />
                Secrets Manager
              </h4>
              <div className="space-y-2">
                {displayedSecrets?.map((secret, i) => {
                  const lastAccessed = formatDate(secret.last_accessed)
                  return (
                    <div key={i} className="p-4 bg-slate-50 rounded-lg border-l-4 border-purple-400">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{secret.name}</div>
                          {secret.description && (
                            <div className="text-xs text-slate-500 mt-1">{secret.description}</div>
                          )}
                          <div className="text-xs font-mono text-slate-400 mt-1 break-all">
                            ├── ARN: {secret.arn}
                          </div>
                          <div className="text-xs mt-1 flex items-center gap-1">
                            <span className="text-slate-500">└── Last accessed:</span>
                            <span className={`flex items-center gap-1 ${
                              lastAccessed.isRecent ? 'text-green-600' : 
                              lastAccessed.isOld ? 'text-amber-600' : 'text-slate-600'
                            }`}>
                              {lastAccessed.text}
                              {lastAccessed.isRecent && <CheckCircle className="w-3 h-3" />}
                              {lastAccessed.isOld && <AlertCircle className="w-3 h-3" />}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {secret.rotation_enabled ? (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1">
                              <RefreshCw className="w-3 h-3" />
                              Rotation
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              No rotation
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {(data.secrets.length > 3) && (
                  <button
                    onClick={() => setShowAllSecrets(!showAllSecrets)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showAllSecrets ? 'Show less' : `+${data.secrets.length - 3} more secrets`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
