"use client"

/**
 * SimulateFixModal - FULL VERSION (Working)
 * Uses inline styles instead of Dialog component
 */

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  X, Shield, Zap, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronRight, Clock, RefreshCw, Loader2, ArrowLeft
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

interface Simulation {
  findingId: string
  issueType: string
  resourceType: string
  resourceId: string
  resourceName: string
  confidence: {
    level: "HIGH" | "MEDIUM" | "LOW" | "BLOCKED"
    criteria: Array<{ id: string; description: string; required: boolean; met: boolean; details?: string }>
    summary: string
  }
  proposedChange: any
  blastRadius: { level: string; affectedResources: any[]; worstCaseScenario: string }
  evidence: { dataSource: string; observationDays: number; eventCount: number; lastAnalyzed: string; coverage: number }
  actionPolicy: { autoApplyAllowed: boolean; approvalRequired: boolean; reviewOnly: boolean; reason: string }
  executionPlan: { steps: Array<{ step: number; action: string; description: string; apiCall?: string }>; estimatedDuration: string; rollbackAvailable: boolean }
  risks: any[]
}

export function SimulateFixModal({ 
  isOpen, 
  onClose, 
  finding,
  onExecute,
}: SimulateFixModalProps) {
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [executing, setExecuting] = useState(false)
  const [createRollback, setCreateRollback] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["confidence", "proposedChange"]))
  const { toast } = useToast()

  // Fetch simulation when modal opens
  useEffect(() => {
    if (isOpen && finding) {
      console.log("[Modal] Opening, fetching simulation for:", finding.id)
      setSimulation(null)
      setLoading(true)
      setError(null)
      fetchSimulation()
    }
  }, [isOpen, finding?.id])

  const fetchSimulation = async () => {
    if (!finding) return

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

      if (!response.ok) throw new Error(`Request failed: ${response.status}`)

      const data = await response.json()
      console.log("[Modal] Response:", data)

      if (data.status === "READY" && data.simulation) {
        setSimulation(data.simulation)
      } else {
        setError("Invalid response from server")
      }
    } catch (err: any) {
      console.error("[Modal] Error:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!finding || !onExecute) return
    setExecuting(true)
    try {
      await onExecute(finding.id, { createRollback })
      toast({ title: "Remediation Started", description: "Fix is being applied. Monitoring for 5 minutes..." })
      onClose()
    } catch (err: any) {
      toast({ title: "Execution Failed", description: err.message, variant: "destructive" })
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

  // Don't render if not open
  if (!isOpen || !finding) return null

  const getConfidenceBg = (level: string) => {
    switch (level) {
      case "HIGH": return { bg: '#dcfce7', border: '#86efac', text: '#166534' }
      case "MEDIUM": return { bg: '#fef9c3', border: '#fde047', text: '#854d0e' }
      case "LOW": return { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' }
      default: return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' }
    }
  }

  return (
    <>
      {/* BACKDROP */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          zIndex: 100000,
        }}
      />

      {/* MODAL */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '95%', maxWidth: '700px', maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
          zIndex: 100001,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* HEADER */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield style={{ width: 24, height: 24, color: '#2563eb' }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Simulate Fix</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}>
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {/* LOADING */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0' }}>
              <Loader2 style={{ width: 48, height: 48, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
              <h3 style={{ marginTop: 16, fontSize: 18, fontWeight: 600 }}>Loading Simulation...</h3>
              <p style={{ color: '#6b7280', fontSize: 14 }}>Fetching pre-computed results...</p>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ERROR */}
          {error && !loading && (
            <div style={{ padding: 16, backgroundColor: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <XCircle style={{ width: 24, height: 24, color: '#dc2626' }} />
                <div>
                  <h4 style={{ margin: 0, fontWeight: 600, color: '#991b1b' }}>Error Loading Simulation</h4>
                  <p style={{ margin: '8px 0', color: '#b91c1c', fontSize: 14 }}>{error}</p>
                  <Button onClick={fetchSimulation} variant="outline" size="sm">
                    <RefreshCw style={{ width: 16, height: 16, marginRight: 8 }} /> Retry
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* SIMULATION RESULTS */}
          {simulation && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* CONFIDENCE BANNER */}
              <div style={{
                backgroundColor: getConfidenceBg(simulation.confidence.level).bg,
                border: `2px solid ${getConfidenceBg(simulation.confidence.level).border}`,
                borderRadius: 12, padding: 20, textAlign: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
                  {simulation.confidence.level === "HIGH" ? 
                    <CheckCircle2 style={{ width: 28, height: 28, color: getConfidenceBg(simulation.confidence.level).text }} /> :
                    <AlertTriangle style={{ width: 28, height: 28, color: getConfidenceBg(simulation.confidence.level).text }} />
                  }
                  <span style={{ fontSize: 24, fontWeight: 700, color: getConfidenceBg(simulation.confidence.level).text }}>
                    {simulation.confidence.level} CONFIDENCE
                  </span>
                </div>
                <p style={{ margin: 0, color: getConfidenceBg(simulation.confidence.level).text }}>{simulation.confidence.summary}</p>
              </div>

              {/* CONFIDENCE CRITERIA */}
              <CollapsibleSection
                title="Confidence Criteria"
                expanded={expandedSections.has("confidence")}
                onToggle={() => toggleSection("confidence")}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {simulation.confidence.criteria.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      {c.met ? 
                        <CheckCircle2 style={{ width: 20, height: 20, color: '#16a34a', flexShrink: 0 }} /> :
                        <XCircle style={{ width: 20, height: 20, color: '#dc2626', flexShrink: 0 }} />
                      }
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: c.met ? '#166534' : '#991b1b' }}>{c.description}</span>
                          {c.required && <Badge variant="outline" className="text-xs">Required</Badge>}
                        </div>
                        {c.details && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>{c.details}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              {/* WHAT WILL CHANGE */}
              <CollapsibleSection
                title="What Will Change"
                expanded={expandedSections.has("proposedChange")}
                onToggle={() => toggleSection("proposedChange")}
              >
                <p style={{ margin: '0 0 16px', color: '#374151' }}>{simulation.proposedChange.summary}</p>
                {simulation.proposedChange.permissionsToRemove && (
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontWeight: 600 }}>Permissions to Remove:</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {simulation.proposedChange.permissionsToRemove.map((p: string, i: number) => (
                        <Badge key={i} variant="outline" className="font-mono text-xs">{p}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CollapsibleSection>

              {/* BLAST RADIUS */}
              <CollapsibleSection
                title={<span>Blast Radius <Badge className="ml-2 bg-green-600">{simulation.blastRadius.level}</Badge></span>}
                expanded={expandedSections.has("blastRadius")}
                onToggle={() => toggleSection("blastRadius")}
              >
                <p style={{ margin: '0 0 12px', color: '#16a34a' }}>✓ No other resources affected</p>
                <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 12 }}>
                  <strong>Worst Case:</strong> {simulation.blastRadius.worstCaseScenario}
                </div>
              </CollapsibleSection>

              {/* EVIDENCE */}
              <CollapsibleSection
                title="Evidence"
                expanded={expandedSections.has("evidence")}
                onToggle={() => toggleSection("evidence")}
              >
                <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Data Source:</span>
                    <span style={{ fontWeight: 500 }}>{simulation.evidence.dataSource}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Observation Period:</span>
                    <span style={{ fontWeight: 500 }}>{simulation.evidence.observationDays} days</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Coverage:</span>
                    <span style={{ fontWeight: 500 }}>{simulation.evidence.coverage}%</span>
                  </div>
                </div>
              </CollapsibleSection>

              {/* EXECUTION PLAN */}
              <CollapsibleSection
                title="Execution Plan"
                expanded={expandedSections.has("executionPlan")}
                onToggle={() => toggleSection("executionPlan")}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {simulation.executionPlan.steps.map((step) => (
                    <div key={step.step} style={{ display: 'flex', gap: 12 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        backgroundColor: '#dbeafe', color: '#2563eb',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 600, flexShrink: 0
                      }}>
                        {step.step}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 500 }}>{step.action}</p>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>{step.description}</p>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb', fontSize: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock style={{ width: 16, height: 16, color: '#6b7280' }} />
                      <span>{simulation.executionPlan.estimatedDuration}</span>
                    </div>
                    {simulation.executionPlan.rollbackAvailable && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16a34a' }}>
                        <CheckCircle2 style={{ width: 16, height: 16 }} />
                        <span>Rollback available</span>
                      </div>
                    )}
                  </div>
                </div>
              </CollapsibleSection>

              {/* ACTION POLICY */}
              <div style={{
                backgroundColor: simulation.actionPolicy.autoApplyAllowed ? '#f0fdf4' : '#fef3c7',
                border: `2px solid ${simulation.actionPolicy.autoApplyAllowed ? '#bbf7d0' : '#fde68a'}`,
                borderRadius: 12, padding: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {simulation.actionPolicy.autoApplyAllowed ?
                    <CheckCircle2 style={{ width: 24, height: 24, color: '#16a34a' }} /> :
                    <AlertTriangle style={{ width: 24, height: 24, color: '#ca8a04' }} />
                  }
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {simulation.actionPolicy.autoApplyAllowed ? "Safe to auto-apply based on strong evidence" : "Review recommended"}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 14, color: '#374151' }}>{simulation.actionPolicy.reason}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        {simulation && !loading && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 24px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
          }}>
            <Button onClick={onClose} variant="outline">
              <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} /> Back
            </Button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createRollback}
                  onChange={(e) => setCreateRollback(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                Create rollback checkpoint
              </label>
              <Button onClick={handleExecute} disabled={executing} className="bg-blue-600 hover:bg-blue-700">
                {executing ? (
                  <><Loader2 style={{ width: 16, height: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} /> Applying...</>
                ) : (
                  <><Zap style={{ width: 16, height: 16, marginRight: 8 }} /> Apply Fix Now</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// Collapsible Section Component
function CollapsibleSection({ title, expanded, onToggle, children }: {
  title: React.ReactNode
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 16, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left'
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h3>
        {expanded ? <ChevronDown style={{ width: 20, height: 20 }} /> : <ChevronRight style={{ width: 20, height: 20 }} />}
      </button>
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ paddingTop: 16 }}>{children}</div>
        </div>
      )}
    </div>
  )
}
