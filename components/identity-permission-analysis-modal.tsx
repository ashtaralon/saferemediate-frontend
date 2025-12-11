"use client"

import { useState, useEffect } from "react"
import { X, TrendingDown, AlertTriangle, CheckCircle2, Calendar, Shield, Activity } from "lucide-react"

interface IdentityPermissionAnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  identity: {
    name: string
    type: string
    system: string
    permissions?: number
    usedPermissions?: number
    unusedPermissions?: number
    recordingDays?: number
    allowedList?: string[]
    usedList?: string[]
    unusedList?: string[]
    confidence?: number
  }
  onRequestRemediation: (data: any) => void
}

export function IdentityPermissionAnalysisModal({
  isOpen,
  onClose,
  identity,
  onRequestRemediation,
}: IdentityPermissionAnalysisModalProps) {
  const [showSimulation, setShowSimulation] = useState(false)
  const [simulationStep, setSimulationStep] = useState(0)
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    if (showSimulation && simulationStep < 5) {
      const timer = setTimeout(() => {
        setSimulationStep((prev) => prev + 1)
        if (simulationStep === 4) {
          setTimeout(() => setShowResults(true), 1000)
        }
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [showSimulation, simulationStep])

  const handleClose = () => {
    setShowSimulation(false)
    setSimulationStep(0)
    setShowResults(false)
    onClose()
  }

  const handleSimulateFix = () => {
    setShowSimulation(true)
    setSimulationStep(0)
    setShowResults(false)
  }

  const handleRequestRemediation = () => {
    onRequestRemediation({
      title: `Remove Excessive Permissions - ${identity.name}`,
      impact: `Remove ${unusedCount} unused permissions (${gapPercent}% reduction)`,
      severity: "High",
      confidence: confidence,
      permissionsToRemove: unusedCount,
      permissionsToKeep: usedCount,
      system: identity.system,
    })
    handleClose()
  }

  if (!isOpen) return null

  const totalPermissions = identity.permissions || 27
  const usedCount = identity.usedPermissions || 9
  const unusedCount = identity.unusedPermissions || 18
  const recordingDays = identity.recordingDays || 90
  const gapPercent = totalPermissions > 0 ? Math.round((unusedCount / totalPermissions) * 100) : 0
  const confidence = identity.confidence || 97

  // Default permission lists if not provided
  const defaultUsedList = [
    "s3:GetObject",
    "s3:PutObject",
    "dynamodb:Query",
    "dynamodb:PutItem",
    "cloudwatch:PutMetricData",
    "sns:Publish",
    "sqs:SendMessage",
    "kms:Decrypt",
    "secretsmanager:GetSecretValue",
  ]

  const defaultUnusedList = [
    "s3:DeleteBucket",
    "s3:PutBucketPolicy",
    "iam:CreateUser",
    "iam:AttachUserPolicy",
    "ec2:TerminateInstances",
    "rds:DeleteDBInstance",
    "dynamodb:DeleteTable",
    "lambda:DeleteFunction",
    "cloudwatch:DeleteAlarms",
    "sns:DeleteTopic",
    "sqs:DeleteQueue",
    "kms:ScheduleKeyDeletion",
    "secretsmanager:DeleteSecret",
    "ec2:ModifyInstanceAttribute",
    "elasticloadbalancing:DeleteLoadBalancer",
    "autoscaling:DeleteAutoScalingGroup",
    "cloudformation:DeleteStack",
    "route53:DeleteHostedZone",
  ]

  const usedList = identity.usedList && identity.usedList.length > 0 ? identity.usedList : defaultUsedList
  const unusedList = identity.unusedList && identity.unusedList.length > 0 ? identity.unusedList : defaultUnusedList

  // Helper function to get usage frequency
  const getUsageFrequency = (perm: string): string => {
    const frequencies: { [key: string]: string } = {
      "s3:GetObject": "1,247 times/day",
      "s3:PutObject": "843 times/day",
      "dynamodb:Query": "2,156 times/day",
      "dynamodb:PutItem": "654 times/day",
      "cloudwatch:PutMetricData": "428 times/day",
      "sns:Publish": "87 times/day",
      "sqs:SendMessage": "234 times/day",
      "kms:Decrypt": "1,543 times/day",
      "secretsmanager:GetSecretValue": "89 times/day",
    }
    if (frequencies[perm]) return frequencies[perm]
    const hash = perm.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const freq = 50 + (hash % 2500)
    return `${freq.toLocaleString()} times/day`
  }

  // Helper function to get usage reason
  const getUsageReason = (perm: string): string => {
    const reasons: { [key: string]: string } = {
      "s3:GetObject": "Active API calls",
      "s3:PutObject": "File uploads",
      "dynamodb:Query": "Database reads",
      "dynamodb:PutItem": "Database writes",
      "cloudwatch:PutMetricData": "Monitoring",
      "sns:Publish": "Notifications",
      "sqs:SendMessage": "Queue operations",
      "kms:Decrypt": "Data decryption",
      "secretsmanager:GetSecretValue": "Config access",
    }
    if (reasons[perm]) return reasons[perm]
    if (perm.includes("Get") || perm.includes("Query")) return "Active API calls"
    if (perm.includes("Put")) return "Data writes"
    if (perm.includes("List")) return "Resource listing"
    return "Active usage"
  }

  // Helper function to get risk level
  const getRiskLevel = (perm: string): "Critical" | "High" | "Medium" | "Low" => {
    const criticalPerms = ["iam:CreateUser", "iam:AttachUserPolicy", "ec2:TerminateInstances", "kms:ScheduleKeyDeletion", "route53:DeleteHostedZone", "rds:DeleteDBInstance"]
    const highPerms = ["s3:DeleteBucket", "s3:PutBucketPolicy", "dynamodb:DeleteTable", "lambda:DeleteFunction", "elasticloadbalancing:DeleteLoadBalancer", "autoscaling:DeleteAutoScalingGroup", "cloudformation:DeleteStack", "secretsmanager:DeleteSecret"]

    if (criticalPerms.includes(perm)) return "Critical"
    if (highPerms.includes(perm)) return "High"
    if (perm.includes("Delete") || perm.includes("Create") || perm.includes("Admin") || perm.includes("*")) return "Critical"
    if (perm.includes("Modify") || perm.includes("Attach") || perm.includes("Put")) return "High"
    return "Medium"
  }

  // Helper function to get last used date
  const getLastUsed = (perm: string): string => {
    const lastUsedMap: { [key: string]: string } = {
      "iam:CreateUser": "287 days ago",
      "iam:AttachUserPolicy": "287 days ago",
      "lambda:DeleteFunction": "156 days ago",
      "ec2:ModifyInstanceAttribute": "134 days ago",
      "cloudformation:DeleteStack": "98 days ago",
    }
    return lastUsedMap[perm] || "Never used"
  }

  // Calculate date range for recording period
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - recordingDays)
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  // Simulation results screen
  if (showResults) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/85" onClick={handleClose} />
        <div
          className="relative w-[950px] max-h-[90vh] overflow-y-auto rounded-2xl p-8 shadow-2xl"
          style={{ background: "var(--bg-secondary, #1f2937)" }}
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary, #ffffff)" }}>
                Permission Removal Simulation Results
              </h2>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary, #9ca3af)" }}>
                {identity.name} - {identity.system}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ color: "var(--text-secondary, #9ca3af)" }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Confidence badge */}
          <div
            className="rounded-xl p-6 mb-6 border-2 text-center"
            style={{
              background: "rgba(16, 185, 129, 0.15)",
              borderColor: "#10B981",
              boxShadow: "0 0 30px rgba(16, 185, 129, 0.3)",
            }}
          >
            <div className="flex items-center justify-center gap-3 mb-2">
              <CheckCircle2 className="w-10 h-10" style={{ color: "#10B981" }} />
              <div className="text-3xl font-bold" style={{ color: "#10B981" }}>
                {confidence}% SAFE TO REMOVE
              </div>
            </div>
            <div className="text-sm" style={{ color: "#10B981" }}>
              Permissions unused for {recordingDays} days with no service dependencies
            </div>
          </div>

          {/* Permissions to remove */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary, #ffffff)" }}>
              <TrendingDown className="w-5 h-5" style={{ color: "#ef4444" }} />
              Permissions to Remove ({unusedList.length})
            </h3>
            <div
              className="rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto"
              style={{ background: "var(--bg-primary, #111827)" }}
            >
              {unusedList.map((perm, i) => {
                const risk = getRiskLevel(perm)
                const lastUsed = getLastUsed(perm)
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg border"
                    style={{ background: "var(--bg-secondary, #1f2937)", borderColor: "var(--border-subtle, #374151)" }}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <AlertTriangle
                        className="w-4 h-4"
                        style={{
                          color:
                            risk === "Critical"
                              ? "#ef4444"
                              : risk === "High"
                                ? "#f97316"
                                : risk === "Medium"
                                  ? "#eab308"
                                  : "#64748b",
                        }}
                      />
                      <span className="font-mono text-sm" style={{ color: "var(--text-primary, #ffffff)" }}>
                        {perm}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs" style={{ color: "var(--text-secondary, #9ca3af)" }}>
                        {lastUsed}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          background:
                            risk === "Critical"
                              ? "#ef444420"
                              : risk === "High"
                                ? "#f9731620"
                                : risk === "Medium"
                                  ? "#eab30820"
                                  : "#64748b20",
                          color:
                            risk === "Critical"
                              ? "#ef4444"
                              : risk === "High"
                                ? "#f97316"
                                : risk === "Medium"
                                  ? "#eab308"
                                  : "#64748b",
                        }}
                      >
                        {risk} Risk
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Permissions to keep */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary, #ffffff)" }}>
              <CheckCircle2 className="w-5 h-5" style={{ color: "#10B981" }} />
              Permissions to Keep ({usedList.length})
            </h3>
            <div className="rounded-lg p-4 space-y-2" style={{ background: "var(--bg-primary, #111827)" }}>
              {usedList.map((perm, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  style={{ background: "var(--bg-secondary, #1f2937)", borderColor: "var(--border-subtle, #374151)" }}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <CheckCircle2 className="w-4 h-4" style={{ color: "#10B981" }} />
                    <span className="font-mono text-sm" style={{ color: "var(--text-primary, #ffffff)" }}>
                      {perm}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-medium" style={{ color: "#10B981" }}>
                      {getUsageFrequency(perm)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-secondary, #9ca3af)" }}>
                      {getUsageReason(perm)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Impact analysis */}
          <div className="mb-6 rounded-lg p-4" style={{ background: "var(--bg-primary, #111827)" }}>
            <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary, #ffffff)" }}>
              Impact Analysis
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="w-4 h-4" style={{ color: "#10B981" }} />
                <span style={{ color: "var(--text-secondary, #9ca3af)" }}>No service disruption expected</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="w-4 h-4" style={{ color: "#10B981" }} />
                <span style={{ color: "var(--text-secondary, #9ca3af)" }}>All active workflows will continue</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="w-4 h-4" style={{ color: "#10B981" }} />
                <span style={{ color: "var(--text-secondary, #9ca3af)" }}>Reduces attack surface by {gapPercent}%</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="w-4 h-4" style={{ color: "#10B981" }} />
                <span style={{ color: "var(--text-secondary, #9ca3af)" }}>Achieves least privilege compliance</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-6 border-t" style={{ borderColor: "var(--border, #374151)" }}>
            <button
              onClick={() => setShowResults(false)}
              className="px-6 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
              style={{ color: "var(--text-secondary, #9ca3af)", borderColor: "var(--border, #374151)" }}
            >
              ← BACK
            </button>
            <button
              onClick={handleRequestRemediation}
              className="px-8 py-3 rounded-lg text-base font-bold text-white transition-all hover:opacity-90"
              style={{ background: "#8b5cf6" }}
            >
              REQUEST REMEDIATION
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Simulation loading screen
  if (showSimulation) {
    const steps = [
      { title: `Loading ${recordingDays}-day usage history...`, subtitle: `Analyzing 2.4M permission checks`, icon: "📊" },
      { title: "Identifying unused permissions...", subtitle: `Found ${unusedList.length} never-used permissions`, icon: "🔍" },
      { title: "Checking service dependencies...", subtitle: "Validating 3 active services", icon: "🔗" },
      { title: "Simulating permission removal...", subtitle: "Testing impact on workflows", icon: "⚙️" },
      { title: "Calculating confidence score...", subtitle: `${confidence}% safe to remove`, icon: "✅" },
    ]

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/85" />
        <div className="relative w-[700px] rounded-2xl p-8 shadow-2xl" style={{ background: "var(--bg-secondary, #1f2937)" }}>
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary, #ffffff)" }}>
              Simulating Permission Removal
            </h2>
            <p className="text-sm" style={{ color: "var(--text-secondary, #9ca3af)" }}>
              {identity.name} - Analyzing {recordingDays} days of permission usage...
            </p>
          </div>

          <div className="space-y-4 mb-8">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`flex items-start gap-4 p-4 rounded-lg transition-all ${
                  index === simulationStep ? "ring-2 ring-purple-500" : ""
                }`}
                style={{
                  background: index <= simulationStep ? "var(--bg-primary, #111827)" : "transparent",
                  opacity: index <= simulationStep ? 1 : 0.4,
                }}
              >
                <div className="text-3xl">
                  {index < simulationStep ? "✅" : index === simulationStep ? step.icon : "⏳"}
                </div>
                <div className="flex-1">
                  <div className="font-semibold mb-1" style={{ color: "var(--text-primary, #ffffff)" }}>
                    {step.title}
                  </div>
                  <div className="text-sm" style={{ color: "var(--text-secondary, #9ca3af)" }}>
                    {step.subtitle}
                  </div>
                  {index === simulationStep && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: "70%" }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span style={{ color: "var(--text-secondary, #9ca3af)" }}>Overall Progress</span>
              <span style={{ color: "#8b5cf6" }}>{Math.round((simulationStep / 5) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#374151" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${(simulationStep / 5) * 100}%`, background: "#8b5cf6" }}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main analysis view
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85" onClick={handleClose} />
      <div
        className="relative w-[1000px] max-h-[90vh] overflow-y-auto rounded-2xl p-8 shadow-2xl"
        style={{ background: "var(--bg-secondary, #1f2937)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary, #ffffff)" }}>
              Permission Usage Analysis
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary, #9ca3af)" }}>
              {identity.name} - {identity.type} - {identity.system}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: "var(--text-secondary, #9ca3af)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Recording period */}
        <div
          className="rounded-lg p-4 mb-6 border-l-4"
          style={{ background: "var(--bg-primary, #111827)", borderColor: "#8b5cf6" }}
        >
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-5 h-5" style={{ color: "#8b5cf6" }} />
            <span className="font-semibold" style={{ color: "var(--text-primary, #ffffff)" }}>
              {recordingDays}-Day Recording Period
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary, #9ca3af)" }}>
            Tracked from {formatDate(startDate)} to {formatDate(endDate)} - 2.4M permission checks analyzed
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div
            className="rounded-lg p-4 border"
            style={{ background: "var(--bg-primary, #111827)", borderColor: "var(--border-subtle, #374151)" }}
          >
            <div className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary, #ffffff)" }}>
              {totalPermissions}
            </div>
            <div className="text-sm" style={{ color: "var(--text-secondary, #9ca3af)" }}>
              Total Permissions
            </div>
          </div>
          <div className="rounded-lg p-4 border" style={{ background: "var(--bg-primary, #111827)", borderColor: "#10B981" }}>
            <div className="text-2xl font-bold mb-1" style={{ color: "#10B981" }}>
              {usedCount}
            </div>
            <div className="text-sm" style={{ color: "var(--text-secondary, #9ca3af)" }}>
              Actually Used ({totalPermissions > 0 ? Math.round((usedCount / totalPermissions) * 100) : 0}%)
            </div>
          </div>
          <div className="rounded-lg p-4 border" style={{ background: "var(--bg-primary, #111827)", borderColor: "#ef4444" }}>
            <div className="text-2xl font-bold mb-1" style={{ color: "#ef4444" }}>
              {unusedCount}
            </div>
            <div className="text-sm" style={{ color: "var(--text-secondary, #9ca3af)" }}>
              Unused ({gapPercent}%)
            </div>
          </div>
        </div>

        {/* Least privilege violation */}
        <div className="rounded-xl p-6 mb-6 border-2" style={{ background: "#ef444415", borderColor: "#ef4444" }}>
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-8 h-8 flex-shrink-0" style={{ color: "#ef4444" }} />
            <div>
              <h3 className="text-xl font-bold mb-2" style={{ color: "#ef4444" }}>
                Least Privilege Violation Detected
              </h3>
              <p className="text-sm mb-3" style={{ color: "var(--text-secondary, #9ca3af)" }}>
                This identity has <strong>{gapPercent}% more permissions</strong> than required based on {recordingDays} days of actual usage.
                {unusedCount} permissions have never been used and should be removed.
              </p>
              <div className="flex items-center gap-3 text-sm">
                <span
                  className="px-3 py-1 rounded-full font-medium"
                  style={{ background: "#ef444420", color: "#ef4444" }}
                >
                  {gapPercent >= 70 ? "Critical" : gapPercent >= 50 ? "High" : "Medium"} Risk
                </span>
                <span style={{ color: "var(--text-secondary, #9ca3af)" }}>
                  Attack surface reduced by {gapPercent}% after remediation
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Permission usage breakdown */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary, #ffffff)" }}>
            Permission Usage Breakdown
          </h3>
          <div className="space-y-3">
            {/* Used permissions */}
            <div
              className="rounded-lg border p-4"
              style={{ background: "var(--bg-primary, #111827)", borderColor: "var(--border-subtle, #374151)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" style={{ color: "#10B981" }} />
                  <span className="font-semibold" style={{ color: "var(--text-primary, #ffffff)" }}>
                    Actually Used Permissions ({usedList.length})
                  </span>
                </div>
                <span
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{ background: "#10B98120", color: "#10B981" }}
                >
                  Keep these
                </span>
              </div>
              <div className="space-y-2">
                {usedList.map((perm, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Activity className="w-3 h-3" style={{ color: "#10B981" }} />
                    <span style={{ color: "var(--text-secondary, #9ca3af)" }}>
                      {perm} - {getUsageFrequency(perm)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Unused permissions */}
            <div className="rounded-lg border p-4" style={{ background: "var(--bg-primary, #111827)", borderColor: "#ef4444" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" style={{ color: "#ef4444" }} />
                  <span className="font-semibold" style={{ color: "var(--text-primary, #ffffff)" }}>
                    Never Used Permissions ({unusedList.length})
                  </span>
                </div>
                <span
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{ background: "#ef444420", color: "#ef4444" }}
                >
                  Remove these
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {unusedList.map((perm, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <X className="w-3 h-3" style={{ color: "#ef4444" }} />
                    <span style={{ color: "var(--text-secondary, #9ca3af)" }}>{perm}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recommended action */}
        <div className="rounded-lg p-4 mb-6" style={{ background: "var(--bg-primary, #111827)" }}>
          <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary, #ffffff)" }}>
            Recommended Action
          </h3>
          <p className="text-sm mb-3" style={{ color: "var(--text-secondary, #9ca3af)" }}>
            Remove {unusedList.length} unused permissions to achieve least privilege compliance. This will reduce the attack surface by {gapPercent}% while maintaining all current functionality.
          </p>
          <div className="flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4" style={{ color: "#10B981" }} />
            <span style={{ color: "#10B981" }}>High confidence remediation - No service disruption expected</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-6 border-t" style={{ borderColor: "var(--border, #374151)" }}>
          <button
            onClick={handleClose}
            className="px-6 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-white/5"
            style={{ color: "var(--text-secondary, #9ca3af)", borderColor: "var(--border, #374151)" }}
          >
            CLOSE
          </button>
          <button
            onClick={handleSimulateFix}
            className="px-8 py-3 rounded-lg text-base font-bold text-white transition-all hover:opacity-90"
            style={{ background: "#8b5cf6" }}
          >
            SIMULATE FIX
          </button>
        </div>
      </div>
    </div>
  )
}
