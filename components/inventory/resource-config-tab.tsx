"use client"

/**
 * Inventory — per-resource configuration tab.
 *
 * Renders what is CONFIGURED on the selected resource, from the unified
 * inspector (`GET /api/proxy/inspector/{id}` → backend api/resource_inspector.py):
 *   - SecurityGroup → rules (configured + observed usage + unused-rule recs)
 *   - S3            → public-access block + bucket policy statements
 *   - Subnet        → properties, route targets, NACLs, placed resources
 *   - RDS / EC2 / NetworkACL → unified current/observed sections
 *
 * Every value is payload-backed; absent data renders an honest empty state
 * (never fabricated). Unsupported types surface the backend's own message.
 */

import { useEffect, useState } from "react"
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react"

interface Props {
  resourceId: string
  resourceType: string
  systemName?: string
}

interface SgRule {
  direction: string
  protocol: string
  port_display: string
  port_name?: string | null
  source_cidr?: string | null
  source_sg?: string | null
  source_sg_name?: string | null
  description?: string
  is_public?: boolean
  status?: string
  flow_count?: number
  last_seen?: string | null
}

type InspectorPayload = Record<string, any>

const STATUS_BADGE: Record<string, string> = {
  used: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unused: "bg-red-50 text-red-700 border-red-200",
  unknown: "bg-slate-50 text-slate-500 border-slate-200",
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
      {children}
    </h3>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500 italic">{children}</p>
}

function KeyValueGrid({ obj }: { obj: Record<string, any> }) {
  const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
  if (entries.length === 0) return <EmptyNote>No properties recorded in the graph yet.</EmptyNote>
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 min-w-0">
          <dt className="text-slate-500 shrink-0">{k.replace(/_/g, " ")}</dt>
          <dd className="text-slate-900 font-mono text-xs truncate" title={String(v)}>
            {typeof v === "boolean" ? (v ? "true" : "false") : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function SecurityGroupRules({ data }: { data: InspectorPayload }) {
  const rules: SgRule[] = Array.isArray(data.configured_rules) ? data.configured_rules : []
  const summary = data.summary ?? {}
  const recs: any[] = Array.isArray(data.recommendations) ? data.recommendations : []
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          ["Total", summary.total_rules],
          ["Used", summary.used_rules],
          ["Unused", summary.unused_rules],
          ["Unknown", summary.unknown_rules],
          ["Public", summary.public_rules],
        ].map(([label, v]) => (
          <span key={String(label)} className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">
            {label}: <strong>{v ?? "—"}</strong>
          </span>
        ))}
      </div>

      <div>
        <SectionTitle>Configured rules</SectionTitle>
        {rules.length === 0 ? (
          <EmptyNote>No rules configured on this security group.</EmptyNote>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Direction</th>
                  <th className="px-3 py-2 font-medium">Port</th>
                  <th className="px-3 py-2 font-medium">Peer</th>
                  <th className="px-3 py-2 font-medium">Usage</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((r, i) => (
                  <tr key={i} className="align-top">
                    <td className="px-3 py-2 capitalize text-slate-700">{r.direction}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-900">
                      {r.port_display}
                      {r.port_name ? <span className="text-slate-400"> ({r.port_name})</span> : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <span className={r.is_public ? "text-red-700 font-semibold" : "text-slate-700"}>
                        {r.source_cidr || r.source_sg_name || r.source_sg || "—"}
                      </span>
                      {r.is_public && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                          <ShieldAlert className="w-3 h-3" /> open to internet
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded border ${STATUS_BADGE[r.status ?? "unknown"] ?? STATUS_BADGE.unknown}`}>
                        {r.status ?? "unknown"}
                        {r.status === "used" && r.flow_count ? ` · ${r.flow_count} flows` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{r.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recs.length > 0 && (
        <div>
          <SectionTitle>Unused-rule recommendations</SectionTitle>
          <ul className="space-y-1.5">
            {recs.map((rec, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-baseline gap-2">
                <span className="text-[11px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 shrink-0">
                  {rec.action?.replace(/_/g, " ") ?? "review"}
                </span>
                <span className="font-mono text-xs">{rec.rule_summary}</span>
                <span className="text-xs text-slate-400">{rec.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.evidence?.flow_logs && (
        <p className="text-[11px] text-slate-400">
          Usage from VPC Flow Logs over {data.evidence.flow_logs.window_days ?? "—"} days
          {data.evidence.flow_logs.available === false ? " — flow logs unavailable, usage shown as unknown" : ""}.
        </p>
      )}
    </div>
  )
}

function S3Policies({ data }: { data: InspectorPayload }) {
  const current = data.current ?? {}
  const pab = current.public_access_block
  const policy = current.bucket_policy
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Public access block</SectionTitle>
        {pab ? (
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(pab).map(([k, v]) => (
              <span
                key={k}
                className={`px-2 py-1 rounded-md border ${
                  k === "is_public"
                    ? v
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : v
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-50 text-slate-500 border-slate-200"
                }`}
              >
                {k.replace(/_/g, " ")}: <strong>{String(v)}</strong>
              </span>
            ))}
          </div>
        ) : (
          <EmptyNote>Public access block configuration not available.</EmptyNote>
        )}
      </div>

      <div>
        <SectionTitle>Bucket policy</SectionTitle>
        {policy?.exists === false ? (
          <EmptyNote>No bucket policy attached.</EmptyNote>
        ) : Array.isArray(policy?.statements) && policy.statements.length > 0 ? (
          <div className="space-y-2">
            {policy.statements.map((st: any, i: number) => (
              <details key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <summary className="cursor-pointer text-sm text-slate-800">
                  <span className={`font-semibold ${st.Effect === "Deny" ? "text-red-700" : "text-slate-900"}`}>{st.Effect}</span>
                  <span className="font-mono text-xs text-slate-600 ml-2">
                    {Array.isArray(st.Action) ? st.Action.join(", ") : String(st.Action ?? "—")}
                  </span>
                  {st.Sid ? <span className="text-xs text-slate-400 ml-2">({st.Sid})</span> : null}
                </summary>
                <pre className="mt-2 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(st, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        ) : (
          <EmptyNote>Bucket policy present but statements not readable.</EmptyNote>
        )}
      </div>

      {data.observed?.message && (
        <p className="text-[11px] text-slate-400">{data.observed.message}</p>
      )}
    </div>
  )
}

function SubnetProperties({ data }: { data: InspectorPayload }) {
  const current = data.current ?? {}
  const observed = data.observed ?? {}
  const routes: any[] = Array.isArray(current.routes) ? current.routes : []
  const nacls: any[] = Array.isArray(current.nacls) ? current.nacls : []
  const placed: any[] = Array.isArray(observed.placed) ? observed.placed : []
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Properties</SectionTitle>
        <KeyValueGrid obj={current.properties ?? {}} />
      </div>

      <div>
        <SectionTitle>Route targets</SectionTitle>
        {routes.length === 0 ? (
          <EmptyNote>No route targets recorded in the graph.</EmptyNote>
        ) : (
          <ul className="space-y-1 text-sm">
            {routes.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-[11px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                  {r.target_type ?? "gateway"}
                </span>
                <span className="font-mono text-xs text-slate-900">{r.target_name || r.target_id}</span>
                {r.target_name && r.target_name !== r.target_id && (
                  <span className="font-mono text-[11px] text-slate-400">{r.target_id}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionTitle>Network ACLs</SectionTitle>
        {nacls.length === 0 ? (
          <EmptyNote>No NACL association recorded.</EmptyNote>
        ) : (
          <ul className="space-y-1 text-sm font-mono text-xs text-slate-900">
            {nacls.map((n, i) => (
              <li key={i}>{n.name || n.id}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionTitle>Placed resources · {observed.total ?? 0}</SectionTitle>
        {placed.length === 0 ? (
          <EmptyNote>Nothing placed in this subnet per the graph.</EmptyNote>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {placed.map((p, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="text-[11px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200 shrink-0">
                  {p.type} × {p.count}
                </span>
                {Array.isArray(p.names) && p.names.length > 0 && (
                  <span className="font-mono text-xs text-slate-700 truncate">{p.names.join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function UnifiedSections({ data }: { data: InspectorPayload }) {
  const sections = [data.current, data.observed, data.remove].filter(Boolean)
  if (sections.length === 0) {
    return <EmptyNote>No configuration sections returned for this resource.</EmptyNote>
  }
  return (
    <div className="space-y-5">
      {sections.map((sec: any, i) => (
        <div key={i}>
          <SectionTitle>{sec.title ?? `Section ${i + 1}`}</SectionTitle>
          {sec.message ? (
            <EmptyNote>{sec.message}</EmptyNote>
          ) : (
            <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-72 whitespace-pre-wrap">
              {JSON.stringify(sec, null, 2)}
            </pre>
          )}
          {sec.source && <p className="text-[11px] text-slate-400 mt-1">Source: {sec.source}</p>}
        </div>
      ))}
    </div>
  )
}

export function ResourceConfigTab({ resourceId, resourceType, systemName }: Props) {
  const [data, setData] = useState<InspectorPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      setData(null)
      try {
        const qs = systemName ? `?system_name=${encodeURIComponent(systemName)}` : ""
        const res = await fetch(`/api/proxy/inspector/${encodeURIComponent(resourceId)}${qs}`)
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(body?.detail || body?.error || `Inspector returned ${res.status}`)
        }
        if (!cancelled) setData(body)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Unable to load configuration")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [resourceId, systemName])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-600">
        <RefreshCw className="w-6 h-6 animate-spin text-violet-500" />
        <span className="ml-3">Loading configuration…</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-red-700 text-sm">{error}</p>
        <p className="text-xs text-red-500 mt-1 font-mono">{resourceId}</p>
      </div>
    )
  }
  if (!data) return <EmptyNote>No data returned.</EmptyNote>

  if (data.supported === false) {
    return (
      <div className="space-y-2">
        <EmptyNote>{data.message ?? `Inspector not yet available for ${resourceType}.`}</EmptyNote>
        {Array.isArray(data.evidence) && data.evidence.length > 0 && (
          <p className="text-[11px] text-slate-400">Evidence sources: {data.evidence.join(", ")}</p>
        )}
      </div>
    )
  }

  const kind = data.resource_type ?? resourceType
  if (kind === "SecurityGroup") return <SecurityGroupRules data={data} />
  if (kind === "S3") return <S3Policies data={data} />
  if (kind === "Subnet") return <SubnetProperties data={data} />
  return <UnifiedSections data={data} />
}
