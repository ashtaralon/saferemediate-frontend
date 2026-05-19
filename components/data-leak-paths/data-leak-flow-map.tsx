"use client"

// Data Leak Flow Map — per-path 9-lane dual-plane visualization.
//
// Adapts the visual treatment of components/dependency-map/traffic-flow-map
// (dark slate, lane-header chips, LIVE badge, formatBytes traffic labels)
// to the Data Leak Paths page's specific question: "how does this workload
// reach this data store AND how could it phone home?"
//
// Two horizontal strips, sharing the COMPUTE column:
//
//   NETWORK PLANE · exfil channel
//     [COMPUTE] → [SUBNET] → [SECURITY GROUP] → [NACL] → [ROUTE GATE] → [INTERNET]
//
//   DATA PLANE · read access
//     [COMPUTE] → [IAM ROLE] → [DATA STORE] → [API CALLS]
//
// The leak risk is the INTERSECTION of these two flows — the operator
// reads "this workload has read access to data X AND can phone home"
// in one diagram.
//
// Not a clone of TrafficFlowMap (deliberate: that file is 4300+ lines
// and is built for system-wide flow visualization with attack-path
// filtering, hover edges, animated SVG beziers). This is purpose-built
// for one (workload, data-store) path, no system-level state. When
// either component changes, do not couple them — each owns its own
// visual contract.
//
// Per feedback_demo_safe_source_labels: lane labels and node descriptions
// stay vendor-neutral ("Object storage" not "S3", "Internet gateway"
// not "IGW") — same set of strings already used by data-leak-paths-page.tsx.
//
// Per feedback_no_mock_numbers_in_ui: lane content reflects the live
// response. Empty lanes (NACL absent, no observed destinations) render
// a slate "n/a" tile rather than a fabricated placeholder.

import {
  ArrowRight,
  Database,
  Globe2,
  Key,
  Lock,
  Map as MapIcon,
  Network,
  Radio,
  Server,
  Shield,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react"
import type { DataLeakBucket, DataLeakPath } from "@/lib/types"

interface Props {
  path: DataLeakPath
}

export function DataLeakFlowMap({ path }: Props) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/95 overflow-hidden">
      <Header path={path} />
      <div className="px-4 py-5 space-y-5">
        <Strip
          label="Network plane · exfil channel"
          accent="amber"
          lanes={networkLanes(path)}
          icon={<Wifi className="w-3.5 h-3.5" />}
        />
        <Strip
          label="Data plane · read access"
          accent="violet"
          lanes={dataLanes(path)}
          icon={<Lock className="w-3.5 h-3.5" />}
        />
        <Legend bucket={path.workload.bucket} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ path }: { path: DataLeakPath }) {
  const observed = path.dataPlane.observedApiCalls
  const dests = path.networkPlane.internetDestinations
  return (
    <div className="px-4 py-3 border-b border-slate-700 bg-slate-900 flex items-center gap-3 flex-wrap">
      <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
        <MapIcon className="w-4 h-4 text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-white truncate">Path flow map</div>
        <div className="text-[11px] text-slate-400 truncate font-mono">{path.pathId}</div>
      </div>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15">
        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
        <span className="text-[10px] font-semibold text-emerald-300">LIVE</span>
      </span>
      <div className="hidden sm:flex items-center divide-x divide-slate-700 ml-1">
        <Metric
          label="Events"
          value={
            observed._state === "wired" && typeof observed.totalEvents === "number"
              ? observed.totalEvents.toLocaleString()
              : "—"
          }
          accent="emerald"
        />
        <Metric
          label="Destinations"
          value={
            dests._state === "wired" ? String(dests.totalDistinct) : "—"
          }
          accent="amber"
        />
      </div>
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent: "emerald" | "amber" }) {
  const valCls = accent === "emerald" ? "text-emerald-300" : "text-amber-300"
  return (
    <div className="px-3 text-center">
      <div className={`text-sm font-bold ${valCls}`}>{value}</div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Strip (one plane: lane row with arrows between)
// ---------------------------------------------------------------------------

type StripAccent = "amber" | "violet"

interface Lane {
  key: string
  label: string                 // uppercase lane header
  icon: React.ReactNode
  primary?: string | null       // main identifier on the node
  secondary?: string | null     // small subtitle line
  tone?: "default" | "active" | "warn" | "muted"
  badge?: string | null         // tiny chip in the corner
}

function Strip({
  label,
  accent,
  lanes,
  icon,
}: {
  label: string
  accent: StripAccent
  lanes: Lane[]
  icon: React.ReactNode
}) {
  const accentText = accent === "amber" ? "text-amber-300" : "text-violet-300"
  const accentBg   = accent === "amber" ? "bg-amber-500/10 border-amber-500/30" : "bg-violet-500/10 border-violet-500/30"
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.14em] border ${accentBg} ${accentText}`}>
          {icon}
          {label}
        </span>
      </div>
      <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
        {lanes.map((lane, i) => (
          <div key={lane.key} className="flex items-center shrink-0">
            <LaneNode lane={lane} />
            {i < lanes.length - 1 && <Connector />}
          </div>
        ))}
      </div>
    </div>
  )
}

function Connector() {
  return (
    <div className="flex items-center px-1.5">
      <ArrowRight className="w-4 h-4 text-slate-500" />
    </div>
  )
}

function LaneNode({ lane }: { lane: Lane }) {
  const tone = lane.tone ?? "default"
  const cls =
    tone === "active" ? "border-amber-500/50 bg-amber-500/8" :
    tone === "warn"   ? "border-rose-500/50  bg-rose-500/8"  :
    tone === "muted"  ? "border-slate-700    bg-slate-800/40 opacity-70" :
                        "border-slate-700    bg-slate-800/60"
  return (
    <div className={`rounded-lg border ${cls} px-3 py-2 min-w-[150px] max-w-[220px]`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-slate-300 shrink-0">{lane.icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          {lane.label}
        </span>
        {lane.badge && (
          <span className="ml-auto text-[9px] px-1 py-px rounded bg-slate-700/60 text-slate-300 font-mono">
            {lane.badge}
          </span>
        )}
      </div>
      <div className="text-[12px] font-semibold text-white truncate" title={lane.primary || ""}>
        {lane.primary || <span className="text-slate-500 italic font-normal">—</span>}
      </div>
      {lane.secondary && (
        <div className="text-[10px] text-slate-400 truncate font-mono mt-0.5" title={lane.secondary}>
          {lane.secondary}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lane composers
// ---------------------------------------------------------------------------

function computeLane(path: DataLeakPath): Lane {
  return {
    key: "compute",
    label: "Workload",
    icon: <Server className="w-3.5 h-3.5 text-blue-300" />,
    primary: path.workload.name,
    secondary: path.workload.type,
    tone: "active",
  }
}

function networkLanes(path: DataLeakPath): Lane[] {
  const w = path.workload
  const sg = w.securityGroup
  const dests = path.networkPlane.internetDestinations
  const gate = path.networkPlane.egressGate

  const subnetLane: Lane = {
    key: "subnet",
    label: "Subnet",
    icon: <Globe2 className="w-3.5 h-3.5 text-cyan-300" />,
    primary: w.subnet.name || w.subnet.id || "—",
    secondary: w.subnet.isPublic === true ? "public" : w.subnet.isPublic === false ? "private" : "unknown",
    tone: w.subnet.isPublic ? "warn" : "default",
  }

  const sgLane: Lane = {
    key: "sg",
    label: "Security group",
    icon: <Shield className="w-3.5 h-3.5 text-pink-300" />,
    primary: sg.name || sg.id || "—",
    secondary: sg.hasPublicEgress ? "0.0.0.0/0 egress" : "narrow egress",
    tone: sg.hasPublicEgress ? "warn" : "default",
    badge: sg.additionalCount && sg.additionalCount > 0 ? `+${sg.additionalCount}` : null,
  }

  const naclLane: Lane = {
    key: "nacl",
    label: "Network ACL",
    icon: <Lock className="w-3.5 h-3.5 text-orange-300" />,
    primary: w.nacl?.id || "default",
    secondary: w.nacl?.isDefault ? "default rules" : null,
    tone: "muted",
  }

  const routeLane: Lane = {
    key: "route",
    label: "Egress gate",
    icon: <Network className="w-3.5 h-3.5 text-amber-300" />,
    primary: gate ? humanGateKind(gate.kind) : (path.workload.bucket === "ISOLATED" ? "No internet route" : "—"),
    secondary: gate?.id || w.routeTable.id || null,
    tone: gate ? "warn" : "muted",
    badge: gate?.cidr === "0.0.0.0/0" ? "0/0" : null,
  }

  const destsLane: Lane = {
    key: "destinations",
    label: "Internet destinations",
    icon: dests.totalDistinct > 0
      ? <Radio className="w-3.5 h-3.5 text-rose-300" />
      : <WifiOff className="w-3.5 h-3.5 text-slate-400" />,
    primary: dests._state !== "wired"
      ? "Not yet computed"
      : dests.totalDistinct === 0
        ? "0 in last 30 days"
        : `${dests.totalDistinct} distinct`,
    secondary: dests._state === "wired" && dests.totalDistinct > 0
      ? `aws ${dests.byClass.aws} · ext ${dests.byClass.external}`
      : null,
    tone: dests._state !== "wired" ? "muted" : dests.byClass.external > 0 ? "warn" : "default",
    badge: dests.signals.length > 0 ? "signal" : null,
  }

  return [computeLane(path), subnetLane, sgLane, naclLane, routeLane, destsLane]
}

function dataLanes(path: DataLeakPath): Lane[] {
  const role = path.workload.iamRole
  const store = path.dataStore
  const observed = path.dataPlane.observedApiCalls

  const iamLane: Lane = {
    key: "iam",
    label: "Workload identity",
    icon: <Key className="w-3.5 h-3.5 text-yellow-300" />,
    primary: role.name || "—",
    secondary: role.id ? truncateArn(role.id) : null,
    tone: role.name ? "default" : "muted",
  }

  const storeLane: Lane = {
    key: "store",
    label: store.crownJewelClass,
    icon: <Database className="w-3.5 h-3.5 text-emerald-300" />,
    primary: store.name,
    secondary: store.crownJewelClass,
    tone: "active",
  }

  const apiLane: Lane = {
    key: "apis",
    label: "Observed actions",
    icon: <Zap className="w-3.5 h-3.5 text-violet-300" />,
    primary: observed._state === "wired" && observed.actions?.length
      ? observed.actions.slice(0, 2).join(", ") +
        (observed.actions.length > 2 ? ` +${observed.actions.length - 2}` : "")
      : observed._state === "not_wired"
        ? "Not yet computed"
        : "—",
    secondary: observed._state === "wired" && typeof observed.totalEvents === "number"
      ? `${observed.totalEvents.toLocaleString()} events`
      : null,
    tone: observed._state === "wired" ? "default" : "muted",
    badge: observed._state === "wired" ? "live" : null,
  }

  return [computeLane(path), iamLane, storeLane, apiLane]
}

// ---------------------------------------------------------------------------
// Legend / footer
// ---------------------------------------------------------------------------

function Legend({ bucket }: { bucket: DataLeakBucket }) {
  // The legend explains the dual-plane framing in one line so operators
  // unfamiliar with the page don't need to read the brief.
  return (
    <div className="border-t border-slate-700 pt-3 mt-1 text-[10px] text-slate-400 leading-relaxed">
      <span className="text-slate-300 font-semibold">Why this is a leak path:</span>{" "}
      the workload has both the right to read the data store{" "}
      <span className="text-violet-300">(data plane)</span>{" "}
      AND a configured path to the public internet{" "}
      <span className="text-amber-300">(network plane)</span>.{" "}
      {bucket === "ACTIVE_INTERNET" && (
        <span className="text-rose-300">External traffic observed in the last 30 days.</span>
      )}
      {bucket === "AWS_REDIRECTABLE" && (
        <span className="text-amber-300">Traffic to managed cloud services flows through the public route — redirectable to a private bridge.</span>
      )}
      {bucket === "LATENT_EXPOSURE" && (
        <span className="text-amber-300">No traffic observed in the window, but the path is open.</span>
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

function truncateArn(arn: string): string {
  // Show last 40 chars when the ARN is long — enough for the role name
  // to be visible without horizontal scroll.
  if (arn.length <= 40) return arn
  return "…" + arn.slice(-39)
}
