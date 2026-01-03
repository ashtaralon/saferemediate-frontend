'use client'

import React, { useState, useEffect } from 'react'
import { Database, HardDrive, ChevronDown, ChevronRight, Lock, Unlock, AlertTriangle, CheckCircle, Clock, Shield } from 'lucide-react'

interface S3Bucket {
  name: string
  arn?: string
  region?: string
  creation_date?: string
  is_public?: boolean
  is_encrypted?: boolean
  encryption_type?: string
  versioning?: boolean
  access_type?: 'Read' | 'Write' | 'Read/Write'
  last_accessed?: string
  tags?: Record<string, string>
}

interface DynamoDBTable {
  table_name: string
  table_arn?: string
  status?: string
  item_count?: number
  size_bytes?: number
  billing_mode?: string
  access_type?: 'Read' | 'Write' | 'Read/Write'
  last_accessed?: string
  tags?: Record<string, string>
}

interface StorageData {
  s3_buckets: S3Bucket[]
  dynamodb_tables: DynamoDBTable[]
}

interface Props {
  resourceId: string
  resourceType: string
  resourceName: string
}

export default function StorageSection({ resourceId, resourceType, resourceName }: Props) {
  const [data, setData] = useState<StorageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    const fetchStorageData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        // Fetch resources for the system
        const allRes = await fetch('/api/proxy/resources/all?regions=eu-west-1')
        
        if (!allRes.ok) {
          throw new Error('Failed to fetch resources')
        }
        
        const allData = await allRes.json()
        
        // Get system prefix for filtering
        const systemPrefix = resourceName.split('-')[0].toLowerCase()
        
        // Try to get CloudTrail data for access times
        let cloudTrailEvents: any[] = []
        try {
          const ctRes = await fetch(`/api/proxy/cloudtrail/events?lookbackDays=30&limit=500`)
          if (ctRes.ok) {
            const ctData = await ctRes.json()
            cloudTrailEvents = ctData.events || []
          }
        } catch {
          // CloudTrail is optional
        }
        
        // Helper to get last accessed from CloudTrail
        const getLastAccessed = (resourceName: string, resourceType: string): string | undefined => {
          const relevantEvents = cloudTrailEvents.filter((e: any) => {
            const eventSource = e.eventSource || ''
            const requestParams = e.requestParameters || {}
            
            if (resourceType === 's3') {
              return eventSource.includes('s3') && 
                (requestParams.bucketName === resourceName || e.resources?.some((r: any) => r.ARN?.includes(resourceName)))
            }
            if (resourceType === 'dynamodb') {
              return eventSource.includes('dynamodb') && 
                (requestParams.tableName === resourceName || e.resources?.some((r: any) => r.ARN?.includes(resourceName)))
            }
            return false
          })
          
          if (relevantEvents.length > 0) {
            // Sort by time and get the most recent
            relevantEvents.sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
            return relevantEvents[0].eventTime
          }
          return undefined
        }
        
        // Filter S3 buckets
        const s3Buckets: S3Bucket[] = (allData.s3_buckets || [])
          .filter((b: any) => 
            b.name?.toLowerCase().includes(systemPrefix) ||
            b.tags?.SystemName?.toLowerCase().includes(systemPrefix) ||
            b.tags?.System?.toLowerCase().includes(systemPrefix)
          )
          .map((b: any) => ({
            name: b.name,
            arn: b.arn || `arn:aws:s3:::${b.name}`,
            region: b.region,
            creation_date: b.creation_date,
            is_public: b.is_public || false,
            is_encrypted: b.is_encrypted !== false,
            encryption_type: b.encryption_type || (b.is_encrypted ? 'SSE-S3' : undefined),
            versioning: b.versioning,
            access_type: b.access_type || 'Read/Write',
            last_accessed: getLastAccessed(b.name, 's3'),
            tags: b.tags
          }))
        
        // Filter DynamoDB tables
        const dynamoTables: DynamoDBTable[] = (allData.dynamodb_tables || [])
          .filter((t: any) => 
            t.table_name?.toLowerCase().includes(systemPrefix) ||
            t.tags?.SystemName?.toLowerCase().includes(systemPrefix) ||
            t.tags?.System?.toLowerCase().includes(systemPrefix)
          )
          .map((t: any) => ({
            table_name: t.table_name,
            table_arn: t.table_arn,
            status: t.status,
            item_count: t.item_count,
            size_bytes: t.size_bytes,
            billing_mode: t.billing_mode,
            access_type: t.access_type || 'Read/Write',
            last_accessed: getLastAccessed(t.table_name, 'dynamodb'),
            tags: t.tags
          }))
        
        setData({
          s3_buckets: s3Buckets,
          dynamodb_tables: dynamoTables
        })
        
      } catch (e) {
        console.error('Storage fetch error:', e)
        setError('Unable to load storage data')
      } finally {
        setLoading(false)
      }
    }
    
    fetchStorageData()
  }, [resourceId, resourceType, resourceName])

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B'
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

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
          <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">💾 Storage Resources</h3>
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
          <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">💾 Storage Resources</h3>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const hasData = (data?.s3_buckets?.length || 0) > 0 || (data?.dynamodb_tables?.length || 0) > 0

  if (!hasData) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">💾 Storage Resources</h3>
            <p className="text-sm text-slate-500">No S3 buckets or DynamoDB tables found for this resource</p>
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
          <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-cyan-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-lg">💾 Storage Resources</h3>
            <p className="text-sm text-slate-500">
              {data?.s3_buckets?.length || 0} S3 buckets • {data?.dynamodb_tables?.length || 0} DynamoDB tables
            </p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 border-t pt-4 space-y-6">
          {/* S3 Buckets */}
          {data?.s3_buckets && data.s3_buckets.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-cyan-600" />
                S3 Buckets (from IAM policy + CloudTrail)
              </h4>
              <div className="space-y-3">
                {data.s3_buckets.map((bucket, i) => {
                  const lastAccessed = formatDate(bucket.last_accessed)
                  return (
                    <div key={i} className={`p-4 rounded-lg border-l-4 ${
                      bucket.is_public 
                        ? 'bg-red-50 border-red-400' 
                        : 'bg-slate-50 border-cyan-400'
                    }`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {bucket.name}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            ├── Access: <span className="font-medium">{bucket.access_type}</span>
                          </div>
                          {bucket.encryption_type && (
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                              ├── Encryption: <Shield className="w-3 h-3 text-green-500" /> 
                              <span className="font-mono">{bucket.encryption_type}</span>
                            </div>
                          )}
                          <div className="text-xs mt-1 flex items-center gap-1">
                            <span className="text-slate-500">└── Last accessed:</span>
                            <span className={`flex items-center gap-1 ${
                              lastAccessed.isRecent ? 'text-green-600' : 
                              lastAccessed.isOld ? 'text-amber-600' : 'text-slate-600'
                            }`}>
                              {lastAccessed.text}
                              {lastAccessed.isRecent && <CheckCircle className="w-3 h-3" />}
                              {lastAccessed.isOld && <AlertTriangle className="w-3 h-3" />}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {bucket.is_public ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs flex items-center gap-1">
                              <Unlock className="w-3 h-3" />
                              Public
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Private
                            </span>
                          )}
                          {!bucket.is_encrypted && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              No encryption
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* DynamoDB Tables */}
          {data?.dynamodb_tables && data.dynamodb_tables.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-600" />
                DynamoDB Tables (from IAM policy + CloudTrail)
              </h4>
              <div className="space-y-3">
                {data.dynamodb_tables.map((table, i) => {
                  const lastAccessed = formatDate(table.last_accessed)
                  return (
                    <div key={i} className="p-4 bg-slate-50 rounded-lg border-l-4 border-amber-400">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {table.table_name}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            ├── Access: <span className="font-medium">{table.access_type}</span>
                          </div>
                          <div className="text-xs mt-1 flex items-center gap-1">
                            <span className="text-slate-500">└── Last accessed:</span>
                            <span className={`flex items-center gap-1 ${
                              lastAccessed.isRecent ? 'text-green-600' : 
                              lastAccessed.isOld ? 'text-amber-600' : 'text-slate-600'
                            }`}>
                              {lastAccessed.text}
                              {lastAccessed.isRecent && <CheckCircle className="w-3 h-3" />}
                              {lastAccessed.isOld && (
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  (unused?)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            table.status === 'ACTIVE' 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {table.status || 'ACTIVE'}
                          </span>
                          {table.item_count !== undefined && (
                            <span className="text-xs text-slate-500">
                              {table.item_count.toLocaleString()} items
                            </span>
                          )}
                          {table.size_bytes !== undefined && (
                            <span className="text-xs text-slate-400">
                              {formatBytes(table.size_bytes)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
