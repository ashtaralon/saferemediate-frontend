import { SecurityPosture } from "@/components/security-posture"

export const metadata = {
  title: "Security Posture | Cyntro",
}

export default function SecurityOverviewPage() {
  return (
    <div className="h-screen bg-gray-50">
      <SecurityPosture systemName="alon-prod" />
    </div>
  )
}
