"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Bot, Shield, Key, Database, Activity, AlertTriangle,
  RefreshCw, Globe, Crown, Zap, Server, Cpu, Workflow, CheckCircle,
} from "lucide-react"
import { PermissionPlane } from "./permission-plane"
import { NetworkPlane } from "./network-plane"
import { DataPlane } from "./data-plane"

interface NHIProfilePageProps {
  identityName: string
}

const SUB_TYPE_ICONS: Record<string, any> = {
  "Lambda Execution Role": Workflow,
  "EC2 Instance Profile": Server,
  "ECS Task Role": Cpu,
  "Service Role": Workflow,
  "IAM Role": Key,
}

export function NHIProfilePage({ identityName }: NHIProfilePageProps) {
  const router = useRouter()
  const [identity, setIdentity] = useState<any>(null)
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [remediationResults, setRemediationResults] = useState<Record<string, any>>({})

  useEffect(() => {
    fetchIdentityData()
  }, [identityName])

  const fetchIdentityData = async () => {
    setLoading(true)
    try {
      // Fetch NHI list to find this identity's basic info
      const [nhiRes, detailRes] = await Promise.all([
        fetch("/api/proxy/identities/nhi"),
        fetch(`/api/proxy/identities/detail/${encodeURIComponent(identityName)}`),
      ])

      if (nhiRes.ok) {
        const nhiList = await nhiRes.json()
        const found = (Array.isArray(nhiList) ? nhiList : []).find(
          (n: any) => n.name === identityName || n.arn?.includes(identityName)
        )
        if (found) setIdentity(found)
      }

      if (detailRes.ok) {
        setDetail(await detailRes.json())
      }
    } catch (err) {
      console.error("Error fetching NHI profile:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleRemediationComplete = (plane: string, result: any) => {
    setRemediationResults(prev => ({ ...prev, [plane]: result }))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary, #f8fafc)" }}>
        <RefreshCw className="w-8 h-8 animate-spin" style={{ color: "#8b5cf6" }} />
        <span className="ml-3 text-lg" style={{ color: "var(--text-secondary, #64748b)" }}>Loading NHI Profile...</span>
      </div>
    )
  }

  const riskColor = identity?.risk_level === 'Critical' ? '#ef4444' : identity?.risk_level === 'High' ? '#f97316' : identity?.risk_level === 'Medium' ? '#eab308' : '#22c55e'
  const SubIcon = SUB_TYPE_ICONS[identity?.sub_type] || Bot
  const systemName = identity?.system_name || detail?.basic_info?.system_name || ''

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary, #f8fafc)" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b" style={{ background: "var(--bg-surface, #ffffff)", borderColor: "var(--border, #e2e8f0)" }}>
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-lg hover:opacity-80 transition-opacity"
                style={{ background: "var(--bg-secondary, #f1f5f9)" }}
              >
                <ArrowLeft className="w-5 h-5" style={{ color: "var(--text-secondary, #64748b)" }} />
              </button>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#8b5cf615" }}>
                <SubIcon className="w-6 h-6" style={{ color: "#8b5cf6" }} />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold" style={{ color: "var(--text-primary, #0f172a)" }}>{identityName}</h1>
                  <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: `${riskColor}20`, color: riskColor }}>
                    {identity?.risk_level || 'Unknown'} Risk
                  </span>
                  {identity?.is_admin && <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#ef444420", color: "#ef4444" }}>Admin</span>}
                  {identity?.has_wildcard && <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#f9731620", color: "#f97316" }}>Wildcard</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>
                  <span>{identity?.sub_type || detail?.basic_info?.sub_type || 'IAM Role'}</span>
                  {systemName && <><span>|</span><span>{systemName}</span></>}
                  <span>|</span>
                  <span>{identity?.observation_days || 90} days observed</span>
                  <span>|</span>
                  <span>{identity?.confidence || detail?.basic_info?.risk_score || 0}% confidence</span>
                </div>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="flex items-center gap-4">
              <div className="text-center px-4">
                <div className="text-2xl font-bold" style={{ color: "var(--text-primary, #0f172a)" }}>{identity?.permissions_count || 0}</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted, #94a3b8)" }}>Permissions</div>
              </div>
              <div className="text-center px-4">
                <div className="text-2xl font-bold" style={{ color: "#ef4444" }}>{identity?.unused_permissions_count || 0}</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted, #94a3b8)" }}>Unused</div>
              </div>
              <div className="text-center px-4">
                <div className="text-2xl font-bold" style={{ color: identity?.gap_percentage >= 70 ? '#ef4444' : identity?.gap_percentage >= 40 ? '#f97316' : '#22c55e' }}>
                  {identity?.gap_percentage?.toFixed(0) || 0}%
                </div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted, #94a3b8)" }}>Gap</div>
              </div>
              <button
                onClick={fetchIdentityData}
                className="p-2 rounded-lg hover:opacity-80 transition-opacity"
                style={{ background: "var(--bg-secondary, #f1f5f9)" }}
              >
                <RefreshCw className="w-4 h-4" style={{ color: "var(--text-secondary, #64748b)" }} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Planes */}
      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Recommendations Banner */}
        {detail?.recommendations?.length > 0 && (
          <div className="rounded-xl p-4 border" style={{ background: "#f59e0b08", borderColor: "#f59e0b30" }}>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-2" style={{ color: "#f59e0b" }}>
              <Zap className="w-4 h-4" /> Recommendations
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {detail.recommendations.map((rec: string, i: number) => (
                <div key={i} className="text-sm flex items-start gap-2" style={{ color: "var(--text-primary, #334155)" }}>
                  <span style={{ color: "#f59e0b" }}>-</span> {rec}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Permission Plane */}
        <PermissionPlane
          identityName={identityName}
          detail={detail}
          identity={identity}
          onRemediate={(result) => handleRemediationComplete('permission', result)}
        />

        {/* Network Plane */}
        <NetworkPlane
          identityName={identityName}
          detail={detail}
          identity={identity}
          onRemediate={(result) => handleRemediationComplete('network', result)}
        />

        {/* Data Plane */}
        <DataPlane
          identityName={identityName}
          detail={detail}
          identity={identity}
          onRemediate={(result) => handleRemediationComplete('data', result)}
        />

        {/* Remediation Results */}
        {Object.keys(remediationResults).length > 0 && (
          <div className="rounded-xl p-4 border" style={{ background: "#22c55e08", borderColor: "#22c55e30" }}>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-2" style={{ color: "#22c55e" }}>
              <CheckCircle className="w-4 h-4" /> Remediation Applied
            </h3>
            <div className="space-y-1">
              {Object.entries(remediationResults).map(([plane, result]) => (
                <div key={plane} className="text-sm" style={{ color: "var(--text-primary, #334155)" }}>
                  <span className="font-medium capitalize">{plane}:</span> {result?.snapshot_id || result?.checkpoint_id || 'Applied'} — Rollback available
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
