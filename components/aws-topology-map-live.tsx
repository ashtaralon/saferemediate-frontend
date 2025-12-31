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
// ANIMATED FLOW STYLES - CSS for flowing dots on edges
// ============================================================================

const animatedStyles = `
  @keyframes flowDots {
    0% { stroke-dashoffset: 24; }
    100% { stroke-dashoffset: 0; }
  }
  
  @keyframes flowDotsReverse {
    0% { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: 24; }
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  @keyframes glow {
    0%, 100% { filter: drop-shadow(0 0 2px currentColor); }
    50% { filter: drop-shadow(0 0 8px currentColor); }
  }
  
  .react-flow__edge-path {
    stroke-linecap: round;
  }
  
  .react-flow__edge.animated .react-flow__edge-path {
    stroke-dasharray: 6 3;
    animation: flowDots 0.5s linear infinite;
  }
  
  .react-flow__edge:hover .react-flow__edge-path {
    stroke-width: 4px !important;
    filter: drop-shadow(0 0 6px currentColor);
  }
  
  .react-flow__edge-textbg {
    rx: 6;
    ry: 6;
  }
  
  .flow-internet .react-flow__edge-path {
    animation: flowDots 0.3s linear infinite, glow 2s ease-in-out infinite;
  }
  
  .flow-sg .react-flow__edge-path {
    animation: flowDots 0.4s linear infinite;
  }
  
  .flow-data .react-flow__edge-path {
    animation: flowDots 0.8s linear infinite;
  }
`;

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
// DAGRE LAYOUT
// ============================================================================

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ 
    rankdir: 'LR',
    nodesep: 100,
    ranksep: 200,
    marginx: 80,
    marginy: 80,
  });

  const nodeWidth = 260;
  const nodeHeight = 110;

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
        position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 } 
      } : node;
    }),
    edges,
  };
};

// ============================================================================
// EXTRACT REAL CONNECTIONS WITH ANIMATED STYLES
// ============================================================================

const extractRealConnections = (resources: LPResource[]): { edges: Edge[], hasInternet: boolean } => {
  const edges: Edge[] = [];
  const addedEdges = new Set<string>();
  let hasInternet = false;

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

  // 1. Internet → SG (fastest animation - critical path)
  securityGroups.forEach(sg => {
    if (!sg.allowedList) return;

    sg.allowedList.forEach(rule => {
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
            className: 'flow-internet',
            label: `⚡ Port ${rule.port}`,
            labelStyle: { fontSize: 13, fontWeight: 700, fill: '#dc2626' },
            labelBgStyle: { fill: '#fef2f2', fillOpacity: 0.95, stroke: '#dc2626', strokeWidth: 1 },
            labelBgPadding: [10, 6] as [number, number],
            style: { stroke: '#dc2626', strokeWidth: 3 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#dc2626', width: 24, height: 24 },
          });
        }
      }

      // SG → SG
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
                className: 'flow-sg',
                label: `🔗 Port ${rule.port}`,
                labelStyle: { fontSize: 12, fontWeight: 600, fill: '#7c3aed' },
                labelBgStyle: { fill: '#f5f3ff', fillOpacity: 0.95, stroke: '#7c3aed', strokeWidth: 1 },
                labelBgPadding: [8, 5] as [number, number],
                style: { stroke: '#7c3aed', strokeWidth: 2.5 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed', width: 20, height: 20 },
              });
            }
          }
        }
      });
    });
  });

  // 2. Architecture patterns
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
        className: 'flow-sg',
        label: '🔀 routes traffic',
        labelStyle: { fontSize: 12, fontWeight: 600, fill: '#2563eb' },
        labelBgStyle: { fill: '#eff6ff', fillOpacity: 0.95, stroke: '#2563eb', strokeWidth: 1 },
        labelBgPadding: [8, 5] as [number, number],
        style: { stroke: '#2563eb', strokeWidth: 2.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb', width: 20, height: 20 },
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
        className: 'flow-sg',
        label: '💾 connects DB',
        labelStyle: { fontSize: 12, fontWeight: 600, fill: '#2563eb' },
        labelBgStyle: { fill: '#eff6ff', fillOpacity: 0.95, stroke: '#2563eb', strokeWidth: 1 },
        labelBgPadding: [8, 5] as [number, number],
        style: { stroke: '#2563eb', strokeWidth: 2.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb', width: 20, height: 20 },
      });
    }
  }

  // 3. IAM Role → S3 (slower animation - data flow)
  iamRoles.forEach(role => {
    const roleLower = role.resourceName.toLowerCase();
    
    s3Buckets.forEach(bucket => {
      const bucketLower = bucket.resourceName.toLowerCase();
      
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
            animated: true,
            className: 'flow-data',
            label: '📄 reads/writes',
            labelStyle: { fontSize: 11, fontWeight: 500, fill: '#16a34a' },
            labelBgStyle: { fill: '#f0fdf4', fillOpacity: 0.95, stroke: '#16a34a', strokeWidth: 1 },
            labelBgPadding: [8, 5] as [number, number],
            style: { stroke: '#16a34a', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#16a34a', width: 18, height: 18 },
          });
        }
      }
    });
  });

  // 4. SafeRemediate role chain
  const srRoles = iamRoles.filter(r => r.resourceName.toLowerCase().includes('saferemediate')).slice(0, 4);
  for (let i = 0; i < srRoles.length - 1; i++) {
    const edgeId = `${srRoles[i].resourceName}->${srRoles[i + 1].resourceName}`;
    if (!addedEdges.has(edgeId)) {
      addedEdges.add(edgeId);
      edges.push({
        id: edgeId,
        source: srRoles[i].resourceName,
        target: srRoles[i + 1].resourceName,
        type: 'smoothstep',
        animated: true,
        className: 'flow-data',
        label: '⚙️ invokes',
        labelStyle: { fontSize: 11, fontWeight: 500, fill: '#ea580c' },
        labelBgStyle: { fill: '#fff7ed', fillOpacity: 0.95, stroke: '#ea580c', strokeWidth: 1 },
        labelBgPadding: [8, 5] as [number, number],
        style: { stroke: '#ea580c', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#ea580c', width: 18, height: 18 },
      });
    }
  }

  return { edges, hasInternet };
};

// ============================================================================
// CUSTOM NODES
// ============================================================================

const AWSNodeComponent = ({ data }: { data: any }) => {
  const config = CATEGORY_CONFIG[data.resourceType] || CATEGORY_CONFIG.Unknown;
  const isHealthy = (data.lpScore ?? 100) >= 80;
  const statusColor = isHealthy ? '#22c55e' : data.severity === 'high' ? '#ef4444' : '#f59e0b';

  return (
    <div
      className="rounded-2xl shadow-xl border-2 bg-white hover:shadow-2xl hover:scale-105 transition-all duration-200 cursor-pointer overflow-hidden"
      style={{ 
        width: 240,
        borderColor: config.border,
        borderLeftWidth: 8,
      }}
    >
      {/* Header */}
      <div className="px-5 py-4" style={{ backgroundColor: config.bg }}>
        <div className="flex items-center gap-4">
          <span className="text-4xl drop-shadow-sm">{config.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-lg truncate" title={data.fullName}>
              {data.label}
            </p>
            <p className="text-sm font-medium" style={{ color: config.color }}>{data.resourceType}</p>
          </div>
          <div 
            className="w-5 h-5 rounded-full flex-shrink-0 shadow-md ring-2 ring-white"
            style={{ backgroundColor: statusColor }}
            title={isHealthy ? '✓ Healthy' : '⚠ Needs attention'}
          />
        </div>
      </div>

      {/* Details */}
      <div className="px-5 py-3 border-t border-gray-100 space-y-2">
        {data.lpScore !== undefined && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 font-medium">LP Score</span>
            <span 
              className="text-lg font-bold"
              style={{ color: data.lpScore >= 80 ? '#16a34a' : data.lpScore >= 50 ? '#f59e0b' : '#dc2626' }}
            >
              {data.lpScore}%
            </span>
          </div>
        )}
        {data.gapCount > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 font-medium">Permission Gaps</span>
            <span className="text-lg font-bold text-amber-600">{data.gapCount}</span>
          </div>
        )}
        {data.internetExposed && (
          <div className="text-sm text-red-600 font-bold flex items-center gap-2 bg-red-50 px-2 py-1 rounded-lg">
            🌐 Internet Exposed
          </div>
        )}
      </div>
    </div>
  );
};

const InternetNodeComponent = () => (
  <div
    className="rounded-2xl shadow-xl border-3 bg-gradient-to-br from-red-50 to-red-100 border-red-500 px-6 py-5 flex items-center gap-4 hover:shadow-2xl transition-all"
    style={{ width: 200 }}
  >
    <span className="text-5xl animate-pulse">🌐</span>
    <div>
      <p className="font-bold text-red-700 text-xl">Internet</p>
      <p className="text-sm text-red-600 font-medium">Public Traffic</p>
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
  height = '800px',
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

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${systemName}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const resources: LPResource[] = data.resources || [];

      if (resources.length === 0) {
        setError('No resources found. Tag resources with SystemName.');
        setLoading(false);
        return;
      }

      const { edges: realEdges, hasInternet } = extractRealConnections(resources);

      const flowNodes: Node[] = resources.map((resource) => {
        const config = CATEGORY_CONFIG[resource.resourceType] || CATEGORY_CONFIG.Unknown;
        const name = resource.resourceName;
        const displayName = name.length > 20 ? name.substring(0, 17) + '...' : name;

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

      if (hasInternet) {
        flowNodes.unshift({
          id: 'internet-gateway',
          type: 'internetNode',
          position: { x: 0, y: 0 },
          data: {},
        });
      }

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
      <div className="flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 rounded-2xl" style={{ height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-indigo-600 border-t-transparent mx-auto mb-6" />
          <p className="text-2xl font-bold text-slate-700">Loading {systemName}</p>
          <p className="text-slate-500 mt-2">Discovering AWS resources...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 rounded-2xl" style={{ height }}>
        <div className="text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-red-700 font-bold text-xl mb-2">Error</p>
          <p className="text-red-600 mb-6">{error}</p>
          <button 
            onClick={() => fetchData(true)}
            className="px-8 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold text-lg shadow-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 shadow-lg" style={{ height }}>
      {/* Inject animated styles */}
      <style>{animatedStyles}</style>

      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-4 bg-white/95 backdrop-blur-sm px-6 py-3 rounded-xl shadow-lg border border-slate-200">
        <button
          onClick={() => setIsLive(!isLive)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${
            isLive ? 'bg-green-100 text-green-700 ring-2 ring-green-300' : 'bg-slate-100 text-slate-600'
          }`}
        >
          <span className={`w-3 h-3 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>

        <button
          onClick={() => fetchData(false)}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-bold shadow-md transition-all hover:shadow-lg"
        >
          🔄 Refresh
        </button>

        <div className="h-8 w-px bg-slate-200" />

        <div className="flex items-center gap-4 text-sm">
          <span className="font-bold text-slate-800 text-lg">{stats.resources}</span>
          <span className="text-slate-500">resources</span>
          <span className="text-slate-300">|</span>
          <span className="font-bold text-indigo-600 text-lg">{stats.connections}</span>
          <span className="text-slate-500">flows</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">{timeAgo}</span>
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm px-5 py-3 rounded-xl shadow-lg border border-slate-200">
          <div className="flex flex-wrap gap-3">
            {Object.entries(categoryCounts).map(([type, count]) => {
              const config = CATEGORY_CONFIG[type] || CATEGORY_CONFIG.Unknown;
              return (
                <span
                  key={type}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold shadow-sm"
                  style={{ backgroundColor: config.bg, color: config.color, border: `1px solid ${config.border}` }}
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
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="#cbd5e1" />
        <Controls className="bg-white rounded-xl shadow-lg border border-slate-200" />
        {showMiniMap && (
          <MiniMap
            nodeColor={(node) => {
              const config = CATEGORY_CONFIG[node.data?.resourceType] || CATEGORY_CONFIG.Unknown;
              return config.color;
            }}
            maskColor="rgba(255, 255, 255, 0.9)"
            className="rounded-xl shadow-lg border border-slate-200"
          />
        )}
      </ReactFlow>

      {/* Data source */}
      <div className="absolute bottom-4 left-4 text-sm text-slate-600 bg-white/95 px-4 py-2 rounded-lg shadow-sm font-medium">
        📊 Live data • {stats.connections} animated flows
      </div>
    </div>
  );
}
