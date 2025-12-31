"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import {
  Search,
  ChevronDown,
  ChevronRight,
  Server,
  Database,
  Cloud,
  Shield,
  Box,
  Layers,
  RefreshCw,
  Network,
  HardDrive,
  Key,
  FileText,
  User,
  Eye,
  Activity,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface ServiceNode {
  id: string
  name: string
  type: string
  systemName: string
  environment: string
  region: string
  status: string
  lastSeen: string
  properties: Record<string, any>
  // IAM specific
  attachedPolicies?: number
  permissionCount?: number
  // Compute specific
  instanceState?: string
  // AWS Tags
  tags?: Record<string, string>
  isTagged?: boolean
  vpcId?: string
}

interface AllServicesTabProps {
  systemName: string
}

const COMPUTE_DATA_TYPES = [
  "EC2",
  "Lambda",
  "LambdaFunction",
  "RDS",
  "S3",
  "DynamoDB",
  "ECS",
  "EKS",
  "VPC",
  "Subnet",
  "LoadBalancer",
  "ALB",
  "NLB",
  "ElasticIP",
  "NAT",
  "NATGateway",
  "InternetGateway",
]

const IDENTITY_SECURITY_TYPES = [
  "IAMRole",
  "IAMPolicy",
  "IAMUser",
  "SecurityGroup",
  "CloudTrail",
  "CloudWatch",
  "KMS",
  "Secret",
  "SecretsManager",
]

const SERVICE_ICONS: Record<string, React.ElementType> = {
  EC2: Server,
  Lambda: Cloud,
  LambdaFunction: Cloud,
  S3: HardDrive,
  RDS: Database,
  DynamoDB: Database,
  ECS: Box,
  EKS: Box,
  VPC: Network,
  Subnet: Network,
  LoadBalancer: Layers,
  ALB: Layers,
  NLB: Layers,
  IAMRole: Key,
  IAMPolicy: FileText,
  IAMUser: User,
  SecurityGroup: Shield,
  CloudTrail: Eye,
  CloudWatch: Activity,
  default: Box,
}

const SERVICE_COLORS: Record<string, string> = {
  EC2: "bg-orange-100 text-orange-700",
  Lambda: "bg-amber-100 text-amber-700",
  LambdaFunction: "bg-amber-100 text-amber-700",
  S3: "bg-green-100 text-green-700",
  RDS: "bg-blue-100 text-blue-700",
  DynamoDB: "bg-purple-100 text-purple-700",
  ECS: "bg-cyan-100 text-cyan-700",
  EKS: "bg-cyan-100 text-cyan-700",
  VPC: "bg-indigo-100 text-indigo-700",
  Subnet: "bg-indigo-100 text-indigo-700",
  LoadBalancer: "bg-teal-100 text-teal-700",
  IAMRole: "bg-red-100 text-red-700",
  IAMPolicy: "bg-red-100 text-red-700",
  IAMUser: "bg-red-100 text-red-700",
  SecurityGroup: "bg-pink-100 text-pink-700",
  CloudTrail: "bg-yellow-100 text-yellow-700",
  CloudWatch: "bg-yellow-100 text-yellow-700",
  default: "bg-gray-100 text-gray-700",
}

export function AllServicesTab({ systemName }: AllServicesTabProps) {
  const [services, setServices] = useState<ServiceNode[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["compute", "identity"]))
  const [gapData, setGapData] = useState<any>(null)
  const [selectedService, setSelectedService] = useState<ServiceNode | null>(null)

  useEffect(() => {
    fetchServices()
    fetchGapData()
  }, [systemName])  // Re-fetch when systemName changes

  const fetchServices = async () => {
    setLoading(true)
    try {
      // FIRST: Try Neo4j endpoint (A7 Patent - system-only resources)
      const neo4jResponse = await fetch(`/api/proxy/system-resources/${encodeURIComponent(systemName)}`)
      
      if (neo4jResponse.ok) {
        const neo4jData = await neo4jResponse.json()
        const neo4jResources = neo4jData.resources || []
        
        if (neo4jResources.length > 0) {
          // Use Neo4j data (A7 Patent: only system resources)
          console.log(`[AllServices] Using Neo4j data: ${neo4jResources.length} resources`)
          
          const mapped: ServiceNode[] = neo4jResources.map((r: any) => ({
            id: r.id || r.name || Math.random().toString(),
            name: r.name || "Unknown",
            type: r.type || "Unknown",
            systemName: r.systemName || systemName,
            environment: r.environment || "Production",
            region: "eu-west-1",
            status: r.is_seed ? "Seed" : "Discovered",
            lastSeen: new Date().toISOString(),
            properties: {},
            attachedPolicies: r.type === 'IAMRole' ? (r.connections || 0) : 0,
            permissionCount: r.connections || 0,
            instanceState: "active",
            tags: {},
            isTagged: true,  // All Neo4j resources are tagged
            vpcId: undefined,
          }))
          
          setServices(mapped)
          return
        }
      }
      
      // FALLBACK: Use AWS APIs if Neo4j is empty
      console.log('[AllServices] Neo4j empty, falling back to AWS APIs')
      
      // Fetch from least-privilege issues endpoint (has all resources)
      const lpResponse = await fetch(`/api/proxy/least-privilege/issues?systemName=${encodeURIComponent(systemName)}`)
      
      if (!lpResponse.ok) throw new Error("Failed to fetch services")
      
      const lpData = await lpResponse.json()
      const resources = lpData.resources || []
      
      // Also try to fetch extended resources from BOTH regions
      let extendedResources: any[] = []
      try {
        // Fetch from both eu-west-1 and us-east-1
        const regions = ['eu-west-1', 'us-east-1']
        for (const region of regions) {
          const extResponse = await fetch(`/api/proxy/resources/all?regions=${region}`)
          if (extResponse.ok) {
            const extData = await extResponse.json()
            // Flatten ALL resource types (not just 5)
            const resourceTypes = [
              'lambda_functions', 
              'rds_instances', 
              'dynamodb_tables', 
              'ecs_clusters', 
              'ecs_services',
              'kms_keys',
              'secrets',
              'internet_gateways',
              'nat_gateways',
              'vpc_endpoints',
              'log_groups',
              'hosted_zones',
              'cloudfront_distributions',
              'acm_certificates'
            ]
            resourceTypes.forEach(type => {
              if (extData.resources?.[type]) {
                // Add region and type info to each resource
                const resourcesWithMeta = extData.resources[type].map((r: any) => ({
                  ...r,
                  _sourceType: type,
                  _region: region
                }))
                extendedResources = [...extendedResources, ...resourcesWithMeta]
              }
            })
          }
        }
      } catch (e) {
        console.warn('Extended resources fetch failed:', e)
      }

      // Map LP resources
      const lpMapped: ServiceNode[] = resources.map((r: any) => {
        const tags = r.tags || r.evidence?.tags || {}
        const actualSystemName = r.systemName || tags.SystemName || tags.systemName
        const isTagged = !!actualSystemName
        
        return {
          id: r.resourceArn || r.resourceName || Math.random().toString(),
          name: r.resourceName || "Unknown",
          type: r.resourceType || "Unknown",
          systemName: actualSystemName || systemName || "Ungrouped",
          environment: r.environment || tags.Environment || "Production",
          region: r.evidence?.coverage?.regions?.[0] || "eu-west-1",
          status: "Active",
          lastSeen: new Date().toISOString(),
          properties: r.evidence || {},
          attachedPolicies: r.resourceType === 'IAMRole' ? (r.allowedCount || 0) : 0,
          permissionCount: r.allowedCount || 0,
          instanceState: "running",
          tags: tags,
          isTagged: isTagged,
          vpcId: r.vpcId || r.evidence?.vpc_id,
        }
      })
      
      // Map extended resources with proper type detection
      const extMapped: ServiceNode[] = extendedResources.map((r: any) => {
        // Detect type based on source type or resource properties
        let detectedType = r.type || 'Unknown'
        if (r._sourceType === 'lambda_functions' || r.runtime) detectedType = 'Lambda'
        else if (r._sourceType === 'rds_instances' || r.engine) detectedType = 'RDS'
        else if (r._sourceType === 'dynamodb_tables' || r.billing_mode) detectedType = 'DynamoDB'
        else if (r._sourceType === 'kms_keys' || r.key_state) detectedType = 'KMS'
        else if (r._sourceType === 'secrets') detectedType = 'Secret'
        else if (r._sourceType === 'internet_gateways') detectedType = 'InternetGateway'
        else if (r._sourceType === 'nat_gateways') detectedType = 'NATGateway'
        else if (r._sourceType === 'vpc_endpoints') detectedType = 'VPCEndpoint'
        else if (r._sourceType === 'log_groups') detectedType = 'LogGroup'
        else if (r._sourceType === 'ecs_clusters') detectedType = 'ECSCluster'
        else if (r._sourceType === 'ecs_services') detectedType = 'ECSService'
        else if (r._sourceType === 'hosted_zones') detectedType = 'Route53'
        else if (r._sourceType === 'cloudfront_distributions') detectedType = 'CloudFront'
        else if (r._sourceType === 'acm_certificates') detectedType = 'ACM'
        
        // Get actual SystemName tag from AWS
        const tags = r.tags || {}
        const actualSystemName = r.systemName || tags.SystemName || tags.systemName || tags.System
        const isTagged = !!actualSystemName
        
        return {
          id: r.arn || r.id || r.name || Math.random().toString(),
          name: r.name || r.id || "Unknown",
          type: detectedType,
          systemName: actualSystemName || "Untagged",
          environment: tags.Environment || tags.environment || "Production",
          region: r._region || r.region || "eu-west-1",
          status: r.status || r.state || r.key_state || "Active",
          lastSeen: r.last_modified || r.creation_date || new Date().toISOString(),
          properties: r,
          attachedPolicies: 0,
          permissionCount: 0,
          instanceState: r.status || r.state || "running",
          tags: tags,
          isTagged: isTagged,
          vpcId: r.vpc_id || r.vpcId || r.properties?.vpc_id,
        }
      })
      
      // Combine and dedupe by id
      const allServices = [...lpMapped, ...extMapped]
      const uniqueServices = allServices.filter((service, index, self) =>
        index === self.findIndex(s => s.id === service.id)
      )

      setServices(uniqueServices)
    } catch (error) {
      console.error("Failed to fetch services:", error)
      setServices([])
    } finally {
      setLoading(false)
    }
  }

  const fetchGapData = async () => {
    try {
      // Calculate gap data from LP issues
      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${encodeURIComponent(systemName)}`)
      if (response.ok) {
        const data = await response.json()
        const resources = data.resources || []
        
        // Calculate totals from all resources
        let allowed = 0
        let used = 0
        let unused = 0
        
        resources.forEach((r: any) => {
          allowed += r.allowedCount || 0
          used += r.usedCount || 0
          // Check multiple field names for unused count
          unused += r.gapCount || r.unusedCount || r.unused_count || 0
        })
        
        // If unused is still 0 but we have allowed and used, calculate it
        if (unused === 0 && allowed > 0 && used >= 0) {
          unused = allowed - used
        }
        
        console.log(`[GapData] allowed=${allowed}, used=${used}, unused=${unused}`)
        
        setGapData({
          allowed_actions: allowed,
          used_actions: used,
          unused_actions: unused
        })
      }
    } catch (error) {
      console.error("Failed to fetch gap data:", error)
    }
  }

  const computeServices = useMemo(() => {
    return services.filter((s) => {
      const typeUpper = s.type.toUpperCase()
      return COMPUTE_DATA_TYPES.some((t) => typeUpper.includes(t.toUpperCase()))
    })
  }, [services])

  const identityServices = useMemo(() => {
    return services.filter((s) => {
      const typeUpper = s.type.toUpperCase()
      return IDENTITY_SECURITY_TYPES.some((t) => typeUpper.includes(t.toUpperCase()))
    })
  }, [services])

  // Filter by search
  const filteredCompute = useMemo(() => {
    if (!searchQuery) return computeServices
    return computeServices.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.type.toLowerCase().includes(searchQuery.toLowerCase()),
    )
  }, [computeServices, searchQuery])

  const filteredIdentity = useMemo(() => {
    if (!searchQuery) return identityServices
    return identityServices.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.type.toLowerCase().includes(searchQuery.toLowerCase()),
    )
  }, [identityServices, searchQuery])

  // Count by type within each section
  const computeTypeCounts = useMemo(() => {
    return computeServices.reduce(
      (acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
  }, [computeServices])

  const identityTypeCounts = useMemo(() => {
    return identityServices.reduce(
      (acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
  }, [identityServices])

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 60) return `${diffMins} min ago`
      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) return `${diffHours} hours ago`
      return date.toLocaleDateString()
    } catch {
      return "Unknown"
    }
  }

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase()
    if (s === "running" || s === "active" || s === "available") return "bg-emerald-100 text-emerald-700"
    if (s === "stopped" || s === "inactive") return "bg-gray-100 text-gray-700"
    if (s === "pending" || s === "starting") return "bg-yellow-100 text-yellow-700"
    return "bg-blue-100 text-blue-700"
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-600">Loading all services...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Total Services</div>
            <div className="text-3xl font-bold text-gray-900">{services.length}</div>
            <div className="text-xs text-gray-400 mt-1">Across all categories</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Server className="w-4 h-4" />
              Compute & Data
            </div>
            <div className="text-3xl font-bold text-orange-600">{computeServices.length}</div>
            <div className="text-xs text-gray-400 mt-1">Running infrastructure</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Shield className="w-4 h-4" />
              Identity & Security
            </div>
            <div className="text-3xl font-bold text-red-600">{identityServices.length}</div>
            <div className="text-xs text-gray-400 mt-1">Permissions & monitoring</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Activity className="w-4 h-4" />
              Permission Gap
            </div>
            <div className="text-3xl font-bold text-yellow-600">{gapData?.unused_actions ?? 0}</div>
            <div className="text-xs text-gray-400 mt-1">
              {gapData?.allowed_actions ?? 0} allowed, {gapData?.used_actions ?? 0} used
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Shield className="w-4 h-4" />
              Tag Coverage
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {services.length > 0 
                ? Math.round((services.filter(s => s.systemName !== 'Untagged').length / services.length) * 100) 
                : 0}%
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {services.filter(s => s.systemName !== 'Untagged').length} tagged • {services.filter(s => s.systemName === 'Untagged').length} untagged
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search all services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={fetchServices} className="gap-2 bg-transparent">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* SECTION 1: COMPUTE & DATA */}
      <Card>
        <CardHeader className="cursor-pointer hover:bg-gray-50" onClick={() => toggleSection("compute")}>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {expandedSections.has("compute") ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
              <Server className="w-5 h-5 text-orange-500" />
              <span>COMPUTE & DATA (Running Infrastructure)</span>
              <span className="text-sm font-normal text-gray-500">({filteredCompute.length} services)</span>
            </div>
            <div className="flex gap-2">
              {Object.entries(computeTypeCounts)
                .slice(0, 6)
                .map(([type, count]) => (
                  <span
                    key={type}
                    className={`text-xs px-2 py-1 rounded ${SERVICE_COLORS[type] || SERVICE_COLORS.default}`}
                  >
                    {type}: {count}
                  </span>
                ))}
            </div>
          </CardTitle>
        </CardHeader>
        {expandedSections.has("compute") && (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>SystemName</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompute.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                      No compute/data services found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCompute.map((service) => {
                    const IconComponent = SERVICE_ICONS[service.type] || SERVICE_ICONS.default
                    return (
                      <TableRow 
                        key={service.id} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedService(service)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <IconComponent className="w-4 h-4 text-gray-500" />
                            <span className="truncate max-w-[250px]" title={service.name}>
                              {service.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-1 rounded ${SERVICE_COLORS[service.type] || SERVICE_COLORS.default}`}
                          >
                            {service.type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className={`text-xs px-2 py-1 rounded ${
                              service.systemName !== 'Untagged' 
                                ? 'bg-blue-100 text-blue-700' 
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {service.systemName === 'Untagged' ? '⚠️ Untagged' : service.systemName}
                            </span>
                            {service.vpcId && (
                              <span className="text-xs text-gray-400 font-mono truncate max-w-[120px]" title={service.vpcId}>
                                VPC: {service.vpcId.slice(0, 12)}...
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">
                            {service.environment}
                          </span>
                        </TableCell>
                        <TableCell className="text-gray-600">{service.region}</TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-1 rounded ${getStatusColor(service.instanceState || service.status)}`}
                          >
                            {service.instanceState || service.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">{formatDate(service.lastSeen)}</TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* SECTION 2: IDENTITY & SECURITY */}
      <Card>
        <CardHeader className="cursor-pointer hover:bg-gray-50" onClick={() => toggleSection("identity")}>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {expandedSections.has("identity") ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
              <Shield className="w-5 h-5 text-red-500" />
              <span>IDENTITY & SECURITY (Permissions & Monitoring)</span>
              <span className="text-sm font-normal text-gray-500">({filteredIdentity.length} services)</span>
            </div>
            <div className="flex gap-2">
              {Object.entries(identityTypeCounts)
                .slice(0, 6)
                .map(([type, count]) => (
                  <span
                    key={type}
                    className={`text-xs px-2 py-1 rounded ${SERVICE_COLORS[type] || SERVICE_COLORS.default}`}
                  >
                    {type}: {count}
                  </span>
                ))}
            </div>
          </CardTitle>
        </CardHeader>
        {expandedSections.has("identity") && (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>SystemName</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Attached Policies</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIdentity.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                      No identity/security services found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredIdentity.map((service) => {
                    const IconComponent = SERVICE_ICONS[service.type] || SERVICE_ICONS.default
                    const isIAMRole = service.type.toLowerCase().includes("role")
                    return (
                      <TableRow 
                        key={service.id} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedService(service)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <IconComponent className="w-4 h-4 text-gray-500" />
                            <span className="truncate max-w-[250px]" title={service.name}>
                              {service.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-1 rounded ${SERVICE_COLORS[service.type] || SERVICE_COLORS.default}`}
                          >
                            {service.type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className={`text-xs px-2 py-1 rounded ${
                              service.systemName !== 'Untagged' 
                                ? 'bg-blue-100 text-blue-700' 
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {service.systemName === 'Untagged' ? '⚠️ Untagged' : service.systemName}
                            </span>
                            {service.vpcId && (
                              <span className="text-xs text-gray-400 font-mono truncate max-w-[120px]" title={service.vpcId}>
                                VPC: {service.vpcId.slice(0, 12)}...
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">
                            {service.environment}
                          </span>
                        </TableCell>
                        <TableCell>
                          {isIAMRole ? (
                            <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">
                              {service.attachedPolicies || 0} policies
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {service.permissionCount > 0 ? (
                            <span
                              className={`text-xs px-2 py-1 rounded ${service.permissionCount > 20 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}
                            >
                              {service.permissionCount} permissions
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">{formatDate(service.lastSeen)}</TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* Gap Analysis Summary */}
      {gapData && (
        <Card className="bg-gradient-to-r from-yellow-50 to-red-50 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-yellow-600" />
                  Permission Gap Analysis
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Shows the gap between what's RUNNING (compute) and what's ALLOWED (permissions)
                </p>
              </div>
              <div className="flex gap-6 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{gapData.allowed_actions}</div>
                  <div className="text-xs text-gray-500">Allowed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{gapData.used_actions}</div>
                  <div className="text-xs text-gray-500">Used</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{gapData.unused_actions}</div>
                  <div className="text-xs text-gray-500">Unused (GAP)</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Service Detail Panel */}
      {selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedService(null)}>
          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto m-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(() => {
                  const IconComponent = SERVICE_ICONS[selectedService.type] || SERVICE_ICONS.default
                  return <IconComponent className="w-6 h-6 text-gray-600" />
                })()}
                <div>
                  <h2 className="text-xl font-bold">{selectedService.name}</h2>
                  <span className={`text-xs px-2 py-1 rounded ${SERVICE_COLORS[selectedService.type] || SERVICE_COLORS.default}`}>
                    {selectedService.type}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedService(null)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">System</div>
                  <div className="font-medium">{selectedService.systemName}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Environment</div>
                  <div className="font-medium">{selectedService.environment}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Region</div>
                  <div className="font-medium">{selectedService.region}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Status</div>
                  <div className={`inline-block px-2 py-1 rounded text-xs ${getStatusColor(selectedService.instanceState || selectedService.status)}`}>
                    {selectedService.instanceState || selectedService.status}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Last Seen</div>
                  <div className="font-medium">{formatDate(selectedService.lastSeen)}</div>
                </div>
                {selectedService.attachedPolicies !== undefined && (
                  <div>
                    <div className="text-sm text-gray-500">Attached Policies</div>
                    <div className="font-medium">{selectedService.attachedPolicies}</div>
                  </div>
                )}
              </div>

              {/* Properties */}
              {selectedService.properties && Object.keys(selectedService.properties).length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Properties</h3>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    {Object.entries(selectedService.properties).slice(0, 10).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-gray-500">{key}</span>
                        <span className="font-mono text-gray-700 truncate max-w-[300px]" title={String(value)}>
                          {typeof value === 'object' ? JSON.stringify(value).slice(0, 50) : String(value).slice(0, 50)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setSelectedService(null)}>
                  Close
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  View in Console
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
