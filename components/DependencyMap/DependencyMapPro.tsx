// PROFESSIONAL DEPENDENCY MAP COMPONENT
// File: components/DependencyMap/DependencyMapPro.tsx

import React, { useState, useEffect, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';

// ============================================================================
// CUSTOM NODE COMPONENT - Rich, Professional Design
// ============================================================================

const CustomResourceNode = ({ data }) => {
  const getNodeStyle = (type, category) => {
    const baseStyle = {
      padding: '16px 20px',
      borderRadius: '12px',
      minWidth: '200px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      border: '2px solid',
      background: 'white',
    };

    const categoryColors = {
      Compute: { bg: '#FFF4E6', border: '#FF9800', icon: '💻' },
      Database: { bg: '#E3F2FD', border: '#2196F3', icon: '🗄️' },
      Storage: { bg: '#F3E5F5', border: '#9C27B0', icon: '📦' },
      Network: { bg: '#E8F5E9', border: '#4CAF50', icon: '🌐' },
      Security: { bg: '#FFEBEE', border: '#F44336', icon: '🔒' },
      Monitoring: { bg: '#FFF3E0', border: '#FF9800', icon: '📊' },
    };

    const colors = categoryColors[category] || { bg: '#F5F5F5', border: '#9E9E9E', icon: '📋' };

    return {
      ...baseStyle,
      background: colors.bg,
      borderColor: colors.border,
      icon: colors.icon,
    };
  };

  const style = getNodeStyle(data.type, data.category);

  return (
    <div style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <span style={{ fontSize: '24px' }}>{style.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#333' }}>
            {data.name}
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
            {data.type}
          </div>
        </div>
      </div>
      
      {data.stats && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '8px', 
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '11px' }}>
            <div style={{ color: '#666' }}>Dependencies</div>
            <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#333' }}>
              {data.stats.dependencies || 0}
            </div>
          </div>
          <div style={{ fontSize: '11px' }}>
            <div style={{ color: '#666' }}>Traffic</div>
            <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#4CAF50' }}>
              {data.stats.trafficPercentage || 0}%
            </div>
          </div>
        </div>
      )}

      {data.criticalPath && (
        <div style={{
          marginTop: '8px',
          padding: '4px 8px',
          background: '#FFF3E0',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 'bold',
          color: '#F57C00',
          textAlign: 'center'
        }}>
          CRITICAL PATH
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DependencyMapPro({ systemName }) {
  const [viewMode, setViewMode] = useState('topology');
  const [selectedResource, setSelectedResource] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDependencyData = async () => {
      try {
        setLoading(true);
        
        const [nodesRes, edgesRes] = await Promise.all([
          fetch(`/api/graph/nodes?system=${systemName}`),
          fetch(`/api/graph/edges?system=${systemName}`)
        ]);

        const nodesData = await nodesRes.json();
        const edgesData = await edgesRes.json();

        const transformedNodes = transformNodesToReactFlow(nodesData.nodes || []);
        const transformedEdges = transformEdgesToReactFlow(edgesData.edges || [], viewMode);

        setNodes(transformedNodes);
        setEdges(transformedEdges);
      } catch (error) {
        console.error('Error fetching dependency data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDependencyData();
  }, [systemName, viewMode]);

  const transformNodesToReactFlow = (rawNodes) => {
    return rawNodes.map((node, index) => ({
      id: node.id || node.arn,
      type: 'custom',
      position: calculatePosition(index, rawNodes.length),
      data: {
        name: node.name,
        type: node.type,
        category: getCategory(node.type),
        stats: {
          dependencies: node.dependencies?.length || 0,
          trafficPercentage: node.trafficPercentage || 0,
        },
        criticalPath: node.criticalPath || false,
        ...node
      },
    }));
  };

  const transformEdgesToReactFlow = (rawEdges, mode) => {
    return rawEdges.map((edge) => {
      const edgeStyle = getEdgeStyle(edge, mode);
      
      return {
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        label: edge.type,
        animated: edge.isActual || false,
        style: edgeStyle.style,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeStyle.color,
        },
        labelStyle: { fontSize: 11, fontWeight: 500 },
        labelBgStyle: { fill: 'white', fillOpacity: 0.9 },
      };
    });
  };

  const calculatePosition = (index, total) => {
    const radius = 300;
    const angle = (index / total) * 2 * Math.PI;
    return {
      x: 400 + radius * Math.cos(angle),
      y: 300 + radius * Math.sin(angle),
    };
  };

  const getCategory = (type) => {
    const categoryMap = {
      'Lambda': 'Compute',
      'EC2': 'Compute',
      'RDS': 'Database',
      'DynamoDB': 'Database',
      'S3': 'Storage',
      'VPC': 'Network',
      'SecurityGroup': 'Security',
      'IAMRole': 'Security',
      'CloudWatch': 'Monitoring',
    };
    
    for (const [key, category] of Object.entries(categoryMap)) {
      if (type.includes(key)) return category;
    }
    return 'Other';
  };

  const getEdgeStyle = (edge, mode) => {
    const styles = {
      topology: {
        style: { stroke: edge.isActual ? '#4CAF50' : '#BDBDBD', strokeWidth: 2 },
        color: edge.isActual ? '#4CAF50' : '#BDBDBD',
      },
      dataflow: {
        style: { stroke: '#2196F3', strokeWidth: Math.max(2, (edge.trafficVolume || 0) / 1000) },
        color: '#2196F3',
      },
      critical: {
        style: { stroke: edge.critical ? '#F44336' : '#E0E0E0', strokeWidth: edge.critical ? 3 : 1 },
        color: edge.critical ? '#F44336' : '#E0E0E0',
      },
      security: {
        style: { stroke: edge.secure ? '#4CAF50' : '#FF9800', strokeWidth: 2 },
        color: edge.secure ? '#4CAF50' : '#FF9800',
      },
    };

    return styles[mode] || styles.topology;
  };

  const nodeTypes = useMemo(() => ({ custom: CustomResourceNode }), []);

  if (loading) {
    return (
      <div style={{ width: '100%', height: '800px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', borderRadius: '8px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔄</div>
          <div style={{ fontSize: '18px', color: '#666' }}>Loading dependency map...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '800px', position: 'relative' }}>
      <Panel position="top-left">
        <div style={{ background: 'white', padding: '12px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', gap: '8px' }}>
          {['topology', 'dataflow', 'critical', 'security'].map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '8px 16px',
                border: viewMode === mode ? '2px solid #2196F3' : '1px solid #ddd',
                borderRadius: '6px',
                background: viewMode === mode ? '#E3F2FD' : 'white',
                cursor: 'pointer',
                fontWeight: viewMode === mode ? 'bold' : 'normal',
              }}
            >
              {mode === 'topology' && '🏗️ Topology'}
              {mode === 'dataflow' && '📊 Data Flow'}
              {mode === 'critical' && '⚠️ Critical Path'}
              {mode === 'security' && '🔒 Security'}
            </button>
          ))}
        </div>
      </Panel>

      <Panel position="top-right">
        <div style={{ background: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', minWidth: '250px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Legend</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '20px', height: '3px', background: '#4CAF50' }} />
              <span>Actual Traffic</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '20px', height: '3px', background: '#BDBDBD' }} />
              <span>Allowed (Not Used)</span>
            </div>
          </div>
        </div>
      </Panel>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(event, node) => setSelectedResource(node.data)}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#f5f5f5" gap={16} />
        <Controls />
        <MiniMap nodeColor={(node) => {
          const colors = { Compute: '#FF9800', Database: '#2196F3', Storage: '#9C27B0', Network: '#4CAF50', Security: '#F44336' };
          return colors[node.data.category] || '#9E9E9E';
        }} />
      </ReactFlow>

      {selectedResource && (
        <Panel position="bottom-right">
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', minWidth: '350px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>{selectedResource.name}</h3>
              <button onClick={() => setSelectedResource(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>
            <div style={{ marginTop: '16px', fontSize: '12px', color: '#666' }}>
              <div style={{ marginBottom: '12px' }}><strong>Type:</strong> {selectedResource.type}</div>
              <div><strong>ARN:</strong> <code style={{ fontSize: '11px' }}>{selectedResource.arn}</code></div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

