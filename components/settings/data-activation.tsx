"use client"

/**
 * Settings > Accounts (and the account's Overview): where a member account's DATA stands on its way to being shown.
 *
 * Automatic onboarding (Alon, 2026-10-10): the person's one informed confirmation ("Confirm and start collecting") covers
 * collecting, checking and showing the account's data, and Cyntro moves it through its stages on its own -- this file says
 * each stage in one line (lib/account-admin.ts dataActivationLine), with a hold's codes verbatim. Only a LEGACY account
 * (connected for collection only, before that consent existed) or one whose permit was REVOKED is offered a separate request
 * to show its data -- a fresh, explicit confirmation, never an automatic retry -- and only when the backend says it can be
 * asked for. Progress is the CURRENT registration's only. A stage that stays unchanged past DATA_ACTIVATION_STAGE_BOUND_MS
 * is said to be taking longer than expected (dataActivationRefresh), never spun on forever.
 */
import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock, Eye, Loader2, X, XCircle } from "lucide-react"
import {
  accountLabel,
  collectionNotStarted,
  dataActivationCodeText,
  dataActivationLegacy,
  dataActivationLine,
  dataActivationOtherRegistration,
  dataActivationRefresh,
  dataActivationRevoked,
  dataActivationUpgradeOffered,
  formatUtcInstantExact,
  type DataActivationRefresh,
  type ManagedAccount,
} from "@/lib/account-admin"

/** What the page's POST came back with: accepted (queued), refused as not requestable (its blockers), or failed (the page
 *  says why in its own error banner). */
export type DataActivationAnswer = { kind: "queued" } | { kind: "not_requestable"; blockedBy: string[] } | { kind: "failed" }

const button =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"

/** Each code verbatim, with a short line for the codes this page knows; an unknown code is shown as it is, never hidden. */
function CodeList({ codes, testid }: { codes: string[]; testid: string }) {
  return (
    <ul data-testid={testid} className="space-y-0.5">
      {codes.map((code, index) => {
        const text = dataActivationCodeText(code)
        return (
          <li key={`${code}-${index}`} data-code={code}>
            <code className="rounded bg-white/70 px-1 font-mono text-[10px]">{code}</code>
            {text ? <span> {text}</span> : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The refresh state judged by the CURRENT wall clock on every render, plus a wake-up when the stage's bound passes -- so an
 * open page says "taking longer than expected" on its own even when nothing re-renders it.
 */
function useRefreshState(account: ManagedAccount): DataActivationRefresh {
  const [, wake] = useState(0)
  const refresh = dataActivationRefresh(account.data_activation, Date.now(), account.registration)
  const until = refresh.state === "MOVING" ? refresh.until : null
  useEffect(() => {
    if (until === null) return
    const timer = window.setTimeout(() => wake((n) => n + 1), Math.min(Math.max(0, until - Date.now()) + 1, 2 ** 31 - 1))
    return () => window.clearTimeout(timer)
  }, [until])
  return refresh
}

const IN_FLIGHT = new Set(["COLLECTING", "STAGING", "CHECKING", "ACTIVATING", "PUBLISHING", "QUEUED", "RUNNING", "APPROVED"])

/** The one line for the account's data stage, its codes and, past the bound, that it is taking longer than expected. No
 *  action: the Overview shows this; Settings adds the legacy request beside it. Null when there is nothing to say. */
export function DataStageLine({ account }: { account: ManagedAccount }) {
  const refresh = useRefreshState(account)
  if (account.is_platform_account || !account.data_activation || collectionNotStarted(account)) return null
  const line = dataActivationLine(account)
  if (!line) return null
  const id = account.account_id
  const overdue = refresh.state === "OVERDUE" ? refresh : null
  const tone = line.kind === "ACTIVE" ? "font-semibold text-emerald-700"
    : line.kind === "HELD" || line.kind === "REFUSED" ? "text-red-800"
    : line.kind === "LEGACY" || line.kind === "REVOKED" ? "text-amber-900" : "text-slate-700"
  return (
    <div data-testid={`data-stage-${id}`} data-kind={line.kind} className="space-y-1 text-[11px]">
      <p data-testid={`data-stage-line-${id}`} className={`inline-flex items-start gap-1 ${tone}`}>
        {line.kind === "ACTIVE" ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          : line.kind === "HELD" || line.kind === "REFUSED" ? <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          : IN_FLIGHT.has(line.kind) && !overdue ? <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" aria-hidden /> : null}
        {line.text}
      </p>
      {line.codes.length ? <CodeList codes={line.codes} testid={`data-stage-codes-${id}`} /> : null}
      {overdue ? (
        <p data-testid={`data-stage-overdue-${id}`} className="inline-flex items-start gap-1 text-amber-800">
          <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Taking longer than expected: unchanged since {formatUtcInstantExact(overdue.since)}. Use Refresh to check again.
        </p>
      ) : null}
    </div>
  )
}

export function DataActivationStatus({
  account,
  onRequest,
}: {
  account: ManagedAccount
  onRequest: () => Promise<DataActivationAnswer>
}) {
  const [open, setOpen] = useState(false)
  const activation = account.data_activation
  if (account.is_platform_account || !activation || collectionNotStarted(account)) return null
  const id = account.account_id
  const revoked = dataActivationRevoked(account)
  const eligible = (dataActivationLegacy(account) || revoked) && !dataActivationOtherRegistration(account)
  const offer = dataActivationUpgradeOffered(account)
  const blockedBy = Array.isArray(activation.blocked_by) ? activation.blocked_by : []
  const blocked = eligible && !offer && activation.can_request !== true && blockedBy.length > 0

  return (
    <div data-testid={`data-activation-${id}`} className="space-y-1 text-[11px]">
      <DataStageLine account={account} />
      {offer ? (
        <button className={`${button} border-teal-200 bg-white text-teal-700 hover:bg-teal-50`}
          onClick={() => setOpen(true)} aria-label={`Show data for ${id}`}>
          <Eye className="h-3 w-3" aria-hidden /> {revoked ? "Confirm again…" : "Show its data…"}
        </button>
      ) : null}
      {blocked ? (
        <div data-testid={`data-activation-blocked-${id}`} className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
          <p className="inline-flex items-center gap-1 font-semibold"><AlertTriangle className="h-3 w-3" aria-hidden />Its data cannot be shown yet:</p>
          <CodeList codes={blockedBy} testid={`data-activation-blocked-codes-${id}`} />
        </div>
      ) : null}
      {open ? <ShowDataDialog account={account} revoked={revoked} onClose={() => setOpen(false)} onRequest={onRequest} /> : null}
    </div>
  )
}

/**
 * A legacy or revoked account's request to show its data, after saying plainly what it does: why its data is not shown
 * (connected for collection only, or its permit revoked); Cyntro checks it and its latest acceptance run and, if they pass,
 * shows it (read only); the decision is recorded under the person's name; it usually takes minutes, on a processing pass.
 */
function ShowDataDialog({
  account,
  revoked,
  onClose,
  onRequest,
}: {
  account: ManagedAccount
  revoked: boolean
  onClose: () => void
  onRequest: () => Promise<DataActivationAnswer>
}) {
  const [sending, setSending] = useState(false)
  const [notRequestable, setNotRequestable] = useState<string[] | null>(null)
  const id = account.account_id
  const label = accountLabel(account)
  const title = label !== id ? `${label} (${id})` : id

  async function show() {
    setSending(true)
    try {
      const answer = await onRequest()
      if (answer.kind === "not_requestable") {
        setNotRequestable(answer.blockedBy)
        return
      }
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-6 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby={`show-data-${id}`} className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white text-sm text-slate-700 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Show data</p>
            <h2 id={`show-data-${id}`} className="mt-1 text-xl font-semibold text-slate-900">Show data from {title}?</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-6">
          <p data-testid="show-data-why">
            {revoked
              ? "Data access for this account was revoked, so its data is not shown. Showing it again needs your fresh confirmation."
              : "This account was connected for collection only: Cyntro collects it, but does not show its data."}
          </p>
          <ul data-testid="show-data-explanation" className="list-disc space-y-1.5 pl-5">
            <li>Cyntro checks this account&apos;s collected data and its latest acceptance run.</li>
            <li>If they pass, Cyntro shows its data: inventory, census and systems. If they do not, nothing is shown and this page names why.</li>
            <li>Read only: nothing in the AWS account changes.</li>
            <li>The decision is recorded under your name.</li>
            <li>It usually takes minutes, on Cyntro&apos;s next processing pass. It is not instant.</li>
          </ul>
          {notRequestable ? (
            <div role="alert" data-testid="show-data-not-requestable" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Its data cannot be shown now. Nothing was requested.</p>
              {notRequestable.length ? <CodeList codes={notRequestable} testid="show-data-not-requestable-codes" /> : <p>No reason was given.</p>}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button onClick={onClose} disabled={sending} className="text-sm font-semibold text-slate-500">Cancel</button>
          <button onClick={() => void show()} disabled={sending || notRequestable !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />} Show its data
          </button>
        </div>
      </div>
    </div>
  )
}
