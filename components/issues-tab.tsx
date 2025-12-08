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
}

interface IssuesTabProps {
  systemName: string
}

// Demo issues data - in production this would come from the backend
const ALL_ISSUES: Issue[] = [
  {
    id: "1",
    title: "S3 bucket is publicly accessible",
    system: "Payment-Prod",
    category: "Data Exposure",
    severity: "Critical",
    confidence: 99,
    resources: 1,
    lastDetected: "2 hours ago",
    icon: "bucket",
  },
  {
    id: "2",
    title: "IAM role has excessive permissions",
    system: "Payment-Prod",
    category: "Access Control",
    severity: "Critical",
    confidence: 95,
    resources: 1,
    lastDetected: "5 hours ago",
    icon: "key",
  },
  {
    id: "3",
    title: "Root account without MFA",
    system: "Auth-Service",
    category: "Authentication",
    severity: "Critical",
    confidence: 100,
    resources: 1,
    lastDetected: "1 day ago",
    icon: "shield",
  },
  {
    id: "4",
    title: "CloudTrail logging disabled",
    system: "Analytics-Service",
    category: "Compliance",
    severity: "Critical",
    confidence: 100,
    resources: 1,
    lastDetected: "3 hours ago",
    icon: "file",
  },
  {
    id: "5",
    title: "Database publicly accessible",
    system: "User-Portal",
    category: "Network Security",
    severity: "Critical",
    confidence: 98,
    resources: 2,
    lastDetected: "1 hour ago",
    icon: "database",
  },
  {
    id: "6",
    title: "Unencrypted secrets in environment variables",
    system: "Billing-API",
    category: "Secrets Management",
    severity: "Critical",
    confidence: 100,
    resources: 3,
    lastDetected: "4 hours ago",
    icon: "lock",
  },
  {
    id: "7",
    title: "Admin credentials hardcoded in source code",
    system: "Data-Pipeline",
    category: "Secrets Management",
    severity: "Critical",
    confidence: 100,
    resources: 1,
    lastDetected: "6 hours ago",
    icon: "key",
  },
  {
    id: "8",
    title: "Firewall allows all inbound traffic",
    system: "Health-Records",
    category: "Network Security",
    severity: "Critical",
    confidence: 97,
    resources: 1,
    lastDetected: "2 hours ago",
    icon: "flame",
  },
  {
    id: "9",
    title: "Encryption at rest disabled",
    system: "Payment-Prod",
    category: "Data Protection",
    severity: "Critical",
    confidence: 100,
    resources: 4,
    lastDetected: "8 hours ago",
    icon: "lock",
  },
  {
    id: "10",
    title: "No backup configured for critical database",
    system: "User-Portal",
    category: "Business Continuity",
    severity: "Critical",
    confidence: 100,
    resources: 1,
    lastDetected: "1 day ago",
    icon: "database",
  },
  {
    id: "11",
    title: "Outdated SSL/TLS version in use",
    system: "API-Gateway",
    category: "Cryptography",
    severity: "Critical",
    confidence: 96,
    resources: 2,
    lastDetected: "5 hours ago",
    icon: "lock",
  },
  {
    id: "12",
    title: "Privileged container running as root",
    system: "Kubernetes-Prod",
    category: "Container Security",
    severity: "Critical",
    confidence: 94,
    resources: 5,
    lastDetected: "3 hours ago",
    icon: "server",
  },
  {
    id: "13",
    title: "Exposed API keys in public repository",
    system: "Mobile-Backend",
    category: "Secrets Management",
    severity: "Critical",
    confidence: 100,
    resources: 2,
    lastDetected: "30 min ago",
    icon: "key",
  },
  {
    id: "14",
    title: "SQL injection vulnerability detected",
    system: "User-Portal",
    category: "Application Security",
    severity: "Critical",
    confidence: 92,
    resources: 1,
    lastDetected: "2 hours ago",
    icon: "bug",
  },
  {
    id: "15",
    title: "Lambda function with overly permissive role",
    system: "alon-prod",
    category: "Access Control",
    severity: "Critical",
    confidence: 95,
    resources: 3,
    lastDetected: "1 hour ago",
    icon: "key",
  },
  {
    id: "16",
    title: "Security group allows SSH from anywhere",
    system: "alon-prod",
    category: "Network Security",
    severity: "Critical",
    confidence: 100,
    resources: 2,
    lastDetected: "4 hours ago",
    icon: "globe",
  },
  {
    id: "17",
    title: "RDS instance without encryption",
    system: "alon-prod",
    category: "Data Protection",
    severity: "Critical",
    confidence: 100,
    resources: 1,
    lastDetected: "2 hours ago",
    icon: "database",
  },
  {
    id: "18",
    title: "IAM user with console access and no MFA",
    system: "alon-prod",
    category: "Authentication",
    severity: "High",
    confidence: 98,
    resources: 2,
    lastDetected: "6 hours ago",
    icon: "shield",
  },
  {
    id: "19",
    title: "S3 bucket without versioning enabled",
    system: "alon-prod",
    category: "Data Protection",
    severity: "Medium",
    confidence: 100,
    resources: 4,
    lastDetected: "1 day ago",
    icon: "bucket",
  },
]

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

export function IssuesTab({ systemName }: IssuesTabProps) {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Filter issues for this system
    setLoading(true)
    setTimeout(() => {
      const filtered = ALL_ISSUES.filter(
        (issue) =>
          issue.system.toLowerCase() === systemName.toLowerCase() ||
          issue.system.toLowerCase().includes(systemName.toLowerCase()) ||
          systemName.toLowerCase().includes(issue.system.toLowerCase())
      )
      setIssues(filtered.length > 0 ? filtered : ALL_ISSUES.slice(0, 5)) // Show some demo issues if none match
      setLoading(false)
    }, 500)
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
            <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No issues found matching your criteria</p>
          </div>
        )}
      </div>
    </div>
  )
}
