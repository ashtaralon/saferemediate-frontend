"use client"

import { useState } from "react"
import { Search, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCw, Download } from "lucide-react"
import { CloudNode } from "./cloud-node"
import { AnimatedFlowLine } from "./animated-flow-line"
import { ArchitectureObjectDetailsPanel } from "./architecture-object-details-panel"

interface Node {
  id: string
  type: string
  name: string
  subLabel?: string
  severity: "critical" | "high" | "medium" | "healthy" | "dormant"
  findingLabel?: string
  x: number
  y: number
  icon: string
}

interface Connection {
  from: string
  to: string
  type: "normal" | "attack" | "data"
  label?: string
}

export function ArchitectureGraph() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [selectedObject, setSelectedObject] = useState<any>(null)
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedIncident, setSelectedIncident] = useState<{
    id: string
    name: string
    severity: "critical" | "high" | "medium" | "low"
  } | null>(null)

  const nodes: Node[] = [
    { id: "internet", type: "internet", name: "Internet", severity: "healthy", x: 100, y: 100, icon: "🌐" },
    { id: "igw", type: "gateway", name: "igw-12344555", severity: "high", x: 300, y: 100, icon: "🚪" },
    {
      id: "ssh-attack",
      type: "finding",
      name: "SSH Brute Force",
      findingLabel: "Attack",
      severity: "critical",
      x: 500,
      y: 80,
      icon: "⚠️",
    },
    { id: "aws-key", type: "key", name: "AWS Access Key", severity: "healthy", x: 700, y: 100, icon: "🔑" },
    { id: "vpc", type: "network", name: "VPC-1123449", severity: "high", x: 300, y: 250, icon: "🔷" },
    { id: "subnet", type: "network", name: "Subnet", severity: "high", x: 500, y: 250, icon: "📡" },
    {
      id: "interface",
      type: "network",
      name: "EC25533",
      subLabel: "Interface",
      severity: "high",
      x: 700,
      y: 250,
      icon: "🔌",
    },
    {
      id: "payment-vm",
      type: "compute",
      name: "Payment VM",
      severity: "critical",
      findingLabel: "Log4Shell Vulnerability (CVE-2021-44228)",
      x: 900,
      y: 250,
      icon: "💻",
    },
    {
      id: "lateral",
      type: "finding",
      name: "Lateral Movement",
      findingLabel: "to Admin User",
      severity: "critical",
      x: 1100,
      y: 230,
      icon: "⚠️",
    },
    { id: "readonly-user", type: "iam", name: "ReadOnly User", severity: "healthy", x: 1100, y: 100, icon: "👤" },
    { id: "admin-user", type: "iam", name: "Prod Admin User", severity: "healthy", x: 1300, y: 200, icon: "👑" },
    { id: "cost-report", type: "storage", name: "Cost Report", severity: "healthy", x: 1300, y: 350, icon: "🪣" },
    { id: "mongodb", type: "database", name: "MongoDB (SB)", severity: "healthy", x: 900, y: 450, icon: "💾" },
  ]

  const connections: Connection[] = [
    { from: "internet", to: "igw", type: "normal" },
    { from: "igw", to: "ssh-attack", type: "attack", label: "SSH Brute Force Attack" },
    { from: "ssh-attack", to: "aws-key", type: "attack" },
    { from: "igw", to: "vpc", type: "normal" },
    { from: "vpc", to: "subnet", type: "normal" },
    { from: "subnet", to: "interface", type: "normal" },
    { from: "interface", to: "payment-vm", type: "normal" },
    { from: "payment-vm", to: "lateral", type: "attack", label: "Lateral Movement Finding" },
    { from: "lateral", to: "admin-user", type: "attack" },
    { from: "payment-vm", to: "mongodb", type: "data", label: "Secret Data" },
    { from: "readonly-user", to: "admin-user", type: "normal" },
    { from: "admin-user", to: "cost-report", type: "normal" },
  ]

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "#DC2626"
      case "high":
        return "#F97316"
      case "medium":
        return "#F59E0B"
      case "healthy":
        return "#10B981"
      case "dormant":
        return "#9CA3AF"
      default:
        return "#6B7280"
    }
  }

  const getNodeColor = (type: string, severity: string) => {
    if (type === "finding") return "#DC2626"
    if (severity === "healthy") return "#10B981"
    if (severity === "critical") return "#DC2626"
    if (severity === "high") return "#F97316"
    return "#3B82F6"
  }

  const handleNodeClick = (node: Node) => {
    setSelectedNode(selectedNode === node.id ? null : node.id)

    if (node.type === "finding" || node.severity === "critical") {
      setSelectedIncident({
        id: `FND-${Math.floor(1000 + Math.random() * 9000)}`,
        name: node.name,
        severity: node.severity as "critical" | "high" | "medium" | "low",
      })
      setModalOpen(true)
    }
  }

  const cloudNodes = [
    {
      id: "api-gateway",
      type: "alb",
      name: "payment-api-lb",
      x: 50,
      y: 50,
      health: "healthy",
      details: { instanceType: "Application LB" },
      width: 200,
      height: 120,
    },
    {
      id: "ec2-1",
      type: "ec2",
      name: "payment-api-1",
      x: 350,
      y: 30,
      health: "healthy",
      metrics: { cpu: "45%", memory: "60%" },
      details: { instanceType: "t3.large", ip: "10.0.1.45" },
      width: 180,
      height: 140,
    },
    {
      id: "ec2-2",
      type: "ec2",
      name: "payment-api-2",
      x: 350,
      y: 200,
      health: "warning",
      metrics: { cpu: "75%", memory: "82%" },
      details: { instanceType: "t3.large", ip: "10.0.1.46" },
      width: 180,
      height: 140,
    },
    {
      id: "rds-primary",
      type: "rds",
      name: "payment-db",
      x: 650,
      y: 100,
      health: "healthy",
      details: { instanceType: "PostgreSQL 14" },
      width: 180,
      height: 150,
    },
    {
      id: "s3-bucket",
      type: "s3",
      name: "payment-logs",
      x: 950,
      y: 50,
      health: "critical",
      details: { size: "245 GB", objects: "12.5K" },
      width: 160,
      height: 140,
    },
    {
      id: "lambda-processor",
      type: "lambda",
      name: "process-payment",
      x: 950,
      y: 230,
      health: "healthy",
      width: 140,
      height: 100,
    },
  ]

  const networkFlows = [
    {
      source: cloudNodes[0],
      target: cloudNodes[1],
      flowType: "http",
      isActive: true,
      throughput: 450,
      label: "450 req/min",
    },
    {
      source: cloudNodes[0],
      target: cloudNodes[2],
      flowType: "http",
      isActive: true,
      throughput: 380,
      label: "380 req/min",
    },
    {
      source: cloudNodes[1],
      target: cloudNodes[3],
      flowType: "database",
      isActive: true,
      throughput: 200,
      label: "DB queries",
    },
    {
      source: cloudNodes[2],
      target: cloudNodes[3],
      flowType: "database",
      isActive: true,
      throughput: 180,
    },
    {
      source: cloudNodes[1],
      target: cloudNodes[4],
      flowType: "storage",
      isActive: true,
      throughput: 100,
      label: "Logs",
    },
    {
      source: cloudNodes[3],
      target: cloudNodes[5],
      flowType: "http",
      isActive: true,
      throughput: 150,
      label: "Events",
    },
  ]

  const handleObjectClick = (objectData: any) => {
    setSelectedObject(objectData)
    setDetailsPanelOpen(true)
  }

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen)
  }

  return (
    <>
      <div className={`${isFullScreen ? "fixed inset-0 z-50" : "space-y-6"}`}>
        {!isFullScreen && (
          <div
            className="rounded-xl p-5 border cursor-pointer transition-colors hover:border-opacity-70"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border-subtle)",
            }}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{isExpanded ? "▼" : "▶"}</span>
                <div>
                  <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                    Architecture Map
                  </h2>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    312 resources mapped • Real-time topology
                  </p>
                </div>
              </div>
              {!isExpanded && (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Click to expand full interactive graph
                </div>
              )}
            </div>
          </div>
        )}

        {(isExpanded || isFullScreen) && (
          <div
            className={`rounded-xl border overflow-hidden ${isFullScreen ? "h-screen" : ""}`}
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div
              className="p-4 border-b sticky top-0 z-20"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                    Architecture Map - Payment-Prod
                  </h2>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    Real-time infrastructure topology
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={toggleFullScreen}
                    className="px-4 py-2 rounded-lg font-semibold text-sm text-white transition-transform hover:scale-105"
                    style={{
                      background: "linear-gradient(to right, #3B82F6, #6366F1)",
                      boxShadow: "0 4px 6px rgba(59, 130, 246, 0.3)",
                    }}
                  >
                    {isFullScreen ? (
                      <>
                        <Minimize2 className="w-4 h-4 inline mr-2" />
                        Exit Full Screen
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-4 h-4 inline mr-2" />
                        Expand
                      </>
                    )}
                  </button>

                  <button
                    className="px-3 py-2 rounded-lg border text-sm font-medium transition-colors"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    <Download className="w-4 h-4 inline mr-1" />
                    Export
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: "var(--text-secondary)" }}
                  />
                  <input
                    type="text"
                    placeholder="Search resources..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
                    style={{
                      background: "var(--bg-primary)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>

                <div className="flex gap-2 flex-wrap">
                  {["All", "Compute", "Network", "Data", "IAM", "Storage"].map((filter) => (
                    <button
                      key={filter}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                      style={{
                        background: filter === "All" ? "var(--action-primary)" : "transparent",
                        borderColor: "var(--border)",
                        color: filter === "All" ? "white" : "var(--text-secondary)",
                      }}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    🔴 Critical
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    🟠 High
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    ✅ Healthy
                  </button>
                </div>

                <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <input type="checkbox" className="rounded" />
                  Show only critical paths
                </label>
              </div>
            </div>

            <div
              className="relative"
              style={{
                background: "#F9FAFB",
                minHeight: isFullScreen ? "calc(100vh - 140px)" : "800px",
                padding: "40px",
              }}
            >
              <div className="absolute top-6 right-6 flex flex-col gap-2 z-10">
                <button
                  onClick={() => setZoom(zoom + 0.1)}
                  className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                  className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <ZoomOut className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <RotateCw className="w-5 h-5" />
                </button>
              </div>

              <div
                className="absolute bottom-6 right-6 rounded-lg p-4 z-10"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
              >
                <h4 className="text-xs font-bold mb-3 uppercase" style={{ color: "var(--text-primary)" }}>
                  Legend
                </h4>
                <div className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: "#DC2626" }}></div>
                    <span>Critical (pulsing red)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: "#F97316" }}></div>
                    <span>High (orange)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: "#F59E0B" }}></div>
                    <span>Medium (yellow)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: "#10B981" }}></div>
                    <span>Healthy (green)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: "#DC2626" }}>▲</span>
                    <span>Security Finding</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5" style={{ background: "#6B7280" }}></div>
                    <span>Normal Connection</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 border-t-2 border-dashed" style={{ borderColor: "#DC2626" }}></div>
                    <span>Attack Path</span>
                  </div>
                </div>
              </div>

              <svg
                width="100%"
                height={isFullScreen ? "calc(100vh - 200px)" : "720"}
                viewBox="0 0 1500 600"
                style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 0.2s" }}
              >
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <g>
                  {networkFlows.map((flow, idx) => (
                    <AnimatedFlowLine key={idx} {...flow} />
                  ))}
                </g>

                <g>
                  {cloudNodes.map((node) => (
                    <g
                      key={node.id}
                      onClick={() =>
                        handleObjectClick({
                          type: "iam-role",
                          id: node.id,
                          name: node.name,
                          policiesCount: 3,
                          permissionsCount: 245,
                          attachedCount: 5,
                        })
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <CloudNode
                        {...node}
                        onClick={() => {}}
                        onMouseEnter={() => setHoveredNode(node.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                        isSelected={selectedNode === node.id}
                        isHovered={hoveredNode === node.id}
                      />
                    </g>
                  ))}
                </g>

                <g>
                  {connections.map((conn, idx) => {
                    const fromNode = nodes.find((n) => n.id === conn.from)
                    const toNode = nodes.find((n) => n.id === conn.to)
                    if (!fromNode || !toNode) return null

                    const isAttack = conn.type === "attack"
                    const isData = conn.type === "data"
                    const strokeColor = isAttack ? "#DC2626" : isData ? "#3B82F6" : "#6B7280"
                    const strokeWidth = isAttack ? 3 : 2
                    const markerEnd = isAttack
                      ? "url(#arrow-attack)"
                      : isData
                        ? "url(#arrow-data)"
                        : "url(#arrow-normal)"

                    return (
                      <g key={idx}>
                        <line
                          x1={fromNode.x}
                          y1={fromNode.y}
                          x2={toNode.x}
                          y2={toNode.y}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          strokeDasharray={isAttack ? "8 4" : "none"}
                          markerEnd={markerEnd}
                          opacity={0.8}
                        />
                        {conn.label && (
                          <g>
                            <rect
                              x={(fromNode.x + toNode.x) / 2 - 40}
                              y={(fromNode.y + toNode.y) / 2 - 10}
                              width="80"
                              height="20"
                              fill="white"
                              stroke={strokeColor}
                              strokeWidth="1"
                              rx="4"
                            />
                            <text
                              x={(fromNode.x + toNode.x) / 2}
                              y={(fromNode.y + toNode.y) / 2 + 4}
                              textAnchor="middle"
                              fontSize="10"
                              fill="#1F2937"
                              fontWeight="600"
                            >
                              {conn.label}
                            </text>
                          </g>
                        )}
                      </g>
                    )
                  })}
                </g>

                <g>
                  {nodes.map((node) => {
                    const severityColor = getSeverityColor(node.severity)
                    const nodeColor = getNodeColor(node.type, node.severity)
                    const isCritical = node.severity === "critical"
                    const isSelected = selectedNode === node.id
                    const isHovered = hoveredNode === node.id
                    const borderWidth = isCritical ? 6 : node.severity === "high" ? 4 : 3

                    return (
                      <g
                        key={node.id}
                        onMouseEnter={() => setHoveredNode(node.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                        onClick={() => handleNodeClick(node)}
                        style={{ cursor: "pointer" }}
                        opacity={selectedNode && selectedNode !== node.id ? 0.3 : 1}
                      >
                        {isCritical && (
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r="45"
                            fill="none"
                            stroke={severityColor}
                            strokeWidth="3"
                            opacity="0.3"
                          >
                            <animate attributeName="r" values="45;50;45" dur="2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
                          </circle>
                        )}

                        <circle
                          cx={node.x}
                          cy={node.y}
                          r="35"
                          fill="white"
                          stroke={severityColor}
                          strokeWidth={borderWidth}
                          filter={isCritical ? "url(#glow)" : "none"}
                          style={{
                            transform: isHovered || isSelected ? "scale(1.1)" : "scale(1)",
                            transformOrigin: `${node.x}px ${node.y}px`,
                            transition: "transform 0.2s",
                          }}
                        />

                        <text x={node.x} y={node.y + 10} textAnchor="middle" fontSize="32">
                          {node.icon}
                        </text>

                        {node.type === "finding" && (
                          <g transform={`translate(${node.x}, ${node.y - 40})`}>
                            <polygon points="0,-20 -17,10 17,10" fill="#DC2626" filter="url(#glow)">
                              <animate attributeName="opacity" values="1;0.7;1" dur="1.5s" repeatCount="indefinite" />
                            </polygon>
                            <text x="0" y="0" textAnchor="middle" fontSize="24" fill="white" fontWeight="bold">
                              !
                            </text>
                          </g>
                        )}

                        <text
                          x={node.x}
                          y={node.y + 55}
                          textAnchor="middle"
                          fontSize="13"
                          fontWeight="700"
                          fill="#1F2937"
                        >
                          {node.name}
                        </text>

                        {node.subLabel && (
                          <text x={node.x} y={node.y + 70} textAnchor="middle" fontSize="11" fill="#6B7280">
                            {node.subLabel}
                          </text>
                        )}

                        {node.findingLabel && node.type !== "finding" && (
                          <g>
                            <rect
                              x={node.x - 80}
                              y={node.y + 65}
                              width="160"
                              height="30"
                              fill="#FEE2E2"
                              stroke="#DC2626"
                              strokeWidth="2"
                              rx="6"
                            />
                            <text
                              x={node.x}
                              y={node.y + 82}
                              textAnchor="middle"
                              fontSize="10"
                              fill="#991B1B"
                              fontWeight="700"
                            >
                              {node.findingLabel}
                            </text>
                          </g>
                        )}
                      </g>
                    )
                  })}
                </g>
              </svg>
            </div>
          </div>
        )}
      </div>

      <ArchitectureObjectDetailsPanel
        object={selectedObject}
        isOpen={detailsPanelOpen}
        onClose={() => {
          setDetailsPanelOpen(false)
          setSelectedObject(null)
        }}
      />
    </>
  )
}
