'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  RefreshCw, ZoomIn, ZoomOut, Search, Shield, Server, Database, Globe, 
  Key, HardDrive, Lock, Layers, Activity, Maximize2, Minimize2, X
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface GraphNode {
  id: string;
  type: string;
  name: string;
  lp_score?: number;
  internet_exposed?: boolean;
  permission_gaps?: number;
  traffic_bytes?: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  is_used?: boolean;
  traffic_bytes?: number;
}

interface GraphViewX6Props {
  systemName?: string;
  graphData?: { nodes: any[]; edges: any[] };
  isLoading?: boolean;
  onNodeClick?: (node: any) => void;
  onRefresh?: () => void;
  highlightPath?: string[];
}

// ============================================================================
// AWS COLORS & ICONS - WITH EMPHASIZED LABELS
// ============================================================================

const AWS_COLORS: Record<string, { bg: string; border: string; gradient: string; label: string }> = {
  EC2: { bg: '#FF9900', border: '#EC7211', gradient: 'linear-gradient(135deg, #FF9900 0%, #EC7211 100%)', label: 'EC2' },
  Lambda: { bg: '#FF9900', border: '#EC7211', gradient: 'linear-gradient(135deg, #FF9900 0%, #EC7211 100%)', label: 'LAMBDA' },
  ECS: { bg: '#FF9900', border: '#EC7211', gradient: 'linear-gradient(135deg, #FF9900 0%, #EC7211 100%)', label: 'ECS' },
  RDS: { bg: '#3B48CC', border: '#2E3AB5', gradient: 'linear-gradient(135deg, #527FFF 0%, #3B48CC 100%)', label: 'RDS' },
  DynamoDB: { bg: '#3B48CC', border: '#2E3AB5', gradient: 'linear-gradient(135deg, #527FFF 0%, #3B48CC 100%)', label: 'DYNAMODB' },
  Aurora: { bg: '#3B48CC', border: '#2E3AB5', gradient: 'linear-gradient(135deg, #527FFF 0%, #3B48CC 100%)', label: 'AURORA' },
  S3: { bg: '#3F8624', border: '#2D6B19', gradient: 'linear-gradient(135deg, #6AAF35 0%, #3F8624 100%)', label: 'S3' },
  SecurityGroup: { bg: '#DD344C', border: '#C42D42', gradient: 'linear-gradient(135deg, #FF5C5C 0%, #DD344C 100%)', label: 'SG' },
  IAMRole: { bg: '#7B68EE', border: '#6A5ACD', gradient: 'linear-gradient(135deg, #9683EC 0%, #7B68EE 100%)', label: 'IAM' },
  IAMPolicy: { bg: '#7B68EE', border: '#6A5ACD', gradient: 'linear-gradient(135deg, #9683EC 0%, #7B68EE 100%)', label: 'POLICY' },
  InternetGateway: { bg: '#067F68', border: '#056654', gradient: 'linear-gradient(135deg, #1A9E85 0%, #067F68 100%)', label: 'IGW' },
  NATGateway: { bg: '#067F68', border: '#056654', gradient: 'linear-gradient(135deg, #1A9E85 0%, #067F68 100%)', label: 'NAT' },
  VPC: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)', label: 'VPC' },
  Subnet: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)', label: 'SUBNET' },
  ALB: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)', label: 'ALB' },
  ELB: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)', label: 'ELB' },
  Default: { bg: '#5A6B7A', border: '#475666', gradient: 'linear-gradient(135deg, #7A8B9A 0%, #5A6B7A 100%)', label: '?' }
};

const LANE_ORDER: Record<string, number> = {
  'InternetGateway': 0, 'NATGateway': 0, 'VPC': 0,
  'Subnet': 1, 'SecurityGroup': 1, 'ALB': 1, 'ELB': 1,
  'EC2': 2, 'Lambda': 2, 'ECS': 2,
  'IAMRole': 3, 'IAMPolicy': 3,
  'RDS': 4, 'DynamoDB': 4, 'S3': 4, 'Aurora': 4
};

const AWSIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 32 }) => {
  const p = { width: size, height: size, strokeWidth: 1.5, className: "text-white drop-shadow-md" };
  switch (type) {
    case 'EC2': case 'ECS': return <Server {...p} />;
    case 'RDS': case 'DynamoDB': case 'Aurora': return <Database {...p} />;
    case 'S3': return <HardDrive {...p} />;
    case 'Lambda': return <Layers {...p} />;
    case 'SecurityGroup': return <Shield {...p} />;
    case 'IAMRole': case 'IAMPolicy': return <Key {...p} />;
    case 'InternetGateway': case 'NATGateway': return <Globe {...p} />;
    case 'VPC': case 'Subnet': case 'ALB': case 'ELB': return <Layers {...p} />;
    default: return <Lock {...p} />;
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getColors = (t: string) => AWS_COLORS[t] || AWS_COLORS.Default;
const getLane = (t: string) => LANE_ORDER[t] ?? 3;
const truncate = (s: string, m = 12) => !s ? 'Unknown' : s.length <= m ? s : s.slice(0, m - 2) + '..';

// ============================================================================
// ANIMATED EDGE COMPONENT
// ============================================================================

const AnimatedEdge: React.FC<{
  path: string;
  isActive: boolean;
  trafficBytes?: number;
}> = ({ path, isActive, trafficBytes = 0 }) => {
  const speed = trafficBytes > 100000 ? 0.8 : trafficBytes > 10000 ? 1.5 : 2.5;
  
  return (
    <g>
      {isActive && (
        <path d={path} fill="none" stroke="#10B981" strokeWidth={6} strokeOpacity={0.15} />
      )}
      
      <path
        d={path}
        fill="none"
        stroke={isActive ? '#10B981' : '#64748B'}
        strokeWidth={isActive ? 2.5 : 1}
        strokeDasharray={isActive ? 'none' : '4 3'}
        strokeOpacity={isActive ? 1 : 0.4}
        markerEnd={isActive ? 'url(#arrow-active)' : 'url(#arrow-inactive)'}
      />
      
      {isActive && (
        <>
          <circle r="3" fill="#10B981">
            <animateMotion dur={`${speed}s`} repeatCount="indefinite" path={path} />
          </circle>
          <circle r="3" fill="#10B981" opacity="0.5">
            <animateMotion dur={`${speed}s`} repeatCount="indefinite" path={path} begin={`${speed / 2}s`} />
          </circle>
        </>
      )}
    </g>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function GraphViewX6({
  systemName,
  graphData,
  isLoading,
  onNodeClick,
  onRefresh,
  highlightPath = []
}: GraphViewX6Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(0.55);
  const [pan, setPan] = useState({ x: 40, y: 20 });
  const [search, setSearch] = useState('');
  const [coreOnly, setCoreOnly] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTrafficFlow, setShowTrafficFlow] = useState(true);

  // Process graph data from props
  useEffect(() => {
    if (graphData?.nodes && graphData?.edges) {
      const nodes = graphData.nodes.map((n: any) => ({
        id: n.id,
        type: n.type || n.category || 'Unknown',
        name: n.name || n.id,
        lp_score: n.lp_score,
        internet_exposed: n.internet_exposed || n.is_internet_exposed,
        permission_gaps: n.permission_gaps,
        traffic_bytes: n.traffic_bytes
      }));
      const edges = graphData.edges.map((e: any) => ({
        id: e.id || `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        type: e.type,
        is_used: e.is_used || e.type === 'ACTUAL_TRAFFIC',
        traffic_bytes: e.traffic_bytes
      }));
      setData({ nodes, edges });
    }
  }, [graphData]);

  // Filter data
  const filtered = useMemo(() => {
    let nodes = data.nodes;
    if (coreOnly) nodes = nodes.filter(n => !['IAMPolicy', 'Subnet'].includes(n.type));
    if (search) {
      const t = search.toLowerCase();
      nodes = nodes.filter(n => n.name?.toLowerCase().includes(t) || n.type?.toLowerCase().includes(t));
    }
    const ids = new Set(nodes.map(n => n.id));
    return { nodes, edges: data.edges.filter(e => ids.has(e.source) && ids.has(e.target)) };
  }, [data, coreOnly, search]);

  // Calculate layout
  const layout = useMemo(() => {
    const lanes = new Map<number, GraphNode[]>();
    filtered.nodes.forEach(n => {
      const l = getLane(n.type);
      if (!lanes.has(l)) lanes.set(l, []);
      lanes.get(l)!.push(n);
    });
    
    const positions = new Map<string, { x: number; y: number }>();
    const sorted = Array.from(lanes.entries()).sort((a, b) => a[0] - b[0]);
    let maxY = 0;
    
    const NODE_WIDTH = 110;
    const NODE_HEIGHT = 75;
    const LANE_GAP = 180;
    const NODE_GAP = 90;
    const PADDING = 40;
    
    sorted.forEach(([_, nodes], i) => {
      nodes.forEach((n, j) => {
        const x = PADDING + i * LANE_GAP;
        const y = PADDING + 30 + j * NODE_GAP;
        positions.set(n.id, { x, y });
        maxY = Math.max(maxY, y);
      });
    });
    
    return { positions, width: PADDING * 2 + sorted.length * LANE_GAP, height: maxY + NODE_HEIGHT + PADDING * 2, lanes: sorted, NODE_WIDTH, NODE_HEIGHT };
  }, [filtered]);

  // Count active traffic edges
  const trafficStats = useMemo(() => {
    const activeEdges = filtered.edges.filter(e => e.is_used || (e.traffic_bytes || 0) > 0);
    return { total: filtered.edges.length, active: activeEdges.length };
  }, [filtered.edges]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => setIsFullscreen(!isFullscreen), [isFullscreen]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  if (isLoading) {
    return (
      <div className="w-full h-[550px] flex items-center justify-center bg-slate-900 rounded-xl">
        <RefreshCw className="w-10 h-10 text-blue-400 animate-spin" />
      </div>
    );
  }

  // FIXED: Explicit height for both modes
  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-slate-900 flex flex-col"
    : "w-full bg-slate-900 rounded-xl overflow-hidden flex flex-col";
  
  const containerStyle = isFullscreen ? {} : { height: '550px' };

  return (
    <div className={containerClass} style={containerStyle}>
      {/* Header - Fixed height */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/90 border-b border-slate-700" style={{ height: '44px', flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white font-semibold text-sm">AWS Architecture</span>
          </div>
          <span className="text-slate-400 text-xs">
            Nodes: {filtered.nodes.length} | Edges: {filtered.edges.length}
          </span>
          {trafficStats.active > 0 && (
            <span className="text-green-400 text-xs flex items-center gap-1">
              <Activity className="w-3 h-3" />
              {trafficStats.active} active
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-7 pr-3 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          
          {onRefresh && (
            <button onClick={onRefresh} className="p-1.5 bg-blue-600 rounded hover:bg-blue-700" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5 text-white" />
            </button>
          )}
          
          <button onClick={() => setCoreOnly(!coreOnly)} className={`px-2 py-1 rounded text-xs font-medium ${coreOnly ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
            Core
          </button>
          
          <button onClick={() => setShowTrafficFlow(!showTrafficFlow)} className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${showTrafficFlow ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
            <Activity className="w-3 h-3" /> Flow
          </button>
          
          <div className="flex items-center gap-0.5 bg-slate-700 rounded p-0.5">
            <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-1 hover:bg-slate-600 rounded">
              <ZoomOut className="w-3.5 h-3.5 text-white" />
            </button>
            <span className="text-white text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1 hover:bg-slate-600 rounded">
              <ZoomIn className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
          
          <button onClick={toggleFullscreen} className="p-1.5 bg-slate-700 rounded hover:bg-slate-600" title="Fullscreen">
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-white" /> : <Maximize2 className="w-3.5 h-3.5 text-white" />}
          </button>
          
          {isFullscreen && (
            <button onClick={() => setIsFullscreen(false)} className="p-1.5 bg-red-600 rounded hover:bg-red-700">
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Graph Container - EXPLICIT REMAINING HEIGHT */}
      <div
        ref={containerRef}
        className="relative bg-slate-900"
        style={{ 
          cursor: dragging ? 'grabbing' : 'grab', 
          flex: 1,
          height: isFullscreen ? 'calc(100vh - 44px)' : '506px',
          overflow: 'hidden'
        }}
        onMouseDown={e => { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }}
        onMouseMove={e => { if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        onWheel={e => setZoom(z => Math.max(0.2, Math.min(2, z + (e.deltaY > 0 ? -0.05 : 0.05))))}
      >
        {/* SVG Layer */}
        <svg className="absolute inset-0 w-full h-full" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          <defs>
            <marker id="arrow-active" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill="#10B981" />
            </marker>
            <marker id="arrow-inactive" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill="#64748B" />
            </marker>
          </defs>
          
          {filtered.edges.map(e => {
            const s = layout.positions.get(e.source);
            const t = layout.positions.get(e.target);
            if (!s || !t) return null;
            
            const isActive = showTrafficFlow && (e.is_used || (e.traffic_bytes || 0) > 0);
            const startX = s.x + layout.NODE_WIDTH;
            const startY = s.y + layout.NODE_HEIGHT / 2;
            const endX = t.x;
            const endY = t.y + layout.NODE_HEIGHT / 2;
            const midX = (startX + endX) / 2;
            const path = `M${startX} ${startY} C${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
            
            return <AnimatedEdge key={e.id} path={path} isActive={isActive} trafficBytes={e.traffic_bytes} />;
          })}
        </svg>

        {/* Nodes Layer */}
        <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {/* Lane Headers */}
          {layout.lanes.map(([lane, nodes]) => {
            const p = layout.positions.get(nodes[0]?.id);
            if (!p) return null;
            return (
              <div key={`lane-${lane}`} className="absolute text-slate-400 text-[10px] font-bold uppercase tracking-wider"
                style={{ left: p.x, top: 8, width: layout.NODE_WIDTH, textAlign: 'center' }}>
                {nodes[0]?.type} ({nodes.length})
              </div>
            );
          })}
          
          {/* Nodes */}
          {filtered.nodes.map(n => {
            const p = layout.positions.get(n.id);
            if (!p) return null;
            const c = getColors(n.type);
            const hasTraffic = (n.traffic_bytes || 0) > 0;
            
            return (
              <div key={n.id} className="absolute cursor-pointer transition-transform duration-150 hover:scale-105 hover:z-10"
                style={{ left: p.x, top: p.y, width: layout.NODE_WIDTH, height: layout.NODE_HEIGHT }}
                onClick={() => { setSelected(n); onNodeClick?.(n); }}>
                <div className={`w-full h-full rounded-lg border-2 flex flex-col items-center justify-center shadow-lg ${selected?.id === n.id ? 'ring-2 ring-white/60 scale-105' : ''}`}
                  style={{ background: c.gradient, borderColor: c.border }}>
                  
                  {/* TYPE LABEL - EMPHASIZED ON TOP */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/70 rounded text-[12px] font-bold text-white tracking-wider border border-white/20">
                    {c.label}
                  </div>
                  
                  <AWSIcon type={n.type} size={28} />
                  <div className="text-[11px] text-white font-semibold truncate w-full text-center px-1 mt-1" title={n.name}>
                    {truncate(n.name)}
                  </div>
                </div>
                
                {n.internet_exposed && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                    <Globe className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                
                {(n.permission_gaps || 0) > 0 && (
                  <div className="absolute -top-1 -left-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                    {n.permission_gaps}
                  </div>
                )}
                
                {hasTraffic && showTrafficFlow && (
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-green-500 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <Activity className="w-2.5 h-2.5 text-white animate-pulse" />
                    <span className="text-[7px] text-white font-bold">LIVE</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-slate-800/90 backdrop-blur rounded-lg p-2 border border-slate-700 text-xs z-10">
        <div className="text-white font-semibold mb-1.5 text-[10px]">Legend</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-5 h-0.5 bg-green-500 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-green-500 rounded-full" />
            </div>
            <span className="text-slate-300 text-[10px]">Active Traffic</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-px bg-slate-500 border-dashed border-t border-slate-500" />
            <span className="text-slate-300 text-[10px]">Allowed</span>
          </div>
        </div>
      </div>

      {/* Traffic Stats */}
      {trafficStats.active > 0 && (
        <div className="absolute bottom-3 right-3 bg-slate-800/90 backdrop-blur rounded-lg p-2 border border-slate-700 z-10">
          <div className="text-white font-semibold text-[10px] flex items-center gap-1 mb-1">
            <Activity className="w-3 h-3 text-green-400" /> Traffic
          </div>
          <div className="text-[10px] text-slate-300">
            <span className="text-green-400 font-medium">{trafficStats.active}</span> / {trafficStats.total} flows
          </div>
        </div>
      )}

      {/* Selected Node Panel */}
      {selected && (
        <div className="absolute top-14 right-3 w-56 bg-slate-800/95 backdrop-blur rounded-lg border border-slate-700 shadow-xl z-20">
          <div className="flex items-center justify-between p-2 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <AWSIcon type={selected.type} size={16} />
              <span className="text-white font-semibold text-xs">{getColors(selected.type).label}</span>
            </div>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-2 space-y-1.5 text-xs">
            <div>
              <div className="text-slate-400 text-[10px]">Name</div>
              <div className="text-white break-all text-[11px]">{selected.name}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">ID</div>
              <div className="text-slate-300 text-[9px] font-mono break-all">{selected.id}</div>
            </div>
            {selected.internet_exposed && (
              <div className="flex items-center gap-1.5 text-red-400 text-[10px]">
                <Globe className="w-3 h-3" /> Internet Exposed
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
