"use client"

/**
 * Settings > Accounts, option C (S4): a registration's next step on the way to its first collection -- check access,
 * confirm, and the recovery its states need (a retry, a release), or removing a registration that was never activated --
 * and, once activated, where its first collection stands.
 * Every fact is the backend's row (lib/account-admin.ts registrationStep, firstInventoryOutcomeText, firstInventoryText);
 * this file only says it and offers the ONE request the connector would admit next. The connector decides every request
 * again on its own.
 */
import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, Trash2, Unlock, X } from "lucide-react"
import {
  ACTIVATION_CONSENT,
  accessRefusalText,
  activationStepText,
  currentFirstInventory,
  firstInventoryOutcomeText,
  firstInventoryText,
  formatUtcInstantExact,
  lastConnectionCheckText,
  listedEvidenceText,
  memberReadRoleName,
  nameInAwsText,
  registrationStep,
  registrationStepBoundary,
  registrationStepLabel,
  type ManagedAccount,
  type RegistrationAction,
  type RegistrationStep,
} from "@/lib/account-admin"

/**
 * The step judged by the CURRENT wall clock on every render -- a row the producer changed since mount (a new check result
 * arriving through a poll or Refresh) is never judged by a stale clock (Codex S4 20fc F1) -- plus a wake-up at the step's
 * next boundary (a confirmable check expiring, or one observed slightly ahead of this browser's clock coming into range),
 * so an open page also changes on its own when nothing re-renders it.
 */
function useStep(account: ManagedAccount): [RegistrationStep | null, () => RegistrationStep | null] {
  const [, wake] = useState(0)
  const now = Date.now()
  const step = registrationStep(account, now)
  const boundary = registrationStepBoundary(step, now)
  useEffect(() => {
    if (boundary === null) return
    const timer = window.setTimeout(() => wake((n) => n + 1), Math.min(Math.max(0, boundary - Date.now()) + 1, 2 ** 31 - 1))
    return () => window.clearTimeout(timer)
  }, [boundary])
  // An action reads the wall clock again itself: a check that expired with no timer firing sends nothing.
  return [step, () => registrationStep(account, Date.now())]
}

const button =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"

function at(value?: string | null): string | null {
  return value ? formatUtcInstantExact(value) : null
}

/** What a held step's release leads back to (the exit the connector takes). */
function releaseLeadsTo(action: string): string {
  return action === "activate" ? "a failed activation that can be retried" : "a pending account whose access can be checked again"
}

export function RegistrationJourney({
  account,
  customerId,
  busy,
  onAction,
}: {
  account: ManagedAccount
  customerId: string
  /** A journey request is being sent, or the account already has an open request: no second one is offered. */
  busy: boolean
  /** `consent`: sent only by the informed confirmation (ACTIVATION_CONSENT). */
  onAction: (action: RegistrationAction, checkId?: string, consent?: typeof ACTIVATION_CONSENT) => Promise<void>
}) {
  const [step, recheck] = useStep(account)
  const [confirming, setConfirming] = useState(false)
  if (!step) return null
  const id = account.account_id
  const role = memberReadRoleName(customerId)
  const testid = `registration-step-${id}`
  // Stage1B G9: a listed account waits for its check and confirmation like any other; its evidence is said, never a check.
  const listed = listedEvidenceText(account.registration?.listed_evidence)

  if (step.kind === "HELD") {
    const label = registrationStepLabel(step.owner.action)
    return (
      <div data-testid={testid} data-step={step.kind} className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
        <p className="flex items-start gap-1.5 font-semibold"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />The {label} could not record its result or move the account on.</p>
        <p>
          {step.owner.held_outcome ? `${step.owner.held_outcome}. ` : null}Cyntro keeps that request as the proof of where the account
          stands{at(step.owner.held_at) ? ` (since ${at(step.owner.held_at)})` : ""}, so the {label} cannot be asked for again yet. Releasing
          makes no AWS call: the account goes back to {releaseLeadsTo(step.owner.action)}, with reads off.
        </p>
        <button className={`${button} border-amber-300 bg-white text-amber-900 hover:bg-amber-100`} disabled={busy}
          onClick={() => void onAction("release")} aria-label={`Release account ${id}`}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Unlock className="h-3 w-3" aria-hidden />} Release account
        </button>
      </div>
    )
  }

  if (step.kind === "RECORDING_LISTED" || step.kind === "CHECKING" || step.kind === "ACTIVATING") {
    const text = step.kind === "RECORDING_LISTED"
      ? "Recording this account from your organization's list. Nothing is read in it; you check access and confirm next."
      : step.kind === "CHECKING" ? `Checking access: Cyntro is assuming ${role} in the account and asking AWS which account answered.`
      : "Activating: Cyntro is proving the account again and reading its sources; its first inventory is queued once this is recorded."
    return (
      <p data-testid={testid} data-step={step.kind} className="inline-flex items-start gap-1.5 text-[11px] text-slate-600">
        <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" aria-hidden />{text}
      </p>
    )
  }

  if (step.kind === "CHECK_ACCESS" || step.kind === "CHECK_EXPIRED") {
    return (
      <div data-testid={testid} data-step={step.kind} className="space-y-1.5 text-[11px] text-slate-700">
        {step.kind === "CHECK_ACCESS" ? (
          <p>
            {listed ? <span data-testid={`listed-evidence-${id}`}>{listed} </span> : "Not verified: "}Cyntro has read nothing
            in this account{listed ? " yet" : ""}. Deploy the connection stack in it (Connect), then check access: Cyntro assumes
            {" "}{role} there and asks AWS which account answered, and its name. AWS may log these calls in that account; nothing
            else is read. Collection starts only when you confirm.
          </p>
        ) : Date.parse(step.check?.identity_observed_at ?? "") > Date.now() ? (
          // The server's clock leads this browser's: the page wakes when it reaches the check (registrationStepBoundary).
          <p>
            The last access check was recorded at {at(step.check?.identity_observed_at)}, ahead of this browser&apos;s clock; it
            can be confirmed once the clock reaches it.
          </p>
        ) : (
          <p>
            The last access check can no longer be confirmed: a confirmation needs a check less than 15 minutes old
            {at(step.check?.identity_observed_at) ? ` (this one was ${at(step.check?.identity_observed_at)})` : ""}. Check access again.
          </p>
        )}
        {step.kind === "CHECK_ACCESS" && step.refused ? (
          <p data-testid={`access-refused-${id}`} className="text-red-700">
            Last check{at(step.refused.completed_at) ? ` (${at(step.refused.completed_at)})` : ""}: {accessRefusalText(step.refused.refusal, customerId, id)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button className={`${button} border-teal-200 bg-white text-teal-700 hover:bg-teal-50`} disabled={busy}
            onClick={() => void onAction("access_check")} aria-label={`Check access to ${id}`}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <ShieldCheck className="h-3 w-3" aria-hidden />}
            {step.kind === "CHECK_EXPIRED" || step.refused ? "Check access again" : "Check access"}
          </button>
          <RemoveAccount account={account} busy={busy} onRemove={() => onAction("withdraw")} />
        </div>
      </div>
    )
  }

  if (step.kind === "CONFIRM") {
    return (
      <div data-testid={testid} data-step={step.kind} className="space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[11px] text-emerald-950">
        <p className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Cyntro reached account {step.check.answered_account || id} through {role}, which trusts this installation
          {at(step.check.identity_observed_at) ? ` (${at(step.check.identity_observed_at)})` : ""}.
        </p>
        <p>{nameInAwsText(step.check)}</p>
        <p className="inline-flex items-center gap-1 text-emerald-900"><Clock className="h-3 w-3" aria-hidden />Confirm before {formatUtcInstantExact(new Date(step.confirmableUntil).toISOString())}, or check again.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className={`${button} border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100`} disabled={busy}
            onClick={() => setConfirming(true)} aria-label={`Confirm account ${id}`}>
            <ShieldCheck className="h-3 w-3" aria-hidden /> Confirm account…
          </button>
          <RemoveAccount account={account} busy={busy} onRemove={() => onAction("withdraw")} />
        </div>
        {confirming ? (
          <ConfirmActivationDialog account={account} role={role} recheck={recheck} onClose={() => setConfirming(false)}
            onConfirm={async (checkId) => { await onAction("activate", checkId, ACTIVATION_CONSENT); setConfirming(false) }} />
        ) : null}
      </div>
    )
  }

  // ACTIVATION_FAILED: reads are off; a retry continues the SAME confirmed check (identity is proven again by the activation).
  return (
    <div data-testid={testid} data-step={step.kind} className="space-y-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-900">
      <p className="font-semibold">Activation failed: {activationStepText(step.step)}</p>
      <p>Nothing is collected and reads are off. Fix the cause (Connect shows the stack), then retry the activation you confirmed.</p>
      {step.checkId ? (
        <button className={`${button} border-red-300 bg-white text-red-800 hover:bg-red-100`} disabled={busy}
          onClick={() => void onAction("activate", step.checkId as string)} aria-label={`Retry activation of ${id}`}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <ShieldCheck className="h-3 w-3" aria-hidden />} Retry activation
        </button>
      ) : (
        <p>The confirmed access check is not on record, so a retry cannot be asked for here.</p>
      )}
    </div>
  )
}

/**
 * The operator's explicit, INFORMED confirmation of the check they are looking at: the account ID, the name AWS holds (or why
 * it was not read) and everything confirming starts -- collecting, checking and, if the checks pass, showing the account's
 * data (automatic onboarding, Alon 2026-10-10) -- sent with ACTIVATION_CONSENT. No duration is promised beyond "usually
 * within minutes": the backend has measured none. The check is read again from the wall clock at the click; a check that is
 * no longer confirmable sends nothing.
 */
function ConfirmActivationDialog({
  account,
  role,
  recheck,
  onClose,
  onConfirm,
}: {
  account: ManagedAccount
  role: string
  recheck: () => RegistrationStep | null
  onClose: () => void
  onConfirm: (checkId: string) => Promise<void>
}) {
  const [stale, setStale] = useState(false)
  const [sending, setSending] = useState(false)
  const step = recheck()
  const check = step?.kind === "CONFIRM" ? step.check : account.registration?.access_check ?? null

  async function confirm() {
    const current = recheck()
    if (current?.kind !== "CONFIRM") {
      setStale(true)
      return
    }
    setSending(true)
    try {
      await onConfirm(current.checkId)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-6 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby={`confirm-account-${account.account_id}`} className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white text-sm text-slate-700 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Confirm account</p>
            <h2 id={`confirm-account-${account.account_id}`} className="mt-1 text-xl font-semibold text-slate-900">Start collecting from {account.account_id}?</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-6">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="font-semibold text-slate-500">AWS account ID</dt><dd className="font-mono">{account.account_id}</dd>
            <dt className="font-semibold text-slate-500">Checked</dt><dd>{check?.identity_observed_at ? formatUtcInstantExact(check.identity_observed_at) : "time not recorded"}</dd>
          </dl>
          <p data-testid="confirm-name">{nameInAwsText(check)}</p>
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            The check proves this installation can use {role} in that account. It does not prove who owns the account, and a
            name is a label the account&apos;s administrators set. Confirm only an account ID you recognise.
          </p>
          <ul data-testid="confirm-informed" className="list-disc space-y-1.5 pl-5">
            <li>Cyntro turns reading on, collects this account&apos;s inventory, checks it, and, if the checks pass, shows its data: inventory, census and systems. If a check does not pass, nothing is shown and this page names why.</li>
            <li>Read only: nothing in the AWS account changes.</li>
            <li>The decision is recorded under your name.</li>
            <li>Its data usually appears within minutes after collection finishes. This page shows each step on the way.</li>
          </ul>
          {stale ? (
            <p role="alert" data-testid="confirm-stale" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              This check can no longer be confirmed. Check access again. Nothing was sent.
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button onClick={onClose} disabled={sending} className="text-sm font-semibold text-slate-500">Cancel</button>
          <button onClick={() => void confirm()} disabled={sending || stale}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />} Confirm and start collecting
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Remove (withdraw) a registration that was never activated, after saying exactly what removing does and does not do. Offered
 * only in the steps of the connector's registration_states.WITHDRAWABLE -- CHECK_ACCESS (pending), CONFIRM and CHECK_EXPIRED
 * (checked, not confirmed) -- never while a step is in flight, held, failed or activated. The request names the registration
 * and version shown; the connector decides again and refuses it by name if the account moved on meanwhile.
 */
function RemoveAccount({ account, busy, onRemove }: { account: ManagedAccount; busy: boolean; onRemove: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const id = account.account_id

  async function remove() {
    setSending(true)
    try {
      await onRemove()
      setOpen(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button className={`${button} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`} disabled={busy}
        onClick={() => setOpen(true)} aria-label={`Remove account ${id}`}>
        <Trash2 className="h-3 w-3" aria-hidden /> Remove account…
      </button>
      {open ? (
        <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-6 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby={`remove-account-${id}`} className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white text-sm text-slate-700 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Remove account</p>
                <h2 id={`remove-account-${id}`} className="mt-1 text-xl font-semibold text-slate-900">Remove {id} from Cyntro?</h2>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 p-6">
              <p>This account was never confirmed: reading is off and nothing has been collected from it.</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Removing makes no AWS call and changes nothing in the account. A connection stack deployed there stays until it is deleted in that account.</li>
                <li>The account leaves this list. Cyntro keeps the registration as a record of who removed it and when.</li>
                <li>You can add the account again later; it starts as a new registration.</li>
              </ul>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button onClick={() => setOpen(false)} disabled={sending} className="text-sm font-semibold text-slate-500">Cancel</button>
              <button onClick={() => void remove()} disabled={sending}
                className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Remove account
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

/**
 * Once activated: where the first inventory stands -- from the exact runs of THIS registration's work (Stage1B K2) when the
 * backend reports it, else the dispatch alone ("queued", never collected) -- and when the connection was last checked,
 * dated, never "live".
 */
export function FirstCollectionStatus({ account }: { account: ManagedAccount }) {
  const activated = Boolean(account.registration?.activation)
  const connectedLifecycle = ["AWAITING_CONNECTION", "CONNECTION_FAILED", "CONNECTED"].includes(account.onboarding_status)
  // Progress is the CURRENT registration's only: a first inventory naming an earlier registration is never counted here.
  const { outcome, other } = currentFirstInventory(account)
  const fromRuns = activated && connectedLifecycle
    ? (other ? { tone: "pending" as const, text: "First inventory: waiting for this registration's data." } : firstInventoryOutcomeText(outcome))
    : null
  const first = fromRuns ?? (activated && connectedLifecycle && !outcome && !other ? firstInventoryText(account.registration?.first_inventory_dispatch) : null)
  const checked = lastConnectionCheckText(account)
  if (!first && !checked) return null
  const tone = first?.tone === "blocked" ? "text-red-700" : first?.tone === "pending" ? "text-amber-800" : "text-slate-600"
  return (
    <div className="space-y-1">
      {first ? (
        <p data-testid={`first-collection-${account.account_id}`} data-source={fromRuns ? "runs" : "dispatch"} className={`text-[11px] ${tone}`}>
          {first.text}
        </p>
      ) : null}
      {fromRuns ? (
        <p className="text-[11px] text-slate-500">Inventory only: CloudTrail and VPC flow logs are collected on their own schedule and are not part of this status.</p>
      ) : null}
      {checked ? <p data-testid={`last-check-${account.account_id}`} className="text-[11px] text-slate-500">{checked}</p> : null}
    </div>
  )
}
