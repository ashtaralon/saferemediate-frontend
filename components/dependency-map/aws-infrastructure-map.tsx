'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ============================================
// NEO4J CONFIGURATION
// ============================================
// Using backend API proxy (more reliable than direct Neo4j HTTP)
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'
const NEO4J_PROXY_URL = `${BACKEND_URL}/api/graph/query`

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
  type: 'node' | 'edge';
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
  const animRef = useRef<number>();
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

  // Query Neo4j via Next.js API proxy
  const query = async (cypher: string) => {
    const res = await fetch(NEO4J_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cypher }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }
    return res.json();
  };

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const countRes = await query('MATCH (n) WITH count(n) as nc MATCH ()-[r]->() RETURN nc, count(r)');
      const counts = countRes.results?.[0]?.data?.[0]?.row || [0, 0];
      setStats({ nodes: counts[0], rels: counts[1] });

      let nq: string, eq: string;
      const limit = 300;
      
      if (viewMode === 'traffic') {
        nq = `MATCH (n) WHERE n:EC2Instance OR n:Lambda OR n:LambdaFunction OR n:APIGateway OR n:ApiGateway OR n:RDSInstance OR n:S3Bucket OR n:DynamoDBTable OR n:SQSQueue
              RETURN id(n), labels(n), properties(n) LIMIT ${limit}`;
        eq = `MATCH (a)-[r]->(b) WHERE type(r) IN ['ACTUAL_TRAFFIC','OBSERVED_TRAFFIC','API_CALL','ACTUAL_API_CALL','RUNTIME_CALLS','ACTUAL_S3_ACCESS']
              RETURN id(a), id(b), type(r), properties(r), id(r) LIMIT 800`;
      } else if (viewMode === 'security') {
        nq = `MATCH (n) WHERE n:IAMRole OR n:IAMPolicy OR n:SecurityGroup OR n:Principal OR n:KMSKey
              RETURN id(n), labels(n), properties(n) LIMIT ${limit}`;
        eq = `MATCH (a)-[r]->(b) WHERE type(r) IN ['ASSUMES_ROLE','CAN_ASSUME','USES_ROLE','HAS_POLICY','CAN_ACCESS']
              RETURN id(a), id(b), type(r), properties(r), id(r) LIMIT 800`;
      } else if (viewMode === 'network') {
        nq = `MATCH (n) WHERE n:VPC OR n:Subnet OR n:InternetGateway OR n:RouteTable OR n:SecurityGroup
              RETURN id(n), labels(n), properties(n) LIMIT ${limit}`;
        eq = `MATCH (a)-[r]->(b) WHERE type(r) IN ['IN_VPC','IN_SUBNET','CONTAINS','HAS_IGW','USES_ROUTE_TABLE']
              RETURN id(a), id(b), type(r), properties(r), id(r) LIMIT 800`;
      } else {
        nq = `MATCH (n) RETURN id(n), labels(n), properties(n) LIMIT ${limit}`;
        eq = `MATCH (a)-[r]->(b) RETURN id(a), id(b), type(r), properties(r), id(r) LIMIT 1000`;
      }

      const nodesRes = await query(nq);
      const edgesRes = await query(eq);
      
      const nodeData = nodesRes.results?.[0]?.data || [];
      const edgeData = edgesRes.results?.[0]?.data || [];

      const cols = Math.ceil(Math.sqrt(nodeData.length));
      const spacing = 140;
      
      const procNodes: GraphNode[] = nodeData.map((r: any, i: number) => {
        const [id, labels, props] = r.row;
        const label = labels[0] || 'Unknown';
        const name = props.name || props.Name || props.id || props.arn?.split('/').pop() || props.arn?.split(':').pop() || `${label}-${id}`;
        return {
          id: String(id), label,
          name: name.length > 20 ? name.slice(0, 20) + '...' : name,
          fullName: name, props,
          x: 150 + (i % cols) * spacing,
          y: 150 + Math.floor(i / cols) * spacing,
          vx: 0, vy: 0
        };
      });

      const nodeIds = new Set(procNodes.map(n => n.id));
      const procEdges: GraphEdge[] = edgeData
        .map((r: any) => ({ id: String(r.row[4]), source: String(r.row[0]), target: String(r.row[1]), type: r.row[2], props: r.row[3] || {} }))
        .filter((e: GraphEdge) => nodeIds.has(e.source) && nodeIds.has(e.target));

      // Force layout
      const nodeMap = new Map(procNodes.map(n => [n.id, n]));
      for (let iter = 0; iter < 80; iter++) {
        const t = 1 - iter / 80;
        procNodes.forEach(n1 => {
          procNodes.forEach(n2 => {
            if (n1.id === n2.id) return;
            const dx = n1.x - n2.x, dy = n1.y - n2.y;
            const d = Math.max(Math.sqrt(dx*dx + dy*dy), 1);
            const f = 8000 / (d * d);
            n1.vx = (n1.vx || 0) + (dx/d) * f * t;
            n1.vy = (n1.vy || 0) + (dy/d) * f * t;
          });
        });
        procEdges.forEach(e => {
          const s = nodeMap.get(e.source), g = nodeMap.get(e.target);
          if (!s || !g) return;
          const dx = g.x - s.x, dy = g.y - s.y;
          const f = Math.sqrt(dx*dx + dy*dy) * 0.004 * t;
          s.vx = (s.vx || 0) + dx * f; s.vy = (s.vy || 0) + dy * f;
          g.vx = (g.vx || 0) - dx * f; g.vy = (g.vy || 0) - dy * f;
        });
        procNodes.forEach(n => {
          n.x += (n.vx || 0) * 0.1; n.y += (n.vy || 0) * 0.1;
          n.vx = (n.vx || 0) * 0.85; n.vy = (n.vy || 0) * 0.85;
          n.x = Math.max(80, Math.min(4000, n.x));
          n.y = Math.max(80, Math.min(3000, n.y));
        });
      }

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
                    ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
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
          <button onClick={loadData} className="px-2 py-1 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded text-[10px] font-medium">
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
                  selected={selected?.id === e.id && selected?.type === 'edge'}
                  time={animTime}
                  onClick={() => setSelected({ ...e, type: 'edge' })}
                />
              );
            })}

            {/* Nodes */}
            {filteredNodes.map(n => {
              const isSelected = selected?.id === n.id && selected?.type === 'node';
              const connCount = edges.filter(e => e.source === n.id || e.target === n.id).length;
              const hasFlow = edges.some(e => (e.source === n.id || e.target === n.id) && getConnectionStyle(e.type).animated);
              const color = getCategoryColor(n.label);

              return (
                <g 
                  key={n.id} 
                  className="interactive cursor-pointer"
                  transform={`translate(${n.x},${n.y})`} 
                  onClick={() => setSelected({ ...n, type: 'node' })}
                >
                  {hasFlow && playing && (
                    <circle r="38" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.25" strokeDasharray="8 4">
                      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="10s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <rect 
                    x="-32" y="-32" width="64" height="64" rx="10" 
                    fill="#1e293b" 
                    stroke={isSelected ? '#3b82f6' : color} 
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
                  />
                  <foreignObject x="-14" y="-18" width="28" height="28">
                    <AWSIcon type={n.label} size={28} />
                  </foreignObject>
                  <text y="26" textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="500">
                    {n.name.length > 10 ? n.name.slice(0, 10) + '…' : n.name}
                  </text>
                  {connCount > 0 && (
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
              <span className="text-white text-xs font-medium">{selected.type === 'node' ? 'Node' : 'Connection'}</span>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-sm">×</button>
            </div>
            <div className="p-2.5 max-h-48 overflow-auto">
              {selected.type === 'node' && (
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
              {selected.type === 'edge' && (
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
