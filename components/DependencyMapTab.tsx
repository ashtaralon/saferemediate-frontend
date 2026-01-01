'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape, { Core, NodeSingular, EdgeSingular } from 'cytoscape';

// ============================================================================
// TYPES
// ============================================================================

interface MapNode {
  id: string;
  name: string;
  type: string;
  category: string;
  lp_score?: number;
  gap_count: number;
  is_internet_exposed: boolean;
}

interface MapEdge {
  id: string;
  source: string;
  target: string;
  edge_type: string;
  port?: string;
  protocol?: string;
  traffic_bytes: number;
  is_used: boolean;
}

interface Permission {
  action: string;
  resource: string;
  used_count: number;
  is_used: boolean;
}

interface SecurityRule {
  rule_id: string;
  direction: string;
  protocol: string;
  port_range: string;
  source_or_dest: string;
  is_used: boolean;
  traffic_count: number;
}

interface PathSegment {
  segment_type: string;
  resource_id: string;
  resource_name: string;
  permissions?: Permission[];
  rules?: SecurityRule[];
  used_count: number;
  unused_count: number;
  gap_percent: number;
}

interface SecurityPath {
  source_name: string;
  target_name: string;
  path_segments: PathSegment[];
  confidence_score: number;
  remediation_recommendations: string[];
}

interface DependencyMapTabProps {
  systemName: string;
}

// ============================================================================
// STYLING
// ============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  Security: '#f97316',
  Identity: '#8b5cf6',
  Compute: '#f59e0b',
  Database: '#3b82f6',
  Storage: '#22c55e',
  Networking: '#06b6d4',
  Edge: '#ec4899',
  Integration: '#14b8a6',
  Resource: '#6b7280',
};

const CATEGORY_SHAPES: Record<string, string> = {
  Security: 'octagon',
  Identity: 'hexagon',
  Compute: 'round-rectangle',
  Database: 'barrel',
  Storage: 'round-rectangle',
  Networking: 'diamond',
  Edge: 'star',
  Integration: 'pentagon',
  Resource: 'ellipse',
};

// ============================================================================
// CYTOSCAPE STYLESHEET
// ============================================================================

const cytoscapeStylesheet: cytoscape.Stylesheet[] = [
  {
    selector: 'node',
    style: {
      'label': 'data(label)',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'font-size': '10px',
      'font-weight': 'bold',
      'text-margin-y': 5,
      'background-color': 'data(color)',
      'border-width': 2,
      'border-color': '#ffffff',
      'width': 50,
      'height': 50,
      'text-wrap': 'ellipsis',
      'text-max-width': '80px',
    }
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 4,
      'border-color': '#3b82f6',
      'background-opacity': 1,
    }
  },
  {
    selector: 'node.highlighted',
    style: {
      'border-width': 4,
      'border-color': '#22c55e',
      'background-opacity': 1,
    }
  },
  {
    selector: 'node.internet-exposed',
    style: {
      'border-color': '#ef4444',
      'border-width': 3,
    }
  },
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': '#94a3b8',
      'target-arrow-color': '#94a3b8',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'opacity': 0.7,
    }
  },
  {
    selector: 'edge:selected',
    style: {
      'width': 4,
      'line-color': '#3b82f6',
      'target-arrow-color': '#3b82f6',
      'opacity': 1,
    }
  },
  {
    selector: 'edge.highlighted',
    style: {
      'width': 4,
      'line-color': '#22c55e',
      'target-arrow-color': '#22c55e',
      'opacity': 1,
    }
  },
  {
    selector: 'edge.unused',
    style: {
      'line-style': 'dashed',
      'line-color': '#ef4444',
      'opacity': 0.5,
    }
  },
];

// ============================================================================
// SECURITY PATH POPUP
// ============================================================================

const SecurityPathPopup = ({ 
  path, 
  onClose 
}: { 
  path: SecurityPath | null; 
  onClose: () => void;
}) => {
  if (!path) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold">Security Path Analysis</h2>
              <p className="text-indigo-200 mt-1">
                {path.source_name} → {path.target_name}
              </p>
            </div>
            <button 
              onClick={onClose}
              className="text-white/80 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>
          
          {/* Confidence Score */}
          <div className="mt-4 flex items-center gap-4">
            <div className="bg-white/20 rounded-lg px-4 py-2">
              <span className="text-sm text-indigo-200">Confidence</span>
              <p className="text-2xl font-bold">{path.confidence_score}%</p>
            </div>
            <div className="bg-white/20 rounded-lg px-4 py-2">
              <span className="text-sm text-indigo-200">Segments</span>
              <p className="text-2xl font-bold">{path.path_segments.length}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {path.path_segments.map((segment, idx) => (
            <div key={idx} className="mb-6 last:mb-0">
              {/* Segment header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">
                  {segment.segment_type === 'IAM_ROLE' ? '👤' : '🛡️'}
                </span>
                <div>
                  <h3 className="font-bold text-gray-900">{segment.resource_name}</h3>
                  <p className="text-sm text-gray-500">{segment.segment_type.replace('_', ' ')}</p>
                </div>
                {segment.unused_count > 0 && (
                  <span className="ml-auto bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-bold">
                    {segment.unused_count} unused
                  </span>
                )}
              </div>

              {/* Permissions */}
              {segment.permissions && segment.permissions.length > 0 && (
                <div className="ml-8 space-y-1">
                  {segment.permissions.slice(0, 10).map((perm, pIdx) => (
                    <div 
                      key={pIdx}
                      className={`flex items-center gap-2 text-sm ${
                        perm.is_used ? 'text-gray-700' : 'text-red-600'
                      }`}
                    >
                      <span>{perm.is_used ? '✅' : '⚠️'}</span>
                      <span className="font-mono">{perm.action}</span>
                      {perm.used_count > 0 && (
                        <span className="text-gray-400">({perm.used_count} uses)</span>
                      )}
                      {!perm.is_used && (
                        <span className="text-red-500 font-medium">(UNUSED)</span>
                      )}
                    </div>
                  ))}
                  {segment.permissions.length > 10 && (
                    <p className="text-gray-400 text-sm">
                      +{segment.permissions.length - 10} more permissions
                    </p>
                  )}
                </div>
              )}

              {/* Rules */}
              {segment.rules && segment.rules.length > 0 && (
                <div className="ml-8 space-y-1">
                  {segment.rules.slice(0, 10).map((rule, rIdx) => (
                    <div 
                      key={rIdx}
                      className={`flex items-center gap-2 text-sm ${
                        rule.is_used ? 'text-gray-700' : 'text-red-600'
                      }`}
                    >
                      <span>{rule.is_used ? '✅' : '⚠️'}</span>
                      <span className="font-mono">
                        {rule.direction} {rule.protocol}:{rule.port_range}
                      </span>
                      <span className="text-gray-400">from {rule.source_or_dest}</span>
                      {rule.traffic_count > 0 && (
                        <span className="text-gray-400">({rule.traffic_count} packets)</span>
                      )}
                      {!rule.is_used && (
                        <span className="text-red-500 font-medium">(UNUSED)</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Gap indicator */}
              {segment.gap_percent > 0 && (
                <div className="ml-8 mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-red-700 text-sm font-medium">
                    Gap: {segment.gap_percent}% unused ({segment.unused_count} items)
                  </p>
                </div>
              )}
            </div>
          ))}

          {/* Recommendations */}
          {path.remediation_recommendations.length > 0 && (
            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h4 className="font-bold text-amber-800 mb-2">💡 Remediation Recommendations</h4>
              <ul className="space-y-1">
                {path.remediation_recommendations.map((rec, idx) => (
                  <li key={idx} className="text-amber-700 text-sm flex items-start gap-2">
                    <span>•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
          >
            Close
          </button>
          <button
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            Apply Remediation
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DependencyMapTab({ systemName }: DependencyMapTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [selectedPath, setSelectedPath] = useState<SecurityPath | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Fetch and render graph
  const fetchGraph = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/proxy/dependency-map/full?systemName=${systemName}`);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

      const data = await response.json();
      
      if (!data.nodes || data.nodes.length === 0) {
        setError('No resources found for this system');
        setLoading(false);
        return;
      }

      setStats({ nodes: data.total_nodes, edges: data.total_edges });

      // Initialize Cytoscape
      if (containerRef.current && !cyRef.current) {
        cyRef.current = cytoscape({
          container: containerRef.current,
          style: cytoscapeStylesheet,
          layout: { name: 'cose', animate: false },
          minZoom: 0.2,
          maxZoom: 3,
        });

        // Event handlers
        cyRef.current.on('tap', 'node', async (evt) => {
          const node = evt.target as NodeSingular;
          const nodeId = node.id();
          
          // Highlight connected nodes
          cyRef.current?.elements().removeClass('highlighted');
          node.addClass('highlighted');
          node.connectedEdges().addClass('highlighted');
          node.neighborhood('node').addClass('highlighted');
          
          setSelectedNode(nodeId);
        });

        cyRef.current.on('tap', 'edge', async (evt) => {
          const edge = evt.target as EdgeSingular;
          const sourceId = edge.source().id();
          const targetId = edge.target().id();
          
          // Fetch security path
          try {
            const pathResponse = await fetch(
              `/api/proxy/dependency-map/path/${encodeURIComponent(sourceId)}/${encodeURIComponent(targetId)}?systemName=${systemName}`
            );
            if (pathResponse.ok) {
              const pathData = await pathResponse.json();
              setSelectedPath(pathData);
            }
          } catch (err) {
            console.error('Failed to fetch path:', err);
          }
        });

        cyRef.current.on('tap', (evt) => {
          if (evt.target === cyRef.current) {
            cyRef.current?.elements().removeClass('highlighted');
            setSelectedNode(null);
          }
        });
      }

      // Clear and add elements
      if (cyRef.current) {
        cyRef.current.elements().remove();

        // Add nodes
        const elements: cytoscape.ElementDefinition[] = data.nodes.map((node: MapNode) => ({
          data: {
            id: node.id,
            label: node.name.length > 15 ? node.name.substring(0, 12) + '...' : node.name,
            fullName: node.name,
            type: node.type,
            category: node.category,
            color: CATEGORY_COLORS[node.category] || CATEGORY_COLORS.Resource,
            lpScore: node.lp_score,
            gapCount: node.gap_count,
          },
          classes: node.is_internet_exposed ? 'internet-exposed' : '',
        }));

        // Add edges
        data.edges.forEach((edge: MapEdge) => {
          elements.push({
            data: {
              id: edge.id,
              source: edge.source,
              target: edge.target,
              edgeType: edge.edge_type,
              port: edge.port,
            },
            classes: edge.is_used ? '' : 'unused',
          });
        });

        cyRef.current.add(elements);

        // Apply layout
        cyRef.current.layout({
          name: 'cose',
          animate: false,
          nodeDimensionsIncludeLabels: true,
          idealEdgeLength: 100,
          nodeRepulsion: 8000,
        }).run();

        cyRef.current.fit(undefined, 50);
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph');
      setLoading(false);
    }
  }, [systemName]);

  useEffect(() => {
    fetchGraph();
    
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [fetchGraph]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mx-auto mb-4" />
          <p className="text-gray-600">Loading dependency map...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-red-50 rounded-xl">
        <div className="text-center">
          <p className="text-red-600 font-bold mb-2">Error</p>
          <p className="text-red-500">{error}</p>
          <button
            onClick={fetchGraph}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-4 bg-white/95 backdrop-blur px-4 py-2 rounded-xl shadow-lg">
        <span className="font-bold text-slate-800">{stats.nodes} nodes</span>
        <span className="text-slate-300">|</span>
        <span className="font-bold text-indigo-600">{stats.edges} edges</span>
        <button
          onClick={fetchGraph}
          className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium text-sm"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur px-4 py-2 rounded-xl shadow-lg">
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORY_COLORS).slice(0, 6).map(([cat, color]) => (
            <span
              key={cat}
              className="flex items-center gap-1 text-xs font-medium"
            >
              <span 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              {cat}
            </span>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur px-4 py-2 rounded-xl shadow-lg text-sm text-slate-600">
        <strong>Click node</strong> to highlight connections • <strong>Click edge</strong> to view security path
      </div>

      {/* Cytoscape container */}
      <div 
        ref={containerRef}
        className="w-full h-[700px] bg-gradient-to-br from-slate-50 to-indigo-50 rounded-xl border border-slate-200"
      />

      {/* Security Path Popup */}
      <SecurityPathPopup 
        path={selectedPath}
        onClose={() => setSelectedPath(null)}
      />
    </div>
  );
}

