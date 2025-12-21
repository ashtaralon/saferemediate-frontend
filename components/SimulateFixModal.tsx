'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

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

type ModalState = 'confirmation' | 'loading' | 'success' | 'error';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export function SimulateFixModal({ isOpen, onClose, finding, role }: SimulateFixModalProps) {
  const [modalState, setModalState] = useState<ModalState>('confirmation');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [simulation, setSimulation] = useState<any>(null);
  const [decision, setDecision] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasSimulated, setHasSimulated] = useState(false);

  // Handle simulate - this is what should be called when modal opens
  const handleSimulate = async () => {
    if (!finding && !role) {
      setErrorMessage('Finding or role is required');
      setModalState('error');
      return;
    }

    setLoading(true);
    setModalState('loading');
    setErrorMessage('');

    try {
      // If we have a finding, call simulate endpoint
      if (finding) {
        const findingId = finding.finding_id || finding.id;
        if (!findingId) {
          throw new Error('Finding ID is required');
        }

        const response = await fetch(`${BACKEND_URL}/api/simulate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            finding_id: findingId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ detail: `API error: ${response.status}` }));
          throw new Error(errorData?.detail || errorData?.message || `API error: ${response.status}`);
        }

        const data = await response.json();
        console.log("SIMULATE RESPONSE", data); // Debug log
        
        // Extract simulation and decision from response
        setSimulation(data.simulation ?? null);
        setDecision(data.decision ?? null);
        setHasSimulated(true);
        setModalState('success');
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
        setModalState('success');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : typeof error === 'string' ? error : 'An unexpected error occurred';
      setErrorMessage(errorMsg);
      setModalState('error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemediateClick = async () => {
    // This is for executing remediation after simulation
    // For now, keep the existing logic for role-based remediation
    if (role) {
      if (!role?.name) {
        setErrorMessage('Role name is required');
        setModalState('error');
        return;
      }

      setModalState('loading');
      setErrorMessage('');

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
        setModalState('success');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : typeof error === 'string' ? error : 'An unexpected error occurred';
        setErrorMessage(errorMsg);
        setModalState('error');
      }
    }
  };

  const handleClose = () => {
    setModalState('confirmation');
    setErrorMessage('');
    setSimulation(null);
    setDecision(null);
    setHasSimulated(false);
    onClose();
  };

  // Auto-trigger simulate when modal opens with a finding
  useEffect(() => {
    if (isOpen && finding && !hasSimulated && modalState === 'confirmation') {
      handleSimulate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, finding]);

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
          {modalState === 'confirmation' && !finding && (
            <>
              {/* Role Details Section (only for role-based) */}
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

                  {role?.policies && Array.isArray(role.policies) && role.policies.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-slate-600">Attached Policies</label>
                      <ul className="mt-2 space-y-1">
                        {role.policies
                          .filter((policy) => policy != null)
                          .map((policy, index) => (
                            <li key={policy?.id || `policy-${index}`} className="text-sm text-slate-900">
                              • {policy?.name || 'Unknown Policy'}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Warning Message */}
              <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900">This action cannot be undone</p>
                  <p className="text-xs text-amber-800 mt-1">
                    Remediation will modify the role's policies. Please ensure you have backed up any important configuration.
                  </p>
                </div>
              </div>
            </>
          )}

          {modalState === 'confirmation' && finding && (
            <div className="text-center py-4">
              <p className="text-sm text-slate-600">Starting simulation...</p>
            </div>
          )}

          {modalState === 'loading' && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-slate-600">
                {finding ? 'Running simulation and decision engine...' : 'Executing remediation...'}
              </p>
            </div>
          )}

          {modalState === 'success' && (decision || simulation) && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-semibold">Simulation Complete</span>
              </div>

              {/* Decision Result */}
              {decision && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-600">Decision</div>
                    <div className="font-mono text-sm font-semibold">{decision.action}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-slate-500">Confidence</div>
                      <div className="text-lg font-semibold">
                        {typeof decision.confidence === "number"
                          ? `${(decision.confidence * 100).toFixed(1)}%`
                          : "—"}
                      </div>
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-slate-500">Safety</div>
                      <div className="text-lg font-semibold">
                        {typeof decision.safety === "number"
                          ? `${(decision.safety * 100).toFixed(1)}%`
                          : "—"}
                      </div>
                    </div>
                  </div>

                  {decision.breakdown && (
                    <div className="rounded-lg border p-3">
                      <div className="text-sm font-medium mb-2">Breakdown</div>
                      <pre className="text-xs overflow-auto bg-slate-50 p-2 rounded">
                        {JSON.stringify(decision.breakdown, null, 2)}
                      </pre>
                    </div>
                  )}

                  {Array.isArray(decision.reasons) && decision.reasons.length > 0 && (
                    <div className="rounded-lg border p-3">
                      <div className="text-sm font-medium mb-2">Reasons</div>
                      <ul className="list-disc ml-5 text-sm text-slate-700 space-y-1">
                        {decision.reasons.map((r: string, i: number) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Simulation Result - Only show if data exists */}
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
            </div>
          )}

          {modalState === 'success' && !decision && !simulation && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-900">Remediation completed successfully</p>
                <p className="text-xs text-slate-600 mt-1">
                  The role "{role?.name || 'selected role'}" has been remediated
                </p>
              </div>
            </div>
          )}

          {modalState === 'error' && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <AlertCircle className="h-8 w-8 text-red-600" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-900">Remediation failed</p>
                <p className="text-xs text-red-600 mt-2 break-words">
                  {errorMessage}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          {(modalState === 'confirmation' || modalState === 'error') && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleRemediateClick}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Execute Remediation
              </Button>
            </>
          )}

          {(modalState === 'success' || (modalState === 'error' && false)) && (
            <Button onClick={handleClose} className="bg-blue-600 hover:bg-blue-700">
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
