'use client'

/**
 * SafeRemediate - Dynamic AWS Architecture (Cytoscape.js Version)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import cytoscape, { Core } from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import { 
  Shield, Database, Key, Globe, Server, Cloud, 
  RefreshCw, ZoomIn, ZoomOut, Maximize2,
  ChevronRight, AlertTriangle, CheckCircle, X,
  Lock, Network, Layers, Activity, Search, ArrowRight
} from 'lucide-react'

// Register layout
if (typeof window !== 'undefined') {
  try { cytoscape.use(coseBilkent) } catch (e) {}
}

// Colors by resource type
const COLORS: Record<string, string> = {
  IAMRole: '#8b5cf6',
  SecurityGroup: '#f97316',
  S3Bucket: '#06b6d4',
  EC2: '#10b981',
  Lambda: '#10b981',
  RDS: '#6366f1',
  DynamoDB: '#6366f1',
  Internet: '#ef4444',
  External: '#ef4444',
  Service: '#3b82f6',
}

const SHAPES: Record<string, string> = {
  IAMRole: 'hexagon',
  SecurityGroup: 'octagon',
  S3Bucket: 'barrel',
  EC2: 'ellipse',
  Lambda: 'ellipse',
  RDS: 'round-diamond',
  DynamoDB: 'round-diamond',
  Internet: 'diamond',
  External: 'diamond',
  Service: 'round-rectangle',
}

interface Props {
  systemName?: string
}

export default function DynamicAWSArchitecture({ systemName = 'alon-prod' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [isLive, setIsLive] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch data from dependency-map or least-privilege endpoint
  const fetchData = useCallback(async () => {
    try {
      setError(null)
      // Try dependency-map first, fallback to least-privilege
      let res = await fetch(`/api/proxy/dependency-map/full?systemName=${systemName}`)
      
      if (!res.ok) {
        // Fallback to least-privilege and build graph from it
        res = await fetch(`/api/proxy/least-privilege/issues?systemName=${systemName}`)
        if (!res.ok) throw new Error('Failed to fetch data')
        
        const lpData = await res.json()
        const resources = lpData.resources || []
        
        // Build nodes and edges from LP data
        const nodes = resources.map((r: any) => ({
          id: r.id || r.resourceArn,
          name: r.resourceName,
          type: r.resourceType,
          lpScore: r.lpScore,
          arn: r.resourceArn,
        }))
        
        // Infer edges from security group rules
        const edges: any[] = []
        resources.forEach((r: any) => {
          if (r.resourceType === 'SecurityGroup' && r.allowedList) {
            r.allowedList.forEach((rule: any, idx: number) => {
              if (rule.sources) {
                rule.sources.forEach((src: any) => {
                  if (src.sgId) {
                    edges.push({
                      id: `e-${r.id}-${idx}`,
                      source: src.sgId,
                      target: r.id,
                      type: 'network',
                      port: rule.port,
                    })
                  }
                })
              }
            })
          }
        })
        
        setData({ nodes, edges, summary: { totalNodes: nodes.length, totalEdges: edges.length } })
      } else {
        const result = await res.json()
        setData(result)
      }
    } catch (e: any) {
      console.error(e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [systemName])

  useEffect(() => { fetchData() }, [fetchData])
  
  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [isLive, fetchData])

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current || !data || loading) return
    if (cyRef.current) cyRef.current.destroy()

    const elements: cytoscape.ElementDefinition[] = []
    
    // Add nodes
    (data.nodes || []).forEach((node: any) => {
      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: (node.name || node.id || '').substring(0, 18),
          type: node.type,
          lpScore: node.lpScore,
          ...node
        }
      })
    })
    
    // Add edges
    (data.edges || []).forEach((edge: any, idx: number) => {
      elements.push({
        group: 'edges',
        data: {
          id: edge.id || `e${idx}`,
          source: edge.source,
          target: edge.target,
          label: edge.port ? `:${edge.port}` : '',
          type: edge.type,
          ...edge
        }
      })
    })

    if (elements.length === 0) {
      return
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'font-size': '11px',
            'color': '#334155',
            'width': 50,
            'height': 50,
            'border-width': 3,
            'background-color': '#6b7280',
            'border-color': '#6b7280',
          }
        },
        ...Object.entries(COLORS).map(([type, color]) => ({
          selector: `node[type="${type}"]`,
          style: {
            'background-color': color,
            'border-color': color,
            'shape': SHAPES[type] || 'ellipse',
          } as cytoscape.Css.Node
        })),
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '9px',
            'color': '#64748b',
            'text-rotation': 'autorotate',
          }
        },
        {
          selector: 'edge[type="internet"]',
          style: { 'line-color': '#ef4444', 'target-arrow-color': '#ef4444', 'line-style': 'dashed' }
        },
        {
          selector: 'edge[type="iam_trust"]',
          style: { 'line-color': '#8b5cf6', 'target-arrow-color': '#8b5cf6', 'line-style': 'dashed' }
        },
        {
          selector: 'edge[type="network"]',
          style: { 'line-color': '#f97316', 'target-arrow-color': '#f97316' }
        },
        {
          selector: '.highlighted',
          style: { 'border-width': 6, 'border-color': '#fbbf24' }
        },
        {
          selector: '.dimmed',
          style: { 'opacity': 0.15 }
        }
      ],
      layout: { 
        name: 'cose-bilkent', 
        animate: true, 
        animationDuration: 1000,
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 120,
        nodeRepulsion: 8000,
      } as any,
      minZoom: 0.2,
      maxZoom: 3,
    })

    cy.on('tap', 'node', (e) => {
      const node = e.target.data()
      setSelectedNode(node)
      setSelectedEdge(null)
      cy.elements().addClass('dimmed')
      e.target.closedNeighborhood().removeClass('dimmed')
      e.target.addClass('highlighted')
    })

    cy.on('tap', 'edge', (e) => {
      const edge = e.target.data()
      setSelectedEdge(edge)
      setSelectedNode(null)
      cy.elements().addClass('dimmed')
      cy.getElementById(edge.source).removeClass('dimmed').addClass('highlighted')
      cy.getElementById(edge.target).removeClass('dimmed').addClass('highlighted')
      e.target.removeClass('dimmed')
    })

    cy.on('tap', (e) => {
      if (e.target === cy) {
        cy.elements().removeClass('dimmed highlighted')
        setSelectedNode(null)
        setSelectedEdge(null)
      }
    })

    cyRef.current = cy
    return () => cy.destroy()
  }, [data, loading])

  const handleZoom = (dir: number) => {
    if (cyRef.current) {
      const newZoom = cyRef.current.zoom() * (dir > 0 ? 1.2 : 0.8)
      cyRef.current.zoom(newZoom)
    }
  }
  
  const handleFit = () => cyRef.current?.fit(undefined, 50)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-900 rounded-xl border border-slate-700">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
          <span className="text-slate-400">Loading Architecture...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-900 rounded-xl border border-slate-700">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[700px] bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-violet-500" />
            AWS Dependency Map
          </h3>
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              isLive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
            {isLive ? 'LIVE' : 'PAUSED'}
          </button>
          <button 
            onClick={fetchData} 
            className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            <strong className="text-white">{data?.nodes?.length || 0}</strong> nodes • 
            <strong className="text-white ml-1">{data?.edges?.length || 0}</strong> connections
          </span>
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            <button onClick={() => handleZoom(-1)} className="p-1.5 hover:bg-slate-700 rounded text-slate-400">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={() => handleZoom(1)} className="p-1.5 hover:bg-slate-700 rounded text-slate-400">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={handleFit} className="p-1.5 hover:bg-slate-700 rounded text-slate-400">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 flex relative">
        <div ref={containerRef} className="flex-1 bg-slate-950" style={{ minHeight: '500px' }} />
        
        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-slate-800/95 rounded-lg p-3 text-xs border border-slate-700">
          <div className="font-medium text-white mb-2">Resource Types</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(COLORS).slice(0, 8).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
                <span className="text-slate-300">{type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Side Panel */}
        {(selectedNode || selectedEdge) && (
          <div className="w-[320px] bg-slate-800 border-l border-slate-700 p-4 overflow-y-auto">
            <button
              onClick={() => { 
                setSelectedNode(null)
                setSelectedEdge(null)
                cyRef.current?.elements().removeClass('dimmed highlighted') 
              }}
              className="absolute top-2 right-2 p-1 hover:bg-slate-700 rounded text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
            
            {selectedNode && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div 
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: COLORS[selectedNode.type] || '#6b7280' }}
                  >
                    {selectedNode.type === 'IAMRole' && <Key className="w-6 h-6" />}
                    {selectedNode.type === 'SecurityGroup' && <Shield className="w-6 h-6" />}
                    {selectedNode.type === 'S3Bucket' && <Database className="w-6 h-6" />}
                    {!['IAMRole', 'SecurityGroup', 'S3Bucket'].includes(selectedNode.type) && <Layers className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{selectedNode.name || selectedNode.id}</h3>
                    <p className="text-sm text-slate-400">{selectedNode.type}</p>
                  </div>
                </div>
                
                {selectedNode.lpScore !== undefined && (
                  <div className="p-3 bg-slate-900 rounded-lg mb-3">
                    <span className="text-slate-400">LP Score: </span>
                    <span className={`font-bold text-lg ${
                      selectedNode.lpScore >= 80 ? 'text-emerald-400' : 
                      selectedNode.lpScore >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {selectedNode.lpScore}%
                    </span>
                  </div>
                )}
                
                {selectedNode.arn && (
                  <div className="p-3 bg-slate-900 rounded-lg">
                    <span className="text-xs text-slate-500">ARN</span>
                    <p className="text-xs font-mono text-slate-300 break-all mt-1">{selectedNode.arn}</p>
                  </div>
                )}
              </div>
            )}
            
            {selectedEdge && (
              <div>
                <h3 className="font-semibold text-white mb-4">Connection Details</h3>
                <div className="p-3 bg-slate-900 rounded-lg mb-3">
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="truncate">{selectedEdge.source}</span>
                    <ArrowRight className="w-4 h-4 flex-shrink-0 text-violet-400" />
                    <span className="truncate">{selectedEdge.target}</span>
                  </div>
                </div>
                {selectedEdge.port && (
                  <div className="p-3 bg-slate-900 rounded-lg mb-3">
                    <span className="text-slate-400">Port: </span>
                    <span className="font-mono text-white">{selectedEdge.port}</span>
                  </div>
                )}
                <div className="p-3 bg-slate-900 rounded-lg">
                  <span className="text-slate-400">Type: </span>
                  <span className="text-white capitalize">{selectedEdge.type || 'connection'}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

