"use client"

import { SecurityPosture } from "@/components/security-posture"
import { SystemGuard } from "@/components/system-guard"
import { useSystem } from "@/lib/system-context"

export default function SecurityOverviewPage() {
  const { systemName } = useSystem()

  return (
    <SystemGuard>
      <div className="h-screen bg-gray-50">
        <SecurityPosture systemName={systemName!} />
      </div>
    </SystemGuard>
  )
}
