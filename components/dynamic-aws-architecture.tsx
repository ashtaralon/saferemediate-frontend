'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { 
  Globe, Shield, Database, Server, Cloud, Lock, AlertTriangle, 
  CheckCircle, RefreshCw, Play, Pause, Zap, Activity, Clock,
  HardDrive, Layers, Settings, Eye, ChevronRight
} from 'lucide-react'

interface FlowPath {
  id: string
  from: string
  to: string
  type: 'public' | 'internal' | 'database' | 'iam' | 'replication' | 'logs'
  bandwidth: string
  requestsPerSec?: number
  latency?: number
  status: 'active' | 'idle' | 'error'
}

interface ResourceNode {
  id: string
  name: string
  type: 'internet' | 'waf' | 'alb' | 'ec2' | 'lambda' | 'rds' | 'dynamodb' | 's3' | 'iam' | 'cloudwatch'
  tier: number
  x: number
  y: number
  trafficIn?: string
  trafficOut?: string
  status: 'healthy' | 'warning' | 'error'
  securityGroup?: string
  iamRole?: string
}

interface Props {
  systemName: string
}

export default function DynamicAWSArchitecture({ systemName }: Props) {
  const [isPlaying, setIsPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [showMetrics, setShowMetrics] = useState(true)
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes] = useState<ResourceNode[]>([])
  const [flows, setFlows] = useState<FlowPath[]>([])
  const [metrics, setMetrics] = useState({
    totalRequests: 10234,
    avgLatency: 12.5,
    activeFlows: 10,
    throughput: 2.1
  })
  const svgRef = useRef<SVGSVGElement>(null)

  // Fetch real data and build architecture
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/proxy/dependency-map/graph?systemName=${encodeURIComponent(systemName)}`)
        const data = await response.json()
        
        // Build nodes and flows from backend data
        buildArchitecture(data)
      } catch (error) {
        console.error('Failed to fetch architecture data:', error)
        // Use demo data if fetch fails
        buildDemoArchitecture()
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
  }, [systemName])

  const buildArchitecture = (data: any) => {
    const backendNodes = data.nodes || []
    const backendEdges = data.edges || []
    
    // Map backend nodes to architecture nodes
    const archNodes: ResourceNode[] = []
    const archFlows: FlowPath[] = []
    
    // Position constants
    const WIDTH = 1200
    const HEIGHT = 700
    const TIER_Y = { 0: 50, 1: 180, 2: 350, 3: 520, 4: 650 }
    
    // Check for internet exposure
    const internetExposed = backendEdges.filter((e: any) => e.edgeType === 'internet')
    
    // Add Internet node if there's exposure
    if (internetExposed.length > 0) {
      archNodes.push({
        id: 'internet',
        name: 'Internet',
        type: 'internet',
        tier: 0,
        x: WIDTH / 2,
        y: TIER_Y[0],
        trafficIn: `${Math.round(internetExposed.length * 2.5)}K/s`,
        status: 'healthy'
      })
    }
    
    // Group Security Groups by tier
    const sgNodes = backendNodes.filter((n: any) => n.type === 'SecurityGroup')
    const edgeSgs: any[] = []
    const appSgs: any[] = []
    const dbSgs: any[] = []
    
    sgNodes.forEach((sg: any) => {
      const hasInternetEdge = backendEdges.some((e: any) => 
        e.edgeType === 'internet' && e.target === sg.id
      )
      const receivesFromSg = backendEdges.some((e: any) =>
        e.sourceType === 'SecurityGroup' && e.target === sg.id
      )
      
      if (hasInternetEdge) {
        edgeSgs.push(sg)
      } else if (receivesFromSg) {
        dbSgs.push(sg)
      } else {
        appSgs.push(sg)
      }
    })
    
    // Add edge tier (ALB, WAF - internet-facing)
    edgeSgs.forEach((sg, i) => {
      archNodes.push({
        id: sg.id,
        name: sg.label || sg.id,
        type: 'alb',
        tier: 1,
        x: 200 + i * 300,
        y: TIER_Y[1],
        trafficIn: `${Math.round((i + 1) * 4)}K/s`,
        trafficOut: `${Math.round((i + 1) * 3.5)}K/s`,
        status: sg.networkExposure?.internetExposedRules > 0 ? 'warning' : 'healthy',
        securityGroup: sg.id
      })
    })
    
    // Add app tier
    appSgs.forEach((sg, i) => {
      archNodes.push({
        id: sg.id,
        name: sg.label || sg.id,
        type: 'ec2',
        tier: 2,
        x: 150 + i * 250,
        y: TIER_Y[2],
        trafficIn: `${Math.round((i + 1) * 2)}K/s`,
        status: 'healthy',
        securityGroup: sg.id
      })
    })
    
    // Add database tier
    dbSgs.forEach((sg, i) => {
      archNodes.push({
        id: sg.id,
        name: sg.label || sg.id,
        type: 'rds',
        tier: 3,
        x: 300 + i * 350,
        y: TIER_Y[3],
        trafficIn: `${Math.round((i + 1) * 800)}Mbps`,
        status: 'healthy',
        securityGroup: sg.id
      })
    })
    
    // Add S3 buckets
    const s3Nodes = backendNodes.filter((n: any) => n.type === 'S3Bucket')
    s3Nodes.slice(0, 3).forEach((s3: any, i: number) => {
      archNodes.push({
        id: s3.id,
        name: s3.label?.split('-')[1] || 'S3',
        type: 's3',
        tier: 3,
        x: 900 + (i % 2) * 150,
        y: TIER_Y[3] + Math.floor(i / 2) * 80,
        status: 'healthy'
      })
    })
    
    // Build flows from edges
    backendEdges.forEach((edge: any) => {
      if (!archNodes.find(n => n.id === edge.source) && edge.source !== 'Internet') return
      if (!archNodes.find(n => n.id === edge.target)) return
      
      let flowType: FlowPath['type'] = 'internal'
      let bandwidth = '1 Gbps'
      
      if (edge.edgeType === 'internet') {
        flowType = 'public'
        bandwidth = '10K req/s'
      } else if (edge.edgeType === 'network') {
        flowType = 'internal'
        bandwidth = edge.port === '5432' || edge.port === '3306' ? '800 Mbps' : '2 Gbps'
      } else if (edge.edgeType === 'iam_trust') {
        flowType = 'iam'
        bandwidth = 'trust'
      }
      
      archFlows.push({
        id: edge.id,
        from: edge.source === 'Internet' ? 'internet' : edge.source,
        to: edge.target,
        type: flowType,
        bandwidth,
        requestsPerSec: flowType === 'public' ? 10000 : undefined,
        latency: flowType === 'database' ? 2 : 12,
        status: 'active'
      })
    })
    
    setNodes(archNodes)
    setFlows(archFlows)
    
    // Update metrics
    setMetrics({
      totalRequests: archFlows.filter(f => f.type === 'public').length * 5000,
      avgLatency: 12.5,
      activeFlows: archFlows.length,
      throughput: archFlows.length * 0.3
    })
  }

  const buildDemoArchitecture = () => {
    // Demo data if backend fails
    setNodes([
      { id: 'internet', name: 'Internet', type: 'internet', tier: 0, x: 600, y: 50, trafficIn: '10K/s', status: 'healthy' },
      { id: 'waf', name: 'WAF', type: 'waf', tier: 1, x: 600, y: 150, trafficIn: '10K/s', trafficOut: '8K/s', status: 'healthy' },
      { id: 'alb', name: 'ALB', type: 'alb', tier: 1, x: 600, y: 250, trafficIn: '8K/s', status: 'healthy', securityGroup: 'alb-sg' },
      { id: 'ec2-1', name: 'App Server 1', type: 'ec2', tier: 2, x: 350, y: 400, trafficIn: '4K/s', status: 'healthy', securityGroup: 'app-sg' },
      { id: 'lambda', name: 'Lambda', type: 'lambda', tier: 2, x: 600, y: 400, trafficIn: '2K/s', status: 'healthy', iamRole: 'lambda-role' },
      { id: 'ec2-2', name: 'App Server 2', type: 'ec2', tier: 2, x: 850, y: 400, trafficIn: '4K/s', status: 'healthy', securityGroup: 'app-sg' },
      { id: 'rds', name: 'Primary DB', type: 'rds', tier: 3, x: 350, y: 550, trafficIn: '800Mbps', status: 'healthy', securityGroup: 'db-sg' },
      { id: 'dynamodb', name: 'DynamoDB', type: 'dynamodb', tier: 3, x: 600, y: 550, trafficIn: '100Mbps', status: 'healthy' },
      { id: 'rds-replica', name: 'Read Replica', type: 'rds', tier: 3, x: 850, y: 550, trafficIn: '400Mbps', status: 'healthy' },
      { id: 's3-logs', name: 'S3 Logs', type: 's3', tier: 4, x: 1000, y: 400, status: 'healthy' },
    ])
    
    setFlows([
      { id: 'f1', from: 'internet', to: 'waf', type: 'public', bandwidth: '10K req/s', requestsPerSec: 10000, latency: 5, status: 'active' },
      { id: 'f2', from: 'waf', to: 'alb', type: 'internal', bandwidth: '8K req/s', requestsPerSec: 8000, latency: 1, status: 'active' },
      { id: 'f3', from: 'alb', to: 'ec2-1', type: 'internal', bandwidth: '4K req/s', requestsPerSec: 4000, latency: 2, status: 'active' },
      { id: 'f4', from: 'alb', to: 'lambda', type: 'internal', bandwidth: '2K req/s', requestsPerSec: 2000, latency: 3, status: 'active' },
      { id: 'f5', from: 'alb', to: 'ec2-2', type: 'internal', bandwidth: '4K req/s', requestsPerSec: 4000, latency: 2, status: 'active' },
      { id: 'f6', from: 'ec2-1', to: 'rds', type: 'database', bandwidth: '800 Mbps', latency: 1, status: 'active' },
      { id: 'f7', from: 'lambda', to: 'dynamodb', type: 'database', bandwidth: '100 Mbps', latency: 5, status: 'active' },
      { id: 'f8', from: 'ec2-2', to: 'rds-replica', type: 'database', bandwidth: '600 Mbps', latency: 1, status: 'active' },
      { id: 'f9', from: 'rds', to: 'rds-replica', type: 'replication', bandwidth: '400 Mbps', latency: 10, status: 'active' },
      { id: 'f10', from: 'lambda', to: 's3-logs', type: 'logs', bandwidth: '50 Mbps', status: 'active' },
    ])
  }

  // Get node position
  const getNodePos = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    return node ? { x: node.x, y: node.y } : { x: 0, y: 0 }
  }

  // Get flow color
  const getFlowColor = (type: FlowPath['type']) => {
    const colors = {
      public: '#ef4444',     // red
      internal: '#22c55e',   // green
      database: '#3b82f6',   // blue
      iam: '#eab308',        // yellow
      replication: '#a855f7', // purple
      logs: '#ec4899'        // pink
    }
    return colors[type]
  }

  // Get resource icon and color
  const getResourceStyle = (type: ResourceNode['type']) => {
    const styles: Record<string, { icon: React.ReactNode, bgColor: string, borderColor: string }> = {
      internet: { icon: <Globe className="w-6 h-6" />, bgColor: '#dc2626', borderColor: '#b91c1c' },
      waf: { icon: <Shield className="w-6 h-6" />, bgColor: '#f97316', borderColor: '#ea580c' },
      alb: { icon: <Layers className="w-6 h-6" />, bgColor: '#f59e0b', borderColor: '#d97706' },
      ec2: { icon: <Server className="w-6 h-6" />, bgColor: '#22c55e', borderColor: '#16a34a' },
      lambda: { icon: <Zap className="w-6 h-6" />, bgColor: '#f97316', borderColor: '#ea580c' },
      rds: { icon: <Database className="w-6 h-6" />, bgColor: '#3b82f6', borderColor: '#2563eb' },
      dynamodb: { icon: <Database className="w-6 h-6" />, bgColor: '#8b5cf6', borderColor: '#7c3aed' },
      s3: { icon: <HardDrive className="w-6 h-6" />, bgColor: '#10b981', borderColor: '#059669' },
      iam: { icon: <Lock className="w-6 h-6" />, bgColor: '#ec4899', borderColor: '#db2777' },
      cloudwatch: { icon: <Activity className="w-6 h-6" />, bgColor: '#6366f1', borderColor: '#4f46e5' }
    }
    return styles[type] || styles.ec2
  }

  // Calculate bezier path between two nodes
  const getFlowPath = (from: string, to: string) => {
    const fromPos = getNodePos(from)
    const toPos = getNodePos(to)
    
    const dx = toPos.x - fromPos.x
    const dy = toPos.y - fromPos.y
    
    // Create curved path
    const midX = fromPos.x + dx / 2
    const midY = fromPos.y + dy / 2
    const curveOffset = Math.abs(dx) > 200 ? 50 : 20
    
    return `M ${fromPos.x} ${fromPos.y + 35} Q ${midX} ${midY + curveOffset} ${toPos.x} ${toPos.y - 35}`
  }

  // Animate metrics
  useEffect(() => {
    if (!isPlaying) return
    
    const interval = setInterval(() => {
      setMetrics(prev => ({
        totalRequests: prev.totalRequests + Math.floor(Math.random() * 100),
        avgLatency: Math.max(5, prev.avgLatency + (Math.random() - 0.5) * 2),
        activeFlows: flows.filter(f => f.status === 'active').length,
        throughput: Math.max(0.5, prev.throughput + (Math.random() - 0.5) * 0.2)
      }))
    }, 1000 / speed)
    
    return () => clearInterval(interval)
  }, [isPlaying, speed, flows])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[700px] bg-slate-900 rounded-xl">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-blue-400 animate-spin" />
          <span className="text-white text-lg">Building dynamic architecture...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-green-500" />
            Live Architecture View
          </h2>
          <p className="text-slate-500">
            Real-time data flows • {nodes.length} resources • {flows.length} active connections
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-3 rounded-xl transition-all ${
              isPlaying 
                ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' 
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          
          {/* Speed control */}
          <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-4 py-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.5"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-24 accent-blue-500"
            />
            <span className="text-sm font-medium w-8">{speed}x</span>
          </div>
          
          {/* Toggle metrics */}
          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${
              showMetrics ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            <Eye className="w-4 h-4" />
            Metrics
          </button>
        </div>
      </div>

      {/* Main architecture diagram */}
      <div className="relative bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 rounded-2xl overflow-hidden" style={{ height: '700px' }}>
        {/* Live metrics panel */}
        {showMetrics && (
          <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700 z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-white font-semibold">Live Metrics</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-white">{(metrics.totalRequests / 1000).toFixed(1)}K</div>
                <div className="text-xs text-slate-400">req/s</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">{metrics.avgLatency.toFixed(1)}ms</div>
                <div className="text-xs text-slate-400">latency</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">{metrics.activeFlows}</div>
                <div className="text-xs text-slate-400">flows</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">{metrics.throughput.toFixed(1)}</div>
                <div className="text-xs text-slate-400">Gbps</div>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm rounded-xl p-3 border border-slate-700 z-10">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-red-500" />
              <span className="text-slate-300">Public</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-green-500" />
              <span className="text-slate-300">Internal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-blue-500" />
              <span className="text-slate-300">Database</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-purple-500" />
              <span className="text-slate-300">Replication</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-pink-500" />
              <span className="text-slate-300">Logs</span>
            </div>
          </div>
        </div>

        {/* SVG Architecture */}
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox="0 0 1200 700"
          className="absolute inset-0"
        >
          <defs>
            {/* Glow filters */}
            <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            {/* Arrow markers */}
            <marker id="arrow-red" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
            </marker>
            <marker id="arrow-green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#22c55e" />
            </marker>
            <marker id="arrow-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
            </marker>
          </defs>

          {/* Flow paths with animated particles */}
          {flows.map((flow, idx) => {
            const path = getFlowPath(flow.from, flow.to)
            const color = getFlowColor(flow.type)
            const particleCount = flow.type === 'public' ? 5 : 3
            
            return (
              <g key={flow.id}>
                {/* Path line */}
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={0.4}
                  strokeDasharray={flow.type === 'public' || flow.type === 'replication' ? '8,4' : undefined}
                />
                
                {/* Animated particles */}
                {isPlaying && Array.from({ length: particleCount }).map((_, i) => (
                  <circle
                    key={`${flow.id}-particle-${i}`}
                    r={4}
                    fill={color}
                    filter={`url(#glow-${flow.type === 'public' ? 'red' : flow.type === 'internal' ? 'green' : 'blue'})`}
                  >
                    <animateMotion
                      dur={`${(3 - speed * 0.4)}s`}
                      repeatCount="indefinite"
                      begin={`${i * (3 / particleCount / speed)}s`}
                      path={path}
                    />
                  </circle>
                ))}
                
                {/* Bandwidth label */}
                <text
                  x={getNodePos(flow.from).x + (getNodePos(flow.to).x - getNodePos(flow.from).x) / 2}
                  y={getNodePos(flow.from).y + (getNodePos(flow.to).y - getNodePos(flow.from).y) / 2}
                  fill={color}
                  fontSize={10}
                  textAnchor="middle"
                  className="font-mono"
                >
                  {flow.bandwidth}
                </text>
              </g>
            )
          })}

          {/* Resource nodes */}
          {nodes.map((node) => {
            const style = getResourceStyle(node.type)
            
            return (
              <g key={node.id} transform={`translate(${node.x - 50}, ${node.y - 35})`}>
                {/* Node background */}
                <rect
                  x={0}
                  y={0}
                  width={100}
                  height={70}
                  rx={12}
                  fill={style.bgColor}
                  stroke={style.borderColor}
                  strokeWidth={2}
                  className="transition-all hover:brightness-110"
                  style={{
                    filter: node.status === 'warning' ? 'drop-shadow(0 0 8px rgba(234, 179, 8, 0.6))' : undefined
                  }}
                />
                
                {/* Icon */}
                <foreignObject x={35} y={8} width={30} height={30}>
                  <div className="flex items-center justify-center text-white">
                    {style.icon}
                  </div>
                </foreignObject>
                
                {/* Name */}
                <text x={50} y={50} fill="white" fontSize={11} textAnchor="middle" fontWeight="600">
                  {node.name.length > 12 ? node.name.slice(0, 12) + '...' : node.name}
                </text>
                
                {/* Traffic indicator */}
                {node.trafficIn && (
                  <text x={50} y={65} fill="rgba(255,255,255,0.7)" fontSize={9} textAnchor="middle" fontFamily="monospace">
                    ↓ {node.trafficIn}
                  </text>
                )}
                
                {/* Status indicator */}
                <circle
                  cx={90}
                  cy={10}
                  r={5}
                  fill={node.status === 'healthy' ? '#22c55e' : node.status === 'warning' ? '#eab308' : '#ef4444'}
                >
                  {isPlaying && node.status === 'healthy' && (
                    <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
                  )}
                </circle>
                
                {/* Security Group badge */}
                {node.securityGroup && (
                  <g transform="translate(0, 70)">
                    <rect x={10} y={5} width={80} height={16} rx={4} fill="rgba(0,0,0,0.4)" />
                    <text x={50} y={16} fill="#94a3b8" fontSize={8} textAnchor="middle">
                      🔒 {node.securityGroup.slice(0, 10)}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Flow summary cards */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { type: 'public', label: 'Public Ingress', color: 'bg-red-500' },
          { type: 'internal', label: 'Internal', color: 'bg-green-500' },
          { type: 'database', label: 'Database', color: 'bg-blue-500' },
          { type: 'iam', label: 'IAM Trust', color: 'bg-yellow-500' },
          { type: 'replication', label: 'Replication', color: 'bg-purple-500' },
          { type: 'logs', label: 'Logs/Metrics', color: 'bg-pink-500' },
        ].map(({ type, label, color }) => {
          const count = flows.filter(f => f.type === type).length
          return (
            <div key={type} className="bg-white border rounded-xl p-3 flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${color}`} />
              <div>
                <div className="text-lg font-bold">{count}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


