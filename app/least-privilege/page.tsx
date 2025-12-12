"use client"

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import LeastPrivilegeTab from '@/components/LeastPrivilegeTab'

// ✅ NEW: Use the interactive gap visualization component
function LeastPrivilegePageContent() {
  const searchParams = useSearchParams()
  const systemName = searchParams.get('system') || 'alon-prod'
  
  return <LeastPrivilegeTab systemName={systemName} />
}

export default function LeastPrivilegePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading least privilege analysis...</p>
        </div>
      </div>
    }>
      <LeastPrivilegePageContent />
    </Suspense>
  )
}
