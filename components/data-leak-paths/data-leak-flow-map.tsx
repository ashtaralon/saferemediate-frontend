"use client"

// Data Leak Flow Map — per-path egress visualization.
//
// Answers the operator question this page is FOR: "where could this
// workload phone home, and where is it actually phoning home?" The
// Attack Paths flow map answers a DIFFERENT question (which role can
// compromise which resource via IAM) — wrong plane for this page.
//
// Layout:
//
//   EGRESS PLANE · how data could leave
//     [Workload] → [Subnet] → [Security Group] → [NACL] → [Gateway] →
//                                                       [Internet destinations as cards]
//
//   ACCESS PLANE · what data is reachable
//     [Workload] → [IAM Role] → [Data Store] → [Observed actions]
//
// The leak is the intersection. Destination cards on the right of the
// egress lane are the load-bearing UX add — operator sees the actual
// IPs/orgs/services the workload reaches, not a summary count. For
// LATENT_EXPOSURE workloads (no observed external traffic in window)
// we render a single ghosted card stating the path is open but unused.
//
// Animated dashed edges via @keyframes dashMove from app/globals.css.
//
// Per feedback_no_mock_numbers_in_ui: every count comes from the live
// response. _state:"not_wired" fields render explicit copy.
// Per feedback_demo_safe_source_labels: vendor-neutral display strings.
// Per feedback_signal_language: never "suspicious" — explicit names.

import {
  Activity,
  AlertTriangle,
  Database,
  Globe2,
  Key,
  Lock,
  Network,
  Radio,
  Server,
  Shield,
  Zap,
} from "lucide-react"
import type {
  DataLeakBucket,
  DataLeakInternetDestinations,
  DataLeakPath,
} from "@/lib/types"

interface Props {
  path: DataLeakPath
}

export function DataLeakFlowMap({ path }: Props) {
  const observed = path.dataPlane.observedApiCalls
  const dests = path.networkPlane.internetDestinations
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/95 overflow-hidden text-slate-100">
      <Header path={path} />
      <div className="px-5 py-5 space-y-8 overflow-x-auto">
        <EgressLane path={path} dests={dests} />
        <AccessLane path={path} observed={observed} />
        <Legend bucket={path.workload.bucket} />
      </div>
    </section>
  )
}

function Header({ path }: { path: DataLeakPath }) {
  const observed = path.dataPlane.observedApiCalls
  const dests = path.networkPlane.internetDestinations
  return (
    <div className="px-5 py-3 border-b border-slate-700 bg-slate-900 flex items-center gap-3 flex-wrap">
      <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
        <Activity className="w-4 h-4 text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white">Egress flow map</div>
        <div className="text-[11px] text-slate-400 truncate font-mono">{path.pathId}</div>
      </div>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15">
        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
        <span className="text-[10px] font-semibold text-emerald-300 tracking-wider">LIVE</span>
      </span>
      <div className="flex items-center divide-x divide-slate-700 ml-1">
        <Metric
          label="Access events"
          value={
            observed._state === "wired" && typeof observed.totalEvents === "number"
              ? observed.totalEvents.toLocaleString()
              : "—"
          }
          accent="emerald"
        />
        <Metric
          label="Destinations"
          value={dests._state === "wired" ? String(dests.totalDistinct) : "—"}
          accent={dests.totalDistinct > 0 ? "amber" : "slate"}
        />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: "emerald" | "amber" | "slate"
}) {
  const cls =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "amber"
        ? "text-amber-300"
        : "text-slate-400"
  return (
    <div className="px-3 text-center">
      <div className={`text-sm font-bold ${cls}`}>{value}</div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Egress lane — the load-bearing view: where does/could this workload leak
// ---------------------------------------------------------------------------

function EgressLane({
  path,
  dests,
}: {
  path: DataLeakPath
  dests: DataLeakInternetDestinations
}) {
  const w = path.workload
  const gate = path.networkPlane.egressGate
  return (
    <div>
      <LaneHeader
        label="Egress plane · how data could leave"
        accent="amber"
        icon={<Network className="w-3.5 h-3.5" />}
      />
      <div className="flex items-stretch gap-0 min-w-max">
        <Node
          icon={<Server className="w-3.5 h-3.5 text-blue-300" />}
          kind="Workload"
          primary={w.name}
          secondary={w.type}
          tone="active"
        />
        <Edge label={null} />
        <Node
          icon={<Globe2 className="w-3.5 h-3.5 text-cyan-300" />}
          kind="Subnet"
          primary={w.subnet.name || w.subnet.id || "—"}
          secondary={
            w.subnet.isPublic === true
              ? "public"
              : w.subnet.isPublic === false
                ? "private"
                : "unknown"
          }
          tone={w.subnet.isPublic ? "warn" : "default"}
        />
        <Edge label={null} />
        <Node
          icon={<Shield className="w-3.5 h-3.5 text-pink-300" />}
          kind="Security group"
          primary={w.securityGroup.name || w.securityGroup.id || "—"}
          secondary={w.securityGroup.hasPublicEgress ? "0.0.0.0/0 egress" : "narrow egress"}
          tone={w.securityGroup.hasPublicEgress ? "warn" : "default"}
          badge={
            w.securityGroup.additionalCount && w.securityGroup.additionalCount > 0
              ? `+${w.securityGroup.additionalCount}`
              : null
          }
        />
        <Edge label={null} />
        <Node
          icon={<Lock className="w-3.5 h-3.5 text-orange-300" />}
          kind="NACL"
          primary={w.nacl?.id || "default"}
          secondary={w.nacl?.isDefault ? "default rules" : null}
          tone="muted"
        />
        <Edge label={null} />
        <Node
          icon={<Network className="w-3.5 h-3.5 text-amber-300" />}
          kind="Gateway"
          primary={
            gate
              ? humanGateKind(gate.kind)
              : path.workload.bucket === "ISOLATED"
                ? "No route"
                : "—"
          }
          secondary={gate?.id || w.routeTable.id || null}
          tone={gate ? "warn" : "muted"}
          badge={gate?.cidr === "0.0.0.0/0" ? "0/0" : null}
        />
        <Edge label={destinationsEdgeLabel(dests)} />
        <DestinationsColumn dests={dests} />
      </div>
    </div>
  )
}

function destinationsEdgeLabel(dests: DataLeakInternetDestinations): string | null {
  if (dests._state !== "wired") return null
  if (dests.totalDistinct === 0) return null
  const bytes = dests.topDestinations.reduce((s, d) => s + (d.bytes ?? 0), 0)
  if (bytes > 0) return formatBytes(bytes)
  const hits = dests.topDestinations.reduce((s, d) => s + (d.hits ?? 0), 0)
  return hits > 0 ? `${hits.toLocaleString()} hits` : null
}

function DestinationsColumn({ dests }: { dests: DataLeakInternetDestinations }) {
  if (dests._state === "not_wired") {
    return (
      <div className="min-w-[220px] flex items-center self-center">
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 w-full">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
            Internet destinations
          </div>
          <div className="text-[11px] text-slate-500 italic">
            Not yet computed for this system.
          </div>
        </div>
      </div>
    )
  }
  if (dests.totalDistinct === 0 || dests.topDestinations.length === 0) {
    return (
      <div className="min-w-[220px] flex items-center self-center">
        <div className="rounded-lg border border-dashed border-slate-600 bg-slate-800/30 px-3 py-3 w-full">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
            <Globe2 className="w-3 h-3" />
            Internet destinations
          </div>
          <div className="text-[12px] text-slate-300 font-medium">No traffic observed</div>
          <div className="text-[10px] text-slate-500 leading-snug mt-0.5">
            The egress path is open. Workload could phone home anywhere but hasn’t in the window.
          </div>
        </div>
      </div>
    )
  }
  const cards = dests.topDestinations.slice(0, 5)
  const remaining = Math.max(0, dests.totalDistinct - cards.length)
  return (
    <div className="min-w-[230px] flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5 flex items-center gap-1.5 px-1">
        <Globe2 className="w-3 h-3" />
        Internet destinations
        <span className="ml-auto text-[10px] text-slate-500 font-mono normal-case tracking-normal">
          {dests.totalDistinct} total
        </span>
      </div>
      {cards.map((d, i) => (
        <DestinationCard key={`${d.ip || "?"}-${i}`} dest={d} />
      ))}
      {remaining > 0 && (
        <div className="text-[10px] text-slate-400 italic px-1">
          + {remaining} more — see table below
        </div>
      )}
    </div>
  )
}

function DestinationCard({
  dest,
}: {
  dest: DataLeakInternetDestinations["topDestinations"][number]
}) {
  const kindCls =
    dest.kind === "external"
      ? "border-rose-500/40 bg-rose-500/8"
      : dest.kind === "aws"
        ? "border-blue-500/40 bg-blue-500/8"
        : "border-slate-700 bg-slate-800/60"
  const kindIcon =
    dest.kind === "external" ? (
      <Globe2 className="w-3 h-3 text-rose-300" />
    ) : dest.kind === "aws" ? (
      <Database className="w-3 h-3 text-blue-300" />
    ) : (
      <Radio className="w-3 h-3 text-slate-400" />
    )
  const primary = dest.service ? humanService(dest.service) : dest.org || dest.ip || "—"
  const secondary = dest.ip || (dest.org && dest.service ? dest.org : null)
  const hits = dest.hits ?? 0
  return (
    <div className={`rounded-md border px-2.5 py-1.5 ${kindCls}`}>
      <div className="flex items-center gap-1.5">
        {kindIcon}
        <span className="text-[11px] text-white font-medium truncate">{primary}</span>
        {dest.signals && dest.signals.length > 0 && (
          <span
            className="ml-auto text-[9px] px-1 py-px rounded bg-amber-500/20 text-amber-300 border border-amber-500/40"
            title={dest.signals.join(", ")}
          >
            <AlertTriangle className="w-2.5 h-2.5 inline" />
          </span>
        )}
      </div>
      {secondary && (
        <div className="text-[10px] text-slate-400 truncate font-mono mt-0.5">{secondary}</div>
      )}
      {hits > 0 && (
        <div className="text-[9px] text-slate-500 mt-0.5">
          {hits.toLocaleString()} hits
          {dest.bytes ? ` · ${formatBytes(dest.bytes)}` : ""}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Access lane — what data is reachable through this workload
// ---------------------------------------------------------------------------

function AccessLane({
  path,
  observed,
}: {
  path: DataLeakPath
  observed: DataLeakPath["dataPlane"]["observedApiCalls"]
}) {
  const role = path.workload.iamRole
  const store = path.dataStore
  return (
    <div>
      <LaneHeader
        label="Access plane · what data is reachable"
        accent="violet"
        icon={<Lock className="w-3.5 h-3.5" />}
      />
      <div className="flex items-stretch gap-0 min-w-max">
        <Node
          icon={<Server className="w-3.5 h-3.5 text-blue-300" />}
          kind="Workload"
          primary={path.workload.name}
          secondary={path.workload.type}
          tone="active"
        />
        <Edge label="assumes" />
        <Node
          icon={<Key className="w-3.5 h-3.5 text-yellow-300" />}
          kind="Workload identity"
          primary={role.name || "—"}
          secondary={role.id ? truncateArn(role.id) : null}
          tone={role.name ? "default" : "muted"}
        />
        <Edge label={accessEdgeLabel(observed)} />
        <Node
          icon={<Database className="w-3.5 h-3.5 text-emerald-300" />}
          kind={store.crownJewelClass}
          primary={store.name}
          secondary={store.crownJewelClass}
          tone="active"
        />
        <Edge label={null} />
        <ActionsColumn observed={observed} />
      </div>
    </div>
  )
}

function accessEdgeLabel(
  observed: DataLeakPath["dataPlane"]["observedApiCalls"],
): string | null {
  if (observed._state !== "wired") return null
  const events = observed.totalEvents ?? 0
  if (events === 0) return null
  return `${formatCount(events)} events`
}

function ActionsColumn({
  observed,
}: {
  observed: DataLeakPath["dataPlane"]["observedApiCalls"]
}) {
  if (observed._state === "not_wired") {
    return (
      <div className="min-w-[210px] flex items-center self-center">
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 w-full">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
            Observed actions
          </div>
          <div className="text-[11px] text-slate-500 italic">
            Activity history not yet computed.
          </div>
        </div>
      </div>
    )
  }
  const actions = observed.actions || []
  if (actions.length === 0) {
    return (
      <div className="min-w-[210px] flex items-center self-center">
        <div className="rounded-lg border border-dashed border-slate-600 bg-slate-800/30 px-3 py-3 w-full">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
            Observed actions
          </div>
          <div className="text-[11px] text-slate-500 italic">None in window.</div>
        </div>
      </div>
    )
  }
  const shown = actions.slice(0, 6)
  const remaining = Math.max(0, actions.length - shown.length)
  return (
    <div className="min-w-[240px] max-w-[320px]">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
        <Zap className="w-3 h-3 text-violet-300" />
        Observed actions
        <span className="ml-auto text-[10px] text-slate-500 font-mono normal-case tracking-normal">
          {actions.length} action{actions.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {shown.map((a) => (
          <span
            key={a}
            className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 text-violet-200 font-mono"
          >
            {a}
          </span>
        ))}
        {remaining > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 border border-slate-600">
            +{remaining}
          </span>
        )}
      </div>
      {observed.lastSeen && (
        <div className="text-[10px] text-slate-500 mt-1.5">
          Last seen {new Date(observed.lastSeen).toLocaleDateString()}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared atoms
// ---------------------------------------------------------------------------

function LaneHeader({
  label,
  accent,
  icon,
}: {
  label: string
  accent: "amber" | "violet"
  icon: React.ReactNode
}) {
  const accentText = accent === "amber" ? "text-amber-300" : "text-violet-300"
  const accentBg =
    accent === "amber"
      ? "bg-amber-500/10 border-amber-500/30"
      : "bg-violet-500/10 border-violet-500/30"
  return (
    <div className="flex items-center gap-2 mb-3">
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.14em] border ${accentBg} ${accentText}`}
      >
        {icon}
        {label}
      </span>
    </div>
  )
}

function Node({
  icon,
  kind,
  primary,
  secondary,
  tone,
  badge,
}: {
  icon: React.ReactNode
  kind: string
  primary: string | null
  secondary?: string | null
  tone: "default" | "active" | "warn" | "muted"
  badge?: string | null
}) {
  const cls =
    tone === "active"
      ? "border-amber-500/50 bg-amber-500/8"
      : tone === "warn"
        ? "border-rose-500/50 bg-rose-500/8"
        : tone === "muted"
          ? "border-slate-700 bg-slate-800/40 opacity-80"
          : "border-slate-700 bg-slate-800/60"
  return (
    <div
      className={`shrink-0 rounded-lg border ${cls} px-3 py-2 min-w-[150px] max-w-[200px] self-center`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="shrink-0">{icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{kind}</span>
        {badge && (
          <span className="ml-auto text-[9px] px-1 py-px rounded bg-slate-700/70 text-slate-300 font-mono">
            {badge}
          </span>
        )}
      </div>
      <div className="text-[12px] font-semibold text-white truncate" title={primary || ""}>
        {primary || <span className="text-slate-500 italic font-normal">—</span>}
      </div>
      {secondary && (
        <div className="text-[10px] text-slate-400 truncate font-mono mt-0.5" title={secondary}>
          {secondary}
        </div>
      )}
    </div>
  )
}

// Animated dashed edge between two nodes. Uses the dashMove keyframe
// defined in app/globals.css (background-position animation).
function Edge({ label }: { label: string | null }) {
  return (
    <div className="self-center flex flex-col items-center justify-center min-w-[44px] px-1">
      {label && (
        <div className="text-[9px] font-mono text-slate-300 mb-0.5 px-1.5 py-px rounded bg-slate-800/80 border border-slate-700">
          {label}
        </div>
      )}
      <div
        className="h-px w-full"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, rgba(148, 163, 184, 0.6) 0 4px, transparent 4px 10px)",
          backgroundSize: "20px 1px",
          animation: "dashMove 1.4s linear infinite",
        }}
      />
    </div>
  )
}

function Legend({ bucket }: { bucket: DataLeakBucket }) {
  return (
    <div className="border-t border-slate-700 pt-3 text-[10px] text-slate-400 leading-relaxed">
      <span className="text-slate-300 font-semibold">Why this is a leak path:</span>{" "}
      the workload has both a configured path to the public internet{" "}
      <span className="text-amber-300">(egress plane)</span> AND read access to the data store{" "}
      <span className="text-violet-300">(access plane)</span>.
      {bucket === "ACTIVE_INTERNET" && (
        <>
          {" "}
          <span className="text-rose-300">
            External destinations observed in the last 30 days — see right-most lane and the
            destinations table below.
          </span>
        </>
      )}
      {bucket === "AWS_REDIRECTABLE" && (
        <>
          {" "}
          <span className="text-amber-300">
            Traffic to managed-cloud services flows through the public route — each destination
            could be redirected onto a private bridge.
          </span>
        </>
      )}
      {bucket === "LATENT_EXPOSURE" && (
        <>
          {" "}
          <span className="text-amber-300">
            No traffic observed in the window — but the egress path is open and the workload could
            phone home at any time.
          </span>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanGateKind(kind: string): string {
  if (kind === "InternetGateway") return "Internet gateway"
  if (kind === "NATGateway") return "NAT gateway"
  if (kind === "EgressOnlyInternetGateway") return "Egress-only gateway"
  if (kind === "VPCEndpoint") return "Private network bridge"
  return kind || "Gateway"
}

function humanService(svc: string): string {
  const map: Record<string, string> = {
    s3: "Object storage",
    dynamodb: "Key-value store",
    kms: "Key management",
    ec2: "Compute control plane",
    ssm: "Systems management",
    sts: "Identity broker",
    secretsmanager: "Secret store",
    rds: "Managed database",
    lambda: "Function runtime",
    cloudwatch: "Telemetry",
    logs: "Log ingestion",
    sqs: "Message queue",
    sns: "Pub/sub",
  }
  return map[svc.toLowerCase()] || svc
}

function truncateArn(arn: string): string {
  if (arn.length <= 40) return arn
  return "…" + arn.slice(-39)
}

function formatBytes(n: number): string {
  if (!n) return "0 B"
  if (n < 1024) return `${n} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = n / 1024
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`
}

function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
}
