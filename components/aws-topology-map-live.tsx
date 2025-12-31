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

interface LPResource {
  id?: string;
  name?: string;
  resourceName?: string;
  type?: string;
  resourceType?: string;
  service?: string;
  gapCount?: number;
  unusedCount?: number;
  allowedCount?: number;
  usedCount?: number;
  severity?: string;
  internetExposed?: number;
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
// CONSTANTS
// ============================================================================

const CATEGORY_CONFIG: Record<string, { color: string; icon: string }> = {
  SecurityGroup: { color: '#DD344C', icon: '🔐' },
  IAMRole: { color: '#FF9900', icon: '👤' },
  S3Bucket: { color: '#569A31', icon: '📦' },
  S3: { color: '#569A31', icon: '📦' },
  Lambda: { color: '#FF9900', icon: '⚡' },
  DynamoDB: { color: '#4053D6', icon: '🗄️' },
  EC2: { color: '#FF9900', icon: '🖥️' },
  RDS: { color: '#4053D6', icon: '💾' },
  KMS: { color: '#DD344C', icon: '🔑' },
  Secret: { color: '#DD344C', icon: '🔒' },
  SNS: { color: '#FF4F8B', icon: '📨' },
  SQS: { color: '#FF4F8B', icon: '📬' },
  Unknown: { color: '#888888', icon: '📄' },
};

// ============================================================================
// DAGRE LAYOUT
// ============================================================================

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 150 });

  const nodeWidth = 180;
  const nodeHeight = 60;

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (nodeWithPosition) {
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - nodeWidth / 2,
          y: nodeWithPosition.y - nodeHeight / 2,
        },
      };
    }
    return node;
  });

  return { nodes: layoutedNodes, edges };
};

// ============================================================================
// INFER RELATIONSHIPS FROM RESOURCES
// ============================================================================

const inferRelationships = (resources: LPResource[]): Edge[] => {
  const edges: Edge[] = [];
  const edgeSet = new Set<string>();
  
  const securityGroups = resources.filter(r => 
    r.type === 'SecurityGroup' || r.resourceType === 'SecurityGroup' || 
    (r.name || r.resourceName || '').startsWith('sg-')
  );
  
  const iamRoles = resources.filter(r => 
    r.type === 'IAMRole' || r.resourceType === 'IAMRole' || 
    (r.name || r.resourceName || '').toLowerCase().includes('role')
  );
  
  const lambdas = resources.filter(r => 
    r.type === 'Lambda' || r.resourceType === 'Lambda' || 
    (r.name || r.resourceName || '').toLowerCase().includes('lambda') ||
    (r.name || r.resourceName || '').toLowerCase().includes('function')
  );
  
  const storage = resources.filter(r => 
    ['S3', 'S3Bucket', 'DynamoDB'].includes(r.type || r.resourceType || '') ||
    (r.name || r.resourceName || '').toLowerCase().includes('bucket') ||
    (r.name || r.resourceName || '').toLowerCase().includes('table')
  );

  // Security Groups → protect → resources
  securityGroups.forEach(sg => {
    const sgId = sg.id || sg.name || sg.resourceName || '';
    
    // SG protects Lambdas
    lambdas.forEach(lambda => {
      const lambdaId = lambda.id || lambda.name || lambda.resourceName || '';
      const edgeId = `${sgId}-protects-${lambdaId}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: sgId,
          target: lambdaId,
          type: 'smoothstep',
          animated: true,
          label: 'PROTECTS',
          style: { stroke: '#DD344C', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#DD344C' },
        });
      }
    });
  });

  // Lambda → assumes → IAM Role
  lambdas.forEach(lambda => {
    const lambdaId = lambda.id || lambda.name || lambda.resourceName || '';
    
    iamRoles.forEach(role => {
      const roleId = role.id || role.name || role.resourceName || '';
      const edgeId = `${lambdaId}-assumes-${roleId}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: lambdaId,
          target: roleId,
          type: 'smoothstep',
          animated: true,
          label: 'ASSUMES',
          style: { stroke: '#FF9900', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#FF9900' },
        });
      }
    });
    
    // Lambda → accesses → Storage
    storage.forEach(store => {
      const storeId = store.id || store.name || store.resourceName || '';
      const edgeId = `${lambdaId}-accesses-${storeId}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: lambdaId,
          target: storeId,
          type: 'smoothstep',
          animated: true,
          label: 'ACCESSES',
          style: { stroke: '#569A31', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#569A31' },
        });
      }
    });
  });

  // IAM Role → accesses → Storage
  iamRoles.forEach(role => {
    const roleId = role.id || role.name || role.resourceName || '';
    
    storage.slice(0, 2).forEach(store => { // Limit to avoid too many edges
      const storeId = store.id || store.name || store.resourceName || '';
      const edgeId = `${roleId}-accesses-${storeId}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: roleId,
          target: storeId,
          type: 'smoothstep',
          animated: false,
          label: 'ACCESSES',
          style: { stroke: '#4053D6', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#4053D6' },
        });
      }
    });
  });

  return edges;
};

// ============================================================================
// CUSTOM NODE COMPONENT
// ============================================================================

const AWSNodeComponent = ({ data }: { data: any }) => {
  const config = CATEGORY_CONFIG[data.resourceType] || CATEGORY_CONFIG.Unknown;
  const gapScore = data.gapCount || 0;
  const scoreColor = gapScore > 20 ? '#ef4444' : gapScore > 5 ? '#f59e0b' : '#10b981';
  
  return (
    <div
      className="px-4 py-3 rounded-lg border-2 shadow-lg bg-white hover:shadow-xl transition-all cursor-pointer"
      style={{ borderLeftColor: config.color, borderLeftWidth: '4px' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl">{config.icon}</span>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-gray-800 truncate max-w-[120px]" title={data.fullName}>
            {data.label}
          </span>
          <span className="text-xs text-gray-500">{data.resourceType}</span>
        </div>
      </div>
      {gapScore > 0 && (
        <div className="mt-2 text-xs" style={{ color: scoreColor }}>
          ⚠️ {gapScore} unused permissions
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  awsNode: AWSNodeComponent,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AWSTopologyMapLive({
  systemName,
  autoRefreshInterval = 30,
  height = '600px',
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
  const [notification, setNotification] = useState<string | null>(null);

  const [timeAgo, setTimeAgo] = useState('Never');

  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdated) {
        const seconds = Math.floor((new Date().getTime() - lastUpdated.getTime()) / 1000);
        if (seconds < 60) setTimeAgo(`${seconds}s ago`);
        else if (seconds < 3600) setTimeAgo(`${Math.floor(seconds / 60)}m ago`);
        else setTimeAgo(`${Math.floor(seconds / 3600)}h ago`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Fetch from least-privilege endpoint (has 28 resources)
  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      
      // Use least-privilege endpoint which has actual data
      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${systemName}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }
      
      const data = await response.json();
      const resources: LPResource[] = data.resources || data.issues || [];
      
      if (resources.length === 0) {
        setError('No resources found. Tag resources with SystemName to see them here.');
        setLoading(false);
        return;
      }
      
      // Convert resources to nodes
      const flowNodes: Node[] = resources.map((resource, index) => {
        const name = resource.name || resource.resourceName || resource.id || `Resource-${index}`;
        const type = resource.type || resource.resourceType || 'Unknown';
        const config = CATEGORY_CONFIG[type] || CATEGORY_CONFIG.Unknown;
        
        return {
          id: name,
          type: 'awsNode',
          position: { x: 0, y: 0 },
          data: {
            label: name.length > 20 ? name.substring(0, 20) + '...' : name,
            fullName: name,
            resourceType: type,
            gapCount: resource.gapCount || resource.unusedCount || 0,
            severity: resource.severity,
            color: config.color,
          },
        };
      });

      // Infer relationships from resource types
      const flowEdges = inferRelationships(resources);

      // Apply dagre layout
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges);

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setLastUpdated(new Date());
      setError(null);
      
      if (!isInitial) {
        setNotification(`✅ Refreshed: ${resources.length} resources, ${flowEdges.length} flows`);
        setTimeout(() => setNotification(null), 3000);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [systemName, setNodes, setEdges]);

  // Initial fetch
  useEffect(() => {
    fetchData(true);
  }, [systemName]);

  // Auto-refresh
  useEffect(() => {
    if (!isLive || autoRefreshInterval <= 0) return;
    const interval = setInterval(() => fetchData(false), autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [isLive, autoRefreshInterval, fetchData]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    nodes.forEach(node => {
      const type = node.data.resourceType || 'Unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [nodes]);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (onNodeClick) onNodeClick(node);
  }, [onNodeClick]);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-gray-50 rounded-lg" style={{ height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading topology for {systemName}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 rounded-lg" style={{ height }}>
        <div className="text-center">
          <p className="text-red-600 font-semibold mb-2">Error loading topology</p>
          <p className="text-red-500 text-sm">{error}</p>
          <button 
            onClick={() => fetchData(true)}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg border border-gray-200 overflow-hidden" style={{ height }}>
      {/* Notification */}
      {notification && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-green-500 text-white px-4 py-2 text-center font-medium">
          {notification}
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-3 bg-white/90 backdrop-blur px-3 py-2 rounded-lg shadow-md">
        <button
          onClick={() => setIsLive(!isLive)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold ${
            isLive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>

        <button
          onClick={() => fetchData(false)}
          className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium"
        >
          🔄 Refresh
        </button>

        <span className="font-medium text-gray-700 text-sm">{nodes.length} nodes</span>
        <span className="font-medium text-gray-700 text-sm">{edges.length} flows</span>
        <span className="text-xs text-gray-500">Updated {timeAgo}</span>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute top-2 right-2 z-10 bg-white/90 backdrop-blur px-3 py-2 rounded-lg shadow-md">
          <div className="flex flex-wrap gap-2">
            {Object.entries(categoryCounts).map(([type, count]) => {
              const config = CATEGORY_CONFIG[type] || CATEGORY_CONFIG.Unknown;
              return (
                <span
                  key={type}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: `${config.color}20`, color: config.color }}
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
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        {showMiniMap && (
          <MiniMap
            nodeColor={(node) => node.data.color || '#888'}
            maskColor="rgba(255, 255, 255, 0.8)"
          />
        )}
      </ReactFlow>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80">
          <div className="text-center">
            <p className="text-gray-500 text-lg mb-2">No resources found</p>
            <p className="text-gray-400 text-sm">
              Tag resources with SystemName="{systemName}" to see them here
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
