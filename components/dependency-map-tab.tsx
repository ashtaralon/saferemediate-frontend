'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import cytoscape, { Core } from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import { 
  Shield, Database, Key, Globe, Server, Cloud, 
  RefreshCw, ZoomIn, ZoomOut, Maximize2,
  ChevronRight, AlertTriangle, CheckCircle, X,
  Network, Layers, Activity, Search, ArrowRight
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

interface Props { systemName: string }

export default function DependencyMapTab({ systemName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [isLive, setIsLive] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/dependency-map/graph?systemName=${systemName}`)
      if (res.ok) setData(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [systemName])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    if (!isLive) return
    const i = setInterval(fetchData, 30000)
    return () => clearInterval(i)
  }, [isLive, fetchData])

  useEffect(() => {
    if (!containerRef.current || !data || loading) return
    if (cyRef.current) cyRef.current.destroy()

    const elements: cytoscape.ElementDefinition[] = []
    const nodeIds = new Set<string>()
    
    ;(data.nodes || []).forEach((n: any) => {
      if (searchQuery && !n.name?.toLowerCase().includes(searchQuery.toLowerCase())) return
      nodeIds.add(n.id)
      elements.push({
        group: 'nodes',
        data: { id: n.id, label: (n.name || n.id).substring(0, 18), type: n.type, lpScore: n.lpScore, ...n }
      })
    })
    
    ;(data.edges || []).forEach((e: any, i: number) => {
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
      ],
      layout: { name: 'cose-bilkent', animate: true, nodeDimensionsIncludeLabels: true, idealEdgeLength: 100, nodeRepulsion: 5000 } as any,
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
      if (e.target === cy) { cy.elements().removeClass('dimmed highlighted'); setSelectedNode(null); setSelectedEdge(null) }
    })
    cyRef.current = cy
    return () => cy.destroy()
  }, [data, loading, searchQuery])

  const zoom = (d: number) => cyRef.current?.zoom(cyRef.current.zoom() * (d > 0 ? 1.2 : 0.8))
  const fit = () => cyRef.current?.fit(undefined, 50)

  if (loading) return <div className="flex items-center justify-center h-[600px]"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /></div>

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsLive(!isLive)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isLive ? 'bg-green-100 text-green-700' : 'bg-slate-200'}`}>
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
            {isLive ? 'LIVE' : 'PAUSED'}
          </button>
          <button onClick={fetchData} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <span className="text-sm text-slate-500"><strong>{data?.summary?.totalNodes || 0}</strong> nodes • <strong>{data?.summary?.totalEdges || 0}</strong> connections</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-40" />
          </div>
          <button onClick={() => zoom(-1)} className="p-1.5 hover:bg-slate-200 rounded"><ZoomOut className="w-4 h-4" /></button>
          <button onClick={() => zoom(1)} className="p-1.5 hover:bg-slate-200 rounded"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={fit} className="p-1.5 hover:bg-slate-200 rounded"><Maximize2 className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex-1 flex relative">
        <div ref={containerRef} className="flex-1 bg-slate-50" />
        
        <div className="absolute bottom-4 left-4 bg-white/95 rounded-lg p-3 text-xs shadow border">
          <div className="font-medium mb-2">Legend</div>
          {Object.entries(COLORS).slice(0,6).map(([t,c]) => (
            <div key={t} className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded" style={{backgroundColor:c}}/><span>{t}</span></div>
          ))}
        </div>

        {(selectedNode || selectedEdge) && (
          <div className="w-[320px] bg-white border-l p-4 overflow-y-auto relative">
            <button onClick={() => {setSelectedNode(null);setSelectedEdge(null);cyRef.current?.elements().removeClass('dimmed highlighted')}} className="absolute top-2 right-2 p-1 hover:bg-slate-100 rounded"><X className="w-4 h-4"/></button>
            {selectedNode && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{backgroundColor:COLORS[selectedNode.type]||'#6b7280'}}>
                    {selectedNode.type==='IAMRole'&&<Key className="w-5 h-5"/>}
                    {selectedNode.type==='SecurityGroup'&&<Shield className="w-5 h-5"/>}
                    {selectedNode.type==='S3Bucket'&&<Database className="w-5 h-5"/>}
                    {!['IAMRole','SecurityGroup','S3Bucket'].includes(selectedNode.type)&&<Layers className="w-5 h-5"/>}
                  </div>
                  <div><h3 className="font-semibold">{selectedNode.name||selectedNode.id}</h3><p className="text-sm text-slate-500">{selectedNode.type}</p></div>
                </div>
                {selectedNode.lpScore!==undefined&&<div className="p-3 bg-slate-50 rounded-lg mb-2"><span className="text-slate-500">LP Score: </span><span className={`font-semibold ${selectedNode.lpScore>=80?'text-green-600':selectedNode.lpScore>=50?'text-amber-600':'text-red-600'}`}>{selectedNode.lpScore}%</span></div>}
                {selectedNode.arn&&<div className="p-3 bg-slate-50 rounded-lg"><span className="text-xs text-slate-500">ARN</span><p className="text-xs font-mono break-all mt-1">{selectedNode.arn}</p></div>}
                {selectedNode.ports?.length>0&&<div className="p-3 bg-slate-50 rounded-lg mt-2"><span className="text-xs text-slate-500">Ports</span><div className="flex flex-wrap gap-1 mt-1">{selectedNode.ports.map((p:string,i:number)=><span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">{p}</span>)}</div></div>}
              </div>
            )}
            {selectedEdge && (
              <div>
                <h3 className="font-semibold mb-4 flex items-center gap-2"><ArrowRight className="w-5 h-5 text-blue-500"/>Connection</h3>
                <div className="p-3 bg-slate-50 rounded-lg mb-2"><div className="flex items-center gap-2 text-sm"><span className="truncate max-w-[100px]">{selectedEdge.source}</span><ChevronRight className="w-4 h-4 flex-shrink-0"/><span className="truncate max-w-[100px]">{selectedEdge.target}</span></div></div>
                {selectedEdge.port&&<div className="p-3 bg-slate-50 rounded-lg mb-2"><span className="text-slate-500">Port: </span><span className="font-mono">{selectedEdge.port}</span></div>}
                <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-500">Type: </span><span className="capitalize">{selectedEdge.type?.replace('_',' ')}</span></div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t bg-slate-50 text-xs text-slate-500 flex justify-between">
        <span className="flex items-center gap-2"><Database className="w-3 h-3 text-green-500"/>Neo4j: {data?.summary?.totalNodes||0} nodes, {data?.summary?.totalEdges||0} edges</span>
        <span>{data?.summary?.internetExposedNodes||0} internet exposed</span>
      </div>
    </div>
  )
}
