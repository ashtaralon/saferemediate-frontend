'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';

// ============================================================================
// TYPES - Based on /api/dependency-map/graph response
// ============================================================================

interface GraphNode {
  id: string;
  name: string;
  type: string;
  category: string;
  layer?: number;
  lpScore?: number;
  gapCount?: number;
  severity?: string;
  isInternetExposed?: boolean;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  port?: string;
  ports?: string[];
  protocol?: string;
  isActual?: boolean;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  error?: string;
}

interface AWSTopologyMapLiveProps {
  systemName: string;
  autoRefreshInterval?: number;
  height?: string;
  showLegend?: boolean;
  onNodeClick?: (node: GraphNode) => void;
}

// ============================================================================
// STYLING
// ============================================================================

const CATEGORY_CONFIG: Record<string, { color: string; icon: string; bg: string }> = {
  Edge: { color: '#06b6d4', icon: '🌐', bg: 'bg-cyan-50' },
  Networking: { color: '#8b5cf6', icon: '🔀', bg: 'bg-violet-50' },
  Security: { color: '#ef4444', icon: '🛡️', bg: 'bg-red-50' },
  Compute: { color: '#f59e0b', icon: '⚡', bg: 'bg-amber-50' },
  Database: { color: '#3b82f6', icon: '🗄️', bg: 'bg-blue-50' },
  Storage: { color: '#22c55e', icon: '📦', bg: 'bg-green-50' },
  Identity: { color: '#ea580c', icon: '👤', bg: 'bg-orange-50' },
  Integration: { color: '#ec4899', icon: '🔗', bg: 'bg-pink-50' },
  Internet: { color: '#dc2626', icon: '🌍', bg: 'bg-red-100' },
};

const EDGE_COLORS: Record<string, string> = {
  internet: '#dc2626',
  network: '#8b5cf6',
  iam_trust: '#ea580c',
  data: '#22c55e',
  invokes: '#f59e0b',
  default: '#6b7280',
};

// ============================================================================
// NODE CARD COMPONENT
// ============================================================================

const NodeCard = ({ 
  node, 
  onClick,
  isHighlighted,
}: { 
  node: GraphNode; 
  onClick?: () => void;
  isHighlighted?: boolean;
}) => {
  const config = CATEGORY_CONFIG[node.category] || CATEGORY_CONFIG.Security;
  const isHealthy = (node.lpScore ?? 100) >= 80;

  return (
    <div
      onClick={onClick}
      className={`
        relative p-4 rounded-xl border-2 bg-white shadow-md cursor-pointer
        hover:shadow-xl hover:scale-[1.02] transition-all duration-200
        ${isHighlighted ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}
      `}
      style={{ borderColor: config.color, minWidth: '180px', maxWidth: '220px' }}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate" title={node.name}>
            {node.name.length > 18 ? node.name.substring(0, 15) + '...' : node.name}
          </p>
          <p className="text-xs" style={{ color: config.color }}>{node.type}</p>
        </div>
        <div 
          className={`w-3 h-3 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}
        />
      </div>

      {node.lpScore !== undefined && (
        <div className="flex justify-between items-center text-xs mt-2">
          <span className="text-gray-500">LP Score</span>
          <span 
            className="font-bold"
            style={{ color: node.lpScore >= 80 ? '#16a34a' : '#dc2626' }}
          >
            {node.lpScore}%
          </span>
        </div>
      )}

      {node.isInternetExposed && (
        <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
          🌐 Public
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ANIMATED CONNECTION LINE (SVG)
// ============================================================================

const ConnectionLine = ({ 
  fromX, fromY, toX, toY, color, label, port 
}: { 
  fromX: number; fromY: number; toX: number; toY: number; 
  color: string; label?: string; port?: string;
}) => {
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  
  return (
    <g>
      {/* Glow */}
      <line
        x1={fromX} y1={fromY} x2={toX} y2={toY}
        stroke={color} strokeWidth="6" opacity="0.15"
      />
      
      {/* Main line */}
      <line
        x1={fromX} y1={fromY} x2={toX} y2={toY}
        stroke={color} strokeWidth="2" markerEnd={`url(#arrow-${color.replace('#', '')})`}
      />
      
      {/* Animated dots */}
      <circle r="5" fill={color}>
        <animate attributeName="cx" values={`${fromX};${toX}`} dur="2s" repeatCount="indefinite" />
        <animate attributeName="cy" values={`${fromY};${toY}`} dur="2s" repeatCount="indefinite" />
      </circle>
      <circle r="4" fill={color} opacity="0.6">
        <animate attributeName="cx" values={`${fromX};${toX}`} dur="2s" repeatCount="indefinite" begin="0.5s" />
        <animate attributeName="cy" values={`${fromY};${toY}`} dur="2s" repeatCount="indefinite" begin="0.5s" />
      </circle>
      <circle r="3" fill={color} opacity="0.3">
        <animate attributeName="cx" values={`${fromX};${toX}`} dur="2s" repeatCount="indefinite" begin="1s" />
        <animate attributeName="cy" values={`${fromY};${toY}`} dur="2s" repeatCount="indefinite" begin="1s" />
      </circle>
      
      {/* Label */}
      {(port || label) && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect x="-35" y="-10" width="70" height="20" rx="4" fill="white" stroke={color} strokeWidth="1" />
          <text textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="600" fill={color}>
            {port ? `Port ${port}` : label}
          </text>
        </g>
      )}
    </g>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AWSTopologyMapLive({
  systemName,
  autoRefreshInterval = 30,
  height = '800px',
  showLegend = true,
  onNodeClick,
}: AWSTopologyMapLiveProps) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(autoRefreshInterval > 0);

  const timeAgo = useMemo(() => {
    if (!lastUpdated) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  }, [lastUpdated]);

  // Group nodes by layer/category
  const groupedNodes = useMemo(() => {
    const groups: Record<string, GraphNode[]> = {};
    graphData.nodes.forEach(node => {
      const key = node.category || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(node);
    });
    return groups;
  }, [graphData.nodes]);

  // Fetch from Neo4j dependency-map endpoint
  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      const response = await fetch(`/api/proxy/dependency-map/graph?systemName=${systemName}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data: GraphData = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setGraphData(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [systemName]);

  useEffect(() => { fetchData(true); }, [systemName]);

  useEffect(() => {
    if (!isLive || autoRefreshInterval <= 0) return;
    const interval = setInterval(() => fetchData(false), autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [isLive, autoRefreshInterval, fetchData]);

  // Category stats
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    graphData.nodes.forEach(n => {
      stats[n.category] = (stats[n.category] || 0) + 1;
    });
    return stats;
  }, [graphData.nodes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 rounded-2xl" style={{ height }}>
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-200" />
            <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
          </div>
          <p className="text-xl font-bold text-slate-700">Loading Neo4j Graph</p>
          <p className="text-slate-500">{systemName}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 rounded-2xl" style={{ height }}>
        <div className="text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-red-700 font-bold text-lg mb-2">Neo4j Error</p>
          <p className="text-red-600 mb-4 max-w-md">{error}</p>
          <button 
            onClick={() => fetchData(true)}
            className="px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const categories = Object.keys(groupedNodes);

  return (
    <div 
      className="relative rounded-2xl border-2 border-slate-200 overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50 shadow-xl" 
      style={{ height }}
    >
      {/* SVG Definitions for arrows */}
      <svg className="absolute" style={{ width: 0, height: 0 }}>
        <defs>
          {Object.entries(EDGE_COLORS).map(([key, color]) => (
            <marker
              key={key}
              id={`arrow-${color.replace('#', '')}`}
              markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill={color} />
            </marker>
          ))}
        </defs>
      </svg>

      {/* Controls */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-4 bg-white/95 backdrop-blur px-5 py-3 rounded-xl shadow-lg border border-slate-200">
        <button
          onClick={() => setIsLive(!isLive)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-all ${
            isLive ? 'bg-green-100 text-green-700 ring-2 ring-green-400' : 'bg-slate-100 text-slate-600'
          }`}
        >
          <span className={`w-3 h-3 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>

        <button
          onClick={() => fetchData(false)}
          className="px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold shadow-md"
        >
          🔄 Refresh
        </button>

        <div className="h-6 w-px bg-slate-200" />

        <span className="text-lg font-black text-slate-800">{graphData.nodes.length}</span>
        <span className="text-slate-500 text-sm">nodes</span>
        <span className="text-slate-300">|</span>
        <span className="text-lg font-black text-indigo-600">{graphData.edges.length}</span>
        <span className="text-slate-500 text-sm">connections</span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-500 text-sm">{timeAgo}</span>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur px-4 py-3 rounded-xl shadow-lg border border-slate-200">
          <div className="flex flex-wrap gap-2">
            {Object.entries(categoryStats).map(([cat, count]) => {
              const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.Security;
              return (
                <span
                  key={cat}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: `${config.color}20`, color: config.color }}
                >
                  {config.icon} {cat} ({count})
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* SVG Canvas for connections */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ overflow: 'visible' }}
      >
        {graphData.edges.slice(0, 50).map((edge, idx) => {
          const color = EDGE_COLORS[edge.type] || EDGE_COLORS.default;
          // Simple positioning based on index
          const startY = 140 + (idx % 5) * 140;
          const endY = startY + 100;
          const startX = 200 + (idx % 3) * 250;
          const endX = startX + 150;
          
          return (
            <ConnectionLine
              key={edge.id}
              fromX={startX}
              fromY={startY}
              toX={endX}
              toY={endY}
              color={color}
              port={edge.port || edge.ports?.[0]}
            />
          );
        })}
      </svg>

      {/* Node rows by category */}
      <div className="pt-20 px-6 pb-6 space-y-6 overflow-auto" style={{ height: `calc(${height} - 20px)` }}>
        {categories.map((category) => {
          const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.Security;
          const nodes = groupedNodes[category];

          return (
            <div key={category} className="relative">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{config.icon}</span>
                <h3 className="text-lg font-bold" style={{ color: config.color }}>
                  {category}
                </h3>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-sm font-medium">
                  {nodes.length}
                </span>
                
                {/* Flow indicator */}
                <div className="flex items-center gap-1 ml-auto">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: config.color, animationDuration: '1s' }} />
                    <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: config.color, animationDuration: '1s', animationDelay: '0.3s' }} />
                    <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: config.color, animationDuration: '1s', animationDelay: '0.6s' }} />
                  </div>
                  <span className="text-xs text-slate-400 ml-2">data flowing</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                {nodes.map((node) => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    onClick={() => onNodeClick?.(node)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-4 bg-white/95 px-4 py-2 rounded-lg shadow-sm text-sm font-medium text-slate-600">
        📊 Neo4j: {graphData.nodes.length} nodes, {graphData.edges.length} real connections
      </div>
    </div>
  );
}
