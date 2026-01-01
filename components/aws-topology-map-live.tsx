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
  EdgeProps,
  getBezierPath,
  BaseEdge,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

// ============================================================================
// CUSTOM ANIMATED EDGE WITH FLOWING PARTICLES
// ============================================================================

const AnimatedFlowEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  data,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeColor = (style?.stroke as string) || '#6366f1';
  const animationSpeed = data?.speed || '2s';

  return (
    <>
      {/* Background glow */}
      <path
        d={edgePath}
        fill="none"
        stroke={edgeColor}
        strokeWidth={8}
        strokeOpacity={0.15}
        style={{ filter: 'blur(4px)' }}
      />
      
      {/* Main edge line */}
      <BaseEdge 
        id={id} 
        path={edgePath} 
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: 3,
        }}
      />
      
      {/* Animated flowing particles */}
      <circle r="6" fill={edgeColor} filter="url(#glow)">
        <animateMotion dur={animationSpeed} repeatCount="indefinite" path={edgePath} />
      </circle>
      <circle r="5" fill={edgeColor} opacity="0.7" filter="url(#glow)">
        <animateMotion dur={animationSpeed} repeatCount="indefinite" path={edgePath} begin="0.3s" />
      </circle>
      <circle r="4" fill={edgeColor} opacity="0.5" filter="url(#glow)">
        <animateMotion dur={animationSpeed} repeatCount="indefinite" path={edgePath} begin="0.6s" />
      </circle>
      
      {/* Label */}
      {label && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <rect
            x={-50}
            y={-12}
            width={100}
            height={24}
            rx={6}
            ry={6}
            fill={(labelBgStyle?.fill as string) || '#ffffff'}
            fillOpacity={0.95}
            stroke={edgeColor}
            strokeWidth={1}
          />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontSize: 11,
              fontWeight: 600,
              fill: edgeColor,
              ...labelStyle,
            }}
          >
            {label as string}
          </text>
        </g>
      )}
    </>
  );
};

// SVG Filter for glow effect
const GlowFilter = () => (
  <svg style={{ position: 'absolute', width: 0, height: 0 }}>
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  </svg>
);

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
    nodesep: 120,
    ranksep: 220,
    marginx: 100,
    marginy: 100,
  });

  const nodeWidth = 260;
  const nodeHeight = 120;

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
// EXTRACT CONNECTIONS
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

  // Internet → SG (fastest)
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
            type: 'animatedFlow',
            data: { speed: '1.5s' },
            label: `⚡ Port ${rule.port}`,
            style: { stroke: '#dc2626' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#dc2626', width: 24, height: 24 },
          });
        }
      }

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
                type: 'animatedFlow',
                data: { speed: '2s' },
                label: `🔗 Port ${rule.port}`,
                style: { stroke: '#7c3aed' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed', width: 20, height: 20 },
              });
            }
          }
        }
      });
    });
  });

  // Architecture patterns
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
        type: 'animatedFlow',
        data: { speed: '2s' },
        label: '🔀 routes',
        style: { stroke: '#2563eb' },
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
        type: 'animatedFlow',
        data: { speed: '2.5s' },
        label: '💾 DB',
        style: { stroke: '#2563eb' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb', width: 20, height: 20 },
      });
    }
  }

  // IAM → S3
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
            type: 'animatedFlow',
            data: { speed: '3s' },
            label: '📄 data',
            style: { stroke: '#16a34a' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#16a34a', width: 18, height: 18 },
          });
        }
      }
    });
  });

  // SafeRemediate chain
  const srRoles = iamRoles.filter(r => r.resourceName.toLowerCase().includes('saferemediate')).slice(0, 4);
  for (let i = 0; i < srRoles.length - 1; i++) {
    const edgeId = `${srRoles[i].resourceName}->${srRoles[i + 1].resourceName}`;
    if (!addedEdges.has(edgeId)) {
      addedEdges.add(edgeId);
      edges.push({
        id: edgeId,
        source: srRoles[i].resourceName,
        target: srRoles[i + 1].resourceName,
        type: 'animatedFlow',
        data: { speed: '2.5s' },
        label: '⚙️ invoke',
        style: { stroke: '#ea580c' },
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
      className="rounded-2xl shadow-xl border-2 bg-white hover:shadow-2xl hover:scale-[1.02] transition-all duration-200 cursor-pointer overflow-hidden"
      style={{ 
        width: 240,
        borderColor: config.border,
        borderLeftWidth: 8,
      }}
    >
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
            className="w-5 h-5 rounded-full shadow-md ring-2 ring-white animate-pulse"
            style={{ backgroundColor: statusColor }}
          />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-gray-100">
        {data.lpScore !== undefined && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">LP Score</span>
            <span 
              className="text-lg font-bold"
              style={{ color: data.lpScore >= 80 ? '#16a34a' : '#dc2626' }}
            >
              {data.lpScore}%
            </span>
          </div>
        )}
        {data.internetExposed && (
          <div className="text-sm text-red-600 font-bold mt-1 bg-red-50 px-2 py-1 rounded">
            🌐 Internet Exposed
          </div>
        )}
      </div>
    </div>
  );
};

const InternetNodeComponent = () => (
  <div
    className="rounded-2xl shadow-xl border-4 bg-gradient-to-br from-red-100 to-red-200 border-red-500 px-8 py-6 flex items-center gap-4"
    style={{ width: 220 }}
  >
    <span className="text-6xl animate-bounce">🌐</span>
    <div>
      <p className="font-black text-red-700 text-2xl">Internet</p>
      <p className="text-sm text-red-600 font-semibold">Public Traffic</p>
    </div>
  </div>
);

const nodeTypes = { 
  awsNode: AWSNodeComponent,
  internetNode: InternetNodeComponent,
};

const edgeTypes = {
  animatedFlow: AnimatedFlowEdge,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AWSTopologyMapLive({
  systemName,
  autoRefreshInterval = 30,
  height = '850px',
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
    return `${Math.floor(seconds / 60)}m ago`;
  }, [lastUpdated]);

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${systemName}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const resources: LPResource[] = data.resources || [];

      if (resources.length === 0) {
        setError('No resources found.');
        setLoading(false);
        return;
      }

      const { edges: realEdges, hasInternet } = extractRealConnections(resources);

      const flowNodes: Node[] = resources.map((resource) => {
        const config = CATEGORY_CONFIG[resource.resourceType] || CATEGORY_CONFIG.Unknown;
        const name = resource.resourceName;
        const displayName = name.length > 18 ? name.substring(0, 15) + '...' : name;

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
      <div className="flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl" style={{ height }}>
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-200" />
            <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
          </div>
          <p className="text-2xl font-bold text-slate-700">Loading {systemName}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 rounded-2xl" style={{ height }}>
        <div className="text-center">
          <p className="text-5xl mb-4">⚠️</p>
          <p className="text-red-700 font-bold text-xl mb-4">{error}</p>
          <button 
            onClick={() => fetchData(true)}
            className="px-8 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold text-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border-2 border-slate-200 overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50 shadow-xl" style={{ height }}>
      <GlowFilter />

      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-4 bg-white/95 backdrop-blur px-6 py-4 rounded-xl shadow-lg border border-slate-200">
        <button
          onClick={() => setIsLive(!isLive)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-all ${
            isLive ? 'bg-green-100 text-green-700 ring-2 ring-green-400' : 'bg-slate-100 text-slate-600'
          }`}
        >
          <span className={`w-3 h-3 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>

        <button
          onClick={() => fetchData(false)}
          className="px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold shadow-md"
        >
          🔄 Refresh
        </button>

        <div className="h-8 w-px bg-slate-200" />

        <span className="text-xl font-black text-slate-800">{stats.resources}</span>
        <span className="text-slate-500">resources</span>
        <span className="text-slate-300">|</span>
        <span className="text-xl font-black text-indigo-600">{stats.connections}</span>
        <span className="text-slate-500">flows</span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-500">{timeAgo}</span>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur px-5 py-3 rounded-xl shadow-lg border border-slate-200">
          <div className="flex flex-wrap gap-2">
            {Object.entries(categoryCounts).map(([type, count]) => {
              const config = CATEGORY_CONFIG[type] || CATEGORY_CONFIG.Unknown;
              return (
                <span
                  key={type}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
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
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={30} size={2} color="#e2e8f0" />
        <Controls className="bg-white rounded-xl shadow-lg" />
        {showMiniMap && (
          <MiniMap
            nodeColor={(node) => CATEGORY_CONFIG[node.data?.resourceType]?.color || '#888'}
            className="rounded-xl shadow-lg"
          />
        )}
      </ReactFlow>

      {/* Footer */}
      <div className="absolute bottom-4 left-4 bg-white/95 px-4 py-2 rounded-lg shadow-sm text-sm font-medium text-slate-600">
        ✨ {stats.connections} animated flows • Real AWS data
      </div>
    </div>
  );
}
