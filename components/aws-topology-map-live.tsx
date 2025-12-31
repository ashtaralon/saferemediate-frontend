'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

// ============================================================================
// TYPES
// ============================================================================

interface SGRule {
  port: string;
  fromPort?: number;
  toPort?: number;
  protocol: string;
  sources: Array<{
    cidr?: string;
    sgId?: string;
    sgName?: string;
    description?: string;
  }>;
  isPublic: boolean;
}

interface LPResource {
  id: string;
  resourceName: string;
  resourceType: string;
  resourceArn: string;
  systemName: string;
  lpScore?: number;
  gapCount?: number;
  severity?: string;
  allowedList?: SGRule[];
  networkExposure?: {
    score: number;
    severity: string;
    internetExposedRules: number;
  };
}

interface AWSTopologyMapLiveProps {
  systemName: string;
  autoRefreshInterval?: number;
  height?: string;
  showLegend?: boolean;
  showMiniMap?: boolean;
  onNodeClick?: (node: any) => void;
}

// ============================================================================
// STYLING
// ============================================================================

const CATEGORY_CONFIG: Record<string, { color: string; icon: string; bg: string; border: string }> = {
  Internet: { color: '#dc2626', icon: '🌐', bg: '#fef2f2', border: '#dc2626' },
  SecurityGroup: { color: '#7c3aed', icon: '🛡️', bg: '#f5f3ff', border: '#7c3aed' },
  IAMRole: { color: '#ea580c', icon: '👤', bg: '#fff7ed', border: '#ea580c' },
  S3Bucket: { color: '#16a34a', icon: '📦', bg: '#f0fdf4', border: '#16a34a' },
  Lambda: { color: '#f59e0b', icon: '⚡', bg: '#fffbeb', border: '#f59e0b' },
  DynamoDB: { color: '#2563eb', icon: '🗄️', bg: '#eff6ff', border: '#2563eb' },
  EC2: { color: '#f97316', icon: '🖥️', bg: '#fff7ed', border: '#f97316' },
  Unknown: { color: '#6b7280', icon: '📄', bg: '#f9fafb', border: '#6b7280' },
};

// ============================================================================
// DAGRE LAYOUT - Horizontal (LR)
// ============================================================================

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ 
    rankdir: 'LR',  // Left to Right
    nodesep: 80,    // Vertical spacing
    ranksep: 180,   // Horizontal spacing
    marginx: 60,
    marginy: 60,
  });

  const nodeWidth = 240;
  const nodeHeight = 100;

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return {
    nodes: nodes.map((node) => {
      const pos = dagreGraph.node(node.id);
      return pos ? { 
        ...node, 
        position: { 
          x: pos.x - nodeWidth / 2, 
          y: pos.y - nodeHeight / 2 
        } 
      } : node;
    }),
    edges,
  };
};

// ============================================================================
// EXTRACT REAL CONNECTIONS FROM SG DATA
// ============================================================================

const extractRealConnections = (resources: LPResource[]): { edges: Edge[], hasInternet: boolean } => {
  const edges: Edge[] = [];
  const addedEdges = new Set<string>();
  let hasInternet = false;

  // Build SG lookup by ID
  const sgById = new Map<string, LPResource>();
  resources.forEach(r => {
    if (r.resourceType === 'SecurityGroup') {
      const match = r.resourceArn.match(/sg-[a-f0-9]+/);
      if (match) sgById.set(match[0], r);
    }
  });

  const securityGroups = resources.filter(r => r.resourceType === 'SecurityGroup');
  const iamRoles = resources.filter(r => r.resourceType === 'IAMRole');
  const s3Buckets = resources.filter(r => r.resourceType === 'S3Bucket');

  // 1. SG → SG connections from actual allowedList rules
  securityGroups.forEach(sg => {
    if (!sg.allowedList) return;

    sg.allowedList.forEach(rule => {
      // Check for internet exposure (0.0.0.0/0)
      const hasPublicAccess = rule.sources.some(s => s.cidr === '0.0.0.0/0');
      if (hasPublicAccess && rule.isPublic) {
        hasInternet = true;
        const edgeId = `internet->${sg.resourceName}`;
        if (!addedEdges.has(edgeId)) {
          addedEdges.add(edgeId);
          edges.push({
            id: edgeId,
            source: 'internet-gateway',
            target: sg.resourceName,
            type: 'smoothstep',
            animated: true,
            label: `Port ${rule.port} (${rule.protocol})`,
            labelStyle: { fontSize: 12, fontWeight: 600, fill: '#dc2626' },
            labelBgStyle: { fill: '#fef2f2', fillOpacity: 0.95 },
            labelBgPadding: [8, 4] as [number, number],
            style: { stroke: '#dc2626', strokeWidth: 3 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#dc2626', width: 20, height: 20 },
          });
        }
      }

      // SG → SG references
      rule.sources.forEach(source => {
        if (source.sgId) {
          const targetSg = sgById.get(source.sgId);
          if (targetSg && targetSg.resourceName !== sg.resourceName) {
            const edgeId = `${sg.resourceName}->${targetSg.resourceName}`;
            if (!addedEdges.has(edgeId)) {
              addedEdges.add(edgeId);
              edges.push({
                id: edgeId,
                source: sg.resourceName,
                target: targetSg.resourceName,
                type: 'smoothstep',
                animated: true,
                label: `Port ${rule.port}`,
                labelStyle: { fontSize: 11, fontWeight: 600, fill: '#7c3aed' },
                labelBgStyle: { fill: '#f5f3ff', fillOpacity: 0.95 },
                labelBgPadding: [6, 3] as [number, number],
                style: { stroke: '#7c3aed', strokeWidth: 2.5 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed', width: 18, height: 18 },
              });
            }
          }
        }
      });
    });
  });

  // 2. App SG → DB SG (architecture pattern)
  const appSg = securityGroups.find(sg => sg.resourceName.toLowerCase().includes('app'));
  const dbSg = securityGroups.find(sg => sg.resourceName.toLowerCase().includes('db'));
  const albSg = securityGroups.find(sg => sg.resourceName.toLowerCase().includes('alb'));

  if (albSg && appSg) {
    const edgeId = `${albSg.resourceName}->${appSg.resourceName}`;
    if (!addedEdges.has(edgeId)) {
      addedEdges.add(edgeId);
      edges.push({
        id: edgeId,
        source: albSg.resourceName,
        target: appSg.resourceName,
        type: 'smoothstep',
        animated: true,
        label: 'routes traffic',
        labelStyle: { fontSize: 11, fontWeight: 500, fill: '#2563eb' },
        labelBgStyle: { fill: '#eff6ff', fillOpacity: 0.95 },
        labelBgPadding: [6, 3] as [number, number],
        style: { stroke: '#2563eb', strokeWidth: 2.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb', width: 18, height: 18 },
      });
    }
  }

  if (appSg && dbSg) {
    const edgeId = `${appSg.resourceName}->${dbSg.resourceName}`;
    if (!addedEdges.has(edgeId)) {
      addedEdges.add(edgeId);
      edges.push({
        id: edgeId,
        source: appSg.resourceName,
        target: dbSg.resourceName,
        type: 'smoothstep',
        animated: true,
        label: 'connects DB',
        labelStyle: { fontSize: 11, fontWeight: 500, fill: '#2563eb' },
        labelBgStyle: { fill: '#eff6ff', fillOpacity: 0.95 },
        labelBgPadding: [6, 3] as [number, number],
        style: { stroke: '#2563eb', strokeWidth: 2.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb', width: 18, height: 18 },
      });
    }
  }

  // 3. IAM Roles → S3 (based on naming patterns)
  iamRoles.forEach(role => {
    const roleLower = role.resourceName.toLowerCase();
    
    s3Buckets.forEach(bucket => {
      const bucketLower = bucket.resourceName.toLowerCase();
      
      // Match patterns
      if (
        (roleLower.includes('cloudtrail') && bucketLower.includes('cloudtrail')) ||
        (roleLower.includes('lambda') && bucketLower.includes('logs')) ||
        (roleLower.includes('s3') && bucketLower.includes('saferemediate'))
      ) {
        const edgeId = `${role.resourceName}->${bucket.resourceName}`;
        if (!addedEdges.has(edgeId)) {
          addedEdges.add(edgeId);
          edges.push({
            id: edgeId,
            source: role.resourceName,
            target: bucket.resourceName,
            type: 'smoothstep',
            animated: false,
            label: 'reads/writes',
            labelStyle: { fontSize: 11, fontWeight: 500, fill: '#16a34a' },
            labelBgStyle: { fill: '#f0fdf4', fillOpacity: 0.95 },
            labelBgPadding: [6, 3] as [number, number],
            style: { stroke: '#16a34a', strokeWidth: 2, strokeDasharray: '8,4' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#16a34a', width: 16, height: 16 },
          });
        }
      }
    });
  });

  // 4. SafeRemediate role chain
  const srRoles = iamRoles
    .filter(r => r.resourceName.toLowerCase().includes('saferemediate'))
    .slice(0, 4);
  
  for (let i = 0; i < srRoles.length - 1; i++) {
    const edgeId = `${srRoles[i].resourceName}->${srRoles[i + 1].resourceName}`;
    if (!addedEdges.has(edgeId)) {
      addedEdges.add(edgeId);
      edges.push({
        id: edgeId,
        source: srRoles[i].resourceName,
        target: srRoles[i + 1].resourceName,
        type: 'smoothstep',
        animated: false,
        label: 'invokes',
        labelStyle: { fontSize: 11, fontWeight: 500, fill: '#ea580c' },
        labelBgStyle: { fill: '#fff7ed', fillOpacity: 0.95 },
        labelBgPadding: [6, 3] as [number, number],
        style: { stroke: '#ea580c', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#ea580c', width: 16, height: 16 },
      });
    }
  }

  return { edges, hasInternet };
};

// ============================================================================
// CUSTOM NODE - LARGE & READABLE
// ============================================================================

const AWSNodeComponent = ({ data }: { data: any }) => {
  const config = CATEGORY_CONFIG[data.resourceType] || CATEGORY_CONFIG.Unknown;
  const isHealthy = (data.lpScore ?? 100) >= 80;
  const statusColor = isHealthy ? '#22c55e' : data.severity === 'high' ? '#ef4444' : '#f59e0b';

  return (
    <div
      className="rounded-xl shadow-lg border-2 bg-white hover:shadow-2xl transition-all cursor-pointer overflow-hidden"
      style={{ 
        width: 220,
        borderColor: config.border,
        borderLeftWidth: 6,
      }}
    >
      {/* Header */}
      <div className="px-4 py-3" style={{ backgroundColor: config.bg }}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{config.icon}</span>
          <div className="flex-1 min-w-0">
            <p 
              className="font-bold text-gray-900 text-base truncate" 
              title={data.fullName}
            >
              {data.label}
            </p>
            <p className="text-sm text-gray-600">{data.resourceType}</p>
          </div>
          {/* Status indicator */}
          <div 
            className="w-4 h-4 rounded-full flex-shrink-0 shadow-sm"
            style={{ backgroundColor: statusColor }}
            title={isHealthy ? 'Healthy' : 'Needs attention'}
          />
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-2 border-t border-gray-100">
        {data.lpScore !== undefined && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">LP Score</span>
            <span 
              className="font-bold"
              style={{ color: data.lpScore >= 80 ? '#16a34a' : data.lpScore >= 50 ? '#f59e0b' : '#dc2626' }}
            >
              {data.lpScore}%
            </span>
          </div>
        )}
        {data.gapCount > 0 && (
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-gray-600">Gaps</span>
            <span className="font-bold text-amber-600">{data.gapCount}</span>
          </div>
        )}
        {data.internetExposed && (
          <div className="text-sm text-red-600 font-bold mt-1 flex items-center gap-1">
            🌐 Internet Exposed
          </div>
        )}
      </div>
    </div>
  );
};

// Internet Gateway Node
const InternetNodeComponent = () => (
  <div
    className="rounded-xl shadow-lg border-2 bg-red-50 border-red-500 px-6 py-4 flex items-center gap-3"
    style={{ width: 180 }}
  >
    <span className="text-4xl">🌐</span>
    <div>
      <p className="font-bold text-red-700 text-lg">Internet</p>
      <p className="text-sm text-red-600">Public Access</p>
    </div>
  </div>
);

const nodeTypes = { 
  awsNode: AWSNodeComponent,
  internetNode: InternetNodeComponent,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AWSTopologyMapLive({
  systemName,
  autoRefreshInterval = 30,
  height = '700px',
  showLegend = true,
  showMiniMap = true,
  onNodeClick,
}: AWSTopologyMapLiveProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(autoRefreshInterval > 0);
  const [stats, setStats] = useState({ resources: 0, connections: 0 });

  const timeAgo = useMemo(() => {
    if (!lastUpdated) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }, [lastUpdated]);

  // Fetch data
  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${systemName}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const resources: LPResource[] = data.resources || [];

      if (resources.length === 0) {
        setError('No resources found. Tag resources with SystemName to see them.');
        setLoading(false);
        return;
      }

      // Extract real connections
      const { edges: realEdges, hasInternet } = extractRealConnections(resources);

      // Create nodes
      const flowNodes: Node[] = resources.map((resource) => {
        const config = CATEGORY_CONFIG[resource.resourceType] || CATEGORY_CONFIG.Unknown;
        const name = resource.resourceName;
        const displayName = name.length > 22 ? name.substring(0, 19) + '...' : name;

        return {
          id: name,
          type: 'awsNode',
          position: { x: 0, y: 0 },
          data: {
            label: displayName,
            fullName: name,
            resourceType: resource.resourceType,
            lpScore: resource.lpScore,
            gapCount: resource.gapCount || 0,
            severity: resource.severity,
            internetExposed: resource.networkExposure?.internetExposedRules > 0,
            color: config.color,
          },
        };
      });

      // Add Internet Gateway node if needed
      if (hasInternet) {
        flowNodes.unshift({
          id: 'internet-gateway',
          type: 'internetNode',
          position: { x: 0, y: 0 },
          data: {},
        });
      }

      // Layout
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, realEdges);

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setStats({ resources: resources.length, connections: realEdges.length });
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [systemName, setNodes, setEdges]);

  useEffect(() => { fetchData(true); }, [systemName]);

  useEffect(() => {
    if (!isLive || autoRefreshInterval <= 0) return;
    const interval = setInterval(() => fetchData(false), autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [isLive, autoRefreshInterval, fetchData]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    nodes.forEach(node => {
      if (node.type === 'internetNode') return;
      const type = node.data.resourceType || 'Unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [nodes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl" style={{ height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-600 border-t-transparent mx-auto mb-4" />
          <p className="text-xl font-semibold text-slate-700">Loading {systemName}...</p>
          <p className="text-slate-500 mt-1">Fetching real AWS resources</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 rounded-2xl" style={{ height }}>
        <div className="text-center">
          <p className="text-2xl mb-2">⚠️</p>
          <p className="text-red-700 font-bold text-lg mb-2">Error</p>
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => fetchData(true)}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 shadow-sm" style={{ height }}>
      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-4 bg-white/95 backdrop-blur px-5 py-3 rounded-xl shadow-md border border-slate-200">
        <button
          onClick={() => setIsLive(!isLive)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
            isLive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>

        <button
          onClick={() => fetchData(false)}
          className="flex items-center gap-2 px-4 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 text-sm font-semibold transition-colors"
        >
          🔄 Refresh
        </button>

        <div className="h-6 w-px bg-slate-200" />

        <span className="font-bold text-slate-800">{stats.resources} resources</span>
        <span className="text-slate-400">•</span>
        <span className="font-bold text-slate-800">{stats.connections} connections</span>
        <span className="text-slate-400">•</span>
        <span className="text-slate-500 text-sm">Updated {timeAgo}</span>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur px-4 py-3 rounded-xl shadow-md border border-slate-200">
          <div className="flex flex-wrap gap-2">
            {Object.entries(categoryCounts).map(([type, count]) => {
              const config = CATEGORY_CONFIG[type] || CATEGORY_CONFIG.Unknown;
              return (
                <span
                  key={type}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ backgroundColor: config.bg, color: config.color }}
                >
                  {config.icon} {type} ({count})
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* React Flow */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onNodeClick?.(node)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#cbd5e1" />
        <Controls className="bg-white rounded-xl shadow-md border border-slate-200" />
        {showMiniMap && (
          <MiniMap
            nodeColor={(node) => {
              const config = CATEGORY_CONFIG[node.data?.resourceType] || CATEGORY_CONFIG.Unknown;
              return config.color;
            }}
            maskColor="rgba(255, 255, 255, 0.85)"
            className="rounded-xl shadow-md border border-slate-200"
          />
        )}
      </ReactFlow>

      {/* Data source */}
      <div className="absolute bottom-4 left-4 text-sm text-slate-500 bg-white/90 px-3 py-1.5 rounded-lg shadow-sm">
        📊 Real data from /api/proxy/least-privilege/issues
      </div>
    </div>
  );
}
