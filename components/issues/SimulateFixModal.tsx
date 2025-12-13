"use client"

/**
 * SimulateFixModal - MINIMAL TEST VERSION
 * No API calls, just static content to test if modal renders at all
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { X, Shield, Zap, CheckCircle2 } from "lucide-react"
import type { SecurityFinding } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"

interface SimulateFixModalProps {
  isOpen: boolean
  onClose: () => void
  finding: SecurityFinding | null
  onExecute?: (findingId: string, options?: { createRollback?: boolean }) => Promise<void>
  onRequestApproval?: (findingId: string) => Promise<void>
}

export function SimulateFixModal({ 
  isOpen, 
  onClose, 
  finding,
  onExecute,
}: SimulateFixModalProps) {
  const [executing, setExecuting] = useState(false)
  const { toast } = useToast()

  // Log EVERY render
  console.log("🔴 [MODAL RENDER]", { isOpen, hasFinding: !!finding, findingId: finding?.id })

  const handleExecute = async () => {
    if (!finding || !onExecute) return
    setExecuting(true)
    try {
      await onExecute(finding.id, { createRollback: true })
      toast({ title: "Remediation Started", description: "Fix is being applied." })
      onClose()
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" })
    } finally {
      setExecuting(false)
    }
  }

  // Don't render if not open
  if (!isOpen) {
    console.log("🔴 [MODAL] Not rendering - isOpen is false")
    return null
  }

  if (!finding) {
    console.log("🔴 [MODAL] Not rendering - finding is null")
    return null
  }

  console.log("🟢 [MODAL] RENDERING MODAL UI NOW!")

  return (
    <div id="simulate-modal-root">
      {/* Backdrop */}
      <div 
        id="modal-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 99998,
        }}
      />
      
      {/* Modal */}
      <div 
        id="modal-container"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          zIndex: 99999,
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield style={{ color: '#2563eb' }} />
            Simulate Fix
          </h2>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}
          >
            <X />
          </button>
        </div>

        {/* Static Content - NO API CALLS */}
        <div style={{ backgroundColor: '#dcfce7', border: '2px solid #86efac', borderRadius: '8px', padding: '20px', textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
            <CheckCircle2 style={{ color: '#16a34a' }} />
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#166534' }}>HIGH CONFIDENCE</span>
          </div>
          <p style={{ color: '#166534' }}>5/5 required criteria met</p>
        </div>

        {/* Finding Info */}
        <div style={{ backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <p><strong>Finding:</strong> {finding.title}</p>
          <p><strong>Resource:</strong> {finding.resource}</p>
          <p><strong>Type:</strong> {finding.resourceType}</p>
        </div>

        {/* Test Message */}
        <div style={{ backgroundColor: '#fef3c7', border: '2px solid #fde68a', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <p style={{ color: '#92400e', fontWeight: 'bold' }}>🧪 TEST MODE</p>
          <p style={{ color: '#92400e' }}>If you can see this, the modal is rendering correctly!</p>
          <p style={{ color: '#92400e' }}>The issue was with API calls or state management.</p>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
          <Button 
            onClick={handleExecute}
            disabled={executing}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Zap style={{ marginRight: '8px' }} />
            {executing ? "Applying..." : "Apply Fix Now"}
          </Button>
        </div>
      </div>
    </div>
  )
}
