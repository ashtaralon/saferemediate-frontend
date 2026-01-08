'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import cytoscape, { Core } from 'cytoscape'
// @ts-ignore - no types available for cytoscape-cose-bilkent
import coseBilkent from 'cytoscape-cose-bilkent'
import { 
  Shield, Database, Key, Globe, 
  RefreshCw, ZoomIn, ZoomOut, Maximize2,
  ChevronRight, AlertTriangle, CheckCircle, X,
  Layers, Search, ArrowRight, Download,
  Play, FileText, Clock, Info, Activity
} from 'lucide-react'

if (typeof window !== 'undefined') {
  try { cytoscape.use(coseBilkent) } catch (e) {}
}

// AWS-style colors matching official AWS icons
const COLORS: Record<string, string> = {
  IAMRole: '#759C3E', // AWS IAM green
  SecurityGroup: '#7B2FBE', // AWS VPC purple
  S3Bucket: '#759C3E', // AWS S3 green
  EC2: '#F58536', // AWS EC2 orange
  Lambda: '#F58536', // AWS Lambda orange
  RDS: '#3F48CC', // AWS RDS blue
  DynamoDB: '#3F48CC', // AWS DynamoDB blue
  Internet: '#D13212', // AWS Internet red
  External: '#D13212',
  Service: '#3B82F6',
  User: '#759C3E',
  Role: '#759C3E',
  VPC: '#7B2FBE',
  Subnet: '#7B2FBE',
  CloudWatch: '#F58536',
  CloudTrail: '#759C3E',
  System: '#64748b',
}

// AWS-style SVG icons as data URIs
const AWS_ICONS: Record<string, string> = {
  // EC2 - Orange square with server icon
  EC2: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#F58536" rx="4"/><path d="M12 14h24v20H12V14zm2 2v16h20V16H14zm2 2h16v2H16v-2zm0 4h16v2H16v-2zm0 4h12v2H16v-2z" fill="white"/></svg>`)}`,
  
  // Lambda - Orange square with lambda symbol (λ)
  Lambda: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#F58536" rx="4"/><text x="24" y="32" font-family="Arial" font-size="28" font-weight="bold" fill="white" text-anchor="middle">λ</text></svg>`)}`,
  
  // S3 - Green square with bucket icon
  S3Bucket: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#759C3E" rx="4"/><path d="M12 18c0-2 2-4 4-4h16c2 0 4 2 4 4v2H12v-2zm0 4v8c0 2 2 4 4 4h16c2 0 4-2 4-4v-8H12zm2 2h20v6c0 1-1 2-2 2H16c-1 0-2-1-2-2v-6z" fill="white"/></svg>`)}`,
  
  // IAM Role - Green square with key/shield icon
  IAMRole: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#759C3E" rx="4"/><path d="M24 12c-4 0-7 3-7 7v3h-3v6h6v-6h2v6h6v-6h-2v-3c0-4-3-7-7-7zm0 2c3 0 5 2 5 5v3h-10v-3c0-3 2-5 5-5z" fill="white"/></svg>`)}`,
  
  // Security Group - Purple square with shield icon
  SecurityGroup: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#7B2FBE" rx="4"/><path d="M24 10l-8 4v8c0 5 4 9 8 10 4-1 8-5 8-10v-8l-8-4zm0 2l6 3v7c0 4-3 7-6 8-3-1-6-4-6-8v-7l6-3z" fill="white"/></svg>`)}`,
  
  // RDS - Blue square with database cylinder
  RDS: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#3F48CC" rx="4"/><ellipse cx="24" cy="16" rx="8" ry="3" fill="white" opacity="0.8"/><rect x="16" y="16" width="16" height="16" fill="white" opacity="0.6"/><ellipse cx="24" cy="32" rx="8" ry="3" fill="white"/></svg>`)}`,
  
  // DynamoDB - Blue square with lightning bolt over database
  DynamoDB: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#3F48CC" rx="4"/><ellipse cx="24" cy="16" rx="8" ry="3" fill="white" opacity="0.8"/><rect x="16" y="16" width="16" height="16" fill="white" opacity="0.6"/><ellipse cx="24" cy="32" rx="8" ry="3" fill="white"/><path d="M20 20l8 4-4 4 8-8-8-4 4-4-8 8z" fill="#FFD700"/></svg>`)}`,
  
  // Internet - Red diamond
  Internet: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M24 4l20 20-20 20L4 24z" fill="#D13212"/><circle cx="24" cy="24" r="8" fill="white"/></svg>`)}`,
  
  // VPC - Purple square with cloud
  VPC: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#7B2FBE" rx="4"/><path d="M16 20c-2 0-4 2-4 4s2 4 4 4h2v2h12v-2h2c2 0 4-2 4-4s-2-4-4-4h-2v-2H18v2h-2zm0 2h2v2h-2v-2zm14 0h2v2h-2v-2z" fill="white"/></svg>`)}`,
  
  // Default service icon
  Service: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#3B82F6" rx="4"/><rect x="12" y="12" width="24" height="24" rx="2" fill="white" opacity="0.8"/></svg>`)}`,
}

const SHAPES: Record<string, string> = {
  IAMRole: 'round-rectangle', 
  SecurityGroup: 'round-rectangle', 
  S3Bucket: 'round-rectangle',
  EC2: 'round-rectangle', 
  Lambda: 'round-rectangle', 
  RDS: 'round-rectangle',
  DynamoDB: 'round-rectangle',
  Internet: 'diamond', 
  External: 'diamond', 
  Service: 'round-rectangle',
  VPC: 'round-rectangle',
  Subnet: 'round-rectangle',
  System: 'ellipse',
}

// Edge type colors
const EDGE_COLORS: Record<string, { line: string, arrow: string, style?: string }> = {
  ACTUAL_TRAFFIC: { line: '#10b981', arrow: '#10b981' },
  internet: { line: '#ef4444', arrow: '#ef4444', style: 'dashed' },
  iam_trust: { line: '#8b5cf6', arrow: '#8b5cf6', style: 'dashed' },
  network: { line: '#f97316', arrow: '#f97316' },
  HAS_POLICY: { line: '#94a3b8', arrow: '#94a3b8' },
  HAS_SECURITY_GROUP: { line: '#7B2FBE', arrow: '#7B2FBE' },
  IN_VPC: { line: '#7B2FBE', arrow: '#7B2FBE', style: 'dashed' },
  IN_SUBNET: { line: '#7B2FBE', arrow: '#7B2FBE', style: 'dashed' },
  BELONGS_TO_SYSTEM: { line: '#64748b', arrow: '#64748b', style: 'dashed' },
  CONTAINS: { line: '#64748b', arrow: '#64748b', style: 'dashed' },
  default: { line: '#94a3b8', arrow: '#94a3b8' },
}

interface EdgeTrafficData {
  source_sg?: string
  target_sg?: string
  port?: string
  protocol?: string
  direction?: 'inbound' | 'outbound'
  source?: string
  destination?: string
  source_type?: 'internet' | 'cidr' | 'security_group'
  total_hits: number
  unique_sources: string[]
  bytes_transferred: number
  packets_transferred?: number
  recommendation: 'keep' | 'tighten' | 'remove' | 'review'
  recommendation_reason: string
  confidence: number
  confidence_reason?: string
  is_public: boolean
  is_internal: boolean
  last_seen?: string
  observation_days?: number
  rule_id?: string
  created_at?: string
  modified_at?: string
  expected_exposure?: {
    is_public: boolean
    source: string
    reason?: string
  }
}

interface Props {
  systemName: string
  graphData: any
  isLoading: boolean
  onNodeClick: (nodeId: string, nodeType: string, nodeName: string) => void
  onRefresh: () => void
}

export default function GraphView({ systemName, graphData, isLoading, onNodeClick, onRefresh }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const animationRef = useRef<number | null>(null)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [edgeTrafficData, setEdgeTrafficData] = useState<EdgeTrafficData | null>(null)
  const [edgeLoading, setEdgeLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightRisks, setHighlightRisks] = useState(false)
  const [highlightTraffic, setHighlightTraffic] = useState(false)
  const [isLive, setIsLive] = useState(true)
  const [pathFromInternet, setPathFromInternet] = useState<string[]>([])
  const [observationDays, setObservationDays] = useState(30)
  const [stats, setStats] = useState({ nodes: 0, edges: 0, actualTraffic: 0 })
  const [viewMode, setViewMode] = useState<'grouped' | 'all'>('grouped')

  // Animate ACTUAL_TRAFFIC edges
  const animateTrafficEdges = useCallback(() => {
    if (!cyRef.current || !highlightTraffic) return
    
    const cy = cyRef.current
    const trafficEdges = cy.edges('[type="ACTUAL_TRAFFIC"]')
    
    let phase = 0
    const animate = () => {
      phase = (phase + 0.05) % 1
      trafficEdges.forEach((edge) => {
        const opacity = 0.5 + Math.sin(phase * Math.PI * 2) * 0.5
        edge.style('line-opacity', opacity)
        edge.style('target-arrow-opacity', opacity)
      })
      animationRef.current = requestAnimationFrame(animate)
    }
    
    animate()
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [highlightTraffic])

  useEffect(() => {
    if (highlightTraffic) {
      const cleanup = animateTrafficEdges()
      return cleanup
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      // Reset opacity
      if (cyRef.current) {
        cyRef.current.edges('[type="ACTUAL_TRAFFIC"]').style({
          'line-opacity': 1,
          'target-arrow-opacity': 1
        })
      }
    }
  }, [highlightTraffic, animateTrafficEdges])

  // Find path from Internet to a given edge
  const findPathFromInternet = useCallback((edge: any, nodes: any[], edges: any[]): string[] => {
    if (edge.type === 'internet') {
      return ['Internet', edge.target]
    }
    
    // BFS to find path from Internet
    const visited = new Set<string>()
    const queue: Array<{ node: string; path: string[] }> = []
    
    // Find Internet node
    const internetNode = nodes.find(n => n.id === 'Internet' || n.type === 'Internet' || n.type === 'External')
    if (!internetNode) return []
    
    queue.push({ node: internetNode.id, path: [internetNode.id] })
    visited.add(internetNode.id)
    
    while (queue.length > 0) {
      const { node, path } = queue.shift()!
      
      if (node === edge.source || node === edge.target) {
        return [...path, edge.target]
      }
      
      // Find edges from this node
      edges.forEach(e => {
        if (e.source === node && !visited.has(e.target)) {
          visited.add(e.target)
          queue.push({ node: e.target, path: [...path, e.target] })
        }
      })
    }
    
    return []
  }, [])

  // Fetch traffic data for a selected edge
  const fetchEdgeTrafficData = useCallback(async (edge: any) => {
    setEdgeLoading(true)
    setEdgeTrafficData(null)
    
    // Find path from Internet
    const path = findPathFromInternet(edge, graphData?.nodes || [], graphData?.edges || [])
    setPathFromInternet(path)
    
    try {
      // For ACTUAL_TRAFFIC edges, show the traffic info directly
      if (edge.type === 'ACTUAL_TRAFFIC') {
        setEdgeTrafficData({
          port: edge.port || edge.label,
          protocol: edge.protocol || 'TCP',
          direction: 'outbound',
          source: edge.source,
          destination: edge.target,
          source_type: 'security_group',
          total_hits: edge.hit_count || 1,
          unique_sources: [edge.source],
          bytes_transferred: edge.bytes_transferred || 0,
          recommendation: 'keep',
          recommendation_reason: 'Active verified traffic observed from VPC Flow Logs',
          confidence: 95,
          confidence_reason: 'Verified by ACTUAL_TRAFFIC relationship in graph',
          is_public: false,
          is_internal: true,
          last_seen: edge.last_seen,
          observation_days: observationDays
        })
        setEdgeLoading(false)
        return
      }
      
      const sgId = edge.source_sg || edge.target_sg || 
        (edge.source?.includes('sg-') ? edge.source : null) ||
        (edge.target?.includes('sg-') ? edge.target : null)
      
      if (sgId) {
        const res = await fetch(`/api/proxy/security-groups/${sgId}/gap-analysis?days=${observationDays}`)
        if (res.ok) {
          const data = await res.json()
          const rules = data.rules_analysis || []
          const matchingRule = rules.find((r: any) => 
            r.port_range === edge.port || edge.label?.includes(r.port_range) || 
            (edge.port && r.port_range?.includes(edge.port))
          ) || rules[0]
          
          const isPublic = matchingRule?.source === '0.0.0.0/0' || matchingRule?.is_public
          const totalHits = matchingRule?.traffic?.connection_count || 0
          const lastSeen = matchingRule?.traffic?.last_seen || matchingRule?.last_seen
          const uniqueSources = matchingRule?.traffic?.unique_sources || []
          const sourceValue = matchingRule?.source || edge.source
          const sourceType = isPublic ? 'internet' : (sourceValue?.startsWith('sg-') ? 'security_group' : 'cidr')
          const isInternal = !isPublic && sourceType === 'security_group'
          
          // Determine recommendation based on evidence and intent
          let recommendation: 'keep' | 'tighten' | 'remove' | 'review' = 'review'
          let recommendationReason = ''
          let confidence = 60
          let confidenceReason = ''
          
          // Check if this is expected to be public (from tags, ALB scheme, etc.)
          const expectedPublic = matchingRule?.expected_exposure?.is_public || false
          const expectedReason = matchingRule?.expected_exposure?.reason || ''
          
          if (isPublic && totalHits === 0) {
            // Internet-exposed but no traffic observed
            if (expectedPublic) {
              recommendation = 'keep'
              recommendationReason = `Declared public endpoint. Keep ${matchingRule?.port_range || edge.port} open, but validate health checks and add monitoring.`
              confidence = 70
              confidenceReason = 'Intent-based decision; no traffic evidence available'
            } else {
              recommendation = 'review'
              recommendationReason = `No traffic observed in ${observationDays} days. Restrict source or temporarily disable; run simulation.`
              confidence = 85
              confidenceReason = 'No evidence of use; internet exposure is suspicious'
            }
          } else if (isPublic && totalHits > 0 && uniqueSources.length < 5) {
            // Public but only few sources used
            recommendation = 'tighten'
            recommendationReason = `Public rule (0.0.0.0/0) but only ${uniqueSources.length} sources used. Restrict to observed sources.`
            confidence = 90
            confidenceReason = 'Flow Logs show limited source usage'
          } else if (totalHits > 0) {
            // Active traffic observed
            recommendation = 'keep'
            recommendationReason = `Active traffic: ${totalHits} connections from ${uniqueSources.length} sources`
            confidence = 95
            confidenceReason = 'Flow Logs enabled, full window coverage'
          } else if (totalHits === 0 && !isPublic) {
            // Internal rule with no traffic
            recommendation = 'remove'
            recommendationReason = `No traffic observed in the last ${observationDays} days`
            confidence = 85
            confidenceReason = 'No evidence of use in observation window'
          }
          
          setEdgeTrafficData({
            source_sg: data.sg_id,
            target_sg: edge.target,
            port: matchingRule?.port_range || edge.port,
            protocol: edge.protocol || matchingRule?.protocol || 'TCP',
            direction: matchingRule?.direction || 'inbound',
            source: sourceValue,
            destination: edge.target,
            source_type: sourceType,
            total_hits: totalHits,
            unique_sources: uniqueSources,
            bytes_transferred: matchingRule?.traffic?.bytes_transferred || 0,
            packets_transferred: matchingRule?.traffic?.packets_transferred || 0,
            recommendation,
            recommendation_reason: recommendationReason,
            confidence,
            confidence_reason: confidenceReason || matchingRule?.recommendation?.confidence_reason,
            is_public: isPublic,
            is_internal: isInternal,
            last_seen: lastSeen,
            observation_days: observationDays,
            rule_id: matchingRule?.rule_id,
            created_at: matchingRule?.created_at,
            modified_at: matchingRule?.modified_at,
            expected_exposure: expectedPublic ? {
              is_public: true,
              source: expectedReason || 'Service configuration',
              reason: expectedReason
            } : undefined
          })
          return
        }
      }
      
      // Fallback
      const isPublicFallback = edge.type === 'internet' || edge.source === 'Internet' || edge.source === '0.0.0.0/0'
      const sourceTypeFallback = isPublicFallback ? 'internet' : (edge.source?.startsWith('sg-') ? 'security_group' : 'cidr')
      
      setEdgeTrafficData({
        port: edge.port || edge.label,
        protocol: edge.protocol || 'TCP',
        direction: 'inbound',
        source: edge.source,
        destination: edge.target,
        source_type: sourceTypeFallback,
        total_hits: edge.traffic_bytes || 0,
        unique_sources: [],
        bytes_transferred: edge.traffic_bytes || 0,
        recommendation: isPublicFallback ? 'review' : 'keep',
        recommendation_reason: isPublicFallback 
          ? 'Internet-exposed connection - review for least privilege'
          : 'Internal connection',
        confidence: 60,
        confidence_reason: 'Limited data available; recommendation based on configuration only',
        is_public: isPublicFallback,
        is_internal: !isPublicFallback && sourceTypeFallback === 'security_group',
        observation_days: observationDays
      })
    } catch (e) {
      console.error('Failed to fetch edge traffic:', e)
      setEdgeTrafficData(null)
    } finally {
      setEdgeLoading(false)
    }
  }, [findPathFromInternet, observationDays, graphData])

  // Refetch when observation days change
  useEffect(() => {
    if (selectedEdge) {
      fetchEdgeTrafficData(selectedEdge)
    }
  }, [observationDays, fetchEdgeTrafficData, selectedEdge])

  // Export graph as image
  const exportGraph = () => {
    if (!cyRef.current) return
    const png = cyRef.current.png({ full: true, scale: 2 })
    const a = document.createElement('a')
    a.href = png
    a.download = `dependency-map-${systemName}-${new Date().toISOString().slice(0,10)}.png`
    a.click()
  }

  // Toggle highlight risks
  const toggleHighlightRisks = () => {
    if (!cyRef.current) return
    const cy = cyRef.current
    
    if (highlightRisks) {
      cy.elements().removeClass('risk-highlight risk-dimmed')
      setHighlightRisks(false)
    } else {
      cy.elements().addClass('risk-dimmed')
      cy.edges('[type="internet"]').removeClass('risk-dimmed').addClass('risk-highlight')
      cy.edges('[type="internet"]').connectedNodes().removeClass('risk-dimmed').addClass('risk-highlight')
      cy.nodes('[lpScore < 50]').removeClass('risk-dimmed').addClass('risk-highlight')
      setHighlightRisks(true)
    }
  }

  const toggleHighlightTraffic = () => {
    if (!cyRef.current) return
    const cy = cyRef.current
    
    if (highlightTraffic) {
      cy.elements().removeClass('traffic-highlight traffic-dimmed')
      setHighlightTraffic(false)
    } else {
      cy.elements().addClass('traffic-dimmed')
      cy.edges('[type="ACTUAL_TRAFFIC"]').removeClass('traffic-dimmed').addClass('traffic-highlight')
      cy.edges('[type="ACTUAL_TRAFFIC"]').connectedNodes().removeClass('traffic-dimmed').addClass('traffic-highlight')
      setHighlightTraffic(true)
    }
  }

  useEffect(() => {
    if (!isLive) return
    const i = setInterval(onRefresh, 30000)
    return () => clearInterval(i)
  }, [isLive, onRefresh])

  useEffect(() => {
    console.log('[GraphView] useEffect triggered:', {
      hasContainer: !!containerRef.current,
      hasGraphData: !!graphData,
      isLoading,
      viewMode,
      graphDataNodes: graphData?.nodes?.length || 0,
      graphDataEdges: graphData?.edges?.length || 0,
      graphDataKeys: graphData ? Object.keys(graphData) : []
    })
    
    if (!containerRef.current || !graphData || isLoading) {
      console.log('[GraphView] Skipping render:', {
        noContainer: !containerRef.current,
        noGraphData: !graphData,
        isLoading
      })
      return
    }
    if (cyRef.current) cyRef.current.destroy()

    const elements: cytoscape.ElementDefinition[] = []
    const nodeIds = new Set<string>()
    let actualTrafficCount = 0
    
    // Important resource types to show in grouped mode
    const importantTypes = ['EC2', 'RDS', 'Lambda', 'SecurityGroup', 'VPC', 'Subnet', 'S3Bucket', 'S3', 'DynamoDB']
    
    // Filter nodes based on view mode
    const filteredNodes = viewMode === 'grouped' 
      ? (graphData.nodes || []).filter((n: any) => importantTypes.includes(n.type))
      : (graphData.nodes || [])
    
    // Count hidden IAM items for grouped mode
    const hiddenIamCount = viewMode === 'grouped' 
      ? (graphData.nodes || []).filter((n: any) => n.type === 'IAMRole' || n.type === 'IAMPolicy').length
      : 0
    
    const hasInternetEdges = (graphData.edges || []).some((e: any) => e.type === 'internet' || e.source === 'Internet')
    if (hasInternetEdges && !filteredNodes.find((n: any) => n.id === 'Internet')) {
      elements.push({
        group: 'nodes',
        data: { id: 'Internet', label: 'Internet\nExternal', type: 'Internet', lpScore: 0 }
      })
      nodeIds.add('Internet')
    }
    
    const formatServiceType = (type: string): string => {
      const typeMap: Record<string, string> = {
        'IAMRole': 'IAM Role',
        'IAMPolicy': 'IAM Policy',
        'SecurityGroup': 'Security Group',
        'S3Bucket': 'S3 Bucket',
        'S3': 'S3 Bucket',
        'EC2': 'EC2 Instance',
        'Lambda': 'Lambda Function',
        'RDS': 'RDS Database',
        'DynamoDB': 'DynamoDB Table',
        'Internet': 'Internet Gateway',
        'VPC': 'Virtual Private Cloud',
        'Subnet': 'Subnet',
        'CloudWatch': 'CloudWatch',
        'CloudTrail': 'CloudTrail',
        'System': 'System',
      }
      return typeMap[type] || type
    }
    
    // Build VPC and Subnet parent nodes map
    const vpcMap = new Map<string, any>()
    const subnetMap = new Map<string, any>()
    const vpcToSubnets = new Map<string, Set<string>>()
    
    // First pass: collect VPCs and Subnets
    filteredNodes.forEach((n: any) => {
      if (n.type === 'VPC') {
        vpcMap.set(n.id, n)
        vpcToSubnets.set(n.id, new Set())
      } else if (n.type === 'Subnet') {
        subnetMap.set(n.id, n)
        // Find parent VPC from edges or properties
        const vpcId = n.vpc_id || n.vpcId || (graphData.edges || []).find((e: any) => 
          e.target === n.id && (e.type === 'IN_VPC' || e.relationship_type === 'IN_VPC')
        )?.source
        if (vpcId && vpcMap.has(vpcId)) {
          vpcToSubnets.get(vpcId)?.add(n.id)
        }
      }
    })
    
    // Create VPC parent nodes
    vpcMap.forEach((vpc, vpcId) => {
      const subnetCount = vpcToSubnets.get(vpcId)?.size || 0
      const label = `${vpc.name || vpcId}\nVPC${subnetCount > 0 ? ` (${subnetCount} subnets)` : ''}`
      elements.push({
        group: 'nodes',
        data: {
          id: `vpc-${vpcId}`,
          label: label,
          type: 'VPC',
          name: vpc.name || vpcId,
          isParent: true,
          ...vpc
        }
      })
      nodeIds.add(`vpc-${vpcId}`)
    })
    
    // Create Subnet parent nodes (nested in VPCs)
    subnetMap.forEach((subnet, subnetId) => {
      const vpcId = subnet.vpc_id || subnet.vpcId || (graphData.edges || []).find((e: any) => 
        e.target === subnetId && (e.type === 'IN_VPC' || e.relationship_type === 'IN_VPC')
      )?.source
      
      const parentVpcId = vpcId ? `vpc-${vpcId}` : null
      const isPublic = subnet.public !== false // Default to public if not specified
      const subnetType = subnet.type || (isPublic ? 'public' : 'private')
      
      const label = `${subnet.name || subnetId}\nSubnet`
      elements.push({
        group: 'nodes',
        data: {
          id: `subnet-${subnetId}`,
          label: label,
          type: 'Subnet',
          name: subnet.name || subnetId,
          isParent: true,
          parent: parentVpcId,
          subnetType: subnetType,
          ...subnet
        }
      })
      nodeIds.add(`subnet-${subnetId}`)
    })
    
    // Process resource nodes and assign to parents
    console.log('[GraphView] Processing nodes:', filteredNodes.length)
    filteredNodes.forEach((n: any) => {
      if (searchQuery && !n.name?.toLowerCase().includes(searchQuery.toLowerCase())) return
      if (n.type === 'VPC' || n.type === 'Subnet') return // Already created as parents
      
      nodeIds.add(n.id)
      const nodeName = (n.name || n.id)
      const serviceType = formatServiceType(n.type || 'Service')
      const label = nodeName + "\n" + serviceType
      
      // Find parent subnet or VPC
      let parent: string | undefined = undefined
      if (n.subnet_id || n.subnetId) {
        const subnetId = n.subnet_id || n.subnetId
        if (subnetMap.has(subnetId)) {
          parent = `subnet-${subnetId}`
        }
      } else if (n.vpc_id || n.vpcId) {
        const vpcId = n.vpc_id || n.vpcId
        if (vpcMap.has(vpcId)) {
          parent = `vpc-${vpcId}`
        }
      }
      
      elements.push({
        group: 'nodes',
        data: { 
          id: n.id, 
          label: label, 
          type: n.type, 
          lpScore: n.lpScore,
          name: n.name || n.id,
          serviceType: serviceType,
          parent: parent,
          ...n 
        }
      })
    })
    
    // Add hidden IAM count badge if in grouped mode
    if (viewMode === 'grouped' && hiddenIamCount > 0) {
      elements.push({
        group: 'nodes',
        data: {
          id: 'hidden-iam-badge',
          label: `IAM Roles\n(${hiddenIamCount} hidden)`,
          type: 'IAMRole',
          isBadge: true
        }
      })
      nodeIds.add('hidden-iam-badge')
    }
    
    // Helper to resolve node ID (handle parent node mappings)
    const resolveNodeId = (nodeId: string): string => {
      // Check if it's a VPC that we created as parent
      if (vpcMap.has(nodeId)) {
        return `vpc-${nodeId}`
      }
      
      // Check if it's a Subnet that we created as parent
      if (subnetMap.has(nodeId)) {
        return `subnet-${nodeId}`
      }
      
      // Check if node exists in our filtered set
      const node = filteredNodes.find((n: any) => n.id === nodeId)
      if (node) {
        return nodeId
      }
      
      // Node not in filtered set, return original ID (might be hidden in grouped mode)
      return nodeId
    }
    
    console.log('[GraphView] Processing edges:', graphData.edges?.length || 0)
    ;(graphData.edges || []).forEach((e: any, i: number) => {
      const sourceId = resolveNodeId(e.source)
      const targetId = resolveNodeId(e.target)
      
      // Skip edges to/from hidden nodes in grouped mode
      if (viewMode === 'grouped') {
        const sourceNode = filteredNodes.find((n: any) => n.id === e.source)
        const targetNode = filteredNodes.find((n: any) => n.id === e.target)
        if (!sourceNode || !targetNode) {
          // Edge connects to hidden node, skip it
          return
        }
      }
      
      if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
        console.log('[GraphView] Skipping edge - missing node:', sourceId, '->', targetId)
        return
      }
      
      // Handle both 'type' and 'edge_type' field names from API
      const edgeType = e.type || e.edge_type || e.relationship_type || 'default'
      if (edgeType === 'ACTUAL_TRAFFIC') {
        actualTrafficCount++
        console.log('[GraphView] Found ACTUAL_TRAFFIC edge:', sourceId, '->', targetId)
      }
      
      const protocol = e.protocol || 'TCP'
      const port = e.port || ''
      let label = ''
      
      if (edgeType === 'ACTUAL_TRAFFIC') {
        label = port ? protocol + "/" + port : 'Traffic'
      } else if (port) {
        label = protocol + "/" + port
      } else if (edgeType === 'internet') {
        label = 'Internet'
      }
      
      elements.push({
        group: 'edges',
        data: { 
          id: e.id || ("e" + i), 
          source: sourceId, 
          target: targetId, 
          label, 
          type: edgeType, 
          protocol, 
          port,
          last_seen: e.last_seen,
          hit_count: e.hit_count,
          ...e 
        }
      })
    })

    console.log('[GraphView] Created elements:', {
      nodes: elements.filter(e => e.group === 'nodes').length,
      edges: elements.filter(e => e.group === 'edges').length,
      actualTraffic: actualTrafficCount
    })
    
    setStats({
      nodes: elements.filter(e => e.group === 'nodes').length,
      edges: elements.filter(e => e.group === 'edges').length,
      actualTraffic: actualTrafficCount
    })
    
    console.log('[GraphView] Stats:', {
      totalNodes: elements.filter(e => e.group === 'nodes').length,
      totalEdges: elements.filter(e => e.group === 'edges').length,
      actualTraffic: actualTrafficCount,
      viewMode,
      hiddenIamCount: viewMode === 'grouped' ? hiddenIamCount : 0
    })

    // Build dynamic edge styles
    const edgeStyles = Object.entries(EDGE_COLORS).map(([type, colors]) => ({
      selector: 'edge[type="' + type + '"]',
      style: {
        'line-color': colors.line,
        'target-arrow-color': colors.arrow,
        'line-style': colors.style || 'solid',
        'width': type === 'ACTUAL_TRAFFIC' ? 4 : 2,
      } as any
    }))

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        { selector: 'node', style: {
          'label': 'data(label)', 
          'text-valign': 'center', 
          'text-halign': 'center',
          'font-size': '10px', 
          'font-weight': '600',
          'width': 70, 
          'height': 70, 
          'border-width': 2,
          'background-color': '#ffffff', 
          'border-color': '#cbd5e1',
          'background-fit': 'cover', 
          'background-clip': 'node',
          'shape': 'round-rectangle',
          'text-wrap': 'wrap',
          'text-max-width': '90px',
          'color': '#111827',
          'text-outline-color': '#ffffff',
          'text-outline-width': 3,
          'text-background-color': '#ffffff',
          'text-background-opacity': 0.9,
          'text-background-padding': '3px',
          'text-background-shape': 'roundrectangle',
          'line-height': '1.2',
        }},
        // Compound node styling (parent nodes)
        { selector: 'node[isParent="true"]', style: {
          'width': 'label',
          'height': 'label',
          'padding': '20px',
          'background-color': '#f0f9ff',
          'border-color': '#7B2FBE',
          'border-width': 3,
          'border-style': 'dashed',
          'shape': 'round-rectangle',
          'text-valign': 'top',
          'text-halign': 'center',
          'text-margin-y': -10,
        }},
        { selector: 'node[type="VPC"][isParent="true"]', style: {
          'background-color': 'rgba(34, 197, 94, 0.1)',
          'border-color': '#22c55e',
          'border-width': 2,
        }},
        { selector: 'node[type="Subnet"][isParent="true"]', style: {
          'background-color': 'rgba(59, 130, 246, 0.1)',
          'border-color': '#3b82f6',
          'border-width': 2,
        }},
        { selector: 'node[subnetType="public"][isParent="true"]', style: {
          'background-color': 'rgba(34, 197, 94, 0.15)',
          'border-color': '#22c55e',
        }},
        { selector: 'node[subnetType="private"][isParent="true"]', style: {
          'background-color': 'rgba(234, 179, 8, 0.15)',
          'border-color': '#eab308',
        }},
        { selector: 'node[subnetType="database"][isParent="true"]', style: {
          'background-color': 'rgba(59, 130, 246, 0.15)',
          'border-color': '#3b82f6',
        }},
        { selector: 'node[isBadge="true"]', style: {
          'opacity': 0.6,
          'background-color': '#f1f5f9',
          'border-color': '#cbd5e1',
          'border-style': 'dashed',
        }},
        ...Object.entries(COLORS).map(([t, c]) => {
          const icon = AWS_ICONS[t] || AWS_ICONS.Service
          return {
          selector: `node[type="${t}"]`,
            style: { 
              'background-color': c, 
              'border-color': c, 
              'background-image': icon,
              'background-opacity': 1,
              'shape': SHAPES[t] || 'round-rectangle',
              'width': 60,
              'height': 60,
            } as any
          }
        }),
        { selector: 'node[lpScore < 50]', style: { 'border-color': '#dc2626', 'border-width': 4 }},
        { selector: 'node[lpScore >= 50][lpScore < 80]', style: { 'border-color': '#f59e0b' }},
        { selector: 'node[lpScore >= 80]', style: { 'border-color': '#10b981' }},
        { selector: 'edge', style: {
          'width': 2, 'line-color': '#94a3b8', 'target-arrow-color': '#94a3b8',
          'target-arrow-shape': 'triangle', 'curve-style': 'bezier',
          'label': 'data(label)', 'font-size': '9px', 'text-rotation': 'autorotate',
          'text-background-color': '#ffffff',
          'text-background-opacity': 0.8,
          'text-background-padding': '2px',
        }},
        // ACTUAL_TRAFFIC edges - bright green, thicker
        { selector: 'edge[type="ACTUAL_TRAFFIC"]', style: { 
          'line-color': '#10b981', 
          'target-arrow-color': '#10b981', 
          'width': 4,
          'line-style': 'solid',
          'z-index': 100,
        }},
        ...edgeStyles,
        { selector: '.highlighted', style: { 'border-width': 5, 'border-color': '#fbbf24', 'z-index': 999 }},
        { selector: 'edge.highlighted', style: { 'width': 5, 'line-color': '#fbbf24', 'target-arrow-color': '#fbbf24' }},
        { selector: '.dimmed', style: { 'opacity': 0.15 }},
        { selector: '.risk-highlight', style: { 'border-width': 5, 'border-color': '#ef4444', 'z-index': 999 }},
        { selector: 'edge.risk-highlight', style: { 'width': 5, 'line-color': '#ef4444', 'target-arrow-color': '#ef4444' }},
        { selector: '.risk-dimmed', style: { 'opacity': 0.2 }},
        { selector: '.traffic-highlight', style: { 'border-width': 5, 'border-color': '#10b981', 'z-index': 999 }},
        { selector: 'edge.traffic-highlight', style: { 'width': 6, 'line-color': '#10b981', 'target-arrow-color': '#10b981' }},
        { selector: '.traffic-dimmed', style: { 'opacity': 0.15 }},
      ],
      layout: { 
        name: 'cose-bilkent', 
        animate: true, 
        nodeDimensionsIncludeLabels: true, 
        idealEdgeLength: 120, 
        nodeRepulsion: 6000,
        gravity: 0.25,
        numIter: 2500,
        tile: true,
        // Compound node support
        nestingFactor: 0.1,
      } as any,
      minZoom: 0.2, maxZoom: 3,
    })

    cy.on('tap', 'node', (e) => {
      const data = e.target.data()
      setSelectedNode(data); setSelectedEdge(null)
      cy.elements().addClass('dimmed')
      e.target.closedNeighborhood().removeClass('dimmed')
      e.target.addClass('highlighted')
    })
    
    cy.on('dbltap', 'node', (e) => {
      const data = e.target.data()
      onNodeClick(data.id, data.type, data.name || data.id)
    })
    
    cy.on('tap', 'edge', (e) => {
      const edgeData = e.target.data()
      setSelectedEdge(edgeData); setSelectedNode(null)
      fetchEdgeTrafficData(edgeData)
      cy.elements().addClass('dimmed')
      cy.getElementById(edgeData.source).removeClass('dimmed').addClass('highlighted')
      cy.getElementById(edgeData.target).removeClass('dimmed').addClass('highlighted')
      e.target.removeClass('dimmed').addClass('highlighted')
    })
    cy.on('tap', (e) => {
      if (e.target === cy) { cy.elements().removeClass('dimmed highlighted'); setSelectedNode(null); setSelectedEdge(null) }
    })
    cyRef.current = cy
    return () => cy.destroy()
  }, [graphData, isLoading, searchQuery, viewMode, fetchEdgeTrafficData, onNodeClick])

  const zoom = (d: number) => cyRef.current?.zoom(cyRef.current.zoom() * (d > 0 ? 1.2 : 0.8))
  const fit = () => cyRef.current?.fit(undefined, 50)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsLive(!isLive)} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isLive ? 'bg-green-100 text-green-700' : 'bg-slate-200'}`}
          >
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
            {isLive ? 'LIVE' : 'PAUSED'}
          </button>
          <button onClick={onRefresh} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button 
            onClick={() => setViewMode(viewMode === 'grouped' ? 'all' : 'grouped')}
            className={"flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium " + (
              viewMode === 'grouped' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
            )}
          >
            <Layers className="w-4 h-4" />
            {viewMode === 'grouped' ? 'Grouped' : 'All'}
          </button>
          <button 
            onClick={toggleHighlightTraffic} 
            className={"flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium " + (
              highlightTraffic ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
            )}
          >
            <Activity className="w-4 h-4" /> 
            {highlightTraffic ? 'Clear Traffic' : 'Show Traffic'}
            {stats.actualTraffic > 0 && (
              <span className={"ml-1 px-1.5 py-0.5 rounded-full text-xs " + (highlightTraffic ? 'bg-green-500' : 'bg-green-200')}>
                {stats.actualTraffic}
              </span>
            )}
          </button>
          <button 
            onClick={toggleHighlightRisks} 
            className={"flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium " + (
              highlightRisks ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'
            )}
          >
            <AlertTriangle className="w-4 h-4" /> 
            {highlightRisks ? 'Clear Risks' : 'Show Risks'}
          </button>
          <button onClick={exportGraph} className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 text-white rounded-lg text-sm">
            <Download className="w-4 h-4" /> Export
          </button>
          <span className="text-sm text-slate-500">
            <strong>{stats.nodes}</strong> nodes • 
            <strong>{stats.edges}</strong> connections
            {viewMode === 'grouped' && (graphData?.nodes || []).filter((n: any) => n.type === 'IAMRole' || n.type === 'IAMPolicy').length > 0 && (
              <span className="ml-2 text-xs text-slate-400">
                ({((graphData?.nodes || []).filter((n: any) => n.type === 'IAMRole' || n.type === 'IAMPolicy').length)} IAM hidden)
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-40" 
            />
          </div>
          <button onClick={() => zoom(-1)} className="p-1.5 hover:bg-slate-200 rounded"><ZoomOut className="w-4 h-4" /></button>
          <button onClick={() => zoom(1)} className="p-1.5 hover:bg-slate-200 rounded"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={fit} className="p-1.5 hover:bg-slate-200 rounded"><Maximize2 className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Graph Canvas + Side Panel */}
      <div className="flex-1 flex relative">
        <div ref={containerRef} className="flex-1 bg-slate-50" style={{ minHeight: '500px' }} />
        
        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 rounded-lg p-3 text-xs shadow border">
          <div className="font-medium mb-2">Resource Types</div>
          {[['EC2', '#F58536'], ['RDS', '#3F48CC'], ['Lambda', '#F58536'], ['S3', '#759C3E'], ['IAMRole', '#759C3E'], ['SecurityGroup', '#7B2FBE']].map(([t, c]) => (
            <div key={t} className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: c as string }} />
              <span>{t}</span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t font-medium mb-1">Connections</div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-1 rounded bg-green-500" />
            <span className="text-green-700 font-medium">ACTUAL_TRAFFIC</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-0.5 bg-red-500" style={{ borderStyle: 'dashed', borderWidth: '1px', borderColor: '#ef4444' }} />
            <span>Internet Exposed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-slate-400" />
            <span>Configuration</span>
          </div>
          <div className="mt-2 pt-2 border-t text-slate-500">
            Double-click node for details
          </div>
        </div>

        {/* Node/Edge Details Panel */}
        {(selectedNode || selectedEdge) && (
          <div className="w-[380px] bg-white border-l p-4 overflow-y-auto relative">
            <button 
              onClick={() => {
                setSelectedNode(null)
                setSelectedEdge(null)
                cyRef.current?.elements().removeClass('dimmed highlighted')
              }} 
              className="absolute top-2 right-2 p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-4 h-4" />
            </button>
            
            {selectedNode && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ 
                      backgroundColor: COLORS[selectedNode.type] || '#6b7280',
                      backgroundImage: AWS_ICONS[selectedNode.type] || AWS_ICONS.Service,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {!AWS_ICONS[selectedNode.type] && (
                      <>
                        {selectedNode.type === 'IAMRole' && <Key className="w-5 h-5 text-white" />}
                        {selectedNode.type === 'SecurityGroup' && <Shield className="w-5 h-5 text-white" />}
                        {selectedNode.type === 'S3Bucket' && <Database className="w-5 h-5 text-white" />}
                        {!['IAMRole', 'SecurityGroup', 'S3Bucket'].includes(selectedNode.type) && <Layers className="w-5 h-5 text-white" />}
                      </>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold">{selectedNode.name || selectedNode.id}</h3>
                    <p className="text-sm text-slate-500 font-medium">
                      {selectedNode.serviceType || 
                       (selectedNode.type === 'IAMRole' ? 'IAM Role' :
                        selectedNode.type === 'SecurityGroup' ? 'Security Group' :
                        selectedNode.type === 'S3Bucket' ? 'S3 Bucket' :
                        selectedNode.type || 'Service')}
                    </p>
                  </div>
                </div>
                
                {selectedNode.lpScore !== undefined && (
                  <div className="p-3 bg-slate-50 rounded-lg mb-2">
                    <span className="text-slate-500">LP Score: </span>
                    <span className={`font-semibold ${selectedNode.lpScore >= 80 ? 'text-green-600' : selectedNode.lpScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {selectedNode.lpScore}%
                    </span>
                  </div>
                )}
                
                {selectedNode.arn && (
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <span className="text-xs text-slate-500">ARN</span>
                    <p className="text-xs font-mono break-all mt-1">{selectedNode.arn}</p>
                  </div>
                )}
                
                <button
                  onClick={() => onNodeClick(selectedNode.id, selectedNode.type, selectedNode.name || selectedNode.id)}
                  className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  View Resource Details
                </button>
              </div>
            )}
            
            {selectedEdge && (
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2 text-base">
                  {selectedEdge.type === 'ACTUAL_TRAFFIC' ? (
                    <Activity className="w-5 h-5 text-green-500" />
                  ) : (
                    <ArrowRight className="w-5 h-5 text-blue-500" />
                  )}
                  {selectedEdge.type === 'ACTUAL_TRAFFIC' ? 'Verified Traffic' : 'Connection Analysis'}
                </h3>
                
                {/* ACTUAL_TRAFFIC Badge */}
                {selectedEdge.type === 'ACTUAL_TRAFFIC' && (
                  <div className="p-3 rounded-lg border-2 bg-green-50 border-green-300">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="font-bold uppercase text-sm text-green-700">
                        VERIFIED TRAFFIC
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">
                      This connection was observed in VPC Flow Logs - real traffic between these resources.
                    </p>
                    {selectedEdge.last_seen && (
                      <p className="mt-2 text-xs text-green-600">
                        Last seen: {new Date(selectedEdge.last_seen).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
                
                {/* Verdict Row for non-traffic edges */}
                {edgeTrafficData && selectedEdge.type !== 'ACTUAL_TRAFFIC' && (
                  <div className={`p-3 rounded-lg border-2 ${
                    edgeTrafficData.recommendation === 'remove' 
                      ? 'bg-red-50 border-red-300' 
                      : edgeTrafficData.recommendation === 'tighten' || edgeTrafficData.recommendation === 'review'
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-green-50 border-green-300'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {edgeTrafficData.recommendation === 'remove' && <X className="w-5 h-5 text-red-500" />}
                        {(edgeTrafficData.recommendation === 'tighten' || edgeTrafficData.recommendation === 'review') && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                        {edgeTrafficData.recommendation === 'keep' && <CheckCircle className="w-5 h-5 text-green-500" />}
                        <span className={`font-bold uppercase text-sm ${
                          edgeTrafficData.recommendation === 'remove' ? 'text-red-700' :
                          edgeTrafficData.recommendation === 'tighten' || edgeTrafficData.recommendation === 'review' ? 'text-amber-700' :
                          'text-green-700'
                        }`}>
                          {edgeTrafficData.recommendation === 'remove' ? 'REMOVE RULE' : 
                           edgeTrafficData.recommendation === 'tighten' ? 'RESTRICT' :
                           edgeTrafficData.recommendation === 'review' ? 'REVIEW' : 'KEEP RULE'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500" title={edgeTrafficData.confidence_reason || ''}>
                        Confidence: {edgeTrafficData.confidence >= 80 ? 'High' : edgeTrafficData.confidence >= 60 ? 'Medium' : 'Low'}
                        {edgeTrafficData.confidence_reason && (
                          <span className="ml-1 text-slate-400" title={edgeTrafficData.confidence_reason}>ℹ️</span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 font-medium">{edgeTrafficData.recommendation_reason}</p>
                    {edgeTrafficData.confidence_reason && (
                      <p className="mt-1 text-xs text-slate-500 italic">{edgeTrafficData.confidence_reason}</p>
                    )}
                    {edgeTrafficData.is_public && (
                      <div className="mt-2 pt-2 border-t border-red-200 flex items-center gap-2 text-xs text-red-700">
                        <Globe className="w-3 h-3" />
                        <span>Public internet access (0.0.0.0/0)</span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* 2. Path Context (Breadcrumb) */}
                {pathFromInternet.length > 0 && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-xs text-blue-600 font-semibold mb-2 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Path Exposure
                    </div>
                    <div className="flex items-center gap-1 flex-wrap text-xs">
                      {pathFromInternet.map((nodeId, idx) => {
                        const isSelected = nodeId === selectedEdge.source || nodeId === selectedEdge.target
                        const node = graphData?.nodes?.find((n: any) => n.id === nodeId)
                        const displayName = node?.name || nodeId
                        return (
                          <React.Fragment key={nodeId}>
                            <span 
                              className={`px-2 py-1 rounded ${
                                isSelected 
                                  ? 'bg-blue-200 font-semibold text-blue-800' 
                                  : 'text-blue-700'
                              }`}
                            >
                              {displayName.length > 15 ? displayName.substring(0, 15) + '...' : displayName}
                            </span>
                            {idx < pathFromInternet.length - 1 && (
                              <ChevronRight className="w-3 h-3 text-blue-400 flex-shrink-0" />
                            )}
                          </React.Fragment>
                        )
                      })}
                    </div>
                    {pathFromInternet.length > 0 && pathFromInternet[0] === 'Internet' && edgeTrafficData && (
                      <div className="mt-2 text-xs text-blue-700">
                        Internet-exposed path exists via <code className="bg-blue-100 px-1 rounded">{edgeTrafficData.source || '0.0.0.0/0'}</code> inbound {edgeTrafficData.protocol || 'TCP'}/{edgeTrafficData.port || 'N/A'}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Selected Hop */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-600 font-semibold mb-2">Selected Hop</div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{selectedEdge.source}</span>
                    <ChevronRight className="w-4 h-4 flex-shrink-0 text-slate-400" />
                    <span className="font-medium">{selectedEdge.target}</span>
                  </div>
                  {selectedEdge.port && (
                    <div className="mt-2 text-xs text-slate-500">
                      {selectedEdge.protocol || 'TCP'}/{selectedEdge.port} {edgeTrafficData?.direction === 'inbound' ? '(inbound)' : '(outbound)'}
                    </div>
                  )}
                </div>
                
                {/* 3. Rule Details */}
                {edgeTrafficData && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-xs text-slate-600 font-semibold mb-2">Rule Details</div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Direction:</span>
                        <span className="font-medium capitalize">{edgeTrafficData.direction || 'inbound'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Protocol:</span>
                        <span className="font-medium">{edgeTrafficData.protocol || 'TCP'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Port:</span>
                        <span className="font-mono font-medium">{edgeTrafficData.port || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Source:</span>
                        <span className="font-medium text-right max-w-[150px] truncate">
                          {edgeTrafficData.source || selectedEdge.source}
                          {edgeTrafficData.source_type && (
                            <span className="ml-1 text-xs text-slate-400">
                              ({edgeTrafficData.source_type === 'internet' ? 'Internet' : 
                                edgeTrafficData.source_type === 'security_group' ? 'Security Group' : 'CIDR'})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Destination:</span>
                        <span className="font-medium text-right max-w-[150px] truncate">{edgeTrafficData.destination || selectedEdge.target}</span>
                      </div>
                      {edgeTrafficData.rule_id && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Rule ID:</span>
                          <span className="font-mono text-xs">{edgeTrafficData.rule_id}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Expected Exposure */}
                {edgeTrafficData?.expected_exposure && (
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="text-xs text-purple-600 font-semibold mb-2">Expected Exposure</div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Public ALB:</span>
                        <span className="font-medium text-purple-700">Yes</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Source:</span>
                        <span className="font-medium text-right max-w-[200px] truncate">{edgeTrafficData.expected_exposure.source}</span>
                      </div>
                      {edgeTrafficData.expected_exposure.reason && (
                        <div className="mt-2 pt-2 border-t border-purple-200 text-xs text-purple-600">
                          {edgeTrafficData.expected_exposure.reason}
                        </div>
                      )}
                  </div>
                </div>
                )}
                
                {/* Traffic Data */}
                {edgeLoading ? (
                  <div className="p-4 bg-slate-50 rounded-lg flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                    <span className="text-sm text-slate-500">Loading traffic data...</span>
                  </div>
                ) : edgeTrafficData ? (
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-green-600 font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        TRAFFIC DATA
                      </div>
                      <div className="flex items-center gap-1">
                        {[7, 30, 90].map(days => (
                          <button
                            key={days}
                            onClick={() => {
                              setObservationDays(days)
                              if (selectedEdge) {
                                fetchEdgeTrafficData(selectedEdge)
                              }
                            }}
                            className={`px-2 py-0.5 text-xs rounded ${
                              (edgeTrafficData.observation_days || observationDays) === days
                                ? 'bg-green-200 text-green-800 font-semibold'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                            }`}
                          >
                            {days}d
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Observed flows:</span>
                        <span className="font-bold text-green-700">{edgeTrafficData.total_hits.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Protocol:</span>
                        <span className="font-medium">{edgeTrafficData.protocol}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Port:</span>
                        <span className="font-mono font-medium">{edgeTrafficData.port || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Last seen:</span>
                        <span className="font-medium">
                          {edgeTrafficData.last_seen 
                            ? new Date(edgeTrafficData.last_seen).toLocaleDateString()
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
                
                {/* Actions */}
                <div className="space-y-2">
                  <div className="text-xs text-slate-600 font-semibold">Actions</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
                      onClick={() => console.log('Simulate:', selectedEdge.id)}
                    >
                      <Play className="w-3 h-3" />
                      Simulate
                    </button>
                    <button 
                      className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-300"
                      onClick={() => {
                        const exportData = {
                          edge: selectedEdge,
                          traffic: edgeTrafficData,
                          timestamp: new Date().toISOString()
                        }
                        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = "connection-" + selectedEdge.id + ".json"
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      <Download className="w-3 h-3" />
                      Export
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t bg-slate-50 text-xs text-slate-500 flex justify-between">
        <span className="flex items-center gap-2">
          <Database className="w-3 h-3 text-green-500" />
          <span>{stats.nodes} nodes, {stats.edges} edges</span>
          {stats.actualTraffic > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
              {stats.actualTraffic} verified traffic flows
            </span>
          )}
        </span>
        <span>{graphData?.summary?.internetExposedNodes || 0} internet exposed</span>
      </div>
    </div>
  )
}

