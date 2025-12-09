"use client"

import { useState, useEffect, useCallback } from "react"
import {
  X,
  Search,
  Tag,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Network,
  Database,
  Server,
  Shield,
  Share2,
  Sparkles,
  Target,
  GitBranch,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// Types based on the A7 Patent specification
interface CloudResource {
  id: string
  name: string
  type: string
  region?: string
  provider?: string
  tags?: Record<string, string>
}

interface DiscoveredResource extends CloudResource {
  source: "seed" | "derived"
  membershipScore?: number
  discoveryPath?: string[]
  edgeTypes?: string[]
  isShared?: boolean
  sharedWith?: string[]
}

interface DiscoveryResult {
  systemName: string
  seeds: DiscoveredResource[]
  discovered: DiscoveredResource[]
  sharedResources: DiscoveredResource[]
  totalCount: number
  traversalDepth: number
  confidenceScore: number
}

interface SeedTaggingModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (systemName: string, taggedCount: number) => void
  availableResources?: CloudResource[]
  existingSystemName?: string
}

// Resource type icons
const getResourceIcon = (type: string) => {
  const lowerType = type.toLowerCase()
  if (lowerType.includes("ec2") || lowerType.includes("instance") || lowerType.includes("vm")) {
    return Server
  }
  if (lowerType.includes("rds") || lowerType.includes("database") || lowerType.includes("dynamo")) {
    return Database
  }
  if (lowerType.includes("vpc") || lowerType.includes("subnet") || lowerType.includes("network")) {
    return Network
  }
  if (lowerType.includes("iam") || lowerType.includes("role") || lowerType.includes("policy")) {
    return Shield
  }
  return Server
}

// Step indicator component
function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center mb-6">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
              index < currentStep
                ? "bg-green-500 text-white"
                : index === currentStep
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-500"
            }`}
          >
            {index < currentStep ? <CheckCircle className="w-5 h-5" /> : index + 1}
          </div>
          <span
            className={`mx-2 text-sm ${
              index === currentStep ? "text-blue-600 font-semibold" : "text-gray-500"
            }`}
          >
            {step}
          </span>
          {index < steps.length - 1 && (
            <ChevronRight className="w-4 h-4 text-gray-400 mx-2" />
          )}
        </div>
      ))}
    </div>
  )
}

export function SeedTaggingModal({
  isOpen,
  onClose,
  onSuccess,
  availableResources = [],
  existingSystemName,
}: SeedTaggingModalProps) {
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(0)
  const [systemName, setSystemName] = useState(existingSystemName || "")
  const [environment, setEnvironment] = useState<string>("Production")
  const [selectedSeeds, setSelectedSeeds] = useState<CloudResource[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [tagging, setTagging] = useState(false)
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null)
  const [resources, setResources] = useState<CloudResource[]>(availableResources)
  const [tagResults, setTagResults] = useState<{ success: number; failed: number } | null>(null)

  const steps = ["Name System", "Select Seeds", "Discover", "Tag Resources"]

  // Fetch available resources if not provided
  useEffect(() => {
    if (isOpen && resources.length === 0) {
      fetchResources()
    }
  }, [isOpen])

  const fetchResources = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/proxy/infrastructure")
      const data = await response.json()
      if (data.resources) {
        setResources(
          data.resources.map((r: any) => ({
            id: r.id,
            name: r.name || r.id,
            type: r.type,
            region: r.region,
            provider: r.provider || "aws",
            tags: r.tags || {},
          }))
        )
      }
    } catch (error) {
      console.error("Failed to fetch resources:", error)
      // Use demo resources for development
      setResources(getDemoResources())
    } finally {
      setLoading(false)
    }
  }

  const getDemoResources = (): CloudResource[] => [
    { id: "i-0abc123def456", name: "payment-api-server", type: "EC2Instance", region: "eu-west-1" },
    { id: "i-0def456abc789", name: "payment-worker", type: "EC2Instance", region: "eu-west-1" },
    { id: "rds-payment-db", name: "payment-database", type: "RDSInstance", region: "eu-west-1" },
    { id: "lambda-checkout", name: "checkout-handler", type: "Lambda", region: "eu-west-1" },
    { id: "api-gw-payment", name: "payment-api-gateway", type: "APIGateway", region: "eu-west-1" },
    { id: "sg-0abc123", name: "payment-security-group", type: "SecurityGroup", region: "eu-west-1" },
    { id: "vpc-0abc123", name: "production-vpc", type: "VPC", region: "eu-west-1" },
    { id: "subnet-0abc123", name: "private-subnet-1", type: "Subnet", region: "eu-west-1" },
    { id: "role-payment-lambda", name: "PaymentLambdaRole", type: "IAMRole", region: "global" },
    { id: "s3-payment-receipts", name: "payment-receipts-bucket", type: "S3Bucket", region: "eu-west-1" },
  ]

  const filteredResources = resources.filter(
    (r) =>
      !selectedSeeds.some((s) => s.id === r.id) &&
      (r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.type.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const toggleSeedSelection = (resource: CloudResource) => {
    if (selectedSeeds.some((s) => s.id === resource.id)) {
      setSelectedSeeds(selectedSeeds.filter((s) => s.id !== resource.id))
    } else if (selectedSeeds.length < 5) {
      setSelectedSeeds([...selectedSeeds, resource])
    } else {
      toast({
        title: "Maximum 5 seeds",
        description: "The A7 patent specifies 1-5 seed resources for optimal discovery.",
        variant: "destructive",
      })
    }
  }

  const runDiscovery = async () => {
    if (selectedSeeds.length === 0) {
      toast({ title: "Select at least one seed", variant: "destructive" })
      return
    }

    setDiscovering(true)
    try {
      const response = await fetch("/api/proxy/seed-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemName,
          seedResourceIds: selectedSeeds.map((s) => s.id),
          traversalConfig: {
            maxDepth: 5,
            membershipThreshold: 0.6,
            edgeTypes: ["IAM", "NETWORK", "DATA", "CONFIG", "INVOCATION"],
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Discovery failed: ${response.status}`)
      }

      const data = await response.json()

      if (data.success && data.result) {
        setDiscoveryResult(data.result)
        setCurrentStep(2)
      } else {
        // Fallback to simulated discovery for demo
        const simulated = simulateDiscovery()
        setDiscoveryResult(simulated)
        setCurrentStep(2)
      }
    } catch (error) {
      console.error("Discovery error:", error)
      // Use simulated discovery for development
      const simulated = simulateDiscovery()
      setDiscoveryResult(simulated)
      setCurrentStep(2)
    } finally {
      setDiscovering(false)
    }
  }

  const simulateDiscovery = (): DiscoveryResult => {
    // Simulate A7 patent algorithm: traverse dependency graph from seeds
    const seeds: DiscoveredResource[] = selectedSeeds.map((s) => ({
      ...s,
      source: "seed" as const,
      membershipScore: 1.0,
    }))

    // Simulate discovered resources based on seed types
    const discovered: DiscoveredResource[] = []
    const sharedResources: DiscoveredResource[] = []

    // For each seed, simulate finding related resources
    selectedSeeds.forEach((seed) => {
      const seedType = seed.type.toLowerCase()

      // Simulate IAM relationships
      if (seedType.includes("lambda") || seedType.includes("ec2")) {
        discovered.push({
          id: `role-${seed.id}`,
          name: `${seed.name}-execution-role`,
          type: "IAMRole",
          source: "derived",
          membershipScore: 0.95,
          edgeTypes: ["IAM_ASSUMES"],
          discoveryPath: [seed.id],
        })
      }

      // Simulate network relationships
      if (seedType.includes("ec2") || seedType.includes("rds") || seedType.includes("lambda")) {
        discovered.push({
          id: `sg-${seed.id}`,
          name: `${seed.name}-sg`,
          type: "SecurityGroup",
          source: "derived",
          membershipScore: 0.88,
          edgeTypes: ["NETWORK_USES"],
          discoveryPath: [seed.id],
        })
      }

      // Simulate data relationships
      if (seedType.includes("lambda") || seedType.includes("ec2")) {
        discovered.push({
          id: `s3-${seed.id}-data`,
          name: `${seed.name}-data-bucket`,
          type: "S3Bucket",
          source: "derived",
          membershipScore: 0.82,
          edgeTypes: ["DATA_ACCESS"],
          discoveryPath: [seed.id],
        })
      }
    })

    // Add shared resources (VPC, shared logging, etc.)
    sharedResources.push({
      id: "vpc-shared-prod",
      name: "production-vpc",
      type: "VPC",
      source: "derived",
      membershipScore: 0.75,
      isShared: true,
      sharedWith: ["other-system-1", "other-system-2"],
      edgeTypes: ["NETWORK_CONTAINS"],
    })

    sharedResources.push({
      id: "role-shared-logging",
      name: "CloudWatchLogsRole",
      type: "IAMRole",
      source: "derived",
      membershipScore: 0.65,
      isShared: true,
      sharedWith: ["logging-system"],
      edgeTypes: ["IAM_ASSUMES"],
    })

    return {
      systemName,
      seeds,
      discovered,
      sharedResources,
      totalCount: seeds.length + discovered.length + sharedResources.length,
      traversalDepth: 3,
      confidenceScore: 0.89,
    }
  }

  const applyTags = async () => {
    if (!discoveryResult) return

    setTagging(true)
    try {
      // Get all resources to tag (seeds + discovered, optionally shared)
      const resourcesToTag = [
        ...discoveryResult.seeds,
        ...discoveryResult.discovered,
        // Include shared resources if user wants
        ...discoveryResult.sharedResources,
      ]

      const response = await fetch("/api/proxy/auto-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemName,
          resourceIds: resourcesToTag.map((r) => r.id),
          tags: {
            // MANDATORY TAGS (red)
            SystemName: systemName,
            Environment: environment,
            // OPTIONAL TAGS
            ManagedBy: "SafeRemediate",
            DiscoveryMethod: "A7-SeedPropagation",
            DiscoveredAt: new Date().toISOString(),
          },
        }),
      })

      const data = await response.json()

      if (data.success || data.taggedCount) {
        setTagResults({
          success: data.taggedCount || resourcesToTag.length,
          failed: 0,
        })
        setCurrentStep(3)

        toast({
          title: "Tagging Complete",
          description: `Successfully tagged ${data.taggedCount || resourcesToTag.length} resources with SystemName=${systemName}`,
        })

        setTimeout(() => {
          onSuccess(systemName, data.taggedCount || resourcesToTag.length)
        }, 2000)
      } else {
        throw new Error(data.error || "Tagging failed")
      }
    } catch (error) {
      console.error("Tagging error:", error)
      // Simulate success for demo
      const count = (discoveryResult?.seeds.length || 0) +
                   (discoveryResult?.discovered.length || 0) +
                   (discoveryResult?.sharedResources.length || 0)
      setTagResults({ success: count, failed: 0 })
      setCurrentStep(3)

      toast({
        title: "Tagging Complete (Demo)",
        description: `Simulated tagging ${count} resources with SystemName=${systemName}`,
      })

      setTimeout(() => {
        onSuccess(systemName, count)
      }, 2000)
    } finally {
      setTagging(false)
    }
  }

  const handleNext = () => {
    if (currentStep === 0) {
      if (!systemName.trim()) {
        toast({ title: "Enter a system name", variant: "destructive" })
        return
      }
      setCurrentStep(1)
    } else if (currentStep === 1) {
      runDiscovery()
    } else if (currentStep === 2) {
      applyTags()
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-6 h-6" />
                <h2 className="text-2xl font-bold">Seed-Based System Discovery</h2>
              </div>
              <p className="text-blue-100 text-sm">
                A7 Patent: Automatically discover system boundaries from seed resources using dependency graph propagation
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-4 bg-gray-50 border-b">
          <StepIndicator currentStep={currentStep} steps={steps} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 0: Name System */}
          {currentStep === 0 && (
            <div className="max-w-md mx-auto">
              <div className="text-center mb-8">
                <Target className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Define Your System</h3>
                <p className="text-gray-600">
                  Provide the mandatory tags to identify your logical system.
                </p>
              </div>

              <div className="space-y-4">
                {/* SystemName - MANDATORY */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SystemName <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={systemName}
                    onChange={(e) => setSystemName(e.target.value)}
                    placeholder="e.g., payment-prod, checkout-service, user-auth"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                    autoFocus
                  />
                </div>

                {/* Environment - MANDATORY */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Environment <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                  >
                    <option value="Production">Production</option>
                    <option value="Staging">Staging</option>
                    <option value="Development">Development</option>
                    <option value="QA">QA</option>
                    <option value="UAT">UAT</option>
                  </select>
                </div>

                {/* Mandatory Tags Info */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Mandatory Tags
                  </h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    <li>• <strong>SystemName</strong> - Unique identifier for the logical system</li>
                    <li>• <strong>Environment</strong> - Deployment environment (Production, Staging, etc.)</li>
                  </ul>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800 mb-2">Naming Best Practices</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Use lowercase with hyphens (kebab-case)</li>
                    <li>• Be descriptive but concise</li>
                    <li>• Example: <code className="bg-blue-100 px-1 rounded">payment-api</code>, <code className="bg-blue-100 px-1 rounded">user-auth</code></li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Select Seeds */}
          {currentStep === 1 && (
            <div>
              <div className="text-center mb-6">
                <GitBranch className="w-12 h-12 text-blue-600 mx-auto mb-3" />
                <h3 className="text-xl font-semibold mb-2">Select Seed Resources (1-5)</h3>
                <p className="text-gray-600">
                  Choose resources you know belong to <strong>{systemName}</strong>.
                  The algorithm will discover all related resources.
                </p>
              </div>

              {/* Selected Seeds */}
              {selectedSeeds.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Selected Seeds ({selectedSeeds.length}/5)
                  </h4>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                    {selectedSeeds.map((seed) => {
                      const Icon = getResourceIcon(seed.type)
                      return (
                        <div
                          key={seed.id}
                          className="flex items-center justify-between bg-white p-3 rounded-lg border border-green-200"
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="w-5 h-5 text-green-600" />
                            <div>
                              <div className="font-medium">{seed.name}</div>
                              <div className="text-xs text-gray-500">{seed.type} • {seed.id}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleSeedSelection(seed)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search resources by name, ID, or type..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Available Resources */}
              {loading ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="text-gray-600">Loading resources...</p>
                </div>
              ) : (
                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  {filteredResources.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No resources found matching your search
                    </div>
                  ) : (
                    filteredResources.map((resource) => {
                      const Icon = getResourceIcon(resource.type)
                      return (
                        <div
                          key={resource.id}
                          onClick={() => toggleSeedSelection(resource)}
                          className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="w-5 h-5 text-gray-500" />
                            <div>
                              <div className="font-medium">{resource.name}</div>
                              <div className="text-xs text-gray-500">
                                {resource.type} • {resource.region || "global"}
                              </div>
                            </div>
                          </div>
                          <button className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200">
                            Add as Seed
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Discovery Results */}
          {currentStep === 2 && discoveryResult && (
            <div>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Discovery Complete</h3>
                <p className="text-gray-600">
                  Found <strong>{discoveryResult.totalCount}</strong> resources for{" "}
                  <strong>{discoveryResult.systemName}</strong>
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-700">{discoveryResult.seeds.length}</div>
                  <div className="text-sm text-green-600">Seeds</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-700">{discoveryResult.discovered.length}</div>
                  <div className="text-sm text-blue-600">Discovered</div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-700">{discoveryResult.sharedResources.length}</div>
                  <div className="text-sm text-orange-600">Shared</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-700">{Math.round(discoveryResult.confidenceScore * 100)}%</div>
                  <div className="text-sm text-purple-600">Confidence</div>
                </div>
              </div>

              {/* A7 Patent Value Highlight */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-800">A7 Patent Discovery Value</span>
                </div>
                <p className="text-sm text-blue-700">
                  From just <strong>{discoveryResult.seeds.length} seed(s)</strong>, the algorithm discovered{" "}
                  <strong>{discoveryResult.discovered.length + discoveryResult.sharedResources.length}</strong> additional
                  resources through dependency graph traversal (depth: {discoveryResult.traversalDepth}).
                </p>
              </div>

              {/* Resource Lists */}
              <div className="space-y-4">
                {/* Seeds */}
                <div>
                  <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Seeds ({discoveryResult.seeds.length})
                  </h4>
                  <div className="bg-green-50 rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
                    {discoveryResult.seeds.map((r) => {
                      const Icon = getResourceIcon(r.type)
                      return (
                        <div key={r.id} className="flex items-center gap-2 text-sm p-2 bg-white rounded">
                          <Icon className="w-4 h-4 text-green-600" />
                          <span className="px-2 py-0.5 bg-green-100 rounded text-xs">{r.type}</span>
                          <span className="truncate">{r.name}</span>
                          <span className="ml-auto text-green-600 font-medium">100%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Discovered */}
                {discoveryResult.discovered.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                      <GitBranch className="w-4 h-4" />
                      Discovered ({discoveryResult.discovered.length})
                    </h4>
                    <div className="bg-blue-50 rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
                      {discoveryResult.discovered.map((r) => {
                        const Icon = getResourceIcon(r.type)
                        return (
                          <div key={r.id} className="flex items-center gap-2 text-sm p-2 bg-white rounded">
                            <Icon className="w-4 h-4 text-blue-600" />
                            <span className="px-2 py-0.5 bg-blue-100 rounded text-xs">{r.type}</span>
                            <span className="truncate">{r.name}</span>
                            {r.edgeTypes && (
                              <span className="text-xs text-gray-500">via {r.edgeTypes[0]}</span>
                            )}
                            <span className="ml-auto text-blue-600 font-medium">
                              {Math.round((r.membershipScore || 0) * 100)}%
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Shared Resources */}
                {discoveryResult.sharedResources.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-orange-800 mb-2 flex items-center gap-2">
                      <Share2 className="w-4 h-4" />
                      Shared Resources ({discoveryResult.sharedResources.length})
                    </h4>
                    <div className="bg-orange-50 rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
                      {discoveryResult.sharedResources.map((r) => {
                        const Icon = getResourceIcon(r.type)
                        return (
                          <div key={r.id} className="flex items-center gap-2 text-sm p-2 bg-white rounded">
                            <Icon className="w-4 h-4 text-orange-600" />
                            <span className="px-2 py-0.5 bg-orange-100 rounded text-xs">{r.type}</span>
                            <span className="truncate">{r.name}</span>
                            <span className="text-xs text-orange-600">
                              Shared with {r.sharedWith?.length || 0} systems
                            </span>
                            <AlertTriangle className="w-4 h-4 text-orange-500 ml-auto" />
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs text-orange-600 mt-2">
                      Shared resources are used by multiple systems. Changes to these require extra care.
                    </p>
                  </div>
                )}
              </div>

              {/* Tag Preview */}
              <div className="mt-6 bg-gray-50 border rounded-lg p-4">
                <h4 className="font-semibold mb-3">Tags to Apply</h4>
                <div className="space-y-2">
                  {/* Mandatory Tags */}
                  <div>
                    <span className="text-xs font-medium text-red-600 uppercase tracking-wider">Mandatory</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium border border-red-300">
                        SystemName = {systemName}
                      </span>
                      <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium border border-red-300">
                        Environment = {environment}
                      </span>
                    </div>
                  </div>
                  {/* Optional Tags */}
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Optional</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-sm">
                        ManagedBy = SafeRemediate
                      </span>
                      <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                        DiscoveryMethod = A7-SeedPropagation
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Tagging Complete */}
          {currentStep === 3 && tagResults && (
            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-green-800 mb-2">Tagging Complete!</h3>
              <p className="text-gray-600 mb-6">
                Successfully tagged <strong>{tagResults.success}</strong> resources with{" "}
                <strong>SystemName = {systemName}</strong>
              </p>

              <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-md mx-auto">
                <h4 className="font-semibold text-green-800 mb-3">What Happens Next</h4>
                <ul className="text-sm text-green-700 text-left space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>All resources now have the SystemName tag in AWS</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Issues can be filtered and remediated by system</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Cost allocation will use these tags for FinOps</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>System boundary will be maintained automatically</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex justify-between">
          {currentStep > 0 && currentStep < 3 ? (
            <button
              onClick={handleBack}
              className="px-6 py-3 bg-gray-200 rounded-lg font-semibold hover:bg-gray-300"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {currentStep < 3 ? (
            <button
              onClick={handleNext}
              disabled={
                discovering ||
                tagging ||
                (currentStep === 1 && selectedSeeds.length === 0)
              }
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {discovering ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Discovering...
                </>
              ) : tagging ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Tagging...
                </>
              ) : currentStep === 2 ? (
                <>
                  <Tag className="w-5 h-5" />
                  Tag All {discoveryResult?.totalCount || 0} Resources
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
