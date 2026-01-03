'use client'

import React, { useState, useEffect } from 'react'
import { Database, HardDrive, ChevronRight, Lock, Unlock, AlertTriangle, CheckCircle } from 'lucide-react'

interface S3Bucket {
  name: string
  arn?: string
  region?: string
  creation_date?: string
  is_public?: boolean
  is_encrypted?: boolean
  versioning?: boolean
  access_type?: 'read' | 'write' | 'read/write'
  tags?: Record<string, string>
}

interface DynamoDBTable {
  table_name: string
  table_arn?: string
  status?: string
  item_count?: number
  size_bytes?: number
  billing_mode?: string
  access_type?: 'read' | 'write' | 'read/write'
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
        
        // Filter S3 buckets
        const s3Buckets: S3Bucket[] = (allData.s3_buckets || [])
          .filter((b: any) => 
            b.name?.toLowerCase().includes(systemPrefix) ||
            b.tags?.SystemName === resourceName ||
            b.tags?.System === resourceName
          )
          .map((b: any) => ({
            name: b.name,
            arn: b.arn || `arn:aws:s3:::${b.name}`,
            region: b.region,
            creation_date: b.creation_date,
            is_public: b.is_public || false,
            is_encrypted: b.is_encrypted !== false,
            versioning: b.versioning,
            tags: b.tags
          }))
        
        // Filter DynamoDB tables
        const dynamoTables: DynamoDBTable[] = (allData.dynamodb_tables || [])
          .filter((t: any) => 
            t.table_name?.toLowerCase().includes(systemPrefix) ||
            t.tags?.SystemName === resourceName ||
            t.tags?.System === resourceName
          )
          .map((t: any) => ({
            table_name: t.table_name,
            table_arn: t.table_arn,
            status: t.status,
            item_count: t.item_count,
            size_bytes: t.size_bytes,
            billing_mode: t.billing_mode,
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Storage</h3>
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
          <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Storage</h3>
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
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Storage</h3>
            <p className="text-sm text-slate-500">No S3 buckets or DynamoDB tables found for this resource</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
          <Database className="w-5 h-5 text-cyan-600" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Storage</h3>
          <p className="text-sm text-slate-500">
            {data?.s3_buckets?.length || 0} S3 buckets • {data?.dynamodb_tables?.length || 0} DynamoDB tables
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* S3 Buckets */}
        {data?.s3_buckets && data.s3_buckets.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              S3 Buckets
            </h4>
            <div className="space-y-2">
              {data.s3_buckets.map((bucket, i) => (
                <div key={i} className={`p-3 rounded-lg border ${
                  bucket.is_public ? 'bg-red-50 border-red-200' : 'bg-slate-50'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        {bucket.name}
                        {bucket.access_type && (
                          <span className="text-xs text-slate-500">({bucket.access_type})</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
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
                      {bucket.is_encrypted ? (
                        <CheckCircle className="w-4 h-4 text-green-500" title="Encrypted" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" title="Not encrypted" />
                      )}
                    </div>
                  </div>
                  {bucket.arn && (
                    <div className="text-xs font-mono text-slate-400 break-all">{bucket.arn}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DynamoDB Tables */}
        {data?.dynamodb_tables && data.dynamodb_tables.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Database className="w-4 h-4" />
              DynamoDB Tables
            </h4>
            <div className="space-y-2">
              {data.dynamodb_tables.map((table, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        {table.table_name}
                        {table.access_type && (
                          <span className="text-xs text-slate-500">({table.access_type})</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        table.status === 'ACTIVE' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {table.status || 'ACTIVE'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {table.item_count !== undefined && (
                      <span>{table.item_count.toLocaleString()} items</span>
                    )}
                    {table.size_bytes !== undefined && (
                      <span>{formatBytes(table.size_bytes)}</span>
                    )}
                    {table.billing_mode && (
                      <span className="text-slate-400">{table.billing_mode}</span>
                    )}
                  </div>
                  {table.table_arn && (
                    <div className="text-xs font-mono text-slate-400 mt-2 break-all">{table.table_arn}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

