"use client"

import {
  Server,
  Database,
  Shield,
  Users,
  HardDrive,
  Network,
  AlertCircle,
  Lock,
  Download,
  Zap,
  ArrowRight,
  Eye,
  EyeOff,
  Filter,
  Search,
  BarChart3,
} from "lucide-react"
import { useState } from "react"

export default function CloudGraphPage() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [filterRisk, setFilterRisk] = useState<"all" | "critical" | "high" | "medium">("all")
  const [showLabels, setShowLabels] = useState(true)
  const [showMetrics, setShowMetrics] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  // Cloud Graph Nodes - Resources with their properties
  const nodes = [
    {
      id: "load-balancer",
      name: "ALB - Frontend",
      type: "network",
      x: 150,
      y: 100,
      risk: "medium",
      status: "healthy",
      count: 2,
      icon: Network,
    },
    {
      id: "api-servers",
      name: "EC2 - API Servers",
      type: "compute",
      x: 150,
      y: 300,
      risk: "critical",
      status: "warning",
      count: 8,
      icon: Server,
    },
    {
      id: "payment-db",
      name: "RDS - Payment DB",
      type: "database",
      x: 400,
      y: 300,
      risk: "critical",
      status: "healthy",
      count: 1,
      icon: Database,
    },
    {
      id: "s3-storage",
      name: "S3 - Data Lake",
      type: "storage",
      x: 400,
      y: 500,
      risk: "critical",
      status: "unhealthy",
      count: 1,
      icon: HardDrive,
    },
    {
      id: "cache-layer",
      name: "ElastiCache - Redis",
      type: "cache",
      x: 650,
      y: 300,
      risk: "high",
      status: "healthy",
      count: 3,
      icon: Zap,
    },
    {
      id: "iam-roles",
      name: "IAM - Service Roles",
      type: "identity",
      x: 650,
      y: 100,
      risk: "high",
      status: "warning",
      count: 12,
      icon: Users,
    },
    {
      id: "kms-keys",
      name: "KMS - Encryption",
      type: "security",
      x: 650,
      y: 500,
      risk: "medium",
      status: "healthy",
      count: 5,
      icon: Lock,
    },
    {
      id: "security-groups",
      name: "Security Groups",
      type: "network",
      x: 900,
      y: 200,
      risk: "critical",
      status: "unhealthy",
      count: 6,
      icon: Shield,
    },
    {
      id: "cloudtrail",
      name: "CloudTrail - Logs",
      type: "audit",
      x: 900,
      y: 400,
      risk: "high",
      status: "warning",
      count: 1,
      icon: AlertCircle,
    },
    {
      id: "monitoring",
      name: "CloudWatch",
      type: "monitoring",
      x: 1150,
      y: 300,
      risk: "medium",
      status: "healthy",
      count: 1,
      icon: BarChart3,
    },
  ]

  // Edges - Connections between resources with data flow
  const edges = [
    { from: "load-balancer", to: "api-servers", label: "HTTP Traffic", bandwidth: "2.5 Gbps", risk: "low" },
    { from: "api-servers", to: "payment-db", label: "Queries", bandwidth: "500 Mbps", risk: "critical" },
    { from: "api-servers", to: "cache-layer", label: "Cache Reads/Writes", bandwidth: "1.2 Gbps", risk: "high" },
    { from: "api-servers", to: "s3-storage", label: "Data Upload", bandwidth: "300 Mbps", risk: "critical" },
    {
      from: "api-servers",
      to: "iam-roles",
      label: "Auth & Permissions",
      bandwidth: "100 Mbps",
      risk: "critical",
    },
    { from: "api-servers", to: "security-groups", label: "Network Control", bandwidth: "50 Mbps", risk: "critical" },
    {
      from: "payment-db",
      to: "kms-keys",
      label: "Encryption Keys",
      bandwidth: "10 Mbps",
      risk: "high",
    },
    { from: "s3-storage", to: "kms-keys", label: "Encryption", bandwidth: "50 Mbps", risk: "high" },
    { from: "api-servers", to: "cloudtrail", label: "Audit Logs", bandwidth: "50 Mbps", risk: "high" },
    { from: "payment-db", to: "cloudtrail", label: "API Activity", bandwidth: "25 Mbps", risk: "medium" },
    { from: "iam-roles", to: "cloudtrail", label: "Access Logs", bandwidth: "30 Mbps", risk: "medium" },
    {
      from: "api-servers",
      to: "monitoring",
      label: "Metrics & Logs",
      bandwidth: "200 Mbps",
      risk: "medium",
    },
    { from: "security-groups", to: "monitoring", label: "Flow Logs", bandwidth: "100 Mbps", risk: "medium" },
    { from: "cache-layer", to: "monitoring", label: "Health Metrics", bandwidth: "50 Mbps", risk: "low" },
    { from: "load-balancer", to: "monitoring", label: "ALB Metrics", bandwidth: "75 Mbps", risk: "low" },
  ]

  // Detailed node information
  const nodeDetails: any = {
    "load-balancer": {
      name: "Application Load Balancer - Frontend",
      description: "Distributes incoming traffic to API servers",
      status: "Healthy",
      uptime: "99.99%",
      lastIssue: "5 days ago",
      issues: [],
      metrics: { "Request Rate": "45K req/s", "Avg Latency": "125ms", "Error Rate": "0.01%" },
    },
    "api-servers": {
      name: "EC2 Compute - API Servers",
      description: "Payment processing API servers",
      status: "At Risk",
      uptime: "99.85%",
      lastIssue: "2 minutes ago",
      issues: ["Security group allows SSH from anywhere", "No encryption for data in transit on port 443"],
      metrics: { "CPU Usage": "72%", Memory: "81%", "Disk I/O": "450 Mbps" },
    },
    "payment-db": {
      name: "RDS - Payment Database",
      description: "Primary PostgreSQL database for payment transactions",
      status: "At Risk",
      uptime: "99.99%",
      lastIssue: "1 hour ago",
      issues: ["No automated backups configured", "No encryption at rest"],
      metrics: { Connections: "2,400", "Query Latency": "5ms", Storage: "850 GB" },
    },
    "s3-storage": {
      name: "S3 - Data Lake Storage",
      description: "Long-term storage for payment logs and backups",
      status: "Unhealthy",
      uptime: "99.99%",
      lastIssue: "2 minutes ago",
      issues: ["S3 bucket is publicly accessible", "No encryption enabled"],
      metrics: { Objects: "2.3M", "Storage Used": "2.1 TB", "Request Rate": "1.2K req/s" },
    },
    "cache-layer": {
      name: "ElastiCache - Redis Cluster",
      description: "In-memory cache for session and query results",
      status: "Healthy",
      uptime: "99.95%",
      lastIssue: "12 hours ago",
      issues: [],
      metrics: { "Hit Rate": "94.2%", Evictions: "2.1K/s", "Memory Used": "18.4 GB" },
    },
    "iam-roles": {
      name: "IAM - Service Roles",
      description: "Identity and access management for microservices",
      status: "At Risk",
      uptime: "100%",
      lastIssue: "1 hour ago",
      issues: ["IAM role has excessive permissions", "Admin access not required"],
      metrics: { "Active Roles": "12", Users: "47", "Last Modified": "3 days ago" },
    },
    "kms-keys": {
      name: "KMS - Key Management",
      description: "Encryption key management for data protection",
      status: "Healthy",
      uptime: "100%",
      lastIssue: "None",
      issues: [],
      metrics: { Keys: "5", "Key Rotations": "Enabled", "Last Rotation": "30 days ago" },
    },
    "security-groups": {
      name: "Security Groups",
      description: "Virtual firewall for network traffic control",
      status: "Unhealthy",
      uptime: "100%",
      lastIssue: "Now",
      issues: ["SSH port 22 open to 0.0.0.0/0", "5 overly permissive rules detected"],
      metrics: { Groups: "6", Rules: "48", Violations: "7" },
    },
    cloudtrail: {
      name: "CloudTrail - Audit Logging",
      description: "AWS API activity logging and monitoring",
      status: "At Risk",
      uptime: "100%",
      lastIssue: "45 minutes ago",
      issues: ["CloudTrail logging disabled for main trail", "No log file validation"],
      metrics: { Trails: "1", "Events Logged": "45M", "Log Retention": "30 days" },
    },
    monitoring: {
      name: "CloudWatch",
      description: "Monitoring, logging, and observability",
      status: "Healthy",
      uptime: "99.99%",
      lastIssue: "2 days ago",
      issues: [],
      metrics: { Metrics: "2.3K", Alarms: "42", "Log Groups": "18" },
    },
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "critical":
        return "#ef4444"
      case "high":
        return "#f97316"
      case "medium":
        return "#eab308"
      case "low":
        return "#10b981"
      default:
        return "#6b7280"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "#10b981"
      case "warning":
        return "#eab308"
      case "unhealthy":
        return "#ef4444"
      default:
        return "#6b7280"
    }
  }

  const filteredNodes = nodes.filter((node) => {
    if (filterRisk !== "all" && node.risk !== filterRisk) return false
    if (searchQuery && !node.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const filteredEdges = edges.filter((edge) => {
    const fromNode = nodes.find((n) => n.id === edge.from)
    const toNode = nodes.find((n) => n.id === edge.to)
    if (filterRisk !== "all" && fromNode?.risk !== filterRisk && toNode?.risk !== filterRisk) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Cloud Graph - System Dependencies</h2>
            <p className="text-gray-600 mt-1">Visualize all connections, data flow, and risk propagation</p>
          </div>
          <button className="px-6 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg border border-blue-400 flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export Graph
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Risk Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-600" />
            <select
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value as any)}
              className="px-4 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Risk Levels</option>
              <option value="critical">Critical Only</option>
              <option value="high">High & Critical</option>
              <option value="medium">Medium & Above</option>
            </select>
          </div>

          {/* View Options */}
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all ${
              showLabels
                ? "bg-blue-50 text-blue-600 border border-blue-200"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            Labels
          </button>

          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all ${
              showMetrics
                ? "bg-blue-50 text-blue-600 border border-blue-200"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Metrics
          </button>
        </div>
      </div>

      {/* Main Graph Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <svg width="100%" height={600} className="bg-gradient-to-br from-slate-50 to-blue-50">
          {/* Grid background */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Draw edges first (so they appear behind nodes) */}
          {filteredEdges.map((edge) => {
            const fromNode = nodes.find((n) => n.id === edge.from)
            const toNode = nodes.find((n) => n.id === edge.to)
            if (!fromNode || !toNode) return null

            const edgeColor = getRiskColor(edge.risk)
            const isHovered = hoveredNode === edge.from || hoveredNode === edge.to

            return (
              <g key={`${edge.from}-${edge.to}`}>
                {/* Edge line */}
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={edgeColor}
                  strokeWidth={isHovered ? 3 : 2}
                  strokeOpacity={isHovered ? 1 : 0.6}
                  className="transition-all"
                />

                {/* Arrow marker */}
                <defs>
                  <marker
                    id={`arrow-${edge.from}-${edge.to}`}
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,6 L9,3 z" fill={edgeColor} fillOpacity={isHovered ? 1 : 0.6} />
                  </marker>
                </defs>
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={edgeColor}
                  strokeWidth={2}
                  fill="none"
                  markerEnd={`url(#arrow-${edge.from}-${edge.to})`}
                  strokeOpacity={isHovered ? 1 : 0.6}
                  className="transition-all"
                />

                {/* Edge label */}
                {showLabels && (
                  <text
                    x={(fromNode.x + toNode.x) / 2}
                    y={(fromNode.y + toNode.y) / 2 - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fill={edgeColor}
                    fontWeight="bold"
                    className="pointer-events-none"
                  >
                    {edge.label}
                  </text>
                )}

                {/* Bandwidth label */}
                {showMetrics && (
                  <text
                    x={(fromNode.x + toNode.x) / 2}
                    y={(fromNode.y + toNode.y) / 2 + 8}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#6b7280"
                    className="pointer-events-none"
                  >
                    {edge.bandwidth}
                  </text>
                )}
              </g>
            )
          })}

          {/* Draw nodes */}
          {filteredNodes.map((node) => {
            const NodeIcon = node.icon
            const isSelected = selectedNode === node.id
            const isHovered = hoveredNode === node.id
            const riskColor = getRiskColor(node.risk)
            const statusColor = getStatusColor(node.status)

            return (
              <g
                key={node.id}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => setSelectedNode(isSelected ? null : node.id)}
                className="cursor-pointer"
              >
                {/* Node circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isSelected ? 50 : isHovered ? 45 : 40}
                  fill={riskColor}
                  fillOpacity={0.2}
                  stroke={riskColor}
                  strokeWidth={isSelected ? 4 : isHovered ? 3 : 2}
                  className="transition-all"
                />

                {/* Inner circle for better definition */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isSelected ? 35 : isHovered ? 32 : 30}
                  fill="white"
                  stroke={riskColor}
                  strokeWidth={2}
                  className="transition-all"
                />

                {/* Status indicator */}
                <circle cx={node.x + 28} cy={node.y - 28} r="6" fill={statusColor} stroke="white" strokeWidth="2" />

                {/* Icon placeholder (simplified as text) */}
                <text x={node.x} y={node.y + 8} textAnchor="middle" fontSize="24" className="pointer-events-none">
                  {node.type === "compute"
                    ? "🖥️"
                    : node.type === "database"
                      ? "🗄️"
                      : node.type === "storage"
                        ? "💾"
                        : node.type === "network"
                          ? "🌐"
                          : node.type === "cache"
                            ? "⚡"
                            : node.type === "identity"
                              ? "👤"
                              : node.type === "security"
                                ? "🔐"
                                : node.type === "audit"
                                  ? "📋"
                                  : "📊"}
                </text>

                {/* Node label */}
                {showLabels && (
                  <>
                    <text
                      x={node.x}
                      y={node.y + 60}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="bold"
                      fill="#111827"
                      className="pointer-events-none"
                    >
                      {node.name}
                    </text>
                    <text
                      x={node.x}
                      y={node.y + 76}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#6b7280"
                      className="pointer-events-none"
                    >
                      {node.count} instance{node.count > 1 ? "s" : ""}
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Legend</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Risk Levels */}
          <div>
            <div className="text-sm font-semibold text-gray-900 mb-3">Risk Level</div>
            {["critical", "high", "medium", "low"].map((level) => (
              <div key={level} className="flex items-center gap-2 mb-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: getRiskColor(level), border: `2px solid ${getRiskColor(level)}` }}
                />
                <span className="text-sm text-gray-600 capitalize">{level}</span>
              </div>
            ))}
          </div>

          {/* Status */}
          <div>
            <div className="text-sm font-semibold text-gray-900 mb-3">Status</div>
            {[
              { name: "Healthy", color: "#10b981" },
              { name: "Warning", color: "#eab308" },
              { name: "Unhealthy", color: "#ef4444" },
            ].map((status) => (
              <div key={status.name} className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 rounded-full border-2 border-white" style={{ backgroundColor: status.color }} />
                <span className="text-sm text-gray-600">{status.name}</span>
              </div>
            ))}
          </div>

          {/* Resource Types */}
          <div>
            <div className="text-sm font-semibold text-gray-900 mb-3">Resource Types</div>
            {[
              { icon: "🖥️", name: "Compute" },
              { icon: "🗄️", name: "Database" },
              { icon: "💾", name: "Storage" },
              { icon: "🌐", name: "Network" },
            ].map((type) => (
              <div key={type.name} className="flex items-center gap-2 mb-2">
                <span className="text-lg">{type.icon}</span>
                <span className="text-sm text-gray-600">{type.name}</span>
              </div>
            ))}
          </div>

          {/* Connection Types */}
          <div>
            <div className="text-sm font-semibold text-gray-900 mb-3">Connection Info</div>
            <div className="space-y-2 text-sm text-gray-600">
              <div>📊 Line thickness = importance</div>
              <div>🔗 Label = connection type</div>
              <div>⚡ Metrics = bandwidth</div>
              <div>🎯 Risk color = threat level</div>
            </div>
          </div>
        </div>
      </div>

      {/* Node Details Panel */}
      {selectedNode && nodeDetails[selectedNode] && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900">{nodeDetails[selectedNode].name}</h3>
              <p className="text-gray-600 mt-1">{nodeDetails[selectedNode].description}</p>
            </div>
            <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Status & Metrics */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-600">Status</label>
                <div className="flex items-center gap-2 mt-1">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: getStatusColor(
                        nodeDetails[selectedNode].status.includes("Risk")
                          ? "warning"
                          : nodeDetails[selectedNode].status.includes("Unhealthy")
                            ? "unhealthy"
                            : "healthy",
                      ),
                    }}
                  />
                  <span className="text-gray-900 font-medium">{nodeDetails[selectedNode].status}</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">Uptime</label>
                <p className="text-gray-900 font-medium mt-1">{nodeDetails[selectedNode].uptime}</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">Last Issue</label>
                <p className="text-gray-900 font-medium mt-1">{nodeDetails[selectedNode].lastIssue}</p>
              </div>
            </div>

            {/* Metrics */}
            <div>
              <label className="text-sm font-semibold text-gray-600 block mb-3">Key Metrics</label>
              <div className="space-y-2">
                {Object.entries(nodeDetails[selectedNode].metrics).map(([key, value]) => (
                  <div key={key} className="flex justify-between p-2 rounded bg-gray-50">
                    <span className="text-gray-600">{key}:</span>
                    <span className="font-semibold text-gray-900">{value as string}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Issues */}
          {nodeDetails[selectedNode]?.issues && nodeDetails[selectedNode].issues.length > 0 && (
            <div>
              <label className="text-sm font-semibold text-gray-600 block mb-3">Active Issues</label>
              <div className="space-y-2">
                {nodeDetails[selectedNode].issues.map((issue: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-red-700">{issue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600 font-medium mb-2">Total Resources</div>
          <div className="text-3xl font-bold text-gray-900">{filteredNodes.length}</div>
          <div className="text-xs text-gray-500 mt-2">{nodes.length} total resources</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600 font-medium mb-2">Active Connections</div>
          <div className="text-3xl font-bold text-gray-900">{filteredEdges.length}</div>
          <div className="text-xs text-gray-500 mt-2">{edges.length} total connections</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600 font-medium mb-2">Critical Resources</div>
          <div className="text-3xl font-bold text-red-600">
            {filteredNodes.filter((n) => n.risk === "critical").length}
          </div>
          <div className="text-xs text-gray-500 mt-2">At risk or unhealthy</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600 font-medium mb-2">Healthy Status</div>
          <div className="text-3xl font-bold text-green-600">
            {filteredNodes.filter((n) => n.status === "healthy").length}/{filteredNodes.length}
          </div>
          <div className="text-xs text-gray-500 mt-2">Resources operational</div>
        </div>
      </div>

      {/* Risk Propagation Analysis */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Risk Propagation Analysis</h3>
        <div className="space-y-3">
          {[
            {
              source: "S3 - Data Lake (Public Access)",
              propagates: "Payment DB, RDS, API Servers",
              impact: "Data breach affecting 2.3M records",
              severity: "critical",
            },
            {
              source: "Security Groups (SSH Open)",
              propagates: "API Servers, Cache Layer",
              impact: "Unauthorized access to internal services",
              severity: "critical",
            },
            {
              source: "IAM Roles (Over-privileged)",
              propagates: "All Resources",
              impact: "Complete account compromise possible",
              severity: "high",
            },
            {
              source: "CloudTrail (Disabled)",
              propagates: "Audit Trail",
              impact: "No incident investigation capability",
              severity: "high",
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="p-4 rounded-lg border-l-4"
              style={{
                borderLeftColor: getRiskColor(item.severity),
                backgroundColor: getRiskColor(item.severity) + "10",
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">
                    {item.source}
                    <span
                      className="ml-2 px-2 py-1 rounded text-xs font-bold text-white"
                      style={{ backgroundColor: getRiskColor(item.severity) }}
                    >
                      {item.severity.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    <strong>Propagates to:</strong> {item.propagates}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    <strong>Impact:</strong> {item.impact}
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 flex-shrink-0 mt-1" style={{ color: getRiskColor(item.severity) }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
