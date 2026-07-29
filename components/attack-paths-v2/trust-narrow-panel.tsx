"use client"

// =============================================================================
// Narrow trust — the cut that hangs off the acquisition chip.
//
// The chip already says the right thing ("Assumable by anyone in the account ·
// no conditions"). Until now that was where the product stopped: detection
// without a safe cut path is CSPM behaviour. This panel is the execution half.
//
// Design law carried from the backend spec, and none of it is decorative:
//
//   * KEPT is rendered next to REMOVED, always (repo rule #4). The motivating
//     incident is exactly this: `alon-demo-ec2-role` was reported as trusted by
//     `:root` alone, and acting on that phrasing would have stripped
//     `Service:ec2.amazonaws.com` and taken down two production EC2 workloads.
//     The kept column is not reassurance copy — it is the thing that was almost
//     deleted.
//
//   * A REFUSAL IS THE PRODUCT. `allowed: false` with a populated guard set is
//     the useful answer, not a failure state, and it gets the same visual
//     weight as a green plan. "The guard refusing is as compelling as the fix
//     succeeding."
//
//   * `unverified` renders as blocking, never as a soft warning. The backend
//     treats "we could not prove it safe" as "no"; a UI that downgrades it to
//     amber re-introduces the fail-open the guards exist to prevent.
//
//   * ENTRY STAYS UNKNOWN. Acquisition answers who can take this principal once
//     already inside the account. Narrowing trust does not answer how they got
//     into the account, and the panel says so every time — otherwise the cut
//     reads as closing the entry question, which is the exact conflation the
//     acquisition/initial-access split exists to prevent.
//
// REAL DATA ONLY. Every value comes from the live plan endpoint, which authors
// against a live iam:GetRole. Absent → honest absent state, never a placeholder.
// =============================================================================

import { useEffect } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import { shortPrincipal } from "@/lib/attack-paths/acquisition-chrome"
import { useTrustNarrow } from "./use-trust-narrow"
import { guardLabel, type GuardVerdict, type TrustGuard } from "./trust-narrow-types"

interface TrustNarrowPanelProps {
  path: IdentityAttackPath
  onClose: () => void
}

const VERDICT_TONE: Record<GuardVerdict, string> = {
  pass: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  // Unverified is styled as a refusal on purpose — see the header note.
  refuse: "border-red-500/35 bg-red-500/5 text-red-700 dark:text-red-300",
  unverified: "border-red-500/35 bg-red-500/5 text-red-700 dark:text-red-300",
}

function GuardRow({ guard }: { guard: TrustGuard }) {
  const blocking = guard.verdict !== "pass"
  return (
    <div
      data-trust-guard={guard.guard}
      data-trust-guard-verdict={guard.verdict}
      className={`rounded-md border px-2 py-1.5 ${VERDICT_TONE[guard.verdict]}`}
    >
      <div className="flex items-center gap-1.5">
        {blocking ? (
          <ShieldAlert className="h-3 w-3 shrink-0" />
        ) : (
          <ShieldCheck className="h-3 w-3 shrink-0" />
        )}
        <span className="text-[10px] font-bold uppercase tracking-wider">
          {guardLabel(guard.guard)}
        </span>
        <span className="ml-auto text-[9px] font-bold uppercase tracking-wider opacity-80">
          {guard.verdict === "unverified" ? "unverified · blocks" : guard.verdict}
        </span>
      </div>
      {blocking && (
        <div className="mt-1 text-[10px] leading-snug opacity-90">{guard.reason}</div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="w-[68px] shrink-0 text-[9px] font-bold uppercase tracking-wider text-muted-foreground pt-0.5">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-foreground">{children}</div>
    </div>
  )
}

export function TrustNarrowPanel({ path, onClose }: TrustNarrowPanelProps) {
  const { plan, applyResult, refusal, loading, applying, error, load, apply } =
    useTrustNarrow(path)

  // The plan hits live AWS, so it runs when the panel opens — never per row.
  useEffect(() => {
    load()
  }, [load])

  const blocking = plan?.guards.filter((g) => g.verdict !== "pass") ?? []

  return (
    <div
      data-trust-narrow-panel="true"
      className="mt-2 rounded-lg border-2 border-orange-500/30 bg-card overflow-hidden"
    >
      <div className="flex items-center gap-2 border-b border-border bg-orange-500/5 px-3 py-2">
        <Lock className="h-3.5 w-3.5 text-orange-700 dark:text-orange-300" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          Narrow trust
        </span>
        {plan?.role_name && (
          <span className="font-mono text-[10px] text-muted-foreground truncate">
            {plan.role_name}
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close narrow trust panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2.5 p-3">
        {loading && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Reading the live trust policy and running guards…
          </div>
        )}

        {/* Backend refusals are distinct outcomes and are worth distinguishing:
            403 = feature is in SHADOW, 400 = token problem, 409 = drift or a
            guard refusing at apply. Flattening them into "something went wrong"
            throws away the only thing the operator can act on. */}
        {!loading && refusal && (
          <div className="rounded-md border border-red-500/35 bg-red-500/5 px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
              <AlertTriangle className="h-3 w-3" />
              {typeof refusal.detail === "object" && refusal.detail?.error
                ? refusal.detail.error
                : refusal.error}
            </div>
            <div className="mt-1 text-[10px] leading-snug text-foreground">
              {(typeof refusal.detail === "string"
                ? refusal.detail
                : refusal.detail?.reason) ||
                "No further detail from the backend. Nothing has been changed."}
            </div>
            {typeof refusal.detail === "object" &&
              (refusal.detail?.guards?.length ?? 0) > 0 && (
                <div className="mt-2 space-y-1">
                  {refusal.detail!.guards!.map((g) => (
                    <GuardRow key={g.guard} guard={g} />
                  ))}
                </div>
              )}
          </div>
        )}

        {!loading && !plan && !refusal && error && (
          <div className="text-[11px] text-muted-foreground">
            Couldn&apos;t load the trust plan ({error}). Nothing has been changed.
          </div>
        )}

        {plan && (
          <>
            {/* REMOVE / KEEP side by side. Never one without the other. */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-red-500/25 bg-red-500/5 px-2.5 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                  Remove
                </div>
                <ul className="mt-1 space-y-0.5">
                  {plan.removed_principals.length === 0 ? (
                    <li className="text-[10px] text-muted-foreground">
                      nothing proposed
                    </li>
                  ) : (
                    plan.removed_principals.map((p) => (
                      <li
                        key={p}
                        title={p}
                        className="font-mono text-[10px] text-foreground truncate"
                      >
                        {p}
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Keep
                </div>
                <ul className="mt-1 space-y-0.5">
                  {plan.kept_principals.length === 0 ? (
                    <li className="text-[10px] text-muted-foreground">none</li>
                  ) : (
                    plan.kept_principals.map((p) => (
                      <li
                        key={p}
                        title={p}
                        className="font-mono text-[10px] text-foreground truncate"
                      >
                        {p}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <div className="space-y-1.5">
              <Row label="Evidence">
                {plan.evidence.observed_assume_principals.length === 0 ? (
                  <>
                    <span className="font-semibold">0 observed</span> sts:AssumeRole
                    into this role — removing the grant removes no access anyone
                    has been seen using.
                  </>
                ) : (
                  <>
                    {plan.evidence.observed_assume_principals.length} principal(s)
                    observed assuming this role:{" "}
                    <span className="font-mono">
                      {plan.evidence.observed_assume_principals
                        .map(shortPrincipal)
                        .join(", ")}
                    </span>
                  </>
                )}
              </Row>

              <Row label="Preserved">
                {plan.evidence.workloads_via_instance_profile.length === 0 ? (
                  <span className="text-muted-foreground">
                    no instance-profile consumers found — absence of evidence is
                    not proof there are none
                  </span>
                ) : (
                  <>
                    <span className="font-mono">
                      {plan.evidence.workloads_via_instance_profile.join(", ")}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      (instance profile → service principal, kept)
                    </span>
                  </>
                )}
              </Row>

              {plan.simulation && (
                <Row label="Effect">
                  {plan.simulation.clears_account_wide_chip ? (
                    <>
                      {plan.simulation.paths_losing_chip} path
                      {plan.simulation.paths_losing_chip === 1 ? "" : "s"} lose
                      &ldquo;assumable by anyone in the account&rdquo;.
                    </>
                  ) : plan.simulation.remaining_account_wide_grants.length > 0 ? (
                    <>
                      chip stays — still account-wide via{" "}
                      <span className="font-mono">
                        {plan.simulation.remaining_account_wide_grants.join(", ")}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      no change to the acquisition signal
                    </span>
                  )}
                </Row>
              )}

              {/* Not decorative. See the header note. */}
              <Row label="Entry">
                <span className="text-muted-foreground">
                  still <span className="font-semibold text-foreground">UNKNOWN</span>{" "}
                  — this does not explain how an attacker reaches the account.
                </span>
              </Row>

              {plan.evidence.withheld_for_observed_use.length > 0 && (
                <Row label="Withheld">
                  <span className="font-mono">
                    {plan.evidence.withheld_for_observed_use.join(", ")}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    — not proposed; something observably relies on it
                  </span>
                </Row>
              )}

              {plan.document_source !== "live" && (
                <Row label="Source">
                  <span className="text-red-700 dark:text-red-300">
                    could not read the live policy
                    {plan.live_fetch_error ? ` (${plan.live_fetch_error})` : ""} —
                    this plan is not applicable
                  </span>
                </Row>
              )}

              {/* The plan is sound but unsigned, so it cannot be applied. Saying
                  so beats a greyed-out Apply button with no explanation — the
                  operator would otherwise read a deployment gap as a refusal by
                  the guards, which is the opposite of what happened. */}
              {plan.plan_token_error && (
                <Row label="Signing">
                  <span className="text-amber-700 dark:text-amber-300">
                    this deploy cannot sign remediation plans, so the cut cannot
                    be applied from here. The analysis above is unaffected.
                  </span>
                </Row>
              )}
            </div>

            {/* Guards. Blocking ones first and always visible; when everything
                passes we say so in one line rather than seven green rows. */}
            {blocking.length > 0 ? (
              <div className="space-y-1">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  Blocked by {blocking.length} guard
                  {blocking.length === 1 ? "" : "s"}
                </div>
                {blocking.map((g) => (
                  <GuardRow key={g.guard} guard={g} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3 w-3" />
                All {plan.guards.length} guards pass.
              </div>
            )}

            {applyResult && (
              <div
                data-trust-narrow-applied={applyResult.applied ? "true" : "false"}
                className={`rounded-md border px-2.5 py-2 text-[10px] ${
                  applyResult.applied
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-red-500/35 bg-red-500/5"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                  {applyResult.applied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  {applyResult.applied
                    ? "Applied"
                    : `Not applied — ${applyResult.status}`}
                </div>
                {applyResult.errors.length > 0 && (
                  <div className="mt-1 text-foreground">
                    {applyResult.errors.join("; ")}
                  </div>
                )}
                {applyResult.snapshot_id && (
                  <div className="mt-1 font-mono text-muted-foreground">
                    snapshot {applyResult.snapshot_id} · rollback restores it
                    verbatim
                  </div>
                )}
                {/* The refresh is best-effort and its failure does NOT mean the
                    cut failed — saying so beats letting a stale chip imply it. */}
                {applyResult.refresh && (
                  <div className="mt-1 text-muted-foreground">
                    signal refresh:{" "}
                    {Object.entries(applyResult.refresh)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-0.5">
              <button
                onClick={apply}
                disabled={!plan.execute_available || applying || !plan.plan_token}
                data-trust-narrow-apply="true"
                title={
                  plan.execute_available
                    ? "Snapshot is taken before any mutation; rollback restores the document verbatim."
                    : plan.plan_token_error
                      ? `Cannot apply: ${plan.plan_token_error}`
                      : plan.allowed
                        ? `Apply is disabled in ${plan.decision_tier}. The cut is safe to plan but no one may execute it yet.`
                        : "Blocked by a guard — nothing to apply."
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-[10px] font-semibold text-orange-700 dark:text-orange-300 disabled:cursor-not-allowed disabled:opacity-45 hover:bg-orange-500/15"
              >
                {applying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ArrowRight className="h-3 w-3" />
                )}
                Apply · snapshot required
              </button>
              <button
                onClick={load}
                disabled={loading || applying}
                className="rounded-md border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent disabled:opacity-45"
              >
                Re-plan
              </button>
              {!plan.execute_available && plan.allowed && (
                <span className="text-[9px] text-muted-foreground">
                  {plan.decision_tier} — plan and simulate only
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
