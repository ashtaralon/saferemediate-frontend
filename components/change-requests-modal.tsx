"use client"

import { useState } from "react"
import {
  X,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  Users,
  MessageSquare,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Play,
  Camera,
  Activity,
  RotateCcw,
  Target,
} from "lucide-react"

interface ChangeRequest {
  requestId: string
  submittedAt: string
  status: "pending_approval" | "approved" | "rejected" | "scheduled" | "in_progress" | "completed" | "cancelled"
  incident: {
    title: string
    severity: string
    impact: string
    confidence: number
  }
  scheduledTime: string
  approvers: Array<{
    name: string
    role: string
    avatar: string
    email: string
    status: "pending" | "approved" | "rejected" | "requested_reschedule"
    approvedAt?: string
    notes?: string
    rescheduleRequest?: string
  }>
  formData: {
    priority: string
    createSnapshot: boolean
    enableMonitoring: boolean
    autoRollback: boolean
    notes: string
  }
  simulationData?: any
}

interface ChangeRequestsModalProps {
  isOpen: boolean
  onClose: () => void
  requests: ChangeRequest[]
}

export function ChangeRequestsModal({ isOpen, onClose, requests }: ChangeRequestsModalProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null)

  if (!isOpen) return null

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return { bg: "#10b981", text: "white" }
      case "pending_approval":
        return { bg: "#f59e0b", text: "white" }
      case "rejected":
        return { bg: "#ef4444", text: "white" }
      case "scheduled":
        return { bg: "#3b82f6", text: "white" }
      case "in_progress":
        return { bg: "#8b5cf6", text: "white" }
      case "completed":
        return { bg: "#059669", text: "white" }
      case "cancelled":
        return { bg: "#6b7280", text: "white" }
      default:
        return { bg: "#6b7280", text: "white" }
    }
  }

  const getApprovalStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
      case "rejected":
        return <XCircle className="w-4 h-4 text-[#ef4444]" />
      case "requested_reschedule":
        return <Calendar className="w-4 h-4 text-orange-600" />
      default:
        return <Clock className="w-4 h-4 text-[var(--muted-foreground,#9ca3af)]" />
    }
  }

  const formatStatus = (status: string) => {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      req.incident.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.requestId.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || req.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getOverallApprovalStatus = (request: ChangeRequest) => {
    const approved = request.approvers.filter((a) => a.status === "approved").length
    const total = request.approvers.length
    const rejected = request.approvers.some((a) => a.status === "rejected")
    const rescheduleRequests = request.approvers.filter((a) => a.status === "requested_reschedule").length

    if (rejected) return { text: "Rejected", color: "red" }
    if (approved === total) return { text: "Fully Approved", color: "green" }
    if (rescheduleRequests > 0) return { text: `${rescheduleRequests} Reschedule Request(s)`, color: "orange" }
    return { text: `${approved}/${total} Approved`, color: "gray" }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border,#e5e7eb)] bg-white">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-[var(--foreground,#111827)] mb-2">Change Requests Dashboard</h2>
              <p className="text-sm text-[var(--muted-foreground,#4b5563)]">Track and manage all remediation approval requests</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white transition-colors">
              <X className="w-6 h-6 text-[var(--muted-foreground,#4b5563)]" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Total", count: requests.length, color: "#6b7280" },
              {
                label: "Pending",
                count: requests.filter((r) => r.status === "pending_approval").length,
                color: "#f59e0b",
              },
              { label: "Approved", count: requests.filter((r) => r.status === "approved").length, color: "#10b981" },
              { label: "Scheduled", count: requests.filter((r) => r.status === "scheduled").length, color: "#3b82f6" },
              { label: "Completed", count: requests.filter((r) => r.status === "completed").length, color: "#059669" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-lg p-3 border border-[var(--border,#e5e7eb)] hover:shadow-md transition-all"
              >
                <div className="text-2xl font-bold mb-1" style={{ color: stat.color }}>
                  {stat.count}
                </div>
                <div className="text-xs text-[var(--muted-foreground,#4b5563)]">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Search & Filters */}
          <div className="flex gap-3 mt-4">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground,#9ca3af)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by request ID or issue title..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--border,#d1d5db)] focus:border-[#3b82f6] outline-none text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 rounded-lg border border-[var(--border,#d1d5db)] focus:border-[#3b82f6] outline-none text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {filteredRequests.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-8 h-8 text-[var(--muted-foreground,#9ca3af)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--foreground,#111827)] mb-2">No Change Requests Found</h3>
                <p className="text-sm text-[var(--muted-foreground,#4b5563)]">
                  {searchQuery || statusFilter !== "all"
                    ? "Try adjusting your search or filters"
                    : "Submit your first remediation request to get started"}
                </p>
              </div>
            ) : (
              filteredRequests.map((request) => {
                const isExpanded = expandedRequest === request.requestId
                const statusColors = getStatusColor(request.status)
                const approvalStatus = getOverallApprovalStatus(request)
                const severityColor =
                  request.incident.severity === "Critical"
                    ? "#DC2626"
                    : request.incident.severity === "High"
                      ? "#F97316"
                      : request.incident.severity === "Medium"
                        ? "#F59E0B"
                        : "#3B82F6"

                return (
                  <div
                    key={request.requestId}
                    className="border border-[var(--border,#e5e7eb)] rounded-xl bg-white shadow-sm hover:shadow-md transition-all overflow-hidden"
                  >
                    {/* Request Header */}
                    <button
                      onClick={() => setExpandedRequest(isExpanded ? null : request.requestId)}
                      className="w-full p-5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 mt-1">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-[var(--muted-foreground,#4b5563)]" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-[var(--muted-foreground,#4b5563)]" />
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="text-xs font-mono font-bold text-[#3b82f6]">{request.requestId}</span>
                                <span
                                  className="text-xs px-2 py-1 rounded font-semibold"
                                  style={{ background: statusColors.bg, color: statusColors.text }}
                                >
                                  {formatStatus(request.status)}
                                </span>
                                <span
                                  className="text-xs px-2 py-1 rounded font-semibold text-white"
                                  style={{ background: severityColor }}
                                >
                                  {request.incident.severity}
                                </span>
                              </div>
                              <h3 className="text-base font-semibold text-[var(--foreground,#111827)] mb-1">{request.incident.title}</h3>
                              <p className="text-sm text-[var(--muted-foreground,#4b5563)] mb-2">{request.incident.impact}</p>
                              <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground,#6b7280)]">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Submitted: {new Date(request.submittedAt).toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Target className="w-3 h-3" />
                                  {request.incident.confidence}% confidence
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Approval Status Bar */}
                          <div className="bg-gray-50 rounded-lg p-3 border border-[var(--border,#e5e7eb)]">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-[var(--foreground,#374151)]">Approval Status:</span>
                              <span
                                className={`text-xs font-semibold ${
                                  approvalStatus.color === "green"
                                    ? "text-[#22c55e]"
                                    : approvalStatus.color === "red"
                                      ? "text-[#ef4444]"
                                      : approvalStatus.color === "orange"
                                        ? "text-orange-600"
                                        : "text-[var(--muted-foreground,#4b5563)]"
                                }`}
                              >
                                {approvalStatus.text}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {request.approvers.map((approver, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 flex-1">
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-sm flex-shrink-0">
                                    {approver.avatar}
                                  </div>
                                  {getApprovalStatusIcon(approver.status)}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-[var(--border,#e5e7eb)] bg-gray-50">
                        <div className="pt-5 space-y-4">
                          {/* Scheduled Time */}
                          <div>
                            <h4 className="text-sm font-semibold text-[var(--foreground,#111827)] mb-2 flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-[#3b82f6]" />
                              Scheduled Execution
                            </h4>
                            <div className="p-3 bg-white rounded-lg border border-[var(--border,#e5e7eb)]">
                              <p className="text-sm text-[var(--foreground,#111827)]">{request.scheduledTime}</p>
                            </div>
                          </div>

                          {/* Detailed Approver Status */}
                          <div>
                            <h4 className="text-sm font-semibold text-[var(--foreground,#111827)] mb-3 flex items-center gap-2">
                              <Users className="w-4 h-4 text-[#8b5cf6]" />
                              Approver Details
                            </h4>
                            <div className="space-y-2">
                              {request.approvers.map((approver, idx) => (
                                <div key={idx} className="p-4 bg-white rounded-lg border border-[var(--border,#e5e7eb)]">
                                  <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-xl flex-shrink-0">
                                      {approver.avatar}
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between mb-1">
                                        <div>
                                          <div className="text-sm font-semibold text-[var(--foreground,#111827)]">{approver.name}</div>
                                          <div className="text-xs text-[var(--muted-foreground,#4b5563)]">{approver.role}</div>
                                          <div className="text-xs text-[var(--muted-foreground,#6b7280)]">{approver.email}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {getApprovalStatusIcon(approver.status)}
                                          <span
                                            className={`text-xs font-semibold ${
                                              approver.status === "approved"
                                                ? "text-[#22c55e]"
                                                : approver.status === "rejected"
                                                  ? "text-[#ef4444]"
                                                  : approver.status === "requested_reschedule"
                                                    ? "text-orange-600"
                                                    : "text-[var(--muted-foreground,#6b7280)]"
                                            }`}
                                          >
                                            {formatStatus(approver.status)}
                                          </span>
                                        </div>
                                      </div>
                                      {approver.approvedAt && (
                                        <div className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">
                                          {approver.status === "approved" ? "Approved" : "Responded"} at:{" "}
                                          {new Date(approver.approvedAt).toLocaleString()}
                                        </div>
                                      )}
                                      {approver.notes && (
                                        <div className="mt-2 p-2 bg-[#3b82f610] rounded border border-[#3b82f640]">
                                          <div className="text-xs font-semibold text-blue-900 mb-1">Notes:</div>
                                          <div className="text-xs text-[#3b82f6]">{approver.notes}</div>
                                        </div>
                                      )}
                                      {approver.rescheduleRequest && (
                                        <div className="mt-2 p-2 bg-[#f9731610] rounded border border-[#f9731640]">
                                          <div className="text-xs font-semibold text-orange-900 mb-1">
                                            Reschedule Request:
                                          </div>
                                          <div className="text-xs text-[#f97316]">{approver.rescheduleRequest}</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Safety Configuration */}
                          <div>
                            <h4 className="text-sm font-semibold text-[var(--foreground,#111827)] mb-2 flex items-center gap-2">
                              <Activity className="w-4 h-4 text-[#22c55e]" />
                              Safety Configuration
                            </h4>
                            <div className="p-3 bg-white rounded-lg border border-[var(--border,#e5e7eb)] space-y-2">
                              {request.formData.createSnapshot && (
                                <div className="flex items-center gap-2 text-sm text-[var(--foreground,#374151)]">
                                  <Camera className="w-4 h-4 text-[#3b82f6]" />
                                  Snapshot will be created before remediation
                                </div>
                              )}
                              {request.formData.enableMonitoring && (
                                <div className="flex items-center gap-2 text-sm text-[var(--foreground,#374151)]">
                                  <Activity className="w-4 h-4 text-[#22c55e]" />
                                  Post-remediation monitoring enabled
                                </div>
                              )}
                              {request.formData.autoRollback && (
                                <div className="flex items-center gap-2 text-sm text-[var(--foreground,#374151)]">
                                  <RotateCcw className="w-4 h-4 text-orange-600" />
                                  Automatic rollback on failure
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Simulation Results */}
                          {request.simulationData && (
                            <div>
                              <h4 className="text-sm font-semibold text-[var(--foreground,#111827)] mb-2 flex items-center gap-2">
                                <Play className="w-4 h-4 text-[#8b5cf6]" />
                                Simulation Results
                              </h4>
                              <div className="p-3 bg-[#22c55e10] rounded-lg border border-[#22c55e40]">
                                <div className="flex items-center gap-2 mb-2">
                                  <CheckCircle2 className="w-5 h-5 text-[#22c55e]" />
                                  <span className="font-semibold text-green-900">
                                    {request.simulationData.confidence}% Confidence - SAFE TO APPLY
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs text-[var(--foreground,#374151)]">
                                  <div>Risk: {request.simulationData.riskLevel}</div>
                                  <div>Downtime: {request.simulationData.estimatedDowntime}</div>
                                  <div>Services: {request.simulationData.servicesAffected}</div>
                                  <div>Rollback: {request.simulationData.rollbackTime}</div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Additional Notes */}
                          {request.formData.notes && (
                            <div>
                              <h4 className="text-sm font-semibold text-[var(--foreground,#111827)] mb-2 flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-[var(--muted-foreground,#4b5563)]" />
                                Additional Notes
                              </h4>
                              <div className="p-3 bg-white rounded-lg border border-[var(--border,#e5e7eb)]">
                                <p className="text-sm text-[var(--foreground,#374151)]">{request.formData.notes}</p>
                              </div>
                            </div>
                          )}

                          {/* External System Integration */}
                          <div className="bg-[#3b82f610] border border-[#3b82f640] rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="text-sm font-semibold text-blue-900 mb-1">
                                  External Approval System Integration
                                </h4>
                                <p className="text-xs text-[#3b82f6]">
                                  This request is synced with your organization's approval workflow system
                                </p>
                              </div>
                              <button className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-all flex items-center gap-1.5">
                                <ExternalLink className="w-3 h-3" />
                                View in System
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[var(--border,#e5e7eb)] bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-[var(--muted-foreground,#4b5563)]">
            Showing {filteredRequests.length} of {requests.length} requests
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
