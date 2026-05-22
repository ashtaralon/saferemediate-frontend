"use client"

// NETWORK / IDENTITY / DATA plane panels — Slice 2 of the v2 redesign.
//
// Each panel picks the right node(s) off the path and surfaces the
// enriched data that's already on PathNodeDetail (open_ports,
// observed_ports, permissions, policy_details, rules, access_summary,
// encryption, traffic_summary) when ?enriched=true is on the IAP fetch.
//
// Three-state UI per feedback_no_mock_numbers_in_ui:
//   live      — data present on the path node → render it
//   absent    — backend doesn't carry the data yet → muted "not collected"
//   N/A       — node type doesn't have this concept → omitted
//
// No fabrication, no defaults that pretend to be data. If a field is
// null on the API response, the panel shows it as null.

import { useMemo, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Key,
  Database,
  AlertTriangle,
  Globe,
  Lock,
  Unlock,
  Eye,
  EyeOff,
} from "lucide-react"
import type { IdentityAttackPath, PathNodeDetail } from "@/components/identity-attack-paths/types"
import { isPrincipalNodeType } from "@/components/identity-attack-paths/types"

// ─────────────────────────────────────────────────────────────────
// Shared scaffold for the three panels — collapsible header,
// icon-tone, "coming next" → "live data" mode flip.
// ─────────────────────────────────────────────────────────────────
function PlaneSection({
  title,
  icon,
  iconTone,
  children,
  defaultOpen = true,
  emptyState,
}: {
  title: string
  icon: React.ReactNode
  iconTone: string
  children: React.ReactNode
  defaultOpen?: boolean
  emptyState?: React.ReactNode | null
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-900/40 transition-colors rounded-t-xl"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
        )}
        <span className={iconTone}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
          {title}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 text-sm text-slate-300">
          {children ?? emptyState ?? <NoDataLine label="Not collected for this path yet." />}
        </div>
      )}
    </div>
  )
}

function NoDataLine({ label }: { label: string }) {
  return <div className="text-[11px] text-slate-500 italic">{label}</div>
}

// Compact metric chip — uppercase label + value, used inside panels
// for at-a-glance numbers. Three-state: value rendered when defined,
// "—" when null/undefined (and tooltip explains why).
function Metric({
  label,
  value,
  tone = "slate",
  hint,
}: {
  label: string
  value: React.ReactNode
  tone?: "slate" | "amber" | "red" | "emerald" | "blue" | "violet"
  hint?: string
}) {
  const tones: Record<string, string> = {
    slate: "text-slate-200",
    amber: "text-amber-300",
    red: "text-red-300",
    emerald: "text-emerald-300",
    blue: "text-blue-300",
    violet: "text-violet-300",
  }
  return (
    <div className="flex flex-col gap-0.5" title={hint}>
      <span className="text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${tones[tone]}`}>
        {value ?? "—"}
      </span>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════
// NETWORK plane — pull SG/NACL/Subnet/VPC nodes off the path,
// surface their rules + posture + observed-vs-configured ports.
// ═════════════════════════════════════════════════════════════════
export function NetworkPlanePanel({ path }: { path: IdentityAttackPath }) {
  const network = useMemo(() => {
    const sgs = (path.nodes ?? []).filter((n) => n.type === "SecurityGroup")
    const nacls = (path.nodes ?? []).filter((n) => n.type === "NetworkACL" || n.type === "NACL")
    const subnets = (path.nodes ?? []).filter((n) => n.type === "Subnet")
    const vpces = (path.nodes ?? []).filter((n) => n.type === "VPCEndpoint")
    const workload = (path.nodes ?? []).find(
      (n) => n.type === "EC2Instance" || n.type === "LambdaFunction" || n.type === "ECSTask",
    )
    return { sgs, nacls, subnets, vpces, workload }
  }, [path])

  const hasAny =
    network.sgs.length > 0 ||
    network.nacls.length > 0 ||
    network.subnets.length > 0 ||
    network.vpces.length > 0
  if (!hasAny) {
    return (
      <PlaneSection
        title="Network Plane"
        icon={<ShieldAlert className="h-4 w-4" />}
        iconTone="text-orange-300"
      >
        <NoDataLine label="No network nodes appear on this path — the path traverses IAM and data planes only (no SG/NACL/Subnet gates between the start and the crown jewel)." />
      </PlaneSection>
    )
  }

  return (
    <PlaneSection
      title="Network Plane"
      icon={<ShieldAlert className="h-4 w-4" />}
      iconTone="text-orange-300"
    >
      {/* Workload-level network posture — public IP, internet exposure */}
      {network.workload && (
        <div className="mb-4 p-3 rounded-lg bg-slate-900/40 border border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            {network.workload.is_internet_exposed ? (
              <Globe className="h-3.5 w-3.5 text-red-300" />
            ) : (
              <Lock className="h-3.5 w-3.5 text-emerald-300" />
            )}
            <span className="text-xs font-semibold text-white">
              {network.workload.name}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {network.workload.type}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Metric
              label="Internet exposed"
              value={network.workload.is_internet_exposed ? "YES" : "NO"}
              tone={network.workload.is_internet_exposed ? "red" : "emerald"}
            />
            <Metric
              label="Open ports"
              value={network.workload.open_ports?.length ?? null}
              tone={(network.workload.open_ports?.length ?? 0) > 0 ? "amber" : "slate"}
              hint="Ports the SG allows ingress from anywhere"
            />
            <Metric
              label="Observed ports"
              value={network.workload.observed_ports?.length ?? null}
              tone="slate"
              hint="Ports with actual inbound traffic in the observation window"
            />
          </div>
          {network.workload.open_ports && network.workload.observed_ports && (
            <div className="mt-3 text-[11px]">
              <span className="text-slate-400">Open but unused: </span>
              <span className="text-amber-300 font-mono">
                {network.workload.open_ports
                  .filter((p) => !network.workload!.observed_ports!.includes(p))
                  .slice(0, 8)
                  .join(", ") || "none"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* SGs on the path */}
      {network.sgs.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
            Security Groups ({network.sgs.length})
          </div>
          <div className="space-y-1.5">
            {network.sgs.map((sg) => (
              <div
                key={sg.id}
                className="flex items-center gap-2 p-2 rounded-md bg-slate-900/50 border border-slate-800"
              >
                <ShieldAlert className="h-3.5 w-3.5 text-orange-300 shrink-0" />
                <span className="text-xs font-mono text-slate-200 truncate flex-1">{sg.name}</span>
                {sg.rules && (
                  <>
                    <span className="text-[10px] text-slate-500">
                      in {sg.rules.inbound_count} · out {sg.rules.outbound_count}
                    </span>
                    {sg.rules.open_to_internet && (
                      <span className="text-[9px] font-bold uppercase tracking-wider rounded border border-red-500/40 bg-red-500/10 text-red-300 px-1.5 py-0.5">
                        open to internet
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NACLs */}
      {network.nacls.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
            NACLs ({network.nacls.length})
          </div>
          {network.nacls.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-2 p-2 rounded-md bg-slate-900/50 border border-slate-800 mb-1"
            >
              <ShieldAlert className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
              <span className="text-xs font-mono text-slate-200 truncate">{n.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Subnets */}
      {network.subnets.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
            Subnets ({network.subnets.length})
          </div>
          {network.subnets.map((sn) => (
            <div
              key={sn.id}
              className="flex items-center gap-2 p-2 rounded-md bg-slate-900/50 border border-slate-800 mb-1"
            >
              <Globe className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
              <span className="text-xs font-mono text-slate-200 truncate">{sn.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* VPC Endpoints — the egress hop story */}
      {network.vpces.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
            VPC Endpoints ({network.vpces.length})
          </div>
          {network.vpces.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-2 p-2 rounded-md bg-violet-500/5 border border-violet-500/30 mb-1"
            >
              <Globe className="h-3.5 w-3.5 text-violet-300 shrink-0" />
              <span className="text-xs font-mono text-violet-200 truncate">{v.name}</span>
              <span className="text-[10px] text-violet-300/80 ml-auto">
                bypasses SG egress
              </span>
            </div>
          ))}
        </div>
      )}
    </PlaneSection>
  )
}

// ═════════════════════════════════════════════════════════════════
// IDENTITY plane — IAM role + permissions usage + assume-role chain.
// ═════════════════════════════════════════════════════════════════
export function IdentityPlanePanel({ path }: { path: IdentityAttackPath }) {
  const identity = useMemo(() => {
    const roles = (path.nodes ?? []).filter((n) => n.type === "IAMRole")
    const users = (path.nodes ?? []).filter((n) => n.type === "IAMUser" || n.type === "HumanIdentity")
    const profiles = (path.nodes ?? []).filter((n) => n.type === "InstanceProfile")
    // Principal-like = the entry-tier "who is authenticating" wrapper.
    // After the 2026-05-22 IAP canonical-type fix, STS-derived sessions
    // arrive as type "AWSPrincipal" (root + most SDK calls) or are
    // absorbed into the role bucket above as "IAMRole" (assumed-role
    // sessions). Widen the check so root + cross-account principals
    // keep landing in this bucket. STS sessions that already typed as
    // IAMRole intentionally land in `roles` above.
    const principals = (path.nodes ?? []).filter((n) => isPrincipalNodeType(n.type))
    return { roles, users, profiles, principals }
  }, [path])

  const hasAny =
    identity.roles.length > 0 ||
    identity.users.length > 0 ||
    identity.principals.length > 0
  if (!hasAny) {
    return (
      <PlaneSection
        title="Identity Plane"
        icon={<Key className="h-4 w-4" />}
        iconTone="text-pink-300"
      >
        <NoDataLine label="No identity nodes on this path — the path uses anonymous data plane access only." />
      </PlaneSection>
    )
  }

  return (
    <PlaneSection
      title="Identity Plane"
      icon={<Key className="h-4 w-4" />}
      iconTone="text-pink-300"
    >
      {/* Principals (the CloudTrail identity that authenticated) */}
      {identity.principals.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
            Authenticated as ({identity.principals.length})
          </div>
          {identity.principals.map((p) => {
            const isRoot = p.name === "root"
            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 p-2 rounded-md mb-1 border ${
                  isRoot
                    ? "bg-red-500/10 border-red-500/40"
                    : "bg-slate-900/50 border-slate-800"
                }`}
              >
                <Key className={`h-3.5 w-3.5 shrink-0 ${isRoot ? "text-red-300" : "text-pink-300"}`} />
                <span className={`text-xs font-mono truncate flex-1 ${isRoot ? "text-red-200" : "text-slate-200"}`}>
                  {p.name}
                </span>
                {isRoot && (
                  <span className="text-[9px] font-bold uppercase tracking-wider rounded border border-red-500/40 bg-red-500/15 text-red-300 px-1.5 py-0.5">
                    ROOT
                  </span>
                )}
                {p.has_mfa === true && (
                  <span className="text-[9px] font-bold uppercase tracking-wider rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5">
                    MFA
                  </span>
                )}
                {p.has_mfa === false && (
                  <span className="text-[9px] font-bold uppercase tracking-wider rounded border border-orange-500/40 bg-orange-500/10 text-orange-300 px-1.5 py-0.5">
                    NO MFA
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Instance profiles — the EC2 → role binding */}
      {identity.profiles.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
            Instance Profile chain ({identity.profiles.length})
          </div>
          {identity.profiles.map((ip) => (
            <div
              key={ip.id}
              className="flex items-center gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/30 mb-1"
            >
              <Key className="h-3.5 w-3.5 text-amber-300 shrink-0" />
              <span className="text-xs font-mono text-amber-200 truncate">{ip.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Roles with permission breakdown — the main signal */}
      {identity.roles.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
            IAM Roles on this path ({identity.roles.length})
          </div>
          {identity.roles.map((r) => {
            const perms = r.permissions
            const unused = (perms?.total ?? 0) - (perms?.used ?? 0)
            const unusedPct =
              perms?.total && perms.total > 0
                ? Math.round(((perms.total - (perms.used ?? 0)) / perms.total) * 100)
                : null
            return (
              <div
                key={r.id}
                className="p-3 rounded-md bg-pink-500/5 border border-pink-500/20 mb-2"
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Key className="h-3.5 w-3.5 text-pink-300 shrink-0" />
                  <span className="text-xs font-mono text-pink-200 truncate flex-1 min-w-0">
                    {r.name}
                  </span>
                  {(r as any).gap_count !== undefined && r.gap_count > 0 && (
                    <span className="text-[9px] font-bold uppercase tracking-wider rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 px-1.5 py-0.5">
                      {r.gap_count} gaps
                    </span>
                  )}
                </div>
                {/* InstanceProfile binding chip — surfaces the EC2 ↔ Role
                    binding mechanism even when the path itself didn't
                    traverse the InstanceProfile node (e.g. the BFS
                    chose the direct USES_ROLE edge). Data lives in
                    role.infra_context.iam_roles (where AWS-shaped
                    InstanceProfile neighbors are mixed with EC2 and
                    Lambda consumers) plus role.infra_context.instance_profiles
                    when the backend surfaces it explicitly. */}
                {(() => {
                  const ic = (r as any).infra_context
                  if (!ic) return null
                  const ipFromExplicit: any[] = Array.isArray(ic.instance_profiles)
                    ? ic.instance_profiles
                    : []
                  const ipFromMixed: any[] = (
                    Array.isArray(ic.iam_roles) ? ic.iam_roles : []
                  ).filter((n: any) => n?.type === "InstanceProfile")
                  const names = Array.from(
                    new Set([...ipFromExplicit, ...ipFromMixed].map((n) => n?.name).filter(Boolean)),
                  )
                  if (names.length === 0) return null
                  return (
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] text-amber-200/90 flex-wrap">
                      <span className="text-slate-500 uppercase tracking-wider">bound via:</span>
                      {names.map((n) => (
                        <span
                          key={n}
                          className="font-mono rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5"
                          title={`InstanceProfile ${n} binds an EC2 instance to this role. Compromise of the EC2 inherits this role's permissions automatically.`}
                        >
                          {n}
                        </span>
                      ))}
                      <span className="text-[9px] uppercase tracking-wider text-slate-600">
                        (instance profile)
                      </span>
                    </div>
                  )
                })()}
                {perms && (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-2">
                      <Metric label="Allowed" value={perms.total} tone="slate" />
                      <Metric label="Used" value={perms.used} tone="emerald" />
                      <Metric
                        label="Unused"
                        value={unusedPct !== null ? `${unused} (${unusedPct}%)` : unused}
                        tone={unusedPct && unusedPct > 50 ? "amber" : "slate"}
                        hint="Narrowable to observed actions only"
                      />
                    </div>
                    {perms.high_risk && perms.high_risk.length > 0 && (
                      <div className="text-[11px]">
                        <div className="text-slate-400 mb-1">High-risk actions allowed:</div>
                        <div className="flex flex-wrap gap-1">
                          {perms.high_risk.slice(0, 8).map((a) => (
                            <span
                              key={a}
                              className="font-mono text-[10px] rounded border border-red-500/30 bg-red-500/5 text-red-200 px-1.5 py-0.5"
                            >
                              {a}
                            </span>
                          ))}
                          {perms.high_risk.length > 8 && (
                            <span className="text-[10px] text-slate-500">
                              +{perms.high_risk.length - 8} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {!perms && (
                  <NoDataLine label="Permission breakdown not enriched on this fetch." />
                )}
                {r.policy_details && r.policy_details.wildcards.length > 0 && (
                  <div className="mt-2 text-[11px]">
                    <span className="text-amber-400">
                      ⚠ {r.policy_details.wildcards.length} wildcard{" "}
                      {r.policy_details.wildcards.length === 1 ? "statement" : "statements"}
                    </span>
                    <span className="text-slate-500">
                      {" "}
                      · {r.policy_details.inline_policies} inline · {r.policy_details.managed_policies} managed
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* IAM Users — rare on attack paths but surface when present */}
      {identity.users.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
            IAM Users on this path ({identity.users.length})
          </div>
          {identity.users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-2 p-2 rounded-md bg-slate-900/50 border border-slate-800 mb-1"
            >
              <Key className="h-3.5 w-3.5 text-pink-300 shrink-0" />
              <span className="text-xs font-mono text-slate-200 truncate">{u.name}</span>
              {u.has_console_access === true && (
                <span className="text-[9px] uppercase tracking-wider text-amber-300">
                  console
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </PlaneSection>
  )
}

// ═════════════════════════════════════════════════════════════════
// DATA plane — the crown jewel + observed access + encryption posture.
// ═════════════════════════════════════════════════════════════════
export function DataPlanePanel({ path }: { path: IdentityAttackPath }) {
  const data = useMemo(() => {
    const target = path.nodes?.find((n) => n.tier === "crown_jewel") ?? path.nodes?.[path.nodes.length - 1]
    const resources = (path.nodes ?? []).filter(
      (n) =>
        n.type === "S3Bucket" ||
        n.type === "RDSInstance" ||
        n.type === "DynamoDBTable" ||
        n.type === "KMSKey" ||
        n.type === "DatabaseColumn",
    )
    return { target, resources }
  }, [path])

  if (!data.target) {
    return (
      <PlaneSection
        title="Data Plane"
        icon={<Database className="h-4 w-4" />}
        iconTone="text-violet-300"
      >
        <NoDataLine label="No crown jewel resolved at the end of this path." />
      </PlaneSection>
    )
  }

  // Surface the damage_capability fields on the path — that's the
  // backend's pre-computed read/write/destructive verb counts.
  const dc = path.damage_capability

  return (
    <PlaneSection
      title="Data Plane"
      icon={<Database className="h-4 w-4" />}
      iconTone="text-violet-300"
    >
      <div className="p-3 rounded-md bg-violet-500/5 border border-violet-500/20 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Database className="h-3.5 w-3.5 text-violet-300 shrink-0" />
          <span className="text-xs font-semibold text-white truncate flex-1">
            {data.target.name}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            {data.target.type}
          </span>
        </div>

        {data.target.data_classification && (
          <div className="mb-2 text-[11px]">
            <span className="text-slate-400">Classification: </span>
            <span className="text-amber-300 font-semibold uppercase tracking-wider">
              {data.target.data_classification}
            </span>
          </div>
        )}

        {/* Damage capability verbs — the backend's pre-computed counts */}
        {dc && (
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Metric
              label="Read actions"
              value={(dc as any).read_count ?? null}
              tone="blue"
              hint="Actions the role can use to read this resource"
            />
            <Metric
              label="Write actions"
              value={(dc as any).write_count ?? null}
              tone="amber"
              hint="Actions that modify data"
            />
            <Metric
              label="Destructive"
              value={(dc as any).destructive_count ?? null}
              tone="red"
              hint="Actions that delete or make data unrecoverable"
            />
          </div>
        )}

        {/* Encryption posture */}
        {data.target.encryption && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Metric
              label="Encrypted at rest"
              value={
                data.target.encryption.at_rest ? (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3 w-3" /> YES
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Unlock className="h-3 w-3" /> NO
                  </span>
                )
              }
              tone={data.target.encryption.at_rest ? "emerald" : "red"}
            />
            <Metric
              label="Encrypted in transit"
              value={data.target.encryption.in_transit ? "YES" : "NO"}
              tone={data.target.encryption.in_transit ? "emerald" : "amber"}
            />
          </div>
        )}

        {/* Access summary — who else touches this resource */}
        {data.target.access_summary && (
          <div className="grid grid-cols-3 gap-3 mb-2">
            <Metric
              label="Distinct accessors"
              value={data.target.access_summary.total_accessors}
              tone="slate"
            />
            <Metric
              label="API calls (30d)"
              value={data.target.access_summary.api_calls}
              tone="slate"
            />
            <Metric
              label="Data volume"
              value={fmtBytes(data.target.access_summary.data_volume_bytes)}
              tone="slate"
            />
          </div>
        )}

        {!dc && !data.target.encryption && !data.target.access_summary && (
          <NoDataLine label="Data-plane enrichment not collected for this path yet." />
        )}
      </div>

      {/* Secondary resources on the path — rare but render when present */}
      {data.resources.length > 1 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
            Other resources on this path ({data.resources.length - 1})
          </div>
          {data.resources
            .filter((r) => r.id !== data.target!.id)
            .map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 p-2 rounded-md bg-slate-900/50 border border-slate-800 mb-1"
              >
                <Database className="h-3.5 w-3.5 text-violet-300 shrink-0" />
                <span className="text-xs font-mono text-slate-200 truncate">{r.name}</span>
                <span className="text-[10px] text-slate-500 ml-auto">{r.type}</span>
              </div>
            ))}
        </div>
      )}
    </PlaneSection>
  )
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  if (n === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}
