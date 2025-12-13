"use client"

/**
 * SimulateFixModal - DEBUG VERSION
 * Uses simple div overlay instead of Dialog component to bypass potential rendering issues
 */

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  RefreshCw, 
  ArrowLeft, 
  Shield,
  Zap,
  ChevronDown,
  ChevronRight,
  Loader2,
  X
} from "lucide-react"
import type { SecurityFinding } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"

interface SimulateFixModalProps {
  isOpen: boolean
  onClose: () => void
  finding: SecurityFinding | null
  onExecute?: (findingId: string, options?: { createRollback?: boolean }) => Promise<void>
  onRequestApproval?: (findingId: string) => Promise<void>
}

interface ConfidenceCriterion {
  id: string
  description: string
  required: boolean
  met: boolean
  details?: string
}

interface Confidence {
  level: "HIGH" | "MEDIUM" | "LOW" | "BLOCKED"
  criteria: ConfidenceCriterion[]
  summary: string
}

interface ActionPolicy {
  autoApplyAllowed: boolean
  approvalRequired: boolean
  reviewOnly: boolean
  reason: string
}

interface ExecutionStep {
  step: number
  action: string
  description: string
  apiCall?: string
}

interface ExecutionPlan {
  steps: ExecutionStep[]
  estimatedDuration: string
  rollbackAvailable: boolean
}

interface BlastRadius {
  level: "ISOLATED" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN"
  affectedResources: any[]
  worstCaseScenario: string
}

interface Evidence {
  dataSource: string
  observationDays: number
  eventCount: number
  lastAnalyzed: string
  coverage: number
}

interface Simulation {
  findingId: string
  issueType: string
  resourceType: string
  resourceId: string
  resourceName: string
  confidence: Confidence
  proposedChange: any
  blastRadius: BlastRadius
  evidence: Evidence
  actionPolicy: ActionPolicy
  executionPlan: ExecutionPlan
  risks: any[]
  computedAt: string
  expiresAt: string
}

export function SimulateFixModal({ 
  isOpen, 
  onClose, 
  finding,
  onExecute,
  onRequestApproval 
}: SimulateFixModalProps) {
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createRollback, setCreateRollback] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["confidence", "proposedChange"]))
  const { toast } = useToast()

  // Debug log on every render
  useEffect(() => {
    console.log("[Modal] Render:", { isOpen, hasFinding: !!finding, hasSimulation: !!simulation, loading, error })
  })

  useEffect(() => {
    if (isOpen && finding) {
      console.log("[Modal] Opening for finding:", finding.id)
      setSimulation(null)
      setLoading(true)
      setError(null)
      fetchSimulation()
    }
  }, [isOpen, finding?.id])

  const fetchSimulation = async () => {
    if (!finding) return

    console.log("[Modal] Fetching simulation...")

    try {
      const response = await fetch(`/api/proxy/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finding_id: finding.id,
          resource_type: finding.resourceType,
          resource_id: finding.resource,
          title: finding.title,
          description: finding.description,
          details: (finding as any).details || {}
        })
      })

      console.log("[Modal] Response status:", response.status)

      if (!response.ok) {
        throw new Error(`Failed: ${response.status}`)
      }

      const data = await response.json()
      console.log("[Modal] Response data:", data)

      if (data.status === "READY" && data.simulation) {
        console.log("[Modal] Setting simulation data")
        setSimulation(data.simulation)
      } else {
        console.log("[Modal] Invalid response format")
        setError("Invalid response from server")
      }
    } catch (err: any) {
      console.error("[Modal] Error:", err)
      setError(err.message)
    } finally {
      setLoading(false)
      console.log("[Modal] Fetch complete, loading = false")
    }
  }

  const handleExecute = async () => {
    if (!finding || !onExecute) return

    console.log("[Modal] Executing remediation...")
    setExecuting(true)
    try {
      await onExecute(finding.id, { createRollback })
      toast({
        title: "Remediation Started",
        description: "Fix is being applied. Monitoring for 5 minutes..."
      })
      onClose()
    } catch (err: any) {
      toast({
        title: "Execution Failed",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setExecuting(false)
    }
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case "HIGH": return "bg-green-100 text-green-800 border-green-300"
      case "MEDIUM": return "bg-yellow-100 text-yellow-800 border-yellow-300"
      case "LOW": return "bg-orange-100 text-orange-800 border-orange-300"
      case "BLOCKED": return "bg-red-100 text-red-800 border-red-300"
      default: return "bg-gray-100 text-gray-800 border-gray-300"
    }
  }

  // CRITICAL: Don't render anything if not open
  if (!isOpen || !finding) {
    console.log("[Modal] Not rendering - isOpen:", isOpen, "finding:", !!finding)
    return null
  }

  console.log("[Modal] Rendering modal UI")

  return (
    <>
      {/* Dark backdrop overlay */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
        }}
        onClick={onClose}
      />
      
      {/* Modal container */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
          pointerEvents: 'none',
        }}
      >
        {/* Modal content */}
        <div 
          style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxWidth: '56rem',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            pointerEvents: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ 
            position: 'sticky', 
            top: 0, 
            backgroundColor: 'white', 
            borderBottom: '1px solid #e5e7eb',
            padding: '1rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield style={{ width: '1.5rem', height: '1.5rem', color: '#2563eb' }} />
                Simulate Fix: {finding.title}
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Review simulation results before applying remediation
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ padding: '0.5rem', borderRadius: '9999px', cursor: 'pointer', border: 'none', background: 'transparent' }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <X style={{ width: '1.25rem', height: '1.25rem' }} />
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '1.5rem' }}>
            {/* Loading State */}
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0' }}>
                <Loader2 style={{ width: '3rem', height: '3rem', color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginTop: '1rem', marginBottom: '0.5rem' }}>Loading Simulation...</h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Fetching pre-computed results...</p>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div style={{ padding: '1rem', border: '2px solid #fca5a5', borderRadius: '0.5rem', backgroundColor: '#fef2f2' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <XCircle style={{ width: '1.25rem', height: '1.25rem', color: '#dc2626', marginTop: '0.125rem' }} />
                  <div>
                    <h4 style={{ fontWeight: '600', color: '#991b1b' }}>Error Loading Simulation</h4>
                    <p style={{ fontSize: '0.875rem', color: '#b91c1c' }}>{error}</p>
                    <Button onClick={fetchSimulation} variant="outline" size="sm" style={{ marginTop: '0.5rem' }}>
                      <RefreshCw style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} />
                      Retry
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Simulation Results */}
            {simulation && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Confidence Badge */}
                <div className={`p-6 border-2 rounded-lg text-center ${getConfidenceColor(simulation.confidence.level)}`}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {simulation.confidence.level === "HIGH" && <CheckCircle2 style={{ width: '1.5rem', height: '1.5rem' }} />}
                    {simulation.confidence.level !== "HIGH" && <AlertTriangle style={{ width: '1.5rem', height: '1.5rem' }} />}
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{simulation.confidence.level} CONFIDENCE</span>
                  </div>
                  <p style={{ fontSize: '0.875rem' }}>{simulation.confidence.summary}</p>
                </div>

                {/* Confidence Criteria Section */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
                  <button
                    onClick={() => toggleSection("confidence")}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left' }}
                  >
                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>Confidence Criteria</h3>
                    {expandedSections.has("confidence") ? <ChevronDown style={{ width: '1.25rem', height: '1.25rem' }} /> : <ChevronRight style={{ width: '1.25rem', height: '1.25rem' }} />}
                  </button>
                  {expandedSections.has("confidence") && (
                    <div style={{ padding: '1rem', borderTop: '1px solid #e5e7eb' }}>
                      {simulation.confidence.criteria.map((criterion) => (
                        <div key={criterion.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                          {criterion.met ? (
                            <CheckCircle2 style={{ width: '1.25rem', height: '1.25rem', color: '#16a34a', flexShrink: 0 }} />
                          ) : (
                            <XCircle style={{ width: '1.25rem', height: '1.25rem', color: '#dc2626', flexShrink: 0 }} />
                          )}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ color: criterion.met ? '#166534' : '#991b1b' }}>{criterion.description}</span>
                              {criterion.required && <Badge variant="outline" className="text-xs">Required</Badge>}
                            </div>
                            {criterion.details && <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>{criterion.details}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* What Will Change */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
                  <button
                    onClick={() => toggleSection("proposedChange")}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left' }}
                  >
                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>What Will Change</h3>
                    {expandedSections.has("proposedChange") ? <ChevronDown style={{ width: '1.25rem', height: '1.25rem' }} /> : <ChevronRight style={{ width: '1.25rem', height: '1.25rem' }} />}
                  </button>
                  {expandedSections.has("proposedChange") && (
                    <div style={{ padding: '1rem', borderTop: '1px solid #e5e7eb' }}>
                      <p style={{ color: '#374151', marginBottom: '1rem' }}>{simulation.proposedChange.summary}</p>
                      
                      {simulation.proposedChange.permissionsToRemove && (
                        <div>
                          <h4 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Permissions to Remove:</h4>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {simulation.proposedChange.permissionsToRemove.map((perm: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="font-mono text-xs">{perm}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Policy */}
                <div style={{ 
                  padding: '1rem', 
                  borderRadius: '0.5rem', 
                  border: '2px solid #bbf7d0',
                  backgroundColor: '#f0fdf4'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <CheckCircle2 style={{ width: '1.5rem', height: '1.5rem', color: '#16a34a' }} />
                    <div>
                      <p style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                        {simulation.actionPolicy.autoApplyAllowed 
                          ? "Safe to auto-apply based on strong evidence"
                          : "Review recommended before applying"
                        }
                      </p>
                      <p style={{ fontSize: '0.875rem', color: '#374151' }}>{simulation.actionPolicy.reason}</p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                  <Button onClick={onClose} variant="outline">
                    <ArrowLeft style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} />
                    Back
                  </Button>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {onExecute && (
                      <>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                          <input
                            type="checkbox"
                            checked={createRollback}
                            onChange={(e) => setCreateRollback(e.target.checked)}
                            style={{ borderRadius: '0.25rem' }}
                          />
                          Create rollback checkpoint
                        </label>
                        
                        <Button 
                          onClick={handleExecute}
                          disabled={executing}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {executing ? (
                            <>
                              <Loader2 style={{ width: '1rem', height: '1rem', marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} />
                              Applying...
                            </>
                          ) : (
                            <>
                              <Zap style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} />
                              Apply Fix Now
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
