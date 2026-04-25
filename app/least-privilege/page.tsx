"use client"

import { Suspense } from 'react'
import LeastPrivilegeTab from '@/components/LeastPrivilegeTab'
import { SystemGuard } from '@/components/system-guard'
import { useSystem } from '@/lib/system-context'

// ✅ NEW: Use the interactive gap visualization component
function LeastPrivilegePageContent() {
  const { systemName } = useSystem()

  return (
    <SystemGuard>
      <LeastPrivilegeTab systemName={systemName!} />
    </SystemGuard>
  )
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
