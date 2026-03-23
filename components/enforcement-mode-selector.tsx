"use client";

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Zap,
  AlertTriangle,
  Check,
  Info,
  Loader2,
  Settings,
  ChevronDown
} from 'lucide-react';

interface ModeConfig {
  mode: string;
  description: string;
  thresholds: {
    AUTO_THRESHOLD: number;
    CANARY_THRESHOLD: number;
    APPROVAL_THRESHOLD: number;
    MIN_OBSERVATION_DAYS: number;
    REQUIRE_ZERO_TRAFFIC: boolean;
    MIN_DAYS_NO_TRAFFIC: number;
    EXCLUDE_PUBLIC_AUTO: boolean;
    EXCLUDE_CRITICAL_SERVICE: boolean;
    EXCLUDE_WITH_RESOURCES: boolean;
    MAX_EXPOSURE_FOR_AUTO: number;
    REQUIRE_NO_CRITICAL_CVE: boolean;
  };
}

interface EnforcementConfig {
  current_mode: string;
  mode_description: string;
  thresholds: Record<string, any>;
  available_modes: string[];
  last_updated: string;
}

interface Props {
  onModeChange?: (mode: string) => void;
  initialMode?: string;
  showDetails?: boolean;
}

const ModeCard: React.FC<{
  mode: ModeConfig;
  isSelected: boolean;
  onSelect: () => void;
  isLoading: boolean;
}> = ({ mode, isSelected, onSelect, isLoading }) => {
  const isConservative = mode.mode === 'conservative';

  return (
    <div
      onClick={isLoading ? undefined : onSelect}
      className={`relative border-2 rounded-xl p-4 cursor-pointer transition-all ${
        isSelected
          ? isConservative
            ? 'border-[#3b82f6] bg-[#3b82f610] shadow-lg'
            : 'border-orange-500 bg-[#f9731610] shadow-lg'
          : 'border-slate-200 hover:border-slate-300 bg-white'
      }`}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 rounded-xl flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#3b82f6]" />
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
          isConservative ? 'bg-[#3b82f620]' : 'bg-[#f9731620]'
        }`}>
          {isConservative ? (
            <Shield className={`w-6 h-6 ${isConservative ? 'text-[#3b82f6]' : 'text-orange-600'}`} />
          ) : (
            <Zap className="w-6 h-6 text-orange-600" />
          )}
        </div>
        {isSelected && (
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
            isConservative ? 'bg-[#3b82f610]0' : 'bg-[#f9731610]0'
          }`}>
            <Check className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      <h3 className="font-bold text-lg capitalize mb-1">{mode.mode}</h3>

      <p className="text-sm text-slate-600 mb-4">
        {mode.description.split('.')[0]}.
      </p>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between items-center py-1 border-b border-slate-100">
          <span className="text-slate-500">Auto-remediate threshold</span>
          <span className="font-mono font-bold">{(mode.thresholds.AUTO_THRESHOLD * 100).toFixed(0)}%</span>
        </div>
        <div className="flex justify-between items-center py-1 border-b border-slate-100">
          <span className="text-slate-500">Min observation days</span>
          <span className="font-mono font-bold">{mode.thresholds.MIN_OBSERVATION_DAYS}</span>
        </div>
        <div className="flex justify-between items-center py-1 border-b border-slate-100">
          <span className="text-slate-500">Require zero traffic</span>
          <span className={`font-bold ${mode.thresholds.REQUIRE_ZERO_TRAFFIC ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
            {mode.thresholds.REQUIRE_ZERO_TRAFFIC ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between items-center py-1 border-b border-slate-100">
          <span className="text-slate-500">Exclude public rules</span>
          <span className={`font-bold ${mode.thresholds.EXCLUDE_PUBLIC_AUTO ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
            {mode.thresholds.EXCLUDE_PUBLIC_AUTO ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-slate-500">Max exposure score</span>
          <span className="font-mono font-bold">{mode.thresholds.MAX_EXPOSURE_FOR_AUTO.toFixed(1)}</span>
        </div>
      </div>

      {isConservative ? (
        <div className="mt-4 p-2 bg-[#3b82f620] rounded text-xs text-[#3b82f6] flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Recommended for production. Minimizes false positives.</span>
        </div>
      ) : (
        <div className="mt-4 p-2 bg-[#f9731620] rounded text-xs text-[#f97316] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Use with caution. Higher remediation rate but may cause disruptions.</span>
        </div>
      )}
    </div>
  );
};

export const EnforcementModeSelector: React.FC<Props> = ({
  onModeChange,
  initialMode,
  showDetails = true
}) => {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [modes, setModes] = useState<ModeConfig[]>([]);
  const [currentMode, setCurrentMode] = useState<string>(initialMode || 'conservative');
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingMode, setPendingMode] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const [configRes, modesRes] = await Promise.all([
          fetch('/api/proxy/enforcement/config'),
          fetch('/api/proxy/enforcement/modes')
        ]);

        if (!configRes.ok || !modesRes.ok) {
          throw new Error('Failed to fetch enforcement configuration');
        }

        const config: EnforcementConfig = await configRes.json();
        const modesData: ModeConfig[] = await modesRes.json();

        setCurrentMode(config.current_mode);
        setModes(modesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        // Set default modes if API fails
        setModes([
          {
            mode: 'conservative',
            description: 'Conservative mode prioritizes safety over coverage.',
            thresholds: {
              AUTO_THRESHOLD: 0.95,
              CANARY_THRESHOLD: 0.85,
              APPROVAL_THRESHOLD: 0.70,
              MIN_OBSERVATION_DAYS: 90,
              REQUIRE_ZERO_TRAFFIC: true,
              MIN_DAYS_NO_TRAFFIC: 60,
              EXCLUDE_PUBLIC_AUTO: true,
              EXCLUDE_CRITICAL_SERVICE: true,
              EXCLUDE_WITH_RESOURCES: true,
              MAX_EXPOSURE_FOR_AUTO: 3.0,
              REQUIRE_NO_CRITICAL_CVE: true
            }
          },
          {
            mode: 'strict',
            description: 'Strict mode prioritizes coverage over caution.',
            thresholds: {
              AUTO_THRESHOLD: 0.80,
              CANARY_THRESHOLD: 0.65,
              APPROVAL_THRESHOLD: 0.50,
              MIN_OBSERVATION_DAYS: 30,
              REQUIRE_ZERO_TRAFFIC: false,
              MIN_DAYS_NO_TRAFFIC: 30,
              EXCLUDE_PUBLIC_AUTO: false,
              EXCLUDE_CRITICAL_SERVICE: false,
              EXCLUDE_WITH_RESOURCES: false,
              MAX_EXPOSURE_FOR_AUTO: 6.0,
              REQUIRE_NO_CRITICAL_CVE: false
            }
          }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const handleModeSelect = (mode: string) => {
    if (mode === currentMode) return;

    if (mode === 'strict') {
      setPendingMode(mode);
      setShowConfirmation(true);
    } else {
      applyModeChange(mode);
    }
  };

  const applyModeChange = async (mode: string) => {
    try {
      setUpdating(true);
      const response = await fetch('/api/proxy/enforcement/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          reason: `Mode changed via UI at ${new Date().toISOString()}`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update mode');
      }

      setCurrentMode(mode);
      onModeChange?.(mode);
      setShowConfirmation(false);
      setPendingMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update mode');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-[#3b82f6]" />
        <span className="ml-3 text-slate-600">Loading enforcement configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-[#f9731610] border border-[#f9731640] rounded-lg text-[#f97316] text-sm">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-slate-500" />
          <div>
            <h3 className="font-semibold">Enforcement Mode</h3>
            <p className="text-sm text-slate-500">Select how aggressively to remediate rules</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          currentMode === 'conservative'
            ? 'bg-[#3b82f620] text-[#3b82f6]'
            : 'bg-[#f9731620] text-[#f97316]'
        }`}>
          Current: {currentMode}
        </div>
      </div>

      {/* Mode Cards */}
      {showDetails && (
        <div className="grid grid-cols-2 gap-4">
          {modes.map((mode) => (
            <ModeCard
              key={mode.mode}
              mode={mode}
              isSelected={currentMode === mode.mode}
              onSelect={() => handleModeSelect(mode.mode)}
              isLoading={updating && pendingMode === mode.mode}
            />
          ))}
        </div>
      )}

      {/* Simple Toggle */}
      {!showDetails && (
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
          <button
            onClick={() => handleModeSelect('conservative')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
              currentMode === 'conservative'
                ? 'bg-[#3b82f610]0 text-white shadow-lg'
                : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-300'
            }`}
          >
            <Shield className="w-5 h-5 inline mr-2" />
            Conservative
          </button>
          <button
            onClick={() => handleModeSelect('strict')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
              currentMode === 'strict'
                ? 'bg-[#f9731610]0 text-white shadow-lg'
                : 'bg-white text-slate-700 border border-slate-200 hover:border-orange-300'
            }`}
          >
            <Zap className="w-5 h-5 inline mr-2" />
            Strict
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#f9731620] flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Switch to Strict Mode?</h3>
                <p className="text-sm text-slate-500">This changes enforcement behavior</p>
              </div>
            </div>

            <div className="space-y-3 mb-6 text-sm">
              <p className="text-slate-700">
                Strict mode enables more aggressive remediation:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                <li>Lower confidence thresholds (80% vs 95%)</li>
                <li>Can auto-remediate public rules</li>
                <li>Can remediate rules with active traffic</li>
                <li>Shorter observation requirements (30 days)</li>
              </ul>
              <p className="text-[#f97316] font-medium">
                This may cause service disruptions. Use only in non-production or when aggressive cleanup is needed.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmation(false);
                  setPendingMode(null);
                }}
                className="flex-1 py-2 px-4 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => applyModeChange('strict')}
                disabled={updating}
                className="flex-1 py-2 px-4 bg-[#f9731610]0 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Switching...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Enable Strict Mode
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnforcementModeSelector;
