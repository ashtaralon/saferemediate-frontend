"use client"

import { Activity } from "lucide-react"
import type { AutoTagStatus } from "./types"

interface AutoTagCardProps {
  autoTagStatus: AutoTagStatus
  loading: boolean
}

export function AutoTagCard({ autoTagStatus, loading }: AutoTagCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--muted-foreground,#6b7280)]" />
          <h3 className="text-sm font-semibold text-[var(--foreground,#111827)] uppercase tracking-wide">Auto-Tag Service</h3>
        </div>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            autoTagStatus.status === "running"
              ? "bg-[#22c55e20] text-[#22c55e]"
              : autoTagStatus.status === "error"
                ? "bg-[#ef444420] text-[#ef4444]"
                : "bg-gray-100 text-[var(--foreground,#374151)]"
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
          <span className="text-sm text-[var(--muted-foreground,#6b7280)]">Total Cycles</span>
          <span className="text-sm font-medium text-[var(--foreground,#111827)]">{autoTagStatus.totalCycles}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[var(--muted-foreground,#6b7280)]">ACTUAL Traffic Captured</span>
          <span className="text-sm font-bold" style={{ color: "#8B5CF6" }}>
            {autoTagStatus.actualTrafficCaptured}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[var(--muted-foreground,#6b7280)]">Last Sync</span>
          <span className="text-sm font-medium text-[var(--foreground,#111827)]">{autoTagStatus.lastSync}</span>
        </div>
      </div>
    </div>
  )
}







