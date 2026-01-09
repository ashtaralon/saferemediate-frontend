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
  onNodeClick?: (id: string, type: string, name: string) => void | ((node: any) => void);
  onRefresh?: () => void;
  highlightPath?: { source: string; target: string; port?: string } | string[];
}

// ============================================================================
// AWS COLORS & ICONS
// ============================================================================

const AWS_COLORS: Record<string, { bg: string; border: string; gradient: string }> = {
  EC2: { bg: '#FF9900', border: '#EC7211', gradient: 'linear-gradient(135deg, #FF9900 0%, #EC7211 100%)' },
  Lambda: { bg: '#FF9900', border: '#EC7211', gradient: 'linear-gradient(135deg, #FF9900 0%, #EC7211 100%)' },
  ECS: { bg: '#FF9900', border: '#EC7211', gradient: 'linear-gradient(135deg, #FF9900 0%, #EC7211 100%)' },
  RDS: { bg: '#3B48CC', border: '#2E3AB5', gradient: 'linear-gradient(135deg, #527FFF 0%, #3B48CC 100%)' },
  DynamoDB: { bg: '#3B48CC', border: '#2E3AB5', gradient: 'linear-gradient(135deg, #527FFF 0%, #3B48CC 100%)' },
  Aurora: { bg: '#3B48CC', border: '#2E3AB5', gradient: 'linear-gradient(135deg, #527FFF 0%, #3B48CC 100%)' },
  S3: { bg: '#3F8624', border: '#2D6B19', gradient: 'linear-gradient(135deg, #6AAF35 0%, #3F8624 100%)' },
  SecurityGroup: { bg: '#DD344C', border: '#C42D42', gradient: 'linear-gradient(135deg, #FF5C5C 0%, #DD344C 100%)' },
  IAMRole: { bg: '#7B68EE', border: '#6A5ACD', gradient: 'linear-gradient(135deg, #9683EC 0%, #7B68EE 100%)' },
  IAMPolicy: { bg: '#7B68EE', border: '#6A5ACD', gradient: 'linear-gradient(135deg, #9683EC 0%, #7B68EE 100%)' },
  InternetGateway: { bg: '#067F68', border: '#056654', gradient: 'linear-gradient(135deg, #1A9E85 0%, #067F68 100%)' },
  NATGateway: { bg: '#067F68', border: '#056654', gradient: 'linear-gradient(135deg, #1A9E85 0%, #067F68 100%)' },
  VPC: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)' },
  Subnet: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)' },
  ALB: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)' },
  ELB: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)' },
  Default: { bg: '#5A6B7A', border: '#475666', gradient: 'linear-gradient(135deg, #7A8B9A 0%, #5A6B7A 100%)' }
};

const LANE_ORDER: Record<string, number> = {
  'InternetGateway': 0, 'NATGateway': 0, 'VPC': 0,
  'Subnet': 1, 'SecurityGroup': 1, 'ALB': 1, 'ELB': 1,
  'EC2': 2, 'Lambda': 2, 'ECS': 2,
  'IAMRole': 3, 'IAMPolicy': 3,
  'RDS': 4, 'DynamoDB': 4, 'S3': 4, 'Aurora': 4
};

const AWSIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 48 }) => {
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
const truncate = (s: string, m = 14) => !s ? 'Unknown' : s.length <= m ? s : s.slice(0, m - 2) + '..';

// ============================================================================
// ANIMATED EDGE COMPONENT
// ============================================================================

const AnimatedEdge: React.FC<{
  path: string;
  isActive: boolean;
  trafficBytes?: number;
  isHighlighted?: boolean;
}> = ({ path, isActive, trafficBytes = 0, isHighlighted }) => {
  const speed = trafficBytes > 100000 ? 0.8 : trafficBytes > 10000 ? 1.5 : 2.5;
  
  return (
    <g>
      {/* Glow effect for active edges */}
      {isActive && (
        <path
          d={path}
          fill="none"
          stroke="#10B981"
          strokeWidth={8}
          strokeOpacity={0.2}
          style={{ filter: 'blur(4px)' }}
        />
      )}
      
      {/* Base line */}
      <path
        d={path}
        fill="none"
        stroke={isActive ? '#10B981' : '#64748B'}
        strokeWidth={isActive ? 3 : 1.5}
        strokeDasharray={isActive ? 'none' : '6 4'}
        strokeOpacity={isActive ? 1 : 0.5}
        markerEnd={isActive ? 'url(#arrow-active)' : 'url(#arrow-inactive)'}
      />
      
      {/* Animated flow particles */}
      {isActive && (
        <>
          <circle r="4" fill="#10B981">
            <animateMotion
              dur={`${speed}s`}
              repeatCount="indefinite"
              path={path}
            />
          </circle>
          <circle r="4" fill="#10B981" opacity="0.6">
            <animateMotion
              dur={`${speed}s`}
              repeatCount="indefinite"
              path={path}
              begin={`${speed / 3}s`}
            />
          </circle>
          <circle r="4" fill="#10B981" opacity="0.3">
            <animateMotion
              dur={`${speed}s`}
              repeatCount="indefinite"
              path={path}
              begin={`${speed * 2 / 3}s`}
            />
          </circle>
        </>
      )}
      
      {/* Highlighted path overlay */}
      {isHighlighted && (
        <path
          d={path}
          fill="none"
          stroke="#FBBF24"
          strokeWidth={5}
          strokeOpacity={0.8}
          style={{ 
            animation: 'pulse 1s ease-in-out infinite',
          }}
        />
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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
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
    
    const NODE_WIDTH = 130;
    const NODE_HEIGHT = 90;
    const LANE_GAP = 220;
    const NODE_GAP = 110;
    const PADDING = 60;
    
    sorted.forEach(([_, nodes], i) => {
      nodes.forEach((n, j) => {
        const x = PADDING + i * LANE_GAP;
        const y = PADDING + j * NODE_GAP;
        positions.set(n.id, { x, y });
        maxY = Math.max(maxY, y);
      });
    });
    
    return { 
      positions, 
      width: PADDING * 2 + sorted.length * LANE_GAP, 
      height: maxY + NODE_HEIGHT + PADDING * 2, 
      lanes: sorted,
      NODE_WIDTH,
      NODE_HEIGHT
    };
  }, [filtered]);

  // Auto-fit on load
  useEffect(() => {
    if (!containerRef.current || !layout.width) return;
    const c = containerRef.current;
    const z = Math.max(0.3, Math.min(c.clientWidth / layout.width, c.clientHeight / layout.height, 1) * 0.85);
    setZoom(z);
    setPan({ x: (c.clientWidth - layout.width * z) / 2, y: 20 });
  }, [layout, isFullscreen]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Keyboard shortcut for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
      if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, toggleFullscreen]);

  // Count active traffic edges
  const trafficStats = useMemo(() => {
    const activeEdges = filtered.edges.filter(e => e.is_used || (e.traffic_bytes || 0) > 0);
    return {
      total: filtered.edges.length,
      active: activeEdges.length,
      totalBytes: activeEdges.reduce((sum, e) => sum + (e.traffic_bytes || 0), 0)
    };
  }, [filtered.edges]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900">
        <RefreshCw className="w-12 h-12 text-blue-400 animate-spin" />
      </div>
    );
  }

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-slate-900"
    : "w-full h-full flex flex-col bg-slate-900 rounded-xl overflow-hidden";

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white font-semibold">AWS Architecture</span>
          </div>
          <span className="text-slate-400 text-sm">
            Nodes: {filtered.nodes.length} | Edges: {filtered.edges.length}
          </span>
          {trafficStats.active > 0 && (
            <span className="text-green-400 text-sm flex items-center gap-1">
              <Activity className="w-3 h-3" />
              {trafficStats.active} active flows
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-9 pr-4 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Refresh */}
          {onRefresh && (
            <button onClick={onRefresh} className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
          )}
          
          {/* Core Toggle */}
          <button
            onClick={() => setCoreOnly(!coreOnly)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${coreOnly ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}
          >
            Core
          </button>
          
          {/* Traffic Flow Toggle */}
          <button
            onClick={() => setShowTrafficFlow(!showTrafficFlow)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${showTrafficFlow ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            title="Toggle Traffic Animation"
          >
            <Activity className="w-4 h-4" />
            Flow
          </button>
          
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1">
            <button onClick={() => setZoom(z => Math.max(0.2, z / 1.2))} className="p-1 hover:bg-slate-600 rounded" title="Zoom Out">
              <ZoomOut className="w-4 h-4 text-white" />
            </button>
            <span className="text-white text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="p-1 hover:bg-slate-600 rounded" title="Zoom In">
              <ZoomIn className="w-4 h-4 text-white" />
            </button>
          </div>
          
          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
            title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen (Cmd+F)"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-white" />
            ) : (
              <Maximize2 className="w-4 h-4 text-white" />
            )}
          </button>
          
          {/* Close button in fullscreen */}
          {isFullscreen && (
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-2 bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Graph Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onMouseDown={e => { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }}
        onMouseMove={e => { if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        onWheel={e => setZoom(z => Math.max(0.2, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))))}
      >
        {/* SVG Layer for Edges */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
        >
          <defs>
            {/* Arrow markers */}
            <marker id="arrow-active" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0,10 3.5,0 7" fill="#10B981" />
            </marker>
            <marker id="arrow-inactive" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0,10 3.5,0 7" fill="#64748B" />
            </marker>
            <marker id="arrow-highlight" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0,10 3.5,0 7" fill="#FBBF24" />
            </marker>
          </defs>
          
          {/* Render Edges */}
          {filtered.edges.map(e => {
            const s = layout.positions.get(e.source);
            const t = layout.positions.get(e.target);
            if (!s || !t) return null;
            
            const isActive = showTrafficFlow && (e.is_used || (e.traffic_bytes || 0) > 0);
            const isHighlighted = Array.isArray(highlightPath) 
              ? highlightPath.includes(e.source) && highlightPath.includes(e.target)
              : highlightPath?.source === e.source && highlightPath?.target === e.target;
            
            // Calculate curved path
            const startX = s.x + layout.NODE_WIDTH;
            const startY = s.y + layout.NODE_HEIGHT / 2;
            const endX = t.x;
            const endY = t.y + layout.NODE_HEIGHT / 2;
            const midX = (startX + endX) / 2;
            
            const path = `M${startX} ${startY} C${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
            
            return (
              <AnimatedEdge
                key={e.id}
                path={path}
                isActive={isActive}
                trafficBytes={e.traffic_bytes}
                isHighlighted={isHighlighted}
              />
            );
          })}
        </svg>

        {/* Nodes Layer */}
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
        >
          {/* Lane Headers */}
          {layout.lanes.map(([lane, nodes]) => {
            const p = layout.positions.get(nodes[0]?.id);
            if (!p) return null;
            return (
              <div
                key={`lane-${lane}`}
                className="absolute text-slate-500 text-xs font-medium uppercase tracking-wider"
                style={{ left: p.x, top: 15, width: layout.NODE_WIDTH, textAlign: 'center' }}
              >
                {nodes[0]?.type} ({nodes.length})
              </div>
            );
          })}
          
          {/* Nodes */}
          {filtered.nodes.map(n => {
            const p = layout.positions.get(n.id);
            if (!p) return null;
            const c = getColors(n.type);
            const isHighlighted = Array.isArray(highlightPath)
              ? highlightPath.includes(n.id)
              : highlightPath?.source === n.id || highlightPath?.target === n.id;
            const hasTraffic = (n.traffic_bytes || 0) > 0;
            
            return (
              <div
                key={n.id}
                className={`absolute cursor-pointer transition-all duration-200 hover:scale-105 ${isHighlighted ? 'scale-110 z-10' : ''}`}
                style={{ left: p.x, top: p.y, width: layout.NODE_WIDTH, height: layout.NODE_HEIGHT }}
                onClick={() => { 
                  setSelected(n); 
                  if (onNodeClick) {
                    // Support both old (id, type, name) and new (node) signatures
                    if (onNodeClick.length === 3) {
                      (onNodeClick as any)(n.id, n.type, n.name);
                    } else {
                      (onNodeClick as any)(n);
                    }
                  }
                }}
              >
                <div
                  className={`w-full h-full rounded-xl border-2 flex flex-col items-center justify-center shadow-lg
                    ${selected?.id === n.id ? 'ring-4 ring-white/50' : ''}
                    ${isHighlighted ? 'ring-4 ring-yellow-400/70' : ''}`}
                  style={{
                    background: c.gradient,
                    borderColor: c.border,
                    boxShadow: isHighlighted ? '0 0 20px rgba(251, 191, 36, 0.5)' : '0 4px 16px rgba(0,0,0,0.2)'
                  }}
                >
                  <AWSIcon type={n.type} size={36} />
                  <div className="text-[9px] text-white/70 uppercase mt-1">{n.type}</div>
                  <div className="text-[11px] text-white font-medium truncate w-full text-center px-2" title={n.name}>
                    {truncate(n.name)}
                  </div>
                </div>
                
                {/* Internet Exposed Badge */}
                {n.internet_exposed && (
                  <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center animate-pulse" title="Internet Exposed">
                    <Globe className="w-3 h-3 text-white" />
                  </div>
                )}
                
                {/* Permission Gaps Badge */}
                {(n.permission_gaps || 0) > 0 && (
                  <div className="absolute -top-2 -left-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold" title={`${n.permission_gaps} gaps`}>
                    {n.permission_gaps}
                  </div>
                )}
                
                {/* Live Traffic Badge */}
                {hasTraffic && showTrafficFlow && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-green-500 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg">
                    <Activity className="w-3 h-3 text-white animate-pulse" />
                    <span className="text-[8px] text-white font-bold">LIVE</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-800/95 backdrop-blur rounded-lg p-3 border border-slate-700 text-sm shadow-xl">
        <div className="text-white font-semibold mb-2">Legend</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-green-500 relative">
              <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-green-500 rounded-full animate-ping" />
            </div>
            <span className="text-slate-300 text-xs">Active Traffic</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-slate-500 border-dashed border-t" />
            <span className="text-slate-300 text-xs">Allowed Path</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
              <Globe className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-slate-300 text-xs">Internet Exposed</span>
          </div>
        </div>
      </div>

      {/* Traffic Stats Panel */}
      {trafficStats.active > 0 && (
        <div className="absolute bottom-4 right-4 bg-slate-800/95 backdrop-blur rounded-lg p-3 border border-slate-700 text-sm shadow-xl">
          <div className="text-white font-semibold mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-400" />
            Traffic Stats
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Active Flows:</span>
              <span className="text-green-400 font-medium">{trafficStats.active}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Total Connections:</span>
              <span className="text-slate-300">{trafficStats.total}</span>
            </div>
            {trafficStats.totalBytes > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Data Transferred:</span>
                <span className="text-blue-400 font-medium">
                  {trafficStats.totalBytes > 1000000
                    ? `${(trafficStats.totalBytes / 1000000).toFixed(1)} MB`
                    : `${(trafficStats.totalBytes / 1000).toFixed(1)} KB`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected Node Panel */}
      {selected && (
        <div className="absolute top-20 right-4 w-72 bg-slate-800/95 backdrop-blur rounded-lg border border-slate-700 shadow-xl">
          <div className="flex items-center justify-between p-3 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <AWSIcon type={selected.type} size={20} />
              <span className="text-white font-semibold text-sm">{selected.type}</span>
            </div>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3 space-y-2 text-sm">
            <div>
              <div className="text-slate-400 text-xs">Name</div>
              <div className="text-white break-all">{selected.name}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">ID</div>
              <div className="text-slate-300 text-xs font-mono break-all">{selected.id}</div>
            </div>
            {selected.lp_score !== undefined && (
              <div>
                <div className="text-slate-400 text-xs mb-1">Least Privilege Score</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${selected.lp_score}%`,
                        backgroundColor: selected.lp_score >= 80 ? '#10B981' : selected.lp_score >= 50 ? '#F59E0B' : '#EF4444'
                      }}
                    />
                  </div>
                  <span className="text-white font-bold text-xs">{selected.lp_score}%</span>
                </div>
              </div>
            )}
            {selected.internet_exposed && (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <Globe className="w-4 h-4" />
                <span>Internet Exposed</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
