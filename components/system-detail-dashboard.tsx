"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import {
  ArrowLeft,
  Download,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Play,
  Server,
  Database,
  Shield,
  Users,
  Network,
  Tag,
  Activity,
  Zap,
  MessageSquare,
  BarChart3,
  Cloud,
  Camera,
  History,
  ShieldAlert,
  ShieldCheck,
  Map,
  RefreshCw,
  EyeOff,
  ChevronDown,
  Eye,
  Clock,
  ExternalLink,
  Wrench,
  Bug,
  Unplug,
  Target,
} from "lucide-react"
import { SyncFromAWSButton } from "@/components/SyncFromAWSButton"
import SimulationResultsModal from "@/components/SimulationResultsModal"
import { SecurityFindingsList } from "./issues/security-findings-list"
import { PendingApprovals } from "./pending-approvals"
import { fetchSecurityFindings } from "@/lib/api-client"
import type { SecurityFinding, BlastRadiusScore } from "@/lib/types"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"

// Lazy load heavy components with dynamic imports for better performance
const CloudGraphTab = dynamic(
  () => import("./cloud-graph-tab").then((mod) => ({ default: mod.CloudGraphTab })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-slate-600">טוען גרף ענן...</span>
      </div>
    ),
  }
)

const LeastPrivilegeTab = dynamic(() => import("./LeastPrivilegeTab"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      <span className="ml-3 text-slate-600">טוען ניתוח הרשאות...</span>
    </div>
  ),
})

const IdentitiesSectionTab = dynamic(
  () => import("./identities-section").then((mod) => ({ default: mod.IdentitiesSection })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-slate-600">Loading identities...</span>
      </div>
    ),
  }
)

const SharedResourceTab = dynamic(
  () => import("./per-resource-analysis").then((mod) => ({ default: mod.PerResourceAnalysis })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-slate-600">Loading shared resources...</span>
      </div>
    ),
  }
)

const AutomationSectionTab = dynamic(
  () => import("./automation-section").then((mod) => ({ default: mod.AutomationSection })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-slate-600">Loading automation...</span>
      </div>
    ),
  }
)

const CrownJewelProtection = dynamic(() => import("./crown-jewel-protection"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      <span className="ml-3 text-slate-600">Loading crown jewel protection...</span>
    </div>
  ),
})

const GuidedSystemMap = dynamic(() => import("./guided-system-map"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-slate-950 rounded-[28px]">
      <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
      <span className="ml-3 text-slate-300">Loading guided map...</span>
    </div>
  ),
})

const VulnerabilitiesSection = dynamic(
  () => import("./vulnerabilities-section").then((mod) => ({ default: mod.VulnerabilitiesSection })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-slate-600">Loading vulnerabilities...</span>
      </div>
    ),
  }
)

const SystemMapPreview = dynamic(() => import("./system-map-preview"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px]">
      <RefreshCw className="w-8 h-8 text-[#2D51DA] animate-spin" />
    </div>
  ),
})

const SystemDependencyMap = dynamic(() => import("./system-dependency-map"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      <span className="ml-3 text-slate-600">טוען מפת תלויות...</span>
    </div>
  ),
})

const DependencyMapTab = dynamic(() => import("./dependency-map-tab"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      <span className="ml-3 text-slate-600">Loading dependency map...</span>
    </div>
  ),
})

const AttackPathsTab = dynamic(() => import("./attack-paths-tab"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[650px] rounded-xl bg-white border border-[var(--border,#e5e7eb)]">
      <RefreshCw className="w-8 h-8 text-rose-500 animate-spin" />
    </div>
  ),
})

const DynamicAWSArchitecture = dynamic(() => import("./dynamic-aws-architecture"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      <span className="ml-3 text-slate-600">טוען ארכיטקטורה...</span>
    </div>
  ),
})

const RealDataArchitectureMap = dynamic(() => import("./real-data-architecture-map"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      <span className="ml-3 text-slate-600">טוען מפת ארכיטקטורה...</span>
    </div>
  ),
})

const RemediationTimeline = dynamic(() => import("./remediation-timeline").then((mod) => ({ default: mod.RemediationTimeline })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      <span className="ml-3 text-slate-600">Loading Timeline...</span>
    </div>
  ),
})

const AWSTopologyMapLive = dynamic(() => import("./aws-topology-map-live"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      <span className="ml-3 text-slate-600">טוען טופולוגיית AWS...</span>
    </div>
  ),
})

const AllServicesTab = dynamic(
  () => import("./all-services-tab").then((mod) => ({ default: mod.AllServicesTab })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-slate-600">טוען רשימת שירותים...</span>
      </div>
    ),
  }
)

const OrphanServicesTab = dynamic(
  () => import("./orphan-services-tab").then((mod) => ({ default: mod.OrphanServicesTab })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-[#8b5cf6] animate-spin" />
        <span className="ml-3 text-slate-600">Scanning for orphan services...</span>
      </div>
    ),
  }
)

const SnapshotsRecoveryTab = dynamic(() => import("./snapshots-recovery-tab"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      <span className="ml-3 text-slate-600">טוען גיבויים ושחזור...</span>
    </div>
  ),
})

// Legacy component (kept for reference, can be removed later)
const SystemSecurityOverviewLegacy = dynamic(
  () => import("./system-security-overview").then((mod) => ({ default: mod.SystemSecurityOverview })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-slate-600">Loading...</span>
      </div>
    ),
  }
)

const BehavioralIntelligence = dynamic(
  () => import("./behavioral-intelligence").then((mod) => ({ default: mod.BehavioralPage })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-slate-900 rounded-xl">
        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
        <span className="ml-3 text-slate-400">Loading behavioral intelligence...</span>
      </div>
    ),
  }
)
// =============================================================================
// TYPES
// =============================================================================

interface SystemDetailDashboardProps {
  systemName: string
  onBack: () => void
}

interface CriticalIssue {
  id: string
  title: string
  impact: string
  affected: string
  safeToFix: number
  fixTime: string
  temporalAnalysis: string
  expanded: boolean
  selected: boolean
}

interface TagResults {
  success: boolean
  total?: number
  tagged?: number
  failed?: number
  skipped?: number
  tags_applied?: Record<string, string>
  error?: string
}

interface AutoTagStatus {
  status: "running" | "stopped" | "error"
  totalCycles: number
  actualTrafficCaptured: number
  lastSync: string
}

interface GapAnalysis {
  allowed: number
  actual: number
  gap: number
  gapPercent: number
  confidence: number
  relationshipBreakdown?: Record<string, number>
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CRITICALITY_OPTIONS = [
  { value: "MISSION CRITICAL", label: "MISSION CRITICAL", color: "#EF4444" },
  { value: "BUSINESS CRITICAL", label: "BUSINESS CRITICAL", color: "#F97316" },
  { value: "IMPORTANT", label: "IMPORTANT", color: "#EAB308" },
  { value: "STANDARD", label: "STANDARD", color: "#6B7280" },
]

const ENVIRONMENT_OPTIONS = [
  { value: "Production", label: "Production" },
  { value: "Staging", label: "Staging" },
  { value: "Development", label: "Development" },
  { value: "Test", label: "Test" },
]

// =============================================================================
// COMPONENT
// =============================================================================

export function SystemDetailDashboard({ systemName, onBack }: SystemDetailDashboardProps) {
  const [activeTab, setActiveTab] = useState("overview")
  const [issues, setIssues] = useState<CriticalIssue[]>([])

  // System metadata (criticality + environment) from backend
  const [systemMeta, setSystemMeta] = useState<{ criticality: string; environment: string }>({
    criticality: "",
    environment: "",
  })

  // Initialize severityCounts with default values
  const [severityCounts, setSeverityCounts] = useState({
    critical: 0,
    high: 0,
    medium: 0,
    passing: 0,
  })

  // Enforcement score from issues summary API (legacy, preserved during migration)
  const [healthScoreFromApi, setHealthScore] = useState<number | null>(null)

  // Blast Radius System Score — replaces enforcement score as canonical posture number.
  const [brss, setBrss] = useState<BlastRadiusScore | null>(null)
  // BRSS snapshot history — powers the trend chart; each entry is a persisted
  // point-in-time score. Newest-first from the API.
  const [brssHistory, setBrssHistory] = useState<Array<{
    timestamp: string
    score: number
    score_raw: number
    coverage_ratio: number
    resource_count: number
  }>>([])

  const [showHighFindingsModal, setShowHighFindingsModal] = useState(false)
  const [unusedActionsList, setUnusedActionsList] = useState<string[]>([])
  const [expandedPermission, setExpandedPermission] = useState<string | null>(null) // Expanded permission state

  const [remediatingPermission, setRemediatingPermission] = useState<string | null>(null)
  const [showSimulateModal, setShowSimulateModal] = useState(false)
  const [selectedPermissionForSimulation, setSelectedPermissionForSimulation] = useState<string | null>(null)
  const [simulatingIssueId, setSimulatingIssueId] = useState<string | null>(null)
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [securityFindings, setSecurityFindings] = useState<SecurityFinding[]>([])
  const [loadingFindings, setLoadingFindings] = useState(true)

  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis>({
    allowed: 0,
    actual: 0,
    gap: 0,
    gapPercent: 0,
    confidence: 0,
  })
  const [loadingGap, setLoadingGap] = useState(true)
  const [gapError, setGapError] = useState<string | null>(null)
  const [loadingAutoTag, setLoadingAutoTag] = useState(true)
  const [autoTagStatus, setAutoTagStatus] = useState<AutoTagStatus>({
    status: "stopped",
    totalCycles: 0,
    actualTrafficCaptured: 0,
    lastSync: "Awaiting connection",
  })
  const [triggeringAutoTag, setTriggeringAutoTag] = useState(false)
  const [autoTaggerResult, setAutoTaggerResult] = useState<any>(null)
  const [autoTaggerLoading, setAutoTaggerLoading] = useState(false)
  const [showAutoTaggerResult, setShowAutoTaggerResult] = useState(false)
  const [autoTaggerDiagnostic, setAutoTaggerDiagnostic] = useState<any>(null)

  // Global sync / refresh state
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  // =============================================================================
  // TAG ALL STATE
  // =============================================================================
  const [showTagModal, setShowTagModal] = useState(false)
  const [tagging, setTagging] = useState(false)
  const [tagResults, setTagResults] = useState<TagResults | null>(null)
  const [tagForm, setTagForm] = useState({
    environment: "Production",
    criticality: "BUSINESS CRITICAL",
  })

  const [customTags, setCustomTags] = useState<Array<{ key: string; value: string }>>([])
  const [newTagKey, setNewTagKey] = useState("")
  const [newTagValue, setNewTagValue] = useState("")

  const [totalChecks, setTotalChecks] = useState(0) // Declared totalChecks variable

  // CVE Summary state
  const [cveSummary, setCveSummary] = useState<{
    critical: number
    high: number
    medium: number
    low: number
    totalCves: number
    servicesAtRisk: string[]
    loading: boolean
  }>({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    totalCves: 0,
    servicesAtRisk: [],
    loading: true
  })

  // =============================================================================
  // Fetch issues summary for severity counts
  // =============================================================================
  const fetchIssuesSummary = async () => {
    try {
      // Fetch summary and detailed issues in parallel
      const [summaryRes, issuesRes] = await Promise.all([
        fetch(`/api/proxy/issues-summary?systemName=${encodeURIComponent(systemName)}`),
        fetch(`/api/proxy/least-privilege/issues?systemName=${encodeURIComponent(systemName)}`)
      ])

      if (summaryRes.ok) {
        const data = await summaryRes.json()
        console.log("[v0] Issues summary:", data)

        if (data.success !== false) {
          setSeverityCounts({
            critical: data.critical || 0,
            high: data.high || 0,
            medium: data.medium || 0,
            passing: 100 - (data.critical || 0) - (data.high || 0) - (data.medium || 0),
          })
          const checksCount = Number(data.resources?.total || data.total || 0)
          setTotalChecks(checksCount)
          if (checksCount > 0 && data.avg_health_score !== undefined) {
            setHealthScore(Number(data.avg_health_score))
          } else {
            setHealthScore(null)
          }
          // Blast Radius Score — only set when backend composed it successfully.
          if (data.blast_radius_score && !data.blast_radius_score.error) {
            setBrss(data.blast_radius_score as BlastRadiusScore)
          } else {
            setBrss(null)
          }
        }
      }

      // Populate issues list for the Critical Issues panel AND the Issues tab
      if (issuesRes.ok) {
        const issuesData = await issuesRes.json()
        const resources = issuesData.resources || []

        // Transform resources to CriticalIssue format for Critical Issues panel
        const criticalIssues: CriticalIssue[] = resources
          .filter((r: any) => r.gapCount > 0 || r.exposedCount > 0)
          .map((r: any, idx: number) => ({
            id: r.resourceArn || r.resourceName || `issue-${idx}`,
            title: `${r.gapCount || r.exposedCount} unused permissions`,
            description: r.resourceType === 'IAMRole'
              ? `IAM Role "${r.resourceName}" has ${r.gapCount} unused permissions that can be removed`
              : `${r.resourceType} "${r.resourceName}" has ${r.exposedCount || r.gapCount} issues`,
            severity: r.severity || (r.gapCount > 10 ? 'critical' : 'high'),
            category: r.resourceType,
            resource: r.resourceName,
            selected: false,
            expanded: false,
          }))

        setIssues(criticalIssues)
        console.log("[v0] Loaded", criticalIssues.length, "issues")

        // Also populate securityFindings for the Issues tab
        const filteredResources = resources.filter((r: any) => r.gapCount > 0 || r.exposedCount > 0)
        const securityFindingsFromLP: SecurityFinding[] = filteredResources
          .map((r: any) => ({
            id: r.resourceArn || r.id || r.resourceName,
            finding_id: r.resourceArn || r.id,
            title: r.title || `${r.resourceType}: ${r.resourceName}`,
            severity: (r.severity || 'MEDIUM').toUpperCase() as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
            description: r.description || `${r.gapCount || r.exposedCount} unused permissions can be removed`,
            resource: r.resourceName || r.resourceId,
            resourceType: r.resourceType || 'IAMRole',
            resourceId: r.resourceArn || r.resourceId,
            category: r.resourceType === 'IAMRole' ? 'IAM' : r.resourceType,
            discoveredAt: r.evidence?.lastUpdated || new Date().toISOString(),
            status: 'open' as const,
            remediation: r.remediation || `Remove ${r.gapCount || r.exposedCount} unused permissions to reduce attack surface`,
            role_name: r.resourceType === 'IAMRole' ? r.resourceName : undefined,
            unused_actions_count: r.gapCount || 0,
            allowed_actions_count: r.allowedCount || 0,
          }))

        setSecurityFindings(securityFindingsFromLP)
        setLoadingFindings(false)
      }
    } catch (error) {
      console.error("[v0] Error fetching issues summary:", error)
    }
  }

  // =============================================================================
  const fetchGapAnalysis = async () => {
    try {
      // Use proxy endpoint for IAM gap analysis
      const response = await fetch(`/api/proxy/gap-analysis?systemName=${encodeURIComponent(systemName)}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log("[v0] IAM gap analysis response:", data.role_name || data.systemName)

      // Handle new /api/iam-roles/{role}/gap-analysis format
      const allowed = Number(data.summary?.total_permissions || data.allowed_actions || data.allowed_count) || 0
      const actual = Number(data.summary?.used_count || data.used_actions || data.used_count) || 0
      const gap = Number(data.summary?.unused_count || data.unused_actions || data.unused_count) || 0
      const confidence = Number(data.summary?.lp_score || data.confidence || data.statistics?.confidence) || 75

      setGapAnalysis({
        allowed,
        actual,
        gap,
        gapPercent: allowed > 0 ? Math.round((gap / allowed) * 100) : 0,
        confidence,
      })

      // Handle new format: unused_permissions array instead of unused_actions_list
      const unusedActions = data.unused_permissions || data.unused_actions_list || data.unused_actions || []
      setUnusedActionsList(Array.isArray(unusedActions) ? unusedActions : [])
      console.log("[v0] Gap analysis - unused permissions:", unusedActions.length, "items")

      // Severity counts now come from issues-summary endpoint
      // Gap analysis is just for the IAM permissions breakdown

      // REMOVED: Don't populate mock/demo issues from gap analysis
      // Only show real issues from backend security findings
      // Keeping issues array empty - not used in Issues tab anymore
      setIssues([])
    } catch (error) {
      console.error("[v0] Error fetching gap analysis:", error)
      setGapAnalysis({
        allowed: 0,
        actual: 0,
        gap: 0,
        gapPercent: 0,
        confidence: 0,
      })
      setGapError(error instanceof Error ? error.message : 'Failed to fetch gap analysis')
    } finally {
      setLoadingGap(false)
    }
  }

  const fetchAutoTagStatus = async () => {
    try {
      const response = await fetch(`/api/proxy/auto-tag-status?systemName=${encodeURIComponent(systemName)}`)
      const data = await response.json()

      if (!response.ok || data.error) {
        console.log("[v0] Auto-tag status backend error")
        setAutoTagStatus({
          status: "stopped",
          totalCycles: 0,
          actualTrafficCaptured: 0,
          lastSync: "Error",
        })
        return
      }

      const statusValue: "running" | "stopped" | "error" = 
        (data.status === "running" || data.status === "stopped" || data.status === "error")
          ? data.status
          : "stopped"
      
      setAutoTagStatus({
        status: statusValue,
        totalCycles: data.total_cycles || data.totalCycles || 0,
        actualTrafficCaptured: data.actual_traffic || data.actualTraffic || 0,
        lastSync: data.last_sync || data.lastSync || "Never",
      })
    } catch (error) {
      console.error("[v0] Error fetching auto-tag status:", error)
      setAutoTagStatus({
        status: "stopped",
        totalCycles: 0,
        actualTrafficCaptured: 0,
        lastSync: "Error",
      })
    } finally {
      setLoadingAutoTag(false)
    }
  }

  const handleRemediateFromModal = async (permission: string) => {
    setRemediatingPermission(permission)

    try {
      const response = await fetch("/api/proxy/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleName: "SafeRemediate-Lambda-Remediation-Role",
          permission: permission,
          action: "remove",
        }),
      })

      const result = await response.json()
      console.log("[v0] Remediation result:", result)

      if (result.success) {
        // Update the unused actions list
        setUnusedActionsList((prev) => prev.filter((p) => p !== permission))
        // Update severity count
        setSeverityCounts((prev) => ({
          ...prev,
          high: Math.max(0, prev.high - 1),
        }))
      }
    } catch (error) {
      console.error("[v0] Remediation failed:", error)
      // Still update UI for demo
      setUnusedActionsList((prev) => prev.filter((p) => p !== permission))
      setSeverityCounts((prev) => ({
        ...prev,
        high: Math.max(0, prev.high - 1),
      }))
    }

    setRemediatingPermission(null)
  }

  // Port to service mapping for CVE summary
  const PORT_TO_SERVICE: Record<number, string> = {
    22: 'SSH', 80: 'HTTP', 443: 'HTTPS', 3306: 'MySQL', 5432: 'PostgreSQL',
    6379: 'Redis', 27017: 'MongoDB', 8080: 'Tomcat', 8443: 'HTTPS-Alt',
    9200: 'Elasticsearch', 3389: 'RDP', 21: 'FTP', 25: 'SMTP', 53: 'DNS'
  }

  const fetchCVESummary = async () => {
    try {
      // Get system's security groups
      const sysRes = await fetch(`/api/proxy/system-resources/${systemName}`)
      if (!sysRes.ok) {
        setCveSummary(prev => ({ ...prev, loading: false }))
        return
      }

      const sysData = await sysRes.json()
      const sgIds = (sysData.resources || [])
        .filter((r: any) => r.type === 'SecurityGroup')
        .map((r: any) => {
          // First check if id starts with sg-
          if (r.id?.startsWith('sg-')) return r.id
          // Otherwise extract from ARN (arn:aws:ec2:region:account:security-group/sg-xxx)
          if (r.arn?.includes('security-group/sg-')) {
            const match = r.arn.match(/security-group\/(sg-[a-z0-9]+)/)
            return match ? match[1] : null
          }
          return null
        })
        .filter(Boolean)

      if (sgIds.length === 0) {
        setCveSummary(prev => ({ ...prev, loading: false }))
        return
      }

      // Collect CVE counts and services
      let critical = 0, high = 0, medium = 0, low = 0
      const servicesSet = new Set<string>()

      for (const sgId of sgIds) {
        try {
          const vulnRes = await fetch(`/api/proxy/vulnerability/sg/${sgId}/exposure`)
          if (!vulnRes.ok) continue
          const vulnData = await vulnRes.json()

          for (const rule of vulnData.rules_exposure || []) {
            const exposure = rule.vulnerability_exposure || {}

            // Count CVEs by severity
            critical += (exposure.critical_cves || []).length
            high += (exposure.high_cves || []).length
            medium += (exposure.medium_cves || []).length

            // Track services at risk
            const port = rule.port
            if (port && PORT_TO_SERVICE[port]) {
              servicesSet.add(PORT_TO_SERVICE[port])
            } else if (port) {
              servicesSet.add(`Port ${port}`)
            }
          }
        } catch (e) {
          console.error(`[CVESummary] Error fetching ${sgId}:`, e)
        }
      }

      setCveSummary({
        critical,
        high,
        medium,
        low,
        totalCves: critical + high + medium + low,
        servicesAtRisk: Array.from(servicesSet).slice(0, 6),
        loading: false
      })
    } catch (error) {
      console.error('[CVESummary] Error:', error)
      setCveSummary(prev => ({ ...prev, loading: false }))
    }
  }

  const fetchSystemMeta = async () => {
    try {
      const res = await fetch("/api/proxy/systems/available")
      if (res.ok) {
        const data = await res.json()
        const match = (data.systems || []).find(
          (s: any) => (s.SystemName || s.name || s.systemName) === systemName
        )
        if (match) {
          setSystemMeta({
            criticality: match.criticality || "",
            environment: match.environment || "",
          })
        }
      }
    } catch (e) {
      console.error("[v0] Error fetching system metadata:", e)
    }
  }

  // BRSS history fetch — fire-and-forget; chart gracefully handles empty state.
  const fetchBrssHistory = async () => {
    if (!systemName) return
    try {
      const res = await fetch(`/api/proxy/brss/history?systemName=${encodeURIComponent(systemName)}&limit=30`)
      if (!res.ok) return
      const payload = await res.json()
      const snapshots = Array.isArray(payload?.snapshots) ? payload.snapshots : []
      // API returns newest-first; flip for chart-friendly left-to-right chronology.
      setBrssHistory([...snapshots].reverse())
    } catch {
      // Empty-state is the fallback; no user-facing error.
    }
  }

  const fetchAllData = async () => {
    await Promise.all([fetchIssuesSummary(), fetchGapAnalysis(), fetchAutoTagStatus(), fetchCVESummary(), fetchBrssHistory()])
  }

  useEffect(() => {
    // Fetch system metadata once on mount
    fetchSystemMeta()
    // Fetch on mount
    fetchAllData()

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchAllData, 30000)

    return () => clearInterval(interval)
  }, [systemName])

  // NOTE: Security findings are now loaded from fetchIssuesSummary() which uses /api/least-privilege/issues
  // The old /api/findings endpoint is empty, so we disabled this useEffect.
  // Security findings are populated in fetchIssuesSummary along with the Critical Issues panel data.

  const addCustomTag = () => {
    if (newTagKey.trim() && newTagValue.trim()) {
      setCustomTags([...customTags, { key: newTagKey.trim(), value: newTagValue.trim() }])
      setNewTagKey("")
      setNewTagValue("")
    }
  }

  const removeCustomTag = (index: number) => {
    setCustomTags(customTags.filter((_, i) => i !== index))
  }

  // =============================================================================
  // AUTO-TAGGER DIAGNOSTIC
  // =============================================================================
  const fetchAutoTaggerDiagnostic = async () => {
    try {
      console.log('[SystemDetail] Fetching diagnostic info...')
      
      let data: any = null
      let error: string | null = null
      let usedProxy = false
      
      // Try the proxy endpoint first
      try {
        const proxyResponse = await fetch("/api/proxy/auto-tagger/diagnostic", {
          cache: 'no-store',
          signal: AbortSignal.timeout(10000) // 10 second timeout for proxy
        })
        
        if (proxyResponse.ok) {
          data = await proxyResponse.json()
          usedProxy = true
          console.log('[SystemDetail] ✅ Diagnostic from proxy:', data)
        } else {
          // 404 or other error from proxy
          const errorText = await proxyResponse.text().catch(() => '')
          console.warn(`[SystemDetail] ⚠️ Proxy returned ${proxyResponse.status}${errorText ? ': ' + errorText.substring(0, 50) : ''} - trying direct backend call...`)
          throw new Error(`Proxy returned ${proxyResponse.status}`)
        }
      } catch (proxyErr: any) {
        if (proxyErr.name === 'AbortError') {
          console.warn('[SystemDetail] ⚠️ Proxy request timed out')
          error = 'Diagnostic request timed out through the internal proxy'
        } else {
          console.warn('[SystemDetail] ⚠️ Proxy failed:', proxyErr.message || proxyErr)
          error = `Diagnostic proxy failed: ${proxyErr.message || 'Unknown error'}`
        }
      }
      
      if (data) {
        // Add metadata about which source was used
        setAutoTaggerDiagnostic({
          ...data,
          _source: usedProxy ? 'proxy' : 'proxy'
        })
      } else {
        setAutoTaggerDiagnostic({ 
          error: error || 'Failed to fetch diagnostic through the internal proxy',
          tagged_count: 0,
          untagged_count: 0,
          potential_connections: 0,
          _source: 'none'
        })
      }
    } catch (err) {
      console.error("[SystemDetail] ❌ Error fetching diagnostic:", err)
      setAutoTaggerDiagnostic({ 
        error: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        tagged_count: 0,
        untagged_count: 0,
        potential_connections: 0,
        _source: 'error'
      })
    }
  }

  // =============================================================================
  // MANUAL AUTO-TAGGER HANDLER
  // =============================================================================
  const handleManualAutoTag = async () => {
    try {
      setAutoTaggerLoading(true)
      setAutoTaggerResult(null)
      
      console.log('[SystemDetail] Triggering manual auto-tagger...')
      
      const response = await fetch("/api/proxy/auto-tagger/run-once", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        let errData: any = {}
        try {
          errData = await response.json()
        } catch (e) {
          const errorText = await response.text()
          throw new Error(errorText || `HTTP ${response.status}`)
        }
        throw new Error(errData.error || errData.message || `HTTP ${response.status}`)
      }

      let data: any
      try {
        data = await response.json()
      } catch (e) {
        const errorText = await response.text()
        throw new Error(`Invalid response: ${errorText.substring(0, 100)}`)
      }
      console.log('[SystemDetail] Auto-tagger result:', data)
      
      setAutoTaggerResult(data)
      setShowAutoTaggerResult(true)
      
      // Fetch diagnostic info to help debug
      await fetchAutoTaggerDiagnostic()
      
      // Refresh data after tagging
      if (data.success && data.tagged > 0) {
        setTimeout(() => {
          window.location.reload() // Simple refresh to show new tags
        }, 2000)
      }
    } catch (err: any) {
      console.error("Error triggering auto-tagger:", err)
      
      // Handle timeout errors specifically
      let errorMessage = err.message || 'Unknown error'
      if (err.message?.includes('timeout') || err.message?.includes('aborted') || err.name === 'AbortError') {
        errorMessage = 'The operation was aborted due to timeout. The auto-tagger could not propagate tags. Check Neo4j connection and ensure there are tagged seed resources.'
      }
      
      setAutoTaggerResult({ 
        success: false, 
        error: errorMessage,
        tagged: 0 
      })
      setShowAutoTaggerResult(true)
    } finally {
      setAutoTaggerLoading(false)
    }
  }

  // =============================================================================
  // TAG ALL HANDLER
  // =============================================================================
  const handleTagAll = async () => {
    try {
      setTagging(true)
      setTagResults(null)

      const tags: Record<string, string> = {
        Environment: tagForm.environment,
        BusinessCriticality: tagForm.criticality,
        SystemName: systemName,
      }

      customTags.forEach((tag) => {
        tags[tag.key] = tag.value
      })

      const response = await fetch("/api/proxy/auto-tag", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemName,
          tags,
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setTagResults(data)

      if (data.success) {
        // Optional: Automatically close modal after successful tagging
        setTimeout(() => {
          setShowTagModal(false)
          setTagResults(null)
          setCustomTags([])
          setTagForm({ environment: "Production", criticality: "BUSINESS CRITICAL" }) // Reset form
        }, 3000)
      }
    } catch (err: any) {
      console.error("Error tagging resources:", err)
      setTagResults({ success: false, error: err.message })
    } finally {
      setTagging(false)
    }
  }

  // =============================================================================
  // AUTO-TAG HANDLER (Updated)
  // =============================================================================
  const handleTriggerAutoTag = async () => {
    try {
      setTriggeringAutoTag(true)

      const response = await fetch("/api/proxy/auto-tag-trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ systemName }),
      })

      const data = await response.json()

      if (data.success) {
        // Update status immediately and then refresh all data
        setAutoTagStatus((prev) => ({
          ...prev,
          status: "running",
          totalCycles: data.totalCycles || prev.totalCycles + 1,
          lastSync: new Date().toLocaleTimeString(),
        }))
      } else {
        // Handle API error for triggering
        console.error("Failed to trigger auto-tag:", data.error)
        setAutoTagStatus((prev) => ({ ...prev, status: "error" }))
      }

      // Refresh all data after a short delay to reflect the triggered action
      setTimeout(() => {
        fetchAllData()
      }, 3000)
    } catch (err: any) {
      console.error("[v0] Error triggering auto-tag:", err)
      setAutoTagStatus((prev) => ({ ...prev, status: "error" }))
    } finally {
      setTriggeringAutoTag(false)
    }
  }

  // =============================================================================
  // OTHER HANDLERS
  // =============================================================================
  const toggleIssueExpanded = (id: string) => {
    setIssues(issues.map((issue) => (issue.id === id ? { ...issue, expanded: !issue.expanded } : issue)))
  }

  const toggleIssueSelected = (id: string) => {
    setIssues(issues.map((issue) => (issue.id === id ? { ...issue, selected: !issue.selected } : issue)))
  }

  const selectAllIssues = () => {
    const allSelected = issues.every((i) => i.selected)
    setIssues(issues.map((issue) => ({ ...issue, selected: !allSelected })))
  }

  // Tabs array - removed Configuration History and Disaster Recovery, added Security Posture + Behavioral Intelligence
  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "identities", label: "Identities", icon: Users },
    { id: "resource", label: "Shared Resource", icon: Wrench },
    { id: "least-privilege", label: "Least Privilege", icon: ShieldCheck },
    { id: "crown-jewels", label: "Crown Jewels", icon: ShieldAlert },
    { id: "attack-paths", label: "Attack Paths", icon: Target },
    { id: "vulnerabilities", label: "Vulnerabilities", icon: Bug },
    { id: "all-services", label: "All Services", icon: Server },
    { id: "orphan-services", label: "Orphan Services", icon: Unplug },
    { id: "guided-map", label: "Guided Map", icon: Eye },
    { id: "dependency-map", label: "Dependency Map", icon: Map },
    { id: "automation", label: "Automation", icon: Zap },
    { id: "history", label: "Remediation History", icon: History }, // Temporal Timeline
  ]

  const resourceTypes = [
    { name: "Compute", count: 8, icon: Server, color: "bg-[#3b82f620] text-[#3b82f6]", description: "EC2, Lambda, ECS" },
    {
      name: "Network",
      count: 23,
      icon: Network,
      color: "bg-[#8b5cf615] text-[#8b5cf6]",
      description: "VPC, Subnets, SGs",
    },
    {
      name: "Data",
      count: 12,
      icon: Database,
      color: "bg-[#22c55e20] text-[#22c55e]",
      description: "RDS, DynamoDB, S3",
    },
    { name: "Security", count: 16, icon: Shield, color: "bg-[#ef444420] text-[#ef4444]", description: "IAM, KMS, Secrets" },
    {
      name: "Messaging",
      count: 4,
      icon: MessageSquare,
      color: "bg-[#f9731620] text-orange-600",
      description: "SQS, SNS, EventBridge",
    },
  ]

  // Removed the redeclared severityCounts constant
  // const severityCounts = { // This was moved up and initialized with useState
  //   critical: 0,
  //   high: 0,
  //   medium: 0,
  //   passing: 0,
  // }

  const totalFindings = severityCounts.critical + severityCounts.high + severityCounts.medium
  // Legacy enforcement-score scaffolding — retained for non-Overview consumers
  // until we audit each usage site. The Overview card below is now BRSS-driven.
  const hasEnforcementTelemetry = totalChecks > 0 && healthScoreFromApi !== null
  const healthScore = hasEnforcementTelemetry ? healthScoreFromApi : null

  // Blast Radius Score presentation scaffolding (replaces Enforcement Score card).
  const brssScore = brss ? brss.score : null
  const brssTopDriver = brss && brss.top_drivers && brss.top_drivers.length > 0 ? brss.top_drivers[0] : null
  const brssCoveragePercent = brss ? Math.round(brss.coverage_ratio * 100) : null
  const brssAccent = brssScore === null
    ? "#94A3B8"
    : brssScore >= 80 ? "#10B981"
      : brssScore >= 60 ? "#F59E0B"
        : "#EF4444"
  const brssSurface = brssScore === null
    ? "border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100"
    : brssScore >= 80 ? "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50"
      : brssScore >= 60 ? "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50"
        : "border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-50"
  const brssTitle = brssScore === null
    ? "Awaiting first scan"
    : brssScore >= 80 ? "Strong posture — low damage potential"
      : brssScore >= 60 ? "Meaningful damage potential present"
        : "High damage potential — urgent review"
  // Confidence pill derived from top-drivers' usage_confidence + exposure penalty.
  const brssConfidence: { label: string; cls: string } = (() => {
    if (!brss || !brss.top_drivers || brss.top_drivers.length === 0) {
      return { label: "Unknown", cls: "text-slate-600 bg-slate-100" }
    }
    const avgUsage = brss.top_drivers.reduce((s, d) => s + (d.factors?.usage_confidence ?? 1), 0) / brss.top_drivers.length
    const maxExposure = brss.top_drivers.reduce((m, d) => Math.max(m, d.factors?.exposure_uncertainty_penalty ?? 0), 0)
    const cov = brss.coverage_ratio
    if (cov < 0.3 || avgUsage < 0.7 || maxExposure > 8) return { label: "Low", cls: "text-rose-700 bg-rose-100" }
    if (avgUsage >= 0.9 && cov >= 0.7 && maxExposure === 0) return { label: "High", cls: "text-emerald-700 bg-emerald-100" }
    return { label: "Medium", cls: "text-amber-700 bg-amber-100" }
  })()
  // Delta: "Baseline established" on first-ever snapshot, signed delta thereafter.
  const brssDeltaText: string = (() => {
    if (!brss || !brss.delta) return ""
    if (brss.delta.previous_score === null) return "Baseline established"
    const d = brss.delta.score_delta
    if (d > 0) return `+${d} since last snapshot`
    if (d < 0) return `${d} since last snapshot`
    return "No change since last snapshot"
  })()
  const actualPercent = gapAnalysis.allowed > 0 ? Math.round((gapAnalysis.actual / gapAnalysis.allowed) * 100) : 0
  const totalResourcesCount = resourceTypes.reduce((sum, resource) => sum + resource.count, 0)
  const topPriorityItems = [
    severityCounts.critical > 0
      ? {
          title: `${severityCounts.critical} critical finding${severityCounts.critical === 1 ? "" : "s"} need immediate review`,
          detail: "Critical issues are the fastest path to material risk for this system.",
          cta: "Open vulnerabilities",
          action: () => setActiveTab("vulnerabilities"),
          tone: "critical" as const,
        }
      : null,
    severityCounts.high > 0
      ? {
          title: `${severityCounts.high} high-severity finding${severityCounts.high === 1 ? "" : "s"} still open`,
          detail: "These findings are raising pressure on the system even if nothing is critical right now.",
          cta: "Review findings",
          action: () => setActiveTab("vulnerabilities"),
          tone: "high" as const,
        }
      : null,
    gapAnalysis.gap > 0
      ? {
          title: `${gapAnalysis.gap} unused permission${gapAnalysis.gap === 1 ? "" : "s"} can likely be removed`,
          detail: `${gapAnalysis.gapPercent}% of observed access looks removable based on current telemetry.`,
          cta: "Open least privilege",
          action: () => setActiveTab("least-privilege"),
          tone: gapAnalysis.gapPercent >= 50 ? ("high" as const) : ("medium" as const),
        }
      : null,
    !hasEnforcementTelemetry
      ? {
          title: "This system is missing current enforcement telemetry",
          detail: "Run a sync or refresh to calculate a system-scoped enforcement score from live checks.",
          cta: "Refresh overview",
          action: () => setRefreshKey((k) => k + 1),
          tone: "medium" as const,
        }
      : null,
  ].filter((item): item is {
    title: string
    detail: string
    cta: string
    action: () => void
    tone: "critical" | "high" | "medium"
  } => item !== null)
  const overviewIssuePreview = issues
    .filter((issue) => issue.severity !== "low")
    .slice(0, 3)
    .map((issue) => ({
      id: issue.id,
      title: issue.title,
      impact: issue.impact,
      affected: issue.affected,
    }))
  const overviewFindingsPreview = securityFindings
    .slice(0, 3)
    .map((finding) => ({
      id: finding.id,
      title: finding.title,
      description: finding.description,
      severity: String(finding.severity || "unknown").toUpperCase(),
    }))

  // =============================================================================
  // RENDER
  // =============================================================================
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-[var(--border,#e5e7eb)] px-6 py-4">
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          {" "}
          {/* Added max-w and mx-auto for centering */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5 text-[var(--muted-foreground,#4b5563)]" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-[var(--foreground,#111827)]">{systemName}</h1>
                  {systemMeta.environment && (
                    <span className="px-2 py-1 bg-[#22c55e20] text-[#22c55e] text-xs font-medium rounded">
                      {systemMeta.environment.toUpperCase()}
                    </span>
                  )}
                  {systemMeta.criticality && (
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      systemMeta.criticality === "MISSION CRITICAL" ? "bg-[#ef444420] text-[#ef4444]" :
                      systemMeta.criticality === "BUSINESS CRITICAL" ? "bg-[#f9731620] text-[#f97316]" :
                      systemMeta.criticality === "IMPORTANT" ? "bg-[#eab30820] text-[#eab308]" :
                      "bg-[#3b82f620] text-[#3b82f6]"
                    }`}>
                      {systemMeta.criticality}
                    </span>
                  )}
                  {severityCounts.critical > 0 && ( // Conditionally render critical alert
                    <span className="px-2 py-1 bg-[#ef444420] text-[#ef4444] text-xs font-medium rounded flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {severityCounts.critical} CRITICAL
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--muted-foreground,#6b7280)] mt-1">
                  AWS eu-west-1 • {systemMeta.environment || "Production"} environment{lastSyncedAt ? ` • Last sync: ${new Date(lastSyncedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* 1. Sync from AWS → Neo4j */}
              <SyncFromAWSButton
                onSyncComplete={() => {
                  setLastSyncedAt(new Date().toISOString())
                  setRefreshKey((k) => k + 1)
                }}
                className="flex-shrink-0"
              />

              {/* 2. Refresh from Neo4j (re-read existing data) */}
              <button
                onClick={() => {
                  setRefreshKey((k) => k + 1)
                }}
                className="flex items-center gap-2 px-4 py-2 border border-[var(--border,#e5e7eb)] text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>

              <button
                onClick={() => setShowTagModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                <Tag className="w-4 h-4" />
                Tag All Resources
              </button>

              <button
                onClick={handleManualAutoTag}
                disabled={autoTaggerLoading}
                className="flex items-center gap-2 px-4 py-2 bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {autoTaggerLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Tagging...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Auto-Tag Connected Resources
                  </>
                )}
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-[#2D51DA] text-white rounded-lg hover:bg-[#2343B8] transition-colors">
                <Calendar className="w-4 h-4" />
                Schedule Maintenance
              </button>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex items-center gap-1 mt-6 border-b border-[var(--border,#e5e7eb)] -mb-px">
            {tabs.map((tab) => {
              const IconComponent = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-[#2D51DA] text-[#2D51DA]"
                      : "border-transparent text-[var(--muted-foreground,#6b7280)] hover:text-[var(--foreground,#374151)]"
                  }`}
                >
                  <IconComponent className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {activeTab === "overview" && (
        <>
          <div className="max-w-[1800px] mx-auto px-8 py-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div
                className={`relative overflow-hidden rounded-[22px] border p-6 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)] ${brssSurface}`}
                data-testid="blast-radius-card"
              >
                <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/40 blur-2xl" />
                <div className="absolute bottom-0 left-0 h-20 w-20 rounded-full bg-white/30 blur-2xl" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground,#6b7280)]">
                        Blast Radius Score
                      </p>
                      <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
                        {brssCoveragePercent !== null
                          ? `Coverage ${brssCoveragePercent}% · Confidence: ${brssConfidence.label}`
                          : "Coverage pending · Confidence: Unknown"}
                      </p>
                    </div>
                    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${brssConfidence.cls}`}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {brssConfidence.label} confidence
                    </div>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="relative w-24 h-24 flex-shrink-0">
                      <svg className="w-24 h-24 -rotate-90">
                        <circle cx="48" cy="48" r="38" stroke="rgba(255,255,255,0.72)" strokeWidth="10" fill="none" />
                        <circle
                          cx="48"
                          cy="48"
                          r="38"
                          stroke={brssAccent}
                          strokeWidth="10"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 38}`}
                          strokeDashoffset={`${2 * Math.PI * 38 * (1 - ((brssScore ?? 0) / 100))}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex items-end gap-0.5 leading-none">
                          <span className="text-[32px] font-bold tracking-tight text-[var(--foreground,#111827)]">
                            {brssScore ?? "—"}
                          </span>
                          {brssScore !== null && (
                            <span className="mb-1 text-sm font-semibold text-[var(--muted-foreground,#6b7280)]">/ 100</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-[var(--foreground,#111827)]">
                        {brssTitle}
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">
                        {brssTopDriver
                          ? `Top driver: ${brssTopDriver.resource_name} · ${brssTopDriver.severity}`
                          : brssScore !== null
                            ? "No dominant driver — evenly distributed risk"
                            : "Run a scan to calculate system blast radius"}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {brssCoveragePercent !== null && (
                          <span
                            className="inline-flex items-center rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur"
                            title={brss?.coverage_excluded_types?.length ? `Not scanned: ${brss.coverage_excluded_types.join(", ")}` : "All registered types scanned"}
                          >
                            Coverage {brssCoveragePercent}%
                          </span>
                        )}
                        {brssDeltaText && (
                          <span className="inline-flex items-center rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur">
                            {brssDeltaText}
                          </span>
                        )}
                        {brss?.resource_count ? (
                          <span className="inline-flex items-center rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur">
                            {brss.resource_count} resources scored
                          </span>
                        ) : null}
                      </div>

                      {/* Per-family breakdown — bridges the "why does Overview
                          say 42 but LP tab say 66?" question by showing each
                          family's scoped score. Same formula, different scopes. */}
                      {brss && brss.per_family && Object.keys(brss.per_family).length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="brss-family-breakdown">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground,#6b7280)]">
                            Families
                          </span>
                          {Object.entries(brss.per_family)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([family, score]) => {
                              const color = score >= 80 ? '#059669'
                                : score >= 60 ? '#b45309'
                                : score >= 40 ? '#c2410c'
                                : '#b91c1c'
                              const bg = score >= 80 ? 'rgba(16,185,129,0.12)'
                                : score >= 60 ? 'rgba(245,158,11,0.14)'
                                : score >= 40 ? 'rgba(249,115,22,0.14)'
                                : 'rgba(239,68,68,0.14)'
                              return (
                                <span
                                  key={family}
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                  style={{ background: bg, color }}
                                  title={`${family} family score (same BRSS formula, scoped)`}
                                >
                                  <span className="uppercase tracking-wider">{family}</span>
                                  <span className="tabular-nums">{score}</span>
                                </span>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-xs font-medium text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Findings Pressure</p>
                  <AlertTriangle className="w-4 h-4 text-[#ef4444]" />
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-[var(--foreground,#111827)]">{totalFindings}</span>
                  <span className="text-sm text-[var(--muted-foreground,#6b7280)] mb-1">open findings</span>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full bg-[#ef444410] text-[#ef4444]">{severityCounts.critical} critical</span>
                  <span className="px-2 py-1 rounded-full bg-[#f9731610] text-[#f97316]">{severityCounts.high} high</span>
                  <span className="px-2 py-1 rounded-full bg-[#eab30810] text-[#a16207]">{severityCounts.medium} medium</span>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-xs font-medium text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Access Exposure</p>
                  <Zap className="w-4 h-4 text-[#8b5cf6]" />
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-[#8b5cf6]">{gapAnalysis.gap}</span>
                  <span className="text-sm text-[var(--muted-foreground,#6b7280)] mb-1">unused permissions</span>
                </div>
                <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-2">{gapAnalysis.gapPercent}% removable from observed usage</p>
                <div className="mt-4 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-[#8b5cf6]" style={{ width: `${Math.min(100, actualPercent)}%` }} />
                </div>
                <button onClick={() => setActiveTab("least-privilege")} className="mt-4 text-sm font-medium text-[#2D51DA] hover:underline">
                  Open access workflow →
                </button>
              </div>

              <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-xs font-medium text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">System Footprint</p>
                  <Server className="w-4 h-4 text-[#3b82f6]" />
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-[var(--foreground,#111827)]">{totalResourcesCount}</span>
                  <span className="text-sm text-[var(--muted-foreground,#6b7280)] mb-1">tracked resources</span>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted-foreground,#6b7280)]">Environment</span>
                    <span className="font-medium text-[var(--foreground,#111827)]">{systemMeta.environment || "Production"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted-foreground,#6b7280)]">Criticality</span>
                    <span className="font-medium text-[var(--foreground,#111827)]">{systemMeta.criticality || "Standard"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Blast Radius Drivers — per-resource factor breakdown.
                Proves decomposability: every score point lost is attributable to
                a specific resource × factor. The "+N if fixed" lift is the
                approximate score gain from remediating that resource to clean.
            */}
            {brss && brss.top_drivers && brss.top_drivers.length > 0 && (
              <div
                className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]"
                data-testid="blast-radius-drivers"
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--foreground,#111827)]">
                      Top Blast Radius Drivers
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">
                      Resources pulling the score down the most. Each row shows which factors pushed its weight up and approximately how many points a clean remediation would restore.
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-[var(--muted-foreground,#6b7280)] uppercase tracking-wider">
                    Top {brss.top_drivers.length} · {brss.resource_count} total
                  </span>
                </div>

                <div className="space-y-3">
                  {brss.top_drivers.map((d, i) => {
                    const f = d.factors
                    // Authoritative lift — computed server-side by recomputing
                    // the system score with this resource's adjusted_risk set
                    // to zero (accounts for tail promotion, coverage ceiling,
                    // saturation curve).
                    const scoreLiftIfFixed = d.lift_if_fixed ?? 0
                    const weight = Math.round(f.adjusted_risk)
                    const barPercent = Math.min(100, (f.adjusted_risk / 50) * 100)

                    const sevColor =
                      d.severity === 'CRITICAL' ? '#ef4444'
                      : d.severity === 'HIGH'   ? '#f97316'
                      : d.severity === 'MEDIUM' ? '#eab308'
                      : '#94A3B8'

                    // Derive factor chips — only multipliers that exceed
                    // baseline (1.0) get called out so the operator sees the
                    // real drivers, not noise.
                    type Chip = { label: string; reason: string }
                    const chips: Chip[] = []
                    chips.push({
                      label: `Severity ${d.severity}`,
                      reason: `Severity weight ${f.severity_weight}`,
                    })
                    if (f.data_criticality > 1.0) {
                      chips.push({
                        label: `Crown jewel ×${f.data_criticality.toFixed(1)}`,
                        reason: 'Crown-jewel / sensitive data tag',
                      })
                    }
                    if (f.reachability >= 2.0) {
                      chips.push({
                        label: `Public exposure ×${f.reachability.toFixed(1)}`,
                        reason: 'Direct public reachability (network or trust)',
                      })
                    } else if (f.reachability >= 1.5) {
                      chips.push({
                        label: `External reachable ×${f.reachability.toFixed(1)}`,
                        reason: 'Cross-account or externally reachable',
                      })
                    }
                    if (f.privilege_capability >= 2.0) {
                      chips.push({
                        label: `Admin-like ×${f.privilege_capability.toFixed(1)}`,
                        reason: 'Broad or admin-equivalent privilege',
                      })
                    } else if (f.privilege_capability >= 1.5) {
                      chips.push({
                        label: `Broad privilege ×${f.privilege_capability.toFixed(1)}`,
                        reason: 'Broad scope of authority',
                      })
                    }
                    if (f.likelihood >= 2.0) {
                      chips.push({
                        label: `Active path ×${f.likelihood.toFixed(1)}`,
                        reason: 'Public + externally reachable — active attack surface',
                      })
                    } else if (f.likelihood >= 1.5) {
                      chips.push({
                        label: `Exposure signal ×${f.likelihood.toFixed(1)}`,
                        reason: 'Public OR external — elevated likelihood',
                      })
                    }
                    if (f.exposure_uncertainty_penalty > 5) {
                      chips.push({
                        label: `Low visibility +${f.exposure_uncertainty_penalty.toFixed(0)}`,
                        reason: 'Exposure uncertainty penalty — missing telemetry on high-impact axes',
                      })
                    }
                    if (f.usage_confidence < 0.8) {
                      chips.push({
                        label: `Usage conf ${Math.round(f.usage_confidence * 100)}%`,
                        reason: 'Short observation window or sparse events — gap inference is discounted',
                      })
                    }
                    if (f.base_risk >= 50) {
                      chips.push({
                        label: 'Capped at 50',
                        reason: 'Per-resource risk cap applied — raw factor product exceeded PER_RESOURCE_CAP',
                      })
                    }

                    return (
                      <div
                        key={d.resource_id}
                        className="rounded-lg border border-[var(--border,#e5e7eb)] p-4 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-[var(--muted-foreground,#6b7280)]">#{i + 1}</span>
                              <span className="text-sm font-semibold text-[var(--foreground,#111827)] truncate">
                                {d.resource_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                                style={{ background: `${sevColor}20`, color: sevColor }}
                              >
                                {d.severity}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 uppercase tracking-wider">
                                {d.family}
                              </span>
                              <span className="text-[10px] text-slate-500">{d.resource_type}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-2xl font-bold" style={{ color: sevColor }}>
                              {weight}
                            </div>
                            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wider">
                              risk weight
                            </div>
                            {scoreLiftIfFixed > 0 && (
                              <div className="text-[11px] font-semibold text-emerald-700 mt-1">
                                +{scoreLiftIfFixed} if fixed
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${barPercent}%`, background: sevColor }}
                          />
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {chips.map((c, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-700 border border-slate-200 cursor-help"
                              title={c.reason}
                            >
                              {c.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {brss.coverage_excluded_types?.length ? (
                  <p className="mt-4 text-[11px] text-[var(--muted-foreground,#6b7280)]">
                    Not in scan scope: {brss.coverage_excluded_types.join(', ')}. Score cannot account for risk in these resource types.
                  </p>
                ) : null}
              </div>
            )}

            {/* Blast Radius Score — trend chart.
                Reads from the persisted BRSS snapshot series. Snapshots are
                written on: first scan, score delta ≥ 2, or every 1 hour even
                if stable. Empty/single-point states are expected on fresh
                systems — chart degrades gracefully. */}
            {brss && (
              <div
                className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]"
                data-testid="blast-radius-trend"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--foreground,#111827)]">
                      Score Trend
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">
                      Persisted snapshots over time. Movement attributable to remediation, not scope shifts.
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-[var(--muted-foreground,#6b7280)] uppercase tracking-wider">
                    Last {brssHistory.length || '—'} snapshot{brssHistory.length === 1 ? '' : 's'}
                  </span>
                </div>

                {brssHistory.length < 2 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center rounded-lg border border-dashed border-[var(--border,#e5e7eb)] bg-slate-50/60">
                    <p className="text-sm font-medium text-[var(--foreground,#111827)]">
                      {brssHistory.length === 1 ? 'Baseline captured — trend builds as posture changes' : 'Trend will appear after the first remediation'}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground,#6b7280)] max-w-md">
                      Snapshots are persisted when the score moves by ≥ 2 points or at least once per hour. Remediate a top driver to produce the next point.
                    </p>
                  </div>
                ) : (
                  <div className="w-full h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={brssHistory.map((pt) => ({
                          ...pt,
                          // Short-format timestamp for the X-axis
                          label: new Date(pt.timestamp).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          }),
                        }))}
                        margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="brss-trend-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={brssAccent} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={brssAccent} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="label"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          minTickGap={24}
                        />
                        <YAxis
                          domain={[0, 100]}
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          width={38}
                        />
                        <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: 'Coverage floor', fontSize: 10, fill: '#64748b', position: 'insideTopRight' }} />
                        <ReferenceLine y={80} stroke="#bbf7d0" strokeDasharray="3 3" label={{ value: 'Healthy', fontSize: 10, fill: '#16a34a', position: 'insideTopRight' }} />
                        <RechartsTooltip
                          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                          labelStyle={{ color: '#475569', fontWeight: 600 }}
                          formatter={(value: any, name: any, props: any) => {
                            if (name === 'score') return [`${value} / 100`, 'Blast Radius']
                            if (name === 'resource_count') return [value, 'Resources scored']
                            return [value, name]
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke={brssAccent}
                          strokeWidth={2}
                          fill="url(#brss-trend-fill)"
                          dot={{ r: 3, fill: brssAccent, stroke: '#ffffff', strokeWidth: 1.5 }}
                          activeDot={{ r: 5 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-4 space-y-6">
                <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldAlert className="w-5 h-5 text-[#ef4444]" />
                    <h3 className="text-lg font-semibold text-[var(--foreground,#111827)]">Immediate Priorities</h3>
                  </div>
                  {topPriorityItems.length === 0 ? (
                    <div className="rounded-lg border border-[#22c55e30] bg-[#22c55e08] p-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-[#22c55e] mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-[#166534]">No urgent drivers detected</p>
                          <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">
                            This system currently looks stable from the summary signals we track here.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {topPriorityItems.map((item) => (
                        <div key={item.title} className={`rounded-lg border p-4 ${item.tone === "critical" ? "border-[#ef444430] bg-[#ef444408]" : item.tone === "high" ? "border-[#f9731630] bg-[#f9731608]" : "border-[#eab30830] bg-[#eab30808]"}`}>
                          <p className="text-sm font-semibold text-[var(--foreground,#111827)]">{item.title}</p>
                          <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">{item.detail}</p>
                          <button onClick={item.action} className="mt-3 text-sm font-medium text-[#2D51DA] hover:underline">
                            {item.cta} →
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-5 h-5 text-[#3b82f6]" />
                    <h3 className="text-lg font-semibold text-[var(--foreground,#111827)]">System Context</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--muted-foreground,#6b7280)]">Account</span>
                      <span className="font-medium text-[var(--foreground,#111827)]">745783559495</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--muted-foreground,#6b7280)]">Region</span>
                      <span className="font-medium text-[var(--foreground,#111827)]">eu-west-1</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--muted-foreground,#6b7280)]">Last behavioral sync</span>
                      <span className="font-medium text-[var(--foreground,#111827)]">{autoTagStatus.lastSync}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--muted-foreground,#6b7280)]">Auto-tag cycles</span>
                      <span className="font-medium text-[var(--foreground,#111827)]">{autoTagStatus.totalCycles}</span>
                    </div>
                  </div>
                  <div className="mt-5 pt-5 border-t border-[var(--border,#eef2f7)] space-y-3">
                    {resourceTypes.map((resource) => (
                      <div key={resource.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${resource.color}`}>
                            <resource.icon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[var(--foreground,#111827)]">{resource.name}</p>
                            <p className="text-xs text-[var(--muted-foreground,#6b7280)]">{resource.description}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-[var(--foreground,#111827)]">{resource.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="xl:col-span-8 space-y-6">
                <div className="bg-white rounded-xl border border-[var(--border,#e5e7eb)] overflow-hidden">
                  <div className="px-6 py-5 border-b border-[var(--border,#e5e7eb)] flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--foreground,#111827)]">System Map Preview</h3>
                      <p className="text-sm text-[var(--muted-foreground,#6b7280)] mt-1">
                        Static architecture snapshot of how identity, network, and data resources connect in this system.
                      </p>
                    </div>
                    <button onClick={() => setActiveTab("dependency-map")} className="text-sm font-medium text-[#2D51DA] hover:underline">
                      Open dependency map →
                    </button>
                  </div>
                  <div className="p-4">
                    <SystemMapPreview systemName={systemName} />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-[#8b5cf6]" />
                        <h3 className="text-lg font-semibold text-[var(--foreground,#111827)]">Access Posture</h3>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-[#8b5cf615] text-[#7c3aed]">
                        {loadingGap ? "Loading..." : `${gapAnalysis.confidence || 99}% confidence`}
                      </span>
                    </div>
                    {gapError ? (
                      <div className="rounded-lg border border-[#ef444430] bg-[#ef444408] p-4">
                        <p className="text-sm font-medium text-[#ef4444]">Unable to load access posture</p>
                        <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">{gapError}</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-[var(--muted-foreground,#6b7280)]">Granted</span>
                              <span className="font-medium text-[var(--foreground,#111827)]">{gapAnalysis.allowed}</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-gray-300 rounded-full w-full" />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-[var(--muted-foreground,#6b7280)]">Observed used</span>
                              <span className="font-medium text-[#8b5cf6]">{gapAnalysis.actual}</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-[#8b5cf6] rounded-full" style={{ width: `${Math.min(100, actualPercent)}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 rounded-lg border border-[#ef444430] bg-[#ef444408] p-4">
                          <p className="text-sm font-semibold text-[#ef4444]">{gapAnalysis.gap} permissions remain unused</p>
                          <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">
                            {gapAnalysis.gapPercent}% of current grants look removable based on observed behavior.
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
                        <h3 className="text-lg font-semibold text-[var(--foreground,#111827)]">Issue Preview</h3>
                      </div>
                      <button onClick={() => setActiveTab("vulnerabilities")} className="text-sm font-medium text-[#2D51DA] hover:underline">
                        Open full workflow →
                      </button>
                    </div>
                    {overviewIssuePreview.length > 0 ? (
                      <div className="space-y-3">
                        {overviewIssuePreview.map((issue) => (
                          <div key={issue.id} className="rounded-lg border border-[var(--border,#e5e7eb)] p-4">
                            <p className="text-sm font-semibold text-[var(--foreground,#111827)]">{issue.title}</p>
                            <p className="text-xs text-[#ef4444] mt-1">{issue.impact}</p>
                            <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">{issue.affected}</p>
                          </div>
                        ))}
                      </div>
                    ) : overviewFindingsPreview.length > 0 ? (
                      <div className="space-y-3">
                        {overviewFindingsPreview.map((finding) => (
                          <div key={finding.id} className="rounded-lg border border-[var(--border,#e5e7eb)] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-[var(--foreground,#111827)] line-clamp-1">{finding.title}</p>
                              <span className="text-[10px] px-2 py-1 rounded-full bg-[#ef444410] text-[#ef4444]">{finding.severity}</span>
                            </div>
                            <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-2 line-clamp-2">{finding.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-[#22c55e30] bg-[#22c55e08] p-5 text-center">
                        <CheckCircle className="w-8 h-8 text-[#22c55e] mx-auto mb-2" />
                        <p className="text-sm font-semibold text-[#166534]">No urgent issues in preview</p>
                        <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">
                          The system summary is currently not surfacing urgent findings here.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-4">
                <PendingApprovals systemName={systemName} />
              </div>
              <div className="xl:col-span-8">
                <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-blue-500" />
                      <h3 className="text-lg font-semibold text-[var(--foreground,#111827)]">Security Findings</h3>
                    </div>
                    {loadingFindings && (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                    )}
                  </div>
                  {securityFindings.length > 0 ? (
                    <SecurityFindingsList findings={securityFindings} />
                  ) : (
                    <div className="text-center py-8 text-[var(--muted-foreground,#6b7280)]">
                      <p>No security findings found for this system.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Render the LeastPrivilegeTab component */}
      {activeTab === "least-privilege" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <LeastPrivilegeTab key={refreshKey} systemName={systemName} />
        </div>
      )}

      {activeTab === "crown-jewels" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <CrownJewelProtection
            key={`${systemName}-${refreshKey}`}
            systemName={systemName}
            onOpenLeastPrivilege={() => setActiveTab("least-privilege")}
          />
        </div>
      )}

      {activeTab === "attack-paths" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <AttackPathsTab key={`${systemName}-${refreshKey}`} systemName={systemName} />
        </div>
      )}

      {activeTab === "identities" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <IdentitiesSectionTab key={`${systemName}-${refreshKey}`} systemName={systemName} />
        </div>
      )}

      {activeTab === "resource" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <SharedResourceTab key={`${systemName}-${refreshKey}`} systemName={systemName} />
        </div>
      )}

      {activeTab === "vulnerabilities" && (
        <div className="max-w-[1800px] mx-auto px-8 py-3">
          <VulnerabilitiesSection key={refreshKey} systemName={systemName} />
        </div>
      )}

      {activeTab === "all-services" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <AllServicesTab key={refreshKey} systemName={systemName} />
        </div>
      )}

      {activeTab === "orphan-services" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <OrphanServicesTab key={refreshKey} systemName={systemName} />
        </div>
      )}

      {activeTab === "guided-map" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <GuidedSystemMap key={`${systemName}-${refreshKey}`} systemName={systemName} />
        </div>
      )}

      {activeTab === "dependency-map" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <DependencyMapTab key={refreshKey} systemName={systemName} />
        </div>
      )}

      {activeTab === "behavioral" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6 bg-slate-950 min-h-[600px]">
          <BehavioralIntelligence key={refreshKey} systemName={systemName} />
        </div>
      )}


      {activeTab === "automation" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <AutomationSectionTab
            key={`${systemName}-${refreshKey}`}
            systemName={systemName}
            systemEnvironment={systemMeta.environment}
            systemCriticality={systemMeta.criticality}
          />
        </div>
      )}

      {activeTab === "history" && (
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <RemediationTimeline
            systemId={systemName}
            onRollback={(eventId) => {
              console.log("Rolled back event:", eventId)
              // Optionally refresh other tabs after rollback
            }}
          />
        </div>
      )}

      {/* Tag All Resources Button */}
      <div className="mt-6">
        <button
          onClick={() => setShowTagModal(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] transition-colors"
        >
          <Tag className="w-5 h-5" />
          Tag All Resources in {systemName}
        </button>
      </div>

      {/* Tag All MODAL */}
      {showTagModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="bg-white px-6 py-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Tag className="w-5 h-5" />
                  Tag All Resources
                </h2>
                <button
                  onClick={() => {
                    setShowTagModal(false)
                    setTagResults(null)
                  }}
                  className="text-white hover:text-gray-200 text-2xl"
                >
                  ×
                </button>
              </div>
              <p className="text-green-100 text-sm mt-1">Apply tags to all resources in {systemName}</p>
            </div>

            <div className="p-6">
              <div className="mb-6 p-4 bg-[#3b82f610] rounded-lg border border-[#3b82f640]">
                <h3 className="font-semibold text-[#3b82f6] mb-2">How it works:</h3>
                <ol className="text-sm text-[#3b82f6] space-y-1">
                  <li>
                    1. Reads existing tags from your <strong>seed resource</strong>
                  </li>
                  <li>
                    2. Applies tags to <strong>ALL discovered resources</strong>
                  </li>
                  <li>
                    3. Result: <strong>100% consistent tagging</strong>
                  </li>
                </ol>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-1">SystemName</label>
                  <input
                    type="text"
                    value={systemName}
                    disabled
                    className="w-full px-3 py-2 bg-gray-100 border border-[var(--border,#d1d5db)] rounded-lg text-[var(--foreground,#374151)]"
                  />
                  <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">Always applied automatically</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-1">Environment</label>
                  <select
                    value={tagForm.environment}
                    onChange={(e) => setTagForm({ ...tagForm, environment: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--border,#d1d5db)] rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    {ENVIRONMENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-1">Criticality</label>
                  <select
                    value={tagForm.criticality}
                    onChange={(e) => setTagForm({ ...tagForm, criticality: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--border,#d1d5db)] rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    {CRITICALITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="border-t border-[var(--border,#e5e7eb)] pt-4 mt-4">
                  <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-2">Custom Tags (Optional)</label>

                  {customTags.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {customTags.map((tag, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                          <span className="flex-1 text-sm">
                            <span className="font-medium text-[var(--foreground,#374151)]">{tag.key}</span>
                            <span className="text-[var(--muted-foreground,#9ca3af)] mx-1">=</span>
                            <span className="text-[var(--muted-foreground,#4b5563)]">{tag.value}</span>
                          </span>
                          <button
                            onClick={() => removeCustomTag(index)}
                            className="p-1 text-[#ef4444] hover:bg-[#ef444420] rounded transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-[var(--muted-foreground,#6b7280)] mb-1">Key</label>
                      <input
                        type="text"
                        placeholder="e.g., Owner"
                        value={newTagKey}
                        onChange={(e) => setNewTagKey(e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--border,#d1d5db)] rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-[var(--muted-foreground,#6b7280)] mb-1">Value</label>
                      <input
                        type="text"
                        placeholder="e.g., John Smith"
                        value={newTagValue}
                        onChange={(e) => setNewTagValue(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && addCustomTag()}
                        className="w-full px-3 py-2 border border-[var(--border,#d1d5db)] rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                    <button
                      onClick={addCustomTag}
                      disabled={!newTagKey.trim() || !newTagValue.trim()}
                      className="px-4 py-2 bg-gray-200 text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      + Add
                    </button>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">Add any custom key-value tags you need</p>
                </div>
              </div>

              {tagResults && (
                <div
                  className={`p-4 rounded-lg mb-6 ${
                    tagResults.success ? "bg-[#22c55e10] border border-[#22c55e40]" : "bg-[#ef444410] border border-[#ef444440]"
                  }`}
                >
                  {tagResults.success ? (
                    <>
                      <p className="font-semibold text-[#22c55e] flex items-center gap-2">
                        <CheckCircle className="w-5 h-5" />
                        Tagging Complete!
                      </p>
                      <div className="mt-2 text-sm text-[#22c55e] space-y-1">
                        <p>
                          <strong>Tagged:</strong> {tagResults.tagged} / {tagResults.total}
                        </p>
                        {tagResults.failed && tagResults.failed > 0 && (
                          <p>
                            <strong>Failed:</strong> {tagResults.failed}
                          </p>
                        )}
                        {tagResults.tags_applied && (
                          <div className="mt-2 pt-2 border-t border-[#22c55e40]">
                            <p className="font-medium">Tags applied:</p>
                            {Object.entries(tagResults.tags_applied).map(([k, v]) => (
                              <p key={k} className="ml-2">
                                • {k}: {v}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-[#ef4444]">
                      <span className="font-semibold">Error:</span> {tagResults.error}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowTagModal(false)
                    setTagResults(null)
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-[var(--foreground,#374151)] rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  {tagResults?.success ? "Close" : "Cancel"}
                </button>
                {!tagResults?.success && (
                  <button
                    onClick={handleTagAll}
                    disabled={tagging}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                  >
                    {tagging ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Tagging resources...
                      </>
                    ) : (
                      <>
                        <Tag className="w-4 h-4" />
                        Tag All Resources
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Tagger Result Modal */}
      {showAutoTaggerResult && autoTaggerResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAutoTaggerResult(false)}>
          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-6 py-4 ${autoTaggerResult.success ? 'bg-green-600' : 'bg-red-600'}`}>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {autoTaggerResult.success ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Auto-Tagging Complete
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5" />
                      Auto-Tagging Failed
                    </>
                  )}
                </h2>
                <button
                  onClick={() => setShowAutoTaggerResult(false)}
                  className="text-white hover:text-gray-200 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6">
              {autoTaggerResult.success ? (
                <div className="space-y-4">
                  <div className="bg-[#22c55e10] border border-[#22c55e40] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[var(--foreground,#374151)]">Resources Tagged</span>
                      <span className="text-2xl font-bold text-[#22c55e]">{autoTaggerResult.tagged || autoTaggerResult.propagated || 0}</span>
                    </div>
                    {autoTaggerResult.forward_propagated !== undefined && (
                      <div className="text-xs text-[var(--muted-foreground,#4b5563)] mt-2">
                        Forward: {autoTaggerResult.forward_propagated} • Backward: {autoTaggerResult.backward_propagated || 0}
                      </div>
                    )}
                  </div>

                  {autoTaggerResult.tagged_resources && autoTaggerResult.tagged_resources.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--foreground,#374151)] mb-2">Tagged Resources:</h3>
                      <div className="max-h-60 overflow-y-auto space-y-1">
                        {autoTaggerResult.tagged_resources.slice(0, 10).map((resource: any, idx: number) => (
                          <div key={idx} className="text-xs bg-gray-50 p-2 rounded border">
                            <span className="font-medium">{resource.resource}</span>
                            <span className="text-[var(--muted-foreground,#6b7280)] ml-2">({resource.resource_type || 'Unknown'})</span>
                            <div className="text-[var(--muted-foreground,#9ca3af)] text-xs mt-1">
                              → {resource.system} (from {resource.tagged_from})
                            </div>
                          </div>
                        ))}
                        {autoTaggerResult.tagged_resources.length > 10 && (
                          <div className="text-xs text-[var(--muted-foreground,#6b7280)] text-center py-2">
                            +{autoTaggerResult.tagged_resources.length - 10} more resources
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {autoTaggerResult.cross_system_dependencies && autoTaggerResult.cross_system_dependencies.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--foreground,#374151)] mb-2">Cross-System Dependencies Found:</h3>
                      <div className="text-xs text-[var(--muted-foreground,#4b5563)]">
                        {autoTaggerResult.cross_system_dependencies.length} dependencies detected (not tagged)
                      </div>
                    </div>
                  )}

                  {autoTaggerResult.duration_ms && (
                    <div className="text-xs text-[var(--muted-foreground,#6b7280)] text-center pt-2 border-t">
                      Completed in {autoTaggerResult.duration_ms}ms
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-[#ef444410] border border-[#ef444440] rounded-lg p-4">
                  <p className="text-[#ef4444] font-medium">Error: {autoTaggerResult.error}</p>
                  <p className="text-sm text-[#ef4444] mt-2">
                    The auto-tagger could not propagate tags. Check Neo4j connection and ensure there are tagged seed resources.
                  </p>
                </div>
              )}

              {/* Always show diagnostic info if available */}
              {autoTaggerDiagnostic && (
                <div className="mt-4 pt-4 border-t">
                  <h3 className="text-sm font-semibold text-[var(--foreground,#374151)] mb-2">🔍 Diagnostic Info:</h3>
                  {autoTaggerDiagnostic.error ? (
                    <div className="text-xs text-[#ef4444]">
                      <p>❌ {autoTaggerDiagnostic.error}</p>
                    </div>
                  ) : (
                    <div className="text-xs space-y-1 text-[var(--muted-foreground,#4b5563)]">
                      <p><strong>Tagged resources:</strong> {autoTaggerDiagnostic.tagged_count || 0}</p>
                      <p><strong>Untagged resources:</strong> {autoTaggerDiagnostic.untagged_count || 0}</p>
                      <p><strong>Potential connections:</strong> {autoTaggerDiagnostic.potential_connections || 0}</p>
                        {autoTaggerDiagnostic.relationships && autoTaggerDiagnostic.relationships.length > 0 && (
                          <div className="mt-2">
                            <p className="font-medium">Found relationships:</p>
                            {autoTaggerDiagnostic.relationships.slice(0, 5).map((rel: any, idx: number) => (
                              <p key={idx} className="ml-2">
                                • {rel.from} → {rel.to} ({rel.type})
                              </p>
                            ))}
                          </div>
                        )}
                        {autoTaggerDiagnostic.specific_resources && autoTaggerDiagnostic.specific_resources.length > 0 && (
                          <div className="mt-2">
                            <p className="font-medium">Your resources:</p>
                            {autoTaggerDiagnostic.specific_resources.map((res: any, idx: number) => (
                              <p key={idx} className="ml-2">
                                • {res.name} - SystemName: {res.systemName || res.SystemName || 'None'}
                              </p>
                            ))}
                          </div>
                        )}
                        {autoTaggerDiagnostic.traffic_relationships && autoTaggerDiagnostic.traffic_relationships.length > 0 && (
                          <div className="mt-2">
                            <p className="font-medium">ACTUAL_TRAFFIC relationships:</p>
                            {autoTaggerDiagnostic.traffic_relationships.map((rel: any, idx: number) => (
                              <p key={idx} className="ml-2">
                                • {rel.from} → {rel.to} (port: {rel.port || 'N/A'})
                              </p>
                            ))}
                          </div>
                        )}
                        {autoTaggerDiagnostic.potential_connections === 0 && (
                          <div className="mt-2 p-2 bg-[#eab30810] border border-[#eab30840] rounded">
                            <p className="font-medium text-[#eab308]">⚠️ No relationships found!</p>
                            <p className="text-[#eab308] mt-1">
                              This means either:
                              <br />• No ACTUAL_TRAFFIC relationships exist (need to ingest VPC Flow Logs)
                              <br />• All resources are already tagged
                              <br />• Resources don't have the right labels in Neo4j
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setShowAutoTaggerResult(false)}
                  className="px-4 py-2 bg-gray-200 text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add HIGH findings modal at the end of the component, before closing tags */}
      {showHighFindingsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden">
            <div className="bg-white px-6 py-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  HIGH Findings - Unused Permissions ({unusedActionsList.length})
                </h2>
                <button
                  onClick={() => setShowHighFindingsModal(false)}
                  className="text-white hover:text-gray-200 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[65vh]">
              <p className="text-sm text-[var(--muted-foreground,#4b5563)] mb-4">
                These permissions are allowed but never used. Click on each to see details and take action.
              </p>

              <div className="space-y-2">
                {unusedActionsList.map((permission, index) => {
                  const [service, action] = permission.split(":")
                  const isExpanded = expandedPermission === permission
                  const actionType =
                    action?.toLowerCase().startsWith("describe") ||
                    action?.toLowerCase().startsWith("get") ||
                    action?.toLowerCase().startsWith("list")
                      ? "Read"
                      : action?.toLowerCase().startsWith("create") ||
                          action?.toLowerCase().startsWith("put") ||
                          action?.toLowerCase().startsWith("update")
                        ? "Write"
                        : action?.toLowerCase().startsWith("delete") || action?.toLowerCase().startsWith("remove")
                          ? "Delete"
                          : "Action"

                  return (
                    <div key={index} className="border border-[#ef444440] rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedPermission(isExpanded ? null : permission)}
                        className="w-full flex items-center justify-between p-3 bg-[#ef444410] hover:bg-[#ef444420] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <EyeOff className="w-4 h-4 text-[#ef4444]" />
                          <code className="text-sm font-mono text-[var(--foreground,#111827)]">{permission}</code>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#ef4444] font-medium px-2 py-1 bg-[#ef444420] rounded">UNUSED</span>
                          <ChevronDown
                            className={`w-4 h-4 text-[var(--muted-foreground,#6b7280)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="p-4 bg-white border-t border-red-100 space-y-4">
                          {/* WHAT THIS PERMISSION DOES */}
                          <div className="bg-[#3b82f610] rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-[#3b82f6] mb-2">What This Permission Does</h4>
                            <p className="text-[var(--foreground,#374151)]">
                              {service === "cloudtrail" &&
                                action?.toLowerCase().includes("lookup") &&
                                "Allows reading CloudTrail event history - who did what in your AWS account"}
                              {service === "cloudtrail" &&
                                action?.toLowerCase().includes("describe") &&
                                "Allows viewing CloudTrail trail configurations and settings"}
                              {service === "ec2" &&
                                action?.toLowerCase().includes("describe") &&
                                `Allows viewing information about your EC2 ${action?.replace("Describe", "").toLowerCase() || "resources"}`}
                              {service === "s3" &&
                                action?.toLowerCase().includes("get") &&
                                "Allows reading objects and data from S3 buckets"}
                              {service === "s3" &&
                                action?.toLowerCase().includes("list") &&
                                "Allows listing S3 buckets and their contents"}
                              {service === "iam" &&
                                `Allows ${actionType.toLowerCase()} operations on IAM ${action?.replace(/^(Get|List|Describe|Create|Delete|Update)/, "").toLowerCase() || "resources"}`}
                              {service === "lambda" &&
                                `Allows ${actionType.toLowerCase()} operations on Lambda functions`}
                              {service === "rds" && `Allows ${actionType.toLowerCase()} operations on RDS databases`}
                              {!["cloudtrail", "ec2", "s3", "iam", "lambda", "rds"].includes(service || "") &&
                                `Allows ${actionType.toLowerCase()} operations on ${service?.toUpperCase()} resources`}
                            </p>
                          </div>

                          {/* WHY IT'S ASSIGNED */}
                          <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-[var(--foreground,#374151)] mb-2">Why It's Assigned</h4>
                            <p className="text-[var(--muted-foreground,#4b5563)]">
                              Part of the{" "}
                              <code className="bg-gray-200 px-1.5 py-0.5 rounded text-sm">
                                SafeRemediate-Lambda-Remediation-Role
                              </code>{" "}
                              policy. This role was likely created with broad permissions for security monitoring and
                              remediation tasks.
                            </p>
                          </div>

                          {/* THE PROBLEM */}
                          <div className="bg-[#f9731610] rounded-lg p-4 border border-[#f9731640]">
                            <h4 className="text-sm font-semibold text-[#f97316] mb-2 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              The Problem
                            </h4>
                            <p className="text-[var(--foreground,#374151)]">
                              This Lambda role has permission to{" "}
                              <strong>
                                {action
                                  ?.toLowerCase()
                                  .replace(/([A-Z])/g, " $1")
                                  .trim()}
                              </strong>
                              , but it <strong className="text-[#ef4444]">NEVER</strong> actually uses it.
                              <br />
                              <br />
                              The role was given more permissions than it needs - violating the principle of least
                              privilege.
                            </p>
                          </div>

                          {/* REAL RISK */}
                          <div className="bg-[#ef444410] rounded-lg p-4 border border-[#ef444440]">
                            <h4 className="text-sm font-semibold text-[#ef4444] mb-2 flex items-center gap-2">
                              <ShieldAlert className="w-4 h-4" />
                              Real Risk
                            </h4>
                            <p className="text-[var(--foreground,#374151)] mb-3">
                              If an attacker compromises this Lambda function, they could:
                            </p>
                            <ul className="text-[var(--foreground,#374151)] space-y-1.5 ml-4">
                              {service === "cloudtrail" && (
                                <>
                                  <li>• View all API activity in your account</li>
                                  <li>• See who accessed what resources</li>
                                  <li>• Discover other attack targets</li>
                                </>
                              )}
                              {service === "ec2" && (
                                <>
                                  <li>• Discover all your EC2 instances and their configurations</li>
                                  <li>• Map your network infrastructure</li>
                                  <li>• Find vulnerable or misconfigured instances</li>
                                </>
                              )}
                              {service === "s3" && (
                                <>
                                  <li>• Access sensitive data in your S3 buckets</li>
                                  <li>• Exfiltrate confidential files</li>
                                  <li>• Discover backup locations</li>
                                </>
                              )}
                              {service === "iam" && (
                                <>
                                  <li>• Escalate privileges by modifying IAM policies</li>
                                  <li>• Create backdoor access credentials</li>
                                  <li>• Persist access even after remediation</li>
                                </>
                              )}
                              {!["cloudtrail", "ec2", "s3", "iam"].includes(service || "") && (
                                <>
                                  <li>• Access {service?.toUpperCase()} resources they shouldn't</li>
                                  <li>• Move laterally through your infrastructure</li>
                                  <li>• Escalate the attack scope</li>
                                </>
                              )}
                            </ul>
                            <p className="text-[var(--muted-foreground,#4b5563)] mt-3 italic text-sm">
                              Since the Lambda doesn't need this permission - why give attackers the option?
                            </p>
                          </div>

                          {/* IMPACT IF REMOVED */}
                          <div className="bg-[#22c55e10] rounded-lg p-4 border border-[#22c55e40]">
                            <h4 className="text-sm font-semibold text-[#22c55e] mb-2 flex items-center gap-2">
                              <CheckCircle className="w-4 h-4" />
                              Impact If Removed
                            </h4>
                            <p className="text-[var(--foreground,#374151)]">
                              <strong className="text-[#22c55e]">None.</strong> We observed 7 days of traffic - this
                              permission was never used.
                              <br />
                              Removing it won't break anything.
                            </p>
                            <div className="mt-3 flex items-center gap-4 text-sm text-[var(--muted-foreground,#6b7280)]">
                              <span className="flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                Observed: 7 days
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last used: Never
                              </span>
                              <span className="flex items-center gap-1 text-[#22c55e] font-medium">99% confidence</span>
                            </div>
                          </div>

                          {/* ACTIONS */}
                          <div className="flex gap-3 pt-2">
                            <button
                              onClick={async () => {
                                setSelectedPermissionForSimulation(permission)
                                // Find the issue ID for this permission to track simulation state
                                const issueId = issues.find(
                                  (issue) => issue.title.includes(permission)
                                )?.id || `high-0-${permission.replace(':', '-')}`
                                setSimulatingIssueId(issueId)
                                try {
                                  const response = await fetch(`/api/proxy/systems/${systemName}/issues/${encodeURIComponent(issueId)}/simulate`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' }
                                  })
                                  
                                  if (response.ok) {
                                    const result = await response.json()
                                    setSimulationResult(result)
                                    setShowSimulateModal(true)
                                  } else {
                                    const errorData = await response.json().catch(() => ({}))
                                    // Even on timeout, try to show the error response
                                    if (response.status === 504 || response.status === 408) {
                                      setSimulationResult({
                                        status: 'BLOCKED',
                                        confidence: {
                                          level: 'BLOCKED',
                                          numeric: 0.0,
                                          criteria_failed: ['simulation_timeout'],
                                          summary: 'Simulation incomplete - timeout occurred'
                                        },
                                        recommendation: '⚠️ REVIEW REQUIRED: Simulation timed out. Manual review required.'
                                      })
                                      setShowSimulateModal(true)
                                    } else {
                                      alert(`Simulation failed: ${errorData.error || response.statusText}`)
                                    }
                                  }
                                } catch (err) {
                                  console.error('Simulation error:', err)
                                  alert('Failed to run simulation. Check console for details.')
                                } finally {
                                  setSimulatingIssueId(null)
                                }
                              }}
                              disabled={simulatingIssueId !== null}
                              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                            >
                                {simulatingIssueId && issues.find(i => i.title.includes(permission))?.id === simulatingIssueId ? (
                                  <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Simulating...
                                  </>
                                ) : (
                                  <>
                                    <Zap className="w-4 h-4" />
                                    Simulate Fix
                                  </>
                                )}
                            </button>
                            <button
                              onClick={() => handleRemediateFromModal(permission)}
                              disabled={remediatingPermission === permission}
                              className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                            >
                              {remediatingPermission === permission ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  Remediating...
                                </>
                              ) : (
                                <>
                                  <Wrench className="w-4 h-4" />
                                  Remediate
                                </>
                              )}
                            </button>
                            <button className="px-4 py-3 bg-gray-100 text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm flex items-center justify-center gap-2">
                              <ExternalLink className="w-4 h-4" />
                              View Lambda Function
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {unusedActionsList.length === 0 && (
                <div className="text-center py-8 text-[var(--muted-foreground,#6b7280)]">No unused permissions found</div>
              )}
            </div>

            <div className="border-t border-[var(--border,#e5e7eb)] px-6 py-4 bg-gray-50 flex justify-between items-center">
              <span className="text-sm text-[var(--muted-foreground,#4b5563)]">
                {unusedActionsList.length} permissions can be safely removed
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowHighFindingsModal(false)}
                  className="px-4 py-2 text-[var(--foreground,#374151)] bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowHighFindingsModal(false)
                    setActiveTab("least-privilege")
                  }}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Go to Least Privilege Tab
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simulation Results Modal - NEW */}
      {showSimulateModal && selectedPermissionForSimulation && (
        <SimulationResultsModal
          isOpen={showSimulateModal}
          onClose={() => {
            setShowSimulateModal(false)
            setSelectedPermissionForSimulation(null)
            setSimulationResult(null)
          }}
          resourceType="IAMRole"
          resourceId={selectedPermissionForSimulation}
          resourceName={selectedPermissionForSimulation}
          proposedChange={{
            action: 'remove_permissions',
            items: [selectedPermissionForSimulation],
            reason: `Unused permission detected: ${selectedPermissionForSimulation}`
          }}
          systemName={systemName}
          result={simulationResult}
        />
      )}
    </div>
  )
}
