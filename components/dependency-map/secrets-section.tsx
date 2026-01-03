'use client'

import React, { useState, useEffect } from 'react'
import { Key, Lock, ChevronRight, AlertCircle, Clock, CheckCircle } from 'lucide-react'

interface KMSKey {
  key_id: string
  alias?: string
  description?: string
  key_state: string
  key_spec?: string
  creation_date?: string
  tags?: Record<string, string>
}

interface Secret {
  name: string
  arn: string
  description?: string
  last_accessed?: string
  last_rotated?: string
  rotation_enabled?: boolean
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
        
        // Filter by system tag or name if possible
        const systemTag = resourceName.split('-')[0] // Get prefix like 'saferemediate'
        
        const filteredKms = (kmsData.kms_keys || []).filter((k: KMSKey) => 
          k.alias?.toLowerCase().includes(systemTag.toLowerCase()) ||
          k.tags?.SystemName === resourceName ||
          k.tags?.System === resourceName
        )
        
        const filteredSecrets = (secretsData.secrets || []).filter((s: Secret) =>
          s.name?.toLowerCase().includes(systemTag.toLowerCase()) ||
          s.tags?.SystemName === resourceName ||
          s.tags?.System === resourceName
        )
        
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Secrets & Keys</h3>
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
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Secrets & Keys</h3>
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
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Secrets & Keys</h3>
            <p className="text-sm text-slate-500">No secrets or KMS keys found for this resource</p>
          </div>
        </div>
      </div>
    )
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays < 30) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
          <Key className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Secrets & Keys</h3>
          <p className="text-sm text-slate-500">
            {data?.kms_keys?.length || 0} KMS keys • {data?.secrets?.length || 0} secrets
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* KMS Keys */}
        {data?.kms_keys && data.kms_keys.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Key className="w-4 h-4" />
              KMS Keys
            </h4>
            <div className="space-y-2">
              {data.kms_keys.map((key, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-sm">
                        {key.alias || key.key_id}
                      </div>
                      {key.description && (
                        <div className="text-xs text-slate-500 mt-1">{key.description}</div>
                      )}
                      <div className="text-xs font-mono text-slate-400 mt-1">{key.key_id}</div>
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
              ))}
            </div>
          </div>
        )}

        {/* Secrets */}
        {data?.secrets && data.secrets.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Secrets Manager
            </h4>
            <div className="space-y-2">
              {data.secrets.map((secret, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-sm">{secret.name}</div>
                      {secret.description && (
                        <div className="text-xs text-slate-500 mt-1">{secret.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {secret.rotation_enabled ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
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
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last accessed: {formatDate(secret.last_accessed)}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-2 break-all">{secret.arn}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


