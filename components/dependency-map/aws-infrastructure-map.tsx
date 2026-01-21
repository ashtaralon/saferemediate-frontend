'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// AWS Icons as simple colored boxes with labels for reliability
const AWSIcon = ({ type, size = 36 }) => {
  const colors = {
    EC2: '#ED7100', EC2Instance: '#ED7100', Lambda: '#ED7100', LambdaFunction: '#ED7100',
    RDSInstance: '#3B48CC', DynamoDB: '#3B48CC', DynamoDBTable: '#3B48CC',
    S3Bucket: '#1B660F', S3: '#1B660F',
    IAMRole: '#DD344C', IAMPolicy: '#DD344C', SecurityGroup: '#DD344C', KMSKey: '#DD344C',
    VPC: '#8C4FFF', Subnet: '#8C4FFF', InternetGateway: '#8C4FFF', RouteTable: '#8C4FFF',
    APIGateway: '#E7157B', ApiGateway: '#E7157B', SQSQueue: '#E7157B', EventBus: '#E7157B',
  };
  
  const icons = {
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
    <div style={{
      width: size, height: size,
      backgroundColor: color,
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.5,
    }}>
      {icon}
    </div>
  );
};

// Connection style based on type
const getConnectionStyle = (type) => {
  const styles = {
    ACTUAL_TRAFFIC: { color: '#10B981', animated: true, speed: 1.5 },
    OBSERVED_TRAFFIC: { color: '#10B981', animated: true, speed: 1.2 },
    API_CALL: { color: '#EC4899', animated: true, speed: 2 },
    ACTUAL_API_CALL: { color: '#EC4899', animated: true, speed: 2.5 },
    RUNTIME_CALLS: { color: '#F59E0B', animated: true, speed: 2 },
    ACTUAL_S3_ACCESS: { color: '#1B660F', animated: true, speed: 1.5 },
    ASSUMES_ROLE: { color: '#DD344C', animated: true, speed: 0.5 },
    CAN_ACCESS: { color: '#DD344C', animated: true, speed: 0.8 },
    IN_VPC: { color: '#8C4FFF', animated: false },
    IN_SUBNET: { color: '#8C4FFF', animated: false },
    BELONGS_TO: { color: '#6B7280', animated: false },
    CONTAINS: { color: '#6B7280', animated: false },
  };
  return styles[type] || { color: '#94A3B8', animated: false };
};

// Neo4j config - TODO: Move to environment variables
const NEO4J = {
  uri: process.env.NEXT_PUBLIC_NEO4J_URI || 'https://4e9962b7.databases.neo4j.io',
  user: process.env.NEXT_PUBLIC_NEO4J_USER || 'neo4j',
  pass: process.env.NEXT_PUBLIC_NEO4J_PASS || 'zxr4y5USTynIAh9VD7wej1Zq6UkQenJSOKunANe3aew'
};

// Animated Edge Component
const AnimatedEdge = ({ edge, src, tgt, selected, time, onClick }) => {
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
  
  // Particles
  const particles = [];
  if (style.animated) {
    for (let i = 0; i < 3; i++) {
      const p = ((time * style.speed * 0.001) + i / 3) % 1;
      particles.push({
        x: x1 + (x2 - x1) * p,
        y: y1 + (y2 - y1) * p,
        o: 0.4 + p * 0.6
      });
    }
  }
  
  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} 
        stroke={style.color} strokeWidth={selected ? 3 : 1.5} strokeOpacity={selected ? 0.9 : 0.4} />
      {style.animated && (
        <line x1={x1} y1={y1} x2={x2} y2={y2} 
          stroke={style.color} strokeWidth={4} strokeOpacity={0.15} />
      )}
      {particles.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill={style.color} opacity={p.o} />
      ))}
      <polygon
        points="0,-4 8,0 0,4"
        fill={style.color}
        transform={`translate(${x2},${y2}) rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI})`}
      />
    </g>
  );
};

// Main Component
export default function AWSInfraMap() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState('traffic');
  const [animTime, setAnimTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [stats, setStats] = useState({ nodes: 0, rels: 0 });
  const animRef = useRef();

  // Animation loop
  useEffect(() => {
    if (!playing) return;
    const tick = (t) => {
      setAnimTime(t * speed);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, speed]);

  // Query Neo4j
  const query = async (cypher) => {
    const res = await fetch(`${NEO4J.uri}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${NEO4J.user}:${NEO4J.pass}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ statements: [{ statement: cypher }] })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  // Load data
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get counts
      const countRes = await query('MATCH (n) WITH count(n) as nc MATCH ()-[r]->() RETURN nc, count(r)');
      const counts = countRes.results?.[0]?.data?.[0]?.row || [0, 0];
      setStats({ nodes: counts[0], rels: counts[1] });

      // Build queries based on view mode
      let nq, eq;
      const limit = 400;
      
      if (viewMode === 'traffic') {
        nq = `MATCH (n) WHERE n:EC2Instance OR n:Lambda OR n:LambdaFunction OR n:APIGateway OR n:ApiGateway OR n:RDSInstance OR n:S3Bucket OR n:DynamoDBTable OR n:SQSQueue
              RETURN id(n), labels(n), properties(n) LIMIT ${limit}`;
        eq = `MATCH (a)-[r]->(b) WHERE type(r) IN ['ACTUAL_TRAFFIC','OBSERVED_TRAFFIC','API_CALL','ACTUAL_API_CALL','RUNTIME_CALLS','ACTUAL_S3_ACCESS']
              RETURN id(a), id(b), type(r), properties(r), id(r) LIMIT 1200`;
      } else if (viewMode === 'security') {
        nq = `MATCH (n) WHERE n:IAMRole OR n:IAMPolicy OR n:SecurityGroup OR n:Principal OR n:KMSKey
              RETURN id(n), labels(n), properties(n) LIMIT ${limit}`;
        eq = `MATCH (a)-[r]->(b) WHERE type(r) IN ['ASSUMES_ROLE','CAN_ASSUME','USES_ROLE','HAS_POLICY','CAN_ACCESS']
              RETURN id(a), id(b), type(r), properties(r), id(r) LIMIT 1200`;
      } else if (viewMode === 'network') {
        nq = `MATCH (n) WHERE n:VPC OR n:Subnet OR n:InternetGateway OR n:RouteTable OR n:SecurityGroup
              RETURN id(n), labels(n), properties(n) LIMIT ${limit}`;
        eq = `MATCH (a)-[r]->(b) WHERE type(r) IN ['IN_VPC','IN_SUBNET','CONTAINS','HAS_IGW','USES_ROUTE_TABLE']
              RETURN id(a), id(b), type(r), properties(r), id(r) LIMIT 1200`;
      } else {
        nq = `MATCH (n) RETURN id(n), labels(n), properties(n) LIMIT ${limit}`;
        eq = `MATCH (a)-[r]->(b) RETURN id(a), id(b), type(r), properties(r), id(r) LIMIT 1500`;
      }

      const nodesRes = await query(nq);
      const edgesRes = await query(eq);
      
      const nodeData = nodesRes.results?.[0]?.data || [];
      const edgeData = edgesRes.results?.[0]?.data || [];

      // Process nodes
      const cols = Math.ceil(Math.sqrt(nodeData.length));
      const spacing = 160;
      
      const procNodes = nodeData.map((r, i) => {
        const [id, labels, props] = r.row;
        const label = labels[0] || 'Unknown';
        const name = props.name || props.Name || props.id || 
                     props.arn?.split('/').pop() || props.arn?.split(':').pop() || 
                     `${label}-${id}`;
        return {
          id: String(id),
          label,
          name: name.length > 25 ? name.slice(0, 25) + '...' : name,
          fullName: name,
          props,
          x: 200 + (i % cols) * spacing,
          y: 200 + Math.floor(i / cols) * spacing,
          vx: 0, vy: 0
        };
      });

      const nodeIds = new Set(procNodes.map(n => n.id));
      
      const procEdges = edgeData
        .map(r => ({
          id: String(r.row[4]),
          source: String(r.row[0]),
          target: String(r.row[1]),
          type: r.row[2],
          props: r.row[3] || {}
        }))
        .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

      // Force layout
      const nodeMap = new Map(procNodes.map(n => [n.id, n]));
      
      for (let iter = 0; iter < 80; iter++) {
        const t = 1 - iter / 80;
        
        // Repulsion
        procNodes.forEach(n1 => {
          procNodes.forEach(n2 => {
            if (n1.id === n2.id) return;
            const dx = n1.x - n2.x;
            const dy = n1.y - n2.y;
            const d = Math.max(Math.sqrt(dx*dx + dy*dy), 1);
            const f = 8000 / (d * d);
            n1.vx += (dx/d) * f * t;
            n1.vy += (dy/d) * f * t;
          });
        });
        
        // Attraction
        procEdges.forEach(e => {
          const s = nodeMap.get(e.source);
          const g = nodeMap.get(e.target);
          if (!s || !g) return;
          const dx = g.x - s.x;
          const dy = g.y - s.y;
          const f = Math.sqrt(dx*dx + dy*dy) * 0.004 * t;
          s.vx += dx * f; s.vy += dy * f;
          g.vx -= dx * f; g.vy -= dy * f;
        });
        
        // Update
        procNodes.forEach(n => {
          n.x += n.vx * 0.1;
          n.y += n.vy * 0.1;
          n.vx *= 0.85;
          n.vy *= 0.85;
          n.x = Math.max(100, Math.min(4000, n.x));
          n.y = Math.max(100, Math.min(3000, n.y));
        });
      }

      setNodes(procNodes);
      setEdges(procEdges);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [viewMode]);

  useEffect(() => { load(); }, [load]);

  // Mouse handlers
  const onMouseDown = (e) => {
    if (e.target.closest('.interactive')) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const onMouseMove = (e) => {
    if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const onMouseUp = () => setDragging(false);
  const onWheel = (e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.1, Math.min(2, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  };

  // Count animated
  const animCount = edges.filter(e => getConnectionStyle(e.type).animated).length;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ width: 60, height: 60, border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
          <h2 style={{ margin: 0 }}>Loading Infrastructure Map</h2>
          <p style={{ color: '#94a3b8', marginTop: 8 }}>Connecting to Neo4j...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', borderRadius: 12, padding: 32, textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: '#f87171', margin: '0 0 16px' }}>Connection Error</h2>
          <p style={{ color: '#cbd5e1', marginBottom: 24 }}>{error}</p>
          <button onClick={load} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100%', maxWidth: '100vw', background: '#0f172a', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', overflow: 'hidden', position: 'relative', boxSizing: 'border-box' }}>
      {/* Header - Responsive with wrapping */}
      <header style={{ background: 'rgba(30,41,59,0.9)', borderBottom: '1px solid #334155', padding: '8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0, minHeight: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: '200px' }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #f97316, #ec4899)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>⚡</div>
          <div style={{ flexShrink: 0 }}>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'white', lineHeight: '1.2' }}>AWS Infrastructure Map</h1>
            <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', lineHeight: '1.2' }}>Dynamic data flow visualization</p>
          </div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 12, flexWrap: 'wrap' }}>
            <span style={{ padding: '3px 8px', background: 'rgba(249,115,22,0.2)', color: '#fb923c', borderRadius: 16, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{stats.nodes.toLocaleString()} Nodes</span>
            <span style={{ padding: '3px 8px', background: 'rgba(34,211,238,0.2)', color: '#22d3ee', borderRadius: 16, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{stats.rels.toLocaleString()} Connections</span>
            {playing && <span style={{ padding: '3px 8px', background: 'rgba(34,197,94,0.2)', color: '#4ade80', borderRadius: 16, fontSize: 10, fontWeight: 600, animation: 'pulse 2s infinite', whiteSpace: 'nowrap' }}>{animCount} Active</span>}
          </div>
        </div>

        {/* View Tabs - Responsive */}
        <div style={{ display: 'flex', background: 'rgba(51,65,85,0.5)', borderRadius: 6, padding: 2, flexWrap: 'wrap', gap: 2 }}>
          {[
            { id: 'traffic', label: '↗️ Traffic' },
            { id: 'full', label: '🗺️ Full' },
            { id: 'security', label: '🔒 Security' },
            { id: 'network', label: '🌐 Network' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setViewMode(m.id)}
              style={{
                padding: '4px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                background: viewMode === m.id ? 'linear-gradient(135deg, #f97316, #ec4899)' : 'transparent',
                color: viewMode === m.id ? 'white' : '#94a3b8',
                whiteSpace: 'nowrap'
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Controls - Responsive */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(51,65,85,0.5)', borderRadius: 6, padding: '4px 8px' }}>
            <button onClick={() => setPlaying(!playing)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: playing ? '#4ade80' : '#94a3b8', fontSize: 11, padding: '2px 4px' }}>
              {playing ? '⏸️' : '▶️'}
            </button>
            <span style={{ color: '#64748b', fontSize: 10 }}>|</span>
            <span style={{ color: '#94a3b8', fontSize: 10 }}>Speed:</span>
            <input type="range" min="0.2" max="3" step="0.2" value={speed} onChange={e => setSpeed(+e.target.value)} style={{ width: 50 }} />
            <span style={{ color: '#e2e8f0', fontSize: 10, width: 24 }}>{speed}x</span>
          </div>
          <button onClick={load} style={{ padding: '4px 10px', background: 'linear-gradient(135deg, #f97316, #ec4899)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>
            🔄
          </button>
        </div>
      </header>

      {/* Canvas */}
      <div 
        style={{ flex: '1 1 0', minHeight: 0, height: 'calc(100vh - 80px)', maxHeight: 'calc(100vh - 80px)', overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab', position: 'relative' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <svg width="100%" height="100%" style={{ background: '#0f172a', display: 'block' }}>
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1e293b" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {edges.map(e => {
              const s = nodes.find(n => n.id === e.source);
              const t = nodes.find(n => n.id === e.target);
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
            {nodes.map(n => {
              const isSelected = selected?.id === n.id && selected?.type === 'node';
              const connCount = edges.filter(e => e.source === n.id || e.target === n.id).length;
              const hasFlow = edges.some(e => (e.source === n.id || e.target === n.id) && getConnectionStyle(e.type).animated);
              const colors = {
                EC2: '#ED7100', EC2Instance: '#ED7100', Lambda: '#ED7100', LambdaFunction: '#ED7100',
                RDSInstance: '#3B48CC', DynamoDBTable: '#3B48CC',
                S3Bucket: '#1B660F',
                IAMRole: '#DD344C', IAMPolicy: '#DD344C', SecurityGroup: '#DD344C', KMSKey: '#DD344C',
                VPC: '#8C4FFF', Subnet: '#8C4FFF', InternetGateway: '#8C4FFF',
                APIGateway: '#E7157B', ApiGateway: '#E7157B', SQSQueue: '#E7157B',
              };
              const color = colors[n.label] || '#545B64';

              return (
                <g 
                  key={n.id} 
                  className="interactive"
                  transform={`translate(${n.x},${n.y})`} 
                  onClick={() => setSelected({ ...n, type: 'node' })}
                  style={{ cursor: 'pointer' }}
                >
                  {hasFlow && playing && (
                    <circle r="46" fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.3" strokeDasharray="8 4">
                      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <rect x="-38" y="-38" width="76" height="76" rx="12" fill="#1e293b" stroke={isSelected ? '#3b82f6' : color} strokeWidth={isSelected ? 3 : 2} />
                  <foreignObject x="-18" y="-22" width="36" height="36">
                    <AWSIcon type={n.label} size={36} />
                  </foreignObject>
                  <text y="30" textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="500">
                    {n.name.length > 12 ? n.name.slice(0, 12) + '…' : n.name}
                  </text>
                  {connCount > 0 && (
                    <g transform="translate(30,-30)">
                      <circle r="10" fill={color} />
                      <text textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="white" fontWeight="bold">{connCount > 99 ? '99+' : connCount}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Zoom controls */}
        <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(30,41,59,0.95)', borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 100 }}>
          <button onClick={() => setZoom(z => Math.min(2, z * 1.2))} style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: 'white', fontSize: 18, cursor: 'pointer', borderRadius: 6 }}>+</button>
          <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>{Math.round(zoom * 100)}%</div>
          <button onClick={() => setZoom(z => Math.max(0.1, z / 1.2))} style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: 'white', fontSize: 18, cursor: 'pointer', borderRadius: 6 }}>−</button>
          <div style={{ borderTop: '1px solid #334155', margin: '4px 0' }} />
          <button onClick={() => { setZoom(0.5); setPan({ x: 50, y: 50 }); }} style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: 'white', fontSize: 14, cursor: 'pointer', borderRadius: 6 }}>⟲</button>
        </div>

        {/* Legend */}
        <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(30,41,59,0.95)', borderRadius: 12, padding: 12, zIndex: 100, maxWidth: 'calc(100% - 400px)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Data Flow Types</div>
          {[
            { type: 'ACTUAL_TRAFFIC', label: 'Traffic' },
            { type: 'API_CALL', label: 'API Calls' },
            { type: 'ACTUAL_S3_ACCESS', label: 'S3 Access' },
            { type: 'ASSUMES_ROLE', label: 'IAM' },
          ].map(({ type, label }) => {
            const s = getConnectionStyle(type);
            return (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 11 }}>
                <div style={{ width: 24, height: 3, background: s.color, borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                  {s.animated && <div style={{ position: 'absolute', width: 8, height: '100%', background: 'white', borderRadius: 2, animation: 'flow 1s linear infinite' }} />}
                </div>
                <span style={{ color: '#94a3b8' }}>{label}</span>
                {s.animated && <span style={{ color: '#4ade80', fontSize: 8 }}>●</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Details panel */}
      {selected && (
        <div style={{ position: 'absolute', top: 70, right: 16, width: 300, maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100vh - 100px)', background: 'rgba(30,41,59,0.98)', borderRadius: 12, border: '1px solid #334155', overflow: 'hidden', zIndex: 1000 }}>
          <div style={{ padding: 16, borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'white', fontSize: 14 }}>{selected.type === 'node' ? 'Node' : 'Connection'} Details</span>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ padding: 16, maxHeight: 400, overflow: 'auto' }}>
            {selected.type === 'node' && (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <AWSIcon type={selected.label} size={48} />
                  <div>
                    <div style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{selected.fullName}</div>
                    <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>{selected.label}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Properties</div>
                <div style={{ background: 'rgba(15,23,42,0.5)', borderRadius: 8, padding: 12 }}>
                  {Object.entries(selected.props || {}).slice(0, 10).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                      <span style={{ color: '#64748b' }}>{k}</span>
                      <span style={{ color: '#e2e8f0', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(v).slice(0, 40)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {selected.type === 'edge' && (
              <>
                <div style={{ color: 'white', fontSize: 13, marginBottom: 12 }}>
                  {nodes.find(n => n.id === selected.source)?.name || selected.source}
                  <span style={{ color: getConnectionStyle(selected.type || '').color, margin: '0 8px' }}>→</span>
                  {nodes.find(n => n.id === selected.target)?.name || selected.target}
                </div>
                <div style={{ display: 'inline-block', padding: '4px 10px', background: getConnectionStyle(selected.type || '').color + '30', color: getConnectionStyle(selected.type || '').color, borderRadius: 20, fontSize: 11, marginBottom: 16 }}>
                  {selected.type}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Properties</div>
                <div style={{ background: 'rgba(15,23,42,0.5)', borderRadius: 8, padding: 12 }}>
                  {Object.keys(selected.props || {}).length > 0 ? (
                    Object.entries(selected.props).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                        <span style={{ color: '#64748b' }}>{k}</span>
                        <span style={{ color: '#e2e8f0' }}>{String(v)}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>No properties</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer - Responsive */}
      <div style={{ background: 'rgba(30,41,59,0.8)', borderTop: '1px solid #334155', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: '#94a3b8', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>Categories:</span>
        {[
          { color: '#ED7100', label: 'Compute' },
          { color: '#3B48CC', label: 'Database' },
          { color: '#1B660F', label: 'Storage' },
          { color: '#DD344C', label: 'Security' },
          { color: '#8C4FFF', label: 'Network' },
          { color: '#E7157B', label: 'Integration' },
        ].map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10 }}>{c.label}</span>
          </div>
        ))}
        <span style={{ marginLeft: 'auto', color: '#4ade80', fontSize: 10, whiteSpace: 'nowrap' }}>● = Active Flow</span>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes flow { 0% { left: -8px; } 100% { left: 100%; } }
      `}</style>
    </div>
  );
}
