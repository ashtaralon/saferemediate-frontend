'use client';

/**
 * Security Group Least Privilege Modal
 * =====================================
 * 
 * Complete LP analysis modal for Security Groups following the A7 patent:
 * - Summary tab: LP Score, Attack Surface Reduction, Network Exposure
 * - Rules tab: Configured vs Observed traffic
 * - Evidence tab: Data sources and confidence
 * - Impact tab: What will continue working, what will be removed
 * 
 * Uses the new /api/sg-least-privilege/{sg_id}/analysis endpoint
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Download,
  Play,
  RotateCcw,
  FileText,
  Globe,
  Lock,
  Network,
  Activity,
  Database,
  Cloud,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface TrafficData {
  connection_count: number;
  unique_sources: number;
  sample_sources: string[];
  has_traffic: boolean;
}

interface Confidence {
  score: number;
  level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  reasons: string[];
}

interface Recommendation {
  action: 'KEEP' | 'DELETE' | 'TIGHTEN' | 'REVIEW';
  reason: string;
  confidence: Confidence;
}

interface RuleAnalysis {
  rule_id: string;
  direction: string;
  protocol: string;
  from_port: number | null;
  to_port: number | null;
  port_range: string;
  port_name: string | null;
  source: string;
  source_type: 'cidr' | 'security_group' | 'cidr_ipv6';
  is_public: boolean;
  description: string;
  status: 'USED' | 'UNUSED' | 'OVERLY_BROAD' | 'UNKNOWN';
  traffic: TrafficData;
  recommendation: Recommendation;
}

interface Evidence {
  sources: { name: string; available: boolean }[];
  observation_period: {
    days: number;
    start: string;
    end: string;
  };
  confidence: {
    level: string;
    score: number;
    reason: string;
  };
}

interface SGAnalysis {
  sg_id: string;
  sg_name: string;
  vpc_id: string;
  system_name: string | null;
  lp_score: number;
  gap_percentage: number;
  summary: {
    total_rules: number;
    used_rules: number;
    unused_rules: number;
    overly_broad_rules: number;
    public_rules: number;
    observation_days: number;
  };
  evidence: Evidence;
  rules: RuleAnalysis[];
  recommendations: {
    delete: RuleAnalysis[];
    tighten: RuleAnalysis[];
    review: RuleAnalysis[];
    keep: RuleAnalysis[];
  };
  timestamp: string;
}

interface SGLeastPrivilegeModalProps {
  sgId: string;
  sgName?: string;
  systemName?: string;
  isOpen: boolean;
  onClose: () => void;
  onRemediate?: (sgId: string, rules: RuleAnalysis[]) => void;
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, { bg: string; text: string; label?: string }> = {
    USED: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
    UNUSED: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'UNUSED (DELETE)' },
    OVERLY_BROAD: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'OVERLY BROAD' },
    UNKNOWN: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  };

  const style = styles[status] || styles.UNKNOWN;
  const label = style.label || status;

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {label}
    </span>
  );
};

const ConfidenceBadge: React.FC<{ level: string; score: number }> = ({ level, score }) => {
  const styles: Record<string, string> = {
    HIGH: 'bg-emerald-500/20 text-emerald-400',
    MEDIUM: 'bg-amber-500/20 text-amber-400',
    LOW: 'bg-red-500/20 text-red-400',
    NONE: 'bg-gray-500/20 text-gray-400',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[level] || styles.LOW}`}>
      {level} ({score}%)
    </span>
  );
};

const SourceDisplay: React.FC<{ source: string; sourceType: string; isPublic: boolean }> = ({
  source,
  sourceType,
  isPublic,
}) => {
  if (sourceType === 'security_group') {
    return (
      <span className="flex items-center gap-1 text-blue-400">
        <Shield className="w-3 h-3" />
        {source}
      </span>
    );
  }

  return (
    <span className={`flex items-center gap-1 ${isPublic ? 'text-red-400' : 'text-slate-300'}`}>
      {isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
      {source}
    </span>
  );
};

// =============================================================================
// TAB: SUMMARY
// =============================================================================

const SummaryTab: React.FC<{ analysis: SGAnalysis }> = ({ analysis }) => {
  const attackSurfaceReduction = analysis.summary.unused_rules + analysis.summary.overly_broad_rules;
  const attackSurfacePercent = Math.round(
    (attackSurfaceReduction / Math.max(analysis.summary.total_rules, 1)) * 100
  );

  return (
    <div className="space-y-6">
      {/* LP Score and Attack Surface */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="text-sm text-slate-400 mb-2">LP Score</div>
          <div className="flex items-end gap-2">
            <span
              className={`text-4xl font-bold ${
                analysis.lp_score >= 80
                  ? 'text-emerald-400'
                  : analysis.lp_score >= 50
                  ? 'text-amber-400'
                  : 'text-red-400'
              }`}
            >
              {analysis.lp_score}
            </span>
            <span className="text-slate-500 text-lg mb-1">/ 100</span>
          </div>
          {analysis.evidence.confidence.level === 'NONE' && (
            <div className="text-xs text-amber-400 mt-2">Requires traffic/access analysis</div>
          )}
        </div>

        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <div className="text-sm text-slate-400 mb-2">Attack Surface Reduction</div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-red-400">{attackSurfacePercent}%</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            {attackSurfaceReduction} of {analysis.summary.total_rules} rules can be removed/tightened
          </div>
        </div>
      </div>

      {/* Network Exposure Visualization */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Network Exposure Visualization</h3>
        
        {/* Visual bar */}
        <div className="relative h-8 rounded-lg overflow-hidden bg-slate-700/50 mb-4">
          {/* Used (green) */}
          <div
            className="absolute left-0 top-0 h-full bg-emerald-500/60"
            style={{ width: `${(analysis.summary.used_rules / Math.max(analysis.summary.total_rules, 1)) * 100}%` }}
          />
          {/* Unused (red) */}
          <div
            className="absolute top-0 h-full bg-red-500/60"
            style={{
              left: `${(analysis.summary.used_rules / Math.max(analysis.summary.total_rules, 1)) * 100}%`,
              width: `${(analysis.summary.unused_rules / Math.max(analysis.summary.total_rules, 1)) * 100}%`,
            }}
          />
          {/* Overly broad (orange) */}
          <div
            className="absolute top-0 h-full bg-orange-500/60"
            style={{
              left: `${((analysis.summary.used_rules + analysis.summary.unused_rules) / Math.max(analysis.summary.total_rules, 1)) * 100}%`,
              width: `${(analysis.summary.overly_broad_rules / Math.max(analysis.summary.total_rules, 1)) * 100}%`,
            }}
          />
          
          {/* Labels */}
          <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
            {analysis.summary.used_rules > 0 && (
              <span className="px-2">{analysis.summary.used_rules} Used</span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-emerald-500/60" />
            <span className="text-slate-400">Used ({analysis.summary.used_rules})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-500/60" />
            <span className="text-slate-400">Unused ({analysis.summary.unused_rules})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-orange-500/60" />
            <span className="text-slate-400">Overly Broad ({analysis.summary.overly_broad_rules})</span>
          </div>
        </div>

        {/* Summary text */}
        <p className="text-sm text-slate-400 mt-4">
          <strong className="text-slate-300">{analysis.sg_name}</strong> has{' '}
          <strong>{analysis.summary.total_rules} allowed rules</strong>. In{' '}
          <strong>{analysis.summary.observation_days} days</strong> of observation, only{' '}
          <strong className="text-emerald-400">{analysis.summary.used_rules} were used</strong>. The other{' '}
          <strong className="text-red-400">
            {analysis.summary.unused_rules + analysis.summary.overly_broad_rules} (
            {attackSurfacePercent}%)
          </strong>{' '}
          are your attack surface.
        </p>
      </div>
    </div>
  );
};

// =============================================================================
// TAB: RULES
// =============================================================================

const RulesTab: React.FC<{ analysis: SGAnalysis }> = ({ analysis }) => {
  const [filter, setFilter] = useState<'all' | 'used' | 'unused' | 'public'>('all');
  const [sortBy, setSortBy] = useState<'status' | 'traffic'>('status');

  const filteredRules = analysis.rules.filter((rule) => {
    if (filter === 'all') return true;
    if (filter === 'used') return rule.status === 'USED';
    if (filter === 'unused') return rule.status === 'UNUSED' || rule.status === 'OVERLY_BROAD';
    if (filter === 'public') return rule.is_public;
    return true;
  });

  const sortedRules = [...filteredRules].sort((a, b) => {
    if (sortBy === 'status') {
      const order = { UNUSED: 0, OVERLY_BROAD: 1, UNKNOWN: 2, USED: 3 };
      return (order[a.status] || 4) - (order[b.status] || 4);
    }
    return b.traffic.connection_count - a.traffic.connection_count;
  });

  return (
    <div className="space-y-4">
      {/* Summary boxes */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50">
          <div className="text-2xl font-bold text-slate-300">{analysis.summary.total_rules}</div>
          <div className="text-xs text-slate-500">Total Rules</div>
        </div>
        <div className="bg-emerald-500/10 rounded-lg p-3 text-center border border-emerald-500/30">
          <div className="text-2xl font-bold text-emerald-400">{analysis.summary.used_rules}</div>
          <div className="text-xs text-emerald-400/70">Used (KEEP)</div>
        </div>
        <div className="bg-red-500/10 rounded-lg p-3 text-center border border-red-500/30">
          <div className="text-2xl font-bold text-red-400">{analysis.summary.unused_rules}</div>
          <div className="text-xs text-red-400/70">Unused (DELETE)</div>
        </div>
        <div className="bg-orange-500/10 rounded-lg p-3 text-center border border-orange-500/30">
          <div className="text-2xl font-bold text-orange-400">{analysis.summary.overly_broad_rules}</div>
          <div className="text-xs text-orange-400/70">Overly Broad</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['all', 'used', 'unused', 'public'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {f === 'all' && 'All'}
              {f === 'used' && `Used (${analysis.summary.used_rules})`}
              {f === 'unused' && `Unused (${analysis.summary.unused_rules})`}
              {f === 'public' && `Public (${analysis.summary.public_rules})`}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'status' | 'traffic')}
          className="bg-slate-700/50 text-slate-300 rounded-lg px-3 py-1.5 text-xs border border-slate-600"
        >
          <option value="status">Sort by Status</option>
          <option value="traffic">Sort by Traffic</option>
        </select>
      </div>

      {/* Rules table */}
      <div className="border border-slate-700/50 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase">
              <th className="px-4 py-3 text-left">Port</th>
              <th className="px-4 py-3 text-left">Protocol</th>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Traffic</th>
              <th className="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {sortedRules.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No rules found
                </td>
              </tr>
            ) : (
              sortedRules.map((rule) => (
                <tr key={rule.rule_id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <div className="font-mono text-slate-200">{rule.port_range}</div>
                    {rule.port_name && (
                      <div className="text-xs text-slate-500">{rule.port_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{rule.protocol}</td>
                  <td className="px-4 py-3">
                    <SourceDisplay
                      source={rule.source}
                      sourceType={rule.source_type}
                      isPublic={rule.is_public}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={rule.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {rule.traffic.has_traffic ? (
                      <div>
                        <div className="text-slate-200">
                          {rule.traffic.connection_count.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500">
                          {rule.traffic.unique_sources} sources
                        </div>
                        {/* Show sample sources for OVERLY_BROAD rules */}
                        {rule.status === 'OVERLY_BROAD' && rule.traffic.sample_sources && rule.traffic.sample_sources.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {rule.traffic.sample_sources.slice(0, 3).map((ip, idx) => (
                              <code key={idx} className="px-1 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs font-mono">
                                {ip}
                              </code>
                            ))}
                            {rule.traffic.sample_sources.length > 3 && (
                              <span className="text-xs text-slate-500">+{rule.traffic.sample_sources.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500 italic">No traffic</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rule.recommendation.action === 'KEEP'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : rule.recommendation.action === 'DELETE'
                          ? 'bg-red-500/20 text-red-400'
                          : rule.recommendation.action === 'TIGHTEN'
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {rule.recommendation.action}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// =============================================================================
// TAB: EVIDENCE
// =============================================================================

const EvidenceTab: React.FC<{ analysis: SGAnalysis }> = ({ analysis }) => {
  return (
    <div className="space-y-6">
      {/* Data Sources */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Evidence Sources</h3>
        <div className="space-y-3">
          {analysis.evidence.sources.map((source) => (
            <div key={source.name} className="flex items-center gap-3">
              {source.available ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-slate-500" />
              )}
              <div>
                <div className={source.available ? 'text-slate-200' : 'text-slate-500'}>
                  {source.name}
                </div>
                <div className="text-xs text-slate-500">Evidence source</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Observation Period */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Observation Period</h3>
        <div className="flex items-center gap-3">
          <Clock className="w-8 h-8 text-indigo-400" />
          <div>
            <div className="text-2xl font-bold text-slate-200">
              {analysis.evidence.observation_period.days} days
            </div>
            <div className="text-xs text-slate-500">
              From {new Date(analysis.evidence.observation_period.start).toLocaleDateString()} to{' '}
              {new Date(analysis.evidence.observation_period.end).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Confidence</h3>
        <div className="flex items-center gap-4">
          <ConfidenceBadge
            level={analysis.evidence.confidence.level}
            score={analysis.evidence.confidence.score}
          />
          <span className="text-sm text-slate-400">{analysis.evidence.confidence.reason}</span>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// TAB: IMPACT
// =============================================================================

const ImpactTab: React.FC<{ analysis: SGAnalysis }> = ({ analysis }) => {
  return (
    <div className="space-y-6">
      {/* Impact Analysis Summary */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Impact Analysis</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">No service disruption expected</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">All active workflows will continue</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">
              Reduces attack surface by {analysis.gap_percentage}%
            </span>
          </div>
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Achieves least privilege compliance</span>
          </div>
        </div>
      </div>

      {/* What Will Continue Working */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300 mb-4">What Will Continue Working</h3>
        {analysis.recommendations.keep.length > 0 ? (
          <div className="space-y-2">
            {analysis.recommendations.keep.slice(0, 5).map((rule) => (
              <div key={rule.rule_id} className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-300">
                  {rule.protocol}/{rule.port_range} from {rule.source}
                </span>
                <span className="text-slate-500">
                  ({rule.traffic.connection_count.toLocaleString()} connections)
                </span>
              </div>
            ))}
            {analysis.recommendations.keep.length > 5 && (
              <div className="text-xs text-slate-500 mt-2">
                + {analysis.recommendations.keep.length - 5} more rules
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-500">No actively used rules found</div>
        )}
      </div>

      {/* What Will Be Tightened (0.0.0.0/0 with real traffic) */}
      {analysis.recommendations.tighten.length > 0 && (
        <div className="bg-orange-500/5 rounded-xl p-5 border border-orange-500/20">
          <h3 className="text-sm font-medium text-orange-400 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            What Will Be Tightened (Replace 0.0.0.0/0 with observed IPs)
          </h3>
          <div className="space-y-4">
            {analysis.recommendations.tighten.map((rule) => (
              <div key={rule.rule_id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs font-medium">
                      TIGHTEN
                    </span>
                    <span className="text-slate-300 font-medium">
                      {rule.protocol}/{rule.port_range}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {rule.traffic.connection_count.toLocaleString()} connections from {rule.traffic.unique_sources} sources
                  </span>
                </div>

                {/* Current Rule */}
                <div className="mb-3 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                  <div className="text-xs text-red-400 font-medium mb-1">CURRENT (Overly Broad)</div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-red-400" />
                    <code className="text-red-300 font-mono text-sm">{rule.source}</code>
                    <span className="text-slate-500 text-xs">← Open to entire internet</span>
                  </div>
                </div>

                {/* Observed Traffic */}
                {rule.traffic.sample_sources && rule.traffic.sample_sources.length > 0 && (
                  <div className="mb-3 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                    <div className="text-xs text-emerald-400 font-medium mb-2">OBSERVED TRAFFIC FROM</div>
                    <div className="flex flex-wrap gap-2">
                      {rule.traffic.sample_sources.slice(0, 10).map((ip, idx) => (
                        <code key={idx} className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs font-mono">
                          {ip}
                        </code>
                      ))}
                      {rule.traffic.sample_sources.length > 10 && (
                        <span className="px-2 py-1 bg-slate-700 text-slate-400 rounded text-xs">
                          +{rule.traffic.sample_sources.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Recommendation */}
                <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/30">
                  <div className="text-xs text-indigo-400 font-medium mb-1">💡 RECOMMENDATION</div>
                  <div className="text-sm text-slate-300">
                    Replace <code className="text-red-400 font-mono">{rule.source}</code> with specific IPs/CIDRs:
                  </div>
                  {rule.traffic.sample_sources && rule.traffic.sample_sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rule.traffic.sample_sources.slice(0, 5).map((ip, idx) => (
                        <code key={idx} className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-xs font-mono">
                          {ip}/32
                        </code>
                      ))}
                      {rule.traffic.sample_sources.length > 5 && (
                        <span className="text-xs text-slate-500">+{rule.traffic.sample_sources.length - 5} more</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What Will Be Removed */}
      <div className="bg-red-500/5 rounded-xl p-5 border border-red-500/20">
        <h3 className="text-sm font-medium text-red-400 mb-4">What Will Be Removed (No Traffic Observed)</h3>
        {analysis.recommendations.delete.length > 0 ? (
          <div className="space-y-2">
            {analysis.recommendations.delete.map((rule) => (
              <div key={rule.rule_id} className="flex items-center gap-2 text-sm">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-slate-300">
                  {rule.protocol}/{rule.port_range} from {rule.source}
                </span>
                <span className="text-slate-500">(0 connections in {analysis.summary.observation_days}d)</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500">No rules recommended for removal</div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const SGLeastPrivilegeModal: React.FC<SGLeastPrivilegeModalProps> = ({
  sgId,
  sgName,
  systemName,
  isOpen,
  onClose,
  onRemediate,
}) => {
  const [analysis, setAnalysis] = useState<SGAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'rules' | 'evidence' | 'impact'>('summary');
  const [syncing, setSyncing] = useState(false);
  const [orphanStatus, setOrphanStatus] = useState<{
    is_orphan: boolean;
    severity: string;
    message: string;
    attachment_count: number;
  } | null>(null);

  // Fetch orphan status when modal opens
  useEffect(() => {
    const fetchOrphanStatus = async () => {
      if (!isOpen || !sgId) return;
      try {
        const response = await fetch(`/api/proxy/sg-least-privilege/${sgId}/analysis`);
        if (response.ok) {
          const result = await response.json();
          if (result.orphan_status) {
            setOrphanStatus({
              is_orphan: result.orphan_status.is_orphan,
              severity: result.orphan_status.severity,
              message: result.orphan_status.recommendation || 'Orphan Security Group',
              attachment_count: result.orphan_status.attachment_count || 0,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch orphan status:', err);
      }
    };
    fetchOrphanStatus();
  }, [isOpen, sgId]);

  const handleSyncFlowLogs = async () => {
    setSyncing(true);
    try {
      const response = await fetch(`/api/proxy/sg-least-privilege/sync-flow-logs?days=30`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('[SG-LP] Flow logs synced:', data);

      // Refresh analysis after sync
      await fetchAnalysis();

      alert(`Flow logs synced! ${data.security_groups_processed || 0} Security Groups updated.`);
    } catch (err: any) {
      console.error('Sync error:', err);
      alert(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Use proxy endpoint
      const response = await fetch(`/api/proxy/sg-least-privilege/${sgId}/analysis?days=365`);

      if (!response.ok) {
        throw new Error(`Failed to fetch analysis: ${response.status}`);
      }

      const data = await response.json();
      setAnalysis(data);
    } catch (err: any) {
      console.error('Analysis fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sgId]);

  useEffect(() => {
    if (isOpen && sgId) {
      fetchAnalysis();
    }
  }, [isOpen, sgId, fetchAnalysis]);

  const handleSimulate = async () => {
    if (!analysis) return;

    const rulesToRemediate = analysis.recommendations.delete;
    if (rulesToRemediate.length === 0) {
      alert('No rules to remediate');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/proxy/sg-least-privilege/${sgId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: rulesToRemediate.map(r => ({
            rule_id: r.rule_id,
            direction: r.direction,
            protocol: r.protocol.toLowerCase(),
            from_port: r.from_port,
            to_port: r.to_port,
            source: r.source,
            action: 'DELETE'
          })),
          create_snapshot: true,
          dry_run: true
        })
      });

      if (!response.ok) {
        throw new Error(`Simulation failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('Simulation result:', result);

      // Show simulation results
      const safetyStatus = result.safety?.is_safe ? '✅ SAFE' : '⚠️ WARNING';
      const warnings = result.safety?.warnings?.join('\n') || 'None';
      const commands = result.cli_commands?.join('\n') || 'No commands';

      alert(`${safetyStatus} to apply\n\nRules to remove: ${result.summary?.rules_to_change || 0}\n\nWarnings:\n${warnings}\n\nCLI Commands:\n${commands}`);
    } catch (err: any) {
      console.error('Simulation error:', err);
      alert(`Simulation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFix = async () => {
    if (!analysis) return;

    const rulesToRemediate = analysis.recommendations.delete;
    if (rulesToRemediate.length === 0) {
      alert('No rules to remediate');
      return;
    }

    if (!confirm(`Are you sure you want to remove ${rulesToRemediate.length} unused rules from ${analysis.sg_name}?\n\nThis will create a snapshot for rollback.`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/proxy/sg-least-privilege/${sgId}/remediate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: rulesToRemediate.map(r => ({
            rule_id: r.rule_id,
            direction: r.direction,
            protocol: r.protocol.toLowerCase(),
            from_port: r.from_port,
            to_port: r.to_port,
            source: r.source,
            action: 'DELETE'
          })),
          create_snapshot: true,
          dry_run: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || `Remediation failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('Remediation result:', result);

      alert(`✅ Remediation successful!\n\nRules removed: ${result.summary?.rules_removed || 0}\nSnapshot ID: ${result.snapshot_id || 'N/A'}`);

      // Refresh analysis and notify parent
      await fetchAnalysis();
      onRemediate?.(sgId, rulesToRemediate);
    } catch (err: any) {
      console.error('Remediation error:', err);
      alert(`❌ Remediation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExportTerraform = () => {
    if (!analysis) return;

    const terraformConfig = `# Terraform configuration for ${analysis.sg_name}
# Generated by Cyntro LP Engine

resource "aws_security_group_rule" "least_privilege" {
  # Rules to KEEP (observed traffic):
${analysis.recommendations.keep
  .map(
    (r) => `  # ${r.protocol}/${r.port_range} from ${r.source} - ${r.traffic.connection_count} connections`
  )
  .join('\n')}

  # Rules to DELETE (no observed traffic):
${analysis.recommendations.delete.map((r) => `  # REMOVE: ${r.protocol}/${r.port_range} from ${r.source}`).join('\n')}
}
`;

    const blob = new Blob([terraformConfig], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${analysis.sg_id}-least-privilege.tf`;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-slate-900 border border-slate-700/50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              {sgName || sgId}
            </h2>
            <p className="text-sm text-slate-400">
              SecurityGroup • {systemName || 'Unknown System'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncFlowLogs}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:opacity-50 rounded-lg transition-colors"
              title="Sync VPC Flow Logs to correlate traffic with Security Groups"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Flow Logs'}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <XCircle className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700/50">
          {[
            { id: 'summary', label: 'Summary', icon: Activity },
            { id: 'rules', label: 'Rules', icon: Shield },
            { id: 'evidence', label: 'Evidence', icon: Database },
            { id: 'impact', label: 'Impact', icon: AlertTriangle },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-indigo-400 border-b-2 border-indigo-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Orphan Warning Banner */}
        {orphanStatus?.is_orphan && (
          <div
            className={`mx-6 mt-4 p-4 rounded-lg border-2 flex items-start gap-3 ${
              orphanStatus.severity === 'CRITICAL'
                ? 'bg-red-500/20 border-red-500'
                : 'bg-amber-500/20 border-amber-500'
            }`}
          >
            <AlertTriangle
              className={`w-6 h-6 flex-shrink-0 ${
                orphanStatus.severity === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'
              }`}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold text-white ${
                    orphanStatus.severity === 'CRITICAL' ? 'bg-red-600' : 'bg-amber-600'
                  }`}
                >
                  {orphanStatus.severity} - ORPHAN SG
                </span>
              </div>
              <p
                className={`font-medium ${
                  orphanStatus.severity === 'CRITICAL' ? 'text-red-300' : 'text-amber-300'
                }`}
              >
                {orphanStatus.message}
              </p>
              <p
                className={`text-sm mt-1 ${
                  orphanStatus.severity === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'
                }`}
              >
                This Security Group has {orphanStatus.attachment_count} attachments.
                {orphanStatus.severity === 'CRITICAL'
                  ? ' It has public ingress rules and poses a security risk.'
                  : ' Consider deleting it to reduce your attack surface.'}
              </p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
              <span className="ml-3 text-slate-400">Analyzing security group...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-400">{error}</p>
              <button
                onClick={fetchAnalysis}
                className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
              >
                Retry
              </button>
            </div>
          ) : analysis ? (
            <>
              {activeTab === 'summary' && <SummaryTab analysis={analysis} />}
              {activeTab === 'rules' && <RulesTab analysis={analysis} />}
              {activeTab === 'evidence' && <EvidenceTab analysis={analysis} />}
              {activeTab === 'impact' && <ImpactTab analysis={analysis} />}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/50 bg-slate-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleSimulate}
              disabled={!analysis || analysis.recommendations.delete.length === 0 || loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Play className="w-4 h-4" />
              Simulate
            </button>
            <button
              onClick={handleApplyFix}
              disabled={!analysis || analysis.recommendations.delete.length === 0 || loading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              {loading ? 'Applying...' : 'Apply Fix Now'}
            </button>
            <button
              onClick={handleExportTerraform}
              disabled={!analysis}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Terraform
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SGLeastPrivilegeModal;
