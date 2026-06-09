"use client"

// Closure Outcome panel — Slice 5 of the v2 attack-path redesign.
//
// Renders "what you're approving" for the path's remediation: BEFORE (today) →
// EXACT DIFF (the change, not the story) → AFTER (projected, then verified).
//
// Cyntro law (rule #3 + feedback_not_detection_response):
//   - never show a removal without the kept set,
//   - the headline is "damage closed, NOT path closed" — the app keeps what it
//     uses; we remove the dangerous, unused excess,
//   - never claim verified function-preservation until the proof signals are in.
//
// Composes alongside <DamagePanel/> and <HardeningPanel/> in the path analysis
// sidebar. Data comes from the backend EvidencePack / RemediationDiff contract
// via GET /api/attack-paths/<id>/closure-preview (see closure-outcome-types.ts).

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Minus,
  Check,
  RotateCcw,
  FileDiff,
  CircleSlash,
  AlertTriangle,
} from "lucide-react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { ClosurePreview, ClosureVerdict } from "./closure-outcome-types"
import { useClosurePreview } from "./use-closure-preview"

interface ClosureOutcomePanelProps {
  closure: ClosurePreview | null
  /** Optional: the live worst-case damage label for the BEFORE line when the
   *  preview hasn't been computed but the damage_capability has. */
  damageHint?: string | null
}

const VERDICT_META: Record<ClosureVerdict, { label: string; tone: string; bg: string }> = {
  auto_eligible: {
    label: "Auto-eligible · one-click approve",
    tone: "text-emerald-300",
    bg: "border-emerald-500/30 bg-emerald-500/[0.06]",
  },
  approval_required: {
    label: "Review required · human approves the exact diff",
    tone: "text-amber-300",
    bg: "border-amber-500/30 bg-amber-500/[0.06]",
  },
  blocked: {
    label: "Blocked · not approvable yet",
    tone: "text-red-300",
    bg: "border-red-500/30 bg-red-500/[0.06]",
  },
}

const DAMAGE_LABEL: Record<string, string> = {
  admin_access: "full takeover (admin)",
  admin_evasion: "takeover + disable audit",
  admin_posture: "rewrite bucket posture",
  destroy_bucket: "bucket destruction",
  delete_object: "object deletion",
  write: "tamper / write",
  read: "read / exfil",
}

function damageText(key: string | null | undefined): string {
  if (!key) return "—"
  return DAMAGE_LABEL[key] ?? key
}

export function ClosureOutcomePanel({ closure, damageHint }: ClosureOutcomePanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Honest absent-state — no preview computed for this path yet.
  if (!closure) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex items-center gap-2">
          <FileDiff className="h-4 w-4 text-emerald-300" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
            What you&apos;re approving
          </span>
        </div>
        <div className="text-[11px] text-slate-500 italic mt-2">
          Closure preview not computed for this path yet. Once the deterministic
          plan runs, the exact diff and projected after-state appear here.
        </div>
      </div>
    )
  }

  const { diff, after, proof, verdict, verdict_reasons, rollback_available, mode } = closure
  const vmeta = VERDICT_META[verdict] ?? VERDICT_META.approval_required
  const shownRemoved = diff.removed_actions.slice(0, 6)
  const shownKept = diff.kept_actions.slice(0, 6)

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.03] overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-emerald-500/[0.05] transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        )}
        <ShieldCheck className="h-4 w-4 text-emerald-300" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">
          What you&apos;re approving
        </span>
        <span className="ml-auto text-[10px] text-slate-400">
          damage closed, <span className="text-amber-300">not</span> path closed
        </span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {/* BEFORE — today */}
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-300" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
                Before · today
              </span>
            </div>
            <div className="text-[12px] text-slate-300">
              Worst case:{" "}
              <span className="text-red-300 font-semibold">
                {damageText(after.worst_damage_before ?? damageHint)}
              </span>
              {after.blast_radius_before && (
                <span className="text-slate-400"> · blast radius {after.blast_radius_before}</span>
              )}
            </div>
          </div>

          {/* EXACT DIFF — approve this, not the story */}
          <div className="rounded-lg border border-emerald-600/30 bg-slate-900/50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <FileDiff className="h-3.5 w-3.5 text-emerald-300" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
                Exact diff
              </span>
              <span className="ml-auto text-[10px] text-slate-500">approve this, not the story</span>
            </div>

            <div className="font-mono text-[11px] space-y-0.5">
              {shownRemoved.map((a) => (
                <div key={a} className="flex items-center gap-1.5 text-red-300">
                  <Minus className="h-3 w-3 shrink-0" /> {a}
                </div>
              ))}
              {diff.removed_actions.length > shownRemoved.length && (
                <div className="text-[10px] text-slate-500 italic pl-4">
                  +{diff.removed_actions.length - shownRemoved.length} more removed
                </div>
              )}
            </div>

            <div className="font-mono text-[11px] space-y-0.5 mt-2">
              {shownKept.map((a) => (
                <div key={a} className="flex items-center gap-1.5 text-emerald-300">
                  <Check className="h-3 w-3 shrink-0" /> {a}
                </div>
              ))}
              {diff.kept_actions.length > shownKept.length && (
                <div className="text-[10px] text-slate-500 italic pl-4">
                  +{diff.kept_actions.length - shownKept.length} more kept
                </div>
              )}
            </div>

            {diff.scoped_to_prefixes.length > 0 && (
              <div className="text-[11px] text-slate-400 mt-2">
                Scoped to{" "}
                <span className="font-mono text-emerald-300">
                  {diff.scoped_to_prefixes.join(", ")}
                </span>{" "}
                ({diff.scoped_resource_count} resource
                {diff.scoped_resource_count === 1 ? "" : "s"}) · delivered as {diff.delivered_as}
              </div>
            )}

            {/* Verdict — eligibility tier; human still approves in HITL */}
            <div className={`rounded-md border ${vmeta.bg} px-2.5 py-1.5 mt-2`}>
              <div className={`text-[11px] font-semibold ${vmeta.tone}`}>{vmeta.label}</div>
              {verdict_reasons.length > 0 && (
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {verdict_reasons.join(" · ")}
                </div>
              )}
            </div>
          </div>

          {/* AFTER — projected, then verified */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] p-3">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
                After · {proof?.verified ? "verified" : "projected"}
              </span>
            </div>
            <ul className="space-y-1 text-[12px] text-slate-200">
              <li className="flex items-start gap-1.5">
                <Check className="h-3 w-3 text-emerald-300 mt-0.5 shrink-0" />
                Required read/write preserved (scoped)
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3 w-3 text-emerald-300 mt-0.5 shrink-0" />
                Excess removed · worst case{" "}
                <span className="text-slate-400">
                  {damageText(after.worst_damage_before)} → {damageText(after.worst_damage_after)}
                </span>
              </li>
              {after.blast_radius_after && (
                <li className="flex items-start gap-1.5">
                  <Check className="h-3 w-3 text-emerald-300 mt-0.5 shrink-0" />
                  Blast radius {after.blast_radius_after}
                </li>
              )}
              {/* Function-preservation proof — honest about projected vs verified */}
              <li className="flex items-start gap-1.5">
                {proof?.verified ? (
                  <Check className="h-3 w-3 text-emerald-300 mt-0.5 shrink-0" />
                ) : (
                  <CircleSlash className="h-3 w-3 text-slate-500 mt-0.5 shrink-0" />
                )}
                {proof?.verified ? (
                  <span>
                    No breakage detected: {proof.newly_denied_calls ?? 0} newly-denied calls, no
                    rollback, no health regression
                    {(proof.canary_window || proof.telemetry_sources.length > 0) && (
                      <span className="text-slate-400">
                        {" "}
                        (
                        {[
                          proof.canary_window ? `${proof.canary_window} canary` : null,
                          proof.telemetry_sources.length ? proof.telemetry_sources.join(", ") : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        )
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Function-preservation proven during canary — not yet run (preview)
                  </span>
                )}
              </li>
            </ul>

            <div className="flex items-center gap-2 mt-2.5">
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> Damage closed
              </span>
              {after.path_open_after && (
                <span className="text-[10px] text-slate-500 italic">
                  path stays open — the app needs it
                </span>
              )}
              {rollback_available && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <RotateCcw className="h-3 w-3" /> one-click rollback
                </span>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-500 italic">
            The path isn&apos;t deleted — the role still reads and writes what it uses. What&apos;s
            removed is the dangerous, unused capability ({mode} mode). That&apos;s the claim a CISO
            can sign.
          </div>
        </div>
      )}
    </div>
  )
}

// Self-fetching wrapper — drops into the path analysis sidebar with just a
// pathId. Renders the live closure preview from the backend (which reads the
// Neo4j AttackPath node). Honest loading / error / empty states — NO mock data.
export function ClosureOutcomeSection({
  path,
}: {
  path: IdentityAttackPath | null | undefined
}) {
  const { closure, loading, error } = useClosurePreview(path)

  if (loading && !closure) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-[11px] text-slate-500">
        Computing closure preview…
      </div>
    )
  }
  if (error && !closure) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-[11px] text-slate-500 italic">
        Closure preview unavailable ({error}). No data shown.
      </div>
    )
  }
  return <ClosureOutcomePanel closure={closure} />
}
