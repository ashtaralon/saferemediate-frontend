'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import cytoscape, { Core } from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import { 
  Shield, Database, Key, Globe, 
  RefreshCw, ZoomIn, ZoomOut, Maximize2,
  ChevronRight, AlertTriangle, CheckCircle, X,
  Layers, Search, ArrowRight, Download
} from 'lucide-react'

if (typeof window !== 'undefined') {
  try { cytoscape.use(coseBilkent) } catch (e) {}
}

const COLORS: Record<string, string> = {
  IAMRole: '#8b5cf6', SecurityGroup: '#f97316', S3Bucket: '#06b6d4',
  EC2: '#10b981', Lambda: '#10b981', RDS: '#6366f1',
  Internet: '#ef4444', External: '#ef4444', Service: '#3b82f6',
  User: '#ec4899', Role: '#8b5cf6',
}

const SHAPES: Record<string, string> = {
  IAMRole: 'hexagon', SecurityGroup: 'octagon', S3Bucket: 'barrel',
  EC2: 'ellipse', Lambda: 'ellipse', RDS: 'round-diamond',
  Internet: 'diamond', External: 'diamond', Service: 'round-rectangle',
}

interface EdgeTrafficData {
  source_sg?: string
  target_sg?: string
  port?: string
  total_hits: number
  unique_sources: string[]
  bytes_transferred: number
  recommendation: 'keep' | 'tighten' | 'remove'
  recommendation_reason: string
  confidence: number
  is_public: boolean
}

interface Props {
  systemName: string
  graphData: any
  isLoading: boolean
  onNodeClick: (nodeId: string, nodeType: string, nodeName: string) => void
  onRefresh: () => void
}

export default function GraphView({ systemName, graphData, isLoading, onNodeClick, onRefresh }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [edgeTrafficData, setEdgeTrafficData] = useState<EdgeTrafficData | null>(null)
  const [edgeLoading, setEdgeLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightRisks, setHighlightRisks] = useState(false)
  const [isLive, setIsLive] = useState(true)

  // Fetch traffic data for a selected edge
  const fetchEdgeTrafficData = useCallback(async (edge: any) => {
    setEdgeLoading(true)
    setEdgeTrafficData(null)
    
    try {
      const sgId = edge.source_sg || edge.target_sg || 
        (edge.source?.includes('sg-') ? edge.source : null) ||
        (edge.target?.includes('sg-') ? edge.target : null)
      
      if (sgId) {
        const res = await fetch(`/api/proxy/security-groups/${sgId}/gap-analysis?days=365`)
        if (res.ok) {
          const data = await res.json()
          const rules = data.rules_analysis || []
          const matchingRule = rules.find((r: any) => 
            r.port_range === edge.port || edge.label?.includes(r.port_range)
          ) || rules[0]
          
          const isPublic = matchingRule?.source === '0.0.0.0/0'
          const totalHits = matchingRule?.traffic?.connection_count || 0
          
          setEdgeTrafficData({
            source_sg: data.sg_id,
            target_sg: edge.target,
            port: matchingRule?.port_range || edge.port,
            total_hits: totalHits,
            unique_sources: matchingRule?.traffic?.unique_sources || [],
            bytes_transferred: matchingRule?.traffic?.bytes_transferred || 0,
            recommendation: totalHits === 0 ? 'remove' : isPublic ? 'tighten' : 'keep',
            recommendation_reason: totalHits === 0 
              ? 'No traffic observed in 365 days'
              : isPublic 
                ? `Public rule (0.0.0.0/0) but only ${matchingRule?.traffic?.unique_sources?.length || 0} sources used`
                : `Active traffic: ${totalHits} connections`,
            confidence: matchingRule?.recommendation?.confidence || 80,
            is_public: isPublic
          })
          return
        }
      }
      
      // Fallback
      setEdgeTrafficData({
        port: edge.port || edge.label,
        total_hits: edge.traffic_bytes || 0,
        unique_sources: [],
        bytes_transferred: edge.traffic_bytes || 0,
        recommendation: edge.type === 'internet' ? 'tighten' : 'keep',
        recommendation_reason: edge.type === 'internet' 
          ? 'Internet-exposed connection - review for least privilege'
          : 'Internal connection',
        confidence: 60,
        is_public: edge.type === 'internet'
      })
    } catch (e) {
      console.error('Failed to fetch edge traffic:', e)
      setEdgeTrafficData(null)
    } finally {
      setEdgeLoading(false)
    }
  }, [])

  // Export graph as image
  const exportGraph = () => {
    if (!cyRef.current) return
    const png = cyRef.current.png({ full: true, scale: 2 })
    const a = document.createElement('a')
    a.href = png
    a.download = `dependency-map-${systemName}-${new Date().toISOString().slice(0,10)}.png`
    a.click()
  }

  // Toggle highlight risks
  const toggleHighlightRisks = () => {
    if (!cyRef.current) return
    const cy = cyRef.current
    
    if (highlightRisks) {
      cy.elements().removeClass('risk-highlight risk-dimmed')
      setHighlightRisks(false)
    } else {
      cy.elements().addClass('risk-dimmed')
      cy.edges('[type="internet"]').removeClass('risk-dimmed').addClass('risk-highlight')
      cy.edges('[type="internet"]').connectedNodes().removeClass('risk-dimmed').addClass('risk-highlight')
      cy.nodes('[lpScore < 50]').removeClass('risk-dimmed').addClass('risk-highlight')
      setHighlightRisks(true)
    }
  }

  useEffect(() => {
    if (!isLive) return
    const i = setInterval(onRefresh, 30000)
    return () => clearInterval(i)
  }, [isLive, onRefresh])

  useEffect(() => {
    if (!containerRef.current || !graphData || isLoading) return
    if (cyRef.current) cyRef.current.destroy()

    const elements: cytoscape.ElementDefinition[] = []
    const nodeIds = new Set<string>()
    
    ;(graphData.nodes || []).forEach((n: any) => {
      if (searchQuery && !n.name?.toLowerCase().includes(searchQuery.toLowerCase())) return
      nodeIds.add(n.id)
      elements.push({
        group: 'nodes',
        data: { id: n.id, label: (n.name || n.id).substring(0, 18), type: n.type, lpScore: n.lpScore, ...n }
      })
    })
    
    ;(graphData.edges || []).forEach((e: any, i: number) => {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return
      elements.push({
        group: 'edges',
        data: { id: e.id || `e${i}`, source: e.source, target: e.target, label: e.port ? `:${e.port}` : '', type: e.type, ...e }
      })
    })

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        { selector: 'node', style: {
          'label': 'data(label)', 'text-valign': 'bottom', 'text-margin-y': 8,
          'font-size': '10px', 'width': 40, 'height': 40, 'border-width': 3,
          'background-color': '#6b7280', 'border-color': '#6b7280',
        }},
        ...Object.entries(COLORS).map(([t, c]) => ({
          selector: `node[type="${t}"]`,
          style: { 'background-color': c, 'border-color': c, 'shape': SHAPES[t] || 'ellipse' } as any
        })),
        { selector: 'node[lpScore < 50]', style: { 'border-color': '#dc2626', 'border-width': 4 }},
        { selector: 'node[lpScore >= 50][lpScore < 80]', style: { 'border-color': '#f59e0b' }},
        { selector: 'node[lpScore >= 80]', style: { 'border-color': '#10b981' }},
        { selector: 'edge', style: {
          'width': 2, 'line-color': '#94a3b8', 'target-arrow-color': '#94a3b8',
          'target-arrow-shape': 'triangle', 'curve-style': 'bezier',
          'label': 'data(label)', 'font-size': '9px', 'text-rotation': 'autorotate',
        }},
        { selector: 'edge[type="internet"]', style: { 'line-color': '#ef4444', 'target-arrow-color': '#ef4444', 'line-style': 'dashed' }},
        { selector: 'edge[type="iam_trust"]', style: { 'line-color': '#8b5cf6', 'target-arrow-color': '#8b5cf6', 'line-style': 'dashed' }},
        { selector: 'edge[type="network"]', style: { 'line-color': '#f97316', 'target-arrow-color': '#f97316' }},
        { selector: '.highlighted', style: { 'border-width': 5, 'border-color': '#fbbf24', 'z-index': 999 }},
        { selector: 'edge.highlighted', style: { 'width': 4, 'line-color': '#fbbf24', 'target-arrow-color': '#fbbf24' }},
        { selector: '.dimmed', style: { 'opacity': 0.15 }},
        { selector: '.risk-highlight', style: { 'border-width': 5, 'border-color': '#ef4444', 'z-index': 999 }},
        { selector: 'edge.risk-highlight', style: { 'width': 5, 'line-color': '#ef4444', 'target-arrow-color': '#ef4444', 'line-style': 'solid' }},
        { selector: '.risk-dimmed', style: { 'opacity': 0.2 }},
      ],
      layout: { name: 'cose-bilkent', animate: true, nodeDimensionsIncludeLabels: true, idealEdgeLength: 100, nodeRepulsion: 5000 } as any,
      minZoom: 0.2, maxZoom: 3,
    })

    cy.on('tap', 'node', (e) => {
      const data = e.target.data()
      setSelectedNode(data); setSelectedEdge(null)
      cy.elements().addClass('dimmed')
      e.target.closedNeighborhood().removeClass('dimmed')
      e.target.addClass('highlighted')
    })
    
    cy.on('dbltap', 'node', (e) => {
      const data = e.target.data()
      onNodeClick(data.id, data.type, data.name || data.id)
    })
    
    cy.on('tap', 'edge', (e) => {
      const edgeData = e.target.data()
      setSelectedEdge(edgeData); setSelectedNode(null)
      fetchEdgeTrafficData(edgeData)
      cy.elements().addClass('dimmed')
      cy.getElementById(edgeData.source).removeClass('dimmed').addClass('highlighted')
      cy.getElementById(edgeData.target).removeClass('dimmed').addClass('highlighted')
      e.target.removeClass('dimmed').addClass('highlighted')
    })
    cy.on('tap', (e) => {
      if (e.target === cy) { cy.elements().removeClass('dimmed highlighted'); setSelectedNode(null); setSelectedEdge(null) }
    })
    cyRef.current = cy
    return () => cy.destroy()
  }, [graphData, isLoading, searchQuery, fetchEdgeTrafficData, onNodeClick])

  const zoom = (d: number) => cyRef.current?.zoom(cyRef.current.zoom() * (d > 0 ? 1.2 : 0.8))
  const fit = () => cyRef.current?.fit(undefined, 50)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsLive(!isLive)} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isLive ? 'bg-green-100 text-green-700' : 'bg-slate-200'}`}
          >
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
            {isLive ? 'LIVE' : 'PAUSED'}
          </button>
          <button onClick={onRefresh} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button 
            onClick={toggleHighlightRisks} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
              highlightRisks ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" /> 
            {highlightRisks ? 'Clear Risks' : 'Highlight Risks'}
          </button>
          <button onClick={exportGraph} className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 text-white rounded-lg text-sm">
            <Download className="w-4 h-4" /> Export
          </button>
          <span className="text-sm text-slate-500">
            <strong>{graphData?.summary?.totalNodes || graphData?.nodes?.length || 0}</strong> nodes • 
            <strong>{graphData?.summary?.totalEdges || graphData?.edges?.length || 0}</strong> connections
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-40" 
            />
          </div>
          <button onClick={() => zoom(-1)} className="p-1.5 hover:bg-slate-200 rounded"><ZoomOut className="w-4 h-4" /></button>
          <button onClick={() => zoom(1)} className="p-1.5 hover:bg-slate-200 rounded"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={fit} className="p-1.5 hover:bg-slate-200 rounded"><Maximize2 className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Graph Canvas + Side Panel */}
      <div className="flex-1 flex relative">
        <div ref={containerRef} className="flex-1 bg-slate-50" style={{ minHeight: '500px' }} />
        
        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 rounded-lg p-3 text-xs shadow border">
          <div className="font-medium mb-2">Legend</div>
          {Object.entries(COLORS).slice(0, 6).map(([t, c]) => (
            <div key={t} className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: c }} />
              <span>{t}</span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t text-slate-500">
            Double-click node for details
          </div>
        </div>

        {/* Node/Edge Details Panel */}
        {(selectedNode || selectedEdge) && (
          <div className="w-[320px] bg-white border-l p-4 overflow-y-auto relative">
            <button 
              onClick={() => {
                setSelectedNode(null)
                setSelectedEdge(null)
                cyRef.current?.elements().removeClass('dimmed highlighted')
              }} 
              className="absolute top-2 right-2 p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-4 h-4" />
            </button>
            
            {selectedNode && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: COLORS[selectedNode.type] || '#6b7280' }}>
                    {selectedNode.type === 'IAMRole' && <Key className="w-5 h-5" />}
                    {selectedNode.type === 'SecurityGroup' && <Shield className="w-5 h-5" />}
                    {selectedNode.type === 'S3Bucket' && <Database className="w-5 h-5" />}
                    {!['IAMRole', 'SecurityGroup', 'S3Bucket'].includes(selectedNode.type) && <Layers className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold">{selectedNode.name || selectedNode.id}</h3>
                    <p className="text-sm text-slate-500">{selectedNode.type}</p>
                  </div>
                </div>
                
                {selectedNode.lpScore !== undefined && (
                  <div className="p-3 bg-slate-50 rounded-lg mb-2">
                    <span className="text-slate-500">LP Score: </span>
                    <span className={`font-semibold ${selectedNode.lpScore >= 80 ? 'text-green-600' : selectedNode.lpScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {selectedNode.lpScore}%
                    </span>
                  </div>
                )}
                
                {selectedNode.arn && (
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <span className="text-xs text-slate-500">ARN</span>
                    <p className="text-xs font-mono break-all mt-1">{selectedNode.arn}</p>
                  </div>
                )}
                
                <button
                  onClick={() => onNodeClick(selectedNode.id, selectedNode.type, selectedNode.name || selectedNode.id)}
                  className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  View Resource Details
                </button>
              </div>
            )}
            
            {selectedEdge && (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <ArrowRight className="w-5 h-5 text-blue-500" />
                  Connection Analysis
                </h3>
                
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="truncate max-w-[100px] font-medium">{selectedEdge.source}</span>
                    <ChevronRight className="w-4 h-4 flex-shrink-0 text-slate-400" />
                    <span className="truncate max-w-[100px] font-medium">{selectedEdge.target}</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {selectedEdge.port && (
                    <div className="p-2 bg-slate-50 rounded-lg text-center">
                      <div className="text-xs text-slate-500">Port</div>
                      <div className="font-mono font-bold">{selectedEdge.port}</div>
                    </div>
                  )}
                  <div className="p-2 bg-slate-50 rounded-lg text-center">
                    <div className="text-xs text-slate-500">Type</div>
                    <div className={`font-medium capitalize ${selectedEdge.type === 'internet' ? 'text-red-600' : 'text-blue-600'}`}>
                      {selectedEdge.type?.replace('_', ' ')}
                    </div>
                  </div>
                </div>
                
                {edgeLoading ? (
                  <div className="p-4 bg-slate-50 rounded-lg flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                    <span className="text-sm text-slate-500">Loading traffic data...</span>
                  </div>
                ) : edgeTrafficData ? (
                  <>
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="text-xs text-green-600 font-semibold mb-2">📊 ACTUAL TRAFFIC (VPC Flow Logs)</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-slate-500">Hits: </span>
                          <span className="font-bold text-green-700">{edgeTrafficData.total_hits.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Sources: </span>
                          <span className="font-bold">{edgeTrafficData.unique_sources.length}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className={`p-3 rounded-lg border-2 ${
                      edgeTrafficData.recommendation === 'remove' 
                        ? 'bg-red-50 border-red-300' 
                        : edgeTrafficData.recommendation === 'tighten'
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-green-50 border-green-300'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {edgeTrafficData.recommendation === 'remove' && <X className="w-5 h-5 text-red-500" />}
                        {edgeTrafficData.recommendation === 'tighten' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                        {edgeTrafficData.recommendation === 'keep' && <CheckCircle className="w-5 h-5 text-green-500" />}
                        <span className={`font-bold uppercase ${
                          edgeTrafficData.recommendation === 'remove' ? 'text-red-700' :
                          edgeTrafficData.recommendation === 'tighten' ? 'text-amber-700' :
                          'text-green-700'
                        }`}>
                          {edgeTrafficData.recommendation}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">{edgeTrafficData.recommendation_reason}</p>
                    </div>
                    
                    {edgeTrafficData.is_public && (
                      <div className="p-2 bg-red-100 rounded-lg text-red-700 text-sm flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        <span>Public internet access (0.0.0.0/0)</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-500">
                    No traffic data available for this connection
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t bg-slate-50 text-xs text-slate-500 flex justify-between">
        <span className="flex items-center gap-2">
          <Database className="w-3 h-3 text-green-500" />
          Neo4j: {graphData?.summary?.totalNodes || graphData?.nodes?.length || 0} nodes, {graphData?.summary?.totalEdges || graphData?.edges?.length || 0} edges
        </span>
        <span>{graphData?.summary?.internetExposedNodes || 0} internet exposed</span>
      </div>
    </div>
  )
}

