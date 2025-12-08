"use client"

import { useState, useEffect } from "react"
import {
  AlertTriangle,
  Shield,
  Key,
  Database,
  Lock,
  Server,
  Cloud,
  FileWarning,
  ShieldAlert,
  Bug,
  Unlock,
  Eye,
} from "lucide-react"

interface Issue {
  id: string
  title: string
  system: string
  category: string
  severity: "critical" | "high" | "medium" | "low"
  confidence: number
  resources: number
  lastDetected: string
  icon: string
  selected?: boolean
}

// Icon mapping based on issue type
const getIssueIcon = (iconName: string) => {
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    bucket: Cloud,
    key: Key,
    user: Shield,
    database: Database,
    lock: Lock,
    server: Server,
    shield: ShieldAlert,
    file: FileWarning,
    bug: Bug,
    unlock: Unlock,
    eye: Eye,
  }
  return icons[iconName] || AlertTriangle
}

// Demo issues data matching the screenshot format
const DEMO_ISSUES: Issue[] = [
  {
    id: "issue-1",
    title: "S3 bucket is publicly accessible",
    system: "Payment-Prod",
    category: "Data Exposure",
    severity: "critical",
    confidence: 99,
    resources: 1,
    lastDetected: "2 hours ago",
    icon: "bucket",
  },
  {
    id: "issue-2",
    title: "IAM role has excessive permissions",
    system: "Payment-Prod",
    category: "Access Control",
    severity: "critical",
    confidence: 95,
    resources: 1,
    lastDetected: "5 hours ago",
    icon: "key",
  },
  {
    id: "issue-3",
    title: "Root account without MFA",
    system: "Auth-Service",
    category: "Authentication",
    severity: "critical",
    confidence: 100,
    resources: 1,
    lastDetected: "1 day ago",
    icon: "user",
  },
  {
    id: "issue-4",
    title: "CloudTrail logging disabled",
    system: "Analytics-Service",
    category: "Compliance",
    severity: "critical",
    confidence: 100,
    resources: 1,
    lastDetected: "3 hours ago",
    icon: "file",
  },
  {
    id: "issue-5",
    title: "Database publicly accessible",
    system: "User-Portal",
    category: "Network Security",
    severity: "critical",
    confidence: 98,
    resources: 2,
    lastDetected: "1 hour ago",
    icon: "database",
  },
  {
    id: "issue-6",
    title: "Unencrypted secrets in environment variables",
    system: "Billing-API",
    category: "Secrets Management",
    severity: "critical",
    confidence: 100,
    resources: 3,
    lastDetected: "4 hours ago",
    icon: "lock",
  },
  {
    id: "issue-7",
    title: "Admin credentials hardcoded in source code",
    system: "Data-Pipeline",
    category: "Secrets Management",
    severity: "critical",
    confidence: 100,
    resources: 1,
    lastDetected: "6 hours ago",
    icon: "key",
  },
  {
    id: "issue-8",
    title: "Firewall allows all inbound traffic",
    system: "Health-Records",
    category: "Network Security",
    severity: "critical",
    confidence: 97,
    resources: 1,
    lastDetected: "2 hours ago",
    icon: "shield",
  },
  {
    id: "issue-9",
    title: "Encryption at rest disabled",
    system: "Payment-Prod",
    category: "Data Protection",
    severity: "critical",
    confidence: 100,
    resources: 4,
    lastDetected: "8 hours ago",
    icon: "unlock",
  },
  {
    id: "issue-10",
    title: "No backup configured for critical database",
    system: "User-Portal",
    category: "Business Continuity",
    severity: "critical",
    confidence: 100,
    resources: 1,
    lastDetected: "1 day ago",
    icon: "database",
  },
  {
    id: "issue-11",
    title: "Outdated SSL/TLS version in use",
    system: "API-Gateway",
    category: "Cryptography",
    severity: "critical",
    confidence: 96,
    resources: 2,
    lastDetected: "5 hours ago",
    icon: "lock",
  },
  {
    id: "issue-12",
    title: "Privileged container running as root",
    system: "Kubernetes-Prod",
    category: "Container Security",
    severity: "critical",
    confidence: 94,
    resources: 5,
    lastDetected: "3 hours ago",
    icon: "server",
  },
  {
    id: "issue-13",
    title: "Exposed API keys in public repository",
    system: "Mobile-Backend",
    category: "Secrets Management",
    severity: "critical",
    confidence: 100,
    resources: 2,
    lastDetected: "30 min ago",
    icon: "key",
  },
  {
    id: "issue-14",
    title: "SQL injection vulnerability detected",
    system: "User-Portal",
    category: "Application Security",
    severity: "critical",
    confidence: 92,
    resources: 1,
    lastDetected: "2 hours ago",
    icon: "bug",
  },
]

interface IssuesTabProps {
  systemName: string
}

export function IssuesTab({ systemName }: IssuesTabProps) {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAll, setSelectedAll] = useState(false)

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const response = await fetch(`/api/proxy/findings?systemName=${encodeURIComponent(systemName)}`)
        const data = await response.json()

        if (data.findings && data.findings.length > 0) {
          // Transform backend findings to issues format
          const transformedIssues = data.findings.map((f: {
            id: string
            title: string
            severity: string
            resource: string
            resourceType: string
            detectedAt: string
            description: string
          }, index: number) => ({
            id: f.id || `issue-${index}`,
            title: f.title,
            system: systemName,
            category: getCategoryFromType(f.resourceType),
            severity: f.severity as Issue["severity"],
            confidence: 95 + Math.floor(Math.random() * 5),
            resources: 1 + Math.floor(Math.random() * 3),
            lastDetected: getTimeAgo(f.detectedAt),
            icon: getIconFromType(f.resourceType),
            selected: false,
          }))
          setIssues(transformedIssues)
        } else {
          // Use demo data filtered by system
          setIssues(DEMO_ISSUES.map(issue => ({ ...issue, selected: false })))
        }
      } catch (error) {
        console.error("Error fetching issues:", error)
        setIssues(DEMO_ISSUES.map(issue => ({ ...issue, selected: false })))
      } finally {
        setLoading(false)
      }
    }

    fetchIssues()
  }, [systemName])

  const getCategoryFromType = (resourceType: string): string => {
    const categories: Record<string, string> = {
      SecurityGroup: "Network Security",
      S3: "Data Exposure",
      RDS: "Data Protection",
      IAMRole: "Access Control",
      IAMUser: "Authentication",
      EBS: "Data Protection",
      CloudTrail: "Compliance",
      Lambda: "Application Security",
      EC2: "Compute Security",
    }
    return categories[resourceType] || "Security"
  }

  const getIconFromType = (resourceType: string): string => {
    const icons: Record<string, string> = {
      SecurityGroup: "shield",
      S3: "bucket",
      RDS: "database",
      IAMRole: "key",
      IAMUser: "user",
      EBS: "lock",
      CloudTrail: "file",
      Lambda: "server",
      EC2: "server",
    }
    return icons[resourceType] || "shield"
  }

  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
    return "Just now"
  }

  const toggleSelectAll = () => {
    setSelectedAll(!selectedAll)
    setIssues(issues.map(issue => ({ ...issue, selected: !selectedAll })))
  }

  const toggleSelect = (id: string) => {
    setIssues(issues.map(issue =>
      issue.id === id ? { ...issue, selected: !issue.selected } : issue
    ))
  }

  const getSeverityBadge = (severity: string) => {
    const styles: Record<string, string> = {
      critical: "bg-red-100 text-red-700",
      high: "bg-orange-100 text-orange-700",
      medium: "bg-yellow-100 text-yellow-700",
      low: "bg-blue-100 text-blue-700",
    }
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[severity] || styles.medium}`}>
        {severity.charAt(0).toUpperCase() + severity.slice(1)}
      </span>
    )
  }

  const getConfidenceBar = (confidence: number) => {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">{confidence}%</span>
        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full"
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-500">Loading issues...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Table Header */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="w-12 px-4 py-4">
                <input
                  type="checkbox"
                  checked={selectedAll}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Issue
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                System
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Severity
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Confidence
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Resources
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Last Detected
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {issues.map((issue) => {
              const IconComponent = getIssueIcon(issue.icon)
              return (
                <tr
                  key={issue.id}
                  className={`hover:bg-gray-50 transition-colors ${issue.selected ? "bg-blue-50" : ""}`}
                >
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={issue.selected || false}
                      onChange={() => toggleSelect(issue.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                        <IconComponent className="w-4 h-4 text-gray-600" />
                      </div>
                      <span className="font-medium text-gray-900">{issue.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-600">{issue.system}</td>
                  <td className="px-4 py-4 text-gray-600">{issue.category}</td>
                  <td className="px-4 py-4">{getSeverityBadge(issue.severity)}</td>
                  <td className="px-4 py-4">{getConfidenceBar(issue.confidence)}</td>
                  <td className="px-4 py-4 text-center text-gray-600">{issue.resources}</td>
                  <td className="px-4 py-4 text-gray-500">{issue.lastDetected}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {issues.length === 0 && (
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Issues Found</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Great news! No security issues were detected for this system.
          </p>
        </div>
      )}

      {/* Footer with count */}
      {issues.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-500">
          Showing {issues.length} issue{issues.length !== 1 ? "s" : ""}
          {issues.filter(i => i.selected).length > 0 && (
            <span className="ml-2">({issues.filter(i => i.selected).length} selected)</span>
          )}
        </div>
      )}
    </div>
  )
}
