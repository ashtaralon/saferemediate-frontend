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

  useEffect(() => {
    fetchServices()
    fetchGapData()
  }, [])

  const fetchServices = async () => {
    setLoading(true)
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"
      const response = await fetch(`${backendUrl}/api/graph/nodes?limit=1000`)

      if (!response.ok) throw new Error("Failed to fetch services")

      const data = await response.json()
      const nodes = data.nodes || data || []

      const mapped: ServiceNode[] = nodes.map((node: any) => ({
        id: node.id || node.properties?.id || Math.random().toString(),
        name: node.name || node.properties?.name || node.properties?.arn?.split("/").pop() || "Unknown",
        type: node.type || node.label || "Unknown",
        systemName:
          node.systemName ||
          node.properties?.SystemName ||
          node.properties?.systemName ||
          node.tags?.SystemName ||
          "Ungrouped",
        environment: node.properties?.Environment || node.tags?.Environment || "Production",
        region: node.properties?.region || node.properties?.Region || "eu-west-1",
        status: node.properties?.status || node.properties?.State || "Active",
        lastSeen: node.properties?.updated_at || node.properties?.lastSeen || new Date().toISOString(),
        properties: node.properties || {},
        // IAM specific
        attachedPolicies: node.properties?.attached_policies_count || node.properties?.PolicyCount || 0,
        permissionCount: node.properties?.action_count || node.properties?.permission_count || 0,
        // Compute specific
        instanceState: node.properties?.State || node.properties?.state || "running",
      }))

      setServices(mapped)
    } catch (error) {
      console.error("Failed to fetch services:", error)
      setServices([])
    } finally {
      setLoading(false)
    }
  }

  const fetchGapData = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"
      const response = await fetch(`${backendUrl}/api/traffic/gap/SafeRemediate-Lambda-Remediation-Role`)
      if (response.ok) {
        const data = await response.json()
        setGapData(data)
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
                      <TableRow key={service.id} className="hover:bg-gray-50">
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
                          <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                            {service.systemName}
                          </span>
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
                      <TableRow key={service.id} className="hover:bg-gray-50">
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
                          <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                            {service.systemName}
                          </span>
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
    </div>
  )
}
