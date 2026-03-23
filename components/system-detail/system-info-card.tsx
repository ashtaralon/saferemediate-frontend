"use client"

import { Server } from "lucide-react"
import type { GapAnalysis } from "./types"

interface SystemInfoCardProps {
  gapAnalysis: GapAnalysis
}

export function SystemInfoCard({ gapAnalysis }: SystemInfoCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
      <div className="flex items-center gap-2 mb-4">
        <Server className="w-4 h-4 text-[var(--muted-foreground,#6b7280)]" />
        <h3 className="text-sm font-semibold text-[var(--foreground,#111827)] uppercase tracking-wide">System Info</h3>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-[var(--muted-foreground,#6b7280)]">Account</span>
          <span className="text-sm font-medium text-[var(--foreground,#111827)]">745783559495</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[var(--muted-foreground,#6b7280)]">Region</span>
          <span className="text-sm font-medium text-[var(--foreground,#111827)]">eu-west-1</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[var(--muted-foreground,#6b7280)]">Environment</span>
          <span className="px-2 py-0.5 bg-[#22c55e20] text-[#22c55e] text-xs font-medium rounded">
            Production
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[var(--muted-foreground,#6b7280)]">Provider</span>
          <span className="text-sm font-medium text-[var(--foreground,#111827)]">AWS</span>
        </div>
        <div className="border-t border-[var(--border,#f3f4f6)] pt-3 mt-3">
          <div className="flex justify-between">
            <span className="text-sm text-[var(--muted-foreground,#6b7280)]">Graph Nodes</span>
            <span className="text-sm font-medium text-[var(--foreground,#111827)]">60</span>
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[var(--muted-foreground,#6b7280)]">Relationships</span>
          <span className="text-sm font-medium text-[var(--foreground,#111827)]">73</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[var(--muted-foreground,#6b7280)]">ACTUAL Behavior</span>
          <span className="text-sm font-bold" style={{ color: "#8B5CF6" }}>
            {gapAnalysis.actual || 15}
          </span>
        </div>
      </div>
    </div>
  )
}







