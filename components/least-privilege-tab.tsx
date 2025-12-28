'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SGGapCard } from './sg-gap-card';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface SGSummary {
  sg_id: string;
  sg_name: string;
  vpc_id: string;
  summary: {
    total_rules: number;
    used_rules: number;
    unused_rules: number;
    overly_broad_rules: number;
    average_confidence: number;
  };
}

interface IAMRole {
  id: string;
  name: string;
  usedCount: number;
  allowedCount: number;
  unusedCount: number;
  highRiskUnused: string[];
  score: number;
  lastUsed?: string;
}

interface OverallSummary {
  sgs_analyzed: number;
  total_rules: number;
  unused_rules: number;
  overly_broad_rules: number;
  used_rules: number;
}

interface LeastPrivilegeTabProps {
  systemName?: string;
}

// ============================================================================
// Helper Components
// ============================================================================

const MetricCard: React.FC<{
  label: string;
  value: number | string;
  subLabel?: string;
  color?: 'green' | 'red' | 'orange' | 'blue' | 'default';
}> = ({ label, value, subLabel, color = 'default' }) => {
  const colorStyles = {
    green: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    red: 'from-rose-500/20 to-rose-600/10 border-rose-500/30',
    orange: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    default: 'from-slate-700/50 to-slate-800/50 border-slate-600/30',
  };

  return (
    <div className={`bg-gradient-to-br ${colorStyles[color]} border rounded-xl p-4`}>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-slate-300 mt-1">{label}</div>
      {subLabel && <div className="text-xs text-slate-500 mt-0.5">{subLabel}</div>}
    </div>
  );
};

const SectionHeader: React.FC<{
  title: string;
  count?: number;
  isLoading?: boolean;
}> = ({ title, count, isLoading }) => (
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
      {title}
      {count !== undefined && (
        <span className="px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded text-sm font-normal">
          {count}
        </span>
      )}
      {isLoading && (
        <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      )}
    </h2>
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export const LeastPrivilegeTab: React.FC<LeastPrivilegeTabProps> = ({
  systemName,
}) => {
  // ============================================================================
  // State
  // ============================================================================
  
  // Security Groups state
  const [securityGroups, setSecurityGroups] = useState<string[]>([]);
  const [sgSummaries, setSgSummaries] = useState<SGSummary[]>([]);
  const [sgLoading, setSgLoading] = useState(false);
  const [sgOverallSummary, setSgOverallSummary] = useState<OverallSummary | null>(null);
  
  // IAM Roles state (placeholder - integrate with your existing IAM data)
  const [iamRoles, setIamRoles] = useState<IAMRole[]>([]);
  const [iamLoading, setIamLoading] = useState(false);
  
  // View state
  const [activeSection, setActiveSection] = useState<'all' | 'iam' | 'sg'>('all');
  const [expandedSGs, setExpandedSGs] = useState<Set<string>>(new Set());
  
  // ============================================================================
  // Data Fetching
  // ============================================================================
  
  // Fetch Security Groups when system changes
  const fetchSecurityGroups = useCallback(async () => {
    setSgLoading(true);
    try {
      const params = new URLSearchParams({ days: '365', limit: '10' });
      if (systemName) params.append('system_name', systemName);
      
      const res = await fetch(`/api/proxy/security-groups/gap-analysis?${params}`);
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
      // Extract SG IDs and summaries
      const sgs = data.security_groups || [];
      setSecurityGroups(sgs.map((sg: SGSummary) => sg.sg_id));
      setSgSummaries(sgs);
      setSgOverallSummary(data.overall_summary || null);
      
    } catch (err) {
      console.error('Failed to fetch Security Groups:', err);
      setSecurityGroups([]);
      setSgSummaries([]);
      setSgOverallSummary(null);
    } finally {
      setSgLoading(false);
    }
  }, [systemName]);
  
  // Fetch IAM roles (integrate with your existing logic)
  const fetchIAMRoles = useCallback(async () => {
    setIamLoading(true);
    try {
      const params = new URLSearchParams();
      if (systemName) params.append('system_name', systemName);
      
      const res = await fetch(`/api/proxy/least-privilege/roles?${params}`);
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      setIamRoles(data.roles || []);
      
    } catch (err) {
      console.error('Failed to fetch IAM roles:', err);
      setIamRoles([]);
    } finally {
      setIamLoading(false);
    }
  }, [systemName]);
  
  // Load data on mount and when system changes
  useEffect(() => {
    fetchSecurityGroups();
    fetchIAMRoles();
  }, [fetchSecurityGroups, fetchIAMRoles]);
  
  // ============================================================================
  // Handlers
  // ============================================================================
  
  const handleSimulate = (sgId: string, ruleId: string, action: string) => {
    console.log('Simulation requested:', { sgId, ruleId, action });
  };
  
  const handleRemediate = (sgId: string, ruleId: string, action: string) => {
    console.log('Remediation requested:', { sgId, ruleId, action });
    // Refresh data after remediation
    fetchSecurityGroups();
  };
  
  const toggleSGExpand = (sgId: string) => {
    setExpandedSGs(prev => {
      const next = new Set(prev);
      if (next.has(sgId)) {
        next.delete(sgId);
      } else {
        next.add(sgId);
      }
      return next;
    });
  };
  
  // ============================================================================
  // Computed Values
  // ============================================================================
  
  const totalUnusedPermissions = iamRoles.reduce((sum, r) => sum + r.unusedCount, 0);
  const totalHighRiskUnused = iamRoles.reduce((sum, r) => sum + r.highRiskUnused.length, 0);
  const avgIAMScore = iamRoles.length > 0 
    ? Math.round(iamRoles.reduce((sum, r) => sum + r.score, 0) / iamRoles.length)
    : 0;
  
  // ============================================================================
  // Render
  // ============================================================================
  
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Least Privilege Analysis</h1>
          <p className="text-slate-400 mt-1">
            Compare allowed permissions vs actual usage for IAM Roles and Security Groups
          </p>
        </div>
        
        {/* Section Filter */}
        <div className="flex bg-slate-800/50 rounded-lg p-1">
          {(['all', 'iam', 'sg'] as const).map((section) => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeSection === section
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {section === 'all' ? 'All' : section === 'iam' ? 'IAM Roles' : 'Security Groups'}
            </button>
          ))}
        </div>
      </div>
      
      {/* Overall Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* IAM Metrics */}
        <MetricCard
          label="IAM Roles"
          value={iamRoles.length}
          subLabel="Analyzed"
          color="blue"
        />
        <MetricCard
          label="Unused Permissions"
          value={totalUnusedPermissions}
          subLabel="To remove"
          color="red"
        />
        <MetricCard
          label="High Risk Unused"
          value={totalHighRiskUnused}
          subLabel="Priority"
          color="orange"
        />
        
        {/* SG Metrics */}
        <MetricCard
          label="Security Groups"
          value={sgOverallSummary?.sgs_analyzed || 0}
          subLabel="Analyzed"
          color="blue"
        />
        <MetricCard
          label="Unused SG Rules"
          value={sgOverallSummary?.unused_rules || 0}
          subLabel="To delete"
          color="red"
        />
        <MetricCard
          label="Overly Broad"
          value={sgOverallSummary?.overly_broad_rules || 0}
          subLabel="To tighten"
          color="orange"
        />
      </div>
      
      {/* IAM Roles Section */}
      {(activeSection === 'all' || activeSection === 'iam') && (
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
          <SectionHeader
            title="IAM Roles"
            count={iamRoles.length}
            isLoading={iamLoading}
          />
          
          {iamLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-slate-400">Loading IAM Roles...</span>
            </div>
          ) : iamRoles.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p>No IAM Roles found</p>
              <p className="text-sm mt-1">Try running a scan or check your system filter</p>
            </div>
          ) : (
            <div className="space-y-3">
              {iamRoles.map((role) => (
                <div
                  key={role.id}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">{role.name}</div>
                      <div className="text-sm text-slate-400 mt-1">
                        {role.usedCount} / {role.allowedCount} permissions used
                        {role.highRiskUnused.length > 0 && (
                          <span className="text-rose-400 ml-2">
                            · {role.highRiskUnused.length} high-risk unused
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-white">{role.score}%</div>
                        <div className="text-xs text-slate-500">LP Score</div>
                      </div>
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          role.score >= 80 ? 'bg-emerald-500/20' :
                          role.score >= 60 ? 'bg-amber-500/20' :
                          'bg-rose-500/20'
                        }`}
                      >
                        <span className={`text-lg font-bold ${
                          role.score >= 80 ? 'text-emerald-400' :
                          role.score >= 60 ? 'text-amber-400' :
                          'text-rose-400'
                        }`}>
                          {role.score >= 80 ? '✓' : role.score >= 60 ? '!' : '✗'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* High Risk Unused (if any) */}
                  {role.highRiskUnused.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700/50">
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                        High Risk Unused Permissions
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {role.highRiskUnused.slice(0, 5).map((perm, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded text-xs font-mono"
                          >
                            {perm}
                          </span>
                        ))}
                        {role.highRiskUnused.length > 5 && (
                          <span className="px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded text-xs">
                            +{role.highRiskUnused.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Security Groups Section */}
      {(activeSection === 'all' || activeSection === 'sg') && (
        <div className="mt-8">
          <SectionHeader
            title="Security Groups"
            count={securityGroups.length}
            isLoading={sgLoading}
          />
          
          {sgLoading ? (
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-12">
              <div className="flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-slate-400">Loading Security Groups...</span>
              </div>
            </div>
          ) : securityGroups.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-12">
              <div className="text-center text-slate-500">
                <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p>No Security Groups found</p>
                <p className="text-sm mt-1">
                  {systemName 
                    ? `No SGs with System tag "${systemName}"` 
                    : 'No SGs found in this region'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Quick Summary of SGs */}
              {sgSummaries.length > 0 && (
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Quick Summary</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {sgSummaries.slice(0, 5).map((sg) => (
                      <button
                        key={sg.sg_id}
                        onClick={() => toggleSGExpand(sg.sg_id)}
                        className={`p-3 rounded-lg border transition-colors text-left ${
                          expandedSGs.has(sg.sg_id)
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-medium text-white text-sm truncate">
                          {sg.sg_name}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {sg.summary.total_rules} rules
                        </div>
                        <div className="flex gap-1 mt-2">
                          {sg.summary.unused_rules > 0 && (
                            <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-400 rounded text-xs">
                              {sg.summary.unused_rules} unused
                            </span>
                          )}
                          {sg.summary.overly_broad_rules > 0 && (
                            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs">
                              {sg.summary.overly_broad_rules} broad
                            </span>
                          )}
                          {sg.summary.unused_rules === 0 && sg.summary.overly_broad_rules === 0 && (
                            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                              ✓ OK
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Detailed SG Cards */}
              {securityGroups
                .filter(sgId => expandedSGs.size === 0 || expandedSGs.has(sgId))
                .map((sgId) => (
                  <SGGapCard
                    key={sgId}
                    sgId={sgId}
                    systemName={systemName}
                    onSimulate={handleSimulate}
                    onRemediate={handleRemediate}
                  />
                ))}
              
              {/* Show more button if there are hidden SGs */}
              {expandedSGs.size > 0 && expandedSGs.size < securityGroups.length && (
                <button
                  onClick={() => setExpandedSGs(new Set())}
                  className="w-full py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  Show all {securityGroups.length} Security Groups
                </button>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Footer Info */}
      <div className="text-center text-xs text-slate-500 pt-4 border-t border-slate-700/50">
        <p>
          Data sources: IAM Access Analyzer, CloudTrail, VPC Flow Logs
          {systemName && ` · Filtered by System: ${systemName}`}
        </p>
      </div>
    </div>
  );
};

export default LeastPrivilegeTab;

