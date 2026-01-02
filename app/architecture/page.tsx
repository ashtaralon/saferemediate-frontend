'use client'

import AWSTopologyMapLive from '@/components/aws-topology-map-live'
import { ResourceImpactPanel } from '@/components/resource-impact-panel'

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">AWS Architecture Graph</h1>
            <p className="text-slate-600 mt-1">
              Real-time topology from Neo4j • Live resource discovery
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              Live
            </span>
          </div>
        </div>
      </div>

      {/* Main Content - Topology + Impact Panel */}
      <div className="flex gap-6 h-[calc(100vh-200px)]">
        {/* Topology Map - Left Side */}
        <div className="flex-1 min-w-0">
          <AWSTopologyMapLive 
            systemName="alon-prod"
            autoRefreshInterval={30}
            height="100%"
            showLegend={true}
            showMiniMap={true}
          />
        </div>

        {/* Resource Impact Panel - Right Side */}
        <div className="w-[380px] flex-shrink-0">
          <ResourceImpactPanel />
        </div>
      </div>
    </div>
  )
}
// Deploy trigger: 1767362733
