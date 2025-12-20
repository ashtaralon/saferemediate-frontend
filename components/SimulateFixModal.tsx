'use client';

import React, { useState } from 'react';

interface SimulateFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  remediationId: string;
  onSuccess?: () => void;
}

export default function SimulateFixModal({
  isOpen,
  onClose,
  remediationId,
  onSuccess,
}: SimulateFixModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProtectedRoleError, setIsProtectedRoleError] = useState(false);

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    setIsProtectedRoleError(false);

    try {
      const response = await fetch('/api/proxy/remediate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          remediationId,
          simulate: true,
        }),
      });

      if (response.status === 403) {
        // Handle protected role error
        setIsProtectedRoleError(true);
        setError(
          'Unable to simulate remediation: You do not have the required permissions to perform this action. This may be due to role restrictions.'
        );
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }

      const data = await response.json();
      
      // Success handling
      if (onSuccess) {
        onSuccess();
      }
      
      // Close modal after successful simulation
      onClose();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      setIsProtectedRoleError(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (!isProtectedRoleError) {
      handleSimulate();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Simulate Remediation</h2>

        {error && (
          <div
            className={`p-4 mb-4 rounded-md border-l-4 ${
              isProtectedRoleError
                ? 'bg-red-50 border-red-500 text-red-800'
                : 'bg-red-50 border-red-500 text-red-800'
            }`}
            role="alert"
          >
            <p className="font-semibold text-sm">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        <p className="text-gray-600 mb-6">
          {isProtectedRoleError
            ? 'This action is protected and requires elevated permissions.'
            : 'Are you sure you want to simulate this remediation? This will test the remediation without applying it.'}
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>

          {!isProtectedRoleError && (
            <button
              onClick={handleSimulate}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Simulating...' : 'Simulate'}
            </button>
          )}

          {isProtectedRoleError && (
            <button
              onClick={handleRetry}
              disabled={true}
              className="px-4 py-2 bg-gray-400 text-white rounded-md font-medium cursor-not-allowed opacity-50"
            >
              Retry Disabled
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
