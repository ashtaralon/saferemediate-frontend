"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  AlertTriangle, 
  Shield, 
  User, 
  Network, 
  Lock, 
  Key,
  ChevronDown,
  ChevronUp,
  Zap,
  ExternalLink,
  CheckCircle2
} from "lucide-react"
import type { SecurityFinding } from "@/lib/types"
import { SimulateFixModal } from "@/components/SimulateFixModal"

interface FindingCardProps {
  finding: SecurityFinding
  onSimulate?: (finding: SecurityFinding) => void
  isSimulating?: boolean
}

const getSeverityColor = (severity: string) => {
  switch (severity?.toLowerCase()) {
    case "critical":
      return "bg-red-600 text-white"
    case "high":
      return "bg-orange-600 text-white"
    case "medium":
      return "bg-yellow-600 text-white"
    case "low":
      return "bg-blue-600 text-white"
    default:
      return "bg-gray-600 text-white"
  }
}

const getSeverityIcon = (severity: string) => {
  switch (severity?.toLowerCase()) {
    case "critical":
    case "high":
      return <AlertTriangle className="w-5 h-5" />
    default:
      return <Shield className="w-5 h-5" />
  }
}

export function FindingCard({ finding, onSimulate, isSimulating }: FindingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showSimulateModal, setShowSimulateModal] = useState(false)
  
  const findingType = (finding as any).type || "unused_permission"
  const severity = finding.severity || "medium"
  
  const handleSimulate = () => {
    if (onSimulate) {
      onSimulate(finding)
    }
    setShowSimulateModal(true)
  }

  const handleExecute = async (findingId: string) => {
    // This will be handled by SimulateFixModal
    console.log("Execute remediation for:", findingId)
  }

  // Render IAM Role finding
  if (findingType === "iam_unused_permissions" || findingType === "unused_permission") {
    const iamData = finding as any
    // Try multiple field names for backward compatibility
    const unusedActions = iamData.unusedActions || iamData.unused_actions || iamData.unused_permissions || iamData.details?.unusedActions || []
    const allowedActions = iamData.allowed_actions || iamData.details?.allowedActions || []
    const usedActions = iamData.used_actions || iamData.details?.usedActions || []
    // Get counts - prefer direct count fields, fallback to array length
    const allowedCount = iamData.allowedCount || iamData.details?.allowedCount || allowedActions.length || 0
    const usedCount = iamData.usedCount || iamData.details?.usedCount || usedActions.length || 0
    const unusedCount = iamData.unusedCount || iamData.details?.unusedCount || unusedActions.length || 0
    const roleName = iamData.role_name || finding.resourceId

    return (
      <>
        <Card className={`border-l-4 ${
          severity === "critical" ? "border-l-red-600" :
          severity === "high" ? "border-l-orange-600" :
          severity === "medium" ? "border-l-yellow-600" :
          "border-l-blue-600"
        } hover:shadow-lg transition-shadow`}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className={`p-2 rounded-lg ${
                  severity === "critical" ? "bg-[#ef444420]" :
                  severity === "high" ? "bg-[#f9731620]" :
                  severity === "medium" ? "bg-[#eab30820]" :
                  "bg-[#3b82f620]"
                }`}>
                  <Shield className={`w-5 h-5 ${
                    severity === "critical" ? "text-[#ef4444]" :
                    severity === "high" ? "text-orange-600" :
                    severity === "medium" ? "text-yellow-600" :
                    "text-[#3b82f6]"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge className={getSeverityColor(severity)}>
                      {severity.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">IAM Role</Badge>
                    {iamData.confidence && (
                      <Badge variant="outline" className="text-xs">
                        {iamData.confidence}% confidence
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg mb-1">{finding.title}</CardTitle>
                  <p className="text-sm text-[var(--muted-foreground,#4b5563)] line-clamp-2">{finding.description}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="ml-2"
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </CardHeader>

          {isExpanded && (
            <CardContent className="space-y-4 pt-0">
              {/* IAM Details */}
              <div className="bg-gray-50 rounded-lg p-4 border">
                <h4 className="font-semibold text-[var(--foreground,#111827)] mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  IAM Details
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-[var(--muted-foreground,#4b5563)]">Role Name:</span>
                    <div className="font-mono text-[var(--foreground,#111827)] mt-1">{roleName}</div>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground,#4b5563)]">Resource:</span>
                    <div className="text-[var(--foreground,#111827)] mt-1 truncate">{finding.resource}</div>
                  </div>
                </div>
              </div>

              {/* Gap Analysis */}
              <div className="bg-[#3b82f610] rounded-lg p-4 border border-[#3b82f640]">
                <h4 className="font-semibold text-blue-900 mb-3">📊 Gap Analysis</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#3b82f6]">{allowedCount}</div>
                    <div className="text-xs text-[var(--muted-foreground,#4b5563)] mt-1">Allowed Actions</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#22c55e]">{usedCount}</div>
                    <div className="text-xs text-[var(--muted-foreground,#4b5563)] mt-1">Actually Used</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#ef4444]">{unusedCount}</div>
                    <div className="text-xs text-[var(--muted-foreground,#4b5563)] mt-1">Unused</div>
                  </div>
                </div>
                {iamData.observation_days && (
                  <div className="mt-3 text-xs text-[var(--muted-foreground,#4b5563)] text-center">
                    Based on {iamData.observation_days} days of CloudTrail analysis
                  </div>
                )}
              </div>

              {/* Unused Permissions */}
              {unusedActions.length > 0 && (
                <div className="bg-[#ef444410] rounded-lg p-4 border border-[#ef444440]">
                  <h4 className="font-semibold text-red-900 mb-3">
                    ⚠️ Unused Permissions ({unusedActions.length})
                  </h4>
                  <div className="max-h-40 overflow-y-auto">
                    <div className="text-xs font-mono space-y-1">
                      {unusedActions.slice(0, 20).map((action: string, i: number) => (
                        <div key={i} className="text-[#ef4444]">• {action}</div>
                      ))}
                      {unusedActions.length > 20 && (
                        <div className="text-[#ef4444] font-semibold">
                          + {unusedActions.length - 20} more permissions
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Remediation */}
              <div className="bg-[#22c55e10] rounded-lg p-4 border border-[#22c55e40]">
                <h4 className="font-semibold text-green-900 mb-2">💡 Remediation</h4>
                <p className="text-sm text-[var(--foreground,#374151)] mb-3">{finding.remediation || "Remove unused permissions to follow least privilege principle"}</p>
                <Button
                  onClick={handleSimulate}
                  disabled={isSimulating}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isSimulating ? (
                    <>Loading...</>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Simulate Fix
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          )}

          {!isExpanded && (
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <div className="text-sm text-[var(--muted-foreground,#4b5563)]">
                  {unusedCount} unused permissions • {iamData.confidence || 0}% confidence
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSimulate}
                  disabled={isSimulating}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Simulate
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {showSimulateModal && (
          <SimulateFixModal
            isOpen={showSimulateModal}
            onClose={() => setShowSimulateModal(false)}
            finding={finding}
            onExecute={handleExecute}
            backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"}
          />
        )}
      </>
    )
  }

  // Render Admin User + No MFA finding
  if (findingType === "admin_user_no_mfa") {
    const userData = finding as any
    const usedActions = userData.used_actions || []
    const accessKeyAge = userData.access_key_age_days
    const lastActivity = userData.last_activity
    const userName = userData.user_name || finding.resourceId

    return (
      <>
        <Card className="border-l-4 border-l-red-600 hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className="p-2 rounded-lg bg-[#ef444420]">
                  <User className="w-5 h-5 text-[#ef4444]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge className="bg-red-600 text-white">CRITICAL</Badge>
                    <Badge variant="outline">Admin User</Badge>
                    <Badge variant="outline" className="bg-[#ef444420] text-[#ef4444]">No MFA</Badge>
                  </div>
                  <CardTitle className="text-lg mb-1">{finding.title}</CardTitle>
                  <p className="text-sm text-[var(--muted-foreground,#4b5563)] line-clamp-2">{finding.description}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="ml-2"
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </CardHeader>

          {isExpanded && (
            <CardContent className="space-y-4 pt-0">
              {/* User Details */}
              <div className="bg-gray-50 rounded-lg p-4 border">
                <h4 className="font-semibold text-[var(--foreground,#111827)] mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  User Details
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-[var(--muted-foreground,#4b5563)]">Username:</span>
                    <div className="font-mono text-[var(--foreground,#111827)] mt-1">{userName}</div>
                  </div>
                  {accessKeyAge && (
                    <div>
                      <span className="text-[var(--muted-foreground,#4b5563)]">Access Key Age:</span>
                      <div className="text-[#ef4444] font-semibold mt-1">{accessKeyAge} days</div>
                    </div>
                  )}
                  {lastActivity && (
                    <div className="col-span-2">
                      <span className="text-[var(--muted-foreground,#4b5563)]">Last Activity:</span>
                      <div className="text-[var(--foreground,#111827)] mt-1">{new Date(lastActivity).toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Admin Policies */}
              <div className="bg-[#ef444410] rounded-lg p-4 border border-[#ef444440]">
                <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Risk Factors
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#ef4444]" />
                    <span className="text-[var(--foreground,#374151)]">No MFA enabled</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#ef4444]" />
                    <span className="text-[var(--foreground,#374151)]">Has AdministratorAccess policy</span>
                  </div>
                  {accessKeyAge && accessKeyAge > 180 && (
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-[#ef4444]" />
                      <span className="text-[var(--foreground,#374151)]">Access keys are {accessKeyAge} days old</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Usage Gap */}
              <div className="bg-[#3b82f610] rounded-lg p-4 border border-[#3b82f640]">
                <h4 className="font-semibold text-blue-900 mb-3">📊 Usage Gap Analysis</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#ef4444]">2,500+</div>
                    <div className="text-xs text-[var(--muted-foreground,#4b5563)] mt-1">Allowed (Admin)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#22c55e]">{usedActions.length}</div>
                    <div className="text-xs text-[var(--muted-foreground,#4b5563)] mt-1">Actually Used</div>
                  </div>
                </div>
                <div className="mt-3 text-center">
                  <div className="text-lg font-bold text-[#ef4444]">
                    GAP: {2500 - usedActions.length} unused permissions
                  </div>
                </div>
                {usedActions.length > 0 && (
                  <div className="mt-3 p-2 bg-white rounded text-xs font-mono max-h-24 overflow-y-auto">
                    {usedActions.slice(0, 10).map((action: string, i: number) => (
                      <div key={i} className="text-[var(--foreground,#374151)]">• {action}</div>
                    ))}
                    {usedActions.length > 10 && (
                      <div className="text-[var(--muted-foreground,#6b7280)]">+ {usedActions.length - 10} more</div>
                    )}
                  </div>
                )}
              </div>

              {/* Remediation */}
              <div className="bg-[#22c55e10] rounded-lg p-4 border border-[#22c55e40]">
                <h4 className="font-semibold text-green-900 mb-2">💡 Remediation</h4>
                <div className="space-y-2 text-sm text-[var(--foreground,#374151)] mb-3">
                  <div>1. Replace AdministratorAccess with scoped policy ({usedActions.length} actions)</div>
                  <div>2. Enforce MFA requirement</div>
                  {accessKeyAge && accessKeyAge > 90 && (
                    <div>3. Rotate access keys ({accessKeyAge} days old)</div>
                  )}
                </div>
                <Button
                  onClick={handleSimulate}
                  disabled={isSimulating}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isSimulating ? (
                    <>Loading...</>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Simulate Fix
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          )}

          {!isExpanded && (
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <div className="text-sm text-[var(--muted-foreground,#4b5563)]">
                  {usedActions.length} actions used • {userData.confidence || 99}% confidence
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSimulate}
                  disabled={isSimulating}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Simulate
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {showSimulateModal && (
          <SimulateFixModal
            isOpen={showSimulateModal}
            onClose={() => setShowSimulateModal(false)}
            finding={finding}
            onExecute={handleExecute}
            backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"}
          />
        )}
      </>
    )
  }

  // Render NACL finding
  if (findingType === "nacl_overly_permissive") {
    const naclData = finding as any
    const permissiveRules = naclData.permissive_rules || []
    const vpcId = naclData.vpc_id
    const naclId = naclData.nacl_id

    return (
      <>
        <Card className={`border-l-4 ${
          severity === "critical" ? "border-l-red-600" : "border-l-orange-600"
        } hover:shadow-lg transition-shadow`}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className={`p-2 rounded-lg ${
                  severity === "critical" ? "bg-[#ef444420]" : "bg-[#f9731620]"
                }`}>
                  <Network className={`w-5 h-5 ${
                    severity === "critical" ? "text-[#ef4444]" : "text-orange-600"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge className={getSeverityColor(severity)}>
                      {severity.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">Network ACL</Badge>
                  </div>
                  <CardTitle className="text-lg mb-1">{finding.title}</CardTitle>
                  <p className="text-sm text-[var(--muted-foreground,#4b5563)] line-clamp-2">{finding.description}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="ml-2"
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </CardHeader>

          {isExpanded && (
            <CardContent className="space-y-4 pt-0">
              {/* Network Details */}
              <div className="bg-gray-50 rounded-lg p-4 border">
                <h4 className="font-semibold text-[var(--foreground,#111827)] mb-3 flex items-center gap-2">
                  <Network className="w-4 h-4" />
                  Network Details
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-[var(--muted-foreground,#4b5563)]">NACL ID:</span>
                    <div className="font-mono text-[var(--foreground,#111827)] mt-1">{naclId}</div>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground,#4b5563)]">VPC ID:</span>
                    <div className="font-mono text-[var(--foreground,#111827)] mt-1">{vpcId}</div>
                  </div>
                </div>
              </div>

              {/* Permissive Rules */}
              <div className="bg-[#ef444410] rounded-lg p-4 border border-[#ef444440]">
                <h4 className="font-semibold text-red-900 mb-3">
                  ⚠️ Permissive Rules (0.0.0.0/0)
                </h4>
                <div className="space-y-2">
                  {permissiveRules.map((rule: any, i: number) => (
                    <div key={i} className="p-2 bg-white rounded border border-[#ef444440]">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-mono text-[#ef4444]">Rule #{rule.rule_number}</span>
                        <Badge className="bg-red-600 text-white">
                          {rule.port_range} (Protocol: {rule.protocol})
                        </Badge>
                      </div>
                      <div className="text-xs text-[#ef4444] mt-1">
                        Allows traffic from 0.0.0.0/0 (all IPs)
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remediation */}
              <div className="bg-[#22c55e10] rounded-lg p-4 border border-[#22c55e40]">
                <h4 className="font-semibold text-green-900 mb-2">💡 Remediation</h4>
                <div className="text-sm text-[var(--foreground,#374151)] mb-3 space-y-1">
                  <div>• Replace 0.0.0.0/0 with specific CIDR blocks</div>
                  <div>• Use security groups for application-level access</div>
                  <div>• Remove overly permissive rules if not needed</div>
                </div>
                <Button
                  onClick={handleSimulate}
                  disabled={isSimulating}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isSimulating ? (
                    <>Loading...</>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Simulate Fix
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          )}

          {!isExpanded && (
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <div className="text-sm text-[var(--muted-foreground,#4b5563)]">
                  {permissiveRules.length} permissive rules • {naclData.confidence || 95}% confidence
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSimulate}
                  disabled={isSimulating}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Simulate
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {showSimulateModal && (
          <SimulateFixModal
            isOpen={showSimulateModal}
            onClose={() => setShowSimulateModal(false)}
            finding={finding}
            onExecute={handleExecute}
            backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"}
          />
        )}
      </>
    )
  }

  // Default card for Security Groups and other types
  return (
    <>
      <Card className={`border-l-4 ${
        severity === "critical" ? "border-l-red-600" :
        severity === "high" ? "border-l-orange-600" :
        severity === "medium" ? "border-l-yellow-600" :
        "border-l-blue-600"
      } hover:shadow-lg transition-shadow`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div className={`p-2 rounded-lg ${
                severity === "critical" ? "bg-[#ef444420]" :
                severity === "high" ? "bg-[#f9731620]" :
                severity === "medium" ? "bg-[#eab30820]" :
                "bg-[#3b82f620]"
              }`}>
                {getSeverityIcon(severity)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge className={getSeverityColor(severity)}>
                    {severity.toUpperCase()}
                  </Badge>
                  <Badge variant="outline">{finding.category || finding.resourceType}</Badge>
                </div>
                <CardTitle className="text-lg mb-1">{finding.title}</CardTitle>
                <p className="text-sm text-[var(--muted-foreground,#4b5563)] line-clamp-2">{finding.description}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="ml-2"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="space-y-4 pt-0">
            <div className="bg-gray-50 rounded-lg p-4 border">
              <h4 className="font-semibold text-[var(--foreground,#111827)] mb-3">Details</h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-[var(--muted-foreground,#4b5563)]">Resource:</span>
                  <div className="text-[var(--foreground,#111827)] mt-1">{finding.resource}</div>
                </div>
                <div>
                  <span className="text-[var(--muted-foreground,#4b5563)]">Type:</span>
                  <div className="text-[var(--foreground,#111827)] mt-1">{finding.resourceType}</div>
                </div>
                {finding.discoveredAt && (
                  <div>
                    <span className="text-[var(--muted-foreground,#4b5563)]">Discovered:</span>
                    <div className="text-[var(--foreground,#111827)] mt-1">{new Date(finding.discoveredAt).toLocaleString()}</div>
                  </div>
                )}
              </div>
            </div>

            {finding.remediation && (
              <div className="bg-[#22c55e10] rounded-lg p-4 border border-[#22c55e40]">
                <h4 className="font-semibold text-green-900 mb-2">💡 Remediation</h4>
                <p className="text-sm text-[var(--foreground,#374151)] mb-3">{finding.remediation}</p>
                <Button
                  onClick={handleSimulate}
                  disabled={isSimulating}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isSimulating ? (
                    <>Loading...</>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Simulate Fix
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        )}

        {!isExpanded && finding.remediation && (
          <CardContent className="pt-0">
            <div className="flex items-center justify-between">
              <div className="text-sm text-[var(--muted-foreground,#4b5563)]">
                {finding.category || "Security Finding"}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSimulate}
                disabled={isSimulating}
              >
                <Zap className="w-4 h-4 mr-2" />
                Simulate
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {showSimulateModal && (
        <SimulateFixModal
          isOpen={showSimulateModal}
          onClose={() => setShowSimulateModal(false)}
          finding={finding}
          onExecute={handleExecute}
          backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"}
        />
      )}
    </>
  )
}
