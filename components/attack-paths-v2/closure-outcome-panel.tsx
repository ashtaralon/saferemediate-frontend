"use client"

// Closure Outcome panel — Slice 5 of the v2 attack-path redesign.
// 2026-06-10 presentation rewrite (Alon): the story is told from the
// ATTACKER'S EYES, in the clean 3-column style of the standalone
// attacker-path-map HTML — not as a wall of permission rows.
//
//   [ attacker story strip — foothold → identity → route → data → damage ]
//   [ BEFORE · today ] [ EXACT DIFF · approve this ] [ AFTER · projected ]
//
// Cyntro law (rule #3 + feedback_not_detection_response):
//   - never show a removal without the kept set (kept is summarized, not dumped),
//   - the headline is "damage reduced — path remains reachable" (never "path closed"),
//   - never claim verified function-preservation until the proof signals are in.
//
// REAL DATA ONLY — everything renders from the live closure-preview endpoint
// and the path's damage_capability. Absent data → honest absent states.
// The map itself is untouched; this panel is the story around it.

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Check,
  RotateCcw,
  FileDiff,
  CircleSlash,
} from "lucide-react"
import type { IdentityAttackPath, CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { ClosurePreview, ClosureVerdict } from "./closure-outcome-types"
import { useClosurePreview } from "./use-closure-preview"
import { AttackerNarrative } from "./attacker-narrative"

interface ClosureOutcomePanelProps {
  closure: ClosurePreview | null
  /** The path — powers the attacker story strip (foothold → gates → damage).
   *  Optional so existing call sites keep compiling; strip hides without it. */
  path?: IdentityAttackPath | null
  /** The crown jewel, for the narrative recap header. */
  jewel?: CrownJewelSummary | null
  /** Optional: the live worst-case damage label for the BEFORE line when the
   *  preview hasn't been computed but the damage_capability has. */
  damageHint?: string | null
}

const VERDICT_META: Record<ClosureVerdict, { label: string; cls: string }> = {
  auto_eligible: {
    label: "auto-eligible · one-click approve",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  approval_required: {
    label: "approval_required · human approves the exact diff",
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  blocked: {
    label: "blocked · not approvable yet",
    cls: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  },
}

// Precise data-plane damage wording — "full takeover" wrongly implies AWS
// account takeover; this is bucket-scoped admin/delete.
const DAMAGE_LABEL: Record<string, string> = {
  admin_access: "bucket admin + object delete",
  admin_evasion: "bucket admin + disable audit logging",
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

/** "s3:DeleteObject" → "DeleteObject" — service prefix is noise in a summary. */
function shortAction(a: string): string {
  const i = a.indexOf(":")
  return i >= 0 ? a.slice(i + 1) : a
}

// NOTE (2026-06-10): the inline "AttackerStoryStrip" was removed — it derived
// gate states / damage verbs in React, i.e. the frontend acting as analyst.
// The attacker story now renders ONLY via <AttackerNarrative/>, a pure
// renderer of the backend-owned AttackPathReport (bridge-compiled until the
// backend compiler endpoint ships). See attack-path-report-types.ts.

// ── Column shells — the standalone-HTML look: 3 tinted cards side by side ───

function StoryColumn({
  tone,
  title,
  children,
}: {
  tone: "before" | "diff" | "after"
  title: string
  children: React.ReactNode
}) {
  const cls =
    tone === "before"
      ? "border-red-500/30 bg-red-500/5"
      : tone === "diff"
        ? "border-teal-500/30 bg-teal-500/5"
        : "border-emerald-500/40 bg-emerald-500/5"
  const titleCls =
    tone === "before" ? "text-red-700 dark:text-red-300" : tone === "diff" ? "text-teal-700 dark:text-teal-300" : "text-emerald-700 dark:text-emerald-300"
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${titleCls}`}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold mt-2 ${cls}`}
    >
      {children}
    </span>
  )
}

export function ClosureOutcomePanel({ closure, path, jewel, damageHint }: ClosureOutcomePanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  // "Approve the exact diff, not the story" — the FULL diff must be one
  // click away before approval; the summary is only the resting state.
  const [showFullDiff, setShowFullDiff] = useState(false)

  // Honest absent-state — the narrative renders independently in the
  // section above; only the diff/after columns wait for the plan.
  if (!closure) {
    return (
      <div className="rounded-xl border-2 border-primary/20 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileDiff className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            What you&apos;re approving
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground italic">
          Closure preview not computed for this path yet. Once the deterministic plan runs,
          the exact diff and projected after-state appear here.
        </div>
      </div>
    )
  }

  const { diff, after, proof, verdict, verdict_reasons, rollback_available, mode } = closure
  const vmeta = VERDICT_META[verdict] ?? VERDICT_META.approval_required
  const shownRemoved = diff.removed_actions.slice(0, 4)
  const moreRemoved = diff.removed_actions.length - shownRemoved.length
  // Kept set summarized to one line (rule #3 satisfied without the wall).
  const keptPreview = diff.kept_actions.slice(0, 2).map(shortAction).join(" / ")

  return (
    <div id="what-youre-approving" className="scroll-mt-4 rounded-xl border-2 border-primary/20 bg-card overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-accent transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
          What you&apos;re approving
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Damage reduced — path remains reachable, destructive permissions removed
        </span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            The exact permission diff you are approving — not the narrative.
          </p>
          {/* The standalone-HTML 3-column story: BEFORE → DIFF → AFTER */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StoryColumn tone="before" title="Before · today">
              <div className="space-y-1.5 text-[12px] text-foreground leading-snug">
                <div>
                  Worst case:{" "}
                  <span className="text-red-700 dark:text-red-300 font-semibold">
                    {damageText(after.worst_damage_before ?? damageHint)}
                  </span>
                </div>
                {after.blast_radius_before && (
                  <div>
                    Blast radius: <span className="text-foreground font-semibold">{after.blast_radius_before}</span>
                  </div>
                )}
              </div>
              <Pill cls="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300">live today</Pill>
            </StoryColumn>

            <StoryColumn tone="diff" title="Exact diff · approve this, not the story">
              {/* Affected role visible before approval — shared-role impact. */}
              {diff.role && (
                <div className="text-[10px] text-muted-foreground mb-1.5 leading-snug">
                  affected role <span className="font-mono text-foreground">{diff.role}</span>
                </div>
              )}
              <div className="font-mono text-[11px] space-y-0.5">
                {(showFullDiff ? diff.removed_actions : shownRemoved).map((a) => (
                  <div key={a} className="text-red-700 dark:text-red-300">− {a}</div>
                ))}
                {showFullDiff ? (
                  diff.kept_actions.map((a) => (
                    <div key={a} className="text-emerald-700 dark:text-emerald-300 first:mt-2">✓ {a}</div>
                  ))
                ) : (
                  diff.kept_actions.length > 0 && (
                    <div className="text-emerald-700 dark:text-emerald-300 mt-2">
                      ✓ keep {keptPreview} ({diff.kept_actions.length})
                    </div>
                  )
                )}
                {diff.scoped_to_prefixes.length > 0 && (
                  <div className="text-emerald-700 dark:text-emerald-300">
                    ✓ scope → {diff.scoped_to_prefixes.join(", ")}
                  </div>
                )}
                {rollback_available && (
                  <div className="text-teal-700 dark:text-teal-300">+ rollback snapshot captured</div>
                )}
              </div>
              {(moreRemoved > 0 || diff.kept_actions.length > 2) && (
                <button
                  type="button"
                  onClick={() => setShowFullDiff((v) => !v)}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-[10px] font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 transition-colors"
                  data-testid="closure-full-diff-toggle"
                >
                  {showFullDiff
                    ? "Collapse diff"
                    : `View full policy diff (${diff.removed_actions.length} removed · ${diff.kept_actions.length} kept)`}
                </button>
              )}
              <Pill cls={vmeta.cls}>verdict: {vmeta.label}</Pill>
              {verdict_reasons.length > 0 && (
                <div className="text-[10px] text-muted-foreground mt-1">{verdict_reasons.join(" · ")}</div>
              )}
            </StoryColumn>

            <StoryColumn tone="after" title={`After · ${proof?.verified ? "verified" : "projected"}`}>
              <div className="space-y-1.5 text-[12px] text-foreground leading-snug">
                <div className="flex items-start gap-1.5">
                  <Check className="h-3 w-3 text-emerald-700 dark:text-emerald-300 mt-0.5 shrink-0" />
                  required read/write preserved (scoped)
                </div>
                <div>
                  Worst case: <span className="text-foreground font-semibold">{damageText(after.worst_damage_after)}</span>{" "}
                  <span className="text-muted-foreground">(was {damageText(after.worst_damage_before)})</span>
                </div>
                {after.blast_radius_after && (
                  <div>
                    Blast radius: <span className="text-foreground font-semibold">{after.blast_radius_after}</span>
                  </div>
                )}
                <div className="flex items-start gap-1.5">
                  {proof?.verified ? (
                    <Check className="h-3 w-3 text-emerald-700 dark:text-emerald-300 mt-0.5 shrink-0" />
                  ) : (
                    <CircleSlash className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <span className={proof?.verified ? undefined : "text-muted-foreground"}>
                    {proof?.verified
                      ? `no breakage: ${proof.newly_denied_calls ?? 0} newly-denied calls${
                          proof.canary_window ? ` (${proof.canary_window} canary)` : ""
                        }`
                      : "Function preservation: pending canary (projected only)"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* "Projected:" until the canary actually runs; flips to
                    "Verified:" only when proof is in — never overclaim. */}
                <Pill cls="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="h-3 w-3" />
                  {proof?.verified ? "Verified" : "Projected"}: damage reduced
                  {after.path_open_after && <span className="font-semibold opacity-80">— path stays open</span>}
                </Pill>
                {rollback_available && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-2">
                    <RotateCcw className="h-3 w-3" /> one-click rollback
                  </span>
                )}
              </div>
            </StoryColumn>
          </div>

          <div className="text-[11px] text-muted-foreground italic">
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
  jewel,
}: {
  path: IdentityAttackPath | null | undefined
  jewel?: CrownJewelSummary | null
}) {
  const { closure, loading, error, retry } = useClosurePreview(path)

  // The attacker narrative NEVER waits for the closure preview — it renders
  // from the path/report immediately; the diff panel streams in below it.
  return (
    <div className="space-y-3">
      {path && <AttackerNarrative path={path} jewel={jewel} closure={closure} />}
      {loading && !closure ? (
        <div id="what-youre-approving" className="scroll-mt-4 rounded-xl border border-border bg-card p-4 text-[11px] text-muted-foreground">
          Computing exact diff…
        </div>
      ) : error && !closure ? (
        // P0: never blank the approval anchor with "No data shown". The exact
        // diff is the trust anchor — show an honest, retryable state instead.
        <div id="what-youre-approving" className="scroll-mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
          <div className="flex items-center gap-2">
            <FileDiff className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
              Exact diff temporarily unavailable
            </span>
            <button
              type="button"
              onClick={retry}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[10px] text-foreground hover:bg-accent"
            >
              <RotateCcw className="h-3 w-3" /> Retry
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground italic mt-2 leading-snug">
            The deterministic plan didn&apos;t respond in time ({error}) — likely a backend
            cold start. Approval is disabled until the live diff loads; the attacker analysis and
            recommended fix above are unaffected. Retry to fetch the exact diff.
          </p>
        </div>
      ) : (
        <ClosureOutcomePanel closure={closure} path={path} jewel={jewel} />
      )}
    </div>
  )
}
