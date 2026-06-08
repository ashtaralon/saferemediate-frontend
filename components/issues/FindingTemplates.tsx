"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Shield, User, Network, Lock, Key } from "lucide-react"
import type { SecurityFinding } from "@/lib/types"

interface FindingTemplatesProps {
  finding: SecurityFinding
}

/**
 * FindingTemplates - Renders specialized UI for different finding types
 * 
 * Supports:
 * - admin_user_no_mfa: Admin user without MFA + actual usage
 * - nacl_overly_permissive: Network ACL with 0.0.0.0/0 rules
 * - unused_permission: IAM role with unused permissions (existing)
 */
export function FindingTemplates({ finding }: FindingTemplatesProps) {
  const findingType = (finding as any).type || "unused_permission"
  
  // Admin User + No MFA Template
  if (findingType === "admin_user_no_mfa") {
    const userData = finding as any
    const usedActions = userData.used_actions || []
    const accessKeyAge = userData.access_key_age_days
    const lastActivity = userData.last_activity
    
    return (
      <Card className="border-[#ef444440] bg-[#ef444410]/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ef444420] rounded-lg">
              <User className="w-6 h-6 text-[#ef4444]" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">{finding.title}</CardTitle>
              <p className="text-sm text-[var(--muted-foreground,#4b5563)] mt-1">{finding.description}</p>
            </div>
            <Badge className="bg-red-600 text-white">CRITICAL</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Risk Factors */}
          <div className="bg-white rounded-lg p-4 border border-[#ef444440]">
            <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Risk Factors
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#ef4444]" />
                <span className="text-[var(--foreground,#374151)]">No MFA enabled</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#ef4444]" />
                <span className="text-[var(--foreground,#374151)]">Has AdministratorAccess policy</span>
              </div>
              {accessKeyAge && (
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#ef4444]" />
                  <span className="text-[var(--foreground,#374151)]">Access keys: {accessKeyAge} days old</span>
                </div>
              )}
              {lastActivity && (
                <div className="flex items-center gap-2">
                  <span className="text-[var(--foreground,#374151)]">Last activity: {new Date(lastActivity).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actual Usage */}
          <div className="bg-white rounded-lg p-4 border border-[#3b82f640]">
            <h4 className="font-semibold text-blue-900 mb-3">
              🔍 ACTUAL USAGE (last 30 days via usage telemetry)
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--muted-foreground,#4b5563)]">ALLOWED:</span>
                <Badge className="bg-[#ef444420] text-[#ef4444]">AdministratorAccess (2,500+ actions)</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--muted-foreground,#4b5563)]">ACTUALLY USED:</span>
                <Badge className="bg-[#22c55e20] text-[#22c55e]">{usedActions.length} actions</Badge>
              </div>
              <div className="mt-3 p-3 bg-gray-50 rounded">
                <div className="text-xs font-mono space-y-1 max-h-32 overflow-y-auto">
                  {usedActions.slice(0, 10).map((action: string, i: number) => (
                    <div key={i} className="text-[var(--foreground,#374151)]">• {action}</div>
                  ))}
                  {usedActions.length > 10 && (
                    <div className="text-[var(--muted-foreground,#6b7280)]">+ {usedActions.length - 10} more actions</div>
                  )}
                </div>
              </div>
              <div className="mt-2 text-xs text-[#ef4444] font-semibold">
                GAP: {2500 - usedActions.length} unused admin permissions! 😱
              </div>
            </div>
          </div>

          {/* Recommended Remediation */}
          <div className="bg-white rounded-lg p-4 border border-[#22c55e40]">
            <h4 className="font-semibold text-green-900 mb-3">💡 RECOMMENDED REMEDIATION</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="font-semibold">Step 1:</span>
                <span>Replace AdministratorAccess with scoped policy (only {usedActions.length} permissions needed)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold">Step 2:</span>
                <span>Enforce MFA requirement</span>
              </div>
              {accessKeyAge && accessKeyAge > 90 && (
                <div className="flex items-start gap-2">
                  <span className="font-semibold">Step 3:</span>
                  <span>Rotate access keys ({accessKeyAge} days old → new)</span>
                </div>
              )}
            </div>
          </div>

          {/* Confidence */}
          <div className="bg-white rounded-lg p-4 border border-[#3b82f640]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--foreground,#374151)]">CONFIDENCE:</span>
              <Badge className="bg-green-600 text-white">{userData.confidence || 99}%</Badge>
            </div>
            <div className="mt-2 text-xs text-[var(--muted-foreground,#4b5563)]">
              Based on {userData.observation_days || 30} days, {userData.api_call_count || 0} API calls observed
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // NACL Overly Permissive Template
  if (findingType === "nacl_overly_permissive") {
    const naclData = finding as any
    const permissiveRules = naclData.permissive_rules || []
    const vpcId = naclData.vpc_id
    const naclId = naclData.nacl_id
    
    return (
      <Card className="border-[#f9731640] bg-[#f9731610]/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#f9731620] rounded-lg">
              <Network className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">{finding.title}</CardTitle>
              <p className="text-sm text-[var(--muted-foreground,#4b5563)] mt-1">{finding.description}</p>
            </div>
            <Badge className="bg-orange-600 text-white">
              {finding.severity?.toUpperCase() || "HIGH"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Network Details */}
          <div className="bg-white rounded-lg p-4 border border-[#f9731640]">
            <h4 className="font-semibold text-orange-900 mb-3 flex items-center gap-2">
              <Network className="w-4 h-4" />
              Network Details
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-[var(--muted-foreground,#4b5563)]">NACL ID:</span>
                <div className="font-mono text-[var(--foreground,#111827)]">{naclId}</div>
              </div>
              <div>
                <span className="text-[var(--muted-foreground,#4b5563)]">VPC ID:</span>
                <div className="font-mono text-[var(--foreground,#111827)]">{vpcId}</div>
              </div>
            </div>
          </div>

          {/* Permissive Rules */}
          <div className="bg-white rounded-lg p-4 border border-[#ef444440]">
            <h4 className="font-semibold text-red-900 mb-3">
              ⚠️ Permissive Rules (0.0.0.0/0)
            </h4>
            <div className="space-y-2">
              {permissiveRules.map((rule: any, i: number) => (
                <div key={i} className="p-2 bg-[#ef444410] rounded border border-[#ef444440]">
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
          <div className="bg-white rounded-lg p-4 border border-[#22c55e40]">
            <h4 className="font-semibold text-green-900 mb-3">💡 RECOMMENDED REMEDIATION</h4>
            <div className="text-sm text-[var(--foreground,#374151)]">
              <p className="mb-2">
                Restrict NACL rules to specific IP ranges instead of 0.0.0.0/0:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Replace 0.0.0.0/0 with specific CIDR blocks (e.g., office IPs, VPN ranges)</li>
                <li>Use security groups for application-level access control</li>
                <li>Consider removing overly permissive rules if not needed</li>
              </ul>
            </div>
          </div>

          {/* Confidence */}
          <div className="bg-white rounded-lg p-4 border border-[#3b82f640]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--foreground,#374151)]">CONFIDENCE:</span>
              <Badge className="bg-green-600 text-white">{naclData.confidence || 95}%</Badge>
            </div>
            <div className="mt-2 text-xs text-[var(--muted-foreground,#4b5563)]">
              Based on NACL rule analysis
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Default template for other finding types (unused_permission, etc.)
  return null
}
