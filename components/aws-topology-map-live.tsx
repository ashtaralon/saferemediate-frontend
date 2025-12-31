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

interface TopologyNode {
  id: string;
  type: string;
  data: {
    label: string;
    fullName: string;
    resourceType: string;
    isSeed: boolean;
    arn?: string;
    color: string;
    icon: string;
    category: string;
  };
  position: { x: number; y: number };
}

interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  animated: boolean;
  label: string;
  style: { stroke: string; strokeWidth: number };
  markerEnd: { type: string; color: string };
  data: { relationType: string };
}

interface TopologyData {
  system_name: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  node_count: number;
  edge_count: number;
  categories: Record<string, number>;
}

interface AWSTopologyMapLiveProps {
  systemName: string;
  autoRefreshInterval?: number; // seconds, 0 to disable
  height?: string;
  showLegend?: boolean;
  showMiniMap?: boolean;
  onNodeClick?: (node: TopologyNode) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  compute: '#FF9900',
  database: '#4053D6',
  storage: '#569A31',
  security: '#DD344C',
  messaging: '#FF4F8B',
  network: '#8C4FFF',
  monitoring: '#759C3E',
  api: '#FF4F8B',
  other: '#888888',
};

const CATEGORY_ICONS: Record<string, string> = {
  compute: '⚡',
  database: '🗄️',
  storage: '📦',
  security: '🔐',
  messaging: '📨',
  network: '🌐',
  monitoring: '📊',
  api: '🔌',
  other: '📄',
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
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

// ============================================================================
// CUSTOM NODE COMPONENT
// ============================================================================

const AWSNodeComponent = ({ data, selected }: { data: TopologyNode['data'] & { isNew?: boolean }; selected: boolean }) => {
  const icon = CATEGORY_ICONS[data.category] || '📄';
  
  return (
    <div
      className={`
        relative px-4 py-3 rounded-lg border-2 shadow-lg transition-all duration-300
        ${selected ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
        ${data.isSeed ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 bg-white'}
        ${data.isNew ? 'animate-pulse ring-2 ring-green-400 ring-offset-2' : ''}
        hover:shadow-xl hover:scale-105 cursor-pointer
      `}
      style={{ borderLeftColor: data.color, borderLeftWidth: '4px' }}
    >
      {/* NEW badge */}
      {data.isNew && (
        <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-bounce">
          NEW
        </span>
      )}
      
      {/* Seed badge */}
      {data.isSeed && (
        <span className="absolute -top-2 -left-2 bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
          SEED
        </span>
      )}
      
      <div className="flex items-center gap-2">
        <span className="text-2xl">{icon}</span>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-gray-800 truncate max-w-[120px]" title={data.fullName}>
            {data.label}
          </span>
          <span className="text-xs text-gray-500">{data.resourceType}</span>
        </div>
      </div>
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
  const [categories, setCategories] = useState<Record<string, number>>({});
  const [newNodes, setNewNodes] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(autoRefreshInterval > 0);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [previousNodeIds, setPreviousNodeIds] = useState<Set<string>>(new Set());

  // Time ago helper
  const getTimeAgo = useCallback((date: Date | null) => {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }, []);

  const [timeAgo, setTimeAgo] = useState('Never');

  // Update time ago every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(getTimeAgo(lastUpdated));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated, getTimeAgo]);

  // Fetch topology data
  const fetchTopology = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      
      const response = await fetch(`/api/proxy/topology/${systemName}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch topology: ${response.status}`);
      }
      
      const data: TopologyData = await response.json();
      
      // Detect new nodes
      const currentNodeIds = new Set(data.nodes.map(n => n.id));
      const newlyAddedNodes = new Set<string>();
      
      if (!isInitial && previousNodeIds.size > 0) {
        currentNodeIds.forEach(id => {
          if (!previousNodeIds.has(id)) {
            newlyAddedNodes.add(id);
          }
        });
        
        if (newlyAddedNodes.size > 0) {
          const newNodeNames = data.nodes
            .filter(n => newlyAddedNodes.has(n.id))
            .map(n => n.data.label)
            .slice(0, 3)
            .join(', ');
          
          setNotification(`🎉 ${newlyAddedNodes.size} new resource(s) detected: ${newNodeNames}`);
          setTimeout(() => setNotification(null), 5000);
        }
      }
      
      setPreviousNodeIds(currentNodeIds);
      setNewNodes(newlyAddedNodes);
      
      // Clear "NEW" status after 10 seconds
      if (newlyAddedNodes.size > 0) {
        setTimeout(() => setNewNodes(new Set()), 10000);
      }
      
      // Convert to React Flow format
      const flowNodes: Node[] = data.nodes.map((node) => ({
        id: node.id,
        type: 'awsNode',
        position: node.position,
        data: {
          ...node.data,
          isNew: newlyAddedNodes.has(node.id),
        },
      }));

      const flowEdges: Edge[] = data.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated: edge.animated,
        label: edge.label,
        style: edge.style,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edge.style.stroke,
        },
        labelStyle: { fontSize: 10, fill: '#666' },
        labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
      }));

      // Apply dagre layout
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges);

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setCategories(data.categories);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Topology fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch topology');
    } finally {
      setLoading(false);
    }
  }, [systemName, previousNodeIds, setNodes, setEdges]);

  // Initial fetch
  useEffect(() => {
    fetchTopology(true);
  }, [systemName]);

  // Auto-refresh
  useEffect(() => {
    if (!isLive || autoRefreshInterval <= 0) return;
    
    const interval = setInterval(() => {
      fetchTopology(false);
    }, autoRefreshInterval * 1000);
    
    return () => clearInterval(interval);
  }, [isLive, autoRefreshInterval, fetchTopology]);

  // Filter nodes by category
  const filteredNodes = useMemo(() => {
    if (selectedCategories.size === 0) return nodes;
    return nodes.filter(node => selectedCategories.has(node.data.category));
  }, [nodes, selectedCategories]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    return edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [edges, filteredNodes]);

  // Toggle category filter
  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Handle node click
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (onNodeClick) {
      onNodeClick(node as unknown as TopologyNode);
    }
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
            onClick={() => fetchTopology(true)}
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
      {/* Notification Banner */}
      {notification && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-green-500 text-white px-4 py-2 text-center font-medium animate-slide-down">
          {notification}
        </div>
      )}

      {/* Header Controls */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-3 bg-white/90 backdrop-blur px-3 py-2 rounded-lg shadow-md">
        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold transition-all ${
              isLive 
                ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
            {isLive ? 'LIVE' : 'PAUSED'}
          </button>
        </div>

        {/* Refresh button */}
        <button
          onClick={() => fetchTopology(false)}
          className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium"
        >
          🔄 Refresh
        </button>

        {/* Node count with new indicator */}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-700">{nodes.length} nodes</span>
          {newNodes.size > 0 && (
            <span className="bg-green-500 text-white px-2 py-0.5 rounded-full text-xs font-bold animate-pulse">
              +{newNodes.size} NEW
            </span>
          )}
        </div>

        {/* Last updated */}
        <span className="text-xs text-gray-500">
          Updated {timeAgo}
        </span>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute top-2 right-2 z-10 bg-white/90 backdrop-blur px-3 py-2 rounded-lg shadow-md">
          <div className="flex flex-wrap gap-2">
            {Object.entries(categories).map(([category, count]) => (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all ${
                  selectedCategories.size === 0 || selectedCategories.has(category)
                    ? 'opacity-100'
                    : 'opacity-40'
                }`}
                style={{ 
                  backgroundColor: `${CATEGORY_COLORS[category]}20`,
                  color: CATEGORY_COLORS[category],
                  border: `1px solid ${CATEGORY_COLORS[category]}`
                }}
              >
                {CATEGORY_ICONS[category]} {category} ({count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={filteredNodes}
        edges={filteredEdges}
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
            style={{ border: '1px solid #ddd' }}
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

      {/* Styles */}
      <style jsx global>{`
        @keyframes slide-down {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

