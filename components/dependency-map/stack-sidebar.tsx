'use client';

import React, { useState, useMemo } from 'react';
import {
  Server,
  Shield,
  Lock,
  Key,
  Database,
  HardDrive,
  Zap,
  Search,
  ChevronDown,
  ChevronRight,
  Globe,
  Network,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types – defined inline since traffic-flow-map.tsx does not export them
// ---------------------------------------------------------------------------

interface ComputeService {
  id: string;
  name: string;
  shortName: string;
  type: string;
  instanceId?: string;
}

interface Resource {
  id: string;
  name: string;
  shortName: string;
  type: string;
}

interface SecurityGroup {
  id: string;
  name: string;
  shortName: string;
  type: string;
  gapCount: number;
  rules?: Array<{ isPublic: boolean }>;
}

interface Nacl {
  id: string;
  name: string;
  shortName: string;
  type: string;
  gapCount: number;
}

interface IamRole {
  id: string;
  name: string;
  shortName: string;
  type: string;
  usedCount: number;
  totalCount: number;
}

interface Flow {
  sourceId: string;
  targetId: string;
  bytes: number;
}

interface Architecture {
  computeServices: ComputeService[];
  resources: Resource[];
  securityGroups: SecurityGroup[];
  nacls: Nacl[];
  iamRoles: IamRole[];
  flows: Flow[];
  totalBytes: number;
  totalConnections: number;
  totalGaps: number;
}

interface AttackPath {
  nodes: Array<{ id: string }>;
}

interface StackSidebarProps {
  architecture: Architecture;
  onSelectResource: (resource: any, type: string) => void;
  highlightedNodeId: string | null;
  onHighlightNode: (nodeId: string | null) => void;
  attackPaths?: AttackPath[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatusColor = 'green' | 'red' | 'amber' | 'yellow';

const STATUS_COLOR_MAP: Record<StatusColor, string> = {
  green: 'bg-emerald-400',
  red: 'bg-red-500',
  amber: 'bg-amber-400',
  yellow: 'bg-yellow-400',
};

function StatusDot({ color }: { color: StatusColor }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLOR_MAP[color]}`}
    />
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300 ml-auto tabular-nums">
      {count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Resource group config
// ---------------------------------------------------------------------------

interface GroupConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  iconColor: string;
}

const GROUP_CONFIGS: GroupConfig[] = [
  { key: 'compute', label: 'Compute', icon: Server, iconColor: 'text-blue-400' },
  { key: 'securityGroups', label: 'Security Groups', icon: Shield, iconColor: 'text-orange-400' },
  { key: 'nacls', label: 'NACLs', icon: Lock, iconColor: 'text-cyan-400' },
  { key: 'iamRoles', label: 'IAM Roles', icon: Key, iconColor: 'text-pink-400' },
  { key: 'databases', label: 'Databases', icon: Database, iconColor: 'text-purple-400' },
  { key: 'storage', label: 'Storage', icon: HardDrive, iconColor: 'text-green-400' },
  { key: 'apiCalls', label: 'API Calls', icon: Zap, iconColor: 'text-lime-400' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StackSidebar({
  architecture,
  onSelectResource,
  highlightedNodeId,
  onHighlightNode,
  attackPaths,
}: StackSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUP_CONFIGS.map((g) => [g.key, true])),
  );

  // Build sets for fast lookups
  const activeFlowNodeIds = useMemo(() => {
    const ids = new Set<string>();
    architecture.flows.forEach((f) => {
      ids.add(f.sourceId);
      ids.add(f.targetId);
    });
    return ids;
  }, [architecture.flows]);

  const attackPathNodeIds = useMemo(() => {
    const ids = new Set<string>();
    attackPaths?.forEach((path) => {
      path.nodes.forEach((n) => ids.add(n.id));
    });
    return ids;
  }, [attackPaths]);

  // Group resources
  const groupedResources = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();

    const matchesSearch = (name: string, shortName: string) => {
      if (!lowerQuery) return true;
      return (
        name.toLowerCase().includes(lowerQuery) ||
        shortName.toLowerCase().includes(lowerQuery)
      );
    };

    const filterResources = (predicate: (r: Resource) => boolean) =>
      architecture.resources.filter(
        (r) => predicate(r) && matchesSearch(r.name, r.shortName),
      );

    return {
      compute: architecture.computeServices.filter((c) =>
        matchesSearch(c.name, c.shortName),
      ),
      securityGroups: architecture.securityGroups.filter((sg) =>
        matchesSearch(sg.name, sg.shortName),
      ),
      nacls: architecture.nacls.filter((n) => matchesSearch(n.name, n.shortName)),
      iamRoles: architecture.iamRoles.filter((r) => matchesSearch(r.name, r.shortName)),
      databases: filterResources((r) =>
        /database|rds|dynamodb/i.test(r.type),
      ),
      storage: filterResources((r) => /storage|s3/i.test(r.type)),
      apiCalls: filterResources((r) => /api_call|lambda/i.test(r.type)),
    };
  }, [architecture, searchQuery]);

  // Status helpers
  const getComputeStatus = (c: ComputeService): StatusColor => {
    if (attackPathNodeIds.has(c.id)) return 'red';
    if (activeFlowNodeIds.has(c.id)) return 'green';
    return 'yellow';
  };

  const getSgStatus = (sg: SecurityGroup): StatusColor => {
    if (sg.rules?.some((r) => r.isPublic)) return 'red';
    if (sg.gapCount > 0) return 'amber';
    return 'green';
  };

  const getNaclStatus = (nacl: Nacl): StatusColor => {
    if (nacl.gapCount > 0) return 'amber';
    return 'green';
  };

  const getIamStatus = (role: IamRole): StatusColor => {
    if (role.totalCount === 0) return 'green';
    const ratio = role.usedCount / role.totalCount;
    if (ratio >= 0.8) return 'green';
    if (ratio >= 0.5) return 'amber';
    return 'red';
  };

  // Total count across all groups
  const totalCount = useMemo(() => {
    return (
      architecture.computeServices.length +
      architecture.securityGroups.length +
      architecture.nacls.length +
      architecture.iamRoles.length +
      architecture.resources.length
    );
  }, [architecture]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Render a single resource row
  const renderRow = (
    resource: { id: string; name: string; shortName: string },
    type: string,
    status: StatusColor,
  ) => {
    const isHighlighted = highlightedNodeId === resource.id;

    return (
      <button
        key={resource.id}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer transition-colors duration-150
          hover:bg-slate-800 ${isHighlighted ? 'bg-slate-700/50' : ''}`}
        onClick={() => onSelectResource(resource, type)}
        onMouseEnter={() => onHighlightNode(resource.id)}
        onMouseLeave={() => onHighlightNode(null)}
      >
        <StatusDot color={status} />
        <span className="text-xs text-slate-300 truncate" title={resource.name}>
          {resource.shortName || resource.name}
        </span>
      </button>
    );
  };

  // Render a collapsible group section
  const renderGroup = (config: GroupConfig) => {
    const items = groupedResources[config.key as keyof typeof groupedResources] as any[];
    const isExpanded = expandedGroups[config.key];
    const Icon = config.icon;

    return (
      <div key={config.key}>
        {/* Group header */}
        <button
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800/60 transition-colors duration-150 cursor-pointer"
          onClick={() => toggleGroup(config.key)}
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-slate-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
          )}
          <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${config.iconColor}`} />
          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
            {config.label}
          </span>
          <CountBadge count={items.length} />
        </button>

        {/* Group items */}
        {isExpanded && (
          <div className="pl-3">
            {items.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-slate-600 italic">
                No resources found
              </div>
            ) : (
              items.map((item: any) => {
                let status: StatusColor = 'green';

                switch (config.key) {
                  case 'compute':
                    status = getComputeStatus(item);
                    break;
                  case 'securityGroups':
                    status = getSgStatus(item);
                    break;
                  case 'nacls':
                    status = getNaclStatus(item);
                    break;
                  case 'iamRoles':
                    status = getIamStatus(item);
                    break;
                  default:
                    status = 'green';
                    break;
                }

                return renderRow(item, config.key, status);
              })
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-[280px] flex-shrink-0 bg-[#0f172a] border-r border-slate-700 flex flex-col h-full select-none">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/60">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Stack Components
          </h2>
          <span className="text-[10px] text-slate-500 tabular-nums">
            {totalCount} total
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-700/40">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search resources…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/60 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Scrollable resource list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        <div className="py-1">
          {GROUP_CONFIGS.map((config) => renderGroup(config))}
        </div>
      </div>
    </aside>
  );
}
