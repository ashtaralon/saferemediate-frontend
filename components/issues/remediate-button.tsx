'use client'

import { useState } from 'react'
import { AlertCircle, Loader2, CheckCircle2, RotateCcw } from 'lucide-react'

interface RemediateButtonProps {
  findingId: string
  resourceType?: string
  onRemediated?: () => void
}

export function RemediateButton({ 
  findingId, 
  resourceType = 'SecurityGroup',
  onRemediated 
}: RemediateButtonProps) {
  const [isRemediating, setIsRemediating] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRemediate = async () => {
    if (!confirm('⚠️ Are you sure? This will make REAL changes to AWS.')) {
      return
    }

    setIsRemediating(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/proxy/safe-remediate/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          finding_id: findingId,
          resource_type: resourceType 
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Remediation failed')
      }

      setResult(data)
      
      if (onRemediated) {
        onRemediated()
      }

      setTimeout(() => window.location.reload(), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remediation failed')
    } finally {
      setIsRemediating(false)
    }
  }

  const handleRollback = async () => {
    if (!result?.snapshot_id || !result?.execution_id) return

    if (!confirm('Are you sure you want to rollback this remediation?')) {
      return
    }

    setIsRemediating(true)
    setError(null)

    try {
      const response = await fetch('/api/proxy/safe-remediate/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          execution_id: result.execution_id,
          snapshot_id: result.snapshot_id,
          resource_type: resourceType,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Rollback failed')
      }

      setResult(null)
      alert('✅ Rollback successful!')
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed')
    } finally {
      setIsRemediating(false)
    }
  }

  return (
    <div className="space-y-2">
      {!result && (
        <button
          onClick={handleRemediate}
          disabled={isRemediating}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
        >
          {isRemediating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Remediating...
            </>
          ) : (
            '🔧 REMEDIATE'
          )}
        </button>
      )}

      {result && result.status === 'completed' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">Remediated successfully</span>
          </div>
          
          {result.rollback_available && (
            <button
              onClick={handleRollback}
              disabled={isRemediating}
              className="px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 text-xs font-medium flex items-center gap-2"
            >
              <RotateCcw className="w-3 h-3" />
              Rollback
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-red-600">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}
    </div>
  )
}

