'use client'

import { useState, useEffect } from 'react'
import { SystemsView } from '@/components/systems-view'

// Use proxy routes to avoid CORS issues

export default function SystemsPage() {
  const [systems, setSystems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSystems = async () => {
      try {
        setLoading(true)
        // Use proxy route to avoid CORS
        const response = await fetch('/api/proxy/systems')
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        
        const data = await response.json()
        setSystems(data.systems || [])
      } catch (error) {
        console.error('Error fetching systems:', error)
        setSystems([])
      } finally {
        setLoading(false)
      }
    }

    fetchSystems()
  }, [])

  const handleSystemSelect = (systemName: string) => {
    // Navigate to system detail page
    window.location.href = `/systems/${encodeURIComponent(systemName)}`
  }

  return (
    <div className="space-y-6 p-6">
      {/* Systems View */}
      <SystemsView systems={systems} onSystemSelect={handleSystemSelect} />
    </div>
  )
}

