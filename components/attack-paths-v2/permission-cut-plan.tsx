"use client"

/**
 * The reviewable cut for one identity's access to one crown jewel.
 *
 * TWO INSTRUMENTS, AND THE DIFFERENCE MATTERS TO THE READER.
 *
 *   NARROW      rewrites the grant's Resource list to what is provably used.
 *               Edits a shared policy document. Available only when the policy
 *               is one this account owns — on alon-prod that is 25 of 245
 *               wildcard statements, because AWS owns the other 220.
 *
 *   SCOPED DENY adds an inline Deny on the role. Modifies no existing grant,
 *               exists only on this role, and is undone by deleting it. This is
 *               what closes the path when AWS owns the document.
 *
 * NEVER NARROW WITHOUT SHOWING WHAT WAS KEPT. The statement reaching the unused
 * jewel is almost always the SAME statement serving the buckets this role uses
 * daily, so "removed" without "kept" invites an operator to approve an outage.
 * Both lists render, kept first.
 *
 * A REFUSAL IS AN ANSWER, NOT AN ERROR. `allowed: false` with a guard set is the
 * product working — nine guards evaluate on the narrow and six on the Deny, none
 * short-circuit, and the refusal set is precisely what tells an operator what
 * would have to change. It renders as findings, never as a failure state. Only
 * a transport failure gets error styling.
 *
 * UNVERIFIED BLOCKS LIKE REFUSE. "We could not prove it safe" is not a soft
 * warning, and must not be styled as one next to an otherwise-green plan.
 */

import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Loader2,
  Lock,
  RotateCcw,
  Scissors,
  XCircle,
} from "lucide-react"
import {
  blockingGuards,
  type CarrierPolicy,
  type CutGuard,
  type PermissionCutPlan as Plan,
  type ScopedDenyPlan,
} from "./use-permission-cut-plan"

function shortArn(arn: string): string {
  return arn.replace(/^arn:aws:s3:::/, "").replace(/^arn:aws:iam::\d+:/, "")
}

function GuardRow({ guard }: { guard: CutGuard }) {
  const blocking = guard.verdict !== "PASS"
  const Icon =
    guard.verdict === "PASS"
      ? CheckCircle2
      : guard.verdict === "REFUSE"
        ? XCircle
        : AlertTriangle
  return (
    <li className="flex gap-1.5 py-0.5 text-[11px]">
      <Icon
        className={`mt-px h-3 w-3 shrink-0 ${
          guard.verdict === "PASS"
            ? "text-emerald-600 dark:text-emerald-400"
            : guard.verdict === "REFUSE"
              ? "text-red-600 dark:text-red-400"
              : "text-amber-600 dark:text-amber-400"
        }`}
      />
      <span className={blocking ? "text-foreground" : "text-muted-foreground"}>
        <span className="font-mono text-[10px] uppercase tracking-wide">
          {guard.guard.replace(/_/g, " ")}
        </span>
        {blocking ? <> — {guard.reason}</> : null}
      </span>
    </li>
  )
}

function ResourceList({
  label,
  items,
  tone,
}: {
  label: string
  items: string[]
  tone: string
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className={`text-[10px] font-medium uppercase tracking-wide ${tone}`}>
        {label} · {items.length}
      </p>
      {items.length === 0 ? (
        <p className="mt-0.5 text-[11px] italic text-muted-foreground">none</p>
      ) : (
        <ul className="mt-0.5 space-y-px">
          {items.slice(0, 6).map((r) => (
            <li key={r} className="truncate font-mono text-[10px]" title={r}>
              {shortArn(r)}
            </li>
          ))}
          {items.length > 6 ? (
            <li className="text-[10px] text-muted-foreground">
              +{items.length - 6} more
            </li>
          ) : null}
        </ul>
      )}
    </div>
  )
}

function CarrierPolicies({ policies }: { policies: CarrierPolicy[] }) {
  if (policies.length === 0) return null
  return (
    <div className="mt-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Document a cut would edit
      </p>
      <ul className="mt-0.5 space-y-px">
        {policies.map((p) => (
          <li key={p.policy_arn ?? p.policy_name} className="text-[10px]">
            <span className="font-mono">{p.policy_name ?? p.policy_arn}</span>{" "}
            {p.editable ? (
              <span className="text-muted-foreground">
                · {p.is_inline ? "inline" : p.policy_kind ?? "customer managed"} · editable
              </span>
            ) : (
              <span
                className="text-red-600 dark:text-red-400"
                title="AWS owns this document — there is no CreatePolicyVersion for it, so its Resource list cannot be narrowed in place."
              >
                · {p.policy_kind ?? "AWS managed"} · AWS owns this
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ScopedDenySection({ deny }: { deny: ScopedDenyPlan }) {
  const blocked = blockingGuards(deny.guards)
  return (
    <section className="mt-3 rounded border border-sky-300/70 bg-sky-50/50 p-2 dark:border-sky-500/40 dark:bg-sky-500/10">
      <header className="flex items-center gap-1.5">
        <Ban className="h-3.5 w-3.5 text-sky-700 dark:text-sky-300" />
        <h4 className="text-[11px] font-semibold">Scoped Deny — closes it without editing the grant</h4>
        {deny.allowed ? (
          <span className="ml-auto rounded bg-emerald-600/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            plan ready
          </span>
        ) : (
          <span className="ml-auto rounded bg-amber-600/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
            {blocked.length} blocking
          </span>
        )}
      </header>

      <p className="mt-1 text-[11px] text-muted-foreground">
        An explicit Deny on this role outranks every Allow that reaches the
        resource — including the policy AWS owns. It is additive, exists only on
        this role, and is undone by deleting it.
      </p>

      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
        <dt className="text-muted-foreground">Denies</dt>
        <dd className="font-mono">{deny.denied_actions}</dd>
        <dt className="text-muted-foreground">On</dt>
        <dd className="font-mono">
          {deny.denied_resources.map((r) => shortArn(r)).join(", ")}
        </dd>
        <dt className="text-muted-foreground">Grants modified</dt>
        <dd>
          {deny.grants_modified.length === 0 ? (
            <span className="text-emerald-700 dark:text-emerald-400">none</span>
          ) : (
            deny.grants_modified.join(", ")
          )}
        </dd>
        <dt className="flex items-center gap-1 text-muted-foreground">
          <RotateCcw className="h-2.5 w-2.5" /> Undo
        </dt>
        <dd className="font-mono">{deny.reversal}</dd>
      </dl>

      {deny.inline_state && !deny.inline_state.known ? (
        <p className="mt-1.5 rounded bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-800 dark:text-amber-300">
          The role&apos;s existing inline policies have not been collected, so the
          foreign-Deny and size checks cannot be answered. That is unknown, not
          empty — the plan blocks rather than assuming there is room.
        </p>
      ) : null}

      <ul className="mt-1.5 border-t border-sky-300/40 pt-1 dark:border-sky-500/20">
        {deny.guards.map((g) => (
          <GuardRow key={g.guard} guard={g} />
        ))}
      </ul>
    </section>
  )
}

export function PermissionCutPlanPanel({
  plan,
  loading,
  error,
  roleLabel,
  jewelLabel,
}: {
  plan: Plan | null
  loading: boolean
  error: string | null
  roleLabel: string
  jewelLabel: string
}) {
  if (loading) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Re-deriving the cut for {roleLabel} → {jewelLabel}…
      </p>
    )
  }

  // Transport failure only. A refused plan is NOT routed here.
  if (error) {
    return (
      <p
        className="mt-2 flex items-start gap-1.5 rounded border border-red-300/70 bg-red-50/60 px-2 py-1.5 text-[11px] text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
        data-testid="cut-plan-error"
      >
        <XCircle className="mt-px h-3 w-3 shrink-0" />
        Could not compute a plan — {error}. Nothing was changed.
      </p>
    )
  }

  if (!plan) return null

  // Band re-derived at request time; a stale CUTTABLE never becomes a plan.
  if (plan.band && plan.band !== "CUTTABLE") {
    return (
      <p className="mt-2 rounded border border-border bg-muted/40 px-2 py-1.5 text-[11px]">
        {roleLabel} is banded <span className="font-medium">{plan.band}</span> for
        this jewel as of now, so there is nothing to cut.{" "}
        {plan.refused_because ?? ""}
      </p>
    )
  }

  const narrowBlocked = blockingGuards(plan.guards)
  const deny = plan.scoped_deny

  return (
    <div className="mt-2 space-y-2" data-testid="permission-cut-plan">
      {/* NARROW */}
      <section className="rounded border border-border bg-card/60 p-2">
        <header className="flex items-center gap-1.5">
          <Scissors className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
          <h4 className="text-[11px] font-semibold">
            Narrow the grant to what it uses
          </h4>
          {plan.allowed ? (
            <span className="ml-auto rounded bg-emerald-600/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              plan ready
            </span>
          ) : (
            <span className="ml-auto rounded bg-amber-600/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
              {narrowBlocked.length} blocking
            </span>
          )}
        </header>

        <div className="mt-1.5 flex items-start gap-2">
          <ResourceList
            label="Kept — still reachable"
            items={plan.kept_resources}
            tone="text-emerald-700 dark:text-emerald-400"
          />
          <ArrowRight className="mt-3 h-3 w-3 shrink-0 text-muted-foreground" />
          <ResourceList
            label="Removed"
            items={plan.removed_resources}
            tone="text-amber-700 dark:text-amber-400"
          />
        </div>

        <CarrierPolicies policies={plan.carrier_policies} />

        <ul className="mt-2 border-t border-border pt-1">
          {plan.guards.map((g) => (
            <GuardRow key={g.guard} guard={g} />
          ))}
        </ul>
      </section>

      {deny ? <ScopedDenySection deny={deny} /> : null}

      {/* Neither instrument is available. Say so plainly rather than leaving
          the operator to infer it from two collapsed sections. */}
      {plan.recommended_instrument === "NONE" ? (
        <p
          className="rounded border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground"
          data-testid="cut-plan-no-instrument"
        >
          No safe cut is available for this pair right now. The guards above say
          what would have to change — this is a considered refusal, not a
          failure.
        </p>
      ) : null}

      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Lock className="h-2.5 w-2.5" />
        Plan only — nothing here can be applied to AWS yet.
      </p>
    </div>
  )
}
