"use client"

/**
 * SimulateFixModal - FULL VERSION with Execution States
 * States: Loading → Simulation → Executing → Success/Failed
 * Includes Rollback capability
 */

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  X, Shield, Zap, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronRight, Clock, RefreshCw, Loader2, ArrowLeft,
  RotateCcw, PartyPopper
} from "lucide-react"
import type { SecurityFinding } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { saveRemediationSnapshot } from "@/components/snapshots-recovery-tab"

interface SimulateFixModalProps {
  isOpen: boolean
  onClose: () => void
  finding: SecurityFinding | null
  onExecute?: (findingId: string, options?: { createRollback?: boolean }) => Promise<ExecutionResult>
  onRequestApproval?: (findingId: string) => Promise<void>
  onRefreshFindings?: () => void
}

interface ExecutionResult {
  success: boolean
  execution_id?: string
  snapshot_id?: string
  message?: string
  error?: string
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

type ModalState = 'loading' | 'simulation' | 'executing' | 'success' | 'failed' | 'rolling_back'

export function SimulateFixModal({
  isOpen,
  onClose,
  finding,
  onExecute,
  onRefreshFindings,
}: SimulateFixModalProps) {
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [modalState, setModalState] = useState<ModalState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [createRollback, setCreateRollback] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["confidence", "proposedChange"]))
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const { toast } = useToast()

  // Fetch simulation when modal opens
  useEffect(() => {
    if (isOpen && finding) {
      console.log("[Modal] Opening, fetching simulation for:", finding.id)
      setSimulation(null)
      setModalState('loading')
      setError(null)
      setExecutionResult(null)
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
        setModalState('simulation')
      } else {
        setError("Invalid response from server")
        setModalState('failed')
      }
    } catch (err: any) {
      console.error("[Modal] Error:", err)
      setError(err.message)
      setModalState('failed')
    }
  }

  const handleExecute = async () => {
    if (!finding) return

    setModalState('executing')
    setError(null)

    try {
      // Call the execute endpoint
      const response = await fetch('/api/proxy/safe-remediate/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finding_id: finding.id,
          create_rollback: createRollback,
          resource_id: finding.resource,
          resource_type: finding.resourceType,
        })
      })

      const result = await response.json()
      console.log("[Modal] Execution result:", result)

      if (result.success) {
        setExecutionResult(result)
        setModalState('success')

        // Save snapshot to local storage for Snapshots & Recovery tab
        if (result.snapshot_id) {
          saveRemediationSnapshot({
            snapshot_id: result.snapshot_id,
            execution_id: result.execution_id,
            finding_id: finding.id,
            resource_id: finding.resource,
            resource_type: finding.resourceType,
            timestamp: result.timestamp || new Date().toISOString()
          })
        }

        toast({
          title: "✅ Remediation Applied!",
          description: `Finding ${finding.id} has been remediated successfully.`
        })
        // Trigger refresh of findings list
        if (onRefreshFindings) {
          setTimeout(() => onRefreshFindings(), 1000)
        }
      } else {
        setError(result.error || result.message || 'Execution failed')
        setModalState('failed')
        toast({
          title: "Execution Failed",
          description: result.error || 'Unknown error',
          variant: "destructive"
        })
      }
    } catch (err: any) {
      console.error("[Modal] Execution error:", err)
      setError(err.message)
      setModalState('failed')
      toast({
        title: "Execution Failed",
        description: err.message,
        variant: "destructive"
      })
    }
  }

  const handleRollback = async () => {
    if (!executionResult?.execution_id && !executionResult?.snapshot_id) {
      toast({ title: "Rollback Failed", description: "No execution or snapshot ID available", variant: "destructive" })
      return
    }

    setModalState('rolling_back')

    try {
      const response = await fetch('/api/proxy/safe-remediate/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          execution_id: executionResult?.execution_id,
          snapshot_id: executionResult?.snapshot_id,
          finding_id: finding?.id
        })
      })

      const result = await response.json()

      if (result.success) {
        toast({ title: "✅ Rollback Complete", description: "Changes have been reverted successfully." })
        setModalState('simulation')
        setExecutionResult(null)
        if (onRefreshFindings) {
          setTimeout(() => onRefreshFindings(), 1000)
        }
      } else {
        setError(result.error || 'Rollback failed')
        setModalState('failed')
        toast({ title: "Rollback Failed", description: result.error, variant: "destructive" })
      }
    } catch (err: any) {
      setError(err.message)
      setModalState('failed')
      toast({ title: "Rollback Failed", description: err.message, variant: "destructive" })
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

  const handleClose = () => {
    // If we successfully executed, refresh findings before closing
    if (modalState === 'success' && onRefreshFindings) {
      onRefreshFindings()
    }
    onClose()
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
        onClick={handleClose}
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
          backgroundColor: modalState === 'success' ? '#f0fdf4' : modalState === 'failed' ? '#fef2f2' : '#f9fafb',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {modalState === 'success' ? (
              <CheckCircle2 style={{ width: 24, height: 24, color: '#16a34a' }} />
            ) : modalState === 'failed' ? (
              <XCircle style={{ width: 24, height: 24, color: '#dc2626' }} />
            ) : (
              <Shield style={{ width: 24, height: 24, color: '#2563eb' }} />
            )}
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
              {modalState === 'success' ? 'Remediation Complete!' :
               modalState === 'failed' ? 'Remediation Failed' :
               modalState === 'executing' ? 'Applying Fix...' :
               modalState === 'rolling_back' ? 'Rolling Back...' :
               'Simulate Fix'}
            </h2>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}>
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

          {/* LOADING STATE */}
          {modalState === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0' }}>
              <Loader2 style={{ width: 48, height: 48, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
              <h3 style={{ marginTop: 16, fontSize: 18, fontWeight: 600 }}>Loading Simulation...</h3>
              <p style={{ color: '#6b7280', fontSize: 14 }}>Analyzing remediation options...</p>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* EXECUTING STATE */}
          {modalState === 'executing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0' }}>
              <div style={{ position: 'relative' }}>
                <Loader2 style={{ width: 64, height: 64, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                <Zap style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 28, height: 28, color: '#f59e0b'
                }} />
              </div>
              <h3 style={{ marginTop: 20, fontSize: 20, fontWeight: 700, color: '#1f2937' }}>Applying Remediation...</h3>
              <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>Creating snapshot and executing changes</p>
              <div style={{
                marginTop: 24, padding: '12px 20px',
                backgroundColor: '#fef3c7', border: '1px solid #fde68a',
                borderRadius: 8, fontSize: 13, color: '#92400e'
              }}>
                Do not close this window
              </div>
            </div>
          )}

          {/* ROLLING BACK STATE */}
          {modalState === 'rolling_back' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0' }}>
              <div style={{ position: 'relative' }}>
                <Loader2 style={{ width: 64, height: 64, color: '#f59e0b', animation: 'spin 1s linear infinite' }} />
                <RotateCcw style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 28, height: 28, color: '#dc2626'
                }} />
              </div>
              <h3 style={{ marginTop: 20, fontSize: 20, fontWeight: 700, color: '#1f2937' }}>Rolling Back Changes...</h3>
              <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>Restoring from snapshot</p>
            </div>
          )}

          {/* SUCCESS STATE */}
          {modalState === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0' }}>
              <div style={{
                width: 100, height: 100, borderRadius: '50%',
                backgroundColor: '#dcfce7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 20
              }}>
                <CheckCircle2 style={{ width: 60, height: 60, color: '#16a34a' }} />
              </div>
              <h3 style={{ fontSize: 24, fontWeight: 700, color: '#166534', margin: 0 }}>
                Remediation Successful!
              </h3>
              <p style={{ color: '#6b7280', fontSize: 15, marginTop: 12, textAlign: 'center' }}>
                The security finding has been remediated.<br/>
                Changes have been applied to your AWS environment.
              </p>

              {/* Execution Details */}
              <div style={{
                marginTop: 24, padding: 20, width: '100%',
                backgroundColor: '#f0fdf4', border: '2px solid #bbf7d0',
                borderRadius: 12
              }}>
                <h4 style={{ margin: '0 0 12px', fontWeight: 600, color: '#166534' }}>Execution Details</h4>
                <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Finding ID:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{finding?.id}</span>
                  </div>
                  {executionResult?.execution_id && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>Execution ID:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{executionResult.execution_id}</span>
                    </div>
                  )}
                  {executionResult?.snapshot_id && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>Snapshot ID:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{executionResult.snapshot_id}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Status:</span>
                    <Badge className="bg-green-600">REMEDIATED</Badge>
                  </div>
                </div>
              </div>

              {/* Rollback Option */}
              {(executionResult?.execution_id || executionResult?.snapshot_id) && (
                <div style={{
                  marginTop: 16, padding: 16, width: '100%',
                  backgroundColor: '#fef3c7', border: '1px solid #fde68a',
                  borderRadius: 8
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <RotateCcw style={{ width: 20, height: 20, color: '#92400e' }} />
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, color: '#92400e', fontSize: 14 }}>
                        Rollback Available
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#a16207' }}>
                        A snapshot was created. You can undo this change if needed.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FAILED STATE */}
          {modalState === 'failed' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0' }}>
              <div style={{
                width: 100, height: 100, borderRadius: '50%',
                backgroundColor: '#fee2e2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 20
              }}>
                <XCircle style={{ width: 60, height: 60, color: '#dc2626' }} />
              </div>
              <h3 style={{ fontSize: 24, fontWeight: 700, color: '#991b1b', margin: 0 }}>
                Remediation Failed
              </h3>
              <p style={{ color: '#6b7280', fontSize: 15, marginTop: 12, textAlign: 'center' }}>
                The remediation could not be applied.
              </p>

              {error && (
                <div style={{
                  marginTop: 24, padding: 16, width: '100%',
                  backgroundColor: '#fef2f2', border: '2px solid #fca5a5',
                  borderRadius: 12
                }}>
                  <h4 style={{ margin: '0 0 8px', fontWeight: 600, color: '#991b1b' }}>Error Details</h4>
                  <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 13, color: '#b91c1c' }}>{error}</p>
                </div>
              )}

              <Button
                onClick={() => { setModalState('simulation'); setError(null); }}
                variant="outline"
                className="mt-6"
              >
                <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} /> Back to Simulation
              </Button>
            </div>
          )}

          {/* SIMULATION RESULTS */}
          {modalState === 'simulation' && simulation && (
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
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
        }}>
          {/* LEFT SIDE */}
          {modalState === 'success' ? (
            <Button onClick={handleClose} variant="outline">
              <CheckCircle2 style={{ width: 16, height: 16, marginRight: 8 }} /> Done
            </Button>
          ) : (
            <Button onClick={handleClose} variant="outline">
              <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
              {modalState === 'simulation' ? 'Back' : 'Close'}
            </Button>
          )}

          {/* RIGHT SIDE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Simulation state - show execute button */}
            {modalState === 'simulation' && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={createRollback}
                    onChange={(e) => setCreateRollback(e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  Create rollback checkpoint
                </label>
                <Button onClick={handleExecute} className="bg-blue-600 hover:bg-blue-700">
                  <Zap style={{ width: 16, height: 16, marginRight: 8 }} /> Apply Fix Now
                </Button>
              </>
            )}

            {/* Success state - show rollback button */}
            {modalState === 'success' && (executionResult?.execution_id || executionResult?.snapshot_id) && (
              <Button onClick={handleRollback} variant="outline" className="border-orange-400 text-orange-600 hover:bg-orange-50">
                <RotateCcw style={{ width: 16, height: 16, marginRight: 8 }} /> Rollback Changes
              </Button>
            )}

            {/* Failed state - show retry button */}
            {modalState === 'failed' && simulation && (
              <Button onClick={() => setModalState('simulation')} variant="outline">
                <RefreshCw style={{ width: 16, height: 16, marginRight: 8 }} /> Try Again
              </Button>
            )}
          </div>
        </div>
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
