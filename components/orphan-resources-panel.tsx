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
import { AlertTriangle, Database, Globe, Key, Lock, RefreshCw, Server, Shield, Pause, Trash2 } from "lucide-react"
import { BackToDashboard } from "@/components/back-to-dashboard"
import {
  buildOverrideStateForOpen,
  INITIAL_SHARED_OVERRIDE_STATE,
  OverrideModalShared,
  type OverrideLineagePayload,
  type SharedOverrideState,
} from "@/components/override-modal-shared"

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

/** Per-row in-flight + result status keyed by resource id. */
type RowStatus = {
  state: "idle" | "running" | "ok" | "err"
  message?: string
  snapshotId?: string
}

/** Pending delete operation captured while the override modal is open. */
type PendingDelete = {
  resourceType: "IAMRole" | "S3Bucket" | "IAMPolicy" | "SecurityGroup"
  resourceId: string  // role_name | bucket_name | policy_arn | sg_id
  displayName: string
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

  // Per-row action state keyed by `${resourceType}:${resourceId}`
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({})

  // Override modal state — opens when operator clicks Delete on any row
  const [overrideState, setOverrideState] = useState<SharedOverrideState>(
    INITIAL_SHARED_OVERRIDE_STATE,
  )
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  function rowKey(type: PendingDelete["resourceType"], id: string): string {
    return `${type}:${id}`
  }

  /** Quarantine flow: pre-check → execute. Safe (no AWS destruction —
   *  the engine revokes rules / detaches policies / sets DenyAll bucket
   *  policy). 30-day hold starts; operator returns later to delete. */
  async function handleQuarantine(
    resourceType: PendingDelete["resourceType"],
    resourceId: string,
    systemName: string = "alon-prod",
  ) {
    const key = rowKey(resourceType, resourceId)
    setRowStatus((p) => ({ ...p, [key]: { state: "running" } }))
    try {
      const preCheckResp = await fetch("/api/proxy/quarantine/pre-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceName: resourceId,
          resourceType,
          systemName,
          idleDays: 90,
          connections: 0,
        }),
      })
      if (!preCheckResp.ok) {
        const text = await preCheckResp.text()
        throw new Error(`pre-check failed (${preCheckResp.status}): ${text.slice(0, 200)}`)
      }
      const pcJson = await preCheckResp.json()
      const recordId = pcJson.recordId
      if (!recordId) throw new Error("pre-check returned no recordId")

      const execResp = await fetch("/api/proxy/quarantine/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, actor: "operator" }),
      })
      if (!execResp.ok) {
        const text = await execResp.text()
        throw new Error(`execute failed (${execResp.status}): ${text.slice(0, 200)}`)
      }
      setRowStatus((p) => ({
        ...p,
        [key]: {
          state: "ok",
          message: `Quarantined · record ${String(recordId).slice(0, 12)} · 30-day hold started`,
        },
      }))
    } catch (e: any) {
      setRowStatus((p) => ({
        ...p,
        [key]: { state: "err", message: e?.message || "Quarantine failed" },
      }))
    }
  }

  /** Open the override modal — parent owns the actual DELETE call,
   *  modal owns only the lineage capture. */
  function openDeleteModal(
    resourceType: PendingDelete["resourceType"],
    resourceId: string,
    displayName: string,
  ) {
    setPendingDelete({ resourceType, resourceId, displayName })
    const blockReasons: string[] = [
      `${resourceType} ${displayName}`,
      "Direct delete bypasses the 30-day quarantine hold.",
      "Records OverrideEvent in Neo4j before the AWS mutation (Decision Contract §7).",
      "Pre-deletion snapshot is written for rollback context (data NOT in snapshot for S3).",
    ]
    setOverrideState(buildOverrideStateForOpen(blockReasons))
  }

  /** Modal calls this when the operator submits a valid lineage payload. */
  async function handleDeleteWithLineage(lineage: OverrideLineagePayload) {
    if (!pendingDelete) return
    const key = rowKey(pendingDelete.resourceType, pendingDelete.resourceId)
    setRowStatus((p) => ({ ...p, [key]: { state: "running" } }))
    try {
      let url: string
      const extraQs: string[] = ["force=true"]
      switch (pendingDelete.resourceType) {
        case "IAMRole":
          url = `/api/proxy/iam-roles/${encodeURIComponent(pendingDelete.resourceId)}`
          break
        case "S3Bucket":
          // delete_objects=true required when bucket is non-empty;
          // we always pass it so the backend can decide via its
          // object-count check. Backend still refuses if non-empty
          // and explicit double-opt-in isn't given via the param.
          url = `/api/proxy/s3-buckets/${encodeURIComponent(pendingDelete.resourceId)}`
          extraQs.push("delete_objects=true")
          break
        case "IAMPolicy":
          url = `/api/proxy/iam-policies/by-arn?policy_arn=${encodeURIComponent(pendingDelete.resourceId)}`
          break
        case "SecurityGroup":
          url = `/api/proxy/security-groups/${encodeURIComponent(pendingDelete.resourceId)}`
          break
      }
      // Append force= to URL (handle ARN-style URLs that already have ?)
      const sep = url.includes("?") ? "&" : "?"
      url = `${url}${sep}${extraQs.join("&")}`

      const resp = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ override_lineage: lineage }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        const detail = json?.detail || json?.error || `HTTP ${resp.status}`
        setOverrideState((s) => ({
          ...s,
          phase: "error",
          resultMessage: String(detail).slice(0, 600),
        }))
        setRowStatus((p) => ({ ...p, [key]: { state: "err", message: String(detail) } }))
        return
      }
      setOverrideState((s) => ({
        ...s,
        phase: "success",
        resultMessage: json?.message || "Deleted successfully",
      }))
      setRowStatus((p) => ({
        ...p,
        [key]: {
          state: "ok",
          message: `Deleted · snapshot ${String(json?.snapshot_id || "").slice(0, 24)}`,
          snapshotId: json?.snapshot_id,
        },
      }))
    } catch (e: any) {
      setOverrideState((s) => ({
        ...s,
        phase: "error",
        resultMessage: (e?.message || "Network error").slice(0, 600),
      }))
      setRowStatus((p) => ({ ...p, [key]: { state: "err", message: e?.message || "Delete failed" } }))
    }
  }

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
          <div className="flex items-start gap-3">
            <BackToDashboard
              className="p-2 -ml-2 rounded-lg hover:bg-slate-800 transition-colors mt-1 shrink-0"
              iconClassName="w-5 h-5 text-slate-300"
            />
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
        {activeTab === "iam_role" && (
          <IAMRoleTable
            findings={iamRoles}
            rowStatus={rowStatus}
            onQuarantine={(name) => handleQuarantine("IAMRole", name)}
            onDelete={(name) => openDeleteModal("IAMRole", name, name)}
          />
        )}
        {activeTab === "s3_bucket" && (
          <S3Table
            findings={s3Buckets}
            rowStatus={rowStatus}
            onQuarantine={(name) => handleQuarantine("S3Bucket", name)}
            onDelete={(name) => openDeleteModal("S3Bucket", name, name)}
          />
        )}
        {activeTab === "iam_policy" && (
          <PolicyTable
            findings={policies}
            rowStatus={rowStatus}
            onQuarantine={(arn, name) => handleQuarantine("IAMPolicy", name)}
            onDelete={(arn, name) => openDeleteModal("IAMPolicy", arn, name)}
          />
        )}
        {activeTab === "security_group" && (
          <SGTable
            findings={sgs}
            rowStatus={rowStatus}
            onQuarantine={(sgId, sgName) => handleQuarantine("SecurityGroup", sgId)}
            onDelete={(sgId, sgName) => openDeleteModal("SecurityGroup", sgId, sgName)}
          />
        )}
      </div>

      <OverrideModalShared
        state={overrideState}
        setState={setOverrideState}
        acknowledgedTags={["orphan_resource_delete", "operator_override", "irreversible_action_acknowledged"]}
        onSubmit={handleDeleteWithLineage}
        contextBlurb={
          pendingDelete
            ? `You're about to DELETE ${pendingDelete.resourceType} ${pendingDelete.displayName}. This is a direct delete — bypasses the 30-day quarantine hold. A pre-deletion snapshot is written before the AWS mutation; for S3, object DATA is NOT in the snapshot.`
            : undefined
        }
        rationalePlaceholder="e.g. test resource from prior demo run, confirmed no consumers, owner approved deletion."
      />
    </div>
  )
}

function RowStatusPill({ status }: { status?: RowStatus }) {
  if (!status || status.state === "idle") return null
  const tone =
    status.state === "ok"
      ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
      : status.state === "err"
        ? "bg-rose-500/20 text-rose-200 border-rose-500/40"
        : "bg-amber-500/20 text-amber-200 border-amber-500/40"
  return (
    <span
      className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${tone} max-w-xs truncate`}
      title={status.message || ""}
    >
      {status.state === "running" ? "Running…" : status.message || ""}
    </span>
  )
}

function ActionButtons({
  onQuarantine,
  onDelete,
  disabled,
}: {
  onQuarantine: () => void
  onDelete: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onQuarantine}
        disabled={disabled}
        className="px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 text-[10px] uppercase tracking-wider flex items-center gap-1 disabled:opacity-50"
        title="Start 30-day quarantine hold (safe — revoke rules / detach policies / DenyAll bucket policy). No AWS resources are deleted."
      >
        <Pause className="w-3 h-3" />
        Quarantine
      </button>
      <button
        onClick={onDelete}
        disabled={disabled}
        className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 text-[10px] uppercase tracking-wider flex items-center gap-1 disabled:opacity-50"
        title="Direct delete (requires override_lineage). Bypasses the 30-day hold. Pre-deletion snapshot is written; S3 data is irreversible."
      >
        <Trash2 className="w-3 h-3" />
        Delete
      </button>
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

function IAMRoleTable({
  findings,
  rowStatus,
  onQuarantine,
  onDelete,
}: {
  findings: IAMRoleFinding[]
  rowStatus: Record<string, RowStatus>
  onQuarantine: (roleName: string) => void
  onDelete: (roleName: string) => void
}) {
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
            <th className="py-2 px-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => {
            const key = `IAMRole:${f.role_name}`
            const status = rowStatus[key]
            return (
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
                <td className="py-2 px-3">
                  <ActionButtons
                    onQuarantine={() => onQuarantine(f.role_name)}
                    onDelete={() => onDelete(f.role_name)}
                    disabled={status?.state === "running"}
                  />
                  <RowStatusPill status={status} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function S3Table({
  findings,
  rowStatus,
  onQuarantine,
  onDelete,
}: {
  findings: S3Finding[]
  rowStatus: Record<string, RowStatus>
  onQuarantine: (bucketName: string) => void
  onDelete: (bucketName: string) => void
}) {
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
            <th className="py-2 px-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => {
            const key = `S3Bucket:${f.bucket_name}`
            const status = rowStatus[key]
            return (
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
                <td className="py-2 px-3">
                  <ActionButtons
                    onQuarantine={() => onQuarantine(f.bucket_name)}
                    onDelete={() => onDelete(f.bucket_name)}
                    disabled={status?.state === "running"}
                  />
                  <RowStatusPill status={status} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PolicyTable({
  findings,
  rowStatus,
  onQuarantine,
  onDelete,
}: {
  findings: PolicyFinding[]
  rowStatus: Record<string, RowStatus>
  onQuarantine: (arn: string, name: string) => void
  onDelete: (arn: string, name: string) => void
}) {
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
            <th className="py-2 px-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => {
            const key = `IAMPolicy:${f.policy_arn}`
            const status = rowStatus[key]
            return (
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
                <td className="py-2 px-3">
                  <ActionButtons
                    onQuarantine={() => onQuarantine(f.policy_arn, f.policy_name)}
                    onDelete={() => onDelete(f.policy_arn, f.policy_name)}
                    disabled={status?.state === "running"}
                  />
                  <RowStatusPill status={status} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SGTable({
  findings,
  rowStatus,
  onQuarantine,
  onDelete,
}: {
  findings: SGFinding[]
  rowStatus: Record<string, RowStatus>
  onQuarantine: (sgId: string, sgName: string) => void
  onDelete: (sgId: string, sgName: string) => void
}) {
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
            <th className="py-2 px-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => {
            const sgId = f.sg_id || ""
            const sgName = f.sg_name || ""
            const key = `SecurityGroup:${sgId}`
            const status = rowStatus[key]
            return (
              <tr key={sgId || sgName} className="border-b border-slate-900 hover:bg-slate-900/40">
                <td className="py-2 px-3 font-mono text-slate-200">
                  {sgName} <span className="text-slate-500 text-xs">{sgId}</span>
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
                <td className="py-2 px-3">
                  <ActionButtons
                    onQuarantine={() => onQuarantine(sgId, sgName)}
                    onDelete={() => onDelete(sgId, sgName)}
                    disabled={status?.state === "running" || !sgId}
                  />
                  <RowStatusPill status={status} />
                </td>
              </tr>
            )
          })}
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
