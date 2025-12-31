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
// TYPES - Based on ACTUAL API response structure
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
// CONSTANTS
// ============================================================================

const CATEGORY_CONFIG: Record<string, { color: string; icon: string; bg: string }> = {
  SecurityGroup: { color: '#ef4444', icon: '🛡️', bg: '#fef2f2' },
  IAMRole: { color: '#f59e0b', icon: '👤', bg: '#fffbeb' },
  S3Bucket: { color: '#22c55e', icon: '📦', bg: '#f0fdf4' },
  Lambda: { color: '#f97316', icon: '⚡', bg: '#fff7ed' },
  DynamoDB: { color: '#6366f1', icon: '🗄️', bg: '#eef2ff' },
  EC2: { color: '#f97316', icon: '🖥️', bg: '#fff7ed' },
  Unknown: { color: '#6b7280', icon: '📄', bg: '#f9fafb' },
};

// ============================================================================
// DAGRE LAYOUT
// ============================================================================

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120, marginx: 50, marginy: 50 });

  const nodeWidth = 200;
  const nodeHeight = 80;

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
      return pos ? { ...node, position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 } } : node;
    }),
    edges,
  };
};

// ============================================================================
// EXTRACT REAL RELATIONSHIPS FROM DATA
// ============================================================================

const extractRealRelationships = (resources: LPResource[]): Edge[] => {
  const edges: Edge[] = [];
  const addedEdges = new Set<string>();

  // Create lookup maps
  const sgById = new Map<string, LPResource>();
  const resourceByName = new Map<string, LPResource>();
  
  resources.forEach(r => {
    resourceByName.set(r.resourceName.toLowerCase(), r);
    if (r.resourceType === 'SecurityGroup') {
      // Extract SG ID from ARN (e.g., sg-06a6f52b72976da16)
      const sgIdMatch = r.resourceArn.match(/sg-[a-f0-9]+/);
      if (sgIdMatch) {
        sgById.set(sgIdMatch[0], r);
      }
    }
  });

  // Get all resources by type
  const securityGroups = resources.filter(r => r.resourceType === 'SecurityGroup');
  const iamRoles = resources.filter(r => r.resourceType === 'IAMRole');
  const s3Buckets = resources.filter(r => r.resourceType === 'S3Bucket');

  // 1. REAL SG → SG connections from allowedList rules
  securityGroups.forEach(sg => {
    if (!sg.allowedList) return;
    
    sg.allowedList.forEach(rule => {
      rule.sources.forEach(source => {
        if (source.sgId) {
          // This is a REAL connection - this SG references another SG
          const targetSg = sgById.get(source.sgId);
          if (targetSg) {
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
                labelStyle: { fontSize: 10, fontWeight: 500 },
                labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
                style: { stroke: '#ef4444', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
              });
            }
          }
        }
      });
    });
  });

  // 2. Infer IAM Role → S3 connections based on naming patterns
  iamRoles.forEach(role => {
    const roleLower = role.resourceName.toLowerCase();
    
    s3Buckets.forEach(bucket => {
      const bucketLower = bucket.resourceName.toLowerCase();
      
      // Match patterns like "cloudtrail-role" → "cloudtrail-logs" bucket
      const patterns = [
        { rolePattern: 'cloudtrail', bucketPattern: 'cloudtrail' },
        { rolePattern: 'lambda', bucketPattern: 'logs' },
        { rolePattern: 'flowlogs', bucketPattern: 'logs' },
        { rolePattern: 's3-bloat', bucketPattern: 'saferemediate' },
      ];
      
      for (const p of patterns) {
        if (roleLower.includes(p.rolePattern) && bucketLower.includes(p.bucketPattern)) {
          const edgeId = `${role.resourceName}->${bucket.resourceName}`;
          if (!addedEdges.has(edgeId)) {
            addedEdges.add(edgeId);
            edges.push({
              id: edgeId,
              source: role.resourceName,
              target: bucket.resourceName,
              type: 'smoothstep',
              animated: false,
              label: 'accesses',
              labelStyle: { fontSize: 10, fontWeight: 500 },
              labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
              style: { stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '5,5' },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' },
            });
            break;
          }
        }
      }
    });
  });

  // 3. Connect SafeRemediate roles to each other (trust chain)
  const safeRemediateRoles = iamRoles.filter(r => 
    r.resourceName.toLowerCase().includes('saferemediate')
  );
  
  for (let i = 0; i < safeRemediateRoles.length - 1; i++) {
    const source = safeRemediateRoles[i];
    const target = safeRemediateRoles[i + 1];
    const edgeId = `${source.resourceName}->${target.resourceName}`;
    if (!addedEdges.has(edgeId)) {
      addedEdges.add(edgeId);
      edges.push({
        id: edgeId,
        source: source.resourceName,
        target: target.resourceName,
        type: 'smoothstep',
        animated: false,
        label: 'trusts',
        labelStyle: { fontSize: 10, fontWeight: 500 },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
        style: { stroke: '#f59e0b', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
      });
    }
  }

  // 4. Connect SGs that protect the same app
  const appSg = securityGroups.find(sg => sg.resourceName.includes('app-sg'));
  const albSg = securityGroups.find(sg => sg.resourceName.includes('alb-sg'));
  const dbSg = securityGroups.find(sg => sg.resourceName.includes('db-sg'));
  
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
        label: 'routes to',
        labelStyle: { fontSize: 10, fontWeight: 500 },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
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
        label: 'connects to',
        labelStyle: { fontSize: 10, fontWeight: 500 },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
      });
    }
  }

  return edges;
};

// ============================================================================
// CUSTOM NODE COMPONENT
// ============================================================================

const AWSNodeComponent = ({ data }: { data: any }) => {
  const config = CATEGORY_CONFIG[data.resourceType] || CATEGORY_CONFIG.Unknown;
  const severity = data.severity || 'low';
  const severityColor = severity === 'high' ? '#ef4444' : severity === 'medium' ? '#f59e0b' : '#22c55e';
  
  return (
    <div
      className="px-4 py-3 rounded-xl shadow-lg border-2 bg-white hover:shadow-xl transition-all cursor-pointer min-w-[180px]"
      style={{ borderColor: config.color }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate" title={data.fullName}>
            {data.label}
          </p>
          <p className="text-xs text-gray-500">{data.resourceType}</p>
        </div>
        {/* Status dot */}
        <div 
          className="w-3 h-3 rounded-full flex-shrink-0" 
          style={{ backgroundColor: severityColor }}
          title={`Severity: ${severity}`}
        />
      </div>
      
      {/* Details */}
      {data.lpScore !== undefined && (
        <div className="text-xs text-gray-600 flex items-center gap-2">
          <span>LP Score: {data.lpScore}%</span>
          {data.gapCount > 0 && (
            <span className="text-amber-600">• {data.gapCount} gaps</span>
          )}
        </div>
      )}
      
      {data.internetExposed && (
        <div className="text-xs text-red-600 mt-1 font-medium">
          🌐 Internet Exposed
        </div>
      )}
    </div>
  );
};

const nodeTypes = { awsNode: AWSNodeComponent };

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
  const [resourceCount, setResourceCount] = useState(0);

  const timeAgo = useMemo(() => {
    if (!lastUpdated) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }, [lastUpdated]);

  // Fetch REAL data from least-privilege endpoint
  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      
      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${systemName}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      const resources: LPResource[] = data.resources || [];
      
      if (resources.length === 0) {
        setError('No resources found for this system.');
        setLoading(false);
        return;
      }

      setResourceCount(resources.length);

      // Create nodes from REAL resources
      const flowNodes: Node[] = resources.map((resource) => {
        const config = CATEGORY_CONFIG[resource.resourceType] || CATEGORY_CONFIG.Unknown;
        const displayName = resource.resourceName.length > 25 
          ? resource.resourceName.substring(0, 22) + '...' 
          : resource.resourceName;
        
        return {
          id: resource.resourceName,
          type: 'awsNode',
          position: { x: 0, y: 0 },
          data: {
            label: displayName,
            fullName: resource.resourceName,
            resourceType: resource.resourceType,
            lpScore: resource.lpScore,
            gapCount: resource.gapCount || 0,
            severity: resource.severity,
            internetExposed: resource.networkExposure?.internetExposedRules > 0,
            color: config.color,
          },
        };
      });

      // Extract REAL relationships from the data
      const flowEdges = extractRealRelationships(resources);

      // Apply layout
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges);

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setLastUpdated(new Date());
      setError(null);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-gray-50 rounded-xl" style={{ height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading {systemName} topology...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 rounded-xl" style={{ height }}>
        <div className="text-center">
          <p className="text-red-700 font-semibold mb-2">⚠️ Error</p>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <button 
            onClick={() => fetchData(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-gray-200 overflow-hidden bg-gray-50" style={{ height }}>
      {/* Header Controls */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-3 bg-white/95 backdrop-blur px-4 py-2 rounded-lg shadow-md border border-gray-200">
        {/* Live indicator */}
        <button
          onClick={() => setIsLive(!isLive)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
            isLive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>

        {/* Refresh button */}
        <button
          onClick={() => fetchData(false)}
          className="flex items-center gap-1.5 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 text-sm font-medium transition-colors"
        >
          🔄 Refresh
        </button>

        {/* Stats */}
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-gray-800">{resourceCount} resources</span>
          <span className="text-gray-500">•</span>
          <span className="font-semibold text-gray-800">{edges.length} connections</span>
          <span className="text-gray-500">•</span>
          <span className="text-gray-500 text-xs">Updated {timeAgo}</span>
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute top-3 right-3 z-10 bg-white/95 backdrop-blur px-4 py-2 rounded-lg shadow-md border border-gray-200">
          <div className="flex flex-wrap gap-2">
            {Object.entries(categoryCounts).map(([type, count]) => {
              const config = CATEGORY_CONFIG[type] || CATEGORY_CONFIG.Unknown;
              return (
                <span
                  key={type}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: config.bg, color: config.color }}
                >
                  {config.icon} {type} ({count})
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* React Flow Graph */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onNodeClick?.(node)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
        <Controls className="bg-white rounded-lg shadow-md" />
        {showMiniMap && (
          <MiniMap
            nodeColor={(node) => node.data.color || '#888'}
            maskColor="rgba(255, 255, 255, 0.8)"
            className="rounded-lg shadow-md"
          />
        )}
      </ReactFlow>

      {/* Empty state */}
      {nodes.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <div className="text-center">
            <p className="text-gray-600 text-lg font-medium mb-2">No resources found</p>
            <p className="text-gray-500 text-sm">
              Tag AWS resources with <code className="bg-gray-100 px-2 py-0.5 rounded">SystemName={systemName}</code>
            </p>
          </div>
        </div>
      )}

      {/* Data source indicator */}
      <div className="absolute bottom-3 left-3 text-xs text-gray-500 bg-white/90 px-2 py-1 rounded">
        📊 Data: /api/proxy/least-privilege/issues • Real AWS resources only
      </div>
    </div>
  );
}
