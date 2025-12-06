"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { apiGet } from "@/lib/api-client"
import {
  Search,
  RefreshCw,
  Filter,
  ZoomIn,
  ZoomOut,
  Maximize,
  X,
  ChevronRight,
  AlertCircle,
  Server,
  Database,
  HardDrive,
  Network,
  Shield,
  Link2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-react"

interface DependencyNode {
  id: string
  type: string
  name: string
  category: string
  displayName?: string
  icon?: string
  totalConnections: number
  criticality: string
  x?: number
  y?: number
  vx?: number
  vy?: number
}

interface DependencyEdge {
  source: string
  target: string
  type: string
  isActual: boolean
  color?: string
  animated?: boolean
  style?: string
}

interface DependencyData {
  nodes: DependencyNode[]
  edges: DependencyEdge[]
  statistics: {
    totalNodes: number
    totalEdges: number
    actualEdges: number
    infrastructureEdges: number
  }
  criticalNodes: DependencyNode[]
  clusters: Record<string, DependencyNode[]>
}

interface BlastRadius {
  downstream: { id: string; name: string; type: string }[]
  upstream: { id: string; name: string; type: string }[]
}

// Category colors matching AWS style
const categoryColors: Record<string, string> = {
  Compute: "#FF9900",
  compute: "#FF9900",
  Database: "#3B48CC",
  database: "#3B48CC",
  Storage: "#3F8624",
  storage: "#3F8624",
  Networking: "#8C4FFF",
  networking: "#8C4FFF",
  Network: "#8C4FFF",
  network: "#8C4FFF",
  Security: "#DD344C",
  security: "#DD344C",
  Integration: "#E7157B",
  integration: "#E7157B",
  default: "#6B7280",
}

const getCategoryIcon = (category: string) => {
  const cat = category?.toLowerCase() || ""
  if (cat.includes("compute")) return Server
  if (cat.includes("database")) return Database
  if (cat.includes("storage")) return HardDrive
  if (cat.includes("network")) return Network
  if (cat.includes("security")) return Shield
  if (cat.includes("integration")) return Link2
  return Server
}

export function DependencyMapTab({ systemName }: { systemName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>()

  const [data, setData] = useState<DependencyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // View state
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [draggedNode, setDraggedNode] = useState<DependencyNode | null>(null)

  // Selection state
  const [selectedNode, setSelectedNode] = useState<DependencyNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<DependencyNode | null>(null)
  const [blastRadius, setBlastRadius] = useState<BlastRadius | null>(null)

  // Filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [connectionFilter, setConnectionFilter] = useState("all")
  const [showLabels, setShowLabels] = useState(true)
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  // Simulation nodes with positions
  const [simNodes, setSimNodes] = useState<DependencyNode[]>([])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const result = await apiGet("/dependency-map")

      if (result.error && result.nodes?.length === 0) {
        setError("Backend unavailable")
        // Use mock data for demo
        setData(getMockData())
      } else {
        setData(result)
        setError(null)
      }
      setLastUpdated(new Date())
    } catch (err) {
      console.error("[v0] Failed to fetch dependency map:", err)
      setError("Failed to load dependency map")
      setData(getMockData())
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchBlastRadius = useCallback(async (nodeId: string) => {
    try {
      const result = await apiGet(`/dependency-map/blast-radius/${encodeURIComponent(nodeId)}`)
      setBlastRadius(result)
    } catch (err) {
      console.error("[v0] Failed to fetch blast radius:", err)
      setBlastRadius({ downstream: [], upstream: [] })
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Initialize force simulation
  useEffect(() => {
    if (!data?.nodes?.length) return

    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.width
    const height = canvas.height
    const centerX = width / 2
    const centerY = height / 2

    // Initialize node positions in a circle
    const nodes = data.nodes.map((node, i) => {
      const angle = (i / data.nodes.length) * 2 * Math.PI
      const radius = Math.min(width, height) * 0.35
      return {
        ...node,
        x: centerX + Math.cos(angle) * radius * (0.5 + Math.random() * 0.5),
        y: centerY + Math.sin(angle) * radius * (0.5 + Math.random() * 0.5),
        vx: 0,
        vy: 0,
      }
    })

    setSimNodes(nodes)
  }, [data])

  // Force simulation animation
  useEffect(() => {
    if (!simNodes.length || !data?.edges) return

    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.width
    const height = canvas.height
    const centerX = width / 2
    const centerY = height / 2

    let tickCount = 0
    const maxTicks = 300

    const simulate = () => {
      if (tickCount >= maxTicks) return

      const alpha = Math.max(0.01, 1 - tickCount / maxTicks)
      const nodeMap = new Map(simNodes.map((n) => [n.id, n]))

      // Apply forces
      simNodes.forEach((node) => {
        if (!node.x || !node.y) return

        // Center gravity
        node.vx = (node.vx || 0) + (centerX - node.x) * 0.001 * alpha
        node.vy = (node.vy || 0) + (centerY - node.y) * 0.001 * alpha

        // Repulsion from other nodes
        simNodes.forEach((other) => {
          if (node.id === other.id || !other.x || !other.y) return
          const dx = node.x! - other.x!
          const dy = node.y! - other.y!
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const minDist = 80
          if (dist < minDist) {
            const force = ((minDist - dist) / dist) * 0.5 * alpha
            node.vx! += dx * force
            node.vy! += dy * force
          }
        })
      })

      // Link forces
      data.edges.forEach((edge) => {
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (!source || !target || !source.x || !target.x) return

        const dx = target.x! - source.x!
        const dy = target.y! - source.y!
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const targetDist = 150
        const force = ((dist - targetDist) / dist) * 0.03 * alpha

        source.vx! += dx * force
        source.vy! += dy * force
        target.vx! -= dx * force
        target.vy! -= dy * force
      })

      // Apply velocities
      simNodes.forEach((node) => {
        if (!node.x || !node.y) return
        node.x += node.vx || 0
        node.y += node.vy || 0
        node.vx = (node.vx || 0) * 0.9
        node.vy = (node.vy || 0) * 0.9

        // Keep in bounds
        node.x = Math.max(50, Math.min(width - 50, node.x))
        node.y = Math.max(50, Math.min(height - 50, node.y))
      })

      setSimNodes([...simNodes])
      tickCount++

      if (tickCount < maxTicks) {
        animationRef.current = requestAnimationFrame(simulate)
      }
    }

    animationRef.current = requestAnimationFrame(simulate)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [simNodes, data?.edges])

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    // Clear
    ctx.fillStyle = "#f8fafc"
    ctx.fillRect(0, 0, width, height)

    ctx.save()
    ctx.translate(panOffset.x, panOffset.y)
    ctx.scale(zoom, zoom)

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]))

    // Filter edges
    const filteredEdges = data.edges.filter((edge) => {
      if (connectionFilter === "actual" && !edge.isActual) return false
      if (connectionFilter === "infra" && edge.isActual) return false
      return true
    })

    // Draw edges
    filteredEdges.forEach((edge) => {
      const source = nodeMap.get(edge.source)
      const target = nodeMap.get(edge.target)
      if (!source?.x || !target?.x) return

      const isHighlighted = hoveredNode && (hoveredNode.id === edge.source || hoveredNode.id === edge.target)
      const isDimmed = hoveredNode && !isHighlighted

      ctx.beginPath()
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)

      if (edge.isActual) {
        ctx.strokeStyle = isDimmed ? "rgba(139, 92, 246, 0.1)" : isHighlighted ? "#7C3AED" : "#8B5CF6"
        ctx.lineWidth = isHighlighted ? 3 : 2
        ctx.setLineDash([])
      } else {
        ctx.strokeStyle = isDimmed ? "rgba(156, 163, 175, 0.1)" : isHighlighted ? "#6B7280" : "#9CA3AF"
        ctx.lineWidth = isHighlighted ? 2 : 1
        ctx.setLineDash([4, 4])
      }

      ctx.stroke()
      ctx.setLineDash([])

      // Animated particles for ACTUAL edges
      if (edge.isActual && !isDimmed) {
        const t = (Date.now() / 1000) % 1
        const px = source.x + (target.x - source.x) * t
        const py = source.y + (target.y - source.y) * t
        ctx.beginPath()
        ctx.arc(px, py, 3, 0, Math.PI * 2)
        ctx.fillStyle = "#8B5CF6"
        ctx.fill()
      }
    })

    // Filter nodes
    const filteredNodes = simNodes.filter((node) => {
      if (searchQuery && !node.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (categoryFilter !== "all" && node.category?.toLowerCase() !== categoryFilter.toLowerCase()) return false
      return true
    })

    // Draw nodes
    filteredNodes.forEach((node) => {
      if (!node.x || !node.y) return

      const isSelected = selectedNode?.id === node.id
      const isHovered = hoveredNode?.id === node.id
      const isDimmed =
        hoveredNode &&
        hoveredNode.id !== node.id &&
        !data.edges.some(
          (e) =>
            (e.source === hoveredNode.id && e.target === node.id) ||
            (e.target === hoveredNode.id && e.source === node.id),
        )

      const color = categoryColors[node.category] || categoryColors.default
      const size = Math.max(20, Math.min(40, 15 + node.totalConnections * 2))

      // Critical node ring
      if (node.criticality === "critical" || node.criticality === "high") {
        ctx.beginPath()
        ctx.arc(node.x, node.y, size + 6, 0, Math.PI * 2)
        ctx.strokeStyle = "#EF4444"
        ctx.lineWidth = 3
        ctx.stroke()
      }

      // Node circle
      ctx.beginPath()
      ctx.arc(node.x, node.y, size, 0, Math.PI * 2)
      ctx.fillStyle = isDimmed ? `${color}33` : isSelected ? color : `${color}CC`
      ctx.fill()
      ctx.strokeStyle = isHovered || isSelected ? "#1F2937" : color
      ctx.lineWidth = isHovered || isSelected ? 3 : 2
      ctx.stroke()

      // Icon (simplified as text)
      ctx.fillStyle = isDimmed ? "#9CA3AF" : "#FFFFFF"
      ctx.font = `${size * 0.6}px sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      const iconText = node.category?.charAt(0).toUpperCase() || "?"
      ctx.fillText(iconText, node.x, node.y)

      // Label
      if (showLabels && !isDimmed) {
        ctx.fillStyle = "#374151"
        ctx.font = "11px sans-serif"
        ctx.textAlign = "center"
        const displayName = node.displayName || node.name
        const truncated = displayName.length > 15 ? displayName.slice(0, 15) + "..." : displayName
        ctx.fillText(truncated, node.x, node.y + size + 14)
      }
    })

    ctx.restore()

    // Request next frame for particle animation
    requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (canvas) canvas.dispatchEvent(new Event("render"))
    })
  }, [
    simNodes,
    data,
    zoom,
    panOffset,
    hoveredNode,
    selectedNode,
    searchQuery,
    categoryFilter,
    connectionFilter,
    showLabels,
  ])

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = (e.clientX - rect.left - panOffset.x) / zoom
    const y = (e.clientY - rect.top - panOffset.y) / zoom

    // Check if clicking on a node
    const clickedNode = simNodes.find((node) => {
      if (!node.x || !node.y) return false
      const size = Math.max(20, Math.min(40, 15 + node.totalConnections * 2))
      const dx = node.x - x
      const dy = node.y - y
      return Math.sqrt(dx * dx + dy * dy) < size
    })

    if (clickedNode) {
      setDraggedNode(clickedNode)
      setSelectedNode(clickedNode)
      fetchBlastRadius(clickedNode.id)
    } else {
      setIsDragging(true)
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = (e.clientX - rect.left - panOffset.x) / zoom
    const y = (e.clientY - rect.top - panOffset.y) / zoom

    if (draggedNode) {
      // Move the dragged node
      setSimNodes((nodes) => nodes.map((n) => (n.id === draggedNode.id ? { ...n, x, y, vx: 0, vy: 0 } : n)))
    } else if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    } else {
      // Check hover
      const hovered = simNodes.find((node) => {
        if (!node.x || !node.y) return false
        const size = Math.max(20, Math.min(40, 15 + node.totalConnections * 2))
        const dx = node.x - x
        const dy = node.y - y
        return Math.sqrt(dx * dx + dy * dy) < size
      })
      setHoveredNode(hovered || null)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDraggedNode(null)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)))
  }

  const fitToScreen = () => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }

  const stats = data?.statistics || { totalNodes: 0, totalEdges: 0, actualEdges: 0, infrastructureEdges: 0 }
  const criticalCount = data?.criticalNodes?.length || 0
  const isolatedCount = simNodes.filter((n) => n.totalConnections === 0).length

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] bg-gray-50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Network className="w-6 h-6 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Dependency Map</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`p-2 rounded-lg border ${showFilterPanel ? "bg-purple-50 border-purple-300" : "border-gray-300"}`}
            >
              <Filter className="w-4 h-4" />
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.totalNodes}</div>
            <div className="text-xs text-gray-500">Nodes</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.totalEdges}</div>
            <div className="text-xs text-gray-500">Edges</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.actualEdges}</div>
            <div className="text-xs text-purple-600">ACTUAL</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-gray-600">{stats.infrastructureEdges}</div>
            <div className="text-xs text-gray-500">Infra</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
            <div className="text-xs text-red-600">Critical</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">{isolatedCount}</div>
            <div className="text-xs text-amber-600">Isolated</div>
          </div>
        </div>
      </div>

      {/* Filter panel */}
      {showFilterPanel && (
        <div className="bg-white border-b border-gray-200 p-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="all">All</option>
              <option value="compute">Compute</option>
              <option value="database">Database</option>
              <option value="storage">Storage</option>
              <option value="networking">Networking</option>
              <option value="security">Security</option>
              <option value="integration">Integration</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Connection:</span>
            <select
              value={connectionFilter}
              onChange={(e) => setConnectionFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="all">All</option>
              <option value="actual">ACTUAL Only</option>
              <option value="infra">Infrastructure Only</option>
            </select>
          </div>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`flex items-center gap-1 text-sm px-3 py-1 rounded ${showLabels ? "bg-purple-100 text-purple-700" : "bg-gray-100"}`}
          >
            {showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            Labels
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph canvas */}
        <div ref={containerRef} className="flex-1 relative">
          <canvas
            ref={canvasRef}
            width={1200}
            height={800}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />

          {/* Zoom controls */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-2">
            <button
              onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
              className="p-2 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
              className="p-2 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={fitToScreen}
              className="p-2 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-20 bg-white rounded-lg shadow border border-gray-200 p-3">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-8 h-0.5 bg-purple-500" />
                <span>ACTUAL Traffic</span>
              </div>
              <div className="flex items-center gap-1">
                <div
                  className="w-8 h-0.5 bg-gray-400 border-dashed border-t-2 border-gray-400"
                  style={{ borderStyle: "dashed" }}
                />
                <span>Infrastructure</span>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <div className="w-3 h-3 rounded-full bg-[#FF9900]" /> <span>Compute</span>
                <div className="w-3 h-3 rounded-full bg-[#3B48CC]" /> <span>Database</span>
                <div className="w-3 h-3 rounded-full bg-[#3F8624]" /> <span>Storage</span>
                <div className="w-3 h-3 rounded-full bg-[#8C4FFF]" /> <span>Network</span>
                <div className="w-3 h-3 rounded-full bg-[#DD344C]" /> <span>Security</span>
              </div>
            </div>
          </div>

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
            </div>
          )}
        </div>

        {/* Details panel */}
        {selectedNode && (
          <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => {
                    const IconComp = getCategoryIcon(selectedNode.category)
                    return (
                      <IconComp
                        className="w-5 h-5"
                        style={{ color: categoryColors[selectedNode.category] || "#6B7280" }}
                      />
                    )
                  })()}
                  <span className="font-medium text-gray-900 truncate">
                    {selectedNode.displayName || selectedNode.name}
                  </span>
                </div>
                <button onClick={() => setSelectedNode(null)} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{selectedNode.category}</span>
                {(selectedNode.criticality === "critical" || selectedNode.criticality === "high") && (
                  <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {selectedNode.criticality.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 border-b border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Connections</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded p-2">
                  <div className="text-lg font-semibold">
                    {data?.edges.filter((e) => e.target === selectedNode.id).length || 0}
                  </div>
                  <div className="text-xs text-gray-500">Incoming</div>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <div className="text-lg font-semibold">
                    {data?.edges.filter((e) => e.source === selectedNode.id).length || 0}
                  </div>
                  <div className="text-xs text-gray-500">Outgoing</div>
                </div>
                <div className="bg-purple-50 rounded p-2">
                  <div className="text-lg font-semibold text-purple-600">{selectedNode.totalConnections}</div>
                  <div className="text-xs text-purple-600">Total</div>
                </div>
              </div>
            </div>

            {blastRadius && (
              <div className="p-4 border-b border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Blast Radius</h4>
                <p className="text-xs text-gray-500 mb-3">If this fails, affects:</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <ArrowRight className="w-4 h-4 text-red-500" />
                    <span className="font-medium">{blastRadius.downstream?.length || 0}</span>
                    <span className="text-gray-500">downstream services</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <ArrowLeft className="w-4 h-4 text-amber-500" />
                    <span className="font-medium">{blastRadius.upstream?.length || 0}</span>
                    <span className="text-gray-500">upstream dependencies</span>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4">
              <h4 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                Infrastructure
              </h4>
              <div className="space-y-1">
                {data?.edges
                  .filter((e) => !e.isActual && (e.source === selectedNode.id || e.target === selectedNode.id))
                  .slice(0, 5)
                  .map((edge, i) => {
                    const otherId = edge.source === selectedNode.id ? edge.target : edge.source
                    const otherNode = simNodes.find((n) => n.id === otherId)
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-500">
                        <ChevronRight className="w-3 h-3" />
                        <span className="truncate">{otherNode?.name || otherId}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Last updated */}
      {lastUpdated && (
        <div className="bg-white border-t border-gray-200 px-4 py-2 text-xs text-gray-500 text-right">
          Updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

// Mock data for demo when backend is unavailable
function getMockData(): DependencyData {
  return {
    nodes: [
      {
        id: "1",
        name: "payment-processor",
        type: "Lambda",
        category: "Compute",
        totalConnections: 8,
        criticality: "critical",
      },
      {
        id: "2",
        name: "prod-database",
        type: "RDS",
        category: "Database",
        totalConnections: 12,
        criticality: "critical",
      },
      { id: "3", name: "user-api", type: "Lambda", category: "Compute", totalConnections: 6, criticality: "high" },
      { id: "4", name: "payment-logs", type: "S3", category: "Storage", totalConnections: 4, criticality: "medium" },
      {
        id: "5",
        name: "payment-queue",
        type: "SQS",
        category: "Integration",
        totalConnections: 5,
        criticality: "high",
      },
      {
        id: "6",
        name: "auth-service",
        type: "Lambda",
        category: "Compute",
        totalConnections: 7,
        criticality: "critical",
      },
      {
        id: "7",
        name: "cache-cluster",
        type: "ElastiCache",
        category: "Database",
        totalConnections: 9,
        criticality: "high",
      },
      {
        id: "8",
        name: "api-gateway",
        type: "APIGateway",
        category: "Networking",
        totalConnections: 10,
        criticality: "critical",
      },
      { id: "9", name: "prod-vpc", type: "VPC", category: "Networking", totalConnections: 15, criticality: "critical" },
      {
        id: "10",
        name: "payment-sg",
        type: "SecurityGroup",
        category: "Security",
        totalConnections: 8,
        criticality: "high",
      },
    ],
    edges: [
      { source: "8", target: "1", type: "ACTUAL_INVOKES", isActual: true },
      { source: "1", target: "2", type: "ACTUAL_QUERIES", isActual: true },
      { source: "1", target: "4", type: "ACTUAL_WRITES", isActual: true },
      { source: "1", target: "5", type: "ACTUAL_PUBLISHES", isActual: true },
      { source: "8", target: "3", type: "ACTUAL_INVOKES", isActual: true },
      { source: "3", target: "2", type: "ACTUAL_QUERIES", isActual: true },
      { source: "6", target: "7", type: "ACTUAL_CACHES", isActual: true },
      { source: "8", target: "6", type: "ACTUAL_INVOKES", isActual: true },
      { source: "1", target: "9", type: "RESIDES_IN", isActual: false },
      { source: "2", target: "9", type: "RESIDES_IN", isActual: false },
      { source: "1", target: "10", type: "PROTECTED_BY", isActual: false },
      { source: "2", target: "10", type: "PROTECTED_BY", isActual: false },
    ],
    statistics: { totalNodes: 10, totalEdges: 12, actualEdges: 8, infrastructureEdges: 4 },
    criticalNodes: [
      {
        id: "1",
        name: "payment-processor",
        type: "Lambda",
        category: "Compute",
        totalConnections: 8,
        criticality: "critical",
      },
      {
        id: "2",
        name: "prod-database",
        type: "RDS",
        category: "Database",
        totalConnections: 12,
        criticality: "critical",
      },
    ],
    clusters: {},
  }
}
