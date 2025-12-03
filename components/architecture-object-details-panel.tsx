"use client"

import { useState } from "react"
import { X, Copy, ExternalLink, ChevronDown, ChevronUp } from "lucide-react"

interface DetailsPanelProps {
  object: any
  onClose: () => void
  isOpen: boolean
}

export function ArchitectureObjectDetailsPanel({ object, onClose, isOpen }: DetailsPanelProps) {
  const [activeTab, setActiveTab] = useState("overview")
  const [expandedPolicies, setExpandedPolicies] = useState<string[]>([])
  const [showJson, setShowJson] = useState<string | null>(null)

  if (!isOpen || !object) return null

  const togglePolicyExpansion = (policyName: string) => {
    setExpandedPolicies((prev) =>
      prev.includes(policyName) ? prev.filter((p) => p !== policyName) : [...prev, policyName],
    )
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const renderIAMRoleDetails = () => {
    if (object.type !== "iam-role") return null

    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-6 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <span
                className="px-3 py-1 rounded-full text-xs font-bold"
                style={{ background: "#E9D5FF", color: "#6B21A8" }}
              >
                IAM ROLE
              </span>
              <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                {object.name}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                📋 Policies
              </div>
              <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {object.policiesCount || 3}
              </div>
            </div>
            <div>
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                🔓 Permissions
              </div>
              <div className="text-2xl font-bold" style={{ color: "#A855F7" }}>
                {object.permissionsCount || 245}
              </div>
            </div>
            <div>
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                🔗 Attached To
              </div>
              <div className="text-2xl font-bold" style={{ color: "#3B82F6" }}>
                {object.attachedCount || 5}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 px-6 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          {["overview", "permissions", "trustpolicy", "usage", "security"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="pb-2 text-sm font-medium transition-colors relative capitalize"
              style={{
                color: activeTab === tab ? "var(--action-primary)" : "var(--text-secondary)",
              }}
            >
              {tab === "trustpolicy" ? "Trust Policy" : tab}
              {activeTab === tab && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ background: "var(--action-primary)" }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="font-semibold text-lg mb-3" style={{ color: "var(--text-primary)" }}>
                  Basic Information
                </h3>
                <div
                  className="rounded-lg p-4 space-y-3"
                  style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)" }}
                >
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                      ARN
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs flex-1" style={{ color: "var(--text-primary)" }}>
                        arn:aws:iam::123456789012:role/{object.name}
                      </code>
                      <button
                        onClick={() => copyToClipboard(`arn:aws:iam::123456789012:role/${object.name}`)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                      Role ID
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs" style={{ color: "var(--text-primary)" }}>
                        AROAI23HXM2KXVN4QWXYZ
                      </code>
                      <button
                        onClick={() => copyToClipboard("AROAI23HXM2KXVN4QWXYZ")}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                        Created
                      </div>
                      <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                        March 15, 2024
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        8 months ago
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                        Last Used
                      </div>
                      <div className="text-sm font-semibold" style={{ color: "#10B981" }}>
                        2 minutes ago
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        Service: Lambda
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trust Relationships */}
              <div>
                <h3 className="font-semibold text-lg mb-3" style={{ color: "var(--text-primary)" }}>
                  Trust Relationships
                </h3>
                <div className="space-y-2">
                  <div className="p-4 rounded-lg border" style={{ background: "#DBEAFE", borderColor: "#3B82F6" }}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🖥️</span>
                      <div className="flex-1">
                        <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                          EC2
                        </div>
                        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          Action: sts:AssumeRole
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border" style={{ background: "#DBEAFE", borderColor: "#3B82F6" }}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">λ</span>
                      <div className="flex-1">
                        <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                          Lambda
                        </div>
                        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          Action: sts:AssumeRole
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <h3 className="font-semibold text-lg mb-3" style={{ color: "var(--text-primary)" }}>
                  Recent Activity
                </h3>
                <div className="space-y-3">
                  {[
                    { time: "2 minutes ago", action: "AssumeRole called by Lambda", status: "success" },
                    { time: "15 minutes ago", action: "ListBucket on S3", status: "success" },
                    { time: "1 hour ago", action: "PutItem on DynamoDB", status: "success" },
                  ].map((event, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-1.5" style={{ background: "#10B981" }} />
                      <div className="flex-1">
                        <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                          {event.action}
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {event.time}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "permissions" && (
            <div className="space-y-6">
              {/* Warning */}
              <div className="p-4 rounded border-l-4" style={{ background: "#FFF7ED", borderColor: "#F97316" }}>
                <div className="flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <div className="font-semibold" style={{ color: "#EA580C" }}>
                      Over-Privileged Role Detected
                    </div>
                    <div className="text-sm mt-1" style={{ color: "#9A3412" }}>
                      This role has admin-level permissions. Consider applying least-privilege.
                    </div>
                  </div>
                </div>
              </div>

              {/* Attached Policies */}
              <div>
                <h3 className="font-semibold text-lg mb-3" style={{ color: "var(--text-primary)" }}>
                  Attached Policies
                </h3>

                {/* Policy 1 - AWS Managed */}
                <div
                  className="mb-4 rounded-lg border p-4"
                  style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
                >
                  <div className="flex justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📋</span>
                      <div>
                        <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                          AmazonS3FullAccess
                        </div>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: "#DBEAFE", color: "#1E40AF" }}
                        >
                          AWS Managed
                        </span>
                      </div>
                    </div>
                    <div className="text-sm font-bold" style={{ color: "#3B82F6" }}>
                      47 permissions
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div
                      className="px-2 py-1 rounded text-xs text-center"
                      style={{ background: "#D1FAE5", color: "#065F46" }}
                    >
                      Read: 15
                    </div>
                    <div
                      className="px-2 py-1 rounded text-xs text-center"
                      style={{ background: "#FED7AA", color: "#9A3412" }}
                    >
                      Write: 20
                    </div>
                    <div
                      className="px-2 py-1 rounded text-xs text-center"
                      style={{ background: "#FEE2E2", color: "#991B1B" }}
                    >
                      Admin: 12
                    </div>
                  </div>

                  <button
                    onClick={() => togglePolicyExpansion("s3-full-access")}
                    className="text-sm font-medium flex items-center gap-2"
                    style={{ color: "var(--action-primary)" }}
                  >
                    {expandedPolicies.includes("s3-full-access") ? (
                      <>
                        Hide Permissions <ChevronUp className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        View All Permissions <ChevronDown className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {expandedPolicies.includes("s3-full-access") && (
                    <div
                      className="mt-3 rounded p-3 max-h-64 overflow-y-auto space-y-2"
                      style={{ background: "var(--bg-tertiary)" }}
                    >
                      {[
                        { action: "s3:GetObject", resource: "*", risk: "high" },
                        { action: "s3:PutObject", resource: "*", risk: "high" },
                        { action: "s3:DeleteObject", resource: "*", risk: "critical" },
                        { action: "s3:ListBucket", resource: "arn:aws:s3:::payment-*", risk: "low" },
                      ].map((perm, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center py-2 border-b"
                          style={{ borderColor: "var(--border-subtle)" }}
                        >
                          <div>
                            <code className="text-xs" style={{ color: "var(--text-primary)" }}>
                              {perm.action}
                            </code>
                            <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                              Resource: {perm.resource}
                            </div>
                          </div>
                          {perm.resource === "*" && (
                            <span
                              className="text-xs px-2 py-0.5 rounded"
                              style={{ background: "#FED7AA", color: "#9A3412" }}
                            >
                              ⚠️ Wildcard
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div
          className="p-4 border-t flex justify-between"
          style={{ background: "var(--bg-tertiary)", borderColor: "var(--border-subtle)" }}
        >
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Last modified: 2 days ago
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 rounded text-sm font-medium border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              <ExternalLink className="w-4 h-4 inline mr-1" />
              View in AWS Console
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed right-0 top-0 bottom-0 w-[480px] shadow-2xl z-30 animate-slide-in"
      style={{ background: "var(--bg-secondary)" }}
    >
      {renderIAMRoleDetails()}
    </div>
  )
}
