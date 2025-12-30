'use client'

import AWSArchitectureFlow from '@/components/aws-architecture-flow'

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <AWSArchitectureFlow systemName="alon-prod" />
    </div>
  )
}

