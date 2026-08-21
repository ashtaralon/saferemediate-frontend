"use client"

import { useRouter } from "next/navigation"
import { SystemDetailDashboard } from "./system-detail-dashboard"

interface SystemDashboardProps {
  systemId: string
}

/** Compatibility entry point for older imports. The former implementation
 * depended on deleted prototype-only modules; all callers now share the
 * maintained production system dashboard. */
export function SystemDashboard({ systemId }: SystemDashboardProps) {
  const router = useRouter()

  return (
    <SystemDetailDashboard
      systemName={systemId}
      onBack={() => router.push("/?tab=systems")}
    />
  )
}
