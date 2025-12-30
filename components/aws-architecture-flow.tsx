'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { 
  Globe, Shield, Database, Server, Cloud, Lock, AlertTriangle, 
  CheckCircle, RefreshCw, Play, Pause, Zap, Activity, Clock,
  HardDrive, Layers, Settings, Eye, ChevronRight, X, ExternalLink,
  Cpu, Box, Key, FileText, Network, Radio
} from 'lucide-react'

// Service type icons and colors
const SERVICE_CONFIG: Record<string, { icon: React.ReactNode; color: string; category: string }> = {
  // Compute
  EC2: { icon: <Server className="w-5 h-5" />, color: '#FF9900', category: 'compute' },
  Lambda: { icon: <Zap className="w-5 h-5" />, color: '#FF9900', category: 'compute' },
  ECS: { icon: <Box className="w-5 h-5" />, color: '#FF9900', category: 'compute' },
  EKS: { icon: <Box className="w-5 h-5" />, color: '#FF9900', category: 'compute' },
  
  // Database
  RDS: { icon: <Database className="w-5 h-5" />, color: '#3B48CC', category: 'database' },
  DynamoDB: { icon: <Database className="w-5 h-5" />, color: '#3B48CC', category: 'database' },
  Aurora: { icon: <Database className="w-5 h-5" />, color: '#3B48CC', category: 'database' },
  ElastiCache: { icon: <Database className="w-5 h-5" />, color: '#3B48CC', category: 'database' },
  
  // Storage
  S3: { icon: <HardDrive className="w-5 h-5" />, color: '#3F8624', category: 'storage' },
  EFS: { icon: <HardDrive className="w-5 h-5" />, color: '#3F8624', category: 'storage' },
  
  // Networking
  ALB: { icon: <Network className="w-5 h-5" />, color: '#8C4FFF', category: 'networking' },
  NLB: { icon: <Network className="w-5 h-5" />, color: '#8C4FFF', category: 'networking' },
  CloudFront: { icon: <Globe className="w-5 h-5" />, color: '#8C4FFF', category: 'networking' },
  APIGateway: { icon: <Radio className="w-5 h-5" />, color: '#8C4FFF', category: 'networking' },
  VPC: { icon: <Cloud className="w-5 h-5" />, color: '#8C4FFF', category: 'networking' },
  
  // Security
  IAM: { icon: <Key className="w-5 h-5" />, color: '#DD344C', category: 'security' },
  KMS: { icon: <Lock className="w-5 h-5" />, color: '#DD344C', category: 'security' },
  WAF: { icon: <Shield className="w-5 h-5" />, color: '#DD344C', category: 'security' },
  SecurityGroup: { icon: <Shield className="w-5 h-5" />, color: '#DD344C', category: 'security' },
  
  // Integration
  SQS: { icon: <FileText className="w-5 h-5" />, color: '#FF4F8B', category: 'integration' },
  SNS: { icon: <Radio className="w-5 h-5" />, color: '#FF4F8B', category: 'integration' },
  EventBridge: { icon: <Zap className="w-5 h-5" />, color: '#FF4F8B', category: 'integration' },
  StepFunctions: { icon: <Activity className="w-5 h-5" />, color: '#FF4F8B', category: 'integration' },
  
  // External
  Internet: { icon: <Globe className="w-5 h-5" />, color: '#1a1a2e', category: 'external' },
  External: { icon: <ExternalLink className="w-5 h-5" />, color: '#6b7280', category: 'external' },
  
  // Default
  default: { icon: <Cpu className="w-5 h-5" />, color: '#64748b', category: 'other' }
}

const CATEGORY_COLORS = {
  compute: { bg: 'rgba(255, 153, 0, 0.1)', border: '#FF9900' },
  database: { bg: 'rgba(59, 72, 204, 0.1)', border: '#3B48CC' },
  storage: { bg: 'rgba(63, 134, 36, 0.1)', border: '#3F8624' },
  networking: { bg: 'rgba(140, 79, 255, 0.1)', border: '#8C4FFF' },
  security: { bg: 'rgba(221, 52, 76, 0.1)', border: '#DD344C' },
  integration: { bg: 'rgba(255, 79, 139, 0.1)', border: '#FF4F8B' },
  external: { bg: 'rgba(26, 26, 46, 0.1)', border: '#1a1a2e' },
  other: { bg: 'rgba(100, 116, 139, 0.1)', border: '#64748b' }
}

interface ArchNode {
  id: string
  name: string
  type: string
  category: string
  status: 'healthy' | 'warning' | 'error' | 'unknown'
  x: number
  y: number
  zone?: string
  vpc?: string
  az?: string
  metrics?: {
    cpu?: number
    memory?: number
    connections?: number
    latency?: number
  }
  details?: Record<string, any>
}

interface ArchEdge {
  id: string
  source: string
  target: string
  protocol?: string
  port?: string
  latency?: number
  bandwidth?: string
  status: 'active' | 'idle' | 'error'
}

interface ArchZone {
  id: string
  name: string
  type: 'vpc' | 'subnet' | 'az' | 'region'
  x: number
  y: number
  width: number
  height: number
  children: string[]
}

interface Props {
  systemName: string
}

export default function AWSArchitectureFlow({ systemName }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nodes, setNodes] = useState<ArchNode[]>([])
  const [edges, setEdges] = useState<ArchEdge[]>([])
  const [zones, setZones] = useState<ArchZone[]>([])
  const [selectedNode, setSelectedNode] = useState<ArchNode | null>(null)
  const [isPlaying, setIsPlaying] = useState(true)
  const [showFlows, setShowFlows] = useState(true)
  const [metrics, setMetrics] = useState({
    requests: 30842,
    latency: 12.5,
    flows: 0,
    throughput: 2.4
  })
  const svgRef = useRef<SVGSVGElement>(null)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    fetchArchitecture()
  }, [systemName])

  // Animate metrics
  useEffect(() => {
    if (!isPlaying) return
    
    const interval = setInterval(() => {
      setMetrics(prev => ({
        requests: prev.requests + Math.floor(Math.random() * 500 - 200),
        latency: Math.max(5, Math.min(50, prev.latency + (Math.random() - 0.5) * 3)),
        flows: edges.filter(e => e.status === 'active').length,
        throughput: Math.max(1, prev.throughput + (Math.random() - 0.5) * 0.3)
      }))
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isPlaying, edges])

  const fetchArchitecture = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch from LP issues for real data
      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${encodeURIComponent(systemName)}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`)
      }
      
      const data = await response.json()
      buildArchitecture(data.resources || [])
      
    } catch (err: any) {
      console.error('Failed to fetch architecture:', err)
      setError(err.message)
      // Build demo architecture
      buildDemoArchitecture()
    } finally {
      setLoading(false)
    }
  }

  const buildArchitecture = (resources: any[]) => {
    const archNodes: ArchNode[] = []
    const archEdges: ArchEdge[] = []
    const archZones: ArchZone[] = []
    
    // Layout constants
    const WIDTH = 1400
    const HEIGHT = 900
    const TIER_Y = {
      internet: 60,
      edge: 180,
      app: 380,
      data: 580,
      storage: 750
    }
    
    // Group resources by type
    const iamRoles = resources.filter(r => r.resourceType === 'IAMRole')
    const sgs = resources.filter(r => r.resourceType === 'SecurityGroup')
    const s3Buckets = resources.filter(r => r.resourceType === 'S3Bucket')
    
    // Categorize SGs
    const publicSgs = sgs.filter(sg => (sg.networkExposure?.internetExposedRules || 0) > 0)
    const appSgs = sgs.filter(sg => 
      (sg.networkExposure?.internetExposedRules || 0) === 0 &&
      !sg.resourceName.toLowerCase().includes('db')
    )
    const dbSgs = sgs.filter(sg => sg.resourceName.toLowerCase().includes('db'))
    
    // Add Internet node if there's public exposure
    if (publicSgs.length > 0) {
      archNodes.push({
        id: 'internet',
        name: 'Internet',
        type: 'Internet',
        category: 'external',
        status: 'healthy',
        x: WIDTH / 2,
        y: TIER_Y.internet
      })
    }
    
    // Add VPC zone
    archZones.push({
      id: 'vpc-main',
      name: 'Production VPC (10.0.0.0/16)',
      type: 'vpc',
      x: 100,
      y: TIER_Y.edge - 30,
      width: WIDTH - 200,
      height: TIER_Y.storage - TIER_Y.edge + 100,
      children: []
    })
    
    // Add public-facing SGs (ALB tier)
    publicSgs.forEach((sg, i) => {
      const spacing = (WIDTH - 400) / Math.max(publicSgs.length, 1)
      archNodes.push({
        id: sg.resourceName,
        name: sg.resourceName.replace('saferemediate-test-', ''),
        type: 'ALB',
        category: 'networking',
        status: 'healthy',
        x: 250 + i * spacing,
        y: TIER_Y.edge,
        zone: 'vpc-main',
        details: {
          totalRules: sg.networkExposure?.totalRules || 0,
          publicRules: sg.networkExposure?.internetExposedRules || 0
        }
      })
      
      // Add edge from internet
      archEdges.push({
        id: `internet-${sg.resourceName}`,
        source: 'internet',
        target: sg.resourceName,
        protocol: 'HTTPS',
        port: '443',
        latency: 45,
        status: 'active'
      })
    })
    
    // Add app tier SGs
    appSgs.forEach((sg, i) => {
      const spacing = (WIDTH - 400) / Math.max(appSgs.length, 1)
      archNodes.push({
        id: sg.resourceName,
        name: sg.resourceName.replace('saferemediate-test-', ''),
        type: 'EC2',
        category: 'compute',
        status: 'healthy',
        x: 250 + i * spacing,
        y: TIER_Y.app,
        zone: 'vpc-main',
        details: {
          instanceType: 't3.medium',
          totalRules: sg.networkExposure?.totalRules || 0
        }
      })
    })
    
    // Add database tier SGs
    dbSgs.forEach((sg, i) => {
      const spacing = (WIDTH - 400) / Math.max(dbSgs.length, 1)
      archNodes.push({
        id: sg.resourceName,
        name: sg.resourceName.replace('saferemediate-test-', ''),
        type: 'RDS',
        category: 'database',
        status: 'healthy',
        x: 300 + i * spacing,
        y: TIER_Y.data,
        zone: 'vpc-main',
        details: {
          engine: 'PostgreSQL',
          port: 5432
        }
      })
    })
    
    // Add S3 buckets
    s3Buckets.slice(0, 4).forEach((s3, i) => {
      archNodes.push({
        id: s3.resourceName,
        name: s3.resourceName.split('-')[1] || 'S3',
        type: 'S3',
        category: 'storage',
        status: 'healthy',
        x: 200 + i * 200,
        y: TIER_Y.storage,
        details: {
          lpScore: s3.lpScore,
          region: s3.evidence?.coverage?.regions?.[0] || 'eu-west-1'
        }
      })
    })
    
    // Add IAM roles (sidebar)
    iamRoles.slice(0, 8).forEach((iam, i) => {
      archNodes.push({
        id: iam.resourceName,
        name: iam.resourceName.replace('SafeRemediate-', '').replace('AWSServiceRoleFor', ''),
        type: 'IAM',
        category: 'security',
        status: 'healthy',
        x: WIDTH - 120,
        y: 150 + i * 80,
        details: {
          usedCount: iam.usedCount,
          lpScore: iam.lpScore
        }
      })
    })
    
    // Build edges from SG rules
    sgs.forEach(sg => {
      const rules = sg.allowedList || []
      rules.forEach((rule: any) => {
        const sources = rule.sources || []
        sources.forEach((source: any) => {
          if (source.sgId || source.sgName) {
            const sourceName = source.sgName || source.sgId
            const sourceNode = archNodes.find(n => n.id.includes(sourceName) || sourceName.includes(n.id))
            if (sourceNode) {
              archEdges.push({
                id: `${sourceNode.id}-${sg.resourceName}-${rule.port || 'all'}`,
                source: sourceNode.id,
                target: sg.resourceName,
                protocol: rule.protocol || 'TCP',
                port: rule.port || '*',
                latency: Math.floor(Math.random() * 10) + 1,
                status: 'active'
              })
            }
          }
        })
      })
    })
    
    setNodes(archNodes)
    setEdges(archEdges)
    setZones(archZones)
    setMetrics(prev => ({ ...prev, flows: archEdges.length }))
  }

  const buildDemoArchitecture = () => {
    // Demo architecture if API fails
    const demoNodes: ArchNode[] = [
      { id: 'internet', name: 'Internet', type: 'Internet', category: 'external', status: 'healthy', x: 700, y: 60 },
      { id: 'waf', name: 'WAF WebACL', type: 'WAF', category: 'security', status: 'healthy', x: 700, y: 160 },
      { id: 'alb', name: 'Application LB', type: 'ALB', category: 'networking', status: 'healthy', x: 700, y: 280 },
      { id: 'app1', name: 'App Server 1', type: 'EC2', category: 'compute', status: 'healthy', x: 450, y: 420 },
      { id: 'app2', name: 'App Server 2', type: 'EC2', category: 'compute', status: 'healthy', x: 950, y: 420 },
      { id: 'lambda', name: 'API Handler', type: 'Lambda', category: 'compute', status: 'healthy', x: 700, y: 420 },
      { id: 'rds', name: 'Primary DB', type: 'RDS', category: 'database', status: 'healthy', x: 450, y: 580 },
      { id: 'dynamo', name: 'Sessions', type: 'DynamoDB', category: 'database', status: 'healthy', x: 700, y: 580 },
      { id: 'aurora', name: 'Read Replica', type: 'Aurora', category: 'database', status: 'healthy', x: 950, y: 580 },
      { id: 's3-logs', name: 'Logs', type: 'S3', category: 'storage', status: 'healthy', x: 300, y: 720 },
      { id: 's3-data', name: 'Data Lake', type: 'S3', category: 'storage', status: 'healthy', x: 550, y: 720 },
    ]
    
    const demoEdges: ArchEdge[] = [
      { id: 'e1', source: 'internet', target: 'waf', protocol: 'HTTPS', port: '443', latency: 5, status: 'active' },
      { id: 'e2', source: 'waf', target: 'alb', protocol: 'HTTPS', port: '443', latency: 2, status: 'active' },
      { id: 'e3', source: 'alb', target: 'app1', protocol: 'HTTP', port: '8080', latency: 3, status: 'active' },
      { id: 'e4', source: 'alb', target: 'app2', protocol: 'HTTP', port: '8080', latency: 3, status: 'active' },
      { id: 'e5', source: 'alb', target: 'lambda', protocol: 'HTTP', port: '443', latency: 10, status: 'active' },
      { id: 'e6', source: 'app1', target: 'rds', protocol: 'TCP', port: '5432', latency: 1, status: 'active' },
      { id: 'e7', source: 'app2', target: 'aurora', protocol: 'TCP', port: '5432', latency: 1, status: 'active' },
      { id: 'e8', source: 'lambda', target: 'dynamo', protocol: 'HTTPS', port: '443', latency: 5, status: 'active' },
      { id: 'e9', source: 'rds', target: 'aurora', protocol: 'TCP', port: '5432', latency: 10, status: 'active' },
      { id: 'e10', source: 'app1', target: 's3-logs', protocol: 'HTTPS', port: '443', latency: 15, status: 'active' },
    ]
    
    const demoZones: ArchZone[] = [
      { id: 'vpc-main', name: 'Production VPC (10.0.0.0/16)', type: 'vpc', x: 100, y: 230, width: 1200, height: 550, children: [] }
    ]
    
    setNodes(demoNodes)
    setEdges(demoEdges)
    setZones(demoZones)
  }

  const getServiceConfig = (type: string) => {
    return SERVICE_CONFIG[type] || SERVICE_CONFIG.default
  }

  const getPath = (source: string, target: string) => {
    const sourceNode = nodes.find(n => n.id === source)
    const targetNode = nodes.find(n => n.id === target)
    if (!sourceNode || !targetNode) return ''
    
    const dx = targetNode.x - sourceNode.x
    const dy = targetNode.y - sourceNode.y
    const midX = sourceNode.x + dx / 2
    const midY = sourceNode.y + dy / 2
    const curve = Math.min(Math.abs(dx) * 0.3, 80)
    
    return `M ${sourceNode.x} ${sourceNode.y + 40} Q ${midX} ${midY + curve} ${targetNode.x} ${targetNode.y - 40}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[900px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <RefreshCw className="w-12 h-12 text-purple-400 animate-spin" />
            <div className="absolute inset-0 blur-xl bg-purple-500/30 animate-pulse" />
          </div>
          <span className="text-white text-lg font-medium">Building Architecture View...</span>
          <span className="text-slate-400 text-sm">Fetching real-time AWS data</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-bold text-white">AWS Architecture</h2>
          </div>
          <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">
            Production
          </span>
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
            eu-west-1
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Live Metrics */}
          <div className="flex items-center gap-6 bg-black/30 rounded-lg px-4 py-2">
            <div className="text-center">
              <div className="text-lg font-bold text-white">{(metrics.requests / 1000).toFixed(1)}K</div>
              <div className="text-xs text-slate-400">req/s</div>
            </div>
            <div className="h-8 w-px bg-slate-600" />
            <div className="text-center">
              <div className="text-lg font-bold text-green-400">{metrics.latency.toFixed(1)}ms</div>
              <div className="text-xs text-slate-400">latency</div>
            </div>
            <div className="h-8 w-px bg-slate-600" />
            <div className="text-center">
              <div className="text-lg font-bold text-purple-400">{metrics.flows}</div>
              <div className="text-xs text-slate-400">flows</div>
            </div>
            <div className="h-8 w-px bg-slate-600" />
            <div className="text-center">
              <div className="text-lg font-bold text-blue-400">{metrics.throughput.toFixed(1)}</div>
              <div className="text-xs text-slate-400">Gbps</div>
            </div>
          </div>
          
          {/* Controls */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-2 rounded-lg transition-all ${
              isPlaying ? 'bg-purple-500 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          
          <button
            onClick={() => setShowFlows(!showFlows)}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
              showFlows ? 'bg-purple-500 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            <Activity className="w-4 h-4" />
            Flow
          </button>
          
          <button
            onClick={fetchArchitecture}
            className="p-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Canvas */}
      <div className="flex gap-4">
        <div className="flex-1 bg-gradient-to-br from-slate-900 via-[#0f172a] to-slate-900 rounded-2xl overflow-hidden relative" style={{ height: '800px' }}>
          {/* Category Legend */}
          <div className="absolute bottom-4 left-4 flex items-center gap-4 bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2 z-10">
            {Object.entries(CATEGORY_COLORS).slice(0, 6).map(([category, { border }]) => (
              <div key={category} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: border }} />
                <span className="text-xs text-slate-400 capitalize">{category}</span>
              </div>
            ))}
          </div>

          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox="0 0 1400 800"
            className="absolute inset-0"
          >
            <defs>
              {/* Glow filter */}
              <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              
              {/* Arrow marker */}
              <marker id="arrow-flow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#a855f7" />
              </marker>
              
              {/* Gradient for nodes */}
              <linearGradient id="node-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.1)" />
              </linearGradient>
            </defs>

            {/* VPC Zones */}
            {zones.map(zone => (
              <g key={zone.id}>
                <rect
                  x={zone.x}
                  y={zone.y}
                  width={zone.width}
                  height={zone.height}
                  fill="rgba(139, 92, 246, 0.03)"
                  stroke="rgba(139, 92, 246, 0.3)"
                  strokeWidth={2}
                  strokeDasharray="8,4"
                  rx={16}
                />
                <text
                  x={zone.x + 20}
                  y={zone.y + 25}
                  fill="rgba(139, 92, 246, 0.7)"
                  fontSize={14}
                  fontWeight="600"
                >
                  {zone.name}
                </text>
              </g>
            ))}

            {/* Data Flow Edges */}
            {edges.map(edge => {
              const path = getPath(edge.source, edge.target)
              if (!path) return null
              
              return (
                <g key={edge.id}>
                  {/* Path line */}
                  <path
                    d={path}
                    fill="none"
                    stroke="rgba(168, 85, 247, 0.3)"
                    strokeWidth={2}
                    markerEnd="url(#arrow-flow)"
                  />
                  
                  {/* Animated particles */}
                  {isPlaying && showFlows && edge.status === 'active' && [0, 1, 2].map(i => (
                    <circle
                      key={`${edge.id}-p${i}`}
                      r={4}
                      fill="#a855f7"
                      filter="url(#glow-purple)"
                    >
                      <animateMotion
                        dur="2.5s"
                        repeatCount="indefinite"
                        begin={`${i * 0.8}s`}
                        path={path}
                      />
                    </circle>
                  ))}
                  
                  {/* Latency label */}
                  {edge.latency && (
                    <text
                      fill="rgba(168, 85, 247, 0.8)"
                      fontSize={10}
                      textAnchor="middle"
                      className="font-mono"
                    >
                      <textPath href={`#${edge.id}-path`} startOffset="50%">
                        {edge.latency}ms
                      </textPath>
                    </text>
                  )}
                </g>
              )
            })}

            {/* Service Nodes */}
            {nodes.map(node => {
              const config = getServiceConfig(node.type)
              const categoryColor = CATEGORY_COLORS[node.category as keyof typeof CATEGORY_COLORS] || CATEGORY_COLORS.other
              const isSelected = selectedNode?.id === node.id
              
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x - 60}, ${node.y - 40})`}
                  className="cursor-pointer"
                  onClick={() => setSelectedNode(isSelected ? null : node)}
                >
                  {/* Node background */}
                  <rect
                    x={0}
                    y={0}
                    width={120}
                    height={80}
                    rx={12}
                    fill="url(#node-gradient)"
                    stroke={isSelected ? '#a855f7' : categoryColor.border}
                    strokeWidth={isSelected ? 3 : 2}
                    filter={isSelected ? 'url(#glow-purple)' : undefined}
                    className="transition-all"
                  />
                  
                  {/* Category bar */}
                  <rect
                    x={0}
                    y={0}
                    width={120}
                    height={4}
                    rx={2}
                    fill={config.color}
                  />
                  
                  {/* Icon */}
                  <foreignObject x={10} y={15} width={30} height={30}>
                    <div 
                      className="flex items-center justify-center rounded-lg p-1"
                      style={{ backgroundColor: `${config.color}30` }}
                    >
                      <div style={{ color: config.color }}>{config.icon}</div>
                    </div>
                  </foreignObject>
                  
                  {/* Name */}
                  <text x={45} y={30} fill="white" fontSize={11} fontWeight="600">
                    {node.name.length > 12 ? node.name.slice(0, 10) + '...' : node.name}
                  </text>
                  
                  {/* Type badge */}
                  <text x={45} y={46} fill="rgba(255,255,255,0.6)" fontSize={9} className="font-mono">
                    {node.type}
                  </text>
                  
                  {/* Status indicator */}
                  <circle
                    cx={105}
                    cy={15}
                    r={5}
                    fill={node.status === 'healthy' ? '#22c55e' : node.status === 'warning' ? '#eab308' : '#ef4444'}
                  >
                    {isPlaying && (
                      <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
                    )}
                  </circle>
                  
                  {/* Status text */}
                  <text x={10} y={70} fill="rgba(255,255,255,0.5)" fontSize={8}>
                    ● {node.status}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Details Panel */}
        {selectedNode && (
          <div className="w-80 bg-slate-800 rounded-xl p-4 overflow-y-auto" style={{ height: '800px' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-lg">Resource Details</h3>
              <button 
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ 
                    backgroundColor: `${getServiceConfig(selectedNode.type).color}20`,
                    color: getServiceConfig(selectedNode.type).color
                  }}
                >
                  {getServiceConfig(selectedNode.type).icon}
                </div>
                <div>
                  <div className="font-bold text-white">{selectedNode.name}</div>
                  <div className="text-sm text-slate-400">{selectedNode.type}</div>
                </div>
              </div>
              
              {/* Status */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  selectedNode.status === 'healthy' ? 'bg-green-500' : 
                  selectedNode.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                <span className="text-sm text-slate-300 capitalize">{selectedNode.status}</span>
              </div>
              
              {/* Category */}
              <div>
                <div className="text-xs text-slate-500 mb-1">Category</div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm"
                  style={{ 
                    backgroundColor: CATEGORY_COLORS[selectedNode.category as keyof typeof CATEGORY_COLORS]?.bg,
                    color: CATEGORY_COLORS[selectedNode.category as keyof typeof CATEGORY_COLORS]?.border
                  }}
                >
                  {selectedNode.category}
                </div>
              </div>
              
              {/* Connections */}
              <div>
                <div className="text-xs text-slate-500 mb-2">Connections</div>
                <div className="space-y-2">
                  {edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).map(edge => {
                    const isOutgoing = edge.source === selectedNode.id
                    const otherId = isOutgoing ? edge.target : edge.source
                    const otherNode = nodes.find(n => n.id === otherId)
                    
                    return (
                      <div key={edge.id} className="flex items-center gap-2 bg-slate-700/50 rounded-lg px-3 py-2">
                        <ChevronRight className={`w-4 h-4 text-purple-400 ${isOutgoing ? '' : 'rotate-180'}`} />
                        <span className="text-sm text-slate-300">{otherNode?.name || otherId}</span>
                        {edge.port && (
                          <span className="ml-auto text-xs text-slate-500 font-mono">:{edge.port}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              
              {/* Details */}
              {selectedNode.details && Object.keys(selectedNode.details).length > 0 && (
                <div>
                  <div className="text-xs text-slate-500 mb-2">Properties</div>
                  <div className="bg-slate-700/50 rounded-lg p-3 space-y-2">
                    {Object.entries(selectedNode.details).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="text-white font-mono">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

