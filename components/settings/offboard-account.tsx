"use client"

/**
 * Remove an ACTIVATED account (offboard; backend level 5, spec agent-coordinator/claude-settings-account-offboarding-spec-
 * 2026-10-06.txt). The dialog says exactly what removing does and does not do -- the connector's own words -- and asks for the
 * account id typed as the confirmation, which the backend checks again. The request names the registration and version shown;
 * the connector decides again and refuses by name if the account moved on meanwhile.
 */
import { useState } from "react"
import { Loader2, Trash2, X } from "lucide-react"
import type { ManagedAccount } from "@/lib/account-admin"

export function OffboardAccount({
  account,
  busy,
  onRemove,
}: {
  account: ManagedAccount
  busy: boolean
  onRemove: (typedAccountId: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [sending, setSending] = useState(false)
  const id = account.account_id
  const name = account.display_name && account.display_name !== id ? account.display_name : null
  const confirmed = typed.trim() === id

  function close() {
    setOpen(false)
    setTyped("")
  }

  async function remove() {
    if (!confirmed) return
    setSending(true)
    try {
      await onRemove(typed.trim())
      close()
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        disabled={busy}
        onClick={() => setOpen(true)}
        aria-label={`Remove account ${id}`}
      >
        <Trash2 className="h-3 w-3" aria-hidden /> Remove account…
      </button>
      {open ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby={`offboard-account-${id}`} className="w-full max-w-xl overflow-hidden rounded-2xl bg-white text-sm text-slate-700 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Remove account</p>
                <h2 id={`offboard-account-${id}`} className="mt-1 text-xl font-semibold text-slate-900">
                  Remove {name ? `${name} (${id})` : id} from Cyntro?
                </h2>
              </div>
              <button onClick={close} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 p-6" data-testid={`offboard-explanation-${id}`}>
              <p>This account is connected and Cyntro has collected from it. Removing it:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Stops reading it: reading is turned off, and nothing more is collected or queued for it.</li>
                <li>Takes its data out of Cyntro: it no longer appears in systems, maps or inventory.</li>
                <li>Keeps what was collected as a record. Nothing is deleted.</li>
                <li>
                  Changes nothing in the AWS account. The connection stack stays there and still trusts this installation: delete
                  it in that account to revoke Cyntro&apos;s access.
                </li>
                <li>Can be undone only by adding the account again, as a new registration that starts collecting afresh.</li>
              </ul>
              <label className="block pt-2 text-sm font-semibold text-slate-700">
                Type the account ID to confirm
                <input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  placeholder={id}
                  inputMode="numeric"
                  aria-label={`Type ${id} to confirm`}
                  className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-mono text-sm font-normal outline-none focus:border-red-500"
                />
              </label>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button onClick={close} disabled={sending} className="text-sm font-semibold text-slate-500">Cancel</button>
              <button
                onClick={() => void remove()}
                disabled={sending || !confirmed}
                className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Remove account
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
