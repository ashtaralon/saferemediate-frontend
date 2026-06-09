"use client"

// Potential Damage panel — Slice 3 of the v2 redesign.
//
// Plain-English projection of what an attacker on this path can
// actually do. Translates the IAM actions on the role(s) on this
// path into operator-readable sentences via the
// iam-action-to-english lookup, grouped by capability class:
//
//   destructive — irreversible data loss
//   exfil       — data leaves the perimeter
//   manipulate  — change data / encryption / who can access
//   control_plane — everything else (catalogued generically)
//
// Three-state UI per `feedback_no_mock_numbers_in_ui`:
//   live   — when the path's IAMRole nodes carry permissions.high_risk
//   LLM    — when path.damage_narrative is present, surface above the
//            categorised list as the executive-readable line
//   thin   — when only counts are available, render the counts honestly
//   absent — when no IAM nodes at all, muted "not collected" line
//
// Per `feedback_not_detection_response` — framing is "the role has
// permission to…", NOT "an attacker did…". Cyntro is closure-by-
// observation, not detection.

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Skull,
  Download,
  Edit,
  HelpCircle,
  Sparkles,
} from "lucide-react"
import type {
  IdentityAttackPath,
  PathNodeDetail,
} from "@/components/identity-attack-paths/types"
import { classifyActions, type DamageCategory } from "./iam-action-to-english"

interface DamagePanelProps {
  path: IdentityAttackPath
  defaultCollapsed?: boolean
}

// Category meta — icon + tone + section title + intro line.
const CATEGORY_META: Record<
  DamageCategory,
  { title: string; icon: any; tone: string; bg: string; intro: string }
> = {
  destructive: {
    title: "Destructive — irreversible",
    icon: Skull,
    tone: "text-red-300",
    bg: "border-red-500/30 bg-red-500/[0.04]",
    intro: "Permission to do things that can't be undone:",
  },
  exfil: {
    title: "Exfiltration — data leaves the perimeter",
    icon: Download,
    tone: "text-orange-300",
    bg: "border-orange-500/30 bg-orange-500/[0.04]",
    intro: "Permission to read or copy sensitive data out:",
  },
  manipulate: {
    title: "Manipulation — change data, identity, or access",
    icon: Edit,
    tone: "text-amber-300",
    bg: "border-amber-500/30 bg-amber-500/[0.04]",
    intro: "Permission to modify or persist:",
  },
  control_plane: {
    title: "Other capabilities",
    icon: HelpCircle,
    tone: "text-slate-400",
    bg: "border-slate-700/40 bg-slate-900/30",
    intro: "Other permissions on the role:",
  },
}

export function DamagePanel({ path, defaultCollapsed = false }: DamagePanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  // Collect actions from every IAMRole on the path. Each role's
  // permissions.high_risk is the actionable subset; that's what the
  // backend has already flagged as worth showing. If the backend
  // surfaces a full action list per role in the future, the same
  // lookup table works without code change.
  const { capabilities, totalActions, roles } = useMemo(() => {
    const roles = (path.nodes ?? []).filter((n) => n.type === "IAMRole")
    const actions: string[] = []
    for (const r of roles) {
      if (r.permissions?.high_risk?.length) {
        actions.push(...r.permissions.high_risk)
      }
    }
    // De-dupe at action level (a role with iam:* and iam:CreateUser
    // shouldn't double-count).
    const unique = Array.from(new Set(actions.map((a) => a.toLowerCase())))
    return {
      capabilities: classifyActions(unique),
      totalActions: unique.length,
      roles,
    }
  }, [path])

  const dc = path.damage_capability
  const dcCounts = {
    destructive: (dc as any)?.destructive_count ?? null,
    write: (dc as any)?.write_count ?? null,
    read: (dc as any)?.read_count ?? null,
  }

  // Empty state — no IAM roles on path AND no damage_capability /
  // damage_narrative. Render honestly per `feedback_no_mock_numbers_in_ui`.
  const empty =
    roles.length === 0 &&
    !dc &&
    !path.damage_narrative

  if (empty) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-300" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
            Potential Damage
          </span>
        </div>
        <div className="text-[11px] text-slate-500 italic mt-2">
          No IAM role on this path and no damage capability surfaced on the
          response. Either this is a pure-network path (the workload can reach
          the resource but has no identity to act with), or the path's
          permission data hasn't been enriched yet.
        </div>
      </div>
    )
  }

  // Render order — destructive first (the slide that hits hardest),
  // then exfil, then manipulate, then control_plane.
  const order: DamageCategory[] = ["destructive", "exfil", "manipulate", "control_plane"]
  const visibleBuckets = order.filter((c) => capabilities[c].length > 0)

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.03] overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-red-500/[0.05] transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        )}
        <AlertTriangle className="h-4 w-4 text-red-300" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">
          Potential Damage
        </span>
        <span className="ml-auto text-[10px] text-slate-400">
          {totalActions} translated capabilit
          {totalActions === 1 ? "y" : "ies"}
        </span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {/* LLM damage narrative — executive-readable lead line when
              backend has Bedrock enabled. Falls back to a deterministic
              opener when not. */}
          {path.damage_narrative ? (
            <div className="flex items-start gap-2 pt-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-300 mt-0.5 shrink-0" />
              <div className="text-sm text-slate-200 leading-snug">
                {path.damage_narrative}
              </div>
            </div>
          ) : (
            roles.length > 0 && (
              <div className="text-sm text-slate-300 leading-snug pt-1">
                The role
                {roles.length > 1 ? "s" : ""}{" "}
                <span className="font-mono text-pink-300">
                  {roles.map((r) => r.name).join(", ")}
                </span>{" "}
                on this path can do the following on resources reachable from here:
              </div>
            )
          )}

          {/* Quick-glance counts when backend provides them */}
          {dc && (dcCounts.destructive !== null || dcCounts.write !== null || dcCounts.read !== null) && (
            <div className="flex items-center gap-4 text-[11px] flex-wrap">
              {dcCounts.destructive !== null && (
                <span>
                  <span className="text-red-300 font-semibold">{dcCounts.destructive}</span>
                  <span className="text-slate-400"> destructive</span>
                </span>
              )}
              {dcCounts.write !== null && (
                <span>
                  <span className="text-amber-300 font-semibold">{dcCounts.write}</span>
                  <span className="text-slate-400"> write/modify</span>
                </span>
              )}
              {dcCounts.read !== null && (
                <span>
                  <span className="text-blue-300 font-semibold">{dcCounts.read}</span>
                  <span className="text-slate-400"> read</span>
                </span>
              )}
            </div>
          )}

          {/* Categorised capability buckets */}
          {visibleBuckets.length === 0 ? (
            <div className="text-[11px] text-slate-500 italic">
              No high-risk IAM actions catalogued for the role
              {roles.length > 1 ? "s" : ""} on this path. The backend may not
              have flagged them yet, or this role is genuinely narrow. Per-role
              gap analysis on the legacy page has the full action list.
            </div>
          ) : (
            <div className="space-y-2">
              {visibleBuckets.map((cat) => {
                const meta = CATEGORY_META[cat]
                const Icon = meta.icon
                const items = capabilities[cat]
                return (
                  <div
                    key={cat}
                    className={`rounded-lg border ${meta.bg} p-3`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-3.5 w-3.5 ${meta.tone}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
                        {meta.title}
                      </span>
                      <span className="ml-auto text-[10px] text-slate-500">
                        {items.length}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mb-1.5 italic">
                      {meta.intro}
                    </div>
                    <ul className="space-y-1">
                      {items.slice(0, 12).map((sentence, i) => (
                        <li
                          key={`${cat}-${i}`}
                          className="text-[12px] text-slate-200 flex items-start gap-2"
                        >
                          <span className={`mt-1 inline-block w-1 h-1 rounded-full shrink-0 ${meta.tone.replace("text-", "bg-")}`} />
                          {sentence}
                        </li>
                      ))}
                      {items.length > 12 && (
                        <li className="text-[10px] text-slate-500 italic">
                          + {items.length - 12} more capabilities in this category
                        </li>
                      )}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          {/* Closure framing — set up the hardening panel below */}
          <div className="pt-1 text-[11px] text-slate-500 italic">
            Cyntro will narrow each of these to only what's actually used —
            see Recommended Hardening below for the closure plan.
          </div>
        </div>
      )}
    </div>
  )
}
