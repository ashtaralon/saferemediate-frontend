'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { toRoutingDecision } from '@/lib/decision-routing';

interface Finding {
  id?: string;
  finding_id?: string;
  title?: string;
  description?: string;
  severity?: string;
  resource?: string;
  resourceId?: string;
  resourceType?: string;
  type?: string;
  role_name?: string;
}

interface SimulateFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  finding?: Finding;
  role?: {
    id?: string;
    name?: string;
    arn?: string;
    policies?: Array<{
      id?: string;
      name?: string;
      document?: any;
    }>;
  };
}

type Step = "INTRO" | "SIMULATED" | "ERROR";

export function SimulateFixModal({ isOpen, onClose, finding, role }: SimulateFixModalProps) {
  const [step, setStep] = useState<Step>("INTRO");
  const [simulation, setSimulation] = useState<any>(null);
  const [decision, setDecision] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map the legacy 6-state decision.action coming from /api/proxy/simulate
  // onto the v4.4 §11E canonical 4-state via the shared mapper. Returns
  // null when decision is absent (the live API doesn't populate this
  // field today; the display block below is gated on `decision &&`).
  const routedDecision = useMemo(
    () => toRoutingDecision(decision?.action),
    [decision]
  );

  // Handle simulate - called when user clicks "Run Simulation" button
  const handleSimulate = async () => {
    if (!finding && !role) {
      setError('Finding or role is required');
      setStep('ERROR');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // If we have a finding, call simulate endpoint
      if (finding) {
        const findingId = finding.finding_id || finding.id;
        if (!findingId) {
          throw new Error('Finding ID is required');
        }

        // Use proxy route - no direct backend calls
        const res = await fetch('/api/proxy/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ finding_id: findingId }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || data?.detail || `Simulation failed: ${res.status}`);
        }

        // Extract simulation and decision from response
        setSimulation(data.simulation ?? null);
        setDecision(data.decision ?? null);
        setStep('SIMULATED');
      } else if (role) {
        // Legacy role-based remediation (keep for backward compatibility)
        const response = await fetch('/api/proxy/remediate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roleId: role?.id || '',
            roleName: role?.name || '',
            roleArn: role?.arn || '',
            policies: role?.policies || [],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: `API error: ${response.status}` }));
          throw new Error(errorData?.message || errorData?.detail || `API error: ${response.status}`);
        }

        const data = await response.json();
        setStep('SIMULATED');
      }
    } catch (e: any) {
      setError(e.message || 'An unexpected error occurred');
      setStep('ERROR');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFix = async () => {
    console.log('🔥 APPLY BUTTON CLICKED');
    
    if (!finding && !role) {
      console.error('No finding or role available');
      setError('Finding or role is required');
      setStep('ERROR');
      return;
    }

    const findingId = finding?.finding_id || finding?.id;
    console.log('🔥 APPLY DEBUG:', {
      step,
      findingId,
      hasId: !!findingId,
      decision: decision?.action,
      finding: finding ? { id: finding.id, finding_id: finding.finding_id } : null
    });

    if (!findingId) {
      console.error('Finding ID is missing');
      setError('Finding ID is required');
      setStep('ERROR');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use proxy route for remediation execution
      const response = await fetch('/api/proxy/simulate/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          finding_id: findingId,
          create_rollback: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `API error: ${response.status}` }));
        throw new Error(errorData?.detail || errorData?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Remediation response:', data);
      
      // Check if blocked by policy
      if (data.blocked === true) {
        console.log('🚫 Remediation blocked by policy:', data.details);
        setError(data.details || data.reason || 'Remediation blocked by protection policy');
        setStep('ERROR');
        return;
      }
      
      // Check if successful
      if (data.success === true) {
        console.log('✅ Remediation executed successfully');
        // Show success and close after a moment
        setStep('SIMULATED');
        setTimeout(() => {
          handleClose();
        }, 2000);
      } else {
        // Not blocked but not successful either
        setError(data.error || data.message || 'Remediation failed');
        setStep('ERROR');
      }
    } catch (e: any) {
      console.error('❌ Remediation failed:', e);
      setError(e.message || 'An unexpected error occurred');
      setStep('ERROR');
    } finally {
      setLoading(false);
    }
  };

  const handleRemediateClick = async () => {
    // Legacy role-based remediation (for backward compatibility)
    if (role) {
      if (!role?.name) {
        setError('Role name is required');
        setStep('ERROR');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/proxy/remediate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roleId: role?.id || '',
            roleName: role?.name || '',
            roleArn: role?.arn || '',
            policies: role?.policies || [],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: `API error: ${response.status}` }));
          throw new Error(errorData?.message || errorData?.detail || `API error: ${response.status}`);
        }

        const data = await response.json();
        setStep('SIMULATED');
      } catch (e: any) {
        setError(e.message || 'An unexpected error occurred');
        setStep('ERROR');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleClose = () => {
    setStep('INTRO');
    setError(null);
    setSimulation(null);
    setDecision(null);
    onClose();
  };

  // Reset to INTRO when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('INTRO');
      setError(null);
      setSimulation(null);
      setDecision(null);
    }
  }, [isOpen]);

  // Early return if modal is not open
  if (!isOpen) {
    return null;
  }

  // Early return if both finding and role are missing
  if (!finding && !role) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{finding ? 'Simulate Remediation' : 'Remediate Role'}</DialogTitle>
          <DialogDescription>
            {finding ? 'Analyzing impact and determining remediation action' : 'Review the role details before executing remediation'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* INTRO Screen - Before simulation */}
          {step === "INTRO" && finding && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Simulation Preview</h3>

              <p className="text-sm text-slate-600">
                You are about to simulate remediation for:
              </p>

              <div className="rounded border p-3 text-sm space-y-2">
                <div><strong>Resource:</strong> {finding.resource || finding.resourceId || 'N/A'}</div>
                <div><strong>Issue:</strong> {finding.title || 'N/A'}</div>
                <div><strong>Severity:</strong> {finding.severity || 'N/A'}</div>
                {finding.description && (
                  <div className="mt-2 pt-2 border-t">
                    <strong>Description:</strong> {finding.description}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSimulate}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    'Run Simulation'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* INTRO Screen - For role-based (legacy) */}
          {step === "INTRO" && !finding && role && (
            <div className="space-y-4">
              <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
                <h3 className="font-semibold text-sm text-slate-900">Role Details</h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Role Name</label>
                    <p className="text-sm text-slate-900 mt-1 break-all">{role?.name || 'N/A'}</p>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-slate-600">Role ARN</label>
                    <p className="text-sm text-slate-900 mt-1 break-all font-mono text-xs">{role?.arn || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleRemediateClick}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Execute Remediation
                </Button>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-slate-600">
                Running simulation and decision engine...
              </p>
            </div>
          )}

          {/* SIMULATED Screen - Results */}
          {step === "SIMULATED" && decision && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Simulation Results</h3>

              {/* Three distinct concepts, displayed separately so
                  operators stop reading "95% confidence + BLOCKED"
                  as a contradiction:
                    1. Execution decision — what the engine routed it to
                       (AUTO_EXECUTE / CANARY_FIRST / REQUIRE_APPROVAL /
                       MANUAL_REVIEW / BLOCK / EXCLUDE)
                    2. Remediation confidence — how well we understand
                       the finding (the multiplicative formula output)
                    3. Telemetry coverage — what real data backs the
                       confidence; missing telemetry can lower the
                       routing without lowering confidence
                  Per memory feedback_decision_enum_convergence.md,
                  unified.DecisionOutcome is the canonical decision
                  enum. */}
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Execution decision
                  </span>
                  <span
                    className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                      routedDecision === "INSUFFICIENT_DATA"
                        ? "bg-rose-100 text-rose-700"
                        : routedDecision === "AUTO"
                          ? "bg-emerald-100 text-emerald-700"
                          : routedDecision === "STAGED_AUTO"
                            ? "bg-sky-100 text-sky-700"
                            : routedDecision === "SUGGEST"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {routedDecision ?? decision.action ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Remediation confidence
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {typeof decision.confidence === "number"
                      ? `${(decision.confidence * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Telemetry coverage
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {typeof decision.safety === "number"
                      ? `${(decision.safety * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
              </div>
              {/* Plain-English line for the case the audit explicitly
                  flagged: high confidence + BLOCK looks contradictory
                  unless the disjunction is named. */}
              {routedDecision === "INSUFFICIENT_DATA" &&
                typeof decision.confidence === "number" &&
                decision.confidence >= 0.7 ? (
                <p className="text-xs text-slate-600 italic px-1">
                  Engine understands the finding (high confidence) but
                  blocks execution — usually because telemetry coverage
                  is below the gate threshold or a hard safety
                  invariant fired. See reasons below.
                </p>
              ) : null}

              {Array.isArray(decision.reasons) && decision.reasons.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-medium mb-2">Decision Reasons</div>
                  <ul className="list-disc ml-5 text-sm text-slate-700 space-y-1">
                    {decision.reasons.map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {decision.breakdown && (
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-medium mb-2">Score Breakdown</div>
                  <pre className="text-xs overflow-auto bg-slate-50 p-2 rounded">
                    {JSON.stringify(decision.breakdown, null, 2)}
                  </pre>
                </div>
              )}

              {/* Simulation Details - Only if exists */}
              {simulation?.before_state && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-sm mb-2">Simulation Details</h4>
                  <div className="text-sm space-y-1">
                    <p><span className="font-medium">Before:</span> {simulation.before_state}</p>
                    {simulation.after_state && (
                      <p><span className="font-medium">After:</span> {simulation.after_state}</p>
                    )}
                    {simulation.warnings && Array.isArray(simulation.warnings) && simulation.warnings.length > 0 && (
                      <div className="mt-2">
                        <p className="font-medium text-xs">Warnings:</p>
                        <ul className="list-disc list-inside text-xs">
                          {simulation.warnings.map((w: string, idx: number) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Close
                </Button>
                {routedDecision !== "INSUFFICIENT_DATA" && (
                  <Button 
                    className="bg-green-600 hover:bg-green-700"
                    onClick={handleApplyFix}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      'Approve & Apply'
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ERROR Screen */}
          {step === "ERROR" && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <AlertCircle className="h-8 w-8 text-red-600" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-900">Simulation failed</p>
                <p className="text-xs text-red-600 mt-2 break-words">
                  {error || 'An unexpected error occurred'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Close
                </Button>
                <Button onClick={() => setStep('INTRO')} variant="outline">
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
