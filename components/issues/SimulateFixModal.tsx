"use client"

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

  // DEBUG: Log on EVERY render
  console.log("🔴 [MODAL] Render - isOpen:", isOpen, "finding:", finding?.id)

  // Early return if not open
  if (!isOpen) {
    return null
  }

  // Early return if no finding
  if (!finding) {
    console.log("🔴 [MODAL] No finding provided")
    return null
  }

  console.log("🟢 [MODAL] Rendering modal content NOW!")

  const handleExecute = async () => {
    if (!onExecute) return
    setExecuting(true)
    try {
      await onExecute(finding.id, { createRollback: true })
      toast({ title: "Success", description: "Remediation started" })
      onClose()
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setExecuting(false)
    }
  }

  // PURE INLINE STYLES - No external CSS dependencies
  return (
    <>
      {/* BACKDROP */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          zIndex: 100000,
        }}
      />

      {/* MODAL BOX */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90%',
          maxWidth: '550px',
          maxHeight: '85vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
          zIndex: 100001,
          overflow: 'auto',
        }}
      >
        {/* HEADER */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          borderRadius: '16px 16px 0 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield style={{ width: 24, height: 24, color: '#2563eb' }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Simulate Fix</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* CONTENT */}
        <div style={{ padding: '24px' }}>
          {/* HIGH CONFIDENCE BANNER */}
          <div style={{
            backgroundColor: '#dcfce7',
            border: '2px solid #86efac',
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'center',
            marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
              <CheckCircle2 style={{ width: 28, height: 28, color: '#16a34a' }} />
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#166534' }}>HIGH CONFIDENCE</span>
            </div>
            <p style={{ margin: 0, color: '#15803d', fontSize: '14px' }}>5/5 required criteria met</p>
          </div>

          {/* FINDING INFO */}
          <div style={{
            backgroundColor: '#f3f4f6',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
          }}>
            <p style={{ margin: '0 0 8px 0' }}><strong>Finding:</strong> {finding.title}</p>
            <p style={{ margin: '0 0 8px 0' }}><strong>Resource:</strong> {finding.resource}</p>
            <p style={{ margin: 0 }}><strong>Type:</strong> {finding.resourceType}</p>
          </div>

          {/* TEST BANNER */}
          <div style={{
            backgroundColor: '#fef3c7',
            border: '2px solid #fcd34d',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: 700, color: '#92400e' }}>🧪 TEST MODE - MODAL IS WORKING!</p>
            <p style={{ margin: 0, color: '#a16207', fontSize: '14px' }}>
              If you see this, the modal is rendering correctly!
            </p>
          </div>

          {/* BUTTONS */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb',
          }}>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button 
              onClick={handleExecute}
              disabled={executing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Zap style={{ width: 16, height: 16, marginRight: 8 }} />
              {executing ? 'Applying...' : 'Apply Fix Now'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
