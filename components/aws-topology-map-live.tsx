'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import cytoscape, { Core } from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import { Shield, Database, Key, Globe, Server, RefreshCw, ZoomIn, ZoomOut, Maximize2, ChevronRight, X, Layers, Search, ArrowRight, Play, Pause } from 'lucide-react'

if (typeof window !== 'undefined') { try { cytoscape.use(coseBilkent) } catch (e) {} }

const COLORS: Record<string, string> = { IAMRole: '#8b5cf6', SecurityGroup: '#f97316', S3Bucket: '#06b6d4', EC2: '#10b981', Lambda: '#10b981', RDS: '#6366f1', Internet: '#ef4444', External: '#ef4444', Service: '#3b82f6' }
const SHAPES: Record<string, string> = { IAMRole: 'hexagon', SecurityGroup: 'octagon', S3Bucket: 'barrel', EC2: 'ellipse', Lambda: 'ellipse', RDS: 'round-diamond', Internet: 'diamond', External: 'diamond', Service: 'round-rectangle' }

interface Props { systemName: string }

export default function AWSTopologyMapLive({ systemName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const animationRef = useRef<number | null>(null)
  const particlesRef = useRef<Map<string, { element: HTMLDivElement; progress: number; speed: number }>>(new Map())
  
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [isLive, setIsLive] = useState(true)
  const [showDataFlow, setShowDataFlow] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/dependency-map/graph?systemName=${systemName}`)
      if (res.ok) setData(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [systemName])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (!isLive) return; const i = setInterval(fetchData, 30000); return () => clearInterval(i) }, [isLive, fetchData])

  // Animate particles along edges
  const animateParticles = useCallback(() => {
    if (!cyRef.current || !showDataFlow) return
    
    const cy = cyRef.current
    const container = containerRef.current
    if (!container) return

    cy.edges().forEach((edge) => {
      const edgeId = edge.id()
      const edgeData = edge.data()
      
      // Get or create particle for this edge
      let particle = particlesRef.current.get(edgeId)
      
      if (!particle) {
        const div = document.createElement('div')
        div.className = 'flow-particle'
        div.style.cssText = `
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 1000;
          transition: opacity 0.3s;
          box-shadow: 0 0 6px 2px currentColor;
        `
        // Color based on edge type
        const color = edgeData.type === 'internet' ? '#ef4444' : 
                      edgeData.type === 'iam_trust' ? '#8b5cf6' : 
                      edgeData.type === 'network' ? '#f97316' : '#3b82f6'
        div.style.backgroundColor = color
        div.style.color = color
        
        container.appendChild(div)
        particle = { 
          element: div, 
          progress: Math.random(), // Random start position
          speed: 0.003 + Math.random() * 0.004 // Varying speeds
        }
        particlesRef.current.set(edgeId, particle)
      }

      // Update particle position
      particle.progress += particle.speed
      if (particle.progress > 1) particle.progress = 0

      // Get edge source and target positions
      const sourceNode = cy.getElementById(edge.data('source'))
      const targetNode = cy.getElementById(edge.data('target'))
      
      if (sourceNode.length && targetNode.length) {
        const sourcePos = sourceNode.renderedPosition()
        const targetPos = targetNode.renderedPosition()
        
        // Interpolate position along edge
        const x = sourcePos.x + (targetPos.x - sourcePos.x) * particle.progress
        const y = sourcePos.y + (targetPos.y - sourcePos.y) * particle.progress
        
        particle.element.style.left = `${x - 4}px`
        particle.element.style.top = `${y - 4}px`
        particle.element.style.opacity = '1'
      }
    })

    animationRef.current = requestAnimationFrame(animateParticles)
  }, [showDataFlow])

  // Start/stop animation
  useEffect(() => {
    if (showDataFlow && cyRef.current) {
      animateParticles()
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      // Hide all particles
      particlesRef.current.forEach(p => p.element.style.opacity = '0')
    }
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [showDataFlow, animateParticles])

  // Cleanup particles on unmount
  useEffect(() => {
    return () => {
      particlesRef.current.forEach(p => p.element.remove())
      particlesRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || !data || loading) return
    
    // Clear old particles
    particlesRef.current.forEach(p => p.element.remove())
    particlesRef.current.clear()
    
    if (cyRef.current) cyRef.current.destroy()

    const elements: cytoscape.ElementDefinition[] = []
    const nodeIds = new Set<string>()
    
    ;(data.nodes || []).forEach((n: any) => {
      if (searchQuery && !n.name?.toLowerCase().includes(searchQuery.toLowerCase())) return
      nodeIds.add(n.id)
      elements.push({ group: 'nodes', data: { id: n.id, label: (n.name || n.id).substring(0, 20), type: n.type, lpScore: n.lpScore, ...n } })
    })
    
    ;(data.edges || []).forEach((e: any, i: number) => {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return
      elements.push({ group: 'edges', data: { id: e.id || `e${i}`, source: e.source, target: e.target, label: e.port ? `:${e.port}` : '', type: e.type, ...e } })
    })

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        { selector: 'node', style: { 
          'label': 'data(label)', 'text-valign': 'bottom', 'text-margin-y': 10, 
          'font-size': '11px', 'font-weight': 500, 'color': '#374151',
          'width': 45, 'height': 45, 'border-width': 3, 
          'background-color': '#6b7280', 'border-color': '#6b7280',
          'text-outline-color': '#fff', 'text-outline-width': 2
        }},
        ...Object.entries(COLORS).map(([t, c]) => ({ selector: `node[type="${t}"]`, style: { 'background-color': c, 'border-color': c, 'shape': SHAPES[t] || 'ellipse' } as any })),
        { selector: 'node[lpScore < 50]', style: { 'border-color': '#dc2626', 'border-width': 4 }},
        { selector: 'node[lpScore >= 50][lpScore < 80]', style: { 'border-color': '#f59e0b' }},
        { selector: 'node[lpScore >= 80]', style: { 'border-color': '#10b981' }},
        { selector: 'edge', style: { 
          'width': 2, 'line-color': '#cbd5e1', 'target-arrow-color': '#cbd5e1',
          'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 
          'label': 'data(label)', 'font-size': '10px', 'text-rotation': 'autorotate',
          'text-margin-y': -12, 'color': '#64748b',
          'text-background-color': '#fff', 'text-background-opacity': 0.9, 'text-background-padding': '3px'
        }},
        { selector: 'edge[type="internet"]', style: { 'line-color': '#fca5a5', 'target-arrow-color': '#ef4444', 'line-style': 'dashed', 'line-dash-pattern': [8, 4] }},
        { selector: 'edge[type="iam_trust"]', style: { 'line-color': '#c4b5fd', 'target-arrow-color': '#8b5cf6', 'line-style': 'dashed', 'line-dash-pattern': [6, 3] }},
        { selector: 'edge[type="network"]', style: { 'line-color': '#fdba74', 'target-arrow-color': '#f97316' }},
        { selector: '.highlighted', style: { 'border-width': 6, 'border-color': '#fbbf24', 'z-index': 999 }},
        { selector: 'edge.highlighted', style: { 'width': 4, 'line-color': '#fbbf24', 'target-arrow-color': '#fbbf24', 'z-index': 999 }},
        { selector: '.dimmed', style: { 'opacity': 0.15 }},
      ],
      layout: { name: 'cose-bilkent', animate: true, animationDuration: 1000, nodeDimensionsIncludeLabels: true, idealEdgeLength: 120, nodeRepulsion: 6000, gravity: 0.3 } as any,
      minZoom: 0.2, maxZoom: 3,
    })

    cy.on('tap', 'node', (e) => { 
      setSelectedNode(e.target.data()); setSelectedEdge(null)
      cy.elements().addClass('dimmed')
      e.target.closedNeighborhood().removeClass('dimmed')
      e.target.addClass('highlighted')
    })
    cy.on('tap', 'edge', (e) => { 
      setSelectedEdge(e.target.data()); setSelectedNode(null)
      cy.elements().addClass('dimmed')
      cy.getElementById(e.target.data().source).removeClass('dimmed').addClass('highlighted')
      cy.getElementById(e.target.data().target).removeClass('dimmed').addClass('highlighted')
      e.target.removeClass('dimmed').addClass('highlighted')
    })
    cy.on('tap', (e) => { 
      if (e.target === cy) { 
        cy.elements().removeClass('dimmed highlighted')
        setSelectedNode(null); setSelectedEdge(null) 
      } 
    })
    
    // Restart animation after graph is ready
    cy.on('layoutstop', () => {
      if (showDataFlow) {
        if (animationRef.current) cancelAnimationFrame(animationRef.current)
        animateParticles()
      }
    })
    
    cyRef.current = cy
    return () => { 
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      cy.destroy() 
    }
  }, [data, loading, searchQuery])

  const zoom = (d: number) => cyRef.current?.zoom(cyRef.current.zoom() * (d > 0 ? 1.2 : 0.8))
  const fit = () => cyRef.current?.fit(undefined, 50)

  if (loading) return <div className="flex items-center justify-center h-[700px] bg-white rounded-xl border"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /></div>

  return (
    <div className="flex flex-col h-[700px] bg-white rounded-xl border overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border-b">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsLive(!isLive)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${isLive ? 'bg-green-100 text-green-700 shadow-sm' : 'bg-slate-200 text-slate-600'}`}>
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />{isLive ? 'LIVE' : 'PAUSED'}
          </button>
          <button onClick={fetchData} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          {/* Data Flow Toggle */}
          <button 
            onClick={() => setShowDataFlow(!showDataFlow)} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${showDataFlow ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'}`}
          >
            {showDataFlow ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            Data Flow
          </button>
          <div className="h-6 w-px bg-slate-300 mx-1" />
          <span className="text-sm text-slate-600"><strong className="text-slate-900">{data?.summary?.totalNodes || 0}</strong> nodes</span>
          <span className="text-sm text-slate-600">•</span>
          <span className="text-sm text-slate-600"><strong className="text-slate-900">{data?.summary?.totalEdges || 0}</strong> connections</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search nodes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} 
              className="pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => zoom(-1)} className="p-1.5 hover:bg-white rounded transition-colors"><ZoomOut className="w-4 h-4 text-slate-600" /></button>
            <button onClick={() => zoom(1)} className="p-1.5 hover:bg-white rounded transition-colors"><ZoomIn className="w-4 h-4 text-slate-600" /></button>
            <button onClick={fit} className="p-1.5 hover:bg-white rounded transition-colors"><Maximize2 className="w-4 h-4 text-slate-600" /></button>
          </div>
        </div>
      </div>
      
      {/* Main Graph Area */}
      <div className="flex-1 flex relative overflow-hidden">
        <div ref={containerRef} className="flex-1 bg-gradient-to-br from-slate-50 via-white to-slate-50" />
        
        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl p-4 text-xs shadow-lg border border-slate-200">
          <div className="font-semibold text-slate-700 mb-3">Resource Types</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {Object.entries(COLORS).slice(0,6).map(([t,c]) => (
              <div key={t} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm shadow-sm" style={{backgroundColor:c}}/>
                <span className="text-slate-600">{t}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 mt-3 pt-3">
            <div className="font-semibold text-slate-700 mb-2">Connections</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-red-400" style={{borderStyle:'dashed'}}/><span className="text-slate-600">Internet</span></div>
              <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-purple-400" style={{borderStyle:'dashed'}}/><span className="text-slate-600">IAM Trust</span></div>
              <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-orange-400"/><span className="text-slate-600">Network</span></div>
            </div>
          </div>
          {showDataFlow && (
            <div className="border-t border-slate-200 mt-3 pt-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-sm shadow-blue-500/50"/>
              <span className="text-slate-500">Data flowing</span>
            </div>
          )}
        </div>

        {/* Side Panel */}
        {(selectedNode || selectedEdge) && (
          <div className="w-[340px] bg-white border-l border-slate-200 p-5 overflow-y-auto shadow-xl">
            <button onClick={() => {setSelectedNode(null);setSelectedEdge(null);cyRef.current?.elements().removeClass('dimmed highlighted')}} 
              className="absolute top-3 right-3 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-slate-400"/>
            </button>
            
            {selectedNode && (
              <div>
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg" style={{backgroundColor:COLORS[selectedNode.type]||'#6b7280'}}>
                    {selectedNode.type==='IAMRole'&&<Key className="w-6 h-6"/>}
                    {selectedNode.type==='SecurityGroup'&&<Shield className="w-6 h-6"/>}
                    {selectedNode.type==='S3Bucket'&&<Database className="w-6 h-6"/>}
                    {!['IAMRole','SecurityGroup','S3Bucket'].includes(selectedNode.type)&&<Layers className="w-6 h-6"/>}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{selectedNode.name||selectedNode.id}</h3>
                    <p className="text-sm text-slate-500">{selectedNode.type}</p>
                  </div>
                </div>
                
                {selectedNode.lpScore!==undefined && (
                  <div className="p-4 bg-slate-50 rounded-xl mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-500">Least Privilege Score</span>
                      <span className={`text-lg font-bold ${selectedNode.lpScore>=80?'text-green-600':selectedNode.lpScore>=50?'text-amber-600':'text-red-600'}`}>
                        {selectedNode.lpScore}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${selectedNode.lpScore>=80?'bg-green-500':selectedNode.lpScore>=50?'bg-amber-500':'bg-red-500'}`} 
                        style={{width:`${selectedNode.lpScore}%`}}/>
                    </div>
                  </div>
                )}
                
                {selectedNode.arn && (
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">ARN</span>
                    <p className="text-xs font-mono text-slate-700 break-all mt-2 leading-relaxed">{selectedNode.arn}</p>
                  </div>
                )}
              </div>
            )}
            
            {selectedEdge && (
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                    <ArrowRight className="w-6 h-6 text-blue-600"/>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Connection</h3>
                    <p className="text-sm text-slate-500 capitalize">{selectedEdge.type?.replace('_',' ')}</p>
                  </div>
                </div>
                
                <div className="p-4 bg-slate-50 rounded-xl mb-3">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Path</span>
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <span className="font-medium text-slate-700 truncate max-w-[120px]">{selectedEdge.source}</span>
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0"/>
                    <span className="font-medium text-slate-700 truncate max-w-[120px]">{selectedEdge.target}</span>
                  </div>
                </div>
                
                {selectedEdge.port && (
                  <div className="p-4 bg-slate-50 rounded-xl mb-3">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Port</span>
                    <p className="text-lg font-mono font-semibold text-slate-900 mt-1">{selectedEdge.port}</p>
                  </div>
                )}
                
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-sm text-blue-700">
                    💡 Click to see full security path including IAM permissions, SG rules, and gap analysis
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="px-4 py-2.5 border-t bg-gradient-to-r from-slate-50 to-slate-100 text-xs text-slate-500 flex justify-between items-center">
        <span className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-green-500"/>
          <span>Neo4j: <strong className="text-slate-700">{data?.summary?.totalNodes||0}</strong> nodes, <strong className="text-slate-700">{data?.summary?.totalEdges||0}</strong> edges</span>
        </span>
        <span className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-red-500"/>
          <span><strong className="text-slate-700">{data?.summary?.internetExposedNodes||0}</strong> internet exposed</span>
        </span>
      </div>
    </div>
  )
}
