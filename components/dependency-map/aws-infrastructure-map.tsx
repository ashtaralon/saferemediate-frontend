'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ============================================
// NEO4J CONFIGURATION
// ============================================
// Using Next.js API route to avoid CORS (routes through /api/neo4j/query)

// ============================================
// AWS ICON COMPONENT
// ============================================
const AWSIcon = ({ type, size = 32 }: { type: string; size?: number }) => {
  const colors: Record<string, string> = {
    EC2: '#ED7100', EC2Instance: '#ED7100', Lambda: '#ED7100', LambdaFunction: '#ED7100',
    RDSInstance: '#3B48CC', DynamoDB: '#3B48CC', DynamoDBTable: '#3B48CC',
    S3Bucket: '#1B660F', S3: '#1B660F',
    IAMRole: '#DD344C', IAMPolicy: '#DD344C', SecurityGroup: '#DD344C', KMSKey: '#DD344C', Principal: '#DD344C',
    VPC: '#8C4FFF', Subnet: '#8C4FFF', InternetGateway: '#8C4FFF', RouteTable: '#8C4FFF', NetworkEndpoint: '#8C4FFF',
    APIGateway: '#E7157B', ApiGateway: '#E7157B', SQSQueue: '#E7157B', EventBus: '#E7157B',
  };
  
  const icons: Record<string, string> = {
    EC2: '🖥️', EC2Instance: '🖥️', Lambda: 'λ', LambdaFunction: 'λ',
    RDSInstance: '🗄️', DynamoDB: '📊', DynamoDBTable: '📊',
    S3Bucket: '🪣', S3: '🪣',
    IAMRole: '👤', IAMPolicy: '📋', SecurityGroup: '🛡️', KMSKey: '🔑', Principal: '👤',
    VPC: '🌐', Subnet: '📦', InternetGateway: '🌍', RouteTable: '🗺️', NetworkEndpoint: '🔌',
    APIGateway: '⚡', ApiGateway: '⚡', SQSQueue: '📬', EventBus: '📡',
  };
  
  const color = colors[type] || '#545B64';
  const icon = icons[type] || '☁️';
  
  return (
    <div 
      className="flex items-center justify-center rounded-md"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.5 }}
    >
      {icon}
    </div>
  );
};

// ============================================
// CONNECTION STYLES
// ============================================
interface ConnectionStyle {
  color: string;
  animated: boolean;
  speed?: number;
}

const getConnectionStyle = (type: string): ConnectionStyle => {
  const styles: Record<string, ConnectionStyle> = {
    ACTUAL_TRAFFIC: { color: '#10B981', animated: true, speed: 1.5 },
    OBSERVED_TRAFFIC: { color: '#10B981', animated: true, speed: 1.2 },
    ALLOWS_TRAFFIC_TO: { color: '#3B82F6', animated: true, speed: 1 },
    API_CALL: { color: '#EC4899', animated: true, speed: 2 },
    ACTUAL_API_CALL: { color: '#EC4899', animated: true, speed: 2.5 },
    RUNTIME_CALLS: { color: '#F59E0B', animated: true, speed: 2 },
    ACTUAL_S3_ACCESS: { color: '#1B660F', animated: true, speed: 1.5 },
    S3_OPERATION: { color: '#1B660F', animated: true, speed: 1.2 },
    ASSUMES_ROLE: { color: '#DD344C', animated: true, speed: 0.5 },
    CAN_ASSUME: { color: '#DD344C', animated: true, speed: 0.5 },
    CAN_ACCESS: { color: '#DD344C', animated: true, speed: 0.8 },
    IN_VPC: { color: '#8C4FFF', animated: false },
    IN_SUBNET: { color: '#8C4FFF', animated: false },
    BELONGS_TO: { color: '#6B7280', animated: false },
    CONTAINS: { color: '#6B7280', animated: false },
  };
  return styles[type] || { color: '#94A3B8', animated: false };
};

const getCategoryColor = (label: string): string => {
  const colors: Record<string, string> = {
    EC2: '#ED7100', EC2Instance: '#ED7100', Lambda: '#ED7100', LambdaFunction: '#ED7100',
    RDSInstance: '#3B48CC', DynamoDBTable: '#3B48CC',
    S3Bucket: '#1B660F',
    IAMRole: '#DD344C', IAMPolicy: '#DD344C', SecurityGroup: '#DD344C', KMSKey: '#DD344C',
    VPC: '#8C4FFF', Subnet: '#8C4FFF', InternetGateway: '#8C4FFF',
    APIGateway: '#E7157B', ApiGateway: '#E7157B', SQSQueue: '#E7157B',
  };
  return colors[label] || '#545B64';
};

// ============================================
// TYPES
// ============================================
interface GraphNode {
  id: string;
  label: string;
  name: string;
  fullName: string;
  props: Record<string, any>;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  props: Record<string, any>;
}

interface SelectedItem extends Partial<GraphNode>, Partial<GraphEdge> {
  itemType: 'node' | 'edge';
}

// Attack Path types
interface AttackPathNode {
  id: string;
  name: string;
  type: string;
  is_internet_exposed: boolean;
  cve_count: number;
  critical_cves: number;
  high_cves: number;
}

interface AttackPath {
  id: string;
  nodes: AttackPathNode[];
  edges: { source: string; target: string; relationship_type: string }[];
  risk_score: number;
  path_length: number;
  source_type: string;
  target_type: string;
  target_name: string;
  total_cves: number;
  critical_cves: number;
  evidence_type: string;
  path_kind?: string;
}

interface BlastRadiusData {
  resource_id: string;
  resource_name: string;
  risk_level: string;
  total_affected: number;
  affected_resources: { name: string; type: string; id: string }[];
  vulnerability_summary?: {
    total_cves: number;
    critical_cves: number;
    high_cves: number;
  };
}

// ============================================
// ANIMATED EDGE COMPONENT
// ============================================
const AnimatedEdge = ({ 
  edge, 
  src, 
  tgt, 
  selected, 
  time, 
  onClick 
}: { 
  edge: GraphEdge; 
  src: GraphNode; 
  tgt: GraphNode; 
  selected: boolean; 
  time: number; 
  onClick: () => void;
}) => {
  const style = getConnectionStyle(edge.type);
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return null;
  
  const off = 36;
  const x1 = src.x + (dx / dist) * off;
  const y1 = src.y + (dy / dist) * off;
  const x2 = tgt.x - (dx / dist) * off;
  const y2 = tgt.y - (dy / dist) * off;
  
  const particles: { x: number; y: number; o: number }[] = [];
  if (style.animated && style.speed) {
    for (let i = 0; i < 3; i++) {
      const p = ((time * style.speed * 0.001) + i / 3) % 1;
      particles.push({ x: x1 + (x2 - x1) * p, y: y1 + (y2 - y1) * p, o: 0.4 + p * 0.6 });
    }
  }
  
  return (
    <g onClick={onClick} className="cursor-pointer">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={style.color} strokeWidth={selected ? 3 : 1.5} strokeOpacity={selected ? 0.9 : 0.4} />
      {style.animated && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={style.color} strokeWidth={4} strokeOpacity={0.12} />}
      {particles.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={5} fill={style.color} opacity={p.o * 0.3} />
          <circle cx={p.x} cy={p.y} r={2.5} fill={style.color} opacity={p.o} />
        </g>
      ))}
      <polygon
        points="0,-3 6,0 0,3"
        fill={style.color}
        opacity={selected ? 1 : 0.7}
        transform={`translate(${x2},${y2}) rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI})`}
      />
    </g>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function Neo4jAWSMap() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [zoom, setZoom] = useState(0.45);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState('traffic');
  const [animTime, setAnimTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [stats, setStats] = useState({ nodes: 0, rels: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [showAttackPaths, setShowAttackPaths] = useState(false);
  const [attackPaths, setAttackPaths] = useState<AttackPath[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [blastRadius, setBlastRadius] = useState<BlastRadiusData | null>(null);
  const [loadingPaths, setLoadingPaths] = useState(false);
  const animRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Animation loop
  useEffect(() => {
    if (!playing) return;
    const tick = (t: number) => {
      setAnimTime(t * speed);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, speed]);

  // Load data from backend API
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch from backend API
      const res = await fetch('/api/proxy/dependency-map/full?max_nodes=300');
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const rawNodes = data.nodes || [];
      const rawEdges = data.edges || [];

      setStats({ nodes: rawNodes.length, rels: rawEdges.length });

      // Filter by view mode
      let filteredNodes = rawNodes;
      let filteredEdges = rawEdges;

      if (viewMode === 'traffic') {
        const types = ['EC2', 'EC2Instance', 'Lambda', 'LambdaFunction', 'APIGateway', 'ApiGateway', 'RDSInstance', 'S3Bucket', 'S3', 'DynamoDBTable', 'SQSQueue'];
        filteredNodes = rawNodes.filter((n: any) => types.includes(n.type || n.label));
        const edgeTypes = ['ACTUAL_TRAFFIC', 'OBSERVED_TRAFFIC', 'API_CALL', 'ACTUAL_API_CALL', 'RUNTIME_CALLS', 'ACTUAL_S3_ACCESS', 'S3_OPERATION'];
        filteredEdges = rawEdges.filter((e: any) => edgeTypes.includes(e.type || e.edge_type));
      } else if (viewMode === 'security') {
        const types = ['IAMRole', 'IAMPolicy', 'SecurityGroup', 'Principal', 'KMSKey'];
        filteredNodes = rawNodes.filter((n: any) => types.includes(n.type || n.label));
        const edgeTypes = ['ASSUMES_ROLE', 'CAN_ASSUME', 'USES_ROLE', 'HAS_POLICY', 'CAN_ACCESS'];
        filteredEdges = rawEdges.filter((e: any) => edgeTypes.includes(e.type || e.edge_type));
      } else if (viewMode === 'network') {
        const types = ['VPC', 'Subnet', 'InternetGateway', 'RouteTable', 'SecurityGroup', 'NACL'];
        filteredNodes = rawNodes.filter((n: any) => types.includes(n.type || n.label));
        const edgeTypes = ['IN_VPC', 'IN_SUBNET', 'CONTAINS', 'HAS_IGW', 'USES_ROUTE_TABLE'];
        filteredEdges = rawEdges.filter((e: any) => edgeTypes.includes(e.type || e.edge_type));
      }

      // Use hierarchical layout for faster rendering
      const LAYER_ORDER: Record<string, number> = {
        'LoadBalancer': 0, 'ALB': 0, 'NLB': 0, 'APIGateway': 0, 'ApiGateway': 0,
        'EC2': 1, 'EC2Instance': 1, 'Lambda': 1, 'LambdaFunction': 1,
        'SQSQueue': 2, 'SNSTopic': 2, 'EventBus': 2,
        'RDSInstance': 3, 'DynamoDB': 3, 'DynamoDBTable': 3,
        'S3Bucket': 4, 'S3': 4,
        'IAMRole': 5, 'SecurityGroup': 5, 'KMSKey': 5,
        'VPC': 6, 'Subnet': 6,
      };

      // Group and position nodes
      const layers = new Map<number, GraphNode[]>();
      const procNodes: GraphNode[] = filteredNodes.map((n: any, i: number) => {
        const label = n.type || n.label || 'Unknown';
        const name = n.name || n.id || `${label}-${i}`;
        const layer = LAYER_ORDER[label] ?? 3;
        const node: GraphNode = {
          id: String(n.id),
          label,
          name: name.length > 20 ? name.slice(0, 20) + '...' : name,
          fullName: name,
          props: n.properties || n,
          x: 0, y: 0, vx: 0, vy: 0
        };
        if (!layers.has(layer)) layers.set(layer, []);
        layers.get(layer)!.push(node);
        return node;
      });

      // Position in hierarchical layout
      const sortedLayers = Array.from(layers.keys()).sort((a, b) => a - b);
      sortedLayers.forEach((layerNum, layerIdx) => {
        const layerNodes = layers.get(layerNum) || [];
        const startX = 600 - (layerNodes.length * 140) / 2 + 70;
        layerNodes.forEach((node, nodeIdx) => {
          node.x = startX + nodeIdx * 140;
          node.y = 100 + layerIdx * 160;
        });
      });

      const nodeIds = new Set(procNodes.map(n => n.id));
      const procEdges: GraphEdge[] = filteredEdges
        .map((e: any, i: number) => ({
          id: String(e.id || `edge-${i}`),
          source: String(e.source || e.from),
          target: String(e.target || e.to),
          type: e.type || e.edge_type || 'CONNECTED',
          props: e.properties || {}
        }))
        .filter((e: GraphEdge) => nodeIds.has(e.source) && nodeIds.has(e.target));

      setNodes(procNodes);
      setEdges(procEdges);
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setLoading(false);
    }
  }, [viewMode]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load attack paths when toggle is enabled
  const loadAttackPaths = useCallback(async () => {
    if (!showAttackPaths) {
      setAttackPaths([]);
      return;
    }

    setLoadingPaths(true);
    try {
      // Use system name from query param or default
      const systemName = new URLSearchParams(window.location.search).get('system') || 'alon-prod';
      const res = await fetch(`/api/proxy/attack-paths/${systemName}`);
      if (res.ok) {
        const data = await res.json();
        setAttackPaths(data.paths || []);
      }
    } catch (err) {
      console.error('Failed to load attack paths:', err);
    } finally {
      setLoadingPaths(false);
    }
  }, [showAttackPaths]);

  useEffect(() => { loadAttackPaths(); }, [loadAttackPaths]);

  // Load blast radius when a node is selected
  const loadBlastRadius = useCallback(async (resourceId: string) => {
    try {
      const res = await fetch(`/api/proxy/blast-radius/${resourceId}`);
      if (res.ok) {
        const data = await res.json();
        setBlastRadius(data);
      }
    } catch (err) {
      console.error('Failed to load blast radius:', err);
      setBlastRadius(null);
    }
  }, []);

  // Get nodes that are part of attack paths
  const attackPathNodeIds = useMemo(() => {
    const ids = new Set<string>();
    attackPaths.forEach(path => {
      path.nodes.forEach(n => ids.add(n.id));
    });
    return ids;
  }, [attackPaths]);

  // Get vulnerability data for a node from attack paths
  const getNodeVulnerability = useCallback((nodeId: string) => {
    for (const path of attackPaths) {
      const node = path.nodes.find(n => n.id === nodeId);
      if (node && (node.cve_count > 0 || node.critical_cves > 0)) {
        return node;
      }
    }
    return null;
  }, [attackPaths]);

  // Filter nodes by search
  const filteredNodes = useMemo(() => {
    if (!searchTerm) return nodes;
    const term = searchTerm.toLowerCase();
    return nodes.filter(n => 
      n.name.toLowerCase().includes(term) || 
      n.label.toLowerCase().includes(term) ||
      n.fullName.toLowerCase().includes(term)
    );
  }, [nodes, searchTerm]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);
  const filteredEdges = useMemo(() => 
    edges.filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)), 
    [edges, filteredNodeIds]
  );

  // Mouse handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.interactive')) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const onMouseMove = (e: React.MouseEvent) => { 
    if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); 
  };
  const onMouseUp = () => setDragging(false);
  const onWheel = (e: React.WheelEvent) => { 
    e.preventDefault(); 
    setZoom(z => Math.max(0.1, Math.min(2, z * (e.deltaY > 0 ? 0.92 : 1.08)))); 
  };

  const animCount = filteredEdges.filter(e => getConnectionStyle(e.type).animated).length;

  // Loading state
  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white text-sm font-medium">Loading from Neo4j...</p>
          <p className="text-slate-400 text-xs mt-1">Fetching {viewMode} data</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900 p-4">
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 text-center max-w-sm">
          <div className="text-2xl mb-2">⚠️</div>
          <p className="text-red-400 font-medium text-sm mb-2">Connection Error</p>
          <p className="text-slate-400 text-xs mb-3">{error}</p>
          <button onClick={loadData} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Compact Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/90 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Stats badges */}
          <div className="flex gap-1.5">
            <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded text-[10px] font-semibold">
              {stats.nodes.toLocaleString()} Nodes
            </span>
            <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[10px] font-semibold">
              {stats.rels.toLocaleString()} Rels
            </span>
            {playing && (
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px] font-semibold animate-pulse">
                {animCount} Flows
              </span>
            )}
          </div>

          {/* View mode tabs */}
          <div className="flex bg-slate-700/50 rounded p-0.5">
            {[
              { id: 'traffic', label: '↗️ Traffic' },
              { id: 'full', label: '🗺️ Full' },
              { id: 'security', label: '🔒 Security' },
              { id: 'network', label: '🌐 Network' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setViewMode(m.id)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                  viewMode === m.id
                    ? 'bg-white text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Attack Paths Toggle */}
          <button
            onClick={() => setShowAttackPaths(!showAttackPaths)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
              showAttackPaths
                ? 'bg-red-500 text-white shadow animate-pulse'
                : 'bg-slate-700/50 text-slate-400 hover:text-red-400'
            }`}
          >
            {loadingPaths ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <span>⚠️</span>
            )}
            Attack Paths
            {attackPaths.length > 0 && (
              <span className="ml-1 px-1 py-0.5 bg-red-700 rounded text-[9px]">
                {attackPaths.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-[11px] text-white placeholder-slate-400 w-28 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />

          {/* Animation controls */}
          <div className="flex items-center gap-1.5 bg-slate-700/50 rounded px-2 py-1">
            <button onClick={() => setPlaying(!playing)} className={`text-[10px] font-medium ${playing ? 'text-green-400' : 'text-slate-400'}`}>
              {playing ? '⏸' : '▶'}
            </button>
            <input type="range" min="0.2" max="3" step="0.2" value={speed} onChange={e => setSpeed(+e.target.value)} className="w-12 h-1" />
            <span className="text-slate-300 text-[10px] w-6">{speed}x</span>
          </div>

          {/* Refresh */}
          <button onClick={loadData} className="px-2 py-1 bg-white text-white rounded text-[10px] font-medium">
            🔄
          </button>
        </div>
      </div>

      {/* Canvas - fills remaining space */}
      <div 
        className="flex-1 min-h-0 relative overflow-hidden"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <svg width="100%" height="100%" className="bg-slate-900 block">
          <defs>
            <pattern id="neo4j-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#neo4j-grid)" />
          
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {filteredEdges.map(e => {
              const s = filteredNodes.find(n => n.id === e.source);
              const t = filteredNodes.find(n => n.id === e.target);
              if (!s || !t) return null;
              return (
                <AnimatedEdge
                  key={e.id}
                  edge={e}
                  src={s}
                  tgt={t}
                  selected={selected?.id === e.id && selected?.itemType === 'edge'}
                  time={animTime}
                  onClick={() => setSelected({ ...e, itemType: 'edge' })}
                />
              );
            })}

            {/* Attack Path Edges (rendered behind regular edges) */}
            {showAttackPaths && attackPaths.map((path, pathIdx) => {
              // Render edges for this attack path
              return path.edges.map((edge, edgeIdx) => {
                const srcNode = filteredNodes.find(n => n.id === edge.source);
                const tgtNode = filteredNodes.find(n => n.id === edge.target);
                if (!srcNode || !tgtNode) return null;

                const dx = tgtNode.x - srcNode.x;
                const dy = tgtNode.y - srcNode.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1) return null;

                const off = 36;
                const x1 = srcNode.x + (dx / dist) * off;
                const y1 = srcNode.y + (dy / dist) * off;
                const x2 = tgtNode.x - (dx / dist) * off;
                const y2 = tgtNode.y - (dy / dist) * off;

                const isPathSelected = selectedPath === path.id;

                return (
                  <g key={`attack-${pathIdx}-${edgeIdx}`} onClick={() => setSelectedPath(isPathSelected ? null : path.id)} className="cursor-pointer">
                    {/* Glow effect */}
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="#EF4444"
                      strokeWidth={isPathSelected ? 8 : 6}
                      strokeOpacity={0.2}
                    />
                    {/* Main line */}
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="#EF4444"
                      strokeWidth={isPathSelected ? 3 : 2}
                      strokeDasharray="8,4"
                      strokeOpacity={isPathSelected ? 1 : 0.7}
                    />
                    {/* Animated particles */}
                    {[0, 0.33, 0.66].map((offset, i) => {
                      const t = ((animTime * 0.003) + offset) % 1;
                      return (
                        <circle
                          key={i}
                          cx={x1 + (x2 - x1) * t}
                          cy={y1 + (y2 - y1) * t}
                          r={isPathSelected ? 5 : 4}
                          fill="#EF4444"
                          opacity={0.4 + t * 0.6}
                        />
                      );
                    })}
                    {/* Arrow */}
                    <polygon
                      points="0,-4 8,0 0,4"
                      fill="#EF4444"
                      transform={`translate(${x2},${y2}) rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI})`}
                    />
                  </g>
                );
              });
            })}

            {/* Nodes */}
            {filteredNodes.map(n => {
              const isSelected = selected?.id === n.id && selected?.itemType === 'node';
              const connCount = edges.filter(e => e.source === n.id || e.target === n.id).length;
              const hasFlow = edges.some(e => (e.source === n.id || e.target === n.id) && getConnectionStyle(e.type).animated);
              const color = getCategoryColor(n.label);
              const vuln = showAttackPaths ? getNodeVulnerability(n.id) : null;
              const isVulnerable = vuln && (vuln.cve_count > 0 || vuln.critical_cves > 0);
              const isCritical = vuln && vuln.critical_cves > 0;

              return (
                <g
                  key={n.id}
                  className="interactive cursor-pointer"
                  transform={`translate(${n.x},${n.y})`}
                  onClick={() => {
                    setSelected({ ...n, itemType: 'node' });
                    if (showAttackPaths) {
                      loadBlastRadius(n.id);
                    }
                  }}
                >
                  {/* Vulnerability pulsing ring */}
                  {isVulnerable && showAttackPaths && (
                    <circle r="42" fill="none" stroke={isCritical ? '#EF4444' : '#F97316'} strokeWidth="3" strokeOpacity="0.8">
                      <animate attributeName="r" from="38" to="48" dur="1s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" from="0.8" to="0.2" dur="1s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {hasFlow && playing && !isVulnerable && (
                    <circle r="38" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.25" strokeDasharray="8 4">
                      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="10s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <rect
                    x="-32" y="-32" width="64" height="64" rx="10"
                    fill="#1e293b"
                    stroke={isVulnerable ? (isCritical ? '#EF4444' : '#F97316') : (isSelected ? '#3b82f6' : color)}
                    strokeWidth={isVulnerable ? 3 : (isSelected ? 2.5 : 1.5)}
                    filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
                  />
                  <foreignObject x="-14" y="-18" width="28" height="28">
                    <AWSIcon type={n.label} size={28} />
                  </foreignObject>
                  <text y="26" textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="500">
                    {n.name.length > 10 ? n.name.slice(0, 10) + '…' : n.name}
                  </text>
                  {/* CVE badge for vulnerable nodes */}
                  {isVulnerable && showAttackPaths && (
                    <g transform="translate(-24,-24)">
                      <circle r="10" fill={isCritical ? '#EF4444' : '#F97316'} />
                      <text textAnchor="middle" dominantBaseline="middle" fontSize="7" fill="white" fontWeight="bold">
                        {vuln.cve_count > 99 ? '99+' : vuln.cve_count}
                      </text>
                    </g>
                  )}
                  {connCount > 0 && !isVulnerable && (
                    <g transform="translate(24,-24)">
                      <circle r="9" fill={color} />
                      <text textAnchor="middle" dominantBaseline="middle" fontSize="7" fill="white" fontWeight="bold">
                        {connCount > 99 ? '99+' : connCount}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Zoom controls */}
        <div className="absolute bottom-2 left-2 flex flex-col gap-0.5 bg-slate-800/90 rounded-lg p-1.5">
          <button onClick={() => setZoom(z => Math.min(2, z * 1.15))} className="w-6 h-6 text-white text-sm hover:bg-slate-700 rounded">+</button>
          <div className="text-center text-[9px] text-slate-400">{Math.round(zoom * 100)}%</div>
          <button onClick={() => setZoom(z => Math.max(0.1, z / 1.15))} className="w-6 h-6 text-white text-sm hover:bg-slate-700 rounded">−</button>
          <div className="border-t border-slate-600 my-0.5" />
          <button onClick={() => { setZoom(0.45); setPan({ x: 20, y: 20 }); }} className="w-6 h-6 text-white text-xs hover:bg-slate-700 rounded">⟲</button>
        </div>

        {/* Mini legend */}
        <div className="absolute bottom-2 right-2 bg-slate-800/90 rounded-lg p-2">
          <div className="text-[9px] text-slate-300 font-medium mb-1">Flow Types</div>
          <div className="flex flex-col gap-0.5">
            {[
              { type: 'ACTUAL_TRAFFIC', label: 'Traffic', color: '#10B981' },
              { type: 'API_CALL', label: 'API', color: '#EC4899' },
              { type: 'ASSUMES_ROLE', label: 'IAM', color: '#DD344C' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5 text-[9px]">
                <div className="w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
                <span className="text-slate-400">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Details panel */}
        {selected && (
          <div className="absolute top-2 right-2 w-56 bg-slate-800/95 rounded-lg border border-slate-700 overflow-hidden shadow-xl">
            <div className="px-2.5 py-1.5 border-b border-slate-700 flex justify-between items-center">
              <span className="text-white text-xs font-medium">{selected.itemType === 'node' ? 'Node' : 'Connection'}</span>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-sm">×</button>
            </div>
            <div className="p-2.5 max-h-48 overflow-auto">
              {selected.itemType === 'node' && (
                <>
                  <div className="flex gap-2 mb-2">
                    <AWSIcon type={selected.label || ''} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-medium truncate">{selected.fullName}</div>
                      <div className="text-[10px] mt-0.5 inline-block px-1.5 py-0.5 rounded" style={{ backgroundColor: getCategoryColor(selected.label || '') + '30', color: getCategoryColor(selected.label || '') }}>
                        {selected.label}
                      </div>
                    </div>
                  </div>
                  <div className="text-[9px] text-slate-500 uppercase mb-1">Properties</div>
                  <div className="bg-slate-900/50 rounded p-1.5 space-y-0.5">
                    {Object.entries(selected.props || {}).slice(0, 8).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[9px]">
                        <span className="text-slate-500">{k}</span>
                        <span className="text-slate-300 truncate max-w-[100px]">{String(v).slice(0, 25)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {selected.itemType === 'edge' && (
                <>
                  <div className="text-white text-[10px] mb-2">
                    {nodes.find(n => n.id === selected.source)?.name}
                    <span style={{ color: getConnectionStyle(selected.type || '').color }}> → </span>
                    {nodes.find(n => n.id === selected.target)?.name}
                  </div>
                  <div className="inline-block px-2 py-0.5 rounded text-[10px] font-medium mb-2" style={{ backgroundColor: getConnectionStyle(selected.type || '').color + '30', color: getConnectionStyle(selected.type || '').color }}>
                    {selected.type}
                  </div>
                  <div className="text-[9px] text-slate-500 uppercase mb-1">Properties</div>
                  <div className="bg-slate-900/50 rounded p-1.5">
                    {Object.keys(selected.props || {}).length > 0 ? (
                      Object.entries(selected.props || {}).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-[9px]">
                          <span className="text-slate-500">{k}</span>
                          <span className="text-slate-300">{String(v)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-500 text-[9px] italic">No properties</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Blast Radius Panel - shows when attack paths enabled and node selected */}
        {showAttackPaths && blastRadius && selected?.itemType === 'node' && (
          <div className="absolute top-60 right-2 w-56 bg-slate-800/95 rounded-lg border border-red-500/50 overflow-hidden shadow-xl">
            <div className="px-2.5 py-1.5 border-b border-red-500/30 flex justify-between items-center bg-red-500/10">
              <span className="text-red-400 text-xs font-medium flex items-center gap-1">
                <span>💥</span> Blast Radius
              </span>
              <button onClick={() => setBlastRadius(null)} className="text-slate-400 hover:text-white text-sm">×</button>
            </div>
            <div className="p-2.5 max-h-60 overflow-auto">
              {/* Risk Level Badge */}
              <div className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mb-2 ${
                blastRadius.risk_level === 'critical' ? 'bg-red-500/30 text-red-400' :
                blastRadius.risk_level === 'high' ? 'bg-orange-500/30 text-orange-400' :
                blastRadius.risk_level === 'medium' ? 'bg-yellow-500/30 text-yellow-400' :
                'bg-green-500/30 text-green-400'
              }`}>
                {blastRadius.risk_level?.toUpperCase()} RISK
              </div>

              {/* Vulnerability Summary */}
              {blastRadius.vulnerability_summary && (
                <div className="mb-2">
                  <div className="text-[9px] text-slate-500 uppercase mb-1">Vulnerabilities</div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="bg-red-500/20 rounded p-1 text-center">
                      <div className="text-red-400 text-sm font-bold">{blastRadius.vulnerability_summary.critical_cves || 0}</div>
                      <div className="text-[8px] text-slate-400">Critical</div>
                    </div>
                    <div className="bg-orange-500/20 rounded p-1 text-center">
                      <div className="text-orange-400 text-sm font-bold">{blastRadius.vulnerability_summary.high_cves || 0}</div>
                      <div className="text-[8px] text-slate-400">High</div>
                    </div>
                    <div className="bg-slate-500/20 rounded p-1 text-center">
                      <div className="text-slate-300 text-sm font-bold">{blastRadius.vulnerability_summary.total_cves || 0}</div>
                      <div className="text-[8px] text-slate-400">Total</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Affected Resources */}
              <div className="text-[9px] text-slate-500 uppercase mb-1">
                Affected Resources ({blastRadius.total_affected || 0})
              </div>
              <div className="bg-slate-900/50 rounded p-1.5 max-h-28 overflow-auto">
                {blastRadius.affected_resources && blastRadius.affected_resources.length > 0 ? (
                  blastRadius.affected_resources.slice(0, 10).map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[9px] py-0.5">
                      <AWSIcon type={r.type} size={14} />
                      <span className="text-slate-300 truncate">{r.name}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-[9px] italic">No affected resources</div>
                )}
                {blastRadius.affected_resources && blastRadius.affected_resources.length > 10 && (
                  <div className="text-[9px] text-slate-500 mt-1">
                    +{blastRadius.affected_resources.length - 10} more...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Attack Path Summary Panel */}
        {showAttackPaths && attackPaths.length > 0 && !selected && (
          <div className="absolute top-2 right-2 w-56 bg-slate-800/95 rounded-lg border border-red-500/50 overflow-hidden shadow-xl">
            <div className="px-2.5 py-1.5 border-b border-red-500/30 flex justify-between items-center bg-red-500/10">
              <span className="text-red-400 text-xs font-medium flex items-center gap-1">
                <span>⚠️</span> Attack Paths Summary
              </span>
            </div>
            <div className="p-2.5 max-h-60 overflow-auto">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-red-500/20 rounded p-1.5 text-center">
                  <div className="text-red-400 text-lg font-bold">{attackPaths.length}</div>
                  <div className="text-[8px] text-slate-400">Total Paths</div>
                </div>
                <div className="bg-orange-500/20 rounded p-1.5 text-center">
                  <div className="text-orange-400 text-lg font-bold">
                    {attackPaths.filter(p => p.risk_score >= 15).length}
                  </div>
                  <div className="text-[8px] text-slate-400">Critical</div>
                </div>
              </div>

              <div className="text-[9px] text-slate-500 uppercase mb-1">Top Paths</div>
              <div className="space-y-1.5">
                {attackPaths.slice(0, 5).map((path, i) => (
                  <div
                    key={path.id}
                    className={`bg-slate-900/50 rounded p-1.5 cursor-pointer hover:bg-slate-700/50 transition-colors ${selectedPath === path.id ? 'ring-1 ring-red-500' : ''}`}
                    onClick={() => setSelectedPath(selectedPath === path.id ? null : path.id)}
                  >
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-slate-300">{path.source_type} → {path.target_name}</span>
                      <span className={`font-bold ${path.risk_score >= 15 ? 'text-red-400' : path.risk_score >= 10 ? 'text-orange-400' : 'text-yellow-400'}`}>
                        {path.risk_score}
                      </span>
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      <span className="text-[8px] text-slate-500">{path.path_length} hops</span>
                      {path.total_cves > 0 ? (
                        <span className="text-[8px] text-red-400">{path.total_cves} CVEs</span>
                      ) : path.path_kind ? (
                        <span className="text-[8px] text-cyan-400 capitalize">{path.path_kind.replace(/-/g, ' ')}</span>
                      ) : null}
                      <span className={`text-[8px] ${path.evidence_type === 'observed' ? 'text-green-400' : 'text-slate-500'}`}>
                        {path.evidence_type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Compact Footer */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-slate-800/80 border-t border-slate-700 text-[9px] text-slate-400 flex-shrink-0">
        <span className="font-medium">Categories:</span>
        {[
          { color: '#ED7100', label: 'Compute' },
          { color: '#3B48CC', label: 'DB' },
          { color: '#1B660F', label: 'Storage' },
          { color: '#DD344C', label: 'Security' },
          { color: '#8C4FFF', label: 'Network' },
        ].map(c => (
          <div key={c.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: c.color }} />
            <span>{c.label}</span>
          </div>
        ))}
        <span className="ml-auto text-green-400">● = Active Flow</span>
      </div>
    </div>
  );
}
