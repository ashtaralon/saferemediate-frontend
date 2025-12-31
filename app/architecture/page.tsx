'use client'

import AWSTopologyMapLive from '@/components/aws-topology-map-live'

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">AWS Architecture Graph</h1>
        <p className="text-slate-600 mt-1">
          Real-time topology from Neo4j • Live resource discovery
        </p>
      </div>

      {/* Topology Map */}
      <AWSTopologyMapLive 
        systemName="alon-prod"
        autoRefreshInterval={30}
        height="700px"
        showLegend={true}
        showMiniMap={true}
      />
    </div>
  )
}
