'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SGInspectorSheet } from './inspector/SGInspectorSheet';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface RuleTraffic {
  connection_count: number;
  unique_sources: number;
  observed_sources: string[];
  has_traffic: boolean;
}

interface RuleRecommendation {
  action: 'KEEP' | 'DELETE' | 'TIGHTEN' | 'REVIEW';
  reason: string;
  confidence: number;
  suggested_cidrs?: string[];
  observed_sources?: string[];
}

interface RuleAnalysis {
  rule_id: string;
  direction: 'ingress' | 'egress';
  protocol: string;
  from_port: number | null;
  to_port: number | null;
  port_range: string;
  source_type: 'cidr' | 'cidr_ipv6' | 'security_group' | 'prefix_list';
  source: string;
  description: string;
  is_public: boolean;
  status: 'USED' | 'UNUSED' | 'OVERLY_BROAD';
  traffic: RuleTraffic;
  recommendation: RuleRecommendation;
}

interface GapSummary {
  total_rules: number;
  used_rules: number;
  unused_rules: number;
  overly_broad_rules: number;
  public_rules: number;
  observation_days: number;
  average_confidence: number;
  risk_score: number;
  recommendations_count: number;
}

interface GapAnalysisResult {
  sg_id: string;
  sg_name: string;
  vpc_id: string;
  eni_count: number;
  observation_days: number;
  rules_analysis: RuleAnalysis[];
  summary: GapSummary;
  recommendations: any[];
  analysis_time_seconds: number;
  error?: string;
}

interface SimulationResult {
  success: boolean;
  rule_id: string;
  action: string;
  current_state: Record<string, any>;
  proposed_state: Record<string, any>;
  impact: Record<string, any>;
  cli_command: string;
  reversible: boolean;
}

export interface SGGapCardProps {
  sgId: string;
  systemName?: string;
  onSimulate?: (sgId: string, ruleId: string, action: string) => void;
  onRemediate?: (sgId: string, ruleId: string, action: string) => void;
}

// ============================================================================
// Helper Components
// ============================================================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    USED: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    UNUSED: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30' },
    OVERLY_BROAD: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  };
  
  const style = styles[status] || styles.USED;
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text} border ${style.border}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

const ConfidenceBadge: React.FC<{ confidence: number }> = ({ confidence }) => {
  let style = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  let label = 'LOW';
  
  if (confidence >= 80) {
    style = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    label = 'HIGH';
  } else if (confidence >= 60) {
    style = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    label = 'MEDIUM';
  }
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style} border`}>
      {label} ({confidence}%)
    </span>
  );
};

const SummaryBox: React.FC<{
  count: number;
  label: string;
  subLabel: string;
  color: 'green' | 'red' | 'orange';
}> = ({ count, label, subLabel, color }) => {
  const colors = {
    green: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400',
    red: 'from-rose-500/20 to-rose-600/10 border-rose-500/30 text-rose-400',
    orange: 'from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-400',
  };
  
  return (
    <div className={`flex-1 bg-gradient-to-br ${colors[color]} border rounded-xl p-4 text-center`}>
      <div className="text-3xl font-bold">{count}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
      <div className="text-xs opacity-60">{subLabel}</div>
    </div>
  );
};

const RuleRow: React.FC<{
  rule: RuleAnalysis;
  isExpanded: boolean;
  onToggle: () => void;
  onSimulate: () => void;
  onApply: () => void;
  isSimulated: boolean;
}> = ({ rule, isExpanded, onToggle, onSimulate, onApply, isSimulated }) => {
  const protocolLabel = rule.protocol === '-1' ? 'ALL' : rule.protocol.toUpperCase();
  
  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden mb-2">
      {/* Rule Header */}
      <div 
        className="flex items-center justify-between p-3 bg-slate-800/50 cursor-pointer hover:bg-slate-800/70 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <StatusBadge status={rule.status} />
          <div className="font-mono text-sm">
            <span className="text-slate-400">{protocolLabel}</span>
            <span className="text-slate-500 mx-1">:</span>
            <span className="text-white">{rule.port_range}</span>
          </div>
          <div className="text-slate-400 text-sm">
            ← {rule.source_type === 'security_group' ? (
              <span className="text-blue-400">{rule.source}</span>
            ) : (
              <span className={rule.is_public ? 'text-rose-400' : 'text-slate-300'}>
                {rule.source}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {rule.traffic.has_traffic ? (
            <span className="text-xs text-slate-400">
              {rule.traffic.connection_count.toLocaleString()} conn · {rule.traffic.unique_sources} sources
            </span>
          ) : (
            <span className="text-xs text-slate-500 italic">No traffic</span>
          )}
          <ConfidenceBadge confidence={rule.recommendation.confidence} />
          <svg 
            className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      {/* Expanded Details */}
      {isExpanded && (
        <div className="p-4 bg-slate-900/50 border-t border-slate-700/50">
          {/* Recommendation */}
          <div className="mb-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Recommendation</div>
            <div className="flex items-start gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                rule.recommendation.action === 'DELETE' ? 'bg-rose-500/20 text-rose-400' :
                rule.recommendation.action === 'TIGHTEN' ? 'bg-amber-500/20 text-amber-400' :
                rule.recommendation.action === 'KEEP' ? 'bg-emerald-500/20 text-emerald-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {rule.recommendation.action}
              </span>
              <p className="text-sm text-slate-300">{rule.recommendation.reason}</p>
            </div>
          </div>
          
          {/* Suggested CIDRs (for TIGHTEN) */}
          {rule.recommendation.suggested_cidrs && rule.recommendation.suggested_cidrs.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Suggested CIDRs</div>
              <div className="flex flex-wrap gap-1">
                {rule.recommendation.suggested_cidrs.map((cidr, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-slate-700/50 rounded text-xs font-mono text-slate-300">
                    {cidr}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Description if present */}
          {rule.description && (
            <div className="mb-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Description</div>
              <p className="text-sm text-slate-400">{rule.description}</p>
            </div>
          )}
          
          {/* Action Buttons */}
          {(rule.recommendation.action === 'DELETE' || rule.recommendation.action === 'TIGHTEN') && (
            <div className="flex gap-2 mt-4 pt-4 border-t border-slate-700/50">
              <button
                onClick={(e) => { e.stopPropagation(); onSimulate(); }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Simulate
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onApply(); }}
                disabled={!isSimulated}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  isSimulated 
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Simulation Modal
// ============================================================================

const SimulationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  simulation: SimulationResult | null;
  isLoading: boolean;
  onConfirm: () => void;
}> = ({ isOpen, onClose, simulation, isLoading, onConfirm }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-slate-700">
          <h3 className="text-xl font-semibold text-white">Simulation Result</h3>
        </div>
        
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-slate-400">Running simulation...</span>
            </div>
          ) : simulation ? (
            <div className="space-y-6">
              {/* Status */}
              <div className="flex items-center gap-2">
                {simulation.success ? (
                  <>
                    <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-emerald-400 font-medium">Simulation successful</span>
                  </>
                ) : (
                  <>
                    <div className="w-6 h-6 bg-rose-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <span className="text-rose-400 font-medium">Simulation failed</span>
                  </>
                )}
              </div>
              
              {/* Action */}
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Action</div>
                <span className={`px-3 py-1 rounded text-sm font-medium ${
                  simulation.action === 'DELETE' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {simulation.action}
                </span>
              </div>
              
              {/* Impact */}
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Impact</div>
                <div className="bg-slate-800/50 rounded-lg p-4">
                  {Object.entries(simulation.impact).map(([key, value]) => (
                    <div key={key} className="flex justify-between py-1">
                      <span className="text-slate-400 text-sm">{key.replace(/_/g, ' ')}</span>
                      <span className="text-white text-sm font-mono">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* CLI Command */}
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">AWS CLI Command</div>
                <pre className="bg-slate-950 rounded-lg p-4 text-xs text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap">
                  {simulation.cli_command}
                </pre>
              </div>
              
              {/* Reversible badge */}
              {simulation.reversible && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  This action is reversible
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              No simulation data available
            </div>
          )}
        </div>
        
        <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
          {simulation?.success && (
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Apply Changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const SGGapCard: React.FC<SGGapCardProps> = ({
  sgId,
  systemName,
  onSimulate,
  onRemediate,
}) => {
  // State
  const [analysis, setAnalysis] = useState<GapAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [simulatedRules, setSimulatedRules] = useState<Set<string>>(new Set());
  const [showSimModal, setShowSimModal] = useState(false);
  const [currentSimulation, setCurrentSimulation] = useState<SimulationResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [activeRule, setActiveRule] = useState<RuleAnalysis | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  
  // Fetch gap analysis
  const fetchAnalysis = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({ days: '365' });
      const response = await fetch(`/api/proxy/security-groups/${sgId}/gap-analysis?${params}`);
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis');
    } finally {
      setIsLoading(false);
    }
  }, [sgId]);
  
  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);
  
  // Toggle rule expansion
  const toggleRule = (ruleId: string) => {
    setExpandedRules(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };
  
  // Run simulation
  const runSimulation = async (rule: RuleAnalysis) => {
    setActiveRule(rule);
    setShowSimModal(true);
    setSimLoading(true);
    setCurrentSimulation(null);
    
    try {
      const response = await fetch(`/api/proxy/security-groups/${sgId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_id: rule.rule_id,
          action: rule.recommendation.action,
          suggested_cidrs: rule.recommendation.suggested_cidrs,
        }),
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setCurrentSimulation(data);
      setSimulatedRules(prev => new Set(prev).add(rule.rule_id));
      
      onSimulate?.(sgId, rule.rule_id, rule.recommendation.action);
    } catch (err) {
      console.error('Simulation error:', err);
      setCurrentSimulation({
        success: false,
        rule_id: rule.rule_id,
        action: rule.recommendation.action,
        current_state: {},
        proposed_state: {},
        impact: { error: err instanceof Error ? err.message : 'Unknown error' },
        cli_command: '',
        reversible: false,
      });
    } finally {
      setSimLoading(false);
    }
  };
  
  // Apply remediation
  const applyRemediation = () => {
    if (activeRule) {
      onRemediate?.(sgId, activeRule.rule_id, activeRule.recommendation.action);
    }
    setShowSimModal(false);
  };
  
  // Export recommendations
  const exportRecommendations = () => {
    if (!analysis) return;
    
    const data = {
      sg_id: analysis.sg_id,
      sg_name: analysis.sg_name,
      exported_at: new Date().toISOString(),
      summary: analysis.summary,
      recommendations: analysis.rules_analysis
        .filter(r => r.recommendation.action !== 'KEEP')
        .map(r => ({
          rule_id: r.rule_id,
          port_range: r.port_range,
          source: r.source,
          status: r.status,
          action: r.recommendation.action,
          reason: r.recommendation.reason,
          confidence: r.recommendation.confidence,
          suggested_cidrs: r.recommendation.suggested_cidrs,
        })),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sg-recommendations-${sgId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  // ============================================================================
  // Render States
  // ============================================================================
  
  // Loading state
  if (isLoading) {
    return (
      <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-slate-400">Analyzing Security Group {sgId}...</span>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="bg-slate-900/80 backdrop-blur-sm border border-rose-500/30 rounded-2xl p-8">
        <div className="flex items-center justify-center text-rose-400">
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
        <div className="text-center mt-4">
          <button
            onClick={fetchAnalysis}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  if (!analysis) return null;
  
  // ============================================================================
  // Main Render
  // ============================================================================
  
  return (
    <>
      <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-semibold text-white">{analysis.sg_name}</h3>
                <span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs font-mono text-slate-400">
                  {analysis.sg_id}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
                  VPC: {analysis.vpc_id}
                </span>
                <span className="px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded text-xs">
                  {analysis.eni_count} ENIs attached
                </span>
                {systemName && (
                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                    System: {systemName}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-start gap-4">
              <button
                onClick={() => setShowInspector(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Inspect
              </button>
              <div className="text-right">
                <ConfidenceBadge confidence={analysis.summary.average_confidence} />
                <div className="text-xs text-slate-500 mt-1">
                  Risk Score: {analysis.summary.risk_score}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Summary Cards */}
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex gap-4">
            <SummaryBox 
              count={analysis.summary.used_rules} 
              label="USED" 
              subLabel="Keep" 
              color="green" 
            />
            <SummaryBox 
              count={analysis.summary.unused_rules} 
              label="UNUSED" 
              subLabel="Delete" 
              color="red" 
            />
            <SummaryBox 
              count={analysis.summary.overly_broad_rules} 
              label="OVERLY BROAD" 
              subLabel="Tighten" 
              color="orange" 
            />
          </div>
        </div>
        
        {/* Rules List */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
              Ingress Rules ({analysis.rules_analysis.filter(r => r.direction === 'ingress').length})
            </h4>
            <button
              onClick={() => {
                const ingressRules = analysis.rules_analysis
                  .filter(r => r.direction === 'ingress')
                  .map(r => r.rule_id);
                setExpandedRules(prev => 
                  ingressRules.every(id => prev.has(id))
                    ? new Set([...prev].filter(id => !ingressRules.includes(id)))
                    : new Set([...prev, ...ingressRules])
                );
              }}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              {analysis.rules_analysis
                .filter(r => r.direction === 'ingress')
                .every(r => expandedRules.has(r.rule_id)) ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
          
          <div className="space-y-2">
            {analysis.rules_analysis
              .filter(r => r.direction === 'ingress')
              .map(rule => (
                <RuleRow
                  key={rule.rule_id}
                  rule={rule}
                  isExpanded={expandedRules.has(rule.rule_id)}
                  onToggle={() => toggleRule(rule.rule_id)}
                  onSimulate={() => runSimulation(rule)}
                  onApply={() => {
                    setActiveRule(rule);
                    applyRemediation();
                  }}
                  isSimulated={simulatedRules.has(rule.rule_id)}
                />
              ))}
          </div>
          
          {analysis.rules_analysis.filter(r => r.direction === 'ingress').length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No ingress rules found
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-slate-700/50 bg-slate-800/30">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Data source: VPC Flow Logs ({analysis.observation_days} days)
              <span className="mx-2">·</span>
              Analyzed in {analysis.analysis_time_seconds}s
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchAnalysis}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              <button
                onClick={exportRecommendations}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Simulation Modal */}
      <SimulationModal
        isOpen={showSimModal}
        onClose={() => setShowSimModal(false)}
        simulation={currentSimulation}
        isLoading={simLoading}
        onConfirm={applyRemediation}
      />

      {/* SG Inspector Sheet */}
      <SGInspectorSheet
        sgId={sgId}
        open={showInspector}
        onOpenChange={setShowInspector}
      />
    </>
  );
};

export default SGGapCard;

