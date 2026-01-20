import { FlowStripView } from "@/components/security-posture"

export const metadata = {
  title: "Flow Analysis | Cyntro",
}

export default function FlowAnalysisPage() {
  return (
    <div className="h-screen bg-gray-50">
      <FlowStripView systemName="alon-prod" />
    </div>
  )
}
