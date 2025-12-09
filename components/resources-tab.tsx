"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Server,
  Database,
  Shield,
  Network,
  Cloud,
  Layers,
  Tag,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
  ArrowRight,
  Box,
  HardDrive,
  Lock,
  Globe,
  Cpu,
  Workflow,
} from "lucide-react"

// =============================================================================
// TYPES
// =============================================================================

interface Resource {
  id: string
  name: string
  type: string
  arn?: string
  region?: string
  systemName?: string
  tags?: Record<string, string>
  labels?: string[]
}

interface Relationship {
  source: string
  target: string
  type: string
}

interface ResourcesTabProps {
  systemName?: string
}

// =============================================================================
// ICON MAPPING
// =============================================================================

const typeIcons: Record<string, React.ReactNode> = {
  EC2: <Server className="w-4 h-4" />,
  EC2Instance: <Server className="w-4 h-4" />,
  RDS: <Database className="w-4 h-4" />,
  RDSInstance: <Database className="w-4 h-4" />,
  S3: <HardDrive className="w-4 h-4" />,
  S3Bucket: <HardDrive className="w-4 h-4" />,
  Lambda: <Cpu className="w-4 h-4" />,
  LambdaFunction: <Cpu className="w-4 h-4" />,
  VPC: <Network className="w-4 h-4" />,
  Subnet: <Layers className="w-4 h-4" />,
  SecurityGroup: <Shield className="w-4 h-4" />,
  IAMRole: <Lock className="w-4 h-4" />,
  IAMPolicy: <Lock className="w-4 h-4" />,
  InternetGateway: <Globe className="w-4 h-4" />,
  RouteTable: <Workflow className="w-4 h-4" />,
  NetworkACL: <Shield className="w-4 h-4" />,
  default: <Box className="w-4 h-4" />,
}

const typeColors: Record<string, string> = {
  EC2: "bg-orange-100 text-orange-700 border-orange-200",
  EC2Instance: "bg-orange-100 text-orange-700 border-orange-200",
  RDS: "bg-blue-100 text-blue-700 border-blue-200",
  RDSInstance: "bg-blue-100 text-blue-700 border-blue-200",
  S3: "bg-green-100 text-green-700 border-green-200",
  S3Bucket: "bg-green-100 text-green-700 border-green-200",
  Lambda: "bg-amber-100 text-amber-700 border-amber-200",
  LambdaFunction: "bg-amber-100 text-amber-700 border-amber-200",
  VPC: "bg-purple-100 text-purple-700 border-purple-200",
  Subnet: "bg-purple-50 text-purple-600 border-purple-200",
  SecurityGroup: "bg-red-100 text-red-700 border-red-200",
  IAMRole: "bg-yellow-100 text-yellow-700 border-yellow-200",
  IAMPolicy: "bg-yellow-50 text-yellow-600 border-yellow-200",
  InternetGateway: "bg-cyan-100 text-cyan-700 border-cyan-200",
  RouteTable: "bg-indigo-100 text-indigo-700 border-indigo-200",
  NetworkACL: "bg-pink-100 text-pink-700 border-pink-200",
  default: "bg-gray-100 text-gray-700 border-gray-200",
}

const relationshipColors: Record<string, string> = {
  USED_ACTION: "bg-purple-500",
  USES_ROLE: "bg-yellow-500",
  HAS_POLICY: "bg-yellow-400",
  IN_VPC: "bg-purple-400",
  IN_SUBNET: "bg-purple-300",
  BELONGS_TO: "bg-gray-400",
  HAS_SECURITY_GROUP: "bg-red-400",
  USES_NACL: "bg-pink-400",
  HAS_IGW: "bg-cyan-400",
  USES_ROUTE_TABLE: "bg-indigo-400",
  SECURED_BY: "bg-red-500",
  default: "bg-gray-300",
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ResourcesTab({ systemName }: ResourcesTabProps) {
  const [resources, setResources] = useState<Resource[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<"list" | "grouped">("grouped")

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/proxy/graph-data", {
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`)
        }

        const data = await response.json()

        if (data.success === false) {
          throw new Error(data.error || "Failed to fetch resources")
        }

        const nodes = data.nodes || []
        const rels = data.relationships || []

        // Build a set of all connected resource IDs
        const connectedIds = new Set<string>()
        rels.forEach((rel: Relationship) => {
          if (rel.source) connectedIds.add(rel.source)
          if (rel.target) connectedIds.add(rel.target)
        })

        // Filter to only include resources that are connected (part of the system)
        // Orphan resources with no connections are excluded
        const connectedNodes = nodes.filter((n: Resource) => connectedIds.has(n.id))

        // Filter by system if specified
        const filteredNodes = systemName
          ? connectedNodes.filter((n: Resource) => n.systemName === systemName || !n.systemName)
          : connectedNodes

        setResources(filteredNodes)
        setRelationships(rels)
      } catch (err: any) {
        console.error("Failed to fetch resources:", err)
        setError(err.message || "Failed to load resources")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [systemName])

  // Get unique types for filter
  const uniqueTypes = useMemo(() => {
    const types = new Set<string>()
    resources.forEach((r) => {
      if (r.type) types.add(r.type)
    })
    return Array.from(types).sort()
  }, [resources])

  // Filter resources
  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const matchesSearch =
        searchQuery === "" ||
        r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.type?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesType = typeFilter === "all" || r.type === typeFilter

      return matchesSearch && matchesType
    })
  }, [resources, searchQuery, typeFilter])

  // Group resources by type
  const groupedResources = useMemo(() => {
    const groups: Record<string, Resource[]> = {}
    filteredResources.forEach((r) => {
      const type = r.type || "Unknown"
      if (!groups[type]) groups[type] = []
      groups[type].push(r)
    })
    return groups
  }, [filteredResources])

  // Get connections for a resource
  const getConnections = (resourceId: string) => {
    const outgoing = relationships.filter((r) => r.source === resourceId)
    const incoming = relationships.filter((r) => r.target === resourceId)
    return { outgoing, incoming }
  }

  // Get resource by ID
  const getResourceById = (id: string) => resources.find((r) => r.id === id)

  // Toggle resource expansion
  const toggleExpanded = (id: string) => {
    setExpandedResources((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Stats
  const stats = useMemo(() => {
    const typeCounts: Record<string, number> = {}
    resources.forEach((r) => {
      const type = r.type || "Unknown"
      typeCounts[type] = (typeCounts[type] || 0) + 1
    })

    const relationshipCounts: Record<string, number> = {}
    relationships.forEach((r) => {
      relationshipCounts[r.type] = (relationshipCounts[r.type] || 0) + 1
    })

    const behavioralCount = relationships.filter((r) =>
      r.type.includes("USED_ACTION") || r.type.includes("ACTUAL") || r.type.includes("RUNTIME")
    ).length

    return {
      totalResources: resources.length,
      totalConnections: relationships.length,
      behavioralConnections: behavioralCount,
      infrastructureConnections: relationships.length - behavioralCount,
      typeCounts,
      relationshipCounts,
    }
  }, [resources, relationships])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-gray-500">Loading resources...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200">
        <div className="text-center">
          <div className="text-red-500 text-lg mb-2">Failed to load resources</div>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Banner */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Box className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalResources}</p>
              <p className="text-sm text-gray-500">Total Resources</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Link2 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalConnections}</p>
              <p className="text-sm text-gray-500">Total Connections</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Workflow className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.behavioralConnections}</p>
              <p className="text-sm text-gray-500">Behavioral (ACTUAL)</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Network className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.infrastructureConnections}</p>
              <p className="text-sm text-gray-500">Infrastructure</p>
            </div>
          </div>
        </div>
      </div>

      {/* Relationship Types Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Connection Types</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.relationshipCounts).map(([type, count]) => (
            <div
              key={type}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-200"
            >
              <div
                className={`w-2 h-2 rounded-full ${relationshipColors[type] || relationshipColors.default}`}
              />
              <span className="text-sm font-medium text-gray-700">{type}</span>
              <span className="text-sm text-gray-500">({count})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search resources by name, ID, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types ({resources.length})</option>
              {uniqueTypes.map((type) => (
                <option key={type} value={type}>
                  {type} ({stats.typeCounts[type] || 0})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("grouped")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "grouped" ? "bg-white shadow text-gray-900" : "text-gray-500"
              }`}
            >
              Grouped
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "list" ? "bg-white shadow text-gray-900" : "text-gray-500"
              }`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Resources List */}
      {viewMode === "grouped" ? (
        <div className="space-y-4">
          {Object.entries(groupedResources).map(([type, typeResources]) => (
            <div key={type} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div
                className={`px-4 py-3 border-b border-gray-100 flex items-center gap-3 ${
                  typeColors[type] || typeColors.default
                }`}
              >
                {typeIcons[type] || typeIcons.default}
                <span className="font-medium">{type}</span>
                <span className="text-sm opacity-70">({typeResources.length})</span>
              </div>
              <div className="divide-y divide-gray-100">
                {typeResources.map((resource) => (
                  <ResourceRow
                    key={resource.id}
                    resource={resource}
                    connections={getConnections(resource.id)}
                    getResourceById={getResourceById}
                    expanded={expandedResources.has(resource.id)}
                    onToggle={() => toggleExpanded(resource.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {filteredResources.map((resource) => (
              <ResourceRow
                key={resource.id}
                resource={resource}
                connections={getConnections(resource.id)}
                getResourceById={getResourceById}
                expanded={expandedResources.has(resource.id)}
                onToggle={() => toggleExpanded(resource.id)}
                showType
              />
            ))}
          </div>
        </div>
      )}

      {filteredResources.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Box className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No resources found matching your filters</p>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// RESOURCE ROW COMPONENT
// =============================================================================

interface ResourceRowProps {
  resource: Resource
  connections: { outgoing: Relationship[]; incoming: Relationship[] }
  getResourceById: (id: string) => Resource | undefined
  expanded: boolean
  onToggle: () => void
  showType?: boolean
}

function ResourceRow({
  resource,
  connections,
  getResourceById,
  expanded,
  onToggle,
  showType,
}: ResourceRowProps) {
  const totalConnections = connections.outgoing.length + connections.incoming.length

  return (
    <div>
      <div
        className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <button className="text-gray-400">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {showType && (
          <div className={`p-1.5 rounded ${typeColors[resource.type] || typeColors.default}`}>
            {typeIcons[resource.type] || typeIcons.default}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">
              {resource.name || resource.id}
            </span>
            {resource.systemName && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                {resource.systemName}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 truncate">{resource.id}</p>
        </div>

        {totalConnections > 0 && (
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <Link2 className="w-4 h-4" />
            <span>{totalConnections} connections</span>
          </div>
        )}

        {resource.region && (
          <span className="text-sm text-gray-400">{resource.region}</span>
        )}
      </div>

      {expanded && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
          {/* Resource Details */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Resource ID</p>
              <p className="text-sm font-mono text-gray-700 break-all">{resource.id}</p>
            </div>
            {resource.arn && (
              <div>
                <p className="text-xs text-gray-500 mb-1">ARN</p>
                <p className="text-sm font-mono text-gray-700 break-all">{resource.arn}</p>
              </div>
            )}
          </div>

          {/* Tags */}
          {resource.tags && Object.keys(resource.tags).length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" /> Tags
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(resource.tags).map(([key, value]) => (
                  <span
                    key={key}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
                  >
                    {key}: {value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Connections */}
          {totalConnections > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Connections
              </p>

              <div className="space-y-2">
                {/* Outgoing */}
                {connections.outgoing.map((rel, i) => {
                  const target = getResourceById(rel.target)
                  return (
                    <div
                      key={`out-${i}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          relationshipColors[rel.type]
                            ? `${relationshipColors[rel.type]} text-white`
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {rel.type}
                      </span>
                      <span className="text-gray-600">→</span>
                      <span className="font-medium text-gray-700">
                        {target?.name || target?.id || rel.target}
                      </span>
                      {target?.type && (
                        <span className="text-xs text-gray-400">({target.type})</span>
                      )}
                    </div>
                  )
                })}

                {/* Incoming */}
                {connections.incoming.map((rel, i) => {
                  const source = getResourceById(rel.source)
                  return (
                    <div
                      key={`in-${i}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <ArrowRight className="w-4 h-4 text-blue-500 rotate-180" />
                      <span className="font-medium text-gray-700">
                        {source?.name || source?.id || rel.source}
                      </span>
                      {source?.type && (
                        <span className="text-xs text-gray-400">({source.type})</span>
                      )}
                      <span className="text-gray-600">→</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          relationshipColors[rel.type]
                            ? `${relationshipColors[rel.type]} text-white`
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {rel.type}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {totalConnections === 0 && (
            <p className="text-sm text-gray-400 italic">No connections found</p>
          )}
        </div>
      )}
    </div>
  )
}
