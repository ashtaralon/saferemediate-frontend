'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  RefreshCw, ZoomIn, ZoomOut, Maximize2, Search, Shield, Server,
  Database, Globe, Key, HardDrive, Cloud, Lock, Layers, Activity
} from 'lucide-react';

interface GraphNode {
  id: string; type: string; name: string; properties?: Record<string, any>;
  lp_score?: number; internet_exposed?: boolean; permission_gaps?: number; traffic_bytes?: number;
}
interface GraphEdge {
  id: string; source: string; target: string; type: string;
  is_used?: boolean; traffic_bytes?: number; port?: number; protocol?: string;
}
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; }

const AWS_COLORS: Record<string, {bg: string; border: string; gradient: string}> = {
  EC2: { bg: '#FF9900', border: '#EC7211', gradient: 'linear-gradient(135deg, #FF9900 0%, #EC7211 100%)' },
  Lambda: { bg: '#FF9900', border: '#EC7211', gradient: 'linear-gradient(135deg, #FF9900 0%, #EC7211 100%)' },
  RDS: { bg: '#3B48CC', border: '#2E3AB5', gradient: 'linear-gradient(135deg, #527FFF 0%, #3B48CC 100%)' },
  DynamoDB: { bg: '#3B48CC', border: '#2E3AB5', gradient: 'linear-gradient(135deg, #527FFF 0%, #3B48CC 100%)' },
  S3: { bg: '#3F8624', border: '#2D6B19', gradient: 'linear-gradient(135deg, #6AAF35 0%, #3F8624 100%)' },
  SecurityGroup: { bg: '#DD344C', border: '#C42D42', gradient: 'linear-gradient(135deg, #FF5C5C 0%, #DD344C 100%)' },
  IAMRole: { bg: '#DD344C', border: '#C42D42', gradient: 'linear-gradient(135deg, #FF5C5C 0%, #DD344C 100%)' },
  InternetGateway: { bg: '#067F68', border: '#056654', gradient: 'linear-gradient(135deg, #1A9E85 0%, #067F68 100%)' },
  Default: { bg: '#5A6B7A', border: '#475666', gradient: 'linear-gradient(135deg, #7A8B9A 0%, #5A6B7A 100%)' }
};

const LANE_ORDER: Record<string, number> = {
  'InternetGateway': 0, 'NATGateway': 0, 'VPC': 0, 'Subnet': 1, 'SecurityGroup': 1, 'ALB': 1, 'ELB': 1,
  'EC2': 2, 'Lambda': 2, 'ECS': 2, 'IAMRole': 3, 'IAMPolicy': 3,
  'RDS': 4, 'DynamoDB': 4, 'S3': 4, 'Aurora': 4
};

const AWSIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 48 }) => {
  const props = { width: size, height: size, strokeWidth: 1.5, className: "text-white drop-shadow-md" };
  switch (type) {
    case 'EC2': return <Server {...props} />;
    case 'RDS': case 'DynamoDB': return <Database {...props} />;
    case 'S3': return <HardDrive {...props} />;
    case 'Lambda': return <Layers {...props} />;
    case 'SecurityGroup': return <Shield {...props} />;
    case 'IAMRole': return <Key {...props} />;
    case 'InternetGateway': return <Globe {...props} />;
    default: return <Lock {...props} />;
  }
};

function getColors(type: string) { return AWS_COLORS[type] || AWS_COLORS.Default; }
function getLane(type: string) { return LANE_ORDER[type] ?? 3; }
function truncate(s: string, max = 16) { return !s ? 'Unknown' : s.length <= max ? s : s.slice(0, max-3) + '...'; }

interface GraphViewX6Props {
  systemName: string;
  graphData: any;
  isLoading: boolean;
  onNodeClick: (id: string, type: string, name: string) => void;
  onRefresh: () => void;
  highlightPath?: { source: string; target: string; port?: string };
}

export default function GraphViewX6({ 
  systemName, 
  graphData, 
  isLoading, 
  onNodeClick, 
  onRefresh,
  highlightPath 
}: GraphViewX6Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<GraphData>({ nodes: [], edges: [] });
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState('');
  const [coreOnly, setCoreOnly] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Use graphData from props instead of fetching
  useEffect(() => {
    if (graphData && graphData.nodes && graphData.edges) {
      console.log('[GraphViewX6] Processing graphData:', {
        nodesCount: graphData.nodes?.length,
        edgesCount: graphData.edges?.length
      });
      const nodes = (graphData.nodes || []).map((n: any) => ({
        id: n.id, type: n.type || 'Unknown', name: n.name || n.id,
        lp_score: n.lp_score, internet_exposed: n.is_internet_exposed || n.internet_exposed,
        permission_gaps: n.permission_gaps || n.gap_count, traffic_bytes: n.traffic_bytes
      }));
      const edges = (graphData.edges || []).map((e: any) => ({
        id: e.id || `${e.source}-${e.target}`, source: e.source, target: e.target,
        type: e.edge_type || e.type, is_used: e.is_used, traffic_bytes: e.traffic_bytes
      }));
      console.log('[GraphViewX6] Mapped data:', { nodes: nodes.length, edges: edges.length });
      setData({ nodes, edges });
      setError(null);
    } else if (!isLoading && (!graphData || !graphData.nodes || graphData.nodes.length === 0)) {
      console.log('[GraphViewX6] No graphData available');
      setData({ nodes: [], edges: [] });
    }
  }, [graphData, isLoading]);

  const filtered = useMemo(() => {
    let nodes = data.nodes || [];
    if (coreOnly) nodes = nodes.filter(n => n.type !== 'IAMPolicy');
    if (search) { const t = search.toLowerCase(); nodes = nodes.filter(n => n.name?.toLowerCase().includes(t) || n.type?.toLowerCase().includes(t)); }
    const ids = new Set(nodes.map(n => n.id));
    const edges = (data.edges || []).filter(e => ids.has(e.source) && ids.has(e.target));
    console.log('[GraphViewX6] Filtered:', { nodes: nodes.length, edges: edges.length, coreOnly, search });
    return { nodes, edges };
  }, [data, coreOnly, search]);

  const layout = useMemo(() => {
    if (filtered.nodes.length === 0) {
      console.log('[GraphViewX6] No nodes to layout');
      return { positions: new Map(), width: 0, height: 0, lanes: [] };
    }
    const lanes = new Map<number, GraphNode[]>();
    filtered.nodes.forEach(n => { const l = getLane(n.type); if (!lanes.has(l)) lanes.set(l, []); lanes.get(l)!.push(n); });
    const positions = new Map<string, { x: number; y: number }>();
    const sorted = Array.from(lanes.entries()).sort((a, b) => a[0] - b[0]);
    let maxY = 0;
    sorted.forEach(([_, nodes], i) => {
      nodes.forEach((n, j) => { const x = 80 + i * 250, y = 80 + j * 120; positions.set(n.id, { x, y }); maxY = Math.max(maxY, y); });
    });
    console.log('[GraphViewX6] Layout calculated:', { 
      nodes: filtered.nodes.length, 
      lanes: sorted.length, 
      positions: positions.size,
      width: 80 * 2 + sorted.length * 250,
      height: maxY + 180
    });
    return { positions, width: 80 * 2 + sorted.length * 250, height: maxY + 180, lanes: sorted };
  }, [filtered]);

  useEffect(() => {
    if (!containerRef.current || !layout.width || layout.width === 0) {
      console.log('[GraphViewX6] Skipping zoom calculation:', { hasContainer: !!containerRef.current, width: layout.width });
      return;
    }
    const c = containerRef.current;
    const z = Math.min(c.clientWidth / layout.width, c.clientHeight / layout.height, 1) * 0.9;
    setZoom(z);
    setPan({ x: (c.clientWidth - layout.width * z) / 2, y: (c.clientHeight - layout.height * z) / 2 });
    console.log('[GraphViewX6] Zoom calculated:', { zoom: z, pan: { x: (c.clientWidth - layout.width * z) / 2, y: (c.clientHeight - layout.height * z) / 2 } });
  }, [layout]);

  if (isLoading) return <div className="w-full h-full flex items-center justify-center bg-slate-900"><RefreshCw className="w-12 h-12 text-blue-400 animate-spin" /></div>;
  if (error) return <div className="w-full h-full flex items-center justify-center bg-slate-900 text-red-400">{error}<button onClick={onRefresh} className="ml-4 px-4 py-2 bg-blue-600 rounded">Retry</button></div>;
  if (!data.nodes || data.nodes.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-300">
        <div className="text-lg mb-4">No graph data available</div>
        <div className="text-sm mb-4">Nodes: {data.nodes?.length || 0}, Edges: {data.edges?.length || 0}</div>
        <button onClick={onRefresh} className="px-4 py-2 bg-blue-600 rounded text-white">Refresh</button>
      </div>
    );
  }

  console.log('[GraphViewX6] Render:', {
    isLoading,
    hasGraphData: !!graphData,
    dataNodes: data.nodes?.length || 0,
    dataEdges: data.edges?.length || 0,
    filteredNodes: filtered.nodes.length,
    filteredEdges: filtered.edges.length,
    layoutWidth: layout.width,
    layoutHeight: layout.height,
    positions: layout.positions.size
  });

  return (
    <div className="w-full h-full flex flex-col bg-slate-900">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-white font-semibold">AWS Architecture</span>
          <span className="text-slate-400 text-sm">Nodes: {filtered.nodes.length} | Edges: {filtered.edges.length}</span>
          {data.nodes && data.nodes.length > 0 && (
            <span className="text-xs text-slate-500">(Data: {data.nodes.length} nodes, {data.edges.length} edges)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9 pr-4 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm w-40" />
          </div>
          <button onClick={onRefresh} className="p-2 bg-blue-600 rounded-lg"><RefreshCw className="w-4 h-4 text-white" /></button>
          <button onClick={() => setCoreOnly(!coreOnly)} className={`px-3 py-1.5 rounded-lg text-sm ${coreOnly ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}>Core</button>
          <button onClick={() => setZoom(z => Math.max(0.2, z / 1.2))} className="p-1 bg-slate-700 rounded"><ZoomOut className="w-4 h-4 text-white" /></button>
          <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="p-1 bg-slate-700 rounded"><ZoomIn className="w-4 h-4 text-white" /></button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden relative bg-slate-900" style={{ cursor: dragging ? 'grabbing' : 'grab', minHeight: '400px' }}
        onMouseDown={e => { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }}
        onMouseMove={e => { if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }}
        onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)}
        onWheel={e => { e.preventDefault(); setZoom(z => Math.max(0.2, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1)))); }}>
        <svg className="absolute inset-0 w-full h-full" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#10B981" /></marker>
            <marker id="arrow-gray" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#64748B" /></marker>
          </defs>
          {filtered.edges.map(e => {
            const s = layout.positions.get(e.source), t = layout.positions.get(e.target);
            if (!s || !t) return null;
            const active = e.is_used || (e.traffic_bytes || 0) > 0;
            const path = `M${s.x + 140} ${s.y + 50} C${(s.x + t.x + 140) / 2} ${s.y + 50},${(s.x + t.x + 140) / 2} ${t.y + 50},${t.x} ${t.y + 50}`;
            return <g key={e.id}>
              {active && <path d={path} fill="none" stroke="#10B981" strokeWidth={6} strokeOpacity={0.3} />}
              <path d={path} fill="none" stroke={active ? '#10B981' : '#64748B'} strokeWidth={active ? 3 : 2}
                strokeDasharray={active ? 'none' : '8 4'} markerEnd={active ? 'url(#arrow)' : 'url(#arrow-gray)'} />
            </g>;
          })}
        </svg>
        <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
          {layout.lanes.map(([lane, nodes], i) => {
            const p = layout.positions.get(nodes[0]?.id);
            return p && <div key={lane} className="absolute text-slate-400 text-sm uppercase pointer-events-none" style={{ left: p.x, top: 30, width: 140, textAlign: 'center' }}>{nodes[0]?.type} ({nodes.length})</div>;
          })}
          {filtered.nodes.map(n => {
            const p = layout.positions.get(n.id);
            if (!p) {
              console.warn('[GraphViewX6] No position for node:', n.id, n.type);
              return null;
            }
            const c = getColors(n.type);
            return <div key={n.id} className="absolute cursor-pointer pointer-events-auto" style={{ left: p.x, top: p.y, width: 140, height: 100, zIndex: 10 }}
              onClick={() => { 
                setSelected(n); 
                onNodeClick(n.id, n.type, n.name);
              }}>
              <div className={`w-full h-full rounded-xl border-2 flex flex-col items-center justify-center ${selected?.id === n.id ? 'ring-4 ring-white/50' : ''}`}
                style={{ background: c.gradient, borderColor: c.border, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                <AWSIcon type={n.type} size={48} />
                <div className="text-[10px] text-white/80 uppercase">{n.type}</div>
                <div className="text-xs text-white truncate w-full text-center px-2" title={n.name}>{truncate(n.name)}</div>
              </div>
              {n.internet_exposed && <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center animate-pulse"><Globe className="w-3 h-3 text-white" /></div>}
              {(n.permission_gaps || 0) > 0 && <div className="absolute -top-2 -left-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold">{n.permission_gaps}</div>}
              {(n.traffic_bytes || 0) > 0 && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-green-500 px-2 py-0.5 rounded-full flex items-center gap-1"><Activity className="w-3 h-3 text-white" /><span className="text-[9px] text-white font-bold">LIVE</span></div>}
            </div>;
          })}
        </div>
      </div>
      <div className="absolute bottom-4 left-4 bg-slate-800/90 rounded-lg p-3 border border-slate-700 text-sm">
        <div className="text-white font-semibold mb-2">Legend</div>
        <div className="flex items-center gap-2 mb-1"><div className="w-6 h-0.5 bg-green-500" /> <span className="text-slate-300">Verified Traffic</span></div>
        <div className="flex items-center gap-2"><div className="w-6 h-0.5 bg-slate-500 border-dashed border-t" /> <span className="text-slate-300">Allowed</span></div>
      </div>
    </div>
  );
}
