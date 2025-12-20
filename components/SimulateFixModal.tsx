import React, { useState } from 'react';
import { X, AlertCircle, CheckCircle, Loader } from 'lucide-react';

interface SimulateFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (data: any) => void;
  remediationId?: string;
  remediationName?: string;
}

type ModalState = 'simulate' | 'review' | 'executing' | 'success' | 'error';

interface ErrorDetails {
  message: string;
  status?: number;
  isForbidden?: boolean;
}

export const SimulateFixModal: React.FC<SimulateFixModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  remediationId,
  remediationName,
}) => {
  const [state, setState] = useState<ModalState>('simulate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  if (!isOpen) return null;

  const handleSimulate = async () => {
    console.log('[SimulateFixModal] Starting simulation for:', remediationId);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/proxy/safe-remediate/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          remediationId,
          dryRun: true,
        }),
      });

      console.log('[SimulateFixModal] Simulation response status:', response.status);

      // Handle 403 Forbidden error
      if (response.status === 403) {
        console.warn('[SimulateFixModal] 403 Forbidden error - user may not have required role');
        setError({
          message: 'You do not have permission to simulate this remediation. Required role is not assigned to your account.',
          status: 403,
          isForbidden: true,
        });
        setState('error');
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[SimulateFixModal] Simulation failed:', errorData);
        setError({
          message: errorData?.message || `Simulation failed with status ${response.status}`,
          status: response.status,
        });
        setState('error');
        setLoading(false);
        return;
      }

      const result = await response.json();
      console.log('[SimulateFixModal] Simulation successful:', result);
      setSimulationResult(result);
      setState('review');
    } catch (err) {
      console.error('[SimulateFixModal] Simulation error:', err);
      setError({
        message: err instanceof Error ? err.message : 'An unexpected error occurred during simulation',
      });
      setState('error');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    console.log('[SimulateFixModal] Starting execution for:', remediationId);
    setState('executing');
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/proxy/safe-remediate/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          remediationId,
          dryRun: false,
        }),
      });

      console.log('[SimulateFixModal] Execution response status:', response.status);

      // Handle 403 Forbidden error
      if (response.status === 403) {
        console.warn('[SimulateFixModal] 403 Forbidden error during execution');
        setError({
          message: 'You do not have permission to execute this remediation. Required role is not assigned to your account.',
          status: 403,
          isForbidden: true,
        });
        setState('error');
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[SimulateFixModal] Execution failed:', errorData);
        setError({
          message: errorData?.message || `Execution failed with status ${response.status}`,
          status: response.status,
        });
        setState('error');
        setLoading(false);
        return;
      }

      const result = await response.json();
      console.log('[SimulateFixModal] Execution successful:', result);
      setState('success');
      onConfirm?.(result);
    } catch (err) {
      console.error('[SimulateFixModal] Execution error:', err);
      setError({
        message: err instanceof Error ? err.message : 'An unexpected error occurred during execution',
      });
      setState('error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setState('simulate');
    setError(null);
    setSimulationResult(null);
    setLoading(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {state === 'simulate' && 'Simulate Remediation'}
            {state === 'review' && 'Review Simulation Results'}
            {state === 'executing' && 'Executing Remediation'}
            {state === 'success' && 'Success'}
            {state === 'error' && 'Error'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Simulate State */}
          {state === 'simulate' && (
            <div className="space-y-4">
              <p className="text-gray-600">
                You are about to simulate the remediation: <span className="font-semibold">{remediationName}</span>
              </p>
              <p className="text-sm text-gray-500">
                The simulation will show what would be changed without actually applying the remediation.
              </p>
            </div>
          )}

          {/* Review State */}
          {state === 'review' && simulationResult && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Simulation Results</h3>
                <div className="text-sm text-blue-800 space-y-2">
                  {simulationResult.changes && (
                    <div>
                      <p className="font-medium">Changes:</p>
                      <pre className="bg-white p-2 rounded text-xs overflow-auto max-h-40 border border-blue-100">
                        {JSON.stringify(simulationResult.changes, null, 2)}
                      </pre>
                    </div>
                  )}
                  {simulationResult.summary && (
                    <p className="font-medium">Summary: {simulationResult.summary}</p>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-600">
                The simulation completed successfully. Review the changes above and proceed with execution if they look correct.
              </p>
            </div>
          )}

          {/* Executing State */}
          {state === 'executing' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader className="animate-spin text-blue-500" size={40} />
              <p className="text-gray-600">Executing remediation...</p>
              <p className="text-sm text-gray-500">This may take a few moments.</p>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <CheckCircle className="text-green-500" size={48} />
              <div className="text-center space-y-2">
                <p className="text-gray-900 font-semibold">Remediation Executed Successfully</p>
                <p className="text-sm text-gray-600">
                  The remediation has been applied successfully.
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start space-x-3">
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <h3 className="font-semibold text-red-900">Error</h3>
                  <p className="text-sm text-red-800 mt-1">{error.message}</p>
                  {error.isForbidden && (
                    <p className="text-xs text-red-700 mt-2 font-medium">
                      Please contact your administrator if you believe you should have access to this remediation.
                    </p>
                  )}
                  {error.status && (
                    <p className="text-xs text-red-700 mt-1">Status Code: {error.status}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          {state === 'success' && (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
            >
              Close
            </button>
          )}

          {state === 'error' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
              >
                Close
              </button>
              {!error.isForbidden && (
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition"
                >
                  Try Again
                </button>
              )}
            </>
          )}

          {state === 'simulate' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSimulate}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg font-medium transition"
              >
                {loading ? 'Simulating...' : 'Simulate'}
              </button>
            </>
          )}

          {state === 'review' && (
            <>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
              >
                Back
              </button>
              <button
                onClick={handleExecute}
                disabled={loading}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg font-medium transition"
              >
                {loading ? 'Executing...' : 'Execute'}
              </button>
            </>
          )}

          {state === 'executing' && (
            <button
              disabled
              className="px-4 py-2 bg-gray-300 text-gray-600 rounded-lg font-medium cursor-not-allowed"
            >
              Processing...
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimulateFixModal;
