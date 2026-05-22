'use client';

import React, { useState, useMemo, useCallback } from 'react';
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
  Loader2,
  Filter,
  Table2,
  KeyRound,
  FileText,
  IdCard,
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
  /** Split out of iamRoles 2026-05-22 — see attacker-view-panel for
   *  rationale. Optional so consumers compiled against the old shape
   *  keep working (they just won't show the new lanes). */
  instanceProfiles?: IamRole[];
  iamPolicies?: IamRole[];
  flows: Flow[];
  totalBytes: number;
  totalConnections: number;
  totalGaps: number;
}

interface AttackPath {
  nodes: Array<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Drill-down child types (backend response shape)
// ---------------------------------------------------------------------------

interface DrilldownChild {
  id: string;
  name: string;
  type: string; // 'S3Prefix' | 'RDSDatabase' | 'RDSTable' | ...
  metric_label?: string;
  metric_value?: number;
  accessor_count?: number;
  rows_read?: number;
  rows_written?: number;
  sensitivity?: string | null;
  classification?: string | null;
  last_seen?: string | null;
  last_observed?: string | null;
}

interface DrilldownResponse {
  resource_id: string;
  resource_type: string;
  child_count: number;
  children: DrilldownChild[];
  is_leaf: boolean;
}

// Per-id cache so re-expanding a node doesn't refetch. Lives at module
// scope intentionally — the StackSidebar component is unmounted on tab
// switch, but the user re-opens the same map fast and we don't want to
// re-fetch the same prefixes every time.
const _childrenCache = new Map<string, DrilldownChild[]>();

// ---------------------------------------------------------------------------
// Resource-paths filter — what the parent receives when user clicks a leaf
// ---------------------------------------------------------------------------

export interface ResourcePathsFilter {
  resourceId: string;
  resolvedTargetId: string;
  parentJewelId: string;
  resolvedTargetType: string | null;
  accessorIds: string[];
  sourceIps: string[];
  filter: { database?: string; table?: string } | null;
  leafType: string | null;
}

interface StackSidebarProps {
  architecture: Architecture;
  onSelectResource: (resource: any, type: string) => void;
  highlightedNodeId: string | null;
  onHighlightNode: (nodeId: string | null) => void;
  attackPaths?: AttackPath[];
  // Tier-2: emitted when the user clicks a leaf in the drill-down (S3
  // prefix, RDS table, DDB table, KMS key) OR a drillable resource
  // itself. Parent can use this to filter the rendered map to nodes
  // that touch this resource. Null clears any active filter.
  onFilterPaths?: (filter: ResourcePathsFilter | null) => void;
  // System scope for the resource-children + resource-paths calls.
  systemName?: string;
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

// Type → icon for drilldown children (KMS / DDB / RDS distinct).
function childIcon(type: string): React.ReactNode {
  const t = (type || '').toLowerCase();
  if (t === 's3prefix') return <HardDrive className="w-3 h-3 text-green-400" />;
  if (t === 'rdsdatabase') return <Database className="w-3 h-3 text-purple-400" />;
  if (t === 'rdstable') return <Table2 className="w-3 h-3 text-cyan-400" />;
  if (t === 'kmskey') return <KeyRound className="w-3 h-3 text-amber-300" />;
  if (t === 'dynamodbtable') return <Table2 className="w-3 h-3 text-orange-400" />;
  return <Database className="w-3 h-3 text-slate-400" />;
}

// Resource → can-drill-down? S3 buckets + RDS instances expose children.
// DDB tables don't (no sub-table hierarchy in AWS).
function isDrillable(resource: Resource): boolean {
  const t = (resource.type || '').toLowerCase();
  const id = (resource.id || '').toLowerCase();
  if (t.includes('s3') || id.includes(':s3:')) return true;
  if (t.includes('rds') && !t.includes('table')) return true;
  if (id.includes(':rds:')) return true;
  return false;
}

// Sensitivity → badge palette.
function sensitivityClass(sens: string | null | undefined): string {
  if (!sens) return '';
  const s = sens.toLowerCase();
  if (s === 'pii' || s === 'phi') return 'bg-red-500/20 text-red-200 border-red-500/40';
  if (s === 'financial' || s === 'pci') return 'bg-orange-500/20 text-orange-200 border-orange-500/40';
  if (s === 'confidential') return 'bg-amber-500/20 text-amber-200 border-amber-500/40';
  return 'bg-slate-700/40 text-slate-300 border-slate-600';
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
  // Identity is now three distinct lanes — see attacker-view-panel for
  // the 2026-05-22 split rationale. Ordering reflects the attack-path
  // narrative: Role (what the principal IS) → InstanceProfile (the
  // binding that wires a role to compute) → IAMPolicy (the grant that
  // makes the wildcard finding visible). Each shows its own count.
  { key: 'iamRoles', label: 'IAM Roles', icon: Key, iconColor: 'text-pink-400' },
  { key: 'instanceProfiles', label: 'Instance Profiles', icon: IdCard, iconColor: 'text-fuchsia-400' },
  { key: 'iamPolicies', label: 'IAM Policies', icon: FileText, iconColor: 'text-rose-400' },
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
  onFilterPaths,
  systemName,
}: StackSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUP_CONFIGS.map((g) => [g.key, true])),
  );
  // Per-row drill-down state. expandedRows[id] = true means the row's
  // children are visible. childrenById[id] = the fetched payload.
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [childrenById, setChildrenById] = useState<Record<string, DrilldownChild[]>>({});
  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);

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
      // Optional architecture fields — fall back to empty array so the
      // sidebar renders cleanly when an older builder version didn't
      // populate them (instead of throwing on .filter on undefined).
      instanceProfiles: (architecture.instanceProfiles ?? []).filter((p) =>
        matchesSearch(p.name, p.shortName),
      ),
      iamPolicies: (architecture.iamPolicies ?? []).filter((p) =>
        matchesSearch(p.name, p.shortName),
      ),
      databases: filterResources((r) =>
        /database|rds|dynamodb/i.test(r.type),
      ),
      storage: filterResources((r) => /storage|s3/i.test(r.type)),
      apiCalls: filterResources((r) => /api_call|lambda/i.test(r.type)),
    };
  }, [architecture, searchQuery]);

  // Fetch children for a drillable resource (lazy, cached).
  const fetchChildren = useCallback(
    async (resourceId: string): Promise<DrilldownChild[]> => {
      const cached = _childrenCache.get(resourceId);
      if (cached) return cached;
      const params = new URLSearchParams({ resource_id: resourceId });
      if (systemName) params.set('system_name', systemName);
      const res = await fetch(
        `/api/proxy/system-map/resource-children?${params.toString()}`,
      );
      if (!res.ok) {
        // Surface empty rather than throwing — UI shows "no children" state.
        _childrenCache.set(resourceId, []);
        return [];
      }
      const data: DrilldownResponse = await res.json();
      const children = data.children ?? [];
      _childrenCache.set(resourceId, children);
      return children;
    },
    [systemName],
  );

  const toggleRowExpansion = useCallback(
    async (resourceId: string) => {
      const isOpen = expandedRows[resourceId];
      if (isOpen) {
        setExpandedRows((prev) => ({ ...prev, [resourceId]: false }));
        return;
      }
      // Already have children → just open.
      if (childrenById[resourceId]) {
        setExpandedRows((prev) => ({ ...prev, [resourceId]: true }));
        return;
      }
      setLoadingRows((prev) => ({ ...prev, [resourceId]: true }));
      try {
        const children = await fetchChildren(resourceId);
        setChildrenById((prev) => ({ ...prev, [resourceId]: children }));
        setExpandedRows((prev) => ({ ...prev, [resourceId]: true }));
      } finally {
        setLoadingRows((prev) => ({ ...prev, [resourceId]: false }));
      }
    },
    [expandedRows, childrenById, fetchChildren],
  );

  // Filter-by-leaf handler. Calls resource-paths and bubbles the filter
  // to the parent so the map can dim non-matching nodes.
  const applyFilter = useCallback(
    async (resourceId: string) => {
      if (!onFilterPaths) return;
      if (activeFilterId === resourceId) {
        // Click again on the active filter = clear.
        setActiveFilterId(null);
        onFilterPaths(null);
        return;
      }
      const params = new URLSearchParams({ resource_id: resourceId });
      if (systemName) params.set('system_name', systemName);
      try {
        const res = await fetch(
          `/api/proxy/system-map/resource-paths?${params.toString()}`,
        );
        if (!res.ok) {
          setActiveFilterId(null);
          onFilterPaths(null);
          return;
        }
        const data = await res.json();
        const filter: ResourcePathsFilter = {
          resourceId,
          resolvedTargetId: data.resolved_target_id ?? resourceId,
          parentJewelId: data.parent_jewel_id ?? resourceId,
          resolvedTargetType: data.resolved_target_type ?? null,
          accessorIds: data.accessor_ids ?? [],
          sourceIps: data.source_ips ?? [],
          filter: data.filter ?? null,
          leafType: data.leaf_type ?? null,
        };
        setActiveFilterId(resourceId);
        onFilterPaths(filter);
      } catch {
        setActiveFilterId(null);
        onFilterPaths(null);
      }
    },
    [activeFilterId, onFilterPaths, systemName],
  );

  const clearFilter = useCallback(() => {
    setActiveFilterId(null);
    onFilterPaths?.(null);
  }, [onFilterPaths]);

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
      (architecture.instanceProfiles?.length ?? 0) +
      (architecture.iamPolicies?.length ?? 0) +
      architecture.resources.length
    );
  }, [architecture]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Render a single child row (S3 prefix, RDS database, RDS table, etc.)
  const renderChildRow = (child: DrilldownChild, parentId: string, depth: number) => {
    const isActive = activeFilterId === child.id;
    const canDrill = child.type === 'RDSDatabase'; // database → tables
    const isOpen = expandedRows[child.id];
    const loading = loadingRows[child.id];
    const grandchildren = childrenById[child.id];

    return (
      <React.Fragment key={child.id}>
        <div
          className={`w-full flex items-center gap-1.5 pl-${4 + depth * 3} pr-2 py-1.5 text-left transition-colors duration-150 hover:bg-slate-800 ${
            isActive ? 'bg-blue-500/15 border-l-2 border-blue-400' : ''
          }`}
          style={{ paddingLeft: `${20 + depth * 14}px` }}
        >
          {canDrill ? (
            <button
              onClick={() => toggleRowExpansion(child.id)}
              className="flex-shrink-0 text-slate-500 hover:text-slate-300"
              title={isOpen ? 'Collapse' : 'Expand'}
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          ) : (
            <span className="w-3 h-3 flex-shrink-0" />
          )}
          {childIcon(child.type)}
          <button
            onClick={() => applyFilter(child.id)}
            className="flex-1 text-left min-w-0"
            title={`Click to filter map to paths touching ${child.name}`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] text-slate-300 truncate">
                {child.name}
              </span>
              {child.sensitivity && (
                <span
                  className={`px-1 py-0.5 rounded text-[8px] font-semibold border uppercase tracking-wider ${sensitivityClass(
                    child.sensitivity,
                  )}`}
                  title={`Data classification: ${child.classification ?? child.sensitivity}`}
                >
                  {child.sensitivity}
                </span>
              )}
            </div>
            {child.metric_label && (
              <div className="text-[9px] text-slate-500 truncate">
                {child.metric_label}
              </div>
            )}
          </button>
          {onFilterPaths && (
            <button
              onClick={() => applyFilter(child.id)}
              className={`flex-shrink-0 p-1 rounded transition-colors ${
                isActive
                  ? 'text-blue-300 bg-blue-500/20'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-700'
              }`}
              title={isActive ? 'Clear filter' : 'Filter map to this'}
            >
              <Filter className="w-3 h-3" />
            </button>
          )}
        </div>
        {isOpen && grandchildren && (
          <div>
            {grandchildren.length === 0 ? (
              <div
                className="text-[10px] italic text-slate-600"
                style={{ paddingLeft: `${40 + depth * 14}px` }}
              >
                No children observed
              </div>
            ) : (
              grandchildren.map((gc) =>
                renderChildRow(gc, child.id, depth + 1),
              )
            )}
          </div>
        )}
      </React.Fragment>
    );
  };

  // Render a single resource row in the main list
  const renderRow = (
    resource: { id: string; name: string; shortName: string; type?: string },
    type: string,
    status: StatusColor,
  ) => {
    const isHighlighted = highlightedNodeId === resource.id;
    const isActive = activeFilterId === resource.id;
    const drillable =
      (type === 'databases' || type === 'storage') &&
      isDrillable(resource as Resource);
    const isOpen = expandedRows[resource.id];
    const loading = loadingRows[resource.id];
    const children = childrenById[resource.id];

    return (
      <React.Fragment key={resource.id}>
        <div
          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-150
            hover:bg-slate-800 ${isHighlighted ? 'bg-slate-700/50' : ''} ${
            isActive ? 'bg-blue-500/15 border-l-2 border-blue-400' : ''
          }`}
          onMouseEnter={() => onHighlightNode(resource.id)}
          onMouseLeave={() => onHighlightNode(null)}
        >
          {drillable ? (
            <button
              onClick={() => toggleRowExpansion(resource.id)}
              className="flex-shrink-0 text-slate-500 hover:text-slate-300"
              title={isOpen ? 'Collapse' : 'Expand children'}
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          ) : (
            <span className="w-3 h-3 flex-shrink-0" />
          )}
          <StatusDot color={status} />
          <button
            className="flex-1 text-left min-w-0"
            onClick={() => onSelectResource(resource, type)}
          >
            <span className="text-xs text-slate-300 truncate" title={resource.name}>
              {resource.shortName || resource.name}
            </span>
          </button>
          {onFilterPaths && (type === 'databases' || type === 'storage') && (
            <button
              onClick={() => applyFilter(resource.id)}
              className={`flex-shrink-0 p-1 rounded transition-colors ${
                isActive
                  ? 'text-blue-300 bg-blue-500/20'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-700'
              }`}
              title={isActive ? 'Clear filter' : 'Filter map to paths to this resource'}
            >
              <Filter className="w-3 h-3" />
            </button>
          )}
        </div>
        {isOpen && children && (
          <div className="bg-slate-900/50">
            {children.length === 0 ? (
              <div
                className="text-[10px] italic text-slate-600 py-1"
                style={{ paddingLeft: '40px' }}
              >
                No children observed
              </div>
            ) : (
              children.map((c) => renderChildRow(c, resource.id, 1))
            )}
          </div>
        )}
      </React.Fragment>
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
                  case 'instanceProfiles':
                  case 'iamPolicies':
                    // All three identity types use the same gap-ratio
                    // status. InstanceProfile + IAMPolicy will show
                    // 'green' until per-row usedCount/totalCount get
                    // piped in (currently both are 0/0). That's the
                    // honest neutral — better than fake amber.
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

      {/* Active filter banner */}
      {activeFilterId && onFilterPaths && (
        <div className="px-3 py-2 bg-blue-500/10 border-b border-blue-500/30 flex items-center gap-2">
          <Filter className="w-3 h-3 text-blue-300 flex-shrink-0" />
          <span className="text-[10px] text-blue-200 truncate flex-1">
            Map filtered to {activeFilterId.split('/').pop() ?? activeFilterId}
          </span>
          <button
            onClick={clearFilter}
            className="text-[10px] text-blue-300 hover:text-blue-100 px-1.5 py-0.5 rounded hover:bg-blue-500/20"
          >
            Clear
          </button>
        </div>
      )}

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
