'use client'

/**
 * Security Group Inspector Page
 */

import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { BackToDashboard } from '@/components/back-to-dashboard'

// Dynamically import the component to avoid SSR issues
const SGInspectorTemplate = dynamic(
  () => import('../../../components/inspector/SGInspectorTemplate').then(mod => mod.SGInspectorTemplate),
  {
    ssr: false,
    loading: () => <div style={{ padding: '24px' }}>Loading Inspector...</div>
  }
)

export default function SGInspectorPage() {
  const params = useParams()
  const sgId = params?.sgId as string

  if (!sgId) {
    return <div style={{ padding: '24px', color: 'red' }}>Error: No Security Group ID provided</div>
  }

  return (
    <div style={{ padding: '24px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <BackToDashboard />
        <h1 style={{ margin: 0 }}>SG Inspector: {sgId}</h1>
      </div>
      <SGInspectorTemplate sgId={sgId} initialWindow={30} />
    </div>
  )
}
