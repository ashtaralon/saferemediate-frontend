"use client"

import { Server } from "lucide-react"
import type { GapAnalysis } from "./types"

interface SystemInfoCardProps {
  gapAnalysis: GapAnalysis
}

export function SystemInfoCard({ gapAnalysis }: SystemInfoCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center gap-2 mb-4">
        <Server className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">System Info</h3>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Account</span>
          <span className="text-sm font-medium text-gray-900">745783559495</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Region</span>
          <span className="text-sm font-medium text-gray-900">eu-west-1</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Environment</span>
          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
            Production
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Provider</span>
          <span className="text-sm font-medium text-gray-900">AWS</span>
        </div>
        <div className="border-t border-gray-100 pt-3 mt-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Graph Nodes</span>
            <span className="text-sm font-medium text-gray-900">60</span>
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Relationships</span>
          <span className="text-sm font-medium text-gray-900">73</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">ACTUAL Behavior</span>
          <span className="text-sm font-bold" style={{ color: "#8B5CF6" }}>
            {gapAnalysis.actual || 15}
          </span>
        </div>
      </div>
    </div>
  )
}







