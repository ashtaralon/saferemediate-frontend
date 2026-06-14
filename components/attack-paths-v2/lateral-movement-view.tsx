"use client"

// Lateral Movement view — LIGHT.
//
// PURE RENDERER of real blast-radius data: path.reachable_neighbors
// (ReachableNeighborsByRole[]) — "for each IAM role on this path, the OTHER
// resources that role can also touch" (sibling neighbors not on the path
// spine). This is the lateral-movement diagram the CISO asked for ("show all
// services in each path"), recolored to the light card palette.
//
// NO MOCK DATA. If the path carries no reachable_neighbors, we say so (signal
// missing) rather than inventing reach. Every chip/card is a real neighbor.

import {
  Server,
  Database,
  KeyRound,
  Lock,
  User,
  Box,
  Globe,
  Network,
} from "lucide-react"
import type {
  IdentityAttackPath,
  ReachableNeighborsByRole,
} from "@/components/identity-attack-paths/types"
import { friendlyResourceName } from "./friendly-names"

const L = {
  page: "#eef1f5",
  card: "#ffffff",
  ink: "#1f2733",
  muted: "#6b7480",
  faint: "#8a93a3",
  rule: "#e2e6ec",
  chip: "#eef0f4",
  chipInk: "#3a4150",
  red: "#c0392b",
  redBg: "#fbeae8",
  amber: "#b5710f",
  blue: "#2f6fd0",
  pink: "#c2335e",
} as const

function typeMeta(type: string): { color: string; Icon: typeof Server } {
  const t = (type || "").toLowerCase()
  if (/lambda/.test(t)) return { color: "#ec7211", Icon: Box }
  if (/ec2|instance/.test(t)) return { color: "#ec7211", Icon: Server }
  if (/s3|bucket|dynamo|rds/.test(t)) return { color: "#4e9a3e", Icon: Database }
  if (/kms|key/.test(t)) return { color: "#5b4fc4", Icon: KeyRound }
  if (/secret/.test(t)) return { color: L.pink, Icon: Lock }
  if (/role|principal|user|policy|iam/.test(t)) return { color: L.pink, Icon: User }
  if (/vpc|subnet|sg|securitygroup|nacl|network/.test(t)) return { color: L.blue, Icon: Network }
  return { color: L.muted, Icon: Box }
}

export function LateralMovementView({
  path,
  groups: groupsOverride,
}: {
  path: IdentityAttackPath | null
  /** Resolved reachable-neighbor groups (e.g. derived from the facade canvas
   *  by LateralMovementPanel). Falls back to the path's own precomputed
   *  reachable_neighbors when not supplied. */
  groups?: ReachableNeighborsByRole[]
}) {
  const groups = groupsOverride ?? path?.reachable_neighbors ?? []

  if (!path) {
    return (
      <div className="p-8" style={{ background: L.page, color: L.ink, minHeight: 480 }}>
        <Empty title="Select a path" sub="Pick a path on the left to see where its identity can move laterally." />
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="p-8" style={{ background: L.page, color: L.ink, minHeight: 480 }}>
        <Header />
        <div
          className="rounded-xl px-5 py-4 mt-5"
          style={{ background: L.card, border: `1px solid ${L.rule}` }}
        >
          <p className="text-[14px] m-0" style={{ color: L.muted }}>
            No lateral reach computed for this path&apos;s identities — either the role touches
            nothing beyond this path, or the sibling-neighbor signal isn&apos;t collected yet. We
            show nothing rather than invent reach.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8" style={{ background: L.page, color: L.ink, minHeight: 480 }}>
      <Header />
      <div className="space-y-5 mt-5">
        {groups.map((g) => {
          const byType = Object.entries(g.by_type ?? {}).sort((a, b) => b[1] - a[1])
          return (
            <div
              key={g.role_id}
              className="rounded-2xl p-6"
              style={{ background: L.card, boxShadow: "0 1px 2px rgba(20,30,50,.05),0 6px 22px rgba(20,30,50,.05)" }}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center shrink-0" style={{ background: L.pink }}>
                  <User className="w-4 h-4" style={{ color: "#fff" }} />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold leading-tight truncate" style={{ color: L.ink }}>
                    {friendlyResourceName(g.role_name || g.role_id)}
                  </div>
                  <div className="text-[12px]" style={{ color: L.muted }}>
                    can also reach{" "}
                    <b style={{ color: L.ink }}>{g.neighbor_count}</b> other resource
                    {g.neighbor_count === 1 ? "" : "s"}
                    {g.neighbors_returned < g.neighbor_count ? ` (showing ${g.neighbors_returned})` : ""}
                  </div>
                </div>
              </div>

              {byType.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {byType.map(([type, count]) => (
                    <span
                      key={type}
                      className="text-[12px] font-semibold px-2.5 py-1 rounded-md"
                      style={{ background: L.chip, color: L.chipInk }}
                    >
                      {type} · {count}
                    </span>
                  ))}
                </div>
              )}

              {g.neighbors.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                  {g.neighbors.map((nb) => {
                    const meta = typeMeta(nb.type)
                    const Icon = meta.Icon
                    return (
                      <div
                        key={nb.id}
                        className="rounded-xl px-4 py-3 flex items-start gap-3"
                        style={{ background: "#f6f8fa", border: `1px solid ${L.rule}` }}
                      >
                        <div className="w-[26px] h-[26px] rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ background: meta.color }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: "#fff" }} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold leading-tight truncate" style={{ color: L.ink }} title={nb.name}>
                            {nb.name}
                          </div>
                          <div className="text-[11px] truncate" style={{ color: L.muted }} title={nb.type}>
                            {nb.type}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {nb.is_internet_exposed && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: L.redBg, color: L.red }}>
                                <Globe className="w-2.5 h-2.5" /> internet-facing
                              </span>
                            )}
                            {nb.edge_types.length > 0 && (
                              <span className="text-[10px]" style={{ color: L.faint }}>
                                {nb.edge_types.slice(0, 2).join(", ")}
                                {nb.edge_types.length > 2 ? ` +${nb.edge_types.length - 2}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Header() {
  return (
    <div>
      <div className="text-[16px] font-extrabold" style={{ color: L.ink }}>
        Lateral movement
      </div>
      <div className="text-[13px] mt-0.5" style={{ color: L.faint }}>
        where this path&apos;s identity can pivot next — sibling resources each role can also touch
      </div>
      {/* Scope note (DoD #4): this is intentionally PATH-SCOPED — the next-hop
          fan-out from this path's identities (the canvas laterals_by_node), not
          the role's full account-wide blast radius. */}
      <div className="text-[11px] mt-1.5" style={{ color: L.faint }}>
        Scope: next-hop reach from this path&apos;s identities — not the role&apos;s full
        account-wide blast radius.
      </div>
    </div>
  )
}

function Empty({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <div className="text-[15px] font-bold" style={{ color: L.ink }}>{title}</div>
      <div className="text-[13px] mt-1 max-w-md" style={{ color: L.muted }}>{sub}</div>
    </div>
  )
}
