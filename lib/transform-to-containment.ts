// lib/transform-to-containment.ts

import type { ArchitectureNode, ArchitectureEdge } from '@/hooks/useArchitectureData'

export interface ContainedResource {
  id: string
  name: string
  type: string
  arn?: string
  privateIp?: string
  publicIp?: string
  securityGroups?: string[]
  hasActiveTraffic: boolean
  gapCount: number
}

export interface ContainedSubnet {
  id: string
  name: string
  cidr: string
  availabilityZone: string
  isPublic: boolean
  resources: ContainedResource[]
}

export interface ContainedVPC {
  id: string
  name: string
  cidr: string
  subnets: ContainedSubnet[]
}

export interface ContainmentHierarchy {
  vpcs: ContainedVPC[]
  externalResources: ContainedResource[]  // Resources not in any VPC
  edges: ArchitectureEdge[]
}

export function transformToContainment(
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[]
): ContainmentHierarchy {
  
  // 1. Separate by type
  const vpcNodes = nodes.filter(n => n.type === 'VPC' || n.type === 'vpc')
  const subnetNodes = nodes.filter(n => n.type === 'Subnet' || n.type === 'subnet')
  const resourceNodes = nodes.filter(n => 
    !['VPC', 'Subnet', 'System', 'vpc', 'subnet', 'system'].includes(n.type)
  )
  
  // 2. Build map of which resources have active traffic
  const activeTrafficResources = new Set<string>()
  edges
    .filter(e => {
      const edgeType = e.type || e.edge_type || ''
      return edgeType === 'ACTUAL_TRAFFIC' && (e.isActive !== false)
    })
    .forEach(e => {
      activeTrafficResources.add(e.source)
      activeTrafficResources.add(e.target)
    })
  
  // 3. Count gaps per resource (allowed but no traffic)
  const gapCounts = new Map<string, number>()
  edges
    .filter(e => {
      const edgeType = e.type || e.edge_type || ''
      return edgeType === 'ALLOWED' && (e.isActive === false || e.is_used === false)
    })
    .forEach(e => {
      gapCounts.set(e.source, (gapCounts.get(e.source) || 0) + 1)
    })
  
  // 4. Build containment hierarchy
  const vpcs: ContainedVPC[] = vpcNodes.map(vpc => {
    // Find subnets in this VPC
    const vpcSubnets = subnetNodes.filter(s => {
      const sVpcId = s.vpc_id || s.vpcId
      return sVpcId === vpc.id || sVpcId === vpc.arn
    })
    
    const subnets: ContainedSubnet[] = vpcSubnets.map(subnet => {
      // Find resources in this subnet
      const subnetResources = resourceNodes
        .filter(r => {
          const rSubnetId = r.subnet_id || r.subnetId
          return rSubnetId === subnet.id || rSubnetId === subnet.arn
        })
        .map(r => ({
          id: r.id,
          name: r.name,
          type: r.type,
          arn: r.arn,
          privateIp: r.privateIp,
          publicIp: r.publicIp,
          securityGroups: r.securityGroups,
          hasActiveTraffic: activeTrafficResources.has(r.id),
          gapCount: gapCounts.get(r.id) || r.gap_count || 0,
        }))
      
      return {
        id: subnet.id,
        name: subnet.name,
        cidr: subnet.cidr || '',
        availabilityZone: subnet.availabilityZone || 'unknown',
        isPublic: subnet.isPublic !== false && (subnet.subnet_is_public !== false),
        resources: subnetResources,
      }
    })
    
    // Sort subnets: Public first, then by AZ
    subnets.sort((a, b) => {
      if (a.isPublic !== b.isPublic) return a.isPublic ? -1 : 1
      return a.availabilityZone.localeCompare(b.availabilityZone)
    })
    
    return {
      id: vpc.id,
      name: vpc.name,
      cidr: vpc.cidr || '',
      subnets,
    }
  })
  
  // 5. Find external resources (not in any subnet)
  const containedResourceIds = new Set(
    vpcs.flatMap(v => v.subnets.flatMap(s => s.resources.map(r => r.id)))
  )
  
  const externalResources = resourceNodes
    .filter(r => !containedResourceIds.has(r.id))
    .map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      arn: r.arn,
      privateIp: r.privateIp,
      publicIp: r.publicIp,
      securityGroups: r.securityGroups,
      hasActiveTraffic: activeTrafficResources.has(r.id),
      gapCount: gapCounts.get(r.id) || r.gap_count || 0,
    }))
  
  return {
    vpcs,
    externalResources,
    edges,
  }
}

