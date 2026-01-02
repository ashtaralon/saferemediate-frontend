"use client"

import { useState, useEffect, useCallback } from "react"
import { Shield, Database, Server, AlertTriangle, ChevronRight, Loader2, Search, Filter } from "lucide-react"

interface Resource {
  id: string
  name: string
  type: string
  lpScore?: number
  severity?: string
}

interface ImpactSummary {
  use_case: string
  title: string
  description: string
  affected_resources: { id: string; name: string; type: string }[]
  affected_count: number
  severity: string
  icon: string
}

interface SGImpact {
  sg_id: string
  sg_name: string
  status: string
  impact_summary: ImpactSummary[]
  total_affected: number
  overall_severity: string
  recommendation: string
  analyzed_at?: string
}

const typeIcons: Record<string, any> = {
  SecurityGroup: Shield,
  IAMRole: Shield,
  IAMPolicy: Shield,
  S3Bucket: Database,
  EC2: Server,
  RDS: Database,
  DynamoDBTable: Database,
  Lambda: Server,
  default: Server,
}

const severityColors: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-yellow-500",
  LOW: "bg-green-500",
  "N/A": "bg-gray-400",
}

export function ResourceImpactPanel() {
  const [activeTab, setActiveTab] = useState<"resources" | "impact">("resources")
  const [resources, setResources] = useState<Resource[]>([])
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null)
  const [sgImpact, setSgImpact] = useState<SGImpact | null>(null)
  const [loading, setLoading] = useState(false)
  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [resourceTypes, setResourceTypes] = useState<string[]>([])

  useEffect(() => {
    async function fetchResources() {
      setResourcesLoading(true)
      try {
        const res = await fetch("/api/proxy/impact-analysis/resources?system_name=alon-prod")
        if (res.ok) {
          const data = await res.json()
          setResources(data.resources || [])
          const types = Object.keys(data.by_type || {})
          setResourceTypes(types)
        }
      } catch (err) {
        console.error("Failed to fetch resources:", err)
      } finally {
        setResourcesLoading(false)
      }
    }
    fetchResources()
  }, [])

  const fetchSGImpact = useCallback(async (resource: Resource) => {
    if (resource.type !== "SecurityGroup") return
    
    setLoading(true)
    setSgImpact(null)
    
    const sgNameToId: Record<string, string> = {
      'saferemediate-test-app-sg': 'sg-02a2ccfe185765527',
      'saferemediate-test-alb-sg': 'sg-06a6f52b72976da16',
      'saferemediate-test-db-sg': 'sg-0f8fadc0579ff6845',
      'AlonTest': 'sg-001295b4de50b389d',
      'default': 'sg-0212ab87005f59737',
    }
    
    const sgId = resource.id.startsWith('sg-') ? resource.id : sgNameToId[resource.id] || resource.id
    
    try {
      const res = await fetch(`/api/proxy/impact-analysis/sg-impact/${sgId}`)
      if (res.ok) {
        const data = await res.json()
        setSgImpact(data)
      }
    } catch (err) {
      console.error("Failed to fetch SG impact:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleResourceClick = (resource: Resource) => {
    setSelectedResource(resource)
    setActiveTab("impact")
    if (resource.type === "SecurityGroup") {
      fetchSGImpact(resource)
    }
  }

  const filteredResources = resources.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.id.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = typeFilter === "all" || r.type === typeFilter
    return matchesSearch && matchesType
  })

  const groupedResources = filteredResources.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = []
    acc[r.type].push(r)
    return acc
  }, {} as Record<string, Resource[]>)

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 h-full flex flex-col">
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("resources")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "resources"
              ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Resource List
        </button>
        <button
          onClick={() => setActiveTab("impact")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "impact"
              ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Impact Analysis
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "resources" ? (
          <div className="h-full flex flex-col">
            <div className="p-3 border-b border-gray-100 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search resources..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">All Types ({resources.length})</option>
                  {resourceTypes.map(type => (
                    <option key={type} value={type}>
                      {type} ({groupedResources[type]?.length || 0})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {resourcesLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                  <span className="ml-2 text-gray-500">Loading resources...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(groupedResources).map(([type, items]) => (
                    <div key={type}>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">
                        {type} ({items.length})
                      </div>
                      <div className="space-y-1">
                        {items.slice(0, 20).map(resource => {
                          const Icon = typeIcons[resource.type] || typeIcons.default
                          return (
                            <button
                              key={resource.id}
                              onClick={() => handleResourceClick(resource)}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                                selectedResource?.id === resource.id
                                  ? "bg-purple-100 border border-purple-300"
                                  : "hover:bg-gray-50 border border-transparent"
                              }`}
                            >
                              <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-700 truncate">
                                  {resource.name}
                                </div>
                                {resource.lpScore !== undefined && (
                                  <div className="text-xs text-gray-400">
                                    LP Score: {resource.lpScore}%
                                  </div>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-300" />
                            </button>
                          )
                        })}
                        {items.length > 20 && (
                          <div className="text-xs text-gray-400 text-center py-1">
                            +{items.length - 20} more
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-4">
            {!selectedResource ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <AlertTriangle className="w-12 h-12 mb-2" />
                <p className="text-sm">Select a resource to analyze impact</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                <span className="ml-2 text-gray-500">Analyzing impact...</span>
              </div>
            ) : selectedResource.type === "SecurityGroup" && sgImpact ? (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg p-4 text-white">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    <span className="font-semibold">{sgImpact.sg_name}</span>
                  </div>
                  <div className="mt-2 text-sm opacity-90">
                    What happens if this Security Group is blocked?
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">Overall Severity:</span>
                  <span className={`px-3 py-1 rounded-full text-white text-sm font-medium ${severityColors[sgImpact.overall_severity]}`}>
                    {sgImpact.overall_severity}
                  </span>
                  <span className="text-sm text-gray-500">
                    {sgImpact.total_affected} resources affected
                  </span>
                </div>

                {sgImpact.impact_summary.length > 0 ? (
                  <div className="space-y-3">
                    {sgImpact.impact_summary.map((impact, idx) => (
                      <div
                        key={idx}
                        className={`border rounded-lg p-4 ${
                          impact.severity === "CRITICAL"
                            ? "border-red-200 bg-red-50"
                            : impact.severity === "HIGH"
                            ? "border-orange-200 bg-orange-50"
                            : "border-yellow-200 bg-yellow-50"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-gray-800">{impact.title}</span>
                          <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${severityColors[impact.severity]} text-white`}>
                            {impact.severity}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{impact.description}</p>
                        
                        <div className="mt-2 space-y-1">
                          {impact.affected_resources.map((res, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <ChevronRight className="w-3 h-3 text-gray-400" />
                              <span className="text-gray-700">{res.name}</span>
                              <span className="text-xs text-gray-400">({res.type})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-green-700">
                      <span className="font-medium">No critical dependencies found</span>
                    </div>
                    <p className="text-sm text-green-600 mt-1">
                      This Security Group can be safely restricted
                    </p>
                  </div>
                )}

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-700 mb-1">Recommendation</div>
                  <p className="text-sm text-gray-600">{sgImpact.recommendation}</p>
                </div>

                <div className="text-xs text-gray-400 text-center">
                  Data source: Neo4j
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-100 rounded-lg p-4">
                  <div className="font-medium text-gray-700">{selectedResource.name}</div>
                  <div className="text-sm text-gray-500">{selectedResource.type}</div>
                </div>
                <div className="text-sm text-gray-500">
                  Impact analysis is available for Security Groups.
                  Select a Security Group from the resource list to see what happens if it is blocked.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
