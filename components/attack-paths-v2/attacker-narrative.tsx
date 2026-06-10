"use client"

// Attacker Narrative — PURE RENDERER of a backend-owned AttackPathReport.
// 2026-06-10 architecture line (Alon): the compiler owns claims / grades /
// derived gates / damage / diff; this component owns layout, copy hierarchy,
// and conditional display. It must NEVER derive security meaning from raw
// path fields — that logic lives in the backend Attack-Path Compiler (interim:
// compile-attack-path-report.ts bridge, same rules, deletable).
//
// REAL DATA ONLY. Absent sections drop out; what's missing is surfaced in
// the "missing evidence" block (collection gaps are a feature, not silence).

import { Fragment } from "react"
import {
  Crosshair,
  KeyRound,
  Network,
  Database,
  ShieldAlert,
  ShieldCheck,
  Flame,
  Wrench,
  EyeOff,
  Check,
  X,
} from "lucide-react"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"
import type { ClosurePreview } from "./closure-outcome-types"
import type {
  AttackPathReport,
  AttackerPhase,
  EvidenceGrade,
} from "./attack-path-report-types"
import { claimsById, dominantGrade, RISK_REDUCTION_LABEL } from "./attack-path-report-types"
import { useAttackPathReport } from "./use-attack-path-report"

const GATE_CHIP: Record<string, string> = {
  AUTO_ELIGIBLE: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  REVIEW_REQUIRED: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  BLOCKED: "border-red-500/50 bg-red-500/10 text-red-300",
}

const GRADE_META: Record<EvidenceGrade, { label: string; cls: string; accent: string }> = {
  OBSERVED: {
    label: "proven · observed",
    cls: "border-red-500/50 bg-red-500/10 text-red-300",
    accent: "#EF5B53",
  },
  CONFIGURED: {
    label: "open · config",
    cls: "border-amber-500/50 bg-amber-500/10 text-amber-300",
    accent: "#F5B14C",
  },
  INFERRED: {
    label: "inferred · modeled",
    cls: "border-sky-500/50 bg-sky-500/10 text-sky-300",
    accent: "#6BB6E8",
  },
  UNKNOWN: {
    label: "unknown",
    cls: "border-slate-600 bg-slate-800/40 text-slate-400",
    accent: "#5F7186",
  },
  BLOCKED: {
    label: "blocked",
    cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
    accent: "#34D399",
  },
}

const MICRO_META: Record<
  string,
  { icon: React.ReactNode; accent: string; layerLabel: string; role: string }
> = {
  micro_permissions: { icon: <KeyRound className="h-3.5 w-3.5" />, accent: "#6BB6E8", layerLabel: "IAM", role: "Primary fix" },
  micro_segmentation: { icon: <Network className="h-3.5 w-3.5" />, accent: "#A78BFA", layerLabel: "Network", role: "Secondary hardening" },
  micro_access: { icon: <Database className="h-3.5 w-3.5" />, accent: "#34D399", layerLabel: "Data", role: "Data-scope refinement" },
}

const PHASE_META: Record<AttackerPhase, { step: string; icon: React.ReactNode }> = {
  LAND_ON_FOOTHOLD: { step: "1 · foothold", icon: <Flame className="h-3.5 w-3.5" /> },
  BECOME_IDENTITY: { step: "2 · identity gate", icon: <KeyRound className="h-3.5 w-3.5" /> },
  REACH_JEWEL: { step: "3 · route gate", icon: <Network className="h-3.5 w-3.5" /> },
  EXPLOIT_GAP: { step: "4 · the gap", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  HIT_CROWN_JEWEL: { step: "5 · data-plane gate", icon: <Database className="h-3.5 w-3.5" /> },
  EXFILTRATE_OR_DESTROY: { step: "6 · impact", icon: <Flame className="h-3.5 w-3.5" /> },
}

function sevCls(sev?: string): string {
  switch ((sev || "").toUpperCase()) {
    case "CRITICAL":
      return "border-red-500/50 bg-red-500/10 text-red-300"
    case "HIGH":
      return "border-orange-500/50 bg-orange-500/10 text-orange-300"
    case "MEDIUM":
      return "border-amber-500/50 bg-amber-500/10 text-amber-300"
    case "LOW":
      return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
    default:
      return "border-slate-600 bg-slate-800/40 text-slate-400"
  }
}

/** Pure renderer — everything on screen comes from the report object. */
export function AttackerNarrativeView({
  report,
  source,
}: {
  report: AttackPathReport
  source?: "backend" | "bridge" | null
}) {
  const byId = claimsById(report)
  const diff = report.remediation_diff
  const cs = report.current_state
  const statusLine =
    cs.status === "OPEN_TODAY"
      ? "Open today"
      : cs.status === "BLOCKED"
        ? "Chain broken by a control"
        : cs.status === "PARTIALLY_BLOCKED"
          ? "Partially blocked"
          : "State unverified"

  // ── Decision-first derivations (all from existing report fields) ────────
  const ORDER = ["ADMIN", "DELETE", "WRITE", "READ"]
  const presentCats = new Set<string>(
    report.damage_matrix.map((c) => String(c.category)).filter((c) => ORDER.includes(c)),
  )
  const damageVerbs = ORDER.filter((c) => presentCats.has(c))
  const fixGate = diff && report.safety_decision ? report.safety_decision.gate : null

  // What the fix REMOVES vs PRESERVES, derived from micro-enforcement reduces:
  // DATA_DELETE_DAMAGE → DELETE removed, DATA_ADMIN_DAMAGE → ADMIN removed;
  // READ/WRITE are the observed-needed verbs, preserved (scoped).
  const reduces = new Set((report.micro_enforcement ?? []).flatMap((m) => m.reduces ?? []))
  const removedCats = new Set<string>()
  if (reduces.has("DATA_DELETE_DAMAGE")) removedCats.add("DELETE")
  if (reduces.has("DATA_ADMIN_DAMAGE")) removedCats.add("ADMIN")

  const DAMAGE_META: Record<string, { label: string; impact: string }> = {
    ADMIN: { label: "Bucket Admin", impact: "change ACL, logging, or versioning" },
    DELETE: { label: "Delete Objects", impact: "destructive object-loss risk" },
    WRITE: { label: "Write Objects", impact: "tamper / implant poisoned objects" },
    READ: { label: "Read Objects", impact: "data exposure" },
  }
  const damageRows = ORDER.filter((c) => presentCats.has(c)).map((c) => ({
    cat: c,
    ...DAMAGE_META[c],
    removed: removedCats.has(c),
  }))

  const scopes = diff?.scope_to ?? []
  const execSummary = diff
    ? `If ${cs.source_label} is compromised, its instance role can ` +
      `${damageVerbs.map((v) => v.toLowerCase()).join(" / ")} on ${cs.target_label}` +
      `${report.blast_radius?.headline ? " and other crown-jewel buckets" : ""}. ` +
      `Observed behavior only needs read/write` +
      `${scopes.length ? ` on ${scopes.map((s) => `${s}/`).join(", ")}` : ""}. ` +
      `Cyntro recommends removing ${diff.remove_actions.length} unused destructive/admin ` +
      `action${diff.remove_actions.length === 1 ? "" : "s"} and preserving the ${diff.keep_actions.length} required.`
    : null

  // Compressed 3-step walkthrough (foothold → identity → jewel) for the
  // collapsed default; the full ordered steps live inside the expander.
  const compressed = report.attacker_steps
    .filter((s) => ["LAND_ON_FOOTHOLD", "BECOME_IDENTITY", "HIT_CROWN_JEWEL"].includes(s.phase))
    .map((s) => ({ title: s.title, lead: s.body.split(". ")[0] + "." }))

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-950/50 overflow-hidden">
      {/* Headline */}
      <div className="px-4 py-3 border-b border-slate-800/70 bg-slate-900/40">
        <div className="flex items-center gap-2 flex-wrap">
          <Crosshair className="h-4 w-4 text-red-300 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-100">
            The attacker&apos;s-eye view · current state
          </span>
          {/* Exposure (R×I×X, 0–1) — deliberately labeled so it can't be
              confused with the IAP 6-factor /100 score in the page header. */}
          <span
            className={`ml-auto inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${sevCls(cs.severity)}`}
            title="Exposure = Reachability × Impact × Ease — the compiler's per-path model (not the IAP score)"
          >
            {cs.exposure_score != null ? (
              <>
                Exposure {cs.exposure_score.toFixed(2)}
                <span className="ml-1 opacity-80">· {cs.severity ?? "—"}</span>
              </>
            ) : (
              (cs.severity ?? "—")
            )}
          </span>
        </div>

        {/* Orient strip — scannable one-liner before the prose. */}
        <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap mt-2 text-[10px] uppercase tracking-wider">
          <span className={cs.status === "OPEN_TODAY" ? "text-red-300 font-bold" : "text-emerald-300 font-bold"}>
            {statusLine}
          </span>
          {damageVerbs.length > 0 && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">
                damage: <span className="text-amber-300 font-semibold">{damageVerbs.join(" / ").toLowerCase()}</span>
              </span>
            </>
          )}
          {diff && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">fix: {diff.delivered_as.replace(/_/g, " ").toLowerCase()}</span>
            </>
          )}
          {report.blast_radius?.band && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">blast: <span className="text-red-300 font-semibold">{report.blast_radius.band.toLowerCase()}</span></span>
            </>
          )}
          {fixGate && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-amber-300 font-semibold">{fixGate.replace(/_/g, " ").toLowerCase()}</span>
            </>
          )}
        </div>

        {/* Path one-liner */}
        <p className="text-[12px] text-slate-300 leading-snug mt-1.5">
          <span className="font-mono text-slate-100">{cs.source_label}</span>
          {" → "}
          <span className="font-mono text-amber-300">{cs.target_label}</span>
        </p>

        {/* Executive one-sentence summary — the whole page in one line. */}
        {execSummary && (
          <p className="text-[12px] text-slate-300 leading-relaxed mt-2">{execSummary}</p>
        )}

        {/* Dense business sentence — kept for depth, collapsed by default. */}
        {cs.summary && (
          <details className="mt-1.5 group">
            <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-300 select-none list-none">
              <span className="group-open:hidden">▸ full evidence sentence</span>
              <span className="hidden group-open:inline">▾ full evidence sentence</span>
            </summary>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{cs.summary}</p>
          </details>
        )}
      </div>

      {/* DAMAGE-FIRST CARD — the visual center. "What can happen" today vs
          the projected after-fix state, per damage class. Derived from the
          matrix + micro-enforcement reduces. Labeled "Projected" pre-apply. */}
      {damageRows.length > 0 && (
        <div className="px-4 py-4 border-b border-slate-800/70 bg-slate-900/20">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300 mb-2.5">
            What can happen
          </div>
          <div className="grid grid-cols-[1fr_84px_104px] gap-x-3 items-center">
            {/* header row */}
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 pb-1.5">Damage type</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-red-300/90 text-center pb-1.5">Today</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-emerald-300/90 text-center pb-1.5">Projected after fix</div>
            {damageRows.map((r, i) => (
              <Fragment key={r.cat}>
                <div className={`text-[12px] text-slate-200 py-2 ${i > 0 ? "border-t border-slate-800/60" : ""}`}>
                  <span className="font-semibold">{r.label}</span>
                  <span className="text-slate-500"> — {r.impact}</span>
                </div>
                <div className={`text-center py-2 ${i > 0 ? "border-t border-slate-800/60" : ""}`}>
                  <span className="inline-flex items-center justify-center rounded border border-red-500/40 bg-red-500/10 text-red-300 text-[10px] font-bold w-[72px] py-1">
                    Allowed
                  </span>
                </div>
                <div className={`text-center py-2 ${i > 0 ? "border-t border-slate-800/60" : ""}`}>
                  {r.removed ? (
                    <span className="inline-flex items-center justify-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 text-[10px] font-bold w-[96px] py-1">
                      <X className="h-3 w-3" /> Removed
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-1 rounded border border-slate-600 bg-slate-800/40 text-slate-300 text-[10px] font-bold w-[96px] py-1">
                      <Check className="h-3 w-3" /> Kept, scoped
                    </span>
                  )}
                </div>
              </Fragment>
            ))}
          </div>
          {scopes.length > 0 && (
            <p className="text-[11px] text-slate-400 mt-3">
              Required access remains, scoped to{" "}
              <span className="font-mono text-emerald-300">{scopes.map((s) => `${s}/*`).join(", ")}</span>.
            </p>
          )}
        </div>
      )}

      {/* Recommended first fix — structured Remove / Keep / Scope / Safety,
          bound to the diff object, with a one-click route to the exact diff. */}
      {diff && (
        <div className="px-4 py-4 border-t border-slate-800/70 bg-emerald-950/15">
          <div className="flex items-center gap-2 mb-2.5">
            <Wrench className="h-3.5 w-3.5 text-emerald-300" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Recommended first fix: {diff.delivered_as.replace(/_/g, " ").toLowerCase()}
            </span>
            {diff.diff_hash && (
              <span className="ml-auto font-mono text-[9px] text-slate-500" title="The human approves this hash, not the story">
                diff {diff.diff_hash.slice(0, 12)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-[12px]">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 pt-0.5">Remove</div>
            <div className="text-red-300">
              {diff.remove_actions.length} unused destructive/admin action{diff.remove_actions.length === 1 ? "" : "s"}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 pt-0.5">Keep</div>
            <div className="text-emerald-300">
              {diff.keep_actions.length} required action{diff.keep_actions.length === 1 ? "" : "s"}
              {diff.keep_bucket_level?.length && diff.keep_object_level?.length ? (
                <span className="text-slate-400"> ({diff.keep_bucket_level.length} bucket-level · {diff.keep_object_level.length} object)</span>
              ) : null}
            </div>
            {scopes.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 pt-0.5">Scope</div>
                <div className="font-mono text-emerald-300 text-[11px]">
                  {scopes.map((s) => `${s}/*`).join("  ·  ")}
                </div>
              </>
            )}
            {report.safety_decision && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 pt-0.5">Safety</div>
                <div>
                  <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${GATE_CHIP[report.safety_decision.gate] ?? GATE_CHIP.REVIEW_REQUIRED}`}>
                    {report.safety_decision.gate.replace(/_/g, " ")}
                  </span>
                  {report.safety_decision.reasons.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                      Why review: {report.safety_decision.reasons.join("; ")}. The diff must be
                      approved against aggregate behavior — not auto-applied.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
          <a
            href="#what-youre-approving"
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20 transition-colors"
          >
            Review exact diff →
          </a>
        </div>
      )}

      {/* Micro-enforcement — least-privilege on every plane (Cyntro term).
          The mitigation, decomposed: micro-permissions / micro-segmentation
          / micro-access, each graded to what the data actually proves. */}
      {report.micro_enforcement && report.micro_enforcement.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-800/70 bg-slate-900/40">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-300" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">
              Micro-enforcement · least-privilege on every plane
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {report.micro_enforcement.map((m) => {
              const meta = MICRO_META[m.plane] ?? MICRO_META.micro_permissions
              const g = GRADE_META[m.evidence_grade]
              return (
                <div
                  key={m.plane}
                  className="relative rounded-lg border border-slate-800 bg-slate-950/50 p-2.5 pl-3"
                >
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded"
                    style={{ background: meta.accent }}
                    aria-hidden
                  />
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span style={{ color: meta.accent }}>{meta.icon}</span>
                    <span className="text-[11px] font-semibold text-slate-100">{m.title}</span>
                    <span className="text-[9px] uppercase tracking-wider text-slate-500">
                      {meta.layerLabel}
                    </span>
                    <span
                      className={`ml-auto inline-flex items-center rounded border px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider ${g.cls}`}
                    >
                      {m.evidence_grade}
                    </span>
                  </div>
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: meta.accent }}>
                    {meta.role}
                  </div>
                  <p className="text-[11px] leading-snug text-slate-300">{m.summary}</p>
                  {m.reduces && m.reduces.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                      <span className="text-slate-500">reduces:</span>{" "}
                      {m.reduces.map((r) => RISK_REDUCTION_LABEL[r] ?? r).join(", ")}
                    </p>
                  )}
                  {m.remove.length > 0 && (
                    <p className="text-[10px] text-red-300/90 mt-1 font-mono leading-snug">
                      − {m.remove.slice(0, 3).join(", ")}
                      {m.remove.length > 3 ? ` (+${m.remove.length - 3})` : ""}
                    </p>
                  )}
                  {m.keep.length > 0 && (
                    <p className="text-[10px] text-emerald-300/90 font-mono leading-snug">
                      ✓ keep {m.keep.slice(0, 2).join(", ")}
                      {m.keep.length > 2 ? ` (+${m.keep.length - 2})` : ""}
                    </p>
                  )}
                  {m.safety_gate && (
                    <span
                      className={`inline-flex items-center rounded border px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider mt-1.5 ${GATE_CHIP[m.safety_gate] ?? GATE_CHIP.REVIEW_REQUIRED}`}
                    >
                      {m.safety_gate.replace("_", " ")}
                    </span>
                  )}
                  {m.pending_signal && (
                    <p className="text-[9px] text-slate-500 italic mt-1 leading-snug">
                      pending: {m.pending_signal}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Attacker walkthrough — demoted below the decision. Compressed
          3-step chain by default; full evidence-graded 6 steps in the
          expander for analysts (reviewer: story supports, doesn't compete). */}
      {report.attacker_steps.length > 0 && (
        <details className="border-t border-slate-800/70 group">
          <summary className="px-4 py-3 cursor-pointer select-none list-none flex items-center gap-2 hover:bg-slate-900/40">
            <Crosshair className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Attacker walkthrough
            </span>
            <span className="text-[10px] text-slate-500 group-open:hidden ml-1">▸ expand full kill chain</span>
            <span className="text-[10px] text-slate-500 hidden group-open:inline ml-1">▾ collapse</span>
          </summary>

          {/* Compressed chain — always the first thing under the summary. */}
          <div className="px-4 pb-2 space-y-1.5 group-open:hidden">
            {compressed.map((s, i) => (
              <div key={i} className="text-[11px] text-slate-300 leading-snug">
                <span className="text-slate-500 font-mono mr-1.5">{i + 1}.</span>
                <span className="font-semibold text-slate-200">{s.title}</span>
                <span className="text-slate-400"> — {s.lead}</span>
              </div>
            ))}
          </div>

          {/* Full ordered kill chain with gate chips. */}
          <div className="px-4 pb-4 space-y-4 hidden group-open:block">
            {report.attacker_steps.map((step) => {
              const meta = PHASE_META[step.phase]
              const stepClaims = step.claim_ids
                .map((id) => byId.get(id))
                .filter((c): c is NonNullable<typeof c> => !!c)
              const g = GRADE_META[dominantGrade(stepClaims)]
              return (
                <div key={step.phase} className="relative pl-5">
                  <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded" style={{ background: g.accent }} aria-hidden />
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-slate-400">{meta.icon}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{meta.step}</span>
                    <span className="text-[12px] font-semibold text-slate-100">{step.title}</span>
                    <span className={`ml-auto inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${g.cls}`}>
                      {g.label}
                    </span>
                  </div>
                  <div className="text-[12px] leading-relaxed text-slate-300">{step.body}</div>
                </div>
              )
            })}
          </div>
        </details>
      )}

      {/* Missing evidence — collection gaps are actionable, not silent */}
      {report.missing_evidence.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-800/70 bg-slate-900/30">
          <div className="flex items-center gap-2 mb-1">
            <EyeOff className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Not shown — signal missing
            </span>
          </div>
          <ul className="space-y-0.5">
            {report.missing_evidence.map((m) => (
              <li key={m.signal} className="text-[11px] text-slate-500 leading-snug">
                <span className="text-slate-400">{m.signal}</span> — {m.why_it_matters}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Provenance footer */}
      <div className="px-4 py-2 border-t border-slate-800/70 text-[9px] text-slate-600 font-mono">
        compiler {report.compiler_version}
        {source === "bridge" && " · interim client bridge — backend report endpoint not yet live"}
        {report.evidence_pack_hash && ` · evidence ${report.evidence_pack_hash.slice(0, 12)}`}
      </div>
    </div>
  )
}

// Back-compat wrapper — same props as before; resolves the report (backend
// first, bridge fallback) and renders the pure view. Call sites unchanged.
export function AttackerNarrative({
  path,
  jewel,
  closure,
}: {
  path: IdentityAttackPath
  jewel?: CrownJewelSummary | null
  closure?: ClosurePreview | null
}) {
  const { report, source, loading, error, retry } = useAttackPathReport(path, jewel, closure)

  if (loading && !report) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-[11px] text-slate-500">
        Compiling attack-path report…
      </div>
    )
  }
  // Honest unavailable state — NEVER a contradicting fallback narrative.
  if (!report) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-slate-500 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Attack-path report temporarily unavailable
          </span>
          <button
            type="button"
            onClick={retry}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
          >
            <Wrench className="h-3 w-3" /> Retry
          </button>
        </div>
        <p className="text-[11px] text-slate-500 italic mt-2">
          The compiler didn&apos;t respond{error ? ` (${error})` : ""}. Showing no
          report rather than stale or contradicting data. The map and evidence below
          are unaffected.
        </p>
      </div>
    )
  }
  return <AttackerNarrativeView report={report} source={source} />
}
