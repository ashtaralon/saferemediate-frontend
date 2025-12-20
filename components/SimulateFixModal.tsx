'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface SimulateFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: {
    id: string;
    name: string;
    arn: string;
    policies?: Array<{
      id: string;
      name: string;
      document: any;
    }>;
  };
}

type ModalState = 'confirmation' | 'loading' | 'success' | 'error';

export function SimulateFixModal({ isOpen, onClose, role }: SimulateFixModalProps) {
  const [modalState, setModalState] = useState<ModalState>('confirmation');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleRemediateClick = async () => {
    setModalState('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/proxy/remediate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roleId: role.id,
          roleName: role.name,
          roleArn: role.arn,
          policies: role.policies || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      setModalState('success');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred');
      setModalState('error');
    }
  };

  const handleClose = () => {
    setModalState('confirmation');
    setErrorMessage('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Remediate Role</DialogTitle>
          <DialogDescription>
            Review the role details before executing remediation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {modalState === 'confirmation' && (
            <>
              {/* Role Details Section */}
              <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
                <h3 className="font-semibold text-sm text-slate-900">Role Details</h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Role Name</label>
                    <p className="text-sm text-slate-900 mt-1 break-all">{role.name}</p>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-slate-600">Role ARN</label>
                    <p className="text-sm text-slate-900 mt-1 break-all font-mono text-xs">{role.arn}</p>
                  </div>

                  {role.policies && role.policies.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-slate-600">Attached Policies</label>
                      <ul className="mt-2 space-y-1">
                        {role.policies.map((policy) => (
                          <li key={policy.id} className="text-sm text-slate-900">
                            • {policy.name}
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

          {modalState === 'loading' && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-slate-600">Executing remediation...</p>
            </div>
          )}

          {modalState === 'success' && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-900">Remediation completed successfully</p>
                <p className="text-xs text-slate-600 mt-1">
                  The role "{role.name}" has been remediated
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
