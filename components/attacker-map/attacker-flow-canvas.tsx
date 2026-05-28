"use client"

import React, { useMemo } from "react"
import type { IdentityAttackPath, PathNodeDetail } from "@/components/identity-attack-paths/types"

// Tier visual config — A7 categories. Color encodes which plane the node
// lives in (network vs. identity vs. data) so the eye can scan the chain.
// Keep palette to four planes + entry — heavier coloring failed the
// review (too many color associations to learn). Quarantine pill uses
// teal (#14b8a6) consistently.
const TIER_THEME: Record<string, { label: string; tint: string; border: string; text: string }> = {
  entry: { label: "Entry", tint: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.40)", text: "#fca5a5" },
  network: { label: "Network", tint: "rgba(6,182,212,0.12)", border: "rgba(6,182,212,0.50)", text: "#67e8f9" },
  gateway: { label: "Gateway", tint: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.40)", text: "#93c5fd" },
  security_group: { label: "SG", tint: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.50)", text: "#fcd34d" },
  compute: { label: "Compute", tint: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.40)", text: "#93c5fd" },
  identity: { label: "Identity", tint: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.50)", text: "#d8b4fe" },
  crown_jewel: { label: "Jewel", tint: "rgba(16,185,129,0.10)", border: "#ef4444", text: "#6ee7b7" },
}

// Shortened display name — keeps the canonical name in the title attribute
// so the operator can hover to see the full ARN/id. Per "no synthesis"
// rule: we shorten, we never invent.
function shortName(n: PathNodeDetail): string {
  const raw = n.name || n.id || "—"
  const cleaned = raw
    .replace(/^arn:aws:[a-z0-9-]+:::?/, "")
    .replace(/^arn:aws:[a-z0-9-]+:[a-z0-9-]*:[0-9]*:[a-z-]+\//, "")
  if (cleaned.length <= 20) return cleaned
  // Keep first 8 and last 6 — id-shaped suffixes (e.g. -745783559495)
  // stay visible without ellipsis stealing the recognizable head.
  return `${cleaned.slice(0, 14)}…`
}

// Pull the node's display tier — backend uses `lane` for the 5-column
// legacy layout and `tier` for the simpler 4-tier model. Map both to
// the theme keys above. Anything unrecognized falls back to network.
function tierKeyFor(n: PathNodeDetail): keyof typeof TIER_THEME {
  const t = (n.type || "").toLowerCase()
  const lane = (n.lane || "").toLowerCase()
  const tier = (n.tier || "").toLowerCase()
  if (tier === "entry" || lane === "entry") return "entry"
  if (tier === "crown_jewel" || lane === "crown_jewel") return "crown_jewel"
  if (t.includes("internetgateway") || t.includes("natgateway")) return "gateway"
  if (t.includes("routetable")) return "network"
  if (t.includes("subnet") || t.includes("vpc") || t.includes("nacl")) return "network"
  if (t.includes("securitygroup") || lane === "security_group") return "security_group"
  if (t.includes("ec2") || t.includes("lambda") || t.includes("ecs") || t.includes("eks") || lane === "compute") return "compute"
  if (t.includes("iam") || t.includes("role") || t.includes("instanceprofile") || lane === "iam" || tier === "identity") return "identity"
  return "network"
}

function subtitleFor(n: PathNodeDetail): string {
  const t = (n.type || "").toLowerCase()
  if (t.includes("internet") && t.includes("gateway")) return "Internet GW"
  if (t.includes("natgateway")) return "NAT GW"
  if (t.includes("routetable")) return "Route table"
  if (t.includes("subnet")) {
    if (n.subnet_is_public === true) return "Subnet · public"
    if (n.subnet_is_public === false) return "Subnet · private"
    return "Subnet"
  }
  if (t.includes("nacl")) return "Network ACL"
  if (t.includes("securitygroup")) {
    const total = (n.rules?.inbound_count ?? 0) + (n.rules?.outbound_count ?? 0)
    return total > 0 ? `${total} rules${n.rules?.open_to_internet ? " · public" : ""}` : "Security group"
  }
  if (t.includes("ec2")) return "EC2 instance"
  if (t.includes("lambda")) return "Lambda"
  if (t === "iamrole" || t.includes("iamrole")) {
    const used = n.permissions?.used ?? 0
    return used > 0 ? `${used} used actions` : "IAM role"
  }
  if (t.includes("instanceprofile")) return "Instance profile"
  if (t.includes("s3")) return "S3 bucket"
  if (t.includes("rds")) return "RDS database"
  if (t.includes("dynamo")) return "DynamoDB table"
  if (t.includes("kms")) return "KMS key"
  if (t.includes("secret")) return "Secret"
  return n.type || "Resource"
}

// Per-node Quarantine diff badge — populated from real data only.
// Empty string suppresses the badge so we never show "—" or "n/a".
function quarantineBadge(n: PathNodeDetail): string {
  const t = (n.type || "").toLowerCase()
  if (t.includes("securitygroup")) {
    // Count rules flagged removable: today the path API doesn't expose
    // per-rule remediability, so we under-promise. If `unused_ports`
    // arrives populated (open ports with no observed traffic) we show
    // that count; otherwise blank.
    const unused = n.unused_ports?.length ?? 0
    return unused > 0 ? `−${unused} rules` : ""
  }
  if (t.includes("iam") || t === "iamrole") {
    const unused = n.permissions?.unused ?? 0
    return unused > 0 ? `−${unused} actions` : ""
  }
  if (t.includes("s3") || t.includes("bucket")) {
    // Scope-to-prefixes only meaningful if observed prefixes exist on
    // damage_capability — UI surfaces that from the parent.
    return "scope policy"
  }
  return ""
}

interface AttackerFlowCanvasProps {
  path: IdentityAttackPath
  onNodeClick?: (node: PathNodeDetail) => void
  // Carried from CrownJewelSummary on the active jewel. "reachable_only"
  // means the jewel isn't tagged to the current system but is reachable
  // via this system's roles — rendered with an arrow glyph on the jewel
  // node so the operator sees the cross-system semantics at a glance.
  jewelSource?: string | null
}

export function AttackerFlowCanvas({ path, onNodeClick, jewelSource }: AttackerFlowCanvasProps) {
  // Render nodes in BFS order as returned by the backend. The path is
  // already topologically sorted from entry to crown jewel — don't
  // resort or repack it on the client (that's where the "synthesis"
  // problem starts).
  const nodes = useMemo(() => {
    if (!path?.nodes) return []
    // Dedupe by id while preserving order — paths sometimes carry the
    // same node twice when multiple edges reference it.
    const seen = new Set<string>()
    return path.nodes.filter((n) => {
      if (!n?.id || seen.has(n.id)) return false
      seen.add(n.id)
      return true
    })
  }, [path?.nodes])

  if (nodes.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
        No nodes on this path
      </div>
    )
  }

  return (
    <>
      <style jsx>{`
        @keyframes flow-dash {
          to { stroke-dashoffset: -18; }
        }
        .flow-arrow path { animation: flow-dash 0.9s linear infinite; }
      `}</style>
      <div
        className="rounded-lg border p-3 overflow-x-auto"
        style={{ background: "rgba(15,23,42,0.4)", borderColor: "rgba(148,163,184,0.12)" }}
      >
        <div className="flex items-stretch gap-1 min-w-max">
          {nodes.map((node, idx) => {
            const tier = tierKeyFor(node)
            const theme = TIER_THEME[tier]
            const isJewel = tier === "crown_jewel"
            const badge = quarantineBadge(node)
            const subtitle = subtitleFor(node)
            return (
              <React.Fragment key={node.id}>
                <button
                  type="button"
                  onClick={() => onNodeClick?.(node)}
                  className="flex flex-col items-center min-w-[110px] max-w-[140px] text-left bg-transparent border-0 p-0 cursor-pointer"
                  title={`${node.type}\n${node.name || node.id}`}
                >
                  <div
                    className="text-[9px] uppercase tracking-wider mb-1.5"
                    style={{ color: theme.text, letterSpacing: "0.08em", fontWeight: 500 }}
                  >
                    {theme.label}
                  </div>
                  <div
                    className="w-full rounded-md px-2 py-2 text-center transition-all hover:scale-105 relative"
                    style={{
                      background: theme.tint,
                      border: `${isJewel ? 2 : 1}px solid ${theme.border}`,
                      minHeight: 48,
                    }}
                  >
                    {isJewel && jewelSource === "reachable_only" ? (
                      <div
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{
                          background: "rgba(20,184,166,0.95)",
                          color: "#0f172a",
                          border: "1px solid rgba(15,23,42,0.85)",
                        }}
                        title="Reached by this system's roles · jewel tagged to another system"
                        aria-label="Cross-system jewel"
                      >
                        ↗
                      </div>
                    ) : null}
                    <div className="text-[11px] font-medium text-slate-100 truncate">{shortName(node)}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5 truncate">{subtitle}</div>
                  </div>
                  {badge ? (
                    <div
                      className="mt-1.5 w-full text-center rounded text-[9px] font-medium py-1 px-1"
                      style={{
                        background: "rgba(20,184,166,0.14)",
                        border: "1px solid rgba(20,184,166,0.5)",
                        color: "#5eead4",
                      }}
                    >
                      {badge}
                    </div>
                  ) : (
                    <div
                      className="mt-1.5 w-full text-center rounded text-[9px] py-1 px-1"
                      style={{
                        background: "rgba(15,23,42,0.6)",
                        border: "1px dashed rgba(148,163,184,0.25)",
                        color: "#94a3b8",
                      }}
                    >
                      read-only
                    </div>
                  )}
                </button>

                {idx < nodes.length - 1 ? (
                  <svg
                    className="flow-arrow self-start mt-7"
                    width={18}
                    height={20}
                    style={{ flex: "0 0 18px", overflow: "visible" }}
                    aria-hidden
                  >
                    <path
                      d="M 0 10 L 18 10"
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      strokeDasharray="6 3"
                      fill="none"
                    />
                    <polygon points="13,5 18,10 13,15" fill="#ef4444" />
                  </svg>
                ) : null}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </>
  )
}
