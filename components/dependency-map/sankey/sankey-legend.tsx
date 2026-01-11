'use client'

import React from 'react'
import { TIER_LABELS } from './sankey-types'
import { ArrowRight } from 'lucide-react'

export function SankeyLegend() {
  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2.5 border-t border-slate-700 bg-slate-800/50">
      {/* Flow direction indicator */}
      <div className="flex items-center gap-1 text-xs text-slate-500 mr-2">
        <span>Flow</span>
        <ArrowRight className="w-3 h-3" />
      </div>

      {/* Tier labels */}
      {TIER_LABELS.map((tier, index) => (
        <React.Fragment key={tier.name}>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: tier.color }}
            />
            <span className="text-xs text-slate-300">{tier.name}</span>
          </div>
          {index < TIER_LABELS.length - 1 && (
            <ArrowRight className="w-3 h-3 text-slate-600" />
          )}
        </React.Fragment>
      ))}

      {/* Traffic indicator */}
      <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-600">
        <div className="w-6 h-1 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400" />
        <span className="text-xs text-slate-400">Active Traffic</span>
      </div>
    </div>
  )
}
