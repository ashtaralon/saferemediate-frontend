'use client';

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface LPResource {
  id: string;
  resourceName: string;
  resourceType: string;
  resourceArn: string;
  systemName: string;
  lpScore?: number;
  gapCount?: number;
  severity?: string;
  allowedList?: any[];
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
  onNodeClick?: (resource: LPResource) => void;
}

// ============================================================================
// STYLING
// ============================================================================

const CATEGORY_CONFIG: Record<string, { color: string; icon: string; bg: string; label: string }> = {
  SecurityGroup: { color: '#7c3aed', icon: '🛡️', bg: 'bg-purple-50', label: 'Security Groups' },
  IAMRole: { color: '#ea580c', icon: '👤', bg: 'bg-orange-50', label: 'IAM Roles' },
  S3Bucket: { color: '#16a34a', icon: '📦', bg: 'bg-green-50', label: 'S3 Buckets' },
  Lambda: { color: '#f59e0b', icon: '⚡', bg: 'bg-amber-50', label: 'Lambda Functions' },
  DynamoDB: { color: '#2563eb', icon: '🗄️', bg: 'bg-blue-50', label: 'DynamoDB Tables' },
  EC2: { color: '#f97316', icon: '🖥️', bg: 'bg-orange-50', label: 'EC2 Instances' },
};

// ============================================================================
// RESOURCE CARD
// ============================================================================

const ResourceCard = ({ 
  resource, 
  onClick,
  isConnected,
}: { 
  resource: LPResource; 
  onClick?: () => void;
  isConnected?: boolean;
}) => {
  const config = CATEGORY_CONFIG[resource.resourceType] || { color: '#6b7280', icon: '📄', bg: 'bg-gray-50' };
  const isHealthy = (resource.lpScore ?? 100) >= 80;
  const hasInternet = resource.networkExposure?.internetExposedRules > 0;

  return (
    <div
      onClick={onClick}
      className={`
        relative p-4 rounded-xl border-2 bg-white shadow-md cursor-pointer
        hover:shadow-xl hover:scale-[1.02] transition-all duration-200
        ${isConnected ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}
      `}
      style={{ borderColor: config.color, minWidth: '180px' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <p 
            className="font-bold text-gray-900 text-sm truncate" 
            title={resource.resourceName}
          >
            {resource.resourceName.length > 20 
              ? resource.resourceName.substring(0, 17) + '...' 
              : resource.resourceName}
          </p>
          <p className="text-xs" style={{ color: config.color }}>{resource.resourceType}</p>
        </div>
        {/* Status dot */}
        <div 
          className={`w-3 h-3 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-amber-500'} ${isHealthy ? '' : 'animate-pulse'}`}
        />
      </div>

      {/* LP Score */}
      {resource.lpScore !== undefined && (
        <div className="flex justify-between items-center text-xs mt-2">
          <span className="text-gray-500">LP Score</span>
          <span 
            className="font-bold"
            style={{ color: resource.lpScore >= 80 ? '#16a34a' : '#dc2626' }}
          >
            {resource.lpScore}%
          </span>
        </div>
      )}

      {/* Internet exposed badge */}
      {hasInternet && (
        <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
          🌐 Public
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ANIMATED FLOW LINE (CSS only)
// ============================================================================

const FlowLine = ({ 
  fromX, fromY, toX, toY, color, label 
}: { 
  fromX: number; fromY: number; toX: number; toY: number; color: string; label?: string;
}) => {
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  
  return (
    <g>
      {/* Glow effect */}
      <line
        x1={fromX} y1={fromY} x2={toX} y2={toY}
        stroke={color}
        strokeWidth="6"
        opacity="0.2"
        strokeLinecap="round"
      />
      
      {/* Main line */}
      <line
        x1={fromX} y1={fromY} x2={toX} y2={toY}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        markerEnd="url(#arrowhead)"
      />
      
      {/* Animated dot 1 */}
      <circle r="4" fill={color}>
        <animate 
          attributeName="cx" 
          values={`${fromX};${toX}`} 
          dur="2s" 
          repeatCount="indefinite"
        />
        <animate 
          attributeName="cy" 
          values={`${fromY};${toY}`} 
          dur="2s" 
          repeatCount="indefinite"
        />
        <animate 
          attributeName="opacity" 
          values="1;0.5;1" 
          dur="2s" 
          repeatCount="indefinite"
        />
      </circle>
      
      {/* Animated dot 2 (delayed) */}
      <circle r="3" fill={color} opacity="0.7">
        <animate 
          attributeName="cx" 
          values={`${fromX};${toX}`} 
          dur="2s" 
          repeatCount="indefinite"
          begin="0.5s"
        />
        <animate 
          attributeName="cy" 
          values={`${fromY};${toY}`} 
          dur="2s" 
          repeatCount="indefinite"
          begin="0.5s"
        />
      </circle>
      
      {/* Animated dot 3 (more delayed) */}
      <circle r="2" fill={color} opacity="0.5">
        <animate 
          attributeName="cx" 
          values={`${fromX};${toX}`} 
          dur="2s" 
          repeatCount="indefinite"
          begin="1s"
        />
        <animate 
          attributeName="cy" 
          values={`${fromY};${toY}`} 
          dur="2s" 
          repeatCount="indefinite"
          begin="1s"
        />
      </circle>
      
      {/* Label */}
      {label && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect 
            x="-30" y="-10" width="60" height="20" 
            rx="4" fill="white" stroke={color} strokeWidth="1"
          />
          <text 
            textAnchor="middle" 
            dominantBaseline="middle" 
            fontSize="10" 
            fontWeight="600"
            fill={color}
          >
            {label}
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [resources, setResources] = useState<LPResource[]>([]);
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

  // Group resources by type
  const groupedResources = useMemo(() => {
    const groups: Record<string, LPResource[]> = {};
    resources.forEach(r => {
      if (!groups[r.resourceType]) groups[r.resourceType] = [];
      groups[r.resourceType].push(r);
    });
    return groups;
  }, [resources]);

  // Fetch data
  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${systemName}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const fetchedResources: LPResource[] = data.resources || [];

      setResources(fetchedResources);
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

  // Count connections (edges between rows)
  const connectionCount = useMemo(() => {
    const types = Object.keys(groupedResources);
    let count = 0;
    for (let i = 0; i < types.length - 1; i++) {
      count += Math.min(groupedResources[types[i]].length, groupedResources[types[i + 1]].length);
    }
    return count;
  }, [groupedResources]);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 rounded-2xl" style={{ height }}>
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-200" />
            <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
          </div>
          <p className="text-xl font-bold text-slate-700">Loading {systemName}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 rounded-2xl" style={{ height }}>
        <div className="text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-red-700 font-bold text-lg mb-4">{error}</p>
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

  const types = Object.keys(groupedResources);

  return (
    <div 
      ref={containerRef}
      className="relative rounded-2xl border-2 border-slate-200 overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50 shadow-xl" 
      style={{ height }}
    >
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

        <span className="text-lg font-black text-slate-800">{resources.length}</span>
        <span className="text-slate-500 text-sm">resources</span>
        <span className="text-slate-300">|</span>
        <span className="text-lg font-black text-indigo-600">{connectionCount}</span>
        <span className="text-slate-500 text-sm">flows</span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-500 text-sm">{timeAgo}</span>
      </div>

      {/* SVG for connection lines */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
          </marker>
        </defs>

        {/* Draw connections between rows */}
        {types.map((type, typeIndex) => {
          if (typeIndex >= types.length - 1) return null;
          
          const currentResources = groupedResources[type];
          const nextResources = groupedResources[types[typeIndex + 1]];
          const config = CATEGORY_CONFIG[type] || { color: '#6b7280' };
          
          // Connect first item of current row to first item of next row
          const rowHeight = 160;
          const startY = 120 + typeIndex * rowHeight + 50;
          const endY = 120 + (typeIndex + 1) * rowHeight + 50;
          
          return currentResources.slice(0, 3).map((_, idx) => {
            const startX = 100 + idx * 220 + 90;
            const endX = 100 + Math.min(idx, nextResources.length - 1) * 220 + 90;
            
            return (
              <FlowLine
                key={`${type}-${idx}`}
                fromX={startX}
                fromY={startY}
                toX={endX}
                toY={endY}
                color={config.color}
              />
            );
          });
        })}
      </svg>

      {/* Resource rows */}
      <div className="pt-20 px-6 pb-6 space-y-4 overflow-auto" style={{ height: `calc(${height} - 20px)` }}>
        {types.map((type, typeIndex) => {
          const config = CATEGORY_CONFIG[type] || { color: '#6b7280', icon: '📄', bg: 'bg-gray-50', label: type };
          const typeResources = groupedResources[type];

          return (
            <div key={type} className="relative">
              {/* Row header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{config.icon}</span>
                <h3 className="text-lg font-bold" style={{ color: config.color }}>
                  {config.label}
                </h3>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-sm font-medium">
                  {typeResources.length}
                </span>
                
                {/* Animated flow indicator */}
                {typeIndex < types.length - 1 && (
                  <div className="flex items-center gap-1 ml-auto">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: config.color, animationDuration: '1s' }} />
                      <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: config.color, animationDuration: '1s', animationDelay: '0.3s' }} />
                      <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: config.color, animationDuration: '1s', animationDelay: '0.6s' }} />
                    </div>
                    <span className="text-xs text-slate-400 ml-2">flowing to next layer</span>
                  </div>
                )}
              </div>

              {/* Resource cards */}
              <div className="flex flex-wrap gap-4">
                {typeResources.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    resource={resource}
                    onClick={() => onNodeClick?.(resource)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur px-4 py-3 rounded-xl shadow-lg border border-slate-200">
          <div className="text-xs text-slate-500 mb-2 font-semibold">Connection Types</div>
          <div className="flex gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-purple-500 relative">
                <div className="absolute w-2 h-2 bg-purple-500 rounded-full -top-0.5 left-0 animate-ping" style={{ animationDuration: '1.5s' }} />
              </div>
              <span className="text-xs text-slate-600">Security</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-orange-500 relative">
                <div className="absolute w-2 h-2 bg-orange-500 rounded-full -top-0.5 left-0 animate-ping" style={{ animationDuration: '1.5s' }} />
              </div>
              <span className="text-xs text-slate-600">IAM</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-green-500 relative">
                <div className="absolute w-2 h-2 bg-green-500 rounded-full -top-0.5 left-0 animate-ping" style={{ animationDuration: '1.5s' }} />
              </div>
              <span className="text-xs text-slate-600">Storage</span>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-4 left-4 bg-white/95 px-4 py-2 rounded-lg shadow-sm text-sm font-medium text-slate-600">
        ✨ Real AWS data • {connectionCount} animated flows
      </div>
    </div>
  );
}
