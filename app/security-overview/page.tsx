import { SystemSecurityOverview } from "@/components/system-security-overview"

export const metadata = {
  title: "Security Posture | SafeRemediate",
}

export default function SecurityOverviewPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <SystemSecurityOverview systemName="alon-prod" />
      </div>
    </div>
  )
}
