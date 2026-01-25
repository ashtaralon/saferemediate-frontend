import React, { useState, useEffect, useCallback, useRef } from 'react';

// AWS Icons as simple colored boxes with labels
const AWSIcon = ({ type, size = 36 }: { type: string; size?: number }) => {
  const colors: Record<string, string> = {
    EC2: '#ED7100', EC2Instance: '#ED7100', Lambda: '#ED7100', LambdaFunction: '#ED7100',
    RDSInstance: '#3B48CC', DynamoDB: '#3B48CC', DynamoDBTable: '#3B48CC',
    S3Bucket: '#1B660F', S3: '#1B660F',
    IAMRole: '#DD344C', IAMPolicy: '#DD344C', SecurityGroup: '#DD344C', KMSKey: '#DD344C',
    VPC: '#8C4FFF', Subnet: '#8C4FFF', InternetGateway: '#8C4FFF', RouteTable: '#8C4FFF',
    APIGateway: '#E7157B', ApiGateway: '#E7157B', SQSQueue: '#E7157B', EventBus: '#E7157B',
  };
  const icons: Record<string, string> = {
    EC2: '🖥️', EC2Instance: '🖥️', Lambda: 'λ', LambdaFunction: 'λ',
    RDSInstance: '🗄️', DynamoDB: '📊', DynamoDBTable: '📊',
    S3Bucket: '🪣', S3: '🪣',
    IAMRole: '👤', IAMPolicy: '📋', SecurityGroup: '🛡️', KMSKey: '🔑',
    VPC: '🌐', Subnet: '📦', InternetGateway: '🌍', RouteTable: '🗺️',
    APIGateway: '🔌', ApiGateway: '🔌', SQSQueue: '📬', EventBus: '📡',
  };
  const color = colors[type] || '#545B64';
  const icon = icons[type] || '☁️';
  return (
    <div style={{ width: size, height: size, backgroundColor: color, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5 }}>
      {icon}
    </div>
  );
};

// Connection style based on type
const getConnectionStyle = (type: string) => {
  const styles: Record<string, { color: string; animated: boolean; speed?: number }> = {
    ACTUAL_TRAFFIC: { color: '#10B981', animated: true, speed: 1.5 },
    OBSERVED_TRAFFIC: { color: '#10B981', animated: true, speed: 1.2 },
    ALLOWS_TRAFFIC_TO: { color: '#3B82F6', animated: true, speed: 1 },
    API_CALL: { color: '#EC4899', animated: true, speed: 2 },
    ACTUAL_API_CALL: { color: '#EC4899', animated: true, speed: 2.5 },
    RUNTIME_CALLS: { color: '#F59E0B', animated: true, speed: 2 },
    ACTUAL_S3_ACCESS: { color: '#1B660F', animated: true, speed: 1.5 },
    ASSUMES_ROLE: { color: '#DD344C', animated: true, speed: 0.5 },
    CAN_ACCESS: { color: '#DD344C', animated: true, speed: 0.8 },
    HAS_PERMISSION: { color: '#DD344C', animated: false },
    IN_VPC: { color: '#8C4FFF', animated: false },
    IN_SUBNET: { color: '#8C4FFF', animated: false },
    BELONGS_TO: { color: '#6B7280', animated: false },
    CONTAINS: { color: '#6B7280', animated: false },
  };
  return styles[type] || { color: '#94A3B8', animated: false };
};

interface EdgeData {
  id: string;
  source: string;
  target: string;
  type: string;
  props: Record<string, any>;
}

interface NodeData {
  id: string;
  label: string;
  name: string;
  fullName: string;
  props: Record<string, any>;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// Animated Edge Component
const AnimatedEdge = ({ edge, src, tgt, selected, time, onClick }: {
  edge: EdgeData; src: NodeData; tgt: NodeData; selected: boolean; time: number; onClick: () => void;
}) => {
  const style = getConnectionStyle(edge.type);
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return null;
  const off = 40;
  const x1 = src.x + (dx / dist) * off;
  const y1 = src.y + (dy / dist) * off;
  const x2 = tgt.x - (dx / dist) * off;
  const y2 = tgt.y - (dy / dist) * off;
  const particles: Array<{ x: number; y: number; o: number }> = [];
  if (style.animated && style.speed) {
    for (let i = 0; i < 3; i++) {
      const p = ((time * style.speed * 0.001) + i / 3) % 1;
      particles.push({ x: x1 + (x2 - x1) * p, y: y1 + (y2 - y1) * p, o: 0.4 + p * 0.6 });
    }
  }
  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={style.color} strokeWidth={selected ? 3 : 1.5} strokeOpacity={selected ? 0.9 : 0.4} />
      {style.animated && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={style.color} strokeWidth={4} strokeOpacity={0.15} />}
      {particles.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill={style.color} opacity={p.o} />)}
      <polygon points="0,-4 8,0 0,4" fill={style.color} transform={`translate(${x2},${y2}) rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI})`} />
    </g>
  );
};

interface AWSArchitectureDiagramProps {
  systemName?: string;
  onNodeClick?: (node: { id: string; type: string; name: string }) => void;
  onRefresh?: () => void;
}

export default function AWSArchitectureDiagram({ systemName = 'alon-prod', onNodeClick: externalOnNodeClick, onRefresh: externalOnRefresh }: AWSArchitectureDiagramProps) {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState('all');
  const [animTime, setAnimTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const animRef = useRef<number>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => console.error('Fullscreen error:', err));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(err => console.error('Exit fullscreen error:', err));
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // F11 keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleFullscreen]);

  // Animation loop
  useEffect(() => {
    if (!playing) return;
    const tick = (t: number) => { setAnimTime(t * speed); animRef.current = requestAnimationFrame(tick); };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, speed]);

  // Load data from the working dependency-map endpoint
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/dependency-map/full?systemName=${encodeURIComponent(systemName)}&max_nodes=400`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const rawNodes = data.nodes || [];
      const rawEdges = data.edges || [];
      setStats({ nodes: rawNodes.length, edges: rawEdges.length });

      // Filter nodes based on view mode
      let filteredNodes = rawNodes;
      let filteredEdgeTypes: string[] = [];

      if (viewMode === 'traffic') {
        const trafficTypes = ['EC2Instance', 'Lambda', 'LambdaFunction', 'APIGateway', 'ApiGateway', 'RDSInstance', 'S3Bucket', 'DynamoDBTable'];
        filteredNodes = rawNodes.filter((n: any) => trafficTypes.includes(n.type));
        filteredEdgeTypes = ['ACTUAL_TRAFFIC', 'OBSERVED_TRAFFIC', 'API_CALL', 'ACTUAL_API_CALL', 'RUNTIME_CALLS', 'ACTUAL_S3_ACCESS', 'ALLOWS_TRAFFIC_TO'];
      } else if (viewMode === 'security') {
        const secTypes = ['IAMRole', 'IAMPolicy', 'SecurityGroup', 'Principal', 'KMSKey'];
        filteredNodes = rawNodes.filter((n: any) => secTypes.includes(n.type));
        filteredEdgeTypes = ['ASSUMES_ROLE', 'CAN_ASSUME', 'HAS_POLICY', 'CAN_ACCESS', 'HAS_PERMISSION'];
      } else if (viewMode === 'network') {
        const netTypes = ['VPC', 'Subnet', 'InternetGateway', 'RouteTable', 'SecurityGroup'];
        filteredNodes = rawNodes.filter((n: any) => netTypes.includes(n.type));
        filteredEdgeTypes = ['IN_VPC', 'IN_SUBNET', 'CONTAINS'];
      }

      // Process nodes with force-directed layout
      const cols = Math.ceil(Math.sqrt(filteredNodes.length));
      const spacing = 160;
      const procNodes: NodeData[] = filteredNodes.slice(0, 300).map((n: any, i: number) => ({
        id: n.id,
        label: n.type || 'Unknown',
        name: (n.name || n.id || '').slice(0, 25),
        fullName: n.name || n.id || '',
        props: n,
        x: 200 + (i % cols) * spacing,
        y: 200 + Math.floor(i / cols) * spacing,
        vx: 0, vy: 0
      }));

      const nodeIds = new Set(procNodes.map(n => n.id));
      let procEdges: EdgeData[] = rawEdges
        .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .filter((e: any) => viewMode === 'all' || filteredEdgeTypes.length === 0 || filteredEdgeTypes.includes(e.type))
        .slice(0, 1500)
        .map((e: any, i: number) => ({
          id: e.id || `edge-${i}`,
          source: e.source,
          target: e.target,
          type: e.type || 'UNKNOWN',
          props: e
        }));

      // Force layout simulation
      const nodeMap = new Map(procNodes.map(n => [n.id, n]));
      for (let iter = 0; iter < 80; iter++) {
        const t = 1 - iter / 80;
        // Repulsion
        procNodes.forEach(n1 => {
          procNodes.forEach(n2 => {
            if (n1.id === n2.id) return;
            const dx = n1.x - n2.x, dy = n1.y - n2.y;
            const d = Math.max(Math.sqrt(dx*dx + dy*dy), 1);
            const f = 8000 / (d * d);
            n1.vx += (dx/d) * f * t; n1.vy += (dy/d) * f * t;
          });
        });
        // Attraction
        procEdges.forEach(e => {
          const s = nodeMap.get(e.source), g = nodeMap.get(e.target);
          if (!s || !g) return;
          const dx = g.x - s.x, dy = g.y - s.y;
          const f = Math.sqrt(dx*dx + dy*dy) * 0.004 * t;
          s.vx += dx * f; s.vy += dy * f; g.vx -= dx * f; g.vy -= dy * f;
        });
        // Update positions
        procNodes.forEach(n => {
          n.x += n.vx * 0.1; n.y += n.vy * 0.1;
          n.vx *= 0.85; n.vy *= 0.85;
          n.x = Math.max(100, Math.min(4000, n.x));
          n.y = Math.max(100, Math.min(3000, n.y));
        });
      }

      setNodes(procNodes);
      setEdges(procEdges);
      setLoading(false);
    } catch (err: any) {
      console.error('[AWSArchitectureDiagram] Error:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [systemName, viewMode]);

  useEffect(() => { load(); }, [load]);

  // Mouse handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.interactive')) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const onMouseMove = (e: React.MouseEvent) => { if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const onMouseUp = () => setDragging(false);
  const onWheel = (e: React.WheelEvent) => { e.preventDefault(); setZoom(z => Math.max(0.1, Math.min(2, z * (e.deltaY > 0 ? 0.9 : 1.1)))); };

  const animCount = edges.filter(e => getConnectionStyle(e.type).animated).length;
  const nodeColors: Record<string, string> = {
    EC2: '#ED7100', EC2Instance: '#ED7100', Lambda: '#ED7100', LambdaFunction: '#ED7100',
    RDSInstance: '#3B48CC', DynamoDBTable: '#3B48CC', S3Bucket: '#1B660F',
    IAMRole: '#DD344C', IAMPolicy: '#DD344C', SecurityGroup: '#DD344C', KMSKey: '#DD344C',
    VPC: '#8C4FFF', Subnet: '#8C4FFF', InternetGateway: '#8C4FFF',
    APIGateway: '#E7157B', ApiGateway: '#E7157B', SQSQueue: '#E7157B',
  };

  if (loading) {
    return (
      <div style={{ minHeight: '600px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ width: 60, height: 60, border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
          <h2 style={{ margin: 0 }}>Loading Infrastructure Map</h2>
          <p style={{ color: '#94a3b8', marginTop: 8 }}>Fetching data for {systemName}...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '600px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 12 }}>
        <div style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', borderRadius: 12, padding: 32, textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: '#f87171', margin: '0 0 16px' }}>Connection Error</h2>
          <p style={{ color: '#cbd5e1', marginBottom: 24 }}>{error}</p>
          <button onClick={() => { load(); if (externalOnRefresh) externalOnRefresh(); }} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height: '100%', minHeight: '650px', width: '100%', background: '#0f172a', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', overflow: 'hidden', borderRadius: isFullscreen ? 0 : 12 }}>
      {/* Header */}
      <header style={{ background: 'rgba(30,41,59,0.9)', borderBottom: '1px solid #334155', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #f97316, #ec4899)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>⚡</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'white' }}>AWS Infrastructure Map</h1>
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{systemName} • Force-directed layout</p>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
            <span style={{ padding: '4px 10px', background: 'rgba(249,115,22,0.2)', color: '#fb923c', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{stats.nodes} Nodes</span>
            <span style={{ padding: '4px 10px', background: 'rgba(34,211,238,0.2)', color: '#22d3ee', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{stats.edges} Edges</span>
            {playing && <span style={{ padding: '4px 10px', background: 'rgba(34,197,94,0.2)', color: '#4ade80', borderRadius: 20, fontSize: 11, fontWeight: 600, animation: 'pulse 2s infinite' }}>{animCount} Active</span>}
          </div>
        </div>
        <div style={{ display: 'flex', background: 'rgba(51,65,85,0.5)', borderRadius: 8, padding: 4 }}>
          {[{ id: 'all', label: '🗺️ All' }, { id: 'traffic', label: '↗️ Traffic' }, { id: 'security', label: '🔒 Security' }, { id: 'network', label: '🌐 Network' }].map(m => (
            <button key={m.id} onClick={() => setViewMode(m.id)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: viewMode === m.id ? 'linear-gradient(135deg, #f97316, #ec4899)' : 'transparent', color: viewMode === m.id ? 'white' : '#94a3b8' }}>{m.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(51,65,85,0.5)', borderRadius: 8, padding: '6px 12px' }}>
            <button onClick={() => setPlaying(!playing)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: playing ? '#4ade80' : '#94a3b8', fontSize: 13 }}>{playing ? '⏸️' : '▶️'}</button>
            <input type="range" min="0.2" max="3" step="0.2" value={speed} onChange={e => setSpeed(+e.target.value)} style={{ width: 50 }} />
            <span style={{ color: '#e2e8f0', fontSize: 11 }}>{speed}x</span>
          </div>
          <button onClick={() => { load(); if (externalOnRefresh) externalOnRefresh(); }} style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #f97316, #ec4899)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>🔄</button>
          <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Expand to fullscreen (F11)'} style={{ padding: '6px 14px', background: 'rgba(51,65,85,0.8)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
            {isFullscreen ? (
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            )}
            {isFullscreen ? 'Exit' : 'Expand'}
          </button>
        </div>
      </header>

      {/* Canvas */}
      <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab', position: 'relative' }} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}>
        <svg width="100%" height="100%" style={{ background: '#0f172a', display: 'block' }}>
          <defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1e293b" strokeWidth="0.5" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {edges.map(e => {
              const s = nodes.find(n => n.id === e.source), t = nodes.find(n => n.id === e.target);
              if (!s || !t) return null;
              return <AnimatedEdge key={e.id} edge={e} src={s} tgt={t} selected={selected?.id === e.id && selected?.type === 'edge'} time={animTime} onClick={() => setSelected({ ...e, type: 'edge' })} />;
            })}
            {nodes.map(n => {
              const isSelected = selected?.id === n.id && selected?.type === 'node';
              const connCount = edges.filter(e => e.source === n.id || e.target === n.id).length;
              const hasFlow = edges.some(e => (e.source === n.id || e.target === n.id) && getConnectionStyle(e.type).animated);
              const color = nodeColors[n.label] || '#545B64';
              return (
                <g key={n.id} className="interactive" transform={`translate(${n.x},${n.y})`} onClick={() => { setSelected({ ...n, type: 'node' }); if (externalOnNodeClick) externalOnNodeClick({ id: n.id, type: n.label, name: n.fullName }); }} style={{ cursor: 'pointer' }}>
                  {hasFlow && playing && <circle r="46" fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.3" strokeDasharray="8 4"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite" /></circle>}
                  <rect x="-38" y="-38" width="76" height="76" rx="12" fill="#1e293b" stroke={isSelected ? '#3b82f6' : color} strokeWidth={isSelected ? 3 : 2} />
                  <foreignObject x="-18" y="-22" width="36" height="36"><AWSIcon type={n.label} size={36} /></foreignObject>
                  <text y="30" textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="500">{n.name.length > 12 ? n.name.slice(0, 12) + '…' : n.name}</text>
                  {connCount > 0 && <g transform="translate(30,-30)"><circle r="10" fill={color} /><text textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="white" fontWeight="bold">{connCount > 99 ? '99+' : connCount}</text></g>}
                </g>
              );
            })}
          </g>
        </svg>
        {/* Zoom controls */}
        <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(30,41,59,0.95)', borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => setZoom(z => Math.min(2, z * 1.2))} style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: 'white', fontSize: 18, cursor: 'pointer' }}>+</button>
          <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>{Math.round(zoom * 100)}%</div>
          <button onClick={() => setZoom(z => Math.max(0.1, z / 1.2))} style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: 'white', fontSize: 18, cursor: 'pointer' }}>−</button>
          <button onClick={() => { setZoom(0.5); setPan({ x: 50, y: 50 }); }} style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: 'white', fontSize: 14, cursor: 'pointer', borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4 }}>⟲</button>
        </div>
        {/* Legend */}
        <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(30,41,59,0.95)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Edge Types</div>
          {[{ type: 'ACTUAL_TRAFFIC', label: 'Traffic' }, { type: 'ALLOWS_TRAFFIC_TO', label: 'SG Rules' }, { type: 'ACTUAL_S3_ACCESS', label: 'S3' }, { type: 'ASSUMES_ROLE', label: 'IAM' }].map(({ type, label }) => {
            const s = getConnectionStyle(type);
            return <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 11 }}><div style={{ width: 24, height: 3, background: s.color, borderRadius: 2 }} /><span style={{ color: '#94a3b8' }}>{label}</span>{s.animated && <span style={{ color: '#4ade80', fontSize: 8 }}>●</span>}</div>;
          })}
        </div>
      </div>

      {/* Details panel */}
      {selected && (
        <div style={{ position: 'absolute', top: 70, right: 16, width: 280, background: 'rgba(30,41,59,0.98)', borderRadius: 12, border: '1px solid #334155', overflow: 'hidden', zIndex: 10 }}>
          <div style={{ padding: 12, borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'white', fontSize: 13 }}>{selected.type === 'node' ? 'Node' : 'Edge'}</span>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ padding: 12, maxHeight: 300, overflow: 'auto' }}>
            {selected.type === 'node' && <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}><AWSIcon type={selected.label} size={40} /><div><div style={{ color: 'white', fontWeight: 600, fontSize: 12 }}>{selected.fullName}</div><div style={{ color: '#94a3b8', fontSize: 10 }}>{selected.label}</div></div></div>
              <div style={{ background: 'rgba(15,23,42,0.5)', borderRadius: 6, padding: 8 }}>
                {Object.entries(selected.props || {}).slice(0, 8).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}><span style={{ color: '#64748b' }}>{k}</span><span style={{ color: '#e2e8f0', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(v).slice(0, 30)}</span></div>)}
              </div>
            </>}
            {selected.type === 'edge' && <>
              <div style={{ color: 'white', fontSize: 12, marginBottom: 8 }}>{nodes.find(n => n.id === selected.source)?.name || selected.source}<span style={{ color: getConnectionStyle(selected.type || '').color, margin: '0 6px' }}>→</span>{nodes.find(n => n.id === selected.target)?.name || selected.target}</div>
              <div style={{ display: 'inline-block', padding: '3px 8px', background: getConnectionStyle(selected.type || '').color + '30', color: getConnectionStyle(selected.type || '').color, borderRadius: 12, fontSize: 10 }}>{selected.type}</div>
            </>}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ background: 'rgba(30,41,59,0.8)', borderTop: '1px solid #334155', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
        {[{ color: '#ED7100', label: 'Compute' }, { color: '#3B48CC', label: 'Database' }, { color: '#1B660F', label: 'Storage' }, { color: '#DD344C', label: 'Security' }, { color: '#8C4FFF', label: 'Network' }].map(c => <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} /><span>{c.label}</span></div>)}
        <span style={{ marginLeft: 'auto', color: '#4ade80' }}>● Active Flow</span>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
