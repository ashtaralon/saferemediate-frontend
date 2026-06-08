"use client"

import { FlowStripView } from "@/components/security-posture"
import { SystemGuard } from "@/components/system-guard"
import { useSystem } from "@/lib/system-context"
import { BackToDashboard } from "@/components/back-to-dashboard"

export default function FlowAnalysisPage() {
  const { systemName } = useSystem()

  return (
    <SystemGuard>
      <div className="h-screen bg-gray-50 p-4">
        <div className="mb-4 flex items-center gap-3">
          <BackToDashboard />
          <h1 className="text-2xl font-semibold">Flow Analysis</h1>
        </div>
        <FlowStripView systemName={systemName!} />
      </div>
    </SystemGuard>
  )
}
