"use client"

// AttackerPathMap — the hero "story" view for one attack path.
//
// The clean, CISO-grade single-canvas map the static HTML proved out, now
// native and live: a Tier-1 kill-chain spine (Internet → foothold → role →
// crown jewel → egress) with gate colors + THE GAP, then the live
// before/exact-diff/after closure below (reuses ClosureOutcomePanel — we do
// NOT re-implement the diff).
//
// Every element reads a REAL field — path.nodes (PathNodeDetail), the
// materialized gates (path.materialized_path), damage_types, severity, and the
// live closure-preview. No mock; honest empty/loading states.
//
// Compiler v2 (schema_version 5): adds DynamoDB/KMS terminals + the
// ResourcePolicyGrant / ExternalPrincipal cross-account hop. The frontend
// IdentityAttackPath type isn't updated for v2 yet, so those are detected
// heuristically from node/edge strings (see detectCrossAccount / jewelMeta) —
// the map lights up the moment v5 paths land, no type churn required.

import {
  ShieldCheck,
  Server,
  KeyRound,
  Database,
  Table,
  Key,
  Globe,
  ArrowRight,
  AlertTriangle,
  Lock,
  Unlock,
  Network,
  Users,
} from "lucide-react"
import type {
  IdentityAttackPath,
  PathNodeDetail,
} from "@/components/identity-attack-paths/types"
import type { ClosurePreview } from "./closure-outcome-types"
import { useClosurePreview } from "./use-closure-preview"
import { ClosureOutcomePanel } from "./closure-outcome-panel"

// ── gate vocabulary → color (matches the analyzer's enum) ──────────────────
type GateState = "OPEN_OBSERVED" | "OPEN_CONFIG" | "UNKNOWN" | "CLOSED" | string
const GATE_META: Record<string, { label: string; tone: "red" | "amber" | "slate" | "emerald" }> = {
  OPEN_OBSERVED: { label: "open · observed", tone: "red" },
  OPEN_CONFIG: { label: "open · config", tone: "amber" },
  UNKNOWN: { label: "unverified", tone: "slate" },
  CLOSED: { label: "closed", tone: "emerald" },
}
function gate(s: GateState | undefined) {
  return GATE_META[s ?? "UNKNOWN"] ?? GATE_META.UNKNOWN
}

const DAMAGE_LABEL: Record<string, string> = {
  admin: "full takeover (admin)",
  delete: "destroy / delete",
  write: "tamper / write",
  read: "read / exfil",
}
const DAMAGE_RANK = ["read", "write", "delete", "admin"]
function worstDamage(types: string[] | undefined): string | null {
  if (!types || types.length === 0) return null
  const top = [...types].sort((a, b) => DAMAGE_RANK.indexOf(b) - DAMAGE_RANK.indexOf(a))[0]
  return DAMAGE_LABEL[top] ?? top
}

// ── crown-jewel terminal → icon + label (compiler v2: DDB / KMS / Secrets) ──
const JEWEL_META: Record<string, { Icon: typeof Database; label: string }> = {
  S3Bucket: { Icon: Database, label: "S3" },
  DynamoDBTable: { Icon: Table, label: "DynamoDB" },
  KMSKey: { Icon: Key, label: "KMS key" },
  SecretsManagerSecret: { Icon: Lock, label: "Secret" },
  RDSInstance: { Icon: Database, label: "RDS" },
}
function jewelMeta(type: string | undefined): { Icon: typeof Database; label: string } {
  if (!type) return { Icon: Database, label: "jewel" }
  const key = Object.keys(JEWEL_META).find((k) => type.includes(k))
  return key ? JEWEL_META[key] : { Icon: Database, label: type }
}

// ── derive the spine from real path nodes ──────────────────────────────────
function isComputeNode(n: PathNodeDetail): boolean {
  return /EC2|Instance|Lambda|Container|ECS|Task/i.test(n.type)
}
function pickFoothold(p: IdentityAttackPath): PathNodeDetail | undefined {
  return (
    p.nodes.find(isComputeNode) ??
    p.nodes.find((n) => n.tier === "entry" || n.lane === "compute") ??
    p.nodes[0]
  )
}
function pickRole(p: IdentityAttackPath): PathNodeDetail | undefined {
  return (
    p.nodes.find((n) => n.tier === "identity" && /Role|User/i.test(n.type)) ??
    p.nodes.find((n) => /IAMRole/i.test(n.type))
  )
}
function pickJewel(p: IdentityAttackPath): PathNodeDetail | undefined {
  return (
    p.nodes.find((n) => n.tier === "crown_jewel") ??
    p.nodes.find((n) => n.id === p.crown_jewel_id || n.canonical_id === p.crown_jewel_id) ??
    p.nodes[p.nodes.length - 1]
  )
}
function egressInfo(foothold: PathNodeDetail | undefined): { kind: string | null; hasVpce: boolean } {
  const routes = foothold?.route_table?.routes ?? []
  const igw = routes.find((r) => r.target_kind === "InternetGateway")
  const nat = routes.find((r) => r.target_kind === "NATGateway")
  const vpce = routes.some((r) => r.target_kind === "VPCEndpoint")
  return { kind: igw ? "IGW" : nat ? "NAT" : null, hasVpce: vpce }
}

// Compiler v2: ResourcePolicyGrant / ExternalPrincipal cross-account hop.
// Detect heuristically from node/edge strings until the frontend type adds
// explicit fields. Recognizes the external principal node ("external:wildcard",
// "external:cross_account"), an ExternalPrincipal/ResourcePolicyGrant label, or
// a TRUSTS / resource-policy edge.
function detectCrossAccount(p: IdentityAttackPath): { principal: string; via: string } | null {
  const extNode = p.nodes.find(
    (n) =>
      /ExternalPrincipal|ResourcePolicyGrant/i.test(n.type) ||
      String(n.id ?? "").startsWith("external:") ||
      String(n.name ?? "").startsWith("external:"),
  )
  const rpgEdge = (p.edges ?? []).find((e) =>
    /TRUSTS|RESOURCE_POLICY|ResourcePolicyGrant/i.test(e.type),
  )
  if (!extNode && !rpgEdge) return null
  return {
    principal: extNode?.name ?? "external principal",
    via: rpgEdge ? "resource-policy grant" : "cross-account trust",
  }
}

function bandColor(sev: string | undefined): string {
  switch ((sev ?? "").toUpperCase()) {
    case "CRITICAL":
      return "border-red-500/40 bg-red-500/10 text-red-300"
    case "HIGH":
      return "border-orange-500/40 bg-orange-500/10 text-orange-300"
    case "MEDIUM":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300"
    default:
      return "border-slate-600/40 bg-slate-700/20 text-slate-300"
  }
}

// ── small building blocks ──────────────────────────────────────────────────
const CHIP_TONE: Record<string, string> = {
  slate: "border-slate-700 bg-slate-800/60 text-slate-300",
  red: "border-red-500/30 bg-red-500/10 text-red-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  purple: "border-purple-500/30 bg-purple-500/10 text-purple-300",
}
function Chip({ children, tone = "slate" }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${CHIP_TONE[tone] ?? CHIP_TONE.slate}`}>
      {children}
    </span>
  )
}

function SpineNode({
  icon,
  kicker,
  title,
  chips,
  accent,
}: {
  icon: React.ReactNode
  kicker: string
  title: string
  chips?: React.ReactNode
  accent: string
}) {
  return (
    <div className={`min-w-[150px] max-w-[190px] shrink-0 rounded-xl border ${accent} px-3 py-2.5`}>
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
        {icon}
        {kicker}
      </div>
      <div className="mt-1 truncate font-mono text-[12px] font-semibold text-slate-100" title={title}>
        {title}
      </div>
      {chips && <div className="mt-1.5 flex flex-wrap gap-1">{chips}</div>}
    </div>
  )
}

function Connector({ label, tone }: { label?: string; tone?: "red" | "amber" | "slate" | "emerald" }) {
  const t = tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : "text-slate-500"
  return (
    <div className="flex shrink-0 flex-col items-center justify-center px-1">
      {label && <span className={`mb-0.5 whitespace-nowrap text-[9px] ${t}`}>{label}</span>}
      <ArrowRight className="h-4 w-4 text-slate-600" />
    </div>
  )
}

// ── the map ────────────────────────────────────────────────────────────────
export function AttackerPathMap({
  path,
  closure,
}: {
  path: IdentityAttackPath
  closure: ClosurePreview | null
}) {
  const foothold = pickFoothold(path)
  const role = pickRole(path)
  const jewel = pickJewel(path)
  const gates = path.materialized_path
  const egress = egressInfo(foothold)
  const cross = detectCrossAccount(path)
  const hasCompute = path.nodes.some(isComputeNode)
  const jm = jewelMeta(jewel?.type)

  const damage =
    worstDamage(path.damage_types) ??
    (closure?.after?.worst_damage_before
      ? DAMAGE_LABEL[closure.after.worst_damage_before] ?? closure.after.worst_damage_before
      : null)

  const sev = path.severity?.severity
  const score = path.severity?.overall_score
  const internetExposed = !!(foothold?.is_internet_exposed || foothold?.internet_exposure_alert?.is_exposed)
  const openPorts = foothold?.internet_exposure_alert?.open_ports ?? foothold?.open_ports ?? []

  const flags: string[] = []
  if (internetExposed && !egress.hasVpce) flags.push("no VPCE")
  if (foothold?.subnet_is_public) flags.push("public subnet")
  if (role?.has_mfa === false) flags.push("no MFA")
  if (jewel?.encryption && jewel.encryption.at_rest === false) flags.push("unencrypted at rest")
  if (cross) flags.push("cross-account")

  // Crown-jewel card — shared by both path shapes.
  const jewelCard = (
    <SpineNode
      icon={<jm.Icon className="h-3 w-3" />}
      kicker="crown jewel"
      title={jewel?.name ?? "—"}
      accent="border-emerald-500/40 bg-emerald-500/[0.05]"
      chips={
        <>
          <Chip tone="emerald">{jm.label}</Chip>
          {jewel?.data_classification && <Chip tone="amber">{jewel.data_classification}</Chip>}
          {jewel?.encryption?.at_rest === true && <Chip><Lock className="mr-0.5 h-2.5 w-2.5" />enc</Chip>}
          {jewel?.encryption?.at_rest === false && <Chip tone="red"><Unlock className="mr-0.5 h-2.5 w-2.5" />no enc</Chip>}
        </>
      }
    />
  )

  // Cross-account principal card (compiler v2 ExternalPrincipal / RPG hop).
  const crossCard = cross && (
    <SpineNode
      icon={<Users className="h-3 w-3" />}
      kicker={hasCompute ? "cross-account" : "external principal"}
      title={cross.principal}
      accent="border-purple-500/40 bg-purple-500/[0.05]"
      chips={<Chip tone="purple">{cross.via}</Chip>}
    />
  )

  // External-principal shape: no compute foothold — the attacker IS a
  // cross-account/external identity the jewel's resource policy trusts.
  const externalShape = cross && !hasCompute

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-300" />
        <span className="text-[12px] font-semibold tracking-wide text-slate-100">Attacker path</span>
        <span className="font-mono text-[12px] text-slate-300">
          {(externalShape ? cross?.principal : foothold?.name) ?? "entry"} <span className="text-slate-600">→</span> {jewel?.name ?? "crown jewel"}
        </span>
        {sev && (
          <span className={`ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${bandColor(sev)}`}>
            Exposure: {sev}{typeof score === "number" ? ` · ${Math.round(score)}` : ""}
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> open · observed</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> open · config</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> closed by fix</span>
        <span className="ml-auto text-slate-500">Live · Cyntro Behavioral Graph</span>
      </div>

      <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
        {externalShape ? (
          <>
            <SpineNode
              icon={<Users className="h-3 w-3" />}
              kicker="external principal"
              title={cross?.principal ?? "external"}
              accent="border-purple-500/40 bg-purple-500/[0.05]"
              chips={<Chip tone="purple">untrusted account</Chip>}
            />
            <Connector label={cross?.via} tone="amber" />
            {jewelCard}
          </>
        ) : (
          <>
            {internetExposed && (
              <>
                <SpineNode
                  icon={<Globe className="h-3 w-3" />}
                  kicker="internet"
                  title="0.0.0.0/0"
                  accent="border-slate-700 bg-slate-900/40"
                  chips={<Chip tone="red">public ingress</Chip>}
                />
                <Connector label="access" tone="red" />
              </>
            )}

            <SpineNode
              icon={<Server className="h-3 w-3" />}
              kicker="foothold"
              title={foothold?.name ?? "—"}
              accent="border-red-500/40 bg-red-500/[0.05]"
              chips={
                <>
                  <Chip>{foothold?.type ?? "compute"}</Chip>
                  {openPorts.length > 0 && <Chip tone="red">{openPorts.slice(0, 4).join("·")}</Chip>}
                  {foothold?.subnet_is_public && <Chip tone="amber">public</Chip>}
                </>
              }
            />
            <Connector label="IMDS → role creds" tone={gate(gates?.identity_gate).tone} />

            <SpineNode
              icon={<KeyRound className="h-3 w-3" />}
              kicker="identity"
              title={role?.name ?? closure?.diff?.role ?? "—"}
              accent="border-amber-500/40 bg-amber-500/[0.05]"
              chips={
                <>
                  {gates?.identity_gate && <Chip tone={gate(gates.identity_gate).tone}>{gate(gates.identity_gate).label}</Chip>}
                  {role?.has_mfa === false && <Chip tone="red">no MFA</Chip>}
                </>
              }
            />
            <Connector
              label={gates?.route_gate ? `route · ${gate(gates.route_gate).label}` : "route"}
              tone={gates?.route_gate ? gate(gates.route_gate).tone : "slate"}
            />

            {crossCard && (
              <>
                {crossCard}
                <Connector label={cross?.via} tone="amber" />
              </>
            )}

            {jewelCard}

            {egress.kind && (
              <>
                <Connector label="exfil egress" tone="red" />
                <SpineNode
                  icon={<Network className="h-3 w-3" />}
                  kicker="egress"
                  title={egress.kind}
                  accent="border-slate-700 bg-slate-900/40"
                  chips={!egress.hasVpce ? <Chip tone="red">no VPCE</Chip> : undefined}
                />
              </>
            )}
          </>
        )}
      </div>

      {/* THE GAP — the fix target */}
      {closure && closure.diff.removed_actions.length > 0 && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/[0.06] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            The gap — allowed, unused 90 days (the fix target)
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-red-200/90">
            {closure.diff.removed_actions.slice(0, 6).join(" · ")}
            {closure.diff.removed_actions.length > 6 && (
              <span className="text-slate-500"> (+{closure.diff.removed_actions.length - 6} more)</span>
            )}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            on <span className="font-mono text-slate-300">{closure.diff.role}</span> → grants {damage ?? "excess"}; scoped fix keeps {closure.diff.kept_actions.length} observed actions
            {closure.diff.scoped_to_prefixes.length > 0 && (
              <> on <span className="font-mono text-emerald-300">{closure.diff.scoped_to_prefixes.join(", ")}</span></>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {damage && (
          <span className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-300">
            <AlertTriangle className="h-3 w-3" /> worst case: {damage}
          </span>
        )}
        {flags.map((f) => (
          <span key={f} className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-2 py-0.5 text-[10px] text-amber-300">
            {f}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <ClosureOutcomePanel closure={closure} damageHint={path.damage_types?.[0] ?? null} />
      </div>
    </div>
  )
}

// Self-fetching section: drops into the path analysis panel with just a path.
// One closure-preview fetch; honest loading / empty states; no mock.
export function AttackerPathMapSection({
  path,
}: {
  path: IdentityAttackPath | null | undefined
}) {
  const { closure, loading, error } = useClosurePreview(path)

  if (!path) return null

  if (loading && !closure) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-[11px] text-slate-500">
        Building the attacker path map…
      </div>
    )
  }
  if (error && !closure) {
    return <AttackerPathMap path={path} closure={null} />
  }
  return <AttackerPathMap path={path} closure={closure} />
}
