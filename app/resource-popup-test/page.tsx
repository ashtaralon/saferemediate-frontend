'use client';

import React, { useState } from 'react';
import { UniversalTemplateRenderer } from '@/components/universal-template';
import { useResourcePopup } from '@/hooks/useResourcePopup';

/**
 * Test page for the Universal Template Renderer
 * Matches the dark theme design from the existing template
 */
export default function ResourcePopupTestPage() {
  const [resourceId, setResourceId] = useState('SafeRemediate-Lambda-Remediation-Role');
  const [inputValue, setInputValue] = useState('SafeRemediate-Lambda-Remediation-Role');

  const { data, loading, error, refresh } = useResourcePopup({
    resourceId,
    systemName: 'alon-prod',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResourceId(inputValue);
  };

  const handleApplyFix = () => {
    console.log('Apply fix clicked for:', resourceId);
    alert('Apply Fix functionality - integrate with your remediation API');
  };

  const handleExport = () => {
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${resourceId}-analysis.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden">
      {/* Background decoration - mimicking the space/stars effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute top-40 left-20 w-16 h-16 bg-orange-500/20 rounded-full blur-xl" />
        <div className="absolute bottom-40 right-20 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl" />
      </div>

      {/* Search Bar */}
      <div className="relative z-10 p-4 border-b border-gray-800">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter resource ID or name..."
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Load
          </button>
          <button
            type="button"
            onClick={refresh}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Refresh
          </button>
        </form>

        {/* Quick Examples */}
        <div className="max-w-2xl mx-auto mt-2 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500">Examples:</span>
          {[
            'SafeRemediate-Lambda-Remediation-Role',
            'APIGatewayServiceRolePolicy',
            'App-2-role',
          ].map((example) => (
            <button
              key={example}
              onClick={() => {
                setInputValue(example);
                setResourceId(example);
              }}
              className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex items-center justify-center p-8 min-h-[calc(100vh-80px)]">
        {loading && (
          <div className="text-gray-400 flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            <span>Loading resource data...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-6 max-w-md text-center">
            <p className="text-red-400 font-medium mb-2">Error loading resource</p>
            <p className="text-red-300 text-sm">{error}</p>
            <button
              onClick={refresh}
              className="mt-4 px-4 py-2 bg-red-800 text-red-200 rounded-lg hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {data && !loading && (
          <UniversalTemplateRenderer
            data={data}
            onClose={() => console.log('Close clicked')}
            onApplyFix={handleApplyFix}
            onExport={handleExport}
          />
        )}

        {!data && !loading && !error && (
          <div className="text-gray-500 text-center">
            <p>Enter a resource ID to view details</p>
          </div>
        )}
      </div>

      {/* Debug Panel */}
      {data && (
        <div className="relative z-10 p-4 border-t border-gray-800 bg-gray-900/50">
          <details className="max-w-4xl mx-auto">
            <summary className="cursor-pointer text-gray-500 text-sm font-medium hover:text-gray-400">
              Raw API Response (Debug)
            </summary>
            <pre className="mt-4 p-4 bg-gray-950 text-green-400 rounded-lg overflow-auto max-h-96 text-xs">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
