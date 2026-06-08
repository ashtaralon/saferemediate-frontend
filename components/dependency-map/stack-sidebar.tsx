'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Filter,
  HardDrive,
  IdCard,
  Key,
  KeyRound,
  Loader2,
  Lock,
  Search,
  Server,
  Shield,
  Table2,
  Target,
  X,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types — defined inline since traffic-flow-map.tsx does not export them
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
  principals?: ComputeService[];
  instanceProfiles?: IamRole[];
  iamPolicies?: IamRole[];
  apiCalls?: Resource[];
  flows: Flow[];
  totalBytes: number;
  totalConnections: number;
  totalGaps: number;
}

interface AttackPath {
  nodes: Array<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Drill-down types — public so traffic-flow-map.tsx and any future consumer
// can type the filter callback. Shape mirrors the backend response.
// ---------------------------------------------------------------------------

export interface DrilldownChild {
  id: string;
  name: string;
  type: string;
  metric_label?: string | null;
  metric_value?: number | null;
  accessor_count?: number | null;
  rows_read?: number | null;
  rows_written?: number | null;
  sensitivity?: string | null;
  classification?: string | null;
  distinct_tables?: number | null;
  last_observed?: string | null;
  last_seen?: string | null;
}

export interface ResourcePathsFilter {
  resourceId: string;
  resolvedTargetId: string;
  parentJewelId: string | null;
  resolvedTargetType: string | null;
  accessorIds: string[];
  sourceIps: string[];
  filter: { database?: string | null; table?: string | null } | null;
  leafType: 'S3Prefix' | 'RDSTable' | 'RDSDatabase' | null;
  // Display label for the banner / map header chip.
  displayName: string;
}

interface StackSidebarProps {
  architecture: Architecture;
  onSelectResource: (resource: any, type: string) => void;
  highlightedNodeId: string | null;
  onHighlightNode: (nodeId: string | null) => void;
  attackPaths?: AttackPath[];
  /** Used for the `system_name` query param on the backend drill-down calls. */
  systemName?: string;
  /** Receives a filter spec (or null to clear) when the operator clicks the
   *  Filter icon on a drillable parent row or a leaf child row. */
  onFilterPaths?: (filter: ResourcePathsFilter | null) => void;
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

// Module-scope cache survives sidebar unmount (tab switches in TrafficFlowMap
// remount the sidebar; without this every expand would refetch).
const CHILDREN_CACHE = new Map<string, DrilldownChild[]>();

function cacheKey(resourceId: string, systemName?: string) {
  return `${resourceId}|${systemName ?? ''}`;
}

// Sensitivity classification → pill style. PII/PHI/financial are the three
// well-known tags surfaced by the backend; default falls back to amber.
function sensitivityPillClass(value: string): string {
  const v = value.toLowerCase();
  if (v.includes('pii')) {
    return 'bg-red-500/15 text-red-300 border border-red-500/40';
  }
  if (v.includes('phi')) {
    return 'bg-orange-500/15 text-orange-300 border border-orange-500/40';
  }
  if (v.includes('financial') || v.includes('finance')) {
    return 'bg-amber-500/15 text-amber-300 border border-amber-500/40';
  }
  return 'bg-amber-500/15 text-amber-300 border border-amber-500/40';
}

// Drillable = the row has children we can fetch (S3 bucket, RDS instance,
// RDS database). DDB tables, S3 prefixes, RDS tables are leaves.
// The architecture builder normalises type to the NodeType enum
// ('storage' / 'database' / 'dynamodb'), with 'database' reserved for
// RDS-class engines and 'dynamodb' explicitly separate. S3 buckets all
// land in 'storage' (no DDB-in-storage edge case observed in prod), so
// we can lean on the type label entirely — the id can be a bare RDS
// instance name OR a full ARN depending on whether the architecture
// builder hit the seed-list shortcut.
function isDrillable(item: { id: string; type?: string }, groupKey: string): boolean {
  const t = (item.type || '').toLowerCase();
  if (groupKey === 'storage') {
    // All resources in this group are S3-class; only 'storage' marker
    // is reliable. Excludes the pathological case where DDB types ever
    // slip in here.
    return t === 'storage';
  }
  if (groupKey === 'databases') {
    // RDS = 'database'. DDB tables are leaves (no first-class children).
    return t === 'database';
  }
  return false;
}

// Is a fetched child itself drillable? RDSDatabase has tables under it; all
// other child types are leaves.
function isChildDrillable(child: DrilldownChild): boolean {
  return child.type === 'RDSDatabase';
}

// Icon + colour per child type. Distinct from the group icon so the operator
// can tell prefixes from tables from KMS keys at a glance.
function childIcon(child: DrilldownChild): { Icon: React.ElementType; color: string } {
  switch (child.type) {
    case 'S3Prefix':
      return { Icon: HardDrive, color: 'text-emerald-400' };
    case 'RDSDatabase':
      return { Icon: Database, color: 'text-purple-400' };
    case 'RDSTable':
      return { Icon: Table2, color: 'text-cyan-400' };
    case 'DynamoDBTable':
      return { Icon: Table2, color: 'text-cyan-400' };
    case 'KMSKey':
      return { Icon: KeyRound, color: 'text-amber-400' };
    default:
      return { Icon: HardDrive, color: 'text-slate-400' };
  }
}

// Tail / friendly display name for a resource id — used in the active-filter
// banner and the map header badge.
function tailName(id: string): string {
  // Composite RDS table id: …::tbl::table_name
  const tblMatch = id.match(/::tbl::([^:]+)$/);
  if (tblMatch) return tblMatch[1];
  // Composite RDS database id: …::db::dbname
  const dbMatch = id.match(/::db::([^:]+)$/);
  if (dbMatch) return dbMatch[1];
  // S3 prefix: bucket/key/
  if (id.includes('/')) {
    const parts = id.split('/').filter(Boolean);
    return parts.slice(-1)[0] || id;
  }
  // ARN tail
  if (id.includes(':')) return id.split(':').slice(-1)[0];
  return id;
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
  { key: 'principals', label: 'Principals', icon: Target, iconColor: 'text-cyan-300' },
  { key: 'compute', label: 'Compute', icon: Server, iconColor: 'text-blue-400' },
  { key: 'securityGroups', label: 'Security Groups', icon: Shield, iconColor: 'text-orange-400' },
  { key: 'nacls', label: 'NACLs', icon: Lock, iconColor: 'text-cyan-400' },
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
  systemName,
  onFilterPaths,
}: StackSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUP_CONFIGS.map((g) => [g.key, true])),
  );

  // Drill-down expansion state — keyed by resource id (parent rows AND nested
  // RDSDatabase children both live here).
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [childrenById, setChildrenById] = useState<Record<string, DrilldownChild[]>>({});
  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});
  const [errorRows, setErrorRows] = useState<Record<string, string>>({});

  // Active click-to-filter selection (id of the row whose Filter button is
  // toggled on). Used to highlight the row and to dedupe re-clicks.
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [activeFilterLabel, setActiveFilterLabel] = useState<string | null>(null);

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
      principals: (architecture.principals ?? []).filter((p) =>
        matchesSearch(p.name, p.shortName),
      ),
      compute: architecture.computeServices.filter((c) =>
        matchesSearch(c.name, c.shortName),
      ),
      securityGroups: architecture.securityGroups.filter((sg) =>
        matchesSearch(sg.name, sg.shortName),
      ),
      nacls: architecture.nacls.filter((n) => matchesSearch(n.name, n.shortName)),
      iamRoles: architecture.iamRoles.filter((r) => matchesSearch(r.name, r.shortName)),
      instanceProfiles: (architecture.instanceProfiles ?? []).filter((p) =>
        matchesSearch(p.name, p.shortName),
      ),
      iamPolicies: (architecture.iamPolicies ?? []).filter((p) =>
        matchesSearch(p.name, p.shortName),
      ),
      databases: filterResources((r) => /database|rds|dynamodb/i.test(r.type)),
      storage: filterResources((r) => /storage|s3/i.test(r.type)),
      apiCalls: architecture.apiCalls
        ? architecture.apiCalls.filter((r) => matchesSearch(r.name, r.shortName))
        : filterResources((r) => /api_call|lambda/i.test(r.type)),
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
      (architecture.principals?.length ?? 0) +
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

  // -------------------------------------------------------------------------
  // Drill-down fetch — memoised so children rows don't trigger refetches on
  // every re-render. Module-scope cache survives unmount; React state cache
  // keeps the rendered list reactive.
  // -------------------------------------------------------------------------
  const fetchChildren = useCallback(
    async (resourceId: string) => {
      const key = cacheKey(resourceId, systemName);
      const cached = CHILDREN_CACHE.get(key);
      if (cached) {
        setChildrenById((prev) => ({ ...prev, [resourceId]: cached }));
        return;
      }
      setLoadingRows((prev) => ({ ...prev, [resourceId]: true }));
      setErrorRows((prev) => {
        const next = { ...prev };
        delete next[resourceId];
        return next;
      });
      try {
        const qs = new URLSearchParams({ resource_id: resourceId });
        if (systemName) qs.set('system_name', systemName);
        const res = await fetch(
          `/api/proxy/system-map/resource-children?${qs.toString()}`,
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const children: DrilldownChild[] = Array.isArray(data.children)
          ? data.children
          : [];
        CHILDREN_CACHE.set(key, children);
        setChildrenById((prev) => ({ ...prev, [resourceId]: children }));
      } catch (err: any) {
        setErrorRows((prev) => ({
          ...prev,
          [resourceId]: err?.message || 'Failed to load children',
        }));
      } finally {
        setLoadingRows((prev) => {
          const next = { ...prev };
          delete next[resourceId];
          return next;
        });
      }
    },
    [systemName],
  );

  const toggleRowExpansion = useCallback(
    (resourceId: string) => {
      setExpandedRows((prev) => {
        const next = { ...prev, [resourceId]: !prev[resourceId] };
        return next;
      });
      // Lazy-fetch on first expand; cache-hit makes subsequent toggles
      // instant.
      if (!expandedRows[resourceId] && !childrenById[resourceId]) {
        fetchChildren(resourceId);
      }
    },
    [expandedRows, childrenById, fetchChildren],
  );

  // -------------------------------------------------------------------------
  // Click-to-filter — fetch /resource-paths for the row, bubble result up.
  // Re-clicking the same id clears the filter.
  // -------------------------------------------------------------------------
  const handleFilterClick = useCallback(
    async (
      resourceId: string,
      displayName: string,
      e: React.MouseEvent,
    ) => {
      e.stopPropagation();
      if (!onFilterPaths) return;

      // Toggle off if already active.
      if (activeFilterId === resourceId) {
        setActiveFilterId(null);
        setActiveFilterLabel(null);
        onFilterPaths(null);
        return;
      }

      try {
        const qs = new URLSearchParams({ resource_id: resourceId });
        if (systemName) qs.set('system_name', systemName);
        const res = await fetch(
          `/api/proxy/system-map/resource-paths?${qs.toString()}`,
        );
        if (!res.ok) {
          // Soft-fail — clear any previous filter and bail. Operator can retry.
          onFilterPaths(null);
          setActiveFilterId(null);
          setActiveFilterLabel(null);
          return;
        }
        const data = await res.json();
        const filter: ResourcePathsFilter = {
          resourceId,
          resolvedTargetId: data.resolved_target_id ?? resourceId,
          parentJewelId: data.parent_jewel_id ?? null,
          resolvedTargetType: data.resolved_target_type ?? null,
          accessorIds: Array.isArray(data.accessor_ids) ? data.accessor_ids : [],
          sourceIps: Array.isArray(data.source_ips) ? data.source_ips : [],
          filter: data.filter ?? null,
          leafType: data.leaf_type ?? null,
          displayName,
        };
        setActiveFilterId(resourceId);
        setActiveFilterLabel(displayName);
        onFilterPaths(filter);
      } catch (err) {
        onFilterPaths(null);
        setActiveFilterId(null);
        setActiveFilterLabel(null);
      }
    },
    [activeFilterId, onFilterPaths, systemName],
  );

  const clearActiveFilter = useCallback(() => {
    setActiveFilterId(null);
    setActiveFilterLabel(null);
    onFilterPaths?.(null);
  }, [onFilterPaths]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  // Render a leaf / non-drillable child row (S3 prefix, RDS table, DDB table).
  const renderChildRow = (
    child: DrilldownChild,
    indentLevel: number,
  ) => {
    const { Icon, color } = childIcon(child);
    const isActiveFilter = activeFilterId === child.id;
    const drillable = isChildDrillable(child);
    const isExpanded = !!expandedRows[child.id];
    const isLoading = !!loadingRows[child.id];
    const nested = childrenById[child.id];
    const indentPx = indentLevel * 12;
    const displayName = child.name || tailName(child.id);

    return (
      <React.Fragment key={child.id}>
        <div
          className={`group w-full flex items-start gap-1.5 pr-2 py-1.5 cursor-pointer transition-colors duration-150
            hover:bg-slate-800/80 ${isActiveFilter ? 'bg-blue-500/15 border-l-2 border-blue-400' : 'border-l-2 border-transparent'}`}
          style={{ paddingLeft: 12 + indentPx }}
          onClick={() => {
            if (drillable) toggleRowExpansion(child.id);
            else onSelectResource(child, child.type);
          }}
        >
          {drillable ? (
            <button
              type="button"
              className="mt-0.5 flex-shrink-0 hover:bg-slate-700 rounded p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                toggleRowExpansion(child.id);
              }}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-slate-400" />
              ) : (
                <ChevronRight className="w-3 h-3 text-slate-400" />
              )}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[11px] text-slate-200 truncate"
                title={child.name}
              >
                {displayName}
              </span>
              {child.sensitivity && (
                <span
                  className={`px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${sensitivityPillClass(child.sensitivity)}`}
                  title={`Sensitivity: ${child.sensitivity}`}
                >
                  {child.sensitivity}
                </span>
              )}
            </div>
            {child.metric_label && (
              <div className="text-[10px] text-slate-500 truncate tabular-nums">
                {child.metric_label}
              </div>
            )}
          </div>
          {onFilterPaths && (
            <button
              type="button"
              className={`flex-shrink-0 mt-0.5 p-1 rounded transition-colors
                ${isActiveFilter
                  ? 'text-blue-300 bg-blue-500/20'
                  : 'text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-slate-700 hover:text-blue-300'}`}
              onClick={(e) => handleFilterClick(child.id, displayName, e)}
              title={isActiveFilter ? 'Clear path filter' : 'Filter map to paths through this resource'}
              aria-label="Filter map paths"
            >
              <Filter className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Nested children for drillable children (RDSDatabase → tables) */}
        {drillable && isExpanded && (
          <>
            {isLoading && (
              <div
                className="text-[10px] text-slate-500 italic py-1"
                style={{ paddingLeft: 12 + indentPx + 24 }}
              >
                <Loader2 className="w-3 h-3 inline-block animate-spin mr-1" />
                Loading…
              </div>
            )}
            {!isLoading && errorRows[child.id] && (
              <div
                className="text-[10px] text-red-400 italic py-1"
                style={{ paddingLeft: 12 + indentPx + 24 }}
              >
                Error: {errorRows[child.id]}
              </div>
            )}
            {!isLoading && nested && nested.length === 0 && (
              <div
                className="text-[10px] text-slate-600 italic py-1"
                style={{ paddingLeft: 12 + indentPx + 24 }}
              >
                No children observed
              </div>
            )}
            {!isLoading &&
              nested &&
              nested.length > 0 &&
              nested.map((sub) => renderChildRow(sub, indentLevel + 1))}
          </>
        )}
      </React.Fragment>
    );
  };

  // Render a single top-level resource row. Drillable rows get a chevron +
  // (when expanded) a nested children list.
  const renderRow = (
    resource: { id: string; name: string; shortName: string; type?: string },
    type: string,
    status: StatusColor,
    groupKey: string,
  ) => {
    const isHighlighted = highlightedNodeId === resource.id;
    const drillable = isDrillable(resource as any, groupKey);
    const isExpanded = !!expandedRows[resource.id];
    const isLoading = !!loadingRows[resource.id];
    const children = childrenById[resource.id];
    const isActiveFilter = activeFilterId === resource.id;

    return (
      <React.Fragment key={resource.id}>
        <div
          className={`group w-full flex items-center gap-1.5 px-3 py-2 cursor-pointer transition-colors duration-150
            hover:bg-slate-800 ${isHighlighted ? 'bg-slate-700/50' : ''}
            ${isActiveFilter ? 'bg-blue-500/15 border-l-2 border-blue-400' : 'border-l-2 border-transparent'}`}
          onClick={() => onSelectResource(resource, type)}
          onMouseEnter={() => onHighlightNode(resource.id)}
          onMouseLeave={() => onHighlightNode(null)}
        >
          {drillable ? (
            <button
              type="button"
              className="flex-shrink-0 hover:bg-slate-700 rounded p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                toggleRowExpansion(resource.id);
              }}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-slate-400" />
              ) : (
                <ChevronRight className="w-3 h-3 text-slate-400" />
              )}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <StatusDot color={status} />
          <span
            className="text-xs text-slate-300 truncate flex-1"
            title={resource.name}
          >
            {resource.shortName || resource.name}
          </span>
          {drillable && onFilterPaths && (
            <button
              type="button"
              className={`flex-shrink-0 p-1 rounded transition-colors
                ${isActiveFilter
                  ? 'text-blue-300 bg-blue-500/20'
                  : 'text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-slate-700 hover:text-blue-300'}`}
              onClick={(e) =>
                handleFilterClick(
                  resource.id,
                  resource.shortName || resource.name,
                  e,
                )
              }
              title={isActiveFilter ? 'Clear path filter' : 'Filter map to paths through this resource'}
              aria-label="Filter map paths"
            >
              <Filter className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Drill-down children */}
        {drillable && isExpanded && (
          <>
            {isLoading && (
              <div className="pl-12 py-1 text-[10px] text-slate-500 italic">
                <Loader2 className="w-3 h-3 inline-block animate-spin mr-1" />
                Loading…
              </div>
            )}
            {!isLoading && errorRows[resource.id] && (
              <div className="pl-12 py-1 text-[10px] text-red-400 italic">
                Error: {errorRows[resource.id]}
              </div>
            )}
            {!isLoading && children && children.length === 0 && (
              <div className="pl-12 py-1 text-[10px] text-slate-600 italic">
                No children observed
              </div>
            )}
            {!isLoading &&
              children &&
              children.length > 0 &&
              children.map((child) => renderChildRow(child, 1))}
          </>
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
          <div className="pl-1">
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
                    status = getIamStatus(item);
                    break;
                  default:
                    status = 'green';
                    break;
                }

                return renderRow(item, config.key, status, config.key);
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

      {/* Active filter banner — only when click-to-filter is in effect */}
      {activeFilterId && (
        <div className="px-3 py-2 bg-blue-500/10 border-b border-blue-500/20 flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-blue-300 flex-shrink-0" />
          <div className="flex-1 min-w-0 text-[11px] text-blue-200">
            Map filtered to{' '}
            <span className="font-semibold" title={activeFilterId}>
              {activeFilterLabel || tailName(activeFilterId)}
            </span>
          </div>
          <button
            type="button"
            className="flex-shrink-0 text-[10px] uppercase tracking-wider text-blue-300 hover:text-blue-100 hover:bg-blue-500/20 px-1.5 py-0.5 rounded flex items-center gap-1"
            onClick={clearActiveFilter}
            aria-label="Clear filter"
          >
            <X className="w-3 h-3" />
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
