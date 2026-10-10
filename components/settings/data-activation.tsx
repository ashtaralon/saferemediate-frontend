"use client"

/**
 * Settings > Accounts: a member account's DATA activation. The account's first inventory is collected and staged, but its
 * data is served only once it is activated; a person asks for that here ("Activate data"), and Cyntro decides it on its next
 * processing pass by checking the account's latest acceptance run. Every fact below is the listing's `data_activation`
 * (lib/account-admin.ts dataActivationProgress, dataActivationStateText, dataActivationCodeText): this file says it, offers
 * the request only when the backend says it can be asked for, and shows every refusal or blocker code verbatim.
 */
import { useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, Power, X, XCircle } from "lucide-react"
import {
  accountLabel,
  dataActivationCodeText,
  dataActivationProgress,
  dataActivationStateText,
  formatUtcInstantExact,
  type ManagedAccount,
} from "@/lib/account-admin"

/** What the page's POST came back with: accepted (queued), refused as not requestable (its blockers), or failed (the page
 *  says why in its own error banner). */
export type DataActivationAnswer = { kind: "queued" } | { kind: "not_requestable"; blockedBy: string[] } | { kind: "failed" }

const button =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"

function at(value?: string | null): string | null {
  return value ? formatUtcInstantExact(value) : null
}

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

export function DataActivationStatus({
  account,
  onRequest,
}: {
  account: ManagedAccount
  onRequest: () => Promise<DataActivationAnswer>
}) {
  const [open, setOpen] = useState(false)
  const activation = account.data_activation
  if (account.is_platform_account || !activation) return null
  const id = account.account_id
  const progress = dataActivationProgress(activation)
  const stateText = dataActivationStateText(activation)
  const blockedBy = Array.isArray(activation.blocked_by) ? activation.blocked_by : []
  const offer = activation.can_request === true && activation.active !== true
  const blocked = activation.can_request !== true && activation.active !== true && blockedBy.length > 0

  return (
    <div data-testid={`data-activation-${id}`} className="space-y-1 text-[11px]">
      {progress?.kind === "ACTIVE" ? (
        <p data-testid={`data-activation-progress-${id}`} data-kind={progress.kind}
          className="inline-flex items-center gap-1 font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" aria-hidden />{progress.text}
        </p>
      ) : progress?.kind === "REFUSED" ? (
        <div data-testid={`data-activation-progress-${id}`} data-kind={progress.kind}
          className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-2 text-red-900">
          <p className="inline-flex items-center gap-1 font-semibold"><XCircle className="h-3 w-3" aria-hidden />{progress.text}</p>
          {at(progress.request.completed_at) ? <p>Refused {at(progress.request.completed_at)}.</p> : null}
          {progress.refusals.length ? (
            <CodeList codes={progress.refusals} testid={`data-activation-refusals-${id}`} />
          ) : (
            <p>No refusal code was recorded.</p>
          )}
        </div>
      ) : progress ? (
        <div data-testid={`data-activation-progress-${id}`} data-kind={progress.kind} className="space-y-0.5 text-slate-700">
          <p className="inline-flex items-start gap-1">
            {progress.kind === "QUEUED" || progress.kind === "RUNNING" || progress.kind === "APPROVED"
              ? <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" aria-hidden /> : null}
            {progress.text}
          </p>
          {progress.kind === "QUEUED" && at(progress.request.requested_at) ? (
            <p className="text-slate-500">Requested {at(progress.request.requested_at)}.</p>
          ) : null}
          {progress.kind === "APPROVED" && at(progress.request.completed_at) ? (
            <p className="text-slate-500">Approved {at(progress.request.completed_at)}.</p>
          ) : null}
        </div>
      ) : null}
      {stateText ? <p data-testid={`data-state-${id}`} className="text-slate-500">{stateText}</p> : null}
      {offer ? (
        <button className={`${button} border-teal-200 bg-white text-teal-700 hover:bg-teal-50`}
          onClick={() => setOpen(true)} aria-label={`Activate data for ${id}`}>
          <Power className="h-3 w-3" aria-hidden /> Activate data…
        </button>
      ) : null}
      {blocked ? (
        <div data-testid={`data-activation-blocked-${id}`} className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
          <p className="inline-flex items-center gap-1 font-semibold"><AlertTriangle className="h-3 w-3" aria-hidden />Data activation cannot be requested yet:</p>
          <CodeList codes={blockedBy} testid={`data-activation-blocked-codes-${id}`} />
        </div>
      ) : null}
      {open ? <ActivateDataDialog account={account} onClose={() => setOpen(false)} onRequest={onRequest} /> : null}
    </div>
  )
}

/**
 * The person's explicit request, after saying plainly what it does: Cyntro checks the latest acceptance run; if it passes,
 * the data is turned on (read only); the decision is recorded under their name; it happens on the next processing pass.
 */
function ActivateDataDialog({
  account,
  onClose,
  onRequest,
}: {
  account: ManagedAccount
  onClose: () => void
  onRequest: () => Promise<DataActivationAnswer>
}) {
  const [sending, setSending] = useState(false)
  const [notRequestable, setNotRequestable] = useState<string[] | null>(null)
  const id = account.account_id
  const label = accountLabel(account)
  const title = label !== id ? `${label} (${id})` : id

  async function activate() {
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
      <div role="dialog" aria-modal="true" aria-labelledby={`activate-data-${id}`} className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white text-sm text-slate-700 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Activate data</p>
            <h2 id={`activate-data-${id}`} className="mt-1 text-xl font-semibold text-slate-900">Activate data for {title}?</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-6">
          <ul data-testid="activate-data-explanation" className="list-disc space-y-1.5 pl-5">
            <li>Cyntro checks this account&apos;s latest acceptance run.</li>
            <li>If it passes, Cyntro turns on this account&apos;s data, so its inventory and systems appear. If it does not, nothing is turned on and this page names why.</li>
            <li>Read only: nothing in the account changes.</li>
            <li>The decision is recorded under your name.</li>
            <li>Activation happens on Cyntro&apos;s next processing pass, which takes minutes. It is not instant.</li>
          </ul>
          {notRequestable ? (
            <div role="alert" data-testid="activate-data-not-requestable" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Activation cannot be requested now. Nothing was requested.</p>
              {notRequestable.length ? <CodeList codes={notRequestable} testid="activate-data-not-requestable-codes" /> : <p>No reason was given.</p>}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button onClick={onClose} disabled={sending} className="text-sm font-semibold text-slate-500">Cancel</button>
          <button onClick={() => void activate()} disabled={sending || notRequestable !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Power className="h-4 w-4" aria-hidden />} Activate data
          </button>
        </div>
      </div>
    </div>
  )
}
