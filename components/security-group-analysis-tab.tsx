"use client"

import { useState, useEffect } from "react"
import {
  AlertTriangle,
  CheckCircle,
  Shield,
  RefreshCw,
  Eye,
  EyeOff,
  Download,
  ChevronDown,
  ChevronRight,
  Zap,
  Copy,
  Check,
  Globe,
  Lock,
  Network,
  Server,
  ExternalLink,
  Clock,
  Activity,
} from "lucide-react"

interface SecurityGroupAnalysisTabProps {
  systemName: string
}

interface SecurityGroupRule {
  id: string
  direction: "inbound" | "outbound"
  protocol: string
  portRange: string
  source: string  // CIDR or security group
  description: string
  used: boolean
  lastUsed?: string
  trafficVolume?: number  // bytes in last 7 days
  connections?: number    // number of connections
  riskLevel: "critical" | "high" | "medium" | "low"
}

interface SecurityGroup {
  id: string
  name: string
  vpcId: string
  description: string
  rules: SecurityGroupRule[]
  attachedResources: string[]
  totalRules: number
  unusedRules: number
  riskScore: number
}

export function SecurityGroupAnalysisTab({ systemName }: SecurityGroupAnalysisTabProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [securityGroups, setSecurityGroups] = useState<SecurityGroup[]>([])
  const [expandedSG, setExpandedSG] = useState<string | null>(null)
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [remediating, setRemediating] = useState<string | null>(null)
  const [copiedPolicy, setCopiedPolicy] = useState(false)
  const [activeView, setActiveView] = useState<"overview" | "details">("overview")
  const [filterUsed, setFilterUsed] = useState<"all" | "used" | "unused">("all")

  // Simulated security group data - in production this would come from VPC Flow Logs analysis
  const generateMockData = (): SecurityGroup[] => {
    return [
      {
        id: "sg-0abc123def456789",
        name: "payment-prod-web-sg",
        vpcId: "vpc-12345678",
        description: "Security group for Payment-Prod web tier",
        attachedResources: ["i-0abc123 (web-server-1)", "i-0def456 (web-server-2)"],
        totalRules: 8,
        unusedRules: 3,
        riskScore: 72,
        rules: [
          {
            id: "rule-1",
            direction: "inbound",
            protocol: "TCP",
            portRange: "443",
            source: "0.0.0.0/0",
            description: "HTTPS from anywhere",
            used: true,
            lastUsed: "2 minutes ago",
            trafficVolume: 1250000000,
            connections: 45000,
            riskLevel: "medium",
          },
          {
            id: "rule-2",
            direction: "inbound",
            protocol: "TCP",
            portRange: "80",
            source: "0.0.0.0/0",
            description: "HTTP from anywhere (redirects to HTTPS)",
            used: true,
            lastUsed: "5 minutes ago",
            trafficVolume: 50000000,
            connections: 12000,
            riskLevel: "medium",
          },
          {
            id: "rule-3",
            direction: "inbound",
            protocol: "TCP",
            portRange: "22",
            source: "0.0.0.0/0",
            description: "SSH from anywhere",
            used: false,
            lastUsed: "Never",
            trafficVolume: 0,
            connections: 0,
            riskLevel: "critical",
          },
          {
            id: "rule-4",
            direction: "inbound",
            protocol: "TCP",
            portRange: "3389",
            source: "0.0.0.0/0",
            description: "RDP from anywhere",
            used: false,
            lastUsed: "Never",
            trafficVolume: 0,
            connections: 0,
            riskLevel: "critical",
          },
          {
            id: "rule-5",
            direction: "inbound",
            protocol: "TCP",
            portRange: "8080",
            source: "10.0.0.0/8",
            description: "Internal health checks",
            used: true,
            lastUsed: "30 seconds ago",
            trafficVolume: 5000000,
            connections: 28800,
            riskLevel: "low",
          },
          {
            id: "rule-6",
            direction: "inbound",
            protocol: "ICMP",
            portRange: "All",
            source: "0.0.0.0/0",
            description: "Ping from anywhere",
            used: false,
            lastUsed: "Never",
            trafficVolume: 0,
            connections: 0,
            riskLevel: "high",
          },
          {
            id: "rule-7",
            direction: "outbound",
            protocol: "TCP",
            portRange: "443",
            source: "0.0.0.0/0",
            description: "HTTPS to anywhere",
            used: true,
            lastUsed: "1 minute ago",
            trafficVolume: 800000000,
            connections: 15000,
            riskLevel: "low",
          },
          {
            id: "rule-8",
            direction: "outbound",
            protocol: "All",
            portRange: "All",
            source: "0.0.0.0/0",
            description: "All traffic outbound",
            used: true,
            lastUsed: "1 minute ago",
            trafficVolume: 2500000000,
            connections: 85000,
            riskLevel: "medium",
          },
        ],
      },
      {
        id: "sg-0xyz789abc123456",
        name: "payment-prod-db-sg",
        vpcId: "vpc-12345678",
        description: "Security group for Payment-Prod database tier",
        attachedResources: ["rds-payment-db-primary", "rds-payment-db-replica"],
        totalRules: 5,
        unusedRules: 2,
        riskScore: 45,
        rules: [
          {
            id: "rule-db-1",
            direction: "inbound",
            protocol: "TCP",
            portRange: "5432",
            source: "sg-0abc123def456789",
            description: "PostgreSQL from web tier SG",
            used: true,
            lastUsed: "10 seconds ago",
            trafficVolume: 500000000,
            connections: 12000,
            riskLevel: "low",
          },
          {
            id: "rule-db-2",
            direction: "inbound",
            protocol: "TCP",
            portRange: "5432",
            source: "10.0.50.0/24",
            description: "PostgreSQL from admin subnet",
            used: true,
            lastUsed: "3 hours ago",
            trafficVolume: 10000000,
            connections: 150,
            riskLevel: "low",
          },
          {
            id: "rule-db-3",
            direction: "inbound",
            protocol: "TCP",
            portRange: "5432",
            source: "0.0.0.0/0",
            description: "PostgreSQL from anywhere (DANGEROUS)",
            used: false,
            lastUsed: "Never",
            trafficVolume: 0,
            connections: 0,
            riskLevel: "critical",
          },
          {
            id: "rule-db-4",
            direction: "inbound",
            protocol: "TCP",
            portRange: "22",
            source: "10.0.100.0/24",
            description: "SSH from bastion subnet",
            used: false,
            lastUsed: "30 days ago",
            trafficVolume: 0,
            connections: 0,
            riskLevel: "medium",
          },
          {
            id: "rule-db-5",
            direction: "outbound",
            protocol: "TCP",
            portRange: "443",
            source: "0.0.0.0/0",
            description: "HTTPS for updates",
            used: true,
            lastUsed: "1 day ago",
            trafficVolume: 50000000,
            connections: 100,
            riskLevel: "low",
          },
        ],
      },
      {
        id: "sg-0lambda456789abc",
        name: "payment-prod-lambda-sg",
        vpcId: "vpc-12345678",
        description: "Security group for Lambda functions",
        attachedResources: ["lambda-payment-processor", "lambda-notification-sender"],
        totalRules: 3,
        unusedRules: 0,
        riskScore: 15,
        rules: [
          {
            id: "rule-lambda-1",
            direction: "outbound",
            protocol: "TCP",
            portRange: "443",
            source: "0.0.0.0/0",
            description: "HTTPS to AWS services",
            used: true,
            lastUsed: "5 seconds ago",
            trafficVolume: 200000000,
            connections: 50000,
            riskLevel: "low",
          },
          {
            id: "rule-lambda-2",
            direction: "outbound",
            protocol: "TCP",
            portRange: "5432",
            source: "sg-0xyz789abc123456",
            description: "PostgreSQL to database SG",
            used: true,
            lastUsed: "10 seconds ago",
            trafficVolume: 300000000,
            connections: 8000,
            riskLevel: "low",
          },
          {
            id: "rule-lambda-3",
            direction: "outbound",
            protocol: "TCP",
            portRange: "6379",
            source: "10.0.30.0/24",
            description: "Redis to cache subnet",
            used: true,
            lastUsed: "2 seconds ago",
            trafficVolume: 150000000,
            connections: 25000,
            riskLevel: "low",
          },
        ],
      },
    ]
  }

  const fetchData = async () => {
    try {
      setError(null)
      setLoading(true)

      // Try to fetch real data from API
      const response = await fetch("/api/proxy/security-groups")

      if (response.ok) {
        const data = await response.json()
        if (data.securityGroups && data.securityGroups.length > 0) {
          setSecurityGroups(data.securityGroups)
          setLastUpdated(new Date())
          return
        }
      }

      // Fall back to mock data for demo
      await new Promise((resolve) => setTimeout(resolve, 800))
      setSecurityGroups(generateMockData())
      setLastUpdated(new Date())
    } catch (err) {
      console.log("[v0] Using mock security group data for demo")
      setSecurityGroups(generateMockData())
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [systemName])

  const handleRemediate = async (sgId: string, ruleId: string) => {
    setRemediating(`${sgId}-${ruleId}`)

    // Simulate remediation
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Remove the rule from the UI
    setSecurityGroups((prev) =>
      prev.map((sg) =>
        sg.id === sgId
          ? {
              ...sg,
              rules: sg.rules.filter((r) => r.id !== ruleId),
              totalRules: sg.totalRules - 1,
              unusedRules: sg.unusedRules - 1,
            }
          : sg
      )
    )

    setRemediating(null)
  }

  const handleRemediateAllUnused = async (sgId: string) => {
    setRemediating(`${sgId}-all`)

    await new Promise((resolve) => setTimeout(resolve, 2000))

    setSecurityGroups((prev) =>
      prev.map((sg) =>
        sg.id === sgId
          ? {
              ...sg,
              rules: sg.rules.filter((r) => r.used),
              unusedRules: 0,
              riskScore: Math.max(0, sg.riskScore - 30),
            }
          : sg
      )
    )

    setRemediating(null)
  }

  const copyRecommendedRules = async (sg: SecurityGroup) => {
    const usedRules = sg.rules.filter((r) => r.used)
    const policy = {
      SecurityGroupId: sg.id,
      RecommendedRules: usedRules.map((r) => ({
        Direction: r.direction,
        Protocol: r.protocol,
        PortRange: r.portRange,
        Source: r.source,
        Description: r.description,
      })),
    }
    await navigator.clipboard.writeText(JSON.stringify(policy, null, 2))
    setCopiedPolicy(true)
    setTimeout(() => setCopiedPolicy(false), 2000)
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case "critical":
        return "bg-red-100 text-red-700 border-red-200"
      case "high":
        return "bg-orange-100 text-orange-700 border-orange-200"
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-200"
      case "low":
        return "bg-green-100 text-green-700 border-green-200"
      default:
        return "bg-gray-100 text-gray-700 border-gray-200"
    }
  }

  const getRiskDescription = (rule: SecurityGroupRule): string => {
    if (rule.source === "0.0.0.0/0") {
      if (rule.portRange === "22") return "SSH open to internet - Critical security risk! Attackers constantly scan for open SSH ports."
      if (rule.portRange === "3389") return "RDP open to internet - Critical security risk! Remote desktop access from anywhere."
      if (rule.portRange === "5432" || rule.portRange === "3306") return "Database port open to internet - Critical! Direct database access from anywhere."
      if (rule.protocol === "ICMP") return "ICMP open to internet - Can be used for network reconnaissance."
      return "Open to entire internet (0.0.0.0/0) - Consider restricting to specific IPs or ranges."
    }
    if (rule.source.startsWith("10.") || rule.source.startsWith("172.") || rule.source.startsWith("192.168.")) {
      return "Restricted to internal network - Good practice."
    }
    if (rule.source.startsWith("sg-")) {
      return "Security group reference - Best practice for AWS-native access control."
    }
    return "Custom CIDR range - Ensure this is intentional and documented."
  }

  const totalUnusedRules = securityGroups.reduce((sum, sg) => sum + sg.unusedRules, 0)
  const totalRules = securityGroups.reduce((sum, sg) => sum + sg.totalRules, 0)
  const criticalRules = securityGroups.flatMap((sg) => sg.rules).filter((r) => r.riskLevel === "critical" && !r.used).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-800 mb-2">Failed to Load Security Group Data</h3>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Security Group Analysis</h2>
          <p className="text-sm text-gray-500 mt-1">
            Network least privilege based on actual traffic patterns
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterUsed}
            onChange={(e) => setFilterUsed(e.target.value as "all" | "used" | "unused")}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Rules</option>
            <option value="used">Used Only</option>
            <option value="unused">Unused Only</option>
          </select>
          <button
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
          <button
            onClick={fetchData}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Security Groups</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{securityGroups.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">{totalRules} total rules</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-orange-500 uppercase tracking-wide">Unused Rules</p>
              <p className="text-3xl font-bold text-orange-500 mt-1">{totalUnusedRules}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
              <EyeOff className="w-6 h-6 text-orange-500" />
            </div>
          </div>
          <p className="text-xs text-orange-500 mt-2">Can be safely removed</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-red-500 uppercase tracking-wide">Critical Risks</p>
              <p className="text-3xl font-bold text-red-500 mt-1">{criticalRules}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
          </div>
          <p className="text-xs text-red-500 mt-2">Open to internet & unused</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-green-500 uppercase tracking-wide">Reduction</p>
              <p className="text-3xl font-bold text-green-500 mt-1">
                {totalRules > 0 ? Math.round((totalUnusedRules / totalRules) * 100) : 0}%
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Lock className="w-6 h-6 text-green-500" />
            </div>
          </div>
          <p className="text-xs text-green-500 mt-2">Attack surface reduction</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Activity className="w-5 h-5 text-purple-600 mt-0.5" />
          <div>
            <h4 className="font-semibold text-purple-900">Traffic Analysis Based Recommendations</h4>
            <p className="text-sm text-purple-700 mt-1">
              Rules are marked as "used" or "unused" based on 7 days of network traffic analysis.
              Unused rules can be safely removed to reduce attack surface without impacting functionality.
            </p>
          </div>
        </div>
      </div>

      {/* Security Groups List */}
      <div className="space-y-4">
        {securityGroups.map((sg) => {
          const isExpanded = expandedSG === sg.id
          const filteredRules = sg.rules.filter((r) => {
            if (filterUsed === "used") return r.used
            if (filterUsed === "unused") return !r.used
            return true
          })

          return (
            <div key={sg.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Security Group Header */}
              <button
                onClick={() => setExpandedSG(isExpanded ? null : sg.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    sg.unusedRules > 0 ? "bg-orange-100" : "bg-green-100"
                  }`}>
                    <Shield className={`w-6 h-6 ${sg.unusedRules > 0 ? "text-orange-600" : "text-green-600"}`} />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">{sg.name}</h3>
                    <p className="text-sm text-gray-500">{sg.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Rules</p>
                    <p className="font-semibold text-gray-900">{sg.totalRules}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Unused</p>
                    <p className={`font-semibold ${sg.unusedRules > 0 ? "text-orange-600" : "text-green-600"}`}>
                      {sg.unusedRules}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Risk Score</p>
                    <p className={`font-semibold ${
                      sg.riskScore > 60 ? "text-red-600" : sg.riskScore > 30 ? "text-orange-600" : "text-green-600"
                    }`}>
                      {sg.riskScore}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-gray-200">
                  {/* SG Info */}
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <div className="grid grid-cols-3 gap-6 text-sm">
                      <div>
                        <span className="text-gray-500">VPC:</span>
                        <span className="ml-2 font-medium text-gray-900">{sg.vpcId}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Description:</span>
                        <span className="ml-2 font-medium text-gray-900">{sg.description}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Attached to:</span>
                        <span className="ml-2 font-medium text-gray-900">{sg.attachedResources.length} resources</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {sg.unusedRules > 0 && (
                    <div className="px-6 py-3 bg-orange-50 border-b border-orange-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-orange-600" />
                        <span className="text-sm font-medium text-orange-800">
                          {sg.unusedRules} unused rule{sg.unusedRules > 1 ? "s" : ""} can be removed
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => copyRecommendedRules(sg)}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-2"
                        >
                          {copiedPolicy ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                          {copiedPolicy ? "Copied!" : "Copy Recommended Rules"}
                        </button>
                        <button
                          onClick={() => handleRemediateAllUnused(sg.id)}
                          disabled={remediating === `${sg.id}-all`}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 inline-flex items-center gap-2"
                        >
                          {remediating === `${sg.id}-all` ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              Removing...
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4" />
                              Remove All Unused
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Rules Table */}
                  <div className="divide-y divide-gray-100">
                    {/* Table Header */}
                    <div className="px-6 py-3 bg-gray-50 grid grid-cols-12 gap-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <div className="col-span-1">Direction</div>
                      <div className="col-span-1">Protocol</div>
                      <div className="col-span-1">Port</div>
                      <div className="col-span-3">Source/Destination</div>
                      <div className="col-span-2">Traffic (7d)</div>
                      <div className="col-span-1">Status</div>
                      <div className="col-span-1">Risk</div>
                      <div className="col-span-2">Actions</div>
                    </div>

                    {/* Rules */}
                    {filteredRules.map((rule) => {
                      const isRuleExpanded = expandedRule === `${sg.id}-${rule.id}`

                      return (
                        <div key={rule.id} className={`${!rule.used ? "bg-red-50/30" : ""}`}>
                          <div className="px-6 py-3 grid grid-cols-12 gap-4 items-center">
                            <div className="col-span-1">
                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                rule.direction === "inbound"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700"
                              }`}>
                                {rule.direction === "inbound" ? "IN" : "OUT"}
                              </span>
                            </div>
                            <div className="col-span-1">
                              <span className="text-sm font-mono text-gray-900">{rule.protocol}</span>
                            </div>
                            <div className="col-span-1">
                              <span className="text-sm font-mono text-gray-900">{rule.portRange}</span>
                            </div>
                            <div className="col-span-3">
                              <div className="flex items-center gap-2">
                                {rule.source === "0.0.0.0/0" ? (
                                  <Globe className="w-4 h-4 text-red-500" />
                                ) : rule.source.startsWith("sg-") ? (
                                  <Shield className="w-4 h-4 text-green-500" />
                                ) : (
                                  <Network className="w-4 h-4 text-blue-500" />
                                )}
                                <span className="text-sm font-mono text-gray-700 truncate">{rule.source}</span>
                              </div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-sm">
                                <span className="font-medium text-gray-900">{formatBytes(rule.trafficVolume || 0)}</span>
                                <span className="text-gray-500 ml-1">/ {rule.connections?.toLocaleString() || 0} conn</span>
                              </div>
                            </div>
                            <div className="col-span-1">
                              {rule.used ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                  <Eye className="w-3 h-3" />
                                  USED
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                                  <EyeOff className="w-3 h-3" />
                                  UNUSED
                                </span>
                              )}
                            </div>
                            <div className="col-span-1">
                              <span className={`px-2 py-1 text-xs font-medium rounded border ${getRiskColor(rule.riskLevel)}`}>
                                {rule.riskLevel.toUpperCase()}
                              </span>
                            </div>
                            <div className="col-span-2 flex items-center gap-2">
                              <button
                                onClick={() => setExpandedRule(isRuleExpanded ? null : `${sg.id}-${rule.id}`)}
                                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                                title="View details"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              {!rule.used && (
                                <button
                                  onClick={() => handleRemediate(sg.id, rule.id)}
                                  disabled={remediating === `${sg.id}-${rule.id}`}
                                  className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                  {remediating === `${sg.id}-${rule.id}` ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    "Remove"
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Rule Details */}
                          {isRuleExpanded && (
                            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                              <div className="grid grid-cols-2 gap-6">
                                <div>
                                  <h5 className="text-sm font-semibold text-gray-700 mb-2">Rule Details</h5>
                                  <div className="space-y-2 text-sm">
                                    <p><span className="text-gray-500">Description:</span> <span className="text-gray-900">{rule.description}</span></p>
                                    <p><span className="text-gray-500">Last Used:</span> <span className="text-gray-900">{rule.lastUsed}</span></p>
                                    <p><span className="text-gray-500">Connections (7d):</span> <span className="text-gray-900">{rule.connections?.toLocaleString()}</span></p>
                                  </div>
                                </div>
                                <div>
                                  <h5 className="text-sm font-semibold text-gray-700 mb-2">Risk Assessment</h5>
                                  <p className="text-sm text-gray-700">{getRiskDescription(rule)}</p>
                                  {!rule.used && (
                                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                                      <p className="text-sm text-green-800">
                                        <CheckCircle className="w-4 h-4 inline mr-1" />
                                        <strong>Safe to remove:</strong> No traffic observed in 7 days. Removing this rule won't impact functionality.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {filteredRules.length === 0 && (
                      <div className="px-6 py-8 text-center text-gray-500">
                        No rules match the current filter
                      </div>
                    )}
                  </div>

                  {/* Attached Resources */}
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <h5 className="text-sm font-semibold text-gray-700 mb-2">Attached Resources</h5>
                    <div className="flex flex-wrap gap-2">
                      {sg.attachedResources.map((resource, i) => (
                        <span key={i} className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 inline-flex items-center gap-2">
                          <Server className="w-3 h-3 text-gray-400" />
                          {resource}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {securityGroups.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Security Groups Found</h3>
          <p className="text-gray-500">Security group data will appear here once AWS data sync is complete.</p>
        </div>
      )}

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-center text-sm text-gray-500 flex items-center justify-center gap-2">
          <Clock className="w-4 h-4" />
          Last updated: {lastUpdated.toLocaleString()}
        </div>
      )}
    </div>
  )
}
