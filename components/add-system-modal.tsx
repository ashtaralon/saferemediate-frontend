"use client"

import { useState, useEffect, useMemo } from "react"
import {
  X,
  Search,
  Tag,
  Server,
  Database,
  Shield,
  Network,
  Cloud,
  HardDrive,
  Lock,
  Globe,
  Cpu,
  Box,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
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
}

interface AddSystemModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (systemName: string) => void
}

// =============================================================================
// ICONS & COLORS
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
  Subnet: <Network className="w-4 h-4" />,
  SecurityGroup: <Shield className="w-4 h-4" />,
  IAMRole: <Lock className="w-4 h-4" />,
  IAMPolicy: <Lock className="w-4 h-4" />,
  InternetGateway: <Globe className="w-4 h-4" />,
  default: <Box className="w-4 h-4" />,
}

const typeColors: Record<string, string> = {
  EC2: "bg-orange-100 text-orange-700",
  EC2Instance: "bg-orange-100 text-orange-700",
  RDS: "bg-blue-100 text-blue-700",
  RDSInstance: "bg-blue-100 text-blue-700",
  S3: "bg-green-100 text-green-700",
  S3Bucket: "bg-green-100 text-green-700",
  Lambda: "bg-amber-100 text-amber-700",
  LambdaFunction: "bg-amber-100 text-amber-700",
  VPC: "bg-purple-100 text-purple-700",
  Subnet: "bg-purple-50 text-purple-600",
  SecurityGroup: "bg-red-100 text-red-700",
  IAMRole: "bg-yellow-100 text-yellow-700",
  IAMPolicy: "bg-yellow-50 text-yellow-600",
  InternetGateway: "bg-cyan-100 text-cyan-700",
  default: "bg-gray-100 text-gray-700",
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AddSystemModal({ isOpen, onClose, onSuccess }: AddSystemModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [systemName, setSystemName] = useState("")
  const [environment, setEnvironment] = useState("Production")
  const [criticality, setCriticality] = useState("MISSION CRITICAL")
  const [resources, setResources] = useState<Resource[]>([])
  const [selectedSeeds, setSelectedSeeds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [loading, setLoading] = useState(false)
  const [expanding, setExpanding] = useState(false)
  const [expandedResources, setExpandedResources] = useState<Resource[]>([])
  const [error, setError] = useState<string | null>(null)

  // Fetch untagged resources
  useEffect(() => {
    if (!isOpen) return

    async function fetchResources() {
      setLoading(true)
      try {
        const response = await fetch("/api/proxy/graph-data")
        const data = await response.json()

        if (data.success === false) {
          throw new Error(data.error)
        }

        // Filter to only show resources without a systemName (untagged)
        const nodes = (data.nodes || []).filter(
          (n: Resource) => !n.systemName
        )
        setResources(nodes)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchResources()
  }, [isOpen])

  // Filter resources
  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const matchesSearch =
        searchQuery === "" ||
        r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = typeFilter === "all" || r.type === typeFilter
      return matchesSearch && matchesType
    })
  }, [resources, searchQuery, typeFilter])

  // Group by type
  const groupedResources = useMemo(() => {
    const groups: Record<string, Resource[]> = {}
    filteredResources.forEach((r) => {
      const type = r.type || "Unknown"
      if (!groups[type]) groups[type] = []
      groups[type].push(r)
    })
    return groups
  }, [filteredResources])

  // Unique types
  const uniqueTypes = useMemo(() => {
    const types = new Set<string>()
    resources.forEach((r) => {
      if (r.type) types.add(r.type)
    })
    return Array.from(types).sort()
  }, [resources])

  // Toggle seed selection
  const toggleSeed = (id: string) => {
    setSelectedSeeds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Expand graph from seeds
  const expandFromSeeds = async () => {
    if (selectedSeeds.size === 0) return

    setExpanding(true)
    setError(null)

    try {
      // Call backend to expand graph from seed nodes
      const response = await fetch("/api/proxy/system-expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seedIds: Array.from(selectedSeeds),
          systemName,
        }),
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to expand graph")
      }

      setExpandedResources(data.resources || [])
      setStep(3)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExpanding(false)
    }
  }

  // Create system and tag resources
  const createSystem = async () => {
    setLoading(true)
    setError(null)

    try {
      // Tag all expanded resources with systemName
      const resourceIds = expandedResources.map((r) => r.id)

      const response = await fetch("/api/proxy/auto-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemName,
          resourceIds,
          environment,
          criticality,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create system")
      }

      onSuccess(systemName)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Reset on close
  const handleClose = () => {
    setStep(1)
    setSystemName("")
    setSelectedSeeds(new Set())
    setExpandedResources([])
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Add New System</h2>
            <p className="text-gray-500">
              {step === 1 && "Step 1: Enter system details"}
              {step === 2 && "Step 2: Select seed resources"}
              {step === 3 && "Step 3: Review discovered resources"}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step >= s
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {step > s ? <Check className="w-4 h-4" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`w-16 h-1 mx-2 ${
                      step > s ? "bg-blue-600" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          {/* Step 1: System Details */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  System Name *
                </label>
                <input
                  type="text"
                  value={systemName}
                  onChange={(e) => setSystemName(e.target.value)}
                  placeholder="e.g., payment-prod, hr-dev, billing-api"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Environment
                  </label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>Production</option>
                    <option>Staging</option>
                    <option>Development</option>
                    <option>Testing</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Business Criticality
                  </label>
                  <select
                    value={criticality}
                    onChange={(e) => setCriticality(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>MISSION CRITICAL</option>
                    <option>BUSINESS CRITICAL</option>
                    <option>IMPORTANT</option>
                    <option>STANDARD</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Select Seeds */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search resources..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="all">All Types</option>
                  {uniqueTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-sm text-gray-500">
                Select seed resources - connected resources will be auto-discovered
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {Object.entries(groupedResources).map(([type, typeResources]) => (
                    <div key={type} className="border rounded-lg overflow-hidden">
                      <div
                        className={`px-4 py-2 flex items-center gap-2 ${
                          typeColors[type] || typeColors.default
                        }`}
                      >
                        {typeIcons[type] || typeIcons.default}
                        <span className="font-medium">{type}</span>
                        <span className="text-sm opacity-70">
                          ({typeResources.length})
                        </span>
                      </div>
                      <div className="divide-y">
                        {typeResources.map((resource) => (
                          <label
                            key={resource.id}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSeeds.has(resource.id)}
                              onChange={() => toggleSeed(resource.id)}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">
                                {resource.name || resource.id}
                              </p>
                              <p className="text-sm text-gray-500 truncate">
                                {resource.id}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedSeeds.size > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-blue-700 font-medium">
                    {selectedSeeds.size} seed resource(s) selected
                  </p>
                  <p className="text-sm text-blue-600">
                    Click "Discover Connected" to find all related resources
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Workflow className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">
                      Discovered {expandedResources.length} connected resources
                    </p>
                    <p className="text-sm text-green-600">
                      From {selectedSeeds.size} seed(s) via graph traversal
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">System Name</p>
                  <p className="font-medium text-gray-900">{systemName}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">Environment</p>
                  <p className="font-medium text-gray-900">{environment}</p>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                        Resource
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                        Type
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                        Source
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {expandedResources.map((resource: any) => (
                      <tr key={resource.id}>
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-900 truncate max-w-[200px]">
                            {resource.name || resource.id}
                          </p>
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              typeColors[resource.type] || typeColors.default
                            }`}
                          >
                            {resource.type}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              resource.source === "seed"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {resource.source || "derived"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex justify-between flex-shrink-0">
          <button
            onClick={step === 1 ? handleClose : () => setStep((s) => (s - 1) as 1 | 2 | 3)}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              disabled={!systemName.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {step === 2 && (
            <button
              onClick={expandFromSeeds}
              disabled={selectedSeeds.size === 0 || expanding}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {expanding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Discovering...
                </>
              ) : (
                <>
                  <Workflow className="w-4 h-4" />
                  Discover Connected
                </>
              )}
            </button>
          )}

          {step === 3 && (
            <button
              onClick={createSystem}
              disabled={loading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Tag className="w-4 h-4" />
                  Create System & Tag Resources
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
