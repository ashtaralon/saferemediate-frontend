'use client'

import React, { useState, useEffect } from 'react'
import { ChevronDown, Search, Server, Database, Key, Shield, Globe, Layers, Cloud } from 'lucide-react'

interface Resource {
  id: string
  name: string
  type: string
  arn?: string
}

interface Props {
  systemName: string
  selectedResource: Resource | null
  onSelectResource: (resource: Resource) => void
  resources: Resource[]
  isLoading: boolean
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

export default function ResourceSelector({ 
  systemName, 
  selectedResource, 
  onSelectResource, 
  resources, 
  isLoading 
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredResources = resources.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Group resources by type
  const groupedResources = filteredResources.reduce((acc, r) => {
    const type = r.type || 'Other'
    if (!acc[type]) acc[type] = []
    acc[type].push(r)
    return acc
  }, {} as Record<string, Resource[]>)

  const IconComponent = selectedResource 
    ? RESOURCE_ICONS[selectedResource.type] || RESOURCE_ICONS.default
    : RESOURCE_ICONS.default

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white border rounded-lg hover:border-blue-500 transition-colors"
        disabled={isLoading}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
            <IconComponent className="w-4 h-4 text-slate-600" />
          </div>
          {selectedResource ? (
            <div className="text-left">
              <div className="font-medium">{selectedResource.name}</div>
              <div className="text-xs text-slate-500">{selectedResource.type}</div>
            </div>
          ) : (
            <span className="text-slate-500">Select a resource...</span>
          )}
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border rounded-lg shadow-xl max-h-[400px] overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b sticky top-0 bg-white">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
                autoFocus
              />
            </div>
          </div>

          {/* Resources List */}
          <div className="overflow-y-auto max-h-[340px]">
            {isLoading ? (
              <div className="p-8 text-center text-slate-500">
                <div className="animate-pulse">Loading resources...</div>
              </div>
            ) : Object.keys(groupedResources).length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No resources found
              </div>
            ) : (
              Object.entries(groupedResources).map(([type, items]) => (
                <div key={type}>
                  <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0">
                    {type} ({items.length})
                  </div>
                  {items.map((resource) => {
                    const Icon = RESOURCE_ICONS[resource.type] || RESOURCE_ICONS.default
                    return (
                      <button
                        key={resource.id}
                        onClick={() => {
                          onSelectResource(resource)
                          setIsOpen(false)
                          setSearchQuery('')
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-50 transition-colors ${
                          selectedResource?.id === resource.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-3 h-3 text-slate-600" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{resource.name}</div>
                          {resource.arn && (
                            <div className="text-xs text-slate-400 font-mono truncate">{resource.arn}</div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => {
            setIsOpen(false)
            setSearchQuery('')
          }}
        />
      )}
    </div>
  )
}

