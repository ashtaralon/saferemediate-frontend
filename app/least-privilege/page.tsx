"use client"

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { IdentitiesView } from '@/components/identities-view'

function LeastPrivilegeContent() {
  const handleRequestRemediation = (data: any) => {
    console.log("Request remediation:", data)
    // TODO: Integrate with remediation API
  }

  return <IdentitiesView onRequestRemediation={handleRequestRemediation} />
}

export default function LeastPrivilegePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-indigo-600" />
          <p className="text-lg font-medium text-gray-900 mb-2">Loading Least Privilege Analysis...</p>
        </div>
      </div>
    }>
      <LeastPrivilegeContent />
    </Suspense>
  )
}
