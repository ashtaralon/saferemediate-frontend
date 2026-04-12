"use client"

import React, { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  Key,
  Layers,
  Loader2,
  Network,
  RotateCcw,
  Shield,
  Target,
  X,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

interface AccessibleObject {
  databases?: string[]
  tables?: string[]
  estimated_rows?: number
  contains_pii?: boolean
  contains_financial?: boolean
}

interface DataStore {
  resource_id: string
  resource_name: string
  resource_type: string
  access_level: string
  accessible_objects: AccessibleObject
  permissions_used: string[]
  classification?: string
}

interface S3Access {
  bucket: string
  bucket_id?: string
  accessible_prefixes: string[]
  operations: string[]
  estimated_objects: number
  estimated_size_gb: number
  contains_pii?: boolean
  contains_financial?: boolean
}

interface DataAccessScope {
  iam_roles_in_path: string[]
  combined_permissions: string[]
  data_stores_accessible: DataStore[]
  s3_access: S3Access[]
}

interface SideEffect {
  type: string
  description: string
  affected_services?: string[]
  severity: string
}

interface ImpactPreview {
  vulnerabilities_blocked?: string[]
  attack_impacts_prevented?: string[]
  risk_reduction: string
  side_effects: SideEffect[]
  before_score: number
  after_score: number
  permissions_removed?: number
  permissions_remaining?: number
  tables_protected?: number
}

interface RemediationTarget {
  scope?: "service" | "chain" | string
  resource_ids?: string[]
  resource_names?: string[]
  roles?: string[]
  permissions_to_remove?: string[]
  tables?: string[]
  new_access_level?: string
}

interface RemediationOption {
  id: string
  action: string
  title: string
  description: string
  effort: string
  automation_available: boolean
  target?: RemediationTarget
  impact_preview: ImpactPreview
}

interface SimulationData {
  path_id: string
  simulation_timestamp: string
  data_access_scope: DataAccessScope
  remediation_options: RemediationOption[]
  exploitable_vulnerabilities: Array<{ current_risk?: string }>
}

interface PathContextNode {
  id: string
  name: string
  type: string
  is_internet_exposed?: boolean
}

interface PathContextSecurityGroup {
  sg_id: string
  sg_name: string
  open_to_internet: boolean
  affected_resources: string[]
  risky_rules: Array<{
    direction: string
    port: number | string
    protocol: string
    source: string
    risk: string
  }>
}

interface PathContextNetworkHop {
  from: string
  to: string
  port: number
  protocol: string
  observed: boolean
}

interface PathContextRole {
  role_id: string
  role_name: string
  attached_to: string[]
  policies: string[]
  permission_count: number
  observed_actions_count: number
}

interface PathContextIdentityLayer {
  roles: PathContextRole[]
  dangerous_permissions: Array<{
    role: string
    permission: string
    risk: string
  }>
  least_privilege_gaps: Array<{
    role: string
    allowed: number
    observed: number
    gap_percentage: number
  }>
}

interface PathContextDataImpact {
  name: string
  type: string
  classification: string
  sensitivity: string
  data_types: string[]
  compliance: string[]
  contains_pii: boolean
  contains_financial: boolean
  estimated_records: number
  impact_score: number
  breach_impact: string
}

interface AttackPathContext {
  pathType: string
  entryPoint: string
  crownJewel: string
  identityUsed: string
  pathNodes: PathContextNode[]
  networkLayer: {
    security_groups: PathContextSecurityGroup[]
    open_ports: number[]
    protocols: string[]
    internet_exposed: boolean
    network_path: PathContextNetworkHop[]
  }
  identityLayer: PathContextIdentityLayer
  dataImpact: PathContextDataImpact
}

interface AttackSimulationPanelProps {
  isOpen: boolean
  onClose: () => void
  systemName: string
  pathId: string
  pathName?: string
  pathContext?: AttackPathContext
  initialSelectedServiceId?: string | null
  initialSelectedServiceName?: string | null
}

interface ServiceCard {
  key: string
  name: string
  type: string
  subtitle: string
  details: string[]
  remediationIds: string[]
  kind: "identity" | "data" | "bucket"
  roleName?: string
  store?: DataStore
  bucket?: S3Access
  onPrimaryPath: boolean
  pathIndex: number
  rawName?: string
  nodeId?: string
}

function formatResourceName(name: string) {
  if (!name) return "Unknown"
  let formatted = name
  if (formatted.includes(":assumed-role/")) {
    formatted = formatted.split(":assumed-role/")[1]?.split("/")[0] || formatted
  }
  if (formatted.includes(":role/")) {
    formatted = formatted.split(":role/")[1] || formatted
  }
  if (formatted.includes(":table/")) {
    formatted = formatted.split(":table/")[1] || formatted
  }
  if (formatted.includes(":::")) {
    formatted = formatted.split(":::")[1] || formatted
  }
  if (formatted.includes("/")) {
    const parts = formatted.split("/").filter(Boolean)
    if (parts.length > 1) {
      formatted = parts[parts.length - 1]
    }
  }
  return formatted
}

function getEffortBadgeClass(effort: string) {
  switch (effort) {
    case "LOW":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
    case "MEDIUM":
      return "bg-amber-500/15 text-amber-300 border-amber-400/30"
    case "HIGH":
      return "bg-orange-500/15 text-orange-300 border-orange-400/30"
    default:
      return "bg-slate-500/15 text-slate-300 border-slate-400/30"
  }
}

function getAccessBadgeClass(accessLevel: string) {
  switch (accessLevel) {
    case "ADMIN":
    case "FULL":
      return "bg-red-500/15 text-red-300 border-red-400/30"
    case "READ_ONLY":
      return "bg-blue-500/15 text-blue-300 border-blue-400/30"
    case "WRITE_ONLY":
      return "bg-orange-500/15 text-orange-300 border-orange-400/30"
    default:
      return "bg-yellow-500/15 text-yellow-300 border-yellow-400/30"
  }
}

function getPlaneTone(plane: "identity" | "network" | "data") {
  switch (plane) {
    case "identity":
      return {
        icon: Key,
        header: "bg-violet-500/10 border-violet-500/20",
        title: "text-violet-300",
        badge: "bg-violet-500/15 text-violet-300 border-violet-400/30",
      }
    case "network":
      return {
        icon: Network,
        header: "bg-sky-500/10 border-sky-500/20",
        title: "text-sky-300",
        badge: "bg-sky-500/15 text-sky-300 border-sky-400/30",
      }
    default:
      return {
        icon: Database,
        header: "bg-emerald-500/10 border-emerald-500/20",
        title: "text-emerald-300",
        badge: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
      }
  }
}

function formatCount(value: number | undefined, noun: string) {
  if (!value) return `No ${noun}`
  return `${value.toLocaleString()} ${noun}`
}

function PlaneCard({
  plane,
  title,
  subtitle,
  children,
}: {
  plane: "identity" | "network" | "data"
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  const tone = getPlaneTone(plane)
  const Icon = tone.icon

  return (
    <div className="rounded-2xl border border-slate-700 bg-white/[0.03] overflow-hidden">
      <div className={`border-b px-5 py-4 ${tone.header}`}>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-950/40 p-2">
            <Icon className={`h-4 w-4 ${tone.title}`} />
          </div>
          <div>
            <div className={`text-sm font-semibold ${tone.title}`}>{title}</div>
            <div className="text-xs text-slate-400">{subtitle}</div>
          </div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#1b1f39] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-white">{value}</div>
    </div>
  )
}

export function AttackSimulationPanel({
  isOpen,
  onClose,
  systemName,
  pathId,
  pathName,
  pathContext,
  initialSelectedServiceId,
  initialSelectedServiceName,
}: AttackSimulationPanelProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null)
  const [selectedRemediations, setSelectedRemediations] = useState<string[]>([])
  const [applying, setApplying] = useState(false)
  const [rollingBack, setRollingBack] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [applyResult, setApplyResult] = useState<{
    status: string
    message: string
    newRiskScore?: number
    riskReduction?: number
  } | null>(null)
  const [appliedRemediations, setAppliedRemediations] = useState<string[]>([])
  const [selectedServiceKey, setSelectedServiceKey] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen && systemName && pathId) {
      void fetchSimulation()
    }
  }, [isOpen, systemName, pathId])

  const fetchSimulation = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/proxy/attack-simulation/${encodeURIComponent(systemName)}/${encodeURIComponent(pathId)}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch simulation: ${response.status}`)
      }
      const data = await response.json()
      const dataAccess = data.data_access_scope || {}
      setSimulationData({
        ...data,
        exploitable_vulnerabilities: data.exploitable_vulnerabilities || [],
        data_access_scope: {
          ...dataAccess,
          iam_roles_in_path: dataAccess.iam_roles_in_path || [],
          combined_permissions: dataAccess.combined_permissions || [],
          data_stores_accessible: (dataAccess.data_stores_accessible || []).map((store: DataStore) => ({
            ...store,
            accessible_objects: store.accessible_objects || {},
            permissions_used: store.permissions_used || [],
          })),
          s3_access: dataAccess.s3_access || [],
        },
        remediation_options: (data.remediation_options || []).map((option: RemediationOption) => ({
          ...option,
          target: option.target || {},
          impact_preview: {
            ...(option.impact_preview || {}),
            side_effects: option.impact_preview?.side_effects || [],
            attack_impacts_prevented: option.impact_preview?.attack_impacts_prevented || [],
            risk_reduction: option.impact_preview?.risk_reduction || "0%",
            before_score: option.impact_preview?.before_score || 0,
            after_score: option.impact_preview?.after_score || 0,
          },
        })),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load simulation")
    } finally {
      setLoading(false)
    }
  }

  const applyRemediations = async () => {
    if (selectedRemediations.length === 0) return

    setApplying(true)
    setApplyResult(null)

    try {
      const response = await fetch(
        `/api/proxy/attack-simulation/${encodeURIComponent(systemName)}/${encodeURIComponent(pathId)}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remediation_ids: selectedRemediations }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed: ${response.status}`)
      }

      const data = await response.json()

      setApplyResult({
        status: data.status,
        message: `${data.successful} of ${data.total_requested} remediation changes applied successfully`,
        newRiskScore: data.new_risk_score,
        riskReduction: data.risk_reduction,
      })

      if (data.status === "SUCCESS" || data.status === "PARTIAL") {
        setAppliedRemediations((prev) => [
          ...prev,
          ...selectedRemediations.filter(
            (id) => !prev.includes(id) && data.results.some((result: { remediation_id: string; status: string }) => result.remediation_id === id && result.status === "SUCCESS")
          ),
        ])
        setSelectedRemediations([])
        toast({
          title: "Remediation applied",
          description: `Risk reduced by ${data.risk_reduction}%`,
        })
        setTimeout(() => void fetchSimulation(), 1000)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to apply remediations"
      setApplyResult({
        status: "FAILED",
        message: errorMessage,
      })
      toast({
        title: "Remediation failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setApplying(false)
      setShowConfirmDialog(false)
    }
  }

  const rollbackRemediation = async (remediationId: string) => {
    setRollingBack(remediationId)
    try {
      const response = await fetch(
        `/api/proxy/attack-simulation/${encodeURIComponent(systemName)}/${encodeURIComponent(pathId)}/rollback?remediation_id=${encodeURIComponent(remediationId)}`,
        { method: "POST" }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Rollback failed: ${response.status}`)
      }

      const data = await response.json()
      setAppliedRemediations((prev) => prev.filter((id) => id !== remediationId))
      setApplyResult({
        status: "SUCCESS",
        message: `Rollback successful: ${data.message}`,
      })
      toast({
        title: "Rollback successful",
        description: data.message,
      })
      setTimeout(() => void fetchSimulation(), 1000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Rollback failed"
      setApplyResult({
        status: "FAILED",
        message: errorMessage,
      })
      toast({
        title: "Rollback failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setRollingBack(null)
    }
  }

  const pathNodeLabels = useMemo(() => {
    if (pathContext?.pathNodes?.length) {
      return pathContext.pathNodes.map((node) => formatResourceName(node.name))
    }

    return pathName?.split("→").map((part) => formatResourceName(part.trim())).filter(Boolean) || []
  }, [pathContext, pathName])

  const serviceCards = useMemo<ServiceCard[]>(() => {
    if (!simulationData) return []

    const options = simulationData.remediation_options || []
    const pathNodes = pathContext?.pathNodes || []
    const cards: ServiceCard[] = []

    for (const [index, node] of pathNodes.entries()) {
      const formattedName = formatResourceName(node.name)
      const storeMatch = simulationData.data_access_scope.data_stores_accessible.find(
        (store) => store.resource_id === node.id || store.resource_name === node.name || formatResourceName(store.resource_name) === formattedName
      )
      const bucketMatch = simulationData.data_access_scope.s3_access.find(
        (bucket) => bucket.bucket_id === node.id || bucket.bucket === node.name || formatResourceName(bucket.bucket) === formattedName
      )
      const roleMatch = simulationData.data_access_scope.iam_roles_in_path.find(
        (role) => role === node.name || formatResourceName(role) === formattedName
      )

      const remediationIds = options
        .filter((option) => {
          if (roleMatch && option.target?.roles?.includes(roleMatch)) return true
          if (storeMatch && (option.target?.resource_ids?.includes(storeMatch.resource_id) || option.target?.resource_names?.includes(storeMatch.resource_name))) return true
          if (bucketMatch && (option.target?.resource_ids?.includes(bucketMatch.bucket_id || "") || option.target?.resource_names?.includes(bucketMatch.bucket))) return true
          return false
        })
        .map((option) => option.id)

      if (roleMatch || /IAMRole|Role/i.test(node.type)) {
        cards.push({
          key: `path-role:${node.id}`,
          name: formattedName,
          type: node.type,
          subtitle: "Identity used on this path",
          details: [
            formatCount(simulationData.data_access_scope.combined_permissions.length, "permissions in scope"),
            formattedName === formatResourceName(pathContext?.identityUsed || "") ? "Primary path identity" : "Identity hop",
          ],
          remediationIds,
          kind: "identity",
          roleName: roleMatch || node.name,
          onPrimaryPath: true,
          pathIndex: index,
          rawName: node.name,
          nodeId: node.id,
        })
        continue
      }

      if (storeMatch) {
        const details = [
          `${storeMatch.accessible_objects.tables?.length || 0} reachable tables`,
          storeMatch.accessible_objects.estimated_rows
            ? `~${storeMatch.accessible_objects.estimated_rows.toLocaleString()} rows`
            : "Row volume unknown",
        ]

        if (storeMatch.accessible_objects.contains_pii) {
          details.push("Contains PII")
        }

        cards.push({
          key: `path-store:${node.id}`,
          name: formattedName,
          type: node.type,
          subtitle: `${storeMatch.access_level} data access`,
          details,
          remediationIds,
          kind: "data",
          store: storeMatch,
          onPrimaryPath: true,
          pathIndex: index,
          rawName: node.name,
          nodeId: node.id,
        })
        continue
      }

      if (bucketMatch) {
        const details = [
          `${bucketMatch.operations.length || 0} operations in scope`,
          `~${bucketMatch.estimated_objects.toLocaleString()} objects`,
        ]

        if (bucketMatch.contains_pii) {
          details.push("Contains PII")
        }

        cards.push({
          key: `path-bucket:${node.id}`,
          name: formattedName,
          type: node.type,
          subtitle: "Bucket on this path",
          details,
          remediationIds,
          kind: "bucket",
          bucket: bucketMatch,
          onPrimaryPath: true,
          pathIndex: index,
          rawName: node.name,
          nodeId: node.id,
        })
        continue
      }

      cards.push({
        key: `path-node:${node.id}`,
        name: formattedName,
        type: node.type,
        subtitle: "Service on the selected path",
        details: [node.is_internet_exposed ? "Externally reachable" : "Internal path service"],
        remediationIds,
        kind: "data",
        onPrimaryPath: true,
        pathIndex: index,
        rawName: node.name,
        nodeId: node.id,
      })
    }

    return cards
  }, [pathContext?.identityUsed, pathContext?.pathNodes, simulationData])

  const selectedService = useMemo(
    () => serviceCards.find((card) => card.key === selectedServiceKey) || null,
    [selectedServiceKey, serviceCards]
  )

  useEffect(() => {
    if (!isOpen || serviceCards.length === 0) return

    const byNodeId = initialSelectedServiceId
      ? serviceCards.find((card) => card.nodeId === initialSelectedServiceId)
      : null
    const byName = initialSelectedServiceName
      ? serviceCards.find(
          (card) =>
            card.rawName === initialSelectedServiceName ||
            card.name === formatResourceName(initialSelectedServiceName)
        )
      : null
    const defaultTarget = serviceCards.find(
      (card) =>
        card.rawName === pathContext?.crownJewel ||
        card.name === formatResourceName(pathContext?.crownJewel || "")
    ) || serviceCards[serviceCards.length - 1]

    const nextKey = byNodeId?.key || byName?.key || defaultTarget?.key || null
    setSelectedServiceKey(nextKey)
  }, [initialSelectedServiceId, initialSelectedServiceName, isOpen, pathContext?.crownJewel, serviceCards])

  const chainOptions = useMemo(
    () => (simulationData?.remediation_options || []).filter((option) => option.target?.scope === "chain"),
    [simulationData]
  )

  const selectedOptions = useMemo(
    () => (simulationData?.remediation_options || []).filter((option) => selectedRemediations.includes(option.id)),
    [simulationData, selectedRemediations]
  )

  const identityOptions = useMemo(
    () => (simulationData?.remediation_options || []).filter((option) => option.action === "REMOVE_PERMISSION"),
    [simulationData]
  )

  const serviceOptions = useMemo(() => {
    if (!selectedService || !simulationData) return []
    return simulationData.remediation_options.filter((option) => selectedService.remediationIds.includes(option.id))
  }, [selectedService, simulationData])

  const identityRoleNames = useMemo(
    () => (simulationData?.data_access_scope.iam_roles_in_path || []).map((role) => formatResourceName(role)),
    [simulationData]
  )

  const relevantNetworkHops = useMemo(() => {
    if (!selectedService || !pathContext) return []
    const serviceName = selectedService.name
    return pathContext.networkLayer.network_path.filter((hop) => {
      const from = formatResourceName(hop.from)
      const to = formatResourceName(hop.to)
      return from === serviceName || to === serviceName
    })
  }, [pathContext, selectedService])

  const relevantSecurityGroups = useMemo(() => {
    if (!selectedService || !pathContext) return []
    const serviceName = selectedService.name
    return pathContext.networkLayer.security_groups.filter((sg) => {
      const affected = (sg.affected_resources || []).map((resource) => formatResourceName(resource))
      return affected.includes(serviceName) || selectedService.onPrimaryPath
    })
  }, [pathContext, selectedService])

  const isSelectedGroup = (ids: string[]) => ids.length > 0 && ids.every((id) => selectedRemediations.includes(id))

  const toggleRemediationGroup = (ids: string[]) => {
    if (ids.length === 0) return
    const shouldRemove = ids.every((id) => selectedRemediations.includes(id))
    setSelectedRemediations((prev) =>
      shouldRemove ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-end" style={{ zIndex: 9999 }}>
      <div className="w-[860px] max-w-[100vw] bg-[#14162b] h-full overflow-y-auto border-l border-slate-700">
        <div className="sticky top-0 z-10 bg-[#14162b] border-b border-slate-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <Zap className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Least Privilege Plan</h2>
                <p className="text-sm text-slate-400">{pathName || `Path ${pathId}`}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-medium text-white">What this page does</span>
            </div>
            <p className="text-sm text-slate-300">
              Start with the attack path, open any service in the chain, then review the three enforce planes on one page. You can select one service change or execute a whole-chain plan with rollback.
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <span className="ml-3 text-slate-400">Loading least-privilege plan...</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm text-red-300">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void fetchSimulation()}>
                Retry
              </Button>
            </div>
          )}

          {simulationData && !loading && (
            <>
              {!selectedService ? (
                <>
                  <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <div className="text-sm font-medium text-white">Path to block</div>
                        <div className="mt-1 text-xs text-slate-400">
                          Choose a service below to open its remediation page, or execute the whole-chain LP plan.
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Badge className="bg-slate-800 text-slate-200 border border-slate-600">
                          {simulationData.exploitable_vulnerabilities.filter((v) => v.current_risk === "EXPLOITABLE_NOW").length} active CVE steps
                        </Badge>
                        <Badge className="bg-slate-800 text-slate-200 border border-slate-600">
                          {serviceCards.length} services on path
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
                      {pathNodeLabels.map((node, index) => (
                        <React.Fragment key={`${node}-${index}`}>
                          <div className="min-w-[190px] rounded-xl border border-slate-700 bg-[#1b1f39] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                              {index === 0 ? "Entry" : index === pathNodeLabels.length - 1 ? "Crown Jewel" : "Service"}
                            </div>
                            <div className="text-sm font-semibold text-white">{node}</div>
                          </div>
                          {index < pathNodeLabels.length - 1 && <ArrowRight className="h-4 w-4 text-slate-500 shrink-0" />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Layers className="h-4 w-4 text-cyan-400" />
                      <div>
                        <div className="text-sm font-medium text-white">Whole-chain LP plan</div>
                        <div className="text-xs text-slate-400">See the full least-privilege work across the three enforce layers before you execute.</div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <PlaneCard plane="identity" title="Identity Plane" subtitle="Roles and permissions on the path">
                        <div className="grid gap-3">
                          <SummaryChip label="Identity Used" value={pathContext?.identityUsed || identityRoleNames[0] || "Unknown"} />
                          <SummaryChip label="Roles in Path" value={`${serviceCards.filter((card) => card.kind === "identity").length}`} />
                          <SummaryChip label="Permission Changes" value={`${identityOptions.length} direct actions`} />
                        </div>
                      </PlaneCard>

                      <PlaneCard plane="network" title="Network Plane" subtitle="Reachability and network controls">
                        <div className="grid gap-3">
                          <SummaryChip label="Exposure" value={pathContext?.networkLayer.internet_exposed ? "Internet exposed" : "Internal only"} />
                          <SummaryChip label="Security Groups" value={`${pathContext?.networkLayer.security_groups.length || 0}`} />
                          <SummaryChip label="Open Ports" value={`${pathContext?.networkLayer.open_ports.length || 0}`} />
                        </div>
                      </PlaneCard>

                      <PlaneCard plane="data" title="Data Plane" subtitle="Stores that must be narrowed">
                        <div className="grid gap-3">
                          <SummaryChip label="Data Stores" value={`${serviceCards.filter((card) => card.kind === "data").length}`} />
                          <SummaryChip label="Buckets" value={`${serviceCards.filter((card) => card.kind === "bucket").length}`} />
                          <SummaryChip label="Chain Actions" value={`${chainOptions.length}`} />
                        </div>
                      </PlaneCard>
                    </div>

                    {chainOptions.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {chainOptions.map((option) => {
                          const isSelected = selectedRemediations.includes(option.id)
                          const isApplied = appliedRemediations.includes(option.id)
                          const isRollingBackThis = rollingBack === option.id
                          return (
                            <div key={option.id} className="rounded-xl border border-slate-700 bg-[#1b1f39] p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="text-base font-semibold text-white">{option.title}</div>
                                  <div className="mt-1 text-sm text-slate-400">{option.description}</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <Badge className={`border ${getEffortBadgeClass(option.effort)}`}>{option.effort}</Badge>
                                    <Badge className="bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                                      {option.target?.resource_names?.length || 0} services
                                    </Badge>
                                    <Badge className="bg-green-500/15 text-green-300 border border-green-400/30">
                                      {option.impact_preview.risk_reduction} reduction
                                    </Badge>
                                    {isApplied && <Badge className="bg-blue-500/15 text-blue-300 border border-blue-400/30">Applied</Badge>}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant={isSelected ? "default" : "outline"}
                                    className={isSelected ? "bg-cyan-600 hover:bg-cyan-700" : ""}
                                    onClick={() => toggleRemediationGroup([option.id])}
                                  >
                                    {isSelected ? "Selected" : "Select whole chain"}
                                  </Button>
                                  {isApplied && (
                                    <Button
                                      variant="outline"
                                      className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
                                      onClick={() => rollbackRemediation(option.id)}
                                      disabled={isRollingBackThis}
                                    >
                                      {isRollingBackThis ? (
                                        <>
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          Rolling back
                                        </>
                                      ) : (
                                        <>
                                          <RotateCcw className="mr-2 h-4 w-4" />
                                          Rollback
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-slate-700 bg-[#1b1f39] p-4 text-sm text-slate-400">
                        No full-chain LP action was generated yet for this path. You can still open each service and remediate it one by one.
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="h-4 w-4 text-cyan-400" />
                      <div>
                        <div className="text-sm font-medium text-white">Services in the selected path</div>
                        <div className="text-xs text-slate-400">Open any service to see its Identity, Network, and Data remediation page.</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {serviceCards.map((card) => {
                        const directOptions = (simulationData.remediation_options || []).filter((option) => card.remediationIds.includes(option.id))
                        return (
                          <div key={card.key} className="rounded-xl border border-slate-700 bg-[#1b1f39] p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="text-base font-semibold text-white">{card.name}</div>
                                  <Badge className={`border ${card.kind === "identity" ? "bg-violet-500/15 text-violet-300 border-violet-400/30" : getAccessBadgeClass(card.store?.access_level || "LIMITED")}`}>
                                    {card.type}
                                  </Badge>
                                  {card.onPrimaryPath && (
                                    <Badge className="bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                                      On primary path
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-1 text-sm text-slate-400">{card.subtitle}</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {card.details.map((detail) => (
                                    <Badge key={detail} className="bg-slate-800 text-slate-300 border border-slate-600">
                                      {detail}
                                    </Badge>
                                  ))}
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 items-end">
                                <Button
                                  variant="outline"
                                  className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                                  onClick={() => setSelectedServiceKey(card.key)}
                                >
                                  Open 3-layer plan
                                </Button>
                                {directOptions.length > 0 ? (
                                  <Badge className="bg-green-500/15 text-green-300 border border-green-400/30">
                                    {directOptions.length} direct change{directOptions.length === 1 ? "" : "s"}
                                  </Badge>
                                ) : (
                                  <Badge className="bg-slate-800 text-slate-400 border border-slate-600">
                                    No direct LP change yet
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          className="border-slate-600 bg-[#1b1f39] text-slate-200 hover:bg-slate-800"
                          onClick={() => setSelectedServiceKey(null)}
                        >
                          <ArrowLeft className="mr-2 h-4 w-4" />
                          Back to path
                        </Button>
                        <div>
                          <div className="text-lg font-semibold text-white">{selectedService.name}</div>
                          <div className="text-sm text-slate-400">
                            {selectedService.type} • {selectedService.subtitle}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                          onClick={() => setSelectedServiceKey(null)}
                        >
                          Whole-path plan
                        </Button>
                        <Badge className="bg-slate-800 text-slate-200 border border-slate-600">
                          {selectedService.onPrimaryPath ? "Primary path service" : "Reachable from this path"}
                        </Badge>
                        <Badge className="bg-slate-800 text-slate-200 border border-slate-600">
                          {serviceOptions.length} direct LP action{serviceOptions.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <SummaryChip label="Path Context" value={pathContext?.pathType || "Attack path"} />
                      <SummaryChip label="Entry" value={pathContext?.entryPoint || pathNodeLabels[0] || "Unknown"} />
                      <SummaryChip label="Identity" value={pathContext?.identityUsed || identityRoleNames[0] || "Unknown"} />
                      <SummaryChip label="Crown Jewel" value={pathContext?.crownJewel || pathNodeLabels[pathNodeLabels.length - 1] || "Unknown"} />
                    </div>
                  </div>

                  <PlaneCard plane="identity" title="Identity Plane" subtitle="Who can reach this service and what to narrow first">
                    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                      <div className="space-y-3">
                        <div className="rounded-xl border border-slate-700 bg-[#1b1f39] p-4">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Identity Summary</div>
                          <p className="mt-2 text-sm text-slate-300">
                            {selectedService.kind === "identity"
                              ? `${selectedService.name} is the identity hop on this route. Tightening its permissions is the fastest way to shrink the path.`
                              : `${pathContext?.identityUsed || identityRoleNames[0] || "The path identity"} can reach ${selectedService.name}. Start by narrowing that identity before changing the service itself.`}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {identityRoleNames.map((role) => (
                              <Badge key={role} className="bg-violet-500/15 text-violet-300 border border-violet-400/30">
                                {role}
                              </Badge>
                            ))}
                            {identityRoleNames.length === 0 && (
                              <span className="text-sm text-slate-500">No IAM role data stitched into this path.</span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-700 bg-[#1b1f39] p-4">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Permissions in Scope</div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <SummaryChip label="Allowed" value={`${simulationData.data_access_scope.combined_permissions.length}`} />
                            <SummaryChip label="Dangerous" value={`${pathContext?.identityLayer.dangerous_permissions.length || 0}`} />
                            <SummaryChip label="LP Gaps" value={`${pathContext?.identityLayer.least_privilege_gaps.length || 0}`} />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-700 bg-[#1b1f39] p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Identity Remediation</div>
                        {identityOptions.length > 0 ? (
                          <div className="mt-3 space-y-3">
                            {identityOptions.map((option) => {
                              const isSelected = isSelectedGroup([option.id])
                              const isApplied = appliedRemediations.includes(option.id)
                              const isRollingBackThis = rollingBack === option.id
                              return (
                                <div key={option.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                                  <div className="text-sm font-medium text-white">{option.title}</div>
                                  <div className="mt-1 text-xs text-slate-400">{option.description}</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <Badge className={`border ${getEffortBadgeClass(option.effort)}`}>{option.effort}</Badge>
                                    <Badge className="bg-green-500/15 text-green-300 border border-green-400/30">
                                      {option.impact_preview.risk_reduction}
                                    </Badge>
                                  </div>
                                  <div className="mt-3 flex gap-2 flex-wrap">
                                    <Button
                                      variant={isSelected ? "default" : "outline"}
                                      className={isSelected ? "bg-violet-600 hover:bg-violet-700" : "border-violet-500/40 text-violet-300 hover:bg-violet-500/10"}
                                      onClick={() => toggleRemediationGroup([option.id])}
                                    >
                                      {isSelected ? "Selected" : "Select identity change"}
                                    </Button>
                                    {isApplied && (
                                      <Button
                                        variant="outline"
                                        className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
                                        onClick={() => rollbackRemediation(option.id)}
                                        disabled={isRollingBackThis}
                                      >
                                        {isRollingBackThis ? (
                                          <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Rolling back
                                          </>
                                        ) : (
                                          <>
                                            <RotateCcw className="mr-2 h-4 w-4" />
                                            Rollback
                                          </>
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="mt-3 text-sm text-slate-400">
                            No direct identity change was generated for this service yet. You can still use the whole-chain plan or remediate the data service directly.
                          </div>
                        )}
                      </div>
                    </div>
                  </PlaneCard>

                  <PlaneCard plane="network" title="Network Plane" subtitle="How this service stays reachable on the current route">
                    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                      <div className="space-y-3">
                        <div className="rounded-xl border border-slate-700 bg-[#1b1f39] p-4">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Path Reachability</div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <SummaryChip label="Exposure" value={pathContext?.networkLayer.internet_exposed ? "Internet exposed" : "Internal only"} />
                            <SummaryChip label="Open Ports" value={`${pathContext?.networkLayer.open_ports.length || 0}`} />
                            <SummaryChip label="Observed Hops" value={`${relevantNetworkHops.length}`} />
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-700 bg-[#1b1f39] p-4">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Network Path for This Service</div>
                          <div className="mt-3 space-y-2">
                            {relevantNetworkHops.length > 0 ? (
                              relevantNetworkHops.map((hop, index) => (
                                <div key={`${hop.from}-${hop.to}-${index}`} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-sm text-slate-300">
                                  <span className="text-white">{formatResourceName(hop.from)}</span>
                                  <ArrowRight className="mx-2 inline h-3 w-3 text-slate-500" />
                                  <span className="text-white">{formatResourceName(hop.to)}</span>
                                  {hop.port ? <span className="ml-2 text-slate-400">:{hop.port}/{hop.protocol || "tcp"}</span> : null}
                                  {hop.observed ? <span className="ml-2 text-green-400">observed</span> : null}
                                </div>
                              ))
                            ) : (
                              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-sm text-slate-400">
                                This service is in the reachable blast radius, but the primary path does not include a dedicated network hop for it.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-700 bg-[#1b1f39] p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Network Controls</div>
                        {relevantSecurityGroups.length > 0 ? (
                          <div className="mt-3 space-y-3">
                            {relevantSecurityGroups.slice(0, 3).map((sg) => (
                              <div key={sg.sg_id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-medium text-white">{sg.sg_name}</div>
                                  <Badge className={sg.open_to_internet ? "bg-red-500/15 text-red-300 border border-red-400/30" : "bg-sky-500/15 text-sky-300 border border-sky-400/30"}>
                                    {sg.open_to_internet ? "Internet" : "Internal"}
                                  </Badge>
                                </div>
                                <div className="mt-2 text-xs text-slate-400">
                                  {sg.risky_rules.length > 0 ? `${sg.risky_rules.length} risky rules on this path` : "No risky rules stitched for this service"}
                                </div>
                              </div>
                            ))}
                            <div className="text-xs text-slate-500">
                              No network-specific LP action was generated yet for this service. Use this plane to understand reachability before changing identity or data controls.
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 text-sm text-slate-400">
                            No security group or NACL detail was stitched directly to this service on the current path.
                          </div>
                        )}
                      </div>
                    </div>
                  </PlaneCard>

                  <PlaneCard plane="data" title="Data Plane" subtitle="What this service exposes and the direct least-privilege change">
                    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                      <div className="space-y-3">
                        <div className="rounded-xl border border-slate-700 bg-[#1b1f39] p-4">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Data Exposure</div>
                          {selectedService.store ? (
                            <div className="mt-3 space-y-3">
                              <div className="grid gap-3 md:grid-cols-3">
                                <SummaryChip label="Access" value={selectedService.store.access_level} />
                                <SummaryChip label="Tables" value={`${selectedService.store.accessible_objects.tables?.length || 0}`} />
                                <SummaryChip label="Rows" value={selectedService.store.accessible_objects.estimated_rows ? `~${selectedService.store.accessible_objects.estimated_rows.toLocaleString()}` : "Unknown"} />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(selectedService.store.accessible_objects.tables || []).map((table) => (
                                  <Badge key={table} className="bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                                    {table}
                                  </Badge>
                                ))}
                              </div>
                              <div className="flex gap-3 text-sm">
                                <span className={selectedService.store.accessible_objects.contains_pii ? "text-red-300" : "text-slate-500"}>
                                  PII: {selectedService.store.accessible_objects.contains_pii ? "Yes" : "No"}
                                </span>
                                <span className={selectedService.store.accessible_objects.contains_financial ? "text-red-300" : "text-slate-500"}>
                                  Financial: {selectedService.store.accessible_objects.contains_financial ? "Yes" : "No"}
                                </span>
                              </div>
                            </div>
                          ) : selectedService.bucket ? (
                            <div className="mt-3 space-y-3">
                              <div className="grid gap-3 md:grid-cols-3">
                                <SummaryChip label="Operations" value={`${selectedService.bucket.operations.length}`} />
                                <SummaryChip label="Objects" value={`~${selectedService.bucket.estimated_objects.toLocaleString()}`} />
                                <SummaryChip label="Size" value={`${selectedService.bucket.estimated_size_gb} GB`} />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {selectedService.bucket.operations.length > 0 ? selectedService.bucket.operations.map((op) => (
                                  <Badge key={op} className="bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                                    {op}
                                  </Badge>
                                )) : (
                                  <span className="text-sm text-slate-500">No direct bucket operations were inferred for this service.</span>
                                )}
                              </div>
                              <div className="text-sm text-slate-400">
                                Accessible prefixes: {(selectedService.bucket.accessible_prefixes || []).join(", ") || "Unknown"}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-3 text-sm text-slate-400">
                              This identity does not store data itself, but it is the actor that can unlock downstream data services on the path.
                            </div>
                          )}
                        </div>

                        {pathContext?.dataImpact && selectedService.onPrimaryPath && (
                          <div className="rounded-xl border border-slate-700 bg-[#1b1f39] p-4">
                            <div className="text-xs uppercase tracking-wide text-slate-500">Crown Jewel Context</div>
                            <div className="mt-2 text-sm text-slate-300">
                              The protected target on this path is <span className="font-medium text-white">{pathContext.crownJewel}</span>. Classification:{" "}
                              <span className="text-white">{pathContext.dataImpact.classification}</span>.
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-slate-700 bg-[#1b1f39] p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Direct Remediation</div>
                        {serviceOptions.length > 0 ? (
                          <div className="mt-3 space-y-3">
                            {serviceOptions.map((option) => {
                              const isSelected = isSelectedGroup([option.id])
                              const isApplied = appliedRemediations.includes(option.id)
                              const isRollingBackThis = rollingBack === option.id
                              return (
                                <div key={option.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                                  <div className="text-sm font-medium text-white">{option.title}</div>
                                  <div className="mt-1 text-xs text-slate-400">{option.description}</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <Badge className={`border ${getEffortBadgeClass(option.effort)}`}>{option.effort}</Badge>
                                    <Badge className="bg-green-500/15 text-green-300 border border-green-400/30">
                                      {option.impact_preview.risk_reduction}
                                    </Badge>
                                  </div>
                                  {option.target?.tables && option.target.tables.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {option.target.tables.slice(0, 6).map((table) => (
                                        <Badge key={table} className="bg-slate-800 text-slate-300 border border-slate-600">
                                          {table}
                                        </Badge>
                                      ))}
                                      {option.target.tables.length > 6 && (
                                        <Badge className="bg-slate-800 text-slate-400 border border-slate-600">
                                          +{option.target.tables.length - 6} more
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                  <div className="mt-3 flex gap-2 flex-wrap">
                                    <Button
                                      variant={isSelected ? "default" : "outline"}
                                      className={isSelected ? "bg-emerald-600 hover:bg-emerald-700" : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"}
                                      onClick={() => toggleRemediationGroup([option.id])}
                                    >
                                      {isSelected ? "Selected" : "Select service change"}
                                    </Button>
                                    {isApplied && (
                                      <Button
                                        variant="outline"
                                        className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
                                        onClick={() => rollbackRemediation(option.id)}
                                        disabled={isRollingBackThis}
                                      >
                                        {isRollingBackThis ? (
                                          <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Rolling back
                                          </>
                                        ) : (
                                          <>
                                            <RotateCcw className="mr-2 h-4 w-4" />
                                            Rollback
                                          </>
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="mt-3 text-sm text-slate-400">
                            No direct least-privilege change was generated for this service yet. Use the identity plane or the whole-chain plan to block the route.
                          </div>
                        )}
                      </div>
                    </div>
                  </PlaneCard>
                </div>
              )}

              {applyResult && (
                <div
                  className={`rounded-xl border p-4 ${
                    applyResult.status === "SUCCESS"
                      ? "bg-green-500/10 border-green-500/30"
                      : applyResult.status === "PARTIAL"
                        ? "bg-yellow-500/10 border-yellow-500/30"
                        : "bg-red-500/10 border-red-500/30"
                  }`}
                >
                  <div className="flex items-center gap-2 text-white font-medium">
                    {applyResult.status === "SUCCESS" ? <Check className="h-4 w-4 text-green-400" /> : <AlertTriangle className="h-4 w-4 text-yellow-400" />}
                    {applyResult.status === "SUCCESS" ? "Change applied" : applyResult.status}
                  </div>
                  <p className="mt-1 text-sm text-slate-300">{applyResult.message}</p>
                  {applyResult.newRiskScore !== undefined && (
                    <p className="mt-2 text-sm text-slate-300">
                      New risk score: <span className="font-semibold text-white">{applyResult.newRiskScore}</span>
                      {" · "}
                      Reduction: <span className="font-semibold text-green-300">{applyResult.riskReduction}%</span>
                    </p>
                  )}
                </div>
              )}

              <div className="sticky bottom-0 rounded-xl border border-slate-700 bg-[#101427] p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-sm font-medium text-white">Selected remediation changes</div>
                    <div className="text-xs text-slate-400">
                      Select a service-level change or a whole-chain plan, then apply it here. Rollback stays available inside the same flow.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-slate-800 text-slate-200 border border-slate-600">
                      {selectedRemediations.length} selected
                    </Badge>
                    <Button variant="outline" onClick={() => setSelectedRemediations([])} disabled={selectedRemediations.length === 0 || applying}>
                      Clear
                    </Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700"
                      disabled={selectedRemediations.length === 0 || applying}
                      onClick={() => setShowConfirmDialog(true)}
                    >
                      {applying ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        "Apply selected changes"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="bg-[#14162b] border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Confirm remediation
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              You are about to apply {selectedRemediations.length} least-privilege change{selectedRemediations.length === 1 ? "" : "s"} to this path.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-72 overflow-y-auto py-2">
            {selectedOptions.map((option) => (
              <div key={option.id} className="rounded-lg border border-slate-700 bg-[#1b1f39] p-3">
                <div className="text-sm font-medium text-white">{option.title}</div>
                <div className="mt-1 text-xs text-slate-400">{option.description}</div>
                <div className="mt-2 flex gap-2 flex-wrap">
                  <Badge className={`border ${getEffortBadgeClass(option.effort)}`}>{option.effort}</Badge>
                  <Badge className="bg-green-500/15 text-green-300 border border-green-400/30">
                    {option.impact_preview.risk_reduction} reduction
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
            These changes will be applied to your infrastructure. Use rollback in this panel if you need to undo them.
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} disabled={applying}>
              Cancel
            </Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => void applyRemediations()} disabled={applying}>
              {applying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                "Apply now"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
