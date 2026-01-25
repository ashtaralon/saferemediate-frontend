'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Globe, Server, Database, HardDrive, Zap, Network, Shield, Key, RefreshCw, Maximize2, Minimize2, AlertTriangle, Cloud, Info, ChevronDown, ChevronRight, Lock, Unlock, X, ArrowRight, ArrowLeft, Activity, Layers, Target, GitBranch, Search } from 'lucide-react';

// ============================================
// TYPES
// ============================================
type NodeType = 'internet' | 'compute' | 'database' | 'storage' | 'lambda' | 'api_gateway' | 'load_balancer' | 'dynamodb' | 'sqs' | 'sns' | 'iam_role' | 'security_group' | 'nacl' | 'network' | 'api_call';

interface ServiceNode {
  id: string;
  name: string;
  shortName: string;
  type: NodeType;
  instanceId?: string;
}

interface SGRule {
  direction: 'ingress' | 'egress';
  protocol: string;
  fromPort: number | null;
  toPort: number | null;
  portDisplay: string;
  source: string;
  sourceType: 'cidr' | 'security_group' | 'prefix_list' | 'self';
  status: 'used' | 'unused' | 'unobserved' | 'unknown';
  flowCount: number;
  lastSeen: string | null;
  isPublic: boolean;
}

interface SecurityCheckpoint {
  id: string;
  type: 'security_group' | 'iam_role' | 'nacl';
  name: string;
  shortName: string;
  usedCount: number;
  totalCount: number;
  gapCount: number;
  connectedSources: string[];
  connectedTargets: string[];
  rules?: SGRule[];
  vpcId?: string;
  subnetId?: string;
}

interface TrafficFlow {
  sourceId: string;
  targetId: string;
  sgId?: string;
  naclId?: string;
  roleId?: string;
  ports: string[];
  protocol: string;
  bytes: number;
  connections: number;
  isActive?: boolean;
}

interface SystemArchitecture {
  computeServices: ServiceNode[];
  resources: ServiceNode[];
  securityGroups: SecurityCheckpoint[];
  nacls: SecurityCheckpoint[];
  iamRoles: SecurityCheckpoint[];
  flows: TrafficFlow[];
  totalBytes: number;
  totalConnections: number;
  totalGaps: number;
}

// ============================================
// NODE CONFIGURATION
// ============================================
const NODE_CONFIG: Record<NodeType, { icon: typeof Globe; color: string; bg: string; border: string; text: string }> = {
  internet: { icon: Globe, color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'Internet' },
  compute: { icon: Server, color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'EC2' },
  database: { icon: Database, color: 'text-purple-400', bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'RDS' },
  storage: { icon: HardDrive, color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'S3' },
  lambda: { icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'Lambda' },
  api_gateway: { icon: Network, color: 'text-indigo-400', bg: 'bg-indigo-500/20', border: 'border-indigo-500/50', text: 'API GW' },
  load_balancer: { icon: Network, color: 'text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'ALB' },
  dynamodb: { icon: Database, color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'DynamoDB' },
  sqs: { icon: Network, color: 'text-rose-400', bg: 'bg-rose-500/20', border: 'border-rose-500/50', text: 'SQS' },
  sns: { icon: Network, color: 'text-violet-400', bg: 'bg-violet-500/20', border: 'border-violet-500/50', text: 'SNS' },
  iam_role: { icon: Key, color: 'text-pink-400', bg: 'bg-pink-500/20', border: 'border-pink-500/50', text: 'IAM' },
  security_group: { icon: Shield, color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'SG' },
  nacl: { icon: Lock, color: 'text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'NACL' },
  api_call: { icon: Zap, color: 'text-lime-400', bg: 'bg-lime-500/20', border: 'border-lime-500/50', text: 'API' },
  network: { icon: Network, color: 'text-slate-400', bg: 'bg-slate-500/20', border: 'border-slate-500/50', text: 'Network' },
};

// ============================================
// HELPER FUNCTIONS
// ============================================
function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function shortName(name: string, maxLen = 18): string {
  let short = name
    .replace('SafeRemediate-Test-', '')
    .replace('SafeRemediate-', '')
    .replace('saferemediate-test-', '')
    .replace('saferemediate-', '')
    .replace('arn:aws:rds:eu-west-1:745783559495:db:', '')
    .replace('arn:aws:s3:::', '')
    .replace('arn:aws:', '')
    .replace('cyntro-demo-', '')
    .replace('-745783559495', '');

  if (short.includes('/')) short = short.split('/').pop() || short;
  if (short.length > maxLen) short = short.substring(0, maxLen) + '...';
  return short;
}

function mapNodeType(type: string): NodeType {
  const t = type.toLowerCase();
  if (t === 'ec2' || t === 'ec2instance') return 'compute';
  if (t === 'lambdafunction' || t === 'lambda') return 'lambda';
  if (t === 'rdsinstance' || t === 'rds' || t.includes('database')) return 'database';
  if (t === 's3bucket' || t === 's3' || t.includes('bucket')) return 'storage';
  if (t.includes('dynamodb')) return 'dynamodb';
  if (t.includes('sqs')) return 'sqs';
  if (t.includes('sns')) return 'sns';
  if (t.includes('alb') || t.includes('elb') || t.includes('loadbalancer')) return 'load_balancer';
  if (t.includes('apigateway')) return 'api_gateway';
  if (t === 'iamrole' || t === 'iam_role') return 'iam_role';
  if (t === 'securitygroup' || t === 'security_group') return 'security_group';
  return 'network';
}

// ============================================
// SERVICE NODE COMPONENT
// ============================================
function ServiceNodeBox({
  node,
  position,
  flowInfo,
  isHighlighted,
  onHover,
  onClick,
}: {
  node: ServiceNode;
  position: 'left' | 'right';
  flowInfo?: { bytes: number; connections: number; ports: string[] };
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  onClick?: () => void;
}) {
  const config = NODE_CONFIG[node.type] || NODE_CONFIG.compute;
  const Icon = config.icon;

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 cursor-pointer
        ${isHighlighted ? `${config.bg} ${config.border} shadow-lg shadow-${config.color.replace('text-', '')}/20 scale-105` : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'}
        ${position === 'left' ? 'pr-6' : 'pl-6'}`}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      <div className={`w-11 h-11 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white truncate">{node.shortName}</div>
        {node.instanceId && (
          <div className="text-[10px] text-slate-500 font-mono">{node.instanceId}</div>
        )}
        <div className={`text-[10px] ${config.color} uppercase tracking-wider`}>{config.text}</div>
      </div>

      {/* Live traffic indicator */}
      {flowInfo && flowInfo.bytes > 0 && (
        <div className="absolute -top-2 -right-2 flex items-center gap-1 px-2 py-0.5 bg-emerald-500 rounded-full shadow-lg">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-white">{formatBytes(flowInfo.bytes)}</span>
        </div>
      )}

      {/* Connection point */}
      <div className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-colors
        ${isHighlighted ? 'bg-emerald-500' : 'bg-slate-600'} border-2 border-slate-500
        ${position === 'left' ? '-right-1.5' : '-left-1.5'}`} />
    </div>
  );
}

// ============================================
// RULE ROW COMPONENT
// ============================================
function RuleRow({ rule }: { rule: SGRule }): JSX.Element {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'used': return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', label: 'USED', icon: '✓' };
      case 'unused': return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', label: 'UNUSED', icon: '✗' };
      case 'unobserved': return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', label: 'GAP', icon: '?' };
      default: return { bg: 'bg-slate-700/50', border: 'border-slate-600', text: 'text-slate-400', label: 'NO DATA', icon: '—' };
    }
  };

  // Clean up port display - avoid "TCP/TCP/80" redundancy
  const formatPortDisplay = () => {
    const protocol = rule.protocol?.toUpperCase() || 'TCP';
    let portStr = rule.portDisplay || '';

    // Remove redundant protocol prefix if portDisplay already contains it
    if (portStr.toUpperCase().startsWith(protocol + '/')) {
      portStr = portStr.slice(protocol.length + 1);
    }
    if (portStr.toUpperCase().startsWith('TCP/') || portStr.toUpperCase().startsWith('UDP/')) {
      portStr = portStr.slice(4);
    }

    // Handle port ranges
    if (rule.fromPort !== null && rule.toPort !== null) {
      if (rule.fromPort === rule.toPort) {
        portStr = String(rule.fromPort);
      } else if (rule.fromPort === 0 && rule.toPort === 65535) {
        portStr = 'All';
      } else {
        portStr = `${rule.fromPort}-${rule.toPort}`;
      }
    }

    return portStr || 'All';
  };

  // Format source/destination for display
  const formatSource = () => {
    const src = rule.source || '';
    if (src === '0.0.0.0/0') return 'Any (0.0.0.0/0)';
    if (src === '::/0') return 'Any IPv6';
    if (src.startsWith('sg-')) return src.slice(0, 15) + '...';
    if (src.startsWith('pl-')) return 'Prefix List';
    // For CIDR, show shortened version
    if (src.includes('/')) {
      const [ip, mask] = src.split('/');
      if (ip.length > 12) return ip.slice(0, 10) + '.../' + mask;
    }
    return src.length > 15 ? src.slice(0, 12) + '...' : src;
  };

  const statusStyle = getStatusColor(rule.status);
  const isUsed = rule.status === 'used';
  const protocol = rule.protocol?.toUpperCase() || 'TCP';
  const port = formatPortDisplay();

  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs ${statusStyle.bg} border ${statusStyle.border} mb-1`}>
      {/* Protocol & Port */}
      <div className="flex items-center gap-1.5 min-w-[70px]">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
          protocol === 'TCP' ? 'bg-blue-500/20 text-blue-400' :
          protocol === 'UDP' ? 'bg-purple-500/20 text-purple-400' :
          protocol === 'ICMP' ? 'bg-cyan-500/20 text-cyan-400' :
          'bg-slate-500/20 text-slate-400'
        }`}>
          {protocol}
        </span>
        <span className="font-mono text-white font-medium">:{port}</span>
      </div>

      {/* Arrow */}
      <ArrowRight className="w-3 h-3 text-slate-500 flex-shrink-0" />

      {/* Source/Destination */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {rule.isPublic && (
          <span className="text-[8px] px-1.5 py-0.5 bg-red-500/30 text-red-300 rounded font-semibold flex-shrink-0">
            PUBLIC
          </span>
        )}
        <span className="font-mono text-slate-300 text-[10px] truncate" title={rule.source}>
          {formatSource()}
        </span>
      </div>

      {/* Traffic info */}
      {rule.flowCount > 0 && (
        <span className="text-[9px] text-emerald-400 font-medium flex-shrink-0">
          {rule.flowCount} hits
        </span>
      )}

      {/* Status badge */}
      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
        {statusStyle.label}
      </span>
    </div>
  );
}

// ============================================
// SECURITY GROUP PANEL
// ============================================
function SecurityGroupPanel({
  sg,
  isExpanded,
  onToggle,
  isHighlighted,
  onHover,
  onDetails,
}: {
  sg: SecurityCheckpoint;
  isExpanded: boolean;
  onToggle: () => void;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  onDetails?: () => void;
}) {
  const hasGap = sg.gapCount > 0;

  // Calculate rule stats
  const inboundRules = sg.rules?.filter(r => r.direction === 'ingress') || [];
  const outboundRules = sg.rules?.filter(r => r.direction === 'egress') || [];
  const publicRules = sg.rules?.filter(r => r.isPublic) || [];
  const usedRules = sg.rules?.filter(r => r.status === 'used') || [];
  const unusedRules = sg.rules?.filter(r => r.status === 'unused') || [];
  const hasPublicAccess = publicRules.length > 0;

  return (
    <div
      className={`relative rounded-xl border-2 transition-all duration-200 overflow-hidden
        ${isHighlighted ? 'bg-orange-500/20 border-orange-500/50 shadow-lg shadow-orange-500/20' : 'bg-slate-800/50 border-slate-700'}
        ${hasGap ? 'ring-2 ring-amber-400/50' : ''}
        ${hasPublicAccess ? 'ring-2 ring-red-400/30' : ''}`}
      onMouseEnter={() => onHover(sg.id)}
      onMouseLeave={() => onHover(null)}
      onDoubleClick={onDetails}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-700/30"
        onClick={onToggle}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          hasPublicAccess ? 'bg-red-500/20' : 'bg-orange-500/20'
        }`}>
          <Shield className={`w-5 h-5 ${hasPublicAccess ? 'text-red-400' : 'text-orange-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{sg.shortName}</div>
          <div className="flex items-center gap-2 text-[10px] flex-wrap">
            <span className="text-slate-400">
              {sg.totalCount} rules
            </span>
            {inboundRules.length > 0 && (
              <span className="text-blue-400">↓{inboundRules.length} in</span>
            )}
            {outboundRules.length > 0 && (
              <span className="text-emerald-400">↑{outboundRules.length} out</span>
            )}
            {hasPublicAccess && (
              <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[9px] font-semibold">
                {publicRules.length} PUBLIC
              </span>
            )}
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
      </div>

      {/* Expanded rules */}
      {isExpanded && sg.rules && (
        <div className="border-t border-slate-700 p-3 space-y-3 max-h-[400px] overflow-y-auto">
          {/* Quick Stats */}
          {sg.rules.length > 0 && (
            <div className="flex gap-2 pb-2 border-b border-slate-700/50">
              {usedRules.length > 0 && (
                <span className="text-[9px] px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded">
                  {usedRules.length} used
                </span>
              )}
              {unusedRules.length > 0 && (
                <span className="text-[9px] px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-400 rounded">
                  {unusedRules.length} unused
                </span>
              )}
              {usedRules.length === 0 && unusedRules.length === 0 && (
                <span className="text-[9px] px-2 py-1 bg-slate-500/10 border border-slate-500/30 text-slate-400 rounded">
                  No VPC Flow data yet
                </span>
              )}
            </div>
          )}

          {/* Inbound Rules */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ArrowLeft className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
                Inbound ({inboundRules.length})
              </span>
            </div>
            {inboundRules.length === 0 ? (
              <div className="text-xs text-slate-500 italic py-2 pl-5">No inbound rules</div>
            ) : (
              <div className="space-y-1">
                {inboundRules.map((rule, i) => (
                  <RuleRow key={`in-${i}`} rule={rule} />
                ))}
              </div>
            )}
          </div>

          {/* Outbound Rules */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                Outbound ({outboundRules.length})
              </span>
            </div>
            {outboundRules.length === 0 ? (
              <div className="text-xs text-slate-500 italic py-2 pl-5">No outbound rules</div>
            ) : (
              <div className="space-y-1">
                {outboundRules.map((rule, i) => (
                  <RuleRow key={`out-${i}`} rule={rule} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connection points */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 rounded-full bg-slate-600 border-2 border-slate-500" />
      <div className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 rounded-full bg-slate-600 border-2 border-slate-500" />
    </div>
  );
}

// ============================================
// IAM ROLE NODE
// ============================================
// ============================================
// NACL NODE
// ============================================
function NACLNode({
  nacl,
  isHighlighted,
  onHover,
  onClick,
}: {
  nacl: SecurityCheckpoint;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  onClick?: () => void;
}) {
  const hasGap = nacl.gapCount > 0;

  return (
    <div
      className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer min-w-[110px]
        ${isHighlighted ? 'bg-cyan-500/20 border-cyan-500/50 shadow-lg shadow-cyan-500/20 scale-105' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'}
        ${hasGap ? 'ring-2 ring-amber-400/50' : ''}`}
      onMouseEnter={() => onHover(nacl.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center mb-2">
        <Lock className="w-6 h-6 text-cyan-400" />
      </div>
      <div className="text-xs font-semibold text-white text-center truncate max-w-[100px]">
        {nacl.shortName}
      </div>
      <div className="text-[11px] text-slate-400">
        Subnet ACL
      </div>
      {nacl.vpcId && (
        <div className="text-[9px] text-slate-500 mt-1 truncate max-w-[100px]">
          {nacl.vpcId.slice(-12)}
        </div>
      )}

      {/* Connection points */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 rounded-full bg-slate-600 border-2 border-slate-500" />
      <div className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 rounded-full bg-slate-600 border-2 border-slate-500" />
    </div>
  );
}

// ============================================
// IAM ROLE NODE
// ============================================
function IAMRoleNode({
  role,
  isHighlighted,
  onHover,
  onClick,
}: {
  role: SecurityCheckpoint;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  onClick?: () => void;
}) {
  const hasGap = role.gapCount > 0;
  const hasData = role.totalCount > 0;
  const usagePercent = hasData ? Math.round((role.usedCount / role.totalCount) * 100) : 0;

  // Determine status color based on usage
  const getStatusColor = () => {
    if (!hasData) return { bg: 'bg-slate-500/20', text: 'text-slate-400', ring: '' };
    if (usagePercent >= 80) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', ring: '' };
    if (usagePercent >= 50) return { bg: 'bg-amber-500/20', text: 'text-amber-400', ring: 'ring-2 ring-amber-400/30' };
    return { bg: 'bg-red-500/20', text: 'text-red-400', ring: 'ring-2 ring-red-400/30' };
  };

  const statusColor = getStatusColor();

  return (
    <div
      className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer min-w-[120px]
        ${isHighlighted ? 'bg-pink-500/20 border-pink-500/50 shadow-lg shadow-pink-500/20 scale-105' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'}
        ${hasGap ? statusColor.ring : ''}`}
      onMouseEnter={() => onHover(role.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${hasData ? statusColor.bg : 'bg-pink-500/20'}`}>
        <Key className={`w-6 h-6 ${hasData ? statusColor.text : 'text-pink-400'}`} />
      </div>
      <div className="text-xs font-semibold text-white text-center truncate max-w-[110px]">
        {role.shortName}
      </div>

      {hasData ? (
        <>
          {/* Permission counts */}
          <div className="flex items-center gap-1 mt-1">
            <span className={`text-[11px] font-bold ${statusColor.text}`}>
              {role.usedCount}/{role.totalCount}
            </span>
            <span className="text-[10px] text-slate-500">perms</span>
          </div>

          {/* Usage bar */}
          <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usagePercent >= 80 ? 'bg-emerald-500' :
                usagePercent >= 50 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>

          {/* Usage percent or gap warning */}
          {hasGap ? (
            <div className="flex items-center gap-1 text-[9px] text-amber-400 mt-1">
              <AlertTriangle className="w-3 h-3" />
              {role.gapCount} unused
            </div>
          ) : (
            <div className="text-[9px] text-emerald-400 mt-1">
              {usagePercent}% utilized
            </div>
          )}
        </>
      ) : (
        <div className="text-[10px] text-slate-500 mt-1">
          Analyzing...
        </div>
      )}

      {/* Connection points */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 rounded-full bg-slate-600 border-2 border-slate-500" />
      <div className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 rounded-full bg-slate-600 border-2 border-slate-500" />
    </div>
  );
}

// ============================================
// BLAST RADIUS DATA TYPES
// ============================================
interface BlastRadiusNode {
  id: string;
  name: string;
  type: string;
  depth: number;
  impact_score?: number;
  relationship?: string;
}

interface BlastRadiusData {
  resource_id: string;
  resource_name: string;
  resource_type: string;
  upstream: BlastRadiusNode[];
  downstream: BlastRadiusNode[];
  total_impact_score: number;
  critical_paths: { path: string[]; risk_level: string }[];
}

// ============================================
// SERVICE DETAILS POPUP
// ============================================
function ServiceDetailsPopup({
  service,
  serviceType,
  architecture,
  onClose,
}: {
  service: ServiceNode | SecurityCheckpoint;
  serviceType: 'compute' | 'resource' | 'security_group' | 'nacl' | 'iam_role' | 'api_call';
  architecture: SystemArchitecture;
  onClose: () => void;
}) {
  const [blastRadius, setBlastRadius] = useState<BlastRadiusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Infer AWS service type from name when type is Unknown
  const inferTypeFromName = (name: string, type: string): string => {
    const t = (type || '').toLowerCase()
    if (t !== 'unknown' && t !== '') return type

    const n = (name || '').toLowerCase()
    if (n.includes('frontend') || n.includes('backend') || n.includes('app-')) return 'EC2'
    if (n.includes('lambda') || n.includes('function')) return 'Lambda'
    if (n.includes('-db') || n.includes('database') || n.includes('rds')) return 'RDS'
    if (n.includes('s3') || n.includes('bucket')) return 'S3'
    if (n.includes('dynamodb') || n.includes('table')) return 'DynamoDB'
    if (n.includes('resource-explorer')) return 'ResourceExplorer'
    if (n.includes('cloudwatch')) return 'CloudWatch'
    if (n.includes('root') || n.includes('iam') || n.includes('role')) return 'IAM'
    if (n.includes('sg-') || n.includes('security')) return 'SecurityGroup'
    if (n.includes('vpc-') || n.includes('subnet-')) return 'VPC'
    if (n.includes('secret')) return 'SecretsManager'
    if (n.includes('api') || n.includes('gateway')) return 'APIGateway'
    if (n.includes('ecs') || n.includes('fargate')) return 'ECS'
    if (n.includes('eks')) return 'EKS'
    if (n.includes('sqs')) return 'SQS'
    if (n.includes('sns')) return 'SNS'
    return type
  }

  // Get the icon for a node type
  const getNodeIcon = (type: string, name?: string) => {
    const t = inferTypeFromName(name || '', type).toLowerCase();
    if (t.includes('ec2') || t === 'compute') return <Server className="w-4 h-4" />;
    if (t.includes('lambda')) return <Zap className="w-4 h-4" />;
    if (t.includes('rds') || t.includes('database')) return <Database className="w-4 h-4" />;
    if (t.includes('s3') || t.includes('storage') || t.includes('bucket')) return <HardDrive className="w-4 h-4" />;
    if (t.includes('security') || t.includes('sg')) return <Shield className="w-4 h-4" />;
    if (t.includes('iam') || t.includes('role')) return <Key className="w-4 h-4" />;
    if (t.includes('nacl') || t.includes('acl')) return <Lock className="w-4 h-4" />;
    if (t.includes('dynamodb')) return <Database className="w-4 h-4" />;
    if (t.includes('sqs') || t.includes('sns')) return <Network className="w-4 h-4" />;
    if (t.includes('api') || t.includes('gateway')) return <Globe className="w-4 h-4" />;
    if (t.includes('resourceexplorer') || t.includes('explorer')) return <Search className="w-4 h-4" />;
    if (t.includes('cloudwatch')) return <Activity className="w-4 h-4" />;
    return <Layers className="w-4 h-4" />;
  };

  // Get color for a node type
  const getNodeColor = (type: string, name?: string) => {
    const t = inferTypeFromName(name || '', type).toLowerCase();
    if (t.includes('ec2') || t === 'compute') return 'text-blue-400 bg-blue-500/20 border-blue-500/50';
    if (t.includes('lambda')) return 'text-amber-400 bg-amber-500/20 border-amber-500/50';
    if (t.includes('rds') || t.includes('database')) return 'text-purple-400 bg-purple-500/20 border-purple-500/50';
    if (t.includes('s3') || t.includes('storage') || t.includes('bucket')) return 'text-green-400 bg-green-500/20 border-green-500/50';
    if (t.includes('security') || t.includes('sg')) return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
    if (t.includes('iam') || t.includes('role')) return 'text-pink-400 bg-pink-500/20 border-pink-500/50';
    if (t.includes('nacl') || t.includes('acl')) return 'text-cyan-400 bg-cyan-500/20 border-cyan-500/50';
    if (t.includes('resourceexplorer') || t.includes('explorer')) return 'text-indigo-400 bg-indigo-500/20 border-indigo-500/50';
    if (t.includes('cloudwatch')) return 'text-teal-400 bg-teal-500/20 border-teal-500/50';
    return 'text-slate-400 bg-slate-500/20 border-slate-500/50';
  };

  // Fetch blast radius data
  useEffect(() => {
    // Helper to check if a string is an external IP (not internal AWS)
    const isExternalIP = (str: string): boolean => {
      if (!str) return false
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
      const isIP = ipv4Regex.test(str)
      if (!isIP) return false
      const parts = str.split('.').map(Number)
      if (parts.length === 4) {
        if (parts[0] === 10) return false // AWS VPC
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false
        if (parts[0] === 192 && parts[1] === 168) return false
        if (parts[0] === 127) return false
      }
      return true
    }

    // Helper to check if a service is a real AWS resource (not external IP or unknown)
    const isRealAWSService = (name: string, type: string, arn?: string): boolean => {
      if (!name) return false
      const nameLower = name.toLowerCase()
      const typeLower = (type || '').toLowerCase()
      const arnLower = (arn || '').toLowerCase()

      // Filter out if name is literally "Unknown" or empty
      if (nameLower === 'unknown' || nameLower === '' || nameLower === 'null') return false

      // Filter out external IPs
      if (isExternalIP(name)) return false

      // Check if it's just an IP in the name
      if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(name) && (typeLower === 'unknown' || !type)) return false

      // Known AWS types are always valid
      const awsTypes = ['ec2', 'lambda', 'rds', 's3', 'dynamodb', 'elasticloadbalancing',
        'securitygroup', 'iam', 'role', 'vpc', 'subnet', 'nacl', 'ecs', 'eks', 'fargate',
        'sqs', 'sns', 'kinesis', 'elasticache', 'secretsmanager', 'apigateway', 'cloudfront',
        'resource-explorer', 'cloudwatch', 'sns', 'sqs', 'route53', 'ec2instance', 'instance']
      if (awsTypes.some(t => typeLower.includes(t))) return true

      // Check ARN for service type (useful when type is "Unknown")
      if (arnLower.includes('arn:aws:')) {
        if (arnLower.includes(':ec2:') && arnLower.includes('instance')) return true
        if (arnLower.includes(':lambda:')) return true
        if (arnLower.includes(':rds:')) return true
        if (arnLower.includes(':s3:')) return true
        if (arnLower.includes(':dynamodb:')) return true
        if (arnLower.includes(':iam:') && arnLower.includes('role')) return true
        if (arnLower.includes(':iam:') && arnLower.includes('instance-profile')) return true
        if (arnLower.includes(':elasticloadbalancing:')) return true
        if (arnLower.includes(':ecs:')) return true
        if (arnLower.includes(':eks:')) return true
      }

      // Check for AWS ARN patterns
      if (name.includes('arn:aws:')) return true

      // Check for AWS ID patterns in name
      if (/i-[a-f0-9]{8,}/.test(nameLower)) return true
      if (nameLower.includes('sg-') || nameLower.includes('subnet-') || nameLower.includes('vpc-')) return true

      // Check for known AWS service name patterns
      if (nameLower.includes('saferemediate') || nameLower.includes('cyntro') ||
          nameLower.includes('frontend') || nameLower.includes('backend') ||
          nameLower.includes('app-') || nameLower.includes('-app') ||
          nameLower.includes('lambda') || nameLower.includes('function') ||
          nameLower.includes('bucket') || nameLower.includes('table') ||
          nameLower.includes('database') || nameLower.includes('-db') ||
          nameLower.includes('resource-explorer')) return true

      // Filter out if type is Unknown and name doesn't match known patterns
      if (typeLower === 'unknown') return false

      return true
    }

    const fetchBlastRadius = async () => {
      setLoading(true);
      setError(null);

      try {
        // Map service type to backend resource type for better query matching
        const getResourceType = () => {
          if (serviceType === 'compute') return 'EC2';
          if (serviceType === 'resource') {
            // Check the service's actual type if available
            const svc = service as any;
            if (svc.type) return svc.type;
            // Guess from name/id
            if (service.id.includes('rds') || service.name.toLowerCase().includes('db')) return 'RDSInstance';
            if (service.id.includes('s3') || service.id.includes('bucket')) return 'S3Bucket';
            if (service.id.includes('dynamodb')) return 'DynamoDBTable';
            return 'S3Bucket'; // Default for resources
          }
          if (serviceType === 'security_group') return 'SecurityGroup';
          if (serviceType === 'nacl') return 'NACL';
          if (serviceType === 'iam_role') return 'IAMRole';
          // For api_call, query the underlying resource type, not APICall
          if (serviceType === 'api_call') {
            // API call nodes are named after their target resource
            const name = service.name.toLowerCase();
            const id = service.id.toLowerCase();
            if (name.includes('db') || name.includes('rds') || id.includes('rds')) return 'RDSInstance';
            if (name.includes('s3') || name.includes('bucket') || id.includes('s3')) return 'S3Bucket';
            if (name.includes('dynamo') || id.includes('dynamo')) return 'DynamoDBTable';
            return 'RDSInstance'; // Default for API calls (most likely DB)
          }
          return '';
        };
        const resourceType = getResourceType();

        // For api_call, strip the 'api-' prefix to get the real resource ID
        const queryResourceId = serviceType === 'api_call' && service.id.startsWith('api-')
          ? service.id.slice(4)  // Remove 'api-' prefix
          : service.id;

        // Use blast-radius API (the working one)
        const res = await fetch(`/api/proxy/blast-radius/${encodeURIComponent(queryResourceId)}?resource_type=${resourceType}&_t=${Date.now()}`);

        if (res.ok) {
          const data = await res.json();
          // Convert blast-radius API response to expected format
          const affectedResources = data.affected_resources || [];
          const upstream: BlastRadiusNode[] = [];
          const downstream: BlastRadiusNode[] = [];

          // All affected resources go into downstream (blast radius = services affected if this fails)
          // For DB/S3: services that depend ON this resource would be affected
          // For compute: services this compute connects to would be affected
          // Filter out external IPs and unknown external traffic
          affectedResources.forEach((r: any) => {
            const name = r.name || r.id || 'Unknown';
            const type = r.type || 'Unknown';
            const arn = r.arn || '';
            // Skip external IPs and unknown external traffic
            if (!isRealAWSService(name, type, arn)) {
              console.log('[BlastRadius] Filtering out:', name, type);
              return;
            }
            // Infer type from ARN if type is Unknown
            let inferredType = type;
            if (type === 'Unknown' && arn) {
              if (arn.includes(':ec2:') && arn.includes('instance')) inferredType = 'EC2';
              else if (arn.includes(':lambda:')) inferredType = 'Lambda';
              else if (arn.includes(':rds:')) inferredType = 'RDS';
              else if (arn.includes(':s3:')) inferredType = 'S3';
              else if (arn.includes(':iam:') && arn.includes('role')) inferredType = 'IAMRole';
              else if (arn.includes(':iam:') && arn.includes('instance-profile')) inferredType = 'InstanceProfile';
            }
            downstream.push({
              id: r.id || r.name,
              name,
              type: inferredType,
              depth: 1,
              relationship: serviceType === 'compute' ? 'DEPENDS_ON' : 'CONNECTS_TO',
            });
          });

          setBlastRadius({
            resource_id: service.id,
            resource_name: service.name,
            resource_type: serviceType,
            upstream,
            downstream,
            total_impact_score: data.total_affected * 10,
            critical_paths: [],
          });
        } else {
          // Build from local architecture data
          buildLocalBlastRadius();
        }
      } catch (err) {
        console.error('[ServiceDetailsPopup] Error fetching blast radius:', err);
        buildLocalBlastRadius();
      } finally {
        setLoading(false);
      }
    };

    // Build blast radius from local architecture data
    const buildLocalBlastRadius = () => {
      const upstream: BlastRadiusNode[] = [];
      const downstream: BlastRadiusNode[] = [];

      // Find flows involving this service
      architecture.flows.forEach(flow => {
        if (flow.sourceId === service.id || flow.sourceId.includes(service.id.slice(-12))) {
          // This service is the source - target is downstream
          const target = architecture.resources.find(r => r.id === flow.targetId);
          if (target && isRealAWSService(target.name, target.type)) {
            downstream.push({
              id: target.id,
              name: target.name,
              type: target.type,
              depth: 1,
              relationship: 'SENDS_TO',
            });
          }
          // SG is also in the path
          if (flow.sgId) {
            const sg = architecture.securityGroups.find(s => s.id === flow.sgId);
            if (sg) {
              downstream.push({ id: sg.id, name: sg.name, type: 'SecurityGroup', depth: 1, relationship: 'THROUGH_SG' });
            }
          }
        }

        if (flow.targetId === service.id || flow.targetId.includes(service.id.slice(-12))) {
          // This service is the target - source is upstream
          const source = architecture.computeServices.find(c => c.id === flow.sourceId);
          if (source && isRealAWSService(source.name, source.type)) {
            upstream.push({
              id: source.id,
              name: source.name,
              type: source.type,
              depth: 1,
              relationship: 'RECEIVES_FROM',
            });
          }
        }
      });

      // For compute services, also add SG and IAM as dependencies
      if (serviceType === 'compute') {
        const connectedFlows = architecture.flows.filter(f => f.sourceId === service.id || f.sourceId.includes(service.id.slice(-12)));
        connectedFlows.forEach(flow => {
          if (flow.sgId) {
            const sg = architecture.securityGroups.find(s => s.id === flow.sgId);
            if (sg && !upstream.find(u => u.id === sg.id)) {
              upstream.push({ id: sg.id, name: sg.name, type: 'SecurityGroup', depth: 1, relationship: 'PROTECTED_BY' });
            }
          }
          if (flow.roleId) {
            const role = architecture.iamRoles.find(r => r.id === flow.roleId);
            if (role && !upstream.find(u => u.id === role.id)) {
              upstream.push({ id: role.id, name: role.name, type: 'IAMRole', depth: 1, relationship: 'ASSUMES' });
            }
          }
        });
      }

      setBlastRadius({
        resource_id: service.id,
        resource_name: service.name,
        resource_type: serviceType,
        upstream,
        downstream,
        total_impact_score: downstream.length * 10,
        critical_paths: [],
      });
    };

    fetchBlastRadius();
  }, [service.id, service.name, serviceType, architecture]);

  // Get related flows
  const relatedFlows = useMemo(() => {
    return architecture.flows.filter(f =>
      f.sourceId === service.id || f.targetId === service.id ||
      f.sourceId.includes(service.id.slice(-12)) || f.targetId.includes(service.id.slice(-12)) ||
      f.sgId === service.id || f.roleId === service.id
    );
  }, [architecture.flows, service.id]);

  // Calculate traffic stats
  const trafficStats = useMemo(() => {
    const totalBytes = relatedFlows.reduce((sum, f) => sum + f.bytes, 0);
    const totalConnections = relatedFlows.reduce((sum, f) => sum + f.connections, 0);
    const uniquePorts = [...new Set(relatedFlows.flatMap(f => f.ports))];
    return { totalBytes, totalConnections, uniquePorts };
  }, [relatedFlows]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between bg-gradient-to-r from-slate-800 to-slate-900">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${getNodeColor(serviceType)}`}>
              {getNodeIcon(serviceType)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{service.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 uppercase">
                  {serviceType.replace('_', ' ')}
                </span>
                <span className="text-xs text-slate-500 font-mono">{service.id.slice(-20)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
              <span className="ml-3 text-slate-400">Loading dependencies...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Blast Radius Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-2 text-amber-400 mb-2">
                    <Target className="w-5 h-5" />
                    <span className="text-sm font-semibold">Blast Radius</span>
                  </div>
                  <div className="text-3xl font-bold text-white">{blastRadius?.downstream?.length || 0}</div>
                  <div className="text-xs text-slate-500 mt-1">downstream services affected</div>
                </div>

                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-2 text-blue-400 mb-2">
                    <GitBranch className="w-5 h-5" />
                    <span className="text-sm font-semibold">Dependencies</span>
                  </div>
                  <div className="text-3xl font-bold text-white">{blastRadius?.upstream?.length || 0}</div>
                  <div className="text-xs text-slate-500 mt-1">upstream dependencies</div>
                </div>

                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-2 text-emerald-400 mb-2">
                    <Activity className="w-5 h-5" />
                    <span className="text-sm font-semibold">Traffic</span>
                  </div>
                  <div className="text-3xl font-bold text-white">{formatBytes(trafficStats.totalBytes)}</div>
                  <div className="text-xs text-slate-500 mt-1">{trafficStats.totalConnections} connections</div>
                </div>
              </div>

              {/* Impact Score */}
              {blastRadius && blastRadius.total_impact_score > 0 && (
                <div className={`rounded-xl p-4 border ${
                  blastRadius.total_impact_score > 50 ? 'bg-red-500/10 border-red-500/30' :
                  blastRadius.total_impact_score > 20 ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-emerald-500/10 border-emerald-500/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-5 h-5 ${
                        blastRadius.total_impact_score > 50 ? 'text-red-400' :
                        blastRadius.total_impact_score > 20 ? 'text-amber-400' : 'text-emerald-400'
                      }`} />
                      <span className="font-semibold text-white">Impact Score</span>
                    </div>
                    <span className={`text-2xl font-bold ${
                      blastRadius.total_impact_score > 50 ? 'text-red-400' :
                      blastRadius.total_impact_score > 20 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {blastRadius.total_impact_score}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {blastRadius.total_impact_score > 50 ? 'High risk - failure affects critical services' :
                     blastRadius.total_impact_score > 20 ? 'Medium risk - some services may be affected' :
                     'Low risk - minimal downstream impact'}
                  </p>
                </div>
              )}

              {/* API Actions - shown for api_call type - Simulated from VPC traffic */}
              {serviceType === 'api_call' && (
                <div className="bg-lime-500/10 rounded-xl p-4 border border-lime-500/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-lime-400" />
                      <h3 className="text-sm font-semibold text-white">API Actions</h3>
                    </div>
                    <span className="text-[10px] px-2 py-1 rounded bg-lime-500/20 text-lime-400 border border-lime-500/30">
                      Simulated from VPC Traffic
                    </span>
                  </div>

                  {/* Traffic basis info */}
                  <div className="grid grid-cols-2 gap-2 mb-4 p-2 rounded-lg bg-slate-800/50">
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">{formatBytes((service as any).totalBytes || 0)}</div>
                      <div className="text-[10px] text-slate-400">Traffic Observed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">{((service as any).totalConnections || 0).toLocaleString()}</div>
                      <div className="text-[10px] text-slate-400">Connections</div>
                    </div>
                  </div>

                  {/* API actions derived from traffic */}
                  <div className="grid grid-cols-2 gap-2">
                    {((service as any).apiActions || []).map((action: { action: string; count: number }, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 border border-slate-700">
                        <span className="text-sm text-white font-mono">{action.action}</span>
                        <span className="text-xs text-lime-400 font-bold">{action.count.toLocaleString()}x</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400">
                    <span>Total: {((service as any).totalCalls || 0).toLocaleString()} estimated calls</span>
                    <span>Based on VPC Flow Logs</span>
                  </div>

                  <p className="text-[10px] text-slate-500 mt-2 italic">
                    * API calls estimated from observed network traffic patterns. Enable CloudTrail for actual API logging.
                  </p>
                </div>
              )}

              {/* Upstream Dependencies */}
              {blastRadius && blastRadius.upstream.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-semibold text-white">This Service Depends On ({blastRadius.upstream.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {blastRadius.upstream.map((node, i) => {
                      const displayType = inferTypeFromName(node.name, node.type);
                      return (
                        <div key={`upstream-${i}`} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getNodeColor(node.type, node.name)}`}>
                            {getNodeIcon(node.type, node.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">{node.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{displayType}</span>
                              {node.relationship && (
                                <span className="text-[10px] text-blue-400">{node.relationship}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Downstream - Blast Radius */}
              {blastRadius && blastRadius.downstream.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowLeft className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-white">Services That Depend On This (Blast Radius: {blastRadius.downstream.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {blastRadius.downstream.map((node, i) => {
                      const displayType = inferTypeFromName(node.name, node.type);
                      return (
                        <div key={`downstream-${i}`} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-amber-500/20">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getNodeColor(node.type, node.name)}`}>
                            {getNodeIcon(node.type, node.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">{node.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{displayType}</span>
                              {node.depth && node.depth > 1 && (
                                <span className="text-[10px] text-amber-400">depth: {node.depth}</span>
                              )}
                            </div>
                          </div>
                          {node.impact_score && (
                            <div className="text-amber-400 text-sm font-bold">+{node.impact_score}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Active Connections */}
              {relatedFlows.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white">Active Connections ({relatedFlows.length})</h3>
                  </div>
                  <div className="space-y-2">
                    {relatedFlows.slice(0, 5).map((flow, i) => {
                      const source = architecture.computeServices.find(c => c.id === flow.sourceId);
                      const target = architecture.resources.find(r => r.id === flow.targetId);
                      const sg = architecture.securityGroups.find(s => s.id === flow.sgId);
                      const role = architecture.iamRoles.find(r => r.id === flow.roleId);
                      // Show API badge for resources that have API calls (based on traffic)
                      const targetType = (target?.type || '').toLowerCase();
                      const hasApiCalls = targetType === 'database' || targetType === 'storage' || targetType === 'dynamodb';
                      return (
                        <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 text-sm">
                          <span className="text-blue-400 font-medium">{source?.shortName || flow.sourceId.slice(-12)}</span>
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                          {sg && (
                            <>
                              <span className="text-orange-400 text-xs">[SG]</span>
                              <ArrowRight className="w-3 h-3 text-slate-500" />
                            </>
                          )}
                          {role && (
                            <>
                              <span className="text-pink-400 text-xs">[IAM]</span>
                              <ArrowRight className="w-3 h-3 text-slate-500" />
                            </>
                          )}
                          {hasApiCalls && (
                            <>
                              <span className="text-lime-400 text-xs">[API]</span>
                              <ArrowRight className="w-3 h-3 text-slate-500" />
                            </>
                          )}
                          <span className="text-purple-400 font-medium">{target?.shortName || flow.targetId.slice(-12)}</span>
                          <span className="ml-auto text-emerald-400 font-mono text-xs">{formatBytes(flow.bytes)}</span>
                        </div>
                      );
                    })}
                    {relatedFlows.length > 5 && (
                      <div className="text-center text-xs text-slate-500 py-2">
                        +{relatedFlows.length - 5} more connections
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No Dependencies Message */}
              {(!blastRadius || (blastRadius.upstream.length === 0 && blastRadius.downstream.length === 0)) && relatedFlows.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No dependencies or connections found for this service</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// ANIMATED TRAFFIC LINE
// ============================================
function AnimatedTrafficLine({
  x1, y1, x2, y2,
  isActive,
  isHighlighted,
  flowData,
  animate,
  trafficIntensity = 'medium',
}: {
  x1: number; y1: number; x2: number; y2: number;
  isActive: boolean;
  isHighlighted: boolean;
  flowData?: TrafficFlow;
  animate: boolean;
  trafficIntensity?: 'low' | 'medium' | 'high';
}) {
  const pathId = useMemo(() => `path-${Math.random().toString(36).substr(2, 9)}`, []);
  const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

  // Speed based on intensity - faster = more traffic (slower base for better visibility)
  const baseDuration = Math.max(3, length / 80);
  const duration = trafficIntensity === 'high' ? baseDuration * 0.7 :
                   trafficIntensity === 'low' ? baseDuration * 1.3 : baseDuration;

  // More particles for higher traffic
  const particleCount = trafficIntensity === 'high' ? 5 : trafficIntensity === 'medium' ? 3 : 2;
  const particleOffsets = Array.from({ length: particleCount }, (_, i) => i / particleCount);

  // Colors based on state
  const lineColor = isHighlighted ? '#10b981' : isActive ? '#3b82f6' : '#475569';
  const particleColor = isHighlighted ? '#10b981' : '#3b82f6';
  const glowColor = isHighlighted ? '#34d399' : '#60a5fa';

  return (
    <g>
      {/* Glow effect for active lines */}
      {isActive && (
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={glowColor}
          strokeWidth={isHighlighted ? 12 : 6}
          opacity={isHighlighted ? 0.4 : 0.2}
          strokeLinecap="round"
        />
      )}

      {/* Main line */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={lineColor}
        strokeWidth={isHighlighted ? 3 : 2}
        strokeLinecap="round"
        className="transition-all duration-300"
      />

      {/* Animated particles - always show when animate is true */}
      {animate && (
        <>
          {/* Define the path for animation */}
          <path
            id={pathId}
            d={`M ${x1} ${y1} L ${x2} ${y2}`}
            fill="none"
            stroke="transparent"
          />

          {/* Main particles */}
          {particleOffsets.map((offset, i) => (
            <g key={i}>
              {/* Outer glow */}
              <circle r={isHighlighted ? 8 : 6} fill={glowColor} opacity={0.3}>
                <animateMotion
                  dur={`${duration}s`}
                  repeatCount="indefinite"
                  begin={`${offset * duration}s`}
                >
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
              {/* Core particle */}
              <circle r={isHighlighted ? 5 : 4} fill={particleColor} opacity={isHighlighted ? 1 : 0.9}>
                <animateMotion
                  dur={`${duration}s`}
                  repeatCount="indefinite"
                  begin={`${offset * duration}s`}
                >
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
              {/* Inner bright core */}
              <circle r={isHighlighted ? 2 : 1.5} fill="#ffffff" opacity={0.8}>
                <animateMotion
                  dur={`${duration}s`}
                  repeatCount="indefinite"
                  begin={`${offset * duration}s`}
                >
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
            </g>
          ))}
        </>
      )}

      {/* Port/Protocol label */}
      {isHighlighted && flowData && flowData.ports.length > 0 && (
        <g>
          <rect
            x={(x1 + x2) / 2 - 35}
            y={(y1 + y2) / 2 - 14}
            width="70"
            height="28"
            rx="6"
            fill="#0f172a"
            stroke={particleColor}
            strokeWidth="2"
          />
          <text
            x={(x1 + x2) / 2}
            y={(y1 + y2) / 2 + 5}
            textAnchor="middle"
            className="text-[11px] fill-white font-mono font-bold"
          >
            {flowData.ports[0] || 'TCP'}
          </text>
        </g>
      )}

      {/* Arrow at end */}
      <polygon
        points={`${x2},${y2} ${x2 - 12},${y2 - 6} ${x2 - 12},${y2 + 6}`}
        fill={lineColor}
        transform={`rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI}, ${x2}, ${y2})`}
      />
    </g>
  );
}

// ============================================
// CONNECTION LINES SVG
// ============================================
function ConnectionLinesSVG({
  architecture,
  hoveredId,
  containerRef,
  animate,
}: {
  architecture: SystemArchitecture;
  hoveredId: string | null;
  containerRef: React.RefObject<HTMLDivElement>;
  animate: boolean;
}) {
  const [lines, setLines] = useState<Array<{
    x1: number; y1: number; x2: number; y2: number;
    flow: TrafficFlow;
    isHighlighted: boolean;
    isActive: boolean;
    trafficIntensity: 'low' | 'medium' | 'high';
  }>>([]);

  // Calculate traffic intensity thresholds
  const maxBytes = useMemo(() => {
    return Math.max(...architecture.flows.map(f => f.bytes), 1);
  }, [architecture.flows]);

  const getTrafficIntensity = useCallback((bytes: number): 'low' | 'medium' | 'high' => {
    const ratio = bytes / maxBytes;
    if (ratio > 0.6) return 'high';
    if (ratio > 0.2) return 'medium';
    return 'low';
  }, [maxBytes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateLines = () => {
      if (!container) return;

      const getNodeCenter = (el: Element | null, side: 'left' | 'right'): { x: number; y: number } | null => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        return {
          x: side === 'right' ? rect.right - containerRect.left - 6 : rect.left - containerRect.left + 6,
          y: rect.top + rect.height / 2 - containerRect.top,
        };
      };

      const newLines: typeof lines = [];

      architecture.flows.forEach(flow => {
        const sourceEl = container.querySelector(`[data-compute-id="${flow.sourceId}"]`);
        const targetEl = container.querySelector(`[data-resource-id="${flow.targetId}"]`);
        const sgEl = flow.sgId ? container.querySelector(`[data-sg-id="${flow.sgId}"]`) : null;
        const naclEl = flow.naclId ? container.querySelector(`[data-nacl-id="${flow.naclId}"]`) : null;
        const roleEl = flow.roleId ? container.querySelector(`[data-role-id="${flow.roleId}"]`) : null;
        // Find API call node for this target resource
        const apiEl = container.querySelector(`[data-api-id="${flow.targetId}"]`);

        const sourcePos = getNodeCenter(sourceEl, 'right');
        const targetPos = getNodeCenter(targetEl, 'left');

        if (!sourcePos || !targetPos) return;

        const isHighlighted = hoveredId === flow.sourceId || hoveredId === flow.targetId ||
          hoveredId === flow.sgId || hoveredId === flow.naclId || hoveredId === flow.roleId ||
          hoveredId === `api-${flow.targetId}`;
        // All flows from traffic edges are active
        const isActive = true;
        const trafficIntensity = getTrafficIntensity(flow.bytes);

        // Build checkpoint chain: Compute -> SG -> NACL -> IAM -> API -> Resource
        const checkpoints: { el: Element; posL: { x: number; y: number }; posR: { x: number; y: number } }[] = [];

        if (sgEl) {
          const posL = getNodeCenter(sgEl, 'left');
          const posR = getNodeCenter(sgEl, 'right');
          if (posL && posR) checkpoints.push({ el: sgEl, posL, posR });
        }
        if (naclEl) {
          const posL = getNodeCenter(naclEl, 'left');
          const posR = getNodeCenter(naclEl, 'right');
          if (posL && posR) checkpoints.push({ el: naclEl, posL, posR });
        }
        if (roleEl) {
          const posL = getNodeCenter(roleEl, 'left');
          const posR = getNodeCenter(roleEl, 'right');
          if (posL && posR) checkpoints.push({ el: roleEl, posL, posR });
        }
        // Add API call checkpoint after IAM role
        if (apiEl) {
          const posL = getNodeCenter(apiEl, 'left');
          const posR = getNodeCenter(apiEl, 'right');
          if (posL && posR) checkpoints.push({ el: apiEl, posL, posR });
        }

        // Draw lines through all checkpoints
        if (checkpoints.length > 0) {
          // Source to first checkpoint
          newLines.push({ x1: sourcePos.x, y1: sourcePos.y, x2: checkpoints[0].posL.x, y2: checkpoints[0].posL.y, flow, isHighlighted, isActive, trafficIntensity });

          // Between checkpoints
          for (let i = 0; i < checkpoints.length - 1; i++) {
            newLines.push({ x1: checkpoints[i].posR.x, y1: checkpoints[i].posR.y, x2: checkpoints[i + 1].posL.x, y2: checkpoints[i + 1].posL.y, flow, isHighlighted, isActive, trafficIntensity });
          }

          // Last checkpoint to target
          const lastCheckpoint = checkpoints[checkpoints.length - 1];
          newLines.push({ x1: lastCheckpoint.posR.x, y1: lastCheckpoint.posR.y, x2: targetPos.x, y2: targetPos.y, flow, isHighlighted, isActive, trafficIntensity });
        } else {
          // Direct line if no checkpoints
          newLines.push({ x1: sourcePos.x, y1: sourcePos.y, x2: targetPos.x, y2: targetPos.y, flow, isHighlighted, isActive, trafficIntensity });
        }
      });

      // Debug: Log line creation
      console.log('[ConnectionLinesSVG] Lines created:', newLines.length);
      if (newLines.length === 0 && architecture.flows.length > 0) {
        console.log('[ConnectionLinesSVG] DEBUG - No lines created but flows exist!');
        architecture.flows.forEach(f => {
          const sourceEl = container.querySelector(`[data-compute-id="${f.sourceId}"]`);
          const targetEl = container.querySelector(`[data-resource-id="${f.targetId}"]`);
          console.log(`  Flow ${f.sourceId} -> ${f.targetId}:`);
          console.log(`    sourceEl found: ${!!sourceEl}`);
          console.log(`    targetEl found: ${!!targetEl}`);
        });
      }

      setLines(newLines);
    };

    updateLines();
    window.addEventListener('resize', updateLines);
    // Also update on scroll within container
    const scrollHandler = () => updateLines();
    container?.addEventListener('scroll', scrollHandler);
    return () => {
      window.removeEventListener('resize', updateLines);
      container?.removeEventListener('scroll', scrollHandler);
    };
  }, [architecture, hoveredId, containerRef, getTrafficIntensity]);

  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: 1 }}>
      {/* Render non-highlighted lines first, then highlighted on top */}
      {lines
        .sort((a, b) => (a.isHighlighted ? 1 : 0) - (b.isHighlighted ? 1 : 0))
        .map((line, i) => (
          <AnimatedTrafficLine
            key={`line-${i}-${line.flow.sourceId}-${line.flow.targetId}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            isActive={line.isActive}
            isHighlighted={line.isHighlighted}
            flowData={line.flow}
            animate={animate}
            trafficIntensity={line.trafficIntensity}
          />
        ))}
    </svg>
  );
}

// ============================================
// MAIN UNIFIED ARCHITECTURE DIAGRAM
// ============================================
function UnifiedArchitectureDiagram({
  architecture,
  animate,
  onSelectService,
}: {
  architecture: SystemArchitecture;
  animate: boolean;
  onSelectService: (service: ServiceNode | SecurityCheckpoint, type: 'compute' | 'resource' | 'security_group' | 'nacl' | 'iam_role' | 'api_call') => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandedSG, setExpandedSG] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debug: Log what the diagram receives
  useEffect(() => {
    console.log('[UnifiedArchitectureDiagram] Rendering with:', {
      computeServices: architecture.computeServices.length,
      resources: architecture.resources.length,
      flows: architecture.flows.length,
      securityGroups: architecture.securityGroups.length,
      flowDetails: architecture.flows.map(f => `${f.sourceId} -> ${f.targetId}`),
    });
  }, [architecture]);

  const computeFlowInfo = useMemo(() => {
    const info = new Map<string, { bytes: number; connections: number; ports: string[] }>();
    architecture.flows.forEach(f => {
      const existing = info.get(f.sourceId) || { bytes: 0, connections: 0, ports: [] };
      existing.bytes += f.bytes;
      existing.connections += f.connections;
      existing.ports = [...new Set([...existing.ports, ...f.ports])];
      info.set(f.sourceId, existing);
    });
    return info;
  }, [architecture.flows]);

  const resourceFlowInfo = useMemo(() => {
    const info = new Map<string, { bytes: number; connections: number; ports: string[] }>();
    architecture.flows.forEach(f => {
      const existing = info.get(f.targetId) || { bytes: 0, connections: 0, ports: [] };
      existing.bytes += f.bytes;
      existing.connections += f.connections;
      existing.ports = [...new Set([...existing.ports, ...f.ports])];
      info.set(f.targetId, existing);
    });
    return info;
  }, [architecture.flows]);

  const isNodeHighlighted = (nodeId: string): boolean => {
    if (!hoveredId) return false;
    if (nodeId === hoveredId) return true;
    return architecture.flows.some(f =>
      (f.sourceId === hoveredId && (f.targetId === nodeId || f.sgId === nodeId || f.roleId === nodeId)) ||
      (f.targetId === hoveredId && (f.sourceId === nodeId || f.sgId === nodeId || f.roleId === nodeId)) ||
      (f.sgId === hoveredId && (f.sourceId === nodeId || f.targetId === nodeId)) ||
      (f.roleId === hoveredId && (f.sourceId === nodeId || f.targetId === nodeId))
    );
  };

  return (
    <div className="relative bg-slate-900/50 rounded-2xl border border-slate-700 p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
            <Cloud className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">System Architecture</h3>
            <p className="text-xs text-slate-400">Live traffic flow based on actual usage</p>
          </div>
          {/* Live indicator */}
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/20 rounded-full ml-4">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-emerald-400">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center px-3">
            <div className="text-emerald-400 font-bold">{formatBytes(architecture.totalBytes)}</div>
            <div className="text-[10px] text-slate-500">Traffic</div>
          </div>
          <div className="text-center px-3 border-l border-slate-700">
            <div className="text-blue-400 font-bold">{architecture.totalConnections}</div>
            <div className="text-[10px] text-slate-500">Connections</div>
          </div>
          {architecture.totalGaps > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 rounded-lg border-l border-slate-700">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-amber-400 font-bold">{architecture.totalGaps}</div>
                <div className="text-[10px] text-slate-500">Gaps</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main diagram */}
      <div ref={containerRef} className="relative min-h-[450px]">
        <ConnectionLinesSVG
          architecture={architecture}
          hoveredId={hoveredId}
          containerRef={containerRef}
          animate={animate}
        />

        <div className="relative grid grid-cols-[1fr_auto_auto_1fr] gap-6 items-start" style={{ zIndex: 2 }}>
          {/* COMPUTE */}
          <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              Compute ({architecture.computeServices.length})
            </div>
            {architecture.computeServices.map(node => (
              <div key={node.id} data-compute-id={node.id}>
                <ServiceNodeBox
                  node={node}
                  position="left"
                  flowInfo={computeFlowInfo.get(node.id)}
                  isHighlighted={isNodeHighlighted(node.id)}
                  onHover={setHoveredId}
                  onClick={() => onSelectService(node, 'compute')}
                />
              </div>
            ))}
          </div>

          {/* SECURITY GROUPS */}
          <div className="flex flex-col gap-3 min-w-[180px]">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-400" />
              Security Groups ({architecture.securityGroups.length})
            </div>
            {architecture.securityGroups.map(sg => (
              <div key={sg.id} data-sg-id={sg.id}>
                <SecurityGroupPanel
                  sg={sg}
                  isExpanded={expandedSG === sg.id}
                  onToggle={() => setExpandedSG(expandedSG === sg.id ? null : sg.id)}
                  isHighlighted={isNodeHighlighted(sg.id)}
                  onHover={setHoveredId}
                  onDetails={() => onSelectService(sg, 'security_group')}
                />
              </div>
            ))}
            {architecture.securityGroups.length === 0 && (
              <div className="text-xs text-slate-500 italic p-4 text-center">No SGs attached</div>
            )}
          </div>

          {/* NACLS */}
          <div className="flex flex-col gap-3 min-w-[140px]">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              NACLs ({architecture.nacls.length})
            </div>
            {architecture.nacls.map(nacl => (
              <div key={nacl.id} data-nacl-id={nacl.id}>
                <NACLNode
                  nacl={nacl}
                  isHighlighted={isNodeHighlighted(nacl.id)}
                  onHover={setHoveredId}
                  onClick={() => onSelectService(nacl, 'nacl')}
                />
              </div>
            ))}
            {architecture.nacls.length === 0 && (
              <div className="text-xs text-slate-500 italic p-4 text-center">No NACLs</div>
            )}
          </div>

          {/* IAM ROLES */}
          <div className="flex flex-col gap-3 items-center">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Key className="w-4 h-4 text-pink-400" />
              IAM Roles ({architecture.iamRoles.length})
            </div>
            {architecture.iamRoles.map(role => (
              <div key={role.id} data-role-id={role.id}>
                <IAMRoleNode
                  role={role}
                  isHighlighted={isNodeHighlighted(role.id)}
                  onHover={setHoveredId}
                  onClick={() => onSelectService(role, 'iam_role')}
                />
              </div>
            ))}
            {architecture.iamRoles.length === 0 && (
              <div className="text-xs text-slate-500 italic p-4 text-center">No Roles</div>
            )}
          </div>

          {/* API CALLS - Simulated from VPC Traffic patterns */}
          <div className="flex flex-col gap-3 items-center">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-lime-400" />
              API Calls ({architecture.resources.filter(r => {
                const t = (r.type || '').toLowerCase();
                return t === 'database' || t === 'storage' || t === 'dynamodb';
              }).length})
            </div>
            {/* Generate API call simulations based on actual VPC traffic */}
            {architecture.resources.filter(r => {
              const t = (r.type || '').toLowerCase();
              return t === 'database' || t === 'storage' || t === 'dynamodb';
            }).map(resource => {
              // Find all flows TO this resource to calculate traffic-based API calls
              const resourceFlows = architecture.flows.filter(f => f.targetId === resource.id);
              const totalBytes = resourceFlows.reduce((sum, f) => sum + f.bytes, 0);
              const totalConnections = resourceFlows.reduce((sum, f) => sum + f.connections, 0);

              const resourceType = (resource.type || '').toLowerCase();

              // Simulate realistic API calls based on traffic patterns
              let apiActions: { action: string; count: number }[] = [];
              let totalCalls = 0;

              if (resourceType === 'database') {
                // RDS: ~1KB per query average, 70% reads, 25% writes, 5% admin
                const queryCount = Math.max(1, Math.round(totalBytes / 1024));
                apiActions = [
                  { action: 'ExecuteStatement', count: Math.round(queryCount * 0.70) },
                  { action: 'BatchExecuteStatement', count: Math.round(queryCount * 0.15) },
                  { action: 'BeginTransaction', count: Math.round(queryCount * 0.10) },
                  { action: 'CommitTransaction', count: Math.round(queryCount * 0.05) },
                ];
                totalCalls = queryCount;
              } else if (resourceType === 'storage') {
                // S3: ~50KB per object average, 60% reads, 35% writes, 5% list
                const objectOps = Math.max(1, Math.round(totalBytes / 51200));
                apiActions = [
                  { action: 'GetObject', count: Math.round(objectOps * 0.60) },
                  { action: 'PutObject', count: Math.round(objectOps * 0.30) },
                  { action: 'ListObjects', count: Math.round(objectOps * 0.05) },
                  { action: 'HeadObject', count: Math.round(objectOps * 0.05) },
                ];
                totalCalls = objectOps;
              } else if (resourceType === 'dynamodb') {
                // DynamoDB: ~500 bytes per item average, 65% reads, 30% writes, 5% scans
                const itemOps = Math.max(1, Math.round(totalBytes / 512));
                apiActions = [
                  { action: 'GetItem', count: Math.round(itemOps * 0.45) },
                  { action: 'Query', count: Math.round(itemOps * 0.20) },
                  { action: 'PutItem', count: Math.round(itemOps * 0.25) },
                  { action: 'Scan', count: Math.round(itemOps * 0.10) },
                ];
                totalCalls = itemOps;
              }

              // Filter out zero-count actions
              apiActions = apiActions.filter(a => a.count > 0);

              if (totalCalls === 0) return null;

              return (
                <div
                  key={`api-${resource.id}`}
                  data-api-id={resource.id}
                  className="relative group cursor-pointer"
                  onClick={() => onSelectService({
                    ...resource,
                    id: `api-${resource.id}`,
                    name: `${resource.shortName || resource.name} API`,
                    type: 'api_call',
                    apiActions,
                    totalCalls,
                    totalBytes,
                    totalConnections,
                    isSimulated: true,
                  } as any, 'api_call')}
                >
                  <div className={`
                    px-4 py-3 rounded-xl border-2 transition-all duration-300
                    bg-lime-500/10 border-lime-500/50 hover:border-lime-400 hover:bg-lime-500/20
                    min-w-[140px] text-center
                  `}>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-lime-400" />
                      <span className="text-sm font-semibold text-white truncate max-w-[100px]">
                        {resource.shortName || resource.name}
                      </span>
                    </div>
                    <div className="text-xs text-lime-400">
                      {apiActions.slice(0, 2).map(a => a.action).join(', ')}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {totalCalls.toLocaleString()} calls
                      <span className="text-slate-500 ml-1">(simulated)</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {architecture.resources.filter(r => {
              const t = (r.type || '').toLowerCase();
              return t === 'database' || t === 'storage' || t === 'dynamodb';
            }).length === 0 && (
              <div className="text-xs text-slate-500 italic p-4 text-center">No API Calls</div>
            )}
          </div>

          {/* RESOURCES */}
          <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-400" />
              Resources ({architecture.resources.length})
            </div>
            {architecture.resources.map(node => (
              <div key={node.id} data-resource-id={node.id}>
                <ServiceNodeBox
                  node={node}
                  position="right"
                  flowInfo={resourceFlowInfo.get(node.id)}
                  isHighlighted={isNodeHighlighted(node.id)}
                  onHover={setHoveredId}
                  onClick={() => onSelectService(node, 'resource')}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Flow details on hover */}
      {hoveredId && (
        <div className="mt-6 pt-4 border-t border-slate-700 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-white">Connection Details</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {architecture.flows
              .filter(f => f.sourceId === hoveredId || f.targetId === hoveredId || f.sgId === hoveredId || f.roleId === hoveredId)
              .map((flow, i) => {
                const source = architecture.computeServices.find(c => c.id === flow.sourceId);
                const target = architecture.resources.find(r => r.id === flow.targetId);
                return (
                  <div key={i} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                    <div className="text-xs text-slate-400 mb-2">
                      {source?.shortName} → {target?.shortName}
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-emerald-400 font-mono text-sm font-bold">
                        {flow.ports[0] || 'TCP'}
                      </span>
                      <span className="text-white font-bold">
                        {formatBytes(flow.bytes)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span>{flow.connections} conn</span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        active
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-slate-700 flex flex-wrap items-center gap-4 text-xs">
        <span className="text-slate-500">Legend:</span>
        <span className="flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-400">Compute</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-slate-400">Security Group</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5 text-pink-400" />
          <span className="text-slate-400">IAM Role</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-lime-400" />
          <span className="text-slate-400">API Call</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-slate-400">Database</span>
        </span>
        <span className="flex items-center gap-1.5">
          <HardDrive className="w-3.5 h-3.5 text-green-400" />
          <span className="text-slate-400">Storage</span>
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-emerald-400">Live Traffic</span>
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-amber-400">Security Gap</span>
        </span>
      </div>
    </div>
  );
}

// ============================================
// DATA CHANGE TRACKER
// ============================================
interface DataChanges {
  newCompute: string[];
  newResources: string[];
  newConnections: number;
  removedCompute: string[];
  removedResources: string[];
  totalChanges: number;
}

function detectChanges(oldArch: SystemArchitecture | null, newArch: SystemArchitecture): DataChanges {
  if (!oldArch) {
    return {
      newCompute: newArch.computeServices.map(c => c.id),
      newResources: newArch.resources.map(r => r.id),
      newConnections: newArch.flows.length,
      removedCompute: [],
      removedResources: [],
      totalChanges: newArch.computeServices.length + newArch.resources.length + newArch.flows.length,
    };
  }

  const oldComputeIds = new Set(oldArch.computeServices.map(c => c.id));
  const newComputeIds = new Set(newArch.computeServices.map(c => c.id));
  const oldResourceIds = new Set(oldArch.resources.map(r => r.id));
  const newResourceIds = new Set(newArch.resources.map(r => r.id));
  const oldFlowKeys = new Set(oldArch.flows.map(f => `${f.sourceId}->${f.targetId}`));
  const newFlowKeys = new Set(newArch.flows.map(f => `${f.sourceId}->${f.targetId}`));

  const newCompute = newArch.computeServices.filter(c => !oldComputeIds.has(c.id)).map(c => c.name);
  const newResources = newArch.resources.filter(r => !oldResourceIds.has(r.id)).map(r => r.name);
  const newConnections = newArch.flows.filter(f => !oldFlowKeys.has(`${f.sourceId}->${f.targetId}`)).length;
  const removedCompute = oldArch.computeServices.filter(c => !newComputeIds.has(c.id)).map(c => c.name);
  const removedResources = oldArch.resources.filter(r => !newResourceIds.has(r.id)).map(r => r.name);

  return {
    newCompute,
    newResources,
    newConnections,
    removedCompute,
    removedResources,
    totalChanges: newCompute.length + newResources.length + newConnections + removedCompute.length + removedResources.length,
  };
}

// ============================================
// REFRESH STATUS INDICATOR
// ============================================
function RefreshStatusBadge({
  status,
  changes,
  onDismiss,
}: {
  status: 'idle' | 'fetching' | 'success' | 'error';
  changes: DataChanges | null;
  onDismiss: () => void;
}) {
  if (status === 'idle' && (!changes || changes.totalChanges === 0)) return null;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
      status === 'fetching' ? 'bg-blue-500/20 text-blue-400' :
      status === 'error' ? 'bg-red-500/20 text-red-400' :
      changes && changes.totalChanges > 0 ? 'bg-emerald-500/20 text-emerald-400' :
      'bg-slate-700 text-slate-400'
    }`}>
      {status === 'fetching' && (
        <>
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span>Syncing with Neo4j...</span>
        </>
      )}
      {status === 'success' && changes && changes.totalChanges > 0 && (
        <>
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span>
            +{changes.newCompute.length + changes.newResources.length} nodes,
            +{changes.newConnections} connections
          </span>
          <button onClick={onDismiss} className="ml-1 hover:text-white">✕</button>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertTriangle className="w-3 h-3" />
          <span>Sync failed</span>
        </>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function TrafficFlowMap() {
  const [architecture, setArchitecture] = useState<SystemArchitecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animate, setAnimate] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'fetching' | 'success' | 'error'>('idle');
  const [lastChanges, setLastChanges] = useState<DataChanges | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false); // Manual refresh by default
  const [refreshInterval, setRefreshInterval] = useState(600); // 10 minutes
  const [selectedService, setSelectedService] = useState<{ service: ServiceNode | SecurityCheckpoint; type: 'compute' | 'resource' | 'security_group' | 'nacl' | 'iam_role' | 'api_call' } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousArchRef = useRef<SystemArchitecture | null>(null);

  const buildArchitecture = useCallback((nodes: any[], edges: any[], iamData: any[]): SystemArchitecture => {
    const extractInstanceId = (id: string | null | undefined): string => {
      if (!id) return 'unknown';
      const match = id.match(/i-[a-f0-9]+/);
      return match ? match[0] : id;
    };

    const extractResourceName = (id: string | null | undefined): string => {
      if (!id) return 'unknown';
      if (id.includes(':db:')) return id.split(':db:')[1];
      if (id.includes(':::')) return id.split(':::')[1];
      if (id.includes('/')) return id.split('/').pop() || id;
      return id;
    };

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const nodeByInstanceId = new Map<string, any>();
    const nodeByResourceName = new Map<string, any>();

    nodes.forEach(n => {
      const instanceId = extractInstanceId(n.id);
      if (instanceId.startsWith('i-')) nodeByInstanceId.set(instanceId, n);
      const resourceName = extractResourceName(n.id);
      nodeByResourceName.set(resourceName, n);
      nodeByResourceName.set(n.name || n.id, n);
    });

    const computeToSG = new Map<string, string>();
    const computeToNACL = new Map<string, string>();
    const computeToRole = new Map<string, string>();
    const sgNodeMap = new Map<string, any>();
    const naclNodeMap = new Map<string, any>();
    const roleNodeMap = new Map<string, any>();
    const subnetToNACL = new Map<string, string>();

    // First pass: collect subnet to NACL mappings
    edges.forEach(edge => {
      const edgeType = (edge.edge_type || edge.type || '').toUpperCase();
      const srcId = edge.source || edge.from;
      const tgtId = edge.target || edge.to;

      // NACL is associated with subnet
      if (edgeType === 'HAS_NACL' || edgeType === 'USES_NACL') {
        subnetToNACL.set(srcId, tgtId);
        const naclNode = nodeMap.get(tgtId);
        if (naclNode) {
          naclNodeMap.set(tgtId, naclNode);
        } else {
          // Create placeholder for NACL
          naclNodeMap.set(tgtId, {
            id: tgtId,
            name: tgtId.includes('acl-') ? tgtId : `NACL-${tgtId.slice(-8)}`,
            type: 'NetworkAcl',
            vpc_id: null,
          });
        }
      }
    });

    edges.forEach(edge => {
      const edgeType = (edge.edge_type || edge.type || '').toUpperCase();
      const srcId = edge.source || edge.from;
      const tgtId = edge.target || edge.to;

      if (edgeType === 'HAS_SECURITY_GROUP' || edgeType === 'USES_SECURITY_GROUP') {
        const canonicalSrc = extractInstanceId(srcId);
        computeToSG.set(canonicalSrc, tgtId);
        const sgNode = nodeMap.get(tgtId);
        if (sgNode) {
          sgNodeMap.set(tgtId, sgNode);
        } else {
          // Create placeholder for SG referenced in edge but missing as node
          sgNodeMap.set(tgtId, {
            id: tgtId,
            name: tgtId, // Will use SG ID as name
            type: 'SecurityGroup',
            vpc_id: null,
          });
        }
      }

      // EC2 in subnet -> get NACL from subnet
      if (edgeType === 'IN_SUBNET') {
        const canonicalSrc = extractInstanceId(srcId);
        const naclId = subnetToNACL.get(tgtId);
        if (naclId) {
          computeToNACL.set(canonicalSrc, naclId);
        }
      }

      if (edgeType === 'USES_ROLE' || edgeType === 'ASSUMES_ROLE') {
        const canonicalSrc = extractInstanceId(srcId);
        computeToRole.set(canonicalSrc, tgtId);
        const roleNode = nodeMap.get(tgtId);
        if (roleNode) {
          roleNodeMap.set(tgtId, roleNode);
        } else {
          // Create placeholder for role referenced in edge but missing as node
          const roleName = tgtId.includes('/') ? tgtId.split('/').pop() : tgtId;
          roleNodeMap.set(tgtId, {
            id: tgtId,
            name: roleName,
            type: 'IAMRole',
          });
        }
      }
    });

    const trafficEdges = edges.filter(e => {
      const type = (e.edge_type || e.type || '').toUpperCase();
      return ['ACTUAL_TRAFFIC', 'OBSERVED_TRAFFIC', 'S3_OPERATION', 'ACTUAL_S3_ACCESS'].includes(type);
    });

    const flowMap = new Map<string, TrafficFlow>();
    const computeWithTraffic = new Set<string>();
    const resourcesWithTraffic = new Set<string>();
    const usedPorts = new Set<string>();

    trafficEdges.forEach(edge => {
      const srcId = edge.source || edge.from;
      const tgtId = edge.target || edge.to;

      // Try multiple ways to find source node
      let sourceNode = nodeMap.get(srcId);
      if (!sourceNode) {
        const instanceId = extractInstanceId(srcId);
        if (instanceId.startsWith('i-')) {
          sourceNode = nodeByInstanceId.get(instanceId);
        }
      }
      if (!sourceNode) {
        const resourceName = extractResourceName(srcId);
        sourceNode = nodeByResourceName.get(resourceName);
      }

      // Try multiple ways to find target node
      let targetNode = nodeMap.get(tgtId);
      if (!targetNode) {
        const instanceId = extractInstanceId(tgtId);
        if (instanceId.startsWith('i-')) {
          targetNode = nodeByInstanceId.get(instanceId);
        }
      }
      if (!targetNode) {
        const resourceName = extractResourceName(tgtId);
        targetNode = nodeByResourceName.get(resourceName);
      }

      // Skip if we can't find both nodes
      if (!sourceNode || !targetNode) return;

      // Normalize direction: Compute -> Resource
      // If target is compute and source is resource, swap them
      const sourceIsCompute = sourceNode.type === 'EC2' || sourceNode.type === 'LambdaFunction';
      const targetIsCompute = targetNode.type === 'EC2' || targetNode.type === 'LambdaFunction';
      const sourceIsResource = ['RDSInstance', 'S3Bucket', 'DynamoDB'].includes(sourceNode.type);
      const targetIsResource = ['RDSInstance', 'S3Bucket', 'DynamoDB'].includes(targetNode.type);

      if (targetIsCompute && sourceIsResource) {
        [sourceNode, targetNode] = [targetNode, sourceNode];
      }

      // After potential swap, verify we have compute -> resource
      const finalSourceIsCompute = sourceNode.type === 'EC2' || sourceNode.type === 'LambdaFunction';
      const finalTargetType = mapNodeType(targetNode.type || 'unknown');

      if (!finalSourceIsCompute) return;
      if (!['database', 'storage', 'dynamodb', 'sqs', 'sns'].includes(finalTargetType)) return;

      const canonicalSrc = extractInstanceId(sourceNode.id);
      const flowKey = `${canonicalSrc}->${targetNode.id}`;

      computeWithTraffic.add(canonicalSrc);
      resourcesWithTraffic.add(targetNode.id);

      if (!flowMap.has(flowKey)) {
        flowMap.set(flowKey, {
          sourceId: canonicalSrc,
          targetId: targetNode.id,
          sgId: computeToSG.get(canonicalSrc),
          naclId: computeToNACL.get(canonicalSrc),
          roleId: computeToRole.get(canonicalSrc),
          ports: [],
          protocol: 'TCP',
          bytes: 0,
          connections: 0,
          isActive: true,
        });
      }

      const flow = flowMap.get(flowKey)!;
      if (edge.port) {
        flow.ports.push(String(edge.port));
        usedPorts.add(String(edge.port));
      }
      flow.protocol = edge.protocol || 'TCP';
      flow.bytes += edge.traffic_bytes || 0;
      flow.connections += 1;
    });

    flowMap.forEach(flow => {
      flow.ports = [...new Set(flow.ports)].slice(0, 5);
    });

    // Debug logging
    console.log('[TrafficFlowMap] Traffic processing results:', {
      totalTrafficEdges: trafficEdges.length,
      validFlows: flowMap.size,
      computeWithTraffic: computeWithTraffic.size,
      resourcesWithTraffic: resourcesWithTraffic.size,
    });

    // Build compute services
    const seenCompute = new Set<string>();
    const computeServices: ServiceNode[] = [];
    computeWithTraffic.forEach(canonicalId => {
      if (seenCompute.has(canonicalId)) return;
      seenCompute.add(canonicalId);
      const node = nodeByInstanceId.get(canonicalId);
      if (!node) return;
      computeServices.push({
        id: canonicalId,
        name: node.name || node.id,
        shortName: shortName(node.name || node.id),
        type: mapNodeType(node.type || 'compute'),
        instanceId: canonicalId.substring(0, 12),
      });
    });

    // Build resources
    const seenResources = new Set<string>();
    const resources: ServiceNode[] = [];
    resourcesWithTraffic.forEach(id => {
      const resourceName = extractResourceName(id);
      if (seenResources.has(resourceName)) return;
      seenResources.add(resourceName);
      const node = nodeMap.get(id) || nodeByResourceName.get(resourceName);
      if (!node) return;
      resources.push({
        id: id,
        name: node.name || node.id,
        shortName: shortName(node.name || node.id),
        type: mapNodeType(node.type || 'storage'),
      });
    });

    // Build security groups (rules will be fetched separately from API)
    const usedSGIds = new Set(Array.from(flowMap.values()).map(f => f.sgId).filter(Boolean));
    const securityGroups: SecurityCheckpoint[] = [];
    usedSGIds.forEach(sgId => {
      if (!sgId) return;
      const sgNode = sgNodeMap.get(sgId);
      if (!sgNode) return;

      const connectedSources = Array.from(flowMap.values())
        .filter(f => f.sgId === sgId)
        .map(f => f.sourceId);

      // Rules will be populated by fetchSGRules() - no mock data
      securityGroups.push({
        id: sgId,
        type: 'security_group',
        name: sgNode.name || sgId,
        shortName: shortName(sgNode.name || sgId, 14),
        usedCount: 0,
        totalCount: 0,
        gapCount: 0,
        connectedSources,
        connectedTargets: [],
        rules: [], // Will be populated with real data from API
        vpcId: sgNode.vpc_id,
      });
    });

    // Build NACLs
    const usedNACLIds = new Set(Array.from(flowMap.values()).map(f => f.naclId).filter(Boolean));
    const nacls: SecurityCheckpoint[] = [];
    usedNACLIds.forEach(naclId => {
      if (!naclId) return;
      const naclNode = naclNodeMap.get(naclId);
      if (!naclNode) return;

      const connectedSources = Array.from(flowMap.values())
        .filter(f => f.naclId === naclId)
        .map(f => f.sourceId);

      nacls.push({
        id: naclId,
        type: 'nacl',
        name: naclNode.name || naclId,
        shortName: shortName(naclNode.name || naclId, 14),
        usedCount: 0,
        totalCount: 0,
        gapCount: 0,
        connectedSources,
        connectedTargets: [],
        vpcId: naclNode.vpc_id,
      });
    });

    // Build IAM roles
    const usedRoleIds = new Set(Array.from(flowMap.values()).map(f => f.roleId).filter(Boolean));
    const iamRoles: SecurityCheckpoint[] = [];
    usedRoleIds.forEach(roleId => {
      if (!roleId) return;
      const roleNode = roleNodeMap.get(roleId);
      const iamInfo = (iamData || []).find((r: any) =>
        r.role_id === roleId || r.role_name === roleNode?.name || (roleId || '').includes(r.role_name || '')
      );
      const connectedSources = Array.from(flowMap.values())
        .filter(f => f.roleId === roleId)
        .map(f => f.sourceId);

      iamRoles.push({
        id: roleId,
        type: 'iam_role',
        name: roleNode?.name || roleId,
        shortName: shortName(roleNode?.name || roleId, 14),
        usedCount: iamInfo?.used_permissions ?? 0,
        totalCount: iamInfo?.allowed_permissions ?? 0,
        gapCount: iamInfo?.unused_permissions ?? 0,
        connectedSources,
        connectedTargets: [],
      });
    });

    const flows = Array.from(flowMap.values());
    const totalBytes = flows.reduce((sum, f) => sum + f.bytes, 0);
    const totalConnections = flows.reduce((sum, f) => sum + f.connections, 0);
    const totalGaps = securityGroups.reduce((sum, sg) => sum + sg.gapCount, 0) +
                      nacls.reduce((sum, n) => sum + n.gapCount, 0) +
                      iamRoles.reduce((sum, r) => sum + r.gapCount, 0);

    // Final debug logging
    console.log('[TrafficFlowMap] Architecture built:', {
      computeServices: computeServices.map(c => c.name),
      resources: resources.map(r => `${r.type}: ${r.name}`),
      securityGroups: securityGroups.map(sg => sg.name),
      nacls: nacls.map(n => n.name),
      iamRoles: iamRoles.map(r => r.name),
      flowCount: flows.length,
      totalBytes,
      totalConnections,
    });

    return {
      computeServices,
      resources,
      securityGroups,
      nacls,
      iamRoles,
      flows,
      totalBytes,
      totalConnections,
      totalGaps,
    };
  }, []);

  // Fetch real SG rules from inspector API
  const fetchSGRules = useCallback(async (sgId: string): Promise<SGRule[]> => {
    try {
      const res = await fetch(`/api/proxy/security-groups/${sgId}/inspector?window=30d`);
      if (!res.ok) return [];

      const data = await res.json();
      const configuredRules = data.configured_rules || [];

      // Transform API response to our SGRule interface
      return configuredRules.map((rule: any) => ({
        direction: rule.direction === 'ingress' ? 'ingress' : 'egress',
        protocol: rule.protocol || rule.proto || 'tcp',
        fromPort: rule.from_port,
        toPort: rule.to_port,
        portDisplay: rule.port_display || (rule.from_port === rule.to_port ? String(rule.from_port || 'All') : `${rule.from_port}-${rule.to_port}`),
        source: rule.source_cidr || rule.source_sg || rule.peer_value || 'unknown',
        sourceType: rule.source_type || (rule.source_sg ? 'security_group' : 'cidr'),
        status: rule.status || 'unknown',
        flowCount: rule.flow_count || 0,
        lastSeen: rule.last_seen || null,
        isPublic: rule.is_public || (rule.source_cidr === '0.0.0.0/0'),
      }));
    } catch (err) {
      console.error(`Failed to fetch rules for SG ${sgId}:`, err);
      return [];
    }
  }, []);

  // Fetch IAM role gap analysis data
  const fetchIAMRoleData = useCallback(async (roleName: string): Promise<{
    usedCount: number;
    totalCount: number;
    gapCount: number;
    lpScore: number;
  }> => {
    try {
      const res = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=90`);
      if (!res.ok) {
        console.warn(`[IAM] Failed to fetch gap analysis for ${roleName}: ${res.status}`);
        return { usedCount: 0, totalCount: 0, gapCount: 0, lpScore: 0 };
      }

      const data = await res.json();
      const summary = data.summary || {};

      return {
        usedCount: summary.used_count || data.used_count || 0,
        totalCount: summary.allowed_count || data.allowed_count || 0,
        gapCount: summary.unused_count || data.unused_count || 0,
        lpScore: summary.lp_score || 0,
      };
    } catch (err) {
      console.error(`[IAM] Error fetching gap analysis for ${roleName}:`, err);
      return { usedCount: 0, totalCount: 0, gapCount: 0, lpScore: 0 };
    }
  }, []);

  const loadData = useCallback(async (isManualRefresh = false) => {
    // Only show loading spinner on initial load
    if (!architecture) {
      setLoading(true);
    }
    setRefreshStatus('fetching');
    setError(null);

    try {
      // Add cache-busting timestamp to ensure fresh data from Neo4j
      const timestamp = Date.now();
      const depRes = await fetch(`/api/proxy/dependency-map/full?maxNodes=500&_t=${timestamp}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!depRes.ok) {
        throw new Error(`Failed to fetch dependency map: ${depRes.status}`);
      }

      const depData = await depRes.json();

      const nodes = depData.nodes || [];
      const edges = depData.edges || depData.relationships || [];

      console.log(`[TrafficFlowMap] Loaded ${nodes.length} nodes, ${edges.length} edges from Neo4j`);

      if (nodes.length === 0) {
        setError('No data available in Neo4j');
        setArchitecture(null);
        setRefreshStatus('error');
      } else {
        // Build architecture without IAM data first (will be fetched per-role)
        const arch = buildArchitecture(nodes, edges, []);

        // Fetch real SG rules for each security group in parallel
        if (arch.securityGroups.length > 0) {
          const sgRulesPromises = arch.securityGroups.map(sg =>
            fetchSGRules(sg.id).then(rules => ({ sgId: sg.id, rules }))
          );

          const sgRulesResults = await Promise.all(sgRulesPromises);

          // Update security groups with real rules
          sgRulesResults.forEach(({ sgId, rules }) => {
            const sg = arch.securityGroups.find(s => s.id === sgId);
            if (sg) {
              sg.rules = rules;
              sg.totalCount = rules.length;
              sg.usedCount = rules.filter(r => r.status === 'used').length;
              sg.gapCount = rules.filter(r => r.status === 'unused' || r.status === 'unobserved').length;
            }
          });
        }

        // Fetch IAM role gap analysis for each role in parallel
        if (arch.iamRoles.length > 0) {
          console.log(`[TrafficFlowMap] Fetching IAM data for ${arch.iamRoles.length} roles...`);
          const iamPromises = arch.iamRoles.map(role =>
            fetchIAMRoleData(role.name).then(data => ({ roleId: role.id, ...data }))
          );

          const iamResults = await Promise.all(iamPromises);

          // Update IAM roles with real permission counts
          iamResults.forEach(({ roleId, usedCount, totalCount, gapCount }) => {
            const role = arch.iamRoles.find(r => r.id === roleId);
            if (role) {
              role.usedCount = usedCount;
              role.totalCount = totalCount;
              role.gapCount = gapCount;
              console.log(`[TrafficFlowMap] IAM ${role.shortName}: ${usedCount}/${totalCount} perms, ${gapCount} unused`);
            }
          });
        }

        // Recalculate total gaps after all data is fetched
        arch.totalGaps = arch.securityGroups.reduce((sum, sg) => sum + sg.gapCount, 0) +
                        arch.iamRoles.reduce((sum, r) => sum + r.gapCount, 0);

        // Detect changes from previous architecture
        const changes = detectChanges(previousArchRef.current, arch);
        previousArchRef.current = arch;

        // Log changes for debugging
        if (changes.totalChanges > 0) {
          console.log(`[TrafficFlowMap] Changes detected:`, changes);
        }

        setLastChanges(changes);
        setArchitecture(arch);
        setLastUpdated(new Date());
        setRefreshStatus('success');

        // Auto-dismiss success status after 5 seconds
        if (changes.totalChanges > 0) {
          setTimeout(() => setRefreshStatus('idle'), 5000);
        } else {
          setRefreshStatus('idle');
        }
      }
    } catch (err: any) {
      console.error('[TrafficFlowMap] Error loading data:', err);
      setError(err.message);
      setRefreshStatus('error');
    } finally {
      setLoading(false);
    }
  }, [buildArchitecture, fetchSGRules, architecture]);

  // Initial load
  useEffect(() => { loadData(); }, []);

  // Auto-refresh with configurable interval
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadData(false);
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [loadData, autoRefresh, refreshInterval]);

  // Manual refresh handler with force flag
  const handleManualRefresh = useCallback(() => {
    loadData(true);
  }, [loadData]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  }, []);

  if (loading && !architecture) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white text-sm font-medium">Building Architecture...</p>
        </div>
      </div>
    );
  }

  if (error && !architecture) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900 p-4">
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-6 text-center max-w-sm">
          <p className="text-red-400 font-medium mb-2">Error</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <button onClick={loadData} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Header with refresh controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/90 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-white font-bold text-lg">Traffic Flow Map</h2>

          {/* Live indicator */}
          <div className="flex items-center gap-2 px-2 py-1 bg-emerald-500/10 rounded-full">
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
            <span className="text-xs text-emerald-400 font-medium">
              {autoRefresh ? 'LIVE' : 'PAUSED'}
            </span>
          </div>

          {/* Refresh status badge */}
          <RefreshStatusBadge
            status={refreshStatus}
            changes={lastChanges}
            onDismiss={() => setLastChanges(null)}
          />

          {lastUpdated && (
            <span className="text-slate-500 text-xs">
              Last sync: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              autoRefresh ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
            }`}
            title={autoRefresh ? `Auto-refresh every ${refreshInterval}s` : 'Auto-refresh disabled'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            Auto ({refreshInterval}s)
          </button>

          {/* Animation toggle */}
          <button
            onClick={() => setAnimate(!animate)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              animate ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-400'
            }`}
          >
            {animate ? '⏸ Pause' : '▶ Play'}
          </button>

          {/* Manual refresh button */}
          <button
            onClick={handleManualRefresh}
            disabled={refreshStatus === 'fetching'}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              refreshStatus === 'fetching'
                ? 'bg-blue-500/20 text-blue-400 cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${refreshStatus === 'fetching' ? 'animate-spin' : ''}`} />
            {refreshStatus === 'fetching' ? 'Syncing...' : 'Refresh from Neo4j'}
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-medium"
          >
            {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {architecture && (architecture.computeServices.length > 0 || architecture.resources.length > 0) ? (
          <UnifiedArchitectureDiagram
            architecture={architecture}
            animate={animate}
            onSelectService={(service, type) => setSelectedService({ service, type })}
          />
        ) : (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📡</div>
            <p className="text-white text-lg font-semibold mb-2">No Active Traffic</p>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              Generate traffic between services to see the live architecture diagram.
            </p>
            <button onClick={loadData} className="mt-6 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Service Details Popup */}
      {selectedService && architecture && (
        <ServiceDetailsPopup
          service={selectedService.service}
          serviceType={selectedService.type}
          architecture={architecture}
          onClose={() => setSelectedService(null)}
        />
      )}
    </div>
  );
}
