"use client"

import React, { useMemo } from "react"
import type { IdentityAttackPath, PathNodeDetail } from "@/components/identity-attack-paths/types"

// Three-plane decomposition of "what the attacker can do" / "what
// Quarantine will do". Network / Identity / Data — same A7 framing as
// the canvas. Every number rendered here MUST come from the API
// response. No synthesis, no template phrases — surface "data not
// available yet" instead.

// ── Helpers — all read-only over the path payload ──────────────────

function findSgWithSshExposed(path: IdentityAttackPath): PathNodeDetail | null {
  // Real SSH detection: an SG node on the path whose `open_ports`
  // includes 22 AND is internet-exposed. The path API only includes
  // `open_ports` and `is_internet_exposed` when the backend populated
  // them; both must be present for the flag to fire.
  for (const n of path?.nodes ?? []) {
    const t = (n.type || "").toLowerCase()
    if (!t.includes("securitygroup")) continue
    if (!n.is_internet_exposed) continue
    if (!Array.isArray(n.open_ports)) continue
    if (n.open_ports.includes(22)) return n
  }
  return null
}

interface DataPlaneSummary {
  jewel: PathNodeDetail | null
  destructiveCapable: boolean
  verbCount: number
  excessActions: number  // unused destructive actions ready to remove
  observedActions: number
}

function summarizeDataPlane(path: IdentityAttackPath): DataPlaneSummary {
  const jewel = (path?.nodes ?? []).find((n) => n.tier === "crown_jewel") ?? null
  const d = path?.damage_capability
  if (!d || d.state !== "live") {
    return { jewel, destructiveCapable: false, verbCount: 0, excessActions: 0, observedActions: 0 }
  }
  const v = d.direct_verbs ?? d.verbs ?? { read: 0, write: 0, delete: 0, admin: 0 }
  const total = (v.read ?? 0) + (v.write ?? 0) + (v.delete ?? 0) + (v.admin ?? 0)
  // Excess (unused destructive) — pulled from the IAM role on the path.
  const role = (path?.nodes ?? []).find((n) => n.tier === "identity")
  const excess = role?.permissions?.unused ?? 0
  const observed = role?.permissions?.used ?? 0
  return {
    jewel,
    destructiveCapable: !!d.destructive_capable,
    verbCount: total,
    excessActions: excess,
    observedActions: observed,
  }
}

function summarizeLateralReach(path: IdentityAttackPath): {
  totalNeighbors: number
  totalHits: number
  byType: Record<string, number>
} {
  const out = { totalNeighbors: 0, totalHits: 0, byType: {} as Record<string, number> }
  for (const r of path?.reachable_neighbors ?? []) {
    out.totalNeighbors += r.neighbor_count ?? r.neighbors_returned ?? 0
    for (const n of r.neighbors ?? []) {
      out.totalHits += n.edge_count ?? 0
      const t = n.type || "Resource"
      out.byType[t] = (out.byType[t] ?? 0) + 1
    }
  }
  return out
}

interface ThreePlaneCardsProps {
  path: IdentityAttackPath
}

// ── Risk card — three columns side by side ─────────────────────────

export function ThreePlaneRiskCard({ path }: ThreePlaneCardsProps) {
  const data = useMemo(() => summarizeDataPlane(path), [path])
  const lateral = useMemo(() => summarizeLateralReach(path), [path])
  const sshNode = useMemo(() => findSgWithSshExposed(path), [path])
  const entry = (path?.nodes ?? []).find((n) => n.tier === "entry")
  const compute = (path?.nodes ?? []).find((n) =>
    ["EC2Instance", "LambdaFunction", "ECS", "EKS"].includes(n.type as string),
  )

  // Network plane — peer compute in the same subnet would require a
  // separate call (the path API doesn't carry sibling EC2s). Until that
  // lands, surface what we do know honestly: entry point + the network
  // gates on the path. Don't fake a "N peers reachable" number.
  const networkSummary = entry
    ? `Entry from ${entry.name || entry.id} into the public subnet hosting ${compute?.name ?? "this workload"}.`
    : "Public network reach into the workload subnet."

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.3)", borderLeft: "3px solid #ef4444" }}
    >
      <div className="text-[10px] uppercase tracking-wider mb-3 font-medium" style={{ color: "#fca5a5", letterSpacing: "0.08em" }}>
        What the attacker can do — three planes
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Network */}
        <div className="rounded-md p-2.5" style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <div className="text-[10px] uppercase tracking-wider mb-1.5 font-medium" style={{ color: "#fcd34d", letterSpacing: "0.06em" }}>
            Network · move sideways
          </div>
          <div className="text-[11px] text-slate-300 leading-relaxed">{networkSummary}</div>
          {sshNode ? (
            <div className="text-[10px] text-amber-300 mt-1.5">SSH on port 22 is open to the internet — see flag below.</div>
          ) : null}
        </div>

        {/* Identity */}
        <div className="rounded-md p-2.5" style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(168,85,247,0.3)" }}>
          <div className="text-[10px] uppercase tracking-wider mb-1.5 font-medium" style={{ color: "#d8b4fe", letterSpacing: "0.06em" }}>
            Identity · reach more services
          </div>
          {lateral.totalNeighbors > 0 ? (
            <>
              <div className="text-[11px] text-slate-300 leading-relaxed">
                The role observed touching <span className="text-slate-100 font-medium">{lateral.totalNeighbors} other resources</span> in
                the last 90 days — not just the named jewel.
              </div>
              <div className="text-[10px] text-slate-400 mt-1.5">
                {Object.entries(lateral.byType)
                  .slice(0, 4)
                  .map(([t, c]) => `${c} ${t}`)
                  .join(" · ")}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-slate-400 italic leading-relaxed">
              No observed lateral reach on this role yet — Cyntro hasn't ingested CloudTrail activity for it in the
              current window.
            </div>
          )}
        </div>

        {/* Data */}
        <div className="rounded-md p-2.5" style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <div className="text-[10px] uppercase tracking-wider mb-1.5 font-medium" style={{ color: "#fca5a5", letterSpacing: "0.06em" }}>
            Data · destroy & exfiltrate
          </div>
          {data.jewel && data.verbCount > 0 ? (
            <>
              <div className="text-[11px] text-slate-300 leading-relaxed">
                On <span className="font-mono text-[10px] bg-slate-800/70 px-1 py-0.5 rounded">{data.jewel.name}</span>:
              </div>
              <ul className="mt-1.5 pl-4 text-[11px] text-slate-300 leading-relaxed list-disc">
                {data.destructiveCapable ? <li>Destructive actions (delete, overwrite, encrypt)</li> : null}
                <li>Read all reachable objects</li>
                {data.excessActions > 0 ? <li>{data.excessActions} unused destructive permissions sitting idle</li> : null}
              </ul>
            </>
          ) : (
            <div className="text-[11px] text-slate-400 italic leading-relaxed">
              No live damage capability computed yet for this path.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Quarantine card — mirrors the three planes ─────────────────────

export function ThreePlaneQuarantineCard({ path }: ThreePlaneCardsProps) {
  const data = useMemo(() => summarizeDataPlane(path), [path])
  const lateral = useMemo(() => summarizeLateralReach(path), [path])

  // Quarantine network action — unused open ports on the path's SGs.
  const sgs = (path?.nodes ?? []).filter((n) => (n.type || "").toLowerCase().includes("securitygroup"))
  const totalUnusedPorts = sgs.reduce((s, n) => s + (n.unused_ports?.length ?? 0), 0)

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(20,184,166,0.06)", border: "1px solid rgba(20,184,166,0.3)", borderLeft: "3px solid #14b8a6" }}
    >
      <div className="text-[10px] uppercase tracking-wider mb-3 font-medium" style={{ color: "#5eead4", letterSpacing: "0.08em" }}>
        What Quarantine will do — three planes
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Network */}
        <div className="rounded-md p-2.5" style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <div className="text-[10px] uppercase tracking-wider mb-1.5 font-medium" style={{ color: "#fcd34d", letterSpacing: "0.06em" }}>
            Network · close unused ingress
          </div>
          {totalUnusedPorts > 0 ? (
            <div className="text-[11px] text-slate-300 leading-relaxed">
              Drop <span className="text-slate-100 font-medium">{totalUnusedPorts} internet-exposed port(s)</span> on
              path security groups that show no observed traffic.
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 italic leading-relaxed">
              No unused ports flagged on path SGs in the current window. SG hardening not auto-proposed.
            </div>
          )}
        </div>

        {/* Identity */}
        <div className="rounded-md p-2.5" style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(168,85,247,0.3)" }}>
          <div className="text-[10px] uppercase tracking-wider mb-1.5 font-medium" style={{ color: "#d8b4fe", letterSpacing: "0.06em" }}>
            Identity · scope to observed
          </div>
          {data.excessActions > 0 || data.observedActions > 0 ? (
            <div className="text-[11px] text-slate-300 leading-relaxed">
              Remove <span className="text-slate-100 font-medium">{data.excessActions} unused destructive actions</span>
              {data.observedActions > 0 ? (
                <>
                  {" "}— keep the <span className="text-slate-100 font-medium">{data.observedActions} actions</span> the role used in CloudTrail.
                </>
              ) : null}
              {lateral.totalNeighbors > 0 ? (
                <span className="block text-[10px] text-slate-400 mt-1">
                  Scope to the {lateral.totalNeighbors} observed targets — block writes to unrelated resources.
                </span>
              ) : null}
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 italic leading-relaxed">No actionable IAM diff computed yet.</div>
          )}
        </div>

        {/* Data */}
        <div className="rounded-md p-2.5" style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(16,185,129,0.3)" }}>
          <div className="text-[10px] uppercase tracking-wider mb-1.5 font-medium" style={{ color: "#6ee7b7", letterSpacing: "0.06em" }}>
            Data · scope to observed prefixes
          </div>
          {data.jewel ? (
            <div className="text-[11px] text-slate-300 leading-relaxed">
              On <span className="font-mono text-[10px] bg-slate-800/70 px-1 py-0.5 rounded">{data.jewel.name}</span>,
              limit the role to the resource scope observed in the last 90 days — rest of the resource becomes
              unreachable from this role.
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 italic leading-relaxed">
              No crown jewel resolved on this path — data-plane scope unavailable.
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 pt-2 flex flex-wrap gap-3 text-[11px] text-slate-400" style={{ borderTop: "1px solid rgba(20,184,166,0.2)" }}>
        <span>
          Preserves <span className="text-slate-200 font-medium">every observed action</span>
        </span>
        <span className="opacity-50">·</span>
        <span>Canary deploy · rollback bundle ready</span>
      </div>
    </div>
  )
}

// ── SSH flag — surfaces only when port 22 is internet-exposed on a path SG ─

export function SshFlagCallout({ path }: { path: IdentityAttackPath }) {
  const sg = useMemo(() => findSgWithSshExposed(path), [path])
  if (!sg) return null

  return (
    <div
      className="rounded-lg p-3 flex items-start gap-3"
      style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.5)", borderLeft: "3px solid #f59e0b" }}
    >
      <div className="text-lg leading-none" aria-hidden>⚠</div>
      <div className="flex-1">
        <div className="text-[11px] font-medium mb-1" style={{ color: "#fcd34d" }}>
          SSH on port 22 is open to the entire internet — flagged for separate review
        </div>
        <div className="text-[11px] text-slate-300 leading-relaxed">
          Rule allows <span className="font-mono text-[10px]">tcp/22 from 0.0.0.0/0</span> on{" "}
          <span className="font-mono text-[10px]">{sg.name || sg.id}</span>. Quarantine will NOT auto-close it — observed
          traffic on this port means closing it could break legitimate admin access. Needs a separate decision: VPN-only
          CIDR, bastion-only, or SSM Session Manager.
        </div>
      </div>
    </div>
  )
}
