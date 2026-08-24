"use client"

import { useMemo } from 'react'
import ReactFlow, { Background, Controls, MarkerType, type Edge, type Node } from 'reactflow'
import 'reactflow/dist/style.css'

interface GraphResource {
  resource_id?: string | null
  resource_name?: string
  resource_type?: string
  system_names?: string[]
}

interface ImpactEdge {
  relationship: string
  direction: string
  plane: string
  evidence_kind?: string
  is_stale?: boolean
  neighbor: GraphResource
}

interface TransitivePath {
  relationships: string[]
  planes: string[]
  middle: GraphResource
  endpoint: GraphResource
  interpretation?: string
}

interface GraphImpact {
  address: string
  requested_ref?: string | null
  query_status: string
  resolved: boolean
  direct_edges: ImpactEdge[]
  transitive_paths?: TransitivePath[]
}

export function ChangeImpactGraph({ impacts }: { impacts: GraphImpact[] }) {
  const { nodes, edges, clipped } = useMemo(() => buildGraph(impacts), [impacts])
  if (nodes.length === 0) return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">No resolved graph target is available to draw. This is an evidence gap, not proof of no impact.</div>

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
        <Legend color="bg-blue-500" label="Configured / allowed" />
        <Legend color="bg-emerald-500" label="Observed runtime" />
        <Legend color="bg-violet-500" label="Derived / inferred" />
        <Legend color="bg-slate-400" label="Unknown evidence" />
      </div>
      <div className="h-[520px] overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#334155" gap={22} size={1} />
          <Controls showInteractive={false} className="!border-slate-700 !bg-slate-900 !text-white" />
        </ReactFlow>
      </div>
      {clipped && <p className="mt-2 text-xs text-amber-700">The canvas is intentionally bounded for readability. Exact relationship totals and remaining evidence stay available in the dossier.</p>}
      <p className="mt-2 text-xs text-slate-500">Solid arrows preserve direct graph direction. Dashed two-hop paths are bounded context with direction intentionally omitted. Edge color preserves the evidence plane. A visible connection is not automatically a causal application dependency.</p>
    </div>
  )
}

function buildGraph(impacts: GraphImpact[]): { nodes: Node[]; edges: Edge[]; clipped: boolean } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const seenNodes = new Set<string>()
  let clipped = false
  const selectedImpacts = impacts.slice(0, 12)
  if (impacts.length > selectedImpacts.length) clipped = true

  selectedImpacts.forEach((impact, targetIndex) => {
    const targetId = `target-${targetIndex}`
    const targetY = targetIndex * 240
    nodes.push({
      id: targetId,
      type: 'default',
      position: { x: 20, y: targetY },
      data: { label: <NodeLabel eyebrow="Proposed change" title={impact.address} detail={impact.requested_ref || impact.query_status} /> },
      style: {
        width: 260,
        border: '2px solid #a78bfa',
        borderRadius: 14,
        background: '#2e1065',
        color: '#fff',
        padding: 4,
      },
    })
    seenNodes.add(targetId)
    const resourceNodes = new Map<string, string>()
    const selectedEdges = (impact.direct_edges || []).slice(0, 10)
    if ((impact.direct_edges || []).length > selectedEdges.length) clipped = true
    selectedEdges.forEach((item, edgeIndex) => {
      const identity = item.neighbor?.resource_id || `${item.neighbor?.resource_type}-${item.neighbor?.resource_name}`
      const resourceKey = String(identity)
      const neighborId = resourceNodes.get(resourceKey) || `neighbor-${targetIndex}-${resourceKey}`
      if (!seenNodes.has(neighborId)) {
        const columnsOffset = edgeIndex % 2 === 0 ? 0 : 290
        nodes.push({
          id: neighborId,
          type: 'default',
          position: { x: 380 + columnsOffset, y: targetY - 70 + Math.floor(edgeIndex / 2) * 92 },
          data: {
            label: <NodeLabel
              eyebrow={item.neighbor?.resource_type || 'Resource'}
              title={item.neighbor?.resource_name || String(identity)}
              detail={(item.neighbor?.system_names || []).join(', ') || String(identity)}
            />,
          },
          style: {
            width: 250,
            border: `1px solid ${planeColor(item.plane)}`,
            borderRadius: 12,
            background: '#0f172a',
            color: '#fff',
            opacity: item.is_stale ? 0.58 : 1,
            padding: 3,
          },
        })
        seenNodes.add(neighborId)
        resourceNodes.set(resourceKey, neighborId)
      }
      const outgoing = item.direction === 'OUTGOING'
      edges.push({
        id: `edge-${targetIndex}-${edgeIndex}`,
        source: outgoing ? targetId : neighborId,
        target: outgoing ? neighborId : targetId,
        label: item.relationship.replace(/_/g, ' '),
        labelStyle: { fill: '#cbd5e1', fontSize: 9, fontWeight: 700 },
        labelBgStyle: { fill: '#0f172a', fillOpacity: 0.88 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        style: { stroke: planeColor(item.plane), strokeWidth: item.plane === 'OBSERVED' ? 2.5 : 1.7, opacity: item.is_stale ? 0.45 : 0.9 },
        markerEnd: { type: MarkerType.ArrowClosed, color: planeColor(item.plane), width: 16, height: 16 },
        animated: item.plane === 'OBSERVED' && !item.is_stale,
      })
    })

    const selectedPaths = (impact.transitive_paths || []).slice(0, 4)
    if ((impact.transitive_paths || []).length > selectedPaths.length) clipped = true
    selectedPaths.forEach((path, pathIndex) => {
      const middleKey = resourceKey(path.middle, `middle-${pathIndex}`)
      const endpointKey = resourceKey(path.endpoint, `endpoint-${pathIndex}`)
      const middleId = resourceNodes.get(middleKey) || `path-middle-${targetIndex}-${middleKey}`
      const endpointId = resourceNodes.get(endpointKey) || `path-endpoint-${targetIndex}-${endpointKey}`
      if (!seenNodes.has(middleId)) {
        nodes.push(pathNode(middleId, path.middle, 760, targetY - 45 + pathIndex * 96, path.planes[0]))
        seenNodes.add(middleId)
        resourceNodes.set(middleKey, middleId)
      }
      if (!seenNodes.has(endpointId)) {
        nodes.push(pathNode(endpointId, path.endpoint, 1040, targetY - 45 + pathIndex * 96, path.planes[1]))
        seenNodes.add(endpointId)
        resourceNodes.set(endpointKey, endpointId)
      }
      edges.push(contextEdge(`path-first-${targetIndex}-${pathIndex}`, targetId, middleId, path.relationships[0], path.planes[0]))
      edges.push(contextEdge(`path-second-${targetIndex}-${pathIndex}`, middleId, endpointId, path.relationships[1], path.planes[1]))
    })
  })
  return { nodes, edges, clipped }
}

function resourceKey(resource: GraphResource, fallback: string): string {
  return String(resource.resource_id || `${resource.resource_type || 'Resource'}-${resource.resource_name || fallback}`)
}

function pathNode(id: string, resource: GraphResource, x: number, y: number, plane: string): Node {
  const identity = resourceKey(resource, id)
  return {
    id,
    type: 'default',
    position: { x, y },
    data: { label: <NodeLabel eyebrow={`${resource.resource_type || 'Resource'} · 2-hop`} title={resource.resource_name || identity} detail={(resource.system_names || []).join(', ') || identity} /> },
    style: { width: 240, border: `1px dashed ${planeColor(plane)}`, borderRadius: 12, background: '#172033', color: '#fff', padding: 3 },
  }
}

function contextEdge(id: string, source: string, target: string, relationship: string | undefined, plane: string | undefined): Edge {
  return {
    id,
    source,
    target,
    label: (relationship || 'context').replace(/_/g, ' '),
    labelStyle: { fill: '#94a3b8', fontSize: 8, fontWeight: 700 },
    labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
    style: { stroke: planeColor(plane || 'UNKNOWN'), strokeWidth: 1.2, strokeDasharray: '5 5', opacity: 0.55 },
  }
}

function NodeLabel({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="max-w-[220px] text-left"><div className="truncate text-[9px] font-black uppercase tracking-wide text-violet-300">{eyebrow}</div><div className="mt-1 truncate text-xs font-bold text-white" title={title}>{title}</div><div className="mt-1 truncate font-mono text-[9px] text-slate-400" title={detail}>{detail}</div></div>
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</span>
}

function planeColor(plane: string): string {
  if (plane === 'ALLOWED') return '#3b82f6'
  if (plane === 'OBSERVED') return '#10b981'
  if (plane === 'DERIVED') return '#8b5cf6'
  return '#94a3b8'
}
