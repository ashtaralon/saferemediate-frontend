"use client"

import type React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import {
  Search,
  ChevronDown,
  ChevronRight,
  Server,
  Database,
  Cloud,
  Shield,
  Box,
  Layers,
  Network,
  HardDrive,
  Key,
  FileText,
  User,
  Eye,
  Activity,
  RefreshCw,
  Unplug,
  Trash2,
  Archive,
  AlertTriangle,
  Clock,
  Calendar,
  XCircle,
  BellOff,
  Filter,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Play,
  Pause,
  RotateCcw,
  X,
  CheckCircle2,
  Info,
  Loader2,
  History,
} from "lucide-react"

interface SecurityFactor {
  factor: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  detail: string
}

interface OrphanResource {
  id: string
  name: string
  type: string
  region: string
  status: string
  lastSeen: string
  lastUsedBy: string | null
  idleDays: number
  attachedResources: number
  riskLevel: "HIGH" | "MEDIUM" | "LOW"
  confidence: "HIGH" | "MEDIUM" | "LOW"
  recommendation: "DELETE" | "DECOMMISSION" | "REVIEW" | "ARCHIVE"
  recommendationReason: string
  estimatedMonthlyCost: number
  isSeasonal: boolean
  seasonalPattern: string | null
  nextExpectedRun: string | null
  properties: Record<string, any>
  securityRiskScore: number
  securityFactors: SecurityFactor[]
  isInternetFacing: boolean
  hasEncryption: boolean | null
  totalPermissions: number
}

interface OrphanSummary {
  total: number
  seasonalCount: number
  estimatedMonthlySavings: number
  highRisk: number
  mediumRisk: number
  lowRisk: number
}

interface QuarantineRecord {
  id: string
  resourceName: string
  resourceType: string
  systemName: string
  phase: string
  safetyScore: number
  safetyBreakdown: any
  configBackup: any
  initiatedBy: string
  createdAt: string
  updatedAt: string
  monitorStartedAt: string
  quarantinedAt: string
  deletedAt: string
  restoredAt: string
  history: Array<{ phase: string; timestamp: string; actor: string; note: string }>
}

interface SafetyScore {
  score: number
  breakdown: Record<string, { value: any; score: number; weight: number }>
  recommendation: "SAFE" | "CAUTION" | "RISKY"
  warnings: string[]
}

interface OrphanServicesTabProps {
  systemName: string
}

const SERVICE_ICONS: Record<string, React.ElementType> = {
  EC2: Server, EC2Instance: Server, Lambda: Cloud, LambdaFunction: Cloud,
  S3: HardDrive, S3Bucket: HardDrive, RDS: Database, RDSInstance: Database,
  DynamoDB: Database, DynamoDBTable: Database, ECS: Box, EKS: Box,
  VPC: Network, Subnet: Network,
  LoadBalancer: Layers, ALB: Layers, NLB: Layers, IAMRole: Key, IAMPolicy: FileText,
  IAMUser: User, SecurityGroup: Shield, CloudTrail: Eye, CloudWatch: Activity,
  SQSQueue: Layers, StepFunction: Activity, EventBridge: Activity,
  default: Box,
}

const SERVICE_COLORS: Record<string, string> = {
  EC2: "bg-[#f9731620] text-[#f97316]", EC2Instance: "bg-[#f9731620] text-[#f97316]",
  Lambda: "bg-[#f9731620] text-[#f97316]", LambdaFunction: "bg-[#f9731620] text-[#f97316]",
  S3: "bg-[#22c55e20] text-[#22c55e]", S3Bucket: "bg-[#22c55e20] text-[#22c55e]",
  RDS: "bg-[#3b82f620] text-[#3b82f6]", RDSInstance: "bg-[#3b82f620] text-[#3b82f6]",
  DynamoDB: "bg-[#8b5cf615] text-[#7c3aed]", DynamoDBTable: "bg-[#8b5cf615] text-[#7c3aed]",
  ECS: "bg-cyan-100 text-cyan-700", EKS: "bg-cyan-100 text-cyan-700",
  LoadBalancer: "bg-teal-100 text-teal-700", IAMRole: "bg-[#ef444420] text-[#ef4444]",
  IAMPolicy: "bg-[#ef444420] text-[#ef4444]", IAMUser: "bg-[#ef444420] text-[#ef4444]",
  SecurityGroup: "bg-pink-100 text-pink-700",
  SQSQueue: "bg-teal-100 text-teal-700", StepFunction: "bg-[#8b5cf615] text-[#7c3aed]",
  EventBridge: "bg-[#f9731620] text-[#f97316]",
  default: "bg-gray-100 text-[var(--foreground,#374151)]",
}

const COMPUTE_DATA_TYPES = [
  "EC2", "EC2Instance", "Lambda", "LambdaFunction", "RDS", "RDSInstance",
  "S3", "S3Bucket", "DynamoDB", "DynamoDBTable",
  "ECS", "EKS", "LoadBalancer", "ALB", "NLB", "ElasticIP", "NAT", "NATGateway",
  "SQSQueue", "StepFunction", "EventBridge",
]

const IDENTITY_SECURITY_TYPES = [
  "IAMRole", "IAMPolicy", "IAMUser", "SecurityGroup",
]

const RISK_COLORS = {
  HIGH: "bg-[#ef444420] text-[#ef4444] border-[#ef444440]",
  MEDIUM: "bg-[#f9731620] text-[#f97316] border-[#f9731640]",
  LOW: "bg-[#eab30820] text-[#eab308] border-[#eab30840]",
}

const CONFIDENCE_COLORS = {
  HIGH: "text-[#22c55e]",
  MEDIUM: "text-[#f97316]",
  LOW: "text-[#6b7280]",
}

const RECOMMENDATION_CONFIG = {
  DELETE: { icon: Trash2, color: "bg-[#ef4444] text-white", label: "Delete" },
  DECOMMISSION: { icon: XCircle, color: "bg-[#f97316] text-white", label: "Decommission" },
  REVIEW: { icon: Eye, color: "bg-[#3b82f6] text-white", label: "Review" },
  ARCHIVE: { icon: Archive, color: "bg-[#8b5cf6] text-white", label: "Archive" },
}

const PHASE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bgColor: string }> = {
  PRE_CHECK: { label: "Pre-Check", color: "text-[#3b82f6]", icon: ShieldAlert, bgColor: "bg-[#3b82f610]" },
  MONITOR: { label: "Monitoring", color: "text-[#f97316]", icon: Eye, bgColor: "bg-[#f9731610]" },
  QUARANTINE: { label: "Quarantined", color: "text-[#ef4444]", icon: ShieldOff, bgColor: "bg-[#ef444410]" },
  DELETED: { label: "Deleted", color: "text-[#6b7280]", icon: Trash2, bgColor: "bg-[#6b728010]" },
  RESTORED: { label: "Restored", color: "text-[#22c55e]", icon: CheckCircle2, bgColor: "bg-[#22c55e10]" },
}

export function OrphanServicesTab({ systemName }: OrphanServicesTabProps) {
  const [orphans, setOrphans] = useState<OrphanResource[]>([])
  const [seasonal, setSeasonal] = useState<OrphanResource[]>([])
  const [summary, setSummary] = useState<OrphanSummary>({ total: 0, seasonalCount: 0, estimatedMonthlySavings: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [riskFilter, setRiskFilter] = useState<string>("ALL")
  const [typeFilter, setTypeFilter] = useState<string>("ALL")
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["orphans", "seasonal"]))

  // Quarantine state
  const [quarantineRecords, setQuarantineRecords] = useState<QuarantineRecord[]>([])
  const [preCheckModal, setPreCheckModal] = useState<{ orphan: OrphanResource; safetyScore: SafetyScore | null; loading: boolean; error: string | null } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null) // record ID or orphan ID being acted on
  const [activityModal, setActivityModal] = useState<{ recordId: string; activity: any[]; loading: boolean } | null>(null)

  useEffect(() => {
    fetchOrphanServices()
    fetchQuarantineRecords()
  }, [systemName])

  const fetchOrphanServices = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/proxy/orphan-services/${encodeURIComponent(systemName)}`)
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`)
      const data = await response.json()
      setOrphans(data.orphans || [])
      setSeasonal(data.seasonal || [])
      setSummary(data.summary || { total: 0, seasonalCount: 0, estimatedMonthlySavings: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0 })
    } catch (err: any) {
      console.error("[OrphanServices] Fetch error:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchQuarantineRecords = async () => {
    try {
      const response = await fetch(`/api/proxy/quarantine/list/${encodeURIComponent(systemName)}`)
      if (response.ok) {
        const data = await response.json()
        setQuarantineRecords(data.records || [])
      }
    } catch (err) {
      console.error("[OrphanServices] Quarantine fetch error:", err)
    }
  }

  const getQuarantineStatus = useCallback((resourceName: string): QuarantineRecord | null => {
    return quarantineRecords.find(r =>
      r.resourceName === resourceName && !["DELETED", "RESTORED"].includes(r.phase)
    ) || null
  }, [quarantineRecords])

  // --- Pre-check ---
  const runPreCheck = async (orphan: OrphanResource) => {
    setPreCheckModal({ orphan, safetyScore: null, loading: true, error: null })
    try {
      const response = await fetch('/api/proxy/quarantine/pre-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceName: orphan.name,
          resourceType: orphan.type,
          systemName,
          idleDays: orphan.idleDays,
          connections: orphan.attachedResources,
          recentCloudTrailEvents: 0,
          recentFlowLogHits: 0,
        }),
      })
      if (!response.ok) {
        const errBody = await response.text()
        let errMsg = `Server error (${response.status})`
        try {
          const parsed = JSON.parse(errBody)
          errMsg = parsed.error || parsed.detail || errMsg
        } catch { /* use default */ }
        throw new Error(errMsg)
      }
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setPreCheckModal({
        orphan,
        safetyScore: data.safetyScore,
        loading: false,
        error: null,
      })
      // Store the record ID on the orphan for subsequent actions
      ;(orphan as any)._quarantineRecordId = data.recordId
      await fetchQuarantineRecords()
    } catch (err: any) {
      console.error("[PreCheck] Error:", err)
      setPreCheckModal({ orphan, safetyScore: null, loading: false, error: err.message || "Unknown error" })
    }
  }

  // --- Start Monitor ---
  const startMonitor = async (recordId: string) => {
    setActionLoading(recordId)
    try {
      const response = await fetch('/api/proxy/quarantine/start-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, actor: 'user' }),
      })
      if (!response.ok) throw new Error(`Start monitor failed: ${response.status}`)
      await fetchQuarantineRecords()
      setPreCheckModal(null)
    } catch (err: any) {
      console.error("[StartMonitor] Error:", err)
    } finally {
      setActionLoading(null)
    }
  }

  // --- Execute Quarantine ---
  const executeQuarantine = async (recordId: string) => {
    setActionLoading(recordId)
    try {
      const response = await fetch('/api/proxy/quarantine/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, actor: 'user' }),
      })
      if (!response.ok) throw new Error(`Execute quarantine failed: ${response.status}`)
      await fetchQuarantineRecords()
    } catch (err: any) {
      console.error("[ExecuteQuarantine] Error:", err)
    } finally {
      setActionLoading(null)
    }
  }

  // --- Restore ---
  const restoreResource = async (recordId: string) => {
    setActionLoading(recordId)
    try {
      const response = await fetch('/api/proxy/quarantine/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, actor: 'user' }),
      })
      if (!response.ok) throw new Error(`Restore failed: ${response.status}`)
      await fetchQuarantineRecords()
    } catch (err: any) {
      console.error("[Restore] Error:", err)
    } finally {
      setActionLoading(null)
    }
  }

  // --- Delete Resource ---
  const deleteNow = async (recordId: string) => {
    setActionLoading(recordId)
    try {
      const response = await fetch('/api/proxy/quarantine/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, actor: 'user', force: true }),
      })
      if (!response.ok) throw new Error(`Delete failed: ${response.status}`)
      await fetchQuarantineRecords()
    } catch (err: any) {
      console.error("[Delete] Error:", err)
    } finally {
      setActionLoading(null)
    }
  }

  // --- View Activity ---
  const viewActivity = async (recordId: string) => {
    setActivityModal({ recordId, activity: [], loading: true })
    try {
      const response = await fetch(`/api/proxy/quarantine/activity/${encodeURIComponent(recordId)}`)
      if (response.ok) {
        const data = await response.json()
        setActivityModal({ recordId, activity: data.activity || [], loading: false })
      }
    } catch (err) {
      console.error("[Activity] Error:", err)
      setActivityModal({ recordId, activity: [], loading: false })
    }
  }

  const filteredOrphans = useMemo(() => {
    return orphans.filter((o) => {
      if (dismissedIds.has(o.id)) return false
      if (riskFilter !== "ALL" && o.riskLevel !== riskFilter) return false
      if (typeFilter !== "ALL") {
        const typeUpper = o.type.toUpperCase()
        if (typeFilter === "COMPUTE" && !COMPUTE_DATA_TYPES.some(t => typeUpper.includes(t.toUpperCase()))) return false
        if (typeFilter === "IDENTITY" && !IDENTITY_SECURITY_TYPES.some(t => typeUpper.includes(t.toUpperCase()))) return false
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return o.name.toLowerCase().includes(q) || o.type.toLowerCase().includes(q) || o.region.toLowerCase().includes(q)
      }
      return true
    })
  }, [orphans, dismissedIds, riskFilter, typeFilter, searchQuery])

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const dismissOrphan = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id))
  }

  const formatDate = (iso: string) => {
    if (!iso || iso === "1970-01-01T00:00:00.000Z") return "Unknown"
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  }

  const formatDateTime = (iso: string) => {
    if (!iso) return "—"
    return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  const getIcon = (type: string) => SERVICE_ICONS[type] || SERVICE_ICONS.default
  const getColor = (type: string) => SERVICE_COLORS[type] || SERVICE_COLORS.default

  // --- Safety Score Gauge ---
  const SafetyGauge = ({ score, size = "lg" }: { score: number; size?: "sm" | "lg" }) => {
    const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f97316" : "#ef4444"
    const label = score >= 75 ? "Safe" : score >= 50 ? "Caution" : "Risky"
    const radius = size === "lg" ? 45 : 20
    const stroke = size === "lg" ? 8 : 4
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (score / 100) * circumference
    const viewSize = (radius + stroke) * 2

    return (
      <div className="flex flex-col items-center gap-1">
        <svg width={viewSize} height={viewSize} className="transform -rotate-90">
          <circle cx={radius + stroke} cy={radius + stroke} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
          <circle cx={radius + stroke} cy={radius + stroke} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-500" />
        </svg>
        <div className="absolute flex flex-col items-center" style={{ marginTop: size === "lg" ? radius - 8 : radius - 4 }}>
          <span className={`${size === "lg" ? "text-2xl" : "text-sm"} font-bold`} style={{ color }}>{score}</span>
        </div>
        {size === "lg" && <span className="text-xs font-medium" style={{ color }}>{label}</span>}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-[#8b5cf6] animate-spin" />
        <span className="ml-3 text-slate-600">Scanning for orphan services...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] bg-red-50 rounded-xl">
        <AlertTriangle className="w-10 h-10 text-[#ef4444] mb-3" />
        <p className="text-[#ef4444] font-medium">Failed to load orphan services</p>
        <p className="text-sm text-[var(--muted-foreground,#6b7280)] mt-1">{error}</p>
        <button onClick={fetchOrphanServices} className="mt-4 px-4 py-2 bg-[#8b5cf6] text-white rounded-lg text-sm hover:bg-[#7c3aed] transition-colors">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats Bar */}
      <div className="bg-gray-50 rounded-xl p-5 border border-[var(--border,#e5e7eb)]">
        <div className="flex gap-3 w-[30%] min-w-[420px]">
          <div className="flex-1 bg-white rounded-lg p-3 border border-[var(--border,#e5e7eb)] text-center">
            <Unplug className="w-4 h-4 mx-auto mb-1 text-[#8b5cf6]" />
            <div className="text-lg font-bold text-[var(--foreground,#111827)]">{summary.total}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Orphans</div>
          </div>
          <div className="flex-1 bg-white rounded-lg p-3 border border-[#f9731640] text-center">
            <ShieldOff className="w-4 h-4 mx-auto mb-1 text-[#f97316]" />
            <div className="text-lg font-bold text-[#f97316]">{summary.mediumRisk}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Medium Risk</div>
          </div>
          <div className="flex-1 bg-white rounded-lg p-3 border border-[#ef444440] text-center">
            <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-[#ef4444]" />
            <div className="text-lg font-bold text-[#ef4444]">{summary.highRisk}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">High Risk</div>
          </div>
          <div className="flex-1 bg-white rounded-lg p-3 border border-[#3b82f640] text-center">
            <ShieldAlert className="w-4 h-4 mx-auto mb-1 text-[#3b82f6]" />
            <div className="text-lg font-bold text-[#3b82f6]">{quarantineRecords.filter(r => r.phase === "QUARANTINE" || r.phase === "MONITOR").length}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">In Quarantine</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground,#9ca3af)]" />
          <input
            type="text"
            placeholder="Search orphan services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border,#e5e7eb)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#8b5cf620] focus:border-[#8b5cf6]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[var(--muted-foreground,#6b7280)]" />
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="text-sm border border-[var(--border,#e5e7eb)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#8b5cf620]"
          >
            <option value="ALL">All Risk Levels</option>
            <option value="HIGH">High Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="LOW">Low Risk</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-sm border border-[var(--border,#e5e7eb)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#8b5cf620]"
          >
            <option value="ALL">All Types</option>
            <option value="COMPUTE">Compute & Data</option>
            <option value="IDENTITY">Identity & Security</option>
          </select>
        </div>
        <button
          onClick={() => { fetchOrphanServices(); fetchQuarantineRecords() }}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Rescan
        </button>
      </div>

      {/* Orphan Services Section */}
      <div className="bg-white rounded-xl border border-[var(--border,#e5e7eb)] overflow-hidden">
        <button
          onClick={() => toggleSection("orphans")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            {expandedSections.has("orphans") ? <ChevronDown className="w-5 h-5 text-[var(--muted-foreground,#6b7280)]" /> : <ChevronRight className="w-5 h-5 text-[var(--muted-foreground,#6b7280)]" />}
            <Unplug className="w-5 h-5 text-[#ef4444]" />
            <span className="font-semibold text-[var(--foreground,#111827)]">Orphan Services</span>
            <span className="text-sm text-[var(--muted-foreground,#6b7280)]">({filteredOrphans.length})</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground,#6b7280)]">
            <ShieldAlert className="w-4 h-4 text-[#f97316]" />
            {summary.highRisk} high · {summary.mediumRisk} medium · {summary.lowRisk} low risk
          </div>
        </button>

        {expandedSections.has("orphans") && (
          <div className="border-t border-[var(--border,#e5e7eb)]">
            {filteredOrphans.length === 0 ? (
              <div className="p-8 text-center text-[var(--muted-foreground,#6b7280)]">
                <Unplug className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No orphan services found</p>
                <p className="text-sm mt-1">All services in this system are actively connected</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border,#e5e7eb)]">
                {filteredOrphans.map((orphan) => {
                  const Icon = getIcon(orphan.type)
                  const colorClass = getColor(orphan.type)
                  const riskClass = RISK_COLORS[orphan.riskLevel]
                  const recConfig = RECOMMENDATION_CONFIG[orphan.recommendation]
                  const RecIcon = recConfig.icon
                  const isExpanded = expandedCards.has(orphan.id)
                  const qRecord = getQuarantineStatus(orphan.name)
                  const qPhase = qRecord ? PHASE_CONFIG[qRecord.phase] : null

                  return (
                    <div key={orphan.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Card Header */}
                      <div
                        className="flex items-center gap-4 p-4 cursor-pointer"
                        onClick={() => toggleCard(orphan.id)}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--foreground,#111827)] truncate">{orphan.name}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-[var(--muted-foreground,#6b7280)]">{orphan.type}</span>
                            {qPhase && (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${qPhase.bgColor} ${qPhase.color} flex items-center gap-1`}>
                                <qPhase.icon className="w-3 h-3" />
                                {qPhase.label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--muted-foreground,#6b7280)]">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{orphan.lastSeen ? `${orphan.idleDays}d idle` : `${orphan.idleDays}d idle (no activity ever)`}</span>
                            <span>{orphan.region}</span>
                            {orphan.lastUsedBy && <span>Last used by: {orphan.lastUsedBy}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {orphan.isInternetFacing && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#ef444415] text-[#ef4444] border border-[#ef444430] flex items-center gap-1">
                              <Network className="w-3 h-3" />Internet
                            </span>
                          )}
                          {orphan.securityFactors?.some(f => f.severity === 'CRITICAL') && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#ef444415] text-[#ef4444] border border-[#ef444430] flex items-center gap-1">
                              <ShieldOff className="w-3 h-3" />Critical
                            </span>
                          )}
                          {orphan.estimatedMonthlyCost > 0 && (
                            <span className="text-xs font-medium text-[#22c55e] bg-[#22c55e10] px-2 py-1 rounded">
                              ${orphan.estimatedMonthlyCost}/mo
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${riskClass}`}>
                            {orphan.riskLevel}
                          </span>
                          <span className={`text-xs font-medium px-2 py-1 rounded ${recConfig.color}`}>
                            <RecIcon className="w-3 h-3 inline mr-1" />
                            {recConfig.label}
                          </span>
                        </div>
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--muted-foreground,#6b7280)]" /> : <ChevronRight className="w-4 h-4 text-[var(--muted-foreground,#6b7280)]" />}
                      </div>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="px-4 pb-4 ml-[52px]">
                          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                            {/* Detail Grid */}
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Last Active</div>
                                <div className={`font-medium ${orphan.lastSeen ? 'text-[var(--foreground,#111827)]' : 'text-[#ef4444]'}`}>{orphan.lastSeen ? formatDate(orphan.lastSeen) : 'No activity detected'}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Idle Duration</div>
                                <div className="font-medium text-[var(--foreground,#111827)]">{orphan.lastSeen ? `${orphan.idleDays} days since last activity` : 'No activity ever recorded'}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Connections</div>
                                <div className={`font-medium ${orphan.attachedResources === 0 ? 'text-[#ef4444]' : 'text-[var(--foreground,#111827)]'}`}>{orphan.attachedResources === 0 ? 'None — completely isolated' : `${orphan.attachedResources} ${orphan.attachedResources === 1 ? 'resource' : 'resources'}`}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Evidence Sources</div>
                                <div className="font-medium text-[var(--foreground,#111827)]">{orphan.lastSeen ? 'CloudTrail · Flow Logs · Access Advisor' : 'No evidence found in any source'}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Confidence</div>
                                <div className={`font-medium ${CONFIDENCE_COLORS[orphan.confidence]}`}>{orphan.confidence} — {!orphan.lastSeen ? 'No activity across any evidence plane' : orphan.idleDays >= 180 ? `${Math.floor(orphan.idleDays / 30)}+ months since last activity` : `${orphan.idleDays} days since last observed activity`}</div>
                              </div>
                            </div>

                            {/* Security Risk Factors */}
                            {orphan.securityFactors && orphan.securityFactors.length > 0 && (
                              <div className="bg-white rounded-lg p-3 border border-[var(--border,#e5e7eb)]">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-xs font-semibold text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide flex items-center gap-1.5">
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                    Security Risk Factors
                                  </h4>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                    orphan.securityRiskScore >= 50 ? 'bg-[#ef444420] text-[#ef4444]' :
                                    orphan.securityRiskScore >= 25 ? 'bg-[#f9731620] text-[#f97316]' :
                                    'bg-[#eab30820] text-[#eab308]'
                                  }`}>
                                    Risk Score: {orphan.securityRiskScore}/100
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  {orphan.securityFactors.map((factor, i) => (
                                    <div key={i} className={`flex items-start gap-2 text-xs p-1.5 rounded ${
                                      factor.severity === 'CRITICAL' ? 'bg-[#ef444408]' :
                                      factor.severity === 'HIGH' ? 'bg-[#f9731608]' :
                                      'bg-[#eab30808]'
                                    }`}>
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                        factor.severity === 'CRITICAL' ? 'bg-[#ef4444] text-white' :
                                        factor.severity === 'HIGH' ? 'bg-[#f97316] text-white' :
                                        'bg-[#eab308] text-white'
                                      }`}>{factor.severity}</span>
                                      <span className="text-[var(--foreground,#111827)]">{factor.detail}</span>
                                    </div>
                                  ))}
                                </div>
                                {orphan.hasEncryption === false && (
                                  <div className="mt-2 flex items-center gap-1.5 text-xs text-[#f97316]">
                                    <ShieldOff className="w-3 h-3" />
                                    No encryption at rest detected
                                  </div>
                                )}
                                {orphan.hasEncryption === true && (
                                  <div className="mt-2 flex items-center gap-1.5 text-xs text-[#22c55e]">
                                    <ShieldCheck className="w-3 h-3" />
                                    Encryption at rest enabled
                                  </div>
                                )}
                              </div>
                            )}

                            {/* No security factors - show clean status */}
                            {(!orphan.securityFactors || orphan.securityFactors.length === 0) && orphan.securityRiskScore === 0 && (
                              <div className="bg-white rounded-lg p-3 border border-[var(--border,#e5e7eb)]">
                                <div className="flex items-center gap-2 text-xs text-[#22c55e]">
                                  <ShieldCheck className="w-4 h-4" />
                                  <span className="font-medium">No security exposure detected</span>
                                  <span className="text-[var(--muted-foreground,#6b7280)]">— not internet-facing, no public SGs, permissions within bounds</span>
                                </div>
                              </div>
                            )}

                            {/* Recommendation */}
                            <div className="bg-white rounded-lg p-3 border border-[var(--border,#e5e7eb)]">
                              <div className="flex items-start gap-2">
                                <RecIcon className={`w-4 h-4 mt-0.5 ${orphan.recommendation === 'DELETE' ? 'text-[#ef4444]' : orphan.recommendation === 'DECOMMISSION' ? 'text-[#f97316]' : 'text-[#3b82f6]'}`} />
                                <div>
                                  <div className="text-sm font-medium text-[var(--foreground,#111827)]">Recommendation: {recConfig.label}</div>
                                  <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">{orphan.recommendationReason}</p>
                                </div>
                              </div>
                            </div>

                            {/* Quarantine Actions — Phase-Aware */}
                            <div className="flex items-center gap-2 pt-1">
                              {!qRecord ? (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); runPreCheck(orphan) }}
                                    disabled={actionLoading === orphan.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] transition-colors disabled:opacity-50"
                                  >
                                    {actionLoading === orphan.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />}
                                    Start Quarantine
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); dismissOrphan(orphan.id) }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-100 transition-colors text-[var(--muted-foreground,#6b7280)]"
                                  >
                                    <BellOff className="w-3 h-3" />
                                    Dismiss
                                  </button>
                                </>
                              ) : qRecord.phase === "PRE_CHECK" || qRecord.phase === "MONITOR" ? (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); executeQuarantine(qRecord.id) }}
                                    disabled={actionLoading === qRecord.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#f97316] text-white rounded-lg hover:bg-[#ea580c] transition-colors disabled:opacity-50"
                                  >
                                    {actionLoading === qRecord.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldOff className="w-3 h-3" />}
                                    Quarantine
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); deleteNow(qRecord.id) }}
                                    disabled={actionLoading === qRecord.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#ef4444] text-white rounded-lg hover:bg-[#dc2626] transition-colors disabled:opacity-50"
                                  >
                                    {actionLoading === qRecord.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    Delete Now
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); restoreResource(qRecord.id) }}
                                    disabled={actionLoading === qRecord.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-100 transition-colors text-[var(--muted-foreground,#6b7280)]"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Cancel
                                  </button>
                                </>
                              ) : qRecord.phase === "QUARANTINE" ? (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); restoreResource(qRecord.id) }}
                                    disabled={actionLoading === qRecord.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#22c55e] text-white rounded-lg hover:bg-[#16a34a] transition-colors disabled:opacity-50"
                                  >
                                    {actionLoading === qRecord.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                    Restore
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); deleteNow(qRecord.id) }}
                                    disabled={actionLoading === qRecord.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#ef4444] text-white rounded-lg hover:bg-[#dc2626] transition-colors disabled:opacity-50"
                                  >
                                    {actionLoading === qRecord.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    Delete Now
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); viewActivity(qRecord.id) }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-100 transition-colors text-[var(--muted-foreground,#6b7280)]"
                                  >
                                    <History className="w-3 h-3" />
                                    Activity Log
                                  </button>
                                  <span className="text-[10px] text-[#ef4444] ml-1">
                                    Quarantined {formatDate(qRecord.quarantinedAt)} — config backed up
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Seasonal Services Section */}
      {seasonal.length > 0 && (
        <div className="bg-white rounded-xl border border-[var(--border,#e5e7eb)] overflow-hidden">
          <button
            onClick={() => toggleSection("seasonal")}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              {expandedSections.has("seasonal") ? <ChevronDown className="w-5 h-5 text-[var(--muted-foreground,#6b7280)]" /> : <ChevronRight className="w-5 h-5 text-[var(--muted-foreground,#6b7280)]" />}
              <Calendar className="w-5 h-5 text-[#3b82f6]" />
              <span className="font-semibold text-[var(--foreground,#111827)]">Seasonal Services</span>
              <span className="text-sm text-[var(--muted-foreground,#6b7280)]">({seasonal.length})</span>
            </div>
            <span className="text-xs text-[#3b82f6] bg-[#3b82f610] px-2 py-1 rounded">Periodic usage pattern detected</span>
          </button>

          {expandedSections.has("seasonal") && (
            <div className="border-t border-[var(--border,#e5e7eb)] divide-y divide-[var(--border,#e5e7eb)]">
              {seasonal.map((svc) => {
                const Icon = getIcon(svc.type)
                const colorClass = getColor(svc.type)
                return (
                  <div key={svc.id} className="flex items-center gap-4 p-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--foreground,#111827)] truncate">{svc.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-[var(--muted-foreground,#6b7280)]">{svc.type}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--muted-foreground,#6b7280)]">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{svc.seasonalPattern}</span>
                        <span>Last active: {formatDate(svc.lastSeen)}</span>
                        {svc.nextExpectedRun && <span className="text-[#3b82f6]">Next: {formatDate(svc.nextExpectedRun)}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-[#3b82f6] bg-[#3b82f610] px-2 py-1 rounded font-medium">
                      {svc.seasonalPattern}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ======= PRE-CHECK MODAL ======= */}
      {preCheckModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreCheckModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--border,#e5e7eb)]">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-[#8b5cf6]" />
                <div>
                  <h3 className="font-semibold text-[var(--foreground,#111827)]">Quarantine Safety Check</h3>
                  <p className="text-xs text-[var(--muted-foreground,#6b7280)]">{preCheckModal.orphan.name}</p>
                </div>
              </div>
              <button onClick={() => setPreCheckModal(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-[var(--muted-foreground,#6b7280)]" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-5">
              {preCheckModal.loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-10 h-10 text-[#8b5cf6] animate-spin mb-3" />
                  <p className="text-sm text-[var(--muted-foreground,#6b7280)]">Running safety analysis...</p>
                </div>
              ) : preCheckModal.safetyScore ? (
                <>
                  {/* Safety Score Gauge */}
                  <div className="flex items-center justify-center py-4 relative">
                    <SafetyGauge score={preCheckModal.safetyScore.score} />
                  </div>

                  <div className="text-center">
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                      preCheckModal.safetyScore.recommendation === "SAFE" ? "bg-[#22c55e20] text-[#22c55e]" :
                      preCheckModal.safetyScore.recommendation === "CAUTION" ? "bg-[#f9731620] text-[#f97316]" :
                      "bg-[#ef444420] text-[#ef4444]"
                    }`}>
                      {preCheckModal.safetyScore.recommendation === "SAFE" ? "Safe to Quarantine" :
                       preCheckModal.safetyScore.recommendation === "CAUTION" ? "Proceed with Caution" :
                       "High Risk — Review Carefully"}
                    </span>
                  </div>

                  {/* Score Breakdown */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Score Breakdown</h4>
                    {Object.entries(preCheckModal.safetyScore.breakdown).map(([key, data]) => (
                      <div key={key} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-[var(--foreground,#111827)] capitalize">{key.replace(/_/g, ' ')}</span>
                            <span className="text-[var(--muted-foreground,#6b7280)]">{data.score}/100 ({Math.round(data.weight * 100)}% weight)</span>
                          </div>
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                data.score >= 70 ? "bg-[#22c55e]" : data.score >= 40 ? "bg-[#f97316]" : "bg-[#ef4444]"
                              }`}
                              style={{ width: `${data.score}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Warnings */}
                  {preCheckModal.safetyScore.warnings.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Warnings</h4>
                      {preCheckModal.safetyScore.warnings.map((warning, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-[#f9731610] rounded-lg">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#f97316] mt-0.5 shrink-0" />
                          <span className="text-xs text-[#f97316]">{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action Description */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <h4 className="text-xs font-semibold text-[var(--foreground,#111827)]">Choose an action</h4>
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-2 text-xs text-[var(--muted-foreground,#6b7280)]">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#f9731620] text-[#f97316] text-[10px] font-bold shrink-0">1</span>
                        <span><strong>Quarantine</strong> — Access blocked (EC2 stopped, IAM deny-all, SG rules revoked). Config backed up. Restore available anytime.</span>
                      </div>
                      <div className="flex items-start gap-2 text-xs text-[var(--muted-foreground,#6b7280)]">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#ef444420] text-[#ef4444] text-[10px] font-bold shrink-0">2</span>
                        <span><strong>Delete Now</strong> — Permanently removed from AWS. This cannot be undone.</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="w-10 h-10 text-[#ef4444] mx-auto mb-3" />
                  <p className="text-sm font-medium text-[#ef4444] mb-2">Safety check failed</p>
                  {preCheckModal.error && (
                    <p className="text-xs text-[var(--muted-foreground,#6b7280)] mb-4 px-4 py-2 bg-[#ef444410] rounded-lg mx-4">
                      {preCheckModal.error}
                    </p>
                  )}
                  <button
                    onClick={() => runPreCheck(preCheckModal.orphan)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            {!preCheckModal.loading && preCheckModal.safetyScore && (
              <div className="flex items-center justify-end gap-2 p-5 border-t border-[var(--border,#e5e7eb)]">
                <button
                  onClick={() => setPreCheckModal(null)}
                  className="px-4 py-2 text-sm border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-50 transition-colors text-[var(--muted-foreground,#6b7280)]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const qr = getQuarantineStatus(preCheckModal.orphan.name)
                    if (qr) { executeQuarantine(qr.id); setPreCheckModal(null) }
                  }}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-[#f97316] text-white rounded-lg hover:bg-[#ea580c] transition-colors disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                  Quarantine
                </button>
                <button
                  onClick={() => {
                    const qr = getQuarantineStatus(preCheckModal.orphan.name)
                    if (qr) { deleteNow(qr.id); setPreCheckModal(null) }
                  }}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-[#ef4444] text-white rounded-lg hover:bg-[#dc2626] transition-colors disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete Now
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======= ACTIVITY LOG MODAL ======= */}
      {activityModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setActivityModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[var(--border,#e5e7eb)]">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-[#8b5cf6]" />
                <h3 className="font-semibold text-[var(--foreground,#111827)]">Activity Log</h3>
              </div>
              <button onClick={() => setActivityModal(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-[var(--muted-foreground,#6b7280)]" />
              </button>
            </div>
            <div className="p-5">
              {activityModal.loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
                </div>
              ) : activityModal.activity.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground,#6b7280)] text-center py-4">No activity recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {activityModal.activity.map((entry, i) => {
                    const pc = PHASE_CONFIG[entry.phase] || PHASE_CONFIG.PRE_CHECK
                    const PhaseIcon = pc.icon
                    return (
                      <div key={i} className="flex items-start gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${pc.bgColor}`}>
                          <PhaseIcon className={`w-3.5 h-3.5 ${pc.color}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold ${pc.color}`}>{pc.label}</span>
                            <span className="text-[10px] text-[var(--muted-foreground,#6b7280)]">{formatDateTime(entry.timestamp)}</span>
                          </div>
                          <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-0.5">{entry.note}</p>
                          <p className="text-[10px] text-[var(--muted-foreground,#9ca3af)] mt-0.5">by {entry.actor}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
