"use client"

import { useState, useEffect } from "react"
import { ArrowRight, Shield, Database, Server, Globe, Lock, AlertTriangle, Loader2 } from "lucide-react"

interface PathNode {
  id: string
  name: string
  type: string
}

interface PathEdge {
  type: string
  source: string
  target: string
}

interface DependencyPath {
  source_id: string
  target_id: string
  status: string
  nodes: PathNode[]
  edges: PathEdge[]
  path_length: number
}

const typeIcons: Record<string, any> = {
  SecurityGroup: Shield,
  IAMRole: Lock,
  IAMPolicy: Lock,
  S3Bucket: Database,
  S3: Database,
  EC2: Server,
  RDS: Database,
  DynamoDB: Database,
  DynamoDBTable: Database,
  Lambda: Server,
  ApiGateway: Globe,
  Service: Server,
  External: Globe,
  default: Server,
}

const typeColors: Record<string, string> = {
  SecurityGroup: "bg-[#f9731620] border-orange-400 text-[#f97316]",
  IAMRole: "bg-[#8b5cf615] border-purple-400 text-[#7c3aed]",
  IAMPolicy: "bg-[#8b5cf615] border-purple-400 text-[#7c3aed]",
  S3Bucket: "bg-[#22c55e20] border-green-400 text-[#22c55e]",
  S3: "bg-[#22c55e20] border-green-400 text-[#22c55e]",
  EC2: "bg-[#3b82f620] border-blue-400 text-[#3b82f6]",
  RDS: "bg-[#8b5cf615] border-indigo-400 text-[#7c3aed]",
  DynamoDB: "bg-[#8b5cf615] border-indigo-400 text-[#7c3aed]",
  DynamoDBTable: "bg-[#8b5cf615] border-indigo-400 text-[#7c3aed]",
  Lambda: "bg-[#eab30820] border-yellow-400 text-[#eab308]",
  ApiGateway: "bg-pink-100 border-pink-400 text-pink-700",
  Service: "bg-gray-100 border-gray-400 text-[var(--foreground,#374151)]",
  External: "bg-[#ef444420] border-red-400 text-[#ef4444]",
  default: "bg-gray-100 border-gray-400 text-[var(--foreground,#374151)]",
}

const edgeLabels: Record<string, string> = {
  iam_trust: "trusts",
  network: "connects to",
  internet: "exposed to",
  protects: "protects",
  accesses: "accesses",
  assumes: "assumes",
  default: "",
}

interface Props {
  sourceId?: string
  targetId?: string
  nodes?: PathNode[]
  edges?: PathEdge[]
  title?: string
  showBlockingPoint?: string
}

export function DependencyPathViewer({ 
  sourceId, 
  targetId, 
  nodes: propNodes,
  edges: propEdges,
  title,
  showBlockingPoint 
}: Props) {
  const [path, setPath] = useState<DependencyPath | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (propNodes && propNodes.length > 0) {
      setPath({
        source_id: sourceId || propNodes[0]?.id || "",
        target_id: targetId || propNodes[propNodes.length - 1]?.id || "",
        status: "PROVIDED",
        nodes: propNodes,
        edges: propEdges || [],
        path_length: propNodes.length
      })
      return
    }

    if (!sourceId || !targetId) return

    async function fetchPath() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/proxy/impact-analysis/path/${sourceId}/${targetId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.status === "FOUND" || data.status === "PROVIDED") {
            setPath(data)
          } else {
            setError(data.message || "No path found")
          }
        } else {
          setError("Failed to fetch path")
        }
      } catch (err) {
        setError("Network error")
      } finally {
        setLoading(false)
      }
    }

    fetchPath()
  }, [sourceId, targetId, propNodes, propEdges])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
        <span className="ml-2 text-[var(--muted-foreground,#6b7280)]">Loading dependency path...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--muted-foreground,#9ca3af)]">
        <AlertTriangle className="w-5 h-5 mr-2" />
        <span>{error}</span>
      </div>
    )
  }

  if (!path || path.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--muted-foreground,#9ca3af)]">
        <span>Select resources to view dependency path</span>
      </div>
    )
  }

  return (
    <div className="p-4">
      {title && (
        <h3 className="text-sm font-semibold text-[var(--foreground,#374151)] mb-4">{title}</h3>
      )}
      
      <div className="flex items-center justify-start overflow-x-auto pb-4 gap-2">
        {path.nodes.map((node, idx) => {
          const Icon = typeIcons[node.type] || typeIcons.default
          const colorClass = typeColors[node.type] || typeColors.default
          const isBlockingPoint = showBlockingPoint === node.id
          const edge = path.edges[idx]
          const edgeLabel = edge ? (edgeLabels[edge.type] || edgeLabels.default) : null

          return (
            <div key={node.id} className="flex items-center">
              <div 
                className={`relative flex flex-col items-center p-3 rounded-lg border-2 min-w-[120px] transition-all ${colorClass} ${
                  isBlockingPoint ? "ring-2 ring-red-500 ring-offset-2" : ""
                }`}
              >
                {isBlockingPoint && (
                  <div className="absolute -top-2 -right-2 bg-[#ef444410]0 text-white text-xs px-1.5 py-0.5 rounded-full">
                    BLOCK
                  </div>
                )}
                <Icon className="w-6 h-6 mb-1" />
                <span className="text-xs font-medium text-center truncate max-w-[100px]">
                  {node.name || node.id}
                </span>
                <span className="text-[10px] opacity-70">{node.type}</span>
              </div>

              {idx < path.nodes.length - 1 && (
                <div className="flex flex-col items-center mx-2">
                  <ArrowRight className="w-5 h-5 text-[var(--muted-foreground,#9ca3af)]" />
                  {edgeLabel && (
                    <span className="text-[10px] text-[var(--muted-foreground,#9ca3af)] mt-0.5">{edgeLabel}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--border,#f3f4f6)] flex items-center justify-between text-xs text-[var(--muted-foreground,#6b7280)]">
        <span>{path.nodes.length} resources in path</span>
        {showBlockingPoint && (
          <span className="text-[#ef4444] font-medium">
            Blocking {showBlockingPoint} will break this path
          </span>
        )}
      </div>
    </div>
  )
}

export function DependencyPathVertical({ 
  nodes, 
  edges,
  showBlockingPoint,
  onNodeClick
}: { 
  nodes: PathNode[]
  edges?: PathEdge[]
  showBlockingPoint?: string
  onNodeClick?: (node: PathNode) => void
}) {
  if (!nodes || nodes.length === 0) return null

  return (
    <div className="space-y-1">
      {nodes.map((node, idx) => {
        const Icon = typeIcons[node.type] || typeIcons.default
        const colorClass = typeColors[node.type] || typeColors.default
        const isBlockingPoint = showBlockingPoint === node.id
        const edge = edges?.[idx]

        return (
          <div key={node.id}>
            <button
              onClick={() => onNodeClick?.(node)}
              className={`w-full flex items-center gap-3 p-2 rounded-lg border transition-all hover:shadow-sm ${colorClass} ${
                isBlockingPoint ? "ring-2 ring-red-500" : ""
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium truncate">{node.name || node.id}</div>
                <div className="text-xs opacity-70">{node.type}</div>
              </div>
              {isBlockingPoint && (
                <span className="bg-[#ef444410]0 text-white text-[10px] px-1.5 py-0.5 rounded">
                  BLOCK
                </span>
              )}
            </button>

            {idx < nodes.length - 1 && (
              <div className="flex items-center justify-center py-1">
                <div className="flex flex-col items-center">
                  <div className="w-0.5 h-3 bg-gray-300" />
                  <ArrowRight className="w-4 h-4 text-[var(--muted-foreground,#9ca3af)] rotate-90" />
                  {edge && (
                    <span className="text-[10px] text-[var(--muted-foreground,#9ca3af)]">
                      {edgeLabels[edge.type] || "connects"}
                    </span>
                  )}
                  <div className="w-0.5 h-3 bg-gray-300" />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
