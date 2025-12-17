"use client"

import { useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import DependencyMapPro from './DependencyMapPro'
import DependencyTable from './DependencyTable'
import { LayoutGrid, Table } from 'lucide-react'

interface DependencyMapViewProps {
  systemName: string
}

export default function DependencyMapView({ systemName }: DependencyMapViewProps) {
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph')

  return (
    <div className="h-full">
      {/* View Toggle */}
      <div className="mb-4 flex justify-end gap-2">
        <button
          onClick={() => setViewMode('graph')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            viewMode === 'graph'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          Graph View
        </button>
        <button
          onClick={() => setViewMode('table')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            viewMode === 'table'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Table className="w-4 h-4" />
          Table View
        </button>
      </div>

      {/* Content */}
      {viewMode === 'graph' ? (
        <ReactFlowProvider>
          <DependencyMapPro systemName={systemName} />
        </ReactFlowProvider>
      ) : (
        <DependencyTable systemName={systemName} />
      )}
    </div>
  )
}