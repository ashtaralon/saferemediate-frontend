"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
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
  DollarSign,
  Calendar,
  XCircle,
  BellOff,
  Filter,
  TrendingDown,
} from "lucide-react"

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
}

interface OrphanSummary {
  total: number
  seasonalCount: number
  estimatedMonthlySavings: number
  highRisk: number
  mediumRisk: number
  lowRisk: number
}

interface OrphanServicesTabProps {
  systemName: string
}

const SERVICE_ICONS: Record<string, React.ElementType> = {
  EC2: Server, Lambda: Cloud, LambdaFunction: Cloud, S3: HardDrive, RDS: Database,
  DynamoDB: Database, ECS: Box, EKS: Box, VPC: Network, Subnet: Network,
  LoadBalancer: Layers, ALB: Layers, NLB: Layers, IAMRole: Key, IAMPolicy: FileText,
  IAMUser: User, SecurityGroup: Shield, CloudTrail: Eye, CloudWatch: Activity,
  default: Box,
}

const SERVICE_COLORS: Record<string, string> = {
  EC2: "bg-[#f9731620] text-[#f97316]", Lambda: "bg-[#f9731620] text-[#f97316]",
  LambdaFunction: "bg-[#f9731620] text-[#f97316]", S3: "bg-[#22c55e20] text-[#22c55e]",
  RDS: "bg-[#3b82f620] text-[#3b82f6]", DynamoDB: "bg-[#8b5cf615] text-[#7c3aed]",
  ECS: "bg-cyan-100 text-cyan-700", EKS: "bg-cyan-100 text-cyan-700",
  LoadBalancer: "bg-teal-100 text-teal-700", IAMRole: "bg-[#ef444420] text-[#ef4444]",
  IAMPolicy: "bg-[#ef444420] text-[#ef4444]", IAMUser: "bg-[#ef444420] text-[#ef4444]",
  SecurityGroup: "bg-pink-100 text-pink-700", default: "bg-gray-100 text-[var(--foreground,#374151)]",
}

const COMPUTE_DATA_TYPES = [
  "EC2", "Lambda", "LambdaFunction", "RDS", "S3", "DynamoDB",
  "ECS", "EKS", "LoadBalancer", "ALB", "NLB", "ElasticIP", "NAT", "NATGateway",
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
  const [showSeasonal, setShowSeasonal] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["orphans", "seasonal"]))

  useEffect(() => {
    fetchOrphanServices()
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

  const getIcon = (type: string) => SERVICE_ICONS[type] || SERVICE_ICONS.default
  const getColor = (type: string) => SERVICE_COLORS[type] || SERVICE_COLORS.default

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
      {/* Summary Stats Bar — 30% width */}
      <div className="bg-gray-50 rounded-xl p-5 border border-[var(--border,#e5e7eb)]">
        <div className="flex gap-3 w-[30%] min-w-[420px]">
          <div className="flex-1 bg-white rounded-lg p-3 border border-[var(--border,#e5e7eb)] text-center">
            <Unplug className="w-4 h-4 mx-auto mb-1 text-[#8b5cf6]" />
            <div className="text-lg font-bold text-[var(--foreground,#111827)]">{summary.total}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Orphans</div>
          </div>
          <div className="flex-1 bg-white rounded-lg p-3 border border-[#22c55e40] text-center">
            <DollarSign className="w-4 h-4 mx-auto mb-1 text-[#22c55e]" />
            <div className="text-lg font-bold text-[#22c55e]">${summary.estimatedMonthlySavings}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Monthly Savings</div>
          </div>
          <div className="flex-1 bg-white rounded-lg p-3 border border-[#ef444440] text-center">
            <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-[#ef4444]" />
            <div className="text-lg font-bold text-[#ef4444]">{summary.highRisk}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">High Risk</div>
          </div>
          <div className="flex-1 bg-white rounded-lg p-3 border border-[#3b82f640] text-center">
            <Calendar className="w-4 h-4 mx-auto mb-1 text-[#3b82f6]" />
            <div className="text-lg font-bold text-[#3b82f6]">{summary.seasonalCount}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Seasonal</div>
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
          onClick={fetchOrphanServices}
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
            <TrendingDown className="w-4 h-4 text-[#22c55e]" />
            Save ${summary.estimatedMonthlySavings}/mo
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
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--muted-foreground,#6b7280)]">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{orphan.lastSeen ? `${orphan.idleDays}d idle` : '~90d idle (est.)'}</span>
                            <span>{orphan.region}</span>
                            {orphan.lastUsedBy && <span>Last used by: {orphan.lastUsedBy}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
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
                                <div className="font-medium text-[var(--foreground,#111827)]">{formatDate(orphan.lastSeen)}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Idle Duration</div>
                                <div className="font-medium text-[var(--foreground,#111827)]">{orphan.idleDays} days</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Connected Resources</div>
                                <div className="font-medium text-[var(--foreground,#111827)]">{orphan.attachedResources}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Last Used By</div>
                                <div className="font-medium text-[var(--foreground,#111827)]">{orphan.lastUsedBy || (orphan.attachedResources === 0 ? "None (isolated)" : "Unknown")}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Confidence</div>
                                <div className={`font-medium ${CONFIDENCE_COLORS[orphan.confidence]}`}>{orphan.confidence} — {orphan.idleDays >= 90 ? `${Math.floor(orphan.idleDays / 30)}+ months observed` : orphan.idleDays >= 30 ? `${orphan.idleDays} days observed` : `${orphan.idleDays} days (limited data)`}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Est. Monthly Cost</div>
                                <div className="font-medium text-[#22c55e]">${orphan.estimatedMonthlyCost}</div>
                              </div>
                            </div>

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

                            {/* Actions */}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); dismissOrphan(orphan.id) }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-100 transition-colors text-[var(--muted-foreground,#6b7280)]"
                              >
                                <BellOff className="w-3 h-3" />
                                Dismiss
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); dismissOrphan(orphan.id) }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-100 transition-colors text-[var(--muted-foreground,#6b7280)]"
                              >
                                <Clock className="w-3 h-3" />
                                Snooze 90d
                              </button>
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
    </div>
  )
}
