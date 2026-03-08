"use client"

import React, { useState, useEffect } from "react"
import { X, Shield, Database, AlertTriangle, ChevronDown, ChevronRight, Lock, Unlock, Server, HardDrive, FileWarning, Zap, Check, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface PortStatus {
  is_open: boolean
  exposed_via: string
  source_allowed: string
  protocol: string
}

interface Exploitability {
  network_exploitable: boolean
  requires_auth: boolean
  exploit_available: boolean
  attack_complexity: string
}

interface ExploitableVulnerability {
  cve_id: string
  cve_name: string
  severity: string
  cvss_score: number
  affected_port: number
  port_status: PortStatus
  exploitability: Exploitability
  current_risk: string
}

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
}

interface S3Access {
  bucket: string
  accessible_prefixes: string[]
  operations: string[]
  estimated_objects: number
  estimated_size_gb: number
}

interface DataAccessScope {
  iam_roles_in_path: string[]
  combined_permissions: string[]
  data_stores_accessible: DataStore[]
  s3_access: S3Access[]
}

interface AffectedData {
  record_count: number
  data_types: string[]
  compliance_violations: string[]
}

interface AttackImpact {
  impact_type: string
  severity: string
  description: string
  affected_data: AffectedData
  attack_steps: string[]
  likelihood: string
  business_impact: string
}

interface SideEffect {
  type: string
  description: string
  affected_services: string[]
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
}

interface RemediationOption {
  id: string
  action: string
  title: string
  description: string
  effort: string
  automation_available: boolean
  impact_preview: ImpactPreview
}

interface SimulationData {
  path_id: string
  simulation_timestamp: string
  exploitable_vulnerabilities: ExploitableVulnerability[]
  data_access_scope: DataAccessScope
  potential_impacts: AttackImpact[]
  remediation_options: RemediationOption[]
}

interface AttackSimulationPanelProps {
  isOpen: boolean
  onClose: () => void
  systemName: string
  pathId: string
  pathName?: string
}

export function AttackSimulationPanel({
  isOpen,
  onClose,
  systemName,
  pathId,
  pathName
}: AttackSimulationPanelProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    vulnerabilities: true,
    dataAccess: true,
    impacts: true,
    remediation: true
  })
  const [selectedRemediations, setSelectedRemediations] = useState<string[]>([])
  const [expandedImpact, setExpandedImpact] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{
    status: string
    message: string
    newRiskScore?: number
    riskReduction?: number
  } | null>(null)
  const [appliedRemediations, setAppliedRemediations] = useState<string[]>([])
  const [rollingBack, setRollingBack] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && systemName && pathId) {
      fetchSimulation()
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
      setSimulationData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load simulation")
    } finally {
      setLoading(false)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const toggleRemediation = (id: string) => {
    setSelectedRemediations(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    )
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
          body: JSON.stringify({ remediation_ids: selectedRemediations })
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed: ${response.status}`)
      }

      const data = await response.json()

      setApplyResult({
        status: data.status,
        message: `${data.successful} of ${data.total_requested} remediations applied successfully`,
        newRiskScore: data.new_risk_score,
        riskReduction: data.risk_reduction
      })

      // Clear selections and track applied remediations on success
      if (data.status === "SUCCESS" || data.status === "PARTIAL") {
        setAppliedRemediations(prev => [...prev, ...selectedRemediations.filter(id =>
          data.results.some((r: { remediation_id: string, status: string }) => r.remediation_id === id && r.status === "SUCCESS")
        )])
        setSelectedRemediations([])
        // Refresh simulation data to show updated state
        setTimeout(() => fetchSimulation(), 1500)
      }
    } catch (err) {
      setApplyResult({
        status: "FAILED",
        message: err instanceof Error ? err.message : "Failed to apply remediations"
      })
    } finally {
      setApplying(false)
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

      // Remove from applied remediations
      setAppliedRemediations(prev => prev.filter(id => id !== remediationId))

      setApplyResult({
        status: "SUCCESS",
        message: `Rollback successful: ${data.message}`
      })

      // Refresh simulation
      setTimeout(() => fetchSimulation(), 1500)
    } catch (err) {
      setApplyResult({
        status: "FAILED",
        message: err instanceof Error ? err.message : "Rollback failed"
      })
    } finally {
      setRollingBack(null)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case "CRITICAL": return "bg-red-500/20 text-red-400 border-red-500/50"
      case "HIGH": return "bg-orange-500/20 text-orange-400 border-orange-500/50"
      case "MEDIUM": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
      case "LOW": return "bg-green-500/20 text-green-400 border-green-500/50"
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/50"
    }
  }

  const getRiskStatusIcon = (status: string) => {
    switch (status) {
      case "EXPLOITABLE_NOW": return <Unlock className="h-4 w-4 text-red-400" />
      case "BLOCKED": return <Lock className="h-4 w-4 text-green-400" />
      case "REQUIRES_AUTH": return <Shield className="h-4 w-4 text-yellow-400" />
      default: return <AlertTriangle className="h-4 w-4 text-gray-400" />
    }
  }

  const getRiskStatusBadge = (status: string) => {
    switch (status) {
      case "EXPLOITABLE_NOW":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50">EXPLOITABLE NOW</Badge>
      case "BLOCKED":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50">BLOCKED</Badge>
      case "REQUIRES_AUTH":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">REQUIRES AUTH</Badge>
      default:
        return <Badge className="bg-gray-500/20 text-gray-400">{status}</Badge>
    }
  }

  const getImpactIcon = (impactType: string) => {
    switch (impactType) {
      case "DATA_THEFT": return <Database className="h-5 w-5" />
      case "RANSOMWARE": return <Lock className="h-5 w-5" />
      case "DATA_DELETION": return <FileWarning className="h-5 w-5" />
      case "DATA_MODIFICATION": return <HardDrive className="h-5 w-5" />
      case "PRIVILEGE_ESCALATION": return <Zap className="h-5 w-5" />
      case "SERVICE_DISRUPTION": return <Server className="h-5 w-5" />
      default: return <AlertTriangle className="h-5 w-5" />
    }
  }

  const getImpactLabel = (impactType: string) => {
    switch (impactType) {
      case "DATA_THEFT": return "Data Theft"
      case "RANSOMWARE": return "Ransomware"
      case "DATA_DELETION": return "Data Deletion"
      case "DATA_MODIFICATION": return "Data Modification"
      case "PRIVILEGE_ESCALATION": return "Privilege Escalation"
      case "SERVICE_DISRUPTION": return "Service Disruption"
      case "CREDENTIAL_THEFT": return "Credential Theft"
      default: return impactType
    }
  }

  const getEffortBadge = (effort: string) => {
    switch (effort) {
      case "LOW": return <Badge className="bg-green-500/20 text-green-400">Low Effort</Badge>
      case "MEDIUM": return <Badge className="bg-yellow-500/20 text-yellow-400">Medium Effort</Badge>
      case "HIGH": return <Badge className="bg-orange-500/20 text-orange-400">High Effort</Badge>
      default: return <Badge>{effort}</Badge>
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
      <div className="w-[700px] bg-[#1a1a2e] h-full overflow-y-auto border-l border-gray-700">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#1a1a2e] border-b border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <Zap className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Attack Simulation</h2>
                <p className="text-sm text-gray-400">{pathName || `Path ${pathId}`}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
              <span className="ml-3 text-gray-400">Running attack simulation...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={fetchSimulation}>
                Retry
              </Button>
            </div>
          )}

          {simulationData && !loading && (
            <>
              {/* Exploitable Vulnerabilities Section */}
              <div className="bg-[#252540] rounded-lg border border-gray-700">
                <button
                  className="w-full p-4 flex items-center justify-between"
                  onClick={() => toggleSection("vulnerabilities")}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-red-400" />
                    <span className="font-medium text-white">Exploitable Vulnerabilities</span>
                    <Badge className="bg-red-500/20 text-red-400">
                      {simulationData.exploitable_vulnerabilities.filter(v => v.current_risk === "EXPLOITABLE_NOW").length} Active
                    </Badge>
                  </div>
                  {expandedSections.vulnerabilities ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {expandedSections.vulnerabilities && (
                  <div className="px-4 pb-4 space-y-3">
                    {simulationData.exploitable_vulnerabilities.map((vuln, idx) => (
                      <div key={idx} className="bg-[#1a1a2e] rounded-lg p-3 border border-gray-600">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getRiskStatusIcon(vuln.current_risk)}
                            <span className="font-mono text-sm text-blue-400">{vuln.cve_id}</span>
                            <Badge className={getSeverityColor(vuln.severity)}>
                              {vuln.severity} ({vuln.cvss_score})
                            </Badge>
                          </div>
                          {getRiskStatusBadge(vuln.current_risk)}
                        </div>
                        <p className="text-sm text-gray-300 mb-2">{vuln.cve_name}</p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="px-2 py-1 bg-gray-700 rounded">
                            Port: <span className="text-yellow-400">{vuln.affected_port}</span>
                          </span>
                          <span className={cn(
                            "px-2 py-1 rounded",
                            vuln.port_status.is_open ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
                          )}>
                            {vuln.port_status.is_open ? "Port Open" : "Port Closed"}
                          </span>
                          {vuln.port_status.source_allowed && (
                            <span className="px-2 py-1 bg-gray-700 rounded">
                              Source: <span className={vuln.port_status.source_allowed === "0.0.0.0/0" ? "text-red-400" : "text-gray-300"}>
                                {vuln.port_status.source_allowed}
                              </span>
                            </span>
                          )}
                          <span className="px-2 py-1 bg-gray-700 rounded">
                            Complexity: {vuln.exploitability.attack_complexity}
                          </span>
                        </div>
                      </div>
                    ))}
                    {simulationData.exploitable_vulnerabilities.length === 0 && (
                      <p className="text-gray-400 text-center py-4">No exploitable vulnerabilities found</p>
                    )}
                  </div>
                )}
              </div>

              {/* Data Access Scope Section */}
              <div className="bg-[#252540] rounded-lg border border-gray-700">
                <button
                  className="w-full p-4 flex items-center justify-between"
                  onClick={() => toggleSection("dataAccess")}
                >
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-400" />
                    <span className="font-medium text-white">Data Access Scope</span>
                    <Badge className="bg-blue-500/20 text-blue-400">
                      {simulationData.data_access_scope.data_stores_accessible.length} Stores
                    </Badge>
                  </div>
                  {expandedSections.dataAccess ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {expandedSections.dataAccess && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* IAM Roles */}
                    <div className="text-sm">
                      <span className="text-gray-400">IAM Roles in Path:</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {simulationData.data_access_scope.iam_roles_in_path.map((role, idx) => (
                          <Badge key={idx} variant="outline" className="text-purple-400 border-purple-500/50">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Data Stores */}
                    {simulationData.data_access_scope.data_stores_accessible.map((store, idx) => (
                      <div key={idx} className="bg-[#1a1a2e] rounded-lg p-3 border border-gray-600">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-blue-400" />
                            <span className="font-medium text-white">{store.resource_name}</span>
                            <Badge variant="outline">{store.resource_type}</Badge>
                          </div>
                          <Badge className={
                            store.access_level === "FULL" || store.access_level === "ADMIN"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-yellow-500/20 text-yellow-400"
                          }>
                            {store.access_level}
                          </Badge>
                        </div>

                        {store.accessible_objects.tables && store.accessible_objects.tables.length > 0 && (
                          <div className="mt-2">
                            <span className="text-xs text-gray-400">Accessible Tables:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {store.accessible_objects.tables.map((table, tIdx) => (
                                <span key={tIdx} className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                                  {table}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 mt-2 text-xs">
                          {store.accessible_objects.estimated_rows && (
                            <span className="px-2 py-1 bg-gray-700 rounded">
                              ~{store.accessible_objects.estimated_rows.toLocaleString()} rows
                            </span>
                          )}
                          {store.accessible_objects.contains_pii && (
                            <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded">
                              Contains PII
                            </span>
                          )}
                          {store.accessible_objects.contains_financial && (
                            <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded">
                              Financial Data
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* S3 Access */}
                    {simulationData.data_access_scope.s3_access.map((s3, idx) => (
                      <div key={idx} className="bg-[#1a1a2e] rounded-lg p-3 border border-gray-600">
                        <div className="flex items-center gap-2 mb-2">
                          <HardDrive className="h-4 w-4 text-green-400" />
                          <span className="font-medium text-white">{s3.bucket}</span>
                          <Badge variant="outline">S3</Badge>
                        </div>
                        <div className="text-xs space-y-1">
                          <div>
                            <span className="text-gray-400">Prefixes: </span>
                            {s3.accessible_prefixes.map((prefix, pIdx) => (
                              <span key={pIdx} className="text-gray-300">{prefix} </span>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <span className="px-2 py-1 bg-gray-700 rounded">
                              ~{s3.estimated_objects.toLocaleString()} objects
                            </span>
                            <span className="px-2 py-1 bg-gray-700 rounded">
                              {s3.estimated_size_gb} GB
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Attack Impacts Section */}
              <div className="bg-[#252540] rounded-lg border border-gray-700">
                <button
                  className="w-full p-4 flex items-center justify-between"
                  onClick={() => toggleSection("impacts")}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-400" />
                    <span className="font-medium text-white">What Attackers Can Do</span>
                    <Badge className="bg-orange-500/20 text-orange-400">
                      {simulationData.potential_impacts.length} Impacts
                    </Badge>
                  </div>
                  {expandedSections.impacts ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {expandedSections.impacts && (
                  <div className="px-4 pb-4">
                    <div className="grid grid-cols-2 gap-3">
                      {simulationData.potential_impacts.map((impact, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "bg-[#1a1a2e] rounded-lg p-3 border cursor-pointer transition-all",
                            impact.severity === "CRITICAL" ? "border-red-500/50" : "border-gray-600",
                            expandedImpact === impact.impact_type && "ring-2 ring-blue-500"
                          )}
                          onClick={() => setExpandedImpact(expandedImpact === impact.impact_type ? null : impact.impact_type)}
                        >
                          <div className={cn(
                            "flex items-center gap-2 mb-2",
                            impact.severity === "CRITICAL" ? "text-red-400" : "text-orange-400"
                          )}>
                            {getImpactIcon(impact.impact_type)}
                            <span className="font-medium">{getImpactLabel(impact.impact_type)}</span>
                          </div>
                          <p className="text-xs text-gray-400 mb-2 line-clamp-2">{impact.description}</p>
                          <div className="flex items-center justify-between text-xs">
                            <Badge className={getSeverityColor(impact.severity)}>{impact.severity}</Badge>
                            <span className="text-gray-500">{impact.likelihood} likelihood</span>
                          </div>

                          {expandedImpact === impact.impact_type && (
                            <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
                              <div>
                                <span className="text-xs text-gray-400">Attack Steps:</span>
                                <ol className="list-decimal list-inside text-xs text-gray-300 mt-1 space-y-1">
                                  {impact.attack_steps.map((step, sIdx) => (
                                    <li key={sIdx}>{step.replace(/^\d+\.\s*/, "")}</li>
                                  ))}
                                </ol>
                              </div>
                              {impact.affected_data && (
                                <div>
                                  <span className="text-xs text-gray-400">Affected Data:</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    <span className="px-2 py-0.5 bg-gray-700 rounded text-xs">
                                      {impact.affected_data.record_count?.toLocaleString()} records
                                    </span>
                                    {impact.affected_data.compliance_violations?.map((v, vIdx) => (
                                      <span key={vIdx} className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
                                        {v}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <p className="text-xs text-yellow-400">{impact.business_impact}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Remediation Simulator Section */}
              <div className="bg-[#252540] rounded-lg border border-gray-700">
                <button
                  className="w-full p-4 flex items-center justify-between"
                  onClick={() => toggleSection("remediation")}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-green-400" />
                    <span className="font-medium text-white">Remediation Options</span>
                    <Badge className="bg-green-500/20 text-green-400">
                      {simulationData.remediation_options.length} Available
                    </Badge>
                  </div>
                  {expandedSections.remediation ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {expandedSections.remediation && (
                  <div className="px-4 pb-4 space-y-3">
                    {simulationData.remediation_options.map((option, idx) => {
                      const isApplied = appliedRemediations.includes(option.id)
                      const isRollingBackThis = rollingBack === option.id

                      return (
                      <div
                        key={idx}
                        className={cn(
                          "bg-[#1a1a2e] rounded-lg p-3 border transition-all",
                          isApplied
                            ? "border-blue-500 ring-1 ring-blue-500/50 bg-blue-500/5"
                            : selectedRemediations.includes(option.id)
                            ? "border-green-500 ring-1 ring-green-500/50"
                            : "border-gray-600"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {isApplied ? (
                            <div className="mt-1 h-5 w-5 rounded bg-blue-500 flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          ) : (
                            <button
                              className={cn(
                                "mt-1 h-5 w-5 rounded border flex items-center justify-center",
                                selectedRemediations.includes(option.id)
                                  ? "bg-green-500 border-green-500"
                                  : "border-gray-500"
                              )}
                              onClick={() => toggleRemediation(option.id)}
                              disabled={applying}
                            >
                              {selectedRemediations.includes(option.id) && (
                                <Check className="h-3 w-3 text-white" />
                              )}
                            </button>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">{option.title}</span>
                                {isApplied && (
                                  <Badge className="bg-blue-500/20 text-blue-400">Applied</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {isApplied && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-xs border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                                    onClick={() => rollbackRemediation(option.id)}
                                    disabled={isRollingBackThis}
                                  >
                                    {isRollingBackThis ? (
                                      <>
                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-orange-400 mr-1"></div>
                                        Rolling back...
                                      </>
                                    ) : (
                                      "Rollback"
                                    )}
                                  </Button>
                                )}
                                {getEffortBadge(option.effort)}
                              </div>
                            </div>
                            <p className="text-sm text-gray-400 mb-2">{option.description}</p>

                            {/* Impact Preview */}
                            <div className="bg-[#252540] rounded p-2 space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400">Risk Reduction:</span>
                                <span className="text-green-400 font-medium">{option.impact_preview.risk_reduction}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded">
                                  Before: {option.impact_preview.before_score.toFixed(1)}
                                </span>
                                <span className="text-gray-400">-&gt;</span>
                                <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded">
                                  After: {option.impact_preview.after_score.toFixed(1)}
                                </span>
                              </div>

                              {option.impact_preview.attack_impacts_prevented && option.impact_preview.attack_impacts_prevented.length > 0 && (
                                <div>
                                  <span className="text-xs text-gray-400">Prevents:</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {option.impact_preview.attack_impacts_prevented.map((imp, iIdx) => (
                                      <Badge key={iIdx} className="bg-green-500/20 text-green-400 text-xs">
                                        {getImpactLabel(imp)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {option.impact_preview.side_effects && option.impact_preview.side_effects.length > 0 && (
                                <div className="pt-2 border-t border-gray-700">
                                  <span className="text-xs text-yellow-400 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Side Effects:
                                  </span>
                                  {option.impact_preview.side_effects.map((se, seIdx) => (
                                    <div key={seIdx} className="text-xs text-gray-300 mt-1">
                                      <span className="text-yellow-400">{se.type}:</span> {se.description}
                                      {se.affected_services.length > 0 && (
                                        <span className="text-gray-500"> (affects: {se.affected_services.join(", ")})</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {(!option.impact_preview.side_effects || option.impact_preview.side_effects.length === 0) && (
                                <div className="text-xs text-green-400 flex items-center gap-1">
                                  <Check className="h-3 w-3" />
                                  No side effects detected
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )})}

                    {/* Apply Result Message */}
                    {applyResult && (
                      <div className={cn(
                        "p-3 rounded-lg border mb-3",
                        applyResult.status === "SUCCESS"
                          ? "bg-green-500/10 border-green-500/30"
                          : applyResult.status === "PARTIAL"
                          ? "bg-yellow-500/10 border-yellow-500/30"
                          : "bg-red-500/10 border-red-500/30"
                      )}>
                        <div className="flex items-center gap-2 mb-1">
                          {applyResult.status === "SUCCESS" ? (
                            <Check className="h-4 w-4 text-green-400" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-yellow-400" />
                          )}
                          <span className={cn(
                            "font-medium",
                            applyResult.status === "SUCCESS" ? "text-green-400" : "text-yellow-400"
                          )}>
                            {applyResult.status === "SUCCESS" ? "Remediation Applied!" : applyResult.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300">{applyResult.message}</p>
                        {applyResult.newRiskScore !== undefined && (
                          <div className="flex items-center gap-3 mt-2 text-sm">
                            <span className="text-gray-400">New Risk Score:</span>
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded font-medium">
                              {applyResult.newRiskScore}
                            </span>
                            <span className="text-green-400">
                              (-{applyResult.riskReduction}% reduction)
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedRemediations.length > 0 && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setSelectedRemediations([])}
                          disabled={applying}
                        >
                          Clear Selection ({selectedRemediations.length})
                        </Button>
                        <Button
                          className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50"
                          onClick={applyRemediations}
                          disabled={applying}
                        >
                          {applying ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Applying...
                            </>
                          ) : (
                            <>Apply Remediation ({selectedRemediations.length})</>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
