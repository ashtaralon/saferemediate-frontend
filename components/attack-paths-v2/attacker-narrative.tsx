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
  { icon: React.ReactNode; accent: string; layerLabel: string }
> = {
  micro_permissions: { icon: <KeyRound className="h-3.5 w-3.5" />, accent: "#6BB6E8", layerLabel: "IAM" },
  micro_segmentation: { icon: <Network className="h-3.5 w-3.5" />, accent: "#A78BFA", layerLabel: "Network" },
  micro_access: { icon: <Database className="h-3.5 w-3.5" />, accent: "#34D399", layerLabel: "Data" },
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
  const statusLine =
    report.current_state.status === "OPEN_TODAY"
      ? "The path is open today."
      : report.current_state.status === "BLOCKED"
        ? "The chain is broken by a control."
        : report.current_state.status === "PARTIALLY_BLOCKED"
          ? "The path is partially blocked."
          : "The path state is unverified."

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
            className={`ml-auto inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${sevCls(report.current_state.severity)}`}
            title="Exposure = Reachability × Impact × Ease — the compiler's per-path model (not the IAP score)"
          >
            {report.current_state.exposure_score != null ? (
              <>
                Exposure {report.current_state.exposure_score.toFixed(2)}
                <span className="ml-1 opacity-80">· {report.current_state.severity ?? "—"}</span>
              </>
            ) : (
              (report.current_state.severity ?? "—")
            )}
          </span>
        </div>
        <p className="text-[12px] text-slate-300 leading-snug mt-2">
          {statusLine}{" "}
          <span className="font-mono text-slate-100">{report.current_state.source_label}</span>
          {" → "}
          <span className="font-mono text-amber-300">{report.current_state.target_label}</span>
          {report.current_state.summary && (
            <span className="block text-slate-400 mt-1">{report.current_state.summary}</span>
          )}
        </p>
      </div>

      {/* Kill-chain walk — compiler-authored steps, grade chip per step */}
      <div className="px-4 py-4 space-y-4">
        {report.attacker_steps.map((step) => {
          const meta = PHASE_META[step.phase]
          const stepClaims = step.claim_ids
            .map((id) => byId.get(id))
            .filter((c): c is NonNullable<typeof c> => !!c)
          const g = GRADE_META[dominantGrade(stepClaims)]
          return (
            <div key={step.phase} className="relative pl-5">
              <span
                className="absolute left-0 top-1 bottom-1 w-[2px] rounded"
                style={{ background: g.accent }}
                aria-hidden
              />
              <div className="flex items-center gap-2 mb-1">
                <span className="text-slate-400">{meta.icon}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  {meta.step}
                </span>
                <span className="text-[12px] font-semibold text-slate-100">{step.title}</span>
                <span
                  className={`ml-auto inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${g.cls}`}
                >
                  {g.label}
                </span>
              </div>
              <div className="text-[12px] leading-relaxed text-slate-300">{step.body}</div>
            </div>
          )
        })}
      </div>

      {/* Blast radius */}
      {report.blast_radius?.headline && (
        <div className="px-4 py-3 border-t border-slate-800/70 bg-red-950/15">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="h-3.5 w-3.5 text-red-300" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-300">
              Blast radius
            </span>
            {report.blast_radius.band && (
              <span className="ml-auto text-[10px] font-semibold text-slate-400">
                {report.blast_radius.brs != null ? `BRS ${report.blast_radius.brs} · ` : ""}
                {report.blast_radius.band}
              </span>
            )}
          </div>
          <p className="text-[12px] text-slate-300 leading-snug">{report.blast_radius.headline}</p>
        </div>
      )}

      {/* Highest-leverage fix — bound to the diff object, not prose */}
      {diff && (
        <div className="px-4 py-3 border-t border-slate-800/70 bg-emerald-950/15">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="h-3.5 w-3.5 text-emerald-300" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Single highest-leverage fix
            </span>
            {diff.diff_hash && (
              <span className="ml-auto font-mono text-[9px] text-slate-500" title="The human approves this hash, not the story">
                diff {diff.diff_hash.slice(0, 12)}
              </span>
            )}
          </div>
          {diff.keep_bucket_level?.length || diff.keep_object_level?.length ? (
            <div className="text-[12px] text-slate-200 leading-snug space-y-0.5">
              <p>Remove {diff.remove_actions.length} unused destructive/admin action{diff.remove_actions.length === 1 ? "" : "s"}.</p>
              {!!diff.keep_bucket_level?.length && (
                <p>
                  Keep {diff.keep_bucket_level.length} bucket-level metadata action
                  {diff.keep_bucket_level.length === 1 ? "" : "s"} on the bucket.
                </p>
              )}
              {!!diff.keep_object_level?.length && (
                <p>
                  Keep {diff.keep_object_level.length} object read/write action
                  {diff.keep_object_level.length === 1 ? "" : "s"} only on{" "}
                  <span className="font-mono text-emerald-300">
                    {(diff.scope_to ?? []).map((p) => `${p}/*`).join(", ") || "observed scopes"}
                  </span>
                  .
                </p>
              )}
              <p className="text-slate-400">Delivered as {diff.delivered_as}.</p>
            </div>
          ) : (
            <p className="text-[12px] text-slate-200 leading-snug">
              Remove {diff.remove_actions.length} unused action
              {diff.remove_actions.length === 1 ? "" : "s"}, keep{" "}
              {diff.keep_actions.slice(0, 2).join(" / ")}
              {diff.keep_actions.length > 2 ? ` (+${diff.keep_actions.length - 2})` : ""}
              {diff.scope_to && diff.scope_to.length > 0 && (
                <>
                  {" "}scoped to{" "}
                  <span className="font-mono text-emerald-300">{diff.scope_to.join(", ")}</span>
                </>
              )}
              {" "}— delivered as {diff.delivered_as}.
            </p>
          )}
          {report.safety_decision && (
            <p className="text-[11px] text-slate-500 italic mt-1">
              Safety gate: {report.safety_decision.gate}
              {report.safety_decision.reasons.length > 0 &&
                ` — ${report.safety_decision.reasons.join(" · ")}`}
              . Routed to the risk-engine before apply.
            </p>
          )}
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
                  <div className="flex items-center gap-1.5 mb-1">
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
