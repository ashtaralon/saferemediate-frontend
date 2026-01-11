'use client'

import React, { useMemo, useState, useCallback } from 'react'
import { ResponsiveSankey } from '@nivo/sankey'
import { RefreshCw, Eye, EyeOff, Activity, AlertCircle, Maximize2 } from 'lucide-react'
import { transformToSankey, formatBytes } from './sankey-data-transformer'
import { SankeyNodeTooltip, SankeyLinkTooltip } from './sankey-tooltip'
import { SankeyLegend } from './sankey-legend'
import type { SankeyViewProps, SankeyData } from './sankey-types'

export default function SankeyView({
  graphData,
  isLoading,
  onNodeClick,
  onRefresh,
  showIAM: initialShowIAM = false,
  height = 600
}: SankeyViewProps) {
  const [showIAM, setShowIAM] = useState(initialShowIAM)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Transform graph data to Sankey format
  const sankeyData: SankeyData = useMemo(() => {
    if (!graphData?.nodes || !graphData?.edges) {
      return { nodes: [], links: [] }
    }
    return transformToSankey(graphData, { showIAM })
  }, [graphData, showIAM])

  // Calculate total traffic
  const totalTraffic = useMemo(() => {
    return sankeyData.links.reduce((sum, link) => sum + link.value, 0)
  }, [sankeyData])

  // Handle node click
  const handleNodeClick = useCallback((node: any) => {
    if (node && onNodeClick) {
      onNodeClick(node.id, node.nodeType || 'Unknown', node.label || node.id)
    }
  }, [onNodeClick])

  // Loading state
  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-slate-900 rounded-xl"
        style={{ height }}
      >
        <RefreshCw className="w-10 h-10 text-blue-400 animate-spin mb-4" />
        <p className="text-slate-400">Loading traffic data...</p>
      </div>
    )
  }

  // Empty state
  if (sankeyData.links.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-slate-900 rounded-xl text-white"
        style={{ height }}
      >
        <AlertCircle className="w-12 h-12 text-slate-500 mb-4" />
        <p className="text-slate-300 text-lg font-medium">No traffic data available</p>
        <p className="text-slate-500 text-sm mt-2 text-center max-w-md">
          Traffic flows will appear when ACTUAL_TRAFFIC edges are detected from VPC Flow Logs.
          <br />
          Click "Sync from AWS" to fetch the latest traffic data.
        </p>
        <button
          onClick={onRefresh}
          className="mt-6 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh Data
        </button>
      </div>
    )
  }

  const containerHeight = isFullscreen ? '100vh' : height

  return (
    <div
      className={`bg-slate-900 rounded-xl overflow-hidden flex flex-col ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
      style={{ height: containerHeight }}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-semibold">Traffic Flow</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">
              <span className="text-white font-medium">{sankeyData.nodes.length}</span> resources
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              <span className="text-emerald-400 font-medium">{sankeyData.links.length}</span> flows
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              <span className="text-emerald-400 font-medium">{formatBytes(totalTraffic)}</span> total
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* IAM Toggle */}
          <button
            onClick={() => setShowIAM(!showIAM)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showIAM
                ? 'bg-violet-600 text-white hover:bg-violet-700'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {showIAM ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            IAM Roles
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Sankey Diagram */}
      <div className="flex-1 min-h-0">
        <ResponsiveSankey
          data={sankeyData}
          margin={{ top: 40, right: 180, bottom: 40, left: 50 }}
          align="justify"
          colors={(node: any) => node.color || '#64748B'}
          nodeOpacity={1}
          nodeHoverOpacity={1}
          nodeHoverOthersOpacity={0.25}
          nodeThickness={24}
          nodeSpacing={20}
          nodeBorderWidth={2}
          nodeBorderColor={{ from: 'color', modifiers: [['darker', 0.6]] }}
          nodeBorderRadius={4}
          linkOpacity={0.5}
          linkHoverOpacity={0.8}
          linkHoverOthersOpacity={0.1}
          linkContract={3}
          linkBlendMode="screen"
          enableLinkGradient={true}
          labelPosition="outside"
          labelOrientation="horizontal"
          labelPadding={12}
          labelTextColor="#e2e8f0"
          theme={{
            background: 'transparent',
            text: {
              fill: '#e2e8f0',
              fontSize: 12,
            },
            tooltip: {
              container: {
                background: 'transparent',
                padding: 0,
                borderRadius: 0,
                boxShadow: 'none',
              },
            },
          }}
          onClick={handleNodeClick}
          nodeTooltip={({ node }) => (
            <SankeyNodeTooltip
              node={{
                id: node.id,
                label: node.label,
                nodeType: (node as any).nodeType,
                color: node.color,
                value: node.value,
              }}
            />
          )}
          linkTooltip={({ link }) => (
            <SankeyLinkTooltip
              link={{
                source: { id: link.source.id, label: link.source.label },
                target: { id: link.target.id, label: link.target.label },
                value: link.value,
                port: (link as any).port,
                protocol: (link as any).protocol,
              }}
            />
          )}
        />
      </div>

      {/* Legend */}
      <SankeyLegend />

      {/* Fullscreen escape hint */}
      {isFullscreen && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-slate-800/90 text-slate-300 text-xs px-3 py-1.5 rounded-full">
          Press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded mx-1">Esc</kbd> or click the button to exit fullscreen
        </div>
      )}
    </div>
  )
}
