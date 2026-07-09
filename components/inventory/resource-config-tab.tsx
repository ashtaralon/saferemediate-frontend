"use client"

/**
 * Inventory — per-resource configuration tab.
 *
 * Renders what is CONFIGURED on the selected resource, from the unified
 * inspector (`GET /api/proxy/inspector/{id}` → backend api/resource_inspector.py):
 *   - SecurityGroup → rules (configured + observed usage + unused-rule recs)
 *   - S3            → public-access block + bucket policy statements
 *   - Subnet        → properties, route targets, NACLs, placed resources
 *   - KMSKey        → key policy, rotation/key state, observed accessors
 *   - Secret        → resource policy, rotation config (never the material)
 *   - DynamoDB      → table properties, encryption, PITR, observed accessors
 *   - RDS / EC2 / NetworkACL → unified current/observed sections
 *
 * Every value is payload-backed; absent data renders an honest empty state
 * (never fabricated). Unsupported types surface the backend's own message.
 */

import { useEffect, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, ShieldAlert } from "lucide-react"
import { InsightCards } from "@/components/inventory/insight-cards"
import {
  humanizeInspectorError,
  insightsFromInspectorPayload,
  insightsFromPolicyStatements,
  summarizePolicyStatement,
} from "@/lib/inspector-insights"

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

function IamPolicyDocument({ data }: { data: InspectorPayload }) {
  const current: any = data.current ?? {}
  const permissions: string[] = Array.isArray(current.permissions) ? current.permissions : []
  const statements = current.policy_document?.statements ?? []
  const policyInsights = insightsFromPolicyStatements(statements)
  return (
    <div className="space-y-5">
      {policyInsights.length > 0 && (
        <div>
          <SectionTitle>What this policy allows</SectionTitle>
          <InsightCards insights={policyInsights} />
        </div>
      )}

      <div>
        <SectionTitle>Policy</SectionTitle>
        <div className="flex flex-wrap gap-2 text-xs">
          {current.policy_type && (
            <span className="px-2 py-1 rounded-md border bg-slate-50 text-slate-600 border-slate-200">
              {current.policy_type}
            </span>
          )}
          {current.permission_count != null && (
            <span className="px-2 py-1 rounded-md border bg-slate-50 text-slate-600 border-slate-200">
              {current.permission_count} permission{current.permission_count === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div>
        <SectionTitle>Statements</SectionTitle>
        <PolicyStatements policy={current.policy_document} emptyLabel="No policy document available." />
      </div>

      {permissions.length > 0 && (
        <div>
          <SectionTitle>Permissions</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {permissions.map((a, i) => (
              <span key={i} className="font-mono text-[11px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GraphResourceConfig({ data }: { data: InspectorPayload }) {
  const current = data.current ?? {}
  const props = current.properties ?? {}
  const listFields: { key: string; label: string }[] = [
    { key: "listeners", label: "Listeners" },
    { key: "security_group_ids", label: "Security groups" },
    { key: "subnet_ids", label: "Subnets" },
    { key: "public_ips", label: "Public IPs" },
    { key: "private_ips", label: "Private IPs" },
  ]
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>{String(current.title ?? "Configuration")}</SectionTitle>
        {current.source && (
          <p className="text-[11px] text-slate-400 mb-2">Source: {String(current.source)}</p>
        )}
        <KeyValueGrid obj={props} />
      </div>
      {listFields.map(({ key, label }) => {
        const items = current[key]
        if (!Array.isArray(items) || items.length === 0) return null
        return (
          <div key={key}>
            <SectionTitle>{label}</SectionTitle>
            {typeof items[0] === "object" ? (
              <pre className="text-xs bg-slate-50 border rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(items, null, 2)}
              </pre>
            ) : (
              <ul className="text-sm space-y-1 font-mono text-xs">
                {items.map((item, i) => (
                  <li key={i}>{String(item)}</li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {data.observed?.message && (
        <p className="text-[11px] text-slate-400">{data.observed.message}</p>
      )}
    </div>
  )
}

  const current = data.current ?? {}
  const props = current.properties ?? {}
  const envKeys: string[] = Array.isArray(current.environment_keys) ? current.environment_keys : []
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Function</SectionTitle>
        <KeyValueGrid obj={props} />
        {current.description && (
          <p className="text-sm text-slate-600 mt-2">{String(current.description)}</p>
        )}
      </div>
      {envKeys.length > 0 && (
        <div>
          <SectionTitle>Environment variables</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {envKeys.map((k) => (
              <span key={k} className="font-mono text-[11px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
      {data.observed?.message && (
        <p className="text-[11px] text-slate-400">{data.observed.message}</p>
      )}
    </div>
  )
}

function VpcConfig({ data }: { data: InspectorPayload }) {
  const current = data.current ?? {}
  const cidrBlocks: any[] = Array.isArray(current.cidr_blocks) ? current.cidr_blocks : []
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>VPC</SectionTitle>
        <KeyValueGrid obj={current.properties ?? {}} />
      </div>
      {cidrBlocks.length > 0 && (
        <div>
          <SectionTitle>CIDR blocks</SectionTitle>
          <ul className="text-sm space-y-1">
            {cidrBlocks.map((b, i) => (
              <li key={i} className="font-mono text-xs text-slate-700">
                {b.cidr} {b.state ? `(${b.state})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function RouteTableRoutes({ data }: { data: InspectorPayload }) {
  const current = data.current ?? {}
  const routes: any[] = Array.isArray(current.routes) ? current.routes : []
  const associations: any[] = Array.isArray(current.associations) ? current.associations : []
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Properties</SectionTitle>
        <KeyValueGrid obj={current.properties ?? {}} />
      </div>

      <div>
        <SectionTitle>Routes</SectionTitle>
        {routes.length === 0 ? (
          <EmptyNote>No routes configured on this table.</EmptyNote>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Destination</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs">{r.destination}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.target}</td>
                    <td className="px-3 py-2 text-xs">{r.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {associations.length > 0 && (
        <div>
          <SectionTitle>Subnet associations</SectionTitle>
          <ul className="space-y-1 text-sm">
            {associations.map((a, i) => (
              <li key={i} className="font-mono text-xs text-slate-700">
                {a.main ? "main table" : a.subnet_id ?? a.gateway_id ?? "—"}
                {a.state ? ` (${a.state})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

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

// ── Shared building blocks for the KMS / Secret / DynamoDB sections ──

function PolicyStatements({ policy, emptyLabel }: { policy: any; emptyLabel: string }) {
  if (!policy || policy.exists === false) return <EmptyNote>{emptyLabel}</EmptyNote>
  const statements: any[] = Array.isArray(policy.statements) ? policy.statements : []
  if (statements.length === 0) {
    return <EmptyNote>Policy present but statements not readable.</EmptyNote>
  }
  return (
    <div className="space-y-2">
      {statements.map((st: any, i: number) => (
        <details key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer text-sm text-slate-800 list-none">
            <span className={`font-semibold ${st.Effect === "Deny" ? "text-red-700" : "text-slate-900"}`}>
              {st.Effect}
            </span>
            <span className="text-slate-700 ml-2">{summarizePolicyStatement(st)}</span>
            <span className="text-[10px] text-slate-400 ml-2">(raw JSON)</span>
          </summary>
          <pre className="mt-2 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(st, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  )
}

function ObservedAccessors({ observed }: { observed: any }) {
  const accessors: any[] = Array.isArray(observed?.accessors) ? observed.accessors : []
  if (observed?.available === false) {
    return <EmptyNote>{observed?.message ?? "Behavioral usage unavailable."}</EmptyNote>
  }
  if (accessors.length === 0) {
    return <EmptyNote>No accessors recorded in the graph for this resource.</EmptyNote>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Principal</th>
            <th className="px-3 py-2 font-medium">Actions</th>
            <th className="px-3 py-2 font-medium">Last seen</th>
            <th className="px-3 py-2 font-medium">Hits</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {accessors.map((a, i) => (
            <tr key={i} className="align-top">
              <td className="px-3 py-2">
                <span className="font-mono text-xs text-slate-900">{a.principal}</span>
                {a.principal_type && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-500 border-slate-200">
                    {a.principal_type}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-slate-700">
                {Array.isArray(a.actions) && a.actions.length > 0 ? a.actions.join(", ") : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">{a.last_seen ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-slate-700">{a.hit_count ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const REC_BADGE: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-slate-50 text-slate-600 border-slate-200",
}

function Recommendations({ remove }: { remove: any }) {
  const items: any[] = Array.isArray(remove?.items) ? remove.items : []
  if (items.length === 0) return null
  return (
    <div>
      <SectionTitle>Recommendations</SectionTitle>
      <ul className="space-y-1.5">
        {items.map((rec, i) => (
          <li key={i} className="text-sm text-slate-700 flex items-baseline gap-2">
            <span className={`text-[11px] px-1.5 py-0.5 rounded border shrink-0 ${REC_BADGE[rec.severity] ?? REC_BADGE.info}`}>
              {(rec.type ?? "review").replace(/_/g, " ")}
            </span>
            <span className="text-xs">{rec.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StateChip({ label, value, tone }: { label: string; value: any; tone: "good" | "bad" | "warn" | "muted" }) {
  const tones: Record<string, string> = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200",
    bad: "bg-red-50 text-red-700 border-red-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    muted: "bg-slate-50 text-slate-600 border-slate-200",
  }
  return (
    <span className={`px-2 py-1 rounded-md border text-xs ${tones[tone]}`}>
      {label}: <strong>{value === null || value === undefined ? "—" : String(value)}</strong>
    </span>
  )
}

function KmsKeySections({ data }: { data: InspectorPayload }) {
  const current = data.current ?? {}
  const encrypted: any[] = Array.isArray(data.observed?.encrypted_resources)
    ? data.observed.encrypted_resources
    : []
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <StateChip
          label="Key state"
          value={current.key_state}
          tone={current.key_state === "Enabled" ? "good" : current.key_state ? "bad" : "muted"}
        />
        <StateChip
          label="Rotation"
          value={current.rotation_enabled === null || current.rotation_enabled === undefined ? null : current.rotation_enabled ? "enabled" : "disabled"}
          tone={current.rotation_enabled ? "good" : current.rotation_enabled === false ? "warn" : "muted"}
        />
        <StateChip label="Manager" value={current.key_manager} tone="muted" />
        <StateChip label="Spec" value={current.key_spec} tone="muted" />
        <StateChip label="Usage" value={current.key_usage} tone="muted" />
        {current.policy_flags?.has_wildcard_principal && (
          <StateChip label="Policy" value="wildcard principal" tone="warn" />
        )}
      </div>

      {Array.isArray(current.aliases) && current.aliases.length > 0 && (
        <p className="text-xs text-slate-500 font-mono">{current.aliases.join(", ")}</p>
      )}

      <div>
        <SectionTitle>Key policy</SectionTitle>
        <PolicyStatements policy={current.key_policy} emptyLabel="Key policy not recorded for this key." />
      </div>

      <div>
        <SectionTitle>Observed usage</SectionTitle>
        <ObservedAccessors observed={data.observed} />
      </div>

      {encrypted.length > 0 && (
        <div>
          <SectionTitle>Encrypts · {encrypted.length}</SectionTitle>
          <ul className="space-y-1 text-sm">
            {encrypted.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-[11px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                  {r.type ?? "resource"}
                </span>
                <span className="font-mono text-xs text-slate-900">{r.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Recommendations remove={data.remove} />
      {current.source && <p className="text-[11px] text-slate-400">Source: {current.source}</p>}
    </div>
  )
}

function SecretSections({ data }: { data: InspectorPayload }) {
  const current = data.current ?? {}
  const rotation = current.rotation ?? {}
  const observed = data.observed ?? {}
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <StateChip
          label="Rotation"
          value={rotation.enabled === null || rotation.enabled === undefined ? null : rotation.enabled ? "enabled" : "disabled"}
          tone={rotation.enabled ? "good" : rotation.enabled === false ? "warn" : "muted"}
        />
        {rotation.lambda_arn && <StateChip label="Rotation λ" value={String(rotation.lambda_arn).split(":").pop()} tone="muted" />}
        {current.kms_key_id && <StateChip label="KMS key" value={String(current.kms_key_id).split("/").pop()} tone="muted" />}
        <StateChip label="Last accessed" value={observed.last_accessed} tone="muted" />
        <StateChip label="Last changed" value={observed.last_changed} tone="muted" />
      </div>

      <div>
        <SectionTitle>Resource policy</SectionTitle>
        <PolicyStatements policy={current.resource_policy} emptyLabel="No resource policy attached." />
      </div>

      <div>
        <SectionTitle>Observed access</SectionTitle>
        <ObservedAccessors observed={observed} />
      </div>

      <Recommendations remove={data.remove} />
      <p className="text-[11px] text-slate-400">
        Metadata and policy only — the secret material is never read or displayed.
        {current.source ? ` Source: ${current.source}` : ""}
      </p>
    </div>
  )
}

function DynamoDbSections({ data }: { data: InspectorPayload }) {
  const current = data.current ?? {}
  const encryption = current.encryption ?? {}
  const pitr = current.point_in_time_recovery ?? {}
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <StateChip
          label="Encryption"
          value={encryption.available === false ? "unavailable" : encryption.type ?? encryption.status}
          tone={encryption.available === false ? "muted" : "good"}
        />
        <StateChip
          label="PITR"
          value={pitr.available === false ? "unavailable" : pitr.enabled ? "enabled" : "disabled"}
          tone={pitr.available === false ? "muted" : pitr.enabled ? "good" : "warn"}
        />
      </div>
      {(encryption.available === false || pitr.available === false) && (
        <p className="text-[11px] text-slate-400">
          {encryption.available === false ? `Encryption: ${encryption.message ?? "unavailable"}. ` : ""}
          {pitr.available === false ? `PITR: ${pitr.message ?? "unavailable"}.` : ""}
        </p>
      )}

      <div>
        <SectionTitle>Table properties</SectionTitle>
        <KeyValueGrid obj={current.properties ?? {}} />
      </div>

      <div>
        <SectionTitle>Observed access</SectionTitle>
        <ObservedAccessors observed={data.observed} />
      </div>

      <Recommendations remove={data.remove} />
      {current.source && <p className="text-[11px] text-slate-400">Source: {current.source}</p>}
    </div>
  )
}

function InsightSections({ data }: { data: InspectorPayload }) {
  const topInsights = insightsFromInspectorPayload(data)
  const sections = [data.current, data.observed, data.remove].filter(
    (s) => s && typeof s === "object",
  ) as Record<string, unknown>[]

  if (sections.length === 0 && topInsights.length === 0) {
    return <EmptyNote>No configuration sections returned for this resource.</EmptyNote>
  }

  return (
    <div className="space-y-5">
      {topInsights.length > 0 && (
        <div>
          <SectionTitle>Key insights</SectionTitle>
          <InsightCards insights={topInsights} />
        </div>
      )}

      {sections.map((sec, i) => (
        <div key={i}>
          <SectionTitle>{String(sec.title ?? `Section ${i + 1}`)}</SectionTitle>
          {sec.message ? (
            <EmptyNote>{String(sec.message)}</EmptyNote>
          ) : sec.title === "Current Configuration" || sec.security_groups || sec.network ? (
            <InsightCards insights={insightsFromInspectorPayload({ current: sec })} />
          ) : sec.title === "Observed Activity" || sec.used_actions ? (
            <InsightCards insights={insightsFromInspectorPayload({ observed: sec })} />
          ) : sec.items ? (
            <InsightCards
              insights={(sec.items as Record<string, unknown>[]).map((rec) => ({
                severity:
                  rec.severity === "high" || rec.severity === "critical"
                    ? ("critical" as const)
                    : rec.severity === "warning"
                      ? ("warning" as const)
                      : ("info" as const),
                title: String(rec.message ?? rec.type ?? "Review"),
                tags: rec.type ? [String(rec.type).replace(/_/g, " ")] : undefined,
              }))}
            />
          ) : (
            <KeyValueGrid obj={sec as Record<string, any>} />
          )}
          {sec.source && (
            <p className="text-[11px] text-slate-400 mt-1">Source: {String(sec.source)}</p>
          )}
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
        const qs = new URLSearchParams()
        if (systemName) qs.set("system_name", systemName)
        if (resourceType) qs.set("resource_type", resourceType)
        const query = qs.toString() ? `?${qs.toString()}` : ""
        const res = await fetch(`/api/proxy/inspector/${encodeURIComponent(resourceId)}${query}`)
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
  }, [resourceId, systemName, resourceType])

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
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 space-y-3">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
        <InsightCards insights={humanizeInspectorError(error, resourceType)} />
        <p className="text-xs text-red-500 text-center font-mono">{resourceId}</p>
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
  if (kind === "IAMPolicy") return <IamPolicyDocument data={data} />
  if (kind === "RouteTable") return <RouteTableRoutes data={data} />
  if (kind === "VPC") return <VpcConfig data={data} />
  if (kind === "Lambda" || kind === "LambdaFunction") return <LambdaConfig data={data} />
  if (
    kind === "ENI" ||
    kind === "NetworkInterface" ||
    kind === "InternetGateway" ||
    kind === "LoadBalancer" ||
    kind === "ALB" ||
    kind === "NLB" ||
    kind === "SQS" ||
    kind === "SQSQueue" ||
    kind === "CloudTrail"
  ) {
    return <GraphResourceConfig data={data} />
  }
  if (kind === "Subnet") return <SubnetProperties data={data} />
  if (kind === "KMSKey" || kind === "KMS") return <KmsKeySections data={data} />
  if (kind === "Secret" || kind === "SecretsManagerSecret") return <SecretSections data={data} />
  if (kind === "DynamoDB" || kind === "DynamoDBTable") return <DynamoDbSections data={data} />
  return <InsightSections data={data} />
}
