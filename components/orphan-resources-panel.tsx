"use client"

/**
 * Unified Orphan Resources panel — surfaces orphan/stale findings from the
 * four account-wide detection endpoints shipped in Phases 1-4:
 *
 *   GET /api/security-groups/orphan-detection
 *   GET /api/iam-roles/orphan-detection
 *   GET /api/s3-buckets/orphan-detection
 *   GET /api/iam-policies/orphan-detection
 *
 * Read-only visibility for the demo. Action buttons (Quarantine / Delete)
 * route to the existing quarantine flow / hardened DELETE endpoints — both
 * of which enforce the override_lineage + OverrideEvent contract per
 * Decision Contract §7. The "Action" buttons here are stubs that link out
 * to those existing flows; this panel intentionally does NOT inline a
 * destructive action so the operator always passes through the modal that
 * captures rationale + acknowledgements + rollback plan.
 */

import { useEffect, useState } from "react"
import { AlertTriangle, Database, Globe, Key, Lock, RefreshCw, Server, Shield } from "lucide-react"

type Status = "orphan" | "stale" | "active" | "excluded"

interface IAMRoleFinding {
  role_name: string
  role_arn?: string | null
  path?: string | null
  created_date?: string | null
  last_used_date?: string | null
  days_since_last_use?: number | null
  status: Status
  severity: string
  confidence: string
  safe_to_delete: boolean
  recommendation: string
  attached_policies_count?: number
  inline_policies_count?: number
  inbound_use_edges?: number
  inbound_use_edges_fresh?: number
  exclusion_reason?: string | null
}

interface S3Finding {
  bucket_name: string
  region?: string | null
  created_date?: string | null
  days_since_created?: number | null
  object_count_sample?: number | null
  object_count_sampled_capped?: boolean
  last_observed_access?: string | null
  days_since_last_observed?: number | null
  status: Status
  severity: string
  confidence: string
  safe_to_delete: boolean
  recommendation: string
  is_public?: boolean
  has_bucket_policy?: boolean
  inbound_access_edges?: number
  inbound_access_edges_fresh?: number
  exclusion_reason?: string | null
}

interface PolicyFinding {
  policy_name: string
  policy_arn: string
  path?: string | null
  created_date?: string | null
  days_since_created?: number | null
  attachment_count: number
  permissions_boundary_usage_count?: number
  is_attachable?: boolean
  default_version_id?: string | null
  version_count?: number
  graph_attachment_edges?: number
  status: Status
  severity: string
  confidence: string
  safe_to_delete: boolean
  recommendation: string
  exclusion_reason?: string | null
}

interface SGFinding {
  sg_id?: string
  sg_name?: string
  vpc_id?: string
  status?: string
  severity?: string
  recommendation?: string
  attachment_count?: number
  current_attachments?: number
  has_public_ingress?: boolean
  safe_to_delete?: boolean
}

type TabKey = "summary" | "iam_role" | "s3_bucket" | "iam_policy" | "security_group"

const TAB_META: Record<Exclude<TabKey, "summary">, { label: string; icon: any; description: string }> = {
  iam_role: {
    label: "IAM Roles",
    icon: Key,
    description: "Roles with no recent AssumeRole events and no fresh graph edges.",
  },
  s3_bucket: {
    label: "S3 Buckets",
    icon: Database,
    description: "Buckets with no observed read/write access in the lookback window.",
  },
  iam_policy: {
    label: "IAM Policies",
    icon: Lock,
    description: "Customer-managed policies with zero attachments and no permissions-boundary usage.",
  },
  security_group: {
    label: "Security Groups",
    icon: Shield,
    description: "Unattached SGs (also surfaced in the dedicated orphan-SG view + the IAM least-privilege view earlier).",
  },
}

function severityColor(sev: string): string {
  switch ((sev || "").toUpperCase()) {
    case "CRITICAL":
      return "bg-rose-500/20 text-rose-200 border-rose-500/40"
    case "HIGH":
      return "bg-amber-500/20 text-amber-200 border-amber-500/40"
    case "MEDIUM":
      return "bg-yellow-500/15 text-yellow-200 border-yellow-500/40"
    case "LOW":
      return "bg-emerald-500/15 text-emerald-200 border-emerald-500/40"
    default:
      return "bg-slate-600/20 text-slate-300 border-slate-600/40"
  }
}

function statusColor(status: string): string {
  switch ((status || "").toLowerCase()) {
    case "orphan":
      return "text-rose-300"
    case "stale":
      return "text-amber-300"
    case "active":
      return "text-emerald-300"
    case "excluded":
      return "text-slate-500"
    default:
      return "text-slate-300"
  }
}

export function OrphanResourcesPanel() {
  const [activeTab, setActiveTab] = useState<TabKey>("summary")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [iamRoles, setIamRoles] = useState<IAMRoleFinding[]>([])
  const [iamRolesSummary, setIamRolesSummary] = useState<any>(null)
  const [s3Buckets, setS3Buckets] = useState<S3Finding[]>([])
  const [s3Summary, setS3Summary] = useState<any>(null)
  const [policies, setPolicies] = useState<PolicyFinding[]>([])
  const [policiesSummary, setPoliciesSummary] = useState<any>(null)
  const [sgs, setSgs] = useState<SGFinding[]>([])
  const [sgSummary, setSgSummary] = useState<any>(null)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [iamRolesResp, s3Resp, policiesResp, sgResp] = await Promise.all([
        fetch("/api/proxy/iam-roles/orphan-detection?stale_days=90", { cache: "no-store" }),
        fetch("/api/proxy/s3-buckets/orphan-detection?stale_days=90", { cache: "no-store" }),
        fetch("/api/proxy/iam-policies/orphan-detection", { cache: "no-store" }),
        fetch("/api/proxy/security-groups/orphan-detection?days=90", { cache: "no-store" }).catch(() => null),
      ])

      if (iamRolesResp.ok) {
        const j = await iamRolesResp.json()
        setIamRoles(j.findings || [])
        setIamRolesSummary({
          total: j.total_roles_analyzed,
          orphan: j.orphan_count,
          stale: j.stale_count,
          active: j.active_count,
          excluded: j.excluded_count,
        })
      }
      if (s3Resp.ok) {
        const j = await s3Resp.json()
        setS3Buckets(j.findings || [])
        setS3Summary({
          total: j.total_buckets_analyzed,
          orphan: j.orphan_count,
          stale: j.stale_count,
          active: j.active_count,
          excluded: j.excluded_count,
        })
      }
      if (policiesResp.ok) {
        const j = await policiesResp.json()
        setPolicies(j.findings || [])
        setPoliciesSummary({
          total: j.total_policies_analyzed,
          orphan: j.orphan_count,
          active: j.active_count,
          excluded: j.excluded_count,
        })
      }
      if (sgResp && sgResp.ok) {
        const j = await sgResp.json()
        setSgs(j.findings || [])
        setSgSummary({
          total: j.total_security_groups_analyzed ?? (j.findings?.length ?? 0),
          orphan: j.orphan_count ?? 0,
          unused: j.unused_count ?? 0,
        })
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load orphan findings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto p-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-300" />
              Orphan Resources
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-3xl">
              Account-wide view of resources with no observed use. Every destructive action against
              these (quarantine or delete) routes through the override-lineage flow with a pre-deletion
              snapshot + an OverrideEvent audit record per Decision Contract §7.
            </p>
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="px-3 py-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 border-b border-slate-800 mb-4">
          {(["summary", "iam_role", "s3_bucket", "iam_policy", "security_group"] as TabKey[]).map((k) => {
            const isActive = activeTab === k
            const label = k === "summary" ? "Summary" : TAB_META[k as Exclude<TabKey, "summary">].label
            return (
              <button
                key={k}
                onClick={() => setActiveTab(k)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? "border-amber-400 text-amber-200"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {activeTab === "summary" && (
          <SummaryGrid
            iamRolesSummary={iamRolesSummary}
            s3Summary={s3Summary}
            policiesSummary={policiesSummary}
            sgSummary={sgSummary}
          />
        )}
        {activeTab === "iam_role" && <IAMRoleTable findings={iamRoles} />}
        {activeTab === "s3_bucket" && <S3Table findings={s3Buckets} />}
        {activeTab === "iam_policy" && <PolicyTable findings={policies} />}
        {activeTab === "security_group" && <SGTable findings={sgs} />}
      </div>
    </div>
  )
}

function SummaryCard({
  title,
  icon: Icon,
  total,
  orphan,
  stale,
  excluded,
  description,
}: {
  title: string
  icon: any
  total?: number
  orphan?: number
  stale?: number
  excluded?: number
  description: string
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
        </div>
        <span className="text-xs text-slate-500">total: {total ?? "—"}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-2xl font-bold text-rose-300">{orphan ?? "—"}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Orphan</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-amber-300">{stale ?? "—"}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Stale</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-500">{excluded ?? "—"}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Excluded</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{description}</p>
    </div>
  )
}

function SummaryGrid({
  iamRolesSummary,
  s3Summary,
  policiesSummary,
  sgSummary,
}: {
  iamRolesSummary: any
  s3Summary: any
  policiesSummary: any
  sgSummary: any
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard
        title="IAM Roles"
        icon={Key}
        total={iamRolesSummary?.total}
        orphan={iamRolesSummary?.orphan}
        stale={iamRolesSummary?.stale}
        excluded={iamRolesSummary?.excluded}
        description={TAB_META.iam_role.description}
      />
      <SummaryCard
        title="S3 Buckets"
        icon={Database}
        total={s3Summary?.total}
        orphan={s3Summary?.orphan}
        stale={s3Summary?.stale}
        excluded={s3Summary?.excluded}
        description={TAB_META.s3_bucket.description}
      />
      <SummaryCard
        title="IAM Policies"
        icon={Lock}
        total={policiesSummary?.total}
        orphan={policiesSummary?.orphan}
        excluded={policiesSummary?.excluded}
        description={TAB_META.iam_policy.description}
      />
      <SummaryCard
        title="Security Groups"
        icon={Shield}
        total={sgSummary?.total}
        orphan={sgSummary?.orphan}
        description={TAB_META.security_group.description}
      />
    </div>
  )
}

function IAMRoleTable({ findings }: { findings: IAMRoleFinding[] }) {
  if (findings.length === 0) {
    return <EmptyState message="No orphan or stale IAM roles to surface." />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="py-2 px-3">Role</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Severity</th>
            <th className="py-2 px-3">AWS last used</th>
            <th className="py-2 px-3">Graph edges</th>
            <th className="py-2 px-3">Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.role_arn || f.role_name} className="border-b border-slate-900 hover:bg-slate-900/40">
              <td className="py-2 px-3 font-mono text-slate-200">{f.role_name}</td>
              <td className={`py-2 px-3 capitalize ${statusColor(f.status)}`}>{f.status}</td>
              <td className="py-2 px-3">
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase border ${severityColor(f.severity)}`}>
                  {f.severity}
                </span>
              </td>
              <td className="py-2 px-3 text-slate-400">
                {f.days_since_last_use !== null && f.days_since_last_use !== undefined
                  ? `${f.days_since_last_use}d ago`
                  : "never"}
              </td>
              <td className="py-2 px-3 text-slate-400 font-mono text-xs">
                {f.inbound_use_edges ?? 0}/{f.inbound_use_edges_fresh ?? 0}
              </td>
              <td className="py-2 px-3 text-slate-400 text-xs max-w-md">{f.recommendation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function S3Table({ findings }: { findings: S3Finding[] }) {
  if (findings.length === 0) {
    return <EmptyState message="No orphan or stale S3 buckets to surface." />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="py-2 px-3">Bucket</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Severity</th>
            <th className="py-2 px-3">Public</th>
            <th className="py-2 px-3">Objects (sample)</th>
            <th className="py-2 px-3">Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.bucket_name} className="border-b border-slate-900 hover:bg-slate-900/40">
              <td className="py-2 px-3 font-mono text-slate-200">{f.bucket_name}</td>
              <td className={`py-2 px-3 capitalize ${statusColor(f.status)}`}>{f.status}</td>
              <td className="py-2 px-3">
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase border ${severityColor(f.severity)}`}>
                  {f.severity}
                </span>
              </td>
              <td className="py-2 px-3">
                {f.is_public ? (
                  <span className="inline-flex items-center gap-1 text-rose-300 text-xs">
                    <Globe className="w-3 h-3" />
                    public
                  </span>
                ) : (
                  <span className="text-slate-500 text-xs">private</span>
                )}
              </td>
              <td className="py-2 px-3 text-slate-400 font-mono text-xs">
                {(f.object_count_sample ?? 0).toLocaleString()}
                {f.object_count_sampled_capped ? "+" : ""}
              </td>
              <td className="py-2 px-3 text-slate-400 text-xs max-w-md">{f.recommendation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PolicyTable({ findings }: { findings: PolicyFinding[] }) {
  if (findings.length === 0) {
    return <EmptyState message="No orphan IAM policies to surface." />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="py-2 px-3">Policy</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Severity</th>
            <th className="py-2 px-3">Attachments (AWS / graph)</th>
            <th className="py-2 px-3">Versions</th>
            <th className="py-2 px-3">Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.policy_arn} className="border-b border-slate-900 hover:bg-slate-900/40">
              <td className="py-2 px-3 font-mono text-slate-200">{f.policy_name}</td>
              <td className={`py-2 px-3 capitalize ${statusColor(f.status)}`}>{f.status}</td>
              <td className="py-2 px-3">
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase border ${severityColor(f.severity)}`}>
                  {f.severity}
                </span>
              </td>
              <td className="py-2 px-3 text-slate-400 font-mono text-xs">
                {f.attachment_count}/{f.graph_attachment_edges ?? 0}
              </td>
              <td className="py-2 px-3 text-slate-400 font-mono text-xs">{f.version_count ?? 1}</td>
              <td className="py-2 px-3 text-slate-400 text-xs max-w-md">{f.recommendation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SGTable({ findings }: { findings: SGFinding[] }) {
  if (findings.length === 0) {
    return <EmptyState message="No orphan SGs returned by /api/security-groups/orphan-detection." />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="py-2 px-3">SG</th>
            <th className="py-2 px-3">VPC</th>
            <th className="py-2 px-3">Severity</th>
            <th className="py-2 px-3">Public ingress</th>
            <th className="py-2 px-3">Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.sg_id || f.sg_name} className="border-b border-slate-900 hover:bg-slate-900/40">
              <td className="py-2 px-3 font-mono text-slate-200">
                {f.sg_name} <span className="text-slate-500 text-xs">{f.sg_id}</span>
              </td>
              <td className="py-2 px-3 text-slate-500 font-mono text-xs">{f.vpc_id}</td>
              <td className="py-2 px-3">
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase border ${severityColor(f.severity || "")}`}>
                  {f.severity || "—"}
                </span>
              </td>
              <td className="py-2 px-3">
                {f.has_public_ingress ? (
                  <span className="inline-flex items-center gap-1 text-rose-300 text-xs">
                    <Globe className="w-3 h-3" />
                    0.0.0.0/0
                  </span>
                ) : (
                  <span className="text-slate-500 text-xs">no</span>
                )}
              </td>
              <td className="py-2 px-3 text-slate-400 text-xs max-w-md">{f.recommendation || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-slate-500 text-sm">
      <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
      {message}
    </div>
  )
}
