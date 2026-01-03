'use client'

import AllServicesInventory from '@/components/all-services-inventory'

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <AllServicesInventory systemName="alon-prod" />
    </div>
  )
}



