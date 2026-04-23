'use client';

/**
 * Security Group Least Privilege Modal
 * =====================================
 *
 * Single-scroll, two-phase UI matching the IAM permission analysis modal:
 * Phase 1: Initial analysis with rule breakdown by status
 * Phase 2: Simulation results with selectable rules for remediation
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  X,
  Clock,
  Globe,
  Lock,
  Activity,
  RefreshCw,
  Download,
  Loader2,
  Calendar,
  Check,
  CheckSquare,
  Server,
  Cloud,
  Database,
  Cpu,
  Network,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ConfidenceExplanationPanel } from '@/components/ConfidenceExplanationPanel';
import type { ConfidenceScore } from '@/lib/types';

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

interface RuleProtection {
  tier: 'never_remove' | 'warn';
  category: string;
  explanation: string;
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
  protection?: RuleProtection;
  tighten?: {
    replacement_sources: string[];
    source_count?: number;
    uses_ranges?: boolean;
    is_internal?: boolean;
    cidr_confidence?: string;
    review_reason?: string;
  };
}

interface AttachedResource {
  resource_id: string;
  resource_name: string;
  resource_type: string;
}

function getResourceTypeStyle(type: string): { color: string; bg: string; label: string; Icon: React.FC<any> } {
  switch (type) {
    case 'EC2Instance':
      return { color: '#f97316', bg: '#f9731612', label: 'EC2', Icon: Server };
    case 'Lambda':
      return { color: '#a855f7', bg: '#a855f712', label: 'Lambda', Icon: Cloud };
    case 'LoadBalancer':
      return { color: '#ec4899', bg: '#ec489912', label: 'ALB/NLB', Icon: Activity };
    case 'VPCEndpoint':
      return { color: '#a78bfa', bg: '#a78bfa12', label: 'VPC Endpoint', Icon: Network };
    case 'RDS':
      return { color: '#3b82f6', bg: '#3b82f612', label: 'RDS', Icon: Database };
    case 'ECS':
      return { color: '#f97316', bg: '#f9731612', label: 'ECS', Icon: Cpu };
    case 'NATGateway':
      return { color: '#14b8a6', bg: '#14b8a612', label: 'NAT GW', Icon: Network };
    case 'EFS':
      return { color: '#84cc16', bg: '#84cc1612', label: 'EFS', Icon: Database };
    case 'ElastiCache':
      return { color: '#f43f5e', bg: '#f43f5e12', label: 'ElastiCache', Icon: Database };
    case 'Redshift':
      return { color: '#7c3aed', bg: '#7c3aed12', label: 'Redshift', Icon: Database };
    case 'CodeBuild':
      return { color: '#0ea5e9', bg: '#0ea5e912', label: 'CodeBuild', Icon: Cpu };
    default:
      return { color: '#6b7280', bg: '#6b728012', label: 'ENI', Icon: Network };
  }
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
  attached_resources?: AttachedResource[];
  summary: {
    total_rules: number;
    used_rules: number;
    unused_rules: number;
    overly_broad_rules: number;
    public_rules: number;
    observation_days: number;
    protected_rules?: number;
    warn_rules?: number;
  };
  evidence: Evidence;
  rules: RuleAnalysis[];
  recommendations: {
    protected: RuleAnalysis[];
    warn: RuleAnalysis[];
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
  onRemediate?: (sgId: string, rules: RuleAnalysis[], result?: { snapshotId?: string; eventId?: string; rollbackAvailable?: boolean }) => void;
}

// =============================================================================
// HELPER: Rule display line
// =============================================================================

const RuleDisplay: React.FC<{
  rule: RuleAnalysis;
  checkbox?: boolean;
  checked?: boolean;
  disabled?: boolean;
  onChange?: () => void;
  showStatus?: boolean;
}> = ({ rule, checkbox, checked, disabled, onChange, showStatus = true }) => (
  <div
    className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
      disabled ? 'opacity-60' : checkbox && checked ? 'bg-[#ef444410]' : checkbox ? 'hover:bg-gray-50 cursor-pointer' : ''
    }`}
    onClick={() => { if (checkbox && !disabled && onChange) onChange(); }}
  >
    {checkbox && (
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => { if (!disabled && onChange) onChange(); }}
        className="w-4 h-4 rounded border-[var(--border,#d1d5db)] disabled:opacity-40"
      />
    )}
    <span className="font-mono text-sm font-medium" style={{ color: "var(--foreground, #111827)" }}>
      {rule.protocol}/{rule.port_range}
    </span>
    <span className="text-sm" style={{ color: "var(--muted-foreground, #6b7280)" }}>←</span>
    <span className={`text-sm flex items-center gap-1 ${rule.is_public ? 'text-[#ef4444]' : ''}`} style={rule.is_public ? {} : { color: "var(--foreground, #374151)" }}>
      {rule.is_public ? <Globe className="w-3 h-3" /> : rule.source_type === 'security_group' ? <Shield className="w-3 h-3 text-[#3b82f6]" /> : null}
      {rule.source}
    </span>
    {rule.port_name && (
      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--background, #f3f4f6)", color: "var(--muted-foreground, #6b7280)" }}>
        {rule.port_name}
      </span>
    )}
    {rule.is_public && (
      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#ef444415] text-[#ef4444]">PUBLIC</span>
    )}
    {showStatus && (
      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
        rule.status === 'USED' ? 'bg-[#22c55e15] text-[#22c55e]' :
        rule.status === 'OVERLY_BROAD' ? 'bg-[#f9731615] text-[#f97316]' :
        rule.status === 'UNUSED' ? 'bg-[#ef444415] text-[#ef4444]' :
        'bg-gray-100 text-[var(--muted-foreground,#6b7280)]'
      }`}>
        {rule.status === 'OVERLY_BROAD' ? 'OVERLY BROAD' : rule.status}
      </span>
    )}
  </div>
);

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
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<SGAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const [analysisTab, setAnalysisTab] = useState<'summary' | 'rules' | 'context'>('summary');
  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [createSnapshot, setCreateSnapshot] = useState(true);
  const [selectedRulesToRemediate, setSelectedRulesToRemediate] = useState<Set<string>>(new Set());
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [orphanStatus, setOrphanStatus] = useState<{
    is_orphan: boolean;
    severity: string;
    message: string;
    attachment_count: number;
  } | null>(null);
  const [confidenceScore, setConfidenceScore] = useState<ConfidenceScore | null>(null);
  const [confidenceLoading, setConfidenceLoading] = useState(false);

  // Fetch Agent 5 confidence score when modal opens
  useEffect(() => {
    if (!isOpen || !sgId) return;
    const fetchConfidenceScore = async () => {
      setConfidenceLoading(true);
      setConfidenceScore(null);
      try {
        const res = await fetch('/api/proxy/confidence/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resource_type: 'security_group',
            resource_id: sgId,
            changes: [],
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data?.confidence === 'number') {
          setConfidenceScore(data as ConfidenceScore);
        }
      } catch (e) {
        console.warn('[SG-Modal] confidence fetch failed:', e);
      } finally {
        setConfidenceLoading(false);
      }
    };
    fetchConfidenceScore();
  }, [isOpen, sgId]);

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

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/proxy/sg-least-privilege/${sgId}/analysis?days=365`);
      if (!response.ok) {
        throw new Error(`Failed to fetch analysis: ${response.status}`);
      }
      const data = await response.json();
      setAnalysis(data);

      // Initialize selected rules: all DELETE + TIGHTEN rules selected by default
      const remediatable = [
        ...(data.recommendations?.delete || []),
        ...(data.recommendations?.tighten || []),
      ];
      setSelectedRulesToRemediate(new Set(remediatable.map((r: RuleAnalysis) => r.rule_id)));
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

  const getReplacementSources = (rule: RuleAnalysis) => {
    if (rule.tighten?.replacement_sources?.length) {
      return rule.tighten.replacement_sources;
    }
    if (rule.traffic?.sample_sources?.length) {
      return rule.traffic.sample_sources
        .filter(Boolean)
        .map((ip) => (ip.includes('/') ? ip : `${ip}/32`));
    }
    return [];
  };

  const handleSyncFlowLogs = async () => {
    setSyncing(true);
    try {
      const response = await fetch(`/api/proxy/sg-least-privilege/sync-flow-logs?days=30`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
      const data = await response.json();
      console.log('[SG-LP] Flow logs synced:', data);
      await fetchAnalysis();
    } catch (err: any) {
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleSimulate = async () => {
    if (!analysis) return;
    setSimulating(true);
    let simulationSucceeded = false;

    try {
      // Create pre-simulation snapshot
      console.log('[SG-LP] Creating pre-simulation snapshot...');
      const snapshotResponse = await fetch(`/api/proxy/sg-least-privilege/${sgId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (snapshotResponse.ok) {
        const snapshotResult = await snapshotResponse.json();
        setSnapshotId(snapshotResult.snapshot_id);
        console.log('[SG-LP] Snapshot created:', snapshotResult.snapshot_id);
      }

      // Run simulation
      const rulesToSimulate = [
        ...analysis.recommendations.delete.map(r => ({
          rule_id: r.rule_id, direction: r.direction, protocol: r.protocol.toLowerCase(),
          from_port: r.from_port, to_port: r.to_port, source: r.source, action: 'DELETE' as const,
        })),
        ...analysis.recommendations.tighten.map(r => ({
          rule_id: r.rule_id, direction: r.direction, protocol: r.protocol.toLowerCase(),
          from_port: r.from_port, to_port: r.to_port, source: r.source, action: 'TIGHTEN' as const,
          replacement_sources: getReplacementSources(r),
        })),
      ];

      const response = await fetch(`/api/proxy/sg-least-privilege/${sgId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: rulesToSimulate, create_snapshot: true, dry_run: true }),
      });

      if (!response.ok) throw new Error(`Simulation failed: ${response.status}`);
      const result = await response.json();
      console.log('[SG-LP] Simulation result:', result);
      simulationSucceeded = true;
    } catch (err: any) {
      console.error('Simulation error:', err);
      toast({
        title: 'Simulation Failed',
        description: err.message || 'Could not simulate this SG remediation.',
        variant: 'destructive',
      });
    } finally {
      setSimulating(false);
      if (simulationSucceeded) {
        setShowSimulation(true);
      }
    }
  };

  const handleApplyFix = async () => {
    if (!analysis) return;
    setApplying(true);

    try {
      // Build rules from selected set
      const allRemediatable = [
        ...analysis.recommendations.delete,
        ...analysis.recommendations.tighten,
      ];
      const selectedRules = allRemediatable.filter(r => selectedRulesToRemediate.has(r.rule_id));

      console.log(`[SG-Remediate] Applying fix: ${selectedRules.length} rules on ${analysis.sg_name}`);

      const response = await fetch(`/api/proxy/sg-least-privilege/${sgId}/remediate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: selectedRules.map(r => ({
            rule_id: r.rule_id,
            direction: r.direction,
            protocol: r.protocol.toLowerCase(),
            from_port: r.from_port,
            to_port: r.to_port,
            source: r.source,
            action: r.status === 'OVERLY_BROAD' ? 'TIGHTEN' : 'DELETE',
            replacement_sources: r.status === 'OVERLY_BROAD' ? getReplacementSources(r) : undefined,
          })),
          create_snapshot: createSnapshot,
          dry_run: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || `Remediation failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('[SG-Remediate] Success:', result);

      if (!result.success) {
        throw new Error(result.message || result.block_reason || 'Security Group remediation did not complete.');
      }

      await fetchAnalysis();
      onRemediate?.(sgId, selectedRules, {
        snapshotId: result.snapshot_id || null,
        eventId: result.timeline_event_id || null,
        rollbackAvailable: !!(result.snapshot_id || result.rollback?.available),
      });
      toast({
        title: 'Security Group Updated',
        description: `Applied ${result.summary?.rules_removed || 0} removals and ${result.summary?.rules_tightened || 0} tightenings.${result.snapshot_id ? ` Snapshot: ${result.snapshot_id}` : ''}`,
      });
      handleClose();
    } catch (err: any) {
      console.error('Remediation error:', err);
      toast({
        title: 'Remediation Failed',
        description: err.message || 'Could not apply the selected security group changes.',
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const handleExportTerraform = () => {
    if (!analysis) return;
    const terraformConfig = `# Terraform configuration for ${analysis.sg_name}
# Generated by Cyntro LP Engine

resource "aws_security_group_rule" "least_privilege" {
  # Rules to KEEP (observed traffic):
${analysis.recommendations.keep
  .map(r => `  # ${r.protocol}/${r.port_range} from ${r.source} - ${r.traffic.connection_count} connections`)
  .join('\n')}

  # Rules to DELETE (no observed traffic):
${analysis.recommendations.delete.map(r => `  # REMOVE: ${r.protocol}/${r.port_range} from ${r.source}`).join('\n')}
}
`;
    const blob = new Blob([terraformConfig], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${analysis.sg_id}-least-privilege.tf`;
    a.click();
  };

  const handleClose = () => {
    setShowSimulation(false);
    setAnalysisTab('summary');
    setAnalysis(null);
    setError(null);
    setSnapshotId(null);
    onClose();
  };

  // Toggle rule selection
  const toggleRuleSelection = (ruleId: string) => {
    setSelectedRulesToRemediate(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ruleId)) newSet.delete(ruleId);
      else newSet.add(ruleId);
      return newSet;
    });
  };

  // Select/deselect helpers
  const selectAllRules = () => {
    if (!analysis) return;
    const all = [...analysis.recommendations.delete, ...analysis.recommendations.tighten];
    setSelectedRulesToRemediate(new Set(all.map(r => r.rule_id)));
  };
  const deselectAllRules = () => setSelectedRulesToRemediate(new Set());

  const selectGroup = (rules: RuleAnalysis[]) => {
    const newSet = new Set(selectedRulesToRemediate);
    const allSelected = rules.every(r => newSet.has(r.rule_id));
    rules.forEach(r => allSelected ? newSet.delete(r.rule_id) : newSet.add(r.rule_id));
    setSelectedRulesToRemediate(newSet);
  };

  if (!isOpen) return null;

  // Derived values
  const totalRules = analysis?.summary?.total_rules ?? 0;
  const usedRules = analysis?.summary?.used_rules ?? 0;
  const unusedRules = analysis?.summary?.unused_rules ?? 0;
  const overlyBroadRules = analysis?.summary?.overly_broad_rules ?? 0;
  const toRemediate = unusedRules + overlyBroadRules;
  const observationDays = analysis?.summary?.observation_days ?? 365;
  const remediatePercent = totalRules > 0 ? Math.round((toRemediate / totalRules) * 100) : 0;
  const usedPercent = totalRules > 0 ? Math.round((usedRules / totalRules) * 100) : 0;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - observationDays);
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Safety score
  const calculateSafetyScore = () => {
    if (!analysis) return 95;
    const confidence = analysis.evidence?.confidence?.score ?? 80;
    let score = confidence;
    if (analysis.evidence?.confidence?.level === 'NONE') score = 30;
    else if (analysis.evidence?.confidence?.level === 'LOW') score = 45;
    if (orphanStatus?.is_orphan) score = Math.max(10, score - 10);
    return Math.max(5, Math.min(100, score));
  };
  const legacySafetyScore = calculateSafetyScore();

  // One-score rule: Agent 5 confidence overrides the legacy client-side calc
  // when available. Keeps legacy fallback for load + failure states.
  const safetyScore = confidenceScore?.confidence ?? legacySafetyScore;

  // Verdict bucket — derive from Agent 5 routing when present, else from
  // legacy score thresholds to preserve existing UX for pre-Agent-5 paths.
  const verdictBucket: 'blocked' | 'manual_review' | 'human_approval' | 'auto_execute' =
    confidenceScore?.routing
      ?? (safetyScore < 50 ? 'manual_review'
        : safetyScore < 75 ? 'human_approval'
          : 'auto_execute');

  const protectedRules = analysis?.recommendations?.protected?.length ?? 0;
  const cautionRules = analysis?.recommendations?.warn?.length ?? 0;
  const connectedResourcesCount = analysis?.attached_resources?.length ?? 0;

  // Loading state
  if (loading && !analysis) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
        <div className="relative w-[600px] rounded-2xl shadow-2xl p-8 text-center" style={{ background: "var(--card, #ffffff)" }}>
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: "#8b5cf6" }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--foreground, #111827)" }}>Analyzing Security Group</h2>
          <p style={{ color: "var(--muted-foreground, #6b7280)" }}>
            Analyzing traffic data for <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{sgName || sgId}</span>...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
        <div className="relative w-[600px] rounded-2xl shadow-2xl p-8 text-center" style={{ background: "var(--card, #ffffff)" }}>
          <XCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#ef4444" }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--foreground, #111827)" }}>Failed to Load Data</h2>
          <p className="mb-4" style={{ color: "var(--muted-foreground, #6b7280)" }}>{error}</p>
          <div className="flex justify-center gap-3">
            <button onClick={fetchAnalysis} className="px-4 py-2 text-white rounded-lg font-medium hover:opacity-90" style={{ background: "#8b5cf6" }}>
              <RefreshCw className="w-4 h-4 inline mr-2" />
              Retry
            </button>
            <button onClick={handleClose} className="px-4 py-2 border border-[var(--border,#d1d5db)] text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-50">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Simulating state
  if (simulating) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative w-[700px] rounded-2xl shadow-2xl p-8" style={{ background: "var(--card, #ffffff)" }}>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--foreground, #111827)" }}>Simulating Rule Changes</h2>
          <p className="text-lg mb-6">
            <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{sgName || sgId}</span>
            <span style={{ color: "var(--muted-foreground, #6b7280)" }}> - Analyzing {observationDays} days of traffic data...</span>
          </p>
          <div className="space-y-4">
            {[
              { title: "Loading traffic history...", subtitle: `Analyzing VPC Flow Log data`, done: true },
              { title: "Identifying unused rules...", subtitle: `Found ${unusedRules} unused rules`, done: true },
              { title: "Checking overly broad rules...", subtitle: `Found ${overlyBroadRules} rules to tighten`, done: true },
              { title: "Calculating safety score...", subtitle: `${safetyScore}% confidence`, done: false },
            ].map((step, i) => (
              <div key={i} className={`flex items-start gap-4 p-4 rounded-lg ${step.done ? '' : 'ring-2'}`}>
                <div className="text-2xl">{step.done ? '✅' : '⏳'}</div>
                <div>
                  <div className="font-semibold" style={{ color: "var(--foreground, #111827)" }}>{step.title}</div>
                  <div className="text-sm" style={{ color: "var(--muted-foreground, #6b7280)" }}>{step.subtitle}</div>
                  {!step.done && (
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--background, #f8f9fa)" }}>
                      <div className="h-full bg-[#8b5cf6] rounded-full animate-pulse" style={{ width: '70%' }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // PHASE 2: Simulation Results View
  // =========================================================================
  if (showSimulation && analysis) {
    const deleteRules = analysis.recommendations.delete;
    const tightenRules = analysis.recommendations.tighten;
    const keepRules = analysis.recommendations.keep;
    const selectedCount = selectedRulesToRemediate.size;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
        <div className="relative w-[900px] max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4" style={{ background: "var(--card, #ffffff)" }}>
          {/* Header */}
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ background: "var(--background, #f8f9fa)", borderColor: "var(--border, #e5e7eb)" }}>
            <div>
              <h2 className="text-2xl font-bold" style={{ color: "var(--foreground, #111827)" }}>Simulation Results</h2>
              <p className="text-lg">
                <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{sgName || sgId}</span>
                <span style={{ color: "var(--muted-foreground, #6b7280)" }}> - Rule Removal Analysis</span>
              </p>
            </div>
            <button onClick={handleClose} style={{ color: "var(--muted-foreground, #6b7280)" }}>
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Safety Score Banner — single source via Agent 5 when available */}
            {(() => {
              const suffix = confidenceScore ? '' : '%';

              if (verdictBucket === 'blocked') {
                return (
                  <div className="p-6 bg-white border-2 border-red-400 rounded-2xl text-center">
                    <div className="flex items-center justify-center gap-3">
                      <XCircle className="w-10 h-10 text-[#ef4444]" />
                      <span className="text-5xl font-bold text-[#ef4444]">{safetyScore}{suffix}</span>
                      <span className="text-2xl font-bold text-[#ef4444]">BLOCKED</span>
                    </div>
                    <p className="text-[#ef4444] mt-2 font-semibold">
                      {confidenceScore?.gates_failed?.[0]?.detail ?? 'Hard block — see confidence panel below for gate details.'}
                    </p>
                  </div>
                );
              }
              if (verdictBucket === 'manual_review') {
                return (
                  <div className="p-6 bg-white border-2 border-[#f9731680] rounded-2xl text-center">
                    <div className="flex items-center justify-center gap-3">
                      <AlertTriangle className="w-10 h-10 text-[#f97316]" />
                      <span className="text-5xl font-bold text-[#f97316]">{safetyScore}{suffix}</span>
                      <span className="text-2xl font-bold text-[#f97316]">{confidenceScore ? 'REVIEW REQUIRED' : 'LOW CONFIDENCE'}</span>
                    </div>
                    <p className="text-[#f97316] mt-2 font-semibold">
                      Insufficient traffic data — review rules individually before applying.
                    </p>
                  </div>
                );
              }
              if (verdictBucket === 'human_approval') {
                return (
                  <div className="p-6 bg-white border-2 border-[#f9731640] rounded-2xl text-center">
                    <div className="flex items-center justify-center gap-3">
                      <AlertTriangle className="w-10 h-10 text-[#f97316]" />
                      <span className="text-5xl font-bold text-[#f97316]">{safetyScore}{suffix}</span>
                      <span className="text-2xl font-bold text-[#f97316]">{confidenceScore ? 'NEEDS APPROVAL' : 'REVIEW RECOMMENDED'}</span>
                    </div>
                    <p className="text-[#f97316] mt-2">
                      Some rules need verification — review before applying.
                    </p>
                  </div>
                );
              }
              return (
                <div className="p-6 bg-white border-2 border-[#22c55e40] rounded-2xl text-center">
                  <div className="flex items-center justify-center gap-3">
                    <CheckSquare className="w-10 h-10 text-[#22c55e]" />
                    <span className="text-5xl font-bold text-[#22c55e]">{safetyScore}{suffix}</span>
                    <span className="text-2xl font-bold text-[#22c55e]">SAFE TO APPLY</span>
                  </div>
                  <p className="text-[#22c55e] mt-2">
                    {confidenceScore
                      ? 'Confidence ≥ 95, AI reviewer agrees — no service disruption expected.'
                      : `${observationDays} days of traffic data analyzed — No service disruption expected`}
                  </p>
                </div>
              );
            })()}

            <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: "#faf5ff", borderColor: "#ddd6fe", color: "#6d28d9" }}>
              A rollback snapshot is created before execution, and the completed change is tracked in Remediation History for restore.
            </div>

            {/* What Will Change */}
            <div>
              <h3 className="font-bold text-lg mb-3" style={{ color: "var(--foreground, #111827)" }}>What Will Change:</h3>
              <div className="space-y-2">
                {deleteRules.length > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--background, #f8f9fa)" }}>
                    <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                    <span>Remove <strong>{deleteRules.filter(r => selectedRulesToRemediate.has(r.rule_id)).length}</strong> unused rules</span>
                  </div>
                )}
                {tightenRules.length > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--background, #f8f9fa)" }}>
                    <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                    <span>Tighten <strong>{tightenRules.filter(r => selectedRulesToRemediate.has(r.rule_id)).length}</strong> overly broad rules (replace 0.0.0.0/0 with observed IPs)</span>
                  </div>
                )}
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--background, #f8f9fa)" }}>
                  <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                  <span>Reduce attack surface by <strong>{remediatePercent}%</strong> ({totalRules} → {usedRules} rules)</span>
                </div>
              </div>
            </div>

            {/* Rules to Remediate */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-lg" style={{ color: "var(--foreground, #111827)" }}>
                  Rules to Remediate ({selectedCount} of {toRemediate} selected)
                </h3>
                <div className="flex gap-2 text-xs">
                  <button onClick={selectAllRules} className="text-[#8b5cf6] hover:underline font-medium">Select All</button>
                  <span style={{ color: "var(--muted-foreground, #9ca3af)" }}>|</span>
                  <button onClick={deselectAllRules} className="text-[#8b5cf6] hover:underline font-medium">Clear All</button>
                </div>
              </div>

              {/* Breakdown summary bar */}
              <div className="mb-3 p-3 rounded-lg flex items-center gap-4 text-xs" style={{ background: "var(--background, #f8f9fa)" }}>
                <span style={{ color: "var(--muted-foreground, #6b7280)" }}>Breakdown:</span>
                {deleteRules.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                    <strong className="text-[#ef4444]">{deleteRules.length}</strong>
                    <span style={{ color: "var(--muted-foreground, #6b7280)" }}>to delete</span>
                  </span>
                )}
                {tightenRules.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#f97316]" />
                    <strong className="text-[#f97316]">{tightenRules.length}</strong>
                    <span style={{ color: "var(--muted-foreground, #6b7280)" }}>to tighten</span>
                  </span>
                )}
                {keepRules.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                    <strong className="text-[#22c55e]">{keepRules.length}</strong>
                    <span style={{ color: "var(--muted-foreground, #6b7280)" }}>to keep</span>
                  </span>
                )}
                {(analysis.recommendations.warn?.length ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#eab308]" />
                    <strong className="text-[#eab308]">{analysis.recommendations.warn.length}</strong>
                    <span style={{ color: "var(--muted-foreground, #6b7280)" }}>caution</span>
                  </span>
                )}
                {(analysis.recommendations.protected?.length ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3 text-[#6b7280]" />
                    <strong className="text-[#6b7280]">{analysis.recommendations.protected.length}</strong>
                    <span style={{ color: "var(--muted-foreground, #6b7280)" }}>protected</span>
                  </span>
                )}
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {/* DELETE group */}
                {deleteRules.length > 0 && (
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#fecaca' }}>
                    <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#fef2f2' }}>
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-[#ef4444]" />
                        <span className="font-semibold text-sm" style={{ color: "var(--foreground, #111827)" }}>
                          Rules to Delete ({deleteRules.length})
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#ef444420] text-[#ef4444]">UNUSED</span>
                      </div>
                      <button
                        onClick={() => selectGroup(deleteRules)}
                        className="text-xs font-medium px-2 py-0.5 rounded text-[#ef4444]"
                      >
                        {deleteRules.every(r => selectedRulesToRemediate.has(r.rule_id)) ? 'Deselect group' : 'Select group'}
                      </button>
                    </div>
                    <div className="px-4 py-1.5 text-xs border-b" style={{ color: "var(--muted-foreground, #6b7280)", borderColor: '#fecaca', background: '#fef2f280' }}>
                      No traffic observed in {observationDays} days — safe to remove
                    </div>
                    <div className="p-2 space-y-1" style={{ background: "var(--card, #ffffff)" }}>
                      {deleteRules.map(rule => (
                        <RuleDisplay
                          key={rule.rule_id}
                          rule={rule}
                          checkbox
                          checked={selectedRulesToRemediate.has(rule.rule_id)}
                          onChange={() => toggleRuleSelection(rule.rule_id)}
                          showStatus={false}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* TIGHTEN group */}
                {tightenRules.length > 0 && (
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#fed7aa' }}>
                    <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#fff7ed' }}>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#f97316]" />
                        <span className="font-semibold text-sm" style={{ color: "var(--foreground, #111827)" }}>
                          Rules to Tighten ({tightenRules.length})
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#f9731620] text-[#f97316]">OVERLY BROAD</span>
                      </div>
                      <button
                        onClick={() => selectGroup(tightenRules)}
                        className="text-xs font-medium px-2 py-0.5 rounded text-[#f97316]"
                      >
                        {tightenRules.every(r => selectedRulesToRemediate.has(r.rule_id)) ? 'Deselect group' : 'Select group'}
                      </button>
                    </div>
                    <div className="px-4 py-1.5 text-xs border-b" style={{ color: "var(--muted-foreground, #6b7280)", borderColor: '#fed7aa', background: '#fff7ed80' }}>
                      Replace 0.0.0.0/0 with observed source IPs
                    </div>
                    <div className="p-2 space-y-1" style={{ background: "var(--card, #ffffff)" }}>
                      {tightenRules.map(rule => (
                        <div key={rule.rule_id}>
                          <RuleDisplay
                            rule={rule}
                            checkbox
                            checked={selectedRulesToRemediate.has(rule.rule_id)}
                            onChange={() => toggleRuleSelection(rule.rule_id)}
                            showStatus={false}
                          />
                          {rule.traffic.sample_sources && rule.traffic.sample_sources.length > 0 && (
                            <div className="ml-10 mb-2 flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                              <span className="text-[#ef4444]">{rule.source}</span>
                              <span>→</span>
                              <div className="flex flex-wrap gap-1">
                                {rule.traffic.sample_sources.slice(0, 5).map((ip, idx) => (
                                  <code key={idx} className="px-1.5 py-0.5 bg-[#22c55e10] text-[#22c55e] rounded text-xs font-mono border border-[#22c55e30]">
                                    {ip}/32
                                  </code>
                                ))}
                                {rule.traffic.sample_sources.length > 5 && (
                                  <span className="text-xs" style={{ color: "var(--muted-foreground, #9ca3af)" }}>+{rule.traffic.sample_sources.length - 5} more</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* KEEP group */}
                {keepRules.length > 0 && (
                  <div className="rounded-xl border overflow-hidden opacity-75" style={{ borderColor: '#bbf7d0' }}>
                    <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#f0fdf4' }}>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-[#22c55e]" />
                        <span className="font-semibold text-sm" style={{ color: "var(--foreground, #111827)" }}>
                          Rules to Keep ({keepRules.length})
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#22c55e20] text-[#22c55e]">USED</span>
                      </div>
                    </div>
                    <div className="px-4 py-1.5 text-xs border-b" style={{ color: "var(--muted-foreground, #6b7280)", borderColor: '#bbf7d0', background: '#f0fdf480' }}>
                      Active traffic observed — these rules will not be modified
                    </div>
                    <div className="p-2 space-y-1" style={{ background: "var(--card, #ffffff)" }}>
                      {keepRules.map(rule => (
                        <RuleDisplay key={rule.rule_id} rule={rule} showStatus={false} />
                      ))}
                    </div>
                  </div>
                )}

                {/* WARN group — selectable with caution */}
                {(analysis.recommendations.warn?.length ?? 0) > 0 && (
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#fde68a' }}>
                    <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#fefce8' }}>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#eab308]" />
                        <span className="font-semibold text-sm" style={{ color: "var(--foreground, #111827)" }}>
                          Review Before Removing ({analysis.recommendations.warn.length})
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#eab30820] text-[#eab308]">CAUTION</span>
                      </div>
                      <button
                        onClick={() => {
                          const warnRules = analysis.recommendations.warn || [];
                          const allSelected = warnRules.every(r => selectedRulesToRemediate.has(r.rule_id));
                          const newSet = new Set(selectedRulesToRemediate);
                          warnRules.forEach(r => allSelected ? newSet.delete(r.rule_id) : newSet.add(r.rule_id));
                          setSelectedRulesToRemediate(newSet);
                        }}
                        className="text-xs font-medium px-2 py-0.5 rounded text-[#eab308]"
                      >
                        {(analysis.recommendations.warn || []).every(r => selectedRulesToRemediate.has(r.rule_id)) ? 'Deselect group' : 'Select group'}
                      </button>
                    </div>
                    <div className="px-4 py-1.5 text-xs border-b" style={{ color: '#a16207', borderColor: '#fde68a', background: '#fefce880' }}>
                      These rules match patterns that are frequently critical — review the explanation before removing
                    </div>
                    <div className="p-2 space-y-1" style={{ background: "var(--card, #ffffff)" }}>
                      {analysis.recommendations.warn.map(rule => (
                        <div key={rule.rule_id}>
                          <RuleDisplay
                            rule={rule}
                            checkbox
                            checked={selectedRulesToRemediate.has(rule.rule_id)}
                            onChange={() => toggleRuleSelection(rule.rule_id)}
                            showStatus={false}
                          />
                          {rule.protection?.explanation && (
                            <div className="ml-10 mb-1 text-[11px] text-[#a16207] leading-tight">
                              {rule.protection.explanation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PROTECTED group — locked, cannot be selected */}
                {(analysis.recommendations.protected?.length ?? 0) > 0 && (
                  <div className="rounded-xl border overflow-hidden opacity-75" style={{ borderColor: '#d1d5db' }}>
                    <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#f9fafb' }}>
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-[#6b7280]" />
                        <span className="font-semibold text-sm" style={{ color: "var(--foreground, #111827)" }}>
                          Protected Rules ({analysis.recommendations.protected.length})
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#6b728020] text-[#6b7280]">PROTECTED</span>
                      </div>
                    </div>
                    <div className="px-4 py-1.5 text-xs border-b" style={{ color: "var(--muted-foreground, #6b7280)", borderColor: '#d1d5db', background: '#f9fafb80' }}>
                      These rules match critical infrastructure patterns and cannot be removed
                    </div>
                    <div className="p-2 space-y-1" style={{ background: "var(--card, #ffffff)" }}>
                      {analysis.recommendations.protected.map(rule => (
                        <div key={rule.rule_id}>
                          <RuleDisplay rule={rule} disabled showStatus={false} />
                          {rule.protection?.explanation && (
                            <div className="ml-6 mb-1 text-[11px] text-[#6b7280] leading-tight">
                              {rule.protection.explanation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Evidence */}
            <div className="p-4 rounded-xl" style={{ background: "var(--background, #f8f9fa)" }}>
              <h3 className="font-bold mb-3" style={{ color: "var(--foreground, #111827)" }}>Confidence Factors:</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-[#22c55e]" />
                    <span>{observationDays}-day observation window</span>
                  </span>
                  <span className="font-semibold text-[#22c55e]">VPC Flow Logs</span>
                </div>
                {analysis.evidence?.sources?.map((source, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      {source.available ? (
                        <Check className="w-4 h-4 text-[#22c55e]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#ef4444]" />
                      )}
                      <span>{source.name}</span>
                    </span>
                    <span className={`font-semibold ${source.available ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                      {source.available ? 'Available' : 'Not available'}
                    </span>
                  </div>
                ))}
                {orphanStatus?.is_orphan && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-[#f97316]" />
                      <span>Orphan Security Group</span>
                    </span>
                    <span className="font-semibold text-[#f97316]">{orphanStatus.severity}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: "var(--border, #e5e7eb)", background: "var(--background, #f8f9fa)" }}>
            <button
              onClick={() => setShowSimulation(false)}
              disabled={applying}
              className="px-4 py-2 border border-[var(--border,#d1d5db)] text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-100 font-medium disabled:opacity-50"
            >
              ← BACK
            </button>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createSnapshot}
                  onChange={(e) => setCreateSnapshot(e.target.checked)}
                  disabled={applying}
                  className="rounded border-[var(--border,#d1d5db)] text-[#8b5cf6] focus:ring-[#8b5cf6]"
                />
                <span className="text-sm" style={{ color: "var(--muted-foreground, #6b7280)" }}>Create rollback snapshot</span>
              </label>
              <button
                onClick={handleExportTerraform}
                className="px-3 py-2 border border-[var(--border,#d1d5db)] text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-50 text-sm flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                Terraform
              </button>
              {(() => {
                const lowConfidence = safetyScore < 50;
                if (lowConfidence) {
                  return (
                    <button
                      onClick={handleApplyFix}
                      disabled={applying || selectedCount === 0}
                      className="px-6 py-2.5 bg-[#f97316] text-white rounded-lg font-bold hover:bg-[#ea580c] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {applying ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Applying...</>
                      ) : (
                        <><AlertTriangle className="w-4 h-4" />APPLY ANYWAY ({selectedCount} rules)</>
                      )}
                    </button>
                  );
                }
                return (
                  <button
                    onClick={handleApplyFix}
                    disabled={applying || selectedCount === 0}
                    className="px-6 py-2.5 bg-[#8b5cf6] text-white rounded-lg font-bold hover:bg-[#7c3aed] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {applying ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Applying...</>
                    ) : (
                      `APPLY FIX (${selectedCount} rules)`
                    )}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // PHASE 1: Initial Analysis View (pre-simulation)
  // =========================================================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative w-[950px] max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4" style={{ background: "var(--card, #ffffff)" }}>
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ background: "var(--background, #f8f9fa)", borderColor: "var(--border, #e5e7eb)" }}>
          <div>
            <h2 className="text-xl font-bold" style={{ color: "var(--foreground, #111827)" }}>Rule Usage Analysis</h2>
            <p className="text-sm">
              <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{sgName || sgId}</span>
              <span style={{ color: "var(--muted-foreground, #6b7280)" }}> - SecurityGroup - {systemName || 'Unknown System'}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncFlowLogs}
              disabled={syncing}
              className="p-2 rounded-lg hover:opacity-80"
              style={{ color: "var(--muted-foreground, #9ca3af)" }}
              title="Sync VPC Flow Logs"
            >
              <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleClose} style={{ color: "var(--muted-foreground, #9ca3af)" }}>
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {analysis ? (
            <>
              <div className="px-6 pt-5">
                <div className="flex items-center gap-2 border-b" style={{ borderColor: "var(--border, #e5e7eb)" }}>
                  {([
                    { id: 'summary' as const, label: 'Summary', icon: ShieldCheck },
                    { id: 'rules' as const, label: 'Rules', icon: Activity },
                    { id: 'context' as const, label: 'Context', icon: Sparkles },
                  ]).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setAnalysisTab(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px"
                      style={{
                        borderColor: analysisTab === tab.id ? '#8b5cf6' : 'transparent',
                        color: analysisTab === tab.id ? '#8b5cf6' : 'var(--muted-foreground, #6b7280)',
                      }}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {analysisTab === 'summary' && confidenceLoading && (
                <div className="mx-6 mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500 flex items-center">
                  <Loader2 className="w-3.5 h-3.5 inline animate-spin mr-2" />
                  Agent 5 scoring remediation safety…
                </div>
              )}
              {analysisTab === 'summary' && confidenceScore && (
                <div className="mx-6 mt-4">
                  <ConfidenceExplanationPanel score={confidenceScore} />
                </div>
              )}

              {analysisTab === 'summary' && (
                <>
                  {/* Observation Period Banner */}
                  <div className="mx-6 mt-4 p-4 border rounded-2xl" style={{ borderColor: "#dbeafe", background: "#eff6ff" }}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-5 h-5" style={{ color: "#2563eb" }} />
                          <span className="font-semibold" style={{ color: "var(--foreground, #111827)" }}>{observationDays}-Day Observation Period</span>
                        </div>
                        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                          Tracked from {formatDate(startDate)} to {formatDate(endDate)} using VPC Flow Logs and SG traffic summaries.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#ffffff", color: "#2563eb", border: "1px solid #bfdbfe" }}>
                          {connectedResourcesCount} connected resources
                        </span>
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#ffffff", color: cautionRules > 0 ? "#ca8a04" : "#6b7280", border: "1px solid #e5e7eb" }}>
                          {protectedRules} protected · {cautionRules} caution
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Orphan Warning */}
                  {orphanStatus?.is_orphan && (
                    <div className={`mx-6 mt-4 p-5 border rounded-2xl ${
                      orphanStatus.severity === 'CRITICAL' ? 'border-[#ef444440]' : 'border-[#f9731640]'
                    }`} style={{ background: orphanStatus.severity === 'CRITICAL' ? '#fef2f2' : '#fff7ed' }}>
                      <div className="flex items-start gap-3">
                        <AlertTriangle className={`w-6 h-6 flex-shrink-0 ${
                          orphanStatus.severity === 'CRITICAL' ? 'text-[#ef4444]' : 'text-[#f97316]'
                        }`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${
                              orphanStatus.severity === 'CRITICAL' ? 'bg-[#ef4444]' : 'bg-[#f97316]'
                            }`}>
                              {orphanStatus.severity} - ORPHAN SG
                            </span>
                          </div>
                          <p className={`mt-1 font-medium ${
                            orphanStatus.severity === 'CRITICAL' ? 'text-[#b91c1c]' : 'text-[#c2410c]'
                          }`}>
                            {orphanStatus.message}
                          </p>
                          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                            {orphanStatus.attachment_count} attachments.
                            {orphanStatus.severity === 'CRITICAL'
                              ? ' Public ingress rules increase immediate exposure.'
                              : ' Consider deleting to reduce attack surface.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Over-Privileged Banner + Stats */}
                  <div className="p-6 space-y-4">
                {/* Over-Privileged Bar */}
                <div className="flex items-center gap-5 p-5 rounded-xl border-2" style={{
                  borderColor: remediatePercent >= 75 ? '#ef444440' : remediatePercent >= 50 ? '#f9731640' : remediatePercent >= 25 ? '#eab30840' : '#22c55e40',
                  background: remediatePercent >= 75 ? '#ef444408' : remediatePercent >= 50 ? '#f9731608' : remediatePercent >= 25 ? '#eab30808' : '#22c55e08',
                }}>
                  <div className="flex flex-col items-center flex-shrink-0">
                    <span className="text-4xl font-bold" style={{
                      color: remediatePercent >= 75 ? '#ef4444' : remediatePercent >= 50 ? '#f97316' : remediatePercent >= 25 ? '#eab308' : '#22c55e'
                    }}>{remediatePercent}%</span>
                    <span className="text-xs font-semibold mt-0.5" style={{
                      color: remediatePercent >= 75 ? '#ef4444' : remediatePercent >= 50 ? '#f97316' : remediatePercent >= 25 ? '#eab308' : '#22c55e'
                    }}>Over-Privileged</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm" style={{ color: "var(--foreground, #111827)" }}>
                      <strong>{toRemediate}</strong> of <strong>{totalRules}</strong> rules can be removed or tightened — only <strong>{usedRules}</strong> actively used
                    </p>
                    <div className="flex items-center gap-1 mt-2 h-3 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
                      <div className="h-full rounded-l-full transition-all" style={{
                        width: `${usedPercent}%`,
                        background: '#22c55e',
                        minWidth: usedRules > 0 ? '4px' : '0',
                      }} />
                      {overlyBroadRules > 0 && (
                        <div className="h-full transition-all" style={{
                          width: `${(overlyBroadRules / totalRules) * 100}%`,
                          background: '#f97316',
                        }} />
                      )}
                      <div className="h-full rounded-r-full transition-all" style={{
                        width: `${(unusedRules / Math.max(totalRules, 1)) * 100}%`,
                        background: '#ef4444',
                      }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-[#22c55e]">{usedRules} used</span>
                      <span className="text-xs" style={{ color: remediatePercent >= 75 ? '#ef4444' : '#f97316' }}>{toRemediate} to remediate</span>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl p-4 text-center border" style={{ background: "var(--background, #f8f9fa)", borderColor: "var(--border, #e5e7eb)" }}>
                    <div className="text-4xl font-bold" style={{ color: "var(--foreground, #111827)" }}>{totalRules}</div>
                    <div className="mt-1" style={{ color: "var(--muted-foreground, #9ca3af)" }}>Total Rules</div>
                  </div>
                  <div className="rounded-xl p-4 text-center border-2" style={{ borderColor: "#22c55e40", background: "#22c55e10" }}>
                    <div className="text-4xl font-bold" style={{ color: "#22c55e" }}>{usedRules}</div>
                    <div className="mt-1" style={{ color: "#22c55e" }}>Actually Used ({usedPercent}%)</div>
                  </div>
                  <div className="rounded-xl p-4 text-center border-2" style={{ borderColor: "#ef444440", background: "#ef444410" }}>
                    <div className="text-4xl font-bold" style={{ color: "#ef4444" }}>{toRemediate}</div>
                    <div className="mt-1" style={{ color: "#ef4444" }}>To Remediate ({remediatePercent}%)</div>
                  </div>
                </div>
                  </div>

                  {/* Recommended Action */}
                  {toRemediate > 0 && (
                    <div className="mx-6 mb-6 p-5 border rounded-2xl" style={{ borderColor: "var(--border, #e5e7eb)", background: "#fafafa" }}>
                      <h3 className="font-bold text-base" style={{ color: "var(--foreground, #111827)" }}>Recommended Action</h3>
                      <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground, #4b5563)" }}>
                        {unusedRules > 0 && `Remove ${unusedRules} unused rule${unusedRules !== 1 ? 's' : ''}`}
                        {unusedRules > 0 && overlyBroadRules > 0 && ' and '}
                        {overlyBroadRules > 0 && `tighten ${overlyBroadRules} overly broad rule${overlyBroadRules !== 1 ? 's' : ''}`}
                        {' '}to reduce attack surface by {remediatePercent}%.
                      </p>
                      <div className="flex items-center gap-2 mt-3 text-[#22c55e]">
                        <Shield className="w-5 h-5" />
                        <span className="font-medium">
                          {safetyScore >= 75 ? 'High confidence — no service disruption expected'
                           : safetyScore >= 50 ? 'Medium confidence — review recommended before applying'
                           : 'Low confidence — investigate before applying'}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {analysisTab === 'rules' && (
                <div className="px-6 py-6 space-y-4">
                <h3 className="text-lg font-bold" style={{ color: "var(--foreground, #111827)" }}>Rule Usage Breakdown</h3>

                {/* Used Rules — Keep */}
                <div className="border border-[#22c55e40] rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-[#22c55e]" />
                      <span className="font-semibold" style={{ color: "var(--foreground, #111827)" }}>Used Rules ({usedRules})</span>
                    </div>
                    <span className="px-3 py-1 border border-[#22c55e40] text-[#22c55e] rounded-lg text-sm font-medium bg-[#22c55e10]">
                      Keep these
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                    {analysis.recommendations.keep.length > 0 ? analysis.recommendations.keep.map(rule => (
                      <div key={rule.rule_id} className="flex items-center gap-2 text-sm">
                        <span className="text-[#22c55e]">✓</span>
                        <span className="font-mono" style={{ color: "var(--foreground, #1f2937)" }}>
                          {rule.protocol}/{rule.port_range}
                        </span>
                        <span style={{ color: "var(--muted-foreground, #6b7280)" }}>from {rule.source}</span>
                        <span style={{ color: "var(--muted-foreground, #9ca3af)" }}>
                          - {rule.traffic.connection_count.toLocaleString()} connections
                        </span>
                      </div>
                    )) : (
                      <p className="text-sm italic" style={{ color: "var(--muted-foreground, #9ca3af)" }}>No actively used rules found</p>
                    )}
                  </div>
                </div>

                {/* Overly Broad Rules — Tighten */}
                {analysis.recommendations.tighten.length > 0 && (
                  <div className="border-2 border-[#f9731640] bg-[#f9731610] rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-[#f97316]" />
                        <span className="font-semibold text-[#f97316]">Overly Broad Rules ({analysis.recommendations.tighten.length})</span>
                      </div>
                      <span className="px-3 py-1 bg-[#f9731620] text-[#f97316] border border-[#f9731640] rounded-lg text-sm font-medium">
                        Restrict access
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[#f97316]">
                      These ports are open to <strong>0.0.0.0/0 (the entire internet)</strong>. Remediation will remove the open rule and replace it with rules that only allow the {analysis.recommendations.tighten.length > 1 ? 'specific IPs' : 'specific IP'} that actually connected.
                    </p>
                    <div className="mt-3 space-y-3">
                      {analysis.recommendations.tighten.map(rule => (
                        <div key={rule.rule_id} className="p-3 rounded-lg border" style={{ borderColor: "var(--border, #e5e7eb)", background: "var(--card, #ffffff)" }}>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-mono font-medium" style={{ color: "var(--foreground, #111827)" }}>
                              {rule.protocol}/{rule.port_range}
                            </span>
                            {rule.port_name && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-[#ef444410] text-[#ef4444]">
                                {rule.port_name}
                              </span>
                            )}
                            <span className="text-[#ef4444] flex items-center gap-1">
                              <Globe className="w-3 h-3" />{rule.source}
                            </span>
                            <span style={{ color: "var(--muted-foreground, #9ca3af)" }}>
                              ({rule.traffic.unique_sources} actual source{rule.traffic.unique_sources !== 1 ? 's' : ''})
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                            <span className="text-[#ef4444] line-through font-mono">0.0.0.0/0</span>
                            <span>→</span>
                            {rule.traffic.sample_sources && rule.traffic.sample_sources.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {rule.traffic.sample_sources.slice(0, 5).map((ip, idx) => (
                                  <code key={idx} className="px-1.5 py-0.5 bg-[#22c55e10] text-[#22c55e] rounded font-mono border border-[#22c55e30]">
                                    {ip}/32
                                  </code>
                                ))}
                                {rule.traffic.sample_sources.length > 5 && (
                                  <span>+{rule.traffic.sample_sources.length - 5} more</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[#f97316] italic">No observed sources — rule will be removed entirely</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unused Rules — Delete */}
                <div className="border-2 border-[#ef444440] bg-[#ef444410] rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-[#ef4444]" />
                      <span className="font-semibold text-[#ef4444]">Unused Rules ({unusedRules})</span>
                    </div>
                    <span className="px-3 py-1 bg-[#ef444420] text-[#ef4444] border border-[#ef444440] rounded-lg text-sm font-medium">
                      Delete these
                    </span>
                  </div>
                  {analysis.recommendations.delete.length > 0 ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {analysis.recommendations.delete.map(rule => (
                        <div key={rule.rule_id} className="flex items-center gap-2 text-sm">
                          <X className="w-4 h-4 text-[#ef4444] flex-shrink-0" />
                          <span className="font-mono" style={{ color: "var(--foreground, #374151)" }}>
                            {rule.protocol}/{rule.port_range}
                          </span>
                          <span className="text-xs truncate" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                            from {rule.source}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground, #9ca3af)" }}>No unused rules found</p>
                  )}
                </div>
                </div>
              )}

              {analysisTab === 'context' && (
                <div className="px-6 py-6 space-y-4">
                  {analysis.attached_resources && analysis.attached_resources.length > 0 && (
                    <div className="p-4 rounded-2xl border" style={{ borderColor: "var(--border, #e5e7eb)", background: "var(--background, #f8f9fa)" }}>
                      <div className="flex items-center gap-2 mb-3">
                        <Server className="w-4 h-4" style={{ color: "var(--muted-foreground, #6b7280)" }} />
                        <span className="font-semibold text-sm" style={{ color: "var(--foreground, #111827)" }}>
                          Connected Resources ({analysis.attached_resources.length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {analysis.attached_resources.map((res, idx) => {
                          const style = getResourceTypeStyle(res.resource_type);
                          const IconComp = style.Icon;
                          return (
                            <div
                              key={`${res.resource_id}-${idx}`}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm"
                              style={{ borderColor: `${style.color}30`, background: style.bg }}
                            >
                              <IconComp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: style.color }} />
                              <span className="font-medium" style={{ color: style.color }}>{style.label}</span>
                              <span className="text-xs truncate max-w-[180px]" style={{ color: "var(--foreground, #374151)" }} title={res.resource_name}>
                                {res.resource_name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border, #e5e7eb)", background: "#ffffff" }}>
                      <h3 className="font-semibold mb-3" style={{ color: "var(--foreground, #111827)" }}>Evidence & Confidence</h3>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span style={{ color: "var(--muted-foreground, #6b7280)" }}>Safety score</span>
                          <span className="font-semibold" style={{ color: safetyScore >= 75 ? "#16a34a" : safetyScore >= 50 ? "#ca8a04" : "#dc2626" }}>{safetyScore}%</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span style={{ color: "var(--muted-foreground, #6b7280)" }}>Evidence window</span>
                          <span className="font-semibold" style={{ color: "var(--foreground, #111827)" }}>{observationDays} days</span>
                        </div>
                        {(analysis.evidence?.sources || []).map((source, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span style={{ color: "var(--muted-foreground, #6b7280)" }}>{source.name}</span>
                            <span className="font-semibold" style={{ color: source.available ? "#16a34a" : "#dc2626" }}>
                              {source.available ? 'Available' : 'Missing'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border, #e5e7eb)", background: "#ffffff" }}>
                      <h3 className="font-semibold mb-3" style={{ color: "var(--foreground, #111827)" }}>Execution Safeguards</h3>
                      <div className="space-y-2 text-sm" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                        <div className="flex items-center justify-between">
                          <span>Snapshot before apply</span>
                          <span className="font-semibold text-[#16a34a]">Required</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Rollback path</span>
                          <span className="font-semibold text-[#16a34a]">Available via History</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Protected rules</span>
                          <span className="font-semibold" style={{ color: protectedRules > 0 ? "#6b7280" : "#16a34a" }}>{protectedRules}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Review-first rules</span>
                          <span className="font-semibold" style={{ color: cautionRules > 0 ? "#ca8a04" : "#16a34a" }}>{cautionRules}</span>
                        </div>
                      </div>
                      {snapshotId && (
                        <div className="mt-3 rounded-xl px-3 py-2 text-xs font-medium" style={{ background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ddd6fe" }}>
                          Pre-simulation snapshot: {snapshotId}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: "var(--border, #e5e7eb)", background: "var(--background, #f8f9fa)" }}>
          <button
            onClick={handleClose}
            className="px-4 py-2 border rounded-lg font-medium"
            style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--muted-foreground, #6b7280)" }}
          >
            CLOSE
          </button>
          <button
            onClick={handleSimulate}
            disabled={!analysis || toRemediate === 0 || simulating}
            className="px-6 py-2.5 text-white rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: "#8b5cf6" }}
          >
            {simulating ? (
              <><Loader2 className="w-4 h-4 inline mr-2 animate-spin" />Simulating...</>
            ) : (
              'SIMULATE FIX'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SGLeastPrivilegeModal;
