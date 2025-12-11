"use client"

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// Dynamically import the component with no SSR
const IdentitiesView = dynamic(
  () => import('@/components/identities-view').then((mod) => ({ default: mod.IdentitiesView })),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-indigo-600" />
          <p className="text-lg font-medium text-gray-900 mb-2">Loading Identity & Access Management...</p>
        </div>
      </div>
    )
  }
)

export default function LeastPrivilegePage() {
  const handleRequestRemediation = (data: any) => {
    console.log("Request remediation:", data)
    // TODO: Integrate with remediation API
  }

  return <IdentitiesView onRequestRemediation={handleRequestRemediation} />
}
