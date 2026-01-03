'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { 
  ArrowLeft, Server, Database, Key, Shield, Globe, Cloud, Layers,
  RefreshCw, ExternalLink
} from 'lucide-react'
import ResourceSelector from './resource-selector'
import IAMSection from './iam-section'
import NetworkSection from './network-section'
import SecretsSection from './secrets-section'
import StorageSection from './storage-section'
import ConnectionsSection from './connections-section'

interface Resource {
  id: string
  name: string
  type: string
  arn?: string
}

interface Props {
  systemName: string
  selectedResource: Resource | null
  resources: Resource[]
  resourcesLoading: boolean
  onSelectResource: (resource: Resource) => void
  onBackToGraph: () => void
}

const RESOURCE_ICONS: Record<string, any> = {
  Lambda: Cloud,
  EC2: Server,
  RDS: Database,
  DynamoDB: Database,
  S3Bucket: Database,
  SecurityGroup: Shield,
  IAMRole: Key,
  Internet: Globe,
  default: Layers,
}

const RESOURCE_COLORS: Record<string, string> = {
  Lambda: 'bg-green-100 text-green-600',
  EC2: 'bg-emerald-100 text-emerald-600',
  RDS: 'bg-indigo-100 text-indigo-600',
  DynamoDB: 'bg-amber-100 text-amber-600',
  S3Bucket: 'bg-cyan-100 text-cyan-600',
  SecurityGroup: 'bg-orange-100 text-orange-600',
  IAMRole: 'bg-purple-100 text-purple-600',
  Internet: 'bg-red-100 text-red-600',
  default: 'bg-slate-100 text-slate-600',
}

export default function ResourceView({ 
  systemName, 
  selectedResource, 
  resources,
  resourcesLoading,
  onSelectResource, 
  onBackToGraph 
}: Props) {
  const [refreshKey, setRefreshKey] = useState(0)
  
  const handleRefresh = () => {
    setRefreshKey(k => k + 1)
  }

  const IconComponent = selectedResource 
    ? RESOURCE_ICONS[selectedResource.type] || RESOURCE_ICONS.default
    : RESOURCE_ICONS.default
  
  const colorClass = selectedResource
    ? RESOURCE_COLORS[selectedResource.type] || RESOURCE_COLORS.default
    : RESOURCE_COLORS.default

  // Determine which sections to show based on resource type
  const showIAM = useMemo(() => {
    if (!selectedResource) return false
    const t = selectedResource.type.toLowerCase()
    return t === 'iamrole' || t === 'lambda' || t === 'ec2' || t.includes('role')
  }, [selectedResource])

  const showNetwork = useMemo(() => {
    if (!selectedResource) return false
    const t = selectedResource.type.toLowerCase()
    return t === 'securitygroup' || t === 'ec2' || t === 'lambda' || t === 'rds' || t.includes('sg')
  }, [selectedResource])

  const showSecrets = useMemo(() => {
    if (!selectedResource) return false
    const t = selectedResource.type.toLowerCase()
    return t === 'lambda' || t === 'ec2' || t === 'rds'
  }, [selectedResource])

  const showStorage = useMemo(() => {
    if (!selectedResource) return false
    const t = selectedResource.type.toLowerCase()
    return t === 'lambda' || t === 'ec2' || t === 's3bucket' || t === 'dynamodb'
  }, [selectedResource])

  const showConnections = useMemo(() => {
    if (!selectedResource) return false
    // Show connections for most resource types
    return true
  }, [selectedResource])

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToGraph}
            className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Graph
          </button>
          
          <div className="h-8 w-px bg-slate-200" />
          
          <div className="w-[300px]">
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
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedResource ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <Layers className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-700 mb-2">Select a Resource</h3>
            <p className="text-slate-500 max-w-md">
              Choose a resource from the dropdown above to view its dependencies, 
              IAM permissions, network configuration, and connections.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Resource Header Card */}
            <div className="bg-gradient-to-r from-slate-50 to-white rounded-xl border p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl ${colorClass} flex items-center justify-center`}>
                    <IconComponent className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{selectedResource.name}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-sm text-slate-600">
                        {selectedResource.type}
                      </span>
                      <span className="text-sm text-slate-500">System: {systemName}</span>
                    </div>
                  </div>
                </div>
                {selectedResource.arn && (
                  <a
                    href={`https://console.aws.amazon.com/resource-groups/tag-editor/find-resources?${new URLSearchParams({ 
                      'resourceArn': selectedResource.arn 
                    })}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    AWS Console
                  </a>
                )}
              </div>
              {selectedResource.arn && (
                <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                  <span className="text-xs text-slate-500">ARN</span>
                  <p className="text-xs font-mono break-all mt-1 text-slate-700">{selectedResource.arn}</p>
                </div>
              )}
            </div>

            {/* Dependency Sections */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Left Column - IAM & Network */}
              <div className="space-y-6">
                {showIAM && (
                  <IAMSection
                    key={`iam-${refreshKey}`}
                    resourceId={selectedResource.id}
                    resourceType={selectedResource.type}
                    resourceName={selectedResource.name}
                  />
                )}
                
                {showNetwork && (
                  <NetworkSection
                    key={`network-${refreshKey}`}
                    resourceId={selectedResource.id}
                    resourceType={selectedResource.type}
                    resourceName={selectedResource.name}
                  />
                )}
              </div>
              
              {/* Right Column - Secrets, Storage, Connections */}
              <div className="space-y-6">
                {showSecrets && (
                  <SecretsSection
                    key={`secrets-${refreshKey}`}
                    resourceId={selectedResource.id}
                    resourceType={selectedResource.type}
                    resourceName={selectedResource.name}
                  />
                )}
                
                {showStorage && (
                  <StorageSection
                    key={`storage-${refreshKey}`}
                    resourceId={selectedResource.id}
                    resourceType={selectedResource.type}
                    resourceName={selectedResource.name}
                  />
                )}
                
                {showConnections && (
                  <ConnectionsSection
                    key={`connections-${refreshKey}`}
                    resourceId={selectedResource.id}
                    resourceType={selectedResource.type}
                    resourceName={selectedResource.name}
                  />
                )}
              </div>
            </div>

            {/* Show all sections if resource type doesn't match specific types */}
            {!showIAM && !showNetwork && !showSecrets && !showStorage && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <IAMSection
                    key={`iam-${refreshKey}`}
                    resourceId={selectedResource.id}
                    resourceType={selectedResource.type}
                    resourceName={selectedResource.name}
                  />
                  <NetworkSection
                    key={`network-${refreshKey}`}
                    resourceId={selectedResource.id}
                    resourceType={selectedResource.type}
                    resourceName={selectedResource.name}
                  />
                </div>
                <div className="space-y-6">
                  <ConnectionsSection
                    key={`connections-${refreshKey}`}
                    resourceId={selectedResource.id}
                    resourceType={selectedResource.type}
                    resourceName={selectedResource.name}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

