"use client"

import { Activity } from "lucide-react"
import type { AutoTagStatus } from "./types"

interface AutoTagCardProps {
  autoTagStatus: AutoTagStatus
  loading: boolean
}

export function AutoTagCard({ autoTagStatus, loading }: AutoTagCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Auto-Tag Service</h3>
        </div>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            autoTagStatus.status === "running"
              ? "bg-green-100 text-green-700"
              : autoTagStatus.status === "error"
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-700"
          }`}
        >
          {loading
            ? "Loading..."
            : autoTagStatus.status === "running"
              ? "Running"
              : autoTagStatus.status === "error"
                ? "Error"
                : "Stopped"}
        </span>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Total Cycles</span>
          <span className="text-sm font-medium text-gray-900">{autoTagStatus.totalCycles}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">ACTUAL Traffic Captured</span>
          <span className="text-sm font-bold" style={{ color: "#8B5CF6" }}>
            {autoTagStatus.actualTrafficCaptured}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Last Sync</span>
          <span className="text-sm font-medium text-gray-900">{autoTagStatus.lastSync}</span>
        </div>
      </div>
    </div>
  )
}




