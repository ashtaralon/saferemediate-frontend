'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, Database, GitBranch, Shield, Server, Box, AlertTriangle } from 'lucide-react';

// ============================================
// TYPES
// ============================================
interface GraphNode {
  id: string;
  label: string;
  name: string;
  type: string;
  props: Record<string, any>;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  props: Record<string, any>;
}

interface Props {
  systemName: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================
const getCategoryColor = (label: string): string => {
  const colors: Record<string, string> = {
    EC2: '#ED7100', EC2Instance: '#ED7100', Lambda: '#ED7100', LambdaFunction: '#ED7100',
    RDSInstance: '#3B48CC', DynamoDBTable: '#3B48CC', DynamoDB: '#3B48CC',
    S3Bucket: '#1B660F', S3: '#1B660F',
    IAMRole: '#DD344C', IAMPolicy: '#DD344C', SecurityGroup: '#DD344C', KMSKey: '#DD344C', Principal: '#DD344C',
    VPC: '#8C4FFF', Subnet: '#8C4FFF', InternetGateway: '#8C4FFF', RouteTable: '#8C4FFF',
    APIGateway: '#E7157B', ApiGateway: '#E7157B', SQSQueue: '#E7157B', EventBus: '#E7157B',
  };
  return colors[label] || '#545B64';
};

const getNodeIcon = (type: string) => {
  switch (type) {
    case 'EC2':
    case 'EC2Instance':
    case 'Lambda':
    case 'LambdaFunction':
      return <Server className="w-4 h-4" />;
    case 'IAMRole':
    case 'IAMPolicy':
    case 'SecurityGroup':
      return <Shield className="w-4 h-4" />;
    case 'S3Bucket':
    case 'S3':
    case 'DynamoDBTable':
    case 'RDSInstance':
      return <Database className="w-4 h-4" />;
    default:
      return <Box className="w-4 h-4" />;
  }
};

const getEdgeColor = (type: string): string => {
  const colors: Record<string, string> = {
    ACTUAL_TRAFFIC: '#10B981',
    OBSERVED_TRAFFIC: '#10B981',
    ALLOWS_TRAFFIC_TO: '#3B82F6',
    API_CALL: '#EC4899',
    ACTUAL_API_CALL: '#EC4899',
    RUNTIME_CALLS: '#F59E0B',
    ACTUAL_S3_ACCESS: '#1B660F',
    S3_OPERATION: '#1B660F',
    ASSUMES_ROLE: '#DD344C',
    CAN_ASSUME: '#DD344C',
    CAN_ACCESS: '#DD344C',
  };
  return colors[type] || '#94A3B8';
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function Neo4jDataView({ systemName }: Props) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'nodes' | 'relationships'>('nodes');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [stats, setStats] = useState({ nodes: 0, edges: 0, types: [] as string[] });

  // Load data from backend API
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/dependency-map/full?systemName=${encodeURIComponent(systemName)}&max_nodes=500`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      // Check if the response contains an error
      if (data.error && (!data.nodes || data.nodes.length === 0)) {
        throw new Error(data.error);
      }

      const rawNodes = data.nodes || [];
      const rawEdges = data.edges || [];

      // Process nodes
      const procNodes: GraphNode[] = rawNodes.map((n: any, i: number) => ({
        id: String(n.id),
        label: n.type || n.label || 'Unknown',
        name: n.name || n.id || `Node-${i}`,
        type: n.type || n.label || 'Unknown',
        props: n.properties || n,
      }));

      // Process edges
      const procEdges: GraphEdge[] = rawEdges.map((e: any, i: number) => ({
        id: String(e.id || `edge-${i}`),
        source: String(e.source || e.from),
        target: String(e.target || e.to),
        type: e.type || e.edge_type || 'CONNECTED',
        props: e.properties || {},
      }));

      // Get unique node types
      const types = [...new Set(procNodes.map(n => n.type))].sort();

      setNodes(procNodes);
      setEdges(procEdges);
      setStats({ nodes: procNodes.length, edges: procEdges.length, types });
      setLoading(false);
    } catch (err: any) {
      console.error('Neo4j data load error:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [systemName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter nodes
  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
      const matchesSearch = !searchTerm ||
        n.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || n.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [nodes, searchTerm, filterType]);

  // Filter edges
  const filteredEdges = useMemo(() => {
    return edges.filter(e => {
      const matchesSearch = !searchTerm ||
        e.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.target.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [edges, searchTerm]);

  // Get node name by id
  const getNodeName = useCallback((id: string) => {
    const node = nodes.find(n => n.id === id);
    return node?.name || id;
  }, [nodes]);

  // Loading state
  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900 rounded-xl">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-3" />
          <p className="text-white text-sm font-medium">Loading Neo4j Data...</p>
          <p className="text-slate-400 text-xs mt-1">Fetching from database</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900 rounded-xl p-4">
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-6 text-center max-w-sm">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 font-medium mb-2">Connection Error</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-900 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/90 border-b border-slate-700">
        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              {stats.nodes.toLocaleString()} Nodes
            </span>
            <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" />
              {stats.edges.toLocaleString()} Relationships
            </span>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-slate-700/50 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('nodes')}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'nodes'
                  ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Nodes
            </button>
            <button
              onClick={() => setActiveTab('relationships')}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'relationships'
                  ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Relationships
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-xs text-white placeholder-slate-400 w-48 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {/* Type filter (only for nodes) */}
          {activeTab === 'nodes' && (
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="all">All Types</option>
              {stats.types.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          {/* Refresh */}
          <button
            onClick={loadData}
            className="px-3 py-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-lg text-xs font-medium hover:opacity-90 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Data table */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'nodes' ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-slate-300 font-medium text-xs">Type</th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium text-xs">Name</th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium text-xs">ID</th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium text-xs">Properties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredNodes.map(node => (
                <tr key={node.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="p-1.5 rounded"
                        style={{ backgroundColor: getCategoryColor(node.type) + '30', color: getCategoryColor(node.type) }}
                      >
                        {getNodeIcon(node.type)}
                      </div>
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: getCategoryColor(node.type) + '20', color: getCategoryColor(node.type) }}
                      >
                        {node.type}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-white text-xs font-medium">{node.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-400 text-xs font-mono">{node.id.length > 30 ? node.id.slice(0, 30) + '...' : node.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(node.props).slice(0, 3).map(([k, v]) => (
                        <span key={k} className="px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded text-[10px]">
                          {k}: {String(v).slice(0, 15)}
                        </span>
                      ))}
                      {Object.keys(node.props).length > 3 && (
                        <span className="px-1.5 py-0.5 bg-slate-700/50 text-slate-500 rounded text-[10px]">
                          +{Object.keys(node.props).length - 3} more
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredNodes.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No nodes found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-slate-300 font-medium text-xs">Type</th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium text-xs">Source</th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium text-xs"></th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium text-xs">Target</th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium text-xs">Properties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredEdges.map(edge => (
                <tr key={edge.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{ backgroundColor: getEdgeColor(edge.type) + '20', color: getEdgeColor(edge.type) }}
                    >
                      {edge.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-white text-xs">{getNodeName(edge.source)}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center">
                      <div className="w-8 h-0.5 rounded" style={{ backgroundColor: getEdgeColor(edge.type) }} />
                      <span style={{ color: getEdgeColor(edge.type) }}>→</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-white text-xs">{getNodeName(edge.target)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(edge.props).slice(0, 3).map(([k, v]) => (
                        <span key={k} className="px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded text-[10px]">
                          {k}: {String(v).slice(0, 15)}
                        </span>
                      ))}
                      {Object.keys(edge.props).length === 0 && (
                        <span className="text-slate-500 text-[10px] italic">No properties</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredEdges.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No relationships found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-t border-slate-700 text-xs text-slate-400">
        <span>
          Showing {activeTab === 'nodes' ? filteredNodes.length : filteredEdges.length} of {activeTab === 'nodes' ? stats.nodes : stats.edges} {activeTab}
        </span>
        <div className="flex items-center gap-4">
          <span className="font-medium">Categories:</span>
          {[
            { color: '#ED7100', label: 'Compute' },
            { color: '#3B48CC', label: 'Database' },
            { color: '#1B660F', label: 'Storage' },
            { color: '#DD344C', label: 'Security' },
            { color: '#8C4FFF', label: 'Network' },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: c.color }} />
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
