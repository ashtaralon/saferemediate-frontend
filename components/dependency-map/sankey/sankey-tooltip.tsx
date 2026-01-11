'use client'

import React from 'react'
import { Activity, ArrowRight, Server, Database, HardDrive } from 'lucide-react'
import { formatBytes } from './sankey-data-transformer'

interface NodeTooltipProps {
  node: {
    id: string
    label: string
    nodeType?: string
    color?: string
    value?: number
  }
}

interface LinkTooltipProps {
  link: {
    source: { id: string; label: string }
    target: { id: string; label: string }
    value: number
    port?: string
    protocol?: string
  }
}

export function SankeyNodeTooltip({ node }: NodeTooltipProps) {
  return (
    <div className="bg-slate-800 rounded-lg p-3 shadow-xl border border-slate-600 min-w-[200px]">
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-sm"
          style={{ backgroundColor: node.color || '#64748B' }}
        />
        <span className="font-semibold text-white">{node.label}</span>
      </div>
      <div className="text-sm text-slate-400 mt-1">{node.nodeType || 'Resource'}</div>
      {node.value !== undefined && node.value > 0 && (
        <div className="mt-2 flex items-center gap-2 text-emerald-400">
          <Activity className="w-4 h-4" />
          <span className="font-medium">{formatBytes(node.value)} total traffic</span>
        </div>
      )}
    </div>
  )
}

export function SankeyLinkTooltip({ link }: LinkTooltipProps) {
  return (
    <div className="bg-slate-800 rounded-lg p-3 shadow-xl border border-slate-600 min-w-[250px]">
      {/* Source -> Target */}
      <div className="flex items-center gap-2 text-white">
        <span className="font-medium truncate max-w-[100px]">{link.source.label}</span>
        <ArrowRight className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span className="font-medium truncate max-w-[100px]">{link.target.label}</span>
      </div>

      {/* Details */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="text-slate-400">Protocol:</div>
        <div className="text-white font-medium">{link.protocol || 'TCP'}</div>

        <div className="text-slate-400">Port:</div>
        <div className="text-white font-medium">{link.port || 'N/A'}</div>

        <div className="text-slate-400">Traffic:</div>
        <div className="text-emerald-400 font-semibold">{formatBytes(link.value)}</div>
      </div>

      {/* Traffic indicator */}
      <div className="mt-3 pt-2 border-t border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Active traffic flow</span>
        </div>
      </div>
    </div>
  )
}
