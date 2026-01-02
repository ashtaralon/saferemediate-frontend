"use client"

import { useState, useEffect, useCallback } from "react"
import { Shield, Database, Server, AlertTriangle, ChevronRight, Loader2, Search, Clock } from "lucide-react"
import { DependencyPathVertical } from "./dependency-path-viewer"

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
  all_connected_resources: { id: string; name: string; type: string; relationship?: string }[]
  total_affected: number
  overall_severity: string
  recommendation: string
  analyzed_at?: string
}

interface HistoryEntry {
  id: string
  type: "sg_impact" | "blast_radius" | "simulation"
  resource_id: string
  resource_name: string
  timestamp: string
  result: SGImpact | any
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

const HISTORY_KEY = "saferemediate_analysis_history"

export function ResourceImpactPanel() {
  const [activeTab, setActiveTab] = useState<"resources" | "impact" | "history">("resources")
  const [resources, setResources] = useState<Resource[]>([])
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null)
  const [sgImpact, setSgImpact] = useState<SGImpact | null>(null)
  const [loading, setLoading] = useState(false)
  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [resourceTypes, setResourceTypes] = useState<string[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showPath, setShowPath] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY)
      if (saved) {
        setHistory(JSON.parse(saved))
      }
    } catch (err) {
      console.error("Failed to load history:", err)
    }
  }, [])

  const saveToHistory = useCallback((entry: Omit<HistoryEntry, "id" | "timestamp">) => {
    const newEntry: HistoryEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    }
    
    setHistory(prev => {
      const updated = [newEntry, ...prev].slice(0, 50)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
      } catch (err) {
        console.error("Failed to save history:", err)
      }
      return updated
    })
  }, [])

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
    setShowPath(false)
    
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
        saveToHistory({
          type: "sg_impact",
          resource_id: sgId,
          resource_name: resource.name,
          result: data
        })
      }
    } catch (err) {
      console.error("Failed to fetch SG impact:", err)
    } finally {
      setLoading(false)
    }
  }, [saveToHistory])

  const handleResourceClick = (resource: Resource) => {
    setSelectedResource(resource)
    setActiveTab("impact")
    if (resource.type === "SecurityGroup") {
      fetchSGImpact(resource)
    }
  }

  const handleHistoryClick = (entry: HistoryEntry) => {
    setSgImpact(entry.result)
    setSelectedResource({ id: entry.resource_id, name: entry.resource_name, type: "SecurityGroup" })
    setActiveTab("impact")
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

  const buildPathNodes = () => {
    if (!sgImpact || !selectedResource) return []
    
    const nodes = [
      { id: "internet", name: "Internet", type: "External" },
      { id: selectedResource.id, name: sgImpact.sg_name, type: "SecurityGroup" }
    ]
    
    sgImpact.all_connected_resources?.slice(0, 5).forEach(r => {
      nodes.push({ id: r.id, name: r.name, type: r.type })
    })
    
    return nodes
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 h-full flex flex-col">
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("resources")}
          className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "resources"
              ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Resources
        </button>
        <button
          onClick={() => setActiveTab("impact")}
          className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "impact"
              ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Impact
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative ${
            activeTab === "history"
              ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          History
          {history.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
              {history.length}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "resources" && (
          <div className="h-full flex flex-col">
            <div className="p-2 border-b border-gray-100 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All ({resources.length})</option>
                {resourceTypes.map(type => (
                  <option key={type} value={type}>
                    {type} ({groupedResources[type]?.length || 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {resourcesLoading ? (
                <div className="flex items-center justify-center h-20">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(groupedResources).map(([type, items]) => (
                    <div key={type}>
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 py-0.5">
                        {type} ({items.length})
                      </div>
                      <div className="space-y-0.5">
                        {items.slice(0, 15).map(resource => {
                          const Icon = typeIcons[resource.type] || typeIcons.default
                          return (
                            <button
                              key={resource.id}
                              onClick={() => handleResourceClick(resource)}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                                selectedResource?.id === resource.id
                                  ? "bg-purple-100 border border-purple-300"
                                  : "hover:bg-gray-50"
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-xs text-gray-700 truncate flex-1">
                                {resource.name}
                              </span>
                              <ChevronRight className="w-3 h-3 text-gray-300" />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "impact" && (
          <div className="h-full overflow-y-auto p-3">
            {!selectedResource ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <AlertTriangle className="w-10 h-10 mb-2" />
                <p className="text-xs">Select a resource to analyze</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
              </div>
            ) : selectedResource.type === "SecurityGroup" && sgImpact ? (
              <div className="space-y-3">
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg p-3 text-white">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    <span className="font-semibold text-sm">{sgImpact.sg_name}</span>
                  </div>
                  <div className="mt-1 text-xs opacity-90">
                    What happens if blocked?
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-white text-xs font-medium ${severityColors[sgImpact.overall_severity]}`}>
                    {sgImpact.overall_severity}
                  </span>
                  <span className="text-xs text-gray-500">
                    {sgImpact.total_affected} affected
                  </span>
                </div>

                <button
                  onClick={() => setShowPath(!showPath)}
                  className="w-full text-xs text-purple-600 hover:text-purple-800 flex items-center justify-center gap-1 py-1"
                >
                  {showPath ? "Hide" : "Show"} Dependency Path
                </button>

                {showPath && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-medium text-gray-600 mb-2">Dependency Chain</div>
                    <DependencyPathVertical 
                      nodes={buildPathNodes()}
                      showBlockingPoint={selectedResource.id}
                    />
                  </div>
                )}

                {sgImpact.impact_summary.length > 0 ? (
                  <div className="space-y-2">
                    {sgImpact.impact_summary.map((impact, idx) => (
                      <div
                        key={idx}
                        className={`border rounded-lg p-3 ${
                          impact.severity === "CRITICAL"
                            ? "border-red-200 bg-red-50"
                            : impact.severity === "HIGH"
                            ? "border-orange-200 bg-orange-50"
                            : "border-yellow-200 bg-yellow-50"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-gray-800">{impact.title}</span>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">{impact.description}</p>
                        
                        <div className="space-y-0.5">
                          {impact.affected_resources.slice(0, 3).map((res, i) => (
                            <div key={i} className="flex items-center gap-1 text-xs text-gray-600">
                              <ChevronRight className="w-3 h-3" />
                              <span>{res.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <span className="text-sm text-green-700">Safe to restrict</span>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs font-medium text-gray-600 mb-1">Recommendation</div>
                  <p className="text-xs text-gray-700">{sgImpact.recommendation}</p>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 text-center py-8">
                Select a Security Group to see impact analysis
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="h-full overflow-y-auto p-2">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Clock className="w-10 h-10 mb-2" />
                <p className="text-xs">No analysis history yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {history.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => handleHistoryClick(entry)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 text-left"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      entry.result?.overall_severity === "CRITICAL" ? "bg-red-500" :
                      entry.result?.overall_severity === "HIGH" ? "bg-orange-500" :
                      entry.result?.overall_severity === "MEDIUM" ? "bg-yellow-500" :
                      "bg-green-500"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-700 truncate">
                        {entry.resource_name}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {new Date(entry.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {entry.result?.total_affected || 0} affected
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
