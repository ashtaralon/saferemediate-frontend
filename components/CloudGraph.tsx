'use client'

import React, { useState, useEffect } from 'react'
import { 
  RefreshCw, Globe, Shield, Database, Server, 
  HardDrive, Users, Cloud, Layers, Network, Lock,
  Activity, AlertTriangle, CheckCircle, Info,
  ZoomIn, ZoomOut, Maximize2, Download
} from 'lucide-react'

// ============================================================================
// AWS Cloud Graph - Light Mode with VPC/AZ Zones
// Proper architecture visualization with connection lines and traffic labels
// ============================================================================

interface CloudGraphProps {
  systemName?: string
}

interface ServiceNode {
  id: string
  name: string
  type: string
  zone?: 'external' | 'vpc' | 'public' | 'private' | 'data'
  az?: number
  x: number
  y: number
  status: 'healthy' | 'warning' | 'critical'
  issues?: number
  connections?: number
}

interface Connection {
  from: string
  to: string
  label: string
  throughput?: string
  type: 'dns' | 'http' | 'sql' | 'internal' | 'replication' | 'api'
}

// Service type icons
const ServiceIcon = ({ type, size = 32 }: { type: string; size?: number }) => {
  const iconClass = `w-${size/4} h-${size/4}`
  
  switch (type) {
    case 'Route53':
      return <Globe className={iconClass} />
    case 'WAF':
      return <Shield className={iconClass} />
    case 'CloudFront':
      return <Cloud className={iconClass} />
    case 'ALB':
    case 'LoadBalancer':
      return <Network className={iconClass} />
    case 'EC2':
    case 'Web':
    case 'App':
      return <Server className={iconClass} />
    case 'RDS':
    case 'Aurora':
      return <Database className={iconClass} />
    case 'S3':
      return <HardDrive className={iconClass} />
    case 'IAM':
      return <Users className={iconClass} />
    case 'SecurityGroup':
    case 'NACL':
      return <Lock className={iconClass} />
    case 'EFS':
      return <Layers className={iconClass} />
    default:
      return <Activity className={iconClass} />
  }
}

export default function CloudGraph({ systemName = 'alon-prod' }: CloudGraphProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<{nodes: ServiceNode[], connections: Connection[]} | null>(null)

  // External services (outside VPC)
  const externalServices: ServiceNode[] = [
    { id: 'route53', name: 'Route 53', type: 'Route53', zone: 'external', x: 100, y: 50, status: 'healthy', connections: 2 },
    { id: 'waf', name: 'AWS WAF', type: 'WAF', zone: 'external', x: 300, y: 50, status: 'healthy', connections: 1 },
    { id: 'cloudfront', name: 'CloudFront', type: 'CloudFront', zone: 'external', x: 500, y: 50, status: 'healthy', connections: 2 },
    { id: 's3-static', name: 'S3 Static', type: 'S3', zone: 'external', x: 700, y: 50, status: 'healthy', connections: 1 },
  ]

  // Global services (right sidebar)
  const globalServices: ServiceNode[] = [
    { id: 'cloudtrail', name: 'CloudTrail', type: 'Activity', zone: 'external', x: 850, y: 150, status: 'healthy' },
    { id: 'efs', name: 'Amazon EFS', type: 'EFS', zone: 'external', x: 850, y: 220, status: 'healthy' },
    { id: 'iam', name: 'IAM Roles', type: 'IAM', zone: 'external', x: 850, y: 290, status: 'warning', issues: 3 },
    { id: 'cloudwatch', name: 'CloudWatch', type: 'Activity', zone: 'external', x: 850, y: 360, status: 'healthy' },
  ]

  // VPC services - organized by tier
  const vpcServices: ServiceNode[] = [
    // ALB in public tier
    { id: 'alb', name: 'Application LB', type: 'ALB', zone: 'public', az: 1, x: 200, y: 180, status: 'healthy', connections: 4 },
    
    // Web tier - AZ1 & AZ2
    { id: 'nacl-1', name: 'NACL', type: 'NACL', zone: 'public', az: 1, x: 120, y: 260, status: 'healthy' },
    { id: 'nacl-2', name: 'NACL', type: 'NACL', zone: 'public', az: 2, x: 320, y: 260, status: 'healthy' },
    { id: 'web-1', name: 'EC2 (Web)', type: 'Web', zone: 'public', az: 1, x: 120, y: 330, status: 'healthy', connections: 2 },
    { id: 'web-2', name: 'EC2 (Web)', type: 'Web', zone: 'public', az: 2, x: 320, y: 330, status: 'healthy', connections: 2 },
    
    // App tier - AZ1 & AZ2
    { id: 'app-1', name: 'EC2 (App)', type: 'App', zone: 'private', az: 1, x: 120, y: 420, status: 'warning', issues: 2, connections: 3 },
    { id: 'app-2', name: 'EC2 (App)', type: 'App', zone: 'private', az: 2, x: 320, y: 420, status: 'healthy', connections: 3 },
    
    // Database tier - AZ1 & AZ2
    { id: 'aurora-1', name: 'Aurora Primary', type: 'Aurora', zone: 'data', az: 1, x: 120, y: 520, status: 'healthy', connections: 2 },
    { id: 'aurora-2', name: 'Aurora Replica', type: 'Aurora', zone: 'data', az: 2, x: 320, y: 520, status: 'healthy', connections: 1 },
  ]

  // All nodes combined
  const allNodes = [...externalServices, ...globalServices, ...vpcServices]

  // Connections between services
  const connections: Connection[] = [
    // External to VPC
    { from: 'route53', to: 'waf', label: 'DNS', type: 'dns' },
    { from: 'waf', to: 'cloudfront', label: 'Filtered', type: 'http' },
    { from: 'cloudfront', to: 's3-static', label: 'Static', type: 'http' },
    { from: 'cloudfront', to: 'alb', label: 'Dynamic', type: 'http' },
    
    // ALB to Web servers
    { from: 'alb', to: 'web-1', label: 'Traffic', throughput: '1.2 Gbps', type: 'http' },
    { from: 'alb', to: 'web-2', label: 'Traffic', throughput: '800 Mbps', type: 'http' },
    
    // Web to App servers
    { from: 'web-1', to: 'app-1', label: 'Internal', type: 'internal' },
    { from: 'web-2', to: 'app-2', label: 'Internal', type: 'internal' },
    
    // App to Database
    { from: 'app-1', to: 'aurora-1', label: 'SQL', throughput: '500 Mbps', type: 'sql' },
    { from: 'app-2', to: 'aurora-1', label: 'SQL', throughput: '300 Mbps', type: 'sql' },
    
    // Database replication
    { from: 'aurora-1', to: 'aurora-2', label: 'Replication', type: 'replication' },
    
    // Connections to global services
    { from: 'app-1', to: 'iam', label: 'Auth', type: 'api' },
    { from: 'app-2', to: 'cloudwatch', label: 'Metrics', type: 'api' },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#10b981'
      case 'warning': return '#f59e0b'
      case 'critical': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getConnectionColor = (type: string) => {
    switch (type) {
      case 'dns': return '#8b5cf6'
      case 'http': return '#3b82f6'
      case 'sql': return '#f59e0b'
      case 'internal': return '#6b7280'
      case 'replication': return '#10b981'
      case 'api': return '#ec4899'
      default: return '#6b7280'
    }
  }

  const getZoneStyle = (zone: string) => {
    switch (zone) {
      case 'public': return { bg: 'rgba(34, 197, 94, 0.1)', border: '#22c55e', label: 'Public Subnet' }
      case 'private': return { bg: 'rgba(234, 179, 8, 0.1)', border: '#eab308', label: 'Private Subnet' }
      case 'data': return { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6', label: 'Database Subnet' }
      default: return { bg: 'transparent', border: 'transparent', label: '' }
    }
  }

  const handleRefresh = async () => {
    setLoading(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    setLoading(false)
  }

  const nodeDetails: Record<string, any> = {
    'route53': { description: 'DNS routing for alon-prod.example.com', records: 12, healthChecks: 4 },
    'waf': { description: 'Web Application Firewall', rules: 24, blocked: '1.2K/day' },
    'cloudfront': { description: 'CDN Distribution', cacheHitRate: '94%', requests: '2.5M/day' },
    'alb': { description: 'Application Load Balancer', targets: 4, healthy: 4 },
    'web-1': { description: 'Web Server in AZ-1', cpu: '45%', memory: '62%', connections: 1250 },
    'web-2': { description: 'Web Server in AZ-2', cpu: '38%', memory: '58%', connections: 980 },
    'app-1': { description: 'App Server in AZ-1', cpu: '72%', memory: '81%', issues: ['High memory usage', 'Overly permissive IAM role'] },
    'app-2': { description: 'App Server in AZ-2', cpu: '45%', memory: '55%' },
    'aurora-1': { description: 'Aurora Primary (PostgreSQL)', connections: 2400, storage: '850 GB', iops: '15K' },
    'aurora-2': { description: 'Aurora Replica', replicationLag: '< 1ms', storage: '850 GB' },
    'iam': { description: 'Service IAM Roles', roles: 12, issues: ['3 over-privileged roles'] },
    'cloudwatch': { description: 'Monitoring & Logs', metrics: 2300, alarms: 42 },
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cloud Architecture Graph</h1>
            <p className="text-slate-600 mt-1">
              {systemName} • Production VPC • eu-west-1
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-sm text-slate-600 min-w-[4rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button 
              onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setZoom(1)}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
            <button 
              onClick={handleRefresh}
              className={`p-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white ${loading ? 'animate-spin' : ''}`}
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Main Graph Area */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <svg 
            width="100%" 
            height={650} 
            viewBox={`0 0 ${950 / zoom} ${650 / zoom}`}
            className="bg-gradient-to-br from-slate-50 to-blue-50/30"
          >
            {/* Grid pattern */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* VPC Zone */}
            <g>
              <rect 
                x={60} y={140} 
                width={400} height={430}
                fill="rgba(34, 197, 94, 0.05)"
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="none"
                rx={8}
              />
              <text x={80} y={165} fill="#16a34a" fontSize={14} fontWeight="bold">
                Production VPC (10.0.0.0/16)
              </text>
            </g>

            {/* Availability Zones */}
            <g>
              {/* AZ 1 */}
              <rect 
                x={80} y={185} 
                width={160} height={370}
                fill="rgba(59, 130, 246, 0.05)"
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                rx={6}
              />
              <text x={100} y={205} fill="#2563eb" fontSize={11} fontWeight="600">
                Availability Zone 1
              </text>

              {/* AZ 2 */}
              <rect 
                x={260} y={185} 
                width={180} height={370}
                fill="rgba(59, 130, 246, 0.05)"
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                rx={6}
              />
              <text x={280} y={205} fill="#2563eb" fontSize={11} fontWeight="600">
                Availability Zone 2
              </text>
            </g>

            {/* Subnet zones within AZs */}
            {/* Public Subnets */}
            <rect x={90} y={220} width={140} height={100} fill="rgba(34, 197, 94, 0.1)" stroke="#22c55e" strokeWidth={1} rx={4} />
            <text x={100} y={238} fill="#16a34a" fontSize={9}>Public Subnet</text>
            
            <rect x={270} y={220} width={160} height={100} fill="rgba(34, 197, 94, 0.1)" stroke="#22c55e" strokeWidth={1} rx={4} />
            <text x={280} y={238} fill="#16a34a" fontSize={9}>Public Subnet</text>

            {/* Private Subnets */}
            <rect x={90} y={335} width={140} height={100} fill="rgba(234, 179, 8, 0.1)" stroke="#eab308" strokeWidth={1} rx={4} />
            <text x={100} y={353} fill="#ca8a04" fontSize={9}>Private Subnet</text>
            
            <rect x={270} y={335} width={160} height={100} fill="rgba(234, 179, 8, 0.1)" stroke="#eab308" strokeWidth={1} rx={4} />
            <text x={280} y={353} fill="#ca8a04" fontSize={9}>Private Subnet</text>

            {/* Database Subnets */}
            <rect x={90} y={450} width={140} height={90} fill="rgba(59, 130, 246, 0.1)" stroke="#3b82f6" strokeWidth={1} rx={4} />
            <text x={100} y={468} fill="#2563eb" fontSize={9}>Database Subnet</text>
            
            <rect x={270} y={450} width={160} height={90} fill="rgba(59, 130, 246, 0.1)" stroke="#3b82f6" strokeWidth={1} rx={4} />
            <text x={280} y={468} fill="#2563eb" fontSize={9}>Database Subnet</text>

            {/* Draw connections */}
            {connections.map((conn, idx) => {
              const fromNode = allNodes.find(n => n.id === conn.from)
              const toNode = allNodes.find(n => n.id === conn.to)
              if (!fromNode || !toNode) return null

              const isHovered = hoveredNode === conn.from || hoveredNode === conn.to
              const color = getConnectionColor(conn.type)
              
              // Calculate midpoint for label
              const midX = (fromNode.x + toNode.x) / 2
              const midY = (fromNode.y + toNode.y) / 2

              return (
                <g key={`conn-${idx}`}>
                  {/* Connection line */}
                  <line
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke={color}
                    strokeWidth={isHovered ? 3 : 2}
                    strokeOpacity={isHovered ? 1 : 0.6}
                    markerEnd={`url(#arrow-${conn.type})`}
                  />
                  
                  {/* Arrow marker */}
                  <defs>
                    <marker
                      id={`arrow-${conn.type}`}
                      markerWidth="8"
                      markerHeight="8"
                      refX="7"
                      refY="3"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <path d="M0,0 L0,6 L8,3 z" fill={color} fillOpacity={0.8} />
                    </marker>
                  </defs>

                  {/* Connection label */}
                  <rect
                    x={midX - 25}
                    y={midY - 10}
                    width={50}
                    height={16}
                    fill="white"
                    stroke={color}
                    strokeWidth={1}
                    rx={3}
                    opacity={0.95}
                  />
                  <text
                    x={midX}
                    y={midY + 3}
                    textAnchor="middle"
                    fontSize={9}
                    fill={color}
                    fontWeight="600"
                  >
                    {conn.label}
                  </text>
                </g>
              )
            })}

            {/* Draw nodes */}
            {allNodes.map((node) => {
              const isSelected = selectedNode === node.id
              const isHovered = hoveredNode === node.id
              const statusColor = getStatusColor(node.status)
              
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => setSelectedNode(isSelected ? null : node.id)}
                  className="cursor-pointer"
                >
                  {/* Node background */}
                  <rect
                    x={-30}
                    y={-20}
                    width={60}
                    height={40}
                    fill="white"
                    stroke={isSelected ? '#3b82f6' : isHovered ? '#64748b' : '#e2e8f0'}
                    strokeWidth={isSelected ? 2 : 1}
                    rx={6}
                    filter={isHovered ? 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))' : 'none'}
                  />
                  
                  {/* Service icon */}
                  <foreignObject x={-12} y={-14} width={24} height={24}>
                    <div className="flex items-center justify-center w-6 h-6 text-slate-600">
                      <ServiceIcon type={node.type} size={20} />
                    </div>
                  </foreignObject>

                  {/* Status indicator */}
                  <circle
                    cx={22}
                    cy={-12}
                    r={5}
                    fill={statusColor}
                    stroke="white"
                    strokeWidth={1.5}
                  />

                  {/* Issue badge */}
                  {node.issues && node.issues > 0 && (
                    <g>
                      <circle
                        cx={-22}
                        cy={-12}
                        r={8}
                        fill="#ef4444"
                      />
                      <text
                        x={-22}
                        y={-8}
                        textAnchor="middle"
                        fill="white"
                        fontSize={9}
                        fontWeight="bold"
                      >
                        {node.issues}
                      </text>
                    </g>
                  )}

                  {/* Node name */}
                  <text
                    x={0}
                    y={32}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight="500"
                    fill="#334155"
                  >
                    {node.name}
                  </text>
                </g>
              )
            })}

            {/* Global Services sidebar label */}
            <text x={800} y={130} fill="#64748b" fontSize={11} fontWeight="600">
              Global Services
            </text>
            <line x1={800} y1={138} x2={900} y2={138} stroke="#e2e8f0" strokeWidth={1} />
          </svg>
        </div>

        {/* Details Panel */}
        {selectedNode && nodeDetails[selectedNode] && (
          <div className="w-80 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {allNodes.find(n => n.id === selectedNode)?.name}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {nodeDetails[selectedNode].description}
                </p>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2 mb-4">
              <span 
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getStatusColor(allNodes.find(n => n.id === selectedNode)?.status || 'healthy') }}
              />
              <span className="text-sm font-medium text-slate-700 capitalize">
                {allNodes.find(n => n.id === selectedNode)?.status}
              </span>
            </div>

            {/* Metrics */}
            <div className="space-y-3">
              {Object.entries(nodeDetails[selectedNode])
                .filter(([key]) => key !== 'description' && key !== 'issues')
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between p-2 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-600 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{String(value)}</span>
                  </div>
                ))}
            </div>

            {/* Issues */}
            {nodeDetails[selectedNode].issues && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Active Issues</h4>
                <div className="space-y-2">
                  {nodeDetails[selectedNode].issues.map((issue: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg border border-red-100">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-red-700">{issue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm">
                View Details
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Stats */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="text-sm text-slate-600 font-medium mb-1">Total Resources</div>
          <div className="text-3xl font-bold text-slate-900">{allNodes.length}</div>
          <div className="text-xs text-slate-500 mt-1">In this architecture</div>
        </div>
        
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="text-sm text-slate-600 font-medium mb-1">Active Connections</div>
          <div className="text-3xl font-bold text-slate-900">{connections.length}</div>
          <div className="text-xs text-slate-500 mt-1">Data flow paths</div>
        </div>
        
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="text-sm text-slate-600 font-medium mb-1">Critical Issues</div>
          <div className="text-3xl font-bold text-amber-500">
            {allNodes.filter(n => n.issues && n.issues > 0).reduce((acc, n) => acc + (n.issues || 0), 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Require attention</div>
        </div>
        
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="text-sm text-slate-600 font-medium mb-1">Healthy Status</div>
          <div className="text-3xl font-bold text-emerald-500">
            {allNodes.filter(n => n.status === 'healthy').length}/{allNodes.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Resources operational</div>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 mt-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Legend</h3>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-green-500 bg-green-50" />
            <span className="text-sm text-slate-600">Public Subnet</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-yellow-500 bg-yellow-50" />
            <span className="text-sm text-slate-600">Private Subnet</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-blue-500 bg-blue-50" />
            <span className="text-sm text-slate-600">Database Subnet</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-sm text-slate-600">Healthy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-sm text-slate-600">Warning</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-sm text-slate-600">Critical</span>
          </div>
        </div>
      </div>
    </div>
  )
}


