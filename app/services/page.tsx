'use client'

import AllServicesInventory from '@/components/all-services-inventory'
import { SystemGuard } from '@/components/system-guard'
import { useSystem } from '@/lib/system-context'

export default function ServicesPage() {
  const { systemName } = useSystem()

  return (
    <SystemGuard>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <AllServicesInventory systemName={systemName!} />
      </div>
    </SystemGuard>
  )
}



