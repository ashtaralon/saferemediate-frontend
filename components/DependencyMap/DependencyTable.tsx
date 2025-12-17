// PROFESSIONAL DEPENDENCY TABLE VIEW
// File: components/DependencyMap/DependencyTable.tsx

import React, { useState, useEffect } from 'react';

export default function DependencyTable({ systemName }) {
  const [dependencies, setDependencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState(new Set());

  useEffect(() => {
    fetchDependencies();
  }, [systemName]);

  const fetchDependencies = async () => {
    try {
      setLoading(true);
      const [nodesRes, edgesRes] = await Promise.all([
        fetch(`/api/graph/nodes?system=${systemName}`),
        fetch(`/api/graph/edges?system=${systemName}`)
      ]);

      const nodes = await nodesRes.json();
      const edges = await edgesRes.json();

      const deps = buildDependencyList(nodes.nodes || [], edges.edges || []);
      setDependencies(deps);
    } catch (error) {
      console.error('Error fetching dependencies:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildDependencyList = (nodes, edges) => {
    return nodes.map(node => {
      const outgoing = edges.filter(e => e.source === node.id);
      const incoming = edges.filter(e => e.target === node.id);

      return {
        id: node.id,
        name: node.name,
        type: node.type,
        dependsOn: outgoing.map(e => ({
          id: e.target,
          name: getNodeName(e.target, nodes),
          type: e.type,
          isActual: e.isActual,
        })),
        usedBy: incoming.map(e => ({
          id: e.source,
          name: getNodeName(e.source, nodes),
          type: e.type,
          isActual: e.isActual,
        })),
        arn: node.arn,
      };
    });
  };

  const getNodeName = (id, nodes) => {
    const node = nodes.find(n => n.id === id);
    return node ? node.name : id;
  };

  const toggleRow = (id) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', background: 'white', borderRadius: '8px', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔄</div>
          <div style={{ fontSize: '18px', color: '#666' }}>Loading dependencies...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', background: 'white', borderRadius: '8px' }}>
      <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 'bold' }}>Dependency Analysis</h2>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
              <th style={{ padding: '12px', textAlign: 'center', width: '50px' }}></th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Resource</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Type</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Depends On</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Used By</th>
            </tr>
          </thead>
          <tbody>
            {dependencies.map(dep => (
              <React.Fragment key={dep.id}>
                <tr 
                  style={{ borderBottom: '1px solid #E5E7EB', cursor: 'pointer', background: expandedRows.has(dep.id) ? '#F9FAFB' : 'white' }}
                  onClick={() => toggleRow(dep.id)}
                >
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ fontSize: '18px' }}>{expandedRows.has(dep.id) ? '▼' : '▶'}</span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: '500' }}>{dep.name}</div>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{dep.id.substring(0, 50)}...</div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ padding: '4px 8px', background: '#E3F2FD', borderRadius: '4px', fontSize: '12px', fontWeight: '500' }}>
                      {dep.type}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ padding: '4px 12px', background: '#FFF4E6', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold' }}>
                      {dep.dependsOn.length}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ padding: '4px 12px', background: '#E8F5E9', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold' }}>
                      {dep.usedBy.length}
                    </span>
                  </td>
                </tr>

                {expandedRows.has(dep.id) && (
                  <tr>
                    <td colSpan={5} style={{ padding: '20px', background: '#FAFBFC' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div>
                          <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>📤 Depends On</h4>
                          {dep.dependsOn.length === 0 ? (
                            <div style={{ fontSize: '12px', color: '#9CA3AF', fontStyle: 'italic' }}>No dependencies</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {dep.dependsOn.map((target, idx) => (
                                <div key={idx} style={{ padding: '8px 12px', background: 'white', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '12px' }}>
                                  <div style={{ fontWeight: '500' }}>{target.name}</div>
                                  <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>via {target.type}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>📥 Used By</h4>
                          {dep.usedBy.length === 0 ? (
                            <div style={{ fontSize: '12px', color: '#9CA3AF', fontStyle: 'italic' }}>Not used</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {dep.usedBy.map((source, idx) => (
                                <div key={idx} style={{ padding: '8px 12px', background: 'white', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '12px' }}>
                                  <div style={{ fontWeight: '500' }}>{source.name}</div>
                                  <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>via {source.type}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

