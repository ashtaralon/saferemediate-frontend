'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SGGapCard } from './sg-gap-card';

// Use environment variable for backend URL
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

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

interface ServiceOption {
  id: string;
  name: string;
  type: string;
}

// Connection type definitions
type ConnectionType = 'network' | 'api';

// Common ports for network traffic
const COMMON_PORTS = [
  { port: 443, name: 'HTTPS', protocol: 'TCP' },
  { port: 80, name: 'HTTP', protocol: 'TCP' },
  { port: 22, name: 'SSH', protocol: 'TCP' },
  { port: 3306, name: 'MySQL', protocol: 'TCP' },
  { port: 5432, name: 'PostgreSQL', protocol: 'TCP' },
  { port: 6379, name: 'Redis', protocol: 'TCP' },
  { port: 27017, name: 'MongoDB', protocol: 'TCP' },
  { port: 5439, name: 'Redshift', protocol: 'TCP' },
  { port: 8080, name: 'HTTP Alt', protocol: 'TCP' },
  { port: 8443, name: 'HTTPS Alt', protocol: 'TCP' },
];

// API operations by service type
const API_OPERATIONS: Record<string, string[]> = {
  S3: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket', 's3:GetObjectTagging', 's3:HeadObject'],
  DynamoDB: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:UpdateItem'],
  Lambda: ['lambda:InvokeFunction', 'lambda:GetFunction', 'lambda:ListFunctions'],
  SQS: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
  SNS: ['sns:Publish', 'sns:Subscribe', 'sns:ListTopics'],
  RDS: ['rds:DescribeDBInstances', 'rds:CreateDBSnapshot', 'rds:ModifyDBInstance'],
  SecretsManager: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret', 'secretsmanager:ListSecrets'],
  KMS: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey'],
  EC2: ['ec2:DescribeInstances', 'ec2:StartInstances', 'ec2:StopInstances', 'ec2:TerminateInstances'],
  default: ['invoke', 'read', 'write', 'delete', 'list'],
};

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
  
  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Traffic Simulator state
  const [showSimulator, setShowSimulator] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [availableServices, setAvailableServices] = useState<ServiceOption[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [simSource, setSimSource] = useState('');
  const [simTarget, setSimTarget] = useState('');
  const [simConnectionType, setSimConnectionType] = useState<ConnectionType>('network');
  const [simPort, setSimPort] = useState(443);
  const [simProtocol, setSimProtocol] = useState('TCP');
  const [simApiOperations, setSimApiOperations] = useState<string[]>(['s3:GetObject', 's3:PutObject']);
  const [simDays, setSimDays] = useState(90);
  const [simEventsPerDay, setSimEventsPerDay] = useState(5);
  
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
  
  // Refresh all data
  const handleRefresh = async () => {
    await Promise.all([fetchSecurityGroups(), fetchIAMRoles()]);
  };

  // Fetch available services from Neo4j for simulator dropdowns
  const fetchAvailableServices = useCallback(async () => {
    setServicesLoading(true);
    try {
      const params = new URLSearchParams();
      if (systemName) params.append('systemName', systemName);

      const res = await fetch(`/api/proxy/dependency-map/full?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const nodes = data.nodes || [];

      // Extract services with proper typing
      const services: ServiceOption[] = nodes.map((node: any) => ({
        id: node.id,
        name: node.name || node.id,
        type: node.type || 'Unknown',
      }));

      // Sort by type, then by name
      services.sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.name.localeCompare(b.name);
      });

      setAvailableServices(services);

      // Set defaults if not already set
      if (!simSource && services.length > 0) {
        const ec2 = services.find(s => s.type === 'EC2');
        if (ec2) setSimSource(ec2.name);
      }
      if (!simTarget && services.length > 0) {
        const s3 = services.find(s => s.type === 'S3Bucket');
        if (s3) setSimTarget(s3.name);
      }
    } catch (err) {
      console.error('Failed to fetch services:', err);
    } finally {
      setServicesLoading(false);
    }
  }, [systemName, simSource, simTarget]);

  // Simulate traffic
  const simulateTraffic = async () => {
    if (!simSource || !simTarget) {
      setSyncMessage({ type: 'error', text: 'Please select both source and target services' });
      setTimeout(() => setSyncMessage(null), 5000);
      return;
    }

    setIsSimulating(true);
    try {
      if (simConnectionType === 'network') {
        // Simulate VPC Flow Log traffic
        const params = new URLSearchParams({
          source: simSource,
          target: simTarget,
          days: simDays.toString(),
          events_per_day: simEventsPerDay.toString(),
          port: simPort.toString(),
          protocol: simProtocol,
        });

        const response = await fetch(`${BACKEND_URL}/api/debug/simulate-network-traffic?${params}`, {
          method: 'POST',
        });

        const data = await response.json();

        if (data.success || response.ok) {
          setSyncMessage({
            type: 'success',
            text: `Network traffic simulated: ${simSource} → ${simTarget} on port ${simPort}/${simProtocol}`,
          });
          setShowSimulator(false);
          // Refresh data after simulation
          setTimeout(() => handleRefresh(), 1000);
        } else {
          throw new Error(data.detail || data.error || 'Simulation failed');
        }
      } else {
        // Simulate API call traffic (CloudTrail events)
        const params = new URLSearchParams({
          source: simSource,
          target: simTarget,
          days: simDays.toString(),
          events_per_day: simEventsPerDay.toString(),
          operations: simApiOperations.join(','),
        });

        const response = await fetch(`${BACKEND_URL}/api/debug/simulate-traffic?${params}`, {
          method: 'POST',
        });

        const data = await response.json();

        if (data.success || response.ok) {
          setSyncMessage({
            type: 'success',
            text: `API traffic simulated: ${simSource} → ${simTarget} with ${simApiOperations.length} operations`,
          });
          setShowSimulator(false);
          // Refresh data after simulation
          setTimeout(() => handleRefresh(), 1000);
        } else {
          throw new Error(data.detail || data.error || 'Simulation failed');
        }
      }
    } catch (error) {
      console.error('Simulation failed:', error);
      setSyncMessage({
        type: 'error',
        text: `Simulation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsSimulating(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  // Open simulator modal
  const openSimulator = () => {
    setShowSimulator(true);
    fetchAvailableServices();
  };

  // Get target service type for API operations
  const getTargetServiceType = (): string => {
    const targetService = availableServices.find(s => s.name === simTarget);
    if (!targetService) return 'default';

    if (targetService.type.includes('S3')) return 'S3';
    if (targetService.type.includes('DynamoDB')) return 'DynamoDB';
    if (targetService.type.includes('Lambda')) return 'Lambda';
    if (targetService.type.includes('SQS')) return 'SQS';
    if (targetService.type.includes('SNS')) return 'SNS';
    if (targetService.type.includes('RDS')) return 'RDS';
    if (targetService.type.includes('Secret')) return 'SecretsManager';
    if (targetService.type.includes('KMS')) return 'KMS';
    if (targetService.type.includes('EC2')) return 'EC2';

    return 'default';
  };
  
  // Sync from AWS - fetches latest data directly from AWS
  const handleSyncFromAWS = async () => {
    setSyncing(true);
    setSyncMessage(null);
    
    try {
      // Step 1: Run IAM collector
      console.log('Syncing IAM roles from AWS...');
      const iamRes = await fetch('/api/proxy/collectors/run/iam', { method: 'POST' });
      if (!iamRes.ok) {
        console.warn('IAM collector failed:', iamRes.status);
      }
      
      // Step 2: Run Security Groups collector
      console.log('Syncing Security Groups from AWS...');
      const sgRes = await fetch('/api/proxy/collectors/run/security_groups', { method: 'POST' });
      if (!sgRes.ok) {
        console.warn('SG collector failed:', sgRes.status);
      }
      
      // Step 3: Run Flow Logs telemetry (last 1 hour)
      console.log('Syncing VPC Flow Logs...');
      const flowRes = await fetch('/api/proxy/telemetry/flowlogs?hours_back=1', { method: 'POST' });
      if (!flowRes.ok) {
        console.warn('Flow Logs sync failed:', flowRes.status);
      }
      
      // Step 4: Refresh UI data
      await handleRefresh();
      
      setSyncMessage({ type: 'success', text: 'Synced from AWS successfully' });
      
      // Auto-hide message after 5 seconds
      setTimeout(() => setSyncMessage(null), 5000);
      
    } catch (error) {
      console.error('Sync from AWS failed:', error);
      setSyncMessage({ 
        type: 'error', 
        text: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    } finally {
      setSyncing(false);
    }
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
      {/* Sync Message Toast */}
      {syncMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
          syncMessage.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-rose-600 text-white'
        }`}>
          {syncMessage.type === 'success' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span>{syncMessage.text}</span>
          <button
            onClick={() => setSyncMessage(null)}
            className="ml-2 hover:opacity-70"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Traffic Simulator Modal */}
      {showSimulator && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowSimulator(false)}>
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-[600px] max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Dynamic Traffic Simulator
              </h2>
              <button onClick={() => setShowSimulator(false)} className="p-1 hover:bg-white/20 rounded">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-80px)]">
              {/* Connection Type Toggle */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Connection Type</label>
                <div className="flex bg-slate-800 rounded-lg p-1">
                  <button
                    onClick={() => setSimConnectionType('network')}
                    className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      simConnectionType === 'network'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    Network Traffic (VPC Flow Logs)
                  </button>
                  <button
                    onClick={() => setSimConnectionType('api')}
                    className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      simConnectionType === 'api'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    API Call (CloudTrail)
                  </button>
                </div>
              </div>

              {/* Source & Target Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Source Service */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Source Service</label>
                  {servicesLoading ? (
                    <div className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 text-sm flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
                      Loading services...
                    </div>
                  ) : (
                    <select
                      value={simSource}
                      onChange={(e) => setSimSource(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select source...</option>
                      {/* Group services by type */}
                      {['EC2', 'Lambda', 'ECS', 'EKS'].map(type => {
                        const services = availableServices.filter(s => s.type.includes(type));
                        if (services.length === 0) return null;
                        return (
                          <optgroup key={type} label={type}>
                            {services.map(s => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                      {/* Other services */}
                      <optgroup label="Other">
                        {availableServices
                          .filter(s => !['EC2', 'Lambda', 'ECS', 'EKS'].some(t => s.type.includes(t)))
                          .map(s => (
                            <option key={s.id} value={s.name}>{s.name} ({s.type})</option>
                          ))}
                      </optgroup>
                    </select>
                  )}
                  <input
                    type="text"
                    value={simSource}
                    onChange={(e) => setSimSource(e.target.value)}
                    placeholder="Or type custom name..."
                    className="w-full mt-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Target Service */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Destination Service</label>
                  {servicesLoading ? (
                    <div className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 text-sm flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
                      Loading services...
                    </div>
                  ) : (
                    <select
                      value={simTarget}
                      onChange={(e) => setSimTarget(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select destination...</option>
                      {/* Group by service type */}
                      {['S3Bucket', 'RDS', 'DynamoDB', 'ElastiCache', 'Lambda'].map(type => {
                        const services = availableServices.filter(s => s.type.includes(type.replace('Bucket', '')));
                        if (services.length === 0) return null;
                        return (
                          <optgroup key={type} label={type.replace('Bucket', '')}>
                            {services.map(s => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                      {/* Other services */}
                      <optgroup label="Other">
                        {availableServices
                          .filter(s => !['S3', 'RDS', 'DynamoDB', 'ElastiCache', 'Lambda'].some(t => s.type.includes(t)))
                          .map(s => (
                            <option key={s.id} value={s.name}>{s.name} ({s.type})</option>
                          ))}
                      </optgroup>
                    </select>
                  )}
                  <input
                    type="text"
                    value={simTarget}
                    onChange={(e) => setSimTarget(e.target.value)}
                    placeholder="Or type custom name..."
                    className="w-full mt-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Network Traffic Options */}
              {simConnectionType === 'network' && (
                <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl space-y-4">
                  <div className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    Network Traffic Settings
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Port Selection */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Port</label>
                      <div className="flex gap-2">
                        <select
                          value={simPort}
                          onChange={(e) => {
                            const port = parseInt(e.target.value);
                            setSimPort(port);
                            const preset = COMMON_PORTS.find(p => p.port === port);
                            if (preset) setSimProtocol(preset.protocol);
                          }}
                          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {COMMON_PORTS.map(p => (
                            <option key={p.port} value={p.port}>
                              {p.port} ({p.name})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={simPort}
                          onChange={(e) => setSimPort(parseInt(e.target.value) || 443)}
                          className="w-24 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          min="1"
                          max="65535"
                          placeholder="Custom"
                        />
                      </div>
                    </div>

                    {/* Protocol Selection */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Protocol</label>
                      <select
                        value={simProtocol}
                        onChange={(e) => setSimProtocol(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="TCP">TCP</option>
                        <option value="UDP">UDP</option>
                        <option value="ICMP">ICMP</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* API Call Options */}
              {simConnectionType === 'api' && (
                <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-xl space-y-4">
                  <div className="text-sm font-medium text-blue-400 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    API Operations (CloudTrail Events)
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Select Operations</label>
                    <div className="flex flex-wrap gap-2">
                      {(API_OPERATIONS[getTargetServiceType()] || API_OPERATIONS.default).map(op => (
                        <button
                          key={op}
                          onClick={() => {
                            if (simApiOperations.includes(op)) {
                              setSimApiOperations(simApiOperations.filter(o => o !== op));
                            } else {
                              setSimApiOperations([...simApiOperations, op]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            simApiOperations.includes(op)
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Selected: {simApiOperations.length} operations
                    </div>
                  </div>
                </div>
              )}

              {/* Days & Events Per Day */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Days of History</label>
                  <input
                    type="number"
                    value={simDays}
                    onChange={(e) => setSimDays(parseInt(e.target.value) || 30)}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    min="1"
                    max="730"
                  />
                  <div className="mt-1 text-xs text-slate-500">1-730 days (2 years max)</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Events per Day</label>
                  <input
                    type="number"
                    value={simEventsPerDay}
                    onChange={(e) => setSimEventsPerDay(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    min="1"
                    max="1000"
                  />
                  <div className="mt-1 text-xs text-slate-500">Average events per day</div>
                </div>
              </div>

              {/* Summary */}
              <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl">
                <div className="text-sm font-medium text-slate-300 mb-2">Simulation Summary</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Events:</span>
                    <span className="text-white font-medium">{(simDays * simEventsPerDay).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Time Period:</span>
                    <span className="text-white font-medium">{Math.round(simDays / 30)} months</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Type:</span>
                    <span className={`font-medium ${simConnectionType === 'network' ? 'text-emerald-400' : 'text-blue-400'}`}>
                      {simConnectionType === 'network' ? `Network (${simPort}/${simProtocol})` : `API (${simApiOperations.length} ops)`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Flow:</span>
                    <span className="text-white font-medium truncate max-w-[150px]" title={`${simSource} → ${simTarget}`}>
                      {simSource || '?'} → {simTarget || '?'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowSimulator(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={simulateTraffic}
                  disabled={isSimulating || !simSource || !simTarget}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                    isSimulating || !simSource || !simTarget
                      ? 'bg-purple-600/50 text-purple-200 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-500 text-white'
                  }`}
                >
                  {isSimulating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Simulating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Simulate Traffic
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Least Privilege Analysis</h1>
          <p className="text-slate-400 mt-1">
            Compare allowed permissions vs actual usage for IAM Roles and Security Groups
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Action Buttons */}
          <div className="flex gap-2">
            {/* Simulate Traffic Button */}
            <button
              onClick={openSimulator}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Simulate Traffic</span>
            </button>

            {/* Sync from AWS Button */}
            <button
              onClick={handleSyncFromAWS}
              disabled={syncing}
              title="Fetch latest data directly from AWS (takes 30-60 seconds)"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                syncing
                  ? 'bg-blue-600/50 text-blue-200 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {syncing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  <span>Sync from AWS</span>
                </>
              )}
            </button>
            
            {/* Refresh Data Button */}
            <button
              onClick={handleRefresh}
              disabled={sgLoading || iamLoading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className={`w-4 h-4 ${(sgLoading || iamLoading) ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh Data</span>
            </button>
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

