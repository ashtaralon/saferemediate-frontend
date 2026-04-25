"use client"

import { FlowStripView } from "@/components/security-posture"
import { SystemGuard } from "@/components/system-guard"
import { useSystem } from "@/lib/system-context"

export default function FlowAnalysisPage() {
  const { systemName } = useSystem()

  return (
    <SystemGuard>
      <div className="h-screen bg-gray-50">
        <FlowStripView systemName={systemName!} />
      </div>
    </SystemGuard>
  )
}
