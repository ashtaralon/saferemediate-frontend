"use client"

// Per-card detail side panel for the per-path Trust Boundary / PathFlowMap.
// Discriminated union: one panel component renders any of compute / sg /
// gateway / destination / bucket. RT is intentionally NOT in this panel —
// the existing inline RT expand-below-grid pattern stays, per user direction.
//
// Data sourcing strategy (per feedback_no_mock_numbers_in_ui — three-state
// cards: live / loading / not-wired, never fabricated numbers):
//   - compute     : reads from PathRow (already in client); IAM permission
//                   summary is "not collected yet" — to be wired via existing
//                   /api/proxy/iam-roles in a follow-up.
//   - sg          : lazy-fetch /api/proxy/security-groups/{sgId}/inspector
//   - gateway     : reads from PathRow.gateways entry (id, name, kind, bucket)
//                   plus the RT routes that target it (filtered client-side).
//   - destination : reads from PathRow.fullDestinations entry (IP enrichment,
//                   signals, country/org/ASN, byte/hit counts already loaded).
//   - bucket      : lazy-fetch /api/proxy/s3-buckets/{name}/analysis
//
// Per feedback_demo_safe_source_labels: labels stay vendor-neutral in
// operator-visible UI. Per feedback_signal_language: "Egress signals" /
// "Review signals", NEVER "Suspicious".
//
// Per feedback_reuse_unified_pipeline: action buttons (Apply remediation,
// Narrow egress, Block via NACL) link to existing UnifiedPipeline-routed
// flows (LiveRemediationModal / posture-recommendations) and never invoke
// any parallel mutation path of their own.

import React, { useCallback, useEffect, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Cloud,
  Database,
  Globe,
  Hash,
  Info,
  Key,
  Lock,
  Network,
  Server,
  Shield,
  ShieldOff,
  X,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  formatBytes,
  formatTimeAgoShort,
  countryFlag,
  SIGNAL_META,
  type PathRow,
} from "@/components/dependency-map/egress-flow-map"

// Discriminated union — caller's selection state. Pass `null` to close.
export type FlowMapDetailSelection =
  | { kind: "compute"; row: PathRow }
  | { kind: "sg"; row: PathRow; sgId: string }
  | { kind: "gateway"; row: PathRow; gatewayId: string }
  | { kind: "destination"; row: PathRow; ip: string }
  | { kind: "bucket"; row: PathRow; bucketName: string }

interface Props {
  selection: FlowMapDetailSelection | null
  onClose: () => void
}

export function FlowMapDetailPanel({ selection, onClose }: Props) {
  // Single Sheet that re-keys on selection.kind+id so the close animation
  // doesn't re-trigger when switching between cards in the same session.
  const open = selection !== null
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        // Override shadcn default (sm:max-w-sm = 384px) — the data is dense
        // and the panel needs ~520px to render rules/principals comfortably.
        className="!max-w-[520px] sm:!max-w-[520px] bg-slate-950 border-slate-800 text-slate-100 p-0 flex flex-col"
      >
        {selection && (
          <PanelBody selection={selection} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  )
}

// ---- Body router ------------------------------------------------------

function PanelBody({
  selection,
  onClose,
}: {
  selection: FlowMapDetailSelection
  onClose: () => void
}) {
  // SheetHeader stays sticky; body scrolls.
  let title: string
  let subtitle: string
  let icon: React.ReactNode
  switch (selection.kind) {
    case "compute":
      title = selection.row.workloadName
      subtitle = selection.row.workloadType === "lambda" ? "Lambda function" : "EC2 instance"
      icon = <Server className="w-4 h-4 text-blue-400" />
      break
    case "sg": {
      const sg = selection.row.sgs.find((s) => s.id === selection.sgId)
      title = sg?.name || selection.sgId
      subtitle = "Security group"
      icon = <Lock className="w-4 h-4 text-orange-400" />
      break
    }
    case "gateway": {
      const gw = selection.row.gateways.find((g) => g.id === selection.gatewayId)
      title = gw?.name || selection.gatewayId
      subtitle = gatewayKindLabel(gw?.kind || "")
      icon = gatewayKindIcon(gw?.kind || "")
      break
    }
    case "destination": {
      const dest = selection.row.fullDestinations.find((d) => d.ip === selection.ip)
      title = dest?.hostname || dest?.aws_service || dest?.org || selection.ip
      subtitle = dest?.kind === "aws"
        ? `AWS · ${dest.aws_service || "service"}`
        : dest?.kind === "external"
          ? "External destination"
          : "Destination"
      icon = <Globe className="w-4 h-4 text-cyan-400" />
      break
    }
    case "bucket":
      title = selection.bucketName
      subtitle = "S3 bucket"
      icon = <Database className="w-4 h-4 text-fuchsia-400" />
      break
  }

  return (
    <>
      <SheetHeader className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-5 py-4">
        <div className="flex items-start gap-3 pr-8">
          <div className="mt-0.5 shrink-0">{icon}</div>
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-slate-50 text-base font-semibold truncate" title={title}>
              {title}
            </SheetTitle>
            <div className="mt-0.5 text-[11px] uppercase tracking-wider font-semibold text-slate-400">
              {subtitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 -mt-1 -mr-1 rounded p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            aria-label="Close detail panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {selection.kind === "compute" && <ComputeDetail row={selection.row} />}
        {selection.kind === "sg" && <SGDetail row={selection.row} sgId={selection.sgId} />}
        {selection.kind === "gateway" && (
          <GatewayDetail row={selection.row} gatewayId={selection.gatewayId} />
        )}
        {selection.kind === "destination" && (
          <DestinationDetail row={selection.row} ip={selection.ip} />
        )}
        {selection.kind === "bucket" && (
          <BucketDetail row={selection.row} bucketName={selection.bucketName} />
        )}
      </div>
    </>
  )
}

// ---- Shared section primitives ----------------------------------------

function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number | string
  children: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {title}
        </h3>
        {count !== undefined && (
          <span className="text-[10px] text-slate-600 font-mono">({count})</span>
        )}
      </div>
      {children}
    </div>
  )
}

function KVRow({
  label,
  value,
  mono,
  title,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  title?: string
}) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider shrink-0 w-32">
        {label}
      </div>
      <div
        className={`text-[12px] text-slate-100 truncate flex-1 ${mono ? "font-mono" : ""}`}
        title={title || (typeof value === "string" ? value : undefined)}
      >
        {value}
      </div>
    </div>
  )
}

function ThreeStateValue({
  state,
  value,
  notWiredHint,
}: {
  state: "live" | "loading" | "not-wired"
  value?: React.ReactNode
  notWiredHint?: string
}) {
  if (state === "loading") {
    return <span className="text-slate-500 italic">Loading…</span>
  }
  if (state === "not-wired") {
    return (
      <span className="text-slate-600 italic" title={notWiredHint}>
        Not collected yet
      </span>
    )
  }
  return <>{value}</>
}

// ---- COMPUTE ----------------------------------------------------------

function ComputeDetail({ row }: { row: PathRow }) {
  const subnetTone =
    row.subnetIsPublic === true
      ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
      : row.subnetIsPublic === false
        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-200"
        : "bg-slate-700/40 border-slate-600 text-slate-300"
  const subnetLabel =
    row.subnetIsPublic === true
      ? "PUBLIC"
      : row.subnetIsPublic === false
        ? "PRIVATE"
        : "UNKNOWN"

  const totalSignals = Object.values(row.signals || {}).reduce((a, b) => a + b, 0)

  return (
    <>
      <Section title="Identity">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <KVRow label="Workload" value={row.workloadName} />
          <KVRow label="Type" value={row.workloadType === "lambda" ? "AWS Lambda function" : "EC2 instance"} />
          <KVRow label="ID" value={row.workloadId} mono />
          {row.subnetId && (
            <KVRow
              label="Subnet"
              value={
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${subnetTone}`}
                  >
                    {subnetLabel}
                  </span>
                  <span className="font-mono">{row.subnetName || row.subnetId}</span>
                </span>
              }
              title={row.subnetId}
            />
          )}
        </div>
      </Section>

      <Section title="Observed activity (30d)">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Destinations" value={row.egressDestinationCount.toLocaleString()} />
          <Tile label="Bytes" value={formatBytes(row.totalBytes)} />
          <Tile label="Hits" value={row.totalHits.toLocaleString()} />
        </div>
      </Section>

      <Section title="Egress signals" count={totalSignals || undefined}>
        {totalSignals === 0 ? (
          <p className="text-[12px] text-slate-500 italic">
            No flagged signals on this workload's egress in the 30-day window.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(row.signals)
              .sort((a, b) => b[1] - a[1])
              .map(([sig, count]) => {
                const meta = SIGNAL_META[sig]
                if (!meta) return null
                const tone =
                  meta.tone === "alert"
                    ? "bg-rose-500/10 border-rose-500/40 text-rose-200"
                    : meta.tone === "warning"
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                      : "bg-sky-500/10 border-sky-500/40 text-sky-200"
                return (
                  <span
                    key={sig}
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium ${tone}`}
                    title={meta.tooltip}
                  >
                    {meta.label}
                    <span className="text-[10px] font-mono opacity-80">×{count}</span>
                  </span>
                )
              })}
          </div>
        )}
      </Section>

      <Section title="Attached security groups" count={row.sgs.length}>
        {row.sgs.length === 0 ? (
          <p className="text-[12px] text-slate-500 italic">No security groups attached.</p>
        ) : (
          <ul className="space-y-1.5">
            {row.sgs.map((sg) => (
              <li
                key={sg.id}
                className="rounded border border-slate-800 bg-slate-900/40 px-3 py-2 flex items-center gap-2"
              >
                <Lock className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-slate-100 truncate" title={sg.name}>
                    {sg.name}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">{sg.id}</div>
                </div>
                {sg.hasPublicEgress && (
                  <span className="shrink-0 inline-flex items-center rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
                    Public egress
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Permission usage">
        <div className="rounded border border-dashed border-slate-800 bg-slate-900/30 px-3 py-3 text-[12px]">
          <ThreeStateValue
            state="not-wired"
            notWiredHint="The IAM role permission gap analysis is collected by the IAM analyzer and surfaced on the Identity Attack Paths drill-in. Wire-up to this panel is a follow-up patch."
          />
          <div className="mt-2">
            <a
              href="/identity-attack-paths"
              className="inline-flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200 font-semibold"
            >
              Open Identity Attack Paths
              <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </Section>

      {row.upstreamCrownJewels.length > 0 && (
        <Section title="Crown jewels read" count={row.upstreamCrownJewels.length}>
          <ul className="space-y-1.5">
            {row.upstreamCrownJewels.slice(0, 6).map((cj) => (
              <li
                key={cj.id}
                className={`rounded border px-3 py-2 ${
                  cj.is_internet_exposed
                    ? "border-rose-500/50 bg-rose-500/10"
                    : "border-fuchsia-500/30 bg-fuchsia-500/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Database
                      className={`w-3.5 h-3.5 shrink-0 ${cj.is_internet_exposed ? "text-rose-300" : "text-fuchsia-300"}`}
                    />
                    <span
                      className={`text-[12px] font-semibold truncate ${cj.is_internet_exposed ? "text-rose-50" : "text-fuchsia-50"}`}
                      title={cj.name}
                    >
                      {cj.name}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-fuchsia-300 shrink-0">
                    {cj.hits.toLocaleString()} reads
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="mt-0.5 text-[14px] font-bold text-slate-100 tabular-nums truncate" title={String(value)}>
        {value}
      </div>
    </div>
  )
}

// ---- SECURITY GROUP --------------------------------------------------

interface SGInspectorRule {
  direction: "ingress" | "egress"
  protocol: string
  from_port: number | null
  to_port: number | null
  port_display?: string
  source_cidr?: string | null
  source_sg?: string | null
  peer_value?: string | null
  source_type?: string
  status?: string
  flow_count?: number
  last_seen?: string | null
  is_public?: boolean
}

interface SGInspectorResponse {
  sg_id?: string
  sg_name?: string
  description?: string | null
  vpc_id?: string | null
  attached_resources_count?: number
  configured_rules?: SGInspectorRule[]
  last_change?: {
    event_time?: string | null
    actor?: string | null
    event_type?: string | null
  } | null
}

function SGDetail({ row, sgId }: { row: PathRow; sgId: string }) {
  const sgFromRow = row.sgs.find((s) => s.id === sgId)
  const [data, setData] = useState<SGInspectorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/proxy/security-groups/${encodeURIComponent(sgId)}/inspector?window=30d`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<SGInspectorResponse>
      })
      .then((d) => {
        if (cancelled) return
        setData(d)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sgId])

  const ingressRules = (data?.configured_rules || []).filter((r) => r.direction === "ingress")
  const egressRules = (data?.configured_rules || []).filter((r) => r.direction === "egress")

  return (
    <>
      <Section title="Identity">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <KVRow label="Name" value={data?.sg_name || sgFromRow?.name || sgId} />
          <KVRow label="ID" value={sgId} mono />
          {data?.description && <KVRow label="Description" value={data.description} />}
          {data?.vpc_id && <KVRow label="VPC" value={data.vpc_id} mono />}
          {data?.attached_resources_count !== undefined && (
            <KVRow label="Attached resources" value={data.attached_resources_count} />
          )}
        </div>
      </Section>

      {data?.last_change && (
        <Section title="Last change">
          <div className="rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-[12px] text-slate-300">
            <div>
              {data.last_change.event_type || "Modified"}
              {data.last_change.event_time && (
                <span className="ml-2 text-slate-500">
                  · {formatTimeAgoShort(data.last_change.event_time)}
                </span>
              )}
            </div>
            {data.last_change.actor && (
              <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
                by {data.last_change.actor}
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Egress rules" count={egressRules.length}>
        {loading ? (
          <p className="text-[12px] text-slate-500 italic">Loading rules…</p>
        ) : error ? (
          <p className="text-[12px] text-rose-300">Could not load rules: {error}</p>
        ) : egressRules.length === 0 ? (
          <p className="text-[12px] text-slate-500 italic">No egress rules configured.</p>
        ) : (
          <RulesList rules={egressRules} direction="egress" />
        )}
      </Section>

      <Section title="Ingress rules" count={ingressRules.length}>
        {loading ? (
          <p className="text-[12px] text-slate-500 italic">Loading rules…</p>
        ) : error ? (
          <p className="text-[12px] text-rose-300">Could not load rules: {error}</p>
        ) : ingressRules.length === 0 ? (
          <p className="text-[12px] text-slate-500 italic">No ingress rules configured.</p>
        ) : (
          <RulesList rules={ingressRules} direction="ingress" />
        )}
      </Section>

      <div className="mt-4 rounded border border-slate-800 bg-slate-900/30 p-3 text-[11px] text-slate-400 leading-relaxed">
        <Info className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5 text-slate-500" />
        Inline narrow / remove actions route through the unified remediation
        pipeline. Use the per-system Least Privilege tab to stage and apply
        rule changes — this panel is read-only for safety.
      </div>
    </>
  )
}

function RulesList({
  rules,
  direction,
}: {
  rules: SGInspectorRule[]
  direction: "ingress" | "egress"
}) {
  return (
    <ul className="space-y-1.5">
      {rules.map((r, idx) => {
        const peer = r.source_cidr || r.source_sg || r.peer_value || "—"
        const isPublic = !!r.is_public || peer === "0.0.0.0/0"
        const flowCount = r.flow_count || 0
        const portDisplay =
          r.port_display ||
          (r.from_port === null && r.to_port === null
            ? "All"
            : r.from_port === r.to_port
              ? String(r.from_port ?? "All")
              : `${r.from_port}-${r.to_port}`)
        const proto = (r.protocol || "tcp").toUpperCase()
        return (
          <li
            key={`${direction}-${idx}-${peer}-${portDisplay}`}
            className={`rounded border px-3 py-2 ${
              isPublic
                ? "border-amber-500/50 bg-amber-500/10"
                : "border-slate-800 bg-slate-900/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {isPublic ? (
                  <ShieldOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                ) : (
                  <Shield className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                )}
                <span className={`text-[12px] font-mono truncate ${isPublic ? "text-amber-100 font-semibold" : "text-slate-100"}`} title={peer}>
                  {peer}
                </span>
              </div>
              <span className="shrink-0 text-[11px] font-mono text-slate-300 tabular-nums">
                {proto} · {portDisplay}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
              <span>
                {flowCount > 0
                  ? `${flowCount.toLocaleString()} observed flow${flowCount === 1 ? "" : "s"} (30d)`
                  : "No observed flows (30d)"}
              </span>
              {r.last_seen && (
                <span title={`Last flow: ${r.last_seen}`}>
                  last {formatTimeAgoShort(r.last_seen)}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ---- GATEWAY ---------------------------------------------------------

function GatewayDetail({ row, gatewayId }: { row: PathRow; gatewayId: string }) {
  const gw = row.gateways.find((g) => g.id === gatewayId)
  if (!gw) {
    return <p className="text-[12px] text-slate-500 italic">Gateway not found in this path.</p>
  }
  // Routes that target THIS gateway, pulled from the workload's RT.
  const matchingRoutes = (row.routeTable?.routes || []).filter(
    (r) => r.target_id === gw.id,
  )
  const isPublicEgress = gw.bucket === "public"

  return (
    <>
      <Section title="Identity">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <KVRow label="Name" value={gw.name || gatewayId} />
          <KVRow label="ID" value={gw.id} mono />
          <KVRow label="Kind" value={gatewayKindLabel(gw.kind)} />
          <KVRow
            label="Egress posture"
            value={
              <span
                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  isPublicEgress
                    ? "bg-amber-500/15 border-amber-500/50 text-amber-200"
                    : gw.bucket === "private"
                      ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-200"
                      : "bg-slate-700/40 border-slate-600 text-slate-300"
                }`}
              >
                {isPublicEgress
                  ? "PUBLIC EGRESS"
                  : gw.bucket === "private"
                    ? "PRIVATE / VPCE"
                    : "OTHER"}
              </span>
            }
          />
        </div>
      </Section>

      <Section title="Routes targeting this gateway" count={matchingRoutes.length}>
        {matchingRoutes.length === 0 ? (
          <p className="text-[12px] text-slate-500 italic">
            No routes in this workload's route table target this gateway directly.
            The workload may reach it via a different route table.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {matchingRoutes.map((rt, idx) => (
              <li
                key={`${rt.cidr}-${rt.target_id}-${idx}`}
                className="rounded border border-slate-800 bg-slate-900/40 px-3 py-2 flex items-center justify-between gap-2"
              >
                <span className="text-[12px] font-mono text-slate-100">
                  {rt.cidr || "—"}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                  via {rt.target_kind}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Layer-7 filtering">
        <div className="rounded border border-slate-800 bg-slate-900/30 px-3 py-2.5 text-[12px] text-slate-300">
          {isPublicEgress ? (
            <>
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-amber-100">No L7 filtering</div>
                  <div className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                    Traffic egressing through this gateway is not inspected at the
                    application layer. The workload's identity and the destination
                    domain alone govern reachability.
                  </div>
                </div>
              </div>
            </>
          ) : gw.kind === "VPCEndpoint" ? (
            <>
              <div className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-emerald-100">Service-scoped</div>
                  <div className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                    Endpoint policy and resource-based controls apply. Traffic does
                    not leave the VPC boundary.
                  </div>
                </div>
              </div>
            </>
          ) : (
            <span className="text-slate-500 italic">No filtering posture available for this kind.</span>
          )}
        </div>
      </Section>

      <div className="mt-4 rounded border border-dashed border-slate-800 bg-slate-900/30 p-3 text-[11px] text-slate-400 leading-relaxed">
        <Info className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5 text-slate-500" />
        Cross-workload usage of this gateway (which workloads route through it)
        is shown on the per-system Trust Boundary map. Open from the system dashboard.
      </div>
    </>
  )
}

function gatewayKindLabel(kind: string): string {
  switch (kind) {
    case "InternetGateway": return "Internet Gateway"
    case "NATGateway": return "NAT Gateway"
    case "VPCEndpoint": return "VPC Endpoint"
    case "TransitGateway": return "Transit Gateway"
    case "EgressOnlyInternetGateway": return "Egress-Only IGW"
    case "AWSService": return "AWS Service"
    default: return kind || "Gateway"
  }
}

function gatewayKindIcon(kind: string): React.ReactNode {
  switch (kind) {
    case "InternetGateway": return <Globe className="w-4 h-4 text-amber-400" />
    case "NATGateway": return <Network className="w-4 h-4 text-blue-400" />
    case "VPCEndpoint": return <Lock className="w-4 h-4 text-emerald-400" />
    case "TransitGateway": return <Activity className="w-4 h-4 text-violet-400" />
    case "EgressOnlyInternetGateway": return <Globe className="w-4 h-4 text-orange-400" />
    case "AWSService": return <Cloud className="w-4 h-4 text-emerald-400" />
    default: return <Network className="w-4 h-4 text-slate-400" />
  }
}

// ---- DESTINATION -----------------------------------------------------

// Matches backend api/dns_visibility.py /destinations/{ip}/domains shape.
interface DestDomainsResponse {
  ip?: string
  domain_count?: number
  domains?: Array<{
    domain: string
    first_seen?: string | null
    last_seen?: string | null
    total_queries?: number
  }>
}

function DestinationDetail({ row, ip }: { row: PathRow; ip: string }) {
  const dest = row.fullDestinations.find((d) => d.ip === ip)
  // Lazy fetch domains that resolved to this IP from Route 53 Resolver
  // Query Logs. Surfaces the authoritative domain ("api.stripe.com")
  // instead of just the IP + reverse-DNS PTR. Returns empty when DNS
  // visibility isn't enabled OR no queries observed in the window.
  const [dnsData, setDnsData] = useState<DestDomainsResponse | null>(null)
  const [dnsLoading, setDnsLoading] = useState(true)
  const [dnsErr, setDnsErr] = useState<string | null>(null)

  useEffect(() => {
    if (!ip) return
    let cancelled = false
    setDnsLoading(true)
    setDnsErr(null)
    fetch(`/api/proxy/dns/destinations/${encodeURIComponent(ip)}/domains`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DestDomainsResponse>
      })
      .then((d) => {
        if (cancelled) return
        setDnsData(d)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setDnsErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setDnsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ip])

  if (!dest) {
    return <p className="text-[12px] text-slate-500 italic">Destination not found.</p>
  }

  const domainsList = dnsData?.domains || []

  return (
    <>
      {/* DNS-resolved domains — authoritative names from Route 53 Resolver
          Query Logs. Surfaces ABOVE the network identity so the operator
          reads "api.stripe.com" first, IP second. */}
      <Section title="Resolved domains" count={domainsList.length || undefined}>
        {dnsLoading ? (
          <p className="text-[12px] text-slate-500 italic">Loading DNS queries…</p>
        ) : dnsErr ? (
          <p className="text-[12px] text-rose-300">Could not load domains: {dnsErr}</p>
        ) : domainsList.length === 0 ? (
          <p className="text-[12px] text-slate-500 italic">
            <ThreeStateValue
              state="not-wired"
              notWiredHint="No Route 53 Resolver Query Log records mention this IP. Either DNS visibility isn't enabled for the VPC, or the IP was reached without a DNS lookup (hardcoded IP, cached resolution). Enable per-VPC via the DNS visibility banner on the Flow Map."
            />
          </p>
        ) : (
          <ul className="space-y-1.5">
            {domainsList.slice(0, 8).map((d) => (
              <li
                key={d.domain}
                className="rounded border border-emerald-500/40 bg-emerald-500/5 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[12px] font-mono font-semibold text-emerald-100 truncate"
                    title={d.domain}
                  >
                    {d.domain}
                  </span>
                  {(d.total_queries ?? 0) > 0 && (
                    <span className="text-[10px] font-mono text-emerald-300/80 shrink-0 tabular-nums">
                      {(d.total_queries ?? 0).toLocaleString()} queries
                    </span>
                  )}
                </div>
                {d.last_seen && (
                  <div className="mt-0.5 text-[10px] text-slate-500" title={`Last DNS query: ${d.last_seen}`}>
                    last {formatTimeAgoShort(d.last_seen)}
                  </div>
                )}
              </li>
            ))}
            {domainsList.length > 8 && (
              <li className="text-[10px] text-slate-500 italic pl-3">
                + {domainsList.length - 8} more
              </li>
            )}
          </ul>
        )}
      </Section>

      <Section title="Identity">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <KVRow label="IP" value={dest.ip} mono />
          {dest.hostname && <KVRow label="Hostname" value={dest.hostname} mono />}
          {dest.kind === "aws" && dest.aws_service && (
            <KVRow label="AWS service" value={dest.aws_service} />
          )}
          {dest.kind === "aws" && dest.aws_region && (
            <KVRow label="AWS region" value={dest.aws_region} />
          )}
          {dest.country && (
            <KVRow
              label="Country"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-base leading-none">{countryFlag(dest.country)}</span>
                  <span>{dest.country}</span>
                </span>
              }
            />
          )}
          {dest.org && <KVRow label="Organization" value={dest.org} />}
          {dest.asn && <KVRow label="ASN" value={dest.asn} mono />}
        </div>
      </Section>

      <Section title="Observed activity (30d)">
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Bytes" value={formatBytes(dest.bytes)} />
          <Tile label="Hits" value={dest.hits.toLocaleString()} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {dest.first_seen && (
            <FieldChip label="First seen" value={formatTimeAgoShort(dest.first_seen) || dest.first_seen} />
          )}
          {dest.last_seen && (
            <FieldChip label="Last seen" value={formatTimeAgoShort(dest.last_seen) || dest.last_seen} />
          )}
        </div>
      </Section>

      <Section title="Ports & protocols">
        <div className="flex flex-wrap gap-1.5">
          {(dest.ports || []).length === 0 && (dest.protocols || []).length === 0 && (
            <span className="text-[12px] text-slate-500 italic">No ports/protocols recorded.</span>
          )}
          {(dest.protocols || []).map((p) => (
            <span
              key={`proto-${p}`}
              className="inline-flex items-center rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] font-mono text-slate-200"
            >
              {p.toUpperCase()}
            </span>
          ))}
          {(dest.ports || []).map((p) => (
            <span
              key={`port-${p}`}
              className="inline-flex items-center rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] font-mono text-cyan-200"
            >
              :{p}
            </span>
          ))}
        </div>
      </Section>

      <DestinationSignals signals={dest.signals || []} />

      {dest.kind === "aws" && (dest.bucket_candidates?.length ?? 0) > 0 && (
        <Section title="Candidate S3 buckets" count={dest.bucket_candidates!.length}>
          <ul className="space-y-1.5">
            {dest.bucket_candidates!.map((b) => (
              <li
                key={b.name}
                className={`rounded border px-3 py-2 ${
                  b.is_public
                    ? "border-rose-500/50 bg-rose-500/10"
                    : "border-fuchsia-500/30 bg-fuchsia-500/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Database className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" />
                    <span className="text-[12px] font-mono text-fuchsia-50 truncate" title={b.name}>
                      {b.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-fuchsia-300 shrink-0">
                    {b.hits.toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mt-4 rounded border border-dashed border-slate-800 bg-slate-900/30 p-3 text-[11px] text-slate-400 leading-relaxed">
        <Info className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5 text-slate-500" />
        Egress allowlist and route-removal proposals are managed under the
        Route Table panel (click the RT card). NACL-level controls and reach
        across other workloads route through the per-system view.
      </div>
    </>
  )
}

function FieldChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="mt-0.5 text-[12px] text-slate-100">{value}</div>
    </div>
  )
}

function DestinationSignals({ signals }: { signals: string[] }) {
  const known = signals.filter((s) => SIGNAL_META[s])
  return (
    <Section title="Egress signals" count={known.length || undefined}>
      {known.length === 0 ? (
        <p className="text-[12px] text-slate-500 italic">No flagged signals on this destination.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {known.map((sig) => {
            const meta = SIGNAL_META[sig]
            const tone =
              meta.tone === "alert"
                ? "bg-rose-500/10 border-rose-500/40 text-rose-200"
                : meta.tone === "warning"
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                  : "bg-sky-500/10 border-sky-500/40 text-sky-200"
            return (
              <span
                key={sig}
                className={`inline-flex items-center rounded border px-2 py-1 text-[11px] font-medium ${tone}`}
                title={meta.tooltip}
              >
                {meta.label}
              </span>
            )
          })}
        </div>
      )}
    </Section>
  )
}

// ---- BUCKET ----------------------------------------------------------

interface S3AnalysisResponse {
  bucketName?: string
  bucketInfo?: {
    arn?: string
    region?: string
    account?: string
    encryption?: { type?: string; kmsKey?: string } | null
    tags?: Record<string, string>
    classification?: string | null
  } | null
  blockPublicAccess?: {
    blockPublicAcls?: boolean
    ignorePublicAcls?: boolean
    blockPublicPolicy?: boolean
    restrictPublicBuckets?: boolean
    allEnabled?: boolean
  }
  bucketPolicySummary?: {
    hasBucketPolicy?: boolean
    statementCount?: number
    statements?: Array<{
      sid?: string
      effect?: string
      actions?: string[]
      isPublicAccess?: boolean
      isOverlyBroad?: boolean
    }>
  }
  observedUsage?: {
    dataEventsStatus?: string
    dataEventsReason?: string | null
    topPrincipals?: Array<{
      principal: string
      actionCounts?: Array<{ action: string; count: number; lastSeen?: string | null }>
    }>
    totalRequests?: number
    uniquePrincipals?: number
    lastActivity?: string | null
  } | null
  insights?: Array<{ type?: string; title: string; description?: string; recommendation?: string }>
}

function BucketDetail({ row, bucketName }: { row: PathRow; bucketName: string }) {
  const bucketFromRow = row.bucketAccesses.find((b) => b.name === bucketName)
  const [data, setData] = useState<S3AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/proxy/s3-buckets/${encodeURIComponent(bucketName)}/analysis?window=30d`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<S3AnalysisResponse>
      })
      .then((d) => {
        if (cancelled) return
        setData(d)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bucketName])

  const bpa = data?.blockPublicAccess
  const bpaAllOn = !!bpa?.allEnabled
  const policySummary = data?.bucketPolicySummary
  const usage = data?.observedUsage

  return (
    <>
      <Section title="Identity">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <KVRow label="Name" value={bucketName} mono />
          {data?.bucketInfo?.arn && <KVRow label="ARN" value={data.bucketInfo.arn} mono />}
          {data?.bucketInfo?.region && <KVRow label="Region" value={data.bucketInfo.region} />}
          {data?.bucketInfo?.account && (
            <KVRow label="Account" value={data.bucketInfo.account} mono />
          )}
          {data?.bucketInfo?.classification && (
            <KVRow label="Classification" value={data.bucketInfo.classification.toUpperCase()} />
          )}
          {bucketFromRow?.is_public && (
            <KVRow
              label="Posture"
              value={
                <span className="inline-flex items-center rounded border border-rose-500/50 bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-100">
                  Public bucket
                </span>
              }
            />
          )}
        </div>
      </Section>

      <Section title="Public access controls">
        {loading ? (
          <p className="text-[12px] text-slate-500 italic">Loading public access posture…</p>
        ) : error ? (
          <p className="text-[12px] text-rose-300">Could not load posture: {error}</p>
        ) : !bpa ? (
          <p className="text-[12px] text-slate-500 italic">Not collected.</p>
        ) : (
          <>
            <div
              className={`mb-2 rounded border px-3 py-2 ${
                bpaAllOn
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-amber-500/50 bg-amber-500/10"
              }`}
            >
              <div className="flex items-center gap-2">
                {bpaAllOn ? (
                  <Shield className="w-4 h-4 text-emerald-300" />
                ) : (
                  <ShieldOff className="w-4 h-4 text-amber-300" />
                )}
                <span
                  className={`text-[12px] font-bold uppercase tracking-wider ${
                    bpaAllOn ? "text-emerald-100" : "text-amber-100"
                  }`}
                >
                  Block Public Access {bpaAllOn ? "fully enabled" : "partially disabled"}
                </span>
              </div>
            </div>
            <ul className="space-y-1">
              <BPARow label="Block public ACLs" enabled={!!bpa.blockPublicAcls} />
              <BPARow label="Ignore public ACLs" enabled={!!bpa.ignorePublicAcls} />
              <BPARow label="Block public policy" enabled={!!bpa.blockPublicPolicy} />
              <BPARow label="Restrict public buckets" enabled={!!bpa.restrictPublicBuckets} />
            </ul>
          </>
        )}
      </Section>

      {policySummary && (policySummary.statementCount ?? 0) > 0 && (
        <Section title="Bucket policy" count={policySummary.statementCount}>
          <ul className="space-y-1.5">
            {(policySummary.statements || []).slice(0, 6).map((stmt, idx) => {
              const tone = stmt.isPublicAccess
                ? "border-rose-500/50 bg-rose-500/10"
                : stmt.isOverlyBroad
                  ? "border-amber-500/50 bg-amber-500/10"
                  : "border-slate-800 bg-slate-900/40"
              return (
                <li key={stmt.sid || `stmt-${idx}`} className={`rounded border ${tone} px-3 py-2`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-mono text-slate-100 truncate">
                      {stmt.sid || `Statement ${idx + 1}`}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {stmt.effect || "Allow"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(stmt.actions || []).slice(0, 4).map((a) => (
                      <span
                        key={a}
                        className="inline-flex items-center rounded border border-slate-700 bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-mono text-slate-300"
                      >
                        {a}
                      </span>
                    ))}
                    {(stmt.actions || []).length > 4 && (
                      <span className="text-[10px] text-slate-500 italic self-center">
                        +{(stmt.actions || []).length - 4}
                      </span>
                    )}
                  </div>
                  {stmt.isPublicAccess && (
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-rose-200">
                      Public principal
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      <Section title="Encryption">
        {data?.bucketInfo?.encryption ? (
          <div className="rounded border border-slate-800 bg-slate-900/40 px-3 py-2 flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[12px] text-slate-100 font-semibold">
              {data.bucketInfo.encryption.type || "Enabled"}
            </span>
            {data.bucketInfo.encryption.kmsKey && (
              <span className="text-[10px] font-mono text-slate-500 truncate">
                · {data.bucketInfo.encryption.kmsKey}
              </span>
            )}
          </div>
        ) : (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-[12px] text-amber-100 font-semibold">
              Encryption status not reported
            </span>
          </div>
        )}
      </Section>

      <Section title="Observed activity (30d)">
        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="Reads"
            value={
              bucketFromRow
                ? bucketFromRow.hits.toLocaleString()
                : usage?.totalRequests?.toLocaleString() || "0"
            }
          />
          <Tile
            label="Principals"
            value={usage?.uniquePrincipals?.toLocaleString() || "—"}
          />
        </div>
        {bucketFromRow?.bytes_transferred && bucketFromRow.bytes_transferred > 0 && (
          <div className="mt-2 text-[11px] text-slate-400">
            <Hash className="w-3 h-3 inline-block mr-1 -mt-0.5" />
            Volume from this workload: {formatBytes(bucketFromRow.bytes_transferred)}
          </div>
        )}
      </Section>

      <Section title="Top operations" count={(bucketFromRow?.operations || []).length || undefined}>
        {(bucketFromRow?.operations || []).length === 0 ? (
          <p className="text-[12px] text-slate-500 italic">
            <ThreeStateValue state="not-wired" notWiredHint="Operation counts come from S3 server access logs / CloudTrail data events. Enable to see per-operation breakdown." />
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(bucketFromRow?.operations || []).map((op) => (
              <span
                key={op}
                className="inline-flex items-center rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-1 text-[11px] font-mono text-fuchsia-200"
              >
                {op}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent principals" count={(usage?.topPrincipals || []).length || undefined}>
        {(usage?.topPrincipals || []).length === 0 ? (
          <p className="text-[12px] text-slate-500 italic">
            <ThreeStateValue state="not-wired" notWiredHint="Per-principal access requires S3 data events enabled in CloudTrail. The bucket has not reported principals in the observation window." />
          </p>
        ) : (
          <ul className="space-y-1">
            {(usage?.topPrincipals || []).slice(0, 6).map((p) => {
              const total = (p.actionCounts || []).reduce((a, c) => a + (c.count || 0), 0)
              return (
                <li
                  key={p.principal}
                  className="rounded border border-slate-800 bg-slate-900/40 px-3 py-2 flex items-center justify-between gap-2"
                >
                  <span className="text-[11px] font-mono text-slate-100 truncate" title={p.principal}>
                    {p.principal}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {total.toLocaleString()}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {(data?.insights || []).length > 0 && (
        <Section title="Insights" count={(data?.insights || []).length}>
          <ul className="space-y-1.5">
            {(data?.insights || []).slice(0, 4).map((ins, idx) => (
              <li
                key={`${ins.title}-${idx}`}
                className={`rounded border px-3 py-2 ${
                  ins.type === "critical"
                    ? "border-rose-500/50 bg-rose-500/10"
                    : "border-amber-500/40 bg-amber-500/10"
                }`}
              >
                <div
                  className={`text-[12px] font-semibold ${
                    ins.type === "critical" ? "text-rose-100" : "text-amber-100"
                  }`}
                >
                  {ins.title}
                </div>
                {ins.description && (
                  <div className="mt-1 text-[11px] text-slate-300 leading-relaxed">
                    {ins.description}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mt-4 rounded border border-dashed border-slate-800 bg-slate-900/30 p-3 text-[11px] text-slate-400 leading-relaxed">
        <Info className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5 text-slate-500" />
        Policy-narrowing and statement removal are staged via the S3 Policy
        Analysis flow under the bucket inventory. Inline mutations are
        intentionally off here so changes route through the unified pipeline.
      </div>
    </>
  )
}

function BPARow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-1.5 rounded border border-slate-800/60 bg-slate-900/30">
      <span className="text-[12px] text-slate-200">{label}</span>
      {enabled ? (
        <span className="inline-flex items-center rounded border border-emerald-500/50 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200">
          On
        </span>
      ) : (
        <span className="inline-flex items-center rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
          Off
        </span>
      )}
    </li>
  )
}

