"use client"

import { useState, useEffect } from "react"
import {
  AlertTriangle,
  Shield,
  Key,
  Database,
  Lock,
  Server,
  Globe,
  FileWarning,
  Bug,
  Flame,
  RefreshCw,
  Search,
  ChevronDown,
} from "lucide-react"

interface Issue {
  id: string
  title: string
  system: string
  category: string
  severity: "Critical" | "High" | "Medium" | "Low"
  confidence: number
  resources: number
  lastDetected: string
  icon: string
  resourceIds: string[]
}

interface IssuesTabProps {
  systemName: string
}

const getIcon = (iconType: string) => {
  switch (iconType) {
    case "bucket":
      return <Lock className="w-5 h-5 text-amber-600" />
    case "key":
      return <Key className="w-5 h-5 text-red-500" />
    case "shield":
      return <Shield className="w-5 h-5 text-blue-500" />
    case "file":
      return <FileWarning className="w-5 h-5 text-yellow-600" />
    case "database":
      return <Database className="w-5 h-5 text-purple-500" />
    case "lock":
      return <Lock className="w-5 h-5 text-orange-500" />
    case "flame":
      return <Flame className="w-5 h-5 text-red-600" />
    case "server":
      return <Server className="w-5 h-5 text-gray-600" />
    case "globe":
      return <Globe className="w-5 h-5 text-green-600" />
    case "bug":
      return <Bug className="w-5 h-5 text-yellow-500" />
    default:
      return <AlertTriangle className="w-5 h-5 text-red-500" />
  }
}

const getSeverityBadge = (severity: string) => {
  switch (severity) {
    case "Critical":
      return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">Critical</span>
    case "High":
      return <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded">High</span>
    case "Medium":
      return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">Medium</span>
    case "Low":
      return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">Low</span>
    default:
      return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">{severity}</span>
  }
}

// Analyze nodes to find real security issues
function deriveIssuesFromNodes(nodes: any[], systemName: string): Issue[] {
  const issues: Issue[] = []
  let issueId = 1

  // Filter nodes for this system
  const systemNodes = nodes.filter((node: any) => {
    const nodeSystem = node.systemName || node.system_name || node.properties?.systemName || "Ungrouped"
    return nodeSystem.toLowerCase().includes(systemName.toLowerCase()) ||
           systemName.toLowerCase().includes(nodeSystem.toLowerCase()) ||
           systemName.toLowerCase() === "ungrouped"
  })

  // If no nodes match this system, analyze all nodes
  const nodesToAnalyze = systemNodes.length > 0 ? systemNodes : nodes

  // Check Security Groups for public ingress (0.0.0.0/0)
  const securityGroups = nodesToAnalyze.filter((n: any) =>
    n.type === "SecurityGroup" || n.labels?.includes("SecurityGroup")
  )

  const publicSGs = securityGroups.filter((sg: any) =>
    sg.has_public_ingress || sg.properties?.has_public_ingress
  )

  if (publicSGs.length > 0) {
    issues.push({
      id: String(issueId++),
      title: "Security group allows inbound traffic from 0.0.0.0/0",
      system: systemName,
      category: "Network Security",
      severity: "Critical",
      confidence: 100,
      resources: publicSGs.length,
      lastDetected: "Just now",
      icon: "globe",
      resourceIds: publicSGs.map((sg: any) => sg.id || sg.properties?.id)
    })
  }

  // Check for EC2 instances with public IPs
  const ec2Instances = nodesToAnalyze.filter((n: any) =>
    n.type === "EC2" || n.labels?.includes("EC2")
  )

  const publicEC2 = ec2Instances.filter((ec2: any) =>
    ec2.public_ip || ec2.properties?.public_ip
  )

  if (publicEC2.length > 0) {
    issues.push({
      id: String(issueId++),
      title: "EC2 instance has public IP address",
      system: systemName,
      category: "Network Security",
      severity: "High",
      confidence: 95,
      resources: publicEC2.length,
      lastDetected: "Just now",
      icon: "server",
      resourceIds: publicEC2.map((ec2: any) => ec2.id || ec2.properties?.id)
    })
  }

  // Check for S3 buckets (potentially public or unencrypted)
  const s3Buckets = nodesToAnalyze.filter((n: any) =>
    n.type === "S3" || n.type === "S3Bucket" || n.labels?.includes("S3")
  )

  const publicS3 = s3Buckets.filter((s3: any) =>
    s3.public || s3.properties?.public || s3.is_public || s3.properties?.is_public
  )

  if (publicS3.length > 0) {
    issues.push({
      id: String(issueId++),
      title: "S3 bucket is publicly accessible",
      system: systemName,
      category: "Data Exposure",
      severity: "Critical",
      confidence: 99,
      resources: publicS3.length,
      lastDetected: "Just now",
      icon: "bucket",
      resourceIds: publicS3.map((s3: any) => s3.id || s3.properties?.id)
    })
  }

  const unencryptedS3 = s3Buckets.filter((s3: any) =>
    !s3.encryption_enabled && !s3.properties?.encryption_enabled
  )

  if (unencryptedS3.length > 0) {
    issues.push({
      id: String(issueId++),
      title: "S3 bucket without server-side encryption",
      system: systemName,
      category: "Data Protection",
      severity: "High",
      confidence: 100,
      resources: unencryptedS3.length,
      lastDetected: "Just now",
      icon: "lock",
      resourceIds: unencryptedS3.map((s3: any) => s3.id || s3.properties?.id)
    })
  }

  // Check for RDS instances
  const rdsInstances = nodesToAnalyze.filter((n: any) =>
    n.type === "RDS" || n.labels?.includes("RDS")
  )

  const publicRDS = rdsInstances.filter((rds: any) =>
    rds.publicly_accessible || rds.properties?.publicly_accessible
  )

  if (publicRDS.length > 0) {
    issues.push({
      id: String(issueId++),
      title: "RDS database is publicly accessible",
      system: systemName,
      category: "Network Security",
      severity: "Critical",
      confidence: 100,
      resources: publicRDS.length,
      lastDetected: "Just now",
      icon: "database",
      resourceIds: publicRDS.map((rds: any) => rds.id || rds.properties?.id)
    })
  }

  const unencryptedRDS = rdsInstances.filter((rds: any) =>
    !rds.storage_encrypted && !rds.properties?.storage_encrypted
  )

  if (unencryptedRDS.length > 0) {
    issues.push({
      id: String(issueId++),
      title: "RDS instance without encryption at rest",
      system: systemName,
      category: "Data Protection",
      severity: "Critical",
      confidence: 100,
      resources: unencryptedRDS.length,
      lastDetected: "Just now",
      icon: "database",
      resourceIds: unencryptedRDS.map((rds: any) => rds.id || rds.properties?.id)
    })
  }

  // Check Lambda functions
  const lambdaFunctions = nodesToAnalyze.filter((n: any) =>
    n.type === "Lambda" || n.type === "LambdaFunction" || n.labels?.includes("Lambda")
  )

  if (lambdaFunctions.length > 0) {
    // Check for Lambda with admin-like roles
    const adminLambda = lambdaFunctions.filter((fn: any) => {
      const role = fn.role || fn.properties?.role || ""
      return role.toLowerCase().includes("admin") || role.includes("*")
    })

    if (adminLambda.length > 0) {
      issues.push({
        id: String(issueId++),
        title: "Lambda function with overly permissive IAM role",
        system: systemName,
        category: "Access Control",
        severity: "High",
        confidence: 90,
        resources: adminLambda.length,
        lastDetected: "Just now",
        icon: "key",
        resourceIds: adminLambda.map((fn: any) => fn.id || fn.properties?.id)
      })
    }
  }

  // Check IAM roles/policies
  const iamRoles = nodesToAnalyze.filter((n: any) =>
    n.type === "IAMRole" || n.labels?.includes("IAMRole")
  )

  const iamPolicies = nodesToAnalyze.filter((n: any) =>
    n.type === "IAMPolicy" || n.labels?.includes("IAMPolicy")
  )

  // Check for overly permissive IAM policies (with * actions)
  const permissivePolicies = iamPolicies.filter((policy: any) => {
    const policyDoc = policy.policy_document || policy.properties?.policy_document
    if (policyDoc) {
      const docStr = typeof policyDoc === "string" ? policyDoc : JSON.stringify(policyDoc)
      return docStr.includes('"Action": "*"') || docStr.includes('"Action":"*"')
    }
    return false
  })

  if (permissivePolicies.length > 0) {
    issues.push({
      id: String(issueId++),
      title: "IAM policy with wildcard (*) permissions",
      system: systemName,
      category: "Access Control",
      severity: "Critical",
      confidence: 100,
      resources: permissivePolicies.length,
      lastDetected: "Just now",
      icon: "key",
      resourceIds: permissivePolicies.map((p: any) => p.id || p.properties?.id)
    })
  }

  // Check VPCs
  const vpcs = nodesToAnalyze.filter((n: any) =>
    n.type === "VPC" || n.labels?.includes("VPC")
  )

  const defaultVPCs = vpcs.filter((vpc: any) =>
    vpc.is_default || vpc.properties?.is_default
  )

  if (defaultVPCs.length > 0) {
    issues.push({
      id: String(issueId++),
      title: "Resources running in default VPC",
      system: systemName,
      category: "Network Security",
      severity: "Medium",
      confidence: 100,
      resources: defaultVPCs.length,
      lastDetected: "Just now",
      icon: "globe",
      resourceIds: defaultVPCs.map((vpc: any) => vpc.id || vpc.properties?.id)
    })
  }

  return issues
}

export function IssuesTab({ systemName }: IssuesTabProps) {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchIssues = async () => {
      setLoading(true)
      setError(null)

      try {
        // Fetch real nodes from backend
        const response = await fetch("/api/proxy/graph-data")

        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`)
        }

        const data = await response.json()
        const nodes = data.nodes || data || []

        console.log("[IssuesTab] Fetched", nodes.length, "nodes from backend")

        // Derive security issues from real nodes
        const derivedIssues = deriveIssuesFromNodes(nodes, systemName)

        console.log("[IssuesTab] Derived", derivedIssues.length, "issues for system:", systemName)

        setIssues(derivedIssues)
      } catch (err) {
        console.error("[IssuesTab] Error fetching issues:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch issues")
        setIssues([])
      } finally {
        setLoading(false)
      }
    }

    fetchIssues()
  }, [systemName])

  const filteredIssues = issues.filter((issue) => {
    const matchesSearch =
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.category.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSeverity = severityFilter === "all" || issue.severity === severityFilter
    return matchesSearch && matchesSeverity
  })

  const toggleSelectAll = () => {
    if (selectedIssues.size === filteredIssues.length) {
      setSelectedIssues(new Set())
    } else {
      setSelectedIssues(new Set(filteredIssues.map((i) => i.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIssues)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIssues(newSelected)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-800 mb-2">Failed to Load Issues</h3>
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with search and filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search issues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{filteredIssues.length} issues found</span>
          {selectedIssues.size > 0 && (
            <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded">
              {selectedIssues.size} selected
            </span>
          )}
        </div>
      </div>

      {/* Issues Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIssues.size === filteredIssues.length && filteredIssues.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Issue
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                System
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Severity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Confidence
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Resources
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Detected
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredIssues.map((issue) => (
              <tr
                key={issue.id}
                className={`hover:bg-gray-50 transition-colors ${
                  selectedIssues.has(issue.id) ? "bg-blue-50" : ""
                }`}
              >
                <td className="px-4 py-4">
                  <input
                    type="checkbox"
                    checked={selectedIssues.has(issue.id)}
                    onChange={() => toggleSelect(issue.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">{getIcon(issue.icon)}</div>
                    <span className="text-sm font-medium text-gray-900">{issue.title}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600">{issue.system}</td>
                <td className="px-4 py-4 text-sm text-gray-600">{issue.category}</td>
                <td className="px-4 py-4">{getSeverityBadge(issue.severity)}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{issue.confidence}%</span>
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${issue.confidence}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600 text-center">{issue.resources}</td>
                <td className="px-4 py-4 text-sm text-gray-500">{issue.lastDetected}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredIssues.length === 0 && (
          <div className="py-12 text-center">
            <Shield className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">No security issues found</p>
            <p className="text-gray-400 text-sm mt-1">
              {issues.length === 0
                ? "No resources found in Neo4j to analyze"
                : "All resources passed security checks"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
